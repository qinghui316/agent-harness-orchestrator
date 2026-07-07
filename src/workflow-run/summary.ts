import type { WorkflowRun, WorkflowRunSummary } from "../types/index.js";

export function summarizeWorkflowRun(run: WorkflowRun): WorkflowRunSummary {
  if (run.source === "default-code-change-workflow") {
    return {
      id: run.id,
      status: run.status,
      source: run.source,
      currentNodeId: run.currentNodeId,
      completedCount: run.nodes.filter((node) => node.status === "completed" || node.status === "skipped").length,
      totalCount: run.nodes.filter((node) => node.status !== "skipped").length,
      updatedAt: run.updatedAt,
    };
  }
  return {
    id: run.id,
    status: run.status,
    source: run.source,
    currentTaskId: run.currentTaskId,
    completedCount: run.items.filter((item) => item.status === "completed" || item.status === "skipped").length,
    totalCount: run.items.filter((item) => item.status !== "skipped").length,
    queueRunId: run.queueRunId,
    workflowGraphPlanId: run.workflowGraphPlanId,
    updatedAt: run.updatedAt,
  };
}
