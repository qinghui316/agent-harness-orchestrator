import type { ReadySetWorkflowGraphPlan, ResolvedMemory, WorkflowRunSummary } from "../types/index.js";
import {
  readSchedulerReconcileSnapshotProjection,
  readSchedulerReconcileSnapshotByIdProjection,
  findSchedulerRuntimeWorkerAuditForValidation,
  findSchedulerRuntimeWorkerResultForStart,
  findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence,
  findSchedulerRuntimeWorkerReworkAuditForValidation,
  findSchedulerRuntimeWorkerReworkResultForStart,
  findSchedulerRuntimeWorkerReworkValidationForResult,
  findSchedulerRuntimeWorkerReworkStartForPlan,
  findSchedulerRuntimeWorkerValidationForResult,
  listSchedulerRuntimeWorkerStarts,
  readLatestSchedulerIntegrationCandidateProjection,
  readLatestSchedulerIntegrationCheckHandoffProjection,
  readLatestSchedulerIntegrationOutcomeProjection,
  readLatestSchedulerRunBlockedCloseoutProjection,
  readLatestSchedulerRunCompletionProjection,
  readSchedulerIntegrationCandidateProjection as readSchedulerIntegrationCandidateArtifactProjection,
  readSchedulerIntegrationCheckHandoffProjection as readSchedulerIntegrationCheckHandoffArtifactProjection,
  readSchedulerIntegrationOutcomeProjection as readSchedulerIntegrationOutcomeArtifactProjection,
  readSchedulerRunBlockedCloseoutProjection as readSchedulerRunBlockedCloseoutArtifactProjection,
  readSchedulerRunCompletionProjection as readSchedulerRunCompletionArtifactProjection,
  readSchedulerRuntimeWorkerAuditProjection,
  readSchedulerRuntimeWorkerReworkPlanProjection,
  readSchedulerRuntimeWorkerReworkAuditProjection,
  readSchedulerRuntimeWorkerReworkResultProjection,
  readSchedulerRuntimeWorkerReworkValidationProjection,
  readSchedulerRuntimeWorkerReworkStartProjection,
  readSchedulerRuntimeWorkerValidationProjection,
  readSchedulerWorkerPathReadModels,
  readSchedulerRuntimeClaimReservationProjection,
  readSchedulerRuntimeStateProjection,
  type SchedulerReconcileSnapshot,
  type SchedulerRuntimeClaimReservation,
  type SchedulerIntegrationCandidate,
  type SchedulerIntegrationCheckHandoff,
  type SchedulerIntegrationOutcome,
  type SchedulerRunBlockedCloseout,
  type SchedulerRunCompletion,
  type SchedulerRuntimeState,
  type SchedulerRuntimeWorkerResult,
  type SchedulerRuntimeWorkerStart,
  type SchedulerRuntimeWorkerAudit,
  type SchedulerRuntimeWorkerReworkPlan,
  type SchedulerRuntimeWorkerReworkAudit,
  type SchedulerRuntimeWorkerReworkResult,
  type SchedulerRuntimeWorkerReworkValidation,
  type SchedulerRuntimeWorkerReworkStart,
  type SchedulerRuntimeWorkerValidation,
} from "../scheduler-runtime/manager.js";
import { readIntegrationCheck } from "../integration-check/manager.js";
import { createSchedulerArtifactStore } from "../scheduler-runtime/artifact-store.js";
import { basename, join } from "node:path";
import type { SchedulerCurrentTransition } from "../workflow-actions/scheduler-current-transition.js";
import type { SchedulerCurrentTransitionView } from "../workflow-runtime/scheduler-current-transition-view.js";
import type { WorkbenchThreadActionType } from "../workflow-actions/registry.js";
import {
  readLatestWorkflowGraphPlan,
  readWorkflowGraphPlan,
  type WorkflowGraphPlan,
} from "../workflow-artifacts/manager.js";
import {
  readLatestSchedulerClaimReconcilePlan,
  readLatestSchedulerLaunchPreflight,
  readLatestSchedulerRun,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerContract,
  readLatestSchedulerWorkerSessionPlan,
  readSchedulerClaimReconcilePlan,
  readSchedulerLaunchPreflight,
  readSchedulerRun,
  readSchedulerRunJournal,
  readSchedulerDispatchDryRun,
  readSchedulerContract,
  readSchedulerWorkerSessionPlan,
  type SchedulerClaimReconcilePlan,
  type SchedulerLaunchPreflight,
  type SchedulerRun,
  type SchedulerWorkerSessionPlan,
  type SchedulerDispatchDryRun,
  type SchedulerContract,
} from "../workflow-scheduler/manager.js";

function workbenchSchedulerArtifactStore(memory: ResolvedMemory, changePath: string) {
  return createSchedulerArtifactStore({
    changeId: basename(changePath),
    changeEvidenceRoot: join(memory.memoryRoot, changePath),
    artifactRoots: [memory.memoryRoot, memory.projectRoot],
  });
}

