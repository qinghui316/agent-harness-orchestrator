import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import {
  goalLoopFeedbackArtifactRefs,
  readLatestGoalLoopContinuationBrief,
  readLatestGoalLoopDecision,
  readLatestGoalLoopIteration,
  readLatestGoalLoopNextStepPacket,
  writeGoalLoopFeedback,
} from "./repository.js";
import type { GoalLoopCurrentGateSnapshot, GoalLoopFeedback } from "./types.js";

export interface RecordGoalLoopFeedbackInput {
  goalLoopNextStepPacketId: string;
  feedbackText: string;
  currentGate: GoalLoopCurrentGateSnapshot;
}

export async function recordGoalLoopFeedback(
  memory: ResolvedMemory,
  changePath: string,
  input: RecordGoalLoopFeedbackInput,
): Promise<GoalLoopFeedback> {
  const feedbackText = input.feedbackText.trim();
  if (!feedbackText) throw new Error("GoalLoopFeedback requires non-empty feedback text.");

  const [decision, iteration, brief, packet] = await Promise.all([
    readLatestGoalLoopDecision(memory, changePath),
    readLatestGoalLoopIteration(memory, changePath),
    readLatestGoalLoopContinuationBrief(memory, changePath),
    readLatestGoalLoopNextStepPacket(memory, changePath),
  ]);

  if (packet.id !== input.goalLoopNextStepPacketId) throw new Error("GoalLoopFeedback target is stale or not the latest GoalLoopNextStepPacket.");
  if (packet.sourceGoalLoopDecisionId !== decision.id) throw new Error("GoalLoopFeedback packet decision lineage mismatch.");
  if (packet.sourceGoalLoopIterationId !== iteration.id) throw new Error("GoalLoopFeedback packet iteration lineage mismatch.");
  if (packet.sourceGoalLoopContinuationBriefId !== brief.id) throw new Error("GoalLoopFeedback packet brief lineage mismatch.");
  if (decision.changeId !== iteration.changeId || decision.changeId !== brief.changeId || decision.changeId !== packet.changeId) {
    throw new Error("GoalLoopFeedback source Change scope mismatch.");
  }
  if (decision.executionStarted !== false || iteration.executionStarted !== false || brief.executionStarted !== false || packet.executionStarted !== false) {
    throw new Error("GoalLoopFeedback requires non-executing Goal Loop source evidence.");
  }
  if (!packet.recommendedAction) throw new Error("GoalLoopFeedback requires a packet with a current recommended action gate.");
  if (input.currentGate.actionType !== packet.recommendedAction.actionType) {
    throw new Error("GoalLoopFeedback current gate action does not match packet recommendation.");
  }
  if (!scopesEqual(input.currentGate.scope, packet.recommendedAction.scope)) {
    throw new Error("GoalLoopFeedback current gate scope does not match packet recommendation.");
  }

  const now = new Date().toISOString();
  const feedbackTextHash = shortHash(feedbackText);
  const feedbackId = `goal-loop-feedback-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${packet.changeId}:${packet.id}:${feedbackTextHash}`)}`;
  const refs = goalLoopFeedbackArtifactRefs(memory, changePath, feedbackId);
  const feedback: GoalLoopFeedback = {
    version: "1.0",
    id: feedbackId,
    changeId: packet.changeId,
    authority: "non-executing-user-feedback-evidence",
    sourceGoalLoopDecisionId: decision.id,
    sourceGoalLoopIterationId: iteration.id,
    sourceGoalLoopContinuationBriefId: brief.id,
    sourceGoalLoopNextStepPacketId: packet.id,
    recommendedAction: packet.recommendedAction,
    currentGate: {
      actionType: input.currentGate.actionType,
      scope: normalizeScopeObject(input.currentGate.scope),
    },
    feedbackText,
    feedbackTextHash,
    executionStarted: false,
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeGoalLoopFeedback(memory, changePath, feedback);
  return feedback;
}

function scopesEqual(left: Record<string, string | string[]>, right: Record<string, string | string[]>): boolean {
  return JSON.stringify(normalizeScopeObject(left)) === JSON.stringify(normalizeScopeObject(right));
}

function normalizeScopeObject(scope: Record<string, string | string[]>): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(scope)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value]));
}
