import {
  validateWorkflowActionRequiredTargets,
  workflowActionScopesMatchStrict,
  type WorkflowActionScopeCarrier,
} from "../workflow-actions/registry.js";
import {
  isControlledSchedulerConcreteAction,
  type ControlledSchedulerContinuationPreflightEvidence,
} from "../workflow-scheduler/controlled-step.js";
import type {
  ControlledSchedulerContinuationDecision,
  SchedulerControlledLoopContinuationReadinessStatus,
  SchedulerControlledStepEvidence,
} from "./types.js";

export interface ControlledSchedulerContinuationPriorStepEvidence {
  changeId: string;
  schedulerRunId?: string;
  postStepEvidence?: SchedulerControlledStepEvidence["postStepEvidence"];
  controlledStepResultSummary?: SchedulerControlledStepEvidence["controlledStepResultSummary"];
  controlledLoopBoundaryResult?: SchedulerControlledStepEvidence["controlledLoopBoundaryResult"];
  controlledLoopRuntimeBoundary?: SchedulerControlledStepEvidence["controlledLoopRuntimeBoundary"];
  artifact?: string;
  markdownArtifact?: string;
}

export interface ControlledSchedulerFreshGateSnapshot {
  actionType?: string;
  changeId?: string;
  enabled: boolean;
  requiresConfirmation: boolean;
  scope: WorkflowActionScopeCarrier;
  evidenceRefs?: string[];
}

export function evaluateControlledSchedulerBoundaryContinuation(input: {
  changeId: string;
  previousStep: ControlledSchedulerContinuationPriorStepEvidence | null;
  previousGateReadinessPreflight?: ControlledSchedulerContinuationPreflightEvidence | null;
  requestedConcreteGate?: WorkflowActionScopeCarrier;
  freshGate?: ControlledSchedulerFreshGateSnapshot | null;
  requirePriorPreflight?: boolean;
}): ControlledSchedulerContinuationDecision {
  const { changeId, previousStep } = input;
  if (!previousStep) {
    const gate = input.requestedConcreteGate ?? input.freshGate?.scope;
    if (gate) {
      const requestDecision = evaluateRequestedGate(changeId, gate);
      if (requestDecision) return requestDecision;
    }
    return decision(changeId, "waiting", "No prior controlled Scheduler step exists; this is a bootstrap controlled advance and must use the current concrete human gate.", undefined, []);
  }
  if (previousStep.changeId !== changeId) {
    return decision(changeId, "needs-review", "Prior controlled Scheduler step evidence belongs to a different Change.", undefined, evidenceRefs(previousStep));
  }
  const boundary = previousStep.controlledLoopBoundaryResult;
  if (!boundary) {
    return decision(changeId, "needs-review", "requires prior controlled loop boundary result evidence.", undefined, evidenceRefs(previousStep));
  }
  const runtimeBoundary = previousStep.controlledLoopRuntimeBoundary;
  if (!runtimeBoundary) {
    return decision(changeId, "needs-review", "requires prior controlled loop runtime-boundary evidence.", boundary.nextGateActionType, evidenceRefs(previousStep));
  }
  const boundaryIssue = evaluatePriorBoundary(previousStep);
  if (boundaryIssue) return boundaryIssue;
  const runtimeIssue = evaluatePriorRuntimeBoundary(previousStep);
  if (runtimeIssue) return runtimeIssue;
  if (input.requestedConcreteGate?.actionType !== undefined && input.requestedConcreteGate.actionType !== boundary.nextGateActionType) {
    return decision(changeId, "needs-review", "submitted gate no longer matches the boundary-result next gate.", input.requestedConcreteGate.actionType, evidenceRefs(previousStep));
  }
  const requestedIssue = input.requestedConcreteGate ? evaluateRequestedGate(changeId, input.requestedConcreteGate) : null;
  if (requestedIssue) return requestedIssue;
  const preflightIssue = evaluatePriorPreflight(input);
  if (preflightIssue) return preflightIssue;
  const freshGateIssue = input.freshGate ? evaluateFreshGate(input) : null;
  if (freshGateIssue) return freshGateIssue;
  const comparisonGate = input.requestedConcreteGate ?? input.freshGate?.scope;
  const expectedGate = expectedGateFromInput(input);
  if (comparisonGate && expectedGate) {
    const comparableGate = comparableGateFromRequest(comparisonGate, expectedGate);
    if (!workflowActionScopesMatchStrict(expectedGate, comparableGate)) {
      return decision(changeId, "needs-review", "The current controlled Scheduler gate target scope no longer matches prior post-step evidence.", boundary.nextGateActionType, evidenceRefs(previousStep, input.freshGate));
    }
  }
  return decision(changeId, boundary.continuationReadinessStatus, "Fresh current human-gate evidence matches the prior controlled Scheduler boundary. Continuation still requires the existing human confirmation and ToolPolicy/stale revalidation path.", boundary.nextGateActionType, evidenceRefs(previousStep, input.freshGate));
}

