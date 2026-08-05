import type { WorkflowRun } from "../../types/index.js";
import type { SchedulerArtifactStore } from "../../scheduler-runtime/artifact-store.js";
import type { ProjectRunsPathPort } from "../../project-runtime/paths.js";
import {
  readWorkflowGraphPlanProjection,
  readSchedulerContractProjection,
  readSchedulerDispatchDryRunProjection,
  readSchedulerWorkerSessionPlanProjection,
  readSchedulerClaimReconcilePlanProjection,
  readSchedulerLaunchPreflightProjection,
  readSchedulerReconcileProjection,
  readSchedulerClaimReservationProjection,
  readSchedulerRuntimeProjection,
  readSchedulerWorkerAuditProjection,
  readSchedulerWorkerReworkPlanProjection,
  readSchedulerWorkerReworkAuditProjection,
  readSchedulerWorkerReworkResultProjection,
  readSchedulerWorkerReworkValidationProjection,
  readSchedulerWorkerReworkStartProjection,
  readSchedulerIntegrationCandidateProjection,
  readSchedulerIntegrationCheckHandoffProjection,
  readSchedulerIntegrationOutcomeProjection,
  readSchedulerRunBlockedCloseoutProjection,
  readSchedulerRunCompletionProjection,
  readSchedulerRunProjection,
  readSchedulerWorkerValidationProjection,
} from "../workflow-projection.js";
import { readWorkflowRun, readWorkflowRunEvents } from "../../workflow-run/manager.js";
import type { WorkflowGraphPlan } from "../../workflow-artifacts/manager.js";
import type { SchedulerClaimReconcilePlan, SchedulerContract, SchedulerDispatchDryRun, SchedulerLaunchPreflight, SchedulerRun, SchedulerWorkerSessionPlan } from "../../workflow-scheduler/manager.js";
import type { SchedulerIntegrationCandidate, SchedulerIntegrationCheckHandoff, SchedulerIntegrationOutcome, SchedulerRunBlockedCloseout, SchedulerRunCompletion, SchedulerReconcileSnapshot, SchedulerRuntimeClaimReservation, SchedulerRuntimeState, SchedulerRuntimeWorkerAudit, SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerReworkAudit, SchedulerRuntimeWorkerReworkResult, SchedulerRuntimeWorkerReworkValidation, SchedulerRuntimeWorkerReworkStart, SchedulerRuntimeWorkerValidation } from "../../scheduler-runtime/manager.js";

export interface WorkbenchTopicPathRef {
  id: string;
  name: string;
  path: string;
}

export function findWorkbenchTopicPath(topics: WorkbenchTopicPathRef[], changeId: string): string | null {
  return topics.find((item) =>
    item.id === changeId
    || item.name === changeId
    || item.path.replaceAll("\\", "/").split("/").at(-1) === changeId
  )?.path ?? null;
}

export function getWorkflowGraphPlanProjectionForPath(memory: SchedulerArtifactStore, changePath: string, workflowGraphPlanId?: string): Promise<WorkflowGraphPlan | null> {
  return readWorkflowGraphPlanProjection(memory, changePath, workflowGraphPlanId);
}

export function getSchedulerContractProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerContractId?: string): Promise<SchedulerContract | null> {
  return readSchedulerContractProjection(memory, changePath, schedulerContractId);
}

export function getSchedulerDispatchDryRunProjectionForPath(memory: SchedulerArtifactStore, changePath: string, dryRunId?: string): Promise<SchedulerDispatchDryRun | null> {
  return readSchedulerDispatchDryRunProjection(memory, changePath, dryRunId);
}

export function getSchedulerWorkerSessionPlanProjectionForPath(memory: SchedulerArtifactStore, changePath: string, workerPlanId?: string): Promise<SchedulerWorkerSessionPlan | null> {
  return readSchedulerWorkerSessionPlanProjection(memory, changePath, workerPlanId);
}

export function getSchedulerClaimReconcilePlanProjectionForPath(memory: SchedulerArtifactStore, changePath: string, claimReconcilePlanId?: string): Promise<SchedulerClaimReconcilePlan | null> {
  return readSchedulerClaimReconcilePlanProjection(memory, changePath, claimReconcilePlanId);
}

export function getSchedulerLaunchPreflightProjectionForPath(memory: SchedulerArtifactStore, changePath: string, preflightId?: string): Promise<SchedulerLaunchPreflight | null> {
  return readSchedulerLaunchPreflightProjection(memory, changePath, preflightId);
}

