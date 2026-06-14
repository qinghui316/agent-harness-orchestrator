import { compileGoalLoopEvaluation, readLatestGoalLoopNextStepPacket, recordGoalLoopFeedback, renderGoalLoopContinuationBriefMarkdown, renderGoalLoopFeedbackAcknowledgementMarkdown, type GoalLoopContinuationBrief, type GoalLoopDecision, type GoalLoopFeedback, type GoalLoopIteration, type GoalLoopNextStepPacket } from "../../../goal-loop/manager.js";
import { assertWritableMemory } from "../../../memory/resolver.js";
import type { ManagedProject } from "../../../types/index.js";
import { recordWorkbenchDecision } from "../../decisions.js";
import { emitAssistantEvent } from "../../live-events.js";
import { resolveTopic } from "../../topic-resolver.js";
import { appendTopicThreadEntry } from "../../topic-thread.js";
import type { WorkbenchWorkflowActionRequest, WorkbenchLiveSink } from "../../types.js";
import type { WorkbenchActionHandlerMap } from "../dispatcher.js";

type GoalLoopWorkbenchActionType = "planning.goal-loop.evaluate" | "planning.goal-loop.feedback.evaluate";

export function buildGoalLoopActionHandlers(): Pick<WorkbenchActionHandlerMap, GoalLoopWorkbenchActionType> {
  return {
    "planning.goal-loop.evaluate": async (project, changeId, request, live) => evaluateGoalLoopDecision(project, changeId, request, live),
    "planning.goal-loop.feedback.evaluate": async (project, changeId, request, live) => evaluateGoalLoopFeedback(project, changeId, request, live),
  };
}

export async function evaluateGoalLoopDecision(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ goalLoopDecision: GoalLoopDecision; goalLoopIteration: GoalLoopIteration; goalLoopContinuationBrief: GoalLoopContinuationBrief; goalLoopNextStepPacket: GoalLoopNextStepPacket; executionStarted: false }> {
  if (!request.changeId) throw new Error("planning.goal-loop.evaluate requires changeId.");
  if (request.changeId !== changeId) throw new Error("planning.goal-loop.evaluate changeId scope mismatch.");
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Goal loop decision");
  const { goalLoopDecision: decision, goalLoopIteration: iteration, goalLoopContinuationBrief: brief, goalLoopNextStepPacket: packet } = await compileGoalLoopEvaluation(memory, changePath);
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
      goalLoopNextStepPacketId: packet.id,
      decisionKind: decision.decisionKind,
      continuationVerdict: iteration.continuationVerdict,
      continuationState: iteration.continuationState,
      humanGateRequired: decision.humanGateRequired,
      executionStarted: false,
    },
    completedAt: new Date().toISOString(),
  });
  return { goalLoopDecision: decision, goalLoopIteration: iteration, goalLoopContinuationBrief: brief, goalLoopNextStepPacket: packet, executionStarted: false };
}

export async function evaluateGoalLoopFeedback(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{
  goalLoopFeedback: GoalLoopFeedback;
  goalLoopDecision: GoalLoopDecision;
  goalLoopIteration: GoalLoopIteration;
  goalLoopContinuationBrief: GoalLoopContinuationBrief;
  goalLoopNextStepPacket: GoalLoopNextStepPacket;
  executionStarted: false;
}> {
  if (!request.changeId) throw new Error("planning.goal-loop.feedback.evaluate requires changeId.");
  if (request.changeId !== changeId) throw new Error("planning.goal-loop.feedback.evaluate changeId scope mismatch.");
  if (!request.goalLoopNextStepPacketId) throw new Error("planning.goal-loop.feedback.evaluate requires goalLoopNextStepPacketId.");
  const feedbackText = request.feedback?.trim();
  if (!feedbackText) throw new Error("planning.goal-loop.feedback.evaluate requires feedback.");

  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Goal loop feedback");
  const currentPacket = await readLatestGoalLoopNextStepPacket(memory, changePath);
  if (currentPacket.id !== request.goalLoopNextStepPacketId || currentPacket.changeId !== changeId || currentPacket.executionStarted !== false) {
    throw new Error("planning.goal-loop.feedback.evaluate target is stale or no longer visible.");
  }
  if (!currentPacket.recommendedAction) {
    throw new Error("planning.goal-loop.feedback.evaluate requires a visible recommended action gate.");
  }
  const feedback = await recordGoalLoopFeedback(memory, changePath, {
    goalLoopNextStepPacketId: request.goalLoopNextStepPacketId,
    feedbackText,
    currentGate: {
      actionType: currentPacket.recommendedAction.actionType,
      scope: currentPacket.recommendedAction.scope,
    },
  });
  const { goalLoopDecision: decision, goalLoopIteration: iteration, goalLoopContinuationBrief: brief, goalLoopNextStepPacket: packet } = await compileGoalLoopEvaluation(memory, changePath, {
    trigger: "user-feedback-evaluate",
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "goal-loop-feedback-recorded",
    text: renderGoalLoopFeedbackAcknowledgementMarkdown(feedback),
    artifact: feedback.artifact,
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "goal-loop-feedback-evaluated",
    text: renderGoalLoopContinuationBriefMarkdown(brief),
    artifact: brief.artifact,
  });
  emitAssistantEvent(live, {
    runId: brief.id,
    kind: "file-change",
    phase: "goal-loop-feedback-evaluated",
    title: "Goal loop feedback recorded and re-evaluated",
    summary: `${iteration.continuationVerdict}: ${decision.summary}`,
    artifactRef: brief.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `goal-loop-feedback:${feedback.id}`,
    changeId,
    decisionType: "planning.goal-loop.feedback.evaluate",
    status: "completed",
    label: "Goal loop feedback re-evaluated",
    summary: decision.summary,
    targetId: feedback.id,
    runId: null,
    artifact: feedback.artifact,
    actionId: "planning.goal-loop.feedback.evaluate",
    payload: {
      goalLoopFeedbackId: feedback.id,
      sourceGoalLoopNextStepPacketId: feedback.sourceGoalLoopNextStepPacketId,
      goalLoopDecisionId: decision.id,
      goalLoopIterationId: iteration.id,
      goalLoopContinuationBriefId: brief.id,
      goalLoopNextStepPacketId: packet.id,
      currentGateActionType: feedback.currentGate.actionType,
      currentGateScope: feedback.currentGate.scope,
      decisionKind: decision.decisionKind,
      continuationVerdict: iteration.continuationVerdict,
      continuationState: iteration.continuationState,
      humanGateRequired: decision.humanGateRequired,
      executionStarted: false,
    },
    completedAt: new Date().toISOString(),
  });
  return { goalLoopFeedback: feedback, goalLoopDecision: decision, goalLoopIteration: iteration, goalLoopContinuationBrief: brief, goalLoopNextStepPacket: packet, executionStarted: false };
}
