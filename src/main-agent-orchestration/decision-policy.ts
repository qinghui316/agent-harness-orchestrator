import type {
  MainAgentWorkflowGraphReplayGap,
  MainAgentWorkflowGraphReplaySummary,
} from "./workflowgraph-replay.js";
import {
  deriveMainAgentWorkflowShape,
  type MainAgentWorkflowShape,
} from "./strategy-policy.js";
import {
  buildMainAgentStrategyAdvice,
  type MainAgentStrategyAdvice,
} from "./strategy-advice.js";

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

export type MainAgentStrategyDecisionKind =
  | "direct-single-worktree"
  | "sequential-workflowgraph"
  | "parallel-scheduler-candidate"
  | "read-only-or-clarify"
  | "wait-for-human-gate"
  | "blocked"
  | "complete"
  | "stale";

export type MainAgentStrategyStepwiseCompatibility = "explain-existing-gate-only";
export type MainAgentStrategyFullAccessCompatibility = "eligible-for-existing-scoped-automation" | "must-stop";

export type MainAgentStrategyStopCondition =
  | "plan-confirmation-required"
  | "raw-scheduler-required"
  | "manual-integration-check-required"
  | "integration-apply-discard-required"
  | "source-apply-required"
  | "change-close-required"
  | "remote-pr-merge-required"
  | "harness-evolution-required"
  | "stale-or-scope-mismatch"
  | "ambiguous-or-blocked";

export interface MainAgentStrategyDecision {
  authority: "non-executing-main-agent-strategy-decision";
  executionStarted: false;
  kind: MainAgentStrategyDecisionKind;
  reason: string;
  targets: string[];
  workflowShape: MainAgentWorkflowShape;
  refs: MainAgentWorkflowGraphDecisionPolicyInput["refs"];
  gaps: MainAgentWorkflowGraphReplayGap[];
  modeCompatibility: {
    stepwise: MainAgentStrategyStepwiseCompatibility;
    fullAccess: MainAgentStrategyFullAccessCompatibility;
    fullAccessReason: string;
  };
  stopConditions: MainAgentStrategyStopCondition[];
  strategyAdvice?: MainAgentStrategyAdvice;
}

export type MainAgentWorkflowGraphDecisionPolicyInput = Omit<MainAgentWorkflowGraphReplaySummary, "nextObservation" | "strategyDecision">;

export interface MainAgentWorkflowGraphDecisionPolicyOptions {
  strategyAdviceInput?: unknown;
}

export interface MainAgentWorkflowGraphDecisionPolicyRecommendation {
  authority: "non-executing-main-agent-workflowgraph-decision-policy";
  executionStarted: false;
  kind: MainAgentWorkflowGraphDecisionPolicyKind;
  reason: string;
  targets: string[];
  refs: MainAgentWorkflowGraphDecisionPolicyInput["refs"];
  gaps: MainAgentWorkflowGraphReplayGap[];
  strategyDecision: MainAgentStrategyDecision;
}

