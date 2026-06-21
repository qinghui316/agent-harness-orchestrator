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
  if (decision.status === "ready-for-human-gate") return decision;
  throw new Error(`planning.scheduler.controlled-advance.run boundary continuation guard ${decision.reason}`);
}
