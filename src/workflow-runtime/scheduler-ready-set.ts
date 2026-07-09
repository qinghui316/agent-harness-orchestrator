import { resolveRunnableChangeTarget } from "../change/target.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import {
  compileSchedulerIntegrationCandidate,
  type SchedulerIntegrationCandidateInput,
  type SchedulerIntegrationCandidateResult,
} from "../scheduler-runtime/integration-candidate.js";
import {
  runSchedulerIntegrationCheckHandoff,
  type SchedulerIntegrationCheckHandoffInput,
  type SchedulerIntegrationCheckHandoffResult,
} from "../scheduler-runtime/integration-check-handoff.js";
import {
  closeSchedulerRunBlockedOrExhausted,
  type SchedulerRunBlockedCloseoutInput,
  type SchedulerRunBlockedCloseoutResult,
} from "../scheduler-runtime/run-closeout.js";
import {
  completeSchedulerRunFromIntegrationOutcome,
  type SchedulerRunCompletionInput,
  type SchedulerRunCompletionResult,
} from "../scheduler-runtime/run-completion.js";
import type { SchedulerRuntimeClaimReservationIntent } from "../scheduler-runtime/types.js";
import {
  startSchedulerCoderWorkerForReadySetTarget,
  type SchedulerFirstWorkerStartInput,
  type SchedulerFirstWorkerStartResult,
  type SchedulerNextWorkerStartInput,
  type SchedulerWorkerStartExactTarget,
} from "../scheduler-runtime/worker-start.js";
import type { ManagedProject, ReadySetWorkflowGraphNode, ReadySetWorkflowGraphStageRef } from "../types/index.js";
import { schedulerTransitionMatchesStartRequest } from "../workflow-actions/scheduler-current-transition.js";
import {
  assertSchedulerCurrentTransitionAction,
  readLatestSchedulerCurrentTransitionView,
  type SchedulerCurrentTransitionActionType,
  type SchedulerCurrentTransitionView,
} from "./scheduler-current-transition-view.js";

export type SchedulerReadySetWorkerStartAction =
  | "planning.scheduler.worker.start-first"
  | "planning.scheduler.worker.start-next";

export type SchedulerReadySetCurrentStep =
  | { actionType: "planning.scheduler.worker.start-first"; input: SchedulerFirstWorkerStartInput }
  | { actionType: "planning.scheduler.worker.start-next"; input: SchedulerNextWorkerStartInput }
  | { actionType: "planning.scheduler.integration-candidate.compile"; input: SchedulerIntegrationCandidateInput }
  | { actionType: "planning.scheduler.integration-check.run"; input: SchedulerIntegrationCheckHandoffInput }
  | { actionType: "planning.scheduler.run.complete"; input: SchedulerRunCompletionInput }
  | { actionType: "planning.scheduler.run.close-blocked"; input: SchedulerRunBlockedCloseoutInput };

export type SchedulerReadySetCurrentStepResult =
  | SchedulerFirstWorkerStartResult
  | SchedulerIntegrationCandidateResult
  | SchedulerIntegrationCheckHandoffResult
  | SchedulerRunCompletionResult
  | SchedulerRunBlockedCloseoutResult;