export function getSchedulerRunProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId?: string): Promise<SchedulerRun | null> {
  return readSchedulerRunProjection(memory, changePath, schedulerRunId);
}

export function getSchedulerRuntimeProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeState | null> {
  return readSchedulerRuntimeProjection(memory, changePath, schedulerRunId);
}

export function getSchedulerReconcileSnapshotProjectionForPath(memory: SchedulerArtifactStore, changePath: string, snapshotId: string, schedulerRunId?: string): Promise<SchedulerReconcileSnapshot | null> {
  return readSchedulerReconcileProjection(memory, changePath, snapshotId, schedulerRunId);
}

export function getSchedulerClaimReservationProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reservationId: string): Promise<SchedulerRuntimeClaimReservation | null> {
  return readSchedulerClaimReservationProjection(memory, changePath, schedulerRunId, reservationId);
}

export function getSchedulerWorkerValidationProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, validationId: string): Promise<SchedulerRuntimeWorkerValidation | null> {
  return readSchedulerWorkerValidationProjection(memory, changePath, schedulerRunId, validationId);
}

export function getSchedulerWorkerAuditProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, auditId: string): Promise<SchedulerRuntimeWorkerAudit | null> {
  return readSchedulerWorkerAuditProjection(memory, changePath, schedulerRunId, auditId);
}

export function getSchedulerWorkerReworkPlanProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkPlanId: string): Promise<SchedulerRuntimeWorkerReworkPlan | null> {
  return readSchedulerWorkerReworkPlanProjection(memory, changePath, schedulerRunId, reworkPlanId);
}

export function getSchedulerWorkerReworkStartProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkStartId: string): Promise<SchedulerRuntimeWorkerReworkStart | null> {
  return readSchedulerWorkerReworkStartProjection(memory, changePath, schedulerRunId, reworkStartId);
}

export function getSchedulerWorkerReworkResultProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkResultId: string): Promise<SchedulerRuntimeWorkerReworkResult | null> {
  return readSchedulerWorkerReworkResultProjection(memory, changePath, schedulerRunId, reworkResultId);
}

export function getSchedulerWorkerReworkValidationProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkValidationId: string): Promise<SchedulerRuntimeWorkerReworkValidation | null> {
  return readSchedulerWorkerReworkValidationProjection(memory, changePath, schedulerRunId, reworkValidationId);
}

export function getSchedulerWorkerReworkAuditProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, reworkAuditId: string): Promise<SchedulerRuntimeWorkerReworkAudit | null> {
  return readSchedulerWorkerReworkAuditProjection(memory, changePath, schedulerRunId, reworkAuditId);
}

export function getSchedulerIntegrationCandidateProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, candidateId: string): Promise<SchedulerIntegrationCandidate | null> {
  return readSchedulerIntegrationCandidateProjection(memory, changePath, schedulerRunId, candidateId);
}

export function getSchedulerIntegrationCheckHandoffProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, handoffId: string): Promise<SchedulerIntegrationCheckHandoff | null> {
  return readSchedulerIntegrationCheckHandoffProjection(memory, changePath, schedulerRunId, handoffId);
}

export function getSchedulerIntegrationOutcomeProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, outcomeId: string): Promise<SchedulerIntegrationOutcome | null> {
  return readSchedulerIntegrationOutcomeProjection(memory, changePath, schedulerRunId, outcomeId);
}

export function getSchedulerRunCompletionProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, completionId: string): Promise<SchedulerRunCompletion | null> {
  return readSchedulerRunCompletionProjection(memory, changePath, schedulerRunId, completionId);
}

export function getSchedulerRunBlockedCloseoutProjectionForPath(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string, closeoutId: string): Promise<SchedulerRunBlockedCloseout | null> {
  return readSchedulerRunBlockedCloseoutProjection(memory, changePath, schedulerRunId, closeoutId);
}

export async function getWorkflowRunProjectionForChange(
  memory: ProjectRunsPathPort,
  changeId: string,
  workflowRunId: string,
): Promise<{ run: WorkflowRun; events: Awaited<ReturnType<typeof readWorkflowRunEvents>> } | null> {
  const run = await readWorkflowRun(memory, changeId, workflowRunId).catch(() => null);
  if (!run) return null;
  const events = await readWorkflowRunEvents(memory, changeId, workflowRunId);
  return { run, events };
}
