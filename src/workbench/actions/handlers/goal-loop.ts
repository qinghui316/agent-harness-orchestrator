import { compileGoalLoopControllerPolicy, compileGoalLoopEvaluation, compileGoalLoopGateReadinessPreflight, readLatestGoalLoopNextStepPacket, recordGoalLoopFeedback, type CompileGoalLoopGateReadinessPreflightOptions, type GoalLoopContinuationBrief, type GoalLoopControllerPolicy, type GoalLoopDecision, type GoalLoopFeedback, type GoalLoopGateReadinessPreflight, type GoalLoopIteration, type GoalLoopNextStepPacket } from "../../../goal-loop/manager.js";
import { assertWritableMemory } from "../../../memory/resolver.js";
import type { ManagedProject } from "../../../types/index.js";
import { recordWorkbenchDecision } from "../../decisions.js";
import { emitAssistantEvent } from "../../live-events.js";
import { resolveTopic } from "../../topic-resolver.js";
import { appendTopicThreadEntry } from "../../topic-thread.js";
import type { WorkbenchWorkflowActionRequest, WorkbenchLiveSink } from "../../types.js";
import { controlledLoopAssistantMessage, controlledLoopFeedbackRecordedMessage, controlledLoopResultLabel } from "../../user-surface/controlled-loop-results.js";
import { currentGateSnapshotFromRequest } from "../visible-goal-loop-current-gate.js";
import type { WorkbenchActionHandlerMap } from "../dispatcher.js";

type GoalLoopWorkbenchActionType =
  | "planning.goal-loop.evaluate"
  | "planning.goal-loop.feedback.evaluate"
  | "planning.goal-loop.controller.refresh"
  | "planning.goal-loop.gate-readiness.prepare";

export type GoalLoopGateReadinessPreflightInternalOptions = Pick<
  CompileGoalLoopGateReadinessPreflightOptions,
  "sourceGoalLoopGateReadinessPreflightId" | "controlledSchedulerPostStepRoutingSupport"
>;

