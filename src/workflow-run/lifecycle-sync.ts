import { shortHash } from "../fs/path.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type {
  TaskQueueItem,
  TaskQueueRun,
  TaskQueueWorkflowRun,
  WorkflowGraphPlan,
  WorkflowGraphRecoveryKey,
  WorkflowRun,
  WorkflowRunEventType,
  WorkflowRunItem,
  WorkflowRunStatus,
} from "../types/index.js";
import { appendWorkflowRunEvent } from "./events.js";
import { assertWorkflowRunQueueScope } from "./guards.js";
import { updateWorkflowRun, writeWorkflowRun } from "./repository.js";

export function buildWorkflowRunForGraph(
  graph: WorkflowGraphPlan,
  recoveryKey: WorkflowGraphRecoveryKey,
  now = new Date().toISOString(),
): TaskQueueWorkflowRun {
  if (graph.graphMode !== "sequential-v1") throw new Error("Queue-backed WorkflowRun requires a sequential-v1 graph.");
  const workflowRunId = `workflow-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${graph.changeId}:${graph.id}:${now}`).slice(0, 8)}`;
  return {
    version: "1.0",
    id: workflowRunId,
    changeId: graph.changeId,
    status: "created",
    source: "workflow-graph",
    workflowGraphPlanId: graph.id,
    items: graph.nodes.slice().sort((a, b) => a.order - b.order).map((node) => ({ taskId: node.taskId, status: "queued", order: node.order, updatedAt: now })),
    recoveryKey,
    artifactRefs: unique([graph.artifact, graph.markdownArtifact, ...graph.artifactRefs]),
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  };
}

export async function persistWorkflowRunForGraph(
  memory: ProjectRunsPathPort,
  projectId: string,
  run: TaskQueueWorkflowRun,
): Promise<TaskQueueWorkflowRun> {
  await writeWorkflowRun(memory, run);
  await appendWorkflowRunEvent(memory, run, "workflow.created", {
    data: { projectId, workflowGraphPlanId: run.workflowGraphPlanId },
  });
  return run;
}

export async function bindWorkflowRunToQueue(
  memory: ProjectRunsPathPort,
  run: WorkflowRun,
  queue: TaskQueueRun,
  items: TaskQueueItem[],
): Promise<WorkflowRun> {
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

export async function syncWorkflowRunFromQueue(
  memory: ProjectRunsPathPort,
  run: WorkflowRun,
  queue: TaskQueueRun,
  items: TaskQueueItem[],
  eventType: WorkflowRunEventType = "workflow.reconciled",
  reason?: string,
): Promise<WorkflowRun> {
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
