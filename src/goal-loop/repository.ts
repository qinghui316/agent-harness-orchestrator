import { mkdir, writeFile } from "node:fs/promises";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "../workflow-artifacts/artifact-refs.js";
import { assertChangePathScope } from "../workflow-artifacts/guards.js";
import {
  goalLoopDecisionMarkdownPath,
  goalLoopDecisionPath,
  goalLoopDecisionsDir,
  goalLoopContinuationBriefMarkdownPath,
  goalLoopContinuationBriefPath,
  goalLoopContinuationBriefsDir,
  goalLoopNextStepPacketMarkdownPath,
  goalLoopNextStepPacketPath,
  goalLoopNextStepPacketsDir,
  goalLoopFeedbackDir,
  goalLoopFeedbackMarkdownPath,
  goalLoopFeedbackPath,
  goalLoopControllerPoliciesDir,
  goalLoopControllerPolicyMarkdownPath,
  goalLoopControllerPolicyPath,
  goalLoopGateReadinessPreflightMarkdownPath,
  goalLoopGateReadinessPreflightPath,
  goalLoopGateReadinessPreflightsDir,
  goalLoopIterationMarkdownPath,
  goalLoopIterationPath,
  goalLoopIterationsDir,
  latestGoalLoopControllerPolicyMarkdownPath,
  latestGoalLoopControllerPolicyPath,
  latestGoalLoopGateReadinessPreflightMarkdownPath,
  latestGoalLoopGateReadinessPreflightPath,
  latestGoalLoopFeedbackMarkdownPath,
  latestGoalLoopFeedbackPath,
  latestGoalLoopContinuationBriefMarkdownPath,
  latestGoalLoopContinuationBriefPath,
  latestGoalLoopNextStepPacketMarkdownPath,
  latestGoalLoopNextStepPacketPath,
  latestGoalLoopIterationMarkdownPath,
  latestGoalLoopIterationPath,
  latestGoalLoopDecisionMarkdownPath,
  latestGoalLoopDecisionPath,
} from "./paths.js";
import { renderGoalLoopContinuationBriefMarkdown, renderGoalLoopControllerPolicyMarkdown, renderGoalLoopDecisionMarkdown, renderGoalLoopFeedbackMarkdown, renderGoalLoopGateReadinessPreflightMarkdown, renderGoalLoopIterationMarkdown, renderGoalLoopNextStepPacketMarkdown } from "./rendering.js";
import { goalLoopContinuationBriefSchema, goalLoopControllerPolicySchema, goalLoopDecisionSchema, goalLoopFeedbackSchema, goalLoopGateReadinessPreflightSchema, goalLoopIterationSchema, goalLoopNextStepPacketSchema } from "./schemas.js";
import type { GoalLoopContinuationBrief, GoalLoopControllerPolicy, GoalLoopDecision, GoalLoopFeedback, GoalLoopGateReadinessPreflight, GoalLoopIteration, GoalLoopNextStepPacket } from "./types.js";

export function goalLoopDecisionArtifactRefs(memory: ResolvedMemory, changePath: string, decisionId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, goalLoopDecisionPath(memory, changePath, decisionId)),
    markdownArtifact: displayArtifactPath(memory, goalLoopDecisionMarkdownPath(memory, changePath, decisionId)),
  };
}

export function goalLoopIterationArtifactRefs(memory: ResolvedMemory, changePath: string, iterationId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, goalLoopIterationPath(memory, changePath, iterationId)),
    markdownArtifact: displayArtifactPath(memory, goalLoopIterationMarkdownPath(memory, changePath, iterationId)),
  };
}

export function goalLoopContinuationBriefArtifactRefs(memory: ResolvedMemory, changePath: string, briefId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, goalLoopContinuationBriefPath(memory, changePath, briefId)),
    markdownArtifact: displayArtifactPath(memory, goalLoopContinuationBriefMarkdownPath(memory, changePath, briefId)),
  };
}

export function goalLoopNextStepPacketArtifactRefs(memory: ResolvedMemory, changePath: string, packetId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, goalLoopNextStepPacketPath(memory, changePath, packetId)),
    markdownArtifact: displayArtifactPath(memory, goalLoopNextStepPacketMarkdownPath(memory, changePath, packetId)),
  };
}

export function goalLoopFeedbackArtifactRefs(memory: ResolvedMemory, changePath: string, feedbackId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, goalLoopFeedbackPath(memory, changePath, feedbackId)),
    markdownArtifact: displayArtifactPath(memory, goalLoopFeedbackMarkdownPath(memory, changePath, feedbackId)),
  };
}

