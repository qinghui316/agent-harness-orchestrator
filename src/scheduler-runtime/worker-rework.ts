import { shortHash } from "../fs/path.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { startCodeRun, type CodeRunLiveCallbacks, type CodeRunResult } from "../code/manager.js";
import { readRun } from "../run/repository.js";
import { markTaskRunRunning, startTaskRun } from "../task-run/manager.js";
import { readTaskRun } from "../task-run/repository.js";
import type { ManagedProject, RunMetadata, TaskRun, WorkerLease, WorktreeMetadata } from "../types/index.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRuntimeWorkerReworkStartForPlan,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  readSchedulerRuntimeWorkerReworkPlan,
  schedulerWorkerReworkStartArtifactRefs,
  writeSchedulerRuntimeWorkerReworkStart,
} from "./repository.js";
import type { SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerReworkStart } from "./types.js";

export interface SchedulerFirstWorkerReworkStartInput {
  changeId: string;
  schedulerRunId: string;
  schedulerWorkerReworkPlanId: string;
  prompt?: string;
  live?: CodeRunLiveCallbacks;
}

export interface SchedulerFirstWorkerReworkStartResult {
  reworkStart: SchedulerRuntimeWorkerReworkStart;
  reworkTaskRun: TaskRun;
  reworkLease: WorkerLease;
  code: CodeRunResult;
  originalTaskRun: TaskRun;
  originalCodeRun: RunMetadata;
  worktree: WorktreeMetadata;
  executionStarted: true;
}

