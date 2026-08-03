import { shortHash } from "../fs/path.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { TaskRun, WorkerLease } from "../types/index.js";
import type { TaskRunStartResult } from "./types.js";
import { listWorkerLeases, writeTaskRun, writeWorkerLease } from "./repository.js";

export async function createTaskRunWithLease(memory: ProjectRunsPathPort, input: { projectId: string | null; changeId: string; taskId: string; roleId: string; attempt: number }): Promise<TaskRunStartResult> {
  const now = new Date().toISOString();
  const taskRunId = `taskrun-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${input.taskId.toLowerCase()}-${shortHash(`${input.changeId}:${input.taskId}:${input.attempt}:${now}`)}`;
  const leaseId = `lease-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(taskRunId)}`;
  const taskRun: TaskRun = {
    version: "1.0",
    id: taskRunId,
    projectId: input.projectId,
    changeId: input.changeId,
    taskId: input.taskId,
    roleId: input.roleId,
    attempt: input.attempt,
    status: "claimed",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    leaseId,
  };
  const lease: WorkerLease = {
    version: "1.0",
    id: leaseId,
    projectId: input.projectId,
    changeId: input.changeId,
    taskRunId,
    taskId: input.taskId,
    roleId: input.roleId,
    workerId: localWorkerId(),
    status: "claimed",
    claimedAt: now,
    updatedAt: now,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
  await writeTaskRun(memory, taskRun);
  await writeWorkerLease(memory, lease);
  return { taskRun, lease };
}

export async function reclaimTaskRunWithLease(memory: ProjectRunsPathPort, taskRun: TaskRun): Promise<TaskRunStartResult> {
  if (taskRun.status !== "interrupted") {
    throw new Error(`TaskRun ${taskRun.id} cannot resume from status ${taskRun.status}.`);
  }
  const now = new Date().toISOString();
  const leaseId = `lease-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${taskRun.id}:resume:${now}`)}`;
  const resumed: TaskRun = {
    ...taskRun,
    status: "claimed",
    leaseId,
    updatedAt: now,
    finishedAt: null,
    failureReason: undefined,
    blockedReason: undefined,
  };
  const lease: WorkerLease = {
    version: "1.0",
    id: leaseId,
    projectId: taskRun.projectId,
    changeId: taskRun.changeId,
    taskRunId: taskRun.id,
    taskId: taskRun.taskId,
    roleId: taskRun.roleId,
    workerId: localWorkerId(),
    status: "claimed",
    claimedAt: now,
    updatedAt: now,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
  await writeTaskRun(memory, resumed);
  await writeWorkerLease(memory, lease);
  return { taskRun: resumed, lease };
}

export async function releaseTaskRunLease(memory: ProjectRunsPathPort, taskRun: TaskRun, timestamp: string): Promise<void> {
  const leases = await listWorkerLeases(memory, taskRun.changeId);
  const lease = leases.find((item) => item.id === taskRun.leaseId);
  if (lease && lease.status === "claimed") {
    await writeWorkerLease(memory, {
      ...lease,
      status: "released",
      releasedAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

function localWorkerId(): string {
  return `local-${process.pid}`;
}
