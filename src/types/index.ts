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
  latestValidation: ValidationSummary | null;
  latestAudit: AuditSummary | null;
  closeGate: CloseGateResult;
}

export type RunStatus = "created" | "running" | "completed" | "failed";

export type RunRuntime = "local-command" | "codex-readonly" | "validator" | "auditor" | "coder-codex";

export type RunExecutionMode = "direct" | "worktree";

export type WorktreeLifecycleStatus = "active";

export interface WorktreeMetadata {
  version: "1.0";
  worktreeId: string;
  projectId: string;
  changeId: string;
  runId?: string;
  branchName: string;
  baseRef: string;
  baseCommit: string;
  createdFromDirtyProject: boolean;
  createdAt: string;
  status: WorktreeLifecycleStatus;
  checkoutPath: string;
}

export interface WorktreeStatus extends WorktreeMetadata {
  exists: boolean;
  branch: string | null;
  headCommit: string | null;
  dirty: boolean | null;
  diffSummary: string[];
}

export interface RunWorktreeInfo {
  worktreeId: string;
  branchName: string;
  baseRef: string;
  baseCommit: string;
  checkoutPath: string;
  metadataPath: string;
}

export interface RunArtifactPaths {
  base?: ArtifactBase;
  directory: string;
  context: string;
  events: string;
  stdout: string;
  stderr: string;
  prompt?: string;
  codexEvents?: string;
  lastMessage?: string;
  implementation?: string;
  worktree?: string;
  diff?: string;
  diffStat?: string;
  validation?: string;
  audit?: string;
  auditMarkdown?: string;
  review?: string;
}

export type ValidationStatus = "passed" | "failed";

export interface ValidationCommandResult {
  name: string;
  command: string[];
  cwd: string;
  status: ValidationStatus;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startedAt: string;
  finishedAt: string;
  stdout: string;
  stderr: string;
}

export interface ValidationResult {
  version: "1.0";
  id: string;
  runId: string;
  changeId: string;
  profile: string;
  status: ValidationStatus;
  executionMode: RunExecutionMode;
  worktreeId?: string;
  startedAt: string;
  finishedAt: string;
  commands: ValidationCommandResult[];
}

export interface ValidationSummary {
  id: string;
  runId: string;
  changeId: string;
  profile: string;
  status: ValidationStatus;
  executionMode: RunExecutionMode;
  worktreeId?: string;
  startedAt: string;
  finishedAt: string;
  commandCount: number;
}

export type AuditStatus = "approved" | "approved-with-notes" | "blocked" | "failed";

export type AuditFindingSeverity = "blocking" | "note";

export interface AuditFinding {
  severity: AuditFindingSeverity;
  area: string;
  evidence: string;
  recommendation: string;
  text: string;
}

export interface AuditResult {
  version: "1.0";
  id: string;
  runId: string;
  changeId: string;
  status: AuditStatus;
  worktreeId?: string;
  validationId?: string;
  startedAt: string;
  finishedAt: string;
  findings: AuditFinding[];
  artifacts: {
    audit: string;
    auditMarkdown: string;
    lastMessage: string;
    diff?: string;
    diffStat?: string;
  };
}

export interface AuditSummary {
  id: string;
  runId: string;
  changeId: string;
  status: AuditStatus;
  worktreeId?: string;
  validationId?: string;
  startedAt: string;
  finishedAt: string;
  findingCount: number;
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
  worktree?: RunWorktreeInfo;
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
    | "validation.started"
    | "validation.command.started"
    | "validation.command.exited"
    | "validation.completed"
    | "validation.failed"
    | "audit.started"
    | "audit.completed"
    | "audit.failed"
    | "worktree.created"
    | "coder.started"
    | "coder.exited"
    | "diff.collected"
    | "source.checked"
    | "run.completed"
    | "run.failed";
  runId: string;
  data?: Record<string, unknown>;
}
