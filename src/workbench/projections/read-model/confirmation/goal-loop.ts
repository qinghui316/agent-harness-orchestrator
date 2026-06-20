import type { ManagedProject } from "../../../../types/index.js";
import { WORKFLOW_ACTION_SCOPE_KEYS } from "../../../../workflow-actions/registry.js";
import { CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE, CONTROLLED_SCHEDULER_STEP_ACTION_TYPE, isControlledSchedulerConcreteAction } from "../../../../workflow-scheduler/controlled-step.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchDecisionAction, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../../read-model-types.js";
import { schedulerUserFacingActionCopy } from "./scheduler-user-surface.js";

type ScopeValue = string | string[] | undefined;
const CURRENT_GATE_SCOPE_KEYS = WORKFLOW_ACTION_SCOPE_KEYS.filter((key) => !key.startsWith("goalLoop"));

export function goalLoopEvaluationQueueItem(
  project: ManagedProject | null,
  selectedTopic: WorkbenchTopicDetail | null,
): WorkbenchConfirmationQueueItem | null {
  if (!project || !selectedTopic || selectedTopic.state !== "active") return null;
  return {
    id: `confirm:goal-loop:${selectedTopic.id}`,
    kind: "planning-confirm",
    projectId: project.id,
    conversationId: selectedTopic.id,
    changeId: selectedTopic.id,
    summary: "主 Agent 可以先评估当前需求的下一步。",
    whyNeedsConfirmation: "需要你确认是否先让主 Agent 做一次非执行评估。",
    confirmEffect: "确认后只记录下一步建议和对话说明，不会执行建议里的动作。",
    riskSummary: "后续任何执行、组合检查、应用、关闭或远端操作仍需要单独确认。",
    evidenceRefs: [],
    actions: [{
      id: `workflow:planning.goal-loop.evaluate:${selectedTopic.id}`,
      label: "评估下一步",
      kind: "workflow-action",
      changeId: selectedTopic.id,
      actionType: "planning.goal-loop.evaluate",
      enabled: true,
      requiresConfirmation: true,
    }],
    primary: true,
    status: "pending",
  };
}

export function attachGoalLoopFeedbackActions(
  items: WorkbenchConfirmationQueueItem[],
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  if (!goalLoop?.goalLoopNextStepPacketId || nextAction.kind !== "workflow-action" || !nextAction.actionType) {
    return items;
  }
  if (nextAction.changeId !== goalLoop.changeId) return items;
  const feedbackAction = goalLoopFeedbackAction(workpad);
  if (!feedbackAction) return items;
  return items.map((item) => {
    const hasMatchingGate = item.actions.some((action) => action.kind === "workflow-action" && actionMatchesGoalLoopScope(item, action, workpad));
    if (!hasMatchingGate || item.actions.some((action) => action.id === feedbackAction.id)) return item;
    return { ...item, actions: [...item.actions, feedbackAction] };
  });
}

export function attachGoalLoopControllerRefreshActions(
  items: WorkbenchConfirmationQueueItem[],
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  if (!goalLoop?.goalLoopNextStepPacketId || nextAction.kind !== "workflow-action" || !nextAction.actionType) {
    return items;
  }
  if (nextAction.changeId !== goalLoop.changeId) return items;
  const refreshAction = goalLoopControllerRefreshAction(workpad);
  if (!refreshAction) return items;
  return items.map((item) => {
    const hasMatchingGate = item.actions.some((action) => action.kind === "workflow-action" && actionMatchesGoalLoopScope(item, action, workpad));
    if (!hasMatchingGate || item.actions.some((action) => action.id === refreshAction.id)) return item;
    return { ...item, actions: [...item.actions, refreshAction] };
  });
}

