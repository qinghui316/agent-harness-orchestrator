export interface ManagedProject {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  lastSeenAt: string;
}

export interface ProjectMarker {
  version: "1.0";
  id: string;
  name: string;
  managedBy: "agent-harness-orchestrator";
  createdAt: string;
}

export interface RegistryFile {
  version: "1.0";
  projects: ManagedProject[];
}

export type HarnessReadiness = "missing" | "partial" | "ready";

export interface HarnessComponentStatus {
  name: string;
  path: string;
  exists: boolean;
  required: boolean;
}

export interface ChangeIndexItem {
  name: string;
  path: string;
}

export interface ChangeIndex {
  generated_at: string;
  active: ChangeIndexItem[];
  parking: ChangeIndexItem[];
  archive: ChangeIndexItem[];
}

export interface HarnessAuditResult {
  projectPath: string;
  managed: boolean;
  readiness: HarnessReadiness;
  activeChanges: ChangeIndexItem[];
  pendingEvolution: boolean;
  components: HarnessComponentStatus[];
}

export interface ProjectStatus {
  project: ManagedProject | null;
  path: string;
  pathExists: boolean;
  isGitRepo: boolean;
  branch: string | null;
  dirty: boolean | null;
  managed: boolean;
  harness: HarnessAuditResult;
}
