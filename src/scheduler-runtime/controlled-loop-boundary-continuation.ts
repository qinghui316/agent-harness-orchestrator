import type { WorkflowActionScopeCarrier } from "../workflow-actions/registry.js";
import type { ControlledSchedulerContinuationPreflightEvidence } from "../workflow-scheduler/controlled-step.js";
import {
  evaluateControlledSchedulerBoundaryContinuation,
} from "./controlled-loop-continuation-decision.js";
import type { SchedulerControlledStepEvidence } from "./types.js";

export function assertControlledSchedulerBoundaryContinuation(input: {
  changeId: string;
  requestedConcreteGate: WorkflowActionScopeCarrier;
  previousStep: SchedulerControlledStepEvidence | null;
  previousGateReadinessPreflight?: ControlledSchedulerContinuationPreflightEvidence | null;
}): void {
  const decision = evaluateControlledSchedulerBoundaryContinuation({
    ...input,
    requirePriorPreflight: true,
  });
  if (!input.previousStep) return;
  if (decision.status === "ready-for-human-gate") return;
  throw new Error(`planning.scheduler.controlled-advance.run boundary continuation guard ${decision.reason}`);
}
