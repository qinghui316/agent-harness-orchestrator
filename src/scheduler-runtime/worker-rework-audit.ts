import { shortHash } from "../fs/path.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { readAuditResult } from "../audit/repository.js";
import { startAuditRun } from "../audit/service.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { readRun } from "../run/repository.js";
import { listWorkerLeases, readTaskRun, writeTaskRun } from "../task-run/repository.js";
import type { AuditResult, AuditStatus, ManagedProject, ResolvedMemory, RunMetadata, TaskRun, ValidationResult, WorkerLease, WorktreeMetadata } from "../types/index.js";
import { readValidationResult } from "../validation/repository.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { schedulerWorkerReworkAuditEventType } from "./event-policy.js";
import { assertLatestSchedulerRuntimeClaimReservation, readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRuntimeWorkerReworkAuditForValidation,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  readSchedulerRuntimeWorkerReworkPlan,
  readSchedulerRuntimeWorkerReworkResult,
  readSchedulerRuntimeWorkerReworkStart,
  readSchedulerRuntimeWorkerReworkValidation,
  schedulerWorkerReworkAuditArtifactRefs,
  writeSchedulerRuntimeWorkerReworkAudit,
} from "./repository.js";
import type {
  SchedulerRuntimeWorkerReworkAudit,
  SchedulerRuntimeWorkerReworkPlan,
  SchedulerRuntimeWorkerReworkResult,
  SchedulerRuntimeWorkerReworkStart,
  SchedulerRuntimeWorkerReworkValidation,
} from "./types.js";
import { buildSchedulerWorkerScopeContext, composeSchedulerWorkerAuditScopePrompt, resolveSchedulerWorkerReservationIntent } from "./worker-scope.js";

export interface SchedulerWorkerReworkAuditInput {
  changeId: string;
  schedulerRunId: string;
  schedulerWorkerReworkValidationId: string;
}

export interface SchedulerWorkerReworkAuditResult {
  status: AuditStatus;
  reworkStart: SchedulerRuntimeWorkerReworkStart;
  reworkPlan: SchedulerRuntimeWorkerReworkPlan;
  reworkResult: SchedulerRuntimeWorkerReworkResult;
  reworkValidation: SchedulerRuntimeWorkerReworkValidation;
  taskRun: TaskRun;
  lease: WorkerLease;
  codeRun: RunMetadata;
  validationRun: RunMetadata;
  validationResult: ValidationResult;
  auditRun: RunMetadata;
  auditResult: AuditResult;
  schedulerReworkAudit: SchedulerRuntimeWorkerReworkAudit;
  existing: boolean;
  executionStarted: boolean;
}

