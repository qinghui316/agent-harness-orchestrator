import { join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function taskQueueDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "task-queues", changeId);
}

export function taskQueuePath(memory: ResolvedMemory, changeId: string, queueRunId: string): string {
  return join(taskQueueDir(memory, changeId), `${queueRunId}.json`);
}

export function taskQueueItemDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "task-queue-items", changeId);
}

export function taskQueueItemPath(memory: ResolvedMemory, changeId: string, itemId: string): string {
  return join(taskQueueItemDir(memory, changeId), `${itemId}.json`);
}
