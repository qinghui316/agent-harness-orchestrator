import { shortHash } from "../fs/path.js";
import { readAuditResult } from "../audit/repository.js";
import { startSkillNativeAuditRun } from "../audit/service.js";
import { readRun } from "../run/repository.js";
import { listWorkerLeases, readTaskRun, writeTaskRun } from "../task-run/repository.js";
import type { AuditResult, AuditStatus, ManagedProject, RunMetadata, TaskRun, ValidationResult, WorkerLease, WorktreeMetadata } from "../types/index.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import { readValidationResult } from "../validation/repository.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { schedulerWorkerAuditEventType } from "./event-policy.js";
import { assertLatestSchedulerRuntimeClaimReservation, readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRuntimeWorkerAuditForValidation,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  readSchedulerRuntimeWorkerResult,
  readSchedulerRuntimeWorkerStart,
  readSchedulerRuntimeWorkerValidation,
  schedulerWorkerAuditArtifactRefs,
  writeSchedulerRuntimeWorkerAudit,
} from "./repository.js";
import type { SchedulerRuntimeWorkerAudit, SchedulerRuntimeWorkerResult, SchedulerRuntimeWorkerStart, SchedulerRuntimeWorkerValidation } from "./types.js";
import { buildSchedulerWorkerScopeContext, composeSchedulerWorkerAuditScopePrompt, resolveSchedulerWorkerReservationIntent } from "./worker-scope.js";
import { resolveSchedulerReadySetExecutionScope, type SchedulerReadySetExecutionPort } from "./execution-port.js";

export interface SchedulerWorkerAuditInput {
  changeId: string;
  schedulerRunId: string;
  schedulerWorkerValidationId: string;
}

export interface SchedulerWorkerAuditResult {
  status: AuditStatus;
  workerStart: SchedulerRuntimeWorkerStart;
  workerResult: SchedulerRuntimeWorkerResult;
  workerValidation: SchedulerRuntimeWorkerValidation;
  taskRun: TaskRun;
  lease: WorkerLease;
  codeRun: RunMetadata;
  validationRun: RunMetadata;
  validationResult: ValidationResult;
  auditRun: RunMetadata;
  auditResult: AuditResult;
  schedulerAudit: SchedulerRuntimeWorkerAudit;
  existing: boolean;
  executionStarted: boolean;
}

