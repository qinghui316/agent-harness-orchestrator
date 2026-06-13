import {
  getWorkbenchDecompositionPlanProjection,
  getWorkbenchDecompositionReadinessProjection,
  getWorkbenchEvidenceProjection,
  getWorkbenchLandingQueueProjection,
  getWorkbenchMaintenanceProjection,
  getWorkbenchRunGraphProjection,
  getWorkbenchTaskQueueProposalProjection,
  getWorkbenchTranscriptProjection,
  getWorkbenchWorkflowGraphPlanProjection,
  getWorkbenchSchedulerContractProjection,
  getWorkbenchSchedulerDispatchDryRunProjection,
  getWorkbenchSchedulerClaimReconcilePlanProjection,
  getWorkbenchSchedulerLaunchPreflightProjection,
  getWorkbenchSchedulerReconcileSnapshotProjection,
  getWorkbenchSchedulerRuntimeProjection,
  getWorkbenchSchedulerRunProjection,
  getWorkbenchSchedulerWorkerSessionPlanProjection,
  getWorkbenchSchedulerClaimReservationProjection,
  getWorkbenchSchedulerWorkerAuditProjection,
  getWorkbenchSchedulerWorkerReworkPlanProjection,
  getWorkbenchSchedulerWorkerReworkAuditProjection,
  getWorkbenchSchedulerWorkerReworkResultProjection,
  getWorkbenchSchedulerWorkerReworkValidationProjection,
  getWorkbenchSchedulerWorkerReworkStartProjection,
  getWorkbenchSchedulerWorkerValidationProjection,
  getWorkbenchSchedulerIntegrationCandidateProjection,
  getWorkbenchSchedulerIntegrationCheckHandoffProjection,
  getWorkbenchSchedulerIntegrationOutcomeProjection,
  getWorkbenchWorkflowRunProjection,
  getWorkbenchWorkpadProjection,
  type WorkbenchProjectInput,
} from "../../workbench/manager.js";

