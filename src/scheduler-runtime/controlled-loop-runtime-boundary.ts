import type {
  SchedulerControlledLoopBoundaryResult,
  SchedulerControlledLoopContinuationReadiness,
  SchedulerControlledLoopCurrentTransitionChoice,
  SchedulerControlledLoopIterationSummary,
  SchedulerControlledLoopRuntimeBoundary,
  SchedulerControlledLoopStopSummary,
  SchedulerControlledLoopTickSummary,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepResultSummary,
} from "./types.js";

export interface BuildSchedulerControlledLoopRuntimeBoundaryInput {
  changeId: string;
  schedulerRunId?: string;
  controlledLoopCurrentTransitionChoice?: SchedulerControlledLoopCurrentTransitionChoice;
  controlledLoopTick: SchedulerControlledLoopTickSummary;
  controlledLoopContinuationReadiness: SchedulerControlledLoopContinuationReadiness;
  controlledLoopIteration: SchedulerControlledLoopIterationSummary;
  controlledLoopStopSummary: SchedulerControlledLoopStopSummary;
  controlledLoopBoundaryResult?: SchedulerControlledLoopBoundaryResult;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
  forbiddenAuthority: SchedulerControlledStepForbiddenAuthority;
  evidenceRefs?: string[];
}

export function buildSchedulerControlledLoopRuntimeBoundary(
  input: BuildSchedulerControlledLoopRuntimeBoundaryInput,
): SchedulerControlledLoopRuntimeBoundary | undefined {
  const choice = input.controlledLoopCurrentTransitionChoice;
  const boundary = input.controlledLoopBoundaryResult;
  if (!choice || !boundary) return undefined;
  const warning = boundary.warning
    ?? input.controlledLoopStopSummary.warning
    ?? input.controlledLoopIteration.warning
    ?? input.controlledLoopTick.routeStop.warning
    ?? input.controlledLoopTick.reconcile.warning
    ?? input.controlledLoopContinuationReadiness.warning;
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence",
    status: warning ? "recorded-with-warning" : "recorded",
    changeId: input.changeId,
    schedulerRunId: input.schedulerRunId,
    submittedActionType: choice.submittedActionType,
    selectedActionType: choice.selectedActionType,
    dispatchedActionType: input.controlledLoopTick.dispatch.executedActionType,
    observeStatus: input.controlledLoopTick.observe.status,
    chooseStatus: input.controlledLoopTick.chooseCheck.status,
    humanGateStatus: "confirmed-current-step",
    dispatchStatus: input.controlledLoopTick.dispatch.status,
    reconcileStatus: input.controlledLoopTick.reconcile.status,
    stopStatus: input.controlledLoopTick.routeStop.status,
    stopPosture: input.controlledLoopStopSummary.routePosture,
    stopReason: input.controlledLoopStopSummary.stopReason,
    continuationReadinessStatus: input.controlledLoopStopSummary.continuationReadinessStatus,
    nextGateActionType: input.controlledLoopStopSummary.nextGateActionType,
    nextGateTargetScopeSource: input.controlledLoopStopSummary.nextGateActionType ? "fresh-current-gate-required" : "none",
    resultKind: input.controlledLoopStopSummary.resultKind,
    resultId: input.controlledLoopStopSummary.resultId,
    resultStatus: input.controlledLoopStopSummary.resultStatus,
    observedGoalLoopNextStepPacketId: input.controlledLoopTick.observe.goalLoopNextStepPacketId,
    selectedGoalLoopGateReadinessPreflightId: input.controlledLoopTick.chooseCheck.goalLoopGateReadinessPreflightId,
    reconciledGoalLoopNextStepPacketId: input.controlledLoopTick.reconcile.goalLoopNextStepPacketId,
    readinessEvidencePrepared: input.controlledLoopStopSummary.readinessEvidencePrepared,
    needsReevaluation: input.controlledLoopStopSummary.needsReevaluation,
    humanConfirmationStillRequired: true,
    stoppedAfterOneSchedulerTransition: true,
    approvedScopeOnly: true,
    priorTurnEvidence: true,
    freshEvidenceRequiredBeforeContinuation: true,
    freshCurrentGateRequiredBeforeContinuation: true,
    boundary: "Scheduler-runtime evidence summary for the currently implemented controlled Scheduler boundary. It proves one human-confirmed transition observed evidence, selected one legal gate, dispatched only the approved scope, reconciled evidence, and stopped. It is prior-turn evidence only; any continuation must re-read fresh Goal Loop, current-gate, ToolPolicy, and human confirmation evidence.",
    evidenceRefs: unique([
      ...(input.evidenceRefs ?? []),
      ...boundary.evidenceRefs,
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
