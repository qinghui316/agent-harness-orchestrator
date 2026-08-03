import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { TaskRun, WorkerLease } from "../types/index.js";
import { taskRunDir, taskRunPath, workerLeaseDir, workerLeasePath } from "./paths.js";
import { taskRunSchema, workerLeaseSchema } from "./schemas.js";

export async function listTaskRuns(memory: ProjectRunsPathPort, changeId: string): Promise<TaskRun[]> {
  const dir = taskRunDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const runs = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(dir, entry.name), taskRunSchema)));
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listWorkerLeases(memory: ProjectRunsPathPort, changeId: string): Promise<WorkerLease[]> {
  const dir = workerLeaseDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const leases = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(dir, entry.name), workerLeaseSchema)));
  return leases.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt));
}

export async function readTaskRun(memory: ProjectRunsPathPort, changeId: string, taskRunId: string): Promise<TaskRun> {
  return readRequiredJsonFile(taskRunPath(memory, changeId, taskRunId), taskRunSchema);
}

export async function findTaskRun(memory: ProjectRunsPathPort, taskRunId: string): Promise<TaskRun | null> {
  const root = join(memory.runsRoot, "task-runs");
  if (!existsSync(root)) return null;
  const changes = await readdir(root, { withFileTypes: true });
  for (const change of changes) {
    if (!change.isDirectory()) continue;
    const path = taskRunPath(memory, change.name, taskRunId);
    if (existsSync(path)) return readRequiredJsonFile(path, taskRunSchema);
  }
  return null;
}

export async function resolveTaskRun(memory: ProjectRunsPathPort, taskRunId: string, scope: { changeId?: string } = {}): Promise<TaskRun> {
  const taskRun = scope.changeId ? await readTaskRun(memory, scope.changeId, taskRunId) : await findTaskRun(memory, taskRunId);
  if (!taskRun) throw new Error(`TaskRun not found: ${taskRunId}.`);
  return taskRun;
}

export async function writeTaskRun(memory: ProjectRunsPathPort, taskRun: TaskRun): Promise<TaskRun> {
  await writeJsonFile(taskRunPath(memory, taskRun.changeId, taskRun.id), taskRun);
  return taskRun;
}

export async function writeWorkerLease(memory: ProjectRunsPathPort, lease: WorkerLease): Promise<WorkerLease> {
  await writeJsonFile(workerLeasePath(memory, lease.changeId, lease.id), lease);
  return lease;
}
