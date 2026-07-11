import type { MemoryMode } from "./project-memory.js";

export interface MaintenanceWorkspaceRequest {
  assignmentId: string;
  memoryMode: MemoryMode;
  memoryRoot: string;
  maintenanceRoot: string;
  namespaces: string[];
  baseRef?: string;
}

export interface MaintenanceWorkspace {
  version: "1.0";
  assignmentId: string;
  mode: "git-worktree" | "immutable-snapshot";
  memoryMode: "repo-local" | "external-local";
  maintenanceRoot: string;
  baseRoot: string;
  baseSnapshotRoot: string;
  workspaceRoot: string;
  namespaces: string[];
  baseRef: string;
  baseHash: string;
  baseTreeHash: string;
}

export interface MaintenanceDiffFile {
  path: string;
  hash: string;
}

export interface MaintenanceDiffRename {
  from: string;
  to: string;
  hash: string;
}

export interface MaintenanceDiffManifest {
  version: "1.0";
  assignmentId: string;
  baseHash: string;
  workspaceHash: string;
  treeHash: string;
  added: MaintenanceDiffFile[];
  modified: MaintenanceDiffFile[];
  deleted: MaintenanceDiffFile[];
  renamed: MaintenanceDiffRename[];
  unifiedDiff: string;
}
