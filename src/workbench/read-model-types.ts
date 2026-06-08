import type { AssistantTurnActivity, AssistantTurnBlock, OrchestrationPlanCard } from "./types.js";
import type { ClarificationRequest, WorkbenchIntakeIteration, WorkbenchIntakeScan } from "./intake.js";
import type { ParentAgentTranscript } from "./parent-agent-transcript.js";
import type { WorkbenchArtifactPreview } from "./artifact-types.js";
import type { WorkbenchThreadActionType } from "../workflow-actions/registry.js";
import type {
  AcMap,
  ChangeMetadata,
  ManagedProject,
  MemoryStatus,
  RunMetadata,
  TaskQueueItem,
  TaskQueueRun,
  TaskRun,
  WorkerLease,
  WorkflowRunSummary,
} from "../types/index.js";
import type { ApplyReadinessKind } from "../apply/manager.js";
import type {
  WorkbenchDecompositionPlanSummary,
  WorkbenchDecompositionReadinessSummary,
  WorkbenchTaskQueueProposalSummary,
  WorkbenchWorkflowGraphPlanSummary,
} from "./workflow-projection.js";
export type WorkbenchTopicState = "active" | "archive";
export type WorkbenchApprovalKind =
  | "spec-proposal"
  | "plan-proposal"
  | "spec-test-proposal"
  | "audit-proposal"
  | "worktree-apply"
  | "change-close"
  | "evolution"
  | "attention";
export type HarnessGapStatus = "missing" | "partial" | "available";
export type HarnessGapSeverity = "info" | "warning";

export interface WorkbenchProjectInput {
  project: ManagedProject | null;
  path: string;
}

export interface WorkbenchTopicSummary {
  id: string;
  name: string;
  title: string;
  state: WorkbenchTopicState;
  path: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
  archivePath?: string | null;
}

export type WorkbenchWorkpadRuntimeStatus = "active" | "running" | "queued" | "blocked" | "waiting-decision" | "archived" | "readonly";
export type WorkbenchUserDecisionState = "processing" | "waiting-confirmation" | "needs-rework" | "later" | "completed" | "abandoned";
export type WorkbenchConversationLifecycle = "active" | "running" | "waiting-user" | "archived-readonly" | "abandoned";

export interface WorkbenchWorkpadSummary {
  id: string;
  title: string;
  state: WorkbenchTopicState;
  runtimeStatus: WorkbenchWorkpadRuntimeStatus;
  userStatus: WorkbenchUserDecisionState;
  userStatusLabel: string;
  conversationLifecycle: WorkbenchConversationLifecycle;
  linkedFromChangeId?: string;
  selected: boolean;
  waitingDecisionCount: number;
  latestRunStatus?: string;
  latestRunId?: string;
  queueStatus?: string;
  blocker?: string;
  updatedAt?: string;
}

export interface WorkbenchThreadEvent {
  id: string;
  type: string;
  label: string;
  timestamp?: string;
  source: "change" | "run" | "proposal" | "validation" | "audit" | "worktree" | "spec-test" | "evolution" | "chat" | "workflow";
  artifact?: string;
  status?: string;
  runId?: string;
  planCard?: OrchestrationPlanCard;
}

export interface ThreadStreamAction {
  actionType: WorkbenchThreadActionType;
  label: string;
  enabled: boolean;
  requiresConfirmation: boolean;
  disabledReason?: string;
  planningBundleId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  taskIds?: string[];
  taskRunId?: string;
}

export interface ThreadStreamEvidence {
  id: string;
  label: string;
  source: "workflow" | "validation" | "audit" | "decision";
  timestamp?: string;
  body?: string;
  artifact?: string;
  status?: string;
  runId?: string;
  actionRunId?: string;
}

export interface ThreadStreamItem {
  id: string;
  kind: "user-message" | "assistant-turn" | "assistant-message" | "plan-card" | "workflow-summary" | "evidence" | "decision" | "change-state" | "intake-summary" | "clarification";
  label: string;
  timestamp?: string;
  body?: string;
  source: "change" | "chat" | "workflow" | "validation" | "audit" | "decision" | "intake";
  artifact?: string;
  status?: string;
  runId?: string;
  actionRunId?: string;
  semanticKey?: string;
  planCard?: OrchestrationPlanCard;
  actions?: ThreadStreamAction[];
  activity?: AssistantTurnActivity[];
  evidence?: ThreadStreamEvidence[];
  blocks?: AssistantTurnBlock[];
  intake?: {
    scan?: WorkbenchIntakeScan;
    iteration?: WorkbenchIntakeIteration;
  };
  clarification?: ClarificationRequest;
}

