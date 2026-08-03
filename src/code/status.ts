import { getChangeStatus } from "../change/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { listRuns, readRun } from "../run/manager.js";
import type { ManagedProject, RunMetadata } from "../types/index.js";
import type { CodeStatusResult } from "./types.js";

export async function getCodeStatus(project: ManagedProject): Promise<CodeStatusResult> {
  const changeStatus = await getChangeStatus(project);
  const memory = await resolveProjectMemory(project);
  const changeId = changeStatus.change?.id ?? null;
  const runs = (await listRuns(memory)).filter((run) => run.runtime === "provider-code" && (!changeId || run.changeId === changeId));
  return { activeChangeId: changeId, latest: runs[0] ?? null, runs };
}

export async function listCodeRuns(project: ManagedProject): Promise<RunMetadata[]> {
  return (await listRuns(await resolveProjectMemory(project))).filter((run) => run.runtime === "provider-code");
}

export async function showCodeRun(project: ManagedProject, runId: string): Promise<RunMetadata> {
  const run = await readRun(await resolveProjectMemory(project), runId);
  if (run.runtime !== "provider-code") throw new Error(`Run ${runId} is not a coder run.`);
  return run;
}
