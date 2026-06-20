import type {
  SchedulerControlledLoopIterationSummary,
  SchedulerControlledLoopContinuationReadiness,
  SchedulerControlledLoopTickSummary,
  SchedulerControlledLoopTurnRouteSummary,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepHandoffSummary,
  SchedulerControlledStepResultSummary,
} from "./types.js";

export interface BuildSchedulerControlledLoopIterationSummaryInput {
  executedActionType: string;
  postStepHandoff: SchedulerControlledStepHandoffSummary;
  controlledLoopTurnRouteSummary: SchedulerControlledLoopTurnRouteSummary;
  controlledLoopTick: SchedulerControlledLoopTickSummary;
  controlledLoopContinuationReadiness: SchedulerControlledLoopContinuationReadiness;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
  forbiddenAuthority: SchedulerControlledStepForbiddenAuthority;
  evidenceRefs?: string[];
}

export function buildSchedulerControlledLoopIterationSummary(
  input: BuildSchedulerControlledLoopIterationSummaryInput,
): SchedulerControlledLoopIterationSummary {
  const warning = input.controlledLoopContinuationReadiness.warning
    ?? input.controlledLoopTick.routeStop.warning
    ?? input.controlledLoopTick.reconcile.warning
    ?? input.controlledLoopTurnRouteSummary.warning
    ?? input.postStepHandoff.warning;
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-iteration-summary",
    status: warning ? "completed-with-warning" : "completed",
    executedActionType: input.executedActionType,
    observeStatus: input.controlledLoopTick.observe.status,
    chooseCheckStatus: input.controlledLoopTick.chooseCheck.status,
    dispatchStatus: input.controlledLoopTick.dispatch.status,
    reconcileStatus: input.controlledLoopTick.reconcile.status,
    routePosture: input.controlledLoopTurnRouteSummary.routePosture,
    routeStopReason: input.controlledLoopTick.routeStop.stopReason,
    continuationReadinessStatus: input.controlledLoopContinuationReadiness.status,
    nextCandidateActionType: input.controlledLoopContinuationReadiness.nextCandidateActionType
      ?? input.controlledLoopTurnRouteSummary.nextCandidateActionType,
    resultKind: input.controlledLoopTurnRouteSummary.resultKind,
    resultId: input.controlledLoopTurnRouteSummary.resultId,
    resultStatus: input.controlledLoopTurnRouteSummary.resultStatus,
    resultArtifact: input.controlledLoopTurnRouteSummary.resultArtifact,
    readinessEvidencePrepared: input.controlledLoopContinuationReadiness.readinessEvidencePrepared,
    needsReevaluation: input.postStepHandoff.needsReevaluation,
    humanGateRequired: input.controlledLoopContinuationReadiness.humanGateRequired,
    humanConfirmationStillRequired: true,
    stoppedAfterOneSchedulerTransition: true,
    approvedScopeOnly: true,
    boundary: "Scheduler-runtime summary of one human-confirmed controlled Scheduler transition; any next transition still requires the existing scoped human gate and ToolPolicy path.",
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    warning,
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
