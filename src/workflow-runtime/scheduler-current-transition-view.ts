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
import { schedulerIntegrationCandidateNeedsRefresh } from "../scheduler-runtime/worker-path.js";
import { readSchedulerWorkerPathReadModelsForReservation, schedulerWorkerPathsToLikes } from "../scheduler-runtime/worker-path-read-model.js";
import { readLatestWorkflowGraphPlan } from "../workflow-artifacts/manager.js";
import { resolveSchedulerCurrentTransition, type SchedulerCurrentTransition, type SchedulerCurrentTransitionWorkerPath } from "../workflow-actions/scheduler-current-transition.js";
import type { ReadySetWorkflowGraphPlan, ResolvedMemory } from "../types/index.js";
import type { SchedulerRun } from "../workflow-scheduler/manager.js";
import type { SchedulerIntegrationCandidate, SchedulerRuntimeClaimReservation, SchedulerRuntimeState } from "../scheduler-runtime/manager.js";

export type SchedulerCurrentTransitionActionType =
  | "planning.scheduler.worker.start-first"
  | "planning.scheduler.worker.start-next"
  | "planning.scheduler.integration-candidate.compile"
  | "planning.scheduler.integration-check.run"
  | "planning.scheduler.run.complete"
  | "planning.scheduler.run.close-blocked";

export interface SchedulerCurrentTransitionExistingEvidence {
  integrationCheckHandoffExists?: boolean;
  integrationOutcomeExists?: boolean;
  runCompletionExists?: boolean;
  runBlockedCloseoutExists?: boolean;
}

export interface SchedulerCurrentTransitionView {
  graph: ReadySetWorkflowGraphPlan;
  workerPaths: SchedulerCurrentTransitionWorkerPath[];
  integrationCandidate: SchedulerIntegrationCandidate | null;
  integrationCandidateNeedsRefresh: boolean;
  integrationCheckHandoffExists: boolean;
  integrationOutcomeExists: boolean;
  runCompletionExists: boolean;
  runBlockedCloseoutExists: boolean;
  transition: SchedulerCurrentTransition;
}

export async function readLatestSchedulerCurrentTransitionView(
  memory: ResolvedMemory,
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
  return readSchedulerCurrentTransitionView(memory, changePath, run, runtimeState, reservation, actionType, existingEvidence);
}

export async function readSchedulerCurrentTransitionView(
  memory: ResolvedMemory,
  changePath: string,
  run: SchedulerRun,
  runtimeState: SchedulerRuntimeState,
  reservation: SchedulerRuntimeClaimReservation,
  actionType: string,
  existingEvidence: SchedulerCurrentTransitionExistingEvidence = {},
): Promise<SchedulerCurrentTransitionView> {
  const graph = await readLatestReadySetGraph(memory, changePath, run, runtimeState, reservation, actionType);
  const workerPaths = schedulerWorkerPathsToLikes(await readSchedulerWorkerPathReadModelsForReservation(memory, changePath, run.id, reservation));
  const integrationCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, run.id);
  const integrationCandidateNeedsRefresh = integrationCandidate
    ? schedulerIntegrationCandidateNeedsRefresh(integrationCandidate, workerPaths)
    : true;
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
    integrationCandidate,
    integrationCandidateNeedsRefresh,
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
      integrationCheckHandoffExists,
      integrationOutcomeExists,
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
