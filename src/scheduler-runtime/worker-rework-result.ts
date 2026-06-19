import { shortHash } from "../fs/path.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { readRun } from "../run/repository.js";
import { releaseTaskRunLease } from "../task-run/lease-service.js";
import { listWorkerLeases, readTaskRun, writeTaskRun } from "../task-run/repository.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, TaskRun, WorkerLease, WorktreeMetadata } from "../types/index.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { assertLatestSchedulerRuntimeClaimReservation, readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRuntimeWorkerReworkResultForStart,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  readSchedulerRuntimeWorkerReworkPlan,
  readSchedulerRuntimeWorkerReworkStart,
  schedulerWorkerReworkResultArtifactRefs,
  writeSchedulerRuntimeWorkerReworkResult,
} from "./repository.js";
import type { SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerReworkResult, SchedulerRuntimeWorkerReworkStart } from "./types.js";

export interface SchedulerWorkerReworkResultReconcileInput {
  changeId: string;
  schedulerRunId: string;
  schedulerWorkerReworkStartId: string;
}

export type SchedulerWorkerReworkResultReconcileResult =
  | {
    status: "running";
    reworkStart: SchedulerRuntimeWorkerReworkStart;
    reworkPlan: SchedulerRuntimeWorkerReworkPlan;
    taskRun: TaskRun;
    lease: WorkerLease;
    codeRun: RunMetadata | null;
    result?: undefined;
    executionStarted: false;
  }
  | {
    status: "terminal";
    reworkStart: SchedulerRuntimeWorkerReworkStart;
    reworkPlan: SchedulerRuntimeWorkerReworkPlan;
    taskRun: TaskRun;
    lease: WorkerLease;
    codeRun: RunMetadata | null;
    result: SchedulerRuntimeWorkerReworkResult;
    executionStarted: false;
  };

