import type { ResolvedMemory } from "../types/index.js";
import { schedulerExecutionModeAssessmentsEqual } from "../workflow-scheduler/execution-mode.js";
import {
  goalLoopContinuationBriefArtifactRefs,
  goalLoopControllerPolicyArtifactRefs,
  goalLoopDecisionArtifactRefs,
  goalLoopIterationArtifactRefs,
  goalLoopNextStepPacketArtifactRefs,
  readLatestGoalLoopContinuationBrief,
  readLatestGoalLoopControllerPolicy,
  readLatestGoalLoopDecision,
  readLatestGoalLoopIteration,
  readLatestGoalLoopNextStepPacket,
} from "./repository.js";
import { isGoalLoopNextStepPacketFresh } from "./freshness.js";
import type { GoalLoopContinuationBrief, GoalLoopControllerPolicy, GoalLoopDecision, GoalLoopIteration, GoalLoopNextStepPacket } from "./types.js";

export interface GoalLoopSchedulerLoopSnapshotContext {
  posture: string;
  decisionKind: string;
  currentLegalActionType?: string;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface GoalLoopMainAgentContextSection {
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId?: string;
  routingPosture: string;
  routingLabel: string;
  schedulerExecutionMode: string;
  schedulerLoopAuthorized: false;
  schedulerLoopEvidenceSnapshot: GoalLoopSchedulerLoopSnapshotContext;
  guidedGateActionType?: string;
  guidedGateScope?: Record<string, string | string[]>;
  controllerVerdict?: string;
  controllerGateStatus?: string;
  markdown: string;
  artifact: string;
  markdownArtifact: string;
  controllerArtifact?: string;
  controllerMarkdownArtifact?: string;
}

export async function buildGoalLoopMainAgentContextSection(
  memory: ResolvedMemory,
  changePath: string,
  expectedChangeId: string,
): Promise<GoalLoopMainAgentContextSection | null> {
  try {
    const [decision, iteration, brief, packet] = await Promise.all([
      readLatestGoalLoopDecision(memory, changePath),
      readLatestGoalLoopIteration(memory, changePath),
      readLatestGoalLoopContinuationBrief(memory, changePath),
      readLatestGoalLoopNextStepPacket(memory, changePath),
    ]);
    if (decision.changeId !== expectedChangeId || iteration.changeId !== expectedChangeId || brief.changeId !== expectedChangeId || packet.changeId !== expectedChangeId) return null;
    if (iteration.goalLoopDecisionId !== decision.id) return null;
    if (brief.sourceGoalLoopDecisionId !== decision.id || brief.sourceGoalLoopIterationId !== iteration.id) return null;
    if (packet.sourceGoalLoopDecisionId !== decision.id || packet.sourceGoalLoopIterationId !== iteration.id || packet.sourceGoalLoopContinuationBriefId !== brief.id) return null;
    if (decision.executionStarted !== false || iteration.executionStarted !== false || brief.executionStarted !== false || packet.executionStarted !== false) return null;
    if (!(await isGoalLoopNextStepPacketFresh(memory, changePath, packet))) return null;
    if (!isSchedulerLoopSnapshotValidForContext(decision.schedulerLoopEvidenceSnapshot, decision, packet, expectedChangeId)) return null;

    const controllerPolicy = await readLatestGoalLoopControllerPolicy(memory, changePath)
      .then((policy) => isGoalLoopControllerPolicyValidForContext(policy, decision, iteration, brief, packet) ? policy : null)
      .catch(() => null);

    const packetRefs = goalLoopNextStepPacketArtifactRefs(memory, changePath, packet.id);
    const decisionRefs = goalLoopDecisionArtifactRefs(memory, changePath, decision.id);
    const iterationRefs = goalLoopIterationArtifactRefs(memory, changePath, iteration.id);
    const briefRefs = goalLoopContinuationBriefArtifactRefs(memory, changePath, brief.id);
    const controllerRefs = controllerPolicy ? goalLoopControllerPolicyArtifactRefs(memory, changePath, controllerPolicy.id) : undefined;
    return {
      goalLoopNextStepPacketId: packet.id,
      goalLoopControllerPolicyId: controllerPolicy?.id,
      routingPosture: packet.conflictAssessment.routingPosture,
      routingLabel: packet.conflictAssessment.routingLabel,
      schedulerExecutionMode: packet.schedulerExecutionMode.mode,
      schedulerLoopAuthorized: packet.schedulerExecutionMode.loopAuthorized,
      schedulerLoopEvidenceSnapshot: summarizeSchedulerLoopSnapshot(decision.schedulerLoopEvidenceSnapshot),
      guidedGateActionType: controllerPolicy?.verdict === "recommend-existing-gate" ? controllerPolicy.currentGate?.actionType : undefined,
      guidedGateScope: controllerPolicy?.verdict === "recommend-existing-gate" ? controllerPolicy.currentGate?.scope : undefined,
      controllerVerdict: controllerPolicy?.verdict,
      controllerGateStatus: controllerPolicy?.gateStatus,
      artifact: packetRefs.artifact,
      markdownArtifact: packetRefs.markdownArtifact,
      controllerArtifact: controllerRefs?.artifact,
      controllerMarkdownArtifact: controllerRefs?.markdownArtifact,
      markdown: renderGoalLoopMainAgentContextSection(packet, {
        decisionArtifact: decisionRefs.markdownArtifact,
        iterationArtifact: iterationRefs.markdownArtifact,
        briefArtifact: briefRefs.markdownArtifact,
        controllerPolicy,
        controllerPolicyArtifact: controllerRefs?.markdownArtifact,
        schedulerLoopSnapshot: decision.schedulerLoopEvidenceSnapshot,
      }),
    };
  } catch {
    return null;
  }
}

export function stripGoalLoopControllerPolicyContext(section: GoalLoopMainAgentContextSection): GoalLoopMainAgentContextSection {
  if (!section.goalLoopControllerPolicyId) return section;
  return {
    goalLoopNextStepPacketId: section.goalLoopNextStepPacketId,
    routingPosture: section.routingPosture,
    routingLabel: section.routingLabel,
    schedulerExecutionMode: section.schedulerExecutionMode,
    schedulerLoopAuthorized: section.schedulerLoopAuthorized,
    schedulerLoopEvidenceSnapshot: section.schedulerLoopEvidenceSnapshot,
    markdown: stripControllerPolicyMarkdown(section.markdown),
    artifact: section.artifact,
    markdownArtifact: section.markdownArtifact,
  };
}

function isGoalLoopControllerPolicyValidForContext(
  policy: GoalLoopControllerPolicy,
  decision: GoalLoopDecision,
  iteration: GoalLoopIteration,
  brief: GoalLoopContinuationBrief,
  packet: GoalLoopNextStepPacket,
): boolean {
  return policy.changeId === decision.changeId
    && policy.changeId === iteration.changeId
    && policy.changeId === brief.changeId
    && policy.changeId === packet.changeId
    && policy.sourceGoalLoopDecisionId === decision.id
    && policy.sourceGoalLoopIterationId === iteration.id
    && policy.sourceGoalLoopContinuationBriefId === brief.id
    && policy.sourceGoalLoopNextStepPacketId === packet.id
    && policy.executionStarted === false
    && schedulerExecutionModesEqual(policy.schedulerExecutionMode, packet.schedulerExecutionMode)
    && decision.executionStarted === false
    && iteration.executionStarted === false
    && brief.executionStarted === false
    && packet.executionStarted === false;
}

function isSchedulerLoopSnapshotValidForContext(
  snapshot: GoalLoopDecision["schedulerLoopEvidenceSnapshot"],
  decision: GoalLoopDecision,
  packet: GoalLoopNextStepPacket,
  expectedChangeId: string,
): boolean {
  if (snapshot.version !== "1.0") return false;
  if (snapshot.authority !== "non-executing-scheduler-loop-evidence-snapshot") return false;
  if (snapshot.changeId !== expectedChangeId || snapshot.changeId !== decision.changeId || snapshot.changeId !== packet.changeId) return false;
  if (snapshot.decisionKind !== decision.decisionKind) return false;
  if (!schedulerExecutionModesEqual(snapshot.schedulerExecutionMode, decision.schedulerExecutionMode)) return false;
  if (!schedulerExecutionModesEqual(snapshot.schedulerExecutionMode, packet.schedulerExecutionMode)) return false;
  if (!forbiddenAuthorityIsFalse(snapshot.forbiddenAuthority)) return false;
  if (!recommendedActionMatchesSnapshot(decision.recommendedAction, snapshot.currentLegalAction)) return false;
  if (!currentLegalActionMatchesSchedulerGate(snapshot.currentLegalAction, snapshot.schedulerExecutionMode.currentGate)) return false;
  if (snapshot.separateHumanGateRequired !== Boolean(snapshot.currentLegalAction)) return false;
  if (snapshot.currentLegalAction && !snapshot.humanGateRequired) return false;
  if (snapshot.currentLegalAction?.separateHumanGateRequired !== undefined && snapshot.currentLegalAction.separateHumanGateRequired !== true) return false;
  return true;
}

function forbiddenAuthorityIsFalse(forbiddenAuthority: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]["forbiddenAuthority"]): boolean {
  return forbiddenAuthority.loopAuthorized === false
    && forbiddenAuthority.fullParallelExecutorAuthorized === false
    && forbiddenAuthority.wholeWaveDispatchAuthorized === false
    && forbiddenAuthority.slotAllocatorAuthorized === false
    && forbiddenAuthority.executionStarted === false
    && forbiddenAuthority.sourceMutationAuthorized === false
    && forbiddenAuthority.applyAuthorized === false
    && forbiddenAuthority.closeAuthorized === false
    && forbiddenAuthority.harnessEvolutionAuthorized === false;
}

