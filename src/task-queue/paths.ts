import { join } from "node:path";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";

export function taskQueueDir(memory: ProjectRunsPathPort, changeId: string): string {
  return join(memory.runsRoot, "task-queues", changeId);
}

export function taskQueuePath(memory: ProjectRunsPathPort, changeId: string, queueRunId: string): string {
  return join(taskQueueDir(memory, changeId), `${queueRunId}.json`);
}

export function taskQueueItemDir(memory: ProjectRunsPathPort, changeId: string): string {
  return join(memory.runsRoot, "task-queue-items", changeId);
}

export function taskQueueItemPath(memory: ProjectRunsPathPort, changeId: string, itemId: string): string {
  return join(taskQueueItemDir(memory, changeId), `${itemId}.json`);
}
