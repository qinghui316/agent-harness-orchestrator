import type { TaskQueueItem, TaskQueueItemStatus, TaskQueueRunStatus, TaskRun } from "../types/index.js";

export function isActiveQueueStatus(status: TaskQueueRunStatus): boolean {
  return status === "queued" || status === "running" || status === "paused";
}

export function isQueueTerminalStatus(status: TaskQueueRunStatus): boolean {
  return status === "blocked" || status === "failed" || status === "completed";
}

export function itemStatusFromTaskRun(status: TaskRun["status"]): TaskQueueItemStatus {
  if (status === "completed" || status === "evidence-ready") return "completed";
  if (status === "blocked") return "blocked";
  if (status === "failed") return "failed";
  if (status === "interrupted") return "queued";
  return "running";
}

export function readableItemStopReason(item: TaskQueueItem): string {
  if (item.failureReason) return `${item.taskId}: ${item.failureReason}`;
  if (item.blockedReason) return `${item.taskId}: ${item.blockedReason}`;
  return `${item.taskId}: task did not complete.`;
}

export function sameRecoveryKeyExceptCreatedAt(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const copy = { ...(value as Record<string, unknown>) };
    delete copy.createdAt;
    return copy;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
