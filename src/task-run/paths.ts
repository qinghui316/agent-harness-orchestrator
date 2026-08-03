import { join } from "node:path";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";

export function taskRunDir(memory: ProjectRunsPathPort, changeId: string): string {
  return join(memory.runsRoot, "task-runs", changeId);
}

export function taskRunPath(memory: ProjectRunsPathPort, changeId: string, taskRunId: string): string {
  return join(taskRunDir(memory, changeId), `${taskRunId}.json`);
}

export function workerLeaseDir(memory: ProjectRunsPathPort, changeId: string): string {
  return join(memory.runsRoot, "worker-leases", changeId);
}

export function workerLeasePath(memory: ProjectRunsPathPort, changeId: string, leaseId: string): string {
  return join(workerLeaseDir(memory, changeId), `${leaseId}.json`);
}