export function goalLoopControllerPolicyArtifactRefs(memory: ResolvedMemory, changePath: string, policyId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, goalLoopControllerPolicyPath(memory, changePath, policyId)),
    markdownArtifact: displayArtifactPath(memory, goalLoopControllerPolicyMarkdownPath(memory, changePath, policyId)),
  };
}

export function goalLoopGateReadinessPreflightArtifactRefs(memory: ResolvedMemory, changePath: string, preflightId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, goalLoopGateReadinessPreflightPath(memory, changePath, preflightId)),
    markdownArtifact: displayArtifactPath(memory, goalLoopGateReadinessPreflightMarkdownPath(memory, changePath, preflightId)),
  };
}

export async function writeGoalLoopDecision(memory: ResolvedMemory, changePath: string, decision: GoalLoopDecision): Promise<void> {
  await assertChangePathScope(memory, changePath, decision.changeId, `GoalLoopDecision ${decision.id}`);
  await mkdir(goalLoopDecisionsDir(memory, changePath), { recursive: true });
  await writeJsonFile(goalLoopDecisionPath(memory, changePath, decision.id), decision);
  await writeFile(goalLoopDecisionMarkdownPath(memory, changePath, decision.id), renderGoalLoopDecisionMarkdown(decision), "utf8");
  await writeJsonFile(latestGoalLoopDecisionPath(memory, changePath), decision);
  await writeFile(latestGoalLoopDecisionMarkdownPath(memory, changePath), renderGoalLoopDecisionMarkdown(decision), "utf8");
}

export async function readGoalLoopDecision(memory: ResolvedMemory, changePath: string, decisionId: string): Promise<GoalLoopDecision> {
  const decision = await readRequiredJsonFile(goalLoopDecisionPath(memory, changePath, decisionId), goalLoopDecisionSchema);
  await assertChangePathScope(memory, changePath, decision.changeId, `GoalLoopDecision ${decision.id}`);
  if (decision.id !== decisionId) throw new Error("GoalLoopDecision id mismatch.");
  return decision;
}

export async function readLatestGoalLoopDecision(memory: ResolvedMemory, changePath: string): Promise<GoalLoopDecision> {
  const decision = await readRequiredJsonFile(latestGoalLoopDecisionPath(memory, changePath), goalLoopDecisionSchema);
  await assertChangePathScope(memory, changePath, decision.changeId, `GoalLoopDecision ${decision.id}`);
  return decision;
}

export async function writeGoalLoopIteration(memory: ResolvedMemory, changePath: string, iteration: GoalLoopIteration): Promise<void> {
  await assertChangePathScope(memory, changePath, iteration.changeId, `GoalLoopIteration ${iteration.id}`);
  await mkdir(goalLoopIterationsDir(memory, changePath), { recursive: true });
  await writeJsonFile(goalLoopIterationPath(memory, changePath, iteration.id), iteration);
  await writeFile(goalLoopIterationMarkdownPath(memory, changePath, iteration.id), renderGoalLoopIterationMarkdown(iteration), "utf8");
  await writeJsonFile(latestGoalLoopIterationPath(memory, changePath), iteration);
  await writeFile(latestGoalLoopIterationMarkdownPath(memory, changePath), renderGoalLoopIterationMarkdown(iteration), "utf8");
}

export async function readGoalLoopIteration(memory: ResolvedMemory, changePath: string, iterationId: string): Promise<GoalLoopIteration> {
  const iteration = await readRequiredJsonFile(goalLoopIterationPath(memory, changePath, iterationId), goalLoopIterationSchema) as GoalLoopIteration;
  await assertChangePathScope(memory, changePath, iteration.changeId, `GoalLoopIteration ${iteration.id}`);
  if (iteration.id !== iterationId) throw new Error("GoalLoopIteration id mismatch.");
  return iteration;
}

export async function readLatestGoalLoopIteration(memory: ResolvedMemory, changePath: string): Promise<GoalLoopIteration> {
  const iteration = await readRequiredJsonFile(latestGoalLoopIterationPath(memory, changePath), goalLoopIterationSchema) as GoalLoopIteration;
  await assertChangePathScope(memory, changePath, iteration.changeId, `GoalLoopIteration ${iteration.id}`);
  return iteration;
}

