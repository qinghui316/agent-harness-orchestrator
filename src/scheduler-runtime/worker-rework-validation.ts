import { shortHash } from "../fs/path.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { readRun } from "../run/repository.js";
import { listWorkerLeases, readTaskRun, writeTaskRun } from "../task-run/repository.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, TaskRun, ValidationResult, WorkerLease, WorktreeMetadata } from "../types/index.js";
import { readValidationResult } from "../validation/repository.js";
import { startValidationRun } from "../validation/service.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { schedulerWorkerReworkValidationEventType } from "./event-policy.js";
import { assertLatestSchedulerRuntimeClaimReservation, readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRuntimeWorkerReworkValidationForResult,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  readSchedulerRuntimeWorkerReworkPlan,
  readSchedulerRuntimeWorkerReworkResult,
  readSchedulerRuntimeWorkerReworkStart,
  schedulerWorkerReworkValidationArtifactRefs,
  writeSchedulerRuntimeWorkerReworkValidation,
} from "./repository.js";
import type { SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerReworkResult, SchedulerRuntimeWorkerReworkStart, SchedulerRuntimeWorkerReworkValidation } from "./types.js";

export interface SchedulerWorkerReworkValidationInput {
  changeId: string;
  schedulerRunId: string;
  schedulerWorkerReworkResultId: string;
}

export interface SchedulerWorkerReworkValidationResult {
  status: "passed" | "failed";
  reworkStart: SchedulerRuntimeWorkerReworkStart;
  reworkPlan: SchedulerRuntimeWorkerReworkPlan;
  reworkResult: SchedulerRuntimeWorkerReworkResult;
  taskRun: TaskRun;
  lease: WorkerLease;
  codeRun: RunMetadata;
  validationRun: RunMetadata;
  validationResult: ValidationResult;
  schedulerReworkValidation: SchedulerRuntimeWorkerReworkValidation;
  existing: boolean;
  executionStarted: boolean;
}

