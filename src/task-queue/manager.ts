import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { listAuditResults } from "../audit/artifacts.js";
import { listValidationResults } from "../validation/artifacts.js";
import { listRuns } from "../run/manager.js";
import { isActiveTaskRunStatus, listTaskRuns, listWorkerLeases } from "../task-run/manager.js";
import {
  appendWorkflowTaskEvent,
  assertWorkflowResumeAllowed,
  bindWorkflowRunToQueue,
  readWorkflowRun,
  syncWorkflowRunFromQueue,
  validateTaskQueueProposalStart,
} from "../workflow-run/manager.js";
import type {
  ManagedProject,
  ResolvedMemory,
  TaskQueueItem,
  TaskQueueItemStatus,
  TaskQueueRun,
  TaskQueueRunStatus,
  TaskRun,
} from "../types/index.js";

const taskQueueRunStatusSchema = z.enum(["queued", "running", "paused", "blocked", "failed", "completed"]);
const taskQueueItemStatusSchema = z.enum(["queued", "running", "blocked", "failed", "completed", "skipped"]);

const taskQueueRunSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  status: taskQueueRunStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  currentTaskId: z.string().optional(),
  workflowRunId: z.string().optional(),
  taskQueueProposalId: z.string().optional(),
  workflowGraphPlanId: z.string().optional(),
  decompositionPlanId: z.string().optional(),
  readinessManifestId: z.string().optional(),
  totalCount: z.number(),
  completedCount: z.number(),
  blockedReason: z.string().optional(),
  failureReason: z.string().optional(),
  pausedReason: z.string().optional(),
});

const taskQueueItemSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  queueRunId: z.string(),
  taskId: z.string(),
  order: z.number(),
  status: taskQueueItemStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  taskRunId: z.string().optional(),
  workflowRunId: z.string().optional(),
  taskQueueProposalId: z.string().optional(),
  workflowGraphPlanId: z.string().optional(),
  decompositionPlanId: z.string().optional(),
  readinessManifestId: z.string().optional(),
  blockedReason: z.string().optional(),
  failureReason: z.string().optional(),
});

export interface TaskQueueStartOptions {
  changeId: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  workflowRunId?: string;
  queueRunId?: string;
}

export interface TaskQueueReconcileOptions {
  changeId: string;
  queueRunId?: string;
}

export interface TaskQueueStartResult {
  queue: TaskQueueRun;
  items: TaskQueueItem[];
  resumed: boolean;
}