export interface WorkbenchApprovalItem {
  id: string;
  kind: WorkbenchApprovalKind;
  label: string;
  changeId?: string;
  runId?: string;
  targetId?: string;
  severity: "info" | "warning" | "blocking";
  action?: WorkbenchApprovalAction;
  artifact?: string;
  reason?: string;
}

export interface WorkbenchDecisionItem {
  id: string;
  kind: string;
  label: string;
  status: "pending" | "accepted" | "requested-changes" | "dismissed" | "completed" | "failed";
  changeId?: string;
  runId?: string;
  targetId?: string;
  artifact?: string;
  summary: string;
  feedback?: string;
  updatedAt: string;
  completedAt?: string;
}

export type WorkbenchDecisionContextKind =
  | "queue-blocker"
  | "task-blocker"
  | "validation-failed"
  | "audit-blocked"
  | "spec-proposal"
  | "plan-proposal"
  | "audit-approved"
  | "apply-gate"
  | "close-gate"
  | "evolution-pending"
  | "history";

export interface WorkbenchDecisionAction {
  id: string;
  label: string;
  kind: "approval" | "workflow-action" | "feedback" | "evidence" | "abandon" | "none";
  enabled: boolean;
  requiresConfirmation: boolean;
  changeId?: string;
  approvalId?: string;
  action?: WorkbenchApprovalAction;
  actionType?: ThreadStreamAction["actionType"];
  planningBundleId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  taskIds?: string[];
  taskRunId?: string;
  worktreeId?: string;
  worktreeIds?: string[];
  applyCheckId?: string;
  landingPackageId?: string;
  remoteLandingResultId?: string;
  artifact?: string;
  disabledReason?: string;
}

export interface WorkbenchReworkPrompt {
  mode: "inline-feedback" | "record-feedback";
  label: string;
  placeholder: string;
}

export interface WorkbenchDecisionContext {
  id: string;
  kind: WorkbenchDecisionContextKind;
  title: string;
  summary: string;
  userStatus?: WorkbenchUserDecisionState;
  resultSummary?: string;
  recommendation?: string;
  explanation?: string;
  severity: "info" | "warning" | "blocking";
  changeId?: string;
  taskId?: string;
  taskRunId?: string;
  queueRunId?: string;
  runId?: string;
  targetId?: string;
  artifact?: string;
  timestamp?: string;
  actions: WorkbenchDecisionAction[];
  rework?: WorkbenchReworkPrompt;
}

export interface WorkbenchDecisionInspector {
  primary: WorkbenchDecisionContext | null;
  related: WorkbenchDecisionContext[];
  history: WorkbenchDecisionContext[];
  selectedContextId?: string;
}

export type WorkbenchConfirmationQueueItemKind =
  | "planning-confirm"
  | "single-result-apply"
  | "integration-check"
  | "integration-apply"
  | "landing-readiness"
  | "landing-queue"
  | "pr-draft"
  | "pr-review"
  | "remote-landing"
  | "post-merge"
  | "request-changes"
  | "discard-result"
  | "maintenance";

export interface WorkbenchConfirmationQueueItem {
  id: string;
  kind: WorkbenchConfirmationQueueItemKind;
  projectId?: string | null;
  conversationId?: string;
  changeId?: string;
  resultId?: string;
  runId?: string;
  worktreeId?: string;
  applyCheckId?: string;
  landingPackageId?: string;
  summary: string;
  whyNeedsConfirmation: string;
  confirmEffect: string;
  riskSummary: string;
  evidenceRefs: string[];
  actions: WorkbenchDecisionAction[];
  primary: boolean;
  status?: "pending" | "passed" | "failed" | "applied" | "discarded";
}

export interface WorkbenchConfirmationQueue {
  primary: WorkbenchConfirmationQueueItem | null;
  current: WorkbenchConfirmationQueueItem[];
  otherDemands: WorkbenchConfirmationQueueItem[];
  maintenance: WorkbenchConfirmationQueueItem[];
  history: WorkbenchConfirmationQueueItem[];
}

export interface WorkpadIntakeSummary {
  goal: string;
  currentUnderstanding: string;
  source: "project" | "topic" | "thread" | "diagnostic";
  relatedArtifacts: string[];
  missingInfo: string[];
  confirmedConstraints: string[];
  openQuestions: string[];
  assumptions: string[];
  pendingClarifications: ClarificationRequest[];
}