export function runSchedulerReadySetCurrentStep(
  project: ManagedProject,
  step: { actionType: "planning.scheduler.worker.start-first"; input: SchedulerFirstWorkerStartInput },
): Promise<SchedulerFirstWorkerStartResult>;
export function runSchedulerReadySetCurrentStep(
  project: ManagedProject,
  step: { actionType: "planning.scheduler.worker.start-next"; input: SchedulerNextWorkerStartInput },
): Promise<SchedulerFirstWorkerStartResult>;
export function runSchedulerReadySetCurrentStep(
  project: ManagedProject,
  step: { actionType: "planning.scheduler.integration-candidate.compile"; input: SchedulerIntegrationCandidateInput },
): Promise<SchedulerIntegrationCandidateResult>;
export function runSchedulerReadySetCurrentStep(
  project: ManagedProject,
  step: { actionType: "planning.scheduler.integration-check.run"; input: SchedulerIntegrationCheckHandoffInput },
): Promise<SchedulerIntegrationCheckHandoffResult>;
export function runSchedulerReadySetCurrentStep(
  project: ManagedProject,
  step: { actionType: "planning.scheduler.run.complete"; input: SchedulerRunCompletionInput },
): Promise<SchedulerRunCompletionResult>;
export function runSchedulerReadySetCurrentStep(
  project: ManagedProject,
  step: { actionType: "planning.scheduler.run.close-blocked"; input: SchedulerRunBlockedCloseoutInput },
): Promise<SchedulerRunBlockedCloseoutResult>;
export async function runSchedulerReadySetCurrentStep(
  project: ManagedProject,
  step: SchedulerReadySetCurrentStep,
): Promise<SchedulerReadySetCurrentStepResult> {
  switch (step.actionType) {
    case "planning.scheduler.worker.start-first": {
      const exactTarget = await resolveSchedulerReadySetCurrentWorkerExactTarget(project, step.input, step.actionType);
      return startSchedulerCoderWorkerForReadySetTarget(project, step.input, exactTarget, step.actionType);
    }
    case "planning.scheduler.worker.start-next": {
      const exactTarget = await resolveSchedulerReadySetCurrentWorkerExactTarget(project, step.input, step.actionType);
      return startSchedulerCoderWorkerForReadySetTarget(project, step.input, exactTarget, step.actionType);
    }
    case "planning.scheduler.integration-candidate.compile":
      await assertSchedulerReadySetCurrentStep(project, step.input, step.actionType);
      return compileSchedulerIntegrationCandidate(project, step.input);
    case "planning.scheduler.integration-check.run":
      await assertSchedulerReadySetCurrentStep(project, step.input, step.actionType);
      return runSchedulerIntegrationCheckHandoff(project, step.input);
    case "planning.scheduler.run.complete":
      await assertSchedulerReadySetCurrentStep(project, step.input, step.actionType);
      return completeSchedulerRunFromIntegrationOutcome(project, step.input);
    case "planning.scheduler.run.close-blocked":
      await assertSchedulerReadySetCurrentStep(project, step.input, step.actionType);
      return closeSchedulerRunBlockedOrExhausted(project, step.input);
  }
}

export async function assertSchedulerReadySetCurrentStep(
  project: ManagedProject,
  input: { changeId: string; schedulerRunId: string; schedulerClaimReservationId?: string },
  actionType: SchedulerCurrentTransitionActionType,
): Promise<SchedulerCurrentTransitionView> {
  const view = await readSchedulerReadySetCurrentStepView(project, input, actionType);
  assertSchedulerCurrentTransitionAction(view, actionType);
  return view;
}

async function resolveSchedulerReadySetCurrentWorkerExactTarget(
  project: ManagedProject,
  input: SchedulerFirstWorkerStartInput,
  actionType: SchedulerReadySetWorkerStartAction,
): Promise<SchedulerWorkerStartExactTarget> {
  const view = await readSchedulerReadySetCurrentStepView(project, input, actionType);
  return resolveSchedulerReadySetWorkerStartTarget({
    view,
    actionType,
    reservationIntentId: input.reservationIntentId,
    claimIntentId: input.claimIntentId,
  });
}

async function readSchedulerReadySetCurrentStepView(
  project: ManagedProject,
  input: { changeId: string; schedulerRunId: string; schedulerClaimReservationId?: string },
  actionType: SchedulerCurrentTransitionActionType,
): Promise<SchedulerCurrentTransitionView> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, schedulerReadySetActionLabel(actionType));
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`${actionType} cannot resolve active Change path for ${input.changeId}.`);
  const view = await readLatestSchedulerCurrentTransitionView(memory, changePath, input.schedulerRunId, actionType);
  if (view.run.changeId !== input.changeId || view.runtimeState.changeId !== input.changeId || view.reservation.changeId !== input.changeId) {
    throw new Error(`${actionType} Scheduler scope mismatch.`);
  }
  if (input.schedulerClaimReservationId && view.reservation.id !== input.schedulerClaimReservationId) {
    throw new Error(`${actionType} schedulerClaimReservationId target is stale.`);
  }
  return view;
}

