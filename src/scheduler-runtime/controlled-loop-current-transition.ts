import type {
  GoalLoopContinuationBrief,
  GoalLoopControllerPolicy,
  GoalLoopDecision,
  GoalLoopGateReadinessPreflight,
  GoalLoopIteration,
  GoalLoopNextStepPacket,
} from "../goal-loop/manager.js";
import type { WorkflowActionScopeCarrier, WorkflowActionType } from "../workflow-actions/registry.js";
import { validateWorkflowActionRequiredTargets } from "../workflow-actions/registry.js";
import {
  assertControlledSchedulerFreshGateMatchesRequest,
} from "../workflow-scheduler/controlled-step.js";
import {
  buildControlledSchedulerPostStepRoutingPreflightSupport,
  type ControlledSchedulerPostStepRoutingPreflightSupportOptions,
  type ControlledSchedulerPostStepRoutingPreflightSupportSource,
} from "./controlled-loop-preflight-support.js";
import type { SchedulerControlledLoopCurrentTransitionChoice } from "./types.js";

export interface ControlledSchedulerCurrentTransitionEvaluationResult {
  goalLoopDecision: GoalLoopDecision;
  goalLoopIteration: GoalLoopIteration;
  goalLoopContinuationBrief: GoalLoopContinuationBrief;
  goalLoopNextStepPacket: GoalLoopNextStepPacket;
  executionStarted: false;
}

export interface ControlledSchedulerCurrentTransitionControllerResult {
  goalLoopControllerPolicy: GoalLoopControllerPolicy;
  executionStarted: false;
}

export interface ControlledSchedulerCurrentTransitionPreflightResult {
  goalLoopGateReadinessPreflight: GoalLoopGateReadinessPreflight;
  executionStarted: false;
}

export type ControlledSchedulerCurrentTransitionVisibleGateResult =
  | {
      currentGate: {
        actionType: WorkflowActionType;
        scope: Record<string, string | string[]>;
      };
      goalLoopNextStepPacketId?: string;
    }
  | {
      warning: string;
    };

export interface ControlledSchedulerCurrentTransitionServices {
  evaluateGoalLoopDecision(request: WorkflowActionScopeCarrier): Promise<ControlledSchedulerCurrentTransitionEvaluationResult>;
  refreshGoalLoopControllerPolicy(request: WorkflowActionScopeCarrier): Promise<ControlledSchedulerCurrentTransitionControllerResult>;
  prepareGoalLoopGateReadinessPreflight(request: WorkflowActionScopeCarrier, options?: ControlledSchedulerPostStepRoutingPreflightSupportOptions): Promise<ControlledSchedulerCurrentTransitionPreflightResult>;
  auditHighImpactAction(request: WorkflowActionScopeCarrier): Promise<void>;
  resolveVisibleCurrentGate(goalLoopNextStepPacketId: string): Promise<ControlledSchedulerCurrentTransitionVisibleGateResult>;
}

export interface ControlledSchedulerCurrentTransitionResult {
  goalLoopDecision: GoalLoopDecision;
  goalLoopIteration: GoalLoopIteration;
  goalLoopContinuationBrief: GoalLoopContinuationBrief;
  goalLoopNextStepPacket: GoalLoopNextStepPacket;
  goalLoopControllerPolicy: GoalLoopControllerPolicy;
  goalLoopGateReadinessPreflight: GoalLoopGateReadinessPreflight;
  controlledLoopCurrentTransitionChoice: SchedulerControlledLoopCurrentTransitionChoice;
}