function evaluatePriorBoundary(input: ControlledSchedulerContinuationPriorStepEvidence): ControlledSchedulerContinuationDecision | null {
  const boundary = input.controlledLoopBoundaryResult;
  if (!boundary) return null;
  if (boundary.authority !== "scheduler-runtime-controlled-loop-boundary-result") {
    return decision(input.changeId, "needs-review", "Prior controlled loop boundary-result evidence has an unexpected authority.", boundary.nextGateActionType, evidenceRefs(input));
  }
  if (boundary.status !== "recorded" || boundary.warning) {
    return decision(input.changeId, "needs-review", "Prior controlled loop boundary-result evidence has warnings and must be reviewed before continuation.", boundary.nextGateActionType, evidenceRefs(input));
  }
  if (hasForbiddenAuthority(boundary)) {
    return decision(input.changeId, "needs-review", "Prior controlled loop boundary-result evidence contains forbidden execution or authorization authority.", boundary.nextGateActionType, evidenceRefs(input));
  }
  if (!boundary.futureContinuationRequiresFreshEvidence || !boundary.futureContinuationRequiresFreshCurrentGate || !boundary.humanConfirmationStillRequired || !boundary.stoppedAfterOneSchedulerTransition || !boundary.approvedScopeOnly) {
    return decision(input.changeId, "needs-review", "Prior controlled loop boundary-result evidence is missing conservative continuation flags.", boundary.nextGateActionType, evidenceRefs(input));
  }
  if (!isRoutableContinuationStatus(boundary.continuationReadinessStatus)) {
    return decision(input.changeId, boundary.continuationReadinessStatus, `Prior controlled loop boundary-result evidence routes continuation through existing ${boundary.continuationReadinessStatus} evidence instead of a ready human gate.`, boundary.nextGateActionType, evidenceRefs(input));
  }
  if (!boundary.nextGateActionType || !isControlledSchedulerConcreteAction(boundary.nextGateActionType)) {
    return decision(input.changeId, "needs-review", "Prior controlled loop boundary-result evidence does not name a concrete Scheduler next gate.", boundary.nextGateActionType, evidenceRefs(input));
  }
  if (boundary.nextGateTargetScopeSource !== "fresh-current-gate-required") {
    return decision(input.changeId, "needs-review", "Prior controlled loop boundary-result evidence does not require a fresh current-gate target scope.", boundary.nextGateActionType, evidenceRefs(input));
  }
  return null;
}

