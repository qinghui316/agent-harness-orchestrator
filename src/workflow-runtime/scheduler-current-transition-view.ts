import { assertLatestSchedulerRuntimeClaimReservationForSnapshot, readSchedulerRuntimeLineage } from "../scheduler-runtime/guards.js";
import {
  readLatestSchedulerIntegrationCandidateProjection,
  readLatestSchedulerIntegrationCheckHandoffProjection,
  readLatestSchedulerIntegrationOutcomeProjection,
  readLatestSchedulerRunBlockedCloseoutProjection,
  readLatestSchedulerRunCompletionProjection,
  readSchedulerReconcileSnapshot,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
} from "../scheduler-runtime/repository.js";
import { readIntegrationCheck } from "../integration-check/repository.js";
import type { IntegrationCheckRecord } from "../integration-check/types.js";
import { schedulerIntegrationCandidateNeedsRefresh } from "../scheduler-runtime/worker-path.js";
import { readSchedulerWorkerPathReadModelsForReservation, type SchedulerWorkerPathReadModel } from "../scheduler-runtime/worker-path-read-model.js";
import { resolveSchedulerCurrentTransition, schedulerCurrentTransitionWorkerTargetKey, type SchedulerCurrentTransition } from "../workflow-actions/scheduler-current-transition.js";
import type { ReadySetWorkflowGraphPlan } from "../types/index.js";
import type { ProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import type { SchedulerArtifactStore } from "../scheduler-runtime/artifact-store.js";
import type { SchedulerRun } from "../workflow-scheduler/manager.js";
import { readSchedulerRunJournal } from "../workflow-scheduler/repository.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCheckHandoff,
  SchedulerIntegrationOutcome,
  SchedulerReconcileSnapshot,
  SchedulerRunBlockedCloseout,
  SchedulerRunCompletion,
  SchedulerRuntimeClaimReservation,
  SchedulerRuntimeState,
} from "../scheduler-runtime/manager.js";

export type SchedulerCurrentTransitionActionType =
  | "planning.scheduler.worker.start-first"
  | "planning.scheduler.worker.start-next"
  | "planning.scheduler.worker.reconcile-result"
  | "planning.scheduler.worker.validate-first"
  | "planning.scheduler.worker.audit-first"
  | "planning.scheduler.worker.rework-plan.compile"
  | "planning.scheduler.worker.rework-start-first"
  | "planning.scheduler.worker.rework-reconcile-result"
  | "planning.scheduler.worker.rework-validate-first"
  | "planning.scheduler.worker.rework-audit-first"
  | "planning.scheduler.integration-candidate.compile"
  | "planning.scheduler.integration-check.run"
  | "planning.scheduler.integration-outcome.reconcile"
  | "planning.scheduler.run.complete"
  | "planning.scheduler.run.close-blocked";

export interface SchedulerCurrentTransitionExistingEvidence {
  integrationCheckHandoffExists?: boolean;
  integrationOutcomeExists?: boolean;
  runCompletionExists?: boolean;
  runBlockedCloseoutExists?: boolean;
}

export interface SchedulerCurrentTransitionView {
  run: SchedulerRun;
  runJournalEventCount: number;
  runtimeState: SchedulerRuntimeState;
  reconcileSnapshot: SchedulerReconcileSnapshot;
  reservation: SchedulerRuntimeClaimReservation;
  graph: ReadySetWorkflowGraphPlan;
  workerPaths: SchedulerWorkerPathReadModel[];
  integrationCandidate: SchedulerIntegrationCandidate | null;
  integrationCandidateNeedsRefresh: boolean;
  integrationCheckHandoff: SchedulerIntegrationCheckHandoff | null;
  currentIntegrationCheck: IntegrationCheckRecord | null;
  integrationOutcome: SchedulerIntegrationOutcome | null;
  runCompletion: SchedulerRunCompletion | null;
  runBlockedCloseout: SchedulerRunBlockedCloseout | null;
  integrationCheckHandoffExists: boolean;
  integrationOutcomeExists: boolean;
  runCompletionExists: boolean;
  runBlockedCloseoutExists: boolean;
  transition: SchedulerCurrentTransition;
}

export async function readLatestSchedulerCurrentTransitionView(
  memory: SchedulerArtifactStore,
  runtime: ProjectExecutionRuntimePort,
  graph: ReadySetWorkflowGraphPlan,
  changePath: string,
  schedulerRunId: string,
  actionType: string,
  existingEvidence: SchedulerCurrentTransitionExistingEvidence = {},
): Promise<SchedulerCurrentTransitionView> {
  const { run } = await readSchedulerRuntimeLineage(memory, changePath, schedulerRunId);
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, run.id);
  if (!runtimeState.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
    throw new Error(`${actionType} requires latest reconcile snapshot and claim reservation.`);
  }
  const snapshot = await readSchedulerReconcileSnapshot(memory, changePath, run.id, runtimeState.lastReconcileSnapshotId);
  const reservation = await readSchedulerRuntimeClaimReservation(memory, changePath, run.id, runtimeState.lastClaimReservationId);
  assertLatestSchedulerRuntimeClaimReservationForSnapshot(reservation, runtimeState, snapshot, actionType, { requiredStatus: "reserved" });
  return readSchedulerCurrentTransitionView(
    memory,
    runtime,
    graph,
    changePath,
    run,
    runtimeState,
    snapshot,
    reservation,
    actionType,
    existingEvidence,
  );
}

