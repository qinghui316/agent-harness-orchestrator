import { mkdir, writeFile } from "node:fs/promises";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "../workflow-artifacts/artifact-refs.js";
import { assertChangePathScope } from "../workflow-artifacts/guards.js";
import {
  goalLoopDecisionMarkdownPath,
  goalLoopDecisionPath,
  goalLoopDecisionsDir,
  latestGoalLoopDecisionMarkdownPath,
  latestGoalLoopDecisionPath,
} from "./paths.js";
import { renderGoalLoopDecisionMarkdown } from "./rendering.js";
import { goalLoopDecisionSchema } from "./schemas.js";
import type { GoalLoopDecision } from "./types.js";

export function goalLoopDecisionArtifactRefs(memory: ResolvedMemory, changePath: string, decisionId: string): { artifact: string; markdownArtifact: string } {
  return {
    artifact: displayArtifactPath(memory, goalLoopDecisionPath(memory, changePath, decisionId)),
    markdownArtifact: displayArtifactPath(memory, goalLoopDecisionMarkdownPath(memory, changePath, decisionId)),
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
