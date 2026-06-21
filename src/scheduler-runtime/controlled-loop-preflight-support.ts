import type {
  ControlledSchedulerPostStepRoutingPreflightSupportInput,
  GoalLoopGateReadinessPreflight,
  GoalLoopCurrentGateSnapshot,
} from "../goal-loop/manager.js";
import type {
  ControlledSchedulerContinuationDecision,
  SchedulerControlledStepEvidence,
} from "./types.js";

export interface ControlledSchedulerPostStepRoutingPreflightSupportSource {
  previousStep: SchedulerControlledStepEvidence;
  previousGateReadinessPreflight: GoalLoopGateReadinessPreflight;
  continuationDecision: ControlledSchedulerContinuationDecision;
}

export interface ControlledSchedulerPostStepRoutingPreflightSupportOptions {
  sourceGoalLoopGateReadinessPreflightId: string;
  controlledSchedulerPostStepRoutingSupport: ControlledSchedulerPostStepRoutingPreflightSupportInput;
}

export function buildControlledSchedulerPostStepRoutingPreflightSupport(input: {
  source?: ControlledSchedulerPostStepRoutingPreflightSupportSource;
  changeId: string;
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId: string;
  currentGate: GoalLoopCurrentGateSnapshot;
}): ControlledSchedulerPostStepRoutingPreflightSupportOptions | undefined {
  if (!input.source) return undefined;
  const { previousStep, previousGateReadinessPreflight, continuationDecision } = input.source;
  const routing = previousStep.controlledLoopPostStepRoutingDecision;
  const sourcePreflightId = previousStep.postStepEvidence.goalLoopGateReadinessPreflightId;
  const label = "Controlled scheduler continuation preflight support";

  if (!isRoutableContinuationStatus(continuationDecision.status)) {
    throw new Error(`${label} requires a ready current continuation decision.`);
  }
  if (continuationDecision.nextGateActionType && continuationDecision.nextGateActionType !== input.currentGate.actionType) {
    throw new Error(`${label} current continuation gate mismatch.`);
  }
  assertNoForbiddenAuthority(label, continuationDecision);
  if (previousStep.changeId !== input.changeId || previousGateReadinessPreflight.changeId !== input.changeId) {
    throw new Error(`${label} change scope mismatch.`);
  }
  if (!routing) {
    throw new Error(`${label} requires prior post-step routing evidence.`);
  }
  if (!sourcePreflightId || previousGateReadinessPreflight.id !== sourcePreflightId) {
    throw new Error(`${label} prior preflight lineage mismatch.`);
  }
  if (previousGateReadinessPreflight.currentGate.actionType !== input.currentGate.actionType) {
    throw new Error(`${label} prior preflight gate mismatch.`);
  }
  if (!scopeMatches(previousGateReadinessPreflight.currentGate.scope, input.currentGate.scope, input.changeId)) {
    throw new Error(`${label} prior preflight scope mismatch: prior=${JSON.stringify(previousGateReadinessPreflight.currentGate.scope)} current=${JSON.stringify(input.currentGate.scope)}.`);
  }
  if (!isRoutableContinuationStatus(routing.continuationReadinessStatus)) {
    throw new Error(`${label} requires ready routing evidence.`);
  }
  if (routing.continuationReadinessStatus !== continuationDecision.status) {
    throw new Error(`${label} routing and continuation decision status mismatch.`);
  }
  if (routing.needsReevaluation !== false) {
    throw new Error(`${label} requires fresh routing evidence.`);
  }
  if (routing.existingGateActionType !== input.currentGate.actionType) {
    throw new Error(`${label} routing gate mismatch.`);
  }
  if (previousStep.postStepEvidence.currentGateActionType && previousStep.postStepEvidence.currentGateActionType !== input.currentGate.actionType) {
    throw new Error(`${label} post-step readiness gate mismatch.`);
  }
  if (!routing.readinessEvidencePrepared || routing.gateTargetScopeSource !== "fresh-current-gate-required" || routing.priorTurnEvidence !== true) {
    throw new Error(`${label} requires prior routing readiness for a fresh current gate.`);
  }
  if (!previousStep.artifact || !previousStep.markdownArtifact) {
    throw new Error(`${label} requires prior controlled step artifacts.`);
  }
  assertNoForbiddenAuthority(label, routing);

  return {
    sourceGoalLoopGateReadinessPreflightId: sourcePreflightId,
    controlledSchedulerPostStepRoutingSupport: {
      authority: "non-executing-controlled-scheduler-post-step-routing-preflight-support",
      sourceSchedulerControlledStepEvidenceId: previousStep.id,
      sourceSchedulerControlledStepArtifact: previousStep.artifact,
      sourceSchedulerControlledStepMarkdownArtifact: previousStep.markdownArtifact,
      changeId: input.changeId,
      sourceGoalLoopNextStepPacketId: input.goalLoopNextStepPacketId,
      sourceGoalLoopControllerPolicyId: input.goalLoopControllerPolicyId,
      sourceGoalLoopGateReadinessPreflightId: sourcePreflightId,
      routeFamily: routing.routeFamily,
      ownerModule: routing.ownerModule,
      existingGateActionType: input.currentGate.actionType,
      continuationDecisionStatus: continuationDecision.status,
      routingReadinessStatus: routing.continuationReadinessStatus,
      needsReevaluation: routing.needsReevaluation,
      reason: routing.reason,
      currentGateScope: cloneScope(input.currentGate.scope),
      evidenceRefs: unique([
        previousStep.markdownArtifact,
        previousStep.artifact,
        previousGateReadinessPreflight.markdownArtifact,
        previousGateReadinessPreflight.artifact,
        ...continuationDecision.evidenceRefs,
        ...routing.evidenceRefs,
      ]),
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
      executionStarted: false,
    },
  };
}

function assertNoForbiddenAuthority(
  label: string,
  value: {
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
  },
): void {
  const forbidden = [
    "executionStarted",
    "loopAuthorized",
    "fullParallelExecutorAuthorized",
    "wholeWaveDispatchAuthorized",
    "slotAllocatorAuthorized",
    "sourceMutationAuthorized",
    "applyAuthorized",
    "closeAuthorized",
    "mergeAuthorized",
    "remoteLandingAuthorized",
    "harnessEvolutionAuthorized",
  ] as const;
  const authorized = forbidden.find((key) => value[key] !== false);
  if (authorized) throw new Error(`${label} has forbidden authority: ${authorized}.`);
}

function isRoutableContinuationStatus(status: string): boolean {
  return status === "ready-for-human-gate"
    || status === "quality-routing"
    || status === "integration-barrier"
    || status === "terminal-handoff";
}

function scopeMatches(
  left: Record<string, string | string[]>,
  right: Record<string, string | string[]>,
  changeId: string,
): boolean {
  for (const key of Object.keys(left)) {
    const leftValue = key === "changeId" ? left[key] ?? changeId : left[key];
    const rightValue = key === "changeId" ? right[key] ?? changeId : right[key];
    if (!scopeValuesEqual(normalizeScopeValue(leftValue), normalizeScopeValue(rightValue))) return false;
  }
  return true;
}

function normalizeScopeValue(value: string | string[] | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return [...value].sort();
  return [];
}

function scopeValuesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function cloneScope(scope: Record<string, string | string[]>): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(scope)) {
    result[key] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
