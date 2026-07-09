import type { MainAgentContextResult } from "./context.js";

export const GOAL_LOOP_NEXT_STEP_PACKET_PROMPT_LABEL = "goal-loop-next-step-packet";
export const GOAL_LOOP_ROUTING_POSTURE_PROMPT_LABEL = "goal-loop-routing-posture";
export const GOAL_LOOP_CONTROLLED_LOOP_STATE_PROMPT_LABEL = "goal-loop-controlled-loop-state";
export const GOAL_LOOP_CONTROLLER_POLICY_PROMPT_LABEL = "goal-loop-controller-policy";
export const GOAL_LOOP_SCHEDULER_TERMINAL_HANDOFF_PROMPT_LABEL = "goal-loop-scheduler-terminal-handoff";
export const GOAL_LOOP_CONTROLLED_SCHEDULER_NEXT_CANDIDATE_PROMPT_LABEL = "goal-loop-controlled-scheduler-next-candidate";
export const GOAL_LOOP_CONTROLLED_SCHEDULER_POST_STEP_ROUTING_PROMPT_LABEL = "goal-loop-controlled-scheduler-post-step-routing";
export const MAIN_AGENT_RESUME_CONTINUATION_PROMPT_LABEL = "main-agent-resume-continuation-context";

export interface GoalLoopRoutingPosturePromptEvidence {
  authority: "non-executing-routing-posture-prompt-evidence";
  goalLoopNextStepPacketId: string;
  routingPosture: string;
  routingLabel: string;
  schedulerExecutionMode?: string;
  currentLegalActionType?: string;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface GoalLoopContextPreparedEvidence {
  goalLoopNextStepPacketId?: string;
  goalLoopControllerPolicyId?: string;
  goalLoopRoutingPosture?: string;
  goalLoopRoutingLabel?: string;
  goalLoopRoutingPostureEvidence?: GoalLoopRoutingPosturePromptEvidence;
  goalLoopGuidedGateActionType?: string;
  goalLoopGuidedGateScope?: Record<string, string | string[]>;
  goalLoopControlledLoopState?: MainAgentContextResult["goalLoopControlledLoopState"];
  goalLoopSchedulerTerminalHandoff?: MainAgentContextResult["goalLoopSchedulerTerminalHandoff"];
  goalLoopControlledSchedulerNextCandidate?: MainAgentContextResult["goalLoopControlledSchedulerNextCandidate"];
  goalLoopControlledSchedulerPostStepRouting?: MainAgentContextResult["goalLoopControlledSchedulerPostStepRouting"];
  mainAgentResumeContinuationStatus?: NonNullable<MainAgentContextResult["resumeContinuationContext"]>["status"];
  mainAgentResumeContinuationPointId?: string;
}

export function goalLoopPromptStackLabels(context: MainAgentContextResult): string[] {
  const labels: string[] = [];
  if (context.goalLoopNextStepPacketId) {
    labels.push(GOAL_LOOP_NEXT_STEP_PACKET_PROMPT_LABEL);
  }
  if (buildGoalLoopRoutingPosturePromptEvidence(context)) {
    labels.push(GOAL_LOOP_ROUTING_POSTURE_PROMPT_LABEL);
  }
  if (context.goalLoopControlledLoopState) {
    labels.push(GOAL_LOOP_CONTROLLED_LOOP_STATE_PROMPT_LABEL);
  }
  if (context.goalLoopControllerPolicyId) {
    labels.push(GOAL_LOOP_CONTROLLER_POLICY_PROMPT_LABEL);
  }
  if (context.goalLoopSchedulerTerminalHandoff) {
    labels.push(GOAL_LOOP_SCHEDULER_TERMINAL_HANDOFF_PROMPT_LABEL);
  }
  if (context.goalLoopControlledSchedulerNextCandidate) {
    labels.push(GOAL_LOOP_CONTROLLED_SCHEDULER_NEXT_CANDIDATE_PROMPT_LABEL);
  }
  if (context.goalLoopControlledSchedulerPostStepRouting) {
    labels.push(GOAL_LOOP_CONTROLLED_SCHEDULER_POST_STEP_ROUTING_PROMPT_LABEL);
  }
  if (context.resumeContinuationContext && context.resumeContinuationContext.status !== "not-requested") {
    labels.push(MAIN_AGENT_RESUME_CONTINUATION_PROMPT_LABEL);
  }
  return labels;
}

export function buildGoalLoopContextPreparedEvidence(context: MainAgentContextResult): GoalLoopContextPreparedEvidence {
  return {
    goalLoopNextStepPacketId: context.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: context.goalLoopControllerPolicyId,
    goalLoopRoutingPosture: context.goalLoopRoutingPosture,
    goalLoopRoutingLabel: context.goalLoopRoutingLabel,
    goalLoopRoutingPostureEvidence: buildGoalLoopRoutingPosturePromptEvidence(context),
    goalLoopGuidedGateActionType: context.goalLoopGuidedGateActionType,
    goalLoopGuidedGateScope: context.goalLoopGuidedGateScope,
    goalLoopControlledLoopState: context.goalLoopControlledLoopState,
    goalLoopSchedulerTerminalHandoff: context.goalLoopSchedulerTerminalHandoff,
    goalLoopControlledSchedulerNextCandidate: context.goalLoopControlledSchedulerNextCandidate,
    goalLoopControlledSchedulerPostStepRouting: context.goalLoopControlledSchedulerPostStepRouting,
    mainAgentResumeContinuationStatus: context.resumeContinuationContext?.status,
    mainAgentResumeContinuationPointId: context.resumeContinuationContext?.resumePoint?.id,
  };
}

function buildGoalLoopRoutingPosturePromptEvidence(
  context: MainAgentContextResult,
): GoalLoopRoutingPosturePromptEvidence | undefined {
  const controlledLoopState = context.goalLoopControlledLoopState;
  if (!context.goalLoopNextStepPacketId || !context.goalLoopRoutingPosture || !context.goalLoopRoutingLabel || !controlledLoopState) {
    return undefined;
  }
  return {
    authority: "non-executing-routing-posture-prompt-evidence",
    goalLoopNextStepPacketId: context.goalLoopNextStepPacketId,
    routingPosture: context.goalLoopRoutingPosture,
    routingLabel: context.goalLoopRoutingLabel,
    schedulerExecutionMode: context.goalLoopSchedulerExecutionMode,
    currentLegalActionType: controlledLoopState.currentLegalActionType,
    loopAuthorized: controlledLoopState.loopAuthorized,
    fullParallelExecutorAuthorized: controlledLoopState.fullParallelExecutorAuthorized,
    wholeWaveDispatchAuthorized: controlledLoopState.wholeWaveDispatchAuthorized,
    slotAllocatorAuthorized: controlledLoopState.slotAllocatorAuthorized,
    sourceMutationAuthorized: controlledLoopState.sourceMutationAuthorized,
    applyAuthorized: controlledLoopState.applyAuthorized,
    closeAuthorized: controlledLoopState.closeAuthorized,
    harnessEvolutionAuthorized: controlledLoopState.harnessEvolutionAuthorized,
  };
}