export interface WorkbenchWorkflowGraphPlanSummary {
  id: string;
  changeId: string;
  status: WorkflowGraphPlan["status"];
  graphMode: WorkflowGraphPlan["graphMode"];
  authoringContractVersion?: "1.0";
  schedulerContractId?: string;
  schedulerWorkerPlanId?: string;
  schedulerClaimReconcilePlanId?: string;
  nodeCount: number;
  edgeCount: number;
  waveCount?: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerContractSummary {
  id: string;
  changeId: string;
  status: SchedulerContract["status"];
  schedulerMode: SchedulerContract["schedulerMode"];
  workflowGraphPlanId: string;
  nodeCount: number;
  waveCount: number;
  dependencyCount: number;
  conflictCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerDispatchDryRunSummary {
  id: string;
  changeId: string;
  status: SchedulerDispatchDryRun["status"];
  schedulerMode: SchedulerDispatchDryRun["schedulerMode"];
  schedulerContractId: string;
  waveCount: number;
  nodeCount: number;
  blockedCount: number;
  estimatedMaxWaveWidth: number;
  prerequisiteCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerSessionPlanSummary {
  id: string;
  changeId: string;
  status: SchedulerWorkerSessionPlan["status"];
  schedulerMode: SchedulerWorkerSessionPlan["schedulerMode"];
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  plannedWorkerCount: number;
  stageCount: number;
  blockedCount: number;
  warningCount: number;
  recoveryKeyCoverage: SchedulerWorkerSessionPlan["recoveryKeyCoverage"];
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerClaimReconcilePlanSummary {
  id: string;
  changeId: string;
  status: SchedulerClaimReconcilePlan["status"];
  schedulerMode: SchedulerClaimReconcilePlan["schedulerMode"];
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  waveCount: number;
  claimIntentCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  recoveryKeyCoverage: SchedulerClaimReconcilePlan["recoveryKeyCoverage"];
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerLaunchPreflightSummary {
  id: string;
  changeId: string;
  status: SchedulerLaunchPreflight["status"];
  schedulerMode: SchedulerLaunchPreflight["schedulerMode"];
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  claimIntentCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  humanGateRequired: boolean;
  toolPolicyGateRequired: boolean;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerRunSummary {
  id: string;
  changeId: string;
  status: SchedulerRun["status"];
  schedulerMode: SchedulerRun["schedulerMode"];
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  claimIntentCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  humanConfirmed: boolean;
  futureToolPolicyGateRequired: boolean;
  futureHumanGateRequired: boolean;
  journalEventCount: number;
  artifact?: string;
  markdownArtifact?: string;
  journalArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerRuntimeSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  status: SchedulerRuntimeState["status"];
  schedulerMode: SchedulerRuntimeState["schedulerMode"];
  claimIntentCount: number;
  waveCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  lastReconcileSnapshotId?: string;
  lastClaimReservationId?: string;
  lastClaimReservationSnapshotId?: string;
  artifact?: string;
  eventsArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerClaimReservationSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerReconcileSnapshotId: string;
  status: SchedulerRuntimeClaimReservation["status"];
  schedulerMode: SchedulerRuntimeClaimReservation["schedulerMode"];
  reservedCount: number;
  blockedCount: number;
  sourceLockCount: number;
  waveIndex: number;
  reservationIntents: WorkbenchSchedulerClaimReservationIntentSummary[];
  launchConfirmed?: boolean;
  supersedesReservationId?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerClaimReservationIntentSummary {
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  status: SchedulerRuntimeClaimReservation["reservationIntents"][number]["status"];
}

export interface WorkbenchSchedulerWorkerStartSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerReconcileSnapshotId: string;
  status: SchedulerRuntimeWorkerStart["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "coder";
  taskRunId: string;
  workerLeaseId: string;
  worktreeId?: string;
  runId?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export type WorkbenchSchedulerWorkerPathStatus =
  | "start-failed"
  | "result-pending"
  | "result-failed"
  | "validation-pending"
  | "validation-failed"
  | "audit-pending"
  | "audit-approved"
  | "audit-blocked"
  | "audit-failed"
  | "rework-plan-pending"
  | "rework-start-pending"
  | "rework-start-failed"
  | "rework-result-pending"
  | "rework-result-failed"
  | "rework-validation-pending"
  | "rework-validation-failed"
  | "rework-audit-pending"
  | "rework-audit-approved"
  | "rework-audit-blocked"
  | "rework-audit-failed";

export interface WorkbenchSchedulerWorkerPathSummary {
  start: WorkbenchSchedulerWorkerStartSummary;
  result?: WorkbenchSchedulerWorkerResultSummary;
  validation?: WorkbenchSchedulerWorkerValidationSummary;
  audit?: WorkbenchSchedulerWorkerAuditSummary;
  reworkPlan?: WorkbenchSchedulerWorkerReworkPlanSummary;
  reworkStart?: WorkbenchSchedulerWorkerReworkStartSummary;
  reworkResult?: WorkbenchSchedulerWorkerReworkResultSummary;
  reworkValidation?: WorkbenchSchedulerWorkerReworkValidationSummary;
  reworkAudit?: WorkbenchSchedulerWorkerReworkAuditSummary;
  status: WorkbenchSchedulerWorkerPathStatus;
  terminal: boolean;
}

export interface WorkbenchSchedulerWorkerResultSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  status: SchedulerRuntimeWorkerResult["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "coder";
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  workerLeaseStatus: string;
  worktreeId?: string;
  runId?: string;
  runStatus?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerValidationSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  status: SchedulerRuntimeWorkerValidation["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "validation";
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  codeRunId: string;
  validationRunId: string;
  validationStatus: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerAuditSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  status: SchedulerRuntimeWorkerAudit["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "audit";
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  codeRunId: string;
  validationRunId: string;
  validationStatus: string;
  auditRunId: string;
  auditStatus: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerReworkPlanSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  status: SchedulerRuntimeWorkerReworkPlan["status"];
  blockingSource: SchedulerRuntimeWorkerReworkPlan["blockingSource"];
  reworkReason: string;
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "bounded-rework";
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  targetWorktreeId: string;
  targetCodeRunId: string;
  validationRunId: string;
  auditRunId?: string;
  futureCodeGateMode: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerReworkStartSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  status: SchedulerRuntimeWorkerReworkStart["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "bounded-rework";
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  worktreeId: string;
  originalCodeRunId: string;
  reworkRunId?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerReworkResultSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  schedulerWorkerReworkStartId: string;
  status: SchedulerRuntimeWorkerReworkResult["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "bounded-rework";
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  originalCodeRunId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  taskRunStatus: string;
  workerLeaseStatus: string;
  worktreeId: string;
  reworkRunId?: string;
  reworkRunStatus?: string;
  failureReason?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerReworkValidationSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  schedulerWorkerReworkStartId: string;
  schedulerWorkerReworkResultId: string;
  status: SchedulerRuntimeWorkerReworkValidation["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "validation";
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  originalCodeRunId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  reworkRunId: string;
  validationRunId: string;
  validationStatus: SchedulerRuntimeWorkerReworkValidation["validationStatus"];
  failureReason?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerReworkAuditSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  schedulerWorkerReworkStartId: string;
  schedulerWorkerReworkResultId: string;
  schedulerWorkerReworkValidationId: string;
  status: SchedulerRuntimeWorkerReworkAudit["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "audit";
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  originalCodeRunId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  reworkRunId: string;
  validationRunId: string;
  auditRunId: string;
  auditStatus: SchedulerRuntimeWorkerReworkAudit["auditStatus"];
  failureReason?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerIntegrationCandidateSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerReconcileSnapshotId: string;
  status: SchedulerIntegrationCandidate["status"];
  readyCount: number;
  blockedCount: number;
  readyWorktreeIds: string[];
  outputClaimIntentIds: string[];
  waitingReason?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerIntegrationCheckHandoffSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerReconcileSnapshotId: string;
  schedulerIntegrationCandidateId: string;
  status: SchedulerIntegrationCheckHandoff["status"];
  integrationCheckId: string;
  integrationCheckStatus: string;
  currentIntegrationCheckStatus?: string;
  readyCount: number;
  readyWorktreeIds: string[];
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerIntegrationOutcomeSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerReconcileSnapshotId: string;
  schedulerIntegrationCandidateId: string;
  schedulerIntegrationCheckHandoffId: string;
  status: SchedulerIntegrationOutcome["status"];
  integrationCheckId: string;
  integrationCheckStatus: string;
  readyCount: number;
  resultTargetCount: number;
  outcomeReason: string;
  appliedAt?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerRunCompletionSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerReconcileSnapshotId: string;
  schedulerIntegrationCandidateId: string;
  schedulerIntegrationCheckHandoffId: string;
  schedulerIntegrationOutcomeId: string;
  status: SchedulerRunCompletion["status"];
  outcomeStatus: SchedulerRunCompletion["outcomeStatus"];
  integrationCheckId: string;
  integrationCheckStatus: string;
  readyCount: number;
  resultTargetCount: number;
  outcomeReason: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerRunBlockedCloseoutSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerReconcileSnapshotId: string;
  schedulerIntegrationCandidateId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  status: SchedulerRunBlockedCloseout["status"];
  reason: SchedulerRunBlockedCloseout["reason"];
  readyCount: number;
  blockedCount: number;
  readyWorktreeIds: string[];
  closeoutReason: string;
  blockedReasons: string[];
  unstartedReservedIntentIds: string[];
  sourceMutated: false;
  executionStarted: false;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerReconcileSnapshotSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  status: SchedulerReconcileSnapshot["status"];
  schedulerMode: SchedulerReconcileSnapshot["schedulerMode"];
  claimIntentCount: number;
  waveCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  warningCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

type WorkflowProjectionActionType = WorkbenchThreadActionType;

export interface WorkbenchTypedWorkflowNextAction {
  id: string;
  label: string;
  description: string;
  kind: "workflow-action";
  enabled: boolean;
  requiresConfirmation: boolean;
  actionType: WorkflowProjectionActionType;
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
  schedulerRunBlockedCloseoutId?: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  taskRunId?: string;
  workerLeaseId?: string;
  worktreeId?: string;
  worktreeIds?: string[];
  applyCheckId?: string;
  runId?: string;
  validationRunId?: string;
  reworkValidationRunId?: string;
  auditRunId?: string;
  reworkAuditRunId?: string;
  disabledReason?: string;
}

export interface TypedWorkflowProjectionTopic {
  runs: Array<{ runtime?: string }>;
}

export interface TypedWorkflowProjectionReadiness {
  specReady: boolean;
  planReady: boolean;
  tasksReady: boolean;
}

export interface WorkbenchSchedulerCurrentTransitionProjection {
  schedulerRun: WorkbenchSchedulerRunSummary;
  schedulerRuntime: WorkbenchSchedulerRuntimeSummary;
  schedulerReconcileSnapshot: WorkbenchSchedulerReconcileSnapshotSummary;
  schedulerClaimReservation: WorkbenchSchedulerClaimReservationSummary;
  schedulerWorkerStart?: WorkbenchSchedulerWorkerStartSummary;
  schedulerWorkerResult?: WorkbenchSchedulerWorkerResultSummary;
  schedulerWorkerValidation?: WorkbenchSchedulerWorkerValidationSummary;
  schedulerWorkerAudit?: WorkbenchSchedulerWorkerAuditSummary;
  schedulerWorkerReworkPlan?: WorkbenchSchedulerWorkerReworkPlanSummary;
  schedulerWorkerReworkStart?: WorkbenchSchedulerWorkerReworkStartSummary;
  schedulerWorkerReworkResult?: WorkbenchSchedulerWorkerReworkResultSummary;
  schedulerWorkerReworkValidation?: WorkbenchSchedulerWorkerReworkValidationSummary;
  schedulerWorkerReworkAudit?: WorkbenchSchedulerWorkerReworkAuditSummary;
  schedulerWorkerPaths: WorkbenchSchedulerWorkerPathSummary[];
  schedulerIntegrationCandidate?: WorkbenchSchedulerIntegrationCandidateSummary;
  schedulerIntegrationCheckHandoff?: WorkbenchSchedulerIntegrationCheckHandoffSummary;
  schedulerIntegrationOutcome?: WorkbenchSchedulerIntegrationOutcomeSummary;
  schedulerRunCompletion?: WorkbenchSchedulerRunCompletionSummary;
  schedulerRunBlockedCloseout?: WorkbenchSchedulerRunBlockedCloseoutSummary;
  nextAction: WorkbenchTypedWorkflowNextAction;
}

export function buildSchedulerCurrentTransitionProjection(input: {
  topic: TypedWorkflowProjectionTopic;
  workflowGraphPlan: WorkbenchWorkflowGraphPlanSummary;
  view: SchedulerCurrentTransitionView;
}): WorkbenchSchedulerCurrentTransitionProjection {
  const { view } = input;
  const schedulerRun: WorkbenchSchedulerRunSummary = {
    id: view.run.id,
    changeId: view.run.changeId,
    status: view.run.status,
    schedulerMode: view.run.schedulerMode,
    schedulerContractId: view.run.schedulerContractId,
    schedulerDispatchDryRunId: view.run.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: view.run.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: view.run.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: view.run.schedulerLaunchPreflightId,
    claimIntentCount: view.run.claimIntentCount,
    plannedSlotDemand: view.run.plannedSlotDemand,
    maxPlannedWaveWidth: view.run.maxPlannedWaveWidth,
    blockedCount: view.run.blockedCount,
    humanConfirmed: view.run.humanConfirmed,
    futureToolPolicyGateRequired: view.run.futureToolPolicyGateRequired,
    futureHumanGateRequired: view.run.futureHumanGateRequired,
    journalEventCount: view.runJournalEventCount,
    artifact: view.run.artifact,
    markdownArtifact: view.run.markdownArtifact,
    journalArtifact: view.run.journalArtifact,
    updatedAt: view.run.updatedAt,
  };
  const schedulerRuntime: WorkbenchSchedulerRuntimeSummary = {
    id: view.runtimeState.id,
    changeId: view.runtimeState.changeId,
    schedulerRunId: view.runtimeState.schedulerRunId,
    status: view.runtimeState.status,
    schedulerMode: view.runtimeState.schedulerMode,
    claimIntentCount: view.runtimeState.claimIntents.length,
    waveCount: view.runtimeState.waves.length,
    plannedSlotDemand: view.runtimeState.plannedSlotDemand,
    maxPlannedWaveWidth: view.runtimeState.maxPlannedWaveWidth,
    blockedCount: view.runtimeState.blockedCount,
    lastReconcileSnapshotId: view.runtimeState.lastReconcileSnapshotId,
    lastClaimReservationId: view.runtimeState.lastClaimReservationId,
    lastClaimReservationSnapshotId: view.runtimeState.lastClaimReservationSnapshotId,
    artifact: view.runtimeState.artifact,
    eventsArtifact: view.runtimeState.eventsArtifact,
    updatedAt: view.runtimeState.updatedAt,
  };
  const schedulerReconcileSnapshot: WorkbenchSchedulerReconcileSnapshotSummary = {
    id: view.reconcileSnapshot.id,
    changeId: view.reconcileSnapshot.changeId,
    schedulerRunId: view.reconcileSnapshot.schedulerRunId,
    status: view.reconcileSnapshot.status,
    schedulerMode: view.reconcileSnapshot.schedulerMode,
    claimIntentCount: view.reconcileSnapshot.claimIntents.length,
    waveCount: view.reconcileSnapshot.waves.length,
    plannedSlotDemand: view.reconcileSnapshot.plannedSlotDemand,
    maxPlannedWaveWidth: view.reconcileSnapshot.maxPlannedWaveWidth,
    blockedCount: view.reconcileSnapshot.blockedCount,
    warningCount: view.reconcileSnapshot.warningCount,
    artifact: view.reconcileSnapshot.artifact,
    markdownArtifact: view.reconcileSnapshot.markdownArtifact,
    updatedAt: view.reconcileSnapshot.createdAt,
  };
  const schedulerClaimReservation: WorkbenchSchedulerClaimReservationSummary = {
    id: view.reservation.id,
    changeId: view.reservation.changeId,
    schedulerRunId: view.reservation.schedulerRunId,
    schedulerReconcileSnapshotId: view.reservation.schedulerReconcileSnapshotId,
    status: view.reservation.status,
    schedulerMode: view.reservation.schedulerMode,
    reservedCount: view.reservation.reservedCount,
    blockedCount: view.reservation.blockedCount,
    sourceLockCount: view.reservation.sourceLockCount,
    waveIndex: view.reservation.waves[0]?.waveIndex ?? 0,
    reservationIntents: view.reservation.reservationIntents.map((intent) => ({
      reservationIntentId: intent.reservationIntentId,
      claimIntentId: intent.claimIntentId,
      plannedWorkerKey: intent.plannedWorkerKey,
      nodeId: intent.nodeId,
      unitId: intent.unitId,
      waveIndex: intent.waveIndex,
      status: intent.status,
    })),
    launchConfirmed: view.reservation.launchConfirmed,
    supersedesReservationId: view.reservation.supersedesReservationId,
    artifact: view.reservation.artifact,
    markdownArtifact: view.reservation.markdownArtifact,
    updatedAt: view.reservation.createdAt,
  };
  const schedulerWorkerPaths = view.workerPaths.map((path): WorkbenchSchedulerWorkerPathSummary => ({
    start: summarizeSchedulerWorkerStart(path.start),
    ...(path.result ? { result: summarizeSchedulerWorkerResult(path.result) } : {}),
    ...(path.validation ? { validation: summarizeSchedulerWorkerValidation(path.validation) } : {}),
    ...(path.audit ? { audit: summarizeSchedulerWorkerAudit(path.audit) } : {}),
    ...(path.reworkPlan ? { reworkPlan: summarizeSchedulerWorkerReworkPlan(path.reworkPlan) } : {}),
    ...(path.reworkStart ? { reworkStart: summarizeSchedulerWorkerReworkStart(path.reworkStart) } : {}),
    ...(path.reworkResult ? { reworkResult: summarizeSchedulerWorkerReworkResult(path.reworkResult) } : {}),
    ...(path.reworkValidation ? { reworkValidation: summarizeSchedulerWorkerReworkValidation(path.reworkValidation) } : {}),
    ...(path.reworkAudit ? { reworkAudit: summarizeSchedulerWorkerReworkAudit(path.reworkAudit) } : {}),
    status: path.status,
    terminal: path.terminal,
  }));
  const workerTargetStartId = view.transition.kind === "worker-step"
    ? view.transition.worker.schedulerWorkerStartId
    : undefined;
  const currentWorkerPath = schedulerWorkerPaths.find((path) => path.start.id === workerTargetStartId)
    ?? schedulerWorkerPaths.at(-1);
  const schedulerIntegrationCandidate = view.integrationCandidate
    ? summarizeSchedulerIntegrationCandidate(view.integrationCandidate)
    : undefined;
  const schedulerIntegrationCheckHandoff = view.integrationCheckHandoff
    ? summarizeSchedulerIntegrationCheckHandoff(view.integrationCheckHandoff, view.currentIntegrationCheck?.status)
    : undefined;
  const schedulerIntegrationOutcome = view.integrationOutcome
    ? summarizeSchedulerIntegrationOutcome(view.integrationOutcome)
    : undefined;
  const schedulerRunCompletion = view.runCompletion
    ? summarizeSchedulerRunCompletion(view.runCompletion)
    : undefined;
  const schedulerRunBlockedCloseout = view.runBlockedCloseout
    ? summarizeSchedulerRunBlockedCloseout(view.runBlockedCloseout)
    : undefined;
  const projection = {
    schedulerRun,
    schedulerRuntime,
    schedulerReconcileSnapshot,
    schedulerClaimReservation,
    schedulerWorkerStart: currentWorkerPath?.start,
    schedulerWorkerResult: currentWorkerPath?.result,
    schedulerWorkerValidation: currentWorkerPath?.validation,
    schedulerWorkerAudit: currentWorkerPath?.audit,
    schedulerWorkerReworkPlan: currentWorkerPath?.reworkPlan,
    schedulerWorkerReworkStart: currentWorkerPath?.reworkStart,
    schedulerWorkerReworkResult: currentWorkerPath?.reworkResult,
    schedulerWorkerReworkValidation: currentWorkerPath?.reworkValidation,
    schedulerWorkerReworkAudit: currentWorkerPath?.reworkAudit,
    schedulerWorkerPaths,
    schedulerIntegrationCandidate,
    schedulerIntegrationCheckHandoff,
    schedulerIntegrationOutcome,
    schedulerRunCompletion,
    schedulerRunBlockedCloseout,
  };
  return {
    ...projection,
    nextAction: buildTypedWorkflowNextAction({
      topic: input.topic,
      readiness: { specReady: true, planReady: true, tasksReady: true },
      workflowGraphPlan: input.workflowGraphPlan,
      schedulerReadySetGraph: view.graph,
      schedulerTransition: view.transition,
      schedulerIntegrationCandidateNeedsRefresh: view.integrationCandidateNeedsRefresh,
      ...projection,
    }),
  };
}

export interface TypedWorkflowProjectionIntake {
  pendingClarifications: unknown[];
  openQuestions: unknown[];
}

export async function readLatestWorkflowGraphPlanSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchWorkflowGraphPlanSummary | null> {
  const graph = await readLatestWorkflowGraphPlan(memory, changePath).catch(() => null);
  if (!graph) return null;
  return {
    id: graph.id,
    changeId: graph.changeId,
    status: graph.status,
    graphMode: graph.graphMode,
    authoringContractVersion: graph.authoringContractVersion,
    schedulerContractId: graph.graphMode === "ready-set-v1" ? graph.schedulerContractId : undefined,
    schedulerWorkerPlanId: graph.graphMode === "ready-set-v1" ? graph.schedulerWorkerPlanId : undefined,
    schedulerClaimReconcilePlanId: graph.graphMode === "ready-set-v1" ? graph.schedulerClaimReconcilePlanId : undefined,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    waveCount: graph.graphMode === "ready-set-v1" ? graph.waves.length : undefined,
    artifact: graph.artifact,
    markdownArtifact: graph.markdownArtifact,
    updatedAt: graph.updatedAt,
  };
}

export async function readLatestSchedulerContractSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerContractSummary | null> {
  const contract = await readLatestSchedulerContract(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
  if (!contract) return null;
  return {
    id: contract.id,
    changeId: contract.changeId,
    status: contract.status,
    schedulerMode: contract.schedulerMode,
    workflowGraphPlanId: contract.workflowGraphPlanId,
    nodeCount: contract.nodes.length,
    waveCount: contract.waves.length,
    dependencyCount: contract.edges.length,
    conflictCount: contract.conflictScopes.length,
    artifact: contract.artifact,
    markdownArtifact: contract.markdownArtifact,
    updatedAt: contract.updatedAt,
  };
}

export async function readLatestSchedulerDispatchDryRunSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerDispatchDryRunSummary | null> {
  const dryRun = await readLatestSchedulerDispatchDryRun(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
  if (!dryRun) return null;
  return {
    id: dryRun.id,
    changeId: dryRun.changeId,
    status: dryRun.status,
    schedulerMode: dryRun.schedulerMode,
    schedulerContractId: dryRun.schedulerContractId,
    waveCount: dryRun.waveVerdicts.length,
    nodeCount: dryRun.nodeVerdicts.length,
    blockedCount: dryRun.nodeVerdicts.filter((node) => node.status === "blocked").length,
    estimatedMaxWaveWidth: dryRun.estimatedMaxWaveWidth,
    prerequisiteCount: dryRun.runtimeContinuityPrerequisites.length,
    artifact: dryRun.artifact,
    markdownArtifact: dryRun.markdownArtifact,
    updatedAt: dryRun.updatedAt,
  };
}

export async function readLatestSchedulerWorkerSessionPlanSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerWorkerSessionPlanSummary | null> {
  const plan = await readLatestSchedulerWorkerSessionPlan(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
  if (!plan) return null;
  return {
    id: plan.id,
    changeId: plan.changeId,
    status: plan.status,
    schedulerMode: plan.schedulerMode,
    schedulerContractId: plan.schedulerContractId,
    schedulerDispatchDryRunId: plan.schedulerDispatchDryRunId,
    plannedWorkerCount: plan.plannedWorkerCount,
    stageCount: plan.stageCount,
    blockedCount: plan.blockedCount,
    warningCount: plan.warningCount,
    recoveryKeyCoverage: plan.recoveryKeyCoverage,
    artifact: plan.artifact,
    markdownArtifact: plan.markdownArtifact,
    updatedAt: plan.updatedAt,
  };
}

export async function readLatestSchedulerClaimReconcilePlanSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerClaimReconcilePlanSummary | null> {
  const plan = await readLatestSchedulerClaimReconcilePlan(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
  if (!plan) return null;
  return {
    id: plan.id,
    changeId: plan.changeId,
    status: plan.status,
    schedulerMode: plan.schedulerMode,
    schedulerContractId: plan.schedulerContractId,
    schedulerDispatchDryRunId: plan.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: plan.schedulerWorkerPlanId,
    waveCount: plan.waveCheckpoints.length,
    claimIntentCount: plan.claimIntents.length,
    plannedSlotDemand: plan.plannedSlotDemand,
    maxPlannedWaveWidth: plan.maxPlannedWaveWidth,
    blockedCount: plan.blockedCount,
    recoveryKeyCoverage: plan.recoveryKeyCoverage,
    artifact: plan.artifact,
    markdownArtifact: plan.markdownArtifact,
    updatedAt: plan.updatedAt,
  };
}

export async function readLatestSchedulerLaunchPreflightSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerLaunchPreflightSummary | null> {
  const preflight = await readLatestSchedulerLaunchPreflight(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
  if (!preflight) return null;
  return {
    id: preflight.id,
    changeId: preflight.changeId,
    status: preflight.status,
    schedulerMode: preflight.schedulerMode,
    schedulerContractId: preflight.schedulerContractId,
    schedulerDispatchDryRunId: preflight.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: preflight.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: preflight.schedulerClaimReconcilePlanId,
    claimIntentCount: preflight.claimSummaries.length,
    plannedSlotDemand: preflight.plannedSlotDemand,
    maxPlannedWaveWidth: preflight.maxPlannedWaveWidth,
    blockedCount: preflight.blockedCount,
    humanGateRequired: preflight.humanGateRequirement.status === "required",
    toolPolicyGateRequired: preflight.toolPolicyGateRequirement.status === "required",
    artifact: preflight.artifact,
    markdownArtifact: preflight.markdownArtifact,
    updatedAt: preflight.updatedAt,
  };
}

export async function readLatestSchedulerRunSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerRunSummary | null> {
  const run = await readLatestSchedulerRun(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
  if (!run) return null;
  const journal = await readSchedulerRunJournal(workbenchSchedulerArtifactStore(memory, changePath), changePath, run.id).catch(() => []);
  return {
    id: run.id,
    changeId: run.changeId,
    status: run.status,
    schedulerMode: run.schedulerMode,
    schedulerContractId: run.schedulerContractId,
    schedulerDispatchDryRunId: run.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: run.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: run.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
    claimIntentCount: run.claimIntentCount,
    plannedSlotDemand: run.plannedSlotDemand,
    maxPlannedWaveWidth: run.maxPlannedWaveWidth,
    blockedCount: run.blockedCount,
    humanConfirmed: run.humanConfirmed,
    futureToolPolicyGateRequired: run.futureToolPolicyGateRequired,
    futureHumanGateRequired: run.futureHumanGateRequired,
    journalEventCount: journal.length,
    artifact: run.artifact,
    markdownArtifact: run.markdownArtifact,
    journalArtifact: run.journalArtifact,
    updatedAt: run.updatedAt,
  };
}

export async function readSchedulerRuntimeSummary(memory: ResolvedMemory, changePath: string, schedulerRunId?: string): Promise<WorkbenchSchedulerRuntimeSummary | null> {
  if (!schedulerRunId) return null;
  const state = await readSchedulerRuntimeStateProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId);
  if (!state) return null;
  return {
    id: state.id,
    changeId: state.changeId,
    schedulerRunId: state.schedulerRunId,
    status: state.status,
    schedulerMode: state.schedulerMode,
    claimIntentCount: state.claimIntents.length,
    waveCount: state.waves.length,
    plannedSlotDemand: state.plannedSlotDemand,
    maxPlannedWaveWidth: state.maxPlannedWaveWidth,
    blockedCount: state.blockedCount,
    lastReconcileSnapshotId: state.lastReconcileSnapshotId,
    lastClaimReservationId: state.lastClaimReservationId,
    lastClaimReservationSnapshotId: state.lastClaimReservationSnapshotId,
    artifact: state.artifact,
    eventsArtifact: state.eventsArtifact,
    updatedAt: state.updatedAt,
  };
}

export async function readSchedulerClaimReservationSummary(memory: ResolvedMemory, changePath: string, schedulerRunId?: string, reservationId?: string): Promise<WorkbenchSchedulerClaimReservationSummary | null> {
  if (!schedulerRunId || !reservationId) return null;
  const reservation = await readSchedulerRuntimeClaimReservationProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reservationId);
  if (!reservation) return null;
  return {
    id: reservation.id,
    changeId: reservation.changeId,
    schedulerRunId: reservation.schedulerRunId,
    schedulerReconcileSnapshotId: reservation.schedulerReconcileSnapshotId,
    status: reservation.status,
    schedulerMode: reservation.schedulerMode,
    reservedCount: reservation.reservedCount,
    blockedCount: reservation.blockedCount,
    sourceLockCount: reservation.sourceLockCount,
    waveIndex: reservation.waves[0]?.waveIndex ?? 0,
    reservationIntents: reservation.reservationIntents.map((intent) => ({
      reservationIntentId: intent.reservationIntentId,
      claimIntentId: intent.claimIntentId,
      plannedWorkerKey: intent.plannedWorkerKey,
      nodeId: intent.nodeId,
      unitId: intent.unitId,
      waveIndex: intent.waveIndex,
      status: intent.status,
    })),
    supersedesReservationId: reservation.supersedesReservationId,
    artifact: reservation.artifact,
    markdownArtifact: reservation.markdownArtifact,
    updatedAt: reservation.createdAt,
  };
}

export async function readLatestSchedulerWorkerStartSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  schedulerClaimReservationId?: string,
): Promise<WorkbenchSchedulerWorkerStartSummary | null> {
  if (!schedulerRunId) return null;
  const starts = await listSchedulerRuntimeWorkerStarts(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId).catch(() => []);
  const scoped = schedulerClaimReservationId ? starts.filter((start) => start.schedulerClaimReservationId === schedulerClaimReservationId) : starts;
  const start = [...scoped].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
  return start ? summarizeSchedulerWorkerStart(start) : null;
}

export async function readSchedulerWorkerPathSummaries(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  schedulerClaimReservationId?: string,
): Promise<WorkbenchSchedulerWorkerPathSummary[]> {
  if (!schedulerRunId) return [];
  const paths = await readSchedulerWorkerPathReadModels(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, { schedulerClaimReservationId }).catch(() => []);
  return paths.map((path) => {
    return {
      start: summarizeSchedulerWorkerStart(path.start),
      ...(path.result ? { result: summarizeSchedulerWorkerResult(path.result) } : {}),
      ...(path.validation ? { validation: summarizeSchedulerWorkerValidation(path.validation) } : {}),
      ...(path.audit ? { audit: summarizeSchedulerWorkerAudit(path.audit) } : {}),
      ...(path.reworkPlan ? { reworkPlan: summarizeSchedulerWorkerReworkPlan(path.reworkPlan) } : {}),
      ...(path.reworkStart ? { reworkStart: summarizeSchedulerWorkerReworkStart(path.reworkStart) } : {}),
      ...(path.reworkResult ? { reworkResult: summarizeSchedulerWorkerReworkResult(path.reworkResult) } : {}),
      ...(path.reworkValidation ? { reworkValidation: summarizeSchedulerWorkerReworkValidation(path.reworkValidation) } : {}),
      ...(path.reworkAudit ? { reworkAudit: summarizeSchedulerWorkerReworkAudit(path.reworkAudit) } : {}),
      status: path.status,
      terminal: path.terminal,
    };
  });
}

export async function readSchedulerWorkerResultSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  workerStartId?: string,
): Promise<WorkbenchSchedulerWorkerResultSummary | null> {
  if (!schedulerRunId || !workerStartId) return null;
  const result = await findSchedulerRuntimeWorkerResultForStart(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, workerStartId).catch(() => null);
  return result ? summarizeSchedulerWorkerResult(result) : null;
}

export async function readSchedulerWorkerValidationSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  workerResultId?: string,
): Promise<WorkbenchSchedulerWorkerValidationSummary | null> {
  if (!schedulerRunId || !workerResultId) return null;
  const validation = await findSchedulerRuntimeWorkerValidationForResult(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, workerResultId).catch(() => null);
  return validation ? summarizeSchedulerWorkerValidation(validation) : null;
}

export async function readSchedulerWorkerAuditSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  workerValidationId?: string,
): Promise<WorkbenchSchedulerWorkerAuditSummary | null> {
  if (!schedulerRunId || !workerValidationId) return null;
  const audit = await findSchedulerRuntimeWorkerAuditForValidation(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, workerValidationId).catch(() => null);
  return audit ? summarizeSchedulerWorkerAudit(audit) : null;
}

export async function readSchedulerWorkerReworkPlanSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  workerValidationId?: string,
  workerAuditId?: string,
): Promise<WorkbenchSchedulerWorkerReworkPlanSummary | null> {
  if (!schedulerRunId || !workerValidationId) return null;
  const plan = await findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, {
    workerValidationId,
    workerAuditId,
  }).catch(() => null);
  return plan ? summarizeSchedulerWorkerReworkPlan(plan) : null;
}

export async function readSchedulerWorkerReworkStartSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  reworkPlanId?: string,
): Promise<WorkbenchSchedulerWorkerReworkStartSummary | null> {
  if (!schedulerRunId || !reworkPlanId) return null;
  const start = await findSchedulerRuntimeWorkerReworkStartForPlan(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reworkPlanId).catch(() => null);
  return start ? summarizeSchedulerWorkerReworkStart(start) : null;
}

export async function readSchedulerWorkerReworkResultSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  reworkStartId?: string,
): Promise<WorkbenchSchedulerWorkerReworkResultSummary | null> {
  if (!schedulerRunId || !reworkStartId) return null;
  const result = await findSchedulerRuntimeWorkerReworkResultForStart(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reworkStartId).catch(() => null);
  return result ? summarizeSchedulerWorkerReworkResult(result) : null;
}

export async function readSchedulerWorkerReworkValidationSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  reworkResultId?: string,
): Promise<WorkbenchSchedulerWorkerReworkValidationSummary | null> {
  if (!schedulerRunId || !reworkResultId) return null;
  const validation = await findSchedulerRuntimeWorkerReworkValidationForResult(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reworkResultId).catch(() => null);
  return validation ? summarizeSchedulerWorkerReworkValidation(validation) : null;
}

export async function readSchedulerWorkerReworkAuditSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  reworkValidationId?: string,
): Promise<WorkbenchSchedulerWorkerReworkAuditSummary | null> {
  if (!schedulerRunId || !reworkValidationId) return null;
  const audit = await findSchedulerRuntimeWorkerReworkAuditForValidation(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reworkValidationId).catch(() => null);
  return audit ? summarizeSchedulerWorkerReworkAudit(audit) : null;
}

export async function readLatestSchedulerIntegrationCandidateSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  schedulerClaimReservationId?: string,
): Promise<WorkbenchSchedulerIntegrationCandidateSummary | null> {
  if (!schedulerRunId) return null;
  const candidate = await readLatestSchedulerIntegrationCandidateProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId).catch(() => null);
  if (!candidate) return null;
  if (schedulerClaimReservationId && candidate.schedulerClaimReservationId !== schedulerClaimReservationId) return null;
  return summarizeSchedulerIntegrationCandidate(candidate);
}

export async function readLatestSchedulerIntegrationCheckHandoffSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  schedulerIntegrationCandidateId?: string,
): Promise<WorkbenchSchedulerIntegrationCheckHandoffSummary | null> {
  if (!schedulerRunId || !schedulerIntegrationCandidateId) return null;
  const handoff = await readLatestSchedulerIntegrationCheckHandoffProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId).catch(() => null);
  if (!handoff) return null;
  if (handoff.schedulerIntegrationCandidateId !== schedulerIntegrationCandidateId) return null;
  const check = await readIntegrationCheck(memory, handoff.integrationCheckId).catch(() => null);
  return summarizeSchedulerIntegrationCheckHandoff(handoff, check?.status);
}

export async function readLatestSchedulerIntegrationOutcomeSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  schedulerIntegrationCheckHandoffId?: string,
): Promise<WorkbenchSchedulerIntegrationOutcomeSummary | null> {
  if (!schedulerRunId || !schedulerIntegrationCheckHandoffId) return null;
  const outcome = await readLatestSchedulerIntegrationOutcomeProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId).catch(() => null);
  if (!outcome) return null;
  if (outcome.schedulerIntegrationCheckHandoffId !== schedulerIntegrationCheckHandoffId) return null;
  return summarizeSchedulerIntegrationOutcome(outcome);
}

export async function readLatestSchedulerRunCompletionSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  schedulerIntegrationOutcomeId?: string,
): Promise<WorkbenchSchedulerRunCompletionSummary | null> {
  if (!schedulerRunId || !schedulerIntegrationOutcomeId) return null;
  const completion = await readLatestSchedulerRunCompletionProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId).catch(() => null);
  if (!completion) return null;
  if (completion.schedulerIntegrationOutcomeId !== schedulerIntegrationOutcomeId) return null;
  return summarizeSchedulerRunCompletion(completion);
}

export async function readLatestSchedulerRunBlockedCloseoutSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  schedulerIntegrationCandidateId?: string,
): Promise<WorkbenchSchedulerRunBlockedCloseoutSummary | null> {
  if (!schedulerRunId || !schedulerIntegrationCandidateId) return null;
  const closeout = await readLatestSchedulerRunBlockedCloseoutProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId).catch(() => null);
  if (!closeout) return null;
  if (closeout.schedulerIntegrationCandidateId !== schedulerIntegrationCandidateId) return null;
  return summarizeSchedulerRunBlockedCloseout(closeout);
}

