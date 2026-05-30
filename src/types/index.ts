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

export type PrFeedbackClassification =
    | "no-action"
    | "checks-failed"
    | "changes-requested"
    | "inline-comments-actionable"
    | "comments-only"
    | "user-pushback-requested"
    | "provider-unavailable"
    | "stale-pr";

export interface PrReviewInlineComment {
  id: string;
  body: string;
  path?: string | null;
  line?: number | null;
  side?: string | null;
  author?: string | null;
  createdAt?: string | null;
  url?: string | null;
  inReplyToId?: string | null;
}

export interface PrReviewThreadCapability {
  provider: "github-cli";
  canReadThreads: boolean;
  canResolveThreads: boolean;
  reason?: string;
  evidenceRefs: string[];
}

export interface PrReviewThreadFinding {
  id: string;
  threadId?: string;
  commentId?: string;
  path?: string | null;
  line?: number | null;
  body: string;
  author?: string | null;
  resolved?: boolean;
  actionable: boolean;
}

export interface PrFeedbackSnapshot {
  version: "1.0";
  id: string;
  prDraftPackageId: string;
  landingPackageId: string;
  projectId: string | null;
  prUrl?: string;
  state: string;
  isDraft: boolean;
  reviewDecision?: string | null;
  headRefName?: string | null;
  baseRefName?: string | null;
  headRefOid?: string | null;
  baseRefOid?: string | null;
  reviews: unknown[];
  comments: unknown[];
  inlineComments?: PrReviewInlineComment[];
  threadCapability?: PrReviewThreadCapability;
  threadFindings?: PrReviewThreadFinding[];
  statusCheckRollup: unknown[];
  rawArtifact: string;
  snapshotArtifact: string;
  summaryArtifact: string;
  createdAt: string;
}

export interface PrFeedbackSummary {
  version: "1.0";
  snapshotId: string;
  prDraftPackageId: string;
  landingPackageId: string;
  classification: PrFeedbackClassification;
  actionable: boolean;
  summary: string;
  reviewDecision?: string | null;
  commentsCount: number;
  inlineCommentsCount?: number;
  actionableCommentsCount?: number;
  failedChecksCount: number;
  evidenceRefs: string[];
  recommendedAction: string;
  createdAt: string;
}

export interface ReviewFeedbackUserContext {
  version: "1.0";
  id: string;
  changeId: string;
  landingPackageId: string;
  prDraftPackageId?: string;
  intent: "rework" | "reply" | "pushback" | "clarify";
  message: string;
  createdAt: string;
  artifactRef: string;
}

