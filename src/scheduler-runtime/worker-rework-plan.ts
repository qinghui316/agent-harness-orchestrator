import { shortHash } from "../fs/path.js";
import { readAuditResult } from "../audit/repository.js";
import { readRun } from "../run/repository.js";
import { listWorkerLeases, readTaskRun } from "../task-run/repository.js";
import type { AuditResult, ManagedProject, RunMetadata, TaskRun, ValidationResult, WorkerLease, WorktreeMetadata } from "../types/index.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import { readValidationResult } from "../validation/repository.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { assertLatestSchedulerRuntimeClaimReservation, readSchedulerRuntimeLineage } from "./guards.js";
import {
  appendSchedulerRuntimeEvent,
  findSchedulerRuntimeWorkerAuditForValidation,
  findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
  readSchedulerRuntimeWorkerAudit,
  readSchedulerRuntimeWorkerResult,
  readSchedulerRuntimeWorkerStart,
  readSchedulerRuntimeWorkerValidation,
  schedulerWorkerReworkPlanArtifactRefs,
  writeSchedulerRuntimeWorkerReworkPlan,
} from "./repository.js";
import type {
  SchedulerRuntimeWorkerAudit,
  SchedulerRuntimeWorkerReworkBlockingSource,
  SchedulerRuntimeWorkerResult,
  SchedulerRuntimeWorkerReworkPlan,
  SchedulerRuntimeWorkerStart,
  SchedulerRuntimeWorkerValidation,
} from "./types.js";
import type { SchedulerArtifactStore } from "./artifact-store.js";
import { resolveSchedulerReadySetExecutionScope, type SchedulerReadySetExecutionPort } from "./execution-port.js";

export interface SchedulerWorkerReworkPlanInput {
  changeId: string;
  schedulerRunId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
}

export interface SchedulerWorkerReworkPlanResult {
  workerStart: SchedulerRuntimeWorkerStart;
  workerResult: SchedulerRuntimeWorkerResult;
  workerValidation: SchedulerRuntimeWorkerValidation;
  workerAudit?: SchedulerRuntimeWorkerAudit;
  taskRun: TaskRun;
  lease: WorkerLease;
  codeRun: RunMetadata;
  validationRun: RunMetadata;
  validationResult: ValidationResult;
  auditRun?: RunMetadata;
  auditResult?: AuditResult;
  worktree: WorktreeMetadata;
  reworkPlan: SchedulerRuntimeWorkerReworkPlan;
  existing: boolean;
  executionStarted: false;
}

