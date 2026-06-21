import type { WorkflowActionScopeCarrier } from "../workflow-actions/registry.js";
import type { ControlledSchedulerContinuationPreflightEvidence } from "../workflow-scheduler/controlled-step.js";
import {
  evaluateControlledSchedulerBoundaryContinuation,
} from "./controlled-loop-continuation-decision.js";
import type { ControlledSchedulerContinuationDecision, SchedulerControlledStepEvidence } from "./types.js";

export function assertControlledSchedulerBoundaryContinuation(input: {
  changeId: string;
  requestedConcreteGate: WorkflowActionScopeCarrier;
  previousStep: SchedulerControlledStepEvidence | null;
  previousGateReadinessPreflight?: ControlledSchedulerContinuationPreflightEvidence | null;
}): ControlledSchedulerContinuationDecision {
  const decision = evaluateControlledSchedulerBoundaryContinuation({
    ...input,
    requirePriorPreflight: true,
  });
  if (!input.previousStep) return decision;
  if (isRoutableContinuationStatus(decision.status)) return decision;
  throw new Error(`planning.scheduler.controlled-advance.run boundary continuation guard ${decision.reason}`);
}

function isRoutableContinuationStatus(status: string): boolean {
  return status === "ready-for-human-gate"
    || status === "quality-routing"
    || status === "integration-barrier"
    || status === "terminal-handoff";
}