export async function reconcileSchedulerFirstWorkerReworkResult(project: ManagedProject, input: SchedulerWorkerReworkResultReconcileInput): Promise<SchedulerWorkerReworkResultReconcileResult> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler worker rework result reconcile cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.worker.rework-reconcile-result SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.changeId !== run.changeId || runtimeState.schedulerRunId !== run.id) {
    throw new Error("planning.scheduler.worker.rework-reconcile-result SchedulerRuntimeState scope mismatch.");
  }
  const reworkStart = await readSchedulerRuntimeWorkerReworkStart(memory, changePath, run.id, input.schedulerWorkerReworkStartId);
  assertReworkStartLineage(reworkStart, runtimeState);
  const reworkPlan = await readSchedulerRuntimeWorkerReworkPlan(memory, changePath, run.id, reworkStart.schedulerWorkerReworkPlanId);
  assertReworkPlanMatchesStart(reworkPlan, reworkStart);
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, reworkStart.schedulerClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, "planning.scheduler.worker.rework-reconcile-result");
  const existing = await findSchedulerRuntimeWorkerReworkResultForStart(memory, changePath, run.id, reworkStart.id);
  if (existing) {
    const taskRun = await readTaskRun(memory, input.changeId, existing.reworkTaskRunId);
    const lease = await readWorkerLeaseForTaskRun(memory, taskRun);
    const codeRun = existing.reworkRunId ? await readRun(memory, existing.reworkRunId) : null;
    return { status: "terminal", reworkStart, reworkPlan, taskRun, lease, codeRun, result: existing, executionStarted: false };
  }
  const taskRun = await readTaskRun(memory, input.changeId, reworkStart.reworkTaskRunId);
  assertTaskRunMatchesReworkStart(taskRun, reworkStart);
  const lease = await readWorkerLeaseForTaskRun(memory, taskRun);
  assertLeaseMatchesReworkStart(lease, reworkStart);
  const codeRun = reworkStart.reworkRunId ? await readRun(memory, reworkStart.reworkRunId) : null;
  if (codeRun) assertCodeRunMatchesReworkStart(codeRun, reworkStart);
  const worktree = await readWorktreeMetadata(memory, reworkStart.worktreeId);
  assertWorktreeMatchesReworkStart(worktree, reworkStart);
  if (reworkStart.status === "started" && (!codeRun || codeRun.status === "created" || codeRun.status === "running")) {
    return { status: "running", reworkStart, reworkPlan, taskRun, lease, codeRun, executionStarted: false };
  }

  const terminalStatus = reworkStart.status === "failed" || codeRun?.status === "failed" ? "failed" : "evidence-ready";
  const now = new Date().toISOString();
  const nextTaskRun: TaskRun = {
    ...taskRun,
    status: terminalStatus === "evidence-ready" ? "evidence-ready" : "failed",
    runId: reworkStart.reworkRunId ?? taskRun.runId,
    worktreeId: reworkStart.worktreeId ?? taskRun.worktreeId,
    failureReason: terminalStatus === "failed" ? reworkStart.failureReason ?? "Scheduler rework-coder failed." : undefined,
    blockedReason: undefined,
    finishedAt: now,
    updatedAt: now,
  };
  const writtenTaskRun = await writeTaskRun(memory, nextTaskRun);
  await releaseTaskRunLease(memory, writtenTaskRun, now);
  const releasedLease = await readWorkerLeaseForTaskRun(memory, writtenTaskRun);
  const resultId = buildReworkResultId(reworkStart.id);
  const refs = schedulerWorkerReworkResultArtifactRefs(memory, changePath, run.id, resultId);
  const result: SchedulerRuntimeWorkerReworkResult = {
    version: "1.0",
    id: resultId,
    changeId: reworkStart.changeId,
    schedulerRunId: reworkStart.schedulerRunId,
    schedulerMode: reworkStart.schedulerMode,
    status: terminalStatus,
    schedulerRuntimeStateId: reworkStart.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: reworkStart.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: reworkStart.schedulerClaimReservationId,
    schedulerWorkerStartId: reworkStart.schedulerWorkerStartId,
    schedulerWorkerResultId: reworkStart.schedulerWorkerResultId,
    schedulerWorkerValidationId: reworkStart.schedulerWorkerValidationId,
    ...(reworkStart.schedulerWorkerAuditId ? { schedulerWorkerAuditId: reworkStart.schedulerWorkerAuditId } : {}),
    schedulerWorkerReworkPlanId: reworkStart.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: reworkStart.id,
    schedulerContractId: reworkStart.schedulerContractId,
    schedulerDispatchDryRunId: reworkStart.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: reworkStart.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: reworkStart.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: reworkStart.schedulerLaunchPreflightId,
    reservationIntentId: reworkStart.reservationIntentId,
    claimIntentId: reworkStart.claimIntentId,
    plannedWorkerKey: reworkStart.plannedWorkerKey,
    nodeId: reworkStart.nodeId,
    unitId: reworkStart.unitId,
    waveIndex: reworkStart.waveIndex,
    stageId: reworkStart.stageId,
    stage: "bounded-rework",
    taskId: reworkStart.taskId,
    originalTaskRunId: reworkStart.originalTaskRunId,
    originalWorkerLeaseId: reworkStart.originalWorkerLeaseId,
    originalCodeRunId: reworkStart.originalCodeRunId,
    reworkTaskRunId: writtenTaskRun.id,
    reworkWorkerLeaseId: releasedLease.id,
    taskRunStatus: writtenTaskRun.status,
    workerLeaseStatus: releasedLease.status,
    agentRoleId: reworkStart.agentRoleId,
    worktreeId: reworkStart.worktreeId,
    reworkRunId: reworkStart.reworkRunId,
    reworkRunStatus: codeRun?.status,
    failureReason: terminalStatus === "failed" ? reworkStart.failureReason ?? (codeRun ? `Rework code run ${codeRun.status}.` : "Scheduler rework start failed.") : undefined,
    sourceArtifactHashes: reworkStart.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, reworkStart.artifact, ...(codeRun ? [codeRun.artifacts.directory] : [])],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeWorkerReworkResult(memory, changePath, result);
  await appendSchedulerRuntimeEvent(memory, changePath, run, terminalStatus === "evidence-ready" ? "scheduler-runtime.worker-rework-result-ready" : "scheduler-runtime.worker-rework-result-failed", {
    status: runtimeState.status,
    summary: terminalStatus === "evidence-ready"
      ? `Scheduler rework-coder result is evidence-ready for ${reworkStart.schedulerWorkerReworkPlanId}.`
      : `Scheduler rework-coder result failed for ${reworkStart.schedulerWorkerReworkPlanId}.`,
    artifactRefs: result.artifactRefs,
    payload: {
      schedulerWorkerReworkPlanId: reworkStart.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: reworkStart.id,
      schedulerWorkerReworkResultId: result.id,
      schedulerClaimReservationId: reworkStart.schedulerClaimReservationId,
      reservationIntentId: reworkStart.reservationIntentId,
      claimIntentId: reworkStart.claimIntentId,
      reworkTaskRunId: writtenTaskRun.id,
      reworkWorkerLeaseId: releasedLease.id,
      worktreeId: reworkStart.worktreeId,
      reworkRunId: reworkStart.reworkRunId,
      resultStatus: result.status,
    },
  });
  return { status: "terminal", reworkStart, reworkPlan, taskRun: writtenTaskRun, lease: releasedLease, codeRun, result, executionStarted: false };
}

function assertReworkStartLineage(reworkStart: SchedulerRuntimeWorkerReworkStart, runtimeState: { changeId: string; schedulerRunId: string; id: string; sourceArtifactHashes: Record<string, string> }): void {
  if (reworkStart.changeId !== runtimeState.changeId || reworkStart.schedulerRunId !== runtimeState.schedulerRunId || reworkStart.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.worker.rework-reconcile-result ReworkStart scope mismatch.");
  }
  assertHashesMatch(reworkStart.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "ReworkStart");
}