export async function validateSchedulerFirstWorkerRework(project: ManagedProject, input: SchedulerWorkerReworkValidationInput): Promise<SchedulerWorkerReworkValidationResult> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler worker rework validation cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.worker.rework-validate-first SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.changeId !== run.changeId || runtimeState.schedulerRunId !== run.id) {
    throw new Error("planning.scheduler.worker.rework-validate-first SchedulerRuntimeState scope mismatch.");
  }
  const reworkResult = await readSchedulerRuntimeWorkerReworkResult(memory, changePath, run.id, input.schedulerWorkerReworkResultId);
  assertReworkResultLineage(reworkResult, runtimeState);
  if (reworkResult.status !== "evidence-ready") {
    throw new Error("planning.scheduler.worker.rework-validate-first requires an evidence-ready SchedulerRuntimeWorkerReworkResult.");
  }
  if (!reworkResult.worktreeId || !reworkResult.reworkRunId) {
    throw new Error("planning.scheduler.worker.rework-validate-first requires rework result worktree and code run evidence.");
  }
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, reworkResult.schedulerClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, "planning.scheduler.worker.rework-validate-first");
  const reworkStart = await readSchedulerRuntimeWorkerReworkStart(memory, changePath, run.id, reworkResult.schedulerWorkerReworkStartId);
  assertReworkStartMatchesResult(reworkStart, reworkResult);
  const reworkPlan = await readSchedulerRuntimeWorkerReworkPlan(memory, changePath, run.id, reworkResult.schedulerWorkerReworkPlanId);
  assertReworkPlanMatchesResult(reworkPlan, reworkResult);
  const existing = await findSchedulerRuntimeWorkerReworkValidationForResult(memory, changePath, run.id, reworkResult.id);
  const taskRun = await readTaskRun(memory, input.changeId, reworkResult.reworkTaskRunId);
  assertTaskRunMatchesReworkResult(taskRun, reworkResult, { requireEvidenceReady: !existing });
  const lease = await readWorkerLeaseForTaskRun(memory, taskRun);
  assertLeaseMatchesReworkResult(lease, reworkResult);
  const codeRun = await readRun(memory, reworkResult.reworkRunId);
  assertCodeRunMatchesReworkResult(codeRun, reworkResult);
  const worktree = await readWorktreeMetadata(memory, reworkResult.worktreeId);
  assertWorktreeMatchesReworkResult(worktree, reworkResult);

  if (existing) {
    const validationRun = await readRun(memory, existing.validationRunId);
    const validationResult = await readValidationResult(memory, existing.validationRunId, { changeId: input.changeId });
    return {
      status: existing.status,
      reworkStart,
      reworkPlan,
      reworkResult,
      taskRun,
      lease,
      codeRun,
      validationRun,
      validationResult,
      schedulerReworkValidation: existing,
      existing: true,
      executionStarted: false,
    };
  }

  const validation = await startValidationRun(project, { changeId: input.changeId, worktree: reworkResult.worktreeId });
  if (validation.validation.worktreeId !== reworkResult.worktreeId || validation.validation.changeId !== input.changeId) {
    throw new Error("planning.scheduler.worker.rework-validate-first validation result scope mismatch.");
  }
  if (validation.run.worktree?.worktreeId !== reworkResult.worktreeId || validation.run.runtime !== "validator") {
    throw new Error("planning.scheduler.worker.rework-validate-first validation run scope mismatch.");
  }
  const now = new Date().toISOString();
  const validationStatus = validation.validation.status;
  const nextTaskRun: TaskRun = validationStatus === "passed"
    ? {
      ...taskRun,
      status: "evidence-ready",
      blockedReason: undefined,
      failureReason: undefined,
      updatedAt: now,
    }
    : {
      ...taskRun,
      status: "blocked",
      blockedReason: "Rework validation failed.",
      failureReason: undefined,
      updatedAt: now,
    };
  const writtenTaskRun = await writeTaskRun(memory, nextTaskRun);
  const validationId = buildReworkValidationId(reworkResult.id);
  const refs = schedulerWorkerReworkValidationArtifactRefs(memory, changePath, run.id, validationId);
  const schedulerReworkValidation: SchedulerRuntimeWorkerReworkValidation = {
    version: "1.0",
    id: validationId,
    changeId: reworkResult.changeId,
    schedulerRunId: reworkResult.schedulerRunId,
    schedulerMode: reworkResult.schedulerMode,
    status: validationStatus,
    schedulerRuntimeStateId: reworkResult.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: reworkResult.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: reworkResult.schedulerClaimReservationId,
    schedulerWorkerStartId: reworkResult.schedulerWorkerStartId,
    schedulerWorkerResultId: reworkResult.schedulerWorkerResultId,
    schedulerWorkerValidationId: reworkResult.schedulerWorkerValidationId,
    ...(reworkResult.schedulerWorkerAuditId ? { schedulerWorkerAuditId: reworkResult.schedulerWorkerAuditId } : {}),
    schedulerWorkerReworkPlanId: reworkResult.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: reworkResult.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: reworkResult.id,
    schedulerContractId: reworkResult.schedulerContractId,
    schedulerDispatchDryRunId: reworkResult.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: reworkResult.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: reworkResult.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: reworkResult.schedulerLaunchPreflightId,
    reservationIntentId: reworkResult.reservationIntentId,
    claimIntentId: reworkResult.claimIntentId,
    plannedWorkerKey: reworkResult.plannedWorkerKey,
    nodeId: reworkResult.nodeId,
    unitId: reworkResult.unitId,
    waveIndex: reworkResult.waveIndex,
    stageId: `${reworkResult.nodeId}:rework-validation`,
    stage: "validation",
    taskId: reworkResult.taskId,
    originalTaskRunId: reworkResult.originalTaskRunId,
    originalWorkerLeaseId: reworkResult.originalWorkerLeaseId,
    originalCodeRunId: reworkResult.originalCodeRunId,
    reworkTaskRunId: writtenTaskRun.id,
    reworkWorkerLeaseId: reworkResult.reworkWorkerLeaseId,
    taskRunStatus: writtenTaskRun.status,
    worktreeId: reworkResult.worktreeId,
    reworkRunId: reworkResult.reworkRunId,
    validationRunId: validation.run.id,
    validationStatus,
    failureReason: validationStatus === "failed" ? "Rework validation failed." : undefined,
    sourceArtifactHashes: reworkResult.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, reworkResult.artifact, validation.run.artifacts.directory, validation.run.artifacts.validation ?? ""].filter(Boolean),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeWorkerReworkValidation(memory, changePath, schedulerReworkValidation);
  await appendSchedulerRuntimeEvent(memory, changePath, run, schedulerWorkerReworkValidationEventType(validationStatus), {
    status: runtimeState.status,
    summary: validationStatus === "passed"
      ? `Scheduler rework validation passed for ${reworkResult.schedulerWorkerReworkPlanId}.`
      : `Scheduler rework validation failed for ${reworkResult.schedulerWorkerReworkPlanId}.`,
    artifactRefs: schedulerReworkValidation.artifactRefs,
    payload: {
      schedulerWorkerReworkPlanId: reworkResult.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: reworkResult.schedulerWorkerReworkStartId,
      schedulerWorkerReworkResultId: reworkResult.id,
      schedulerWorkerReworkValidationId: schedulerReworkValidation.id,
      schedulerClaimReservationId: reworkResult.schedulerClaimReservationId,
      reservationIntentId: reworkResult.reservationIntentId,
      claimIntentId: reworkResult.claimIntentId,
      reworkTaskRunId: writtenTaskRun.id,
      reworkWorkerLeaseId: reworkResult.reworkWorkerLeaseId,
      worktreeId: reworkResult.worktreeId,
      reworkRunId: reworkResult.reworkRunId,
      reworkValidationRunId: validation.run.id,
      validationStatus,
    },
  });
  return {
    status: schedulerReworkValidation.status,
    reworkStart,
    reworkPlan,
    reworkResult,
    taskRun: writtenTaskRun,
    lease,
    codeRun,
    validationRun: validation.run,
    validationResult: validation.validation,
    schedulerReworkValidation,
    existing: false,
    executionStarted: true,
  };
}

