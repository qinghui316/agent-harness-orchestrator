import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { assessGoalLoopNextStepPacketFreshness } from "./freshness.js";
import {
  goalLoopControllerPolicyArtifactRefs,
  readLatestGoalLoopContinuationBrief,
  readLatestGoalLoopDecision,
  readLatestGoalLoopIteration,
  readLatestGoalLoopNextStepPacket,
  writeGoalLoopControllerPolicy,
} from "./repository.js";
import type {
  GoalLoopControllerGateStatus,
  GoalLoopControllerPolicy,
  GoalLoopControllerVerdict,
  GoalLoopCurrentGateSnapshot,
  GoalLoopNextStepPacket,
} from "./types.js";

export interface CompileGoalLoopControllerPolicyOptions {
  currentGate?: GoalLoopCurrentGateSnapshot;
}

export async function compileGoalLoopControllerPolicy(
  memory: ResolvedMemory,
  changePath: string,
  options: CompileGoalLoopControllerPolicyOptions = {},
): Promise<GoalLoopControllerPolicy> {
  const [decision, iteration, brief, packet] = await Promise.all([
    readLatestGoalLoopDecision(memory, changePath),
    readLatestGoalLoopIteration(memory, changePath),
    readLatestGoalLoopContinuationBrief(memory, changePath),
    readLatestGoalLoopNextStepPacket(memory, changePath),
  ]);
  assertControllerPolicyLineage(decision.changeId, iteration.id, iteration.goalLoopDecisionId, brief.sourceGoalLoopDecisionId, brief.sourceGoalLoopIterationId, packet);

  const freshness = await assessGoalLoopNextStepPacketFreshness(memory, changePath, packet);
  const gateAssessment = freshness.verdict === "fresh"
    ? assessPacketGate(packet, options.currentGate)
    : {
      verdict: "suppress-stale-guidance" as const,
      gateStatus: "packet-stale" as const,
      summary: `Goal Loop packet is stale: ${freshness.reason}. Record a fresh evaluation before recommending a gate.`,
      suppressesRecommendedAction: true,
    };
  const now = new Date().toISOString();
  const policyId = `goal-loop-controller-policy-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${packet.changeId}:${packet.id}:${gateAssessment.verdict}:${now}`)}`;
  const refs = goalLoopControllerPolicyArtifactRefs(memory, changePath, policyId);
  const policy: GoalLoopControllerPolicy = {
    version: "1.0",
    id: policyId,
    changeId: packet.changeId,
    authority: "non-executing-controller-policy-evidence",
    sourceGoalLoopDecisionId: packet.sourceGoalLoopDecisionId,
    sourceGoalLoopIterationId: packet.sourceGoalLoopIterationId,
    sourceGoalLoopContinuationBriefId: packet.sourceGoalLoopContinuationBriefId,
    sourceGoalLoopNextStepPacketId: packet.id,
    iterationOrdinal: packet.iterationOrdinal,
    verdict: gateAssessment.verdict,
    gateStatus: gateAssessment.gateStatus,
    summary: gateAssessment.summary,
    recommendedAction: gateAssessment.verdict === "recommend-existing-gate" ? packet.recommendedAction : undefined,
    currentGate: options.currentGate,
    suppressesRecommendedAction: gateAssessment.suppressesRecommendedAction,
    humanGateRequired: true,
    revalidationChecklist: [
      "Re-read the selected Change and current Workbench Harness gate before acting.",
      "Use this controller policy only as evidence; do not execute the recommended action from it.",
      "The concrete action must pass its own required target validation, stale-target revalidation, ToolPolicyGate, and human confirmation.",
    ],
    forbiddenExecutionStatements: [
      "Do not call Workbench action handlers from Goal Loop controller policy.",
      "Do not start scheduler workers, validation, audit, IntegrationCheck, apply, close, landing, PR, merge, or child Changes from this policy.",
      "Do not treat this policy as workflow truth; Change/ECL and accepted artifacts remain authoritative.",
    ],
    executionStarted: false,
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeGoalLoopControllerPolicy(memory, changePath, policy);
  return policy;
}

interface GateAssessment {
  verdict: GoalLoopControllerVerdict;
  gateStatus: GoalLoopControllerGateStatus;
  summary: string;
  suppressesRecommendedAction: boolean;
}

function assessPacketGate(packet: GoalLoopNextStepPacket, currentGate?: GoalLoopCurrentGateSnapshot): GateAssessment {
  if (packet.recommendationState === "blocked") {
    return {
      verdict: "blocked",
      gateStatus: packet.recommendedAction ? "no-current-gate" : "no-recommended-action",
      summary: "Goal Loop evidence is blocked; the main Agent should ask for user direction or new evidence instead of executing.",
      suppressesRecommendedAction: true,
    };
  }
  if (packet.recommendationState === "ready-for-human-close-gate") {
    return {
      verdict: "ready-for-human-close-gate",
      gateStatus: packet.recommendedAction ? "no-current-gate" : "no-recommended-action",
      summary: "Goal Loop evidence says the Change may be ready for the existing human close gate; no action is executed by this policy.",
      suppressesRecommendedAction: false,
    };
  }
  if (packet.recommendationState === "waiting-for-evidence" || !packet.recommendedAction) {
    return {
      verdict: "wait-for-evidence",
      gateStatus: "no-recommended-action",
      summary: "Goal Loop evidence is waiting for more repository or Harness evidence before an existing gate can be recommended.",
      suppressesRecommendedAction: false,
    };
  }
  if (!currentGate) {
    return {
      verdict: "wait-for-evidence",
      gateStatus: "no-current-gate",
      summary: "Goal Loop packet recommends an existing gate, but no current visible Harness gate snapshot was supplied.",
      suppressesRecommendedAction: true,
    };
  }
  if (currentGate.actionType !== packet.recommendedAction.actionType) {
    return {
      verdict: "suppress-stale-guidance",
      gateStatus: "action-type-mismatch",
      summary: "Goal Loop packet action type does not match the current visible Harness gate; suppress guidance until re-evaluated.",
      suppressesRecommendedAction: true,
    };
  }
  const scopeStatus = assessScopeParity(packet, currentGate);
  if (scopeStatus !== "matches-current-gate") {
    return {
      verdict: "suppress-stale-guidance",
      gateStatus: scopeStatus,
      summary: "Goal Loop packet target scope does not match the current visible Harness gate; suppress guidance until re-evaluated.",
      suppressesRecommendedAction: true,
    };
  }
  return {
    verdict: "recommend-existing-gate",
    gateStatus: "matches-current-gate",
    summary: `Main Agent may explain the existing ${currentGate.actionType} Harness gate, but the user must confirm that gate separately.`,
    suppressesRecommendedAction: false,
  };
}

function assertControllerPolicyLineage(
  changeId: string,
  iterationId: string,
  iterationDecisionId: string,
  briefDecisionId: string,
  briefIterationId: string,
  packet: GoalLoopNextStepPacket,
): void {
  if (packet.changeId !== changeId) throw new Error("GoalLoopControllerPolicy packet change scope mismatch.");
  if (iterationId !== packet.sourceGoalLoopIterationId) throw new Error("GoalLoopControllerPolicy iteration lineage mismatch.");
  if (iterationDecisionId !== packet.sourceGoalLoopDecisionId) throw new Error("GoalLoopControllerPolicy iteration decision lineage mismatch.");
  if (briefDecisionId !== packet.sourceGoalLoopDecisionId) throw new Error("GoalLoopControllerPolicy brief decision lineage mismatch.");
  if (briefIterationId !== packet.sourceGoalLoopIterationId) throw new Error("GoalLoopControllerPolicy brief iteration lineage mismatch.");
  if (packet.executionStarted !== false) throw new Error("GoalLoopControllerPolicy requires non-executing packet evidence.");
}

function assessScopeParity(packet: GoalLoopNextStepPacket, currentGate: GoalLoopCurrentGateSnapshot): GoalLoopControllerGateStatus {
  const action = packet.recommendedAction;
  if (!action) return "no-recommended-action";
  const expectedChangeId = normalizeScopeValue(action.scope.changeId);
  if (expectedChangeId.length !== 1 || expectedChangeId[0] !== packet.changeId) return "change-id-mismatch";
  const currentChangeId = normalizeScopeValue(currentGate.scope.changeId);
  if (currentChangeId.length > 0 && !scopeValuesEqual(currentChangeId, [packet.changeId])) return "change-id-mismatch";
  for (const [key, value] of Object.entries(action.scope)) {
    const expected = normalizeScopeValue(value);
    const actual = key === "changeId" ? [packet.changeId] : normalizeScopeValue(currentGate.scope[key]);
    if (!scopeValuesEqual(expected, actual)) return "target-mismatch";
  }
  return "matches-current-gate";
}

function normalizeScopeValue(value: string | string[] | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return [...value].sort();
  return [];
}

function scopeValuesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
