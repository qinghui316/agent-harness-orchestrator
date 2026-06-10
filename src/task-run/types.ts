import type { TaskRun, WorkerLease } from "../types/index.js";

export interface TaskRunStartResult {
  taskRun: TaskRun;
  lease: WorkerLease;
}

export interface TaskRunStartOptions {
  changeId: string;
  taskId: string;
  roleId?: string;
}

export interface TaskRunRetryOptions {
  changeId: string;
  taskRunId: string;
}

export interface TaskRunReconcileOptions {
  changeId: string;
  taskRunId?: string;
}

export interface TaskRunScopeOptions {
  changeId?: string;
  taskId?: string;
}

export interface WorkflowResultLink {
  runId?: string;
  worktreeId?: string;
  changeId?: string;
  taskRunId?: string;
  taskIds?: string[];
}