export async function compileSchedulerFirstWorkerReworkPlan(project: ManagedProject, input: SchedulerWorkerReworkPlanInput, port: SchedulerReadySetExecutionPort): Promise<SchedulerWorkerReworkPlanResult> {
  const scope = await resolveSchedulerReadySetExecutionScope(project, input.changeId, "Scheduler worker rework plan", port);
  const { artifacts: memory, runtime, changePath } = scope;
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error("planning.scheduler.worker.rework-plan.compile SchedulerRun change scope mismatch.");
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.changeId !== run.changeId || runtimeState.schedulerRunId !== run.id) {
    throw new Error("planning.scheduler.worker.rework-plan.compile SchedulerRuntimeState scope mismatch.");
  }
  const workerValidation = await readSchedulerRuntimeWorkerValidation(memory, changePath, run.id, input.schedulerWorkerValidationId);
  assertWorkerValidationLineage(workerValidation, runtimeState);
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, workerValidation.schedulerClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, "planning.scheduler.worker.rework-plan.compile");
  const workerResult = await readSchedulerRuntimeWorkerResult(memory, changePath, run.id, workerValidation.schedulerWorkerResultId);
  assertWorkerResultMatchesValidation(workerResult, workerValidation);
  const workerStart = await readSchedulerRuntimeWorkerStart(memory, changePath, run.id, workerValidation.schedulerWorkerStartId);
  assertWorkerStartMatchesValidation(workerStart, workerValidation);
  const workerAudit = await resolveBlockingAudit(memory, changePath, run.id, workerValidation, input.schedulerWorkerAuditId);
  const blockingSource = blockingSourceFor(workerValidation, workerAudit);
  const existing = await findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence(memory, changePath, run.id, {
    workerValidationId: workerValidation.id,
    workerAuditId: workerAudit?.id,
  });

  const taskRun = await readTaskRun(runtime, input.changeId, workerValidation.taskRunId);
  assertTaskRunMatchesBlockingEvidence(taskRun, workerValidation, workerAudit);
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

  let auditRun: RunMetadata | undefined;
  let auditResult: AuditResult | undefined;
  if (workerAudit) {
    auditRun = await readRun(runtime, workerAudit.auditRunId);
    auditResult = await readAuditResult(runtime, workerAudit.auditRunId, { changeId: input.changeId });
    assertAuditRunMatchesWorkerAudit(auditRun, workerAudit);
    assertAuditResultMatchesWorkerAudit(auditResult, workerAudit);
  }

  if (existing) {
    return {
      workerStart,
      workerResult,
      workerValidation,
      ...(workerAudit ? { workerAudit } : {}),
      taskRun,
      lease,
      codeRun,
      validationRun,
      validationResult,
      ...(auditRun ? { auditRun } : {}),
      ...(auditResult ? { auditResult } : {}),
      worktree,
      reworkPlan: existing,
      existing: true,
      executionStarted: false,
    };
  }

  const now = new Date().toISOString();
  const reworkPlanId = buildReworkPlanId(workerValidation.id, workerAudit?.id);
  const refs = schedulerWorkerReworkPlanArtifactRefs(memory, changePath, run.id, reworkPlanId);
  const plan: SchedulerRuntimeWorkerReworkPlan = {
    version: "1.0",
    id: reworkPlanId,
    changeId: workerValidation.changeId,
    schedulerRunId: workerValidation.schedulerRunId,
    schedulerMode: workerValidation.schedulerMode,
    status: "planned",
    blockingSource,
    reworkReason: reworkReasonFor(blockingSource, workerValidation, workerAudit),
    schedulerRuntimeStateId: workerValidation.schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: workerValidation.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: workerValidation.schedulerClaimReservationId,
    schedulerWorkerStartId: workerStart.id,
    schedulerWorkerResultId: workerResult.id,
    schedulerWorkerValidationId: workerValidation.id,
    ...(workerAudit ? { schedulerWorkerAuditId: workerAudit.id } : {}),
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
    stageId: `${workerValidation.nodeId}:bounded-rework`,
    stage: "bounded-rework",
    taskId: workerValidation.taskId,
    taskRunId: taskRun.id,
    workerLeaseId: lease.id,
    taskRunStatus: taskRun.status,
    targetWorktreeId: workerValidation.worktreeId,
    targetCodeRunId: workerValidation.codeRunId,
    validationRunId: workerValidation.validationRunId,
    validationStatus: workerValidation.validationStatus,
    ...(workerAudit ? { auditRunId: workerAudit.auditRunId, auditStatus: workerAudit.auditStatus } : {}),
    futureCodeGateMode: "scheduler-claim-rework",
    recoveryKeyInputs: buildRecoveryKeyInputs(workerValidation, workerAudit),
    sourceArtifactHashes: workerValidation.sourceArtifactHashes,
    artifactRefs: [
      refs.artifact,
      refs.markdownArtifact,
      workerStart.artifact,
      workerResult.artifact,
      workerValidation.artifact,
      ...(workerAudit ? [workerAudit.artifact] : []),
      codeRun.artifacts.directory,
      validationRun.artifacts.directory,
      ...(auditRun ? [auditRun.artifacts.directory] : []),
    ],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeWorkerReworkPlan(memory, changePath, plan);
  await appendSchedulerRuntimeEvent(memory, changePath, run, "scheduler-runtime.worker-rework-planned", {
    status: runtimeState.status,
    summary: `Scheduler worker rework plan ${plan.id} compiled from ${blockingSource}.`,
    artifactRefs: plan.artifactRefs,
    payload: {
      schedulerWorkerReworkPlanId: plan.id,
      schedulerWorkerValidationId: workerValidation.id,
      schedulerWorkerAuditId: workerAudit?.id,
      schedulerClaimReservationId: workerValidation.schedulerClaimReservationId,
      reservationIntentId: workerValidation.reservationIntentId,
      claimIntentId: workerValidation.claimIntentId,
      taskRunId: taskRun.id,
      workerLeaseId: lease.id,
      worktreeId: workerValidation.worktreeId,
      blockingSource,
    },
  });
  return {
    workerStart,
    workerResult,
    workerValidation,
    ...(workerAudit ? { workerAudit } : {}),
    taskRun,
    lease,
    codeRun,
    validationRun,
    validationResult,
    ...(auditRun ? { auditRun } : {}),
    ...(auditResult ? { auditResult } : {}),
    worktree,
    reworkPlan: plan,
    existing: false,
    executionStarted: false,
  };
}

