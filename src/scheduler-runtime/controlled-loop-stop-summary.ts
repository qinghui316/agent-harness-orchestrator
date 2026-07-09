import type {
  SchedulerControlledLoopContinuationReadiness,
  SchedulerControlledLoopIterationSummary,
  SchedulerControlledLoopStopSummary,
  SchedulerControlledLoopTickSummary,
  SchedulerControlledLoopTurnRouteSummary,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepHandoffSummary,
  SchedulerControlledStepResultSummary,
} from "./types.js";

export interface BuildSchedulerControlledLoopStopSummaryInput {
  executedActionType: string;
  postStepHandoff: SchedulerControlledStepHandoffSummary;
  controlledLoopTurnRouteSummary: SchedulerControlledLoopTurnRouteSummary;
  controlledLoopTick: SchedulerControlledLoopTickSummary;
  controlledLoopContinuationReadiness: SchedulerControlledLoopContinuationReadiness;
  controlledLoopIteration: SchedulerControlledLoopIterationSummary;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
  forbiddenAuthority: SchedulerControlledStepForbiddenAuthority;
  evidenceRefs?: string[];
}

export function buildSchedulerControlledLoopStopSummary(
  input: BuildSchedulerControlledLoopStopSummaryInput,
): SchedulerControlledLoopStopSummary {
  const readiness = input.controlledLoopContinuationReadiness;
  const route = input.controlledLoopTurnRouteSummary;
  const tick = input.controlledLoopTick;
  const iteration = input.controlledLoopIteration;
  const warning = readiness.warning
    ?? tick.routeStop.warning
    ?? tick.reconcile.warning
    ?? route.warning
    ?? input.postStepHandoff.warning
    ?? iteration.warning;
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-stop-summary",
    executedActionType: input.executedActionType,
    stopReason: tick.routeStop.stopReason,
    routePosture: route.routePosture,
    continuationReadinessStatus: readiness.status,
    nextGateActionType: readiness.nextCandidateActionType ?? route.nextCandidateActionType,
    resultKind: route.resultKind,
    resultId: route.resultId,
    resultStatus: route.resultStatus,
    humanGateRequired: readiness.humanGateRequired,
    readinessEvidencePrepared: readiness.readinessEvidencePrepared,
    needsReevaluation: readiness.needsReevaluation,
    humanConfirmationStillRequired: true,
    userFacingReason: stopSummaryReason(readiness),
    boundary: "Read-only summary of where one human-confirmed controlled Scheduler step stopped; continuing still requires the existing scoped human confirmation and ToolPolicy path.",
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

function stopSummaryReason(readiness: SchedulerControlledLoopContinuationReadiness): string {
  if (readiness.warning) return `The controlled step stopped and the next posture needs review: ${readiness.warning}`;
  return readiness.reason;
}
