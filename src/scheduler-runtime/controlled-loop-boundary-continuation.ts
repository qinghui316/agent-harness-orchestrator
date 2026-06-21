import {
  validateWorkflowActionRequiredTargets,
  workflowActionScopesMatchStrict,
  type WorkflowActionScopeCarrier,
} from "../workflow-actions/registry.js";
import {
  isControlledSchedulerConcreteAction,
  type ControlledSchedulerContinuationPreflightEvidence,
} from "../workflow-scheduler/controlled-step.js";
import type { SchedulerControlledStepEvidence } from "./types.js";

export function assertControlledSchedulerBoundaryContinuation(input: {
  changeId: string;
  requestedConcreteGate: WorkflowActionScopeCarrier;
  previousStep: SchedulerControlledStepEvidence | null;
  previousGateReadinessPreflight?: ControlledSchedulerContinuationPreflightEvidence | null;
}): void {
  const { changeId, requestedConcreteGate, previousStep, previousGateReadinessPreflight } = input;
  if (!previousStep) return;
  if (previousStep.changeId !== changeId) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard found prior controlled step for a different Change.");
  }
  const boundary = previousStep.controlledLoopBoundaryResult;
  if (!boundary) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard requires prior controlled loop boundary result evidence.");
  }
  if (boundary.authority !== "scheduler-runtime-controlled-loop-boundary-result") {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard requires scheduler-runtime boundary-result authority.");
  }
  if (boundary.status !== "recorded" || boundary.warning) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard requires warning-free recorded boundary result evidence.");
  }
  assertForbiddenAuthority(boundary);
  if (
    !boundary.futureContinuationRequiresFreshEvidence
    || !boundary.futureContinuationRequiresFreshCurrentGate
    || !boundary.humanConfirmationStillRequired
    || !boundary.stoppedAfterOneSchedulerTransition
    || !boundary.approvedScopeOnly
  ) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard requires conservative prior boundary flags.");
  }
  if (boundary.continuationReadinessStatus !== "ready-for-human-gate") {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard requires ready prior boundary continuation evidence.");
  }
  if (!boundary.nextGateActionType || !isControlledSchedulerConcreteAction(boundary.nextGateActionType)) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard requires a concrete next scheduler gate.");
  }
  if (boundary.nextGateTargetScopeSource !== "fresh-current-gate-required") {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard requires fresh-current-gate target scope.");
  }
  if (requestedConcreteGate.actionType !== boundary.nextGateActionType) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard submitted gate no longer matches the boundary-result next gate.");
  }
  assertRequiredTargets(requestedConcreteGate, "submitted gate");
  if (!previousGateReadinessPreflight) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard requires prior post-step gate-readiness preflight evidence.");
  }
  if (previousStep.postStepEvidence?.goalLoopGateReadinessPreflightId && previousGateReadinessPreflight.id !== previousStep.postStepEvidence.goalLoopGateReadinessPreflightId) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard preflight id does not match prior controlled step evidence.");
  }
  if (
    previousGateReadinessPreflight.changeId !== changeId
    || previousGateReadinessPreflight.concreteGateInvoked !== false
    || previousGateReadinessPreflight.toolPolicyAuthorizedConcreteGate !== false
    || previousGateReadinessPreflight.executionStarted !== false
  ) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard requires non-executing prior preflight evidence for this Change.");
  }
  if (previousGateReadinessPreflight.currentGate.actionType !== boundary.nextGateActionType) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard prior preflight current gate does not match the boundary-result next gate.");
  }
  if (previousGateReadinessPreflight.currentGate.scope.changeId !== changeId) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard prior preflight current gate is scoped to a different Change.");
  }
  const expectedGate = gateFromCurrentGate(changeId, previousGateReadinessPreflight.currentGate);
  assertRequiredTargets(expectedGate, "prior preflight current gate");
  const comparableSubmittedGate = comparableGateFromRequest(requestedConcreteGate, expectedGate);
  if (!workflowActionScopesMatchStrict(expectedGate, comparableSubmittedGate)) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard submitted gate scope no longer matches prior post-step preflight.");
  }
}

function assertForbiddenAuthority(boundary: NonNullable<SchedulerControlledStepEvidence["controlledLoopBoundaryResult"]>): void {
  if (
    boundary.executionStarted
    || boundary.loopAuthorized
    || boundary.fullParallelExecutorAuthorized
    || boundary.wholeWaveDispatchAuthorized
    || boundary.slotAllocatorAuthorized
    || boundary.sourceMutationAuthorized
    || boundary.applyAuthorized
    || boundary.closeAuthorized
    || boundary.mergeAuthorized
    || boundary.remoteLandingAuthorized
    || boundary.harnessEvolutionAuthorized
  ) {
    throw new Error("planning.scheduler.controlled-advance.run boundary continuation guard rejects boundary result with forbidden authority.");
  }
}

function assertRequiredTargets(request: WorkflowActionScopeCarrier, label: string): void {
  const issues = validateWorkflowActionRequiredTargets(request);
  if (issues.length > 0) {
    throw new Error(`planning.scheduler.controlled-advance.run boundary continuation guard ${label} target is incomplete: ${issues.map((issue) => issue.label).join(", ")}.`);
  }
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
