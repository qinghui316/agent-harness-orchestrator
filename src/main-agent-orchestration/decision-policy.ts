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
  type MainAgentStrategyAdviceKind,
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
export type MainAgentStrategyKindSource = "deterministic-baseline" | "bounded-advice" | "rejected-advice";
export type MainAgentStrategyAdviceConsumptionStatus =
  | "ignored"
  | "accepted-readonly"
  | "accepted-bounded"
  | "rejected-stale"
  | "rejected-unsafe"
  | "rejected-out-of-envelope";

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
  kindSource: MainAgentStrategyKindSource;
  reason: string;
  targets: string[];
  deterministicBaseline: {
    kind: MainAgentStrategyDecisionKind;
    reason: string;
    targets: string[];
  };
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
  adviceConsumption: MainAgentStrategyAdviceConsumption;
}

export interface MainAgentStrategyAdviceConsumption {
  authority: "non-executing-main-agent-strategy-advice-consumption";
  executionStarted: false;
  controller: false;
  status: MainAgentStrategyAdviceConsumptionStatus;
  baselineKind: MainAgentStrategyDecisionKind;
  finalKind: MainAgentStrategyDecisionKind;
  finalKindSource: MainAgentStrategyKindSource;
  adviceKind: MainAgentStrategyAdviceKind | null;
  reason: string;
  evidenceRefs: string[];
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
  let baselineKind: MainAgentStrategyDecisionKind;
  let baselineReason: string;
  let baselineTargets: string[];

  if (unsafeGaps.length > 0 || input.currentState.kind === "stale" || input.currentState.queue.scopeStatus === "mismatch") {
    baselineKind = "stale";
    baselineReason = "Strategy decision cannot trust stale, malformed, old-schema, or scope-mismatched evidence.";
    baselineTargets = gapTargets(unsafeGaps.length > 0 ? unsafeGaps : input.gaps);
  } else if (policyKind === "blocked") {
    baselineKind = "blocked";
    baselineReason = policyReason;
    baselineTargets = baseTargets;
  } else if (policyKind === "completed-await-result-gate" || input.currentState.kind === "queue-completed" || input.currentState.queue.status === "completed") {
    baselineKind = "complete";
    baselineReason = "Current evidence appears complete enough to observe existing terminal result gates without creating a new execution path.";
    baselineTargets = dedupeStrings([...baseTargets, "validation", "audit"]);
  } else if (isParallelSchedulerCandidate(readiness)) {
    baselineKind = "parallel-scheduler-candidate";
    baselineReason = "Fresh readiness evidence exposes a controlled Scheduler candidate; this is an observation only and any future execution must use the existing controlled Scheduler path.";
    baselineTargets = dedupeStrings([...baseTargets, "scheduler-readiness", "controlled-scheduler"]);
  } else if (isDirectSingleWorktreeCandidate(readiness)) {
    baselineKind = "direct-single-worktree";
    baselineReason = "Readiness evidence selects a single-Change code path with no Scheduler eligibility or low-conflict parallel signal.";
    baselineTargets = dedupeStrings([...baseTargets, "code-readiness"]);
  } else if (isSequentialWorkflowCandidate(input, readiness, policyKind)) {
    baselineKind = "sequential-workflowgraph";
    baselineReason = "Current evidence belongs to the sequential WorkflowGraph or TaskQueue path.";
    baselineTargets = dedupeStrings([...baseTargets, "workflowgraph", "task-queue"]);
  } else if (readiness.nextAllowedAction === "clarification.answer" || readiness.status === "blocked-needs-clarification" || policyKind === "wait-for-planning-evidence") {
    baselineKind = "read-only-or-clarify";
    baselineReason = "Current evidence needs planning, readiness, or clarification before a write-capable strategy can be trusted.";
    baselineTargets = dedupeStrings([...baseTargets, "planning-evidence"]);
  } else if (policyKind === "wait-for-human-gate") {
    baselineKind = "wait-for-human-gate";
    baselineReason = policyReason;
    baselineTargets = baseTargets;
  } else {
    baselineKind = "read-only-or-clarify";
    baselineReason = policyReason || "Current evidence supports observation only.";
    baselineTargets = baseTargets.length > 0 ? baseTargets : ["workflowgraph-observation"];
  }

