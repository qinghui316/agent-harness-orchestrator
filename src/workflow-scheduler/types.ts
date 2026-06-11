import type { WorkflowGraphStage } from "../types/index.js";
import type { DecompositionPlan, DecompositionReadinessManifest } from "../workflow-artifacts/types.js";

export type SchedulerContractStatus = "compiled" | "superseded" | "rejected";
export type SchedulerDispatchDryRunStatus = "generated" | "superseded" | "rejected";
export type SchedulerMode = "parallel-readiness-v1";

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
  decompositionPlanId: string;
  readinessManifestId: string;
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

export interface SchedulerContractCompileInput {
  plan: DecompositionPlan;
  readiness: DecompositionReadinessManifest;
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
  decompositionPlanId: string;
  readinessManifestId: string;
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