export async function readSchedulerCurrentTransitionView(
  memory: SchedulerArtifactStore,
  runtime: ProjectExecutionRuntimePort,
  graph: ReadySetWorkflowGraphPlan,
  changePath: string,
  run: SchedulerRun,
  runtimeState: SchedulerRuntimeState,
  reconcileSnapshot: SchedulerReconcileSnapshot,
  reservation: SchedulerRuntimeClaimReservation,
  actionType: string,
  existingEvidence: SchedulerCurrentTransitionExistingEvidence = {},
): Promise<SchedulerCurrentTransitionView> {
  assertLatestReadySetGraph(graph, run, runtimeState, reservation, actionType);
  const runJournalEventCount = (await readSchedulerRunJournal(memory, changePath, run.id)).length;
  const workerPaths = await readSchedulerWorkerPathReadModelsForReservation(memory, changePath, run.id, reservation);
  const integrationCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, run.id);
  const integrationCandidateNeedsRefresh = integrationCandidate
    ? schedulerIntegrationCandidateNeedsRefresh(integrationCandidate, workerPaths.map((path) => ({
      start: path.start,
      terminal: path.terminal,
      ...(path.audit ? { audit: path.audit } : {}),
      ...(path.reworkAudit ? { reworkAudit: path.reworkAudit } : {}),
    })))
    : true;
  const integrationCheckHandoff = await readLatestSchedulerIntegrationCheckHandoffProjection(memory, changePath, run.id);
  const currentIntegrationCheck = integrationCheckHandoff
    ? await readIntegrationCheck(runtime, integrationCheckHandoff.integrationCheckId).catch(() => null)
    : null;
  const integrationCheckHandoffExists = existingEvidence.integrationCheckHandoffExists ?? Boolean(integrationCheckHandoff);
  const integrationOutcome = await readLatestSchedulerIntegrationOutcomeProjection(memory, changePath, run.id);
  const integrationOutcomeExists = existingEvidence.integrationOutcomeExists ?? Boolean(integrationOutcome);
  const runCompletion = await readLatestSchedulerRunCompletionProjection(memory, changePath, run.id);
  const runCompletionExists = existingEvidence.runCompletionExists ?? Boolean(runCompletion);
  const runBlockedCloseout = await readLatestSchedulerRunBlockedCloseoutProjection(memory, changePath, run.id);
  const runBlockedCloseoutExists = existingEvidence.runBlockedCloseoutExists ?? Boolean(runBlockedCloseout);

  return {
    run,
    runJournalEventCount,
    runtimeState,
    reconcileSnapshot,
    reservation,
    graph,
    workerPaths,
    integrationCandidate,
    integrationCandidateNeedsRefresh,
    integrationCheckHandoff,
    currentIntegrationCheck,
    integrationOutcome,
    runCompletion,
    runBlockedCloseout,
    integrationCheckHandoffExists,
    integrationOutcomeExists,
    runCompletionExists,
    runBlockedCloseoutExists,
    transition: resolveSchedulerCurrentTransition({
      graph,
      reservation,
      workerPaths,
      integrationCandidate,
      integrationCandidateNeedsRefresh,
      integrationCheckHandoff: integrationCheckHandoff ? {
        id: integrationCheckHandoff.id,
        integrationCheckStatus: integrationCheckHandoff.integrationCheckStatus,
        currentIntegrationCheckStatus: currentIntegrationCheck?.status,
      } : null,
      integrationCheckHandoffExists,
      integrationOutcomeExists,
      integrationOutcomeId: integrationOutcome?.id,
      runCompletionExists,
      runBlockedCloseoutExists,
    }),
  };
}

export function assertSchedulerCurrentTransitionAction(
  view: SchedulerCurrentTransitionView,
  actionType: SchedulerCurrentTransitionActionType,
): void {
  if (view.transition.actionType !== actionType) {
    throw new Error(`${actionType} is blocked by the current Scheduler ready-set transition.`);
  }
}

export function assertSchedulerCurrentTransitionRequest(
  view: SchedulerCurrentTransitionView,
  actionType: SchedulerCurrentTransitionActionType,
  input: Record<string, unknown>,
): void {
  assertSchedulerCurrentTransitionAction(view, actionType);
  const transition = view.transition;
  if (transition.kind === "worker-step") {
    const targetKey = schedulerCurrentTransitionWorkerTargetKey(transition.actionType);
    if (input[targetKey] !== transition.worker[targetKey]) {
      throw new Error(`${actionType} must target the current Scheduler worker transition.`);
    }
  }
  if (transition.kind === "integration-check" && transition.schedulerIntegrationCandidateId
    && input.schedulerIntegrationCandidateId !== transition.schedulerIntegrationCandidateId) {
    throw new Error(`${actionType} must target the current Scheduler integration candidate.`);
  }
  if (transition.kind === "integration-outcome" && transition.schedulerIntegrationCheckHandoffId
    && input.schedulerIntegrationCheckHandoffId !== transition.schedulerIntegrationCheckHandoffId) {
    throw new Error(`${actionType} must target the current Scheduler integration handoff.`);
  }
  if (transition.kind === "run-complete" && transition.schedulerIntegrationOutcomeId
    && input.schedulerIntegrationOutcomeId !== transition.schedulerIntegrationOutcomeId) {
    throw new Error(`${actionType} must target the current Scheduler integration outcome.`);
  }
  if (transition.kind === "close-blocked" && transition.schedulerIntegrationCandidateId
    && input.schedulerIntegrationCandidateId !== transition.schedulerIntegrationCandidateId) {
    throw new Error(`${actionType} must target the current Scheduler integration candidate.`);
  }
}

function assertLatestReadySetGraph(
  graph: ReadySetWorkflowGraphPlan,
  run: SchedulerRun,
  runtimeState: SchedulerRuntimeState,
  reservation: SchedulerRuntimeClaimReservation,
  actionType: string,
): void {
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
