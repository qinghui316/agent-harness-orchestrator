import {
  assessGoalLoopNextStepPacketFreshness,
  readLatestGoalLoopContinuationBrief,
  readLatestGoalLoopControllerPolicy,
  readLatestGoalLoopDecision,
  readLatestGoalLoopGateReadinessPreflight,
  readLatestGoalLoopIteration,
  readLatestGoalLoopNextStepPacket,
  type GoalLoopCurrentGateSnapshot,
} from "../../goal-loop/manager.js";
import type { ResolvedMemory } from "../../types/index.js";
import {
  validateWorkflowActionRequiredTargets,
  type WorkflowActionScopeCarrier,
} from "../../workflow-actions/registry.js";
import {
  assertCurrentGateContract,
  buildCurrentGateCarrier,
  buildRequestedCurrentGateFromScope,
  currentGateScopeMatches,
} from "../../workflow-actions/current-gate.js";
import { schedulerExecutionModeAssessmentsEqual } from "../../workflow-scheduler/execution-mode.js";
import type { SchedulerExecutionModeAssessment } from "../../workflow-scheduler/types.js";

export interface GoalLoopAssistedConcreteGateConfirmationOptions {
  visibleGate?: WorkflowActionScopeCarrier & { enabled?: boolean };
}

export async function assertGoalLoopAssistedConcreteGateConfirmation(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  request: WorkflowActionScopeCarrier,
  options: GoalLoopAssistedConcreteGateConfirmationOptions = {},
): Promise<void> {
  if (!request.goalLoopGateReadinessPreflightId) return;
  if (!request.actionType) throw new Error("Goal Loop-assisted concrete gate confirmation requires actionType.");
  if (request.actionType.startsWith("planning.goal-loop.")) {
    throw new Error("Goal Loop-assisted concrete gate confirmation cannot target recursive Goal Loop actions.");
  }
  if (request.changeId && request.changeId !== changeId) {
    throw new Error("Goal Loop-assisted concrete gate confirmation changeId scope mismatch.");
  }

  const [decision, iteration, brief, packet, policy, preflight] = await Promise.all([
    readLatestGoalLoopDecision(memory, changePath),
    readLatestGoalLoopIteration(memory, changePath),
    readLatestGoalLoopContinuationBrief(memory, changePath),
    readLatestGoalLoopNextStepPacket(memory, changePath),
    readLatestGoalLoopControllerPolicy(memory, changePath),
    readLatestGoalLoopGateReadinessPreflight(memory, changePath),
  ]);
  if (preflight.id !== request.goalLoopGateReadinessPreflightId) {
    throw new Error("Goal Loop-assisted concrete gate preflight target is stale.");
  }
  if (decision.changeId !== changeId || iteration.changeId !== changeId || brief.changeId !== changeId || packet.changeId !== changeId || policy.changeId !== changeId || preflight.changeId !== changeId) {
    throw new Error("Goal Loop-assisted concrete gate change scope mismatch.");
  }
  if (decision.executionStarted !== false || iteration.executionStarted !== false || brief.executionStarted !== false || packet.executionStarted !== false || policy.executionStarted !== false || preflight.executionStarted !== false) {
    throw new Error("Goal Loop-assisted concrete gate requires non-executing Goal Loop evidence.");
  }
  if (iteration.goalLoopDecisionId !== decision.id || brief.sourceGoalLoopDecisionId !== decision.id || brief.sourceGoalLoopIterationId !== iteration.id) {
    throw new Error("Goal Loop-assisted concrete gate decision/iteration/brief lineage mismatch.");
  }
  if (packet.sourceGoalLoopDecisionId !== decision.id || packet.sourceGoalLoopIterationId !== iteration.id || packet.sourceGoalLoopContinuationBriefId !== brief.id) {
    throw new Error("Goal Loop-assisted concrete gate packet lineage mismatch.");
  }
  if (
    policy.sourceGoalLoopDecisionId !== decision.id
    || policy.sourceGoalLoopIterationId !== iteration.id
    || policy.sourceGoalLoopContinuationBriefId !== brief.id
    || policy.sourceGoalLoopNextStepPacketId !== packet.id
    || policy.verdict !== "recommend-existing-gate"
    || policy.gateStatus !== "matches-current-gate"
    || !policy.recommendedAction
    || !policy.currentGate
  ) {
    throw new Error("Goal Loop-assisted concrete gate controller policy target is stale.");
  }
  if (
    preflight.sourceGoalLoopDecisionId !== decision.id
    || preflight.sourceGoalLoopIterationId !== iteration.id
    || preflight.sourceGoalLoopContinuationBriefId !== brief.id
    || preflight.sourceGoalLoopNextStepPacketId !== packet.id
    || preflight.sourceGoalLoopControllerPolicyId !== policy.id
    || preflight.status !== "ready"
    || preflight.concreteGateInvoked !== false
    || preflight.toolPolicyAuthorizedConcreteGate !== false
  ) {
    throw new Error("Goal Loop-assisted concrete gate preflight target is stale.");
  }
  if (!packet.recommendedAction) {
    throw new Error("Goal Loop-assisted concrete gate requires a recommended concrete gate.");
  }
  assertSchedulerExecutionModeChainMatches([
    ["iteration", iteration.schedulerExecutionMode],
    ["continuation brief", brief.schedulerExecutionMode],
    ["next-step packet", packet.schedulerExecutionMode],
    ["controller policy", policy.schedulerExecutionMode],
    ["gate-readiness preflight", preflight.schedulerExecutionMode],
  ], decision.schedulerExecutionMode);
  const freshness = await assessGoalLoopNextStepPacketFreshness(memory, changePath, packet);
  if (freshness.verdict !== "fresh") {
    throw new Error(`Goal Loop-assisted concrete gate packet is stale: ${freshness.reason}.`);
  }

  assertGateMatches("packet", changeId, request.actionType, packet.recommendedAction, preflight.currentGate);
  assertGateMatches("policy recommended action", changeId, request.actionType, policy.recommendedAction, preflight.currentGate);
  assertGateMatches("policy current gate", changeId, request.actionType, policy.currentGate, preflight.currentGate);
  assertGateMatches("preflight recommended action", changeId, request.actionType, preflight.recommendedAction, preflight.currentGate);

  const expectedConcreteGate = buildCurrentGateCarrier(preflight.currentGate.scope, request.actionType, changeId);
  assertCurrentGateContract(expectedConcreteGate as WorkflowActionScopeCarrier & Record<string, unknown>, "Goal Loop-assisted concrete gate");
  const requestedConcreteGate = buildRequestedCurrentGateFromScope({
    changeId,
    actionType: request.actionType,
    expectedScope: preflight.currentGate.scope,
    request,
  });
  if (!currentGateScopeMatches({ changeId, actionType: request.actionType, expectedScope: preflight.currentGate.scope, actual: requestedConcreteGate })) {
    throw new Error("Goal Loop-assisted concrete gate request scope mismatch.");
  }
  if (options.visibleGate) {
    if (options.visibleGate.enabled !== true) {
      throw new Error("Goal Loop-assisted concrete gate visible target is disabled.");
    }
    if (options.visibleGate.changeId && options.visibleGate.changeId !== changeId) {
      throw new Error("Goal Loop-assisted concrete gate visible target is stale.");
    }
    const visibleConcreteGate = buildRequestedCurrentGateFromScope({
      changeId,
      actionType: request.actionType,
      expectedScope: preflight.currentGate.scope,
      request: options.visibleGate,
    });
    if (!currentGateScopeMatches({ changeId, actionType: request.actionType, expectedScope: preflight.currentGate.scope, actual: visibleConcreteGate })) {
      throw new Error("Goal Loop-assisted concrete gate visible target is stale.");
    }
    if (options.visibleGate.goalLoopGateReadinessPreflightId && options.visibleGate.goalLoopGateReadinessPreflightId !== preflight.id) {
      throw new Error("Goal Loop-assisted concrete gate visible preflight scope mismatch.");
    }
  }
  const requiredTargetIssues = validateWorkflowActionRequiredTargets(expectedConcreteGate);
  if (requiredTargetIssues.length) {
    throw new Error(`Goal Loop-assisted concrete gate target is incomplete: ${requiredTargetIssues.map((issue) => issue.label).join(", ")}.`);
  }
}

function assertSchedulerExecutionModeChainMatches(
  candidates: Array<[string, SchedulerExecutionModeAssessment]>,
  expected: SchedulerExecutionModeAssessment,
): void {
  for (const [label, candidate] of candidates) {
    if (!schedulerExecutionModeAssessmentsEqual(expected, candidate)) {
      throw new Error(`Goal Loop-assisted concrete gate scheduler execution mode mismatch: ${label}.`);
    }
  }
}

function assertGateMatches(
  label: string,
  changeId: string,
  actionType: string,
  expected: { actionType: string; scope: Record<string, string | string[]> },
  actual: GoalLoopCurrentGateSnapshot,
): void {
  if (expected.actionType !== actionType || actual.actionType !== actionType) {
    throw new Error(`Goal Loop-assisted concrete gate ${label} action mismatch.`);
  }
  if (!currentGateScopeMatches({ changeId, actionType, expectedScope: expected.scope, actual })) {
    throw new Error(`Goal Loop-assisted concrete gate ${label} scope mismatch.`);
  }
}
