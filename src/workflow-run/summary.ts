import type { WorkflowRun, WorkflowRunSummary } from "../types/index.js";

export function summarizeWorkflowRun(run: WorkflowRun): WorkflowRunSummary {
  return {
    id: run.id,
    status: run.status,
    currentTaskId: run.currentTaskId,
    completedCount: run.items.filter((item) => item.status === "completed" || item.status === "skipped").length,
    totalCount: run.items.filter((item) => item.status !== "skipped").length,
    queueRunId: run.queueRunId,
    workflowGraphPlanId: run.workflowGraphPlanId,
    updatedAt: run.updatedAt,
  };
}