function evaluatePriorRuntimeBoundary(input: ControlledSchedulerContinuationPriorStepEvidence): ControlledSchedulerContinuationDecision | null {
  const runtimeBoundary = input.controlledLoopRuntimeBoundary;
  if (!runtimeBoundary) return null;
  if (runtimeBoundary.authority !== "scheduler-runtime-controlled-loop-runtime-boundary-evidence") {
    return decision(input.changeId, "needs-review", "Prior controlled loop runtime-boundary evidence has an unexpected authority.", runtimeBoundary.nextGateActionType, evidenceRefs(input));
  }
  if (runtimeBoundary.status !== "recorded" || runtimeBoundary.warning) {
    return decision(input.changeId, "needs-review", "Prior controlled loop runtime-boundary evidence has warnings and must be reviewed before continuation.", runtimeBoundary.nextGateActionType, evidenceRefs(input));
  }
  if (hasForbiddenAuthority(runtimeBoundary)) {
    return decision(input.changeId, "needs-review", "Prior controlled loop runtime-boundary evidence contains forbidden execution or authorization authority.", runtimeBoundary.nextGateActionType, evidenceRefs(input));
  }
  if (!runtimeBoundary.priorTurnEvidence || !runtimeBoundary.freshEvidenceRequiredBeforeContinuation || !runtimeBoundary.freshCurrentGateRequiredBeforeContinuation || !runtimeBoundary.humanConfirmationStillRequired || !runtimeBoundary.stoppedAfterOneSchedulerTransition || !runtimeBoundary.approvedScopeOnly) {
    return decision(input.changeId, "needs-review", "Prior controlled loop runtime-boundary evidence is missing conservative continuation flags.", runtimeBoundary.nextGateActionType, evidenceRefs(input));
  }
  const boundary = input.controlledLoopBoundaryResult;
  if (boundary?.nextGateActionType !== runtimeBoundary.nextGateActionType) {
    return decision(input.changeId, "needs-review", "Prior controlled loop runtime-boundary next gate no longer matches boundary-result evidence.", runtimeBoundary.nextGateActionType, evidenceRefs(input));
  }
  if (runtimeBoundary.nextGateTargetScopeSource !== "fresh-current-gate-required") {
    return decision(input.changeId, "needs-review", "Prior controlled loop runtime-boundary evidence does not require a fresh current-gate target scope.", runtimeBoundary.nextGateActionType, evidenceRefs(input));
  }
  return null;
}

function evaluateRequestedGate(changeId: string, gate: WorkflowActionScopeCarrier): ControlledSchedulerContinuationDecision | null {
  if (!gate.actionType || !isControlledSchedulerConcreteAction(gate.actionType)) {
    return decision(changeId, "needs-review", "The submitted continuation target is not a concrete Scheduler gate.", gate.actionType, []);
  }
  if (gate.changeId !== changeId) {
    return decision(changeId, "needs-review", "The submitted continuation target belongs to a different Change.", gate.actionType, []);
  }
  const issues = validateWorkflowActionRequiredTargets(gate);
  if (issues.length > 0) {
    return decision(changeId, "needs-review", `submitted gate target is incomplete: ${issues.map((issue) => issue.label).join(", ")}.`, gate.actionType, []);
  }
  return null;
}

function evaluatePriorPreflight(input: {
  changeId: string;
  previousStep: ControlledSchedulerContinuationPriorStepEvidence | null;
  previousGateReadinessPreflight?: ControlledSchedulerContinuationPreflightEvidence | null;
  requestedConcreteGate?: WorkflowActionScopeCarrier;
  requirePriorPreflight?: boolean;
}): ControlledSchedulerContinuationDecision | null {
  const previousStep = input.previousStep;
  if (!previousStep) return null;
  const boundary = previousStep.controlledLoopBoundaryResult;
  const priorPreflightId = previousStep.postStepEvidence?.goalLoopGateReadinessPreflightId;
  if (!input.requirePriorPreflight && !input.previousGateReadinessPreflight) return null;
  if (!input.previousGateReadinessPreflight) {
    return decision(input.changeId, "needs-review", "Prior post-step Goal Loop gate-readiness preflight evidence is unavailable.", boundary?.nextGateActionType, evidenceRefs(previousStep));
  }
  const preflight = input.previousGateReadinessPreflight;
  if (priorPreflightId && preflight.id !== priorPreflightId) {
    return decision(input.changeId, "needs-review", "Prior post-step Goal Loop gate-readiness preflight id does not match controlled step evidence.", boundary?.nextGateActionType, evidenceRefs(previousStep));
  }
  if (preflight.changeId !== input.changeId || preflight.concreteGateInvoked !== false || preflight.toolPolicyAuthorizedConcreteGate !== false || preflight.executionStarted !== false) {
    return decision(input.changeId, "needs-review", "Prior post-step Goal Loop gate-readiness preflight is not non-executing evidence for this Change.", preflight.currentGate.actionType, evidenceRefs(previousStep));
  }
  if (preflight.currentGate.actionType !== boundary?.nextGateActionType) {
    return decision(input.changeId, "needs-review", "Prior post-step Goal Loop gate-readiness preflight current gate does not match boundary-result evidence.", preflight.currentGate.actionType, evidenceRefs(previousStep));
  }
  if (input.requestedConcreteGate?.actionType !== boundary?.nextGateActionType) {
    return decision(input.changeId, "needs-review", "submitted gate no longer matches the boundary-result next gate.", input.requestedConcreteGate?.actionType, evidenceRefs(previousStep));
  }
  if (preflight.currentGate.scope.changeId !== input.changeId) {
    return decision(input.changeId, "needs-review", "Prior post-step Goal Loop gate-readiness preflight current gate belongs to a different Change.", preflight.currentGate.actionType, evidenceRefs(previousStep));
  }
  const expectedGate = gateFromCurrentGate(input.changeId, preflight.currentGate);
  const issues = validateWorkflowActionRequiredTargets(expectedGate);
  if (issues.length > 0) {
    return decision(input.changeId, "needs-review", `Prior post-step Goal Loop gate-readiness preflight current gate is missing required target ids: ${issues.map((issue) => issue.label).join(", ")}.`, expectedGate.actionType, evidenceRefs(previousStep));
  }
  if (input.requestedConcreteGate) {
    const comparableSubmittedGate = comparableGateFromRequest(input.requestedConcreteGate, expectedGate);
    if (!workflowActionScopesMatchStrict(expectedGate, comparableSubmittedGate)) {
      return decision(input.changeId, "needs-review", "submitted gate scope no longer matches prior post-step preflight.", expectedGate.actionType, evidenceRefs(previousStep));
    }
  }
  return null;
}

