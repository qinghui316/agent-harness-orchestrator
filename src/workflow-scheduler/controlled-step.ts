import { isWorkflowActionType, validateWorkflowActionRequiredTargets, workflowActionScopesMatchStrict, type WorkflowActionScopeCarrier, type WorkflowActionType } from "../workflow-actions/registry.js";

export const CONTROLLED_SCHEDULER_STEP_ACTION_TYPE = "planning.scheduler.controlled-step.run" as const;
export const CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE = "planning.scheduler.controlled-advance.run" as const;

const CONTROLLED_SCHEDULER_WRAPPER_ACTION_TYPES = new Set<string>([
  CONTROLLED_SCHEDULER_STEP_ACTION_TYPE,
  CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE,
]);

export interface ControlledSchedulerStepRequest {
  wrapper: WorkflowActionScopeCarrier;
  concrete: WorkflowActionScopeCarrier & { actionType: WorkflowActionType };
}

export interface ControlledSchedulerAdvanceEvidence {
  goalLoopDecisionId: string;
  goalLoopIterationId: string;
  goalLoopContinuationBriefId: string;
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId: string;
  goalLoopGateReadinessPreflightId: string;
}

export interface ControlledSchedulerContinuationStepEvidence {
  id: string;
  changeId: string;
  schedulerRunId?: string;
  status: string;
  postStepEvidence?: {
    evaluationWarning?: string;
    readinessWarning?: string;
    goalLoopGateReadinessPreflightId?: string;
  };
  controlledLoopContinuationReadiness?: {
    status: string;
    nextCandidateActionType?: string;
    readinessEvidencePrepared: boolean;
    warning?: string;
  };
}

export interface ControlledSchedulerContinuationPreflightEvidence {
  id: string;
  changeId: string;
  currentGate: {
    actionType: string;
    scope: Record<string, string | string[]>;
  };
  concreteGateInvoked: false;
  toolPolicyAuthorizedConcreteGate: false;
  executionStarted: false;
}

export type ControlledSchedulerContinuationGuardStatus = "bootstrap" | "matched";

export function buildControlledSchedulerStepRequest(request: WorkflowActionScopeCarrier): ControlledSchedulerStepRequest {
  if (request.actionType !== CONTROLLED_SCHEDULER_STEP_ACTION_TYPE) {
    throw new Error("Controlled scheduler step requires planning.scheduler.controlled-step.run.");
  }
  const concreteActionType = request.goalLoopCurrentGateActionType;
  if (!isControlledSchedulerConcreteAction(concreteActionType)) {
    throw new Error("planning.scheduler.controlled-step.run requires a concrete planning.scheduler.* current gate.");
  }
  if (!request.goalLoopNextStepPacketId) {
    throw new Error("planning.scheduler.controlled-step.run requires goalLoopNextStepPacketId.");
  }
  if (!request.goalLoopControllerPolicyId) {
    throw new Error("planning.scheduler.controlled-step.run requires goalLoopControllerPolicyId.");
  }
  if (!request.goalLoopGateReadinessPreflightId) {
    throw new Error("planning.scheduler.controlled-step.run requires goalLoopGateReadinessPreflightId.");
  }
  return {
    wrapper: request,
    concrete: {
      ...request,
      actionType: concreteActionType,
    },
  };
}

export function buildControlledSchedulerAdvanceStepRequest(request: WorkflowActionScopeCarrier, evidence: ControlledSchedulerAdvanceEvidence): ControlledSchedulerStepRequest {
  if (request.actionType !== CONTROLLED_SCHEDULER_ADVANCE_ACTION_TYPE) {
    throw new Error("Controlled scheduler advance requires planning.scheduler.controlled-advance.run.");
  }
  const concreteActionType = request.goalLoopCurrentGateActionType;
  if (!isControlledSchedulerConcreteAction(concreteActionType)) {
    throw new Error("planning.scheduler.controlled-advance.run requires a concrete planning.scheduler.* current gate.");
  }
  return buildControlledSchedulerStepRequest({
    ...request,
    actionType: CONTROLLED_SCHEDULER_STEP_ACTION_TYPE,
    goalLoopDecisionId: evidence.goalLoopDecisionId,
    goalLoopIterationId: evidence.goalLoopIterationId,
    goalLoopContinuationBriefId: evidence.goalLoopContinuationBriefId,
    goalLoopNextStepPacketId: evidence.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: evidence.goalLoopControllerPolicyId,
    goalLoopGateReadinessPreflightId: evidence.goalLoopGateReadinessPreflightId,
    goalLoopCurrentGateActionType: concreteActionType,
  });
}

export function isControlledSchedulerWrapperAction(actionType: string | undefined): boolean {
  return typeof actionType === "string" && CONTROLLED_SCHEDULER_WRAPPER_ACTION_TYPES.has(actionType);
}

export function isControlledSchedulerConcreteAction(actionType: string | undefined): actionType is WorkflowActionType {
  return typeof actionType === "string"
    && isWorkflowActionType(actionType)
    && !isControlledSchedulerWrapperAction(actionType)
    && actionType.startsWith("planning.scheduler.")
    && !actionType.startsWith("planning.goal-loop.");
}