export function attachGoalLoopGateReadinessActions(
  items: WorkbenchConfirmationQueueItem[],
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  if (!goalLoop?.goalLoopNextStepPacketId || !goalLoop.controllerPolicyId || nextAction.kind !== "workflow-action" || !nextAction.actionType) {
    return items;
  }
  if (goalLoop.controllerVerdict !== "recommend-existing-gate" || goalLoop.controllerGateStatus !== "matches-current-gate") return items;
  if (nextAction.changeId !== goalLoop.changeId) return items;
  const readinessAction = goalLoopGateReadinessAction(workpad);
  if (!readinessAction) return items;
  return items.map((item) => {
    const hasMatchingGate = item.actions.some((action) => action.kind === "workflow-action" && actionMatchesGoalLoopScope(item, action, workpad));
    if (!hasMatchingGate || item.actions.some((action) => action.id === readinessAction.id)) return item;
    return { ...item, actions: [...item.actions, readinessAction] };
  });
}

export function attachGoalLoopAssistedConcreteGateActions(
  items: WorkbenchConfirmationQueueItem[],
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  if (!goalLoop?.gateReadinessPreflightId || nextAction.kind !== "workflow-action" || !nextAction.actionType) {
    return items;
  }
  if (goalLoop.controllerVerdict !== "recommend-existing-gate" || goalLoop.controllerGateStatus !== "matches-current-gate") return items;
  if (nextAction.changeId !== goalLoop.changeId) return items;
  const controlledSchedulerStepAction = goalLoopControlledSchedulerStepAction(workpad);
  if (controlledSchedulerStepAction) {
    return items.map((item) => {
      const hasMatchingGate = item.actions.some((action) => action.kind === "workflow-action" && actionMatchesGoalLoopScope(item, action, workpad));
      if (!hasMatchingGate || item.actions.some((action) => action.id === controlledSchedulerStepAction.id)) return item;
      return {
        ...item,
        actions: [
          ...item.actions.filter((action) => !(action.kind === "workflow-action" && actionMatchesGoalLoopScope(item, action, workpad))),
          controlledSchedulerStepAction,
        ],
      };
    });
  }
  const assistedAction = goalLoopAssistedConcreteGateAction(workpad);
  if (!assistedAction) return items;
  return items.map((item) => {
    const hasMatchingGate = item.actions.some((action) => action.kind === "workflow-action" && actionMatchesGoalLoopScope(item, action, workpad));
    if (!hasMatchingGate || item.actions.some((action) => action.id === assistedAction.id)) return item;
    return { ...item, actions: [...item.actions, assistedAction] };
  });
}

export function attachControlledSchedulerAdvanceActions(
  items: WorkbenchConfirmationQueueItem[],
): WorkbenchConfirmationQueueItem[] {
  return items.map((item) => {
    const advanceActions = item.actions
      .filter((action) => action.kind === "workflow-action" && action.enabled && isSchedulerAdvanceSourceAction(action))
      .map((action) => controlledSchedulerAdvanceAction(action));
    if (advanceActions.length === 0) return item;
    const seenAdvanceIds = new Set<string>();
    const uniqueAdvanceActions = advanceActions.filter((action) => {
      if (seenAdvanceIds.has(action.id)) return false;
      seenAdvanceIds.add(action.id);
      return true;
    });
    const advanceCopy = schedulerUserFacingActionCopy(CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE);
    return {
      ...item,
      summary: advanceCopy.summary,
      whyNeedsConfirmation: advanceCopy.whyNeedsConfirmation,
      confirmEffect: advanceCopy.confirmEffect,
      riskSummary: advanceCopy.riskSummary,
      actions: [
        ...item.actions.filter((action) => !(action.kind === "workflow-action" && isSchedulerAdvanceSourceAction(action))),
        ...uniqueAdvanceActions,
      ],
    };
  });
}

