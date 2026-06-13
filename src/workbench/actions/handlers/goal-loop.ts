import { compileGoalLoopEvaluation, renderGoalLoopContinuationBriefMarkdown, type GoalLoopContinuationBrief, type GoalLoopDecision, type GoalLoopIteration } from "../../../goal-loop/manager.js";
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
): Promise<{ goalLoopDecision: GoalLoopDecision; goalLoopIteration: GoalLoopIteration; goalLoopContinuationBrief: GoalLoopContinuationBrief; executionStarted: false }> {
  if (!request.changeId) throw new Error("planning.goal-loop.evaluate requires changeId.");
  if (request.changeId !== changeId) throw new Error("planning.goal-loop.evaluate changeId scope mismatch.");
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Goal loop decision");
  const { goalLoopDecision: decision, goalLoopIteration: iteration, goalLoopContinuationBrief: brief } = await compileGoalLoopEvaluation(memory, changePath);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "goal-loop-evaluated",
    text: renderGoalLoopContinuationBriefMarkdown(brief),
    artifact: brief.artifact,
  });
  emitAssistantEvent(live, {
    runId: brief.id,
    kind: "file-change",
    phase: "goal-loop-evaluated",
    title: "Goal loop continuation brief recorded",
    summary: `${iteration.continuationVerdict}: ${decision.summary}`,
    artifactRef: brief.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `goal-loop-continuation-brief:${brief.id}`,
    changeId,
    decisionType: "planning.goal-loop.evaluate",
    status: "completed",
    label: "Goal loop continuation brief evaluated",
    summary: decision.summary,
    targetId: brief.id,
    runId: null,
    artifact: brief.artifact,
    actionId: "planning.goal-loop.evaluate",
    payload: {
      goalLoopDecisionId: decision.id,
      goalLoopIterationId: iteration.id,
      goalLoopContinuationBriefId: brief.id,
      decisionKind: decision.decisionKind,
      continuationVerdict: iteration.continuationVerdict,
      continuationState: iteration.continuationState,
      humanGateRequired: decision.humanGateRequired,
      executionStarted: false,
    },
    completedAt: new Date().toISOString(),
  });
  return { goalLoopDecision: decision, goalLoopIteration: iteration, goalLoopContinuationBrief: brief, executionStarted: false };
}