export async function chooseControlledSchedulerCurrentTransition(input: {
  changeId: string;
  request: WorkflowActionScopeCarrier;
  requestedConcreteGate: WorkflowActionScopeCarrier & { actionType: WorkflowActionType };
  services: ControlledSchedulerCurrentTransitionServices;
  postStepRoutingSupportSource?: ControlledSchedulerPostStepRoutingPreflightSupportSource;
}): Promise<ControlledSchedulerCurrentTransitionResult> {
  const { changeId, request, requestedConcreteGate, services } = input;
  const concreteActionType = requestedConcreteGate.actionType;
  assertConcreteGateHasRequiredTargets(requestedConcreteGate, "planning.scheduler.controlled-advance.run submitted gate");

  const evaluation = await services.evaluateGoalLoopDecision({
    actionType: "planning.goal-loop.evaluate",
    changeId,
  });
  const packetAction = evaluation.goalLoopNextStepPacket.recommendedAction;
  if (!packetAction || packetAction.actionType !== concreteActionType) {
    throw new Error("planning.scheduler.controlled-advance.run fresh Goal Loop packet no longer recommends the submitted scheduler gate.");
  }
  assertControlledSchedulerFreshGateMatchesRequest(packetAction.actionType, packetAction.scope, requestedConcreteGate, "Goal Loop packet");

  const visibleGate = await services.resolveVisibleCurrentGate(evaluation.goalLoopNextStepPacket.id);
  if ("warning" in visibleGate) {
    throw new Error(`planning.scheduler.controlled-advance.run visible current gate no longer proves the submitted scheduler gate: ${visibleGate.warning}`);
  }
  if (visibleGate.goalLoopNextStepPacketId && visibleGate.goalLoopNextStepPacketId !== evaluation.goalLoopNextStepPacket.id) {
    throw new Error("planning.scheduler.controlled-advance.run visible current gate packet no longer matches fresh Goal Loop evidence.");
  }
  assertControlledSchedulerFreshGateMatchesRequest(visibleGate.currentGate.actionType, visibleGate.currentGate.scope, requestedConcreteGate, "visible Workbench current gate");

  const controllerRequest = {
    ...request,
    actionType: "planning.goal-loop.controller.refresh",
    changeId,
    goalLoopNextStepPacketId: evaluation.goalLoopNextStepPacket.id,
    goalLoopCurrentGateActionType: concreteActionType,
  };
  await services.auditHighImpactAction(controllerRequest);
  const controller = await services.refreshGoalLoopControllerPolicy(controllerRequest);
  if (
    controller.goalLoopControllerPolicy.verdict !== "recommend-existing-gate"
    || controller.goalLoopControllerPolicy.gateStatus !== "matches-current-gate"
    || controller.goalLoopControllerPolicy.currentGate?.actionType !== concreteActionType
  ) {
    throw new Error("planning.scheduler.controlled-advance.run fresh controller policy no longer matches the submitted scheduler gate.");
  }
  assertControlledSchedulerFreshGateMatchesRequest(
    controller.goalLoopControllerPolicy.currentGate.actionType,
    controller.goalLoopControllerPolicy.currentGate.scope,
    requestedConcreteGate,
    "Goal Loop controller policy",
  );

  const preflightRequest = {
    ...request,
    actionType: "planning.goal-loop.gate-readiness.prepare",
    changeId,
    goalLoopNextStepPacketId: evaluation.goalLoopNextStepPacket.id,
    goalLoopControllerPolicyId: controller.goalLoopControllerPolicy.id,
    goalLoopCurrentGateActionType: concreteActionType,
  };
  await services.auditHighImpactAction(preflightRequest);
  const preflightCurrentGate = {
    actionType: controller.goalLoopControllerPolicy.currentGate.actionType,
    scope: controller.goalLoopControllerPolicy.currentGate.scope,
  };
  const preflightOptions = buildControlledSchedulerPostStepRoutingPreflightSupport({
    source: input.postStepRoutingSupportSource,
    changeId,
    goalLoopNextStepPacketId: evaluation.goalLoopNextStepPacket.id,
    goalLoopControllerPolicyId: controller.goalLoopControllerPolicy.id,
    currentGate: preflightCurrentGate,
  });
  const preflight = await services.prepareGoalLoopGateReadinessPreflight(preflightRequest, preflightOptions);
  if (
    preflight.goalLoopGateReadinessPreflight.concreteGateInvoked !== false
    || preflight.goalLoopGateReadinessPreflight.toolPolicyAuthorizedConcreteGate !== false
    || preflight.goalLoopGateReadinessPreflight.currentGate.actionType !== concreteActionType
  ) {
    throw new Error("planning.scheduler.controlled-advance.run fresh preflight is not a non-executing match for the submitted scheduler gate.");
  }
  assertControlledSchedulerFreshGateMatchesRequest(
    preflight.goalLoopGateReadinessPreflight.currentGate.actionType,
    preflight.goalLoopGateReadinessPreflight.currentGate.scope,
    requestedConcreteGate,
    "Goal Loop gate-readiness preflight",
  );

  return {
    goalLoopDecision: evaluation.goalLoopDecision,
    goalLoopIteration: evaluation.goalLoopIteration,
    goalLoopContinuationBrief: evaluation.goalLoopContinuationBrief,
    goalLoopNextStepPacket: evaluation.goalLoopNextStepPacket,
    goalLoopControllerPolicy: controller.goalLoopControllerPolicy,
    goalLoopGateReadinessPreflight: preflight.goalLoopGateReadinessPreflight,
    controlledLoopCurrentTransitionChoice: buildCurrentTransitionChoice({
      changeId,
      selectedActionType: concreteActionType,
      submittedActionType: String(request.actionType ?? "planning.scheduler.controlled-advance.run"),
      currentGate: preflight.goalLoopGateReadinessPreflight.currentGate,
      evaluation,
      controller,
      preflight,
    }),
  };
}

