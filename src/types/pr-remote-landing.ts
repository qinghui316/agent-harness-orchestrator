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
