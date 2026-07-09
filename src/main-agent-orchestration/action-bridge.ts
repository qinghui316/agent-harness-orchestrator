import type { ResolvedMemory } from "../types/index.js";
import { workflowActionScopesMatchStrict } from "../workflow-actions/registry.js";
import {
  readMainAgentNextStepEvidence,
  type MainAgentNextStepEvidence,
  type MainAgentNextStepTargetRefs,
} from "./next-step-evidence.js";

export type MainAgentActionBridgeStatus =
  | "ready"
  | "stale"
  | "unsupported"
  | "blocked"
  | "target-mismatch"
  | "unavailable";

export type MainAgentActionBridgeGate =
  | {
      kind: "workflow-action";
      actionType: string;
      changeId?: string;
      enabled?: boolean;
      scope: Record<string, unknown>;
    }
  | {
      kind: "approval-action";
      actionId: string;
      changeId?: string;
      enabled?: boolean;
      targetId?: string;
      runId?: string;
      artifact?: string;
      args?: string[];
    };

export interface MainAgentActionBridgeAssessment {
  version: "1.0";
  authority: "non-executing-main-agent-action-bridge-assessment";
  executionStarted: false;
  status: MainAgentActionBridgeStatus;
  reason: string;
  loopRunId?: string;
  mainAgentNextStepEvidenceId?: string;
  matchedGateKind?: MainAgentActionBridgeGate["kind"];
  matchedAction?: string;
  scopeDiff?: string[];
  evidenceRef?: string;
  forbiddenAuthority: {
    workflowTruth: false;
    actionExecution: false;
    sourceMutation: false;
    schedulerDispatch: false;
    applyOrClose: false;
    remoteOrMerge: false;
    harnessEvolution: false;
  };
}

export interface AssessMainAgentActionBridgeInput {
  memory: ResolvedMemory;
  projectId: string;
  changeId: string;
  loopRunId?: string;
  evidenceId?: string;
  gate: MainAgentActionBridgeGate | null;
}

const workflowResultHandoffActions = new Set([
  "result.refresh-rework",
  "result.revalidate",
  "result.reaudit",
  "result.refresh-status",
  "apply-check.run",
  "landing.prepare",
]);

const approvalResultHandoffActions = new Set([
  "audit.accept",
  "result.apply",
  "change.close",
]);

export async function assessMainAgentActionBridge(input: AssessMainAgentActionBridgeInput): Promise<MainAgentActionBridgeAssessment> {
  if (!input.loopRunId || !input.evidenceId) {
    return assessment("unavailable", "Main-agent bridge requires loopRunId and evidenceId.", input);
  }
  if (!input.gate) {
    return assessment("unavailable", "Main-agent bridge requires a current visible gate.", input);
  }
  if (input.gate.enabled !== true) {
    return assessment("blocked", "Current visible gate is not enabled.", input, input.gate);
  }

  const decisions = await readMainAgentNextStepEvidence(input.memory, input.loopRunId);
  const latest = decisions.at(-1);
  if (!latest) {
    return assessment("stale", "Main-agent next-step evidence is unavailable.", input, input.gate);
  }
  if (latest.id !== input.evidenceId) {
    return assessment("stale", "Main-agent next-step evidence is not the latest decision for this loop.", input, input.gate, latest);
  }
  if (latest.loopRunId !== input.loopRunId || latest.changeId !== input.changeId || latest.projectId !== input.projectId) {
    return assessment("stale", "Main-agent next-step evidence scope does not match the requested project/change.", input, input.gate, latest);
  }
  if (latest.authority !== "non-executing-main-agent-next-step-evidence" || latest.executionStarted !== false) {
    return assessment("blocked", "Main-agent evidence is not a non-executing next-step decision.", input, input.gate, latest);
  }
  if (latest.decision.kind !== "completed" || latest.gateIntent !== "result-handoff") {
    return assessment("unsupported", "Only completed result-handoff evidence can bridge to a Harness gate.", input, input.gate, latest);
  }

  if (input.gate.kind === "workflow-action") {
    return assessWorkflowGate(input, input.gate, latest);
  }
  return assessApprovalGate(input, input.gate, latest);
}

function assessWorkflowGate(
  input: AssessMainAgentActionBridgeInput,
  gate: Extract<MainAgentActionBridgeGate, { kind: "workflow-action" }>,
  evidence: MainAgentNextStepEvidence,
): MainAgentActionBridgeAssessment {
  if (!workflowResultHandoffActions.has(gate.actionType)) {
    return assessment("unsupported", `Workflow action ${gate.actionType} is not supported by the main-agent bridge.`, input, gate, evidence);
  }
  if (gate.changeId && gate.changeId !== input.changeId) {
    return assessment("target-mismatch", "Workflow gate change scope does not match evidence.", input, gate, evidence, ["changeId"]);
  }
  const expected = expectedScopeForWorkflowGate(input.changeId, gate.actionType, evidence.targetRefs);
  if (!expected) {
    return assessment("target-mismatch", "Main-agent evidence does not contain the required target refs for this workflow gate.", input, gate, evidence);
  }
  const actual = { actionType: gate.actionType, changeId: input.changeId, ...gate.scope };
  if (!workflowActionScopesMatchStrict(expected, actual)) {
    return assessment("target-mismatch", "Workflow gate target scope does not match main-agent evidence.", input, gate, evidence, scopeDiff(expected, actual));
  }
  return assessment("ready", "Main-agent next-step evidence matches the current workflow gate.", input, gate, evidence);
}

