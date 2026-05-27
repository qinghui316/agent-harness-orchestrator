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
  specTest: SpecTestStatus | null;
  latestValidation: ValidationSummary | null;
  latestAudit: AuditSummary | null;
  closeGate: CloseGateResult;
}

export type SpecTestRef =
  | { type: "file"; path: string }
  | { type: "testName"; name: string; path: string }
  | { type: "command"; commandName: string }
  | { type: "note"; text: string };

export interface SpecTestMapping {
  acId: string;
  refs: SpecTestRef[];
}

export interface SpecTests {
  version: "1.0";
  changeId: string;
  updatedAt: string;
  mappings: SpecTestMapping[];
}

export type SpecTestConfidence = "none" | "linked-only" | "validation-passed" | "stale" | "invalid";

export interface SpecTestCommandEvidence {
  commandName: string;
  validationStatus: ValidationStatus | "missing";
}

export interface SpecTestAcStatus {
  acId: string;
  text: string;
  linkedEvidence: boolean;
  evidenceFilesExist: boolean;
  latestValidationStatus: ValidationStatus | null;
  commandEvidence: SpecTestCommandEvidence[];
  confidence: SpecTestConfidence;
  refs: SpecTestRef[];
  warnings: string[];
  blockingIssues: string[];
}

export interface SpecTestStatus {
  version: "1.0";
  changeId: string;
  selectedRoot: string;
  selectedWorktreeId?: string;
  latestValidation: ValidationSummary | null;
  mappings: SpecTestMapping[];
  acceptanceCriteria: SpecTestAcStatus[];
  warnings: string[];
  blockingIssues: string[];
}

export type SpecTestDriftStatus = "ok" | "missing" | "invalid" | "stale" | "failed" | "unknown";

export interface SpecTestDriftAcStatus {
  acId: string;
  text: string;
  status: SpecTestDriftStatus;
  reasons: string[];
  warnings: string[];
  blockingIssues: string[];
  recommendedNextAction: string;
}

export interface SpecTestDriftReport {
  version: "1.0";
  changeId: string;
  selectedRoot: string;
  selectedRootType: "source-root" | "worktree";
  selectedWorktreeId?: string;
  latestValidationId: string | null;
  latestValidationStatus: ValidationStatus | null;
  specTestsUpdatedAt: string;
  freshness: {
    specChangedAfterEvidence: boolean;
    tasksChangedAfterEvidence: boolean;
    validationOlderThanEvidence: boolean;
  };
  summary: Record<SpecTestDriftStatus, number>;
  acceptanceCriteria: SpecTestDriftAcStatus[];
  warnings: string[];
  blockingIssues: string[];
  strict: {
    passed: boolean;
    failingStatuses: SpecTestDriftStatus[];
  };
}

export type SpecTestProposalStatus = "proposed" | "blocked" | "failed";

export type SpecTestProposalSource = "source-root" | "worktree-only" | "suggested" | "unknown";

export type SpecTestProposalKind =
  | "existingEvidence"
  | "alreadyLinked"
  | "missingEvidence"
  | "suggestedNewTests"
  | "openQuestions";

export interface SpecTestProposalEvidence {
  refId: string;
  acId: string;
  source: SpecTestProposalSource;
  kind: SpecTestProposalKind;
  refs: SpecTestRef[];
  rationale: string;
}

export interface SpecTestProposal {
  version: "1.0";
  id: string;
  runId: string;
  changeId: string;
  status: SpecTestProposalStatus;
  worktreeId?: string;
  startedAt: string;
  finishedAt: string;
  evidence: SpecTestProposalEvidence[];
  artifacts: {
    proposal: string;
    proposalMarkdown: string;
    lastMessage: string;
  };
  warnings: string[];
}

export interface SpecTestProposalSummary {
  id: string;
  runId: string;
  changeId: string;
  status: SpecTestProposalStatus;
  worktreeId?: string;
  startedAt: string;
  finishedAt: string;
  evidenceCount: number;
  existingEvidenceCount: number;
  acceptedSourceRootCount: number;
}

export type ChangeProposalStatus = "proposed" | "blocked" | "failed";

