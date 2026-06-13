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
