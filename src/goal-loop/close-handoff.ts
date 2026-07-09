import type { GoalLoopNextStepPacket } from "./types.js";

export interface GoalLoopCloseGateHandoff {
  changeId: string;
  closeActionId: "change.close";
  closeApprovalId: string;
  goalLoopNextStepPacketId: string;
  reason: string;
  humanGateRequired: true;
  executionStarted: false;
}

export interface GoalLoopCloseGateHandoffInput {
  changeId: string;
  closeApprovalId: string;
}

export interface GoalLoopCloseGateHandoffState {
  changeId: string;
  goalLoopNextStepPacketId: string;
  recommendationState?: string;
  continuationState?: string;
  hasRecommendedAction: boolean;
  executionStarted: false;
}

export function buildGoalLoopCloseGateHandoff(
  packet: GoalLoopNextStepPacket,
  input: GoalLoopCloseGateHandoffInput,
): GoalLoopCloseGateHandoff | null {
  return buildGoalLoopCloseGateHandoffFromState({
    changeId: packet.changeId,
    goalLoopNextStepPacketId: packet.id,
    recommendationState: packet.recommendationState,
    continuationState: packet.continuationState,
    hasRecommendedAction: Boolean(packet.recommendedAction),
    executionStarted: packet.executionStarted,
  }, input);
}

export function buildGoalLoopCloseGateHandoffFromState(
  state: GoalLoopCloseGateHandoffState,
  input: GoalLoopCloseGateHandoffInput,
): GoalLoopCloseGateHandoff | null {
  if (state.changeId !== input.changeId) return null;
  if (!state.goalLoopNextStepPacketId) return null;
  if (input.closeApprovalId !== `close:${input.changeId}`) return null;
  if (!isGoalLoopCloseGateHandoffReadyState(state)) return null;
  return {
    changeId: input.changeId,
    closeActionId: "change.close",
    closeApprovalId: input.closeApprovalId,
    goalLoopNextStepPacketId: state.goalLoopNextStepPacketId,
    reason: "Goal Loop completion evidence is ready for the existing Change close human gate; close still executes only through change.close.",
    humanGateRequired: true,
    executionStarted: false,
  };
}

export function isGoalLoopCloseGateHandoffReadyState(state: GoalLoopCloseGateHandoffState): boolean {
  return state.recommendationState === "ready-for-human-close-gate"
    && state.continuationState === "ready-for-human-close-gate"
    && state.executionStarted === false
    && !state.hasRecommendedAction;
}
