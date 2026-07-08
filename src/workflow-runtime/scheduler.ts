import { reserveSchedulerRuntimeClaims } from "../scheduler-runtime/claim-reservation.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { assertLatestSchedulerRuntimeClaimReservationForSnapshot, readSchedulerRuntimeLineage } from "../scheduler-runtime/guards.js";
import { initializeSchedulerRuntime } from "../scheduler-runtime/initialize.js";
import { compileSchedulerIntegrationCandidate } from "../scheduler-runtime/integration-candidate.js";
import { runSchedulerIntegrationCheckHandoff } from "../scheduler-runtime/integration-check-handoff.js";
import { reconcileSchedulerIntegrationOutcome } from "../scheduler-runtime/integration-outcome.js";
import { reconcileSchedulerRuntime } from "../scheduler-runtime/reconcile.js";
import {
  findSchedulerRuntimeWorkerAuditForValidation,
  findSchedulerRuntimeWorkerResultForStart,
  findSchedulerRuntimeWorkerReworkAuditForValidation,
  findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence,
  findSchedulerRuntimeWorkerReworkResultForStart,
  findSchedulerRuntimeWorkerReworkStartForPlan,
  findSchedulerRuntimeWorkerReworkValidationForResult,
  findSchedulerRuntimeWorkerStartForReservationIntent,
  findSchedulerRuntimeWorkerValidationForResult,
  listSchedulerRuntimeWorkerStarts,
  readLatestSchedulerIntegrationCandidateProjection,
  readLatestSchedulerIntegrationCheckHandoffProjection,
  readLatestSchedulerIntegrationOutcomeProjection,
  readLatestSchedulerRunBlockedCloseoutProjection,
  readLatestSchedulerRunCompletionProjection,
  readSchedulerReconcileSnapshot,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
} from "../scheduler-runtime/repository.js";
import { closeSchedulerRunBlockedOrExhausted } from "../scheduler-runtime/run-closeout.js";
import { completeSchedulerRunFromIntegrationOutcome } from "../scheduler-runtime/run-completion.js";
import { auditSchedulerFirstWorker } from "../scheduler-runtime/worker-audit.js";
import { validateSchedulerFirstWorker } from "../scheduler-runtime/worker-validation.js";
import { reconcileSchedulerFirstWorkerResult } from "../scheduler-runtime/worker-result.js";
import { auditSchedulerFirstWorkerRework } from "../scheduler-runtime/worker-rework-audit.js";
import { compileSchedulerFirstWorkerReworkPlan } from "../scheduler-runtime/worker-rework-plan.js";
import { reconcileSchedulerFirstWorkerReworkResult } from "../scheduler-runtime/worker-rework-result.js";
import { validateSchedulerFirstWorkerRework } from "../scheduler-runtime/worker-rework-validation.js";
import { startFirstSchedulerWorkerRework } from "../scheduler-runtime/worker-rework.js";
import { startFirstSchedulerCoderWorker, startNextSchedulerCoderWorker } from "../scheduler-runtime/worker-start.js";
import { schedulerIntegrationCandidateNeedsRefresh } from "../scheduler-runtime/worker-path.js";
import { resolveSchedulerCurrentTransition, schedulerTransitionMatchesStartNextRequest, type SchedulerCurrentTransitionWorkerPath } from "../workflow-actions/scheduler-current-transition.js";

export type { SchedulerIntegrationCandidateResult } from "../scheduler-runtime/integration-candidate.js";
export type { SchedulerIntegrationCheckHandoffResult } from "../scheduler-runtime/integration-check-handoff.js";
export type { SchedulerIntegrationOutcomeResult } from "../scheduler-runtime/integration-outcome.js";
export type { SchedulerRunBlockedCloseoutResult } from "../scheduler-runtime/run-closeout.js";
export type { SchedulerRunCompletionResult } from "../scheduler-runtime/run-completion.js";
export type { SchedulerWorkerAuditResult } from "../scheduler-runtime/worker-audit.js";
export type { SchedulerWorkerResultReconcileResult } from "../scheduler-runtime/worker-result.js";
export type { SchedulerWorkerReworkAuditResult } from "../scheduler-runtime/worker-rework-audit.js";
export type { SchedulerWorkerReworkPlanResult } from "../scheduler-runtime/worker-rework-plan.js";
export type { SchedulerWorkerReworkResultReconcileResult } from "../scheduler-runtime/worker-rework-result.js";
export type { SchedulerWorkerReworkValidationResult } from "../scheduler-runtime/worker-rework-validation.js";
export type { SchedulerFirstWorkerReworkStartResult } from "../scheduler-runtime/worker-rework.js";
export type { SchedulerWorkerValidationResult } from "../scheduler-runtime/worker-validation.js";

