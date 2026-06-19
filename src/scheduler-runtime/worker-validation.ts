import { shortHash } from "../fs/path.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { readRun } from "../run/repository.js";
import { listWorkerLeases, readTaskRun, writeTaskRun } from "../task-run/repository.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, TaskRun, ValidationResult, WorkerLease, WorktreeMetadata } from "../types/index.js";
import { readValidationResult } from "../validation/repository.js";
import { startValidationRun } from "../validation/service.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { schedulerWorkerValidationEventType } from "./event-policy.js";
import { assertLatestSchedulerRuntimeClaimReservation, readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRuntimeWorkerValidationForResult,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  readSchedulerRuntimeWorkerResult,
  readSchedulerRuntimeWorkerStart,
  schedulerWorkerValidationArtifactRefs,
  writeSchedulerRuntimeWorkerValidation,
} from "./repository.js";
import type { SchedulerRuntimeWorkerResult, SchedulerRuntimeWorkerStart, SchedulerRuntimeWorkerValidation } from "./types.js";

export interface SchedulerWorkerValidationInput {
  changeId: string;
  schedulerRunId: string;
  schedulerWorkerResultId: string;
}

export interface SchedulerWorkerValidationResult {
  status: "passed" | "failed";
  workerStart: SchedulerRuntimeWorkerStart;
  workerResult: SchedulerRuntimeWorkerResult;
  taskRun: TaskRun;
  lease: WorkerLease;
  codeRun: RunMetadata;
  validationRun: RunMetadata;
  validationResult: ValidationResult;
  schedulerValidation: SchedulerRuntimeWorkerValidation;
  existing: boolean;
  executionStarted: boolean;
}

