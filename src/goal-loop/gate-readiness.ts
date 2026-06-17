import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import {
  validateWorkflowActionRequiredTargets,
  type WorkflowActionScopeCarrier,
} from "../workflow-actions/registry.js";
import { assessGoalLoopNextStepPacketFreshness } from "./freshness.js";
import {
  goalLoopGateReadinessPreflightArtifactRefs,
  readLatestGoalLoopContinuationBrief,
  readLatestGoalLoopControllerPolicy,
  readLatestGoalLoopDecision,
  readLatestGoalLoopIteration,
  readLatestGoalLoopNextStepPacket,
  writeGoalLoopGateReadinessPreflight,
} from "./repository.js";
import type {
  GoalLoopControllerPolicy,
  GoalLoopCurrentGateSnapshot,
  GoalLoopGateReadinessPreflight,
  GoalLoopNextStepPacket,
} from "./types.js";

export interface CompileGoalLoopGateReadinessPreflightOptions {
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId: string;
  currentGate: GoalLoopCurrentGateSnapshot;
}

export async function compileGoalLoopGateReadinessPreflight(
  memory: ResolvedMemory,
  changePath: string,
  options: CompileGoalLoopGateReadinessPreflightOptions,
): Promise<GoalLoopGateReadinessPreflight> {
  const [decision, iteration, brief, packet, policy] = await Promise.all([
    readLatestGoalLoopDecision(memory, changePath),
    readLatestGoalLoopIteration(memory, changePath),
    readLatestGoalLoopContinuationBrief(memory, changePath),
    readLatestGoalLoopNextStepPacket(memory, changePath),
    readLatestGoalLoopControllerPolicy(memory, changePath),
  ]);
  if (packet.id !== options.goalLoopNextStepPacketId) throw new Error("GoalLoopGateReadinessPreflight packet target is stale.");
  if (policy.id !== options.goalLoopControllerPolicyId) throw new Error("GoalLoopGateReadinessPreflight controller policy target is stale.");
  assertPacketLineage(packet, {
    changeId: decision.changeId,
    iterationId: iteration.id,
    iterationDecisionId: iteration.goalLoopDecisionId,
    briefDecisionId: brief.sourceGoalLoopDecisionId,
    briefIterationId: brief.sourceGoalLoopIterationId,
  });
  if (policy.changeId !== packet.changeId) throw new Error("GoalLoopGateReadinessPreflight policy change scope mismatch.");
  if (policy.sourceGoalLoopDecisionId !== packet.sourceGoalLoopDecisionId) throw new Error("GoalLoopGateReadinessPreflight policy decision lineage mismatch.");
  if (policy.sourceGoalLoopIterationId !== packet.sourceGoalLoopIterationId) throw new Error("GoalLoopGateReadinessPreflight policy iteration lineage mismatch.");
  if (policy.sourceGoalLoopContinuationBriefId !== packet.sourceGoalLoopContinuationBriefId) throw new Error("GoalLoopGateReadinessPreflight policy brief lineage mismatch.");
  if (policy.sourceGoalLoopNextStepPacketId !== packet.id) throw new Error("GoalLoopGateReadinessPreflight policy packet lineage mismatch.");
  if (policy.executionStarted !== false) throw new Error("GoalLoopGateReadinessPreflight requires non-executing controller policy evidence.");
  assertSchedulerExecutionModeMatches(packet, policy);
  if (policy.verdict !== "recommend-existing-gate" || policy.gateStatus !== "matches-current-gate") {
    throw new Error("GoalLoopGateReadinessPreflight requires a matching controller policy.");
  }
  if (!packet.recommendedAction) throw new Error("GoalLoopGateReadinessPreflight requires a recommended concrete gate.");
  if (!policy.recommendedAction || !policy.currentGate) throw new Error("GoalLoopGateReadinessPreflight requires controller policy gate evidence.");
  if (options.currentGate.actionType.startsWith("planning.goal-loop.")) {
    throw new Error("GoalLoopGateReadinessPreflight cannot target recursive Goal Loop actions.");
  }
  const freshness = await assessGoalLoopNextStepPacketFreshness(memory, changePath, packet);
  if (freshness.verdict !== "fresh") throw new Error(`GoalLoopGateReadinessPreflight packet is stale: ${freshness.reason}.`);
  if (options.currentGate.actionType !== packet.recommendedAction.actionType || options.currentGate.actionType !== policy.currentGate.actionType) {
    throw new Error("GoalLoopGateReadinessPreflight current gate action mismatch.");
  }
  assertScopeMatches("packet", packet.changeId, packet.recommendedAction, options.currentGate);
  assertScopeMatches("policy", packet.changeId, policy.currentGate, options.currentGate);
  const requiredTargetIssues = validateWorkflowActionRequiredTargets({
    actionType: options.currentGate.actionType,
    ...scopeToCarrier(options.currentGate.scope),
  });
  if (requiredTargetIssues.length) {
    throw new Error(`GoalLoopGateReadinessPreflight concrete gate target is incomplete: ${requiredTargetIssues.map((issue) => issue.label).join(", ")}.`);
  }

  const now = new Date().toISOString();
  const preflightId = `goal-loop-gate-readiness-preflight-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${packet.changeId}:${packet.id}:${policy.id}:${options.currentGate.actionType}:${now}`)}`;
  const refs = goalLoopGateReadinessPreflightArtifactRefs(memory, changePath, preflightId);
  const preflight: GoalLoopGateReadinessPreflight = {
    version: "1.0",
    id: preflightId,
    changeId: packet.changeId,
    authority: "non-executing-concrete-gate-readiness-preflight-evidence",
    status: "ready",
    sourceGoalLoopDecisionId: packet.sourceGoalLoopDecisionId,
    sourceGoalLoopIterationId: packet.sourceGoalLoopIterationId,
    sourceGoalLoopContinuationBriefId: packet.sourceGoalLoopContinuationBriefId,
    sourceGoalLoopNextStepPacketId: packet.id,
    sourceGoalLoopControllerPolicyId: policy.id,
    iterationOrdinal: packet.iterationOrdinal,
    recommendedAction: packet.recommendedAction,
    currentGate: options.currentGate,
    schedulerExecutionMode: packet.schedulerExecutionMode,
    summary: `Goal Loop packet and controller policy still match the current ${options.currentGate.actionType} Harness gate. The concrete gate remains separate and unexecuted.`,
    requiredTargetLabels: Object.keys(options.currentGate.scope).sort(),
    revalidationChecklist: [
      "Re-read selected Change, latest packet, latest controller policy, and current Workbench gate before relying on this preflight.",
      "Run the concrete gate through its own stale-target revalidation before execution.",
      "Run ToolPolicyGate and require human confirmation for the concrete gate if it is later invoked.",
    ],
    forbiddenExecutionStatements: [
      "Do not call the concrete Workbench action handler from this preflight.",
      "Do not treat this preflight as ToolPolicy authorization or user confirmation for the concrete gate.",
      "Do not mutate source, start workers, create runs/worktrees/TaskRuns/IntegrationChecks, close/apply/merge, or create child Changes from this preflight.",
    ],
    humanGateRequired: true,
    toolPolicyGateRequiredForConcreteGate: true,
    concreteGateRequiresSeparateConfirmation: true,
    concreteGateInvoked: false,
    toolPolicyAuthorizedConcreteGate: false,
    executionStarted: false,
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeGoalLoopGateReadinessPreflight(memory, changePath, preflight);
  return preflight;
}

function assertSchedulerExecutionModeMatches(packet: GoalLoopNextStepPacket, policy: GoalLoopControllerPolicy): void {
  const packetMode = packet.schedulerExecutionMode;
  const policyMode = policy.schedulerExecutionMode;
  const currentGateMatches = packetMode.currentGate || policyMode.currentGate
    ? packetMode.currentGate?.actionType === policyMode.currentGate?.actionType
      && packetMode.currentGate?.separateHumanGateRequired === policyMode.currentGate?.separateHumanGateRequired
    : true;
  const matches = packetMode.authority === policyMode.authority
    && packetMode.mode === policyMode.mode
    && packetMode.loopAuthorized === policyMode.loopAuthorized
    && packetMode.fullParallelExecutorAuthorized === policyMode.fullParallelExecutorAuthorized
    && packetMode.wholeWaveDispatchAuthorized === policyMode.wholeWaveDispatchAuthorized
    && packetMode.slotAllocatorAuthorized === policyMode.slotAllocatorAuthorized
    && packetMode.humanGateRequired === policyMode.humanGateRequired
    && packetMode.summary === policyMode.summary
    && currentGateMatches
    && stringArraysEqual(packetMode.reasons, policyMode.reasons)
    && stringArraysEqual(packetMode.futureLoopRequirements, policyMode.futureLoopRequirements);
  if (!matches) {
    throw new Error("GoalLoopGateReadinessPreflight scheduler execution mode mismatch.");
  }
}

function assertPacketLineage(
  packet: GoalLoopNextStepPacket,
  expected: {
    changeId: string;
    iterationId: string;
    iterationDecisionId: string;
    briefDecisionId: string;
    briefIterationId: string;
  },
): void {
  if (packet.changeId !== expected.changeId) throw new Error("GoalLoopGateReadinessPreflight packet change scope mismatch.");
  if (packet.sourceGoalLoopIterationId !== expected.iterationId) throw new Error("GoalLoopGateReadinessPreflight packet iteration lineage mismatch.");
  if (packet.sourceGoalLoopDecisionId !== expected.iterationDecisionId) throw new Error("GoalLoopGateReadinessPreflight packet iteration decision lineage mismatch.");
  if (packet.sourceGoalLoopDecisionId !== expected.briefDecisionId) throw new Error("GoalLoopGateReadinessPreflight packet brief decision lineage mismatch.");
  if (packet.sourceGoalLoopIterationId !== expected.briefIterationId) throw new Error("GoalLoopGateReadinessPreflight packet brief iteration lineage mismatch.");
  if (packet.executionStarted !== false) throw new Error("GoalLoopGateReadinessPreflight requires non-executing packet evidence.");
}

function assertScopeMatches(
  label: string,
  changeId: string,
  expected: { actionType: string; scope: Record<string, string | string[]> },
  actual: GoalLoopCurrentGateSnapshot,
): void {
  const expectedChangeId = normalizeScopeValue(expected.scope.changeId);
  const actualChangeId = normalizeScopeValue(actual.scope.changeId);
  if (!scopeValuesEqual(expectedChangeId.length ? expectedChangeId : [changeId], [changeId])) {
    throw new Error(`GoalLoopGateReadinessPreflight ${label} scope does not match current gate.`);
  }
  if (!scopeValuesEqual(actualChangeId, [changeId])) {
    throw new Error(`GoalLoopGateReadinessPreflight ${label} scope does not match current gate.`);
  }
  if (!goalLoopCurrentGateScopeMatches(expected.actionType, changeId, expected.scope, actual)) {
    throw new Error(`GoalLoopGateReadinessPreflight ${label} scope does not match current gate.`);
  }
}

function goalLoopCurrentGateScopeMatches(
  actionType: string,
  changeId: string,
  expectedScope: Record<string, string | string[]>,
  actual: GoalLoopCurrentGateSnapshot,
): boolean {
  if (actual.actionType !== actionType) return false;
  for (const [key, expected] of Object.entries(expectedScope)) {
    const expectedValue = key === "changeId" ? changeId : expected;
    const actualValue = key === "changeId" ? actual.scope.changeId ?? changeId : actual.scope[key];
    if (!scopeValuesEqual(normalizeScopeValue(expectedValue), normalizeScopeValue(actualValue))) return false;
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

function stringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function scopeToCarrier(scope: Record<string, string | string[]>): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = {};
  for (const [key, value] of Object.entries(scope)) {
    (result as Record<string, string | string[]>)[key] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}
