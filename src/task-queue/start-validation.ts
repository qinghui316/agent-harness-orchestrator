import { isActiveTaskRunStatus, listTaskRuns } from "../task-run/manager.js";
import {
  assertWorkflowResumeAllowed,
  readWorkflowRun,
  validateTaskQueueProposalStart,
} from "../workflow-run/manager.js";
import { isTaskQueueWorkflowRun } from "../workflow-run/guards.js";
import { workflowActionScopesMatchStrict } from "../workflow-actions/registry.js";
import type { ManagedProject, ResolvedMemory, TaskQueueRun, WorkflowRun } from "../types/index.js";
import type { TaskQueueStartOptions } from "./types.js";
import { listTaskQueues, writeTaskQueueRun } from "./repository.js";
import { isActiveQueueStatus, sameRecoveryKeyExceptCreatedAt } from "./status.js";

type ValidatedTaskQueueStart = Awaited<ReturnType<typeof validateTaskQueueProposalStart>>;

export interface TaskQueueStartValidation {
  validated: ValidatedTaskQueueStart;
  workflow: Extract<WorkflowRun, { source: "taskqueue-proposal" }>;
}

export interface PausedTaskQueueResumeValidation {
  queue: TaskQueueRun;
  workflow: Extract<WorkflowRun, { source: "taskqueue-proposal" }>;
}

export async function validateNoConflictingActiveQueue(memory: ResolvedMemory, changeId: string): Promise<TaskQueueRun | null> {
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
  if (!options.taskQueueProposalId) throw new Error("TaskQueue resume requires taskQueueProposalId.");
  if (!options.workflowGraphPlanId) throw new Error("TaskQueue resume requires workflowGraphPlanId.");
  if (!options.readinessManifestId) throw new Error("TaskQueue resume requires readinessManifestId.");
  if (!options.decompositionPlanId) throw new Error("TaskQueue resume requires decompositionPlanId.");
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

export async function validateNewTaskQueueStart(
  memory: ResolvedMemory,
  project: ManagedProject,
  options: TaskQueueStartOptions,
): Promise<TaskQueueStartValidation> {
  if (!options.taskQueueProposalId) throw new Error("TaskQueue start requires a confirmed TaskQueueProposal.");
  if (!options.workflowGraphPlanId) throw new Error("TaskQueue start requires workflowGraphPlanId.");
  if (!options.readinessManifestId) throw new Error("TaskQueue start requires readinessManifestId.");
  if (!options.decompositionPlanId) throw new Error("TaskQueue start requires decompositionPlanId.");
  if (!options.workflowRunId) throw new Error("TaskQueue start requires workflowRunId.");

  const validated = await validateTaskQueueProposalStart(memory, project, options.changeId, options.taskQueueProposalId, options.workflowGraphPlanId);
  if (options.decompositionPlanId !== validated.proposal.decompositionPlanId) throw new Error("TaskQueue start decompositionPlanId is stale.");
  if (options.readinessManifestId !== validated.proposal.readinessManifestId) throw new Error("TaskQueue start readinessManifestId is stale.");

  const workflow = await readWorkflowRun(memory, options.changeId, options.workflowRunId).catch(() => null);
  if (
    !workflow
    || !isTaskQueueWorkflowRun(workflow)
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
  return { validated, workflow };
}

export async function assertNoActiveTaskRun(memory: ResolvedMemory, changeId: string): Promise<void> {
  const taskRuns = await listTaskRuns(memory, changeId);
  const activeTask = taskRuns.find((run) => isActiveTaskRunStatus(run.status));
  if (activeTask) throw new Error(`Cannot start task queue while TaskRun ${activeTask.id} is active.`);
}

export function assertProposalTasksKnown(acceptedTasks: { id: string; done?: boolean }[], proposalTaskIds: string[]): void {
  if (acceptedTasks.length === 0) throw new Error("Task queue requires accepted tasks.");
  const knownTasks = new Set(acceptedTasks.map((task) => task.id.toUpperCase()));
  const unknown = proposalTaskIds.map((taskId) => taskId.toUpperCase()).filter((taskId) => !knownTasks.has(taskId));
  if (unknown.length > 0) throw new Error(`TaskQueueProposal references unknown task id(s): ${Array.from(new Set(unknown)).join(", ")}.`);
}
