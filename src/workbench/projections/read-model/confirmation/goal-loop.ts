import type { ManagedProject } from "../../../../types/index.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchDecisionAction, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../../read-model-types.js";

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
    const hasMatchingGate = item.actions.some((action) => action.kind === "workflow-action" && action.actionType === nextAction.actionType && action.changeId === nextAction.changeId);
    if (!hasMatchingGate || item.actions.some((action) => action.id === feedbackAction.id)) return item;
    return { ...item, actions: [...item.actions, feedbackAction] };
  });
}

function goalLoopFeedbackAction(workpad: WorkbenchWorkpad): WorkbenchDecisionAction | null {
  const goalLoop = workpad.goalLoop;
  const nextAction = workpad.nextAction;
  if (!goalLoop?.goalLoopNextStepPacketId || !nextAction.actionType) return null;
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