export function evaluateMainAgentWorkflowGraphReplayPolicy(
  input: MainAgentWorkflowGraphDecisionPolicyInput,
  options: MainAgentWorkflowGraphDecisionPolicyOptions = {},
): MainAgentWorkflowGraphDecisionPolicyRecommendation {
  const unsafeGaps = input.gaps.filter((gap) => ["malformed", "scope-mismatch", "stale", "old-schema"].includes(gap.status));
  if (unsafeGaps.length > 0) {
    return recommendation(input, "inspect-evidence-gap", "Replay summary found unsafe or stale evidence that must be inspected before deriving a future decision.", gapTargets(unsafeGaps), options);
  }

  if (input.currentState.kind === "stale") {
    return recommendation(input, "stale", input.currentState.reason || "WorkflowGraph replay state is stale.", ["workflowgraph-observation"], options);
  }

  if (input.currentState.queue.scopeStatus === "mismatch") {
    return recommendation(input, "inspect-evidence-gap", "TaskQueue and WorkflowRun scope mismatch must be inspected before deriving a future decision.", ["workflow-run", "task-queue"], options);
  }

  if (input.currentState.workflow.status === "created" && !input.currentState.queue.id) {
    return recommendation(input, "observe-queue-binding", "WorkflowRun is created and waiting for queue binding or recovery; it is not running and should not restart the queue gate.", ["workflow-run", "task-queue"], options);
  }

  if (["needs-decomposition", "needs-readiness", "needs-taskqueue-proposal", "needs-workflowgraph-compile"].includes(input.currentState.kind)) {
    return recommendation(input, "wait-for-planning-evidence", input.currentState.reason, ["workflowgraph-observation"], options);
  }

  if (input.currentState.kind === "awaiting-queue-start-gate") {
    return recommendation(input, "wait-for-human-gate", input.currentState.reason, ["workflowgraph-observation"], options);
  }

  if (input.currentState.kind === "queue-running" || input.currentState.queue.status === "running" || input.currentState.queue.status === "queued") {
    return recommendation(input, "observe-active-queue-loop", "Queue is active; observe queue item and child role-loop evidence without treating this as an execution trigger.", ["main-agent-loop", "task-run", "agent-task"], options);
  }

  if (input.currentState.kind === "queue-completed" || input.currentState.queue.status === "completed") {
    return recommendation(input, "completed-await-result-gate", "Queue appears complete; observe terminal validation/audit evidence before any existing result gate.", ["workflow-run", "task-queue", "validation", "audit"], options);
  }

  if (input.currentState.kind === "queue-blocked" || input.currentState.queue.status === "blocked" || input.currentState.queue.status === "failed") {
    return recommendation(input, "blocked", input.currentState.reason || "TaskQueue execution is blocked or failed.", ["workflow-run", "task-queue"], options);
  }

  if (input.currentState.kind === "queue-paused" || input.currentState.queue.status === "paused") {
    return recommendation(input, "wait-for-human-gate", input.currentState.reason || "TaskQueue execution is paused.", ["workflow-run", "task-queue"], options);
  }

  const controlledSchedulerObservation = observeControlledSchedulerStep(input);
  if (controlledSchedulerObservation) {
    return recommendation(input, controlledSchedulerObservation.kind, controlledSchedulerObservation.reason, controlledSchedulerObservation.targets, options);
  }

  return recommendation(input, "wait", input.currentState.reason || "Replay summary is bounded to current canonical state and historical evidence.", ["workflowgraph-observation"], options);
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
  options: MainAgentWorkflowGraphDecisionPolicyOptions = {},
): MainAgentWorkflowGraphDecisionPolicyRecommendation {
  const dedupedTargets = dedupeStrings(targets);
  return {
    authority: "non-executing-main-agent-workflowgraph-decision-policy",
    executionStarted: false,
    kind,
    reason,
    targets: dedupedTargets,
    refs: input.refs,
    gaps: input.gaps,
    strategyDecision: deriveStrategyDecision(input, kind, reason, dedupedTargets, options),
  };
}

