import { shortHash } from "../fs/path.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { readRun } from "../run/repository.js";
import { releaseTaskRunLease } from "../task-run/lease-service.js";
import { listWorkerLeases, readTaskRun, writeTaskRun } from "../task-run/repository.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, TaskRun, WorkerLease, WorktreeMetadata } from "../types/index.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { schedulerWorkerResultEventType } from "./event-policy.js";
import { assertLatestSchedulerRuntimeClaimReservation, readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRuntimeWorkerResultForStart,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  readSchedulerRuntimeWorkerStart,
  schedulerWorkerResultArtifactRefs,
  writeSchedulerRuntimeWorkerResult,
} from "./repository.js";
import type { SchedulerRuntimeWorkerResult, SchedulerRuntimeWorkerStart } from "./types.js";

export interface SchedulerWorkerResultReconcileInput {
  changeId: string;
  schedulerRunId: string;
  schedulerWorkerStartId: string;
}

export type SchedulerWorkerResultReconcileResult =
  | {
    status: "running";
    workerStart: SchedulerRuntimeWorkerStart;
    taskRun: TaskRun;
    lease: WorkerLease;
    codeRun: RunMetadata | null;
    result?: undefined;
    executionStarted: false;
  }
  | {
    status: "terminal";
    workerStart: SchedulerRuntimeWorkerStart;
    taskRun: TaskRun;
    lease: WorkerLease;
    codeRun: RunMetadata | null;
    result: SchedulerRuntimeWorkerResult;
    executionStarted: false;
  };

