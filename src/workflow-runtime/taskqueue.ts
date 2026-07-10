import type { ManagedProject } from "../types/index.js";
import {
  reconcileTaskQueues,
  startOrResumeTaskQueue,
  type TaskQueueReconcileOptions,
  type TaskQueueStartOptions,
  type TaskQueueStartResult,
} from "../task-queue/manager.js";
import type { ResolvedMemory, TaskQueueItem, TaskQueueRun, TaskRun, WorkflowRun, WorkflowRunEventType } from "../types/index.js";
import {
  deriveStageResumeVerdict,
  syncWorkflowRunFromQueue,
} from "../workflow-run/manager.js";
import {
  runWorkflowGraphSequentialExecution,
  type WorkflowGraphSequentialRuntimeInput,
  type WorkflowGraphSequentialRuntimeResult,
} from "./workflowgraph-sequential.js";
import type { WorkflowRuntimeLiveSink } from "./kernel/live-events.js";

export type {
  WorkflowRuntimeLiveSink,
  WorkflowGraphSequentialRuntimeInput as TaskQueueSequentialRuntimeInput,
  WorkflowGraphSequentialRuntimeResult as TaskQueueSequentialRuntimeResult,
};

export function startOrResumeWorkflowTaskQueue(project: ManagedProject, options: TaskQueueStartOptions): Promise<TaskQueueStartResult> {
  return startOrResumeTaskQueue(project, options);
}

export function reconcileWorkflowTaskQueue(project: ManagedProject, options: TaskQueueReconcileOptions) {
  return reconcileTaskQueues(project, options);
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

export async function runTaskQueueSequentialWorkflow(input: WorkflowGraphSequentialRuntimeInput): Promise<WorkflowGraphSequentialRuntimeResult> {
  return runWorkflowGraphSequentialExecution(input);
}