function deriveStrategyDecision(
  input: MainAgentWorkflowGraphDecisionPolicyInput,
  policyKind: MainAgentWorkflowGraphDecisionPolicyKind,
  policyReason: string,
  policyTargets: string[],
  options: MainAgentWorkflowGraphDecisionPolicyOptions = {},
): MainAgentStrategyDecision {
  const readiness = input.currentState.readiness;
  const unsafeGaps = input.gaps.filter((gap) => ["malformed", "scope-mismatch", "stale", "old-schema"].includes(gap.status));
  const baseTargets = dedupeStrings(policyTargets);
  let kind: MainAgentStrategyDecisionKind;
  let reason: string;
  let targets: string[];

  if (unsafeGaps.length > 0 || input.currentState.kind === "stale" || input.currentState.queue.scopeStatus === "mismatch") {
    kind = "stale";
    reason = "Strategy decision cannot trust stale, malformed, old-schema, or scope-mismatched evidence.";
    targets = gapTargets(unsafeGaps.length > 0 ? unsafeGaps : input.gaps);
  } else if (policyKind === "blocked") {
    kind = "blocked";
    reason = policyReason;
    targets = baseTargets;
  } else if (policyKind === "completed-await-result-gate" || input.currentState.kind === "queue-completed" || input.currentState.queue.status === "completed") {
    kind = "complete";
    reason = "Current evidence appears complete enough to observe existing terminal result gates without creating a new execution path.";
    targets = dedupeStrings([...baseTargets, "validation", "audit"]);
  } else if (isParallelSchedulerCandidate(readiness)) {
    kind = "parallel-scheduler-candidate";
    reason = "Fresh readiness evidence exposes a controlled Scheduler candidate; this is an observation only and any future execution must use the existing controlled Scheduler path.";
    targets = dedupeStrings([...baseTargets, "scheduler-readiness", "controlled-scheduler"]);
  } else if (isDirectSingleWorktreeCandidate(readiness)) {
    kind = "direct-single-worktree";
    reason = "Readiness evidence selects a single-Change code path with no Scheduler eligibility or low-conflict parallel signal.";
    targets = dedupeStrings([...baseTargets, "code-readiness"]);
  } else if (isSequentialWorkflowCandidate(input, readiness, policyKind)) {
    kind = "sequential-workflowgraph";
    reason = "Current evidence belongs to the sequential WorkflowGraph or TaskQueue path.";
    targets = dedupeStrings([...baseTargets, "workflowgraph", "task-queue"]);
  } else if (readiness.nextAllowedAction === "clarification.answer" || readiness.status === "blocked-needs-clarification" || policyKind === "wait-for-planning-evidence") {
    kind = "read-only-or-clarify";
    reason = "Current evidence needs planning, readiness, or clarification before a write-capable strategy can be trusted.";
    targets = dedupeStrings([...baseTargets, "planning-evidence"]);
  } else if (policyKind === "wait-for-human-gate") {
    kind = "wait-for-human-gate";
    reason = policyReason;
    targets = baseTargets;
  } else {
    kind = "read-only-or-clarify";
    reason = policyReason || "Current evidence supports observation only.";
    targets = baseTargets.length > 0 ? baseTargets : ["workflowgraph-observation"];
  }

  const strategyDecision: MainAgentStrategyDecision = {
    authority: "non-executing-main-agent-strategy-decision",
    executionStarted: false,
    kind,
    reason,
    targets: dedupeStrings(targets),
    workflowShape: deriveMainAgentWorkflowShape({
      input,
      strategyKind: kind,
      strategyReason: reason,
      policyKind,
    }),
    refs: input.refs,
    gaps: input.gaps,
    modeCompatibility: strategyModeCompatibility(kind, policyKind),
    stopConditions: strategyStopConditions(),
  };
  if ("strategyAdviceInput" in options) {
    strategyDecision.strategyAdvice = buildMainAgentStrategyAdvice(options.strategyAdviceInput);
  }
  return strategyDecision;
}

function isDirectSingleWorktreeCandidate(
  readiness: MainAgentWorkflowGraphDecisionPolicyInput["currentState"]["readiness"],
): boolean {
  return readiness.status === "ready-for-single-change"
    && readiness.nextAllowedAction === "code.run"
    && readiness.schedulerEligible !== true;
}

function isSequentialWorkflowCandidate(
  input: MainAgentWorkflowGraphDecisionPolicyInput,
  readiness: MainAgentWorkflowGraphDecisionPolicyInput["currentState"]["readiness"],
  policyKind: MainAgentWorkflowGraphDecisionPolicyKind,
): boolean {
  if (readiness.status === "ready-for-sequential-taskqueue-proposal" && readiness.nextAllowedAction === "taskqueue.proposal") return true;
  if (["awaiting-queue-start-gate", "queue-running", "queue-paused"].includes(input.currentState.kind)) return true;
  if (["queued", "running", "paused"].includes(input.currentState.queue.status ?? "")) return true;
  return policyKind === "observe-active-queue-loop";
}

