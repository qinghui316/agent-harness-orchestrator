import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { listRuns } from "../run/manager.js";
import { listAuditResults } from "../audit/artifacts.js";
import { listValidationResults } from "../validation/artifacts.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, TaskRun, TaskRunStatus, WorkerLease } from "../types/index.js";

const taskRunStatusSchema = z.enum(["queued", "claimed", "running", "evidence-ready", "blocked", "failed", "completed"]);
const workerLeaseStatusSchema = z.enum(["claimed", "released", "expired", "lost"]);

const taskRunSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  taskId: z.string(),
  roleId: z.string(),
  attempt: z.number(),
  status: taskRunStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  runId: z.string().optional(),
  worktreeId: z.string().optional(),
  leaseId: z.string().optional(),
  blockedReason: z.string().optional(),
  failureReason: z.string().optional(),
});

const workerLeaseSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  taskRunId: z.string(),
  taskId: z.string(),
  roleId: z.string(),
  workerId: z.string(),
  status: workerLeaseStatusSchema,
  claimedAt: z.string(),
  updatedAt: z.string(),
  releasedAt: z.string().nullable(),
  expiresAt: z.string(),
});

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

export async function listTaskRuns(memory: ResolvedMemory, changeId: string): Promise<TaskRun[]> {
  const dir = taskRunDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const runs = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(dir, entry.name), taskRunSchema)));
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listWorkerLeases(memory: ResolvedMemory, changeId: string): Promise<WorkerLease[]> {
  const dir = workerLeaseDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const leases = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(dir, entry.name), workerLeaseSchema)));
  return leases.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt));
}

