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

export interface ResolvedMemory {
  mode: MemoryMode;
  supported: boolean;
  writable: boolean;
  projectId: string | null;
  projectRoot: string;
  markerPath: string;
  harnessRoot: string;
  changesRoot: string;
  evolutionRoot: string;
  templatesRoot: string;
  runsRoot: string;
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
    harnessRoot: string;
    changesRoot: string;
    evolutionRoot: string;
    templatesRoot: string;
    runsRoot: string;
  };
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

export type ChangeState = "active" | "archived";

export interface ChangeMetadata {
  version: "1.0";
  id: string;
  title: string;
  state: ChangeState;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  archivePath: string | null;
}

export type ReviewStatus = "pending" | "approved" | "approved-with-notes" | "blocked" | "missing" | "unknown";

export interface AcceptanceCriterion {
  id: string;
  text: string;
  taskIds: string[];
  validationRefs: string[];
  warnings: string[];
}

export interface ParsedTask {
  id: string;
  text: string;
  acIds: string[];
  done: boolean;
  warnings: string[];
}

export interface AcMap {
  version: "1.0";
  generatedAt: string;
  changeId: string;
  acceptanceCriteria: AcceptanceCriterion[];
  tasks: ParsedTask[];
  warnings: string[];
  blockingIssues: string[];
}

export interface CloseGateResult {
  ready: boolean;
  warnings: string[];
  blockingIssues: string[];
}

export interface ChangeStatus {
  projectPath: string;
  activeChanges: ChangeIndexItem[];
  change: ChangeMetadata | null;
  reviewStatus: ReviewStatus;
  acMap: AcMap | null;
  closeGate: CloseGateResult;
}

export type RunStatus = "created" | "running" | "completed" | "failed";

export type RunRuntime = "local-command" | "codex-readonly";

export type RunExecutionMode = "direct";

export interface RunArtifactPaths {
  directory: string;
  context: string;
  events: string;
  stdout: string;
  stderr: string;
  prompt?: string;
  codexEvents?: string;
  lastMessage?: string;
  worktree?: string;
  diff?: string;
  validation?: string;
  review?: string;
}

export interface RunMetadata {
  version: "1.0";
  id: string;
  changeId: string;
  projectPath: string;
  runtime: RunRuntime;
  executionMode?: RunExecutionMode;
  proposalOnly?: boolean;
  command: string[];
  status: RunStatus;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startedAt: string;
  finishedAt: string | null;
  artifacts: RunArtifactPaths;
}

export interface RunEvent {
  timestamp: string;
  type:
    | "run.created"
    | "context.prepared"
    | "process.started"
    | "process.exited"
    | "codex.capabilities.detected"
    | "codex.capabilities.failed"
    | "codex.started"
    | "codex.exited"
    | "run.completed"
    | "run.failed";
  runId: string;
  data?: Record<string, unknown>;
}
