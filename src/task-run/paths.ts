import { join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function taskRunDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "task-runs", changeId);
}

export function taskRunPath(memory: ResolvedMemory, changeId: string, taskRunId: string): string {
  return join(taskRunDir(memory, changeId), `${taskRunId}.json`);
}

export function workerLeaseDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "worker-leases", changeId);
}

export function workerLeasePath(memory: ResolvedMemory, changeId: string, leaseId: string): string {
  return join(workerLeaseDir(memory, changeId), `${leaseId}.json`);
}
