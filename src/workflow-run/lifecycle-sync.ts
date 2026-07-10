import { shortHash } from "../fs/path.js";
import type { ManagedProject, ResolvedMemory, TaskQueueItem, TaskQueueRun, TaskQueueWorkflowRun, WorkflowRun, WorkflowRunEventType, WorkflowRunItem, WorkflowRunStatus } from "../types/index.js";
import { appendWorkflowRunEvent } from "./events.js";
import { assertWorkflowRunQueueScope } from "./guards.js";
import { readWorkflowRun, updateWorkflowRun, writeWorkflowRun } from "./repository.js";
import { recomputeWorkflowRecoveryKey, sameJson } from "./recovery-key.js";
import { buildWorkflowGraphRecoveryKey } from "./recovery-key.js";
import type { WorkflowGraphPlan } from "../types/index.js";

export async function createWorkflowRunForGraph(memory: ResolvedMemory, project: ManagedProject, changePath: string, graph: WorkflowGraphPlan): Promise<WorkflowRun> {
  if (graph.graphMode !== "sequential-v1") throw new Error("Queue-backed WorkflowRun requires a sequential-v1 graph.");
  const now = new Date().toISOString();
  const workflowRunId = `workflow-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${graph.changeId}:${graph.id}:${now}`).slice(0, 8)}`;
  const run: WorkflowRun = {
    version: "1.0",
    id: workflowRunId,
    changeId: graph.changeId,
    status: "created",
    source: "workflow-graph",
    workflowGraphPlanId: graph.id,
    items: graph.nodes.slice().sort((a, b) => a.order - b.order).map((node) => ({ taskId: node.taskId, status: "queued", order: node.order, updatedAt: now })),
    recoveryKey: await buildWorkflowGraphRecoveryKey(memory, project, changePath, graph),
    artifactRefs: unique([graph.artifact, graph.markdownArtifact, ...graph.artifactRefs]),
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  };
  await writeWorkflowRun(memory, run);
  await appendWorkflowRunEvent(memory, run, "workflow.created", { data: { projectId: project.id, workflowGraphPlanId: graph.id } });
  return run;
}

export async function assertWorkflowResumeAllowed(memory: ResolvedMemory, project: ManagedProject, workflowRunId: string, queue: TaskQueueRun): Promise<TaskQueueWorkflowRun> {
  const run = await readWorkflowRun(memory, queue.changeId, workflowRunId);
  assertWorkflowRunQueueScope(run, queue);
  if (run.status !== "paused") throw new Error("TaskQueue resume requires a paused WorkflowRun.");
  if (run.queueRunId !== queue.id) throw new Error("WorkflowRun is not bound to the requested queueRunId.");
  const current = await recomputeWorkflowRecoveryKey(memory, project, run);
  if (!sameJson(run.recoveryKey, current)) {
    const blocked = await updateWorkflowRun(memory, {
      ...run,
      status: "blocked",
      statusReason: "Workflow recovery key changed; refusing to continue.",
      updatedAt: new Date().toISOString(),
      finishedAt: null,
    });
    await appendWorkflowRunEvent(memory, blocked, "workflow.blocked", { queueRunId: queue.id, reason: blocked.statusReason });
    throw new Error(blocked.statusReason);
  }
  return run;
}

export async function bindWorkflowRunToQueue(memory: ResolvedMemory, run: WorkflowRun, queue: TaskQueueRun, items: TaskQueueItem[]): Promise<WorkflowRun> {
  assertWorkflowRunQueueScope(run, queue);
  const now = new Date().toISOString();
  const next = await updateWorkflowRun(memory, {
    ...run,
    status: "running",
    queueRunId: queue.id,
    currentTaskId: queue.currentTaskId,
    items: workflowItemsFromQueueItems(items),
    updatedAt: now,
    startedAt: run.startedAt ?? now,
  });
  await appendWorkflowRunEvent(memory, next, "workflow.started", { queueRunId: queue.id });
  await appendWorkflowRunEvent(memory, next, "queue.created", { queueRunId: queue.id, data: { totalCount: queue.totalCount } });
  return next;
}

export async function syncWorkflowRunFromQueue(memory: ResolvedMemory, run: WorkflowRun, queue: TaskQueueRun, items: TaskQueueItem[], eventType: WorkflowRunEventType = "workflow.reconciled", reason?: string): Promise<WorkflowRun> {
  assertWorkflowRunQueueScope(run, queue);
  const status = workflowStatusFromQueue(queue.status);
  const now = new Date().toISOString();
  const next = await updateWorkflowRun(memory, {
    ...run,
    status,
    queueRunId: queue.id,
    currentTaskId: queue.currentTaskId,
    items: workflowItemsFromQueueItems(items),
    statusReason: reason ?? queue.blockedReason ?? queue.failureReason ?? queue.pausedReason,
    updatedAt: now,
    startedAt: run.startedAt ?? queue.startedAt ?? now,
    finishedAt: ["blocked", "failed", "completed"].includes(status) ? now : null,
  });
  await appendWorkflowRunEvent(memory, next, eventType, { queueRunId: queue.id, status: next.status, reason: next.statusReason });
  return next;
}

function workflowItemsFromQueueItems(items: TaskQueueItem[]): WorkflowRunItem[] {
  return items.map((item) => ({
    taskId: item.taskId,
    status: item.status,
    taskRunId: item.taskRunId,
    order: item.order,
    updatedAt: item.updatedAt,
  }));
}

function workflowStatusFromQueue(status: TaskQueueRun["status"]): WorkflowRunStatus {
  if (status === "queued" || status === "running") return "running";
  return status;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
