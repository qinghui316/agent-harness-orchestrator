import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { RunMetadata, TaskRun } from "../types/index.js";
import { assertTaskRunMatchesScope } from "./guards.js";
import { readTaskRun, resolveTaskRun, writeTaskRun } from "./repository.js";
import type { TaskRunScopeOptions } from "./types.js";

export async function markTaskRunRunning(memory: ProjectRunsPathPort, taskRunId: string, run: RunMetadata): Promise<TaskRun> {
  const taskRun = await readTaskRun(memory, run.changeId, taskRunId);
  assertTaskRunMatchesScope(taskRun, { changeId: run.changeId, taskId: run.taskIds?.[0] }, "TaskRun running");
  return writeTaskRun(memory, {
    ...taskRun,
    status: "running",
    runId: run.id,
    worktreeId: run.worktree?.worktreeId,
    startedAt: taskRun.startedAt ?? run.startedAt,
    updatedAt: new Date().toISOString(),
  });
}

export async function markTaskRunStarted(memory: ProjectRunsPathPort, taskRunId: string, scope: TaskRunScopeOptions = {}): Promise<TaskRun> {
  const taskRun = await resolveTaskRun(memory, taskRunId, scope);
  assertTaskRunMatchesScope(taskRun, scope, "TaskRun start mark");
  const now = new Date().toISOString();
  return writeTaskRun(memory, {
    ...taskRun,
    status: "running",
    startedAt: taskRun.startedAt ?? now,
    updatedAt: now,
  });
}
