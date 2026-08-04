import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { listRuns } from "../run/manager.js";
import { listAuditResults } from "../audit/artifacts.js";
import { listValidationResults } from "../validation/artifacts.js";
import type { ManagedProject, RunMetadata, TaskRun, WorkerLease } from "../types/index.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import { isActiveTaskRunStatus } from "./guards.js";
import { releaseTaskRunLease } from "./lease-service.js";
import { listTaskRuns, listWorkerLeases, writeTaskRun } from "./repository.js";
import type { TaskRunReconcileOptions } from "./types.js";

export async function reconcileTaskRuns(project: ManagedProject, options: TaskRunReconcileOptions): Promise<{ taskRuns: TaskRun[]; workerLeases: WorkerLease[] }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "TaskRun reconcile");
  return reconcileTaskRunsFromRuntime(memory, options);
}

export async function reconcileTaskRunsFromRuntime(
  memory: ProjectRunsPathPort,
  options: TaskRunReconcileOptions,
): Promise<{ taskRuns: TaskRun[]; workerLeases: WorkerLease[] }> {
  const existing = await listTaskRuns(memory, options.changeId);
  const runs = await listRuns(memory);
  const validations = await listValidationResults(memory, options.changeId);
  const audits = await listAuditResults(memory, options.changeId);
  const reconciled: TaskRun[] = [];
  for (const taskRun of existing) {
    if (options.taskRunId && taskRun.id !== options.taskRunId) continue;
    const coderRun = runs
      .filter((run) => run.taskRunId === taskRun.id && run.changeId === options.changeId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
    if (!coderRun) {
      reconciled.push(taskRun);
      continue;
    }
    let next = reconcileTaskRunFromCoderRun(taskRun, coderRun);
    if (coderRun.worktree?.worktreeId && coderRun.status === "completed") {
      const audit = audits.find((item) => item.worktreeId === coderRun.worktree?.worktreeId);
      const validation = validations.find((item) => item.worktreeId === coderRun.worktree?.worktreeId);
      if (audit) {
        next = {
          ...next,
          status: audit.status === "approved" || audit.status === "approved-with-notes" ? "completed" : "blocked",
          blockedReason: audit.status === "approved" || audit.status === "approved-with-notes" ? undefined : `Audit ${audit.status}.`,
          finishedAt: audit.finishedAt,
        };
      } else if (validation) {
        next = {
          ...next,
          status: validation.status === "passed" ? "evidence-ready" : "blocked",
          blockedReason: validation.status === "passed" ? undefined : "Validation failed.",
          finishedAt: validation.status === "passed" ? next.finishedAt : validation.finishedAt,
        };
      }
    }
    const updatedAt = new Date().toISOString();
    const written = await writeTaskRun(memory, { ...next, updatedAt });
    if (!isActiveTaskRunStatus(written.status)) {
      await releaseTaskRunLease(memory, written, updatedAt);
    }
    reconciled.push(written);
  }
  return { taskRuns: reconciled, workerLeases: await listWorkerLeases(memory, options.changeId) };
}

function reconcileTaskRunFromCoderRun(taskRun: TaskRun, run: RunMetadata): TaskRun {
  if (run.status === "running" || run.status === "created") {
    return {
      ...taskRun,
      status: "running",
      runId: run.id,
      worktreeId: run.worktree?.worktreeId,
      startedAt: taskRun.startedAt ?? run.startedAt,
      finishedAt: null,
    };
  }
  if (run.status === "failed") {
    return {
      ...taskRun,
      status: "failed",
      runId: run.id,
      worktreeId: run.worktree?.worktreeId,
      startedAt: taskRun.startedAt ?? run.startedAt,
      finishedAt: run.finishedAt ?? new Date().toISOString(),
      failureReason: "Coder run failed before validation.",
    };
  }
  if (run.status === "interrupted") {
    return {
      ...taskRun,
      status: "interrupted",
      runId: run.id,
      worktreeId: run.worktree?.worktreeId,
      startedAt: taskRun.startedAt ?? run.startedAt,
      finishedAt: run.finishedAt ?? new Date().toISOString(),
      failureReason: undefined,
    };
  }
  return {
    ...taskRun,
    status: "evidence-ready",
    runId: run.id,
    worktreeId: run.worktree?.worktreeId,
    startedAt: taskRun.startedAt ?? run.startedAt,
    finishedAt: run.finishedAt ?? taskRun.finishedAt,
  };
}
