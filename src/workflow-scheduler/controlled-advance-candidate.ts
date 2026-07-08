import {
  validateWorkflowActionRequiredTargets,
  type WorkflowActionRequiredTargetIssue,
  type WorkflowActionScopeCarrier,
  type WorkflowActionType,
} from "../workflow-actions/registry.js";
import { buildCurrentGateCarrier, buildCurrentGateSnapshot } from "../workflow-actions/current-gate.js";
import {
  CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE,
  CONTROLLED_SCHEDULER_STEP_ACTION_TYPE,
  isControlledSchedulerConcreteAction,
} from "./controlled-step.js";

export interface ControlledSchedulerGateCarrier {
  actionType: WorkflowActionType;
  scope: Record<string, string | string[]>;
}

export interface ControlledSchedulerAdvanceCandidate {
  currentGateActionType: string;
  currentGate: WorkflowActionScopeCarrier;
  controlledAdvance: WorkflowActionScopeCarrier;
  targetKey: string;
  validationIssues: WorkflowActionRequiredTargetIssue[];
}

export function controlledSchedulerSourceGateActionType(
  action: WorkflowActionScopeCarrier,
): string | undefined {
  if (action.actionType === CONTROLLED_SCHEDULER_STEP_ACTION_TYPE) return action.goalLoopCurrentGateActionType;
  return action.actionType;
}

export function isControlledSchedulerAdvanceSourceGate(
  action: WorkflowActionScopeCarrier,
): boolean {
  const actionType = controlledSchedulerSourceGateActionType(action);
  if (action.actionType === CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE) return false;
  if (actionType === "planning.scheduler.plan.prepare") return false;
  return isControlledSchedulerConcreteAction(actionType);
}

export function buildControlledSchedulerCurrentGateCarrier(
  source: object,
  actionType: string,
  changeId?: string,
  fallback?: object,
): WorkflowActionScopeCarrier {
  return buildCurrentGateCarrier(source, actionType, changeId, fallback);
}

export function buildControlledSchedulerCurrentGateSnapshot(
  source: WorkflowActionScopeCarrier,
  actionType = source.actionType as WorkflowActionType | undefined,
): ControlledSchedulerGateCarrier {
  return buildCurrentGateSnapshot(source, actionType) as ControlledSchedulerGateCarrier;
}

export function buildControlledSchedulerAdvanceCandidate(
  source: WorkflowActionScopeCarrier,
): ControlledSchedulerAdvanceCandidate | null {
  if (!isControlledSchedulerAdvanceSourceGate(source)) return null;
  const currentGateActionType = controlledSchedulerSourceGateActionType(source);
  if (!currentGateActionType) return null;
  const currentGate = buildControlledSchedulerCurrentGateCarrier(source, currentGateActionType, source.changeId);
  const validationIssues = validateWorkflowActionRequiredTargets(currentGate);
  if (validationIssues.length > 0) {
    return {
      currentGateActionType,
      currentGate,
      controlledAdvance: {
        ...currentGate,
        actionType: CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE,
        goalLoopCurrentGateActionType: currentGateActionType,
      },
      targetKey: controlledSchedulerAdvanceTargetKey(currentGate),
      validationIssues,
    };
  }
  return {
    currentGateActionType,
    currentGate,
    controlledAdvance: {
      ...currentGate,
      actionType: CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE,
      goalLoopCurrentGateActionType: currentGateActionType,
    },
    targetKey: controlledSchedulerAdvanceTargetKey(currentGate),
    validationIssues,
  };
}

export function controlledSchedulerAdvanceTargetKey(
  action: WorkflowActionScopeCarrier,
): string {
  return action.goalLoopGateReadinessPreflightId
    ?? action.schedulerRunCompletionId
    ?? action.schedulerIntegrationOutcomeId
    ?? action.schedulerIntegrationCheckHandoffId
    ?? action.schedulerIntegrationCandidateId
    ?? action.schedulerWorkerReworkAuditId
    ?? action.schedulerWorkerReworkValidationId
    ?? action.schedulerWorkerReworkResultId
    ?? action.schedulerWorkerReworkStartId
    ?? action.schedulerWorkerReworkPlanId
    ?? action.schedulerWorkerAuditId
    ?? action.schedulerWorkerValidationId
    ?? action.schedulerWorkerResultId
    ?? action.schedulerWorkerStartId
    ?? action.schedulerClaimReservationId
    ?? action.schedulerRunId
    ?? "current";
}