export interface WorkpadProgress {
  topicState: WorkbenchTopicState | "none";
  spec: "missing" | "ready" | "unknown";
  plan: "missing" | "ready" | "unknown";
  tasks: "missing" | "ready" | "unknown";
  acCount: number;
  taskCount: number;
  runCount: number;
  latestRunStatus?: string;
  validationStatus?: string;
  auditStatus?: string;
}

export interface WorkpadEvidenceSummary {
  id: string;
  label: string;
  source: "run" | "validation" | "audit" | "decision" | "approval";
  status?: string;
  artifact?: string;
  timestamp?: string;
}

export interface WorkpadNextAction {
  id: string;
  label: string;
  description: string;
  kind: "workflow-action" | "approval" | "read-only" | "none";
  enabled: boolean;
  requiresConfirmation: boolean;
  actionType?: ThreadStreamAction["actionType"];
  changeId?: string;
  approvalId?: string;
  planningBundleId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  taskIds?: string[];
  taskRunId?: string;
  worktreeId?: string;
  worktreeIds?: string[];
  applyCheckId?: string;
  landingPackageId?: string;
  remoteLandingResultId?: string;
  disabledReason?: string;
}

export interface WorkpadBackgroundActivitySummary {
  totalCount: number;
  runningCount: number;
  queuedCount: number;
  blockedCount: number;
  waitingDecisionCount: number;
  items: WorkbenchWorkpadSummary[];
}

export interface WorkpadRelatedMemorySummary {
  changeId: string;
  title: string;
  status: WorkbenchWorkpadRuntimeStatus;
  factBoundary: "summary-only" | "local-evidence-only";
}

export interface WorkpadMemoryIsolationSummary {
  projectStableNamespace: "project/stable";
  currentChangeNamespace?: string;
  runNamespaces: string[];
  agentSessionNamespace: "agent/{roleId}/session/{sessionId}";
  relatedWorkpads: WorkpadRelatedMemorySummary[];
  stableFactSources: string[];
  writeBoundaries: string[];
  warnings: string[];
}

export interface WorkpadTaskPreview {
  id: string;
  title: string;
  done: boolean;
  acIds: string[];
  warnings: string[];
}

export type WorkbenchTaskNodeStatus = "planned" | "running" | "evidence-ready" | "blocked" | "checked";

export interface WorkbenchTaskEvidence {
  id: string;
  label: string;
  source: "run" | "validation" | "audit";
  status?: string;
  runId?: string;
  worktreeId?: string;
  artifact?: string;
  timestamp?: string;
}

export interface WorkbenchTaskNextAction {
  id: string;
  label: string;
  actionType?: ThreadStreamAction["actionType"];
  taskIds?: string[];
  taskRunId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  enabled: boolean;
  requiresConfirmation: boolean;
  disabledReason?: string;
}

export interface WorkbenchTaskRunSummary {
  id: string;
  status: string;
  attempt: number;
  roleId: string;
  runId?: string;
  worktreeId?: string;
  blockedReason?: string;
  failureReason?: string;
  officialReworkAttempt?: number;
  autoReworkAvailable?: boolean;
  reworkBudget?: number;
}

export interface WorkbenchWorkerLeaseSummary {
  id: string;
  status: string;
  workerId: string;
  claimedAt: string;
  expiresAt: string;
}

export interface WorkbenchTaskNode {
  taskId: string;
  title: string;
  acIds: string[];
  checked: boolean;
  status: WorkbenchTaskNodeStatus;
  taskRun?: WorkbenchTaskRunSummary;
  workerLease?: WorkbenchWorkerLeaseSummary;
  latestEvidence: WorkbenchTaskEvidence[];
  blockers: string[];
  nextAction: WorkbenchTaskNextAction;
  autoRework?: WorkbenchAutoReworkSummary;
}

export interface WorkbenchAutoReworkSummary {
  available: boolean;
  attempt: number;
  budget: number;
  reason: string;
  failureClassification: WorkbenchFailureClassification;
}

export type WorkbenchFailureClassification =
  | "code-test-failure"
  | "audit-semantic-failure"
  | "ambiguous-requirement"
  | "environment-failure"
  | "unknown";

export interface WorkbenchTaskGraph {
  source: "accepted-tasks" | "missing";
  nodes: WorkbenchTaskNode[];
  changeLevelEvidence: WorkbenchTaskEvidence[];
  warnings: string[];
}