export async function startOrResumeTaskQueue(project: ManagedProject, options: TaskQueueStartOptions): Promise<TaskQueueStartResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "TaskQueue start");
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId, allowLegacyActiveFallback: false });
  const changeStatus = target.status;

  const existingQueues = await listTaskQueues(memory, options.changeId);
  const activeQueue = existingQueues.find((queue) => isActiveQueueStatus(queue.status));
  if (activeQueue && activeQueue.status !== "paused") throw new Error(`Task queue already active: ${activeQueue.id}.`);
  if (activeQueue?.status === "paused") {
    if (!options.queueRunId || activeQueue.id !== options.queueRunId) throw new Error("TaskQueue resume requires the paused queueRunId.");
    if (!options.workflowRunId) throw new Error("TaskQueue resume requires workflowRunId.");
    let workflow;
    try {
      workflow = await assertWorkflowResumeAllowed(memory, project, options.workflowRunId, activeQueue);
    } catch (error) {
      const now = new Date().toISOString();
      await writeTaskQueueRun(memory, {
        ...activeQueue,
        status: "blocked",
        blockedReason: error instanceof Error ? error.message : "TaskQueue resume guardrail failed.",
        updatedAt: now,
        finishedAt: now,
      });
      throw error;
    }
    const now = new Date().toISOString();
    const queue = await writeTaskQueueRun(memory, {
      ...activeQueue,
      status: "running",
      updatedAt: now,
      startedAt: activeQueue.startedAt ?? now,
      finishedAt: null,
      pausedReason: undefined,
      blockedReason: undefined,
      failureReason: undefined,
    });
    const items = await listTaskQueueItems(memory, options.changeId, queue.id);
    await syncWorkflowRunFromQueue(memory, workflow, queue, items, "workflow.started");
    return { queue, items, resumed: true };
  }
  if (!options.taskQueueProposalId) throw new Error("TaskQueue start requires a confirmed TaskQueueProposal.");
  if (!options.workflowGraphPlanId) throw new Error("TaskQueue start requires workflowGraphPlanId.");
  if (!options.workflowRunId) throw new Error("TaskQueue start requires workflowRunId.");
  const validated = await validateTaskQueueProposalStart(memory, project, options.changeId, options.taskQueueProposalId, options.workflowGraphPlanId);
  const workflow = await readWorkflowRun(memory, options.changeId, options.workflowRunId).catch(() => null);
  if (
    !workflow
    || workflow.status !== "created"
    || workflow.changeId !== options.changeId
    || workflow.taskQueueProposalId !== validated.proposal.id
    || workflow.workflowGraphPlanId !== validated.graph.id
    || workflow.decompositionPlanId !== validated.proposal.decompositionPlanId
    || workflow.readinessManifestId !== validated.proposal.readinessManifestId
    || workflow.queueRunId
    || !sameRecoveryKeyExceptCreatedAt(workflow.recoveryKey, validated.recoveryKey)
  ) {
    throw new Error("TaskQueue start requires a matching unstarted WorkflowRun.");
  }
  if (options.decompositionPlanId && options.decompositionPlanId !== validated.proposal.decompositionPlanId) throw new Error("TaskQueue start decompositionPlanId is stale.");
  if (options.readinessManifestId && options.readinessManifestId !== validated.proposal.readinessManifestId) throw new Error("TaskQueue start readinessManifestId is stale.");

  const tasks = changeStatus.acMap?.tasks ?? [];
  if (tasks.length === 0) throw new Error("Task queue requires accepted tasks.");
  const knownTasks = new Set(tasks.map((task) => task.id.toUpperCase()));
  const proposalTasks = validated.proposal.items.map((item) => item.taskId.toUpperCase());
  const unknown = proposalTasks.filter((taskId) => !knownTasks.has(taskId));
  if (unknown.length > 0) throw new Error(`TaskQueueProposal references unknown task id(s): ${Array.from(new Set(unknown)).join(", ")}.`);
  const taskRuns = await listTaskRuns(memory, options.changeId);
  const activeTask = taskRuns.find((run) => isActiveTaskRunStatus(run.status));
  if (activeTask) throw new Error(`Cannot start task queue while TaskRun ${activeTask.id} is active.`);

  const now = new Date().toISOString();
  const queueId = `queue-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${options.changeId}:${now}`)}`;
  const doneTasks = new Set(tasks.filter((task) => task.done).map((task) => task.id.toUpperCase()));
  const items: TaskQueueItem[] = validated.proposal.items.slice().sort((a, b) => a.order - b.order).map((task, index) => ({
    version: "1.0",
    id: `${queueId}-item-${String(index + 1).padStart(3, "0")}`,
    projectId: project.id,
    changeId: options.changeId,
    queueRunId: queueId,
    taskId: task.taskId.toUpperCase(),
    order: index + 1,
    status: doneTasks.has(task.taskId.toUpperCase()) ? "skipped" : "queued",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: doneTasks.has(task.taskId.toUpperCase()) ? now : null,
    workflowRunId: options.workflowRunId,
    taskQueueProposalId: validated.proposal.id,
    workflowGraphPlanId: validated.graph.id,
    decompositionPlanId: validated.proposal.decompositionPlanId,
    readinessManifestId: validated.proposal.readinessManifestId,
  }));
  if (!items.some((item) => item.status === "queued")) throw new Error("Task queue has no runnable tasks.");
  const queue: TaskQueueRun = {
    version: "1.0",
    id: queueId,
    projectId: project.id,
    changeId: options.changeId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    workflowRunId: options.workflowRunId,
    taskQueueProposalId: validated.proposal.id,
    workflowGraphPlanId: validated.graph.id,
    decompositionPlanId: validated.proposal.decompositionPlanId,
    readinessManifestId: validated.proposal.readinessManifestId,
    totalCount: items.filter((item) => item.status !== "skipped").length,
    completedCount: 0,
  };
  await writeTaskQueueRun(memory, queue);
  await Promise.all(items.map((item) => writeTaskQueueItem(memory, item)));
  await bindWorkflowRunToQueue(memory, workflow, queue, items);
  return { queue, items, resumed: false };
}

export async function listTaskQueues(memory: ResolvedMemory, changeId: string): Promise<TaskQueueRun[]> {
  const dir = taskQueueDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const queues = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(dir, entry.name), taskQueueRunSchema)));
  return queues.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listTaskQueueItems(memory: ResolvedMemory, changeId: string, queueRunId?: string): Promise<TaskQueueItem[]> {
  const dir = taskQueueItemDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const items = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(dir, entry.name), taskQueueItemSchema)));
  return items
    .filter((item) => !queueRunId || item.queueRunId === queueRunId)
    .sort((a, b) => a.order - b.order);
}

export async function getLatestTaskQueue(memory: ResolvedMemory, changeId: string): Promise<{ queue: TaskQueueRun; items: TaskQueueItem[] } | null> {
  const queue = (await listTaskQueues(memory, changeId))[0];
  if (!queue) return null;
  return { queue, items: await listTaskQueueItems(memory, changeId, queue.id) };
}

export async function getNextQueuedTaskQueueItem(memory: ResolvedMemory, queue: TaskQueueRun): Promise<TaskQueueItem | null> {
  const items = await listTaskQueueItems(memory, queue.changeId, queue.id);
  if (items.some((item) => item.status === "running")) return null;
  return items.find((item) => item.status === "queued") ?? null;
}

export async function markTaskQueueRunning(memory: ResolvedMemory, queue: TaskQueueRun, currentTaskId?: string): Promise<TaskQueueRun> {
  const now = new Date().toISOString();
  return writeTaskQueueRun(memory, {
    ...queue,
    status: "running",
    currentTaskId,
    startedAt: queue.startedAt ?? now,
    finishedAt: null,
    updatedAt: now,
    pausedReason: undefined,
  });
}

export async function markTaskQueueItemRunning(memory: ResolvedMemory, item: TaskQueueItem, taskRun: TaskRun): Promise<TaskQueueItem> {
  const now = new Date().toISOString();
  const written = await writeTaskQueueItem(memory, {
    ...item,
    status: "running",
    taskRunId: taskRun.id,
    startedAt: item.startedAt ?? now,
    updatedAt: now,
    finishedAt: null,
    blockedReason: undefined,
    failureReason: undefined,
  });
  await appendWorkflowTaskEvent(memory, item.workflowRunId, item.changeId, "task.started", { queueRunId: item.queueRunId, taskId: item.taskId, taskRunId: taskRun.id, status: written.status });
  return written;
}

export async function finishTaskQueueItem(memory: ResolvedMemory, item: TaskQueueItem, taskRun: TaskRun): Promise<TaskQueueItem> {
  const now = new Date().toISOString();
  const status = itemStatusFromTaskRun(taskRun.status);
  const written = await writeTaskQueueItem(memory, {
    ...item,
    status,
    taskRunId: taskRun.id,
    updatedAt: now,
    finishedAt: now,
    blockedReason: status === "blocked" ? taskRun.blockedReason ?? "TaskRun blocked." : undefined,
    failureReason: status === "failed" ? taskRun.failureReason ?? "TaskRun failed." : undefined,
  });
  await appendWorkflowTaskEvent(memory, item.workflowRunId, item.changeId, status === "completed" ? "task.completed" : status === "blocked" ? "task.blocked" : "task.failed", { queueRunId: item.queueRunId, taskId: item.taskId, taskRunId: taskRun.id, status, reason: written.blockedReason ?? written.failureReason });
  return written;
}

export async function updateTaskQueueAfterItem(memory: ResolvedMemory, queue: TaskQueueRun): Promise<TaskQueueRun> {
  const items = await listTaskQueueItems(memory, queue.changeId, queue.id);
  const completedCount = items.filter((item) => item.status === "completed").length;
  const failed = items.find((item) => item.status === "failed");
  const blocked = items.find((item) => item.status === "blocked");
  const running = items.find((item) => item.status === "running");
  const next = items.find((item) => item.status === "queued");
  const now = new Date().toISOString();
  if (failed) {
    return writeTaskQueueRun(memory, {
      ...queue,
      status: "failed",
      currentTaskId: failed.taskId,
      completedCount,
      failureReason: readableItemStopReason(failed),
      updatedAt: now,
      finishedAt: now,
    });
  }
  if (blocked) {
    return writeTaskQueueRun(memory, {
      ...queue,
      status: "blocked",
      currentTaskId: blocked.taskId,
      completedCount,
      blockedReason: readableItemStopReason(blocked),
      updatedAt: now,
      finishedAt: now,
    });
  }
  if (running) {
    return writeTaskQueueRun(memory, {
      ...queue,
      status: "running",
      currentTaskId: running.taskId,
      completedCount,
      updatedAt: now,
      finishedAt: null,
    });
  }
  if (!next) {
    return writeTaskQueueRun(memory, {
      ...queue,
      status: "completed",
      currentTaskId: undefined,
      completedCount,
      updatedAt: now,
      finishedAt: now,
    });
  }
  return writeTaskQueueRun(memory, {
    ...queue,
    status: "running",
    currentTaskId: next.taskId,
    completedCount,
    updatedAt: now,
  });
}

export async function pauseTaskQueue(memory: ResolvedMemory, queue: TaskQueueRun, reason: string): Promise<TaskQueueRun> {
  const now = new Date().toISOString();
  const items = await listTaskQueueItems(memory, queue.changeId, queue.id);
  const written = await writeTaskQueueRun(memory, {
    ...queue,
    status: "paused",
    completedCount: items.filter((item) => item.status === "completed").length,
    pausedReason: reason,
    updatedAt: now,
    finishedAt: null,
  });
  if (queue.workflowRunId) {
    const workflow = await readWorkflowRun(memory, queue.changeId, queue.workflowRunId).catch(() => null);
    if (workflow) await syncWorkflowRunFromQueue(memory, workflow, written, items, "workflow.paused", reason);
  }
  return written;
}

export async function failQueuedTaskItem(memory: ResolvedMemory, item: TaskQueueItem, reason: string): Promise<TaskQueueItem> {
  const now = new Date().toISOString();
  const written = await writeTaskQueueItem(memory, {
    ...item,
    status: "failed",
    failureReason: reason,
    updatedAt: now,
    finishedAt: now,
  });
  await appendWorkflowTaskEvent(memory, item.workflowRunId, item.changeId, "task.failed", { queueRunId: item.queueRunId, taskId: item.taskId, status: "failed", reason });
  return written;
}

export async function reconcileTaskQueues(project: ManagedProject, options: TaskQueueReconcileOptions): Promise<{ queues: TaskQueueRun[]; items: TaskQueueItem[] }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "TaskQueue reconcile");
  const queues = await listTaskQueues(memory, options.changeId);
  const taskRuns = await listTaskRuns(memory, options.changeId);
  await listWorkerLeases(memory, options.changeId);
  await listRuns(memory);
  await listValidationResults(memory, options.changeId);
  await listAuditResults(memory, options.changeId);
  const reconciledQueues: TaskQueueRun[] = [];
  const reconciledItems: TaskQueueItem[] = [];
  for (const queue of queues) {
    if (options.queueRunId && queue.id !== options.queueRunId) continue;
    const items = await listTaskQueueItems(memory, options.changeId, queue.id);
    const nextItems: TaskQueueItem[] = [];
    for (const item of items) {
      const taskRun = item.taskRunId ? taskRuns.find((run) => run.id === item.taskRunId) : undefined;
      if (taskRun && item.status === "running" && !isActiveTaskRunStatus(taskRun.status)) {
        nextItems.push(await finishTaskQueueItem(memory, item, taskRun));
      } else {
        nextItems.push(item);
      }
    }
    const latestQueue = await readTaskQueueRun(memory, queue.changeId, queue.id);
    let nextQueue = await updateTaskQueueAfterItem(memory, latestQueue);
    if (nextQueue.status === "running" && !nextItems.some((item) => item.status === "running")) {
      nextQueue = await pauseTaskQueue(memory, nextQueue, "队列已暂停，等待继续。");
    }
    const currentItems = await listTaskQueueItems(memory, options.changeId, queue.id);
    if (nextQueue.workflowRunId) {
      const workflow = await readWorkflowRun(memory, nextQueue.changeId, nextQueue.workflowRunId).catch(() => null);
      if (workflow) await syncWorkflowRunFromQueue(memory, workflow, nextQueue, currentItems, "workflow.reconciled");
    }
    reconciledQueues.push(nextQueue);
    reconciledItems.push(...currentItems);
  }
  return { queues: reconciledQueues, items: reconciledItems };
}

export function isActiveQueueStatus(status: TaskQueueRunStatus): boolean {
  return status === "queued" || status === "running" || status === "paused";
}

export function isQueueTerminalStatus(status: TaskQueueRunStatus): boolean {
  return status === "blocked" || status === "failed" || status === "completed";
}

function itemStatusFromTaskRun(status: TaskRun["status"]): TaskQueueItemStatus {
  if (status === "completed" || status === "evidence-ready") return "completed";
  if (status === "blocked") return "blocked";
  if (status === "failed") return "failed";
  return "running";
}

function readableItemStopReason(item: TaskQueueItem): string {
  if (item.failureReason) return `${item.taskId}: ${item.failureReason}`;
  if (item.blockedReason) return `${item.taskId}: ${item.blockedReason}`;
  return `${item.taskId}: task did not complete.`;
}

function sameRecoveryKeyExceptCreatedAt(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const copy = { ...(value as Record<string, unknown>) };
    delete copy.createdAt;
    return copy;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

async function readTaskQueueRun(memory: ResolvedMemory, changeId: string, queueRunId: string): Promise<TaskQueueRun> {
  return readRequiredJsonFile(taskQueuePath(memory, changeId, queueRunId), taskQueueRunSchema);
}

async function writeTaskQueueRun(memory: ResolvedMemory, queue: TaskQueueRun): Promise<TaskQueueRun> {
  await writeJsonFile(taskQueuePath(memory, queue.changeId, queue.id), queue);
  return queue;
}

async function writeTaskQueueItem(memory: ResolvedMemory, item: TaskQueueItem): Promise<TaskQueueItem> {
  await writeJsonFile(taskQueueItemPath(memory, item.changeId, item.id), item);
  return item;
}

function taskQueueDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "task-queues", changeId);
}

function taskQueuePath(memory: ResolvedMemory, changeId: string, queueRunId: string): string {
  return join(taskQueueDir(memory, changeId), `${queueRunId}.json`);
}

function taskQueueItemDir(memory: ResolvedMemory, changeId: string): string {
  return join(memory.runsRoot, "task-queue-items", changeId);
}

function taskQueueItemPath(memory: ResolvedMemory, changeId: string, itemId: string): string {
  return join(taskQueueItemDir(memory, changeId), `${itemId}.json`);
}
