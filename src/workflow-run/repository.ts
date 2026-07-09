import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory, WorkflowRun } from "../types/index.js";
import { assertWorkflowRunChangeScope, isWorkflowRunScopedToChange } from "./guards.js";
import { workflowRunDir, workflowRunPath } from "./paths.js";
import { workflowRunSchema } from "./schemas.js";

export async function readWorkflowRun(memory: ResolvedMemory, changeId: string, workflowRunId: string): Promise<WorkflowRun> {
  const run = await readRequiredJsonFile(workflowRunPath(memory, changeId, workflowRunId), workflowRunSchema);
  assertWorkflowRunChangeScope(run, changeId);
  return run;
}

export async function listWorkflowRuns(memory: ResolvedMemory, changeId: string): Promise<WorkflowRun[]> {
  const dir = workflowRunDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const runs = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map(async (entry) => {
      const run = await readRequiredJsonFile(join(dir, entry.name), workflowRunSchema).catch(() => null);
      return run && isWorkflowRunScopedToChange(run, changeId) ? run : null;
    }));
  return runs.filter((run): run is WorkflowRun => Boolean(run)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLatestWorkflowRun(memory: ResolvedMemory, changeId: string): Promise<WorkflowRun | null> {
  return (await listWorkflowRuns(memory, changeId))[0] ?? null;
}

export async function writeWorkflowRun(memory: ResolvedMemory, run: WorkflowRun): Promise<WorkflowRun> {
  await writeJsonFile(workflowRunPath(memory, run.changeId, run.id), run);
  return run;
}

export async function updateWorkflowRun(memory: ResolvedMemory, run: WorkflowRun): Promise<WorkflowRun> {
  return writeWorkflowRun(memory, run);
}