  const strategyAdvice = "strategyAdviceInput" in options
    ? buildMainAgentStrategyAdvice(options.strategyAdviceInput)
    : undefined;
  const adviceConsumption = consumeMainAgentStrategyAdvice({
    input,
    policyKind,
    baselineKind,
    baselineReason,
    baselineTargets,
    strategyAdvice,
  });
  const kind = adviceConsumption.finalKind;
  const reason = adviceConsumption.status === "accepted-bounded"
    ? adviceConsumption.reason
    : baselineReason;
  const targets = adviceConsumption.status === "accepted-bounded"
    ? strategyTargetsForKind(kind, baseTargets)
    : baselineTargets;
  const kindSource = adviceConsumption.finalKindSource;

  const strategyDecision: MainAgentStrategyDecision = {
    authority: "non-executing-main-agent-strategy-decision",
    executionStarted: false,
    kind,
    kindSource,
    reason,
    targets: dedupeStrings(targets),
    deterministicBaseline: {
      kind: baselineKind,
      reason: baselineReason,
      targets: dedupeStrings(baselineTargets),
    },
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
    adviceConsumption,
  };
  if (strategyAdvice) {
    strategyDecision.strategyAdvice = strategyAdvice;
  }
  return strategyDecision;
}

export function consumeMainAgentStrategyAdvice(input: {
  input: MainAgentWorkflowGraphDecisionPolicyInput;
  policyKind: MainAgentWorkflowGraphDecisionPolicyKind;
  baselineKind: MainAgentStrategyDecisionKind;
  baselineReason: string;
  baselineTargets: string[];
  strategyAdvice?: MainAgentStrategyAdvice;
}): MainAgentStrategyAdviceConsumption {
  const { strategyAdvice, baselineKind } = input;
  if (!strategyAdvice) {
    return adviceConsumption(input, "ignored", baselineKind, "deterministic-baseline", null, "No strategy advice was provided.", []);
  }
  if (strategyAdvice.status === "ignored") {
    const status = strategyAdvice.ignoredReason?.includes("forbidden executable payload")
      ? "rejected-unsafe"
      : "ignored";
    return adviceConsumption(input, status, baselineKind, status === "ignored" ? "deterministic-baseline" : "rejected-advice", null, strategyAdvice.ignoredReason ?? "Strategy advice was ignored.", []);
  }
  if (baselineKind === "stale" || hasUnsafeEvidence(input.input)) {
    return adviceConsumption(input, "rejected-stale", baselineKind, "rejected-advice", strategyAdvice.kind, "Strategy advice cannot override stale, malformed, old-schema, or scope-mismatched evidence.", strategyAdvice.evidenceRefs);
  }
  const adviceKind = strategyAdvice.kind;
  if (!adviceKind) {
    return adviceConsumption(input, "ignored", baselineKind, "deterministic-baseline", null, "Strategy advice has no kind.", strategyAdvice.evidenceRefs);
  }
  const requestedKind = strategyKindFromAdvice(adviceKind);
  if (requestedKind === baselineKind) {
    return adviceConsumption(input, "accepted-readonly", baselineKind, "deterministic-baseline", adviceKind, "Strategy advice matched the deterministic baseline and remains read-only.", strategyAdvice.evidenceRefs);
  }
  if (!isAdviceAllowedToChangeBaseline(baselineKind)) {
    return adviceConsumption(input, "rejected-out-of-envelope", baselineKind, "rejected-advice", adviceKind, `Strategy advice cannot override deterministic ${baselineKind} evidence.`, strategyAdvice.evidenceRefs);
  }
  if (requestedKind === "parallel-scheduler-candidate") {
    return adviceConsumption(input, "rejected-out-of-envelope", baselineKind, "rejected-advice", adviceKind, "Strategy advice cannot create a parallel Scheduler candidate; only deterministic fresh Scheduler readiness can.", strategyAdvice.evidenceRefs);
  }
  if (requestedKind === "stale") {
    return adviceConsumption(input, "rejected-out-of-envelope", baselineKind, "rejected-advice", adviceKind, "Strategy advice cannot mark current evidence stale without deterministic stale evidence.", strategyAdvice.evidenceRefs);
  }
  if (requestedKind === "complete" && !hasTerminalCompletionEvidence(input.input, input.policyKind)) {
    return adviceConsumption(input, "rejected-out-of-envelope", baselineKind, "rejected-advice", adviceKind, "Terminal strategy advice requires canonical completed posture or terminal result-gate evidence.", strategyAdvice.evidenceRefs);
  }
  if (!isAdviceTargetWithinEnvelope(requestedKind)) {
    return adviceConsumption(input, "rejected-out-of-envelope", baselineKind, "rejected-advice", adviceKind, `Strategy advice kind ${adviceKind} is outside the bounded consumption envelope.`, strategyAdvice.evidenceRefs);
  }
  return adviceConsumption(input, "accepted-bounded", requestedKind, "bounded-advice", adviceKind, `Bounded strategy advice selected ${requestedKind}: ${strategyAdvice.reason}`, strategyAdvice.evidenceRefs);
}

