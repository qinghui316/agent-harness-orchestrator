import type { TaskRun, TaskRunStatus } from "../types/index.js";

export function isActiveTaskRunStatus(status: TaskRunStatus): boolean {
  return status === "queued" || status === "claimed" || status === "running";
}

export function assertNoActiveTaskRun(runs: TaskRun[], taskId: string): void {
  const active = runs.find((run) => run.taskId === taskId && isActiveTaskRunStatus(run.status));
  if (active) throw new Error(`Task ${taskId} already has an active TaskRun: ${active.id}.`);
}

export function nextAttempt(runs: TaskRun[], taskId: string): number {
  return Math.max(0, ...runs.filter((run) => run.taskId === taskId).map((run) => run.attempt)) + 1;
}

export function normalizeKnownTaskId(tasks: Array<{ id: string }>, input: string): string {
  const requested = input.trim().toUpperCase();
  const known = new Set(tasks.map((task) => task.id.toUpperCase()));
  if (!known.has(requested)) throw new Error(`Unknown task id: ${input}.`);
  return requested;
}

export function assertTaskRunMatchesScope(taskRun: TaskRun, scope: { changeId?: string; taskId?: string }, action: string): void {
  if (scope.changeId && taskRun.changeId !== scope.changeId) {
    throw new Error(`${action} target ${taskRun.id} is not scoped to Change ${scope.changeId}.`);
  }
  if (scope.taskId && taskRun.taskId !== scope.taskId) {
    throw new Error(`${action} target ${taskRun.id} is not scoped to task ${scope.taskId}.`);
  }
}
