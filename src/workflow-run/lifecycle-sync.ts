import { shortHash } from "../fs/path.js";
import type { ManagedProject, ResolvedMemory, TaskQueueItem, TaskQueueRun, WorkflowRun, WorkflowRunEventType, WorkflowRunStatus } from "../types/index.js";
import { appendWorkflowRunEvent } from "./events.js";
import { assertWorkflowRunQueueScope } from "./guards.js";
import { readWorkflowRun, updateWorkflowRun, writeWorkflowRun } from "./repository.js";
import { recomputeWorkflowRecoveryKey, sameJson } from "./recovery-key.js";
import type { ValidatedTaskQueueProposal } from "./types.js";

export async function createWorkflowRunForTaskQueue(memory: ResolvedMemory, project: ManagedProject, validated: ValidatedTaskQueueProposal): Promise<WorkflowRun> {
  const now = new Date().toISOString();
  const workflowRunId = `workflow-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${validated.proposal.changeId}:${validated.proposal.id}:${now}`).slice(0, 8)}`;
  const run: WorkflowRun = {
    version: "1.0",
    id: workflowRunId,
    changeId: validated.proposal.changeId,
    status: "created",
    source: "taskqueue-proposal",
    taskQueueProposalId: validated.proposal.id,
    workflowGraphPlanId: validated.graph.id,
    readinessManifestId: validated.proposal.readinessManifestId,
    decompositionPlanId: validated.proposal.decompositionPlanId,
    items: validated.proposal.items.map((item) => ({
      taskId: item.taskId,
      status: "queued",
      order: item.order,
      updatedAt: now,
    })),
    recoveryKey: validated.recoveryKey,
    artifactRefs: unique([validated.graph.artifact, validated.graph.markdownArtifact, ...validated.graph.artifactRefs]),
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  };
  await writeWorkflowRun(memory, run);
  await appendWorkflowRunEvent(memory, run, "workflow.created", { data: { projectId: project.id, taskQueueProposalId: run.taskQueueProposalId, workflowGraphPlanId: run.workflowGraphPlanId } });
  return run;
}

export async function assertWorkflowResumeAllowed(memory: ResolvedMemory, project: ManagedProject, workflowRunId: string, queue: TaskQueueRun): Promise<WorkflowRun> {
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

function workflowItemsFromQueueItems(items: TaskQueueItem[]): WorkflowRun["items"] {
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