function goalLoopFeedbackAction(workpad: WorkbenchWorkpad): WorkbenchDecisionAction | null {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  if (!goalLoop?.goalLoopNextStepPacketId || !nextAction.actionType || !readGoalLoopScope(goalLoop)) return null;
  return {
    id: `workflow:planning.goal-loop.feedback.evaluate:${goalLoop.goalLoopNextStepPacketId}`,
    label: "修正下一步建议",
    kind: "feedback",
    enabled: true,
    requiresConfirmation: false,
    changeId: goalLoop.changeId,
    actionType: "planning.goal-loop.feedback.evaluate",
    goalLoopDecisionId: goalLoop.goalLoopDecisionId,
    goalLoopIterationId: goalLoop.goalLoopIterationId,
    goalLoopContinuationBriefId: goalLoop.id,
    goalLoopNextStepPacketId: goalLoop.goalLoopNextStepPacketId,
    artifact: goalLoop.nextStepPacketArtifact ?? goalLoop.artifact,
  };
}

function goalLoopAssistedConcreteGateAction(workpad: WorkbenchWorkpad): WorkbenchDecisionAction | null {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  const scope = readGoalLoopScope(goalLoop);
  const expectedType = readGoalLoopActionType(goalLoop);
  if (!goalLoop?.gateReadinessPreflightId || !nextAction.actionType || !expectedType || !scope) return null;
  if (expectedType.startsWith("planning.goal-loop.")) return null;
  if (nextAction.actionType !== expectedType) return null;
  const actionScope = mergeGoalLoopScopeWithNextActionScope(scope, nextAction);
  return {
    ...actionScope,
    id: `workflow:${expectedType}:goal-loop-assisted:${goalLoop.gateReadinessPreflightId}`,
    label: "确认当前步骤",
    kind: "workflow-action",
    enabled: true,
    requiresConfirmation: true,
    changeId: goalLoop.changeId,
    actionType: expectedType as WorkbenchDecisionAction["actionType"],
    goalLoopDecisionId: goalLoop.goalLoopDecisionId,
    goalLoopIterationId: goalLoop.goalLoopIterationId,
    goalLoopContinuationBriefId: goalLoop.id,
    goalLoopNextStepPacketId: goalLoop.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: goalLoop.controllerPolicyId,
    goalLoopGateReadinessPreflightId: goalLoop.gateReadinessPreflightId,
    artifact: goalLoop.gateReadinessPreflightArtifact ?? goalLoop.controllerArtifact ?? goalLoop.nextStepPacketArtifact ?? goalLoop.artifact,
  };
}

function goalLoopControlledSchedulerStepAction(workpad: WorkbenchWorkpad): WorkbenchDecisionAction | null {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  const scope = readGoalLoopScope(goalLoop);
  const expectedType = readGoalLoopActionType(goalLoop);
  if (!goalLoop?.gateReadinessPreflightId || !nextAction.actionType || !expectedType || !scope) return null;
  if (!isControlledSchedulerConcreteAction(expectedType)) return null;
  if (nextAction.actionType !== expectedType) return null;
  const actionScope = mergeGoalLoopScopeWithNextActionScope(scope, nextAction);
  return {
    ...actionScope,
    id: `workflow:${CONTROLLED_SCHEDULER_STEP_ACTION_TYPE}:goal-loop-assisted:${goalLoop.gateReadinessPreflightId}`,
    label: schedulerUserFacingActionCopy(CONTROLLED_SCHEDULER_STEP_ACTION_TYPE).label,
    kind: "workflow-action",
    enabled: true,
    requiresConfirmation: true,
    changeId: goalLoop.changeId,
    actionType: CONTROLLED_SCHEDULER_STEP_ACTION_TYPE,
    goalLoopDecisionId: goalLoop.goalLoopDecisionId,
    goalLoopIterationId: goalLoop.goalLoopIterationId,
    goalLoopContinuationBriefId: goalLoop.id,
    goalLoopNextStepPacketId: goalLoop.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: goalLoop.controllerPolicyId,
    goalLoopGateReadinessPreflightId: goalLoop.gateReadinessPreflightId,
    goalLoopCurrentGateActionType: expectedType as WorkbenchDecisionAction["actionType"],
    artifact: goalLoop.gateReadinessPreflightArtifact ?? goalLoop.controllerArtifact ?? goalLoop.nextStepPacketArtifact ?? goalLoop.artifact,
  };
}

