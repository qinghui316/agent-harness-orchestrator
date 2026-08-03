import { isActiveTaskRunStatus, listTaskRuns } from "../task-run/manager.js";
import { assertWorkflowResumeAllowed } from "../workflow-run/manager.js";
import { workflowActionScopesMatchStrict } from "../workflow-actions/registry.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { ManagedProject, ResolvedMemory, TaskQueueRun, TaskQueueWorkflowRun } from "../types/index.js";
import type { TaskQueueStartOptions } from "./types.js";
import { listTaskQueues, writeTaskQueueRun } from "./repository.js";
import { isActiveQueueStatus } from "./status.js";

export interface PausedTaskQueueResumeValidation {
  queue: TaskQueueRun;
  workflow: TaskQueueWorkflowRun;
}

export async function validateNoConflictingActiveQueue(memory: ProjectRunsPathPort, changeId: string): Promise<TaskQueueRun | null> {
  const existingQueues = await listTaskQueues(memory, changeId);
  const activeQueue = existingQueues.find((queue) => isActiveQueueStatus(queue.status));
  if (activeQueue && activeQueue.status !== "paused") throw new Error(`Task queue already active: ${activeQueue.id}.`);
  return activeQueue ?? null;
}

export async function validatePausedTaskQueueResume(
  memory: ResolvedMemory,
  project: ManagedProject,
  activeQueue: TaskQueueRun,
  options: TaskQueueStartOptions,
): Promise<PausedTaskQueueResumeValidation> {
  if (!options.queueRunId || activeQueue.id !== options.queueRunId) throw new Error("TaskQueue resume requires the paused queueRunId.");
  if (!options.workflowRunId) throw new Error("TaskQueue resume requires workflowRunId.");
  if (!options.workflowGraphPlanId) throw new Error("TaskQueue resume requires workflowGraphPlanId.");
  if (!workflowActionScopesMatchStrict({ ...activeQueue, queueRunId: activeQueue.id }, options)) throw new Error("TaskQueue resume scope is stale or incomplete.");
  try {
    const workflow = await assertWorkflowResumeAllowed(memory, project, options.workflowRunId, activeQueue);
    if (!workflowActionScopesMatchStrict({ ...workflow, workflowRunId: workflow.id }, options)) throw new Error("TaskQueue resume WorkflowRun scope is stale or incomplete.");
    return { queue: activeQueue, workflow };
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
}

export async function assertNoActiveTaskRun(memory: ProjectRunsPathPort, changeId: string): Promise<void> {
  const taskRuns = await listTaskRuns(memory, changeId);
  const activeTask = taskRuns.find((run) => isActiveTaskRunStatus(run.status));
  if (activeTask) throw new Error(`Cannot start task queue while TaskRun ${activeTask.id} is active.`);
}

export function assertProposalTasksKnown(acceptedTasks: { id: string; done?: boolean }[], proposalTaskIds: string[]): void {
  if (acceptedTasks.length === 0) throw new Error("Task queue requires accepted tasks.");
  const knownTasks = new Set(acceptedTasks.map((task) => task.id.toUpperCase()));
  const unknown = proposalTaskIds.map((taskId) => taskId.toUpperCase()).filter((taskId) => !knownTasks.has(taskId));
  if (unknown.length > 0) throw new Error(`WorkflowGraphPlan references unknown task id(s): ${Array.from(new Set(unknown)).join(", ")}.`);
}