function recommendedActionMatchesSnapshot(
  action: GoalLoopDecision["recommendedAction"],
  snapshotAction: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]["currentLegalAction"],
): boolean {
  if (!action && !snapshotAction) return true;
  if (!action || !snapshotAction) return false;
  return action.actionType === snapshotAction.actionType
    && action.reason === snapshotAction.reason
    && scopedRecordsEqual(action.scope, snapshotAction.scope)
    && snapshotAction.separateHumanGateRequired === true;
}

function currentLegalActionMatchesSchedulerGate(
  action: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]["currentLegalAction"],
  currentGate: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]["schedulerExecutionMode"]["currentGate"],
): boolean {
  if (!action && !currentGate) return true;
  if (!action || !currentGate) return false;
  return action.actionType === currentGate.actionType && currentGate.separateHumanGateRequired === true;
}

function scopedRecordsEqual(
  left: Record<string, string | string[]>,
  right: Record<string, string | string[]>,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, leftValue]) => {
    const rightValue = right[key];
    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      return Array.isArray(leftValue)
        && Array.isArray(rightValue)
        && leftValue.length === rightValue.length
        && leftValue.every((value, index) => value === rightValue[index]);
    }
    return leftValue === rightValue;
  });
}

function summarizeSchedulerLoopSnapshot(snapshot: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]): GoalLoopSchedulerLoopSnapshotContext {
  return {
    posture: snapshot.posture,
    decisionKind: snapshot.decisionKind,
    currentLegalActionType: snapshot.currentLegalAction?.actionType,
    loopAuthorized: snapshot.forbiddenAuthority.loopAuthorized,
    fullParallelExecutorAuthorized: snapshot.forbiddenAuthority.fullParallelExecutorAuthorized,
    wholeWaveDispatchAuthorized: snapshot.forbiddenAuthority.wholeWaveDispatchAuthorized,
    slotAllocatorAuthorized: snapshot.forbiddenAuthority.slotAllocatorAuthorized,
    sourceMutationAuthorized: snapshot.forbiddenAuthority.sourceMutationAuthorized,
    applyAuthorized: snapshot.forbiddenAuthority.applyAuthorized,
    closeAuthorized: snapshot.forbiddenAuthority.closeAuthorized,
    harnessEvolutionAuthorized: snapshot.forbiddenAuthority.harnessEvolutionAuthorized,
  };
}