export interface PrFeedbackReworkAttempt {
  version: "1.0";
  id: string;
  changeId: string;
  prDraftPackageId: string;
  landingPackageId: string;
  snapshotId: string;
  userContextId?: string;
  reworkContextArtifact?: string;
  status: "started" | "completed" | "failed";
  agentTaskId?: string;
  artifactRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PrDraftRevision {
  version: "1.0";
  id: string;
  prDraftPackageId: string;
  previousLandingPackageId: string;
  landingPackageId: string;
  projectId: string | null;
  branchName: string;
  prUrl?: string;
  commitHash?: string;
  artifactRefs: string[];
  createdAt: string;
}

export interface PrReviewReplyDraft {
  version: "1.0";
  id: string;
  changeId: string;
  prDraftPackageId: string;
  landingPackageId: string;
  snapshotId?: string;
  targetKind: "inline-comment" | "issue-comment" | "review-thread" | "pr";
  targetId?: string;
  threadId?: string;
  commentId?: string;
  body: string;
  canResolveThread: boolean;
  status: "draft" | "submitted" | "resolved";
  artifactRef: string;
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PrReviewReplyHandoff {
  version: "1.0";
  id: string;
  draftId: string;
  landingPackageId: string;
  prDraftPackageId: string;
  targetKind: PrReviewReplyDraft["targetKind"];
  targetId?: string;
  status: "submitted";
  artifactRefs: string[];
  submittedAt: string;
}

export interface PrReviewThreadResolution {
  version: "1.0";
  id: string;
  draftId: string;
  landingPackageId: string;
  prDraftPackageId: string;
  threadId: string;
  status: "resolved";
  artifactRefs: string[];
  resolvedAt: string;
}

export type PrReviewReadinessStatus =
  | "ready"
  | "ready-with-comments"
  | "already-ready"
  | "missing-pr"
  | "provider-unavailable"
  | "actionable-feedback"
  | "checks-failed"
  | "stale-pr";

export interface PrReviewStateSnapshot {
  version: "1.0";
  id: string;
  prDraftPackageId: string;
  landingPackageId: string;
  projectId: string | null;
  prUrl?: string;
  state: string;
  isDraft: boolean;
  reviewDecision?: string | null;
  feedbackClassification?: PrFeedbackClassification;
  commentsCount: number;
  failedChecksCount: number;
  evidenceRefs: string[];
  createdAt: string;
}

export interface PrReviewReadiness {
  version: "1.0";
  id: string;
  prDraftPackageId: string;
  landingPackageId: string;
  projectId: string | null;
  status: PrReviewReadinessStatus;
  canSubmit: boolean;
  summary: string;
  reason: string;
  confirmEffect: string;
  riskSummary: string;
  prUrl?: string;
  stateSnapshotArtifact: string;
  readinessArtifact: string;
  summaryArtifact: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface PrReviewHandoff {
  version: "1.0";
  id: string;
  readinessId: string;
  prDraftPackageId: string;
  landingPackageId: string;
  projectId: string | null;
  prUrl?: string;
  status: "submitted";
  artifactRefs: string[];
  submittedAt: string;
}

export type RemoteLandingReadinessStatus =
  | "ready"
  | "ready-with-comments"
  | "missing-pr"
  | "provider-unavailable"
  | "draft"
  | "closed"
  | "already-merged"
  | "checks-failed"
  | "actionable-feedback"
  | "stale-pr"
  | "merge-unavailable";

export interface RemoteLandingStateSnapshot {
  version: "1.0";
  id: string;
  prDraftPackageId: string;
  landingPackageId: string;
  projectId: string | null;
  prUrl?: string;
  state: string;
  isDraft: boolean;
  reviewDecision?: string | null;
  feedbackClassification?: PrFeedbackClassification;
  failedChecksCount: number;
  commentsCount: number;
  mergeable?: string | null;
  mergeStateStatus?: string | null;
  headRefName?: string | null;
  baseRefName?: string | null;
  headRefOid?: string | null;
  baseRefOid?: string | null;
  evidenceRefs: string[];
  createdAt: string;
}

export interface RemoteLandingReadiness {
  version: "1.0";
  id: string;
  prDraftPackageId: string;
  landingPackageId: string;
  projectId: string | null;
  status: RemoteLandingReadinessStatus;
  canMerge: boolean;
  mergeMethod: "squash";
  summary: string;
  reason: string;
  confirmEffect: string;
  riskSummary: string;
  prUrl?: string;
  stateSnapshotArtifact: string;
  readinessArtifact: string;
  summaryArtifact: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface RemoteLandingAttempt {
  version: "1.0";
  id: string;
  readinessId: string;
  prDraftPackageId: string;
  landingPackageId: string;
  projectId: string | null;
  prUrl?: string;
  mergeMethod: "squash";
  status: "started" | "merged" | "failed";
  artifactRefs: string[];
  startedAt: string;
  finishedAt?: string;
}

export interface RemoteLandingResult {
  version: "1.0";
  id: string;
  attemptId: string;
  readinessId: string;
  prDraftPackageId: string;
  landingPackageId: string;
  projectId: string | null;
  prUrl?: string;
  status: "merged" | "failed";
  mergeMethod: "squash";
  mergeCommit?: string | null;
  mergedAt?: string | null;
  failureReason?: string;
  artifactRefs: string[];
  createdAt: string;
}

export type LocalSyncReadinessStatus =
  | "ready"
  | "already-current"
  | "not-merged"
  | "provider-unavailable"
  | "dirty-source"
  | "wrong-branch"
  | "missing-base"
  | "fetch-failed"
  | "not-fast-forward";

export type RemoteBranchCleanupReadinessStatus =
  | "ready"
  | "not-merged"
  | "provider-unavailable"
  | "missing-head"
  | "already-deleted"
  | "unsafe-head"
  | "delete-unavailable";

export interface PostMergeStateSnapshot {
  version: "1.0";
  id: string;
  remoteLandingResultId: string;
  landingPackageId: string;
  prDraftPackageId: string;
  projectId: string | null;
  prUrl?: string;
  prState: string;
  baseBranch?: string | null;
  headBranch?: string | null;
  mergeCommit?: string | null;
  mergedAt?: string | null;
  currentBranch?: string | null;
  workingTreeClean: boolean | null;
  localHead?: string | null;
  remoteName?: string;
  remoteBaseHead?: string | null;
  remoteHeadBranchExists?: boolean | null;
  canFastForward: boolean;
  alreadyCurrent: boolean;
  evidenceRefs: string[];
  createdAt: string;
}

export interface LocalSyncReadiness {
  version: "1.0";
  id: string;
  postMergeHandoffId: string;
  remoteLandingResultId: string;
  landingPackageId: string;
  projectId: string | null;
  status: LocalSyncReadinessStatus;
  canSync: boolean;
  summary: string;
  reason: string;
  confirmEffect: string;
  riskSummary: string;
  readinessArtifact: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface LocalSyncResult {
  version: "1.0";
  id: string;
  readinessId: string;
  postMergeHandoffId: string;
  remoteLandingResultId: string;
  landingPackageId: string;
  projectId: string | null;
  status: "synced" | "skipped" | "failed";
  beforeHead?: string | null;
  afterHead?: string | null;
  failureReason?: string;
  artifactRefs: string[];
  createdAt: string;
}

export interface RemoteBranchCleanupReadiness {
  version: "1.0";
  id: string;
  postMergeHandoffId: string;
  remoteLandingResultId: string;
  landingPackageId: string;
  projectId: string | null;
  status: RemoteBranchCleanupReadinessStatus;
  canCleanup: boolean;
  headBranch?: string | null;
  remoteName?: string;
  summary: string;
  reason: string;
  confirmEffect: string;
  riskSummary: string;
  readinessArtifact: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface RemoteBranchCleanupResult {
  version: "1.0";
  id: string;
  readinessId: string;
  postMergeHandoffId: string;
  remoteLandingResultId: string;
  landingPackageId: string;
  projectId: string | null;
  status: "deleted" | "skipped" | "failed";
  headBranch?: string | null;
  remoteName?: string;
  failureReason?: string;
  artifactRefs: string[];
  createdAt: string;
}

export type LandingQueueCandidateStatus =
  | "ready"
  | "ready-with-comments"
  | "needs-attention"
  | "merged";

export interface LandingQueueCandidate {
  version: "1.0";
  id: string;
  projectId: string | null;
  conversationId: string;
  changeIds: string[];
  landingPackageId: string;
  prDraftPackageId: string;
  prUrl?: string;
  status: LandingQueueCandidateStatus;
  canMerge: boolean;
  summary: string;
  reason: string;
  confirmEffect: string;
  riskSummary: string;
  readinessId?: string;
  readinessStatus?: RemoteLandingReadinessStatus;
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LandingQueueSnapshot {
  version: "1.0";
  id: string;
  projectId: string | null;
  status: "empty" | "ready" | "needs-attention";
  summary: string;
  readyCount: number;
  needsAttentionCount: number;
  mergedCount: number;
  candidates: LandingQueueCandidate[];
  snapshotArtifact: string;
  summaryArtifact: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface LandingQueueDecision {
  version: "1.0";
  id: string;
  snapshotId: string;
  selectedLandingPackageId?: string;
  selectedCandidateId?: string;
  action: "merge-next" | "skip" | "remove-stale";
  status: "completed" | "failed" | "skipped";
  reason?: string;
  artifactRefs: string[];
  createdAt: string;
}

export interface LandingQueueResult {
  version: "1.0";
  id: string;
  decisionId: string;
  beforeSnapshotId: string;
  afterSnapshotId?: string;
  selectedCandidateId?: string;
  landingPackageId?: string;
  remoteLandingResultId?: string;
  status: "merged" | "failed" | "skipped";
  summary: string;
  artifactRefs: string[];
  createdAt: string;
}

export interface PostMergeHandoff {
  version: "1.0";
  id: string;
  remoteLandingResultId: string;
  landingPackageId: string;
  prDraftPackageId: string;
  projectId: string | null;
  prUrl?: string;
  status: "merged" | "not-merged";
  summary: string;
  localStatusSummary: string;
  cleanupSummary: string;
  stateSnapshotArtifact: string;
  summaryArtifact: string;
  evidenceRefs: string[];
  localSyncReadiness: LocalSyncReadiness;
  remoteBranchCleanupReadiness: RemoteBranchCleanupReadiness;
  createdAt: string;
}

export type MainOrchestratorDecisionAction =
  | "planning"
  | "enqueue"
  | "coding"
  | "validation"
  | "audit"
  | "bounded-rework"
  | "result-review"
  | "needs-user-input"
  | "done";

export interface MainOrchestratorDecision {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  workerId?: string;
  attemptId?: string;
  action: MainOrchestratorDecisionAction;
  summary: string;
  reason: string;
  artifactRefs: string[];
  createdAt: string;
}

export type DemandWorkerStatus = "queued" | "claimed" | "running" | "result-ready" | "needs-user-input" | "failed" | "completed" | "released";
export type DemandWorkerAttemptStatus = "claimed" | "running" | "completed" | "needs-user-input" | "failed" | "cancelled";

export interface DemandWorker {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  status: DemandWorkerStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  activeAttemptId?: string;
  resultSummary?: string;
  failureReason?: string;
  waitingReason?: string;
}

export interface DemandWorkerAttempt {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  workerId: string;
  attempt: number;
  status: DemandWorkerAttemptStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  agentTaskIds: string[];
  resultStatus?: string;
  resultSummary?: string;
  failureReason?: string;
}

export interface DemandWorkerQueue {
  version: "1.0";
  projectId: string | null;
  maxConcurrentDemands: number;
  workers: DemandWorker[];
  updatedAt: string;
}

export interface DemandWorkerSlot {
  maxConcurrentDemands: number;
  runningCount: number;
  available: boolean;
}

export interface DemandWorkerReconcileResult {
  workers: DemandWorker[];
  attempts: DemandWorkerAttempt[];
  decisions: MainOrchestratorDecision[];
}

export type MaintenanceLedgerEventType =
  | "archive"
  | "apply"
  | "remote-landing"
  | "failure"
  | "user-feedback"
  | "doc-drift"
  | "reference-drift"
  | "harness-evolution"
  | "change-closeout"
  | "maintenance-review";

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
  subtype?: MaintenanceCandidateSubtype;
  fingerprint?: string;
  supersededBy?: string;
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
  dimensions?: Record<string, number>;
  createdAt: string;
}

export interface CandidateReview {
  version: "1.0";
  candidateId: string;
  recommendation: "accept" | "defer" | "reject" | "needs-human-review";
  summary: string;
  evidenceRefs: string[];
  createdAt: string;
}

export type MaintenanceCandidateSubtype =
  | "stable-memory"
  | "docs-drift"
  | "harness-evolution"
  | "reusable-lesson"
  | "doc-budget"
  | "reference-drift";

export interface DemandMemoryCloseout {
  version: "1.0";
  id: string;
  changeId: string;
  title: string;
  terminalKind: "archived" | "applied" | "remote-handoff" | "merged";
  goal: string;
  finalResult: string;
  userDecision: string;
  changedFiles: string[];
  affectedModules: string[];
  evidenceRefs: string[];
  reusableLessonCandidates: ReusableLessonCandidate[];
  docsDriftCandidates: DocsDriftCandidate[];
  memoryBoundaryNotes: string[];
  createdAt: string;
}

export interface ReusableLessonCandidate {
  id: string;
  fingerprint: string;
  summary: string;
  evidenceRefs: string[];
  status: "candidate" | "superseded";
  supersededBy?: string;
}

export interface DocsDriftCandidate {
  id: string;
  fingerprint: string;
  document: string;
  summary: string;
  evidenceRefs: string[];
  status: "candidate" | "superseded";
  supersededBy?: string;
}

export interface MaintenanceReviewWatermark {
  version: "1.0";
  lastReviewedChangeIds: string[];
  lastReviewedArchiveIndex: number;
  lastReviewWindowId: string | null;
  lastReviewedAt: string | null;
}

export interface DocBudgetReport {
  version: "1.0";
  id: string;
  documents: Array<{
    path: string;
    wordCount: number;
    softLimit: number;
    hardLimit: number;
    status: "ok" | "soft-exceeded" | "hard-exceeded";
  }>;
  createdAt: string;
}

export interface MaintenanceReviewRun {
  version: "1.0";
  id: string;
  windowChangeIds: string[];
  hotCloseoutRefs: string[];
  warmIndexRef: string;
  coldArchiveRef: string;
  docBudgetReportRef: string;
  candidateRefs: string[];
  scoreRefs: string[];
  reviewRefs: string[];
  summary: string;
  createdAt: string;
}

export interface RoleScopedContextProjection {
  version: "1.0";
  roleId: string;
  allowedMemoryTier: "current-demand" | "compact-stable" | "maintenance-hot-warm-cold";
  includesMaintenanceWindow: boolean;
  includedSources: string[];
  excludedSources: string[];
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
