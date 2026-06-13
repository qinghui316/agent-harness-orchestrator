import type { ResolvedMemory, WorkflowRun } from "../../types/index.js";
import {
  readDecompositionPlanProjection,
  readDecompositionReadinessProjection,
  readTaskQueueProposalProjection,
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
  readSchedulerRunProjection,
  readSchedulerWorkerValidationProjection,
} from "../workflow-projection.js";
import { readWorkflowRun, readWorkflowRunEvents } from "../../workflow-run/manager.js";
import type {
  DecompositionPlan,
  DecompositionReadinessManifest,
  TaskQueueProposal,
  WorkflowGraphPlan,
} from "../../workflow-artifacts/manager.js";
import type { SchedulerClaimReconcilePlan, SchedulerContract, SchedulerDispatchDryRun, SchedulerLaunchPreflight, SchedulerRun, SchedulerWorkerSessionPlan } from "../../workflow-scheduler/manager.js";
import type { SchedulerIntegrationCandidate, SchedulerIntegrationCheckHandoff, SchedulerIntegrationOutcome, SchedulerReconcileSnapshot, SchedulerRuntimeClaimReservation, SchedulerRuntimeState, SchedulerRuntimeWorkerAudit, SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerReworkAudit, SchedulerRuntimeWorkerReworkResult, SchedulerRuntimeWorkerReworkValidation, SchedulerRuntimeWorkerReworkStart, SchedulerRuntimeWorkerValidation } from "../../scheduler-runtime/manager.js";

export interface WorkbenchTopicPathRef {
  id: string;
  name: string;
  path: string;
}

export function findWorkbenchTopicPath(topics: WorkbenchTopicPathRef[], changeId: string): string | null {
  return topics.find((item) => item.id === changeId || item.name === changeId)?.path ?? null;
}

export function getDecompositionPlanProjectionForPath(memory: ResolvedMemory, changePath: string): Promise<DecompositionPlan | null> {
  return readDecompositionPlanProjection(memory, changePath);
}

export function getDecompositionReadinessProjectionForPath(memory: ResolvedMemory, changePath: string): Promise<DecompositionReadinessManifest | null> {
  return readDecompositionReadinessProjection(memory, changePath);
}

export function getTaskQueueProposalProjectionForPath(memory: ResolvedMemory, changePath: string): Promise<TaskQueueProposal | null> {
  return readTaskQueueProposalProjection(memory, changePath);
}

export function getWorkflowGraphPlanProjectionForPath(memory: ResolvedMemory, changePath: string, workflowGraphPlanId?: string): Promise<WorkflowGraphPlan | null> {
  return readWorkflowGraphPlanProjection(memory, changePath, workflowGraphPlanId);
}

export function getSchedulerContractProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerContractId?: string): Promise<SchedulerContract | null> {
  return readSchedulerContractProjection(memory, changePath, schedulerContractId);
}

export function getSchedulerDispatchDryRunProjectionForPath(memory: ResolvedMemory, changePath: string, dryRunId?: string): Promise<SchedulerDispatchDryRun | null> {
  return readSchedulerDispatchDryRunProjection(memory, changePath, dryRunId);
}

export function getSchedulerWorkerSessionPlanProjectionForPath(memory: ResolvedMemory, changePath: string, workerPlanId?: string): Promise<SchedulerWorkerSessionPlan | null> {
  return readSchedulerWorkerSessionPlanProjection(memory, changePath, workerPlanId);
}

export function getSchedulerClaimReconcilePlanProjectionForPath(memory: ResolvedMemory, changePath: string, claimReconcilePlanId?: string): Promise<SchedulerClaimReconcilePlan | null> {
  return readSchedulerClaimReconcilePlanProjection(memory, changePath, claimReconcilePlanId);
}

export function getSchedulerLaunchPreflightProjectionForPath(memory: ResolvedMemory, changePath: string, preflightId?: string): Promise<SchedulerLaunchPreflight | null> {
  return readSchedulerLaunchPreflightProjection(memory, changePath, preflightId);
}

