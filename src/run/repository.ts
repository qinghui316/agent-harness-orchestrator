import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile } from "../fs/json.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { RunMetadata } from "../types/index.js";
import { assertPortableRunId, assertRunArtifactDirectory } from "./artifact-paths.js";
import { runMetadataSchema } from "./schemas.js";

export async function listRuns(paths: ProjectRunsPathPort): Promise<RunMetadata[]> {
  const runsDir = paths.runsRoot;
  if (!existsSync(runsDir)) return [];
  const entries = await readdir(runsDir, { withFileTypes: true });
  const runs: RunMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(runsDir, entry.name, "run.json"))) continue;
    runs.push(await readRun(paths, entry.name));
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readRun(paths: ProjectRunsPathPort, runId: string): Promise<RunMetadata> {
  assertPortableRunId(runId);
  const path = join(paths.runsRoot, runId, "run.json");
  const run = await readRequiredJsonFile(path, runMetadataSchema) as RunMetadata;
  if (run.id !== runId) {
    throw new Error(`Run identity mismatch: requested ${runId}, found ${run.id}.`);
  }
  assertRunArtifactDirectory(run);
  return run;
}