export async function reconcileSchedulerFirstWorkerResult(project: ManagedProject, input: SchedulerWorkerResultReconcileInput): Promise<SchedulerWorkerResultReconcileResult> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler worker result reconcile cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.worker.reconcile-result SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.changeId !== run.changeId || runtimeState.schedulerRunId !== run.id) {
    throw new Error("planning.scheduler.worker.reconcile-result SchedulerRuntimeState scope mismatch.");
  }
  const workerStart = await readSchedulerRuntimeWorkerStart(memory, changePath, run.id, input.schedulerWorkerStartId);
  assertWorkerStartLineage(workerStart, runtimeState);
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, workerStart.schedulerClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, "planning.scheduler.worker.reconcile-result");
  const existing = await findSchedulerRuntimeWorkerResultForStart(memory, changePath, run.id, workerStart.id);
  if (existing) {
    const taskRun = await readTaskRun(memory, input.changeId, existing.taskRunId);
    const lease = await readWorkerLeaseForTaskRun(memory, taskRun);
    const codeRun = existing.runId ? await readRun(memory, existing.runId) : null;
    return { status: "terminal", workerStart, taskRun, lease, codeRun, result: existing, executionStarted: false };
  }
  const taskRun = await readTaskRun(memory, input.changeId, workerStart.taskRunId);
  assertTaskRunMatchesWorkerStart(taskRun, workerStart);
  const lease = await readWorkerLeaseForTaskRun(memory, taskRun);
  assertLeaseMatchesWorkerStart(lease, workerStart);
  const codeRun = workerStart.runId ? await readRun(memory, workerStart.runId) : null;
  if (codeRun) assertCodeRunMatchesWorkerStart(codeRun, workerStart);
  if (workerStart.worktreeId) {
    const worktree = await readWorktreeMetadata(memory, workerStart.worktreeId);
    assertWorktreeMatchesWorkerStart(worktree, workerStart);
  }
  if (workerStart.status === "started" && (!codeRun || codeRun.status === "created" || codeRun.status === "running")) {
    return { status: "running", workerStart, taskRun, lease, codeRun, executionStarted: false };
  }
  const terminalStatus = workerStart.status === "failed" || codeRun?.status === "failed" ? "failed" : "evidence-ready";
  const now = new Date().toISOString();
  const nextTaskRun: TaskRun = {
    ...taskRun,
    status: terminalStatus === "evidence-ready" ? "evidence-ready" : "failed",
    runId: workerStart.runId ?? taskRun.runId,
    worktreeId: workerStart.worktreeId ?? taskRun.worktreeId,
    failureReason: terminalStatus === "failed" ? workerStart.failureReason ?? "Scheduler coder worker failed." : undefined,
    blockedReason: undefined,
    finishedAt: now,
    updatedAt: now,
  };
  const writtenTaskRun = await writeTaskRun(memory, nextTaskRun);
  await releaseTaskRunLease(memory, writtenTaskRun, now);
  const releasedLease = await readWorkerLeaseForTaskRun(memory, writtenTaskRun);
  const resultId = buildWorkerResultId(workerStart.id);
  const refs = schedulerWorkerResultArtifactRefs(memory, changePath, run.id, resultId);
  const result: SchedulerRuntimeWorkerResult = {
    version: "1.0",
    id: resultId,
    changeId: workerStart.changeId,
    schedulerRunId: workerStart.schedulerRunId,
    schedulerMode: workerStart.schedulerMode,
    status: terminalStatus,
    schedulerRuntimeStateId: workerStart.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: workerStart.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: workerStart.schedulerClaimReservationId,
    schedulerWorkerStartId: workerStart.id,
    schedulerContractId: workerStart.schedulerContractId,
    schedulerDispatchDryRunId: workerStart.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: workerStart.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: workerStart.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: workerStart.schedulerLaunchPreflightId,
    reservationIntentId: workerStart.reservationIntentId,
    claimIntentId: workerStart.claimIntentId,
    plannedWorkerKey: workerStart.plannedWorkerKey,
    nodeId: workerStart.nodeId,
    unitId: workerStart.unitId,
    waveIndex: workerStart.waveIndex,
    stageId: workerStart.stageId,
    stage: "coder",
    taskId: workerStart.taskId,
    taskRunId: writtenTaskRun.id,
    workerLeaseId: releasedLease.id,
    taskRunStatus: writtenTaskRun.status,
    workerLeaseStatus: releasedLease.status,
    agentRoleId: workerStart.agentRoleId,
    worktreeId: workerStart.worktreeId,
    runId: workerStart.runId,
    runStatus: codeRun?.status,
    failureReason: terminalStatus === "failed" ? workerStart.failureReason ?? (codeRun ? `Code run ${codeRun.status}.` : "Scheduler worker start failed.") : undefined,
    sourceArtifactHashes: workerStart.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, workerStart.artifact, ...(codeRun ? [codeRun.artifacts.directory] : [])],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeWorkerResult(memory, changePath, result);
  await appendSchedulerRuntimeEvent(memory, changePath, run, schedulerWorkerResultEventType(terminalStatus), {
    status: runtimeState.status,
    summary: terminalStatus === "evidence-ready"
      ? `Scheduler coder worker result is evidence-ready for ${workerStart.reservationIntentId}.`
      : `Scheduler coder worker result failed for ${workerStart.reservationIntentId}.`,
    artifactRefs: result.artifactRefs,
    payload: {
      schedulerWorkerStartId: workerStart.id,
      schedulerWorkerResultId: result.id,
      schedulerClaimReservationId: workerStart.schedulerClaimReservationId,
      reservationIntentId: workerStart.reservationIntentId,
      claimIntentId: workerStart.claimIntentId,
      taskRunId: writtenTaskRun.id,
      workerLeaseId: releasedLease.id,
      worktreeId: workerStart.worktreeId,
      runId: workerStart.runId,
      resultStatus: result.status,
    },
  });
  return { status: "terminal", workerStart, taskRun: writtenTaskRun, lease: releasedLease, codeRun, result, executionStarted: false };
}

function assertWorkerStartLineage(workerStart: SchedulerRuntimeWorkerStart, runtimeState: { changeId: string; schedulerRunId: string; id: string; sourceArtifactHashes: Record<string, string> }): void {
  if (workerStart.changeId !== runtimeState.changeId || workerStart.schedulerRunId !== runtimeState.schedulerRunId || workerStart.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.worker.reconcile-result WorkerStart scope mismatch.");
  }
  assertHashesMatch(workerStart.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "WorkerStart");
}

