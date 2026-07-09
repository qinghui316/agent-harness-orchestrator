import type {
  SchedulerControlledLoopTickSummary,
  SchedulerControlledLoopTurnRouteSummary,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepHandoffSummary,
  SchedulerControlledStepPostStepEvidence,
  SchedulerControlledStepPreStepEvidence,
  SchedulerControlledStepResultSummary,
} from "./types.js";

export interface BuildSchedulerControlledLoopTickSummaryInput {
  executedActionType: string;
  preStepEvidence: SchedulerControlledStepPreStepEvidence;
  postStepEvidence: SchedulerControlledStepPostStepEvidence;
  postStepHandoff: SchedulerControlledStepHandoffSummary;
  controlledLoopTurnRouteSummary: SchedulerControlledLoopTurnRouteSummary;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
  forbiddenAuthority: SchedulerControlledStepForbiddenAuthority;
}

export function buildSchedulerControlledLoopTickSummary(input: BuildSchedulerControlledLoopTickSummaryInput): SchedulerControlledLoopTickSummary {
  const warning = input.postStepEvidence.evaluationWarning
    ?? input.postStepEvidence.readinessWarning
    ?? input.postStepHandoff.warning
    ?? input.controlledLoopTurnRouteSummary.warning;
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-tick-contract-summary",
    observe: {
      status: "recorded",
      goalLoopDecisionId: input.preStepEvidence.goalLoopDecisionId,
      goalLoopIterationId: input.preStepEvidence.goalLoopIterationId,
      goalLoopContinuationBriefId: input.preStepEvidence.goalLoopContinuationBriefId,
      goalLoopNextStepPacketId: input.preStepEvidence.goalLoopNextStepPacketId,
      submittedActionType: input.executedActionType,
    },
    chooseCheck: {
      status: "recorded",
      goalLoopControllerPolicyId: input.preStepEvidence.goalLoopControllerPolicyId,
      goalLoopGateReadinessPreflightId: input.preStepEvidence.goalLoopGateReadinessPreflightId,
      targetScopeMatched: true,
      concreteGatePreflightNonExecuting: true,
    },
    dispatch: {
      status: "completed",
      executedActionType: input.executedActionType,
      executionStarted: true,
      stoppedAfterOneSchedulerTransition: true,
      approvedScopeOnly: true,
    },
    reconcile: {
      status: warning ? "warning" : "recorded",
      goalLoopDecisionId: input.postStepEvidence.goalLoopDecisionId,
      goalLoopIterationId: input.postStepEvidence.goalLoopIterationId,
      goalLoopContinuationBriefId: input.postStepEvidence.goalLoopContinuationBriefId,
      goalLoopNextStepPacketId: input.postStepEvidence.goalLoopNextStepPacketId,
      goalLoopControllerPolicyId: input.postStepEvidence.goalLoopControllerPolicyId,
      goalLoopGateReadinessPreflightId: input.postStepEvidence.goalLoopGateReadinessPreflightId,
      warning,
      executionStarted: false,
    },
    routeStop: {
      status: input.postStepHandoff.status,
      stopReason: input.postStepHandoff.stopReason,
      routePosture: input.controlledLoopTurnRouteSummary.routePosture,
      nextCandidateActionType: input.controlledLoopTurnRouteSummary.nextCandidateActionType,
      humanGateRequired: input.controlledLoopTurnRouteSummary.humanGateRequired,
      humanConfirmationStillRequired: true,
      needsReevaluation: input.postStepHandoff.needsReevaluation,
      warning,
    },
    resultKind: input.controlledLoopTurnRouteSummary.resultKind,
    resultId: input.controlledLoopTurnRouteSummary.resultId,
    resultStatus: input.controlledLoopTurnRouteSummary.resultStatus,
    resultArtifact: input.controlledLoopTurnRouteSummary.resultArtifact,
    executionStarted: false,
    loopAuthorized: input.forbiddenAuthority.loopAuthorized,
    fullParallelExecutorAuthorized: input.forbiddenAuthority.fullParallelExecutorAuthorized,
    wholeWaveDispatchAuthorized: input.forbiddenAuthority.wholeWaveDispatchAuthorized,
    slotAllocatorAuthorized: input.forbiddenAuthority.slotAllocatorAuthorized,
    sourceMutationAuthorized: input.forbiddenAuthority.sourceMutationAuthorized,
    applyAuthorized: input.forbiddenAuthority.applyAuthorized,
    closeAuthorized: input.forbiddenAuthority.closeAuthorized,
    mergeAuthorized: input.forbiddenAuthority.mergeAuthorized,
    remoteLandingAuthorized: input.forbiddenAuthority.remoteLandingAuthorized,
    harnessEvolutionAuthorized: input.forbiddenAuthority.harnessEvolutionAuthorized,
  };
}