export function runSchedulerRuntimeInitialize(...args: Parameters<typeof initializeSchedulerRuntime>) {
  return initializeSchedulerRuntime(...args);
}

export function runSchedulerRuntimeReconcile(...args: Parameters<typeof reconcileSchedulerRuntime>) {
  return reconcileSchedulerRuntime(...args);
}

export function runSchedulerRuntimeReserveClaims(...args: Parameters<typeof reserveSchedulerRuntimeClaims>) {
  return reserveSchedulerRuntimeClaims(...args);
}

export function runSchedulerWorkerStartFirst(...args: Parameters<typeof startFirstSchedulerCoderWorker>) {
  return startFirstSchedulerCoderWorker(...args);
}

export async function runSchedulerWorkerStartNext(...args: Parameters<typeof startNextSchedulerCoderWorker>) {
  await assertSchedulerStartNextReadySetAllowed(...args);
  return startNextSchedulerCoderWorker(...args);
}

export function runSchedulerWorkerResultReconcile(...args: Parameters<typeof reconcileSchedulerFirstWorkerResult>) {
  return reconcileSchedulerFirstWorkerResult(...args);
}

export function runSchedulerWorkerValidation(...args: Parameters<typeof validateSchedulerFirstWorker>) {
  return validateSchedulerFirstWorker(...args);
}

export function runSchedulerWorkerAudit(...args: Parameters<typeof auditSchedulerFirstWorker>) {
  return auditSchedulerFirstWorker(...args);
}

export function runSchedulerWorkerReworkPlanCompile(...args: Parameters<typeof compileSchedulerFirstWorkerReworkPlan>) {
  return compileSchedulerFirstWorkerReworkPlan(...args);
}

export function runSchedulerWorkerReworkStart(...args: Parameters<typeof startFirstSchedulerWorkerRework>) {
  return startFirstSchedulerWorkerRework(...args);
}

export function runSchedulerWorkerReworkResultReconcile(...args: Parameters<typeof reconcileSchedulerFirstWorkerReworkResult>) {
  return reconcileSchedulerFirstWorkerReworkResult(...args);
}

export function runSchedulerWorkerReworkValidation(...args: Parameters<typeof validateSchedulerFirstWorkerRework>) {
  return validateSchedulerFirstWorkerRework(...args);
}

export function runSchedulerWorkerReworkAudit(...args: Parameters<typeof auditSchedulerFirstWorkerRework>) {
  return auditSchedulerFirstWorkerRework(...args);
}

export async function runSchedulerIntegrationCandidateCompile(...args: Parameters<typeof compileSchedulerIntegrationCandidate>) {
  await assertSchedulerCurrentTransitionActionAllowed(...args, "planning.scheduler.integration-candidate.compile");
  return compileSchedulerIntegrationCandidate(...args);
}

export async function runSchedulerIntegrationCheck(...args: Parameters<typeof runSchedulerIntegrationCheckHandoff>) {
  await assertSchedulerCurrentTransitionActionAllowed(...args, "planning.scheduler.integration-check.run");
  return runSchedulerIntegrationCheckHandoff(...args);
}

export function runSchedulerIntegrationOutcomeReconcile(...args: Parameters<typeof reconcileSchedulerIntegrationOutcome>) {
  return reconcileSchedulerIntegrationOutcome(...args);
}

export function runSchedulerRunComplete(...args: Parameters<typeof completeSchedulerRunFromIntegrationOutcome>) {
  return completeSchedulerRunFromIntegrationOutcome(...args);
}

export async function runSchedulerRunCloseBlocked(...args: Parameters<typeof closeSchedulerRunBlockedOrExhausted>) {
  await assertSchedulerCurrentTransitionActionAllowed(...args, "planning.scheduler.run.close-blocked");
  return closeSchedulerRunBlockedOrExhausted(...args);
}

