import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { TaskQueueRun } from "../types/index.js";
import { listTaskQueueItems, writeTaskQueueRun } from "./repository.js";

export async function resumePausedTaskQueue(memory: ProjectRunsPathPort, activeQueue: TaskQueueRun): Promise<{
  queue: TaskQueueRun;
  items: Awaited<ReturnType<typeof listTaskQueueItems>>;
}> {
  const now = new Date().toISOString();
  const queue = await writeTaskQueueRun(memory, {
    ...activeQueue,
    status: "running",
    updatedAt: now,
    startedAt: activeQueue.startedAt ?? now,
    finishedAt: null,
    pausedReason: undefined,
    blockedReason: undefined,
    failureReason: undefined,
  });
  const items = await listTaskQueueItems(memory, activeQueue.changeId, queue.id);
  return { queue, items };
}