function assertReworkPlanMatchesStart(plan: SchedulerRuntimeWorkerReworkPlan, start: SchedulerRuntimeWorkerReworkStart): void {
  if (plan.changeId !== start.changeId || plan.schedulerRunId !== start.schedulerRunId || plan.id !== start.schedulerWorkerReworkPlanId) {
    throw new Error("planning.scheduler.worker.rework-reconcile-result ReworkPlan scope mismatch.");
  }
  if (
    plan.schedulerClaimReservationId !== start.schedulerClaimReservationId
    || plan.schedulerWorkerStartId !== start.schedulerWorkerStartId
    || plan.schedulerWorkerResultId !== start.schedulerWorkerResultId
    || plan.schedulerWorkerValidationId !== start.schedulerWorkerValidationId
    || (plan.schedulerWorkerAuditId ?? undefined) !== (start.schedulerWorkerAuditId ?? undefined)
    || plan.targetWorktreeId !== start.worktreeId
  ) {
    throw new Error("planning.scheduler.worker.rework-reconcile-result ReworkPlan lineage mismatch.");
  }
  assertHashesMatch(plan.sourceArtifactHashes, start.sourceArtifactHashes, "ReworkPlan");
}

function assertTaskRunMatchesReworkStart(taskRun: TaskRun, reworkStart: SchedulerRuntimeWorkerReworkStart): void {
  if (taskRun.changeId !== reworkStart.changeId || taskRun.id !== reworkStart.reworkTaskRunId || taskRun.taskId.toUpperCase() !== reworkStart.taskId.toUpperCase() || taskRun.roleId !== "rework-coder") {
    throw new Error("planning.scheduler.worker.rework-reconcile-result rework TaskRun scope mismatch.");
  }
}

function assertLeaseMatchesReworkStart(lease: WorkerLease, reworkStart: SchedulerRuntimeWorkerReworkStart): void {
  if (lease.changeId !== reworkStart.changeId || lease.id !== reworkStart.reworkWorkerLeaseId || lease.taskRunId !== reworkStart.reworkTaskRunId || lease.taskId.toUpperCase() !== reworkStart.taskId.toUpperCase() || lease.roleId !== "rework-coder") {
    throw new Error("planning.scheduler.worker.rework-reconcile-result rework WorkerLease scope mismatch.");
  }
}

function assertCodeRunMatchesReworkStart(codeRun: RunMetadata, reworkStart: SchedulerRuntimeWorkerReworkStart): void {
  if (codeRun.changeId !== reworkStart.changeId || codeRun.id !== reworkStart.reworkRunId || codeRun.taskRunId !== reworkStart.reworkTaskRunId || codeRun.runtime !== "coder-codex") {
    throw new Error("planning.scheduler.worker.rework-reconcile-result rework code run scope mismatch.");
  }
  if (!codeRun.taskIds?.some((taskId) => taskId.toUpperCase() === reworkStart.taskId.toUpperCase())) {
    throw new Error("planning.scheduler.worker.rework-reconcile-result rework code run task scope mismatch.");
  }
  if (codeRun.worktree?.worktreeId !== reworkStart.worktreeId) {
    throw new Error("planning.scheduler.worker.rework-reconcile-result rework code run worktree scope mismatch.");
  }
  const gate = codeRun.executionGate;
  if (!gate?.allowed || gate.mode !== "scheduler-claim-rework") {
    throw new Error("planning.scheduler.worker.rework-reconcile-result rework code run did not use scheduler-claim-rework gate.");
  }
  if (
    gate.schedulerRunId !== reworkStart.schedulerRunId
    || gate.schedulerClaimReservationId !== reworkStart.schedulerClaimReservationId
    || gate.schedulerWorkerReworkPlanId !== reworkStart.schedulerWorkerReworkPlanId
    || gate.schedulerWorkerValidationId !== reworkStart.schedulerWorkerValidationId
    || (gate.schedulerWorkerAuditId ?? undefined) !== (reworkStart.schedulerWorkerAuditId ?? undefined)
    || gate.reservationIntentId !== reworkStart.reservationIntentId
    || gate.claimIntentId !== reworkStart.claimIntentId
    || gate.nodeId !== reworkStart.nodeId
    || gate.unitId !== reworkStart.unitId
    || gate.taskRunId !== reworkStart.reworkTaskRunId
  ) {
    throw new Error("planning.scheduler.worker.rework-reconcile-result rework code gate target is stale.");
  }
}

function assertWorktreeMatchesReworkStart(worktree: WorktreeMetadata, reworkStart: SchedulerRuntimeWorkerReworkStart): void {
  if (worktree.changeId !== reworkStart.changeId || worktree.worktreeId !== reworkStart.worktreeId) {
    throw new Error("planning.scheduler.worker.rework-reconcile-result worktree scope mismatch.");
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
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.worker.rework-reconcile-result ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.worker.rework-reconcile-result ${label} source artifact hash mismatch.`);
  }
}

function buildReworkResultId(reworkStartId: string): string {
  return `scheduler-worker-rework-result-${shortHash(reworkStartId).slice(0, 12)}`;
}
