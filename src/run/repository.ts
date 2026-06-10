import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile } from "../fs/json.js";
import { resolveMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject, ResolvedMemory, RunMetadata } from "../types/index.js";
import { runMetadataSchema } from "./schemas.js";

export async function listRuns(project: ManagedProject | string | ResolvedMemory): Promise<RunMetadata[]> {
  const memory = await resolveRunMemory(project);
  const runsDir = memory.runsRoot;
  if (!existsSync(runsDir)) return [];
  const entries = await readdir(runsDir, { withFileTypes: true });
  const runs: RunMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(runsDir, entry.name, "run.json"))) continue;
    runs.push(await readRun(memory, entry.name));
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readRun(project: ManagedProject | string | ResolvedMemory, runId: string): Promise<RunMetadata> {
  const memory = await resolveRunMemory(project);
  const path = join(memory.runsRoot, runId, "run.json");
  return await readRequiredJsonFile(path, runMetadataSchema) as RunMetadata;
}

export async function resolveRunMemory(project: ManagedProject | string | ResolvedMemory): Promise<ResolvedMemory> {
  if (typeof project === "string") return resolveMemory({ path: project });
  if ("runsRoot" in project) return project;
  return resolveProjectMemory(project);
}