export function assertControlledSchedulerFreshGateMatchesRequest(
  actionType: string,
  scope: Record<string, string | string[]>,
  requestedConcreteGate: WorkflowActionScopeCarrier,
  label: string,
): void {
  const expectedGate: WorkflowActionScopeCarrier = { actionType, ...scope };
  if (expectedGate.changeId !== requestedConcreteGate.changeId) {
    throw new Error(`planning.scheduler.controlled-advance.run fresh ${label} scope no longer matches the submitted scheduler gate.`);
  }
  const requestedGate = concreteGateFromScope(requestedConcreteGate, expectedGate);
  if (!workflowActionScopesMatchStrict(expectedGate, requestedGate)) {
    throw new Error(`planning.scheduler.controlled-advance.run fresh ${label} scope no longer matches the submitted scheduler gate.`);
  }
}

export function assertControlledSchedulerContinuationGuard(input: {
  changeId: string;
  requestedConcreteGate: WorkflowActionScopeCarrier;
  previousStep: ControlledSchedulerContinuationStepEvidence | null;
  previousGateReadinessPreflight?: ControlledSchedulerContinuationPreflightEvidence | null;
}): ControlledSchedulerContinuationGuardStatus {
  const { changeId, requestedConcreteGate, previousStep, previousGateReadinessPreflight } = input;
  if (!previousStep) {
    assertControlledSchedulerConcreteGateRequest(requestedConcreteGate, "planning.scheduler.controlled-advance.run bootstrap");
    return "bootstrap";
  }
  if (previousStep.changeId !== changeId) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard found prior controlled step for a different Change.");
  }
  if (previousStep.status !== "recorded") {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard requires prior controlled step evidence without warnings.");
  }
  if (previousStep.postStepEvidence?.evaluationWarning || previousStep.postStepEvidence?.readinessWarning) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard requires warning-free post-step evidence.");
  }
  const readiness = previousStep.controlledLoopContinuationReadiness;
  if (!readiness) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard requires prior continuation readiness evidence.");
  }
  if (!isRoutableContinuationStatus(readiness.status) || !readiness.readinessEvidencePrepared || readiness.warning) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard requires routable prior continuation evidence.");
  }
  if (!previousStep.postStepEvidence?.goalLoopGateReadinessPreflightId) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard requires prior post-step gate-readiness preflight evidence.");
  }
  if (!previousGateReadinessPreflight) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard could not load prior post-step gate-readiness preflight.");
  }
  if (previousGateReadinessPreflight.id !== previousStep.postStepEvidence.goalLoopGateReadinessPreflightId) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard preflight id does not match prior controlled step evidence.");
  }
  if (
    previousGateReadinessPreflight.changeId !== changeId
    || previousGateReadinessPreflight.concreteGateInvoked !== false
    || previousGateReadinessPreflight.toolPolicyAuthorizedConcreteGate !== false
    || previousGateReadinessPreflight.executionStarted !== false
  ) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard requires non-executing prior preflight evidence for this Change.");
  }
  if (readiness.nextCandidateActionType !== previousGateReadinessPreflight.currentGate.actionType) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard readiness action does not match prior preflight current gate.");
  }
  if (readiness.nextCandidateActionType !== requestedConcreteGate.actionType) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard current scheduler gate no longer matches prior continuation readiness.");
  }
  if (previousGateReadinessPreflight.currentGate.scope.changeId !== changeId) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard prior preflight current gate is scoped to a different Change.");
  }
  const expectedGate = gateFromCurrentGate(changeId, previousGateReadinessPreflight.currentGate);
  assertControlledSchedulerConcreteGateRequest(expectedGate, "planning.scheduler.controlled-advance.run continuation guard expected gate");
  assertControlledSchedulerConcreteGateRequest(requestedConcreteGate, "planning.scheduler.controlled-advance.run continuation guard submitted gate");
  const comparableSubmittedGate = concreteGateFromScope(requestedConcreteGate, expectedGate);
  if (!workflowActionScopesMatchStrict(expectedGate, comparableSubmittedGate)) {
    throw new Error("planning.scheduler.controlled-advance.run continuation guard submitted gate scope no longer matches prior post-step preflight.");
  }
  return "matched";
}

function isRoutableContinuationStatus(status: string): boolean {
  return status === "ready-for-human-gate"
    || status === "quality-routing"
    || status === "integration-barrier"
    || status === "terminal-handoff";
}

function assertControlledSchedulerConcreteGateRequest(request: WorkflowActionScopeCarrier, label: string): void {
  if (!request.actionType || !isControlledSchedulerConcreteAction(request.actionType)) {
    throw new Error(`${label} requires a concrete planning.scheduler.* gate.`);
  }
  const issues = validateWorkflowActionRequiredTargets(request);
  if (issues.length > 0) {
    throw new Error(`${label} concrete gate target is incomplete: ${issues.map((issue) => issue.label).join(", ")}.`);
  }
}

function concreteGateFromScope(request: WorkflowActionScopeCarrier, expected: WorkflowActionScopeCarrier): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = { actionType: expected.actionType, changeId: expected.changeId ?? request.changeId };
  for (const key of Object.keys(expected) as Array<keyof WorkflowActionScopeCarrier>) {
    if (key === "actionType" || key === "changeId") continue;
    const value = request[key];
    if (typeof value === "string") {
      (result as Record<string, string>)[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      (result as Record<string, string[]>)[key] = value;
    }
  }
  return result;
}

function gateFromCurrentGate(changeId: string, gate: { actionType: string; scope: Record<string, string | string[]> }): WorkflowActionScopeCarrier {
  return {
    actionType: gate.actionType,
    ...scopeToCarrier(gate.scope),
    changeId,
  };
}

function scopeToCarrier(scope: Record<string, string | string[]>): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = {};
  for (const [key, value] of Object.entries(scope)) {
    (result as Record<string, string | string[]>)[key] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}