export async function writeGoalLoopContinuationBrief(memory: ResolvedMemory, changePath: string, brief: GoalLoopContinuationBrief): Promise<void> {
  await assertChangePathScope(memory, changePath, brief.changeId, `GoalLoopContinuationBrief ${brief.id}`);
  await mkdir(goalLoopContinuationBriefsDir(memory, changePath), { recursive: true });
  await writeJsonFile(goalLoopContinuationBriefPath(memory, changePath, brief.id), brief);
  await writeFile(goalLoopContinuationBriefMarkdownPath(memory, changePath, brief.id), renderGoalLoopContinuationBriefMarkdown(brief), "utf8");
  await writeJsonFile(latestGoalLoopContinuationBriefPath(memory, changePath), brief);
  await writeFile(latestGoalLoopContinuationBriefMarkdownPath(memory, changePath), renderGoalLoopContinuationBriefMarkdown(brief), "utf8");
}

export async function readGoalLoopContinuationBrief(memory: ResolvedMemory, changePath: string, briefId: string): Promise<GoalLoopContinuationBrief> {
  const brief = await readRequiredJsonFile(goalLoopContinuationBriefPath(memory, changePath, briefId), goalLoopContinuationBriefSchema);
  await assertChangePathScope(memory, changePath, brief.changeId, `GoalLoopContinuationBrief ${brief.id}`);
  if (brief.id !== briefId) throw new Error("GoalLoopContinuationBrief id mismatch.");
  return brief;
}

export async function readLatestGoalLoopContinuationBrief(memory: ResolvedMemory, changePath: string): Promise<GoalLoopContinuationBrief> {
  const brief = await readRequiredJsonFile(latestGoalLoopContinuationBriefPath(memory, changePath), goalLoopContinuationBriefSchema);
  await assertChangePathScope(memory, changePath, brief.changeId, `GoalLoopContinuationBrief ${brief.id}`);
  return brief;
}

export async function writeGoalLoopNextStepPacket(memory: ResolvedMemory, changePath: string, packet: GoalLoopNextStepPacket): Promise<void> {
  await assertChangePathScope(memory, changePath, packet.changeId, `GoalLoopNextStepPacket ${packet.id}`);
  await mkdir(goalLoopNextStepPacketsDir(memory, changePath), { recursive: true });
  await writeJsonFile(goalLoopNextStepPacketPath(memory, changePath, packet.id), packet);
  await writeFile(goalLoopNextStepPacketMarkdownPath(memory, changePath, packet.id), renderGoalLoopNextStepPacketMarkdown(packet), "utf8");
  await writeJsonFile(latestGoalLoopNextStepPacketPath(memory, changePath), packet);
  await writeFile(latestGoalLoopNextStepPacketMarkdownPath(memory, changePath), renderGoalLoopNextStepPacketMarkdown(packet), "utf8");
}

export async function readGoalLoopNextStepPacket(memory: ResolvedMemory, changePath: string, packetId: string): Promise<GoalLoopNextStepPacket> {
  const packet = await readRequiredJsonFile(goalLoopNextStepPacketPath(memory, changePath, packetId), goalLoopNextStepPacketSchema);
  await assertChangePathScope(memory, changePath, packet.changeId, `GoalLoopNextStepPacket ${packet.id}`);
  if (packet.id !== packetId) throw new Error("GoalLoopNextStepPacket id mismatch.");
  return packet;
}

export async function readLatestGoalLoopNextStepPacket(memory: ResolvedMemory, changePath: string): Promise<GoalLoopNextStepPacket> {
  const packet = await readRequiredJsonFile(latestGoalLoopNextStepPacketPath(memory, changePath), goalLoopNextStepPacketSchema);
  await assertChangePathScope(memory, changePath, packet.changeId, `GoalLoopNextStepPacket ${packet.id}`);
  return packet;
}

export async function writeGoalLoopFeedback(memory: ResolvedMemory, changePath: string, feedback: GoalLoopFeedback): Promise<void> {
  await assertChangePathScope(memory, changePath, feedback.changeId, `GoalLoopFeedback ${feedback.id}`);
  await mkdir(goalLoopFeedbackDir(memory, changePath), { recursive: true });
  await writeJsonFile(goalLoopFeedbackPath(memory, changePath, feedback.id), feedback);
  await writeFile(goalLoopFeedbackMarkdownPath(memory, changePath, feedback.id), renderGoalLoopFeedbackMarkdown(feedback), "utf8");
  await writeJsonFile(latestGoalLoopFeedbackPath(memory, changePath), feedback);
  await writeFile(latestGoalLoopFeedbackMarkdownPath(memory, changePath), renderGoalLoopFeedbackMarkdown(feedback), "utf8");
}

export async function readGoalLoopFeedback(memory: ResolvedMemory, changePath: string, feedbackId: string): Promise<GoalLoopFeedback> {
  const feedback = await readRequiredJsonFile(goalLoopFeedbackPath(memory, changePath, feedbackId), goalLoopFeedbackSchema);
  await assertChangePathScope(memory, changePath, feedback.changeId, `GoalLoopFeedback ${feedback.id}`);
  if (feedback.id !== feedbackId) throw new Error("GoalLoopFeedback id mismatch.");
  return feedback;
}

