import type { ResolvedMemory } from "../types/index.js";
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

export interface GoalLoopMainAgentContextSection {
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId?: string;
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
    && decision.executionStarted === false
    && iteration.executionStarted === false
    && brief.executionStarted === false
    && packet.executionStarted === false;
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