export async function auditSchedulerFirstWorkerRework(project: ManagedProject, input: SchedulerWorkerReworkAuditInput): Promise<SchedulerWorkerReworkAuditResult> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler worker rework audit cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.worker.rework-audit-first SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.changeId !== run.changeId || runtimeState.schedulerRunId !== run.id) {
    throw new Error("planning.scheduler.worker.rework-audit-first SchedulerRuntimeState scope mismatch.");
  }
  const reworkValidation = await readSchedulerRuntimeWorkerReworkValidation(memory, changePath, run.id, input.schedulerWorkerReworkValidationId);
  assertReworkValidationLineage(reworkValidation, runtimeState);
  if (reworkValidation.status !== "passed") {
    throw new Error("planning.scheduler.worker.rework-audit-first requires a passed SchedulerRuntimeWorkerReworkValidation.");
  }
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, reworkValidation.schedulerClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, "planning.scheduler.worker.rework-audit-first");
  const intent = resolveSchedulerWorkerReservationIntent(reservation, reworkValidation, "planning.scheduler.worker.rework-audit-first");
  const scopeContext = buildSchedulerWorkerScopeContext(target.status, reservation, intent, reworkValidation.taskId);
  const reworkResult = await readSchedulerRuntimeWorkerReworkResult(memory, changePath, run.id, reworkValidation.schedulerWorkerReworkResultId);
  assertReworkResultMatchesValidation(reworkResult, reworkValidation);
  const reworkStart = await readSchedulerRuntimeWorkerReworkStart(memory, changePath, run.id, reworkValidation.schedulerWorkerReworkStartId);
  assertReworkStartMatchesValidation(reworkStart, reworkValidation);
  const reworkPlan = await readSchedulerRuntimeWorkerReworkPlan(memory, changePath, run.id, reworkValidation.schedulerWorkerReworkPlanId);
  assertReworkPlanMatchesValidation(reworkPlan, reworkValidation);
  const existing = await findSchedulerRuntimeWorkerReworkAuditForValidation(memory, changePath, run.id, reworkValidation.id);
  const taskRun = await readTaskRun(memory, input.changeId, reworkValidation.reworkTaskRunId);
  assertTaskRunMatchesReworkValidation(taskRun, reworkValidation, { requireEvidenceReady: !existing });
  const lease = await readWorkerLeaseForTaskRun(memory, taskRun);
  assertLeaseMatchesReworkValidation(lease, reworkValidation);
  const codeRun = await readRun(memory, reworkValidation.reworkRunId);
  assertCodeRunMatchesReworkValidation(codeRun, reworkValidation);
  const validationRun = await readRun(memory, reworkValidation.validationRunId);
  assertValidationRunMatchesReworkValidation(validationRun, reworkValidation);
  const validationResult = await readValidationResult(memory, reworkValidation.validationRunId, { changeId: input.changeId });
  assertValidationResultMatchesReworkValidation(validationResult, reworkValidation);
  const worktree = await readWorktreeMetadata(memory, reworkValidation.worktreeId);
  assertWorktreeMatchesReworkValidation(worktree, reworkValidation);

  if (existing) {
    const auditRun = await readRun(memory, existing.auditRunId);
    const auditResult = await readAuditResult(memory, existing.auditRunId, { changeId: input.changeId });
    assertAuditRunMatchesReworkAudit(auditRun, existing);
    assertAuditResultMatchesReworkAudit(auditResult, existing);
    return {
      status: existing.status,
      reworkStart,
      reworkPlan,
      reworkResult,
      reworkValidation,
      taskRun,
      lease,
      codeRun,
      validationRun,
      validationResult,
      auditRun,
      auditResult,
      schedulerReworkAudit: existing,
      existing: true,
      executionStarted: false,
    };
  }

  const audit = await startAuditRun(project, {
    changeId: input.changeId,
    worktreeId: reworkValidation.worktreeId,
    validationId: reworkValidation.validationRunId,
    prompt: composeSchedulerWorkerAuditScopePrompt(scopeContext),
  });
  if (audit.audit.changeId !== input.changeId || audit.audit.worktreeId !== reworkValidation.worktreeId || audit.audit.validationId !== reworkValidation.validationRunId) {
    throw new Error("planning.scheduler.worker.rework-audit-first audit result scope mismatch.");
  }
  if (audit.run.runtime !== "auditor") {
    throw new Error("planning.scheduler.worker.rework-audit-first audit run scope mismatch.");
  }
  const now = new Date().toISOString();
  const nextTaskRun = taskRunForReworkAudit(taskRun, audit.audit.status, now);
  const writtenTaskRun = await writeTaskRun(memory, nextTaskRun);
  const auditId = buildReworkAuditId(reworkValidation.id);
  const refs = schedulerWorkerReworkAuditArtifactRefs(memory, changePath, run.id, auditId);
  const schedulerReworkAudit: SchedulerRuntimeWorkerReworkAudit = {
    version: "1.0",
    id: auditId,
    changeId: reworkValidation.changeId,
    schedulerRunId: reworkValidation.schedulerRunId,
    schedulerMode: reworkValidation.schedulerMode,
    status: audit.audit.status,
    schedulerRuntimeStateId: reworkValidation.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: reworkValidation.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: reworkValidation.schedulerClaimReservationId,
    schedulerWorkerStartId: reworkValidation.schedulerWorkerStartId,
    schedulerWorkerResultId: reworkValidation.schedulerWorkerResultId,
    schedulerWorkerValidationId: reworkValidation.schedulerWorkerValidationId,
    ...(reworkValidation.schedulerWorkerAuditId ? { schedulerWorkerAuditId: reworkValidation.schedulerWorkerAuditId } : {}),
    schedulerWorkerReworkPlanId: reworkValidation.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: reworkValidation.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: reworkValidation.schedulerWorkerReworkResultId,
    schedulerWorkerReworkValidationId: reworkValidation.id,
    schedulerContractId: reworkValidation.schedulerContractId,
    schedulerDispatchDryRunId: reworkValidation.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: reworkValidation.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: reworkValidation.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: reworkValidation.schedulerLaunchPreflightId,
    reservationIntentId: reworkValidation.reservationIntentId,
    claimIntentId: reworkValidation.claimIntentId,
    plannedWorkerKey: reworkValidation.plannedWorkerKey,
    nodeId: reworkValidation.nodeId,
    unitId: reworkValidation.unitId,
    waveIndex: reworkValidation.waveIndex,
    stageId: `${reworkValidation.nodeId}:rework-audit`,
    stage: "audit",
    taskId: reworkValidation.taskId,
    originalTaskRunId: reworkValidation.originalTaskRunId,
    originalWorkerLeaseId: reworkValidation.originalWorkerLeaseId,
    originalCodeRunId: reworkValidation.originalCodeRunId,
    reworkTaskRunId: writtenTaskRun.id,
    reworkWorkerLeaseId: reworkValidation.reworkWorkerLeaseId,
    taskRunStatus: writtenTaskRun.status,
    worktreeId: reworkValidation.worktreeId,
    reworkRunId: reworkValidation.reworkRunId,
    validationRunId: reworkValidation.validationRunId,
    validationStatus: reworkValidation.validationStatus,
    auditRunId: audit.run.id,
    auditStatus: audit.audit.status,
    failureReason: reworkAuditFailureReason(audit.audit.status),
    sourceArtifactHashes: reworkValidation.sourceArtifactHashes,
    artifactRefs: [refs.artifact, refs.markdownArtifact, reworkValidation.artifact, audit.run.artifacts.directory, audit.run.artifacts.audit ?? "", audit.run.artifacts.auditMarkdown ?? ""].filter(Boolean),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeWorkerReworkAudit(memory, changePath, schedulerReworkAudit);
  await appendSchedulerRuntimeEvent(memory, changePath, run, schedulerWorkerReworkAuditEventType(audit.audit.status), {
    status: runtimeState.status,
    summary: `Scheduler rework audit ${audit.audit.status} for ${reworkValidation.schedulerWorkerReworkPlanId}.`,
    artifactRefs: schedulerReworkAudit.artifactRefs,
    payload: {
      schedulerWorkerReworkPlanId: reworkValidation.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: reworkValidation.schedulerWorkerReworkStartId,
      schedulerWorkerReworkResultId: reworkValidation.schedulerWorkerReworkResultId,
      schedulerWorkerReworkValidationId: reworkValidation.id,
      schedulerWorkerReworkAuditId: schedulerReworkAudit.id,
      schedulerClaimReservationId: reworkValidation.schedulerClaimReservationId,
      reservationIntentId: reworkValidation.reservationIntentId,
      claimIntentId: reworkValidation.claimIntentId,
      reworkTaskRunId: writtenTaskRun.id,
      reworkWorkerLeaseId: reworkValidation.reworkWorkerLeaseId,
      worktreeId: reworkValidation.worktreeId,
      reworkRunId: reworkValidation.reworkRunId,
      reworkValidationRunId: reworkValidation.validationRunId,
      reworkAuditRunId: audit.run.id,
      auditStatus: audit.audit.status,
    },
  });
  return {
    status: schedulerReworkAudit.status,
    reworkStart,
    reworkPlan,
    reworkResult,
    reworkValidation,
    taskRun: writtenTaskRun,
    lease,
    codeRun,
    validationRun,
    validationResult,
    auditRun: audit.run,
    auditResult: audit.audit,
    schedulerReworkAudit,
    existing: false,
    executionStarted: true,
  };
}