export type WorkbenchCodingPackageExecutionUnit = "single-agent" | "future-parallel-candidate";
export type WorkbenchCodingPackageAssignmentStatus = "suggested" | "not-assigned";
export type WorkbenchCodingPackageSplitReadiness = "likely-single" | "candidate" | "unknown";
export type WorkbenchCodingPackageStatus = "missing" | "suggested" | "blocked" | "evidence-ready" | "readonly";

export interface WorkbenchCodingPackage {
  id: string;
  title: string;
  summary: string;
  taskIds: string[];
  completedTaskIds: string[];
  acIds: string[];
  coveredAcIds: string[];
  missingEvidenceAcIds: string[];
  recommendedRoleId: string;
  executionUnit: WorkbenchCodingPackageExecutionUnit;
  assignmentStatus: WorkbenchCodingPackageAssignmentStatus;
  splitReadiness: WorkbenchCodingPackageSplitReadiness;
  splitRationale: string;
  mergeRisk: string;
  status: WorkbenchCodingPackageStatus;
}

export interface WorkbenchTaskQueueItemSummary {
  id: string;
  taskId: string;
  order: number;
  status: string;
  taskRunId?: string;
  blockedReason?: string;
  failureReason?: string;
}

export interface WorkbenchTaskQueueSummary {
  id: string;
  status: string;
  currentTaskId?: string;
  totalCount: number;
  completedCount: number;
  blockedReason?: string;
  failureReason?: string;
  pausedReason?: string;
  workflowRunId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  readinessManifestId?: string;
  decompositionPlanId?: string;
  nextAction?: WorkbenchTaskNextAction;
  items: WorkbenchTaskQueueItemSummary[];
}

export interface WorkbenchWorkpad {
  title: string;
  subtitle: string;
  state: "diagnostic" | "empty" | "active" | "readonly";
  userStatus: WorkbenchUserDecisionState;
  userStatusLabel: string;
  conversationId?: string;
  demandId?: string;
  boundChangeId?: string;
  conversationLifecycle: WorkbenchConversationLifecycle;
  linkedFromChangeId?: string;
  pendingFeedback: WorkbenchPendingFeedback[];
  coderSelfTestSummary?: string;
  officialValidationResult?: string;
  officialAuditResult?: string;
  officialReworkAttempt?: number;
  reworkBudget?: number;
  failureClassification?: WorkbenchFailureClassification;
  requiresUserInputReason?: string;
  scopedFeedbackTarget?: WorkbenchScopedFeedbackTarget;
  postArchiveEvolutionCandidate?: WorkbenchPostArchiveEvolutionCandidate;
  planningDraft?: WorkbenchPlanningDraft;
  planningArtifactBundle?: WorkbenchPlanningArtifactBundle;
  decompositionPlan?: WorkbenchDecompositionPlanSummary;
  decompositionReadiness?: WorkbenchDecompositionReadinessSummary;
  taskQueueProposal?: WorkbenchTaskQueueProposalSummary;
  workflowGraphPlan?: WorkbenchWorkflowGraphPlanSummary;
  workflowRun?: WorkflowRunSummary;
  rolePipeline?: WorkbenchRolePipelineSummary;
  resultReview?: WorkbenchResultReview;
  maintenance?: WorkbenchMaintenanceSummary;
  runControlState?: WorkbenchRunControlState;
  intake: WorkpadIntakeSummary;
  progress: WorkpadProgress;
  tasks: WorkpadTaskPreview[];
  codingPackages: WorkbenchCodingPackage[];
  taskGraph: WorkbenchTaskGraph;
  taskQueue?: WorkbenchTaskQueueSummary;
  evidence: WorkpadEvidenceSummary[];
  blockers: string[];
  warnings: string[];
  nextAction: WorkpadNextAction;
  background: WorkpadBackgroundActivitySummary;
  memoryIsolation: WorkpadMemoryIsolationSummary;
}

export interface WorkbenchPlanningDraft {
  id: string;
  goal: string;
  constraints: string[];
  acceptanceCriteria: string[];
  design: string;
  tasks: Array<{ id: string; title: string; acIds: string[] }>;
  risks: string[];
  openQuestions: string[];
  artifact?: string;
  updatedAt?: string;
}

export interface WorkbenchPlanningArtifactBundle extends WorkbenchPlanningDraft {
  status: "draft" | "confirmed";
}

