import {
  WORKFLOW_ACTION_SCOPE_KEYS,
  validateWorkflowActionRequiredTargets,
  type WorkflowActionRequiredTargetIssue,
  type WorkflowActionScopeCarrier,
  type WorkflowActionType,
} from "../workflow-actions/registry.js";
import {
  CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE,
  CONTROLLED_SCHEDULER_STEP_ACTION_TYPE,
  isControlledSchedulerConcreteAction,
} from "./controlled-step.js";

const CURRENT_GATE_SCOPE_KEYS = WORKFLOW_ACTION_SCOPE_KEYS.filter((key) => !key.startsWith("goalLoop"));

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
  const result: WorkflowActionScopeCarrier = { actionType };
  const resolvedChangeId = scopeStringValue(source, "changeId") ?? scopeStringValue(fallback, "changeId") ?? changeId;
  if (resolvedChangeId) result.changeId = resolvedChangeId;
  for (const key of CURRENT_GATE_SCOPE_KEYS) {
    const value = scopeValue(source, key) ?? scopeValue(fallback, key);
    if (typeof value === "string") {
      (result as Record<string, string>)[key] = value;
    } else if (isStringArray(value) && value.length > 0) {
      (result as Record<string, string[]>)[key] = [...value];
    }
  }
  return result;
}

export function buildControlledSchedulerCurrentGateSnapshot(
  source: WorkflowActionScopeCarrier,
  actionType = source.actionType as WorkflowActionType | undefined,
): ControlledSchedulerGateCarrier {
  if (!actionType) {
    throw new Error("Controlled scheduler current gate snapshot requires an action type.");
  }
  const carrier = buildControlledSchedulerCurrentGateCarrier(source, actionType, source.changeId);
  const scope: Record<string, string | string[]> = {};
  if (carrier.changeId) scope.changeId = carrier.changeId;
  for (const key of CURRENT_GATE_SCOPE_KEYS) {
    const value = carrier[key];
    if (typeof value === "string") scope[key] = value;
    if (isStringArray(value) && value.length > 0) scope[key] = [...value];
  }
  return { actionType, scope };
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

function scopeValue(source: object | undefined, key: string): string | string[] | undefined {
  if (!source) return undefined;
  const value = (source as Record<string, unknown>)[key];
  if (typeof value === "string" || isStringArray(value)) return value;
  return undefined;
}

function scopeStringValue(source: object | undefined, key: string): string | undefined {
  const value = scopeValue(source, key);
  return typeof value === "string" ? value : undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
