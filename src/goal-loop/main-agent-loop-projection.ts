import type {
  GoalLoopControllerGateStatus,
  GoalLoopControllerVerdict,
} from "./types.js";

export type MainAgentLoopProjectionAuthority = "non-executing-main-agent-loop-projection";
export type MainAgentLoopProjectionStatus =
  | "recommend-existing-gate"
  | "wait"
  | "blocked"
  | "close-ready"
  | "unavailable";

export interface MainAgentLoopProjectionRecommendedAction {
  actionType: string;
  scope: Record<string, string | string[]>;
  reason: string;
}

export interface MainAgentLoopProjection {
  authority: MainAgentLoopProjectionAuthority;
  status: MainAgentLoopProjectionStatus;
  changeId?: string;
  summary: string;
  reason: string;
  recommendedAction?: MainAgentLoopProjectionRecommendedAction;
  currentGateActionType?: string;
  goalLoopDecisionId?: string;
  goalLoopIterationId?: string;
  goalLoopNextStepPacketId?: string;
  goalLoopControllerPolicyId?: string;
  goalLoopGateReadinessPreflightId?: string;
  evidenceRefs: string[];
  forbiddenAuthority: {
    workflowTruth: false;
    actionExecution: false;
    sourceMutation: false;
    schedulerDispatch: false;
    applyOrClose: false;
    remoteOrMerge: false;
    harnessEvolution: false;
  };
  executionStarted: false;
}

export interface MainAgentLoopProjectionGoalLoopEvidence {
  changeId: string;
  summary: string;
  decisionKind?: string;
  continuationState?: string;
  recommendationState?: string;
  completionStatus?: string;
  recommendedAction?: MainAgentLoopProjectionRecommendedAction;
  goalLoopDecisionId?: string;
  goalLoopIterationId?: string;
  goalLoopNextStepPacketId?: string;
  controllerPolicy?: {
    id: string;
    verdict?: GoalLoopControllerVerdict | string;
    gateStatus?: GoalLoopControllerGateStatus | string;
    summary?: string;
    executionStarted: false;
  };
  gateReadinessPreflight?: {
    id: string;
    executionStarted: false;
    concreteGateInvoked: false;
  };
  evidenceRefs?: string[];
  executionStarted: false;
}

export interface MainAgentLoopProjectionCurrentGate {
  actionType?: string;
  changeId?: string;
  scope?: Record<string, string | string[]>;
  enabled: boolean;
  requiresConfirmation: boolean;
}

export interface BuildMainAgentLoopProjectionInput {
  changeId?: string;
  goalLoop?: MainAgentLoopProjectionGoalLoopEvidence | null;
  currentGate?: MainAgentLoopProjectionCurrentGate | null;
}

const forbiddenAuthority: MainAgentLoopProjection["forbiddenAuthority"] = {
  workflowTruth: false,
  actionExecution: false,
  sourceMutation: false,
  schedulerDispatch: false,
  applyOrClose: false,
  remoteOrMerge: false,
  harnessEvolution: false,
};

