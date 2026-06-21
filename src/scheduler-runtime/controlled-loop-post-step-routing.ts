import type {
  ControlledSchedulerContinuationDecision,
  SchedulerControlledLoopContinuationReadiness,
  SchedulerControlledLoopCurrentTransitionChoice,
  SchedulerControlledLoopPostStepRoutingDecision,
  SchedulerControlledLoopPostStepRoutingOwner,
  SchedulerControlledLoopRuntimeBoundary,
  SchedulerControlledLoopTurnRoutePosture,
  SchedulerControlledLoopTurnRouteSummary,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepHandoffSummary,
  SchedulerControlledStepResultSummary,
  SchedulerControlledStepResultSummaryValue,
} from "./types.js";

export interface BuildSchedulerControlledLoopPostStepRoutingDecisionInput {
  executedActionType: string;
  postStepHandoff: SchedulerControlledStepHandoffSummary;
  controlledLoopPreDispatchDecision?: ControlledSchedulerContinuationDecision;
  controlledLoopCurrentTransitionChoice?: SchedulerControlledLoopCurrentTransitionChoice;
  controlledLoopTurnRouteSummary: SchedulerControlledLoopTurnRouteSummary;
  controlledLoopContinuationReadiness: SchedulerControlledLoopContinuationReadiness;
  controlledLoopRuntimeBoundary?: SchedulerControlledLoopRuntimeBoundary;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
  forbiddenAuthority: SchedulerControlledStepForbiddenAuthority;
  evidenceRefs?: string[];
}

export function buildSchedulerControlledLoopPostStepRoutingDecision(
  input: BuildSchedulerControlledLoopPostStepRoutingDecisionInput,
): SchedulerControlledLoopPostStepRoutingDecision {
  const route = input.controlledLoopTurnRouteSummary;
  const readiness = input.controlledLoopContinuationReadiness;
  const runtimeBoundary = input.controlledLoopRuntimeBoundary;
  const existingGateActionType = route.nextCandidateActionType
    ?? runtimeBoundary?.nextGateActionType
    ?? input.postStepHandoff.nextConfirmationCandidate?.actionType;
  const warning = readiness.warning
    ?? route.warning
    ?? runtimeBoundary?.warning
    ?? input.postStepHandoff.warning
    ?? (input.controlledLoopPreDispatchDecision?.status === "needs-review" ? input.controlledLoopPreDispatchDecision.reason : undefined);
  const fallbackResult = extractResultFallback(input.controlledStepResultSummary);

  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-post-step-routing-decision",
    routeFamily: route.routePosture,
    continuationReadinessStatus: readiness.status,
    ownerModule: ownerFor(route.routePosture, existingGateActionType),
    executedActionType: input.executedActionType,
    selectedActionType: input.controlledLoopCurrentTransitionChoice?.selectedActionType,
    dispatchedActionType: runtimeBoundary?.dispatchedActionType,
    existingGateActionType,
    gateTargetScopeSource: existingGateActionType ? "fresh-current-gate-required" : "none",
    dispatchedTargetScope: input.controlledLoopCurrentTransitionChoice
      ? { ...input.controlledLoopCurrentTransitionChoice.currentGate.scope }
      : undefined,
    resultKind: route.resultKind ?? fallbackResult.resultKind,
    resultId: route.resultId ?? fallbackResult.resultId,
    resultStatus: route.resultStatus ?? fallbackResult.resultStatus,
    reason: routingReasonFor(route.routePosture, readiness.reason, existingGateActionType),
    boundary: "Prior-turn scheduler-runtime routing input derived from the existing controlled-step evidence chain. It explains which existing owner or gate controls the next step after one human-confirmed Scheduler transition stopped. It does not execute, authorize, reorder, or replace Workbench confirmation, ToolPolicyGate, stale revalidation, source apply, close, merge, remote landing, or Harness evolution.",
    readinessEvidencePrepared: readiness.readinessEvidencePrepared,
    needsReevaluation: readiness.needsReevaluation,
    freshEvidenceRequiredBeforeContinuation: true,
    freshCurrentGateRequiredBeforeContinuation: true,
    humanGateRequired: readiness.humanGateRequired,
    humanConfirmationStillRequired: true,
    priorTurnEvidence: true,
    evidenceRefs: unique([
      ...(input.evidenceRefs ?? []),
      ...readiness.evidenceRefs,
      ...(runtimeBoundary?.evidenceRefs ?? []),
      ...(input.controlledLoopPreDispatchDecision?.evidenceRefs ?? []),
    ]),
    warning,
    executionStarted: false,
    loopAuthorized: false,
    fullParallelExecutorAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    sourceMutationAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    mergeAuthorized: false,
    remoteLandingAuthorized: false,
    harnessEvolutionAuthorized: false,
  };
}

function ownerFor(routeFamily: SchedulerControlledLoopTurnRoutePosture, actionType: string | undefined): SchedulerControlledLoopPostStepRoutingOwner {
  if (routeFamily === "terminal-handoff") return "existing-human-gate";
  if (routeFamily === "waiting" || !actionType) return "goal-loop-current-gate";
  if (actionType.includes("integration-check")) return "integration-check";
  if (actionType.includes("integration-candidate") || actionType.includes("integration-outcome")) return "scheduler-runtime";
  if (actionType.includes(".validate") || actionType.includes(".audit")) return "validation-audit";
  return "scheduler-runtime";
}

function routingReasonFor(
  routeFamily: SchedulerControlledLoopTurnRoutePosture,
  readinessReason: string,
  actionType: string | undefined,
): string {
  if (!actionType) return readinessReason;
  if (routeFamily === "quality-routing") return `Quality or rework evidence controls the next existing gate: ${actionType}. ${readinessReason}`;
  if (routeFamily === "integration-barrier") return `Existing integration owner controls the next gate: ${actionType}. ${readinessReason}`;
  if (routeFamily === "terminal-handoff") return `Terminal handoff remains controlled by existing human gates. ${readinessReason}`;
  if (routeFamily === "awaiting-human-gate") return `The next existing gate is ready for a fresh human confirmation: ${actionType}. ${readinessReason}`;
  if (routeFamily === "recommending-gate") return `The next existing gate is only a recommendation until fresh evidence and human confirmation are present: ${actionType}. ${readinessReason}`;
  return readinessReason;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function extractResultFallback(summary: SchedulerControlledStepResultSummary | undefined): {
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
} {
  if (!summary) return {};
  return {
    resultKind: readResultString(summary.resultKind),
    resultId: firstResultStringValue(summary, (key) => key !== "resultKind" && key !== "resultArtifact" && key.endsWith("Id")),
    resultStatus: firstResultStringValue(summary, (key) => key.endsWith("Status")),
  };
}

function firstResultStringValue(
  summary: SchedulerControlledStepResultSummary,
  predicate: (key: string) => boolean,
): string | undefined {
  for (const [key, value] of Object.entries(summary)) {
    if (predicate(key) && typeof value === "string" && value) return value;
  }
  return undefined;
}

function readResultString(value: SchedulerControlledStepResultSummaryValue | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
