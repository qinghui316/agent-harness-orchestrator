import type {
  SchedulerControlledLoopBoundaryResult,
  SchedulerControlledLoopContinuationReadiness,
  SchedulerControlledLoopCurrentTransitionChoice,
  SchedulerControlledLoopIterationSummary,
  SchedulerControlledLoopStopSummary,
  SchedulerControlledLoopTickSummary,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepResultSummary,
} from "./types.js";

export interface BuildSchedulerControlledLoopBoundaryResultInput {
  controlledLoopCurrentTransitionChoice?: SchedulerControlledLoopCurrentTransitionChoice;
  controlledLoopTick: SchedulerControlledLoopTickSummary;
  controlledLoopIteration: SchedulerControlledLoopIterationSummary;
  controlledLoopContinuationReadiness: SchedulerControlledLoopContinuationReadiness;
  controlledLoopStopSummary: SchedulerControlledLoopStopSummary;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
  forbiddenAuthority: SchedulerControlledStepForbiddenAuthority;
  evidenceRefs?: string[];
}

export function buildSchedulerControlledLoopBoundaryResult(
  input: BuildSchedulerControlledLoopBoundaryResultInput,
): SchedulerControlledLoopBoundaryResult | undefined {
  const choice = input.controlledLoopCurrentTransitionChoice;
  if (!choice) return undefined;
  const warning = input.controlledLoopStopSummary.warning
    ?? input.controlledLoopIteration.warning
    ?? input.controlledLoopTick.routeStop.warning
    ?? input.controlledLoopTick.reconcile.warning
    ?? input.controlledLoopContinuationReadiness.warning;
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-boundary-result",
    status: warning ? "recorded-with-warning" : "recorded",
    selectedActionType: choice.selectedActionType,
    submittedActionType: choice.submittedActionType,
    dispatchedActionType: input.controlledLoopTick.dispatch.executedActionType,
    selectedGateScope: { ...choice.currentGate.scope },
    observeStatus: input.controlledLoopTick.observe.status,
    chooseCheckStatus: input.controlledLoopTick.chooseCheck.status,
    dispatchStatus: input.controlledLoopTick.dispatch.status,
    reconcileStatus: input.controlledLoopTick.reconcile.status,
    boundaryPosture: input.controlledLoopStopSummary.routePosture,
    continuationReadinessStatus: input.controlledLoopStopSummary.continuationReadinessStatus,
    stopReason: input.controlledLoopStopSummary.stopReason,
    nextGateActionType: input.controlledLoopStopSummary.nextGateActionType,
    nextGateTargetScopeSource: input.controlledLoopStopSummary.nextGateActionType ? "fresh-current-gate-required" : undefined,
    resultKind: input.controlledLoopStopSummary.resultKind,
    resultId: input.controlledLoopStopSummary.resultId,
    resultStatus: input.controlledLoopStopSummary.resultStatus,
    readinessEvidencePrepared: input.controlledLoopStopSummary.readinessEvidencePrepared,
    needsReevaluation: input.controlledLoopStopSummary.needsReevaluation,
    humanGateRequired: input.controlledLoopStopSummary.humanGateRequired,
    humanConfirmationStillRequired: true,
    futureContinuationRequiresFreshEvidence: true,
    futureContinuationRequiresFreshCurrentGate: true,
    stoppedAfterOneSchedulerTransition: true,
    approvedScopeOnly: true,
    boundary: "Scheduler-runtime boundary result for one human-confirmed controlled Scheduler turn. It is prior-turn evidence only; future continuation must re-read fresh Goal Loop, current-gate, ToolPolicy, and human confirmation evidence before dispatch.",
    evidenceRefs: unique([
      ...(input.evidenceRefs ?? []),
      ...input.controlledLoopStopSummary.evidenceRefs,
      ...input.controlledLoopIteration.evidenceRefs,
      ...input.controlledLoopContinuationReadiness.evidenceRefs,
    ]),
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

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