export function buildMainAgentLoopProjection(input: BuildMainAgentLoopProjectionInput): MainAgentLoopProjection {
  const goalLoop = input.goalLoop ?? null;
  if (!goalLoop) {
    return baseProjection({
      status: "unavailable",
      changeId: input.changeId,
      summary: "Main-agent loop projection is unavailable.",
      reason: "No fresh Goal Loop evidence is visible for the selected Change.",
    });
  }

  if (goalLoop.executionStarted !== false) {
    return baseProjection({
      status: "unavailable",
      changeId: goalLoop.changeId,
      goalLoop,
      summary: "Main-agent loop projection is unavailable.",
      reason: "Goal Loop evidence must be non-executing before it can be projected.",
    });
  }

  if (isBlocked(goalLoop)) {
    return baseProjection({
      status: "blocked",
      changeId: goalLoop.changeId,
      goalLoop,
      summary: goalLoop.summary,
      reason: "Current Goal Loop evidence is blocked; the main Agent should ask for user direction or new evidence.",
    });
  }

  if (isCloseReady(goalLoop)) {
    return baseProjection({
      status: "close-ready",
      changeId: goalLoop.changeId,
      goalLoop,
      summary: goalLoop.summary,
      reason: "Current Goal Loop evidence may be ready for the existing human close gate; this projection does not close the Change.",
    });
  }

  const recommendedAction = goalLoop.recommendedAction;
  if (!recommendedAction) {
    return baseProjection({
      status: "wait",
      changeId: goalLoop.changeId,
      goalLoop,
      summary: goalLoop.summary,
      reason: "Current Goal Loop evidence does not recommend an existing Harness gate.",
    });
  }

  const currentGate = input.currentGate ?? null;
  if (!currentGate) {
    return baseProjection({
      status: "wait",
      changeId: goalLoop.changeId,
      goalLoop,
      recommendedAction,
      summary: goalLoop.summary,
      reason: "Goal Loop evidence recommends an existing gate, but no current visible gate was supplied.",
    });
  }
  if (!currentGate.enabled || !currentGate.requiresConfirmation) {
    return baseProjection({
      status: "wait",
      changeId: goalLoop.changeId,
      goalLoop,
      recommendedAction,
      currentGate,
      summary: goalLoop.summary,
      reason: "The current visible gate is not enabled and confirmation-backed.",
    });
  }
  if (currentGate.changeId && currentGate.changeId !== goalLoop.changeId) {
    return baseProjection({
      status: "unavailable",
      changeId: goalLoop.changeId,
      goalLoop,
      recommendedAction,
      currentGate,
      summary: "Main-agent loop projection is unavailable.",
      reason: "The current visible gate belongs to a different Change.",
    });
  }
  if (currentGate.actionType !== recommendedAction.actionType) {
    return baseProjection({
      status: "wait",
      changeId: goalLoop.changeId,
      goalLoop,
      recommendedAction,
      currentGate,
      summary: goalLoop.summary,
      reason: "The current visible gate action type does not match Goal Loop evidence.",
    });
  }
  if (!currentGateScopeMatchesRecommendation(currentGate, recommendedAction, goalLoop.changeId)) {
    return baseProjection({
      status: "wait",
      changeId: goalLoop.changeId,
      goalLoop,
      recommendedAction,
      currentGate,
      summary: goalLoop.summary,
      reason: "The current visible gate target scope does not match Goal Loop evidence.",
    });
  }

  const controller = goalLoop.controllerPolicy;
  if (!controller || controller.executionStarted !== false) {
    return baseProjection({
      status: "wait",
      changeId: goalLoop.changeId,
      goalLoop,
      recommendedAction,
      currentGate,
      summary: goalLoop.summary,
      reason: "A fresh non-executing Goal Loop controller policy is required before recommending the current gate.",
    });
  }
  if (controller.verdict !== "recommend-existing-gate" || controller.gateStatus !== "matches-current-gate") {
    return baseProjection({
      status: "wait",
      changeId: goalLoop.changeId,
      goalLoop,
      recommendedAction,
      currentGate,
      summary: goalLoop.summary,
      reason: controller.summary ?? "Goal Loop controller policy does not match the current visible gate.",
    });
  }

  return baseProjection({
    status: "recommend-existing-gate",
    changeId: goalLoop.changeId,
    goalLoop,
    recommendedAction,
    currentGate,
    summary: goalLoop.summary,
    reason: recommendedAction.reason,
  });
}

function baseProjection(input: {
  status: MainAgentLoopProjectionStatus;
  changeId?: string;
  goalLoop?: MainAgentLoopProjectionGoalLoopEvidence;
  recommendedAction?: MainAgentLoopProjectionRecommendedAction;
  currentGate?: MainAgentLoopProjectionCurrentGate;
  summary: string;
  reason: string;
}): MainAgentLoopProjection {
  return {
    authority: "non-executing-main-agent-loop-projection",
    status: input.status,
    changeId: input.changeId,
    summary: input.summary,
    reason: input.reason,
    recommendedAction: input.recommendedAction ? {
      actionType: input.recommendedAction.actionType,
      scope: input.recommendedAction.scope,
      reason: input.recommendedAction.reason,
    } : undefined,
    currentGateActionType: input.currentGate?.actionType,
    goalLoopDecisionId: input.goalLoop?.goalLoopDecisionId,
    goalLoopIterationId: input.goalLoop?.goalLoopIterationId,
    goalLoopNextStepPacketId: input.goalLoop?.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: input.goalLoop?.controllerPolicy?.id,
    goalLoopGateReadinessPreflightId: input.goalLoop?.gateReadinessPreflight?.id,
    evidenceRefs: input.goalLoop?.evidenceRefs ?? [],
    forbiddenAuthority,
    executionStarted: false,
  };
}

function isBlocked(goalLoop: MainAgentLoopProjectionGoalLoopEvidence): boolean {
  return goalLoop.decisionKind === "blocked"
    || goalLoop.continuationState === "blocked"
    || goalLoop.recommendationState === "blocked"
    || goalLoop.completionStatus === "blocked";
}

function isCloseReady(goalLoop: MainAgentLoopProjectionGoalLoopEvidence): boolean {
  return goalLoop.decisionKind === "completed-ready-for-human-close-gate"
    || goalLoop.continuationState === "ready-for-human-close-gate"
    || goalLoop.recommendationState === "ready-for-human-close-gate"
    || goalLoop.completionStatus === "ready-for-human-close-gate";
}

function currentGateScopeMatchesRecommendation(
  currentGate: MainAgentLoopProjectionCurrentGate,
  recommendedAction: MainAgentLoopProjectionRecommendedAction,
  changeId: string,
): boolean {
  const currentScope = currentGate.scope ?? {};
  for (const [key, expectedValue] of Object.entries(recommendedAction.scope)) {
    const expected = normalizeScopeValues(expectedValue);
    const actual = key === "changeId"
      ? normalizeScopeValues(currentScope.changeId ?? currentGate.changeId ?? changeId)
      : normalizeScopeValues(currentScope[key]);
    if (!scopeValuesEqual(expected, actual)) return false;
  }
  return true;
}

function normalizeScopeValues(value: string | string[] | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return [...value].sort();
  return [];
}

function scopeValuesEqual(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return left.length === right.length;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
