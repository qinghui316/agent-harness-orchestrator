import type { SchedulerMode } from "../workflow-scheduler/types.js";

export type SchedulerRuntimeStateStatus = "initialized" | "blocked";
export type SchedulerClaimIntentRuntimeStatus = "pending" | "blocked";
export type SchedulerRuntimeClaimReservationStatus = "reserved" | "blocked" | "rejected";
export type SchedulerRuntimeClaimReservationIntentStatus = "reserved" | "blocked";
export type SchedulerRuntimeSourceLockReservationStatus = "reserved" | "blocked";
export type SchedulerRuntimeWaveReservationStatus = "reserved" | "blocked";
export type SchedulerRuntimeEventType =
  | "scheduler-runtime.initialized"
  | "scheduler-runtime.reconciled"
  | "scheduler-runtime.blocked"
  | "scheduler-runtime.claim-reserved"
  | "scheduler-runtime.claim-blocked"
  | "scheduler-runtime.claim-reservation.superseded"
  | "scheduler-runtime.worker-started"
  | "scheduler-runtime.worker-start-failed"
  | "scheduler-runtime.worker-result-ready"
  | "scheduler-runtime.worker-result-failed"
  | "scheduler-runtime.worker-validation-passed"
  | "scheduler-runtime.worker-validation-failed";
export type SchedulerReconcileSnapshotStatus = "generated" | "blocked";
export type SchedulerRuntimeWorkerStartStatus = "started" | "failed";
export type SchedulerRuntimeWorkerResultStatus = "evidence-ready" | "failed";
export type SchedulerRuntimeWorkerValidationStatus = "passed" | "failed";

export interface SchedulerRuntimeClaimIntentState {
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  status: SchedulerClaimIntentRuntimeStatus;
  plannedSlotDemand: number;
  sourceScopes: string[];
  blockedReasons: string[];
}

export interface SchedulerRuntimeWaveState {
  waveIndex: number;
  claimIntentIds: string[];
  candidateCount: number;
  blockedCount: number;
  plannedSlotDemand: number;
  status: SchedulerClaimIntentRuntimeStatus;
  blockedReasons: string[];
}

export interface SchedulerRuntimeState {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeStateStatus;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  decompositionPlanId: string;
  readinessManifestId: string;
  claimIntents: SchedulerRuntimeClaimIntentState[];
  waves: SchedulerRuntimeWaveState[];
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  lastReconcileSnapshotId?: string;
  lastClaimReservationId?: string;
  lastClaimReservationSnapshotId?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  eventsArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeEvent {
  version: "1.0";
  id: string;
  schedulerRunId: string;
  changeId: string;
  type: SchedulerRuntimeEventType;
  timestamp: string;
  status?: SchedulerRuntimeStateStatus;
  summary?: string;
  artifactRefs?: string[];
  payload?: Record<string, unknown>;
}

export interface SchedulerReconcileSnapshot {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerReconcileSnapshotStatus;
  schedulerRuntimeStateId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  claimIntents: SchedulerRuntimeClaimIntentState[];
  waves: SchedulerRuntimeWaveState[];
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  warningCount: number;
  warnings: string[];
  recoveryCheckpoint: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
}

export interface SchedulerRuntimeClaimReservationIntent {
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  status: SchedulerRuntimeClaimReservationIntentStatus;
  plannedSlotDemand: number;
  sourceScopes: string[];
  blockedReasons: string[];
}

export interface SchedulerRuntimeSourceLockReservation {
  scope: string;
  waveIndex: number;
  reservationIntentIds: string[];
  status: SchedulerRuntimeSourceLockReservationStatus;
  blockedReasons: string[];
}

export interface SchedulerRuntimeWaveReservation {
  waveIndex: number;
  reservationIntentIds: string[];
  reservedCount: number;
  blockedCount: number;
  plannedSlotDemand: number;
  status: SchedulerRuntimeWaveReservationStatus;
  blockedReasons: string[];
}

export interface SchedulerRuntimeClaimReservation {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeClaimReservationStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntents: SchedulerRuntimeClaimReservationIntent[];
  waves: SchedulerRuntimeWaveReservation[];
  sourceLocks: SchedulerRuntimeSourceLockReservation[];
  reservedCount: number;
  blockedCount: number;
  sourceLockCount: number;
  supersedesReservationId?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
}

export interface SchedulerRuntimeWorkerStart {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerStartStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "coder";
  taskId: string;
  taskRunId: string;
  workerLeaseId: string;
  taskRunRoleId: string;
  agentRoleId: string;
  worktreeId?: string;
  runId?: string;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerResult {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerResultStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "coder";
  taskId: string;
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  workerLeaseStatus: string;
  agentRoleId: string;
  worktreeId?: string;
  runId?: string;
  runStatus?: string;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerValidation {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerValidationStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "validation";
  taskId: string;
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  codeRunId: string;
  validationRunId: string;
  validationStatus: string;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}
