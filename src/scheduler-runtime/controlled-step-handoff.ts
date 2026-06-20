export type ControlledSchedulerPostStepHandoffStatus =
  | "next-confirmation-candidate-ready"
  | "next-confirmation-candidate-needs-review"
  | "next-step-evaluation-refreshed"
  | "next-step-evaluation-failed";

export interface ControlledSchedulerPostStepHandoff {
  authority: "derived-non-executing-workbench-handoff";
  status: ControlledSchedulerPostStepHandoffStatus;
  stopReason: "one-confirmed-scheduler-transition-completed";
  executedActionType?: string;
  nextConfirmationCandidate?: {
    actionType?: string;
    goalLoopNextStepPacketId?: string;
    goalLoopControllerPolicyId?: string;
    goalLoopGateReadinessPreflightId?: string;
    readinessEvidencePrepared: boolean;
    executionStarted: false;
    authorizationGranted: false;
    humanConfirmationStillRequired: true;
  };
  needsReevaluation: boolean;
  warning?: string;
  executionStarted: false;
  loopAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
}

export interface BuildControlledSchedulerPostStepHandoffInput {
  controlledAdvance?: {
    actionType?: string;
  };
  postStepGoalLoopEvaluation?: {
    goalLoopNextStepPacketId?: string;
    recommendedActionType?: string;
    executionStarted?: boolean;
  };
  postStepGoalLoopReadiness?: {
    goalLoopControllerPolicyId?: string;
    goalLoopGateReadinessPreflightId?: string;
    currentGateActionType?: string;
    executionStarted?: boolean;
  };
  postStepGoalLoopReadinessWarning?: string;
  postStepGoalLoopEvaluationWarning?: string;
}

export function buildControlledSchedulerPostStepHandoff(
  input: BuildControlledSchedulerPostStepHandoffInput,
): ControlledSchedulerPostStepHandoff {
  const base = baseHandoff(input.controlledAdvance?.actionType);
  if (input.postStepGoalLoopEvaluationWarning) {
    return {
      ...base,
      status: "next-step-evaluation-failed",
      needsReevaluation: true,
      warning: input.postStepGoalLoopEvaluationWarning,
    };
  }

  if (input.postStepGoalLoopReadiness) {
    return {
      ...base,
      status: "next-confirmation-candidate-ready",
      needsReevaluation: false,
      nextConfirmationCandidate: {
        actionType: input.postStepGoalLoopReadiness.currentGateActionType ?? input.postStepGoalLoopEvaluation?.recommendedActionType,
        goalLoopNextStepPacketId: input.postStepGoalLoopEvaluation?.goalLoopNextStepPacketId,
        goalLoopControllerPolicyId: input.postStepGoalLoopReadiness.goalLoopControllerPolicyId,
        goalLoopGateReadinessPreflightId: input.postStepGoalLoopReadiness.goalLoopGateReadinessPreflightId,
        readinessEvidencePrepared: true,
        executionStarted: false,
        authorizationGranted: false,
        humanConfirmationStillRequired: true,
      },
    };
  }

  if (input.postStepGoalLoopReadinessWarning) {
    return {
      ...base,
      status: "next-confirmation-candidate-needs-review",
      needsReevaluation: true,
      warning: input.postStepGoalLoopReadinessWarning,
      nextConfirmationCandidate: input.postStepGoalLoopEvaluation
        ? {
            actionType: input.postStepGoalLoopEvaluation.recommendedActionType,
            goalLoopNextStepPacketId: input.postStepGoalLoopEvaluation.goalLoopNextStepPacketId,
            readinessEvidencePrepared: false,
            executionStarted: false,
            authorizationGranted: false,
            humanConfirmationStillRequired: true,
          }
        : undefined,
    };
  }

  return {
    ...base,
    status: "next-step-evaluation-refreshed",
    needsReevaluation: false,
    nextConfirmationCandidate: input.postStepGoalLoopEvaluation
      ? {
          actionType: input.postStepGoalLoopEvaluation.recommendedActionType,
          goalLoopNextStepPacketId: input.postStepGoalLoopEvaluation.goalLoopNextStepPacketId,
          readinessEvidencePrepared: false,
          executionStarted: false,
          authorizationGranted: false,
          humanConfirmationStillRequired: true,
        }
      : undefined,
  };
}

function baseHandoff(executedActionType: string | undefined): ControlledSchedulerPostStepHandoff {
  return {
    authority: "derived-non-executing-workbench-handoff",
    status: "next-step-evaluation-refreshed",
    stopReason: "one-confirmed-scheduler-transition-completed",
    executedActionType,
    needsReevaluation: false,
    executionStarted: false,
    loopAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
  };
}
