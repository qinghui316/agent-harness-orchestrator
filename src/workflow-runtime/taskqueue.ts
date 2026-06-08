import type { ManagedProject } from "../types/index.js";
import {
  reconcileTaskQueues,
  startOrResumeTaskQueue,
  type TaskQueueReconcileOptions,
  type TaskQueueStartOptions,
  type TaskQueueStartResult,
} from "../task-queue/manager.js";
import type { ResolvedMemory, TaskRun } from "../types/index.js";
import {
  createWorkflowRunForTaskQueue,
  deriveStageResumeVerdict,
  syncWorkflowRunFromQueue,
  validateTaskQueueProposalStart,
  type ValidatedTaskQueueProposal,
} from "../workflow-run/manager.js";
import type { TaskQueueItem, TaskQueueRun, WorkflowRun, WorkflowRunEventType } from "../types/index.js";

export function startOrResumeWorkflowTaskQueue(project: ManagedProject, options: TaskQueueStartOptions): Promise<TaskQueueStartResult> {
  return startOrResumeTaskQueue(project, options);
}

export function reconcileWorkflowTaskQueue(project: ManagedProject, options: TaskQueueReconcileOptions) {
  return reconcileTaskQueues(project, options);
}

export function validateWorkflowTaskQueueProposalStart(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  taskQueueProposalId: string,
  workflowGraphPlanId: string,
): Promise<ValidatedTaskQueueProposal> {
  return validateTaskQueueProposalStart(memory, project, changeId, taskQueueProposalId, workflowGraphPlanId);
}

export function createWorkflowRunForValidatedTaskQueue(memory: ResolvedMemory, project: ManagedProject, validated: ValidatedTaskQueueProposal): Promise<WorkflowRun> {
  return createWorkflowRunForTaskQueue(memory, project, validated);
}

export function syncWorkflowRunFromTaskQueue(
  memory: ResolvedMemory,
  run: WorkflowRun,
  queue: TaskQueueRun,
  items: TaskQueueItem[],
  eventType: WorkflowRunEventType = "workflow.reconciled",
  reason?: string,
): Promise<WorkflowRun> {
  return syncWorkflowRunFromQueue(memory, run, queue, items, eventType, reason);
}

export function deriveWorkflowStageResumeVerdict(memory: ResolvedMemory, changeId: string, taskRun: TaskRun) {
  return deriveStageResumeVerdict(memory, changeId, taskRun);
}
