import { join } from "node:path";
import { readProjectHarnessChangeEvidence } from "../../../project-harness/change.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../../../project-runtime/coordinator.js";
import { skillNativeSchedulerRunArtifactPaths, type SchedulerArtifactStore } from "../../../scheduler-runtime/artifact-store.js";
import {
  readSchedulerRuntimeWorkerReworkPlanProjection,
  readSchedulerRuntimeWorkerReworkResultProjection,
  readSchedulerRuntimeWorkerReworkStartProjection,
  readSchedulerRuntimeWorkerReworkValidationProjection,
} from "../../../scheduler-runtime/repository.js";
import type { WorkflowGraphPlan } from "../../../workflow-artifacts/manager.js";
import { listSkillNativeSchedulerRuns } from "../../../workflow-runtime/skill-native-ready-set.js";
import type { SchedulerClaimReconcilePlan, SchedulerContract, SchedulerDispatchDryRun, SchedulerLaunchPreflight, SchedulerRun, SchedulerWorkerSessionPlan } from "../../../workflow-scheduler/manager.js";
import type { SchedulerIntegrationCandidate, SchedulerIntegrationCheckHandoff, SchedulerIntegrationOutcome, SchedulerRunBlockedCloseout, SchedulerRunCompletion, SchedulerReconcileSnapshot, SchedulerRuntimeClaimReservation, SchedulerRuntimeState, SchedulerRuntimeWorkerAudit, SchedulerRuntimeWorkerReworkPlan, SchedulerRuntimeWorkerReworkAudit, SchedulerRuntimeWorkerReworkResult, SchedulerRuntimeWorkerReworkValidation, SchedulerRuntimeWorkerReworkStart, SchedulerRuntimeWorkerValidation } from "../../../scheduler-runtime/manager.js";
import type { WorkbenchProjectInput } from "../../read-model-types.js";
import {
  getWorkflowGraphPlanProjectionForPath,
  getSchedulerContractProjectionForPath,
  getSchedulerDispatchDryRunProjectionForPath,
  getSchedulerClaimReconcilePlanProjectionForPath,
  getSchedulerClaimReservationProjectionForPath,
  getSchedulerWorkerAuditProjectionForPath,
  getSchedulerWorkerReworkAuditProjectionForPath,
  getSchedulerWorkerValidationProjectionForPath,
  getSchedulerIntegrationCheckHandoffProjectionForPath,
  getSchedulerIntegrationOutcomeProjectionForPath,
  getSchedulerRunBlockedCloseoutProjectionForPath,
  getSchedulerRunCompletionProjectionForPath,
  getSchedulerIntegrationCandidateProjectionForPath,
  getSchedulerLaunchPreflightProjectionForPath,
  getSchedulerReconcileSnapshotProjectionForPath,
  getSchedulerRuntimeProjectionForPath,
  getSchedulerRunProjectionForPath,
  getSchedulerWorkerSessionPlanProjectionForPath,
  getWorkflowRunProjectionForChange,
} from "../typed-workflow.js";

export async function getWorkbenchWorkflowGraphPlanProjection(input: WorkbenchProjectInput, changeId: string, workflowGraphPlanId?: string): Promise<WorkflowGraphPlan | null> {
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId);
  return artifacts ? getWorkflowGraphPlanProjectionForPath(artifacts, "", workflowGraphPlanId) : null;
}

export async function getWorkbenchSchedulerContractProjection(input: WorkbenchProjectInput, changeId: string, schedulerContractId?: string): Promise<SchedulerContract | null> {
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId);
  return artifacts ? getSchedulerContractProjectionForPath(artifacts, "", schedulerContractId) : null;
}

export async function getWorkbenchSchedulerDispatchDryRunProjection(input: WorkbenchProjectInput, changeId: string, dryRunId?: string): Promise<SchedulerDispatchDryRun | null> {
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId);
  return artifacts ? getSchedulerDispatchDryRunProjectionForPath(artifacts, "", dryRunId) : null;
}

