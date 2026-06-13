import { mkdir, writeFile } from "node:fs/promises";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "../workflow-artifacts/artifact-refs.js";
import { assertChangePathScope } from "../workflow-artifacts/guards.js";
import {
  goalLoopDecisionMarkdownPath,
  goalLoopDecisionPath,
  goalLoopDecisionsDir,
  goalLoopIterationMarkdownPath,
  goalLoopIterationPath,
  goalLoopIterationsDir,
  latestGoalLoopIterationMarkdownPath,
  latestGoalLoopIterationPath,
  latestGoalLoopDecisionMarkdownPath,
  latestGoalLoopDecisionPath,
} from "./paths.js";
import { renderGoalLoopDecisionMarkdown, renderGoalLoopIterationMarkdown } from "./rendering.js";
import { goalLoopDecisionSchema, goalLoopIterationSchema } from "./schemas.js";
import type { GoalLoopDecision, GoalLoopIteration } from "./types.js";

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
