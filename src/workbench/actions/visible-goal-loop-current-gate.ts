import type { GoalLoopCurrentGateSnapshot } from "../../goal-loop/manager.js";
import type { ManagedProject } from "../../types/index.js";
import { isControlledSchedulerConcreteAction } from "../../workflow-scheduler/controlled-step.js";
import { WORKFLOW_ACTION_SCOPE_KEYS, isWorkflowActionType, validateWorkflowActionRequiredTargets, type WorkflowActionScopeCarrier } from "../../workflow-actions/registry.js";
import { getWorkbenchWorkpadProjection } from "../projections/read-model/implementation.js";
import { assessGoalLoopSummaryCurrentGateParity } from "../projections/read-model/goal-loop-parity.js";
import type { WorkbenchWorkflowActionRequest } from "../types.js";
import type { WorkpadNextAction } from "../read-model-types.js";

const CURRENT_GATE_SCOPE_KEYS = WORKFLOW_ACTION_SCOPE_KEYS.filter((key) => !key.startsWith("goalLoop"));

export type VisibleGoalLoopCurrentGateResult =
  | {
    currentGate: GoalLoopCurrentGateSnapshot;
    goalLoopNextStepPacketId: string;
  }
  | {
    warning: string;
  };

export async function resolveVisibleControlledSchedulerCurrentGate(
  project: ManagedProject,
  changeId: string,
  expectedGoalLoopNextStepPacketId: string,
): Promise<VisibleGoalLoopCurrentGateResult> {
  try {
    const workpad = await getWorkbenchWorkpadProjection({ project, path: project.path }, changeId);
    const goalLoop = workpad.goalLoop;
    if (!goalLoop?.goalLoopNextStepPacketId) {
      return readinessWarning("current Workbench gate is not backed by visible Goal Loop evidence");
    }
    if (goalLoop.goalLoopNextStepPacketId !== expectedGoalLoopNextStepPacketId) {
      return readinessWarning("visible Goal Loop packet no longer matches the post-step packet");
    }

    const nextAction = workpad.nextAction;
    const parity = assessGoalLoopSummaryCurrentGateParity(goalLoop, nextAction);
    if (!parity.visible || parity.status !== "matches-current-gate") {
      return readinessWarning(`visible Workbench gate does not match post-step evidence (${parity.status})`);
    }
    if (nextAction.kind !== "workflow-action" || !nextAction.enabled || !nextAction.requiresConfirmation || !nextAction.actionType) {
      return readinessWarning("current Workbench gate is not an enabled confirmation-backed workflow action");
    }
    if (nextAction.changeId !== changeId) {
      return readinessWarning("current Workbench gate does not carry the selected Change scope");
    }
    if (!isControlledSchedulerConcreteAction(nextAction.actionType)) {
      return readinessWarning("current Workbench gate is not a controlled scheduler concrete action");
    }

    const currentGate = currentGateSnapshotFromNextAction(nextAction, "post-step readiness");
    const requiredTargetIssues = validateWorkflowActionRequiredTargets({
      actionType: currentGate.actionType,
      ...scopeToCarrier(currentGate.scope),
    });
    if (requiredTargetIssues.length) {
      return readinessWarning(`current Workbench gate target is incomplete: ${requiredTargetIssues.map((issue) => issue.label).join(", ")}`);
    }
    return { currentGate, goalLoopNextStepPacketId: goalLoop.goalLoopNextStepPacketId };
  } catch (error) {
    return readinessWarning(`current Workbench gate could not be checked: ${errorMessage(error)}`);
  }
}

export function currentGateSnapshotFromRequest(
  request: WorkbenchWorkflowActionRequest,
  actionLabel = "planning.goal-loop.controller.refresh",
): GoalLoopCurrentGateSnapshot {
  const actionType = request.goalLoopCurrentGateActionType;
  if (!actionType || !isWorkflowActionType(actionType)) {
    throw new Error(`${actionLabel} requires goalLoopCurrentGateActionType.`);
  }
  return currentGateSnapshotFromScopeCarrier(request, actionType);
}

function currentGateSnapshotFromNextAction(
  action: WorkpadNextAction,
  actionLabel: string,
): GoalLoopCurrentGateSnapshot {
  const actionType = action.actionType;
  if (!actionType || !isWorkflowActionType(actionType)) {
    throw new Error(`${actionLabel} requires a workflow action type.`);
  }
  return currentGateSnapshotFromScopeCarrier(action, actionType);
}

function currentGateSnapshotFromScopeCarrier(
  carrier: WorkflowActionScopeCarrier | WorkpadNextAction,
  actionType: GoalLoopCurrentGateSnapshot["actionType"],
): GoalLoopCurrentGateSnapshot {
  const scope: Record<string, string | string[]> = {};
  if (carrier.changeId) scope.changeId = carrier.changeId;
  const values = carrier as unknown as Record<string, unknown>;
  for (const key of CURRENT_GATE_SCOPE_KEYS) {
    const value = values[key];
    if (typeof value === "string") scope[key] = value;
    if (Array.isArray(value) && value.every((item) => typeof item === "string") && value.length > 0) {
      scope[key] = value;
    }
  }
  return { actionType, scope };
}

function scopeToCarrier(scope: Record<string, string | string[]>): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = {};
  for (const [key, value] of Object.entries(scope)) {
    (result as Record<string, string | string[]>)[key] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}

function readinessWarning(reason: string): { warning: string } {
  return {
    warning: `Post-step readiness evidence was not prepared: ${reason}.`,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