function summarizeSchedulerWorkerStart(start: SchedulerRuntimeWorkerStart): WorkbenchSchedulerWorkerStartSummary {
  return {
    id: start.id,
    changeId: start.changeId,
    schedulerRunId: start.schedulerRunId,
    schedulerClaimReservationId: start.schedulerClaimReservationId,
    schedulerReconcileSnapshotId: start.schedulerReconcileSnapshotId,
    status: start.status,
    reservationIntentId: start.reservationIntentId,
    claimIntentId: start.claimIntentId,
    nodeId: start.nodeId,
    unitId: start.unitId,
    stageId: start.stageId,
    stage: "coder",
    taskRunId: start.taskRunId,
    workerLeaseId: start.workerLeaseId,
    worktreeId: start.worktreeId,
    runId: start.runId,
    artifact: start.artifact,
    markdownArtifact: start.markdownArtifact,
    updatedAt: start.updatedAt,
  };
}

function summarizeSchedulerWorkerResult(result: SchedulerRuntimeWorkerResult): WorkbenchSchedulerWorkerResultSummary {
  return {
    id: result.id,
    changeId: result.changeId,
    schedulerRunId: result.schedulerRunId,
    schedulerClaimReservationId: result.schedulerClaimReservationId,
    schedulerWorkerStartId: result.schedulerWorkerStartId,
    status: result.status,
    reservationIntentId: result.reservationIntentId,
    claimIntentId: result.claimIntentId,
    nodeId: result.nodeId,
    unitId: result.unitId,
    stageId: result.stageId,
    stage: "coder",
    taskRunId: result.taskRunId,
    workerLeaseId: result.workerLeaseId,
    taskRunStatus: result.taskRunStatus,
    workerLeaseStatus: result.workerLeaseStatus,
    worktreeId: result.worktreeId,
    runId: result.runId,
    runStatus: result.runStatus,
    artifact: result.artifact,
    markdownArtifact: result.markdownArtifact,
    updatedAt: result.updatedAt,
  };
}

