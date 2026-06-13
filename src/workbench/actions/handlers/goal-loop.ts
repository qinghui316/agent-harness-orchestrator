import { compileGoalLoopDecision, renderGoalLoopDecisionMarkdown, type GoalLoopDecision } from "../../../goal-loop/manager.js";
import { assertWritableMemory } from "../../../memory/resolver.js";
import type { ManagedProject } from "../../../types/index.js";
import { recordWorkbenchDecision } from "../../decisions.js";
import { emitAssistantEvent } from "../../live-events.js";
import { resolveTopic } from "../../topic-resolver.js";
import { appendTopicThreadEntry } from "../../topic-thread.js";
import type { WorkbenchWorkflowActionRequest, WorkbenchLiveSink } from "../../types.js";
import type { WorkbenchActionHandlerMap } from "../dispatcher.js";

type GoalLoopWorkbenchActionType = "planning.goal-loop.evaluate";

export function buildGoalLoopActionHandlers(): Pick<WorkbenchActionHandlerMap, GoalLoopWorkbenchActionType> {
  return {
    "planning.goal-loop.evaluate": async (project, changeId, request, live) => evaluateGoalLoopDecision(project, changeId, request, live),
  };
}

export async function evaluateGoalLoopDecision(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ goalLoopDecision: GoalLoopDecision; executionStarted: false }> {
  if (!request.changeId) throw new Error("planning.goal-loop.evaluate requires changeId.");
  if (request.changeId !== changeId) throw new Error("planning.goal-loop.evaluate changeId scope mismatch.");
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Goal loop decision");
  const decision = await compileGoalLoopDecision(memory, changePath);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "goal-loop-evaluated",
    text: renderGoalLoopDecisionMarkdown(decision),
    artifact: decision.artifact,
  });
  emitAssistantEvent(live, {
    runId: decision.id,
    kind: "file-change",
    phase: "goal-loop-evaluated",
    title: "Goal loop decision recorded",
    summary: `${decision.decisionKind}: ${decision.summary}`,
    artifactRef: decision.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `goal-loop-decision:${decision.id}`,
    changeId,
    decisionType: "planning.goal-loop.evaluate",
    status: "completed",
    label: "Goal loop decision evaluated",
    summary: decision.summary,
    targetId: decision.id,
    runId: null,
    artifact: decision.artifact,
    actionId: "planning.goal-loop.evaluate",
    payload: {
      goalLoopDecisionId: decision.id,
      decisionKind: decision.decisionKind,
      recommendedAction: decision.recommendedAction,
      humanGateRequired: decision.humanGateRequired,
      executionStarted: false,
    },
    completedAt: new Date().toISOString(),
  });
  return { goalLoopDecision: decision, executionStarted: false };
}
