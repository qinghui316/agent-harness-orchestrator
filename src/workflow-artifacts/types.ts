export type { WorkflowGraphPlan, WorkflowGraphStage } from "../types/index.js";

export type WorkflowAuthoringMode = "sequential-v1" | "ready-set-v1";

export interface WorkflowAuthoringNode {
  id: string;
  title: string;
  taskIds: string[];
  acIds: string[];
  prompt: string;
  dependsOn: string[];
  sourceScopes: string[];
}

export interface WorkflowAuthoringPlan {
  version: "1.0";
  mode: WorkflowAuthoringMode;
  nodes: WorkflowAuthoringNode[];
}

export interface WorkflowAuthoringReferences {
  taskIds: readonly string[];
  acIds: readonly string[];
}

export interface AuthoredWorkflowGraphCompileOptions extends WorkflowAuthoringReferences {
  id: string;
  changeId: string;
  planArtifactRef: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt?: string;
}

export type WorkflowArtifactWithChange = { changeId: string; id?: string };