export async function getWorkbenchProjection(input: WorkbenchProjectInput, rest: string): Promise<unknown> {
  const [kind, encodedChangeId, encodedId, encodedExtraId] = rest.split("/");
  const changeId = encodedChangeId ? decodeURIComponent(encodedChangeId) : undefined;
  const id = encodedId ? decodeURIComponent(encodedId) : undefined;
  const extraId = encodedExtraId ? decodeURIComponent(encodedExtraId) : undefined;
  if (kind === "transcript") {
    if (!changeId) throw badRequest("transcript projection requires changeId.");
    return getWorkbenchTranscriptProjection(input, changeId);
  }
  if (kind === "run-graph") {
    if (!changeId) throw badRequest("run-graph projection requires changeId.");
    return getWorkbenchRunGraphProjection(input, changeId);
  }
  if (kind === "workpad") {
    if (!changeId) throw badRequest("workpad projection requires changeId.");
    return getWorkbenchWorkpadProjection(input, changeId);
  }
  if (kind === "evidence") {
    if (!changeId) throw badRequest("evidence projection requires changeId.");
    return getWorkbenchEvidenceProjection(input, changeId);
  }
  if (kind === "decomposition-plan") {
    if (!changeId) throw badRequest("decomposition-plan projection requires changeId.");
    return getWorkbenchDecompositionPlanProjection(input, changeId);
  }
  if (kind === "decomposition-readiness") {
    if (!changeId) throw badRequest("decomposition-readiness projection requires changeId.");
    return getWorkbenchDecompositionReadinessProjection(input, changeId);
  }
  if (kind === "taskqueue-proposal") {
    if (!changeId) throw badRequest("taskqueue-proposal projection requires changeId.");
    return getWorkbenchTaskQueueProposalProjection(input, changeId);
  }
  if (kind === "workflow-graph-plan") {
    if (!changeId) throw badRequest("workflow-graph-plan projection requires changeId.");
    return getWorkbenchWorkflowGraphPlanProjection(input, changeId, id);
  }
  if (kind === "scheduler-contract") {
    if (!changeId) throw badRequest("scheduler-contract projection requires changeId.");
    return getWorkbenchSchedulerContractProjection(input, changeId, id);
  }
  if (kind === "scheduler-dispatch-dry-run") {
    if (!changeId) throw badRequest("scheduler-dispatch-dry-run projection requires changeId.");
    return getWorkbenchSchedulerDispatchDryRunProjection(input, changeId, id);
  }
  if (kind === "scheduler-worker-plan") {
    if (!changeId) throw badRequest("scheduler-worker-plan projection requires changeId.");
    return getWorkbenchSchedulerWorkerSessionPlanProjection(input, changeId, id);
  }
  if (kind === "scheduler-claim-reconcile-plan") {
    if (!changeId) throw badRequest("scheduler-claim-reconcile-plan projection requires changeId.");
    return getWorkbenchSchedulerClaimReconcilePlanProjection(input, changeId, id);
  }
  if (kind === "scheduler-launch-preflight") {
    if (!changeId) throw badRequest("scheduler-launch-preflight projection requires changeId.");
    return getWorkbenchSchedulerLaunchPreflightProjection(input, changeId, id);
  }
  if (kind === "scheduler-run") {
    if (!changeId) throw badRequest("scheduler-run projection requires changeId.");
    return getWorkbenchSchedulerRunProjection(input, changeId, id);
  }
  if (kind === "scheduler-runtime") {
    if (!changeId) throw badRequest("scheduler-runtime projection requires changeId.");
    if (!id) throw badRequest("scheduler-runtime projection requires schedulerRunId.");
    return getWorkbenchSchedulerRuntimeProjection(input, changeId, id);
  }
  if (kind === "scheduler-reconcile-snapshot") {
    if (!changeId) throw badRequest("scheduler-reconcile-snapshot projection requires changeId.");
    if (!id) throw badRequest("scheduler-reconcile-snapshot projection requires schedulerReconcileSnapshotId.");
    return getWorkbenchSchedulerReconcileSnapshotProjection(input, changeId, id);
  }
  if (kind === "scheduler-claim-reservation") {
    if (!changeId) throw badRequest("scheduler-claim-reservation projection requires changeId.");
    if (!id) throw badRequest("scheduler-claim-reservation projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-claim-reservation projection requires schedulerClaimReservationId.");
    return getWorkbenchSchedulerClaimReservationProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-worker-validation") {
    if (!changeId) throw badRequest("scheduler-worker-validation projection requires changeId.");
    if (!id) throw badRequest("scheduler-worker-validation projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-worker-validation projection requires schedulerWorkerValidationId.");
    return getWorkbenchSchedulerWorkerValidationProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-worker-audit") {
    if (!changeId) throw badRequest("scheduler-worker-audit projection requires changeId.");
    if (!id) throw badRequest("scheduler-worker-audit projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-worker-audit projection requires schedulerWorkerAuditId.");
    return getWorkbenchSchedulerWorkerAuditProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-worker-rework-plan") {
    if (!changeId) throw badRequest("scheduler-worker-rework-plan projection requires changeId.");
    if (!id) throw badRequest("scheduler-worker-rework-plan projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-worker-rework-plan projection requires schedulerWorkerReworkPlanId.");
    return getWorkbenchSchedulerWorkerReworkPlanProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-worker-rework-start") {
    if (!changeId) throw badRequest("scheduler-worker-rework-start projection requires changeId.");
    if (!id) throw badRequest("scheduler-worker-rework-start projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-worker-rework-start projection requires schedulerWorkerReworkStartId.");
    return getWorkbenchSchedulerWorkerReworkStartProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-worker-rework-result") {
    if (!changeId) throw badRequest("scheduler-worker-rework-result projection requires changeId.");
    if (!id) throw badRequest("scheduler-worker-rework-result projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-worker-rework-result projection requires schedulerWorkerReworkResultId.");
    return getWorkbenchSchedulerWorkerReworkResultProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-worker-rework-validation") {
    if (!changeId) throw badRequest("scheduler-worker-rework-validation projection requires changeId.");
    if (!id) throw badRequest("scheduler-worker-rework-validation projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-worker-rework-validation projection requires schedulerWorkerReworkValidationId.");
    return getWorkbenchSchedulerWorkerReworkValidationProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-worker-rework-audit") {
    if (!changeId) throw badRequest("scheduler-worker-rework-audit projection requires changeId.");
    if (!id) throw badRequest("scheduler-worker-rework-audit projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-worker-rework-audit projection requires schedulerWorkerReworkAuditId.");
    return getWorkbenchSchedulerWorkerReworkAuditProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-integration-candidate") {
    if (!changeId) throw badRequest("scheduler-integration-candidate projection requires changeId.");
    if (!id) throw badRequest("scheduler-integration-candidate projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-integration-candidate projection requires schedulerIntegrationCandidateId.");
    return getWorkbenchSchedulerIntegrationCandidateProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-integration-check-handoff") {
    if (!changeId) throw badRequest("scheduler-integration-check-handoff projection requires changeId.");
    if (!id) throw badRequest("scheduler-integration-check-handoff projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-integration-check-handoff projection requires schedulerIntegrationCheckHandoffId.");
    return getWorkbenchSchedulerIntegrationCheckHandoffProjection(input, changeId, id, extraId);
  }
  if (kind === "scheduler-integration-outcome") {
    if (!changeId) throw badRequest("scheduler-integration-outcome projection requires changeId.");
    if (!id) throw badRequest("scheduler-integration-outcome projection requires schedulerRunId.");
    if (!extraId) throw badRequest("scheduler-integration-outcome projection requires schedulerIntegrationOutcomeId.");
    return getWorkbenchSchedulerIntegrationOutcomeProjection(input, changeId, id, extraId);
  }
  if (kind === "workflow-run") {
    if (!changeId) throw badRequest("workflow-run projection requires changeId.");
    if (!id) throw badRequest("workflow-run projection requires id.");
    return getWorkbenchWorkflowRunProjection(input, changeId, id);
  }
  if (kind === "maintenance") return getWorkbenchMaintenanceProjection(input);
  if (kind === "landing-queue") return getWorkbenchLandingQueueProjection(input);
  throw badRequest(`Unknown Workbench projection: ${kind ?? ""}`);
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequest";
  return error;
}