export async function validateSchedulerFirstWorker(project: ManagedProject, input: SchedulerWorkerValidationInput): Promise<SchedulerWorkerValidationResult> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler worker validation cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.worker.validate-first SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.changeId !== run.changeId || runtimeState.schedulerRunId !== run.id) {
    throw new Error("planning.scheduler.worker.validate-first SchedulerRuntimeState scope mismatch.");
  }
  const workerResult = await readSchedulerRuntimeWorkerResult(memory, changePath, run.id, input.schedulerWorkerResultId);
  assertWorkerResultLineage(workerResult, runtimeState);
  if (workerResult.status !== "evidence-ready") {
    throw new Error("planning.scheduler.worker.validate-first requires an evidence-ready SchedulerRuntimeWorkerResult.");
  }
  if (!workerResult.worktreeId || !workerResult.runId) {
    throw new Error("planning.scheduler.worker.validate-first requires worker result worktree and code run evidence.");
  }
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, workerResult.schedulerClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, "planning.scheduler.worker.validate-first");
  const workerStart = await readSchedulerRuntimeWorkerStart(memory, changePath, run.id, workerResult.schedulerWorkerStartId);
  assertWorkerStartMatchesResult(workerStart, workerResult);
  const existing = await findSchedulerRuntimeWorkerValidationForResult(memory, changePath, run.id, workerResult.id);
  const taskRun = await readTaskRun(memory, input.changeId, workerResult.taskRunId);
  assertTaskRunMatchesWorkerResult(taskRun, workerResult, { requireEvidenceReady: !existing });
  const lease = await readWorkerLeaseForTaskRun(memory, taskRun);
  assertLeaseMatchesWorkerResult(lease, workerResult);
  const codeRun = await readRun(memory, workerResult.runId);
  assertCodeRunMatchesWorkerResult(codeRun, workerResult);
  const worktree = await readWorktreeMetadata(memory, workerResult.worktreeId);
  assertWorktreeMatchesWorkerResult(worktree, workerResult);

  if (existing) {
    const validationRun = await readRun(memory, existing.validationRunId);
    const validationResult = await readValidationResult(memory, existing.validationRunId, { changeId: input.changeId });
    return {
      status: existing.status,
      workerStart,
      workerResult,
      taskRun,
      lease,
      codeRun,
      validationRun,
      validationResult,
      schedulerValidation: existing,
      existing: true,
      executionStarted: false,
    };
  }

  const validation = await startValidationRun(project, { changeId: input.changeId, worktree: workerResult.worktreeId });
  if (validation.validation.worktreeId !== workerResult.worktreeId || validation.validation.changeId !== input.changeId) {
    throw new Error("planning.scheduler.worker.validate-first validation result scope mismatch.");
  }
  if (validation.run.worktree?.worktreeId !== workerResult.worktreeId || validation.run.runtime !== "validator") {
    throw new Error("planning.scheduler.worker.validate-first validation run scope mismatch.");
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
      blockedReason: "Validation failed.",
      failureReason: undefined,
      updatedAt: now,
    };
  const writtenTaskRun = await writeTaskRun(memory, nextTaskRun);
  const validationId = buildWorkerValidationId(workerResult.id);
  const refs = schedulerWorkerValidationArtifactRefs(memory, changePath, run.id, validationId);
  const schedulerValidation: SchedulerRuntimeWorkerValidation = {
    version: "1.0",
    id: validationId,
    changeId: workerResult.changeId,
    schedulerRunId: workerResult.schedulerRunId,
    schedulerMode: workerResult.schedulerMode,
    status: validationStatus,
    schedulerRuntimeStateId: workerResult.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: workerResult.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: workerResult.schedulerClaimReservationId,
    schedulerWorkerStartId: workerStart.id,
    schedulerWorkerResultId: workerResult.id,
    schedulerContractId: workerResult.schedulerContractId,
    schedulerDispatchDryRunId: workerResult.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: workerResult.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: workerResult.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: workerResult.schedulerLaunchPreflightId,
    reservationIntentId: workerResult.reservationIntentId,
    claimIntentId: workerResult.claimIntentId,
    plannedWorkerKey: workerResult.plannedWorkerKey,
    nodeId: workerResult.nodeId,
    unitId: workerResult.unitId,
    waveIndex: workerResult.waveIndex,
    stageId: `${workerResult.nodeId}:validation`,
    stage: "validation",
    taskId: workerResult.taskId,
    taskRunId: writtenTaskRun.id,
    workerLeaseId: lease.id,
    taskRunStatus: writtenTaskRun.status,
    worktreeId: workerResult.worktreeId,
    codeRunId: workerResult.runId,
    validationRunId: validation.run.id,
    validationStatus,
    failureReason: validationStatus === "failed" ? "Validation failed." : undefined,
    sourceArtifactHashes: workerResult.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, workerResult.artifact, validation.run.artifacts.directory, validation.run.artifacts.validation ?? ""].filter(Boolean),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeWorkerValidation(memory, changePath, schedulerValidation);
  await appendSchedulerRuntimeEvent(memory, changePath, run, schedulerWorkerValidationEventType(validationStatus), {
    status: runtimeState.status,
    summary: validationStatus === "passed"
      ? `Scheduler worker validation passed for ${workerResult.reservationIntentId}.`
      : `Scheduler worker validation failed for ${workerResult.reservationIntentId}.`,
    artifactRefs: schedulerValidation.artifactRefs,
    payload: {
      schedulerWorkerStartId: workerStart.id,
      schedulerWorkerResultId: workerResult.id,
      schedulerWorkerValidationId: schedulerValidation.id,
      schedulerClaimReservationId: workerResult.schedulerClaimReservationId,
      reservationIntentId: workerResult.reservationIntentId,
      claimIntentId: workerResult.claimIntentId,
      taskRunId: writtenTaskRun.id,
      workerLeaseId: lease.id,
      worktreeId: workerResult.worktreeId,
      codeRunId: workerResult.runId,
      validationRunId: validation.run.id,
      validationStatus,
    },
  });
  return {
    status: schedulerValidation.status,
    workerStart,
    workerResult,
    taskRun: writtenTaskRun,
    lease,
    codeRun,
    validationRun: validation.run,
    validationResult: validation.validation,
    schedulerValidation,
    existing: false,
    executionStarted: true,
  };
}

function assertWorkerResultLineage(workerResult: SchedulerRuntimeWorkerResult, runtimeState: { changeId: string; schedulerRunId: string; id: string; sourceArtifactHashes: Record<string, string> }): void {
  if (workerResult.changeId !== runtimeState.changeId || workerResult.schedulerRunId !== runtimeState.schedulerRunId || workerResult.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.worker.validate-first WorkerResult scope mismatch.");
  }
  assertHashesMatch(workerResult.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "WorkerResult");
}