function assertReworkValidationLineage(validation: SchedulerRuntimeWorkerReworkValidation, runtimeState: { changeId: string; schedulerRunId: string; id: string; sourceArtifactHashes: Record<string, string> }): void {
  if (validation.changeId !== runtimeState.changeId || validation.schedulerRunId !== runtimeState.schedulerRunId || validation.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.worker.rework-audit-first ReworkValidation scope mismatch.");
  }
  assertHashesMatch(validation.sourceArtifactHashes, runtimeState.sourceArtifactHashes, "ReworkValidation");
}

function assertReworkResultMatchesValidation(result: SchedulerRuntimeWorkerReworkResult, validation: SchedulerRuntimeWorkerReworkValidation): void {
  if (
    result.changeId !== validation.changeId
    || result.schedulerRunId !== validation.schedulerRunId
    || result.id !== validation.schedulerWorkerReworkResultId
    || result.schedulerClaimReservationId !== validation.schedulerClaimReservationId
    || result.schedulerWorkerReworkStartId !== validation.schedulerWorkerReworkStartId
    || result.schedulerWorkerReworkPlanId !== validation.schedulerWorkerReworkPlanId
    || result.reservationIntentId !== validation.reservationIntentId
    || result.claimIntentId !== validation.claimIntentId
    || result.reworkTaskRunId !== validation.reworkTaskRunId
    || result.reworkWorkerLeaseId !== validation.reworkWorkerLeaseId
    || result.worktreeId !== validation.worktreeId
    || result.reworkRunId !== validation.reworkRunId
    || result.status !== "evidence-ready"
  ) {
    throw new Error("planning.scheduler.worker.rework-audit-first ReworkResult scope mismatch.");
  }
}

