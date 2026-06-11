import type { WorkbenchThreadActionType } from "../../workflow-actions/registry.js";

export type WorkflowActionPayloadSource = {
  changeId?: string;
  planningBundleId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  schedulerContractId?: string;
  schedulerDispatchDryRunId?: string;
  schedulerWorkerPlanId?: string;
  schedulerClaimReconcilePlanId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  taskIds?: string[];
  taskRunId?: string;
  worktreeId?: string;
  worktreeIds?: string[];
  applyCheckId?: string;
  landingPackageId?: string;
  remoteLandingResultId?: string;
};

export type WorkflowActionPayload = Record<string, unknown>;

export function workflowActionPayloadFromScope(
  source: WorkflowActionPayloadSource,
  overrides: WorkflowActionPayloadSource = {},
): WorkflowActionPayload {
  const merged = { ...source, ...overrides };
  return Object.fromEntries(
    Object.entries(merged).filter(([, value]) => Array.isArray(value) ? value.length > 0 : value !== undefined),
  );
}

export function workflowActionPayloadFromTaskAction(
  source: WorkflowActionPayloadSource,
  fallbackTaskId: string,
): WorkflowActionPayload {
  return workflowActionPayloadFromScope(source, {
    taskIds: source.taskIds ?? [fallbackTaskId],
    taskRunId: source.taskRunId,
  });
}

export type { WorkbenchThreadActionType };
