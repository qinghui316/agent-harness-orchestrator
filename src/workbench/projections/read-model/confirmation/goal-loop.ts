import type { ManagedProject } from "../../../../types/index.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchTopicDetail } from "../../../read-model-types.js";

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
    whyNeedsConfirmation: "这是 Harness 阶段门：只记录 GoalLoopDecision、GoalLoopIteration 和 continuation brief 证据，不启动执行。",
    confirmEffect: "确认后只写 Goal Loop JSON/Markdown、continuation brief、对话说明和 Workbench decision；不会执行它建议的下一步。",
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