function assertReworkStartMatchesValidation(start: SchedulerRuntimeWorkerReworkStart, validation: SchedulerRuntimeWorkerReworkValidation): void {
  if (
    start.changeId !== validation.changeId
    || start.schedulerRunId !== validation.schedulerRunId
    || start.id !== validation.schedulerWorkerReworkStartId
    || start.schedulerClaimReservationId !== validation.schedulerClaimReservationId
    || start.schedulerWorkerReworkPlanId !== validation.schedulerWorkerReworkPlanId
    || start.reworkTaskRunId !== validation.reworkTaskRunId
    || start.reworkWorkerLeaseId !== validation.reworkWorkerLeaseId
    || start.worktreeId !== validation.worktreeId
    || start.reworkRunId !== validation.reworkRunId
  ) {
    throw new Error("planning.scheduler.worker.rework-audit-first ReworkStart scope mismatch.");
  }
}

function assertReworkPlanMatchesValidation(plan: SchedulerRuntimeWorkerReworkPlan, validation: SchedulerRuntimeWorkerReworkValidation): void {
  if (plan.changeId !== validation.changeId || plan.schedulerRunId !== validation.schedulerRunId || plan.id !== validation.schedulerWorkerReworkPlanId) {
    throw new Error("planning.scheduler.worker.rework-audit-first ReworkPlan scope mismatch.");
  }
  if (
    plan.schedulerClaimReservationId !== validation.schedulerClaimReservationId
    || plan.schedulerWorkerStartId !== validation.schedulerWorkerStartId
    || plan.schedulerWorkerResultId !== validation.schedulerWorkerResultId
    || plan.schedulerWorkerValidationId !== validation.schedulerWorkerValidationId
    || (plan.schedulerWorkerAuditId ?? undefined) !== (validation.schedulerWorkerAuditId ?? undefined)
    || plan.targetWorktreeId !== validation.worktreeId
  ) {
    throw new Error("planning.scheduler.worker.rework-audit-first ReworkPlan lineage mismatch.");
  }
  assertHashesMatch(plan.sourceArtifactHashes, validation.sourceArtifactHashes, "ReworkPlan");
}

function assertTaskRunMatchesReworkValidation(taskRun: TaskRun, validation: SchedulerRuntimeWorkerReworkValidation, options: { requireEvidenceReady: boolean }): void {
  if (taskRun.changeId !== validation.changeId || taskRun.id !== validation.reworkTaskRunId || taskRun.taskId.toUpperCase() !== validation.taskId.toUpperCase() || taskRun.roleId !== "rework-coder") {
    throw new Error("planning.scheduler.worker.rework-audit-first rework TaskRun scope mismatch.");
  }
  if (options.requireEvidenceReady && taskRun.status !== "evidence-ready") {
    throw new Error("planning.scheduler.worker.rework-audit-first requires rework TaskRun evidence-ready status.");
  }
}

function assertLeaseMatchesReworkValidation(lease: WorkerLease, validation: SchedulerRuntimeWorkerReworkValidation): void {
  if (lease.changeId !== validation.changeId || lease.id !== validation.reworkWorkerLeaseId || lease.taskRunId !== validation.reworkTaskRunId || lease.taskId.toUpperCase() !== validation.taskId.toUpperCase() || lease.roleId !== "rework-coder") {
    throw new Error("planning.scheduler.worker.rework-audit-first rework WorkerLease scope mismatch.");
  }
}

