import type { ManagedProject } from "../../../../types/index.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchDecisionAction, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../../read-model-types.js";

type ScopeValue = string | string[] | undefined;

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
    summary: "主 Agent 可以先基于当前 evidence 评估下一步。",
    whyNeedsConfirmation: "这是 Harness 阶段门：只记录 GoalLoopDecision、GoalLoopIteration、continuation brief 和 next-step packet 证据，不启动执行。",
    confirmEffect: "确认后只写 Goal Loop JSON/Markdown、continuation brief、next-step packet、对话说明和 Workbench decision；不会执行它建议的下一步。",
    riskSummary: "建议动作仍需要单独确认；不会创建 worker、TaskRun、WorkerLease、worktree、run、IntegrationCheck、Apply/Close、child Change 或 source mutation。",
    evidenceRefs: [],
    actions: [{
      id: `workflow:planning.goal-loop.evaluate:${selectedTopic.id}`,
      label: "评估目标循环",
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
  const assistedAction = goalLoopAssistedConcreteGateAction(workpad);
  if (!assistedAction) return items;
  return items.map((item) => {
    const hasMatchingGate = item.actions.some((action) => action.kind === "workflow-action" && actionMatchesGoalLoopScope(item, action, workpad));
    if (!hasMatchingGate || item.actions.some((action) => action.id === assistedAction.id)) return item;
    return { ...item, actions: [...item.actions, assistedAction] };
  });
}

function goalLoopFeedbackAction(workpad: WorkbenchWorkpad): WorkbenchDecisionAction | null {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  if (!goalLoop?.goalLoopNextStepPacketId || !nextAction.actionType || !readGoalLoopScope(goalLoop)) return null;
  return {
    id: `workflow:planning.goal-loop.feedback.evaluate:${goalLoop.goalLoopNextStepPacketId}`,
    label: "修正 Goal Loop 建议",
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
  return {
    ...scope,
    id: `workflow:${expectedType}:goal-loop-assisted:${goalLoop.gateReadinessPreflightId}`,
    label: "确认当前 gate（Goal Loop 已预检）",
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
    label: "刷新 Goal Loop 控制策略",
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
    label: "准备 Goal Loop gate 预检",
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

function readGoalLoopField(goalLoop: WorkbenchWorkpad["goalLoop"], key: string): unknown {
  return goalLoop ? (goalLoop as unknown as Record<string, unknown>)[key] : undefined;
}
