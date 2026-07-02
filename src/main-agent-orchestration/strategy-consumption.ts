import type { MainAgentStrategyDecision } from "./decision-policy.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import type { MainAgentResumeContinuationContext } from "./resume-continuation.js";
import {
  buildDegradedMainAgentWorkflowGraphReplaySummary,
  buildMainAgentWorkflowGraphReplaySummary,
  type MainAgentWorkflowGraphReplaySummary,
} from "./workflowgraph-replay.js";

export type MainAgentStrategyConsumptionMode = "request-approval" | "full-access";

export type MainAgentStrategyConsumptionStatus =
  | "explain-existing-gate"
  | "allow-existing-scoped-automation"
  | "stop-for-human-gate"
  | "blocked"
  | "stale";

export type MainAgentStrategyConsumptionGateFamily =
  | "local-workflow"
  | "local-approval"
  | "controlled-scheduler"
  | "human-terminal"
  | "unknown";

export interface MainAgentStrategyConsumptionGateSummary {
  kind: "workflow" | "approval" | "none" | "blocked";
  changeId?: string | null;
  actionType?: string | null;
  approvalActionId?: string | null;
  targetIds?: string[];
  enabled?: boolean;
  scopedAutomationEligible?: boolean;
  family?: MainAgentStrategyConsumptionGateFamily;
  stopReason?: string | null;
  summary?: string | null;
}

export interface MainAgentStrategyConsumptionAssessment {
  authority: "non-executing-main-agent-strategy-consumption-assessment";
  executionStarted: false;
  status: MainAgentStrategyConsumptionStatus;
  mode: MainAgentStrategyConsumptionMode;
  strategyKind: MainAgentStrategyDecision["kind"];
  reason: string;
  refs: MainAgentStrategyDecision["refs"];
  gaps: MainAgentStrategyDecision["gaps"];
  gatePosture: {
    kind: MainAgentStrategyConsumptionGateSummary["kind"];
    family: MainAgentStrategyConsumptionGateFamily;
    enabled: boolean;
    scopedAutomationEligible: boolean;
    sameChange: boolean;
    stopReason: string | null;
  };
}

export interface AssessMainAgentStrategyConsumptionInput {
  strategyDecision: MainAgentStrategyDecision;
  mode: MainAgentStrategyConsumptionMode;
  selectedChangeId: string;
  currentGate: MainAgentStrategyConsumptionGateSummary;
}

export interface BuildMainAgentStrategyConsumptionContextOptions {
  changePath?: string;
  schedulerRunId?: string | null;
}

export interface MainAgentStrategyConsumptionContext {
  authority: "read-only-main-agent-strategy-consumption-context";
  executionStarted: false;
  replaySummary: MainAgentWorkflowGraphReplaySummary;
  strategyDecision: MainAgentStrategyDecision;
}

export type MainAgentResumeConsumptionStatus =
  | "not-requested"
  | "explain-existing-gate"
  | "allow-existing-scoped-automation"
  | "stop-for-human-gate"
  | "stale"
  | "blocked";

export interface MainAgentResumeConsumptionAssessment {
  authority: "non-executing-main-agent-resume-consumption-assessment";
  executionStarted: false;
  status: MainAgentResumeConsumptionStatus;
  mode: MainAgentStrategyConsumptionMode;
  strategyKind: MainAgentStrategyDecision["kind"];
  reason: string;
  refs: MainAgentStrategyDecision["refs"];
  gaps: MainAgentStrategyDecision["gaps"];
  resumePosture: {
    requested: boolean;
    status: MainAgentResumeContinuationContext["status"];
    lane: string | null;
    scopedLocalLane: boolean;
    gateKindMatches: boolean;
    actionMatches: boolean;
    targetIdsMatch: boolean;
  };
  gatePosture: {
    kind: MainAgentStrategyConsumptionGateSummary["kind"];
    family: MainAgentStrategyConsumptionGateFamily;
    enabled: boolean;
    scopedAutomationEligible: boolean;
    sameChange: boolean;
    stopReason: string | null;
  };
}

