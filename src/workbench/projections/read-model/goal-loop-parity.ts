import type { WorkbenchGoalLoopSummary, WorkpadNextAction } from "../../read-model-types.js";

type ScopeValue = string | string[] | undefined;

export type GoalLoopGateParityStatus =
  | "matches-current-gate"
  | "no-recommended-action"
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

  for (const [key, expectedValue] of Object.entries(summary.recommendedActionScope)) {
    const expected = normalizeScopeValues(expectedValue);
    const actual = key === "changeId" ? [summary.changeId] : normalizeScopeValues(readNextActionScopeValue(nextAction, key));
    if (!scopeValuesEqual(expected, actual)) {
      return { visible: false, status: "target-mismatch", mismatchedKey: key };
    }
  }

  return { visible: true, status: "matches-current-gate" };
}

export function filterGoalLoopSummaryForCurrentGate(
  summary: WorkbenchGoalLoopSummary | null,
  nextAction: WorkpadNextAction,
): WorkbenchGoalLoopSummary | null {
  if (!summary) return null;
  return assessGoalLoopSummaryCurrentGateParity(summary, nextAction).visible ? summary : null;
}

function readNextActionScopeValue(nextAction: WorkpadNextAction, key: string): ScopeValue {
  const value = (nextAction as unknown as Record<string, unknown>)[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  return undefined;
}

function normalizeScopeValues(value: ScopeValue): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return [...value].sort();
  return [];
}

function scopeValuesEqual(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return left.length === right.length;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