export async function startFirstSchedulerWorkerRework(project: ManagedProject, input: SchedulerFirstWorkerReworkStartInput): Promise<SchedulerFirstWorkerReworkStartResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Scheduler first worker rework start");
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler first worker rework start cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.worker.rework-start-first SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.schedulerRunId !== run.id || runtimeState.changeId !== input.changeId) {
    throw new Error("planning.scheduler.worker.rework-start-first SchedulerRuntimeState scope mismatch.");
  }
  const reworkPlan = await readSchedulerRuntimeWorkerReworkPlan(memory, changePath, run.id, input.schedulerWorkerReworkPlanId);
  assertReworkPlanMatchesRuntime(reworkPlan, runtimeState);
  if (reworkPlan.futureCodeGateMode !== "scheduler-claim-rework") {
    throw new Error("planning.scheduler.worker.rework-start-first requires scheduler-claim-rework future gate.");
  }
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, reworkPlan.schedulerClaimReservationId);
  if (reservation.id !== runtimeState.lastClaimReservationId || reservation.schedulerReconcileSnapshotId !== runtimeState.lastClaimReservationSnapshotId) {
    throw new Error("planning.scheduler.worker.rework-start-first requires the latest SchedulerRuntimeClaimReservation.");
  }
  const existing = await findSchedulerRuntimeWorkerReworkStartForPlan(memory, changePath, run.id, reworkPlan.id);
  if (existing) throw new Error("planning.scheduler.worker.rework-start-first rework plan already started.");
  const originalTaskRun = await readTaskRun(memory, input.changeId, reworkPlan.taskRunId);
  assertOriginalTaskRunMatchesReworkPlan(originalTaskRun, reworkPlan);
  const originalCodeRun = await readRun(memory, reworkPlan.targetCodeRunId);
  assertOriginalCodeRunMatchesReworkPlan(originalCodeRun, reworkPlan);
  const worktree = await readWorktreeMetadata(memory, reworkPlan.targetWorktreeId);
  assertWorktreeMatchesReworkPlan(worktree, reworkPlan);

  const started = await startTaskRun(project, { changeId: input.changeId, taskId: reworkPlan.taskId, roleId: "rework-coder" });
  const reworkStartId = buildReworkStartId(run.id, reworkPlan.id, started.taskRun.id);
  const refs = schedulerWorkerReworkStartArtifactRefs(memory, changePath, run.id, reworkStartId);
  try {
    const code = await startCodeRun(project, {
      changeId: input.changeId,
      taskIds: [reworkPlan.taskId],
      taskRunId: started.taskRun.id,
      roleId: "rework-coder",
      existingWorktreeId: reworkPlan.targetWorktreeId,
      prompt: input.prompt ?? buildDefaultReworkPrompt(reworkPlan),
      live: input.live,
      executionGate: {
        mode: "scheduler-claim-rework",
        schedulerRunId: run.id,
        schedulerClaimReservationId: reworkPlan.schedulerClaimReservationId,
        schedulerWorkerReworkPlanId: reworkPlan.id,
        schedulerWorkerValidationId: reworkPlan.schedulerWorkerValidationId,
        schedulerWorkerAuditId: reworkPlan.schedulerWorkerAuditId,
        reservationIntentId: reworkPlan.reservationIntentId,
        claimIntentId: reworkPlan.claimIntentId,
        nodeId: reworkPlan.nodeId,
        unitId: reworkPlan.unitId,
      },
    });
    const reworkTaskRun = await markTaskRunRunning(memory, started.taskRun.id, code.run);
    const reworkStart: SchedulerRuntimeWorkerReworkStart = {
      version: "1.0",
      id: reworkStartId,
      changeId: run.changeId,
      schedulerRunId: run.id,
      schedulerMode: run.schedulerMode,
      status: "started",
      schedulerRuntimeStateId: runtimeState.id,
      schedulerReconcileSnapshotId: reworkPlan.schedulerReconcileSnapshotId,
      schedulerClaimReservationId: reworkPlan.schedulerClaimReservationId,
      schedulerWorkerStartId: reworkPlan.schedulerWorkerStartId,
      schedulerWorkerResultId: reworkPlan.schedulerWorkerResultId,
      schedulerWorkerValidationId: reworkPlan.schedulerWorkerValidationId,
      ...(reworkPlan.schedulerWorkerAuditId ? { schedulerWorkerAuditId: reworkPlan.schedulerWorkerAuditId } : {}),
      schedulerWorkerReworkPlanId: reworkPlan.id,
      schedulerContractId: reworkPlan.schedulerContractId,
      schedulerDispatchDryRunId: reworkPlan.schedulerDispatchDryRunId,
      schedulerWorkerPlanId: reworkPlan.schedulerWorkerPlanId,
      schedulerClaimReconcilePlanId: reworkPlan.schedulerClaimReconcilePlanId,
      schedulerLaunchPreflightId: reworkPlan.schedulerLaunchPreflightId,
      reservationIntentId: reworkPlan.reservationIntentId,
      claimIntentId: reworkPlan.claimIntentId,
      plannedWorkerKey: reworkPlan.plannedWorkerKey,
      nodeId: reworkPlan.nodeId,
      unitId: reworkPlan.unitId,
      waveIndex: reworkPlan.waveIndex,
      stageId: reworkPlan.stageId,
      stage: "bounded-rework",
      taskId: reworkPlan.taskId,
      originalTaskRunId: reworkPlan.taskRunId,
      originalWorkerLeaseId: reworkPlan.workerLeaseId,
      reworkTaskRunId: reworkTaskRun.id,
      reworkWorkerLeaseId: started.lease.id,
      taskRunRoleId: reworkTaskRun.roleId,
      agentRoleId: "rework-coder",
      worktreeId: reworkPlan.targetWorktreeId,
      originalCodeRunId: reworkPlan.targetCodeRunId,
      reworkRunId: code.run.id,
      sourceArtifactHashes: reworkPlan.sourceArtifactHashes,
      artifactRefs: [refs.artifact, refs.markdownArtifact, reworkPlan.artifact, code.run.artifacts.directory],
      artifact: refs.artifact,
      markdownArtifact: refs.markdownArtifact,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeSchedulerRuntimeWorkerReworkStart(memory, changePath, reworkStart);
    await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.worker-rework-started", {
      status: runtimeState.status,
      summary: `Started one scheduler rework-coder for ${reworkPlan.id}.`,
      artifactRefs: reworkStart.artifactRefs,
      payload: {
        schedulerWorkerReworkPlanId: reworkPlan.id,
        schedulerWorkerReworkStartId: reworkStart.id,
        schedulerClaimReservationId: reworkPlan.schedulerClaimReservationId,
        reservationIntentId: reworkPlan.reservationIntentId,
        claimIntentId: reworkPlan.claimIntentId,
        taskRunId: reworkPlan.taskRunId,
        reworkTaskRunId: reworkTaskRun.id,
        workerLeaseId: reworkPlan.workerLeaseId,
        reworkWorkerLeaseId: started.lease.id,
        worktreeId: reworkPlan.targetWorktreeId,
        runId: code.run.id,
      },
    });
    return { reworkStart, reworkTaskRun, reworkLease: started.lease, code, originalTaskRun, originalCodeRun, worktree, executionStarted: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failed: SchedulerRuntimeWorkerReworkStart = {
      version: "1.0",
      id: reworkStartId,
      changeId: run.changeId,
      schedulerRunId: run.id,
      schedulerMode: run.schedulerMode,
      status: "failed",
      schedulerRuntimeStateId: runtimeState.id,
      schedulerReconcileSnapshotId: reworkPlan.schedulerReconcileSnapshotId,
      schedulerClaimReservationId: reworkPlan.schedulerClaimReservationId,
      schedulerWorkerStartId: reworkPlan.schedulerWorkerStartId,
      schedulerWorkerResultId: reworkPlan.schedulerWorkerResultId,
      schedulerWorkerValidationId: reworkPlan.schedulerWorkerValidationId,
      ...(reworkPlan.schedulerWorkerAuditId ? { schedulerWorkerAuditId: reworkPlan.schedulerWorkerAuditId } : {}),
      schedulerWorkerReworkPlanId: reworkPlan.id,
      schedulerContractId: reworkPlan.schedulerContractId,
      schedulerDispatchDryRunId: reworkPlan.schedulerDispatchDryRunId,
      schedulerWorkerPlanId: reworkPlan.schedulerWorkerPlanId,
      schedulerClaimReconcilePlanId: reworkPlan.schedulerClaimReconcilePlanId,
      schedulerLaunchPreflightId: reworkPlan.schedulerLaunchPreflightId,
      reservationIntentId: reworkPlan.reservationIntentId,
      claimIntentId: reworkPlan.claimIntentId,
      plannedWorkerKey: reworkPlan.plannedWorkerKey,
      nodeId: reworkPlan.nodeId,
      unitId: reworkPlan.unitId,
      waveIndex: reworkPlan.waveIndex,
      stageId: reworkPlan.stageId,
      stage: "bounded-rework",
      taskId: reworkPlan.taskId,
      originalTaskRunId: reworkPlan.taskRunId,
      originalWorkerLeaseId: reworkPlan.workerLeaseId,
      reworkTaskRunId: started.taskRun.id,
      reworkWorkerLeaseId: started.lease.id,
      taskRunRoleId: started.taskRun.roleId,
      agentRoleId: "rework-coder",
      worktreeId: reworkPlan.targetWorktreeId,
      originalCodeRunId: reworkPlan.targetCodeRunId,
      failureReason: message,
      sourceArtifactHashes: reworkPlan.sourceArtifactHashes,
      artifactRefs: [refs.artifact, refs.markdownArtifact, reworkPlan.artifact],
      artifact: refs.artifact,
      markdownArtifact: refs.markdownArtifact,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeSchedulerRuntimeWorkerReworkStart(memory, changePath, failed);
    await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.worker-rework-start-failed", {
      status: runtimeState.status,
      summary: `Failed to start scheduler rework-coder for ${reworkPlan.id}: ${message}`,
      artifactRefs: failed.artifactRefs,
      payload: {
        schedulerWorkerReworkPlanId: reworkPlan.id,
        schedulerWorkerReworkStartId: failed.id,
        schedulerClaimReservationId: reworkPlan.schedulerClaimReservationId,
        reservationIntentId: reworkPlan.reservationIntentId,
        claimIntentId: reworkPlan.claimIntentId,
        reworkTaskRunId: started.taskRun.id,
        reworkWorkerLeaseId: started.lease.id,
        worktreeId: reworkPlan.targetWorktreeId,
      },
    });
    throw error;
  }
}