export interface ChangeProposalTargetHashes {
  spec?: string;
  plan?: string;
  tasks?: string;
}

export interface SpecProposal {
  version: "1.0";
  id: string;
  runId: string;
  changeId: string;
  status: ChangeProposalStatus;
  startedAt: string;
  finishedAt: string;
  targetHashes: ChangeProposalTargetHashes;
  specMd: string;
  openQuestions: string[];
  assumptions: string[];
  warnings: string[];
  artifacts: {
    proposal: string;
    proposalMarkdown: string;
    lastMessage: string;
  };
}

export interface PlanProposal {
  version: "1.0";
  id: string;
  runId: string;
  changeId: string;
  status: ChangeProposalStatus;
  startedAt: string;
  finishedAt: string;
  targetHashes: ChangeProposalTargetHashes;
  planMd: string;
  tasksMd: string;
  openQuestions: string[];
  assumptions: string[];
  warnings: string[];
  artifacts: {
    proposal: string;
    proposalMarkdown: string;
    lastMessage: string;
  };
}

export interface ChangeProposalSummary {
  id: string;
  runId: string;
  changeId: string;
  status: ChangeProposalStatus;
  startedAt: string;
  finishedAt: string;
  openQuestionCount: number;
  warningCount: number;
}

export type RunStatus = "created" | "running" | "completed" | "failed";

export type RunRuntime = "local-command" | "codex-readonly" | "validator" | "auditor" | "coder-codex" | "worktree-apply" | "worktree-discard" | "spec-test-proposer" | "spec-test-generator" | "spec-agent" | "planner" | "orchestrator" | "agent-codex" | "intake-scan";

export type RunExecutionMode = "direct" | "worktree";

export type WorktreeLifecycleStatus = "active" | "applied";

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
  appliedAt?: string;
  applyRunId?: string;
  appliedCommit?: string;
  worktreeDiffHash?: string;
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
  appServerEvents?: string;
  appServerStderr?: string;
  appServerLastMessage?: string;
  agentSession?: string;
  lastMessage?: string;
  implementation?: string;
  worktree?: string;
  diff?: string;
  diffStat?: string;
  validation?: string;
  audit?: string;
  auditMarkdown?: string;
  review?: string;
  apply?: string;
  discard?: string;
  specTestProposal?: string;
  specTestProposalMarkdown?: string;
  specProposal?: string;
  specProposalMarkdown?: string;
  planProposal?: string;
  planProposalMarkdown?: string;
  orchestrationPlan?: string;
  orchestrationPlanMarkdown?: string;
  intakeScan?: string;
  intakeScanMarkdown?: string;
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
  worktreeDiffHash?: string;
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
  worktreeDiffHash?: string;
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
  worktreeDiffHash?: string;
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
  worktreeDiffHash?: string;
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
  taskIds?: string[];
  taskRunId?: string;
  promptStack?: string[];
  enabledSkills?: RunSkillRecord[];
  agent?: RunAgentRecord;
}

export type TaskRunStatus = "queued" | "claimed" | "running" | "evidence-ready" | "blocked" | "failed" | "completed";

export type AgentTaskKind = "foreground" | "background";
export type AgentTaskStatus = "queued" | "running" | "completed" | "failed" | "needs-user-input" | "cancelled";
export type AgentTaskCreatedBy = "main-agent-policy" | "maintenance-policy" | "system";