function adviceConsumption(
  input: {
    baselineKind: MainAgentStrategyDecisionKind;
  },
  status: MainAgentStrategyAdviceConsumptionStatus,
  finalKind: MainAgentStrategyDecisionKind,
  finalKindSource: MainAgentStrategyKindSource,
  adviceKind: MainAgentStrategyAdviceKind | null,
  reason: string,
  evidenceRefs: string[],
): MainAgentStrategyAdviceConsumption {
  return {
    authority: "non-executing-main-agent-strategy-advice-consumption",
    executionStarted: false,
    controller: false,
    status,
    baselineKind: input.baselineKind,
    finalKind,
    finalKindSource,
    adviceKind,
    reason,
    evidenceRefs: dedupeStrings(evidenceRefs),
  };
}

function hasUnsafeEvidence(input: MainAgentWorkflowGraphDecisionPolicyInput): boolean {
  return input.currentState.kind === "stale"
    || input.currentState.queue.scopeStatus === "mismatch"
    || input.gaps.some((gap) => ["malformed", "scope-mismatch", "stale", "old-schema"].includes(gap.status));
}

function strategyKindFromAdvice(kind: MainAgentStrategyAdviceKind): MainAgentStrategyDecisionKind {
  switch (kind) {
    case "direct":
      return "direct-single-worktree";
    case "pipeline":
      return "sequential-workflowgraph";
    case "parallel-candidate":
      return "parallel-scheduler-candidate";
    case "clarify":
      return "read-only-or-clarify";
    case "blocked":
      return "blocked";
    case "terminal":
      return "complete";
    case "stale":
      return "stale";
  }
}

function isAdviceAllowedToChangeBaseline(kind: MainAgentStrategyDecisionKind): boolean {
  return kind === "read-only-or-clarify" || kind === "wait-for-human-gate";
}

function isAdviceTargetWithinEnvelope(kind: MainAgentStrategyDecisionKind): boolean {
  return kind === "direct-single-worktree"
    || kind === "sequential-workflowgraph"
    || kind === "read-only-or-clarify"
    || kind === "blocked"
    || kind === "complete";
}

function hasTerminalCompletionEvidence(
  input: MainAgentWorkflowGraphDecisionPolicyInput,
  policyKind: MainAgentWorkflowGraphDecisionPolicyKind,
): boolean {
  if (policyKind === "completed-await-result-gate") return true;
  if (input.currentState.kind === "queue-completed" || input.currentState.queue.status === "completed") return true;
  if (input.controlledScheduler.healthStatus !== "available" || !input.controlledScheduler.latestStep) return false;
  const latest = input.controlledScheduler.latestStep;
  return latest.routePosture === "terminal-handoff"
    || latest.continuationReadinessStatus === "terminal-handoff"
    || latest.postStepHandoffStatus === "terminal-handoff";
}

function strategyTargetsForKind(kind: MainAgentStrategyDecisionKind, baseTargets: string[]): string[] {
  switch (kind) {
    case "direct-single-worktree":
      return dedupeStrings([...baseTargets, "strategy-advice", "code-readiness"]);
    case "sequential-workflowgraph":
      return dedupeStrings([...baseTargets, "strategy-advice", "workflowgraph", "task-queue"]);
    case "read-only-or-clarify":
      return dedupeStrings([...baseTargets, "strategy-advice", "planning-evidence"]);
    case "blocked":
      return dedupeStrings([...baseTargets, "strategy-advice"]);
    case "complete":
      return dedupeStrings([...baseTargets, "strategy-advice", "validation", "audit"]);
    default:
      return dedupeStrings([...baseTargets, "strategy-advice"]);
  }
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