function evaluateFreshGate(input: {
  changeId: string;
  previousStep: ControlledSchedulerContinuationPriorStepEvidence | null;
  freshGate?: ControlledSchedulerFreshGateSnapshot | null;
}): ControlledSchedulerContinuationDecision | null {
  const previousStep = input.previousStep;
  const freshGate = input.freshGate;
  const boundary = previousStep?.controlledLoopBoundaryResult;
  if (!previousStep || !freshGate) return null;
  if (!freshGate.requiresConfirmation) {
    return decision(input.changeId, "waiting", "No current visible human confirmation gate is available for the recorded controlled Scheduler continuation.", boundary?.nextGateActionType, evidenceRefs(previousStep, freshGate));
  }
  if (!freshGate.enabled) {
    return decision(input.changeId, "needs-review", "The current visible human confirmation gate is disabled, so continuation needs review.", boundary?.nextGateActionType, evidenceRefs(previousStep, freshGate));
  }
  if (freshGate.changeId !== input.changeId || freshGate.scope.changeId !== input.changeId) {
    return decision(input.changeId, "needs-review", "The current visible human confirmation gate belongs to a different Change.", freshGate.actionType, evidenceRefs(previousStep, freshGate));
  }
  if (freshGate.actionType !== boundary?.nextGateActionType || freshGate.scope.actionType !== boundary?.nextGateActionType) {
    return decision(input.changeId, "needs-review", "The current visible human confirmation gate action no longer matches prior controlled Scheduler boundary evidence.", freshGate.actionType, evidenceRefs(previousStep, freshGate));
  }
  const issues = validateWorkflowActionRequiredTargets(freshGate.scope);
  if (issues.length > 0) {
    return decision(input.changeId, "needs-review", `The current visible human confirmation gate is missing required target ids: ${issues.map((issue) => issue.label).join(", ")}.`, freshGate.actionType, evidenceRefs(previousStep, freshGate));
  }
  if (previousStep.schedulerRunId && freshGate.scope.schedulerRunId !== previousStep.schedulerRunId) {
    return decision(input.changeId, "needs-review", "The current visible human confirmation gate targets a different SchedulerRun.", freshGate.actionType, evidenceRefs(previousStep, freshGate));
  }
  return null;
}

