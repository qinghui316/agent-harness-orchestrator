import { join } from "node:path";
import { z } from "zod";
import { readRequiredJsonFile } from "../../fs/json.js";
import type { ResolvedMemory } from "../../types/index.js";
import type { PlanningArtifactBundle } from "../types.js";

const planningBundleSchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "confirmed"]),
  goal: z.string(),
  constraints: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  design: z.string(),
  tasks: z.array(z.object({ id: z.string(), title: z.string(), acIds: z.array(z.string()) })),
  risks: z.array(z.string()),
  openQuestions: z.array(z.string()),
  specMd: z.string(),
  planMd: z.string(),
  tasksMd: z.string(),
  acMapCandidate: z.any(),
  artifact: z.string(),
  updatedAt: z.string(),
});

export function readLatestPlanningBundle(memory: ResolvedMemory, changePath: string): Promise<PlanningArtifactBundle> {
  return readRequiredJsonFile(join(memory.memoryRoot, changePath, "planning", "latest-bundle.json"), planningBundleSchema);
}