function buildCurrentTransitionChoice(input: {
  changeId: string;
  selectedActionType: string;
  submittedActionType: string;
  currentGate: { actionType: string; scope: Record<string, string | string[]> };
  evaluation: ControlledSchedulerCurrentTransitionEvaluationResult;
  controller: ControlledSchedulerCurrentTransitionControllerResult;
  preflight: ControlledSchedulerCurrentTransitionPreflightResult;
}): SchedulerControlledLoopCurrentTransitionChoice {
  return {
    version: "1.0",
    authority: "scheduler-runtime-current-transition-choice",
    status: "ready-for-dispatch",
    changeId: input.changeId,
    selectedActionType: input.selectedActionType,
    submittedActionType: input.submittedActionType,
    currentGate: {
      actionType: input.currentGate.actionType,
      scope: { ...input.currentGate.scope },
    },
    goalLoopDecisionId: input.evaluation.goalLoopDecision.id,
    goalLoopIterationId: input.evaluation.goalLoopIteration.id,
    goalLoopContinuationBriefId: input.evaluation.goalLoopContinuationBrief.id,
    goalLoopNextStepPacketId: input.evaluation.goalLoopNextStepPacket.id,
    goalLoopControllerPolicyId: input.controller.goalLoopControllerPolicy.id,
    goalLoopGateReadinessPreflightId: input.preflight.goalLoopGateReadinessPreflight.id,
    humanGateRequired: true,
    humanConfirmationStillRequired: true,
    executionStarted: false,
    concreteGateInvoked: false,
    toolPolicyAuthorizedConcreteGate: false,
    authorizationGranted: false,
    loopAuthorized: false,
    fullParallelExecutorAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    sourceMutationAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    mergeAuthorized: false,
    remoteLandingAuthorized: false,
    harnessEvolutionAuthorized: false,
  };
}

function assertConcreteGateHasRequiredTargets(request: WorkflowActionScopeCarrier, label: string): void {
  const issues = validateWorkflowActionRequiredTargets(request);
  if (issues.length > 0) {
    throw new Error(`${label} concrete gate target is incomplete: ${issues.map((issue) => issue.label).join(", ")}.`);
  }
}