export async function reconcileTaskRuns(project: ManagedProject, options: TaskRunReconcileOptions): Promise<{ taskRuns: TaskRun[]; workerLeases: WorkerLease[] }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "TaskRun reconcile");
  const existing = await listTaskRuns(memory, options.changeId);
  const runs = await listRuns(memory);
  const validations = await listValidationResults(memory, options.changeId);
  const audits = await listAuditResults(memory, options.changeId);
  const reconciled: TaskRun[] = [];
  for (const taskRun of existing) {
    if (options.taskRunId && taskRun.id !== options.taskRunId) continue;
    const coderRun = runs.find((run) => run.taskRunId === taskRun.id);
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

export async function markTaskRunRunning(memory: ResolvedMemory, taskRunId: string, run: RunMetadata): Promise<TaskRun> {
  const taskRun = await readTaskRun(memory, run.changeId, taskRunId);
  return writeTaskRun(memory, {
    ...taskRun,
    status: "running",
    runId: run.id,
    worktreeId: run.worktree?.worktreeId,
    startedAt: taskRun.startedAt ?? run.startedAt,
    updatedAt: new Date().toISOString(),
  });
}

export async function markTaskRunStarted(memory: ResolvedMemory, taskRunId: string): Promise<TaskRun> {
  const taskRun = await findTaskRun(memory, taskRunId);
  if (!taskRun) throw new Error(`TaskRun not found: ${taskRunId}.`);
  const now = new Date().toISOString();
  return writeTaskRun(memory, {
    ...taskRun,
    status: "running",
    startedAt: taskRun.startedAt ?? now,
    updatedAt: now,
  });
}

export async function finishTaskRunFromWorkflowResult(memory: ResolvedMemory, taskRunId: string, result: unknown): Promise<TaskRun> {
  const taskRun = await findTaskRun(memory, taskRunId);
  if (!taskRun) throw new Error(`TaskRun not found: ${taskRunId}.`);
  const outcome = classifyWorkflowResult(result);
  const linked = extractWorkflowRunLink(result);
  const next: TaskRun = {
    ...taskRun,
    status: outcome.status,
    runId: linked.runId ?? taskRun.runId,
    worktreeId: linked.worktreeId ?? taskRun.worktreeId,
    blockedReason: outcome.blockedReason,
    failureReason: outcome.failureReason,
    updatedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
  const written = await writeTaskRun(memory, next);
  await releaseTaskRunLease(memory, written, written.finishedAt ?? new Date().toISOString());
  return written;
}

function extractWorkflowRunLink(result: unknown): { runId?: string; worktreeId?: string } {
  const workflow = isRecord(result) && isRecord(result.workflow) ? result.workflow : result;
  const codeRun = isRecord(workflow) && isRecord(workflow.code) && isRecord(workflow.code.run) ? workflow.code.run : null;
  return {
    runId: isRecord(codeRun) && typeof codeRun.id === "string" ? codeRun.id : undefined,
    worktreeId: isRecord(codeRun) && isRecord(codeRun.worktree) && typeof codeRun.worktree.worktreeId === "string" ? codeRun.worktree.worktreeId : undefined,
  };
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
  return {
    ...taskRun,
    status: "evidence-ready",
    runId: run.id,
    worktreeId: run.worktree?.worktreeId,
    startedAt: taskRun.startedAt ?? run.startedAt,
    finishedAt: run.finishedAt ?? taskRun.finishedAt,
  };
}

export function isActiveTaskRunStatus(status: TaskRunStatus): boolean {
  return status === "queued" || status === "claimed" || status === "running";
}

async function releaseTaskRunLease(memory: ResolvedMemory, taskRun: TaskRun, timestamp: string): Promise<void> {
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

function classifyWorkflowResult(result: unknown): { status: TaskRunStatus; blockedReason?: string; failureReason?: string } {
  if (!isRecord(result)) return { status: "failed", failureReason: "Task workflow did not return a structured result." };
  const stoppedAt = typeof result.stoppedAt === "string" ? result.stoppedAt : null;
  const codeStatus = isRecord(result.code) && isRecord(result.code.run) && typeof result.code.run.status === "string" ? result.code.run.status : null;
  const validationStatus = isRecord(result.validation) && isRecord(result.validation.validation) && typeof result.validation.validation.status === "string" ? result.validation.validation.status : null;
  const auditStatus = isRecord(result.audit) && isRecord(result.audit.audit) && typeof result.audit.audit.status === "string" ? result.audit.audit.status : null;
  if (stoppedAt === null && (auditStatus === "approved" || auditStatus === "approved-with-notes")) return { status: "completed" };
  if (stoppedAt === "validation" || validationStatus === "failed") return { status: "blocked", blockedReason: "Validation failed." };
  if (stoppedAt === "audit" || auditStatus === "blocked" || auditStatus === "failed") return { status: "blocked", blockedReason: auditStatus ? `Audit ${auditStatus}.` : "Audit did not approve the task run." };
  if (stoppedAt === "code" || codeStatus === "failed") return { status: "failed", failureReason: "Coder run failed before validation." };
  return { status: "evidence-ready" };
}

async function createTaskRunWithLease(memory: ResolvedMemory, input: { projectId: string | null; changeId: string; taskId: string; roleId: string; attempt: number }): Promise<TaskRunStartResult> {
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

async function readTaskRun(memory: ResolvedMemory, changeId: string, taskRunId: string): Promise<TaskRun> {
  return readRequiredJsonFile(taskRunPath(memory, changeId, taskRunId), taskRunSchema);
}

async function findTaskRun(memory: ResolvedMemory, taskRunId: string): Promise<TaskRun | null> {
  const root = join(memory.runsRoot, "task-runs");
  if (!existsSync(root)) return null;
  const changes = await readdir(root, { withFileTypes: true });
  for (const change of changes) {
    if (!change.isDirectory()) continue;
    const path = taskRunPath(memory, change.name, taskRunId);
    if (existsSync(path)) return readRequiredJsonFile(path, taskRunSchema);
  }
  return null;
}

async function writeTaskRun(memory: ResolvedMemory, taskRun: TaskRun): Promise<TaskRun> {
  await writeJsonFile(taskRunPath(memory, taskRun.changeId, taskRun.id), taskRun);
  return taskRun;
}

async function writeWorkerLease(memory: ResolvedMemory, lease: WorkerLease): Promise<WorkerLease> {
  await writeJsonFile(workerLeasePath(memory, lease.changeId, lease.id), lease);
  return lease;
}

function assertNoActiveTaskRun(runs: TaskRun[], taskId: string): void {
  const active = runs.find((run) => run.taskId === taskId && isActiveTaskRunStatus(run.status));
  if (active) throw new Error(`Task ${taskId} already has an active TaskRun: ${active.id}.`);
}

function nextAttempt(runs: TaskRun[], taskId: string): number {
  return Math.max(0, ...runs.filter((run) => run.taskId === taskId).map((run) => run.attempt)) + 1;
}

function normalizeKnownTaskId(tasks: Array<{ id: string }>, input: string): string {
  const requested = input.trim().toUpperCase();
  const known = new Set(tasks.map((task) => task.id.toUpperCase()));
  if (!known.has(requested)) throw new Error(`Unknown task id: ${input}.`);
  return requested;
}

function taskRunDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "task-runs", changeId);
}

function taskRunPath(memory: ResolvedMemory, changeId: string, taskRunId: string): string {
  return join(taskRunDir(memory, changeId), `${taskRunId}.json`);
}

function workerLeaseDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "worker-leases", changeId);
}

function workerLeasePath(memory: ResolvedMemory, changeId: string, leaseId: string): string {
  return join(workerLeaseDir(memory, changeId), `${leaseId}.json`);
}

function localWorkerId(): string {
  return `local-${process.pid}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