function summarizeSchedulerWorkerValidation(validation: SchedulerRuntimeWorkerValidation): WorkbenchSchedulerWorkerValidationSummary {
  return {
    id: validation.id,
    changeId: validation.changeId,
    schedulerRunId: validation.schedulerRunId,
    schedulerClaimReservationId: validation.schedulerClaimReservationId,
    schedulerWorkerStartId: validation.schedulerWorkerStartId,
    schedulerWorkerResultId: validation.schedulerWorkerResultId,
    status: validation.status,
    reservationIntentId: validation.reservationIntentId,
    claimIntentId: validation.claimIntentId,
    nodeId: validation.nodeId,
    unitId: validation.unitId,
    stageId: validation.stageId,
    stage: "validation",
    taskRunId: validation.taskRunId,
    workerLeaseId: validation.workerLeaseId,
    taskRunStatus: validation.taskRunStatus,
    worktreeId: validation.worktreeId,
    codeRunId: validation.codeRunId,
    validationRunId: validation.validationRunId,
    validationStatus: validation.validationStatus,
    artifact: validation.artifact,
    markdownArtifact: validation.markdownArtifact,
    updatedAt: validation.updatedAt,
  };
}

function summarizeSchedulerWorkerAudit(audit: SchedulerRuntimeWorkerAudit): WorkbenchSchedulerWorkerAuditSummary {
  return {
    id: audit.id,
    changeId: audit.changeId,
    schedulerRunId: audit.schedulerRunId,
    schedulerClaimReservationId: audit.schedulerClaimReservationId,
    schedulerWorkerStartId: audit.schedulerWorkerStartId,
    schedulerWorkerResultId: audit.schedulerWorkerResultId,
    schedulerWorkerValidationId: audit.schedulerWorkerValidationId,
    status: audit.status,
    reservationIntentId: audit.reservationIntentId,
    claimIntentId: audit.claimIntentId,
    nodeId: audit.nodeId,
    unitId: audit.unitId,
    stageId: audit.stageId,
    stage: "audit",
    taskRunId: audit.taskRunId,
    workerLeaseId: audit.workerLeaseId,
    taskRunStatus: audit.taskRunStatus,
    worktreeId: audit.worktreeId,
    codeRunId: audit.codeRunId,
    validationRunId: audit.validationRunId,
    validationStatus: audit.validationStatus,
    auditRunId: audit.auditRunId,
    auditStatus: audit.auditStatus,
    artifact: audit.artifact,
    markdownArtifact: audit.markdownArtifact,
    updatedAt: audit.updatedAt,
  };
}

function summarizeSchedulerWorkerReworkPlan(plan: SchedulerRuntimeWorkerReworkPlan): WorkbenchSchedulerWorkerReworkPlanSummary {
  return {
    id: plan.id,
    changeId: plan.changeId,
    schedulerRunId: plan.schedulerRunId,
    schedulerClaimReservationId: plan.schedulerClaimReservationId,
    schedulerWorkerStartId: plan.schedulerWorkerStartId,
    schedulerWorkerResultId: plan.schedulerWorkerResultId,
    schedulerWorkerValidationId: plan.schedulerWorkerValidationId,
    schedulerWorkerAuditId: plan.schedulerWorkerAuditId,
    status: plan.status,
    blockingSource: plan.blockingSource,
    reworkReason: plan.reworkReason,
    reservationIntentId: plan.reservationIntentId,
    claimIntentId: plan.claimIntentId,
    nodeId: plan.nodeId,
    unitId: plan.unitId,
    stageId: plan.stageId,
    stage: "bounded-rework",
    taskRunId: plan.taskRunId,
    workerLeaseId: plan.workerLeaseId,
    taskRunStatus: plan.taskRunStatus,
    targetWorktreeId: plan.targetWorktreeId,
    targetCodeRunId: plan.targetCodeRunId,
    validationRunId: plan.validationRunId,
    auditRunId: plan.auditRunId,
    futureCodeGateMode: plan.futureCodeGateMode,
    artifact: plan.artifact,
    markdownArtifact: plan.markdownArtifact,
    updatedAt: plan.updatedAt,
  };
}

function summarizeSchedulerWorkerReworkStart(start: SchedulerRuntimeWorkerReworkStart): WorkbenchSchedulerWorkerReworkStartSummary {
  return {
    id: start.id,
    changeId: start.changeId,
    schedulerRunId: start.schedulerRunId,
    schedulerClaimReservationId: start.schedulerClaimReservationId,
    schedulerWorkerStartId: start.schedulerWorkerStartId,
    schedulerWorkerResultId: start.schedulerWorkerResultId,
    schedulerWorkerValidationId: start.schedulerWorkerValidationId,
    schedulerWorkerAuditId: start.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: start.schedulerWorkerReworkPlanId,
    status: start.status,
    reservationIntentId: start.reservationIntentId,
    claimIntentId: start.claimIntentId,
    nodeId: start.nodeId,
    unitId: start.unitId,
    stageId: start.stageId,
    stage: "bounded-rework",
    originalTaskRunId: start.originalTaskRunId,
    originalWorkerLeaseId: start.originalWorkerLeaseId,
    reworkTaskRunId: start.reworkTaskRunId,
    reworkWorkerLeaseId: start.reworkWorkerLeaseId,
    worktreeId: start.worktreeId,
    originalCodeRunId: start.originalCodeRunId,
    reworkRunId: start.reworkRunId,
    artifact: start.artifact,
    markdownArtifact: start.markdownArtifact,
    updatedAt: start.updatedAt,
  };
}

function summarizeSchedulerWorkerReworkResult(result: SchedulerRuntimeWorkerReworkResult): WorkbenchSchedulerWorkerReworkResultSummary {
  return {
    id: result.id,
    changeId: result.changeId,
    schedulerRunId: result.schedulerRunId,
    schedulerClaimReservationId: result.schedulerClaimReservationId,
    schedulerWorkerStartId: result.schedulerWorkerStartId,
    schedulerWorkerResultId: result.schedulerWorkerResultId,
    schedulerWorkerValidationId: result.schedulerWorkerValidationId,
    schedulerWorkerAuditId: result.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: result.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: result.schedulerWorkerReworkStartId,
    status: result.status,
    reservationIntentId: result.reservationIntentId,
    claimIntentId: result.claimIntentId,
    nodeId: result.nodeId,
    unitId: result.unitId,
    stageId: result.stageId,
    stage: "bounded-rework",
    originalTaskRunId: result.originalTaskRunId,
    originalWorkerLeaseId: result.originalWorkerLeaseId,
    originalCodeRunId: result.originalCodeRunId,
    reworkTaskRunId: result.reworkTaskRunId,
    reworkWorkerLeaseId: result.reworkWorkerLeaseId,
    taskRunStatus: result.taskRunStatus,
    workerLeaseStatus: result.workerLeaseStatus,
    worktreeId: result.worktreeId,
    reworkRunId: result.reworkRunId,
    reworkRunStatus: result.reworkRunStatus,
    failureReason: result.failureReason,
    artifact: result.artifact,
    markdownArtifact: result.markdownArtifact,
    updatedAt: result.updatedAt,
  };
}

function summarizeSchedulerWorkerReworkValidation(validation: SchedulerRuntimeWorkerReworkValidation): WorkbenchSchedulerWorkerReworkValidationSummary {
  return {
    id: validation.id,
    changeId: validation.changeId,
    schedulerRunId: validation.schedulerRunId,
    schedulerClaimReservationId: validation.schedulerClaimReservationId,
    schedulerWorkerStartId: validation.schedulerWorkerStartId,
    schedulerWorkerResultId: validation.schedulerWorkerResultId,
    schedulerWorkerValidationId: validation.schedulerWorkerValidationId,
    schedulerWorkerAuditId: validation.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: validation.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: validation.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: validation.schedulerWorkerReworkResultId,
    status: validation.status,
    reservationIntentId: validation.reservationIntentId,
    claimIntentId: validation.claimIntentId,
    nodeId: validation.nodeId,
    unitId: validation.unitId,
    stageId: validation.stageId,
    stage: "validation",
    originalTaskRunId: validation.originalTaskRunId,
    originalWorkerLeaseId: validation.originalWorkerLeaseId,
    originalCodeRunId: validation.originalCodeRunId,
    reworkTaskRunId: validation.reworkTaskRunId,
    reworkWorkerLeaseId: validation.reworkWorkerLeaseId,
    taskRunStatus: validation.taskRunStatus,
    worktreeId: validation.worktreeId,
    reworkRunId: validation.reworkRunId,
    validationRunId: validation.validationRunId,
    validationStatus: validation.validationStatus,
    failureReason: validation.failureReason,
    artifact: validation.artifact,
    markdownArtifact: validation.markdownArtifact,
    updatedAt: validation.updatedAt,
  };
}

function summarizeSchedulerWorkerReworkAudit(audit: SchedulerRuntimeWorkerReworkAudit): WorkbenchSchedulerWorkerReworkAuditSummary {
  return {
    id: audit.id,
    changeId: audit.changeId,
    schedulerRunId: audit.schedulerRunId,
    schedulerClaimReservationId: audit.schedulerClaimReservationId,
    schedulerWorkerStartId: audit.schedulerWorkerStartId,
    schedulerWorkerResultId: audit.schedulerWorkerResultId,
    schedulerWorkerValidationId: audit.schedulerWorkerValidationId,
    schedulerWorkerAuditId: audit.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: audit.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: audit.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: audit.schedulerWorkerReworkResultId,
    schedulerWorkerReworkValidationId: audit.schedulerWorkerReworkValidationId,
    status: audit.status,
    reservationIntentId: audit.reservationIntentId,
    claimIntentId: audit.claimIntentId,
    nodeId: audit.nodeId,
    unitId: audit.unitId,
    stageId: audit.stageId,
    stage: "audit",
    originalTaskRunId: audit.originalTaskRunId,
    originalWorkerLeaseId: audit.originalWorkerLeaseId,
    originalCodeRunId: audit.originalCodeRunId,
    reworkTaskRunId: audit.reworkTaskRunId,
    reworkWorkerLeaseId: audit.reworkWorkerLeaseId,
    taskRunStatus: audit.taskRunStatus,
    worktreeId: audit.worktreeId,
    reworkRunId: audit.reworkRunId,
    validationRunId: audit.validationRunId,
    auditRunId: audit.auditRunId,
    auditStatus: audit.auditStatus,
    failureReason: audit.failureReason,
    artifact: audit.artifact,
    markdownArtifact: audit.markdownArtifact,
    updatedAt: audit.updatedAt,
  };
}

function summarizeSchedulerIntegrationCandidate(candidate: SchedulerIntegrationCandidate): WorkbenchSchedulerIntegrationCandidateSummary {
  return {
    id: candidate.id,
    changeId: candidate.changeId,
    schedulerRunId: candidate.schedulerRunId,
    schedulerClaimReservationId: candidate.schedulerClaimReservationId,
    schedulerReconcileSnapshotId: candidate.schedulerReconcileSnapshotId,
    status: candidate.status,
    readyCount: candidate.readyCount,
    blockedCount: candidate.blockedCount,
    readyWorktreeIds: candidate.readyWorktreeIds,
    outputClaimIntentIds: candidate.outputs.map((output) => output.claimIntentId).filter((id): id is string => Boolean(id)),
    waitingReason: candidate.waitingReason,
    artifact: candidate.artifact,
    markdownArtifact: candidate.markdownArtifact,
    updatedAt: candidate.updatedAt,
  };
}

function summarizeSchedulerIntegrationCheckHandoff(handoff: SchedulerIntegrationCheckHandoff, currentIntegrationCheckStatus?: string): WorkbenchSchedulerIntegrationCheckHandoffSummary {
  return {
    id: handoff.id,
    changeId: handoff.changeId,
    schedulerRunId: handoff.schedulerRunId,
    schedulerClaimReservationId: handoff.schedulerClaimReservationId,
    schedulerReconcileSnapshotId: handoff.schedulerReconcileSnapshotId,
    schedulerIntegrationCandidateId: handoff.schedulerIntegrationCandidateId,
    status: handoff.status,
    integrationCheckId: handoff.integrationCheckId,
    integrationCheckStatus: handoff.integrationCheckStatus,
    currentIntegrationCheckStatus,
    readyCount: handoff.readyTargets.length,
    readyWorktreeIds: handoff.readyWorktreeIds,
    artifact: handoff.artifact,
    markdownArtifact: handoff.markdownArtifact,
    updatedAt: handoff.updatedAt,
  };
}

