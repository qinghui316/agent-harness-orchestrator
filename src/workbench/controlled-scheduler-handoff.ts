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

export function controlledSchedulerPostStepHandoffSummary(value: unknown): string | null {
  const handoff = readControlledSchedulerPostStepHandoff(value);
  if (!handoff) return null;
  if (handoff.status === "next-confirmation-candidate-ready") {
    return "已完成这一个受控步骤并主动停止。下一步判断和当前步骤检查已经刷新；如果页面仍显示同一个下一步，继续也仍需要你再次确认。";
  }
  if (handoff.status === "next-confirmation-candidate-needs-review") {
    return "已完成这一个受控步骤并主动停止。下一步判断已刷新，但当前步骤检查还需要重新评估或查看证据；不会自动继续。";
  }
  if (handoff.status === "next-step-evaluation-failed") {
    return "已完成这一个受控步骤并主动停止。下一步判断刷新未完成；请重新评估下一步或查看证据后再继续。";
  }
  return "已完成这一个受控步骤并主动停止。下一步判断已刷新；是否继续仍需要你再次确认。";
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

function readControlledSchedulerPostStepHandoff(value: unknown): ControlledSchedulerPostStepHandoff | null {
  if (!isRecord(value) || !isRecord(value.postStepHandoff)) return null;
  const handoff = value.postStepHandoff;
  const status = handoff.status;
  if (
    status !== "next-confirmation-candidate-ready"
    && status !== "next-confirmation-candidate-needs-review"
    && status !== "next-step-evaluation-refreshed"
    && status !== "next-step-evaluation-failed"
  ) {
    return null;
  }
  return handoff as unknown as ControlledSchedulerPostStepHandoff;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