export function getSchedulerRunProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId?: string): Promise<SchedulerRun | null> {
  return readSchedulerRunProjection(memory, changePath, schedulerRunId);
}

export function getSchedulerRuntimeProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeState | null> {
  return readSchedulerRuntimeProjection(memory, changePath, schedulerRunId);
}

export function getSchedulerReconcileSnapshotProjectionForPath(memory: ResolvedMemory, changePath: string, snapshotId: string, schedulerRunId?: string): Promise<SchedulerReconcileSnapshot | null> {
  return readSchedulerReconcileProjection(memory, changePath, snapshotId, schedulerRunId);
}

export function getSchedulerClaimReservationProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reservationId: string): Promise<SchedulerRuntimeClaimReservation | null> {
  return readSchedulerClaimReservationProjection(memory, changePath, schedulerRunId, reservationId);
}

export function getSchedulerWorkerValidationProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, validationId: string): Promise<SchedulerRuntimeWorkerValidation | null> {
  return readSchedulerWorkerValidationProjection(memory, changePath, schedulerRunId, validationId);
}

export function getSchedulerWorkerAuditProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, auditId: string): Promise<SchedulerRuntimeWorkerAudit | null> {
  return readSchedulerWorkerAuditProjection(memory, changePath, schedulerRunId, auditId);
}

export function getSchedulerWorkerReworkPlanProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkPlanId: string): Promise<SchedulerRuntimeWorkerReworkPlan | null> {
  return readSchedulerWorkerReworkPlanProjection(memory, changePath, schedulerRunId, reworkPlanId);
}

export function getSchedulerWorkerReworkStartProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkStartId: string): Promise<SchedulerRuntimeWorkerReworkStart | null> {
  return readSchedulerWorkerReworkStartProjection(memory, changePath, schedulerRunId, reworkStartId);
}

export function getSchedulerWorkerReworkResultProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkResultId: string): Promise<SchedulerRuntimeWorkerReworkResult | null> {
  return readSchedulerWorkerReworkResultProjection(memory, changePath, schedulerRunId, reworkResultId);
}

export function getSchedulerWorkerReworkValidationProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkValidationId: string): Promise<SchedulerRuntimeWorkerReworkValidation | null> {
  return readSchedulerWorkerReworkValidationProjection(memory, changePath, schedulerRunId, reworkValidationId);
}

export function getSchedulerWorkerReworkAuditProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkAuditId: string): Promise<SchedulerRuntimeWorkerReworkAudit | null> {
  return readSchedulerWorkerReworkAuditProjection(memory, changePath, schedulerRunId, reworkAuditId);
}

export function getSchedulerIntegrationCandidateProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, candidateId: string): Promise<SchedulerIntegrationCandidate | null> {
  return readSchedulerIntegrationCandidateProjection(memory, changePath, schedulerRunId, candidateId);
}

export function getSchedulerIntegrationCheckHandoffProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, handoffId: string): Promise<SchedulerIntegrationCheckHandoff | null> {
  return readSchedulerIntegrationCheckHandoffProjection(memory, changePath, schedulerRunId, handoffId);
}

export function getSchedulerIntegrationOutcomeProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerRunId: string, outcomeId: string): Promise<SchedulerIntegrationOutcome | null> {
  return readSchedulerIntegrationOutcomeProjection(memory, changePath, schedulerRunId, outcomeId);
}

export async function getWorkflowRunProjectionForChange(
  memory: ResolvedMemory,
  changeId: string,
  workflowRunId: string,
): Promise<{ run: WorkflowRun; events: Awaited<ReturnType<typeof readWorkflowRunEvents>> } | null> {
  const run = await readWorkflowRun(memory, changeId, workflowRunId).catch(() => null);
  if (!run) return null;
  const events = await readWorkflowRunEvents(memory, changeId, workflowRunId);
  return { run, events };
}