function assertReworkPlanMatchesRuntime(plan: SchedulerRuntimeWorkerReworkPlan, runtimeState: { id: string; changeId: string; schedulerRunId: string; lastClaimReservationId?: string; sourceArtifactHashes: Record<string, string> }): void {
  if (plan.changeId !== runtimeState.changeId || plan.schedulerRunId !== runtimeState.schedulerRunId || plan.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.worker.rework-start-first WorkerReworkPlan scope mismatch.");
  }
  if (plan.schedulerClaimReservationId !== runtimeState.lastClaimReservationId) {
    throw new Error("planning.scheduler.worker.rework-start-first WorkerReworkPlan is not scoped to latest reservation.");
  }
  assertHashesMatch(plan.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "WorkerReworkPlan");
}

function assertOriginalTaskRunMatchesReworkPlan(taskRun: TaskRun, plan: SchedulerRuntimeWorkerReworkPlan): void {
  if (taskRun.changeId !== plan.changeId || taskRun.id !== plan.taskRunId || taskRun.taskId.toUpperCase() !== plan.taskId.toUpperCase() || taskRun.roleId !== "coder") {
    throw new Error("planning.scheduler.worker.rework-start-first original TaskRun scope mismatch.");
  }
  if (taskRun.status !== "blocked") {
    throw new Error("planning.scheduler.worker.rework-start-first requires blocked original TaskRun.");
  }
}