function stripControllerPolicyMarkdown(markdown: string): string {
  const marker = "\n### Controller Policy";
  const index = markdown.indexOf(marker);
  return index >= 0 ? markdown.slice(0, index).trimEnd() + "\n" : markdown;
}

function renderGoalLoopMainAgentContextSection(
  packet: GoalLoopNextStepPacket,
  refs: {
    decisionArtifact: string;
    iterationArtifact: string;
    briefArtifact: string;
    controllerPolicy?: GoalLoopControllerPolicy | null;
    controllerPolicyArtifact?: string;
    schedulerLoopSnapshot: GoalLoopDecision["schedulerLoopEvidenceSnapshot"];
  },
): string {
  return [
    "## Goal Loop Next-Step Packet",
    "",
    "This section is main-Agent prompt context only. It is not workflow truth, a hidden continuation turn, a scheduler loop, or execution authorization.",
    "Before acting on it, re-read current Change evidence and use the corresponding scoped Harness gate.",
    "Any recommended action must be revalidated and confirmed through its own scoped Harness gate.",
    "",
    `- Packet: ${packet.id}`,
    `- Change: ${packet.changeId}`,
    `- Authority: ${packet.authority}`,
    `- Source GoalLoopDecision: ${packet.sourceGoalLoopDecisionId}`,
    `- Source GoalLoopIteration: ${packet.sourceGoalLoopIterationId}`,
    `- Source GoalLoopContinuationBrief: ${packet.sourceGoalLoopContinuationBriefId}`,
    `- Packet artifact: ${packet.markdownArtifact || packet.artifact}`,
    `- Decision artifact: ${refs.decisionArtifact}`,
    `- Iteration artifact: ${refs.iterationArtifact}`,
    `- Continuation brief artifact: ${refs.briefArtifact}`,
    `- Recommendation state: ${packet.recommendationState}`,
    `- Separate gate required: ${packet.separateGateRequired ? "yes" : "no"}`,
    `- Human gate required: ${packet.humanGateRequired ? "yes" : "no"}`,
    `- Execution started: ${packet.executionStarted ? "yes" : "no"}`,
    "",
    "### Summary",
    "",
    packet.summary,
    "",
    "### Recommended Action Snapshot",
    "",
    packet.recommendedAction
      ? `- ${packet.recommendedAction.actionType}: ${packet.recommendedAction.reason}`
      : "- None.",
    ...(packet.recommendedAction
      ? ["", "#### Scope", "", ...Object.entries(packet.recommendedAction.scope).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`)]
      : []),
    "",
    "### Revalidation Checklist",
    "",
    ...packet.revalidationChecklist.map((item) => `- ${item}`),
    "",
    "### Main Agent Instructions",
    "",
    ...packet.mainAgentInstructions.map((item) => `- ${item}`),
    "",
    "### Staleness Instruction",
    "",
    packet.stalenessInstruction,
    "",
    "### Routing Posture",
    "",
    `- routingPosture: ${packet.conflictAssessment.routingPosture}`,
    `- routingLabel: ${packet.conflictAssessment.routingLabel}`,
    "- Authority: routing posture is prompt-context evidence only; it must not execute, prioritize, or confirm any workflow action.",
    "",
    "### Scheduler Execution Mode",
    "",
    `- Mode: ${packet.schedulerExecutionMode.mode}`,
    `- Authority: ${packet.schedulerExecutionMode.authority}`,
    `- loopAuthorized: ${packet.schedulerExecutionMode.loopAuthorized ? "true" : "false"}`,
    `- fullParallelExecutorAuthorized: ${packet.schedulerExecutionMode.fullParallelExecutorAuthorized ? "true" : "false"}`,
    `- wholeWaveDispatchAuthorized: ${packet.schedulerExecutionMode.wholeWaveDispatchAuthorized ? "true" : "false"}`,
    `- slotAllocatorAuthorized: ${packet.schedulerExecutionMode.slotAllocatorAuthorized ? "true" : "false"}`,
    `- Human gate required: ${packet.schedulerExecutionMode.humanGateRequired ? "yes" : "no"}`,
    ...(packet.schedulerExecutionMode.currentGate ? [`- Current separate gate: ${packet.schedulerExecutionMode.currentGate.actionType}`] : ["- Current separate gate: none"]),
    "",
    "#### Scheduler Execution Mode Reasons",
    "",
    ...packet.schedulerExecutionMode.reasons.map((reason) => `- ${reason}`),
    "",
    "#### Future Loop Requirements",
    "",
    ...packet.schedulerExecutionMode.futureLoopRequirements.map((requirement) => `- ${requirement}`),
    "",
    "- Authority: scheduler execution mode is prompt-context evidence only; it must not start workers, dispatch waves, allocate slots, or authorize a scheduler loop/full executor.",
    "",
    ...renderSchedulerLoopSnapshotContextLines(refs.schedulerLoopSnapshot),
    "### Conflict Assessment",
    "",
    `- Level: ${packet.conflictAssessment.level}`,
    `- Parallel eligible: ${packet.conflictAssessment.parallelEligible ? "yes" : "no"}`,
    ...packet.conflictAssessment.reasons.map((reason) => `- ${reason}`),
    "",
    "### Completion Audit",
    "",
    `- Status: ${packet.completionAudit.status}`,
    ...(packet.completionAudit.evidence.length ? packet.completionAudit.evidence.map((item) => `- Evidence: ${item}`) : ["- Evidence: none."]),
    ...(packet.completionAudit.missing.length ? packet.completionAudit.missing.map((item) => `- Missing: ${item}`) : ["- Missing: none."]),
    "",
    "### Source Evidence",
    "",
    ...(packet.sourceEvidenceRefs.length
      ? packet.sourceEvidenceRefs.map((ref) => `- ${ref.kind}${ref.id ? ` ${ref.id}` : ""}${ref.status ? ` (${ref.status})` : ""}: ${ref.summary}`)
      : ["- None."]),
    "",
    "### Forbidden Execution Statements",
    "",
    ...packet.forbiddenExecutionStatements.map((statement) => `- ${statement}`),
    "",
    ...renderControllerPolicyContextLines(refs.controllerPolicy, refs.controllerPolicyArtifact),
  ].join("\n");
}

function renderSchedulerLoopSnapshotContextLines(snapshot: GoalLoopDecision["schedulerLoopEvidenceSnapshot"]): string[] {
  const currentLegalActionLines = snapshot.currentLegalAction
    ? [
        `- Current legal action: ${snapshot.currentLegalAction.actionType}`,
        "#### Snapshot Legal Action Scope",
        "",
        ...Object.entries(snapshot.currentLegalAction.scope).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`),
        "",
      ]
    : ["- Current legal action: none", ""];
  return [
    "### Scheduler Loop Evidence Snapshot",
    "",
    "This scheduler-loop snapshot is main-Agent prompt context from the latest valid GoalLoopDecision. It is non-executing decision evidence only.",
    "It must not authorize a scheduler loop, start workers, dispatch waves, allocate slots, mutate source, apply, close, or evolve Harness state.",
    "",
    `- Authority: ${snapshot.authority}`,
    `- Posture: ${snapshot.posture}`,
    `- Decision kind: ${snapshot.decisionKind}`,
    `- Human gate required: ${snapshot.humanGateRequired ? "yes" : "no"}`,
    `- Separate gate required: ${snapshot.separateHumanGateRequired ? "yes" : "no"}`,
    ...currentLegalActionLines,
    "#### Snapshot Forbidden Authority",
    "",
    `- loopAuthorized: ${snapshot.forbiddenAuthority.loopAuthorized ? "true" : "false"}`,
    `- fullParallelExecutorAuthorized: ${snapshot.forbiddenAuthority.fullParallelExecutorAuthorized ? "true" : "false"}`,
    `- wholeWaveDispatchAuthorized: ${snapshot.forbiddenAuthority.wholeWaveDispatchAuthorized ? "true" : "false"}`,
    `- slotAllocatorAuthorized: ${snapshot.forbiddenAuthority.slotAllocatorAuthorized ? "true" : "false"}`,
    `- sourceMutationAuthorized: ${snapshot.forbiddenAuthority.sourceMutationAuthorized ? "true" : "false"}`,
    `- applyAuthorized: ${snapshot.forbiddenAuthority.applyAuthorized ? "true" : "false"}`,
    `- closeAuthorized: ${snapshot.forbiddenAuthority.closeAuthorized ? "true" : "false"}`,
    `- harnessEvolutionAuthorized: ${snapshot.forbiddenAuthority.harnessEvolutionAuthorized ? "true" : "false"}`,
    "",
    "#### Snapshot Reasons",
    "",
    ...snapshot.reasons.map((reason) => `- ${reason}`),
    "",
  ];
}

function renderControllerPolicyContextLines(policy: GoalLoopControllerPolicy | null | undefined, policyArtifact: string | undefined): string[] {
  if (!policy) return [];
  const guidedGateLines = policy.verdict === "recommend-existing-gate" && policy.currentGate
    ? renderGuidedGateHandoffLines(policy.currentGate)
    : [];
  return [
    "### Controller Policy",
    "",
    "This controller policy is prompt context and evidence only. It is not workflow truth, ToolPolicy authorization, human confirmation, or execution permission.",
    "Use it to explain the current safe posture in plain language, then require the concrete scoped Harness gate for any transition.",
    "",
    `- Controller policy: ${policy.id}`,
    `- Verdict: ${policy.verdict}`,
    `- Gate status: ${policy.gateStatus}`,
    `- Suppresses recommended action: ${policy.suppressesRecommendedAction ? "yes" : "no"}`,
    `- Human gate required: ${policy.humanGateRequired ? "yes" : "no"}`,
    `- Execution started: ${policy.executionStarted ? "yes" : "no"}`,
    `- Controller policy artifact: ${policy.markdownArtifact || policyArtifact || policy.artifact}`,
    `- Source packet: ${policy.sourceGoalLoopNextStepPacketId}`,
    "",
    "#### Summary",
    "",
    policy.summary,
    "",
    "#### Current Gate Snapshot",
    "",
    policy.currentGate
      ? `- ${policy.currentGate.actionType}: ${Object.entries(policy.currentGate.scope).map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : value}`).join("; ")}`
      : "- None.",
    "",
    "#### Controller Scheduler Execution Mode",
    "",
    `- Mode: ${policy.schedulerExecutionMode.mode}`,
    `- Authority: ${policy.schedulerExecutionMode.authority}`,
    `- loopAuthorized: ${policy.schedulerExecutionMode.loopAuthorized ? "true" : "false"}`,
    `- fullParallelExecutorAuthorized: ${policy.schedulerExecutionMode.fullParallelExecutorAuthorized ? "true" : "false"}`,
    `- wholeWaveDispatchAuthorized: ${policy.schedulerExecutionMode.wholeWaveDispatchAuthorized ? "true" : "false"}`,
    `- slotAllocatorAuthorized: ${policy.schedulerExecutionMode.slotAllocatorAuthorized ? "true" : "false"}`,
    `- Human gate required: ${policy.schedulerExecutionMode.humanGateRequired ? "yes" : "no"}`,
    ...(policy.schedulerExecutionMode.currentGate ? [`- Current separate gate: ${policy.schedulerExecutionMode.currentGate.actionType}`] : ["- Current separate gate: none"]),
    "",
    "##### Controller Scheduler Reasons",
    "",
    ...policy.schedulerExecutionMode.reasons.map((reason) => `- ${reason}`),
    "",
    "##### Controller Future Loop Requirements",
    "",
    ...policy.schedulerExecutionMode.futureLoopRequirements.map((requirement) => `- ${requirement}`),
    "",
    "- Authority: controller scheduler execution mode is copied read-only evidence; it must not start workers, dispatch waves, allocate slots, or authorize a scheduler loop/full executor.",
    "",
    ...guidedGateLines,
    "#### Controller Revalidation Checklist",
    "",
    ...policy.revalidationChecklist.map((item) => `- ${item}`),
    "",
    "#### Controller Forbidden Execution Statements",
    "",
    ...policy.forbiddenExecutionStatements.map((statement) => `- ${statement}`),
    "",
  ];
}

function schedulerExecutionModesEqual(
  left: GoalLoopNextStepPacket["schedulerExecutionMode"],
  right: GoalLoopNextStepPacket["schedulerExecutionMode"],
): boolean {
  return schedulerExecutionModeAssessmentsEqual(left, right);
}

function renderGuidedGateHandoffLines(currentGate: GoalLoopControllerPolicy["currentGate"]): string[] {
  if (!currentGate) return [];
  return [
    "#### Concrete Harness Gate Handoff",
    "",
    "The main Agent may explain this gate as the current safe next step, but this explanation is not confirmation and must not execute the action.",
    "The user must still confirm the concrete Workbench Harness gate, and the action must still pass required-target validation, stale-target revalidation, ToolPolicyGate, and human gate checks.",
    "",
    `- Gate action type: ${currentGate.actionType}`,
    "##### Gate Scope",
    "",
    ...Object.entries(currentGate.scope).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`),
    "",
  ];
}