export async function getWorkbenchSchedulerWorkerSessionPlanProjection(input: WorkbenchProjectInput, changeId: string, workerPlanId?: string): Promise<SchedulerWorkerSessionPlan | null> {
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId);
  return artifacts ? getSchedulerWorkerSessionPlanProjectionForPath(artifacts, "", workerPlanId) : null;
}

export async function getWorkbenchSchedulerClaimReconcilePlanProjection(input: WorkbenchProjectInput, changeId: string, claimReconcilePlanId?: string): Promise<SchedulerClaimReconcilePlan | null> {
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId);
  return artifacts ? getSchedulerClaimReconcilePlanProjectionForPath(artifacts, "", claimReconcilePlanId) : null;
}

export async function getWorkbenchSchedulerLaunchPreflightProjection(input: WorkbenchProjectInput, changeId: string, preflightId?: string): Promise<SchedulerLaunchPreflight | null> {
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId);
  return artifacts ? getSchedulerLaunchPreflightProjectionForPath(artifacts, "", preflightId) : null;
}

export async function getWorkbenchSchedulerRunProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string): Promise<SchedulerRun | null> {
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerRunProjectionForPath(artifacts, "", schedulerRunId) : null;
}

export async function getWorkbenchSchedulerRuntimeProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string): Promise<SchedulerRuntimeState | null> {
  if (!schedulerRunId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerRuntimeProjectionForPath(artifacts, "", schedulerRunId) : null;
}

export async function getWorkbenchSchedulerReconcileSnapshotProjection(input: WorkbenchProjectInput, changeId: string, snapshotId?: string, schedulerRunId?: string): Promise<SchedulerReconcileSnapshot | null> {
  if (!snapshotId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerReconcileSnapshotProjectionForPath(artifacts, "", snapshotId, schedulerRunId) : null;
}

export async function getWorkbenchSchedulerClaimReservationProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, reservationId?: string): Promise<SchedulerRuntimeClaimReservation | null> {
  if (!schedulerRunId || !reservationId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerClaimReservationProjectionForPath(artifacts, "", schedulerRunId, reservationId) : null;
}

export async function getWorkbenchSchedulerWorkerValidationProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, validationId?: string): Promise<SchedulerRuntimeWorkerValidation | null> {
  if (!schedulerRunId || !validationId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerWorkerValidationProjectionForPath(artifacts, "", schedulerRunId, validationId) : null;
}

export async function getWorkbenchSchedulerWorkerAuditProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, auditId?: string): Promise<SchedulerRuntimeWorkerAudit | null> {
  if (!schedulerRunId || !auditId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerWorkerAuditProjectionForPath(artifacts, "", schedulerRunId, auditId) : null;
}

export async function getWorkbenchSchedulerWorkerReworkPlanProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, reworkPlanId?: string): Promise<SchedulerRuntimeWorkerReworkPlan | null> {
  if (!schedulerRunId || !reworkPlanId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? readSchedulerRuntimeWorkerReworkPlanProjection(artifacts, "", schedulerRunId, reworkPlanId) : null;
}

export async function getWorkbenchSchedulerWorkerReworkStartProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, reworkStartId?: string): Promise<SchedulerRuntimeWorkerReworkStart | null> {
  if (!schedulerRunId || !reworkStartId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? readSchedulerRuntimeWorkerReworkStartProjection(artifacts, "", schedulerRunId, reworkStartId) : null;
}

export async function getWorkbenchSchedulerWorkerReworkResultProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, reworkResultId?: string): Promise<SchedulerRuntimeWorkerReworkResult | null> {
  if (!schedulerRunId || !reworkResultId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? readSchedulerRuntimeWorkerReworkResultProjection(artifacts, "", schedulerRunId, reworkResultId) : null;
}

export async function getWorkbenchSchedulerWorkerReworkValidationProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, reworkValidationId?: string): Promise<SchedulerRuntimeWorkerReworkValidation | null> {
  if (!schedulerRunId || !reworkValidationId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? readSchedulerRuntimeWorkerReworkValidationProjection(artifacts, "", schedulerRunId, reworkValidationId) : null;
}

export async function getWorkbenchSchedulerWorkerReworkAuditProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, reworkAuditId?: string): Promise<SchedulerRuntimeWorkerReworkAudit | null> {
  if (!schedulerRunId || !reworkAuditId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerWorkerReworkAuditProjectionForPath(artifacts, "", schedulerRunId, reworkAuditId) : null;
}

export async function getWorkbenchSchedulerIntegrationCandidateProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, candidateId?: string): Promise<SchedulerIntegrationCandidate | null> {
  if (!schedulerRunId || !candidateId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerIntegrationCandidateProjectionForPath(artifacts, "", schedulerRunId, candidateId) : null;
}

export async function getWorkbenchSchedulerIntegrationCheckHandoffProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, handoffId?: string): Promise<SchedulerIntegrationCheckHandoff | null> {
  if (!schedulerRunId || !handoffId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerIntegrationCheckHandoffProjectionForPath(artifacts, "", schedulerRunId, handoffId) : null;
}

export async function getWorkbenchSchedulerIntegrationOutcomeProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, outcomeId?: string): Promise<SchedulerIntegrationOutcome | null> {
  if (!schedulerRunId || !outcomeId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerIntegrationOutcomeProjectionForPath(artifacts, "", schedulerRunId, outcomeId) : null;
}

export async function getWorkbenchSchedulerRunCompletionProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, completionId?: string): Promise<SchedulerRunCompletion | null> {
  if (!schedulerRunId || !completionId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerRunCompletionProjectionForPath(artifacts, "", schedulerRunId, completionId) : null;
}

export async function getWorkbenchSchedulerRunBlockedCloseoutProjection(input: WorkbenchProjectInput, changeId: string, schedulerRunId?: string, closeoutId?: string): Promise<SchedulerRunBlockedCloseout | null> {
  if (!schedulerRunId || !closeoutId) return null;
  const artifacts = await resolveSkillNativeSchedulerProjectionStore(input, changeId, schedulerRunId);
  return artifacts ? getSchedulerRunBlockedCloseoutProjectionForPath(artifacts, "", schedulerRunId, closeoutId) : null;
}

export async function getWorkbenchWorkflowRunProjection(input: WorkbenchProjectInput, changeId: string, workflowRunId: string): Promise<Awaited<ReturnType<typeof getWorkflowRunProjectionForChange>> | null> {
  if (!input.project) return null;
  const state = await resolveProjectRuntimeState(input.project, { discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY });
  return state.state === "ready"
    ? getWorkflowRunProjectionForChange(state.resolution.paths, changeId, workflowRunId)
    : null;
}

async function resolveSkillNativeSchedulerProjectionStore(
  input: WorkbenchProjectInput,
  changeId: string,
  schedulerRunId?: string,
): Promise<SchedulerArtifactStore | null> {
  if (!input.project) return null;
  const state = await resolveProjectRuntimeState(input.project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") return null;
  const evidence = await readProjectHarnessChangeEvidence(state.resolution.harness.skillRoot, changeId).catch(() => null);
  if (!evidence) return null;
  const evidenceRoot = join(state.resolution.harness.skillRoot, evidence.evidence_path);
  const runtimeRoot = join(state.resolution.paths.runsRoot, "scheduler-runs", changeId);
  const currentRunId = schedulerRunId
    ?? (await listSkillNativeSchedulerRuns(state.resolution.paths, changeId))[0]?.id
    ?? "no-runtime-run";
  return {
    changeId,
    changeEvidenceRoot: evidenceRoot,
    planningRoot: join(evidenceRoot, "planning"),
    runtimeRoot,
    artifactRoots: [state.resolution.harness.skillRoot, state.resolution.paths.sidecarRoot],
    runArtifacts: skillNativeSchedulerRunArtifactPaths(runtimeRoot, currentRunId),
  };
}