async function assertSchedulerCurrentTransitionActionAllowed(
  project: Parameters<typeof compileSchedulerIntegrationCandidate>[0],
  input: { changeId: string; schedulerRunId: string },
  actionType:
    | "planning.scheduler.integration-candidate.compile"
    | "planning.scheduler.integration-check.run"
    | "planning.scheduler.run.close-blocked",
): Promise<void> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`${actionType} cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error(`${actionType} SchedulerRun change scope mismatch.`);
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.schedulerRunId !== run.id || runtimeState.changeId !== input.changeId) {
    throw new Error(`${actionType} SchedulerRuntimeState scope mismatch.`);
  }
  if (!runtimeState.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
    throw new Error(`${actionType} requires latest reconcile snapshot and claim reservation.`);
  }
  const snapshot = await readSchedulerReconcileSnapshot(memory, changePath, run.id, runtimeState.lastReconcileSnapshotId);
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, runtimeState.lastClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservationForSnapshot(reservation, runtimeState, snapshot, actionType, { requiredStatus: "reserved" });
  const workerPaths = await readSchedulerWorkerPathLikes(memory, changePath, run.id, reservation);
  const candidate = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, run.id);
  const transition = resolveSchedulerCurrentTransition({
    reservation,
    workerPaths,
    integrationCandidate: candidate,
    integrationCandidateNeedsRefresh: candidate ? schedulerIntegrationCandidateNeedsRefresh(candidate, workerPaths) : true,
    integrationCheckHandoffExists: Boolean(await readLatestSchedulerIntegrationCheckHandoffProjection(memory, changePath, run.id)),
    integrationOutcomeExists: Boolean(await readLatestSchedulerIntegrationOutcomeProjection(memory, changePath, run.id)),
    runCompletionExists: Boolean(await readLatestSchedulerRunCompletionProjection(memory, changePath, run.id)),
    runBlockedCloseoutExists: Boolean(await readLatestSchedulerRunBlockedCloseoutProjection(memory, changePath, run.id)),
  });
  if (transition.actionType !== actionType) {
    throw new Error(`${actionType} is blocked by the current Scheduler ready-set transition.`);
  }
}

async function assertSchedulerStartNextReadySetAllowed(...args: Parameters<typeof startNextSchedulerCoderWorker>): Promise<void> {
  const [project, input] = args;
  const actionType = "planning.scheduler.worker.start-next";
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Scheduler next worker start");
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`${actionType} cannot resolve active Change path for ${input.changeId}.`);
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, input.schedulerRunId);
  if (run.changeId !== input.changeId) throw new Error(`${actionType} SchedulerRun change scope mismatch.`);
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (runtimeState.schedulerRunId !== run.id || runtimeState.changeId !== input.changeId) {
    throw new Error(`${actionType} SchedulerRuntimeState scope mismatch.`);
  }
  if (!runtimeState.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
    throw new Error(`${actionType} requires latest reconcile snapshot and claim reservation.`);
  }
  const snapshot = await readSchedulerReconcileSnapshot(memory, changePath, run.id, runtimeState.lastReconcileSnapshotId);
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, input.schedulerClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservationForSnapshot(reservation, runtimeState, snapshot, actionType, { requiredStatus: "reserved" });
  const selectedIntent = reservation.reservationIntents.find((intent) => intent.reservationIntentId === input.reservationIntentId);
  if (!selectedIntent || selectedIntent.status !== "reserved") {
    throw new Error(`${actionType} requires a runnable reservation intent.`);
  }
  if (selectedIntent.claimIntentId !== input.claimIntentId) {
    throw new Error(`${actionType} claimIntentId target is stale.`);
  }
  const existing = await findSchedulerRuntimeWorkerStartForReservationIntent(memory, changePath, run.id, selectedIntent.reservationIntentId);
  if (existing) throw new Error(`${actionType} reservation intent already started.`);
  const starts = await listSchedulerRuntimeWorkerStarts(memory, changePath, run.id);
  const scopedStarts = starts.filter((start) => start.schedulerClaimReservationId === reservation.id);
  if (!scopedStarts.length) {
    throw new Error(`${actionType} requires an existing scheduler worker start.`);
  }
  const integrationCheckHandoff = await readLatestSchedulerIntegrationCheckHandoffProjection(memory, changePath, run.id);
  if (integrationCheckHandoff) {
    throw new Error(`${actionType} is blocked after SchedulerIntegrationCheck handoff exists.`);
  }
  const integrationOutcome = await readLatestSchedulerIntegrationOutcomeProjection(memory, changePath, run.id);
  if (integrationOutcome) {
    throw new Error(`${actionType} is blocked after SchedulerIntegrationOutcome exists.`);
  }
  const runCompletion = await readLatestSchedulerRunCompletionProjection(memory, changePath, run.id);
  if (runCompletion) {
    throw new Error(`${actionType} is blocked after SchedulerRunCompletion exists.`);
  }
  const blockedCloseout = await readLatestSchedulerRunBlockedCloseoutProjection(memory, changePath, run.id);
  if (blockedCloseout) {
    throw new Error(`${actionType} is blocked after SchedulerRunBlockedCloseout exists.`);
  }
  const workerPaths = await readSchedulerWorkerPathLikes(memory, changePath, run.id, reservation);
  const transition = resolveSchedulerCurrentTransition({
    reservation,
    workerPaths,
    integrationCheckHandoffExists: Boolean(integrationCheckHandoff),
    integrationOutcomeExists: Boolean(integrationOutcome),
    runCompletionExists: Boolean(runCompletion),
    runBlockedCloseoutExists: Boolean(blockedCloseout),
  });
  if (!schedulerTransitionMatchesStartNextRequest({
    transition,
    reservationIntentId: input.reservationIntentId,
    claimIntentId: input.claimIntentId,
  })) {
    throw new Error(`${actionType} must target the current Scheduler ready-set transition.`);
  }
}

async function readSchedulerWorkerPathLikes(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  changePath: string,
  schedulerRunId: string,
  reservation: { id?: string; reservationIntents: Array<{ reservationIntentId: string; claimIntentId: string; status: string; waveIndex: number }> },
): Promise<SchedulerCurrentTransitionWorkerPath[]> {
  const starts = await listSchedulerRuntimeWorkerStarts(memory, changePath, schedulerRunId);
  const reservationIntentIds = new Set(reservation.reservationIntents.map((intent) => intent.reservationIntentId));
  const scopedStarts = starts.filter((start) =>
    reservationIntentIds.has(start.reservationIntentId)
    && (!reservation.id || start.schedulerClaimReservationId === reservation.id)
  );
  return Promise.all(scopedStarts.map(async (start): Promise<SchedulerCurrentTransitionWorkerPath> => {
    const base: SchedulerCurrentTransitionWorkerPath = { start: { reservationIntentId: start.reservationIntentId, updatedAt: start.updatedAt }, terminal: false };
    if (start.status === "failed") return { ...base, terminal: true };
    const result = await findSchedulerRuntimeWorkerResultForStart(memory, changePath, schedulerRunId, start.id);
    if (!result) return base;
    if (result.status === "failed") return { ...base, terminal: true };
    const validation = await findSchedulerRuntimeWorkerValidationForResult(memory, changePath, schedulerRunId, result.id);
    if (!validation) return base;
    if (validation.status === "passed") {
      const audit = await findSchedulerRuntimeWorkerAuditForValidation(memory, changePath, schedulerRunId, validation.id);
      if (!audit) return base;
      const withAudit = { ...base, audit: { status: audit.status, claimIntentId: audit.claimIntentId } };
      if (audit.status === "approved" || audit.status === "approved-with-notes") return { ...withAudit, terminal: true };
      const reworkPlan = await findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence(memory, changePath, schedulerRunId, {
        workerValidationId: validation.id,
        workerAuditId: audit.id,
      });
      if (!reworkPlan) return withAudit;
      return readSchedulerReworkPathLike(memory, changePath, schedulerRunId, withAudit, reworkPlan.id);
    }
    const reworkPlan = await findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence(memory, changePath, schedulerRunId, {
      workerValidationId: validation.id,
    });
    if (!reworkPlan) return base;
    return readSchedulerReworkPathLike(memory, changePath, schedulerRunId, base, reworkPlan.id);
  }));
}

async function readSchedulerReworkPathLike(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  changePath: string,
  schedulerRunId: string,
  base: SchedulerCurrentTransitionWorkerPath,
  reworkPlanId: string,
): Promise<SchedulerCurrentTransitionWorkerPath> {
  const reworkStart = await findSchedulerRuntimeWorkerReworkStartForPlan(memory, changePath, schedulerRunId, reworkPlanId);
  if (!reworkStart) return base;
  if (reworkStart.status === "failed") return { ...base, terminal: true };
  const reworkResult = await findSchedulerRuntimeWorkerReworkResultForStart(memory, changePath, schedulerRunId, reworkStart.id);
  if (!reworkResult) return base;
  if (reworkResult.status === "failed") return { ...base, terminal: true };
  const reworkValidation = await findSchedulerRuntimeWorkerReworkValidationForResult(memory, changePath, schedulerRunId, reworkResult.id);
  if (!reworkValidation) return base;
  if (reworkValidation.status !== "passed") return { ...base, terminal: true };
  const reworkAudit = await findSchedulerRuntimeWorkerReworkAuditForValidation(memory, changePath, schedulerRunId, reworkValidation.id);
  if (!reworkAudit) return base;
  return { ...base, reworkAudit: { status: reworkAudit.status, claimIntentId: reworkAudit.claimIntentId }, terminal: true };
}
