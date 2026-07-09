import { buildGoalLoopCloseGateHandoffFromState, isGoalLoopCloseGateHandoffReadyState } from "../../../goal-loop/manager.js";
import { currentGateScopeMatches } from "../../../workflow-actions/current-gate.js";
import type { WorkbenchGoalLoopSummary, WorkpadNextAction } from "../../read-model-types.js";

type ScopeValue = string | string[] | undefined;

export type GoalLoopGateParityStatus =
  | "matches-current-gate"
  | "matches-close-gate"
  | "no-recommended-action"
  | "missing-close-gate"
  | "missing-scope"
  | "wrong-gate-kind"
  | "action-type-mismatch"
  | "change-id-mismatch"
  | "target-mismatch";

export interface GoalLoopGateParityResult {
  visible: boolean;
  status: GoalLoopGateParityStatus;
  mismatchedKey?: string;
}

export function assessGoalLoopSummaryCurrentGateParity(
  summary: WorkbenchGoalLoopSummary,
  nextAction: WorkpadNextAction,
): GoalLoopGateParityResult {
  if (isCloseReadySummary(summary)) {
    return assessCloseGateParity(summary, nextAction);
  }
  if (!summary.recommendedActionType) return { visible: true, status: "no-recommended-action" };
  if (!summary.recommendedActionScope) return { visible: false, status: "missing-scope" };
  if (nextAction.kind !== "workflow-action" || !nextAction.enabled || !nextAction.requiresConfirmation) {
    return { visible: false, status: "wrong-gate-kind" };
  }
  if (nextAction.actionType !== summary.recommendedActionType) {
    return { visible: false, status: "action-type-mismatch" };
  }

  const expectedChangeId = normalizeScopeValues(summary.recommendedActionScope.changeId);
  if (expectedChangeId.length !== 1 || expectedChangeId[0] !== summary.changeId) {
    return { visible: false, status: "change-id-mismatch", mismatchedKey: "changeId" };
  }
  if (nextAction.changeId && nextAction.changeId !== summary.changeId) {
    return { visible: false, status: "change-id-mismatch", mismatchedKey: "changeId" };
  }

  if (!currentGateScopeMatches({
    actionType: summary.recommendedActionType,
    changeId: summary.changeId,
    expectedScope: summary.recommendedActionScope,
    actual: nextAction,
  })) {
    for (const key of Object.keys(summary.recommendedActionScope)) {
      if (key === "changeId") continue;
      if (!currentGateScopeMatches({
        actionType: summary.recommendedActionType,
        changeId: summary.changeId,
        expectedScope: { [key]: summary.recommendedActionScope[key] },
        actual: nextAction,
      })) {
        return { visible: false, status: "target-mismatch", mismatchedKey: key };
      }
    }
    return { visible: false, status: "target-mismatch" };
  }

  return { visible: true, status: "matches-current-gate" };
}

export function filterGoalLoopSummaryForCurrentGate(
  summary: WorkbenchGoalLoopSummary | null,
  nextAction: WorkpadNextAction,
): WorkbenchGoalLoopSummary | null {
  if (!summary) return null;
  const parity = assessGoalLoopSummaryCurrentGateParity(summary, nextAction);
  if (!parity.visible) return null;
  if (parity.status !== "matches-close-gate") return summary;
  const closeGateHandoff = buildGoalLoopCloseGateHandoffFromState(closeHandoffStateFromSummary(summary), {
    changeId: summary.changeId,
    closeApprovalId: nextAction.approvalId ?? "",
  });
  if (!closeGateHandoff) return null;
  return { ...summary, closeGateHandoff };
}

function isCloseReadySummary(summary: WorkbenchGoalLoopSummary): boolean {
  return isGoalLoopCloseGateHandoffReadyState(closeHandoffStateFromSummary(summary));
}

function assessCloseGateParity(
  summary: WorkbenchGoalLoopSummary,
  nextAction: WorkpadNextAction,
): GoalLoopGateParityResult {
  if (nextAction.kind !== "approval" || !nextAction.enabled || !nextAction.requiresConfirmation) {
    return { visible: false, status: "missing-close-gate" };
  }
  if (nextAction.changeId && nextAction.changeId !== summary.changeId) {
    return { visible: false, status: "change-id-mismatch", mismatchedKey: "changeId" };
  }
  const handoff = buildGoalLoopCloseGateHandoffFromState(closeHandoffStateFromSummary(summary), {
    changeId: summary.changeId,
    closeApprovalId: nextAction.approvalId ?? "",
  });
  if (!handoff) {
    return { visible: false, status: "missing-close-gate", mismatchedKey: "approvalId" };
  }
  return { visible: true, status: "matches-close-gate" };
}

function closeHandoffStateFromSummary(summary: WorkbenchGoalLoopSummary) {
  return {
    changeId: summary.changeId,
    goalLoopNextStepPacketId: summary.goalLoopNextStepPacketId ?? "",
    recommendationState: summary.recommendationState,
    continuationState: summary.continuationState,
    hasRecommendedAction: Boolean(summary.recommendedActionType),
    executionStarted: summary.executionStarted,
  };
}

function normalizeScopeValues(value: ScopeValue): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return [...value].sort();
  return [];
}
