import type {
  SchedulerControlledLoopContinuationReadiness,
  SchedulerControlledLoopTickSummary,
  SchedulerControlledLoopTurnRouteSummary,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepHandoffSummary,
  SchedulerControlledStepResultSummary,
} from "./types.js";

export interface BuildSchedulerControlledLoopContinuationReadinessInput {
  executedActionType: string;
  postStepHandoff: SchedulerControlledStepHandoffSummary;
  controlledLoopTurnRouteSummary: SchedulerControlledLoopTurnRouteSummary;
  controlledLoopTick: SchedulerControlledLoopTickSummary;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
  forbiddenAuthority: SchedulerControlledStepForbiddenAuthority;
  evidenceRefs?: string[];
}

export function buildSchedulerControlledLoopContinuationReadiness(
  input: BuildSchedulerControlledLoopContinuationReadinessInput,
): SchedulerControlledLoopContinuationReadiness {
  const route = input.controlledLoopTurnRouteSummary;
  const tick = input.controlledLoopTick;
  const candidate = input.postStepHandoff.nextConfirmationCandidate;
  const warning = tick.routeStop.warning ?? tick.reconcile.warning ?? route.warning ?? input.postStepHandoff.warning;
  const readinessEvidencePrepared = Boolean(candidate?.readinessEvidencePrepared)
    && Boolean(tick.reconcile.goalLoopNextStepPacketId)
    && Boolean(tick.reconcile.goalLoopControllerPolicyId)
    && Boolean(tick.reconcile.goalLoopGateReadinessPreflightId)
    && !input.postStepHandoff.needsReevaluation
    && !warning;
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-continuation-readiness",
    status: readinessStatusFor(route, readinessEvidencePrepared, input.postStepHandoff.needsReevaluation, warning),
    routePosture: route.routePosture,
    executedActionType: input.executedActionType,
    nextCandidateActionType: route.nextCandidateActionType,
    resultKind: route.resultKind,
    resultId: route.resultId,
    resultStatus: route.resultStatus,
    reason: readinessReasonFor(route, readinessEvidencePrepared, input.postStepHandoff.needsReevaluation, warning),
    boundary: "Read-only continuation readiness; the next transition still requires the existing scoped human gate and ToolPolicy path.",
    readinessEvidencePrepared,
    needsReevaluation: input.postStepHandoff.needsReevaluation,
    humanGateRequired: route.humanGateRequired,
    humanConfirmationStillRequired: true,
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

function readinessStatusFor(
  route: SchedulerControlledLoopTurnRouteSummary,
  readinessEvidencePrepared: boolean,
  needsReevaluation: boolean,
  warning: string | undefined,
): SchedulerControlledLoopContinuationReadiness["status"] {
  if (route.routePosture === "quality-routing") return "quality-routing";
  if (route.routePosture === "integration-barrier") return "integration-barrier";
  if (route.routePosture === "terminal-handoff") return "terminal-handoff";
  if (route.routePosture === "waiting" || !route.nextCandidateActionType) return "waiting";
  if (needsReevaluation || warning || !readinessEvidencePrepared) return "needs-review";
  return "ready-for-human-gate";
}

function readinessReasonFor(
  route: SchedulerControlledLoopTurnRouteSummary,
  readinessEvidencePrepared: boolean,
  needsReevaluation: boolean,
  warning: string | undefined,
): string {
  if (warning) return `Post-step evidence needs review: ${warning}`;
  if (route.routePosture === "quality-routing") return "Quality, validation, audit, blocked, or rework evidence controls the next step.";
  if (route.routePosture === "integration-barrier") return "IntegrationCheck evidence is the barrier before any combined apply path.";
  if (route.routePosture === "terminal-handoff") return "Terminal scheduler evidence can only hand off to existing human close/apply gates.";
  if (route.routePosture === "waiting" || !route.nextCandidateActionType) return "No current continuation gate is ready; wait for fresh evidence.";
  if (needsReevaluation) return "The next candidate exists, but post-step evidence says it must be reevaluated before continuing.";
  if (!readinessEvidencePrepared) return "The next candidate exists, but controller/preflight readiness evidence is not complete.";
  return "The last controlled step stopped and the next candidate is ready for the existing human confirmation gate.";
}
