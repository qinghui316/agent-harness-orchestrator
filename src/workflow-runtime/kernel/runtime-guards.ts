import type { TaskRun } from "../../types/index.js";

export function requireSingleTaskId(taskIds: string[] | undefined): string {
  const unique = Array.from(new Set((taskIds ?? []).map((taskId) => taskId.trim()).filter(Boolean)));
  if (unique.length !== 1) throw new Error("task.run.start requires exactly one taskId.");
  return unique[0];
}

export function requireTaskRunId(taskRunId: string | undefined): string {
  if (typeof taskRunId === "string" && taskRunId.trim()) return taskRunId.trim();
  throw new Error("task.run.retry requires taskRunId.");
}

export function assertKnownTaskIds(status: { acMap?: { tasks: Array<{ id: string }> } | null; change?: { id: string } | null }, taskIds: string[], actionType: string): void {
  const known = new Set(status.acMap?.tasks.map((task) => task.id) ?? []);
  const unique = Array.from(new Set(taskIds.map((taskId) => taskId.trim()).filter(Boolean)));
  if (unique.length === 0) throw new Error(`${actionType} requires taskIds.`);
  const missing = unique.filter((taskId) => !known.has(taskId));
  if (missing.length > 0) throw new Error(`${actionType} target taskIds are stale or not scoped to Change ${status.change?.id ?? "unknown"}: ${missing.join(", ")}.`);
}

export function compactArtifactRefs(...refs: Array<string | undefined | null>): string[] {
  return refs.filter((ref): ref is string => Boolean(ref));
}

export function isTaskRunLike(value: unknown): value is TaskRun {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.changeId === "string"
    && typeof value.taskId === "string"
    && typeof value.status === "string";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