export async function readLatestGoalLoopFeedback(memory: ResolvedMemory, changePath: string): Promise<GoalLoopFeedback> {
  const feedback = await readRequiredJsonFile(latestGoalLoopFeedbackPath(memory, changePath), goalLoopFeedbackSchema);
  await assertChangePathScope(memory, changePath, feedback.changeId, `GoalLoopFeedback ${feedback.id}`);
  return feedback;
}

export async function writeGoalLoopControllerPolicy(memory: ResolvedMemory, changePath: string, policy: GoalLoopControllerPolicy): Promise<void> {
  await assertChangePathScope(memory, changePath, policy.changeId, `GoalLoopControllerPolicy ${policy.id}`);
  await mkdir(goalLoopControllerPoliciesDir(memory, changePath), { recursive: true });
  await writeJsonFile(goalLoopControllerPolicyPath(memory, changePath, policy.id), policy);
  await writeFile(goalLoopControllerPolicyMarkdownPath(memory, changePath, policy.id), renderGoalLoopControllerPolicyMarkdown(policy), "utf8");
  await writeJsonFile(latestGoalLoopControllerPolicyPath(memory, changePath), policy);
  await writeFile(latestGoalLoopControllerPolicyMarkdownPath(memory, changePath), renderGoalLoopControllerPolicyMarkdown(policy), "utf8");
}

export async function readGoalLoopControllerPolicy(memory: ResolvedMemory, changePath: string, policyId: string): Promise<GoalLoopControllerPolicy> {
  const policy = await readRequiredJsonFile(goalLoopControllerPolicyPath(memory, changePath, policyId), goalLoopControllerPolicySchema);
  await assertChangePathScope(memory, changePath, policy.changeId, `GoalLoopControllerPolicy ${policy.id}`);
  if (policy.id !== policyId) throw new Error("GoalLoopControllerPolicy id mismatch.");
  return policy;
}

export async function readLatestGoalLoopControllerPolicy(memory: ResolvedMemory, changePath: string): Promise<GoalLoopControllerPolicy> {
  const policy = await readRequiredJsonFile(latestGoalLoopControllerPolicyPath(memory, changePath), goalLoopControllerPolicySchema);
  await assertChangePathScope(memory, changePath, policy.changeId, `GoalLoopControllerPolicy ${policy.id}`);
  return policy;
}

export async function writeGoalLoopGateReadinessPreflight(memory: ResolvedMemory, changePath: string, preflight: GoalLoopGateReadinessPreflight): Promise<void> {
  await assertChangePathScope(memory, changePath, preflight.changeId, `GoalLoopGateReadinessPreflight ${preflight.id}`);
  await mkdir(goalLoopGateReadinessPreflightsDir(memory, changePath), { recursive: true });
  await writeJsonFile(goalLoopGateReadinessPreflightPath(memory, changePath, preflight.id), preflight);
  await writeFile(goalLoopGateReadinessPreflightMarkdownPath(memory, changePath, preflight.id), renderGoalLoopGateReadinessPreflightMarkdown(preflight), "utf8");
  await writeJsonFile(latestGoalLoopGateReadinessPreflightPath(memory, changePath), preflight);
  await writeFile(latestGoalLoopGateReadinessPreflightMarkdownPath(memory, changePath), renderGoalLoopGateReadinessPreflightMarkdown(preflight), "utf8");
}

export async function readGoalLoopGateReadinessPreflight(memory: ResolvedMemory, changePath: string, preflightId: string): Promise<GoalLoopGateReadinessPreflight> {
  const preflight = await readRequiredJsonFile(goalLoopGateReadinessPreflightPath(memory, changePath, preflightId), goalLoopGateReadinessPreflightSchema);
  await assertChangePathScope(memory, changePath, preflight.changeId, `GoalLoopGateReadinessPreflight ${preflight.id}`);
  if (preflight.id !== preflightId) throw new Error("GoalLoopGateReadinessPreflight id mismatch.");
  return preflight;
}

export async function readLatestGoalLoopGateReadinessPreflight(memory: ResolvedMemory, changePath: string): Promise<GoalLoopGateReadinessPreflight> {
  const preflight = await readRequiredJsonFile(latestGoalLoopGateReadinessPreflightPath(memory, changePath), goalLoopGateReadinessPreflightSchema);
  await assertChangePathScope(memory, changePath, preflight.changeId, `GoalLoopGateReadinessPreflight ${preflight.id}`);
  return preflight;
}