export interface WorkbenchRoleRunSummary {
  roleId: "planning-agent" | "coder-agent" | "validator" | "auditor-agent" | "rework-coder" | string;
  status: string;
  runId?: string;
  summary: string;
  artifact?: string;
}

export interface WorkbenchAgentTaskSummary {
  id: string;
  roleId: string;
  kind: "foreground" | "background";
  status: string;
  changeId?: string;
  runId?: string;
  summary: string;
  resultSummary?: string;
  evidenceRefs: string[];
  policyAuditRefs: string[];
  boundaryAuditRefs: string[];
  boundaryViolations: string[];
  createdAt: string;
  completedAt?: string;
}

export interface WorkbenchMaintenanceSummary {
  ledgerCount: number;
  closeoutCount: number;
  latestReviewWindowId?: string;
  unreviewedTerminalCount: number;
  latest?: {
    id: string;
    eventType: string;
    changeId?: string;
    summary: string;
    severity: string;
    createdAt: string;
  };
  status: "idle" | "collecting" | "review-ready" | "reviewed";
  note: string;
}

export interface WorkbenchRolePipelineSummary {
  stage: "planning" | "coding" | "validation" | "audit" | "rework" | "done" | "needs-user-input";
  status: "draft" | "running" | "completed" | "needs-user-input" | "stopped";
  runs: WorkbenchRoleRunSummary[];
  agentTasks: WorkbenchAgentTaskSummary[];
  reworkUsed: number;
  reworkBudget: number;
}

export type DemandAgentRunGraphLaneId = "main" | "roles" | "integration" | "maintenance";
export type DemandAgentRunGraphNodeKind =
  | "main-agent"
  | "delegate-task"
  | "tool-policy-gate"
  | "boundary-audit"
  | "planning-agent"
  | "coder-agent"
  | "rework-coder"
  | "validator"
  | "auditor-agent"
  | "result-review"
  | "integration-check"
  | "integration-fix-agent"
  | "merge-reviewer-agent"
  | "pr-draft-adapter"
  | "pr-feedback-sweep"
  | "pr-review-handoff"
  | "remote-landing"
  | "post-merge-sync"
  | "remote-branch-cleanup"
  | "memory-closeout"
  | "documentation-agent"
  | "architecture-agent"
  | "evolution-agent"
  | "evolution-scorer"
  | "evolution-reviewer";
export type DemandAgentRunGraphNodeStatus = "idle" | "queued" | "running" | "completed" | "needs-change" | "failed" | "waiting-user" | "skipped";
export type DemandAgentRunGraphEdgeKind = "delegates" | "returns" | "requires-evidence" | "triggers-rework" | "continues-to" | "background-maintenance";

export interface DemandAgentRunEvidenceRef {
  label: string;
  ref: string;
  kind: "artifact" | "run" | "task" | "decision" | "remote" | "maintenance";
}

export interface DemandAgentRunAttemptSummary {
  id: string;
  status: DemandAgentRunGraphNodeStatus;
  summary: string;
  timestamp?: string;
  evidenceRefs: DemandAgentRunEvidenceRef[];
}

export interface DemandAgentRunGraphNode {
  id: string;
  kind: DemandAgentRunGraphNodeKind;
  lane: DemandAgentRunGraphLaneId;
  label: string;
  roleId?: string;
  status: DemandAgentRunGraphNodeStatus;
  summary: string;
  reason: string;
  target: {
    projectId?: string | null;
    conversationId?: string;
    changeId?: string;
    roleId?: string;
    agentTaskId?: string;
    runId?: string;
    worktreeId?: string;
    resultId?: string;
    applyCheckId?: string;
    landingPackageId?: string;
    prDraftPackageId?: string;
    prUrl?: string;
    remoteLandingResultId?: string;
    maintenanceRunId?: string;
    candidateId?: string;
  };
  inputSummary?: string;
  outputSummary?: string;
  evidenceRefs: DemandAgentRunEvidenceRef[];
  attempts: DemandAgentRunAttemptSummary[];
  feedbackAction?: WorkbenchDecisionAction;
}

export interface DemandAgentRunGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: DemandAgentRunGraphEdgeKind;
  label: string;
}

export interface DemandAgentRunGraphLane {
  id: DemandAgentRunGraphLaneId;
  label: string;
  description: string;
}

export interface DemandAgentRunGraph {
  conversationId?: string;
  changeId?: string;
  title: string;
  summary: string;
  lanes: DemandAgentRunGraphLane[];
  nodes: DemandAgentRunGraphNode[];
  edges: DemandAgentRunGraphEdge[];
  updatedAt?: string;
}

