import { syncWorkflowRunFromQueue } from "../workflow-run/manager.js";
import type { ResolvedMemory, TaskQueueRun, WorkflowRun } from "../types/index.js";
import { listTaskQueueItems, writeTaskQueueRun } from "./repository.js";

export async function resumePausedTaskQueue(memory: ResolvedMemory, activeQueue: TaskQueueRun, workflow: WorkflowRun): Promise<{
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
  await syncWorkflowRunFromQueue(memory, workflow, queue, items, "workflow.started");
  return { queue, items };
}
