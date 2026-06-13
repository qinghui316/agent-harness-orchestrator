import { compileGoalLoopEvaluation, renderGoalLoopIterationMarkdown, type GoalLoopDecision, type GoalLoopIteration } from "../../../goal-loop/manager.js";
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
): Promise<{ goalLoopDecision: GoalLoopDecision; goalLoopIteration: GoalLoopIteration; executionStarted: false }> {
  if (!request.changeId) throw new Error("planning.goal-loop.evaluate requires changeId.");
  if (request.changeId !== changeId) throw new Error("planning.goal-loop.evaluate changeId scope mismatch.");
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Goal loop decision");
  const { goalLoopDecision: decision, goalLoopIteration: iteration } = await compileGoalLoopEvaluation(memory, changePath);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "goal-loop-evaluated",
    text: renderGoalLoopIterationMarkdown(iteration),
    artifact: iteration.artifact,
  });
  emitAssistantEvent(live, {
    runId: iteration.id,
    kind: "file-change",
    phase: "goal-loop-evaluated",
    title: "Goal loop iteration recorded",
    summary: `${iteration.continuationVerdict}: ${decision.summary}`,
    artifactRef: iteration.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `goal-loop-iteration:${iteration.id}`,
    changeId,
    decisionType: "planning.goal-loop.evaluate",
    status: "completed",
    label: "Goal loop iteration evaluated",
    summary: decision.summary,
    targetId: iteration.id,
    runId: null,
    artifact: iteration.artifact,
    actionId: "planning.goal-loop.evaluate",
    payload: {
      goalLoopDecisionId: decision.id,
      goalLoopIterationId: iteration.id,
      decisionKind: decision.decisionKind,
      continuationVerdict: iteration.continuationVerdict,
      humanGateRequired: decision.humanGateRequired,
      executionStarted: false,
    },
    completedAt: new Date().toISOString(),
  });
  return { goalLoopDecision: decision, goalLoopIteration: iteration, executionStarted: false };
}