function assertReworkResultLineage(reworkResult: SchedulerRuntimeWorkerReworkResult, runtimeState: { changeId: string; schedulerRunId: string; id: string; sourceArtifactHashes: Record<string, string> }): void {
  if (reworkResult.changeId !== runtimeState.changeId || reworkResult.schedulerRunId !== runtimeState.schedulerRunId || reworkResult.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.worker.rework-validate-first ReworkResult scope mismatch.");
  }
  assertHashesMatch(reworkResult.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "ReworkResult");
}

function assertReworkStartMatchesResult(reworkStart: SchedulerRuntimeWorkerReworkStart, result: SchedulerRuntimeWorkerReworkResult): void {
  if (
    reworkStart.changeId !== result.changeId
    || reworkStart.schedulerRunId !== result.schedulerRunId
    || reworkStart.id !== result.schedulerWorkerReworkStartId
    || reworkStart.schedulerClaimReservationId !== result.schedulerClaimReservationId
    || reworkStart.schedulerWorkerReworkPlanId !== result.schedulerWorkerReworkPlanId
    || reworkStart.reworkTaskRunId !== result.reworkTaskRunId
    || reworkStart.reworkWorkerLeaseId !== result.reworkWorkerLeaseId
    || reworkStart.worktreeId !== result.worktreeId
    || reworkStart.reworkRunId !== result.reworkRunId
  ) {
    throw new Error("planning.scheduler.worker.rework-validate-first ReworkStart scope mismatch.");
  }
}

function assertReworkPlanMatchesResult(plan: SchedulerRuntimeWorkerReworkPlan, result: SchedulerRuntimeWorkerReworkResult): void {
  if (plan.changeId !== result.changeId || plan.schedulerRunId !== result.schedulerRunId || plan.id !== result.schedulerWorkerReworkPlanId) {
    throw new Error("planning.scheduler.worker.rework-validate-first ReworkPlan scope mismatch.");
  }
  if (
    plan.schedulerClaimReservationId !== result.schedulerClaimReservationId
    || plan.schedulerWorkerStartId !== result.schedulerWorkerStartId
    || plan.schedulerWorkerResultId !== result.schedulerWorkerResultId
    || plan.schedulerWorkerValidationId !== result.schedulerWorkerValidationId
    || (plan.schedulerWorkerAuditId ?? undefined) !== (result.schedulerWorkerAuditId ?? undefined)
    || plan.targetWorktreeId !== result.worktreeId
  ) {
    throw new Error("planning.scheduler.worker.rework-validate-first ReworkPlan lineage mismatch.");
  }
  assertHashesMatch(plan.sourceArtifactHashes, result.sourceArtifactHashes, "ReworkPlan");
}

