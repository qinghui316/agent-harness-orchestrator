export type ProjectMemoryApplyStage = "prepared" | "applying" | "applied" | "completed";
export type ProjectMemoryApplyRoot = "memory" | "project";

export interface ProjectMemoryApplyFile {
  path: string;
  root: ProjectMemoryApplyRoot;
  operation: "add" | "modify" | "delete" | "rename";
  beforeHash: string | null;
  afterHash: string | null;
  beforeContent: string | null;
  afterContent: string | null;
}

export interface ProjectMemoryApplyTransaction {
  version: "1.0";
  id: string;
  assignmentId: string;
  projectId: string | null;
  memoryMode: "repo-local" | "external-local";
  manifestHash: string;
  baseHash: string;
  workspaceHash: string;
  beforeTreeHash: string;
  afterTreeHash: string;
  stage: ProjectMemoryApplyStage;
  files: ProjectMemoryApplyFile[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemoryApplyResult {
  status: "applied" | "noop";
  transactionId: string;
  assignmentId: string;
  manifestHash: string;
  changedPaths: string[];
  artifactPath: string;
}
