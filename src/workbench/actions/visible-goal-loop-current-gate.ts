import type { GoalLoopCurrentGateSnapshot } from "../../goal-loop/manager.js";
import type { GoalLoopRuntimeStopReason } from "../../goal-loop-runtime/types.js";
import type { ManagedProject } from "../../types/index.js";
import { buildControlledSchedulerAdvanceCandidate, buildControlledSchedulerCurrentGateSnapshot } from "../../workflow-scheduler/controlled-advance-candidate.js";
import { CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE, isControlledSchedulerConcreteAction } from "../../workflow-scheduler/controlled-step.js";
import { isWorkflowActionType, validateWorkflowActionRequiredTargets, type WorkflowActionScopeCarrier } from "../../workflow-actions/registry.js";
import { getWorkbenchWorkpadProjection } from "../projections/read-model/implementation.js";
import { assessGoalLoopSummaryCurrentGateParity } from "../projections/read-model/goal-loop-parity.js";
import type { WorkbenchWorkflowActionRequest } from "../types.js";
import type { WorkpadNextAction } from "../read-model-types.js";

export type VisibleGoalLoopCurrentGateResult =
  | {
    currentGate: GoalLoopCurrentGateSnapshot;
    goalLoopNextStepPacketId: string;
  }
  | {
    warning: string;
  };

export type VisibleControlledSchedulerAdvanceRequestResult =
  | {
    request: WorkbenchWorkflowActionRequest & { actionType: "planning.scheduler.controlled-advance.run" };
  }
  | {
    stopReason: GoalLoopRuntimeStopReason;
    summary: string;
  };

export async function resolveVisibleControlledSchedulerAdvanceRequest(
  project: ManagedProject,
  changeId: string,
): Promise<VisibleControlledSchedulerAdvanceRequestResult> {
  const workpad = await getWorkbenchWorkpadProjection({ project, path: project.path }, changeId);
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  if (nextAction.kind !== "workflow-action" || !nextAction.actionType) {
    return { stopReason: "no-current-gate", summary: "当前没有可继续的 workflow gate。" };
  }
  if (!nextAction.enabled || !nextAction.requiresConfirmation) {
    return { stopReason: "blocked", summary: "当前 gate 不处于可确认执行状态。" };
  }
  if (nextAction.changeId !== changeId) {
    return { stopReason: "stale-target", summary: "当前 gate 已漂移到其他 Change。" };
  }
  if (isTerminalHighImpactGate(nextAction.actionType) || isManualSchedulerBarrierGate(nextAction.actionType)) {
    return { stopReason: "high-impact-terminal-gate", summary: `已停在需要单独人工确认的终点 gate：${nextAction.actionType}。` };
  }
  if (!goalLoop?.goalLoopNextStepPacketId || !goalLoop.controllerPolicyId || !goalLoop.gateReadinessPreflightId) {
    return { stopReason: "stale-target", summary: "当前 gate 缺少 fresh Goal Loop packet/controller/preflight 证据。" };
  }
  if (goalLoop.changeId !== changeId || goalLoop.controllerVerdict !== "recommend-existing-gate" || goalLoop.controllerGateStatus !== "matches-current-gate") {
    return { stopReason: "stale-target", summary: "当前 Goal Loop 证据已不再匹配可执行 gate。" };
  }
  if (!isControlledSchedulerConcreteAction(nextAction.actionType)) {
    return { stopReason: "unsupported-gate", summary: `V1 只支持 controlled scheduler gate，当前 gate 是 ${nextAction.actionType}。` };
  }
  const candidate = buildControlledSchedulerAdvanceCandidate(nextAction);
  if (!candidate || candidate.validationIssues.length > 0) {
    return {
      stopReason: "stale-target",
      summary: candidate
        ? `当前 scheduler gate target 不完整：${candidate.validationIssues.map((issue) => issue.label).join(", ")}。`
        : "当前 Workbench gate 不能转换为 controlled scheduler advance。",
    };
  }
  return {
    request: {
      ...candidate.controlledAdvance,
      actionType: CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE,
      goalLoopCurrentGateActionType: candidate.currentGateActionType,
    } as WorkbenchWorkflowActionRequest & { actionType: "planning.scheduler.controlled-advance.run" },
  };
}

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
    if (nextAction.kind !== "workflow-action" || !nextAction.enabled || !nextAction.requiresConfirmation || !nextAction.actionType) {
      return readinessWarning("current Workbench gate is not an enabled confirmation-backed workflow action");
    }
    if (nextAction.changeId !== changeId) {
      return readinessWarning("current Workbench gate does not carry the selected Change scope");
    }
    const parity = assessGoalLoopSummaryCurrentGateParity(goalLoop, nextAction);
    if (!parity.visible || parity.status !== "matches-current-gate") {
      return readinessWarning(`visible Workbench gate does not match post-step evidence (${parity.status})`);
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
  return buildControlledSchedulerCurrentGateSnapshot(carrier, actionType);
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

function isTerminalHighImpactGate(actionType: string): boolean {
  return actionType === "result.apply"
    || actionType === "change.close"
    || actionType.startsWith("landing.")
    || actionType.startsWith("landing-queue.")
    || actionType.startsWith("remote-landing.")
    || actionType.startsWith("pr-")
    || actionType.startsWith("post-merge.")
    || actionType.startsWith("maintenance.");
}

function isManualSchedulerBarrierGate(actionType: string): boolean {
  return actionType === "planning.scheduler.integration-check.run";
}