export function buildGoalLoopActionHandlers(): Pick<WorkbenchActionHandlerMap, GoalLoopWorkbenchActionType> {
  return {
    "planning.goal-loop.evaluate": async (project, changeId, request, live) => evaluateGoalLoopDecision(project, changeId, request, live),
    "planning.goal-loop.feedback.evaluate": async (project, changeId, request, live) => evaluateGoalLoopFeedback(project, changeId, request, live),
    "planning.goal-loop.controller.refresh": async (project, changeId, request, live) => refreshGoalLoopControllerPolicy(project, changeId, request, live),
    "planning.goal-loop.gate-readiness.prepare": async (project, changeId, request, live) => prepareGoalLoopGateReadinessPreflight(project, changeId, request, live),
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
    text: controlledLoopAssistantMessage("planning.goal-loop.evaluate") ?? decision.summary,
    artifact: brief.artifact,
  });
  emitAssistantEvent(live, {
    runId: brief.id,
    kind: "file-change",
    phase: "goal-loop-evaluated",
    title: controlledLoopResultLabel("planning.goal-loop.evaluate") ?? "评估下一步",
    summary: controlledLoopAssistantMessage("planning.goal-loop.evaluate") ?? decision.summary,
    artifactRef: brief.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `goal-loop-continuation-brief:${brief.id}`,
    changeId,
    decisionType: "planning.goal-loop.evaluate",
    status: "completed",
    label: controlledLoopResultLabel("planning.goal-loop.evaluate") ?? "评估下一步",
    summary: controlledLoopAssistantMessage("planning.goal-loop.evaluate") ?? decision.summary,
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
    text: controlledLoopFeedbackRecordedMessage(),
    artifact: feedback.artifact,
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "goal-loop-feedback-evaluated",
    text: controlledLoopAssistantMessage("planning.goal-loop.feedback.evaluate") ?? decision.summary,
    artifact: brief.artifact,
  });
  emitAssistantEvent(live, {
    runId: brief.id,
    kind: "file-change",
    phase: "goal-loop-feedback-evaluated",
    title: controlledLoopResultLabel("planning.goal-loop.feedback.evaluate") ?? "根据反馈重新评估",
    summary: controlledLoopAssistantMessage("planning.goal-loop.feedback.evaluate") ?? decision.summary,
    artifactRef: brief.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `goal-loop-feedback:${feedback.id}`,
    changeId,
    decisionType: "planning.goal-loop.feedback.evaluate",
    status: "completed",
    label: controlledLoopResultLabel("planning.goal-loop.feedback.evaluate") ?? "根据反馈重新评估",
    summary: controlledLoopAssistantMessage("planning.goal-loop.feedback.evaluate") ?? decision.summary,
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

export async function refreshGoalLoopControllerPolicy(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ goalLoopControllerPolicy: GoalLoopControllerPolicy; executionStarted: false }> {
  if (!request.changeId) throw new Error("planning.goal-loop.controller.refresh requires changeId.");
  if (request.changeId !== changeId) throw new Error("planning.goal-loop.controller.refresh changeId scope mismatch.");
  if (!request.goalLoopNextStepPacketId) throw new Error("planning.goal-loop.controller.refresh requires goalLoopNextStepPacketId.");
  const currentGate = currentGateSnapshotFromRequest(request);
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Goal loop controller policy");
  const policy = await compileGoalLoopControllerPolicy(memory, changePath, {
    currentGate,
    goalLoopNextStepPacketId: request.goalLoopNextStepPacketId,
    requireCurrentGateMatch: true,
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "goal-loop-controller-policy-refreshed",
    text: controlledLoopAssistantMessage("planning.goal-loop.controller.refresh") ?? policy.summary,
    artifact: policy.artifact,
  });
  emitAssistantEvent(live, {
    runId: policy.id,
    kind: "file-change",
    phase: "goal-loop-controller-policy-refreshed",
    title: controlledLoopResultLabel("planning.goal-loop.controller.refresh") ?? "刷新下一步判断",
    summary: controlledLoopAssistantMessage("planning.goal-loop.controller.refresh") ?? policy.summary,
    artifactRef: policy.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `goal-loop-controller-policy:${policy.id}`,
    changeId,
    decisionType: "planning.goal-loop.controller.refresh",
    status: "completed",
    label: controlledLoopResultLabel("planning.goal-loop.controller.refresh") ?? "刷新下一步判断",
    summary: controlledLoopAssistantMessage("planning.goal-loop.controller.refresh") ?? policy.summary,
    targetId: policy.id,
    runId: null,
    artifact: policy.artifact,
    actionId: "planning.goal-loop.controller.refresh",
    payload: {
      goalLoopControllerPolicyId: policy.id,
      goalLoopDecisionId: policy.sourceGoalLoopDecisionId,
      goalLoopIterationId: policy.sourceGoalLoopIterationId,
      goalLoopContinuationBriefId: policy.sourceGoalLoopContinuationBriefId,
      goalLoopNextStepPacketId: policy.sourceGoalLoopNextStepPacketId,
      goalLoopCurrentGateActionType: policy.currentGate?.actionType,
      currentGateScope: policy.currentGate?.scope,
      controllerVerdict: policy.verdict,
      controllerGateStatus: policy.gateStatus,
      humanGateRequired: policy.humanGateRequired,
      executionStarted: false,
    },
    completedAt: new Date().toISOString(),
  });
  return { goalLoopControllerPolicy: policy, executionStarted: false };
}

export async function prepareGoalLoopGateReadinessPreflight(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
  options?: GoalLoopGateReadinessPreflightInternalOptions,
): Promise<{ goalLoopGateReadinessPreflight: GoalLoopGateReadinessPreflight; executionStarted: false }> {
  if (!request.changeId) throw new Error("planning.goal-loop.gate-readiness.prepare requires changeId.");
  if (request.changeId !== changeId) throw new Error("planning.goal-loop.gate-readiness.prepare changeId scope mismatch.");
  if (!request.goalLoopNextStepPacketId) throw new Error("planning.goal-loop.gate-readiness.prepare requires goalLoopNextStepPacketId.");
  if (!request.goalLoopControllerPolicyId) throw new Error("planning.goal-loop.gate-readiness.prepare requires goalLoopControllerPolicyId.");
  const currentGate = currentGateSnapshotFromRequest(request, "planning.goal-loop.gate-readiness.prepare");
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Goal loop gate readiness preflight");
  const preflight = await compileGoalLoopGateReadinessPreflight(memory, changePath, {
    goalLoopNextStepPacketId: request.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: request.goalLoopControllerPolicyId,
    currentGate,
    sourceGoalLoopGateReadinessPreflightId: options?.sourceGoalLoopGateReadinessPreflightId,
    controlledSchedulerPostStepRoutingSupport: options?.controlledSchedulerPostStepRoutingSupport,
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "goal-loop-gate-readiness-preflight-recorded",
    text: controlledLoopAssistantMessage("planning.goal-loop.gate-readiness.prepare") ?? preflight.summary,
    artifact: preflight.artifact,
  });
  emitAssistantEvent(live, {
    runId: preflight.id,
    kind: "file-change",
    phase: "goal-loop-gate-readiness-preflight-recorded",
    title: controlledLoopResultLabel("planning.goal-loop.gate-readiness.prepare") ?? "检查当前步骤",
    summary: controlledLoopAssistantMessage("planning.goal-loop.gate-readiness.prepare") ?? preflight.summary,
    artifactRef: preflight.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `goal-loop-gate-readiness-preflight:${preflight.id}`,
    changeId,
    decisionType: "planning.goal-loop.gate-readiness.prepare",
    status: "completed",
    label: controlledLoopResultLabel("planning.goal-loop.gate-readiness.prepare") ?? "检查当前步骤",
    summary: controlledLoopAssistantMessage("planning.goal-loop.gate-readiness.prepare") ?? preflight.summary,
    targetId: preflight.id,
    runId: null,
    artifact: preflight.artifact,
    actionId: "planning.goal-loop.gate-readiness.prepare",
    payload: {
      goalLoopGateReadinessPreflightId: preflight.id,
      goalLoopControllerPolicyId: preflight.sourceGoalLoopControllerPolicyId,
      goalLoopDecisionId: preflight.sourceGoalLoopDecisionId,
      goalLoopIterationId: preflight.sourceGoalLoopIterationId,
      goalLoopContinuationBriefId: preflight.sourceGoalLoopContinuationBriefId,
      goalLoopNextStepPacketId: preflight.sourceGoalLoopNextStepPacketId,
      goalLoopCurrentGateActionType: preflight.currentGate.actionType,
      currentGateScope: preflight.currentGate.scope,
      concreteGateInvoked: preflight.concreteGateInvoked,
      toolPolicyAuthorizedConcreteGate: preflight.toolPolicyAuthorizedConcreteGate,
      humanGateRequired: preflight.humanGateRequired,
      executionStarted: false,
    },
    completedAt: new Date().toISOString(),
  });
  return { goalLoopGateReadinessPreflight: preflight, executionStarted: false };
}
