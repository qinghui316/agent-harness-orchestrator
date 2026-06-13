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