function assertCodeRunMatchesReworkValidation(codeRun: RunMetadata, validation: SchedulerRuntimeWorkerReworkValidation): void {
  if (codeRun.changeId !== validation.changeId || codeRun.id !== validation.reworkRunId || codeRun.taskRunId !== validation.reworkTaskRunId || codeRun.runtime !== "coder-codex" || codeRun.status !== "completed") {
    throw new Error("planning.scheduler.worker.rework-audit-first rework code run scope mismatch.");
  }
  if (!codeRun.taskIds?.some((taskId) => taskId.toUpperCase() === validation.taskId.toUpperCase())) {
    throw new Error("planning.scheduler.worker.rework-audit-first rework code run task scope mismatch.");
  }
  if (codeRun.worktree?.worktreeId !== validation.worktreeId) {
    throw new Error("planning.scheduler.worker.rework-audit-first rework code run worktree scope mismatch.");
  }
  const gate = codeRun.executionGate;
  if (!gate?.allowed || gate.mode !== "scheduler-claim-rework") {
    throw new Error("planning.scheduler.worker.rework-audit-first rework code run did not use scheduler-claim-rework gate.");
  }
  if (
    gate.schedulerRunId !== validation.schedulerRunId
    || gate.schedulerClaimReservationId !== validation.schedulerClaimReservationId
    || gate.schedulerWorkerReworkPlanId !== validation.schedulerWorkerReworkPlanId
    || gate.schedulerWorkerValidationId !== validation.schedulerWorkerValidationId
    || (gate.schedulerWorkerAuditId ?? undefined) !== (validation.schedulerWorkerAuditId ?? undefined)
    || gate.reservationIntentId !== validation.reservationIntentId
    || gate.claimIntentId !== validation.claimIntentId
    || gate.nodeId !== validation.nodeId
    || gate.unitId !== validation.unitId
    || gate.taskRunId !== validation.reworkTaskRunId
  ) {
    throw new Error("planning.scheduler.worker.rework-audit-first rework code gate target is stale.");
  }
}

function assertValidationRunMatchesReworkValidation(validationRun: RunMetadata, validation: SchedulerRuntimeWorkerReworkValidation): void {
  if (validationRun.changeId !== validation.changeId || validationRun.id !== validation.validationRunId || validationRun.runtime !== "validator" || validationRun.worktree?.worktreeId !== validation.worktreeId) {
    throw new Error("planning.scheduler.worker.rework-audit-first rework validation run scope mismatch.");
  }
}

function assertValidationResultMatchesReworkValidation(result: ValidationResult, validation: SchedulerRuntimeWorkerReworkValidation): void {
  if (result.changeId !== validation.changeId || result.id !== validation.validationRunId || result.runId !== validation.validationRunId || result.worktreeId !== validation.worktreeId || result.status !== "passed") {
    throw new Error("planning.scheduler.worker.rework-audit-first rework validation result scope mismatch.");
  }
}

function assertWorktreeMatchesReworkValidation(worktree: WorktreeMetadata, validation: SchedulerRuntimeWorkerReworkValidation): void {
  if (worktree.changeId !== validation.changeId || worktree.worktreeId !== validation.worktreeId) {
    throw new Error("planning.scheduler.worker.rework-audit-first worktree scope mismatch.");
  }
}

function assertAuditRunMatchesReworkAudit(auditRun: RunMetadata, audit: SchedulerRuntimeWorkerReworkAudit): void {
  if (auditRun.changeId !== audit.changeId || auditRun.id !== audit.auditRunId || auditRun.runtime !== "auditor") {
    throw new Error("planning.scheduler.worker.rework-audit-first existing audit run scope mismatch.");
  }
}

function assertAuditResultMatchesReworkAudit(result: AuditResult, audit: SchedulerRuntimeWorkerReworkAudit): void {
  if (result.changeId !== audit.changeId || result.id !== audit.auditRunId || result.runId !== audit.auditRunId || result.worktreeId !== audit.worktreeId || result.validationId !== audit.validationRunId || result.status !== audit.auditStatus) {
    throw new Error("planning.scheduler.worker.rework-audit-first existing audit result scope mismatch.");
  }
}

async function readWorkerLeaseForTaskRun(memory: ResolvedMemory, taskRun: TaskRun): Promise<WorkerLease> {
  const leases = await listWorkerLeases(memory, taskRun.changeId);
  const lease = leases.find((item) => item.id === taskRun.leaseId);
  if (!lease) throw new Error(`WorkerLease not found for TaskRun ${taskRun.id}.`);
  return lease;
}

function taskRunForReworkAudit(taskRun: TaskRun, auditStatus: AuditStatus, now: string): TaskRun {
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
    blockedReason: auditStatus === "blocked" ? "Rework audit blocked." : "Rework audit failed.",
    failureReason: undefined,
    finishedAt: now,
    updatedAt: now,
  };
}

function reworkAuditFailureReason(status: AuditStatus): string | undefined {
  if (status === "blocked") return "Rework audit blocked.";
  if (status === "failed") return "Rework audit failed.";
  return undefined;
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.worker.rework-audit-first ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.worker.rework-audit-first ${label} source artifact hash mismatch.`);
  }
}

function buildReworkAuditId(reworkValidationId: string): string {
  return `scheduler-worker-rework-audit-${shortHash(reworkValidationId).slice(0, 12)}`;
}
