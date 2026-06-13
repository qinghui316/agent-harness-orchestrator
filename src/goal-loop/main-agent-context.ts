import type { ResolvedMemory } from "../types/index.js";
import {
  goalLoopContinuationBriefArtifactRefs,
  goalLoopDecisionArtifactRefs,
  goalLoopIterationArtifactRefs,
  goalLoopNextStepPacketArtifactRefs,
  readLatestGoalLoopContinuationBrief,
  readLatestGoalLoopDecision,
  readLatestGoalLoopIteration,
  readLatestGoalLoopNextStepPacket,
} from "./repository.js";
import type { GoalLoopNextStepPacket } from "./types.js";

export interface GoalLoopMainAgentContextSection {
  goalLoopNextStepPacketId: string;
  markdown: string;
  artifact: string;
  markdownArtifact: string;
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

    const packetRefs = goalLoopNextStepPacketArtifactRefs(memory, changePath, packet.id);
    const decisionRefs = goalLoopDecisionArtifactRefs(memory, changePath, decision.id);
    const iterationRefs = goalLoopIterationArtifactRefs(memory, changePath, iteration.id);
    const briefRefs = goalLoopContinuationBriefArtifactRefs(memory, changePath, brief.id);
    return {
      goalLoopNextStepPacketId: packet.id,
      artifact: packetRefs.artifact,
      markdownArtifact: packetRefs.markdownArtifact,
      markdown: renderGoalLoopMainAgentContextSection(packet, {
        decisionArtifact: decisionRefs.markdownArtifact,
        iterationArtifact: iterationRefs.markdownArtifact,
        briefArtifact: briefRefs.markdownArtifact,
      }),
    };
  } catch {
    return null;
  }
}

function renderGoalLoopMainAgentContextSection(
  packet: GoalLoopNextStepPacket,
  refs: { decisionArtifact: string; iterationArtifact: string; briefArtifact: string },
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
  ].join("\n");
}
