import { shortHash } from "../fs/path.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { startCodeRun, type CodeRunLiveCallbacks, type CodeRunResult } from "../code/manager.js";
import { markTaskRunRunning, startTaskRun } from "../task-run/manager.js";
import type { ManagedProject, TaskRun, WorkerLease } from "../types/index.js";
import { readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRuntimeWorkerStartForReservationIntent,
  readSchedulerReconcileSnapshot,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  schedulerWorkerStartArtifactRefs,
  writeSchedulerRuntimeWorkerStart,
} from "./repository.js";
import type { SchedulerRuntimeClaimReservationIntent, SchedulerRuntimeWorkerStart } from "./types.js";

export interface SchedulerFirstWorkerStartInput {
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  prompt?: string;
  live?: CodeRunLiveCallbacks;
}

export interface SchedulerFirstWorkerStartResult {
  workerStart: SchedulerRuntimeWorkerStart;
  taskRun: TaskRun;
  lease: WorkerLease;
  code: CodeRunResult;
  executionStarted: true;
}

export async function startFirstSchedulerCoderWorker(project: ManagedProject, input: SchedulerFirstWorkerStartInput): Promise<SchedulerFirstWorkerStartResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Scheduler first worker start");
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler first worker start cannot resolve active Change path for ${input.changeId}.`);
  const { run, workerPlan, contract } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.worker.start-first SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.schedulerRunId !== run.id || runtimeState.changeId !== input.changeId) {
    throw new Error("planning.scheduler.worker.start-first SchedulerRuntimeState scope mismatch.");
  }
  if (!runtimeState.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
    throw new Error("planning.scheduler.worker.start-first requires latest reconcile snapshot and claim reservation.");
  }
  const reconcileSnapshot = await readSchedulerReconcileSnapshot(memory, changePath, run.id, runtimeState.lastReconcileSnapshotId);
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, input.schedulerClaimReservationId);
  if (reservation.id !== runtimeState.lastClaimReservationId || reservation.schedulerReconcileSnapshotId !== reconcileSnapshot.id || runtimeState.lastClaimReservationSnapshotId !== reconcileSnapshot.id) {
    throw new Error("planning.scheduler.worker.start-first requires the latest SchedulerRuntimeClaimReservation.");
  }
  if (reservation.status !== "reserved" || reservation.reservedCount < 1) {
    throw new Error("planning.scheduler.worker.start-first requires a reserved claim reservation.");
  }
  const intent = selectReservationIntent(reservation.reservationIntents, input);
  const existing = await findSchedulerRuntimeWorkerStartForReservationIntent(memory, changePath, run.id, intent.reservationIntentId);
  if (existing) throw new Error("planning.scheduler.worker.start-first reservation intent already started.");
  const stage = workerPlan.plannedStages.find((item) =>
    item.nodeId === intent.nodeId
    && item.unitId === intent.unitId
    && item.stage === "coder"
    && item.status === "planned"
  );
  if (!stage) throw new Error("planning.scheduler.worker.start-first could not resolve a planned coder stage.");
  const node = contract.nodes.find((item) => item.id === intent.nodeId && item.unitId === intent.unitId);
  if (!node) throw new Error("planning.scheduler.worker.start-first could not resolve SchedulerContract node.");
  if (node.taskIds.length !== 1) {
    throw new Error("planning.scheduler.worker.start-first currently requires a scheduler node with exactly one task id.");
  }
  const taskId = node.taskIds[0];
  const started = await startTaskRun(project, { changeId: input.changeId, taskId, roleId: "coder" });
  const workerStartId = buildWorkerStartId(run.id, intent.reservationIntentId, started.taskRun.id);
  const refs = schedulerWorkerStartArtifactRefs(memory, changePath, run.id, workerStartId);
  try {
    const code = await startCodeRun(project, {
      changeId: input.changeId,
      taskIds: [taskId],
      taskRunId: started.taskRun.id,
      roleId: "coder-agent",
      prompt: input.prompt,
      live: input.live,
      executionGate: {
        mode: "scheduler-claim-reservation",
        schedulerRunId: run.id,
        schedulerClaimReservationId: reservation.id,
        reservationIntentId: intent.reservationIntentId,
        claimIntentId: intent.claimIntentId,
        nodeId: intent.nodeId,
        unitId: intent.unitId,
      },
    });
    const taskRun = await markTaskRunRunning(memory, started.taskRun.id, code.run);
    const workerStart: SchedulerRuntimeWorkerStart = {
      version: "1.0",
      id: workerStartId,
      changeId: run.changeId,
      schedulerRunId: run.id,
      schedulerMode: run.schedulerMode,
      status: "started",
      schedulerRuntimeStateId: runtimeState.id,
      schedulerReconcileSnapshotId: reconcileSnapshot.id,
      schedulerClaimReservationId: reservation.id,
      schedulerContractId: run.schedulerContractId,
      schedulerDispatchDryRunId: run.schedulerDispatchDryRunId,
      schedulerWorkerPlanId: run.schedulerWorkerPlanId,
      schedulerClaimReconcilePlanId: run.schedulerClaimReconcilePlanId,
      schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
      reservationIntentId: intent.reservationIntentId,
      claimIntentId: intent.claimIntentId,
      plannedWorkerKey: intent.plannedWorkerKey,
      nodeId: intent.nodeId,
      unitId: intent.unitId,
      waveIndex: intent.waveIndex,
      stageId: stage.id,
      stage: "coder",
      taskId,
      taskRunId: taskRun.id,
      workerLeaseId: started.lease.id,
      taskRunRoleId: taskRun.roleId,
      agentRoleId: "coder-agent",
      worktreeId: code.run.worktree?.worktreeId,
      runId: code.run.id,
      sourceArtifactHashes: run.sourceArtifactHashes,
      artifactRefs: [refs.artifact, refs.markdownArtifact, code.run.artifacts.directory],
      artifact: refs.artifact,
      markdownArtifact: refs.markdownArtifact,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeSchedulerRuntimeWorkerStart(memory, changePath, workerStart);
    await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.worker-started", {
      status: runtimeState.status,
      summary: `Started one scheduler coder worker for ${intent.reservationIntentId}.`,
      artifactRefs: workerStart.artifactRefs,
      payload: {
        schedulerClaimReservationId: reservation.id,
        reservationIntentId: intent.reservationIntentId,
        claimIntentId: intent.claimIntentId,
        nodeId: intent.nodeId,
        unitId: intent.unitId,
        stageId: stage.id,
        taskRunId: taskRun.id,
        workerLeaseId: started.lease.id,
        worktreeId: code.run.worktree?.worktreeId,
        runId: code.run.id,
      },
    });
    return { workerStart, taskRun, lease: started.lease, code, executionStarted: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failed: SchedulerRuntimeWorkerStart = {
      version: "1.0",
      id: workerStartId,
      changeId: run.changeId,
      schedulerRunId: run.id,
      schedulerMode: run.schedulerMode,
      status: "failed",
      schedulerRuntimeStateId: runtimeState.id,
      schedulerReconcileSnapshotId: reconcileSnapshot.id,
      schedulerClaimReservationId: reservation.id,
      schedulerContractId: run.schedulerContractId,
      schedulerDispatchDryRunId: run.schedulerDispatchDryRunId,
      schedulerWorkerPlanId: run.schedulerWorkerPlanId,
      schedulerClaimReconcilePlanId: run.schedulerClaimReconcilePlanId,
      schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
      reservationIntentId: intent.reservationIntentId,
      claimIntentId: intent.claimIntentId,
      plannedWorkerKey: intent.plannedWorkerKey,
      nodeId: intent.nodeId,
      unitId: intent.unitId,
      waveIndex: intent.waveIndex,
      stageId: stage.id,
      stage: "coder",
      taskId,
      taskRunId: started.taskRun.id,
      workerLeaseId: started.lease.id,
      taskRunRoleId: started.taskRun.roleId,
      agentRoleId: "coder-agent",
      failureReason: message,
      sourceArtifactHashes: run.sourceArtifactHashes,
      artifactRefs: [refs.artifact, refs.markdownArtifact],
      artifact: refs.artifact,
      markdownArtifact: refs.markdownArtifact,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeSchedulerRuntimeWorkerStart(memory, changePath, failed);
    await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.worker-start-failed", {
      status: runtimeState.status,
      summary: `Failed to start scheduler coder worker for ${intent.reservationIntentId}: ${message}`,
      artifactRefs: failed.artifactRefs,
      payload: { schedulerClaimReservationId: reservation.id, reservationIntentId: intent.reservationIntentId, claimIntentId: intent.claimIntentId, nodeId: intent.nodeId, unitId: intent.unitId, taskRunId: started.taskRun.id, workerLeaseId: started.lease.id },
    });
    throw error;
  }
}

function selectReservationIntent(intents: SchedulerRuntimeClaimReservationIntent[], input: SchedulerFirstWorkerStartInput): SchedulerRuntimeClaimReservationIntent {
  const candidates = intents
    .filter((intent) => intent.status === "reserved")
    .sort((a, b) => a.waveIndex - b.waveIndex || intents.indexOf(a) - intents.indexOf(b));
  const selected = input.reservationIntentId
    ? candidates.find((intent) => intent.reservationIntentId === input.reservationIntentId)
    : candidates[0];
  if (!selected) throw new Error("planning.scheduler.worker.start-first could not find a runnable reservation intent.");
  if (input.claimIntentId && selected.claimIntentId !== input.claimIntentId) {
    throw new Error("planning.scheduler.worker.start-first claimIntentId scope mismatch.");
  }
  return selected;
}

function buildWorkerStartId(schedulerRunId: string, reservationIntentId: string, taskRunId: string): string {
  const now = new Date().toISOString();
  return `scheduler-worker-start-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${schedulerRunId}:${reservationIntentId}:${taskRunId}:${now}`).slice(0, 8)}`;
}