async function resolveBlockingAudit(
  memory: SchedulerArtifactStore,
  changePath: string,
  schedulerRunId: string,
  validation: SchedulerRuntimeWorkerValidation,
  requestedAuditId: string | undefined,
): Promise<SchedulerRuntimeWorkerAudit | undefined> {
  const existingAudit = await findSchedulerRuntimeWorkerAuditForValidation(memory, changePath, schedulerRunId, validation.id);
  if (validation.status === "failed") {
    if (requestedAuditId) throw new Error("planning.scheduler.worker.rework-plan.compile validation-failed path must not include schedulerWorkerAuditId.");
    if (existingAudit) throw new Error("planning.scheduler.worker.rework-plan.compile validation-failed path must not have scheduler audit evidence.");
    return undefined;
  }
  if (validation.status !== "passed") throw new Error("planning.scheduler.worker.rework-plan.compile unsupported validation status.");
  if (!requestedAuditId) throw new Error("planning.scheduler.worker.rework-plan.compile passed validation requires schedulerWorkerAuditId.");
  const audit = await readSchedulerRuntimeWorkerAudit(memory, changePath, schedulerRunId, requestedAuditId);
  if (!existingAudit || existingAudit.id !== audit.id) throw new Error("planning.scheduler.worker.rework-plan.compile WorkerAudit target is stale.");
  if (audit.schedulerWorkerValidationId !== validation.id) throw new Error("planning.scheduler.worker.rework-plan.compile WorkerAudit validation scope mismatch.");
  if (!["blocked", "failed"].includes(audit.status)) {
    throw new Error("planning.scheduler.worker.rework-plan.compile requires blocked or failed SchedulerRuntimeWorkerAudit.");
  }
  return audit;
}

function blockingSourceFor(validation: SchedulerRuntimeWorkerValidation, audit: SchedulerRuntimeWorkerAudit | undefined): SchedulerRuntimeWorkerReworkBlockingSource {
  if (validation.status === "failed") return "validation-failed";
  if (audit?.status === "blocked") return "audit-blocked";
  if (audit?.status === "failed") return "audit-failed";
  throw new Error("planning.scheduler.worker.rework-plan.compile cannot resolve blocking source.");
}

function reworkReasonFor(source: SchedulerRuntimeWorkerReworkBlockingSource, validation: SchedulerRuntimeWorkerValidation, audit: SchedulerRuntimeWorkerAudit | undefined): string {
  if (source === "validation-failed") return validation.failureReason ?? "Validation failed.";
  if (source === "audit-blocked") return audit?.failureReason ?? "Audit blocked.";
  return audit?.failureReason ?? "Audit failed.";
}

function assertWorkerValidationLineage(validation: SchedulerRuntimeWorkerValidation, runtimeState: { changeId: string; schedulerRunId: string; id: string; sourceArtifactHashes: Record<string, string> }): void {
  if (validation.changeId !== runtimeState.changeId || validation.schedulerRunId !== runtimeState.schedulerRunId || validation.schedulerRuntimeStateId !== runtimeState.id) {
    throw new Error("planning.scheduler.worker.rework-plan.compile WorkerValidation scope mismatch.");
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
    throw new Error("planning.scheduler.worker.rework-plan.compile WorkerResult scope mismatch.");
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
    throw new Error("planning.scheduler.worker.rework-plan.compile WorkerStart scope mismatch.");
  }
}

function assertTaskRunMatchesBlockingEvidence(taskRun: TaskRun, validation: SchedulerRuntimeWorkerValidation, audit: SchedulerRuntimeWorkerAudit | undefined): void {
  if (taskRun.changeId !== validation.changeId || taskRun.id !== validation.taskRunId || taskRun.taskId.toUpperCase() !== validation.taskId.toUpperCase() || taskRun.roleId !== "coder") {
    throw new Error("planning.scheduler.worker.rework-plan.compile TaskRun scope mismatch.");
  }
  if (taskRun.status !== "blocked") throw new Error("planning.scheduler.worker.rework-plan.compile requires blocked TaskRun.");
  if (audit && audit.taskRunId !== taskRun.id) throw new Error("planning.scheduler.worker.rework-plan.compile WorkerAudit TaskRun scope mismatch.");
}

function assertLeaseMatchesWorkerValidation(lease: WorkerLease, validation: SchedulerRuntimeWorkerValidation): void {
  if (lease.changeId !== validation.changeId || lease.id !== validation.workerLeaseId || lease.taskRunId !== validation.taskRunId || lease.taskId.toUpperCase() !== validation.taskId.toUpperCase() || lease.roleId !== "coder") {
    throw new Error("planning.scheduler.worker.rework-plan.compile WorkerLease scope mismatch.");
  }
}

function assertCodeRunMatchesWorkerValidation(codeRun: RunMetadata, validation: SchedulerRuntimeWorkerValidation): void {
  if (codeRun.changeId !== validation.changeId || codeRun.id !== validation.codeRunId || codeRun.taskRunId !== validation.taskRunId || codeRun.runtime !== "provider-code") {
    throw new Error("planning.scheduler.worker.rework-plan.compile code run scope mismatch.");
  }
  if (!codeRun.taskIds?.some((taskId) => taskId.toUpperCase() === validation.taskId.toUpperCase())) {
    throw new Error("planning.scheduler.worker.rework-plan.compile code run task scope mismatch.");
  }
  if (codeRun.worktree?.worktreeId !== validation.worktreeId) {
    throw new Error("planning.scheduler.worker.rework-plan.compile code run worktree scope mismatch.");
  }
  const gate = codeRun.executionGate;
  if (!gate?.allowed || gate.mode !== "scheduler-claim-reservation") {
    throw new Error("planning.scheduler.worker.rework-plan.compile code run did not use scheduler-claim-reservation gate.");
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
    throw new Error("planning.scheduler.worker.rework-plan.compile code gate target is stale.");
  }
}