function summarizeSchedulerIntegrationOutcome(outcome: SchedulerIntegrationOutcome): WorkbenchSchedulerIntegrationOutcomeSummary {
  return {
    id: outcome.id,
    changeId: outcome.changeId,
    schedulerRunId: outcome.schedulerRunId,
    schedulerClaimReservationId: outcome.schedulerClaimReservationId,
    schedulerReconcileSnapshotId: outcome.schedulerReconcileSnapshotId,
    schedulerIntegrationCandidateId: outcome.schedulerIntegrationCandidateId,
    schedulerIntegrationCheckHandoffId: outcome.schedulerIntegrationCheckHandoffId,
    status: outcome.status,
    integrationCheckId: outcome.integrationCheckId,
    integrationCheckStatus: outcome.integrationCheckStatus,
    readyCount: outcome.readyWorktreeIds.length,
    resultTargetCount: outcome.resultTargetWorktreeIds.length,
    outcomeReason: outcome.outcomeReason,
    appliedAt: outcome.appliedAt,
    artifact: outcome.artifact,
    markdownArtifact: outcome.markdownArtifact,
    updatedAt: outcome.updatedAt,
  };
}

function summarizeSchedulerRunCompletion(completion: SchedulerRunCompletion): WorkbenchSchedulerRunCompletionSummary {
  return {
    id: completion.id,
    changeId: completion.changeId,
    schedulerRunId: completion.schedulerRunId,
    schedulerClaimReservationId: completion.schedulerClaimReservationId,
    schedulerReconcileSnapshotId: completion.schedulerReconcileSnapshotId,
    schedulerIntegrationCandidateId: completion.schedulerIntegrationCandidateId,
    schedulerIntegrationCheckHandoffId: completion.schedulerIntegrationCheckHandoffId,
    schedulerIntegrationOutcomeId: completion.schedulerIntegrationOutcomeId,
    status: completion.status,
    outcomeStatus: completion.outcomeStatus,
    integrationCheckId: completion.integrationCheckId,
    integrationCheckStatus: completion.integrationCheckStatus,
    readyCount: completion.readyWorktreeIds.length,
    resultTargetCount: completion.resultTargetWorktreeIds.length,
    outcomeReason: completion.outcomeReason,
    artifact: completion.artifact,
    markdownArtifact: completion.markdownArtifact,
    updatedAt: completion.updatedAt,
  };
}

function summarizeSchedulerRunBlockedCloseout(closeout: SchedulerRunBlockedCloseout): WorkbenchSchedulerRunBlockedCloseoutSummary {
  return {
    id: closeout.id,
    changeId: closeout.changeId,
    schedulerRunId: closeout.schedulerRunId,
    schedulerClaimReservationId: closeout.schedulerClaimReservationId,
    schedulerReconcileSnapshotId: closeout.schedulerReconcileSnapshotId,
    schedulerIntegrationCandidateId: closeout.schedulerIntegrationCandidateId,
    schedulerContractId: closeout.schedulerContractId,
    schedulerDispatchDryRunId: closeout.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: closeout.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: closeout.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: closeout.schedulerLaunchPreflightId,
    status: closeout.status,
    reason: closeout.reason,
    readyCount: closeout.readyCount,
    blockedCount: closeout.blockedCount,
    readyWorktreeIds: closeout.readyWorktreeIds,
    closeoutReason: closeout.closeoutReason,
    blockedReasons: closeout.blockedReasons,
    unstartedReservedIntentIds: closeout.unstartedReservedIntentIds,
    sourceMutated: false,
    executionStarted: false,
    artifact: closeout.artifact,
    markdownArtifact: closeout.markdownArtifact,
    updatedAt: closeout.updatedAt,
  };
}

export async function readSchedulerReconcileSnapshotSummary(memory: ResolvedMemory, changePath: string, schedulerRunId?: string, snapshotId?: string): Promise<WorkbenchSchedulerReconcileSnapshotSummary | null> {
  if (!schedulerRunId || !snapshotId) return null;
  const snapshot = await readSchedulerReconcileSnapshotProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, snapshotId);
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    changeId: snapshot.changeId,
    schedulerRunId: snapshot.schedulerRunId,
    status: snapshot.status,
    schedulerMode: snapshot.schedulerMode,
    claimIntentCount: snapshot.claimIntents.length,
    waveCount: snapshot.waves.length,
    plannedSlotDemand: snapshot.plannedSlotDemand,
    maxPlannedWaveWidth: snapshot.maxPlannedWaveWidth,
    blockedCount: snapshot.blockedCount,
    warningCount: snapshot.warningCount,
    artifact: snapshot.artifact,
    markdownArtifact: snapshot.markdownArtifact,
    updatedAt: snapshot.createdAt,
  };
}

export function readWorkflowGraphPlanProjection(memory: ResolvedMemory, changePath: string, workflowGraphPlanId?: string): Promise<WorkflowGraphPlan | null> {
  return workflowGraphPlanId
    ? readWorkflowGraphPlan(memory, changePath, workflowGraphPlanId).catch(() => null)
    : readLatestWorkflowGraphPlan(memory, changePath).catch(() => null);
}

export function readSchedulerContractProjection(memory: ResolvedMemory, changePath: string, schedulerContractId?: string): Promise<SchedulerContract | null> {
  return schedulerContractId
    ? readSchedulerContract(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerContractId).catch(() => null)
    : readLatestSchedulerContract(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
}

export function readSchedulerDispatchDryRunProjection(memory: ResolvedMemory, changePath: string, dryRunId?: string): Promise<SchedulerDispatchDryRun | null> {
  return dryRunId
    ? readSchedulerDispatchDryRun(workbenchSchedulerArtifactStore(memory, changePath), changePath, dryRunId).catch(() => null)
    : readLatestSchedulerDispatchDryRun(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
}

export function readSchedulerWorkerSessionPlanProjection(memory: ResolvedMemory, changePath: string, workerPlanId?: string): Promise<SchedulerWorkerSessionPlan | null> {
  return workerPlanId
    ? readSchedulerWorkerSessionPlan(workbenchSchedulerArtifactStore(memory, changePath), changePath, workerPlanId).catch(() => null)
    : readLatestSchedulerWorkerSessionPlan(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
}

export function readSchedulerClaimReconcilePlanProjection(memory: ResolvedMemory, changePath: string, claimReconcilePlanId?: string): Promise<SchedulerClaimReconcilePlan | null> {
  return claimReconcilePlanId
    ? readSchedulerClaimReconcilePlan(workbenchSchedulerArtifactStore(memory, changePath), changePath, claimReconcilePlanId).catch(() => null)
    : readLatestSchedulerClaimReconcilePlan(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
}

export function readSchedulerLaunchPreflightProjection(memory: ResolvedMemory, changePath: string, preflightId?: string): Promise<SchedulerLaunchPreflight | null> {
  return preflightId
    ? readSchedulerLaunchPreflight(workbenchSchedulerArtifactStore(memory, changePath), changePath, preflightId).catch(() => null)
    : readLatestSchedulerLaunchPreflight(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
}

export function readSchedulerRunProjection(memory: ResolvedMemory, changePath: string, schedulerRunId?: string): Promise<SchedulerRun | null> {
  return schedulerRunId
    ? readSchedulerRun(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId).catch(() => null)
    : readLatestSchedulerRun(workbenchSchedulerArtifactStore(memory, changePath), changePath).catch(() => null);
}

export function readSchedulerRuntimeProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeState | null> {
  return readSchedulerRuntimeStateProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId);
}

export function readSchedulerReconcileProjection(memory: ResolvedMemory, changePath: string, snapshotId: string, schedulerRunId?: string): Promise<SchedulerReconcileSnapshot | null> {
  return schedulerRunId
    ? readSchedulerReconcileSnapshotProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, snapshotId)
    : readSchedulerReconcileSnapshotByIdProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, snapshotId);
}

export function readSchedulerClaimReservationProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reservationId: string): Promise<SchedulerRuntimeClaimReservation | null> {
  return readSchedulerRuntimeClaimReservationProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reservationId);
}

export function readSchedulerWorkerValidationProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, validationId: string): Promise<SchedulerRuntimeWorkerValidation | null> {
  return readSchedulerRuntimeWorkerValidationProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, validationId);
}

export function readSchedulerWorkerAuditProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, auditId: string): Promise<SchedulerRuntimeWorkerAudit | null> {
  return readSchedulerRuntimeWorkerAuditProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, auditId);
}

export function readSchedulerWorkerReworkPlanProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkPlanId: string): Promise<SchedulerRuntimeWorkerReworkPlan | null> {
  return readSchedulerRuntimeWorkerReworkPlanProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reworkPlanId);
}

export function readSchedulerWorkerReworkStartProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkStartId: string): Promise<SchedulerRuntimeWorkerReworkStart | null> {
  return readSchedulerRuntimeWorkerReworkStartProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reworkStartId);
}

export function readSchedulerWorkerReworkResultProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkResultId: string): Promise<SchedulerRuntimeWorkerReworkResult | null> {
  return readSchedulerRuntimeWorkerReworkResultProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reworkResultId);
}

export function readSchedulerWorkerReworkValidationProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkValidationId: string): Promise<SchedulerRuntimeWorkerReworkValidation | null> {
  return readSchedulerRuntimeWorkerReworkValidationProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reworkValidationId);
}

export function readSchedulerWorkerReworkAuditProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkAuditId: string): Promise<SchedulerRuntimeWorkerReworkAudit | null> {
  return readSchedulerRuntimeWorkerReworkAuditProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, reworkAuditId);
}

export function readSchedulerIntegrationCandidateProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, candidateId: string): Promise<SchedulerIntegrationCandidate | null> {
  return readSchedulerIntegrationCandidateArtifactProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, candidateId);
}

export function readSchedulerIntegrationCheckHandoffProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, handoffId: string): Promise<SchedulerIntegrationCheckHandoff | null> {
  return readSchedulerIntegrationCheckHandoffArtifactProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, handoffId);
}

export function readSchedulerIntegrationOutcomeProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, outcomeId: string): Promise<SchedulerIntegrationOutcome | null> {
  return readSchedulerIntegrationOutcomeArtifactProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, outcomeId);
}

export function readSchedulerRunCompletionProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, completionId: string): Promise<SchedulerRunCompletion | null> {
  return readSchedulerRunCompletionArtifactProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, completionId);
}

export function readSchedulerRunBlockedCloseoutProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, closeoutId: string): Promise<SchedulerRunBlockedCloseout | null> {
  return readSchedulerRunBlockedCloseoutArtifactProjection(workbenchSchedulerArtifactStore(memory, changePath), changePath, schedulerRunId, closeoutId);
}

