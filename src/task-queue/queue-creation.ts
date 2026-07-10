import { shortHash } from "../fs/path.js";
import { bindWorkflowRunToQueue } from "../workflow-run/manager.js";
import type { ManagedProject, ResolvedMemory, TaskQueueItem, TaskQueueRun, WorkflowRun } from "../types/index.js";
import { writeTaskQueueItem, writeTaskQueueRun } from "./repository.js";

interface CreateTaskQueueInput {
  project: ManagedProject;
  memory: ResolvedMemory;
  changeId: string;
  workflow: WorkflowRun;
  workflowGraphPlanId: string;
  graphItems: { taskId: string; order: number }[];
  acceptedTasks: { id: string; done?: boolean }[];
}

export async function createTaskQueueRunFromGraph(input: CreateTaskQueueInput): Promise<{ queue: TaskQueueRun; items: TaskQueueItem[] }> {
  const now = new Date().toISOString();
  const queueId = `queue-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${input.changeId}:${now}`)}`;
  const doneTasks = new Set(input.acceptedTasks.filter((task) => task.done).map((task) => task.id.toUpperCase()));
  const items: TaskQueueItem[] = input.graphItems.slice().sort((a, b) => a.order - b.order).map((task, index) => ({
    version: "1.0",
    id: `${queueId}-item-${String(index + 1).padStart(3, "0")}`,
    projectId: input.project.id,
    changeId: input.changeId,
    queueRunId: queueId,
    taskId: task.taskId.toUpperCase(),
    order: index + 1,
    status: doneTasks.has(task.taskId.toUpperCase()) ? "skipped" : "queued",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: doneTasks.has(task.taskId.toUpperCase()) ? now : null,
    workflowRunId: input.workflow.id,
    workflowGraphPlanId: input.workflowGraphPlanId,
  }));
  if (!items.some((item) => item.status === "queued")) throw new Error("Task queue has no runnable tasks.");
  const queue: TaskQueueRun = {
    version: "1.0",
    id: queueId,
    projectId: input.project.id,
    changeId: input.changeId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    workflowRunId: input.workflow.id,
    workflowGraphPlanId: input.workflowGraphPlanId,
    totalCount: items.filter((item) => item.status !== "skipped").length,
    completedCount: 0,
  };
  await writeTaskQueueRun(input.memory, queue);
  await Promise.all(items.map((item) => writeTaskQueueItem(input.memory, item)));
  await bindWorkflowRunToQueue(input.memory, input.workflow, queue, items);
  return { queue, items };
}