export type WorkbenchResultReviewStatus =
  | "not-ready"
  | "ready-to-apply"
  | "needs-rework"
  | "applied-clean"
  | "applied-source-dirty";

export interface WorkbenchResultReview {
  status: WorkbenchResultReviewStatus;
  title: string;
  summary: string;
  worktreeId?: string;
  changedFiles: string[];
  diffStat?: string;
  validation?: {
    id: string;
    status: string;
    runId: string;
  };
  audit?: {
    id: string;
    status: string;
    runId: string;
    findingCount: number;
    notes: string[];
    artifact?: string;
  };
  applyReadiness: {
    ready: boolean;
    kind: ApplyReadinessKind;
    label: string;
    message: string;
    blockingIssues: string[];
    warnings: string[];
  };
  evidence: WorkpadEvidenceSummary[];
}

export interface WorkbenchRunControlState {
  canStop: boolean;
  stopActionType?: ThreadStreamAction["actionType"];
  pendingFeedbackCount: number;
  explanation: string;
}

export interface WorkbenchPendingFeedback {
  id: string;
  text: string;
  timestamp: string;
  runId?: string;
  status: "pending-next-turn" | "applied";
}

export interface WorkbenchScopedFeedbackTarget {
  changeId: string;
  taskId?: string;
  taskRunId?: string;
  runId?: string;
  roleId?: string;
  evidenceRef?: string;
}

export interface WorkbenchPostArchiveEvolutionCandidate {
  changeId: string;
  status: "candidate";
  sources: string[];
  summary: string;
}

export interface WorkbenchApprovalAction {
  actionId: string;
  label: string;
  command: string;
  args: string[];
  mutates: boolean;
  requiresConfirmation: boolean;
}

export interface WorkbenchStreamPacket {
  run: RunMetadata;
  live: false;
  events: WorkbenchThreadEvent[];
  artifacts: WorkbenchArtifactPreview[];
  diagnostics: string[];
  warnings: string[];
}

export interface WorkbenchRoleSummary {
  id: string;
  name: string;
  profilePath: string;
  writeCapability: "read-only" | "worktree-write" | "deterministic-writer";
  preferredRuntime: string;
  delegatable: boolean;
  humanConfirmation: string;
  sections: string[];
}

export interface HarnessGap {
  id: string;
  severity: HarnessGapSeverity;
  status: HarnessGapStatus;
  recommendedPhase: string;
  summary: string;
}

export interface WorkbenchTopicDetail extends WorkbenchTopicSummary {
  change: ChangeMetadata | null;
  reviewStatus?: string;
  closeGate?: {
    ready: boolean;
    warnings: string[];
    blockingIssues: string[];
  };
  acMap?: AcMap | null;
  acCount?: number;
  taskCount?: number;
  specTest?: unknown;
  drift?: unknown;
  runs: RunMetadata[];
  taskQueues: TaskQueueRun[];
  taskQueueItems: TaskQueueItem[];
  taskRuns: TaskRun[];
  workerLeases: WorkerLease[];
  worktrees: unknown[];
  validations: unknown[];
  audits: unknown[];
  threadItems: ThreadStreamItem[];
}

export interface WorkbenchSnapshot {
  project: unknown;
  memory: MemoryStatus;
  left: {
    project: unknown;
    memory: MemoryStatus;
    topics: WorkbenchTopicSummary[];
    workpads: WorkbenchWorkpadSummary[];
    repo: {
      path: string;
      exists?: boolean;
      git?: boolean;
      branch?: string | null;
      dirty?: boolean | null;
    };
  };
  center: {
    selectedTopic: WorkbenchTopicDetail | null;
    workpad: WorkbenchWorkpad;
    thread: {
      items: ThreadStreamItem[];
    };
    parentAgentTranscript: ParentAgentTranscript;
    activeTab: "conversation" | "agentGraph";
    agentLoop: {
      runs: RunMetadata[];
    };
    agentRunGraph: DemandAgentRunGraph;
  };
  right: {
    approvals: WorkbenchApprovalItem[];
    decisions: WorkbenchDecisionItem[];
    decisionInspector: WorkbenchDecisionInspector;
    confirmationQueue: WorkbenchConfirmationQueue;
  };
  roles: WorkbenchRoleSummary[];
  harnessGaps: HarnessGap[];
  warnings: string[];
}