export async function auditSchedulerFirstWorker(project: ManagedProject, input: SchedulerWorkerAuditInput, port: SchedulerReadySetExecutionPort): Promise<SchedulerWorkerAuditResult> {
  const scope = await resolveSchedulerReadySetExecutionScope(project, input.changeId, "Scheduler worker audit", port);
  const { artifacts: memory, runtime, changePath } = scope;
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.worker.audit-first SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.changeId !== run.changeId || runtimeState.schedulerRunId !== run.id) {
    throw new Error("planning.scheduler.worker.audit-first SchedulerRuntimeState scope mismatch.");
  }
  const workerValidation = await readSchedulerRuntimeWorkerValidation(memory, changePath, run.id, input.schedulerWorkerValidationId);
  assertWorkerValidationLineage(workerValidation, runtimeState);
  if (workerValidation.status !== "passed") {
    throw new Error("planning.scheduler.worker.audit-first requires a passed SchedulerRuntimeWorkerValidation.");
  }
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, workerValidation.schedulerClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, "planning.scheduler.worker.audit-first");
  const intent = resolveSchedulerWorkerReservationIntent(reservation, workerValidation, "planning.scheduler.worker.audit-first");
  const scopeContext = buildSchedulerWorkerScopeContext(scope.changeStatus, reservation, intent, workerValidation.taskId);
  const workerResult = await readSchedulerRuntimeWorkerResult(memory, changePath, run.id, workerValidation.schedulerWorkerResultId);
  assertWorkerResultMatchesValidation(workerResult, workerValidation);
  const workerStart = await readSchedulerRuntimeWorkerStart(memory, changePath, run.id, workerValidation.schedulerWorkerStartId);
  assertWorkerStartMatchesValidation(workerStart, workerValidation);
  const existing = await findSchedulerRuntimeWorkerAuditForValidation(memory, changePath, run.id, workerValidation.id);
  const taskRun = await readTaskRun(runtime, input.changeId, workerValidation.taskRunId);
  assertTaskRunMatchesWorkerValidation(taskRun, workerValidation, { requireEvidenceReady: !existing });
  const lease = await readWorkerLeaseForTaskRun(runtime, taskRun);
  assertLeaseMatchesWorkerValidation(lease, workerValidation);
  const codeRun = await readRun(runtime, workerValidation.codeRunId);
  assertCodeRunMatchesWorkerValidation(codeRun, workerValidation);
  const validationRun = await readRun(runtime, workerValidation.validationRunId);
  assertValidationRunMatchesWorkerValidation(validationRun, workerValidation);
  const validationResult = await readValidationResult(runtime, workerValidation.validationRunId, { changeId: input.changeId });
  assertValidationResultMatchesWorkerValidation(validationResult, workerValidation);
  const worktree = await readWorktreeMetadata(runtime, workerValidation.worktreeId);
  assertWorktreeMatchesWorkerValidation(worktree, workerValidation);

  if (existing) {
    const auditRun = await readRun(runtime, existing.auditRunId);
    const auditResult = await readAuditResult(runtime, existing.auditRunId, { changeId: input.changeId });
    assertAuditRunMatchesWorkerAudit(auditRun, existing);
    assertAuditResultMatchesWorkerAudit(auditResult, existing);
    return {
      status: existing.status,
      workerStart,
      workerResult,
      workerValidation,
      taskRun,
      lease,
      codeRun,
      validationRun,
      validationResult,
      auditRun,
      auditResult,
      schedulerAudit: existing,
      existing: true,
      executionStarted: false,
    };
  }

  const auditInput = {
    changeId: input.changeId,
    worktreeId: workerValidation.worktreeId,
    validationId: workerValidation.validationRunId,
    prompt: composeSchedulerWorkerAuditScopePrompt(scopeContext),
  };
  const audit = await startSkillNativeAuditRun(project, scope.skillNative.runtime, scope.skillNative.harness, auditInput);
  if (audit.audit.changeId !== input.changeId || audit.audit.worktreeId !== workerValidation.worktreeId || audit.audit.validationId !== workerValidation.validationRunId) {
    throw new Error("planning.scheduler.worker.audit-first audit result scope mismatch.");
  }
  if (audit.run.runtime !== "auditor") {
    throw new Error("planning.scheduler.worker.audit-first audit run scope mismatch.");
  }
  const now = new Date().toISOString();
  const nextTaskRun = taskRunForAudit(taskRun, audit.audit.status, now);
  const writtenTaskRun = await writeTaskRun(runtime, nextTaskRun);
  const auditId = buildWorkerAuditId(workerValidation.id);
  const refs = schedulerWorkerAuditArtifactRefs(memory, changePath, run.id, auditId);
  const schedulerAudit: SchedulerRuntimeWorkerAudit = {
    version: "1.0",
    id: auditId,
    changeId: workerValidation.changeId,
    schedulerRunId: workerValidation.schedulerRunId,
    schedulerMode: workerValidation.schedulerMode,
    status: audit.audit.status,
    schedulerRuntimeStateId: workerValidation.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: workerValidation.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: workerValidation.schedulerClaimReservationId,
    schedulerWorkerStartId: workerStart.id,
    schedulerWorkerResultId: workerResult.id,
    schedulerWorkerValidationId: workerValidation.id,
    schedulerContractId: workerValidation.schedulerContractId,
    schedulerDispatchDryRunId: workerValidation.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: workerValidation.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: workerValidation.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: workerValidation.schedulerLaunchPreflightId,
    reservationIntentId: workerValidation.reservationIntentId,
    claimIntentId: workerValidation.claimIntentId,
    plannedWorkerKey: workerValidation.plannedWorkerKey,
    nodeId: workerValidation.nodeId,
    unitId: workerValidation.unitId,
    waveIndex: workerValidation.waveIndex,
    stageId: `${workerValidation.nodeId}:audit`,
    stage: "audit",
    taskId: workerValidation.taskId,
    taskRunId: writtenTaskRun.id,
    workerLeaseId: lease.id,
    taskRunStatus: writtenTaskRun.status,
    worktreeId: workerValidation.worktreeId,
    codeRunId: workerValidation.codeRunId,
    validationRunId: workerValidation.validationRunId,
    validationStatus: workerValidation.validationStatus,
    auditRunId: audit.run.id,
    auditStatus: audit.audit.status,
    failureReason: auditFailureReason(audit.audit.status),
    sourceArtifactHashes: workerValidation.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, workerValidation.artifact, audit.run.artifacts.directory, audit.run.artifacts.audit ?? "", audit.run.artifacts.auditMarkdown ?? ""].filter(Boolean),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeWorkerAudit(memory, changePath, schedulerAudit);
  await appendSchedulerRuntimeEvent(memory, changePath, run, schedulerWorkerAuditEventType(audit.audit.status), {
    status: runtimeState.status,
    summary: `Scheduler worker audit ${audit.audit.status} for ${workerValidation.reservationIntentId}.`,
    artifactRefs: schedulerAudit.artifactRefs,
    payload: {
      schedulerWorkerStartId: workerStart.id,
      schedulerWorkerResultId: workerResult.id,
      schedulerWorkerValidationId: workerValidation.id,
      schedulerWorkerAuditId: schedulerAudit.id,
      schedulerClaimReservationId: workerValidation.schedulerClaimReservationId,
      reservationIntentId: workerValidation.reservationIntentId,
      claimIntentId: workerValidation.claimIntentId,
      taskRunId: writtenTaskRun.id,
      workerLeaseId: lease.id,
      worktreeId: workerValidation.worktreeId,
      codeRunId: workerValidation.codeRunId,
      validationRunId: workerValidation.validationRunId,
      auditRunId: audit.run.id,
      auditStatus: audit.audit.status,
    },
  });
  return {
    status: schedulerAudit.status,
    workerStart,
    workerResult,
    workerValidation,
    taskRun: writtenTaskRun,
    lease,
    codeRun,
    validationRun,
    validationResult,
    auditRun: audit.run,
    auditResult: audit.audit,
    schedulerAudit,
    existing: false,
    executionStarted: true,
  };
}