function assertOriginalCodeRunMatchesReworkPlan(run: RunMetadata, plan: SchedulerRuntimeWorkerReworkPlan): void {
  if (run.changeId !== plan.changeId || run.id !== plan.targetCodeRunId || run.taskRunId !== plan.taskRunId || run.worktree?.worktreeId !== plan.targetWorktreeId) {
    throw new Error("planning.scheduler.worker.rework-start-first original code run scope mismatch.");
  }
  const gate = run.executionGate;
  if (!gate?.allowed || gate.mode !== "scheduler-claim-reservation") {
    throw new Error("planning.scheduler.worker.rework-start-first original code run did not use scheduler-claim-reservation gate.");
  }
}

function assertWorktreeMatchesReworkPlan(worktree: WorktreeMetadata, plan: SchedulerRuntimeWorkerReworkPlan): void {
  if (worktree.changeId !== plan.changeId || worktree.worktreeId !== plan.targetWorktreeId) {
    throw new Error("planning.scheduler.worker.rework-start-first worktree scope mismatch.");
  }
  if (worktree.status !== "active") {
    throw new Error(`planning.scheduler.worker.rework-start-first target worktree is not active: ${worktree.status}.`);
  }
  if (worktree.runId && worktree.runId !== plan.targetCodeRunId) {
    throw new Error("planning.scheduler.worker.rework-start-first worktree run scope mismatch.");
  }
}

function buildDefaultReworkPrompt(plan: SchedulerRuntimeWorkerReworkPlan): string {
  return [
    `Rework the scheduler worker result for task ${plan.taskId}.`,
    `Blocking source: ${plan.blockingSource}.`,
    `Reason: ${plan.reworkReason}`,
    "Use the existing worktree. Do not start validation, audit, apply, merge, another worker, or a scheduler loop.",
  ].join("\n");
}

function buildReworkStartId(schedulerRunId: string, reworkPlanId: string, taskRunId: string): string {
  const now = new Date().toISOString();
  return `scheduler-worker-rework-start-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${schedulerRunId}:${reworkPlanId}:${taskRunId}:${now}`).slice(0, 8)}`;
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.worker.rework-start-first ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.worker.rework-start-first ${label} source artifact hash mismatch.`);
  }
}
