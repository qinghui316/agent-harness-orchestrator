import { isWorkflowActionType, type WorkflowActionScopeCarrier, type WorkflowActionType } from "../workflow-actions/registry.js";

export const CONTROLLED_SCHEDULER_STEP_ACTION_TYPE = "planning.scheduler.controlled-step.run" as const;
export const CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE = "planning.scheduler.controlled-advance.run" as const;

const CONTROLLED_SCHEDULER_WRAPPER_ACTION_TYPES = new Set<string>([
  CONTROLLED_SCHEDULER_STEP_ACTION_TYPE,
  CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE,
]);

export interface ControlledSchedulerStepRequest {
  wrapper: WorkflowActionScopeCarrier;
  concrete: WorkflowActionScopeCarrier & { actionType: WorkflowActionType };
}

export interface ControlledSchedulerAdvanceEvidence {
  goalLoopDecisionId: string;
  goalLoopIterationId: string;
  goalLoopContinuationBriefId: string;
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId: string;
  goalLoopGateReadinessPreflightId: string;
}

export function buildControlledSchedulerStepRequest(request: WorkflowActionScopeCarrier): ControlledSchedulerStepRequest {
  if (request.actionType !== CONTROLLED_SCHEDULER_STEP_ACTION_TYPE) {
    throw new Error("Controlled scheduler step requires planning.scheduler.controlled-step.run.");
  }
  const concreteActionType = request.goalLoopCurrentGateActionType;
  if (!isControlledSchedulerConcreteAction(concreteActionType)) {
    throw new Error("planning.scheduler.controlled-step.run requires a concrete planning.scheduler.* current gate.");
  }
  if (!request.goalLoopNextStepPacketId) {
    throw new Error("planning.scheduler.controlled-step.run requires goalLoopNextStepPacketId.");
  }
  if (!request.goalLoopControllerPolicyId) {
    throw new Error("planning.scheduler.controlled-step.run requires goalLoopControllerPolicyId.");
  }
  if (!request.goalLoopGateReadinessPreflightId) {
    throw new Error("planning.scheduler.controlled-step.run requires goalLoopGateReadinessPreflightId.");
  }
  return {
    wrapper: request,
    concrete: {
      ...request,
      actionType: concreteActionType,
    },
  };
}

export function buildControlledSchedulerAdvanceStepRequest(request: WorkflowActionScopeCarrier, evidence: ControlledSchedulerAdvanceEvidence): ControlledSchedulerStepRequest {
  if (request.actionType !== CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE) {
    throw new Error("Controlled scheduler advance requires planning.scheduler.controlled-advance.run.");
  }
  const concreteActionType = request.goalLoopCurrentGateActionType;
  if (!isControlledSchedulerConcreteAction(concreteActionType)) {
    throw new Error("planning.scheduler.controlled-advance.run requires a concrete planning.scheduler.* current gate.");
  }
  return buildControlledSchedulerStepRequest({
    ...request,
    actionType: CONTROLLED_SCHEDULER_STEP_ACTION_TYPE,
    goalLoopDecisionId: evidence.goalLoopDecisionId,
    goalLoopIterationId: evidence.goalLoopIterationId,
    goalLoopContinuationBriefId: evidence.goalLoopContinuationBriefId,
    goalLoopNextStepPacketId: evidence.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: evidence.goalLoopControllerPolicyId,
    goalLoopGateReadinessPreflightId: evidence.goalLoopGateReadinessPreflightId,
    goalLoopCurrentGateActionType: concreteActionType,
  });
}

export function isControlledSchedulerWrapperAction(actionType: string | undefined): boolean {
  return typeof actionType === "string" && CONTROLLED_SCHEDULER_WRAPPER_ACTION_TYPES.has(actionType);
}

export function isControlledSchedulerConcreteAction(actionType: string | undefined): actionType is WorkflowActionType {
  return typeof actionType === "string"
    && isWorkflowActionType(actionType)
    && !isControlledSchedulerWrapperAction(actionType)
    && actionType.startsWith("planning.scheduler.")
    && !actionType.startsWith("planning.goal-loop.");
}
