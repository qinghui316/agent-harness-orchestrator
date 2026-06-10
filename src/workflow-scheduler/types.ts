import type { WorkflowGraphStage } from "../types/index.js";
import type { DecompositionPlan, DecompositionReadinessManifest } from "../workflow-artifacts/types.js";

export type SchedulerContractStatus = "compiled" | "superseded" | "rejected";
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
