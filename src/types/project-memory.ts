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
  memoryMode: MemoryMode;
  createdAt: string;
}

export type MemoryMode = "repo-local" | "external-local" | "remote";

export type ArtifactBase = "project-root" | "memory-root";

export interface ResolvedMemory {
  mode: MemoryMode;
  supported: boolean;
  writable: boolean;
  artifactBase: ArtifactBase;
  projectId: string | null;
  projectRoot: string;
  markerPath: string;
  agentGuidePath: string;
  memoryRoot: string;
  docsRoot: string;
  harnessRoot: string;
  changesRoot: string;
  evolutionRoot: string;
  templatesRoot: string;
  scriptsRoot: string;
  runsRoot: string;
  workbenchRoot: string;
  workbenchDbPath: string;
  agentsRoot: string;
  commandsRoot: string;
  agentCatalogPath: string;
  skillsRoot: string;
  worktreeMetadataRoot: string;
  worktreeIndexPath: string;
  reason?: string;
}

export interface MemoryStatus {
  registered: boolean;
  managed: boolean;
  memoryMode: MemoryMode;
  memoryAvailable: boolean;
  harnessReady: boolean;
  markerPath: string;
  roots: {
    projectRoot: string;
    memoryRoot: string;
    docsRoot: string;
    harnessRoot: string;
    changesRoot: string;
    evolutionRoot: string;
    templatesRoot: string;
    scriptsRoot: string;
    runsRoot: string;
    workbenchRoot: string;
    workbenchDbPath: string;
    agentsRoot: string;
    commandsRoot: string;
    agentCatalogPath: string;
    skillsRoot: string;
    worktreeMetadataRoot: string;
    worktreeIndexPath: string;
  };
  artifactBase: ArtifactBase;
  unsupportedReason?: string;
}

export interface RegistryFile {
  version: "1.0";
  projects: ManagedProject[];
}

export type HarnessReadiness = "missing" | "partial" | "ready";

export interface HarnessComponentStatus {
  name: string;
  path: string;
  location: "project" | "memory";
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

export interface CodexProjectTrustStatus {
  trusted: boolean;
  configPath: string;
  projectKey: string;
  configExists: boolean;
  reason?: string;
}

export interface ProjectStatus {
  project: ManagedProject | null;
  path: string;
  pathExists: boolean;
  isGitRepo: boolean;
  branch: string | null;
  dirty: boolean | null;
  managed: boolean;
  memory: MemoryStatus;
  harness: HarnessAuditResult;
  codexTrust: CodexProjectTrustStatus;
}