export interface AssessMainAgentResumeConsumptionInput {
  resumeContinuationContext: MainAgentResumeContinuationContext;
  strategyDecision: MainAgentStrategyDecision;
  mode: MainAgentStrategyConsumptionMode;
  selectedChangeId: string;
  currentGate: MainAgentStrategyConsumptionGateSummary;
}

export async function buildMainAgentStrategyConsumptionContext(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  options: BuildMainAgentStrategyConsumptionContextOptions = {},
): Promise<MainAgentStrategyConsumptionContext> {
  const replaySummary = await buildMainAgentWorkflowGraphReplaySummary(memory, project, changeId, {
    changePath: options.changePath,
    schedulerRunId: options.schedulerRunId,
  }).catch((error) =>
    buildDegradedMainAgentWorkflowGraphReplaySummary(
      project,
      changeId,
      `Strategy consumption replay derivation failed: ${errorMessage(error)}.`,
    ),
  );
  return {
    authority: "read-only-main-agent-strategy-consumption-context",
    executionStarted: false,
    replaySummary,
    strategyDecision: replaySummary.strategyDecision,
  };
}

export function assessMainAgentStrategyConsumption(
  input: AssessMainAgentStrategyConsumptionInput,
): MainAgentStrategyConsumptionAssessment {
  const gate = normalizeGate(input.currentGate);
  const sameChange = !input.currentGate.changeId || input.currentGate.changeId === input.selectedChangeId;
  const posture = {
    kind: input.currentGate.kind,
    family: gate.family,
    enabled: gate.enabled,
    scopedAutomationEligible: gate.scopedAutomationEligible,
    sameChange,
    stopReason: gate.stopReason,
  };

  if (!sameChange) {
    return assessment(input, "stale", "Current gate belongs to a different Change.", posture);
  }

  if (input.strategyDecision.kind === "stale" || hasUnsafeStrategyGap(input.strategyDecision)) {
    return assessment(input, "stale", input.strategyDecision.reason || "Strategy evidence is stale or scope-mismatched.", posture);
  }

  if (input.strategyDecision.kind === "blocked") {
    return assessment(input, "blocked", input.strategyDecision.reason || "Strategy is blocked.", posture);
  }

  if (gate.stopReason === "stale-target") {
    return assessment(input, "stale", gate.summary || "Current gate target is stale.", posture);
  }

  if (gate.stopReason && gate.stopReason !== "no-primary-gate") {
    return assessment(input, gate.stopReason === "blocked" ? "blocked" : "stop-for-human-gate", gate.summary || "Current gate is not eligible for automatic continuation.", posture);
  }

  if (input.mode === "request-approval") {
    return assessment(input, gate.kind === "none" ? "stop-for-human-gate" : "explain-existing-gate", gate.summary || "Stepwise mode explains the current real gate and waits for human confirmation.", posture);
  }

  if (!isStrategyEligibleForScopedAutomation(input.strategyDecision.kind)) {
    return assessment(input, "stop-for-human-gate", `Strategy ${input.strategyDecision.kind} is not eligible for scoped automation.`, posture);
  }

  if (gate.kind !== "workflow" && gate.kind !== "approval") {
    return assessment(input, "stop-for-human-gate", gate.summary || "No current executable gate is available for scoped automation.", posture);
  }

  if (!gate.enabled) {
    return assessment(input, "blocked", gate.summary || "Current gate is disabled.", posture);
  }

  if (!gate.scopedAutomationEligible) {
    return assessment(input, "stop-for-human-gate", gate.summary || "Current gate is not in the existing scoped automation allowlist.", posture);
  }

  return assessment(input, "allow-existing-scoped-automation", "Strategy and current gate are compatible with existing scoped automation revalidation.", posture);
}

