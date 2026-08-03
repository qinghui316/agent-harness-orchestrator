import { shortHash } from "../fs/path.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import { bindWorkflowRunToQueue } from "../workflow-run/manager.js";
import type { ManagedProject, TaskQueueItem, TaskQueueRun, WorkflowRun } from "../types/index.js";
import { writeTaskQueueItem, writeTaskQueueRun } from "./repository.js";

export interface CreateTaskQueueInput {
  project: ManagedProject;
  memory: ProjectRunsPathPort;
  changeId: string;
  workflow: WorkflowRun;
  workflowGraphPlanId: string;
  graphItems: { taskId: string; order: number }[];
  acceptedTasks: { id: string; done?: boolean }[];
}

export async function createTaskQueueRunFromGraph(input: CreateTaskQueueInput): Promise<{ queue: TaskQueueRun; items: TaskQueueItem[] }> {
  const created = buildTaskQueueRunFromGraph(input);
  await persistTaskQueueRunFromGraph(input.memory, input.workflow, created);
  return created;
}

export function buildTaskQueueRunFromGraph(
  input: Omit<CreateTaskQueueInput, "memory">,
  now = new Date().toISOString(),
): { queue: TaskQueueRun; items: TaskQueueItem[] } {
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
  return { queue, items };
}

export async function persistTaskQueueRunFromGraph(
  memory: ProjectRunsPathPort,
  workflow: WorkflowRun,
  created: { queue: TaskQueueRun; items: TaskQueueItem[] },
): Promise<void> {
  await writeTaskQueueRun(memory, created.queue);
  await Promise.all(created.items.map((item) => writeTaskQueueItem(memory, item)));
  await bindWorkflowRunToQueue(memory, workflow, created.queue, created.items);
}