function assertWorkerStartMatchesResult(workerStart: SchedulerRuntimeWorkerStart, result: SchedulerRuntimeWorkerResult): void {
  if (
    workerStart.changeId !== result.changeId
    || workerStart.schedulerRunId !== result.schedulerRunId
    || workerStart.id !== result.schedulerWorkerStartId
    || workerStart.schedulerClaimReservationId !== result.schedulerClaimReservationId
    || workerStart.reservationIntentId !== result.reservationIntentId
    || workerStart.claimIntentId !== result.claimIntentId
    || workerStart.taskRunId !== result.taskRunId
    || workerStart.workerLeaseId !== result.workerLeaseId
    || workerStart.worktreeId !== result.worktreeId
    || workerStart.runId !== result.runId
  ) {
    throw new Error("planning.scheduler.worker.validate-first WorkerStart scope mismatch.");
  }
}

function assertTaskRunMatchesWorkerResult(taskRun: TaskRun, result: SchedulerRuntimeWorkerResult, options: { requireEvidenceReady: boolean } = { requireEvidenceReady: true }): void {
  if (taskRun.changeId !== result.changeId || taskRun.id !== result.taskRunId || taskRun.taskId.toUpperCase() !== result.taskId.toUpperCase() || taskRun.roleId !== "coder") {
    throw new Error("planning.scheduler.worker.validate-first TaskRun scope mismatch.");
  }
  if (options.requireEvidenceReady && taskRun.status !== "evidence-ready") {
    throw new Error("planning.scheduler.worker.validate-first requires TaskRun evidence-ready status.");
  }
}

function assertLeaseMatchesWorkerResult(lease: WorkerLease, result: SchedulerRuntimeWorkerResult): void {
  if (lease.changeId !== result.changeId || lease.id !== result.workerLeaseId || lease.taskRunId !== result.taskRunId || lease.taskId.toUpperCase() !== result.taskId.toUpperCase() || lease.roleId !== "coder") {
    throw new Error("planning.scheduler.worker.validate-first WorkerLease scope mismatch.");
  }
}

function assertCodeRunMatchesWorkerResult(codeRun: RunMetadata, result: SchedulerRuntimeWorkerResult): void {
  if (codeRun.changeId !== result.changeId || codeRun.id !== result.runId || codeRun.taskRunId !== result.taskRunId || codeRun.runtime !== "coder-codex" || codeRun.status !== "completed") {
    throw new Error("planning.scheduler.worker.validate-first code run scope mismatch.");
  }
  if (!codeRun.taskIds?.some((taskId) => taskId.toUpperCase() === result.taskId.toUpperCase())) {
    throw new Error("planning.scheduler.worker.validate-first code run task scope mismatch.");
  }
  if (codeRun.worktree?.worktreeId !== result.worktreeId) {
    throw new Error("planning.scheduler.worker.validate-first code run worktree scope mismatch.");
  }
  const gate = codeRun.executionGate;
  if (!gate?.allowed || gate.mode !== "scheduler-claim-reservation") {
    throw new Error("planning.scheduler.worker.validate-first code run did not use scheduler-claim-reservation gate.");
  }
  if (
    gate.schedulerRunId !== result.schedulerRunId
    || gate.schedulerClaimReservationId !== result.schedulerClaimReservationId
    || gate.reservationIntentId !== result.reservationIntentId
    || gate.claimIntentId !== result.claimIntentId
    || gate.nodeId !== result.nodeId
    || gate.unitId !== result.unitId
    || gate.taskRunId !== result.taskRunId
  ) {
    throw new Error("planning.scheduler.worker.validate-first code gate target is stale.");
  }
}

function assertWorktreeMatchesWorkerResult(worktree: WorktreeMetadata, result: SchedulerRuntimeWorkerResult): void {
  if (worktree.changeId !== result.changeId || worktree.worktreeId !== result.worktreeId) {
    throw new Error("planning.scheduler.worker.validate-first worktree scope mismatch.");
  }
  if (worktree.runId && worktree.runId !== result.runId) {
    throw new Error("planning.scheduler.worker.validate-first worktree run scope mismatch.");
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
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.worker.validate-first ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.worker.validate-first ${label} source artifact hash mismatch.`);
  }
}

function buildWorkerValidationId(workerResultId: string): string {
  return `scheduler-worker-validation-${shortHash(workerResultId).slice(0, 12)}`;
}