function assertTaskRunMatchesWorkerStart(taskRun: TaskRun, workerStart: SchedulerRuntimeWorkerStart): void {
  if (taskRun.changeId !== workerStart.changeId || taskRun.id !== workerStart.taskRunId || taskRun.taskId.toUpperCase() !== workerStart.taskId.toUpperCase() || taskRun.roleId !== "coder") {
    throw new Error("planning.scheduler.worker.reconcile-result TaskRun scope mismatch.");
  }
}

function assertLeaseMatchesWorkerStart(lease: WorkerLease, workerStart: SchedulerRuntimeWorkerStart): void {
  if (lease.changeId !== workerStart.changeId || lease.id !== workerStart.workerLeaseId || lease.taskRunId !== workerStart.taskRunId || lease.taskId.toUpperCase() !== workerStart.taskId.toUpperCase() || lease.roleId !== "coder") {
    throw new Error("planning.scheduler.worker.reconcile-result WorkerLease scope mismatch.");
  }
}

function assertCodeRunMatchesWorkerStart(codeRun: RunMetadata, workerStart: SchedulerRuntimeWorkerStart): void {
  if (codeRun.changeId !== workerStart.changeId || codeRun.id !== workerStart.runId || codeRun.taskRunId !== workerStart.taskRunId || codeRun.runtime !== "provider-code") {
    throw new Error("planning.scheduler.worker.reconcile-result code run scope mismatch.");
  }
  if (!codeRun.taskIds?.some((taskId) => taskId.toUpperCase() === workerStart.taskId.toUpperCase())) {
    throw new Error("planning.scheduler.worker.reconcile-result code run task scope mismatch.");
  }
  if (codeRun.worktree?.worktreeId !== workerStart.worktreeId) {
    throw new Error("planning.scheduler.worker.reconcile-result code run worktree scope mismatch.");
  }
  const gate = codeRun.executionGate;
  if (!gate?.allowed || gate.mode !== "scheduler-claim-reservation") {
    throw new Error("planning.scheduler.worker.reconcile-result code run did not use scheduler-claim-reservation gate.");
  }
  if (
    gate.schedulerRunId !== workerStart.schedulerRunId
    || gate.schedulerClaimReservationId !== workerStart.schedulerClaimReservationId
    || gate.reservationIntentId !== workerStart.reservationIntentId
    || gate.claimIntentId !== workerStart.claimIntentId
    || gate.nodeId !== workerStart.nodeId
    || gate.unitId !== workerStart.unitId
    || gate.taskRunId !== workerStart.taskRunId
  ) {
    throw new Error("planning.scheduler.worker.reconcile-result code gate target is stale.");
  }
}

function assertWorktreeMatchesWorkerStart(worktree: WorktreeMetadata, workerStart: SchedulerRuntimeWorkerStart): void {
  if (worktree.changeId !== workerStart.changeId || worktree.worktreeId !== workerStart.worktreeId) {
    throw new Error("planning.scheduler.worker.reconcile-result worktree scope mismatch.");
  }
  if (worktree.runId && workerStart.runId && worktree.runId !== workerStart.runId) {
    throw new Error("planning.scheduler.worker.reconcile-result worktree run scope mismatch.");
  }
}

async function readWorkerLeaseForTaskRun(memory: ResolvedMemory, taskRun: TaskRun): Promise<WorkerLease> {
  const leases = await listWorkerLeases(memory, taskRun.changeId);
  const lease = leases.find((item) => item.id === taskRun.leaseId);
  if (!lease) throw new Error(`WorkerLease not found for TaskRun ${taskRun.id}.`);
  return lease;
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.worker.reconcile-result ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.worker.reconcile-result ${label} source artifact hash mismatch.`);
  }
}

function buildWorkerResultId(workerStartId: string): string {
  return `scheduler-worker-result-${shortHash(workerStartId).slice(0, 12)}`;
}