function controlledSchedulerAdvanceAction(action: WorkbenchDecisionAction): WorkbenchDecisionAction {
  const currentGateActionType = action.actionType === CONTROLLED_SCHEDULER_STEP_ACTION_TYPE
    ? action.goalLoopCurrentGateActionType
    : action.actionType;
  const actionWithoutStaleGoalLoopEvidence = { ...action };
  delete actionWithoutStaleGoalLoopEvidence.goalLoopDecisionId;
  delete actionWithoutStaleGoalLoopEvidence.goalLoopIterationId;
  delete actionWithoutStaleGoalLoopEvidence.goalLoopContinuationBriefId;
  delete actionWithoutStaleGoalLoopEvidence.goalLoopNextStepPacketId;
  delete actionWithoutStaleGoalLoopEvidence.goalLoopFeedbackId;
  delete actionWithoutStaleGoalLoopEvidence.goalLoopControllerPolicyId;
  delete actionWithoutStaleGoalLoopEvidence.goalLoopGateReadinessPreflightId;
  return {
    ...actionWithoutStaleGoalLoopEvidence,
    id: `workflow:${CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE}:${action.changeId ?? "change"}:${currentGateActionType ?? "scheduler"}:${schedulerAdvanceTargetSuffix(action)}`,
    label: schedulerUserFacingActionCopy(CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE).label,
    kind: "workflow-action",
    actionType: CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE,
    goalLoopCurrentGateActionType: currentGateActionType,
    enabled: true,
    requiresConfirmation: true,
  };
}

function isSchedulerAdvanceSourceAction(action: WorkbenchDecisionAction): boolean {
  if (action.actionType === CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE) return false;
  if (action.actionType === "planning.scheduler.plan.prepare") return false;
  if (action.actionType === CONTROLLED_SCHEDULER_STEP_ACTION_TYPE) {
    return isControlledSchedulerConcreteAction(action.goalLoopCurrentGateActionType);
  }
  return isControlledSchedulerConcreteAction(action.actionType);
}

