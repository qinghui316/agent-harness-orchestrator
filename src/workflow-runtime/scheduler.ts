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
  findSchedulerRuntimeWorkerStartForReservationIntent,
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
import { readSchedulerWorkerPathReadModelsForReservation, schedulerWorkerPathsToLikes } from "../scheduler-runtime/worker-path-read-model.js";
import { readLatestWorkflowGraphPlan } from "../workflow-artifacts/manager.js";
import { resolveSchedulerCurrentTransition, schedulerTransitionMatchesStartRequest } from "../workflow-actions/scheduler-current-transition.js";
import type { ReadySetWorkflowGraphPlan, ResolvedMemory } from "../types/index.js";
import type { SchedulerRun } from "../workflow-scheduler/manager.js";
import type { SchedulerRuntimeClaimReservation, SchedulerRuntimeState } from "../scheduler-runtime/manager.js";

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

export async function runSchedulerWorkerStartFirst(...args: Parameters<typeof startFirstSchedulerCoderWorker>) {
  await assertSchedulerWorkerStartReadySetAllowed("planning.scheduler.worker.start-first", ...args);
  return startFirstSchedulerCoderWorker(...args);
}

export async function runSchedulerWorkerStartNext(...args: Parameters<typeof startNextSchedulerCoderWorker>) {
  await assertSchedulerWorkerStartReadySetAllowed("planning.scheduler.worker.start-next", ...args);
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
  const { transition } = await resolveSchedulerReadySetTransition(memory, changePath, run, runtimeState, reservation, actionType);
  if (transition.actionType !== actionType) {
    throw new Error(`${actionType} is blocked by the current Scheduler ready-set transition.`);
  }
}

async function assertSchedulerWorkerStartReadySetAllowed(
  actionType: "planning.scheduler.worker.start-first" | "planning.scheduler.worker.start-next",
  ...args: Parameters<typeof startFirstSchedulerCoderWorker>
): Promise<void> {
  const [project, input] = args;
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, actionType === "planning.scheduler.worker.start-next" ? "Scheduler next worker start" : "Scheduler first worker start");
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
  if (!input.reservationIntentId) throw new Error(`${actionType} requires reservationIntentId.`);
  if (!input.claimIntentId) throw new Error(`${actionType} requires claimIntentId.`);
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
  if (actionType === "planning.scheduler.worker.start-next" && !scopedStarts.length) {
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
  const { transition } = await resolveSchedulerReadySetTransition(memory, changePath, run, runtimeState, reservation, actionType, {
    integrationCheckHandoffExists: Boolean(integrationCheckHandoff),
    integrationOutcomeExists: Boolean(integrationOutcome),
    runCompletionExists: Boolean(runCompletion),
    runBlockedCloseoutExists: Boolean(blockedCloseout),
  });
  if (!schedulerTransitionMatchesStartRequest({
    transition,
    actionType,
    reservationIntentId: input.reservationIntentId,
    claimIntentId: input.claimIntentId,
  })) {
    throw new Error(`${actionType} must target the current Scheduler ready-set transition.`);
  }
}

async function resolveSchedulerReadySetTransition(
  memory: ResolvedMemory,
  changePath: string,
  run: SchedulerRun,
  runtimeState: SchedulerRuntimeState,
  reservation: SchedulerRuntimeClaimReservation,
  actionType: string,
  existingEvidence: {
    integrationCheckHandoffExists?: boolean;
    integrationOutcomeExists?: boolean;
    runCompletionExists?: boolean;
    runBlockedCloseoutExists?: boolean;
  } = {},
) {
  const graph = await readLatestReadySetGraph(memory, changePath, run, runtimeState, reservation, actionType);
  const workerPaths = schedulerWorkerPathsToLikes(await readSchedulerWorkerPathReadModelsForReservation(memory, changePath, run.id, reservation));
  const candidate = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, run.id);
  const integrationCheckHandoffExists = existingEvidence.integrationCheckHandoffExists
    ?? Boolean(await readLatestSchedulerIntegrationCheckHandoffProjection(memory, changePath, run.id));
  const integrationOutcomeExists = existingEvidence.integrationOutcomeExists
    ?? Boolean(await readLatestSchedulerIntegrationOutcomeProjection(memory, changePath, run.id));
  const runCompletionExists = existingEvidence.runCompletionExists
    ?? Boolean(await readLatestSchedulerRunCompletionProjection(memory, changePath, run.id));
  const runBlockedCloseoutExists = existingEvidence.runBlockedCloseoutExists
    ?? Boolean(await readLatestSchedulerRunBlockedCloseoutProjection(memory, changePath, run.id));
  return {
    graph,
    workerPaths,
    transition: resolveSchedulerCurrentTransition({
      graph,
      reservation,
      workerPaths,
      integrationCandidate: candidate,
      integrationCandidateNeedsRefresh: candidate ? schedulerIntegrationCandidateNeedsRefresh(candidate, workerPaths) : true,
      integrationCheckHandoffExists,
      integrationOutcomeExists,
      runCompletionExists,
      runBlockedCloseoutExists,
    }),
  };
}

async function readLatestReadySetGraph(
  memory: ResolvedMemory,
  changePath: string,
  run: SchedulerRun,
  runtimeState: SchedulerRuntimeState,
  reservation: SchedulerRuntimeClaimReservation,
  actionType: string,
): Promise<ReadySetWorkflowGraphPlan> {
  const graph = await readLatestWorkflowGraphPlan(memory, changePath);
  if (graph.graphMode !== "ready-set-v1") {
    throw new Error(`${actionType} requires latest ready-set WorkflowGraphPlan.`);
  }
  if (graph.status !== "compiled") throw new Error(`${actionType} requires a compiled ready-set WorkflowGraphPlan.`);
  if (graph.changeId !== run.changeId || graph.changeId !== runtimeState.changeId || graph.changeId !== reservation.changeId) {
    throw new Error(`${actionType} ready-set WorkflowGraphPlan change scope mismatch.`);
  }
  if (
    graph.schedulerContractId !== run.schedulerContractId
    || graph.schedulerDispatchDryRunId !== run.schedulerDispatchDryRunId
    || graph.schedulerWorkerPlanId !== run.schedulerWorkerPlanId
    || graph.schedulerClaimReconcilePlanId !== run.schedulerClaimReconcilePlanId
  ) {
    throw new Error(`${actionType} ready-set WorkflowGraphPlan Scheduler lineage mismatch.`);
  }
  if (
    graph.schedulerContractId !== runtimeState.schedulerContractId
    || graph.schedulerWorkerPlanId !== runtimeState.schedulerWorkerPlanId
    || graph.schedulerClaimReconcilePlanId !== runtimeState.schedulerClaimReconcilePlanId
    || graph.schedulerContractId !== reservation.schedulerContractId
    || graph.schedulerWorkerPlanId !== reservation.schedulerWorkerPlanId
    || graph.schedulerClaimReconcilePlanId !== reservation.schedulerClaimReconcilePlanId
  ) {
    throw new Error(`${actionType} ready-set WorkflowGraphPlan runtime lineage mismatch.`);
  }
  assertHashesMatch(graph.sourceArtifactHashes, run.sourceArtifactHashes, actionType, "ready-set WorkflowGraphPlan");
  return graph;
}

function assertHashesMatch(left: Record<string, string>, right: Record<string, string>, actionType: string, label: string): void {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) {
    throw new Error(`${actionType} ${label} source artifact hash mismatch.`);
  }
  for (const [key, value] of leftEntries) {
    if (right[key] !== value) {
      throw new Error(`${actionType} ${label} source artifact hash mismatch.`);
    }
  }
}
