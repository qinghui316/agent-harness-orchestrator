import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { TaskQueueItem, TaskQueueRun, TaskRun } from "../types/index.js";
import { appendTaskQueueTaskEvent } from "./events.js";
import { listTaskQueueItems, writeTaskQueueItem, writeTaskQueueRun } from "./repository.js";
import { itemStatusFromTaskRun, readableItemStopReason } from "./status.js";

export async function getNextQueuedTaskQueueItem(memory: ProjectRunsPathPort, queue: TaskQueueRun): Promise<TaskQueueItem | null> {
  const items = await listTaskQueueItems(memory, queue.changeId, queue.id);
  if (items.some((item) => item.status === "running")) return null;
  return items.find((item) => item.status === "queued") ?? null;
}

export async function markTaskQueueRunning(memory: ProjectRunsPathPort, queue: TaskQueueRun, currentTaskId?: string): Promise<TaskQueueRun> {
  const now = new Date().toISOString();
  return writeTaskQueueRun(memory, {
    ...queue,
    status: "running",
    currentTaskId,
    startedAt: queue.startedAt ?? now,
    finishedAt: null,
    updatedAt: now,
    pausedReason: undefined,
  });
}

export async function markTaskQueueItemRunning(memory: ProjectRunsPathPort, item: TaskQueueItem, taskRun: TaskRun): Promise<TaskQueueItem> {
  const now = new Date().toISOString();
  const written = await writeTaskQueueItem(memory, {
    ...item,
    status: "running",
    taskRunId: taskRun.id,
    startedAt: item.startedAt ?? now,
    updatedAt: now,
    finishedAt: null,
    blockedReason: undefined,
    failureReason: undefined,
  });
  await appendTaskQueueTaskEvent(memory, item, "task.started", { taskRunId: taskRun.id, status: written.status });
  return written;
}

export async function finishTaskQueueItem(memory: ProjectRunsPathPort, item: TaskQueueItem, taskRun: TaskRun): Promise<TaskQueueItem> {
  const now = new Date().toISOString();
  const status = itemStatusFromTaskRun(taskRun.status);
  const written = await writeTaskQueueItem(memory, {
    ...item,
    status,
    taskRunId: taskRun.id,
    updatedAt: now,
    finishedAt: now,
    blockedReason: status === "blocked" ? taskRun.blockedReason ?? "TaskRun blocked." : undefined,
    failureReason: status === "failed" ? taskRun.failureReason ?? "TaskRun failed." : undefined,
  });
  await appendTaskQueueTaskEvent(memory, item, status === "completed" ? "task.completed" : status === "blocked" ? "task.blocked" : "task.failed", {
    taskRunId: taskRun.id,
    status,
    reason: written.blockedReason ?? written.failureReason,
  });
  return written;
}

export async function requeueTaskQueueItemAfterInterruption(
  memory: ProjectRunsPathPort,
  item: TaskQueueItem,
  taskRun: TaskRun,
  reason: string,
): Promise<TaskQueueItem> {
  if (taskRun.status !== "interrupted") throw new Error(`TaskRun ${taskRun.id} is not interrupted.`);
  const written = await writeTaskQueueItem(memory, {
    ...item,
    status: "queued",
    taskRunId: taskRun.id,
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    blockedReason: undefined,
    failureReason: undefined,
  });
  await appendTaskQueueTaskEvent(memory, item, "task.paused", { taskRunId: taskRun.id, status: "queued", reason });
  return written;
}

export async function updateTaskQueueAfterItem(memory: ProjectRunsPathPort, queue: TaskQueueRun): Promise<TaskQueueRun> {
  const items = await listTaskQueueItems(memory, queue.changeId, queue.id);
  const completedCount = items.filter((item) => item.status === "completed").length;
  const failed = items.find((item) => item.status === "failed");
  const blocked = items.find((item) => item.status === "blocked");
  const running = items.find((item) => item.status === "running");
  const next = items.find((item) => item.status === "queued");
  const now = new Date().toISOString();
  if (failed) {
    return writeTaskQueueRun(memory, {
      ...queue,
      status: "failed",
      currentTaskId: failed.taskId,
      completedCount,
      failureReason: readableItemStopReason(failed),
      updatedAt: now,
      finishedAt: now,
    });
  }
  if (blocked) {
    return writeTaskQueueRun(memory, {
      ...queue,
      status: "blocked",
      currentTaskId: blocked.taskId,
      completedCount,
      blockedReason: readableItemStopReason(blocked),
      updatedAt: now,
      finishedAt: now,
    });
  }
  if (running) {
    return writeTaskQueueRun(memory, {
      ...queue,
      status: "running",
      currentTaskId: running.taskId,
      completedCount,
      updatedAt: now,
      finishedAt: null,
    });
  }
  if (!next) {
    return writeTaskQueueRun(memory, {
      ...queue,
      status: "completed",
      currentTaskId: undefined,
      completedCount,
      updatedAt: now,
      finishedAt: now,
    });
  }
  return writeTaskQueueRun(memory, {
    ...queue,
    status: "running",
    currentTaskId: next.taskId,
    completedCount,
    updatedAt: now,
  });
}

export async function pauseTaskQueue(memory: ProjectRunsPathPort, queue: TaskQueueRun, reason: string): Promise<TaskQueueRun> {
  const now = new Date().toISOString();
  const items = await listTaskQueueItems(memory, queue.changeId, queue.id);
  const written = await writeTaskQueueRun(memory, {
    ...queue,
    status: "paused",
    completedCount: items.filter((item) => item.status === "completed").length,
    pausedReason: reason,
    updatedAt: now,
    finishedAt: null,
  });
  return written;
}

export async function failQueuedTaskItem(memory: ProjectRunsPathPort, item: TaskQueueItem, reason: string): Promise<TaskQueueItem> {
  const now = new Date().toISOString();
  const written = await writeTaskQueueItem(memory, {
    ...item,
    status: "failed",
    failureReason: reason,
    updatedAt: now,
    finishedAt: now,
  });
  await appendTaskQueueTaskEvent(memory, item, "task.failed", { status: "failed", reason });
  return written;
}

export async function blockQueuedTaskItem(memory: ProjectRunsPathPort, item: TaskQueueItem, reason: string): Promise<TaskQueueItem> {
  const now = new Date().toISOString();
  const written = await writeTaskQueueItem(memory, {
    ...item,
    status: "blocked",
    blockedReason: reason,
    failureReason: undefined,
    updatedAt: now,
    finishedAt: now,
  });
  await appendTaskQueueTaskEvent(memory, item, "task.blocked", { status: "blocked", reason });
  return written;
}