export function assessMainAgentResumeConsumption(
  input: AssessMainAgentResumeConsumptionInput,
): MainAgentResumeConsumptionAssessment {
  const gate = normalizeGate(input.currentGate);
  const sameChange = !input.currentGate.changeId || input.currentGate.changeId === input.selectedChangeId;
  const gatePosture = {
    kind: input.currentGate.kind,
    family: gate.family,
    enabled: gate.enabled,
    scopedAutomationEligible: gate.scopedAutomationEligible,
    sameChange,
    stopReason: gate.stopReason,
  };
  const point = input.resumeContinuationContext.resumePoint;
  const resumePosture = {
    requested: input.resumeContinuationContext.status !== "not-requested",
    status: input.resumeContinuationContext.status,
    lane: point?.lane ?? null,
    scopedLocalLane: point?.lane === "scoped-local-automation",
    gateKindMatches: Boolean(point && resumeGateKindForCurrentGate(input.currentGate.kind) === point.currentGate.kind),
    actionMatches: Boolean(point && resumeGateActionMatches(point.currentGate, input.currentGate)),
    targetIdsMatch: Boolean(point && sameStringSet(point.currentGate.targetIds, input.currentGate.targetIds ?? [])),
  };

  if (input.resumeContinuationContext.status === "not-requested") {
    return resumeAssessment(input, "not-requested", "No explicit resume continuation intent was provided.", resumePosture, gatePosture);
  }
  if (!sameChange) {
    return resumeAssessment(input, "stale", "Current gate belongs to a different Change.", resumePosture, gatePosture);
  }
  if (gate.stopReason === "stale-target") {
    return resumeAssessment(input, "stale", gate.summary || "Current gate target is stale.", resumePosture, gatePosture);
  }
  if (input.resumeContinuationContext.status === "stale" || input.resumeContinuationContext.status === "key-mismatch" || input.resumeContinuationContext.status === "scope-mismatch") {
    return resumeAssessment(input, "stale", input.resumeContinuationContext.reason, resumePosture, gatePosture);
  }
  if (input.strategyDecision.kind === "stale" || hasUnsafeStrategyGap(input.strategyDecision)) {
    return resumeAssessment(input, "stale", input.strategyDecision.reason || "Strategy evidence is stale or scope-mismatched.", resumePosture, gatePosture);
  }
  if (input.resumeContinuationContext.status === "blocked") {
    return resumeAssessment(input, "blocked", input.resumeContinuationContext.reason, resumePosture, gatePosture);
  }
  if (input.strategyDecision.kind === "blocked") {
    return resumeAssessment(input, "blocked", input.strategyDecision.reason || "Strategy is blocked.", resumePosture, gatePosture);
  }
  if (input.resumeContinuationContext.status !== "available" || !point) {
    return resumeAssessment(input, "stop-for-human-gate", input.resumeContinuationContext.reason || "No scoped-local resume point is available for consumption.", resumePosture, gatePosture);
  }
  if (point.lane !== "scoped-local-automation") {
    return resumeAssessment(input, "stop-for-human-gate", "Resume continuation is available, but only scoped-local automation lane can be consumed in V1c.", resumePosture, gatePosture);
  }
  if (input.mode === "request-approval") {
    return resumeAssessment(input, "explain-existing-gate", "Stepwise mode explains the current real gate and waits for human confirmation.", resumePosture, gatePosture);
  }
  if (!isStrategyEligibleForScopedAutomation(input.strategyDecision.kind)) {
    return resumeAssessment(input, "stop-for-human-gate", `Strategy ${input.strategyDecision.kind} is not eligible for scoped-local resume automation.`, resumePosture, gatePosture);
  }
  if (gate.kind !== "workflow" && gate.kind !== "approval") {
    return resumeAssessment(input, "stop-for-human-gate", gate.summary || "No current executable gate is available for scoped-local resume automation.", resumePosture, gatePosture);
  }
  if (!gate.enabled) {
    return resumeAssessment(input, "blocked", gate.summary || "Current gate is disabled.", resumePosture, gatePosture);
  }
  if (!gate.scopedAutomationEligible) {
    return resumeAssessment(input, "stop-for-human-gate", gate.summary || "Current gate is not in the existing scoped automation allowlist.", resumePosture, gatePosture);
  }
  if (!resumePosture.gateKindMatches || !resumePosture.actionMatches || !resumePosture.targetIdsMatch) {
    return resumeAssessment(input, "stale", "Resume point gate/action/target does not match the current visible primary gate.", resumePosture, gatePosture);
  }
  return resumeAssessment(input, "allow-existing-scoped-automation", "Scoped-local resume point and current gate match existing scoped automation revalidation.", resumePosture, gatePosture);
}

