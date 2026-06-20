import { isWorkflowActionType, type WorkflowActionScopeCarrier, type WorkflowActionType } from "../workflow-actions/registry.js";

export const CONTROLLED_SCHEDULER_STEP_ACTION_TYPE = "planning.scheduler.controlled-step.run" as const;

export interface ControlledSchedulerStepRequest {
  wrapper: WorkflowActionScopeCarrier;
  concrete: WorkflowActionScopeCarrier & { actionType: WorkflowActionType };
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

export function isControlledSchedulerConcreteAction(actionType: string | undefined): actionType is WorkflowActionType {
  return typeof actionType === "string"
    && isWorkflowActionType(actionType)
    && actionType !== CONTROLLED_SCHEDULER_STEP_ACTION_TYPE
    && actionType.startsWith("planning.scheduler.")
    && !actionType.startsWith("planning.goal-loop.");
}