function assertWorkerValidationLineage(validation: SchedulerRuntimeWorkerValidation, runtimeState: { changeId: string; schedulerRunId: string; id: string; sourceArtifactHashes: Record<string, string> }): void {
  if (validation.changeId !== runtimeState.changeId || validation.schedulerRunId !== runtimeState.schedulerRunId || validation.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.worker.audit-first WorkerValidation scope mismatch.");
  }
  assertHashesMatch(validation.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "WorkerValidation");
}

function assertWorkerResultMatchesValidation(result: SchedulerRuntimeWorkerResult, validation: SchedulerRuntimeWorkerValidation): void {
  if (
    result.changeId !== validation.changeId
    || result.schedulerRunId !== validation.schedulerRunId
    || result.id !== validation.schedulerWorkerResultId
    || result.schedulerClaimReservationId !== validation.schedulerClaimReservationId
    || result.schedulerWorkerStartId !== validation.schedulerWorkerStartId
    || result.reservationIntentId !== validation.reservationIntentId
    || result.claimIntentId !== validation.claimIntentId
    || result.taskRunId !== validation.taskRunId
    || result.workerLeaseId !== validation.workerLeaseId
    || result.worktreeId !== validation.worktreeId
    || result.runId !== validation.codeRunId
    || result.status !== "evidence-ready"
  ) {
    throw new Error("planning.scheduler.worker.audit-first WorkerResult scope mismatch.");
  }
}

function assertWorkerStartMatchesValidation(start: SchedulerRuntimeWorkerStart, validation: SchedulerRuntimeWorkerValidation): void {
  if (
    start.changeId !== validation.changeId
    || start.schedulerRunId !== validation.schedulerRunId
    || start.id !== validation.schedulerWorkerStartId
    || start.schedulerClaimReservationId !== validation.schedulerClaimReservationId
    || start.reservationIntentId !== validation.reservationIntentId
    || start.claimIntentId !== validation.claimIntentId
    || start.taskRunId !== validation.taskRunId
    || start.workerLeaseId !== validation.workerLeaseId
    || start.worktreeId !== validation.worktreeId
    || start.runId !== validation.codeRunId
  ) {
    throw new Error("planning.scheduler.worker.audit-first WorkerStart scope mismatch.");
  }
}

function assertTaskRunMatchesWorkerValidation(taskRun: TaskRun, validation: SchedulerRuntimeWorkerValidation, options: { requireEvidenceReady: boolean }): void {
  if (taskRun.changeId !== validation.changeId || taskRun.id !== validation.taskRunId || taskRun.taskId.toUpperCase() !== validation.taskId.toUpperCase() || taskRun.roleId !== "coder") {
    throw new Error("planning.scheduler.worker.audit-first TaskRun scope mismatch.");
  }
  if (options.requireEvidenceReady && taskRun.status !== "evidence-ready") {
    throw new Error("planning.scheduler.worker.audit-first requires TaskRun evidence-ready status.");
  }
}

function assertLeaseMatchesWorkerValidation(lease: WorkerLease, validation: SchedulerRuntimeWorkerValidation): void {
  if (lease.changeId !== validation.changeId || lease.id !== validation.workerLeaseId || lease.taskRunId !== validation.taskRunId || lease.taskId.toUpperCase() !== validation.taskId.toUpperCase() || lease.roleId !== "coder") {
    throw new Error("planning.scheduler.worker.audit-first WorkerLease scope mismatch.");
  }
}