export function resolveSchedulerReadySetWorkerStartTarget(input: {
  view: SchedulerCurrentTransitionView;
  actionType: SchedulerReadySetWorkerStartAction;
  reservationIntentId?: string;
  claimIntentId?: string;
}): SchedulerWorkerStartExactTarget {
  if (!schedulerTransitionMatchesStartRequest({
    transition: input.view.transition,
    actionType: input.actionType,
    reservationIntentId: input.reservationIntentId,
    claimIntentId: input.claimIntentId,
  })) {
    throw new Error(`${input.actionType} must target the current Scheduler ready-set transition.`);
  }
  const transition = input.view.transition;
  if (
    transition.kind !== "start-first-worker"
    && transition.kind !== "start-same-wave-worker"
    && transition.kind !== "start-next-wave-worker"
  ) {
    throw new Error(`${input.actionType} is blocked by the current Scheduler ready-set transition.`);
  }
  const selectedIntent = input.view.reservation.reservationIntents.find((intent) =>
    intent.status === "reserved"
    && intent.reservationIntentId === transition.reservationIntent.reservationIntentId
    && intent.claimIntentId === transition.reservationIntent.claimIntentId
  );
  if (!selectedIntent) throw new Error(`${input.actionType} could not resolve current reservation intent.`);
  if (input.view.workerPaths.some((path) => path.start.reservationIntentId === selectedIntent.reservationIntentId)) {
    throw new Error(`${input.actionType} reservation intent already started.`);
  }
  const graphNode = graphNodeForIntent(input.view, selectedIntent, input.actionType);
  const coderStage = coderStageForNode(graphNode, input.actionType);
  if (graphNode.taskIds.length !== 1) {
    throw new Error(`${input.actionType} currently requires a ready-set graph node with exactly one task id.`);
  }
  return {
    graphId: input.view.graph.id,
    graphNodeId: graphNode.id,
    schedulerNodeId: selectedIntent.nodeId,
    unitId: selectedIntent.unitId,
    stageRefId: coderStage.id,
    taskId: graphNode.taskIds[0],
    reservationIntentId: selectedIntent.reservationIntentId,
    claimIntentId: selectedIntent.claimIntentId,
    sourceLocks: graphNode.sourceLocks.map((lock) => ({
      scope: lock.scope,
      nodeId: lock.nodeId,
      unitId: lock.unitId,
      waveIndex: lock.waveIndex,
      claimIntentId: lock.claimIntentId,
      stageIds: [...lock.stageIds],
    })),
    recoveryKeyInputs: [...graphNode.recoveryKeyInputs, ...coderStage.recoveryKeyInputs],
  };
}

function graphNodeForIntent(
  view: SchedulerCurrentTransitionView,
  intent: SchedulerRuntimeClaimReservationIntent,
  actionType: SchedulerReadySetWorkerStartAction,
): ReadySetWorkflowGraphNode {
  const graphNode = view.graph.nodes.find((node) =>
    node.status === "planned"
    && node.claimIntentId === intent.claimIntentId
    && node.schedulerNodeId === intent.nodeId
    && node.unitId === intent.unitId
    && node.waveIndex === intent.waveIndex
  );
  if (!graphNode) throw new Error(`${actionType} could not resolve ready-set graph node for current reservation intent.`);
  if (!view.graph.waves.some((wave) => wave.index === graphNode.waveIndex && wave.claimIntentIds.includes(intent.claimIntentId))) {
    throw new Error(`${actionType} ready-set graph wave does not include current claim intent.`);
  }
  return graphNode;
}

function coderStageForNode(
  graphNode: ReadySetWorkflowGraphNode,
  actionType: SchedulerReadySetWorkerStartAction,
): ReadySetWorkflowGraphStageRef {
  const coderStages = graphNode.stageRefs.filter((stage) => stage.stage === "coder" && stage.status === "planned");
  if (coderStages.length !== 1) throw new Error(`${actionType} requires exactly one planned coder stage in ready-set graph node.`);
  return coderStages[0];
}

function schedulerReadySetActionLabel(actionType: SchedulerCurrentTransitionActionType): string {
  switch (actionType) {
    case "planning.scheduler.worker.start-first":
      return "Scheduler first worker start";
    case "planning.scheduler.worker.start-next":
      return "Scheduler next worker start";
    case "planning.scheduler.integration-candidate.compile":
      return "Scheduler integration candidate compile";
    case "planning.scheduler.integration-check.run":
      return "Scheduler IntegrationCheck run";
    case "planning.scheduler.run.complete":
      return "Scheduler run complete";
    case "planning.scheduler.run.close-blocked":
      return "Scheduler blocked run close";
  }
}