function isParallelSchedulerCandidate(
  readiness: MainAgentWorkflowGraphDecisionPolicyInput["currentState"]["readiness"],
): boolean {
  return readiness.status === "ready-for-scheduler-contract"
    && readiness.nextAllowedAction === "scheduler.contract"
    && readiness.schedulerEligible === true;
}

function strategyModeCompatibility(
  strategyKind: MainAgentStrategyDecisionKind,
  policyKind: MainAgentWorkflowGraphDecisionPolicyKind,
): MainAgentStrategyDecision["modeCompatibility"] {
  const fullAccess = isStrategyCompatibleWithScopedAutomation(strategyKind) && policyKind !== "wait-for-human-gate"
    ? "eligible-for-existing-scoped-automation"
    : "must-stop";
  return {
    stepwise: "explain-existing-gate-only",
    fullAccess,
    fullAccessReason: fullAccess === "eligible-for-existing-scoped-automation"
      ? "Existing scoped automation may consume only a matching current local gate in a later consumption phase."
      : "Strategy must stop before execution because V1 is non-consuming or the route is human-gated, stale, blocked, parallel, or clarification-only.",
  };
}

function isStrategyCompatibleWithScopedAutomation(strategyKind: MainAgentStrategyDecisionKind): boolean {
  return strategyKind === "direct-single-worktree"
    || strategyKind === "sequential-workflowgraph"
    || strategyKind === "complete";
}

function strategyStopConditions(): MainAgentStrategyStopCondition[] {
  return [
    "plan-confirmation-required",
    "raw-scheduler-required",
    "manual-integration-check-required",
    "integration-apply-discard-required",
    "source-apply-required",
    "change-close-required",
    "remote-pr-merge-required",
    "harness-evolution-required",
    "stale-or-scope-mismatch",
    "ambiguous-or-blocked",
  ];
}

function gapTargets(gaps: MainAgentWorkflowGraphReplayGap[]): string[] {
  return dedupeStrings(gaps.map((gap) => gap.source));
}

function observeControlledSchedulerStep(
  input: MainAgentWorkflowGraphDecisionPolicyInput,
): { kind: MainAgentWorkflowGraphDecisionPolicyKind; reason: string; targets: string[] } | null {
  const latest = input.controlledScheduler.latestStep;
  if (!latest || input.controlledScheduler.healthStatus !== "available") return null;
  const posture = latest.continuationReadinessStatus ?? latest.routePosture ?? latest.postStepHandoffStatus;
  switch (posture) {
    case "terminal-handoff":
      return {
        kind: "completed-await-result-gate",
        reason: "Controlled Scheduler step reached terminal handoff; observe terminal validation/audit and existing result gates.",
        targets: ["controlled-scheduler-step", "validation", "audit"],
      };
    case "needs-review":
      return {
        kind: "blocked",
        reason: "Controlled Scheduler step needs review before further main-agent policy can derive a safe next observation.",
        targets: ["controlled-scheduler-step"],
      };
    case "ready-for-human-gate":
    case "awaiting-human-gate":
    case "quality-routing":
    case "integration-barrier":
      return {
        kind: "wait-for-human-gate",
        reason: "Controlled Scheduler step stopped at an existing human-gated route; observe the current gate rather than executing Scheduler.",
        targets: ["controlled-scheduler-step", "current-gate"],
      };
    case "waiting":
      return {
        kind: "wait",
        reason: "Controlled Scheduler step is waiting for fresh evidence before another observation can be trusted.",
        targets: ["controlled-scheduler-step"],
      };
    default:
      return null;
  }
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
