import type { SchedulerMode } from "../workflow-scheduler/types.js";

export type SchedulerRuntimeStateStatus = "initialized" | "blocked";
export type SchedulerClaimIntentRuntimeStatus = "pending" | "blocked";
export type SchedulerRuntimeEventType = "scheduler-runtime.initialized" | "scheduler-runtime.reconciled" | "scheduler-runtime.blocked";
export type SchedulerReconcileSnapshotStatus = "generated" | "blocked";

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
