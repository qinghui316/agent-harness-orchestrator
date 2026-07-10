export interface WorkflowRunEventInput {
  queueRunId?: string;
  taskId?: string;
  taskRunId?: string;
  status?: string;
  reason?: string;
  data?: Record<string, unknown>;
}
