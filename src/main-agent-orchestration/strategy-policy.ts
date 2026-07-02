import type {
  MainAgentStrategyDecisionKind,
  MainAgentWorkflowGraphDecisionPolicyInput,
  MainAgentWorkflowGraphDecisionPolicyKind,
} from "./decision-policy.js";

export type MainAgentWorkflowShapeKind =
  | "direct"
  | "pipeline"
  | "parallel-candidate"
  | "clarify"
  | "blocked"
  | "terminal"
  | "stale";

export type MainAgentWorkflowShapeBarrier =
  | "none"
  | "pipeline-stage"
  | "parallel-barrier"
  | "integration-required";

export type MainAgentWorkflowShapeIsolation =
  | "none"
  | "single-worktree"
  | "multi-worktree-candidate";

export type MainAgentLeafRoleHint =
  | "coder"
  | "validator"
  | "auditor"
  | "rework"
  | "scheduler-worker";

export interface MainAgentWorkflowShape {
  kind: MainAgentWorkflowShapeKind;
  reason: string;
  leafInteraction: {
    roles: MainAgentLeafRoleHint[];
  };
  barrier: MainAgentWorkflowShapeBarrier;
  isolation: MainAgentWorkflowShapeIsolation;
}

export interface DeriveMainAgentWorkflowShapeInput {
  input: MainAgentWorkflowGraphDecisionPolicyInput;
  strategyKind: MainAgentStrategyDecisionKind;
  strategyReason: string;
  policyKind: MainAgentWorkflowGraphDecisionPolicyKind;
}

export function deriveMainAgentWorkflowShape(
  options: DeriveMainAgentWorkflowShapeInput,
): MainAgentWorkflowShape {
  const reason = workflowShapeReason(options);
  switch (options.strategyKind) {
    case "direct-single-worktree":
      return {
        kind: "direct",
        reason,
        leafInteraction: { roles: ["coder", "validator", "auditor", "rework"] },
        barrier: "none",
        isolation: "single-worktree",
      };
    case "sequential-workflowgraph":
      return {
        kind: "pipeline",
        reason,
        leafInteraction: { roles: ["coder", "validator", "auditor", "rework"] },
        barrier: "pipeline-stage",
        isolation: "single-worktree",
      };
    case "parallel-scheduler-candidate":
      return {
        kind: "parallel-candidate",
        reason,
        leafInteraction: { roles: ["scheduler-worker", "validator", "auditor", "rework"] },
        barrier: "parallel-barrier",
        isolation: "multi-worktree-candidate",
      };
    case "read-only-or-clarify":
    case "wait-for-human-gate":
      return {
        kind: "clarify",
        reason,
        leafInteraction: { roles: [] },
        barrier: "none",
        isolation: "none",
      };
    case "blocked":
      return {
        kind: "blocked",
        reason,
        leafInteraction: { roles: [] },
        barrier: "none",
        isolation: "none",
      };
    case "complete":
      return {
        kind: "terminal",
        reason,
        leafInteraction: { roles: [] },
        barrier: terminalBarrier(options.input),
        isolation: "none",
      };
    case "stale":
      return {
        kind: "stale",
        reason,
        leafInteraction: { roles: [] },
        barrier: "none",
        isolation: "none",
      };
  }
}

function workflowShapeReason(options: DeriveMainAgentWorkflowShapeInput): string {
  const readiness = options.input.currentState.readiness;
  const readinessStatus = readiness.status ? ` readiness=${readiness.status}` : "";
  const nextAllowedAction = readiness.nextAllowedAction ? ` next=${readiness.nextAllowedAction}` : "";
  return `${options.strategyReason} [policy=${options.policyKind}${readinessStatus}${nextAllowedAction}]`;
}

function terminalBarrier(
  input: MainAgentWorkflowGraphDecisionPolicyInput,
): MainAgentWorkflowShapeBarrier {
  const latestStep = input.controlledScheduler.latestStep;
  if (
    latestStep?.routePosture === "terminal-handoff"
    || latestStep?.continuationReadinessStatus === "terminal-handoff"
    || latestStep?.postStepHandoffStatus === "terminal-handoff"
  ) {
    return "integration-required";
  }
  return "none";
}