export interface AgentTask {
  version: "1.0";
  id: string;
  projectId: string | null;
  conversationId: string;
  changeId: string;
  roleId: string;
  kind: AgentTaskKind;
  status: AgentTaskStatus;
  inputArtifacts: string[];
  outputArtifacts: string[];
  parentTaskId?: string;
  createdBy: AgentTaskCreatedBy;
  summary: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AgentTaskResult {
  version: "1.0";
  taskId: string;
  roleId: string;
  status: AgentTaskStatus;
  summary: string;
  artifactRefs: string[];
  nextRecommendation?: string;
  failureClassification?: string;
  requiresUserInputReason?: string;
  createdAt: string;
}

export type MaintenanceLedgerEventType =
  | "archive"
  | "apply"
  | "failure"
  | "user-feedback"
  | "doc-drift"
  | "reference-drift"
  | "harness-evolution";

export interface MaintenanceLedgerEntry {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId?: string;
  eventType: MaintenanceLedgerEventType;
  summary: string;
  artifactRefs: string[];
  createdAt: string;
}

export interface EvolutionCandidate {
  version: "1.0";
  id: string;
  sourceLedgerEntryIds: string[];
  title: string;
  summary: string;
  artifactRefs: string[];
  status: "candidate";
  createdAt: string;
}

export interface CandidateScore {
  version: "1.0";
  candidateId: string;
  score: number;
  rationale: string;
  risks: string[];
  confidence: "low" | "medium" | "high";
  createdAt: string;
}

export interface CandidateReview {
  version: "1.0";
  candidateId: string;
  recommendation: "accept" | "defer" | "reject";
  summary: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface TaskRun {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  taskId: string;
  roleId: string;
  attempt: number;
  status: TaskRunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  runId?: string;
  worktreeId?: string;
  leaseId?: string;
  blockedReason?: string;
  failureReason?: string;
}

export type WorkerLeaseStatus = "claimed" | "released" | "expired" | "lost";

export interface WorkerLease {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  taskRunId: string;
  taskId: string;
  roleId: string;
  workerId: string;
  status: WorkerLeaseStatus;
  claimedAt: string;
  updatedAt: string;
  releasedAt: string | null;
  expiresAt: string;
}

export type TaskQueueRunStatus = "queued" | "running" | "paused" | "blocked" | "failed" | "completed";
export type TaskQueueItemStatus = "queued" | "running" | "blocked" | "failed" | "completed" | "skipped";

export interface TaskQueueRun {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  status: TaskQueueRunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  currentTaskId?: string;
  totalCount: number;
  completedCount: number;
  blockedReason?: string;
  failureReason?: string;
  pausedReason?: string;
}

export interface TaskQueueItem {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  queueRunId: string;
  taskId: string;
  order: number;
  status: TaskQueueItemStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  taskRunId?: string;
  blockedReason?: string;
  failureReason?: string;
}

export interface RunSkillRecord {
  id: string;
  sourceHash: string;
  materializedHash?: string | null;
  bridge?: string;
  version?: string;
}

export interface RunAgentRecord {
  roleId: string;
  source: "bundled" | "memory";
  sourcePath: string;
  sourceHash: string;
  catalogVersion: string;
  catalogHash: string;
  bridge?: string;
  materializedHash?: string | null;
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
    | "app-server.capabilities.detected"
    | "app-server.started"
    | "app-server.exited"
    | "app-server.unavailable"
    | "validation.started"
    | "validation.command.started"
    | "validation.command.exited"
    | "validation.completed"
    | "validation.failed"
    | "audit.started"
    | "audit.completed"
    | "audit.failed"
    | "worktree.created"
    | "worktree.apply.started"
    | "worktree.apply.completed"
    | "worktree.apply.failed"
    | "worktree.discard.started"
    | "worktree.discard.completed"
    | "worktree.discard.failed"
    | "coder.started"
    | "coder.exited"
    | "spec-test.proposal.started"
    | "spec-test.proposal.completed"
    | "spec-test.proposal.failed"
    | "spec-test.proposal.accepted"
    | "spec-test.generation.started"
    | "spec-test.generation.completed"
    | "spec-test.generation.failed"
    | "change.spec.proposal.started"
    | "change.spec.proposal.completed"
    | "change.spec.proposal.failed"
    | "change.spec.proposal.accepted"
    | "change.plan.proposal.started"
    | "change.plan.proposal.completed"
    | "change.plan.proposal.failed"
    | "change.plan.proposal.accepted"
    | "orchestrator.plan.started"
    | "orchestrator.plan.completed"
    | "orchestrator.plan.failed"
    | "intake.scan.started"
    | "intake.scan.completed"
    | "diff.collected"
    | "source.checked"
    | "run.completed"
    | "run.failed";
  runId: string;
  data?: Record<string, unknown>;
}