export function buildTypedWorkflowNextAction(input: {
  topic: TypedWorkflowProjectionTopic;
  readiness: TypedWorkflowProjectionReadiness;
  intake?: TypedWorkflowProjectionIntake;
  workflowGraphPlan?: WorkbenchWorkflowGraphPlanSummary | null;
  schedulerContract?: WorkbenchSchedulerContractSummary | null;
  schedulerDispatchDryRun?: WorkbenchSchedulerDispatchDryRunSummary | null;
  schedulerWorkerSessionPlan?: WorkbenchSchedulerWorkerSessionPlanSummary | null;
  schedulerClaimReconcilePlan?: WorkbenchSchedulerClaimReconcilePlanSummary | null;
  schedulerLaunchPreflight?: WorkbenchSchedulerLaunchPreflightSummary | null;
  schedulerRun?: WorkbenchSchedulerRunSummary | null;
  schedulerRuntime?: WorkbenchSchedulerRuntimeSummary | null;
  schedulerReconcileSnapshot?: WorkbenchSchedulerReconcileSnapshotSummary | null;
  schedulerClaimReservation?: WorkbenchSchedulerClaimReservationSummary | null;
  schedulerWorkerStart?: WorkbenchSchedulerWorkerStartSummary | null;
  schedulerWorkerResult?: WorkbenchSchedulerWorkerResultSummary | null;
  schedulerWorkerValidation?: WorkbenchSchedulerWorkerValidationSummary | null;
  schedulerWorkerAudit?: WorkbenchSchedulerWorkerAuditSummary | null;
  schedulerWorkerReworkPlan?: WorkbenchSchedulerWorkerReworkPlanSummary | null;
  schedulerWorkerReworkStart?: WorkbenchSchedulerWorkerReworkStartSummary | null;
  schedulerWorkerReworkResult?: WorkbenchSchedulerWorkerReworkResultSummary | null;
  schedulerWorkerReworkValidation?: WorkbenchSchedulerWorkerReworkValidationSummary | null;
  schedulerWorkerReworkAudit?: WorkbenchSchedulerWorkerReworkAuditSummary | null;
  schedulerWorkerPaths?: WorkbenchSchedulerWorkerPathSummary[];
  schedulerReadySetGraph?: ReadySetWorkflowGraphPlan | null;
  schedulerIntegrationCandidate?: WorkbenchSchedulerIntegrationCandidateSummary | null;
  schedulerIntegrationCheckHandoff?: WorkbenchSchedulerIntegrationCheckHandoffSummary | null;
  schedulerIntegrationOutcome?: WorkbenchSchedulerIntegrationOutcomeSummary | null;
  schedulerRunCompletion?: WorkbenchSchedulerRunCompletionSummary | null;
  schedulerRunBlockedCloseout?: WorkbenchSchedulerRunBlockedCloseoutSummary | null;
  schedulerTransition?: SchedulerCurrentTransition | null;
  schedulerIntegrationCandidateNeedsRefresh?: boolean;
  workflowRun?: WorkflowRunSummary | null;
}): WorkbenchTypedWorkflowNextAction {
  const { topic, readiness, intake, workflowGraphPlan, schedulerRun, schedulerRuntime, schedulerReconcileSnapshot, schedulerClaimReservation, schedulerWorkerStart, schedulerWorkerResult, schedulerWorkerValidation, schedulerWorkerAudit, schedulerWorkerReworkPlan, schedulerWorkerReworkStart, schedulerWorkerReworkResult, schedulerWorkerReworkValidation, schedulerWorkerReworkAudit, schedulerWorkerPaths = [], schedulerIntegrationCandidate, schedulerIntegrationCheckHandoff, schedulerIntegrationOutcome, schedulerRunCompletion, schedulerRunBlockedCloseout, schedulerTransition, schedulerIntegrationCandidateNeedsRefresh: schedulerCandidateNeedsRefresh, workflowRun } = input;
  if (!readiness.specReady && !topic.runs.some((run) => run.runtime === "intake-scan")) {
    return workflowNextAction("intake.scan", "分析需求", "先只读扫描项目，整理当前理解、相关文件和待确认问题。", false);
  }
  if (!readiness.specReady && (intake?.pendingClarifications.length || intake?.openQuestions.length)) {
    return workflowNextAction("intake.reanalyze", "继续澄清需求", "回答需要确认的问题，AHO 会更新当前理解。", false);
  }
  if (!readiness.specReady || !readiness.planReady || !readiness.tasksReady) {
    return {
      ...workflowNextAction("intake.reanalyze", "继续对话", "继续通过主 Agent 或 Plan session 补充需求；Workbench 不生成计划或任务。", false),
      enabled: false,
      disabledReason: "项目规则和计划内容应由 Agent 读取项目文档后处理，Workbench 不再提供工程化 planning action。",
    };
  }
  const authoredGraph = workflowGraphPlan?.authoringContractVersion === "1.0" ? workflowGraphPlan : null;
  if (authoredGraph?.graphMode === "sequential-v1") {
    if (workflowRun?.workflowGraphPlanId === authoredGraph.id) {
      return {
        ...workflowNextAction("workflow.run.start", "执行计划已启动", "当前已接受的顺序执行图已经启动。"),
        enabled: false,
        disabledReason: "当前 WorkflowGraphPlan 已有运行记录。",
        workflowGraphPlanId: authoredGraph.id,
      };
    }
    return {
      ...workflowNextAction("workflow.run.start", "开始执行计划", "重新校验已接受的顺序执行图后开始执行。"),
      workflowGraphPlanId: authoredGraph.id,
    };
  }
  const authoredReadySetGraph = authoredGraph?.graphMode === "ready-set-v1" ? authoredGraph : null;
  if (authoredReadySetGraph) {
    if (schedulerRun?.status === "completed" && schedulerRunCompletion?.schedulerRunId === schedulerRun.id) {
      return {
        ...workflowNextAction("planning.scheduler.run.complete", "SchedulerRun 已完成", `SchedulerRun 已记录 terminal completion ${schedulerRunCompletion.status}；后续 source mutation、landing、PR、merge 仍只走既有独立 gate。`),
        enabled: false,
        disabledReason: "SchedulerRun terminal completion 已记录。",
        workflowGraphPlanId: authoredReadySetGraph.id,
        schedulerContractId: schedulerRun.schedulerContractId,
        schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
        schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
        schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
        schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
        schedulerRunId: schedulerRun.id,
        schedulerReconcileSnapshotId: schedulerRunCompletion.schedulerReconcileSnapshotId,
        schedulerClaimReservationId: schedulerRunCompletion.schedulerClaimReservationId,
        schedulerIntegrationCandidateId: schedulerRunCompletion.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: schedulerRunCompletion.schedulerIntegrationCheckHandoffId,
        schedulerIntegrationOutcomeId: schedulerRunCompletion.schedulerIntegrationOutcomeId,
        schedulerRunCompletionId: schedulerRunCompletion.id,
        applyCheckId: schedulerRunCompletion.integrationCheckId,
      };
    }
    if (schedulerRun?.status === "completed" && schedulerRunBlockedCloseout?.schedulerRunId === schedulerRun.id) {
      return {
        ...workflowNextAction("planning.scheduler.run.close-blocked", "SchedulerRun 已结束", `SchedulerRun 已记录 ${schedulerRunBlockedCloseout.status} closeout：${schedulerRunBlockedCloseout.closeoutReason}`),
        enabled: false,
        disabledReason: "SchedulerRun blocked/exhausted closeout 已记录。",
        workflowGraphPlanId: authoredReadySetGraph.id,
        schedulerContractId: schedulerRunBlockedCloseout.schedulerContractId,
        schedulerDispatchDryRunId: schedulerRunBlockedCloseout.schedulerDispatchDryRunId,
        schedulerWorkerPlanId: schedulerRunBlockedCloseout.schedulerWorkerPlanId,
        schedulerClaimReconcilePlanId: schedulerRunBlockedCloseout.schedulerClaimReconcilePlanId,
        schedulerLaunchPreflightId: schedulerRunBlockedCloseout.schedulerLaunchPreflightId,
        schedulerRunId: schedulerRun.id,
        schedulerReconcileSnapshotId: schedulerRunBlockedCloseout.schedulerReconcileSnapshotId,
        schedulerClaimReservationId: schedulerRunBlockedCloseout.schedulerClaimReservationId,
        schedulerIntegrationCandidateId: schedulerRunBlockedCloseout.schedulerIntegrationCandidateId,
        schedulerRunBlockedCloseoutId: schedulerRunBlockedCloseout.id,
        worktreeIds: schedulerRunBlockedCloseout.readyWorktreeIds,
      };
    }
    if (
      schedulerRun?.status === "prepared"
      && schedulerRuntime?.schedulerRunId === schedulerRun.id
      && schedulerRuntime.lastReconcileSnapshotId
      && schedulerReconcileSnapshot?.id === schedulerRuntime.lastReconcileSnapshotId
      && schedulerRuntime.lastClaimReservationId
      && schedulerRuntime.lastClaimReservationSnapshotId === schedulerReconcileSnapshot.id
      && schedulerClaimReservation?.id === schedulerRuntime.lastClaimReservationId
      && schedulerClaimReservation.schedulerRunId === schedulerRun.id
      && schedulerClaimReservation.schedulerReconcileSnapshotId === schedulerReconcileSnapshot.id
    ) {
      const schedulerLaunchGateSatisfied = Boolean(authoredReadySetGraph)
        || schedulerClaimReservation.launchConfirmed
        || Boolean(schedulerWorkerPaths.length || schedulerIntegrationCandidate || schedulerIntegrationCheckHandoff || schedulerIntegrationOutcome || schedulerRunCompletion);
      if (schedulerLaunchGateSatisfied) {
        if (schedulerRunCompletion) {
          return {
            ...workflowNextAction("planning.scheduler.run.complete", "SchedulerRun 已完成", `SchedulerRun 已记录 terminal completion ${schedulerRunCompletion.status}；后续 source mutation、landing、PR、merge 仍只走既有独立 gate。`),
            enabled: false,
            disabledReason: "SchedulerRun terminal completion 已记录。",
            workflowGraphPlanId: authoredReadySetGraph.id,
            schedulerContractId: schedulerRun.schedulerContractId,
            schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
            schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
            schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
            schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
            schedulerRunId: schedulerRun.id,
            schedulerReconcileSnapshotId: schedulerRunCompletion.schedulerReconcileSnapshotId,
            schedulerClaimReservationId: schedulerRunCompletion.schedulerClaimReservationId,
            schedulerIntegrationCandidateId: schedulerRunCompletion.schedulerIntegrationCandidateId,
            schedulerIntegrationCheckHandoffId: schedulerRunCompletion.schedulerIntegrationCheckHandoffId,
            schedulerIntegrationOutcomeId: schedulerRunCompletion.schedulerIntegrationOutcomeId,
            schedulerRunCompletionId: schedulerRunCompletion.id,
            applyCheckId: schedulerRunCompletion.integrationCheckId,
          };
        }
        if (schedulerRunBlockedCloseout) {
          return {
            ...workflowNextAction("planning.scheduler.run.close-blocked", "SchedulerRun 已结束", `SchedulerRun 已记录 ${schedulerRunBlockedCloseout.status} closeout：${schedulerRunBlockedCloseout.closeoutReason}`),
            enabled: false,
            disabledReason: "SchedulerRun blocked/exhausted closeout 已记录。",
            workflowGraphPlanId: authoredReadySetGraph.id,
            schedulerContractId: schedulerRunBlockedCloseout.schedulerContractId,
            schedulerDispatchDryRunId: schedulerRunBlockedCloseout.schedulerDispatchDryRunId,
            schedulerWorkerPlanId: schedulerRunBlockedCloseout.schedulerWorkerPlanId,
            schedulerClaimReconcilePlanId: schedulerRunBlockedCloseout.schedulerClaimReconcilePlanId,
            schedulerLaunchPreflightId: schedulerRunBlockedCloseout.schedulerLaunchPreflightId,
            schedulerRunId: schedulerRun.id,
            schedulerReconcileSnapshotId: schedulerRunBlockedCloseout.schedulerReconcileSnapshotId,
            schedulerClaimReservationId: schedulerRunBlockedCloseout.schedulerClaimReservationId,
            schedulerIntegrationCandidateId: schedulerRunBlockedCloseout.schedulerIntegrationCandidateId,
            schedulerRunBlockedCloseoutId: schedulerRunBlockedCloseout.id,
            worktreeIds: schedulerRunBlockedCloseout.readyWorktreeIds,
          };
        }
        if (schedulerIntegrationCandidate && schedulerCandidateNeedsRefresh === false && schedulerTransition) {
          if (schedulerTransition.kind === "integration-check" && !schedulerIntegrationCheckHandoff) {
            return {
              ...workflowNextAction("planning.scheduler.integration-check.run", "运行 scheduler IntegrationCheck", "把 scheduler-owned ready worktree targets 显式交给现有 IntegrationCheck；只运行兼容性检查和 aggregate validation/audit，不 apply、landing、PR、merge 或启动 next worker。"),
              workflowGraphPlanId: authoredReadySetGraph.id,
              schedulerContractId: schedulerRun.schedulerContractId,
              schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
              schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
              schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
              schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
              schedulerRunId: schedulerRun.id,
              schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
              schedulerClaimReservationId: schedulerClaimReservation.id,
              schedulerIntegrationCandidateId: schedulerIntegrationCandidate.id,
              worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
            };
          }
          const currentIntegrationStatus = schedulerIntegrationCheckHandoff?.currentIntegrationCheckStatus ?? schedulerIntegrationCheckHandoff?.integrationCheckStatus;
          if (schedulerTransition.kind === "integration-outcome" && schedulerIntegrationCheckHandoff && !schedulerIntegrationOutcome) {
            return {
              ...workflowNextAction("planning.scheduler.integration-outcome.reconcile", "记录 scheduler integration 结果", "把现有 IntegrationCheck 的 terminal/apply/discard 结果写回 scheduler-owned outcome evidence；不执行 apply、discard、landing、PR、merge 或 next worker。"),
              workflowGraphPlanId: authoredReadySetGraph.id,
              schedulerContractId: schedulerRun.schedulerContractId,
              schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
              schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
              schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
              schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
              schedulerRunId: schedulerRun.id,
              schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
              schedulerClaimReservationId: schedulerClaimReservation.id,
              schedulerIntegrationCandidateId: schedulerIntegrationCandidate.id,
              schedulerIntegrationCheckHandoffId: schedulerIntegrationCheckHandoff.id,
              applyCheckId: schedulerIntegrationCheckHandoff.integrationCheckId,
              worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
            };
          }
          if (schedulerTransition.kind === "run-complete" && schedulerIntegrationOutcome) {
            return {
              ...workflowNextAction("planning.scheduler.run.complete", "记录 SchedulerRun 完成状态", "把 terminal scheduler integration outcome 写入 SchedulerRun completion/status evidence；不执行 apply、discard、landing、PR、merge 或 next worker。"),
              workflowGraphPlanId: authoredReadySetGraph.id,
              schedulerContractId: schedulerRun.schedulerContractId,
              schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
              schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
              schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
              schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
              schedulerRunId: schedulerRun.id,
              schedulerReconcileSnapshotId: schedulerIntegrationOutcome.schedulerReconcileSnapshotId,
              schedulerClaimReservationId: schedulerIntegrationOutcome.schedulerClaimReservationId,
              schedulerIntegrationCandidateId: schedulerIntegrationOutcome.schedulerIntegrationCandidateId,
              schedulerIntegrationCheckHandoffId: schedulerIntegrationOutcome.schedulerIntegrationCheckHandoffId,
              schedulerIntegrationOutcomeId: schedulerIntegrationOutcome.id,
              applyCheckId: schedulerIntegrationOutcome.integrationCheckId,
              worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
            };
          }
          if (schedulerIntegrationCheckHandoff) {
            return {
              ...workflowNextAction("planning.scheduler.integration-check.run", "Scheduler IntegrationCheck 等待 apply/discard", `IntegrationCheck ${schedulerIntegrationCheckHandoff.integrationCheckId} 已由 scheduler handoff 运行；当前状态 ${currentIntegrationStatus ?? "unknown"}，apply/discard 仍走既有后续人审门。`),
              enabled: false,
              disabledReason: "IntegrationCheck passed 时必须先使用既有 apply/discard 确认；terminal 后再记录 scheduler outcome。",
              workflowGraphPlanId: authoredReadySetGraph.id,
              schedulerContractId: schedulerRun.schedulerContractId,
              schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
              schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
              schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
              schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
              schedulerRunId: schedulerRun.id,
              schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
              schedulerClaimReservationId: schedulerClaimReservation.id,
              schedulerIntegrationCandidateId: schedulerIntegrationCandidate.id,
              schedulerIntegrationCheckHandoffId: schedulerIntegrationCheckHandoff.id,
              applyCheckId: schedulerIntegrationCheckHandoff?.integrationCheckId,
              worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
            };
          }
          if (schedulerTransition.kind === "close-blocked") {
            return {
              ...workflowNextAction("planning.scheduler.run.close-blocked", "结束本次 scheduler run", "当前 scheduler candidate 不能进入 IntegrationCheck，且没有可继续启动的 worker；本操作只记录 blocked/exhausted closeout，不启动执行或修改 source。"),
              workflowGraphPlanId: authoredReadySetGraph.id,
              schedulerContractId: schedulerRun.schedulerContractId,
              schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
              schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
              schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
              schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
              schedulerRunId: schedulerRun.id,
              schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
              schedulerClaimReservationId: schedulerClaimReservation.id,
              schedulerIntegrationCandidateId: schedulerIntegrationCandidate.id,
              worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
            };
          }
        }
        if (schedulerTransition?.kind === "start-same-wave-worker" || schedulerTransition?.kind === "start-next-wave-worker") {
          const title = schedulerTransition.kind === "start-same-wave-worker" ? "启动同波次下一个 worker" : "启动下一个 wave worker";
          const description = schedulerTransition.kind === "start-same-wave-worker"
            ? "当前 wave 还有未启动且 source scope 不冲突的 reservation intent；本操作只启动一个明确 coder stage，不启动整波、验证、审计、IntegrationCheck 或 scheduler loop。"
            : "当前 wave 已全部 terminal，下一 wave 有可启动的 reservation intent；本操作只启动一个明确 coder stage，不启动整波、验证、审计、IntegrationCheck 或 scheduler loop。";
          return {
            ...workflowNextAction("planning.scheduler.worker.start-next", title, description),
            workflowGraphPlanId: authoredReadySetGraph.id,
            schedulerContractId: schedulerRun.schedulerContractId,
            schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
            schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
            schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
            schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
            schedulerRunId: schedulerRun.id,
            schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
            schedulerClaimReservationId: schedulerClaimReservation.id,
            reservationIntentId: schedulerTransition.reservationIntent.reservationIntentId,
            claimIntentId: schedulerTransition.reservationIntent.claimIntentId,
          };
        }
        if (schedulerWorkerStart?.schedulerClaimReservationId === schedulerClaimReservation.id && schedulerWorkerStart.schedulerRunId === schedulerRun.id) {
          if (schedulerWorkerResult?.schedulerWorkerStartId === schedulerWorkerStart.id) {
            if (schedulerTransition?.actionType === "planning.scheduler.worker.validate-first") {
              return {
                ...workflowNextAction("planning.scheduler.worker.validate-first", "验证当前 worker 结果", "对当前 scheduler worker 的同一个 worktree 运行一次 scoped Validation；只写 scheduler validation evidence，不启动 audit、rework 或下一个 worker。"),
                workflowGraphPlanId: authoredReadySetGraph.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerClaimReservation.id,
                schedulerWorkerStartId: schedulerWorkerStart.id,
                schedulerWorkerResultId: schedulerWorkerResult.id,
                reservationIntentId: schedulerWorkerStart.reservationIntentId,
                claimIntentId: schedulerWorkerStart.claimIntentId,
                taskRunId: schedulerWorkerResult.taskRunId,
                workerLeaseId: schedulerWorkerResult.workerLeaseId,
                worktreeId: schedulerWorkerResult.worktreeId,
                runId: schedulerWorkerResult.runId,
              };
            }
            if (schedulerTransition?.actionType === "planning.scheduler.worker.audit-first" && schedulerWorkerValidation) {
              return {
                ...workflowNextAction("planning.scheduler.worker.audit-first", "审计当前 worker 结果", "对当前 scheduler worker 的同一个 worktree 运行一次 scoped Audit；只写 scheduler audit evidence，不启动 rework、下一个 worker 或 whole wave。"),
                workflowGraphPlanId: authoredReadySetGraph.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerClaimReservation.id,
                schedulerWorkerStartId: schedulerWorkerStart.id,
                schedulerWorkerResultId: schedulerWorkerResult.id,
                schedulerWorkerValidationId: schedulerWorkerValidation.id,
                reservationIntentId: schedulerWorkerStart.reservationIntentId,
                claimIntentId: schedulerWorkerStart.claimIntentId,
                validationRunId: schedulerWorkerValidation.validationRunId,
              };
            }
            if (schedulerTransition?.actionType === "planning.scheduler.worker.rework-plan.compile" && schedulerWorkerValidation) {
              return {
                ...workflowNextAction("planning.scheduler.worker.rework-plan.compile", "生成当前 worker rework 计划", "根据当前 worker validation failed 或 audit blocked/failed evidence 生成 bounded rework 计划；不会启动 rework、下一个 worker 或 scheduler loop。"),
                workflowGraphPlanId: authoredReadySetGraph.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerClaimReservation.id,
                schedulerWorkerStartId: schedulerWorkerStart.id,
                schedulerWorkerResultId: schedulerWorkerResult.id,
                schedulerWorkerValidationId: schedulerWorkerValidation.id,
                schedulerWorkerAuditId: schedulerWorkerAudit?.id,
                reservationIntentId: schedulerWorkerValidation.reservationIntentId,
                claimIntentId: schedulerWorkerValidation.claimIntentId,
                taskRunId: schedulerWorkerValidation.taskRunId,
                workerLeaseId: schedulerWorkerValidation.workerLeaseId,
                worktreeId: schedulerWorkerValidation.worktreeId,
                runId: schedulerWorkerValidation.codeRunId,
                validationRunId: schedulerWorkerValidation.validationRunId,
                auditRunId: schedulerWorkerAudit?.auditRunId,
              };
            }
            if (schedulerTransition?.actionType === "planning.scheduler.worker.rework-start-first" && schedulerWorkerReworkPlan) {
              return {
                ...workflowNextAction("planning.scheduler.worker.rework-start-first", "启动当前 worker rework", "在当前 worker 的原 worktree 上启动一次 scoped rework-coder；只创建 rework TaskRun、WorkerLease、code run 和 Runtime Continuity sidecars。"),
                workflowGraphPlanId: authoredReadySetGraph.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerWorkerReworkPlan.schedulerClaimReservationId,
                schedulerWorkerStartId: schedulerWorkerReworkPlan.schedulerWorkerStartId,
                schedulerWorkerResultId: schedulerWorkerReworkPlan.schedulerWorkerResultId,
                schedulerWorkerValidationId: schedulerWorkerReworkPlan.schedulerWorkerValidationId,
                schedulerWorkerAuditId: schedulerWorkerReworkPlan.schedulerWorkerAuditId,
                schedulerWorkerReworkPlanId: schedulerWorkerReworkPlan.id,
                reservationIntentId: schedulerWorkerReworkPlan.reservationIntentId,
                claimIntentId: schedulerWorkerReworkPlan.claimIntentId,
                taskRunId: schedulerWorkerReworkPlan.taskRunId,
                workerLeaseId: schedulerWorkerReworkPlan.workerLeaseId,
                worktreeId: schedulerWorkerReworkPlan.targetWorktreeId,
                runId: schedulerWorkerReworkPlan.targetCodeRunId,
                validationRunId: schedulerWorkerReworkPlan.validationRunId,
                auditRunId: schedulerWorkerReworkPlan.auditRunId,
              };
            }
            if (schedulerTransition?.actionType === "planning.scheduler.worker.rework-reconcile-result" && schedulerWorkerReworkStart) {
              return {
                ...workflowNextAction("planning.scheduler.worker.rework-reconcile-result", "检查当前 worker rework 结果", "读取 rework TaskRun、WorkerLease、worktree 和 rework code run evidence；只写 scheduler rework result，不启动 validation、audit、next worker 或 whole wave。"),
                workflowGraphPlanId: authoredReadySetGraph.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerWorkerReworkStart.schedulerClaimReservationId,
                schedulerWorkerStartId: schedulerWorkerReworkStart.schedulerWorkerStartId,
                schedulerWorkerResultId: schedulerWorkerReworkStart.schedulerWorkerResultId,
                schedulerWorkerValidationId: schedulerWorkerReworkStart.schedulerWorkerValidationId,
                schedulerWorkerAuditId: schedulerWorkerReworkStart.schedulerWorkerAuditId,
                schedulerWorkerReworkPlanId: schedulerWorkerReworkStart.schedulerWorkerReworkPlanId,
                schedulerWorkerReworkStartId: schedulerWorkerReworkStart.id,
                reservationIntentId: schedulerWorkerReworkStart.reservationIntentId,
                claimIntentId: schedulerWorkerReworkStart.claimIntentId,
                taskRunId: schedulerWorkerReworkStart.reworkTaskRunId,
                workerLeaseId: schedulerWorkerReworkStart.reworkWorkerLeaseId,
                worktreeId: schedulerWorkerReworkStart.worktreeId,
                runId: schedulerWorkerReworkStart.reworkRunId,
              };
            }
            if (schedulerTransition?.actionType === "planning.scheduler.worker.rework-validate-first" && schedulerWorkerReworkResult) {
              return {
                ...workflowNextAction("planning.scheduler.worker.rework-validate-first", "验证当前 worker rework 结果", "对当前 worker rework 复用的同一个 worktree 运行一次 scoped Validation；只写 scheduler rework validation evidence，不启动 audit、next worker 或 whole wave。"),
                workflowGraphPlanId: authoredReadySetGraph.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerWorkerReworkResult.schedulerClaimReservationId,
                schedulerWorkerStartId: schedulerWorkerReworkResult.schedulerWorkerStartId,
                schedulerWorkerResultId: schedulerWorkerReworkResult.schedulerWorkerResultId,
                schedulerWorkerValidationId: schedulerWorkerReworkResult.schedulerWorkerValidationId,
                schedulerWorkerAuditId: schedulerWorkerReworkResult.schedulerWorkerAuditId,
                schedulerWorkerReworkPlanId: schedulerWorkerReworkResult.schedulerWorkerReworkPlanId,
                schedulerWorkerReworkStartId: schedulerWorkerReworkResult.schedulerWorkerReworkStartId,
                schedulerWorkerReworkResultId: schedulerWorkerReworkResult.id,
                reservationIntentId: schedulerWorkerReworkResult.reservationIntentId,
                claimIntentId: schedulerWorkerReworkResult.claimIntentId,
                taskRunId: schedulerWorkerReworkResult.reworkTaskRunId,
                workerLeaseId: schedulerWorkerReworkResult.reworkWorkerLeaseId,
                worktreeId: schedulerWorkerReworkResult.worktreeId,
                runId: schedulerWorkerReworkResult.reworkRunId,
                validationRunId: schedulerWorkerValidation?.validationRunId,
              };
            }
            if (schedulerTransition?.actionType === "planning.scheduler.worker.rework-audit-first" && schedulerWorkerReworkValidation) {
              return {
                ...workflowNextAction("planning.scheduler.worker.rework-audit-first", "审计当前 worker rework 结果", "对当前 worker rework 复用的同一个 worktree 运行一次 scoped Audit；只写 scheduler rework audit evidence，不启动 next worker、integration 或 apply。"),
                workflowGraphPlanId: authoredReadySetGraph.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerWorkerReworkValidation.schedulerClaimReservationId,
                schedulerWorkerStartId: schedulerWorkerReworkValidation.schedulerWorkerStartId,
                schedulerWorkerResultId: schedulerWorkerReworkValidation.schedulerWorkerResultId,
                schedulerWorkerValidationId: schedulerWorkerReworkValidation.schedulerWorkerValidationId,
                schedulerWorkerAuditId: schedulerWorkerReworkValidation.schedulerWorkerAuditId,
                schedulerWorkerReworkPlanId: schedulerWorkerReworkValidation.schedulerWorkerReworkPlanId,
                schedulerWorkerReworkStartId: schedulerWorkerReworkValidation.schedulerWorkerReworkStartId,
                schedulerWorkerReworkResultId: schedulerWorkerReworkValidation.schedulerWorkerReworkResultId,
                schedulerWorkerReworkValidationId: schedulerWorkerReworkValidation.id,
                reservationIntentId: schedulerWorkerReworkValidation.reservationIntentId,
                claimIntentId: schedulerWorkerReworkValidation.claimIntentId,
                taskRunId: schedulerWorkerReworkValidation.reworkTaskRunId,
                workerLeaseId: schedulerWorkerReworkValidation.reworkWorkerLeaseId,
                worktreeId: schedulerWorkerReworkValidation.worktreeId,
                runId: schedulerWorkerReworkValidation.reworkRunId,
                validationRunId: schedulerWorkerReworkValidation.validationRunId,
                reworkValidationRunId: schedulerWorkerReworkValidation.validationRunId,
              };
            }
            if (schedulerTransition) {
              if (schedulerTransition.kind === "integration-candidate") {
                return {
                  ...workflowNextAction("planning.scheduler.integration-candidate.compile", "生成 scheduler integration 候选", "把已通过 audit 的 scheduler worker 输出接回现有 apply readiness gate；只写 SchedulerIntegrationCandidate，不运行 IntegrationCheck、apply、merge 或 next worker。"),
                  workflowGraphPlanId: authoredReadySetGraph.id,
                  schedulerContractId: schedulerRun.schedulerContractId,
                  schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                  schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                  schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                  schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                  schedulerRunId: schedulerRun.id,
                  schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                  schedulerClaimReservationId: schedulerClaimReservation.id,
                  schedulerWorkerAuditId: schedulerWorkerAudit?.id,
                  schedulerWorkerReworkAuditId: schedulerWorkerReworkAudit?.id,
                  reservationIntentId: schedulerWorkerReworkAudit?.reservationIntentId ?? schedulerWorkerAudit?.reservationIntentId,
                  claimIntentId: schedulerWorkerReworkAudit?.claimIntentId ?? schedulerWorkerAudit?.claimIntentId,
                };
              }
              if (schedulerTransition.kind === "integration-check" && schedulerIntegrationCandidate && !schedulerIntegrationCheckHandoff) {
                return {
                  ...workflowNextAction("planning.scheduler.integration-check.run", "运行 scheduler IntegrationCheck", "把 scheduler-owned ready worktree targets 显式交给现有 IntegrationCheck；只运行兼容性检查和 aggregate validation/audit，不 apply、landing、PR、merge 或启动 next worker。"),
                  workflowGraphPlanId: authoredReadySetGraph.id,
                  schedulerContractId: schedulerRun.schedulerContractId,
                  schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                  schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                  schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                  schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                  schedulerRunId: schedulerRun.id,
                  schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                  schedulerClaimReservationId: schedulerClaimReservation.id,
                  schedulerIntegrationCandidateId: schedulerIntegrationCandidate.id,
                  worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
                };
              }
              if (schedulerTransition.kind === "close-blocked" && schedulerIntegrationCandidate && !schedulerIntegrationCheckHandoff && !schedulerIntegrationOutcome && !schedulerRunCompletion) {
                return {
                  ...workflowNextAction("planning.scheduler.run.close-blocked", "结束本次 scheduler run", "当前 scheduler candidate 不能进入 IntegrationCheck，且没有可继续启动的 worker；本操作只记录 blocked/exhausted closeout，不启动执行或修改 source。"),
                  workflowGraphPlanId: authoredReadySetGraph.id,
                  schedulerContractId: schedulerRun.schedulerContractId,
                  schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                  schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                  schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                  schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                  schedulerRunId: schedulerRun.id,
                  schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                  schedulerClaimReservationId: schedulerClaimReservation.id,
                  schedulerIntegrationCandidateId: schedulerIntegrationCandidate.id,
                  worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
                };
              }
              if (schedulerIntegrationCandidate) {
                const currentIntegrationStatus = schedulerIntegrationCheckHandoff?.currentIntegrationCheckStatus ?? schedulerIntegrationCheckHandoff?.integrationCheckStatus;
                if (schedulerTransition.kind === "integration-outcome" && schedulerIntegrationCheckHandoff && !schedulerIntegrationOutcome) {
                  return {
                    ...workflowNextAction("planning.scheduler.integration-outcome.reconcile", "记录 scheduler integration 结果", "把现有 IntegrationCheck 的 terminal/apply/discard 结果写回 scheduler-owned outcome evidence；不执行 apply、discard、landing、PR、merge 或 next worker。"),
                    workflowGraphPlanId: authoredReadySetGraph.id,
                    schedulerContractId: schedulerRun.schedulerContractId,
                    schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                    schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                    schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                    schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                    schedulerRunId: schedulerRun.id,
                    schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                    schedulerClaimReservationId: schedulerClaimReservation.id,
                    schedulerIntegrationCandidateId: schedulerIntegrationCandidate.id,
                    schedulerIntegrationCheckHandoffId: schedulerIntegrationCheckHandoff.id,
                    applyCheckId: schedulerIntegrationCheckHandoff.integrationCheckId,
                    worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
                  };
                }
                if (schedulerTransition.kind === "run-complete" && schedulerIntegrationOutcome) {
                  return {
                    ...workflowNextAction("planning.scheduler.run.complete", "记录 SchedulerRun 完成状态", "把 terminal scheduler integration outcome 写入 SchedulerRun completion/status evidence；不执行 apply、discard、landing、PR、merge 或 next worker。"),
                    workflowGraphPlanId: authoredReadySetGraph.id,
                    schedulerContractId: schedulerRun.schedulerContractId,
                    schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                    schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                    schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                    schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                    schedulerRunId: schedulerRun.id,
                    schedulerReconcileSnapshotId: schedulerIntegrationOutcome.schedulerReconcileSnapshotId,
                    schedulerClaimReservationId: schedulerIntegrationOutcome.schedulerClaimReservationId,
                    schedulerIntegrationCandidateId: schedulerIntegrationOutcome.schedulerIntegrationCandidateId,
                    schedulerIntegrationCheckHandoffId: schedulerIntegrationOutcome.schedulerIntegrationCheckHandoffId,
                    schedulerIntegrationOutcomeId: schedulerIntegrationOutcome.id,
                    applyCheckId: schedulerIntegrationOutcome.integrationCheckId,
                    worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
                  };
                }
                return {
                  ...workflowNextAction("planning.scheduler.integration-check.run", schedulerIntegrationCheckHandoff ? "Scheduler IntegrationCheck 等待 apply/discard" : "等待更多 worker 输出", schedulerIntegrationCheckHandoff ? `IntegrationCheck ${schedulerIntegrationCheckHandoff.integrationCheckId} 已由 scheduler handoff 运行；当前状态 ${currentIntegrationStatus ?? "unknown"}，apply/discard 仍走既有后续人审门。` : "当前 ready target 少于 2；继续等待更多 scheduler worker 输出后再进入 IntegrationCheck handoff。"),
                  enabled: false,
                  disabledReason: schedulerIntegrationCheckHandoff ? "IntegrationCheck passed 时必须先使用既有 apply/discard 确认；terminal 后再记录 scheduler outcome。" : "ready scheduler worker output 少于 2。",
                  workflowGraphPlanId: authoredReadySetGraph.id,
                  schedulerContractId: schedulerRun.schedulerContractId,
                  schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                  schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                  schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                  schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                  schedulerRunId: schedulerRun.id,
                  schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                  schedulerClaimReservationId: schedulerClaimReservation.id,
                  schedulerIntegrationCandidateId: schedulerIntegrationCandidate.id,
                  schedulerIntegrationCheckHandoffId: schedulerIntegrationCheckHandoff?.id,
                  applyCheckId: schedulerIntegrationCheckHandoff?.integrationCheckId,
                  worktreeIds: schedulerIntegrationCandidate.readyWorktreeIds,
                };
              }
            }
            const waitingActionType = schedulerWorkerReworkAudit || schedulerWorkerReworkValidation || schedulerWorkerReworkResult || schedulerWorkerReworkStart || schedulerWorkerReworkPlan
              ? "planning.scheduler.worker.rework-plan.compile"
              : schedulerWorkerAudit
                ? "planning.scheduler.worker.audit-first"
                : schedulerWorkerValidation
                  ? "planning.scheduler.worker.audit-first"
                  : "planning.scheduler.worker.validate-first";
            return {
              ...workflowNextAction(waitingActionType, schedulerWorkerReworkAudit ? "等待后续 scheduler 阶段" : schedulerWorkerReworkValidation ? "等待 rework audit 阶段" : schedulerWorkerReworkResult ? "等待 rework validation 阶段" : schedulerWorkerReworkStart ? "等待 rework 结果对账阶段" : schedulerWorkerReworkPlan ? "等待启动 rework" : schedulerWorkerAudit ? "等待后续 scheduler 阶段" : schedulerWorkerValidation ? "等待 Audit 阶段" : "等待验证阶段", schedulerWorkerReworkAudit ? "当前 scheduler worker rework audit 已记录；next-worker/integration 不是当前范围。" : schedulerWorkerReworkValidation ? "当前 scheduler worker rework validation 未通过或等待 rework audit 条件。" : schedulerWorkerReworkResult ? "当前 scheduler worker rework result 不是 evidence-ready 或等待 rework validation 阶段。" : schedulerWorkerReworkStart ? "当前 scheduler worker rework 已启动；可以检查 rework 结果。" : schedulerWorkerReworkPlan ? "当前 scheduler worker rework plan 已记录；可以启动一次 same-worktree rework。" : schedulerWorkerAudit ? "当前 scheduler worker audit 已记录；rework/next-worker 不是当前范围。" : schedulerWorkerValidation ? "当前 scheduler worker validation 未通过或 audit 条件未满足。" : "当前 scheduler coder worker result 不是 evidence-ready，不能启动 validation。"),
              enabled: false,
              disabledReason: schedulerWorkerReworkAudit ? "当前 worker rework audit 已记录，后续阶段另开。" : schedulerWorkerReworkValidation ? "当前 worker rework validation 不是 passed。" : schedulerWorkerReworkResult ? "当前 worker rework result 不是 evidence-ready 或等待 rework validation 阶段。" : schedulerWorkerReworkStart ? "当前 worker rework 已启动，等待检查 rework 结果。" : schedulerWorkerReworkPlan ? "当前 worker rework plan 已记录，等待用户确认启动 rework。" : schedulerWorkerAudit ? "当前 worker audit 已记录。rework/next-worker 不是当前范围。" : schedulerWorkerValidation ? "当前 worker validation 不是 passed。" : "当前 worker result 不是 evidence-ready。",
              workflowGraphPlanId: authoredReadySetGraph.id,
              schedulerContractId: schedulerRun.schedulerContractId,
              schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
              schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
              schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
              schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
              schedulerRunId: schedulerRun.id,
              schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
              schedulerClaimReservationId: schedulerClaimReservation.id,
              schedulerWorkerStartId: schedulerWorkerStart.id,
              schedulerWorkerResultId: schedulerWorkerResult.id,
              schedulerWorkerValidationId: schedulerWorkerValidation?.id,
              schedulerWorkerAuditId: schedulerWorkerAudit?.id,
              schedulerWorkerReworkPlanId: schedulerWorkerReworkPlan?.id,
              schedulerWorkerReworkStartId: schedulerWorkerReworkStart?.id,
              schedulerWorkerReworkResultId: schedulerWorkerReworkResult?.id,
              schedulerWorkerReworkValidationId: schedulerWorkerReworkValidation?.id,
              schedulerWorkerReworkAuditId: schedulerWorkerReworkAudit?.id,
              reservationIntentId: schedulerWorkerStart.reservationIntentId,
              claimIntentId: schedulerWorkerStart.claimIntentId,
              taskRunId: schedulerWorkerReworkValidation?.reworkTaskRunId ?? schedulerWorkerReworkResult?.reworkTaskRunId ?? schedulerWorkerReworkStart?.reworkTaskRunId ?? schedulerWorkerValidation?.taskRunId ?? schedulerWorkerResult.taskRunId ?? schedulerWorkerStart.taskRunId,
              workerLeaseId: schedulerWorkerReworkValidation?.reworkWorkerLeaseId ?? schedulerWorkerReworkResult?.reworkWorkerLeaseId ?? schedulerWorkerReworkStart?.reworkWorkerLeaseId ?? schedulerWorkerValidation?.workerLeaseId ?? schedulerWorkerResult.workerLeaseId ?? schedulerWorkerStart.workerLeaseId,
              worktreeId: schedulerWorkerReworkValidation?.worktreeId ?? schedulerWorkerReworkResult?.worktreeId ?? schedulerWorkerReworkStart?.worktreeId ?? schedulerWorkerValidation?.worktreeId ?? schedulerWorkerResult.worktreeId ?? schedulerWorkerStart.worktreeId,
              runId: schedulerWorkerReworkValidation?.reworkRunId ?? schedulerWorkerReworkResult?.reworkRunId ?? schedulerWorkerReworkStart?.reworkRunId ?? schedulerWorkerValidation?.codeRunId ?? schedulerWorkerResult.runId ?? schedulerWorkerStart.runId,
              validationRunId: schedulerWorkerValidation?.validationRunId,
              reworkValidationRunId: schedulerWorkerReworkValidation?.validationRunId,
              auditRunId: schedulerWorkerAudit?.auditRunId,
              reworkAuditRunId: schedulerWorkerReworkAudit?.auditRunId,
            };
          }
          if (schedulerTransition?.actionType === "planning.scheduler.worker.reconcile-result") return {
            ...workflowNextAction("planning.scheduler.worker.reconcile-result", "检查当前 worker 结果", "读取 TaskRun、WorkerLease、worktree 和 code run evidence；只写 scheduler worker result，不启动 validation、audit、rework 或下一个 worker。"),
            workflowGraphPlanId: authoredReadySetGraph.id,
            schedulerContractId: schedulerRun.schedulerContractId,
            schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
            schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
            schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
            schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
            schedulerRunId: schedulerRun.id,
            schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
            schedulerClaimReservationId: schedulerClaimReservation.id,
            schedulerWorkerStartId: schedulerWorkerStart.id,
            reservationIntentId: schedulerWorkerStart.reservationIntentId,
            claimIntentId: schedulerWorkerStart.claimIntentId,
          };
        }
        if (schedulerTransition?.kind === "start-first-worker") {
          return {
            ...workflowNextAction("planning.scheduler.worker.start-first", "开始第一个任务", "用户已确认低冲突执行方向；本操作只开始当前准备记录中的第一个可执行编码任务。"),
            workflowGraphPlanId: authoredReadySetGraph.id,
            schedulerContractId: schedulerRun.schedulerContractId,
            schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
            schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
            schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
            schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
            schedulerRunId: schedulerRun.id,
            schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
            schedulerClaimReservationId: schedulerClaimReservation.id,
            reservationIntentId: schedulerTransition.reservationIntent.reservationIntentId,
            claimIntentId: schedulerTransition.reservationIntent.claimIntentId,
          };
        }
        const disabledSchedulerReason = schedulerTransition && "reason" in schedulerTransition
          ? schedulerTransition.reason
          : "当前 Scheduler ready-set graph 没有可启动的 first-worker transition。";
        return {
          ...workflowNextAction("planning.scheduler.worker.start-first", "等待 scheduler transition", disabledSchedulerReason),
          enabled: false,
          disabledReason: disabledSchedulerReason,
          workflowGraphPlanId: authoredReadySetGraph.id,
          schedulerContractId: schedulerRun.schedulerContractId,
          schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
          schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
          schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
          schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
          schedulerRunId: schedulerRun.id,
          schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
          schedulerClaimReservationId: schedulerClaimReservation.id,
        };
      }
      return {
        ...workflowNextAction("planning.scheduler.worker.start-first", "等待执行确认迁移", "旧版 SchedulerRun 尚未记录启动确认，不能通过已删除的准备动作继续。"),
        enabled: false,
        disabledReason: "旧版未启动 SchedulerRun 需要重新生成计划。",
        workflowGraphPlanId: authoredReadySetGraph.id,
        schedulerContractId: schedulerRun.schedulerContractId,
        schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
        schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
        schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
        schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
        schedulerRunId: schedulerRun.id,
        schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
        schedulerClaimReservationId: schedulerClaimReservation.id,
      };
    }
    return {
      ...workflowNextAction("planning.scheduler.worker.start-first", "等待 Scheduler 初始化", "当前计划尚无可执行的 SchedulerRun。"),
      enabled: false,
      disabledReason: "Scheduler 执行证据尚未初始化；请重新生成计划。",
      workflowGraphPlanId: authoredReadySetGraph.id,
    };
  }
  return {
    ...workflowNextAction("intake.reanalyze", "等待计划", "当前 Change 没有由 Plan child 产出并接受的 WorkflowGraphPlan。", false),
    enabled: false,
    disabledReason: "旧版未启动计划不能直接执行；请在主对话中重新规划并确认。",
  };
}

function workflowNextAction(actionType: WorkflowProjectionActionType, label: string, description: string, requiresConfirmation = true): WorkbenchTypedWorkflowNextAction {
  return {
    id: `workflow:${actionType}`,
    label,
    description,
    kind: "workflow-action",
    actionType,
    enabled: true,
    requiresConfirmation,
  };
}
