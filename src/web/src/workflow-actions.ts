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
  schedulerLaunchPreflightId?: string;
  schedulerRunId?: string;
  schedulerReconcileSnapshotId?: string;
  schedulerClaimReservationId?: string;
  schedulerWorkerStartId?: string;
  schedulerWorkerResultId?: string;
  schedulerWorkerValidationId?: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId?: string;
  schedulerWorkerReworkStartId?: string;
  schedulerWorkerReworkResultId?: string;
  schedulerWorkerReworkValidationId?: string;
  schedulerWorkerReworkAuditId?: string;
  schedulerIntegrationCandidateId?: string;
  schedulerIntegrationCheckHandoffId?: string;
  schedulerIntegrationOutcomeId?: string;
  schedulerRunCompletionId?: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  taskIds?: string[];
  taskRunId?: string;
  workerLeaseId?: string;
  runId?: string;
  validationRunId?: string;
  reworkValidationRunId?: string;
  auditRunId?: string;
  reworkAuditRunId?: string;
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
