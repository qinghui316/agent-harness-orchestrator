import type { WorkerPermissionProfile, WorkflowGraphStage } from "../types/index.js";

export type SchedulerContractStatus = "compiled" | "superseded" | "rejected";
export type SchedulerDispatchDryRunStatus = "generated" | "superseded" | "rejected";
export type SchedulerWorkerSessionPlanStatus = "planned" | "superseded" | "rejected";
export type SchedulerClaimReconcilePlanStatus = "planned" | "superseded" | "rejected";
export type SchedulerLaunchPreflightStatus = "checked" | "blocked" | "rejected";
export type SchedulerRunStatus = "prepared" | "blocked" | "abandoned" | "completed";
export type SchedulerRunJournalEventType = "scheduler-run.prepared" | "scheduler-run.blocked" | "scheduler-run.abandoned" | "scheduler-run.completed";
export type SchedulerMode = "parallel-readiness-v1";
export type SchedulerWorkerStageStatus = "planned" | "blocked";
export type SchedulerClaimIntentStatus = "planned" | "blocked";
export type SchedulerWorkerWorkspaceKind = "future-local-worktree";
export type SchedulerWorkerAdapterFamily = "codex-code" | "validation-command" | "audit-codex-readonly";
export type SchedulerWorkerRecoveryKeyCoverage = "complete" | "partial";

export interface SchedulerContractNode {
  id: string;
  unitId: string;
  taskIds: string[];
  acIds: string[];
  title: string;
  sourceScopes: string[];
  stages: WorkflowGraphStage[];
}

export interface SchedulerContractEdge {
  from: string;
  to: string;
  kind: "dependency" | "synthesis";
}

export interface SchedulerContractWave {
  index: number;
  nodeIds: string[];
}

