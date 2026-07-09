import { join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function goalLoopDecisionsDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-decisions");
}

export function goalLoopDecisionPath(memory: ResolvedMemory, changePath: string, decisionId: string): string {
  return join(goalLoopDecisionsDir(memory, changePath), `${decisionId}.json`);
}

export function goalLoopDecisionMarkdownPath(memory: ResolvedMemory, changePath: string, decisionId: string): string {
  return join(goalLoopDecisionsDir(memory, changePath), `${decisionId}.md`);
}

export function latestGoalLoopDecisionPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-decision.json");
}

export function latestGoalLoopDecisionMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-decision.md");
}

export function goalLoopIterationsDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-iterations");
}

export function goalLoopIterationPath(memory: ResolvedMemory, changePath: string, iterationId: string): string {
  return join(goalLoopIterationsDir(memory, changePath), `${iterationId}.json`);
}

export function goalLoopIterationMarkdownPath(memory: ResolvedMemory, changePath: string, iterationId: string): string {
  return join(goalLoopIterationsDir(memory, changePath), `${iterationId}.md`);
}

export function latestGoalLoopIterationPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-iteration.json");
}

export function latestGoalLoopIterationMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-iteration.md");
}

export function goalLoopContinuationBriefsDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-continuation-briefs");
}

export function goalLoopContinuationBriefPath(memory: ResolvedMemory, changePath: string, briefId: string): string {
  return join(goalLoopContinuationBriefsDir(memory, changePath), `${briefId}.json`);
}

export function goalLoopContinuationBriefMarkdownPath(memory: ResolvedMemory, changePath: string, briefId: string): string {
  return join(goalLoopContinuationBriefsDir(memory, changePath), `${briefId}.md`);
}

export function latestGoalLoopContinuationBriefPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-continuation-brief.json");
}

export function latestGoalLoopContinuationBriefMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-continuation-brief.md");
}

export function goalLoopNextStepPacketsDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-next-step-packets");
}

export function goalLoopNextStepPacketPath(memory: ResolvedMemory, changePath: string, packetId: string): string {
  return join(goalLoopNextStepPacketsDir(memory, changePath), `${packetId}.json`);
}

export function goalLoopNextStepPacketMarkdownPath(memory: ResolvedMemory, changePath: string, packetId: string): string {
  return join(goalLoopNextStepPacketsDir(memory, changePath), `${packetId}.md`);
}

export function latestGoalLoopNextStepPacketPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-next-step-packet.json");
}

export function latestGoalLoopNextStepPacketMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-next-step-packet.md");
}

export function goalLoopFeedbackDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-feedback");
}

export function goalLoopFeedbackPath(memory: ResolvedMemory, changePath: string, feedbackId: string): string {
  return join(goalLoopFeedbackDir(memory, changePath), `${feedbackId}.json`);
}

export function goalLoopFeedbackMarkdownPath(memory: ResolvedMemory, changePath: string, feedbackId: string): string {
  return join(goalLoopFeedbackDir(memory, changePath), `${feedbackId}.md`);
}

export function latestGoalLoopFeedbackPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-feedback.json");
}

export function latestGoalLoopFeedbackMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-feedback.md");
}

export function goalLoopControllerPoliciesDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-controller-policies");
}

export function goalLoopControllerPolicyPath(memory: ResolvedMemory, changePath: string, policyId: string): string {
  return join(goalLoopControllerPoliciesDir(memory, changePath), `${policyId}.json`);
}

export function goalLoopControllerPolicyMarkdownPath(memory: ResolvedMemory, changePath: string, policyId: string): string {
  return join(goalLoopControllerPoliciesDir(memory, changePath), `${policyId}.md`);
}

export function latestGoalLoopControllerPolicyPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-controller-policy.json");
}

export function latestGoalLoopControllerPolicyMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-controller-policy.md");
}

export function goalLoopGateReadinessPreflightsDir(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-gate-readiness-preflights");
}

export function goalLoopGateReadinessPreflightPath(memory: ResolvedMemory, changePath: string, preflightId: string): string {
  return join(goalLoopGateReadinessPreflightsDir(memory, changePath), `${preflightId}.json`);
}

export function goalLoopGateReadinessPreflightMarkdownPath(memory: ResolvedMemory, changePath: string, preflightId: string): string {
  return join(goalLoopGateReadinessPreflightsDir(memory, changePath), `${preflightId}.md`);
}

export function latestGoalLoopGateReadinessPreflightPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-gate-readiness-preflight.json");
}

export function latestGoalLoopGateReadinessPreflightMarkdownPath(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", "goal-loop-gate-readiness-preflight.md");
}
