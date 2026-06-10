import { resolveRunnableChangeTarget } from "../change/target.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { assertNoActiveTaskRun, nextAttempt, normalizeKnownTaskId } from "./guards.js";
import { createTaskRunWithLease } from "./lease-service.js";
import { listTaskRuns } from "./repository.js";
import type { TaskRunRetryOptions, TaskRunStartOptions, TaskRunStartResult } from "./types.js";

export async function startTaskRun(project: ManagedProject, options: TaskRunStartOptions): Promise<TaskRunStartResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "TaskRun start");
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId, allowLegacyActiveFallback: false });
  const changeStatus = target.status;
  const taskId = normalizeKnownTaskId(changeStatus.acMap?.tasks ?? [], options.taskId);
  const existing = await listTaskRuns(memory, options.changeId);
  assertNoActiveTaskRun(existing, taskId);
  return createTaskRunWithLease(memory, {
    projectId: project.id,
    changeId: options.changeId,
    taskId,
    roleId: options.roleId ?? "coder",
    attempt: nextAttempt(existing, taskId),
  });
}

export async function retryTaskRun(project: ManagedProject, options: TaskRunRetryOptions): Promise<TaskRunStartResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "TaskRun retry");
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId, allowLegacyActiveFallback: false });
  const changeStatus = target.status;
  const runs = await listTaskRuns(memory, options.changeId);
  const previous = runs.find((run) => run.id === options.taskRunId);
  if (!previous) throw new Error(`TaskRun not found: ${options.taskRunId}.`);
  if (!["blocked", "failed"].includes(previous.status)) throw new Error(`TaskRun ${previous.id} is not retryable from status ${previous.status}.`);
  const taskId = normalizeKnownTaskId(changeStatus.acMap?.tasks ?? [], previous.taskId);
  assertNoActiveTaskRun(runs, taskId);
  return createTaskRunWithLease(memory, {
    projectId: project.id,
    changeId: options.changeId,
    taskId,
    roleId: previous.roleId,
    attempt: nextAttempt(runs, taskId),
  });
}
