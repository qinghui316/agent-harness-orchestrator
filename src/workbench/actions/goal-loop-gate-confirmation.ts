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

export interface GoalLoopAssistedConcreteGateConfirmationOptions {
  visibleGate?: WorkflowActionScopeCarrier;
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
  const freshness = await assessGoalLoopNextStepPacketFreshness(memory, changePath, packet);
  if (freshness.verdict !== "fresh") {
    throw new Error(`Goal Loop-assisted concrete gate packet is stale: ${freshness.reason}.`);
  }

  assertGateMatches("packet", changeId, request.actionType, packet.recommendedAction, preflight.currentGate);
  assertGateMatches("policy recommended action", changeId, request.actionType, policy.recommendedAction, preflight.currentGate);
  assertGateMatches("policy current gate", changeId, request.actionType, policy.currentGate, preflight.currentGate);
  assertGateMatches("preflight recommended action", changeId, request.actionType, preflight.recommendedAction, preflight.currentGate);

  const expectedConcreteGate = concreteGateCarrier(changeId, request.actionType, preflight.currentGate.scope);
  const requestedConcreteGate = concreteGateCarrierFromRequest(changeId, request.actionType, preflight.currentGate.scope, request);
  if (!concreteGateScopeMatches(changeId, request.actionType, preflight.currentGate.scope, requestedConcreteGate)) {
    throw new Error("Goal Loop-assisted concrete gate request scope mismatch.");
  }
  if (options.visibleGate) {
    const visibleConcreteGate = concreteGateCarrierFromRequest(changeId, request.actionType, preflight.currentGate.scope, options.visibleGate);
    if (!concreteGateScopeMatches(changeId, request.actionType, preflight.currentGate.scope, visibleConcreteGate)) {
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
  if (!concreteGateScopeMatches(changeId, actionType, expected.scope, actual)) {
    throw new Error(`Goal Loop-assisted concrete gate ${label} scope mismatch.`);
  }
}

function concreteGateScopeMatches(
  changeId: string,
  actionType: string,
  expectedScope: Record<string, string | string[]>,
  actual: GoalLoopCurrentGateSnapshot | WorkflowActionScopeCarrier,
): boolean {
  if (actual.actionType !== actionType) return false;
  for (const [key, expected] of Object.entries(expectedScope)) {
    const expectedValue = key === "changeId" ? changeId : expected;
    const actualRecord = actual as unknown as Record<string, unknown>;
    const nestedScope = actualRecord.scope as Record<string, unknown> | undefined;
    const actualValue = key === "changeId" ? actualRecord.changeId ?? nestedScope?.changeId ?? changeId : nestedScope?.[key] ?? actualRecord[key];
    if (!scopeValuesEqual(normalizeScopeValue(expectedValue), normalizeScopeValue(actualValue))) return false;
  }
  return true;
}

function concreteGateCarrier(
  changeId: string,
  actionType: string,
  scope: Record<string, string | string[]>,
): WorkflowActionScopeCarrier {
  return {
    actionType,
    changeId,
    ...scopeToCarrier(scope),
  };
}

function concreteGateCarrierFromRequest(
  changeId: string,
  actionType: string,
  expectedScope: Record<string, string | string[]>,
  request: WorkflowActionScopeCarrier,
): WorkflowActionScopeCarrier {
  return {
    actionType,
    changeId,
    ...readConcreteGateRequestScope(request, expectedScope),
  };
}

function readConcreteGateRequestScope(
  request: WorkflowActionScopeCarrier,
  expectedScope: Record<string, string | string[]>,
): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = {};
  const values = request as Record<string, unknown>;
  for (const key of Object.keys(expectedScope)) {
    if (key === "changeId") continue;
    const value = values[key];
    if (typeof value === "string") (result as Record<string, string | string[]>)[key] = value;
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) (result as Record<string, string | string[]>)[key] = value;
  }
  return result;
}

function normalizeScopeValue(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return [...value].sort();
  return [];
}

function scopeValuesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function scopeToCarrier(scope: Record<string, string | string[]>): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = {};
  for (const [key, value] of Object.entries(scope)) {
    (result as Record<string, string | string[]>)[key] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}
