import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import { assertWorkflowArtifactScope } from "./guards.js";
import { latestDecompositionPlanPath, planningDir } from "./paths.js";
import { renderDecompositionPlanMarkdown } from "./rendering.js";
import { decompositionPlanSchema } from "./schemas.js";
import type { DecompositionPlan } from "./types.js";

export async function readLatestDecompositionPlan(memory: ResolvedMemory, changePath: string): Promise<DecompositionPlan> {
  const plan = await readRequiredJsonFile(latestDecompositionPlanPath(memory, changePath), decompositionPlanSchema);
  await assertWorkflowArtifactScope(memory, changePath, plan, "DecompositionPlan");
  return plan;
}

export async function writeDecompositionPlan(memory: ResolvedMemory, changePath: string, plan: DecompositionPlan): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, plan, "DecompositionPlan");
  const dir = planningDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, "decomposition-plan.json"), plan);
  await writeFile(join(dir, "decomposition-plan.md"), renderDecompositionPlanMarkdown(plan), "utf8");
}