function assertCodeRunMatchesWorkerValidation(codeRun: RunMetadata, validation: SchedulerRuntimeWorkerValidation): void {
  if (codeRun.changeId !== validation.changeId || codeRun.id !== validation.codeRunId || codeRun.taskRunId !== validation.taskRunId || codeRun.runtime !== "provider-code" || codeRun.status !== "completed") {
    throw new Error("planning.scheduler.worker.audit-first code run scope mismatch.");
  }
  if (!codeRun.taskIds?.some((taskId) => taskId.toUpperCase() === validation.taskId.toUpperCase())) {
    throw new Error("planning.scheduler.worker.audit-first code run task scope mismatch.");
  }
  if (codeRun.worktree?.worktreeId !== validation.worktreeId) {
    throw new Error("planning.scheduler.worker.audit-first code run worktree scope mismatch.");
  }
  const gate = codeRun.executionGate;
  if (!gate?.allowed || gate.mode !== "scheduler-claim-reservation") {
    throw new Error("planning.scheduler.worker.audit-first code run did not use scheduler-claim-reservation gate.");
  }
  if (
    gate.schedulerRunId !== validation.schedulerRunId
    || gate.schedulerClaimReservationId !== validation.schedulerClaimReservationId
    || gate.reservationIntentId !== validation.reservationIntentId
    || gate.claimIntentId !== validation.claimIntentId
    || gate.nodeId !== validation.nodeId
    || gate.unitId !== validation.unitId
    || gate.taskRunId !== validation.taskRunId
  ) {
    throw new Error("planning.scheduler.worker.audit-first code gate target is stale.");
  }
}

function assertValidationRunMatchesWorkerValidation(validationRun: RunMetadata, validation: SchedulerRuntimeWorkerValidation): void {
  if (validationRun.changeId !== validation.changeId || validationRun.id !== validation.validationRunId || validationRun.runtime !== "validator" || validationRun.worktree?.worktreeId !== validation.worktreeId) {
    throw new Error("planning.scheduler.worker.audit-first validation run scope mismatch.");
  }
}

function assertValidationResultMatchesWorkerValidation(result: ValidationResult, validation: SchedulerRuntimeWorkerValidation): void {
  if (result.changeId !== validation.changeId || result.id !== validation.validationRunId || result.runId !== validation.validationRunId || result.worktreeId !== validation.worktreeId || result.status !== "passed") {
    throw new Error("planning.scheduler.worker.audit-first validation result scope mismatch.");
  }
}

function assertWorktreeMatchesWorkerValidation(worktree: WorktreeMetadata, validation: SchedulerRuntimeWorkerValidation): void {
  if (worktree.changeId !== validation.changeId || worktree.worktreeId !== validation.worktreeId) {
    throw new Error("planning.scheduler.worker.audit-first worktree scope mismatch.");
  }
  if (worktree.runId && worktree.runId !== validation.codeRunId) {
    throw new Error("planning.scheduler.worker.audit-first worktree run scope mismatch.");
  }
}

function assertAuditRunMatchesWorkerAudit(auditRun: RunMetadata, audit: SchedulerRuntimeWorkerAudit): void {
  if (auditRun.changeId !== audit.changeId || auditRun.id !== audit.auditRunId || auditRun.runtime !== "auditor") {
    throw new Error("planning.scheduler.worker.audit-first existing audit run scope mismatch.");
  }
}

function assertAuditResultMatchesWorkerAudit(result: AuditResult, audit: SchedulerRuntimeWorkerAudit): void {
  if (result.changeId !== audit.changeId || result.id !== audit.auditRunId || result.runId !== audit.auditRunId || result.worktreeId !== audit.worktreeId || result.validationId !== audit.validationRunId || result.status !== audit.auditStatus) {
    throw new Error("planning.scheduler.worker.audit-first existing audit result scope mismatch.");
  }
}

async function readWorkerLeaseForTaskRun(memory: ProjectRunsPathPort, taskRun: TaskRun): Promise<WorkerLease> {
  const leases = await listWorkerLeases(memory, taskRun.changeId);
  const lease = leases.find((item) => item.id === taskRun.leaseId);
  if (!lease) throw new Error(`WorkerLease not found for TaskRun ${taskRun.id}.`);
  return lease;
}

function taskRunForAudit(taskRun: TaskRun, auditStatus: AuditStatus, now: string): TaskRun {
  if (auditStatus === "approved" || auditStatus === "approved-with-notes") {
    return {
      ...taskRun,
      status: "completed",
      blockedReason: undefined,
      failureReason: undefined,
      finishedAt: now,
      updatedAt: now,
    };
  }
  return {
    ...taskRun,
    status: "blocked",
    blockedReason: auditStatus === "blocked" ? "Audit blocked." : "Audit failed.",
    failureReason: undefined,
    finishedAt: now,
    updatedAt: now,
  };
}

function auditFailureReason(status: AuditStatus): string | undefined {
  if (status === "blocked") return "Audit blocked.";
  if (status === "failed") return "Audit failed.";
  return undefined;
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.worker.audit-first ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.worker.audit-first ${label} source artifact hash mismatch.`);
  }
}

function buildWorkerAuditId(workerValidationId: string): string {
  return `scheduler-worker-audit-${shortHash(workerValidationId).slice(0, 12)}`;
}
