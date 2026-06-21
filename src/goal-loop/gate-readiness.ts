import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import {
  validateWorkflowActionRequiredTargets,
  type WorkflowActionScopeCarrier,
} from "../workflow-actions/registry.js";
import { schedulerExecutionModeAssessmentsEqual } from "../workflow-scheduler/execution-mode.js";
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
  GoalLoopControlledSchedulerPostStepRoutingPreflightSupport,
  GoalLoopControlledSchedulerPostStepRoutingStatus,
  GoalLoopControllerPolicy,
  GoalLoopCurrentGateSnapshot,
  GoalLoopGateReadinessPreflight,
  GoalLoopNextStepPacket,
} from "./types.js";

export type ControlledSchedulerPostStepRoutingPreflightSupportInput =
  Omit<
    GoalLoopControlledSchedulerPostStepRoutingPreflightSupport,
    | "continuationDecisionStatus"
    | "routingReadinessStatus"
    | "needsReevaluation"
    | "loopAuthorized"
    | "fullParallelExecutorAuthorized"
    | "wholeWaveDispatchAuthorized"
    | "slotAllocatorAuthorized"
    | "sourceMutationAuthorized"
    | "applyAuthorized"
    | "closeAuthorized"
    | "mergeAuthorized"
    | "remoteLandingAuthorized"
    | "harnessEvolutionAuthorized"
    | "executionStarted"
  > & {
    continuationDecisionStatus: string;
    routingReadinessStatus: string;
    needsReevaluation: boolean;
    loopAuthorized: boolean;
    fullParallelExecutorAuthorized: boolean;
    wholeWaveDispatchAuthorized: boolean;
    slotAllocatorAuthorized: boolean;
    sourceMutationAuthorized: boolean;
    applyAuthorized: boolean;
    closeAuthorized: boolean;
    mergeAuthorized: boolean;
    remoteLandingAuthorized: boolean;
    harnessEvolutionAuthorized: boolean;
    executionStarted: boolean;
  };

