import type { ResolvedMemory } from "../types/index.js";
import { previewGoalLoopDecision } from "./compiler.js";
import type { GoalLoopDecision, GoalLoopNextStepPacket, GoalLoopRecommendedAction, GoalLoopSourceEvidenceRef } from "./types.js";

export type GoalLoopPacketFreshnessVerdict = "fresh" | "stale";

export interface GoalLoopPacketFreshnessAssessment {
  verdict: GoalLoopPacketFreshnessVerdict;
  reason: string;
  currentDecision?: GoalLoopDecision;
}

export async function assessGoalLoopNextStepPacketFreshness(
  memory: ResolvedMemory,
  changePath: string,
  packet: GoalLoopNextStepPacket,
): Promise<GoalLoopPacketFreshnessAssessment> {
  const currentDecision = await previewGoalLoopDecision(memory, changePath);
  if (currentDecision.changeId !== packet.changeId) {
    return { verdict: "stale", reason: "current Change scope does not match packet scope", currentDecision };
  }
  if (currentDecision.executionStarted !== false || packet.executionStarted !== false) {
    return { verdict: "stale", reason: "Goal Loop packet freshness requires non-executing evidence", currentDecision };
  }
  if (currentDecision.decisionKind !== packet.decisionKind) {
    return { verdict: "stale", reason: "current Goal Loop decision kind differs from packet", currentDecision };
  }
  if (!recommendedActionsEqual(currentDecision.recommendedAction, packet.recommendedAction)) {
    return { verdict: "stale", reason: "current Goal Loop recommended action differs from packet", currentDecision };
  }
  if (!sourceEvidenceRefsEqual(currentDecision.sourceEvidenceRefs, packet.sourceEvidenceRefs)) {
    return { verdict: "stale", reason: "current Goal Loop source evidence differs from packet", currentDecision };
  }
  return { verdict: "fresh", reason: "packet matches current Goal Loop recommendation evidence", currentDecision };
}

export async function isGoalLoopNextStepPacketFresh(
  memory: ResolvedMemory,
  changePath: string,
  packet: GoalLoopNextStepPacket,
): Promise<boolean> {
  return (await assessGoalLoopNextStepPacketFreshness(memory, changePath, packet)).verdict === "fresh";
}

function recommendedActionsEqual(left?: GoalLoopRecommendedAction, right?: GoalLoopRecommendedAction): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.actionType === right.actionType
    && left.reason === right.reason
    && normalizedScope(left.scope) === normalizedScope(right.scope);
}

function normalizedScope(scope: Record<string, string | string[]>): string {
  return JSON.stringify(Object.entries(scope)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value]));
}

function sourceEvidenceRefsEqual(left: GoalLoopSourceEvidenceRef[], right: GoalLoopSourceEvidenceRef[]): boolean {
  return normalizedSourceEvidenceRefs(left) === normalizedSourceEvidenceRefs(right);
}

function normalizedSourceEvidenceRefs(refs: GoalLoopSourceEvidenceRef[]): string {
  return JSON.stringify(refs.map((ref) => ({
    kind: ref.kind,
    id: ref.id ?? "",
    status: ref.status ?? "",
    artifact: ref.artifact ?? "",
    summary: ref.summary,
  })));
}