function assessApprovalGate(
  input: AssessMainAgentActionBridgeInput,
  gate: Extract<MainAgentActionBridgeGate, { kind: "approval-action" }>,
  evidence: MainAgentNextStepEvidence,
): MainAgentActionBridgeAssessment {
  if (!approvalResultHandoffActions.has(gate.actionId)) {
    return assessment("unsupported", `Approval action ${gate.actionId} is not supported by the main-agent bridge.`, input, gate, evidence);
  }
  if (gate.changeId && gate.changeId !== input.changeId) {
    return assessment("target-mismatch", "Approval gate change scope does not match evidence.", input, gate, evidence, ["changeId"]);
  }
  const expectedTarget = expectedTargetForApprovalGate(input.changeId, gate.actionId, evidence.targetRefs);
  const actualTarget = gate.targetId ?? targetFromApprovalArgs(gate.actionId, gate.args);
  if (!expectedTarget || actualTarget !== expectedTarget) {
    return assessment("target-mismatch", "Approval gate target does not match main-agent evidence.", input, gate, evidence, ["targetId"]);
  }
  return assessment("ready", "Main-agent next-step evidence matches the current approval gate.", input, gate, evidence);
}

function expectedScopeForWorkflowGate(
  changeId: string,
  actionType: string,
  targetRefs: MainAgentNextStepTargetRefs | undefined,
): Record<string, unknown> | null {
  if (!targetRefs) return null;
  if (actionType === "apply-check.run") {
    if (targetRefs.worktreeIds.length === 0) return null;
    return { actionType, changeId, worktreeIds: targetRefs.worktreeIds };
  }
  if (actionType === "landing.prepare") {
    if (targetRefs.worktreeIds.length !== 1) return null;
    return { actionType, changeId, worktreeId: targetRefs.worktreeIds[0] };
  }
  if (!actionType.startsWith("result.")) return null;
  if (targetRefs.worktreeIds.length !== 1) return null;
  return { actionType, changeId, worktreeId: targetRefs.worktreeIds[0] };
}

function expectedTargetForApprovalGate(
  changeId: string,
  actionId: string,
  targetRefs: MainAgentNextStepTargetRefs | undefined,
): string | null {
  if (actionId === "change.close") return changeId;
  if (!targetRefs) return null;
  if (actionId === "audit.accept") return only(targetRefs.auditIds);
  if (actionId === "result.apply") return only(targetRefs.worktreeIds);
  return null;
}

function targetFromApprovalArgs(actionId: string, args: string[] | undefined): string | undefined {
  if (!args) return undefined;
  if (actionId === "result.apply") return args[3] ?? args[2];
  if (actionId === "audit.accept") return args[2];
  if (actionId === "change.close") return args[2];
  return undefined;
}

function only(values: string[]): string | null {
  return values.length === 1 ? values[0] : null;
}

function assessment(
  status: MainAgentActionBridgeStatus,
  reason: string,
  input: Pick<AssessMainAgentActionBridgeInput, "loopRunId" | "evidenceId">,
  gate?: MainAgentActionBridgeGate,
  evidence?: MainAgentNextStepEvidence,
  scopeDiffValues: string[] = [],
): MainAgentActionBridgeAssessment {
  return {
    version: "1.0",
    authority: "non-executing-main-agent-action-bridge-assessment",
    executionStarted: false,
    status,
    reason,
    loopRunId: input.loopRunId,
    mainAgentNextStepEvidenceId: input.evidenceId,
    matchedGateKind: gate?.kind,
    matchedAction: gate?.kind === "workflow-action" ? gate.actionType : gate?.actionId,
    scopeDiff: scopeDiffValues,
    evidenceRef: evidence?.ref,
    forbiddenAuthority: {
      workflowTruth: false,
      actionExecution: false,
      sourceMutation: false,
      schedulerDispatch: false,
      applyOrClose: false,
      remoteOrMerge: false,
      harnessEvolution: false,
    },
  };
}

function scopeDiff(expected: Record<string, unknown>, actual: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const result: string[] = [];
  for (const key of keys) {
    if (!scopeValueEqual(expected[key], actual[key])) result.push(key);
  }
  return result.sort();
}

function scopeValueEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftValues = normalizeArray(left);
    const rightValues = normalizeArray(right);
    return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
  }
  return left === right;
}

function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).sort();
  if (typeof value === "string") return [value];
  return [];
}