export interface SchedulerContract {
  version: "1.0";
  id: string;
  changeId: string;
  status: SchedulerContractStatus;
  schedulerMode: SchedulerMode;
  workflowGraphPlanId: string;
  nodes: SchedulerContractNode[];
  edges: SchedulerContractEdge[];
  waves: SchedulerContractWave[];
  conflictScopes: string[];
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerDryRunNodeVerdict {
  nodeId: string;
  unitId: string;
  waveIndex: number;
  status: "candidate" | "blocked";
  dependencyNodeIds: string[];
  dependenciesSatisfied: boolean;
  sourceScopes: string[];
  stages: WorkflowGraphStage[];
  runtimeContinuityPrerequisites: string[];
  blockedReasons: string[];
}

export interface SchedulerDryRunWaveVerdict {
  index: number;
  nodeIds: string[];
  status: "candidate" | "blocked";
  candidateCount: number;
  blockedCount: number;
  blockedReasons: string[];
}

export interface SchedulerDispatchDryRun {
  version: "1.0";
  id: string;
  changeId: string;
  status: SchedulerDispatchDryRunStatus;
  schedulerMode: SchedulerMode;
  schedulerContractId: string;
  workflowGraphPlanId: string;
  nodeVerdicts: SchedulerDryRunNodeVerdict[];
  waveVerdicts: SchedulerDryRunWaveVerdict[];
  estimatedMaxWaveWidth: number;
  dependencyCount: number;
  conflictCount: number;
  conflictScopes: string[];
  runtimeContinuityPrerequisites: string[];
  blockedReasons: string[];
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerWorkerWorkspaceIntent {
  kind: SchedulerWorkerWorkspaceKind;
  sourceScopes: string[];
  requiresFreshWorktree: boolean;
}

export interface SchedulerWorkerEventSourceExpectation {
  adapterFamily: SchedulerWorkerAdapterFamily;
  expectedEventTypes: string[];
}

export interface SchedulerWorkerRecoveryKeyInput {
  key: string;
  value: string | string[];
}

export interface SchedulerWorkerPlanStage {
  id: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stage: WorkflowGraphStage;
  roleId: string;
  status: SchedulerWorkerStageStatus;
  workspaceIntent: SchedulerWorkerWorkspaceIntent;
  adapterFamily: SchedulerWorkerAdapterFamily;
  permissionProfile: WorkerPermissionProfile;
  eventSourceExpectation: SchedulerWorkerEventSourceExpectation;
  recoveryKeyInputs: SchedulerWorkerRecoveryKeyInput[];
  blockedReasons: string[];
}

export interface SchedulerWorkerPlanNode {
  nodeId: string;
  unitId: string;
  waveIndex: number;
  status: SchedulerWorkerStageStatus;
  stageIds: string[];
  blockedReasons: string[];
}

export interface SchedulerWorkerSessionPlan {
  version: "1.0";
  id: string;
  changeId: string;
  status: SchedulerWorkerSessionPlanStatus;
  schedulerMode: SchedulerMode;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  workflowGraphPlanId: string;
  plannedNodes: SchedulerWorkerPlanNode[];
  plannedStages: SchedulerWorkerPlanStage[];
  plannedWorkerCount: number;
  stageCount: number;
  blockedCount: number;
  warningCount: number;
  recoveryKeyCoverage: SchedulerWorkerRecoveryKeyCoverage;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerSourceLockIntent {
  scope: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageIds: string[];
}

export interface SchedulerClaimIntent {
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageIds: string[];
  roleIds: string[];
  sourceScopes: string[];
  status: SchedulerClaimIntentStatus;
  plannedSlotDemand: number;
  sourceLockIntents: SchedulerSourceLockIntent[];
  recoveryKeyInputs: SchedulerWorkerRecoveryKeyInput[];
  blockedReasons: string[];
}

export interface SchedulerReconcileWaveCheckpoint {
  waveIndex: number;
  claimIntentIds: string[];
  candidateCount: number;
  blockedCount: number;
  plannedSlotDemand: number;
  blockedReasons: string[];
}

export interface SchedulerClaimReconcilePlan {
  version: "1.0";
  id: string;
  changeId: string;
  status: SchedulerClaimReconcilePlanStatus;
  schedulerMode: SchedulerMode;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  workflowGraphPlanId: string;
  claimIntents: SchedulerClaimIntent[];
  waveCheckpoints: SchedulerReconcileWaveCheckpoint[];
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  recoveryKeyCoverage: SchedulerWorkerRecoveryKeyCoverage;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerLaunchPreflightClaimSummary {
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  status: SchedulerClaimIntentStatus;
  plannedSlotDemand: number;
  sourceScopes: string[];
  blockedReasons: string[];
}

export interface SchedulerLaunchPreflightSourceLockSummary {
  scope: string;
  waveIndexes: number[];
  claimIntentIds: string[];
  status: "clear" | "blocked";
  blockedReasons: string[];
}

export interface SchedulerLaunchRequirement {
  id: string;
  status: "required" | "blocked";
  description: string;
}

export interface SchedulerLaunchPreflight {
  version: "1.0";
  id: string;
  changeId: string;
  status: SchedulerLaunchPreflightStatus;
  schedulerMode: SchedulerMode;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  workflowGraphPlanId: string;
  claimSummaries: SchedulerLaunchPreflightClaimSummary[];
  sourceLockSummaries: SchedulerLaunchPreflightSourceLockSummary[];
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  runtimeContinuityRequirements: SchedulerLaunchRequirement[];
  permissionProfileRequirements: SchedulerLaunchRequirement[];
  toolPolicyGateRequirement: SchedulerLaunchRequirement;
  humanGateRequirement: SchedulerLaunchRequirement;
  blockedReasons: string[];
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRun {
  version: "1.0";
  id: string;
  changeId: string;
  status: SchedulerRunStatus;
  schedulerMode: SchedulerMode;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  workflowGraphPlanId: string;
  claimIntentCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  humanConfirmed: boolean;
  futureToolPolicyGateRequired: boolean;
  futureHumanGateRequired: boolean;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  journalArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRunJournalEvent {
  version: "1.0";
  id: string;
  schedulerRunId: string;
  changeId: string;
  schedulerLaunchPreflightId: string;
  type: SchedulerRunJournalEventType;
  timestamp: string;
  status?: SchedulerRunStatus;
  summary?: string;
  artifactRefs?: string[];
  payload?: Record<string, unknown>;
}