function assertValidationRunMatchesWorkerValidation(run: RunMetadata, validation: SchedulerRuntimeWorkerValidation): void {
  if (run.changeId !== validation.changeId || run.id !== validation.validationRunId || run.runtime !== "validator") {
    throw new Error("planning.scheduler.worker.rework-plan.compile validation run scope mismatch.");
  }
}

function assertValidationResultMatchesWorkerValidation(result: ValidationResult, validation: SchedulerRuntimeWorkerValidation): void {
  if (result.changeId !== validation.changeId || result.id !== validation.validationRunId || result.runId !== validation.validationRunId || result.worktreeId !== validation.worktreeId || result.status !== validation.validationStatus) {
    throw new Error("planning.scheduler.worker.rework-plan.compile validation result scope mismatch.");
  }
}

function assertAuditRunMatchesWorkerAudit(run: RunMetadata, audit: SchedulerRuntimeWorkerAudit): void {
  if (run.changeId !== audit.changeId || run.id !== audit.auditRunId || run.runtime !== "auditor") {
    throw new Error("planning.scheduler.worker.rework-plan.compile audit run scope mismatch.");
  }
}

function assertAuditResultMatchesWorkerAudit(result: AuditResult, audit: SchedulerRuntimeWorkerAudit): void {
  if (result.changeId !== audit.changeId || result.id !== audit.auditRunId || result.runId !== audit.auditRunId || result.worktreeId !== audit.worktreeId || result.validationId !== audit.validationRunId || result.status !== audit.auditStatus) {
    throw new Error("planning.scheduler.worker.rework-plan.compile audit result scope mismatch.");
  }
}

function assertWorktreeMatchesWorkerValidation(worktree: WorktreeMetadata, validation: SchedulerRuntimeWorkerValidation): void {
  if (worktree.changeId !== validation.changeId || worktree.worktreeId !== validation.worktreeId) {
    throw new Error("planning.scheduler.worker.rework-plan.compile worktree scope mismatch.");
  }
  if (worktree.runId && worktree.runId !== validation.codeRunId) {
    throw new Error("planning.scheduler.worker.rework-plan.compile worktree run scope mismatch.");
  }
}

async function readWorkerLeaseForTaskRun(memory: ProjectRunsPathPort, taskRun: TaskRun): Promise<WorkerLease> {
  const leases = await listWorkerLeases(memory, taskRun.changeId);
  const lease = leases.find((item) => item.id === taskRun.leaseId);
  if (!lease) throw new Error(`WorkerLease not found for TaskRun ${taskRun.id}.`);
  return lease;
}

function buildRecoveryKeyInputs(validation: SchedulerRuntimeWorkerValidation, audit: SchedulerRuntimeWorkerAudit | undefined): string[] {
  return [
    `change:${validation.changeId}`,
    `scheduler-run:${validation.schedulerRunId}`,
    `claim-reservation:${validation.schedulerClaimReservationId}`,
    `worker-start:${validation.schedulerWorkerStartId}`,
    `worker-result:${validation.schedulerWorkerResultId}`,
    `worker-validation:${validation.id}`,
    ...(audit ? [`worker-audit:${audit.id}`] : []),
    `task:${validation.taskId}`,
    `task-run:${validation.taskRunId}`,
    `worktree:${validation.worktreeId}`,
    `code-run:${validation.codeRunId}`,
    `validation-run:${validation.validationRunId}`,
    ...Object.entries(validation.sourceArtifactHashes).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `source:${key}:${value}`),
  ];
}

function buildReworkPlanId(workerValidationId: string, workerAuditId: string | undefined): string {
  const now = new Date().toISOString();
  return `scheduler-worker-rework-plan-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${workerValidationId}:${workerAuditId ?? "no-audit"}:${now}`).slice(0, 8)}`;
}

function assertHashesMatch(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  const expectedEntries = Object.entries(expected);
  if (Object.keys(actual).length !== expectedEntries.length) throw new Error(`planning.scheduler.worker.rework-plan.compile ${label} source artifact hash mismatch.`);
  for (const [key, value] of expectedEntries) {
    if (actual[key] !== value) throw new Error(`planning.scheduler.worker.rework-plan.compile ${label} source artifact hash mismatch.`);
  }
}
