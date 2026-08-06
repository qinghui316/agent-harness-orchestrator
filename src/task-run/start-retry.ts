import { resolveRunnableChangeTarget } from "../change/target.js";
import type { ChangeStatus, ManagedProject } from "../types/index.js";
import {
  requireProjectExecutionRuntimePort,
  type ProjectExecutionRuntimePort,
} from "../project-runtime/execution-ports.js";
import { assertNoActiveTaskRun, nextAttempt, normalizeKnownTaskId } from "./guards.js";
import { createTaskRunWithLease, reclaimTaskRunWithLease } from "./lease-service.js";
import { listTaskRuns } from "./repository.js";
import type { TaskRunRetryOptions, TaskRunStartOptions, TaskRunStartResult } from "./types.js";
import { acquireWorkbenchRuntimeMutationLock } from "../workbench/schema-rebuild-gate.js";

export async function startTaskRun(project: ManagedProject, options: TaskRunStartOptions): Promise<TaskRunStartResult> {
  const memory = await requireProjectExecutionRuntimePort(project);
  const runtimeLock = await acquireWorkbenchRuntimeMutationLock(memory, "启动 Workflow 模型任务");
  try {
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const changeStatus = target.status;
  const taskId = normalizeKnownTaskId(changeStatus.acMap?.tasks ?? [], options.taskId);
  const existing = await listTaskRuns(memory, options.changeId);
  assertNoActiveTaskRun(existing, taskId);
  return await createTaskRunWithLease(memory, {
    projectId: project.id,
    changeId: options.changeId,
    taskId,
    roleId: options.roleId ?? "coder",
    attempt: nextAttempt(existing, taskId),
  });
  } finally {
    await runtimeLock.release();
  }
}

export async function startTaskRunFromRuntime(
  runtime: ProjectExecutionRuntimePort,
  changeStatus: ChangeStatus,
  options: TaskRunStartOptions,
): Promise<TaskRunStartResult> {
  const runtimeLock = await acquireWorkbenchRuntimeMutationLock(runtime, "启动 Workflow 模型任务");
  try {
    const changeId = requireAcceptedChange(changeStatus, options.changeId);
    const taskId = normalizeKnownTaskId(changeStatus.acMap?.tasks ?? [], options.taskId);
    const existing = await listTaskRuns(runtime, changeId);
    assertNoActiveTaskRun(existing, taskId);
    return createTaskRunWithLease(runtime, {
      projectId: runtime.projectId,
      changeId,
      taskId,
      roleId: options.roleId ?? "coder",
      attempt: nextAttempt(existing, taskId),
    });
  } finally {
    await runtimeLock.release();
  }
}

export async function retryTaskRun(project: ManagedProject, options: TaskRunRetryOptions): Promise<TaskRunStartResult> {
  const memory = await requireProjectExecutionRuntimePort(project);
  const runtimeLock = await acquireWorkbenchRuntimeMutationLock(memory, "重试 Workflow 模型任务");
  try {
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const changeStatus = target.status;
  const runs = await listTaskRuns(memory, options.changeId);
  const previous = runs.find((run) => run.id === options.taskRunId);
  if (!previous) throw new Error(`TaskRun not found: ${options.taskRunId}.`);
  if (!["blocked", "failed"].includes(previous.status)) throw new Error(`TaskRun ${previous.id} is not retryable from status ${previous.status}.`);
  const taskId = normalizeKnownTaskId(changeStatus.acMap?.tasks ?? [], previous.taskId);
  assertNoActiveTaskRun(runs, taskId);
  return await createTaskRunWithLease(memory, {
    projectId: project.id,
    changeId: options.changeId,
    taskId,
    roleId: options.roleId ?? previous.roleId,
    attempt: nextAttempt(runs, taskId),
  });
  } finally {
    await runtimeLock.release();
  }
}

export async function retryTaskRunFromRuntime(
  runtime: ProjectExecutionRuntimePort,
  changeStatus: ChangeStatus,
  options: TaskRunRetryOptions,
): Promise<TaskRunStartResult> {
  const runtimeLock = await acquireWorkbenchRuntimeMutationLock(runtime, "重试 Workflow 模型任务");
  try {
    const changeId = requireAcceptedChange(changeStatus, options.changeId);
    const runs = await listTaskRuns(runtime, changeId);
    const previous = runs.find((run) => run.id === options.taskRunId);
    if (!previous) throw new Error(`TaskRun not found: ${options.taskRunId}.`);
    if (!["blocked", "failed"].includes(previous.status)) throw new Error(`TaskRun ${previous.id} is not retryable from status ${previous.status}.`);
    const taskId = normalizeKnownTaskId(changeStatus.acMap?.tasks ?? [], previous.taskId);
    assertNoActiveTaskRun(runs, taskId);
    return createTaskRunWithLease(runtime, {
      projectId: runtime.projectId,
      changeId,
      taskId,
      roleId: options.roleId ?? previous.roleId,
      attempt: nextAttempt(runs, taskId),
    });
  } finally {
    await runtimeLock.release();
  }
}

export async function resumeInterruptedTaskRun(project: ManagedProject, options: { changeId: string; taskRunId: string }): Promise<TaskRunStartResult> {
  const memory = await requireProjectExecutionRuntimePort(project);
  const runtimeLock = await acquireWorkbenchRuntimeMutationLock(memory, "恢复 Workflow 模型任务");
  try {
  await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const runs = await listTaskRuns(memory, options.changeId);
  const taskRun = runs.find((run) => run.id === options.taskRunId);
  if (!taskRun) throw new Error(`TaskRun not found: ${options.taskRunId}.`);
  if (taskRun.status !== "interrupted") throw new Error(`TaskRun ${taskRun.id} is not resumable from status ${taskRun.status}.`);
  assertNoActiveTaskRun(runs, taskRun.taskId);
  return await reclaimTaskRunWithLease(memory, taskRun);
  } finally {
    await runtimeLock.release();
  }
}

export async function resumeInterruptedTaskRunFromRuntime(
  runtime: ProjectExecutionRuntimePort,
  changeStatus: ChangeStatus,
  options: { changeId: string; taskRunId: string },
): Promise<TaskRunStartResult> {
  const runtimeLock = await acquireWorkbenchRuntimeMutationLock(runtime, "恢复 Workflow 模型任务");
  try {
    const changeId = requireAcceptedChange(changeStatus, options.changeId);
    const runs = await listTaskRuns(runtime, changeId);
    const taskRun = runs.find((run) => run.id === options.taskRunId);
    if (!taskRun) throw new Error(`TaskRun not found: ${options.taskRunId}.`);
    if (taskRun.status !== "interrupted") throw new Error(`TaskRun ${taskRun.id} is not resumable from status ${taskRun.status}.`);
    assertNoActiveTaskRun(runs, taskRun.taskId);
    return reclaimTaskRunWithLease(runtime, taskRun);
  } finally {
    await runtimeLock.release();
  }
}

function requireAcceptedChange(status: ChangeStatus, requested: string): string {
  const changeId = status.change?.id;
  if (!changeId || changeId !== requested || status.acMap?.changeId !== requested) {
    throw new Error(`TaskRun target is not the current accepted Change: ${requested}.`);
  }
  return changeId;
}
