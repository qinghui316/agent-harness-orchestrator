import type { ManagedProject } from "../types/index.js";
import {
  reconcileTaskQueues,
  startOrResumeTaskQueue,
  type TaskQueueReconcileOptions,
  type TaskQueueStartOptions,
  type TaskQueueStartResult,
} from "../task-queue/manager.js";

export function startOrResumeWorkflowTaskQueue(project: ManagedProject, options: TaskQueueStartOptions): Promise<TaskQueueStartResult> {
  return startOrResumeTaskQueue(project, options);
}

export function reconcileWorkflowTaskQueue(project: ManagedProject, options: TaskQueueReconcileOptions) {
  return reconcileTaskQueues(project, options);
}