export interface CompileGoalLoopGateReadinessPreflightOptions {
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId: string;
  currentGate: GoalLoopCurrentGateSnapshot;
  sourceGoalLoopGateReadinessPreflightId?: string;
  controlledSchedulerPostStepRoutingSupport?: ControlledSchedulerPostStepRoutingPreflightSupportInput;
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
  const controlledSchedulerPostStepRoutingSupport = normalizeControlledSchedulerPostStepRoutingSupport(
    options.controlledSchedulerPostStepRoutingSupport,
    packet,
    policy,
    options.currentGate,
    options.sourceGoalLoopGateReadinessPreflightId,
  );

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
    ...(controlledSchedulerPostStepRoutingSupport ? { controlledSchedulerPostStepRoutingSupport } : {}),
    summary: controlledSchedulerPostStepRoutingSupport
      ? `Goal Loop packet, controller policy, and controlled Scheduler post-step routing support still match the current ${options.currentGate.actionType} Harness gate. The concrete gate remains separate and unexecuted.`
      : `Goal Loop packet and controller policy still match the current ${options.currentGate.actionType} Harness gate. The concrete gate remains separate and unexecuted.`,
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

function normalizeControlledSchedulerPostStepRoutingSupport(
  support: ControlledSchedulerPostStepRoutingPreflightSupportInput | undefined,
  packet: GoalLoopNextStepPacket,
  policy: GoalLoopControllerPolicy,
  currentGate: GoalLoopCurrentGateSnapshot,
  expectedSourcePreflightId: string | undefined,
): GoalLoopControlledSchedulerPostStepRoutingPreflightSupport | undefined {
  if (!support) return undefined;
  if (support.authority !== "non-executing-controlled-scheduler-post-step-routing-preflight-support") {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support authority mismatch.");
  }
  if (!support.sourceSchedulerControlledStepEvidenceId || !support.sourceSchedulerControlledStepArtifact) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support requires source step evidence.");
  }
  if (support.changeId !== packet.changeId) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support change scope mismatch.");
  }
  if (support.sourceGoalLoopNextStepPacketId !== packet.id) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support packet lineage mismatch.");
  }
  if (support.sourceGoalLoopControllerPolicyId !== policy.id) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support controller policy lineage mismatch.");
  }
  if (!support.sourceGoalLoopGateReadinessPreflightId || !expectedSourcePreflightId || support.sourceGoalLoopGateReadinessPreflightId !== expectedSourcePreflightId) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support preflight lineage mismatch.");
  }
  if (!isRoutableControlledSchedulerPostStepRoutingStatus(support.continuationDecisionStatus)) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support requires ready continuation decision.");
  }
  if (!isRoutableControlledSchedulerPostStepRoutingStatus(support.routingReadinessStatus)) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support requires ready routing evidence.");
  }
  if (support.routingReadinessStatus !== support.continuationDecisionStatus) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support status mismatch.");
  }
  if (support.needsReevaluation !== false) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support requires fresh routing evidence.");
  }
  if (support.existingGateActionType !== currentGate.actionType) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support current gate action mismatch.");
  }
  assertScopeMatches("controlled Scheduler post-step routing support", packet.changeId, {
    actionType: support.existingGateActionType,
    scope: support.currentGateScope,
  }, currentGate);
  assertControlledSchedulerPostStepRoutingSupportHasNoAuthority(support);
  if (!support.routeFamily || !support.ownerModule || !support.reason || !support.evidenceRefs.length) {
    throw new Error("GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support requires compact routing evidence.");
  }
  return {
    authority: support.authority,
    sourceSchedulerControlledStepEvidenceId: support.sourceSchedulerControlledStepEvidenceId,
    sourceSchedulerControlledStepArtifact: support.sourceSchedulerControlledStepArtifact,
    ...(support.sourceSchedulerControlledStepMarkdownArtifact ? { sourceSchedulerControlledStepMarkdownArtifact: support.sourceSchedulerControlledStepMarkdownArtifact } : {}),
    changeId: support.changeId,
    sourceGoalLoopNextStepPacketId: support.sourceGoalLoopNextStepPacketId,
    sourceGoalLoopControllerPolicyId: support.sourceGoalLoopControllerPolicyId,
    ...(support.sourceGoalLoopGateReadinessPreflightId ? { sourceGoalLoopGateReadinessPreflightId: support.sourceGoalLoopGateReadinessPreflightId } : {}),
    routeFamily: support.routeFamily,
    ownerModule: support.ownerModule,
    existingGateActionType: support.existingGateActionType,
    continuationDecisionStatus: support.continuationDecisionStatus,
    routingReadinessStatus: support.routingReadinessStatus,
    needsReevaluation: false,
    reason: support.reason,
    currentGateScope: cloneScope(support.currentGateScope),
    evidenceRefs: [...support.evidenceRefs],
    loopAuthorized: false,
    fullParallelExecutorAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    sourceMutationAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    mergeAuthorized: false,
    remoteLandingAuthorized: false,
    harnessEvolutionAuthorized: false,
    executionStarted: false,
  };
}

function isRoutableControlledSchedulerPostStepRoutingStatus(
  status: string,
): status is GoalLoopControlledSchedulerPostStepRoutingStatus {
  return status === "ready-for-human-gate"
    || status === "quality-routing"
    || status === "integration-barrier"
    || status === "terminal-handoff";
}

function assertControlledSchedulerPostStepRoutingSupportHasNoAuthority(
  support: ControlledSchedulerPostStepRoutingPreflightSupportInput,
): void {
  const forbiddenFlags: Array<keyof ControlledSchedulerPostStepRoutingPreflightSupportInput> = [
    "loopAuthorized",
    "fullParallelExecutorAuthorized",
    "wholeWaveDispatchAuthorized",
    "slotAllocatorAuthorized",
    "sourceMutationAuthorized",
    "applyAuthorized",
    "closeAuthorized",
    "mergeAuthorized",
    "remoteLandingAuthorized",
    "harnessEvolutionAuthorized",
    "executionStarted",
  ];
  const authorized = forbiddenFlags.find((flag) => support[flag] !== false);
  if (authorized) {
    throw new Error(`GoalLoopGateReadinessPreflight controlled Scheduler post-step routing support has forbidden authority: ${authorized}.`);
  }
}

function assertSchedulerExecutionModeMatches(packet: GoalLoopNextStepPacket, policy: GoalLoopControllerPolicy): void {
  if (!schedulerExecutionModeAssessmentsEqual(packet.schedulerExecutionMode, policy.schedulerExecutionMode)) {
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

function scopeToCarrier(scope: Record<string, string | string[]>): WorkflowActionScopeCarrier {
  const result: WorkflowActionScopeCarrier = {};
  for (const [key, value] of Object.entries(scope)) {
    (result as Record<string, string | string[]>)[key] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}

function cloneScope(scope: Record<string, string | string[]>): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(scope)) {
    result[key] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}
