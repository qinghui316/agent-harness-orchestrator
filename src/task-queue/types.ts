import type { TaskQueueItem, TaskQueueRun } from "../types/index.js";

export interface TaskQueueStartOptions {
  changeId: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  workflowRunId?: string;
  queueRunId?: string;
}

export interface TaskQueueReconcileOptions {
  changeId: string;
  queueRunId?: string;
}

export interface TaskQueueStartResult {
  queue: TaskQueueRun;
  items: TaskQueueItem[];
  resumed: boolean;
}