function assertTaskRunMatchesReworkResult(taskRun: TaskRun, result: SchedulerRuntimeWorkerReworkResult, options: { requireEvidenceReady: boolean } = { requireEvidenceReady: true }): void {
  if (taskRun.changeId !== result.changeId || taskRun.id !== result.reworkTaskRunId || taskRun.taskId.toUpperCase() !== result.taskId.toUpperCase() || taskRun.roleId !== "rework-coder") {
    throw new Error("planning.scheduler.worker.rework-validate-first rework TaskRun scope mismatch.");
  }
  if (options.requireEvidenceReady && taskRun.status !== "evidence-ready") {
    throw new Error("planning.scheduler.worker.rework-validate-first requires rework TaskRun evidence-ready status.");
  }
}

function assertLeaseMatchesReworkResult(lease: WorkerLease, result: SchedulerRuntimeWorkerReworkResult): void {
  if (lease.changeId !== result.changeId || lease.id !== result.reworkWorkerLeaseId || lease.taskRunId !== result.reworkTaskRunId || lease.taskId.toUpperCase() !== result.taskId.toUpperCase() || lease.roleId !== "rework-coder") {
    throw new Error("planning.scheduler.worker.rework-validate-first rework WorkerLease scope mismatch.");
  }
}

function assertCodeRunMatchesReworkResult(codeRun: RunMetadata, result: SchedulerRuntimeWorkerReworkResult): void {
  if (codeRun.changeId !== result.changeId || codeRun.id !== result.reworkRunId || codeRun.taskRunId !== result.reworkTaskRunId || codeRun.runtime !== "provider-code" || codeRun.status !== "completed") {
    throw new Error("planning.scheduler.worker.rework-validate-first rework code run scope mismatch.");
  }
  if (!codeRun.taskIds?.some((taskId) => taskId.toUpperCase() === result.taskId.toUpperCase())) {
    throw new Error("planning.scheduler.worker.rework-validate-first rework code run task scope mismatch.");
  }
  if (codeRun.worktree?.worktreeId !== result.worktreeId) {
    throw new Error("planning.scheduler.worker.rework-validate-first rework code run worktree scope mismatch.");
  }
  const gate = codeRun.executionGate;
  if (!gate?.allowed || gate.mode !== "scheduler-claim-rework") {
    throw new Error("planning.scheduler.worker.rework-validate-first rework code run did not use scheduler-claim-rework gate.");
  }
  if (
    gate.schedulerRunId !== result.schedulerRunId
    || gate.schedulerClaimReservationId !== result.schedulerClaimReservationId
    || gate.schedulerWorkerReworkPlanId !== result.schedulerWorkerReworkPlanId
    || gate.schedulerWorkerValidationId !== result.schedulerWorkerValidationId
    || (gate.schedulerWorkerAuditId ?? undefined) !== (result.schedulerWorkerAuditId ?? undefined)
    || gate.reservationIntentId !== result.reservationIntentId
    || gate.claimIntentId !== result.claimIntentId
    || gate.nodeId !== result.nodeId
    || gate.unitId !== result.unitId
    || gate.taskRunId !== result.reworkTaskRunId
  ) {
    throw new Error("planning.scheduler.worker.rework-validate-first rework code gate target is stale.");
  }
}

function assertWorktreeMatchesReworkResult(worktree: WorktreeMetadata, result: SchedulerRuntimeWorkerReworkResult): void {
  if (worktree.changeId !== result.changeId || worktree.worktreeId !== result.worktreeId) {
    throw new Error("planning.scheduler.worker.rework-validate-first worktree scope mismatch.");
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
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.worker.rework-validate-first ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.worker.rework-validate-first ${label} source artifact hash mismatch.`);
  }
}

function buildReworkValidationId(reworkResultId: string): string {
  return `scheduler-worker-rework-validation-${shortHash(reworkResultId).slice(0, 12)}`;
}