function normalizeGate(gate: MainAgentStrategyConsumptionGateSummary): {
  kind: MainAgentStrategyConsumptionGateSummary["kind"];
  enabled: boolean;
  scopedAutomationEligible: boolean;
  family: MainAgentStrategyConsumptionGateFamily;
  stopReason: string | null;
  summary: string | null;
} {
  return {
    kind: gate.kind,
    enabled: gate.enabled === true,
    scopedAutomationEligible: gate.scopedAutomationEligible === true,
    family: gate.family ?? "unknown",
    stopReason: gate.stopReason ?? null,
    summary: gate.summary ?? null,
  };
}

function assessment(
  input: AssessMainAgentStrategyConsumptionInput,
  status: MainAgentStrategyConsumptionStatus,
  reason: string,
  gatePosture: MainAgentStrategyConsumptionAssessment["gatePosture"],
): MainAgentStrategyConsumptionAssessment {
  return {
    authority: "non-executing-main-agent-strategy-consumption-assessment",
    executionStarted: false,
    status,
    mode: input.mode,
    strategyKind: input.strategyDecision.kind,
    reason,
    refs: input.strategyDecision.refs,
    gaps: input.strategyDecision.gaps,
    gatePosture,
  };
}

function resumeAssessment(
  input: AssessMainAgentResumeConsumptionInput,
  status: MainAgentResumeConsumptionStatus,
  reason: string,
  resumePosture: MainAgentResumeConsumptionAssessment["resumePosture"],
  gatePosture: MainAgentResumeConsumptionAssessment["gatePosture"],
): MainAgentResumeConsumptionAssessment {
  return {
    authority: "non-executing-main-agent-resume-consumption-assessment",
    executionStarted: false,
    status,
    mode: input.mode,
    strategyKind: input.strategyDecision.kind,
    reason,
    refs: input.strategyDecision.refs,
    gaps: input.strategyDecision.gaps,
    resumePosture,
    gatePosture,
  };
}

function hasUnsafeStrategyGap(strategy: MainAgentStrategyDecision): boolean {
  return strategy.gaps.some((gap) => ["malformed", "scope-mismatch", "stale", "old-schema"].includes(gap.status));
}

function isStrategyEligibleForScopedAutomation(kind: MainAgentStrategyDecision["kind"]): boolean {
  return kind === "direct-single-worktree" || kind === "sequential-workflowgraph" || kind === "complete";
}

function resumeGateKindForCurrentGate(kind: MainAgentStrategyConsumptionGateSummary["kind"]): "workflow-action" | "approval-action" | null {
  if (kind === "workflow") return "workflow-action";
  if (kind === "approval") return "approval-action";
  return null;
}

function resumeGateActionMatches(
  resumeGate: NonNullable<MainAgentResumeContinuationContext["resumePoint"]>["currentGate"],
  currentGate: MainAgentStrategyConsumptionGateSummary,
): boolean {
  if (currentGate.kind === "workflow") return (resumeGate.actionType ?? null) === (currentGate.actionType ?? null);
  if (currentGate.kind === "approval") return (resumeGate.approvalActionId ?? null) === (currentGate.approvalActionId ?? null);
  return false;
}

function sameStringSet(left: string[], right: string[]): boolean {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((item, index) => item === normalizedRight[index]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
