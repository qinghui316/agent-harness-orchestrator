import type {
  MainAgentWorkflowGraphReplayGap,
  MainAgentWorkflowGraphReplaySummary,
} from "./workflowgraph-replay.js";

export type MainAgentWorkflowGraphDecisionPolicyKind =
  | "inspect-evidence-gap"
  | "wait-for-planning-evidence"
  | "wait-for-human-gate"
  | "observe-active-queue-loop"
  | "observe-queue-binding"
  | "completed-await-result-gate"
  | "blocked"
  | "stale"
  | "wait";

export type MainAgentWorkflowGraphDecisionPolicyInput = Omit<MainAgentWorkflowGraphReplaySummary, "nextObservation">;

export interface MainAgentWorkflowGraphDecisionPolicyRecommendation {
  authority: "non-executing-main-agent-workflowgraph-decision-policy";
  executionStarted: false;
  kind: MainAgentWorkflowGraphDecisionPolicyKind;
  reason: string;
  targets: string[];
  refs: MainAgentWorkflowGraphDecisionPolicyInput["refs"];
  gaps: MainAgentWorkflowGraphReplayGap[];
}

export function evaluateMainAgentWorkflowGraphReplayPolicy(
  input: MainAgentWorkflowGraphDecisionPolicyInput,
): MainAgentWorkflowGraphDecisionPolicyRecommendation {
  const unsafeGaps = input.gaps.filter((gap) => ["malformed", "scope-mismatch", "stale", "old-schema"].includes(gap.status));
  if (unsafeGaps.length > 0) {
    return recommendation(input, "inspect-evidence-gap", "Replay summary found unsafe or stale evidence that must be inspected before deriving a future decision.", gapTargets(unsafeGaps));
  }

  if (input.currentState.kind === "stale") {
    return recommendation(input, "stale", input.currentState.reason || "WorkflowGraph replay state is stale.", ["workflowgraph-observation"]);
  }

  if (input.currentState.queue.scopeStatus === "mismatch") {
    return recommendation(input, "inspect-evidence-gap", "TaskQueue and WorkflowRun scope mismatch must be inspected before deriving a future decision.", ["workflow-run", "task-queue"]);
  }

  if (input.currentState.workflow.status === "created" && !input.currentState.queue.id) {
    return recommendation(input, "observe-queue-binding", "WorkflowRun is created and waiting for queue binding or recovery; it is not running and should not restart the queue gate.", ["workflow-run", "task-queue"]);
  }

  if (["needs-decomposition", "needs-readiness", "needs-taskqueue-proposal", "needs-workflowgraph-compile"].includes(input.currentState.kind)) {
    return recommendation(input, "wait-for-planning-evidence", input.currentState.reason, ["workflowgraph-observation"]);
  }

  if (input.currentState.kind === "awaiting-queue-start-gate") {
    return recommendation(input, "wait-for-human-gate", input.currentState.reason, ["workflowgraph-observation"]);
  }

  if (input.currentState.kind === "queue-running" || input.currentState.queue.status === "running" || input.currentState.queue.status === "queued") {
    return recommendation(input, "observe-active-queue-loop", "Queue is active; observe queue item and child role-loop evidence without treating this as an execution trigger.", ["main-agent-loop", "task-run", "agent-task"]);
  }

  if (input.currentState.kind === "queue-completed" || input.currentState.queue.status === "completed") {
    return recommendation(input, "completed-await-result-gate", "Queue appears complete; observe terminal validation/audit evidence before any existing result gate.", ["workflow-run", "task-queue", "validation", "audit"]);
  }

  if (input.currentState.kind === "queue-blocked" || input.currentState.queue.status === "blocked" || input.currentState.queue.status === "failed") {
    return recommendation(input, "blocked", input.currentState.reason || "TaskQueue execution is blocked or failed.", ["workflow-run", "task-queue"]);
  }

  if (input.currentState.kind === "queue-paused" || input.currentState.queue.status === "paused") {
    return recommendation(input, "wait-for-human-gate", input.currentState.reason || "TaskQueue execution is paused.", ["workflow-run", "task-queue"]);
  }

  return recommendation(input, "wait", input.currentState.reason || "Replay summary is bounded to current canonical state and historical evidence.", ["workflowgraph-observation"]);
}

export function mainAgentWorkflowGraphPolicyToNextObservation(
  policy: MainAgentWorkflowGraphDecisionPolicyRecommendation,
): MainAgentWorkflowGraphReplaySummary["nextObservation"] {
  return {
    kind: policy.kind,
    reason: policy.reason,
    targets: policy.targets,
  };
}

function recommendation(
  input: MainAgentWorkflowGraphDecisionPolicyInput,
  kind: MainAgentWorkflowGraphDecisionPolicyKind,
  reason: string,
  targets: string[],
): MainAgentWorkflowGraphDecisionPolicyRecommendation {
  return {
    authority: "non-executing-main-agent-workflowgraph-decision-policy",
    executionStarted: false,
    kind,
    reason,
    targets: dedupeStrings(targets),
    refs: input.refs,
    gaps: input.gaps,
  };
}

function gapTargets(gaps: MainAgentWorkflowGraphReplayGap[]): string[] {
  return dedupeStrings(gaps.map((gap) => gap.source));
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = `${value ?? ""}`.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