function expectedGateFromInput(input: {
  changeId: string;
  previousStep: ControlledSchedulerContinuationPriorStepEvidence | null;
  previousGateReadinessPreflight?: ControlledSchedulerContinuationPreflightEvidence | null;
}): WorkflowActionScopeCarrier | undefined {
  if (input.previousGateReadinessPreflight) {
    return gateFromCurrentGate(input.changeId, input.previousGateReadinessPreflight.currentGate);
  }
  const previousStep = input.previousStep;
  const boundary = previousStep?.controlledLoopBoundaryResult;
  if (!previousStep || !boundary?.nextGateActionType) return undefined;
  const result: WorkflowActionScopeCarrier = {
    actionType: boundary.nextGateActionType,
    changeId: input.changeId,
  };
  if (previousStep.schedulerRunId) result.schedulerRunId = previousStep.schedulerRunId;
  const workerStartId = previousStep.controlledStepResultSummary
    && typeof previousStep.controlledStepResultSummary === "object"
    && "schedulerWorkerStartId" in previousStep.controlledStepResultSummary
    && typeof previousStep.controlledStepResultSummary.schedulerWorkerStartId === "string"
      ? previousStep.controlledStepResultSummary.schedulerWorkerStartId
      : undefined;
  if (boundary.nextGateActionType === "planning.scheduler.worker.reconcile-result" && workerStartId) {
    result.schedulerWorkerStartId = workerStartId;
  }
  return result;
}

function gateFromCurrentGate(changeId: string, gate: { actionType: string; scope: Record<string, string | string[]> }): WorkflowActionScopeCarrier {
  return {
    ...scopeToCarrier(gate.scope),
    actionType: gate.actionType,
    changeId,
  };
}

function comparableGateFromRequest(request: WorkflowActionScopeCarrier, expected: WorkflowActionScopeCarrier): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = {
    actionType: expected.actionType,
    changeId: expected.changeId ?? request.changeId,
  };
  for (const key of Object.keys(expected) as Array<keyof WorkflowActionScopeCarrier>) {
    if (key === "actionType" || key === "changeId") continue;
    const value = request[key];
    if (typeof value === "string") {
      (result as Record<string, string | string[]>)[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      (result as Record<string, string | string[]>)[key] = [...value];
    }
  }
  return result;
}

function scopeToCarrier(scope: Record<string, string | string[]>): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = {};
  for (const [key, value] of Object.entries(scope)) {
    (result as Record<string, string | string[]>)[key] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}

function hasForbiddenAuthority(flags: {
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}): boolean {
  return Boolean(
    flags.executionStarted
    || flags.loopAuthorized
    || flags.fullParallelExecutorAuthorized
    || flags.wholeWaveDispatchAuthorized
    || flags.slotAllocatorAuthorized
    || flags.sourceMutationAuthorized
    || flags.applyAuthorized
    || flags.closeAuthorized
    || flags.mergeAuthorized
    || flags.remoteLandingAuthorized
    || flags.harnessEvolutionAuthorized
  );
}

function isRoutableContinuationStatus(status: SchedulerControlledLoopContinuationReadinessStatus): boolean {
  return status === "ready-for-human-gate"
    || status === "quality-routing"
    || status === "integration-barrier"
    || status === "terminal-handoff";
}

function decision(
  changeId: string,
  status: SchedulerControlledLoopContinuationReadinessStatus,
  reason: string,
  nextGateActionType: string | undefined,
  refs: string[],
): ControlledSchedulerContinuationDecision {
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-continuation-decision",
    status,
    changeId,
    nextGateActionType,
    reason,
    boundary: "Read-only scheduler-runtime continuation decision. It compares prior controlled Scheduler boundary evidence with fresh current gate evidence and never dispatches, authorizes, mutates source, applies, closes, merges, lands remotely, or evolves Harness state.",
    evidenceRefs: unique(refs),
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

function evidenceRefs(
  step: ControlledSchedulerContinuationPriorStepEvidence,
  freshGate?: ControlledSchedulerFreshGateSnapshot | null,
): string[] {
  return unique([
    step.markdownArtifact,
    step.artifact,
    ...(step.controlledLoopRuntimeBoundary?.evidenceRefs ?? []),
    ...(step.controlledLoopBoundaryResult?.evidenceRefs ?? []),
    ...(freshGate?.evidenceRefs ?? []),
  ].filter((item): item is string => Boolean(item)));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
