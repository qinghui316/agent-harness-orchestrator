import type { MemoryMode } from "./project-memory.js";

export interface CanonicalMaintenanceTargetRequest {
  assignmentId: string;
  memoryMode: MemoryMode;
  memoryRoot: string;
  namespaces: string[];
  additionalSources?: CanonicalMaintenanceTargetSource[];
}

export interface CanonicalMaintenanceTargetSource {
  key: "project";
  root: string;
  namespaces: string[];
}

export interface CanonicalMaintenanceTarget {
  version: "1.0";
  assignmentId: string;
  mode: "canonical-direct";
  memoryMode: "repo-local" | "external-local";
  baseRoot: string;
  namespaces: string[];
  additionalSources?: CanonicalMaintenanceTargetSource[];
}