function schedulerAdvanceTargetSuffix(action: WorkbenchDecisionAction): string {
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

function goalLoopControllerRefreshAction(workpad: WorkbenchWorkpad): WorkbenchDecisionAction | null {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  const scope = readGoalLoopScope(goalLoop);
  const expectedType = readGoalLoopActionType(goalLoop);
  if (!goalLoop?.goalLoopNextStepPacketId || !nextAction.actionType || !expectedType || !scope) return null;
  if (nextAction.actionType !== expectedType) return null;
  return {
    ...scope,
    id: `workflow:planning.goal-loop.controller.refresh:${goalLoop.goalLoopNextStepPacketId}`,
    label: "刷新下一步判断",
    kind: "workflow-action",
    enabled: true,
    requiresConfirmation: true,
    changeId: goalLoop.changeId,
    actionType: "planning.goal-loop.controller.refresh",
    goalLoopDecisionId: goalLoop.goalLoopDecisionId,
    goalLoopIterationId: goalLoop.goalLoopIterationId,
    goalLoopContinuationBriefId: goalLoop.id,
    goalLoopNextStepPacketId: goalLoop.goalLoopNextStepPacketId,
    goalLoopCurrentGateActionType: expectedType,
    artifact: goalLoop.nextStepPacketArtifact ?? goalLoop.artifact,
  };
}

function goalLoopGateReadinessAction(workpad: WorkbenchWorkpad): WorkbenchDecisionAction | null {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  const scope = readGoalLoopScope(goalLoop);
  const expectedType = readGoalLoopActionType(goalLoop);
  if (!goalLoop?.goalLoopNextStepPacketId || !goalLoop.controllerPolicyId || !nextAction.actionType || !expectedType || !scope) return null;
  if (expectedType.startsWith("planning.goal-loop.")) return null;
  if (nextAction.actionType !== expectedType) return null;
  return {
    ...scope,
    id: `workflow:planning.goal-loop.gate-readiness.prepare:${goalLoop.controllerPolicyId}`,
    label: "检查当前步骤",
    kind: "workflow-action",
    enabled: true,
    requiresConfirmation: true,
    changeId: goalLoop.changeId,
    actionType: "planning.goal-loop.gate-readiness.prepare",
    goalLoopDecisionId: goalLoop.goalLoopDecisionId,
    goalLoopIterationId: goalLoop.goalLoopIterationId,
    goalLoopContinuationBriefId: goalLoop.id,
    goalLoopNextStepPacketId: goalLoop.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: goalLoop.controllerPolicyId,
    goalLoopCurrentGateActionType: expectedType,
    artifact: goalLoop.controllerArtifact ?? goalLoop.nextStepPacketArtifact ?? goalLoop.artifact,
  };
}

function actionMatchesGoalLoopScope(
  item: WorkbenchConfirmationQueueItem,
  action: WorkbenchDecisionAction,
  workpad: WorkbenchWorkpad,
): boolean {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  const expectedScope = goalLoop ? readGoalLoopScope(goalLoop) : undefined;
  const expectedType = goalLoop ? readGoalLoopActionType(goalLoop) : undefined;
  if (!goalLoop || !expectedScope || !expectedType) return false;
  if (!action.enabled) return false;
  if (action.actionType !== nextAction.actionType || action.actionType !== expectedType) return false;
  if (nextAction.changeId !== goalLoop.changeId) return false;
  for (const [key, expectedValue] of Object.entries(expectedScope)) {
    const expected = normalizeScopeValues(expectedValue);
    const actual = key === "changeId"
      ? normalizeScopeValues(action.changeId ?? item.changeId)
      : normalizeScopeValues(readQueueActionScopeValue(item, action, key));
    if (!scopeValuesEqual(expected, actual)) return false;
  }
  return true;
}

function readQueueActionScopeValue(
  item: WorkbenchConfirmationQueueItem,
  action: WorkbenchDecisionAction,
  key: string,
): ScopeValue {
  const actionValue = (action as unknown as Record<string, unknown>)[key];
  const itemValue = (item as unknown as Record<string, unknown>)[key];
  if (typeof actionValue === "string" || isStringArray(actionValue)) return actionValue;
  if (typeof itemValue === "string" || isStringArray(itemValue)) return itemValue;
  return undefined;
}

function normalizeScopeValues(value: ScopeValue): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return [...value].sort();
  return [];
}

function scopeValuesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readGoalLoopScope(goalLoop: WorkbenchWorkpad["goalLoop"]): Record<string, string | string[]> | undefined {
  const value = readGoalLoopField(goalLoop, "recommended" + "ActionScope");
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, string | string[]> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || isStringArray(item)) result[key] = item;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function readGoalLoopActionType(goalLoop: WorkbenchWorkpad["goalLoop"]): string | undefined {
  const value = readGoalLoopField(goalLoop, "recommended" + "ActionType");
  return typeof value === "string" ? value : undefined;
}

function mergeGoalLoopScopeWithNextActionScope(
  scope: Record<string, string | string[]>,
  nextAction: WorkbenchWorkpad["nextAction"],
): Record<string, string | string[]> {
  const merged: Record<string, string | string[]> = { ...scope };
  const values = nextAction as unknown as Record<string, unknown>;
  for (const key of CURRENT_GATE_SCOPE_KEYS) {
    const value = values[key];
    if (typeof value === "string" || isStringArray(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

function readGoalLoopField(goalLoop: WorkbenchWorkpad["goalLoop"], key: string): unknown {
  return goalLoop ? (goalLoop as unknown as Record<string, unknown>)[key] : undefined;
}
