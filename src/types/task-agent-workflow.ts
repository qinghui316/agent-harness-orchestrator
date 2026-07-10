export type TaskRunStatus = "queued" | "claimed" | "running" | "evidence-ready" | "blocked" | "failed" | "completed";

export type AgentTaskKind = "foreground" | "background";
export type AgentTaskStatus = "queued" | "claimed" | "running" | "completed" | "failed" | "needs-user-input" | "cancelled";
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
  policyAuditRefs?: string[];
  boundaryAuditRefs?: string[];
  boundaryViolations?: BoundaryViolation[];
  nextRecommendation?: string;
  failureClassification?: string;
  requiresUserInputReason?: string;
  createdAt: string;
}

export type DelegationMode = "runtime-tool" | "orchestrator-policy";
export type RuntimeEnforcementMode = "broker-enforced" | "hook-observed" | "sandbox-audited";
export type ToolPolicyDecisionStatus = "allowed" | "denied" | "needs-user-confirmation" | "unavailable";

export interface ToolPolicyDecision {
  version: "1.0";
  id: string;
  actionType: string;
  actorRoleId: string;
  targetId?: string;
  status: ToolPolicyDecisionStatus;
  enforcementMode: RuntimeEnforcementMode;
  reason: string;
  readableMessage: string;
  createdAt: string;
}

export interface WorkerPermissionProfile {
  version: "1.0";
  roleId: string;
  allowedReadRoots: string[];
  allowedWriteRoots: string[];
  deniedPaths: string[];
  allowedCommands: string[];
  sandboxPolicy: "read-only" | "workspace-write";
  mayDelegate: boolean;
}

export interface ToolEventAuditEntry {
  version: "1.0";
  id: string;
  changeId?: string;
  conversationId?: string;
  actorRoleId: string;
  actionType: string;
  targetId?: string;
  scope?: Record<string, unknown>;
  decisionStatus: ToolPolicyDecisionStatus;
  enforcementMode: RuntimeEnforcementMode;
  reason: string;
  evidenceRefs: string[];
  createdAt: string;
}

export type WorkflowRunStatus = "created" | "running" | "paused" | "blocked" | "failed" | "completed";
export type WorkflowRunSource = "workflow-graph" | "default-code-change-workflow";

export type DefaultCodeChangeWorkflowTemplateId = "default-code-change-workflow";
export type DefaultCodeChangeWorkflowNodeId = "coder" | "validation" | "audit" | "rework-coder";
export type DefaultCodeChangeWorkflowNodeStatus = "queued" | "running" | "blocked" | "failed" | "completed" | "skipped";

export interface DefaultCodeChangeWorkflowRecoveryKey {
  version: "1.0";
  changeId: string;
  templateId: DefaultCodeChangeWorkflowTemplateId;
  workflowGraphPlanId?: string;
  acceptedArtifactHashes?: Record<string, string>;
  sourceHash?: string;
  policyHash?: string;
  capabilityHash?: string;
  createdAt: string;
}

export interface DefaultCodeChangeWorkflowNodeState {
  nodeId: DefaultCodeChangeWorkflowNodeId;
  status: DefaultCodeChangeWorkflowNodeStatus;
  roleId?: MainAgentOrchestrationRoleId;
  attempt: number;
  runId?: string;
  worktreeId?: string;
  validationId?: string;
  auditId?: string;
  agentTaskId?: string;
  artifactRefs: string[];
  failureClassification?: MainAgentFailureClassification;
  stoppedAt?: "boundary" | "code" | "validation" | "audit";
  reason?: string;
  updatedAt: string;
}

export type MainAgentOrchestrationRoleId = "coder-agent" | "validator" | "auditor-agent" | "rework-coder";
export type MainAgentFailureClassification = "boundary-violation" | "code-failure" | "validation-failure" | "audit-failure";

export type WorkflowGraphPlanStatus = "compiled" | "superseded" | "rejected";
export type WorkflowGraphStage = "coder" | "validation" | "audit" | "bounded-rework";
export type WorkflowGraphMode = "sequential-v1" | "ready-set-v1";

export interface SequentialWorkflowGraphNode {
  id: string;
  taskId: string;
  unitId: string;
  title: string;
  order: number;
  stages: WorkflowGraphStage[];
  acIds: string[];
  sourceScopes: string[];
  taskIds?: string[];
  prompt?: string;
  dependsOn?: string[];
}

export interface SequentialWorkflowGraphEdge {
  from: string;
  to: string;
  kind: "task-order" | "stage-order";
}

export interface ReadySetWorkflowGraphStageRef {
  id: string;
  stage: WorkflowGraphStage;
  roleId: string;
  adapterFamily: string;
  status: "planned" | "blocked";
  sourceScopes: string[];
  recoveryKeyInputs: { key: string; value: string | string[] }[];
  blockedReasons: string[];
}

export interface ReadySetWorkflowGraphSourceLock {
  scope: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  claimIntentId: string;
  stageIds: string[];
}

export interface ReadySetWorkflowGraphNode {
  id: string;
  schedulerNodeId: string;
  unitId: string;
  taskIds: string[];
  title: string;
  waveIndex: number;
  stages: WorkflowGraphStage[];
  stageRefs: ReadySetWorkflowGraphStageRef[];
  acIds: string[];
  sourceScopes: string[];
  claimIntentId: string;
  plannedWorkerKey: string;
  roleIds: string[];
  plannedSlotDemand: number;
  sourceLocks: ReadySetWorkflowGraphSourceLock[];
  recoveryKeyInputs: { key: string; value: string | string[] }[];
  status: "planned" | "blocked";
  blockedReasons: string[];
  prompt?: string;
  dependsOn?: string[];
}

export interface ReadySetWorkflowGraphEdge {
  from: string;
  to: string;
  kind: "dependency" | "synthesis" | "stage-order";
}

export interface ReadySetWorkflowGraphWave {
  index: number;
  nodeIds: string[];
  claimIntentIds: string[];
  candidateCount: number;
  blockedCount: number;
  plannedSlotDemand: number;
  blockedReasons: string[];
}

export interface WorkflowGraphPlanBase {
  version: "1.0";
  id: string;
  changeId: string;
  status: WorkflowGraphPlanStatus;
  graphMode: WorkflowGraphMode;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
  authoringContractVersion?: "1.0";
  planArtifactRef?: string;
}

export interface SequentialWorkflowGraphPlan extends WorkflowGraphPlanBase {
  graphMode: "sequential-v1";
  nodes: SequentialWorkflowGraphNode[];
  edges: SequentialWorkflowGraphEdge[];
}

export interface ReadySetWorkflowGraphPlan extends WorkflowGraphPlanBase {
  graphMode: "ready-set-v1";
  schedulerMode: "parallel-readiness-v1";
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  nodes: ReadySetWorkflowGraphNode[];
  edges: ReadySetWorkflowGraphEdge[];
  waves: ReadySetWorkflowGraphWave[];
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  recoveryKeyCoverage: "complete" | "partial";
}

export type WorkflowGraphPlan = SequentialWorkflowGraphPlan | ReadySetWorkflowGraphPlan;

export type WorkflowRunEventType =
  | "workflow.created"
  | "workflow.started"
  | "queue.created"
  | "node.started"
  | "node.completed"
  | "node.blocked"
  | "node.failed"
  | "task.started"
  | "task.completed"
  | "task.blocked"
  | "task.failed"
  | "workflow.paused"
  | "workflow.completed"
  | "workflow.failed"
  | "workflow.blocked"
  | "workflow.reconciled";

export interface WorkflowRunEvent {
  version: "1.0";
  id: string;
  workflowRunId: string;
  changeId: string;
  type: WorkflowRunEventType;
  timestamp: string;
  queueRunId?: string;
  taskId?: string;
  taskRunId?: string;
  status?: string;
  reason?: string;
  data?: Record<string, unknown>;
}

export interface WorkflowRunItem {
  taskId: string;
  status: TaskQueueItemStatus;
  taskRunId?: string;
  order: number;
  updatedAt?: string;
}

export interface TaskQueueWorkflowRun {
  version: "1.0";
  id: string;
  changeId: string;
  status: WorkflowRunStatus;
  source: "workflow-graph";
  workflowGraphPlanId?: string;
  queueRunId?: string;
  currentTaskId?: string;
  items: WorkflowRunItem[];
  recoveryKey: WorkflowGraphRecoveryKey;
  statusReason?: string;
  artifactRefs: string[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowGraphRecoveryKey {
  version: "1.0";
  changeId: string;
  workflowGraphPlanId: string;
  acceptedArtifactHashes: Record<string, string>;
  workflowGraphPlanHash: string;
  sourceHash: string;
  policyHash: string;
  capabilityHash: string;
  createdAt: string;
}

export interface DefaultCodeChangeWorkflowRun {
  version: "1.0";
  id: string;
  changeId: string;
  status: WorkflowRunStatus;
  source: "default-code-change-workflow";
  templateId: DefaultCodeChangeWorkflowTemplateId;
  currentNodeId?: DefaultCodeChangeWorkflowNodeId;
  nodes: DefaultCodeChangeWorkflowNodeState[];
  maxReworkAttempts: number;
  reworkAttempts: number;
  recoveryKey: DefaultCodeChangeWorkflowRecoveryKey;
  statusReason?: string;
  artifactRefs: string[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type WorkflowRun = TaskQueueWorkflowRun | DefaultCodeChangeWorkflowRun;

export interface WorkflowRunSummary {
  id: string;
  status: WorkflowRunStatus;
  source: WorkflowRunSource;
  currentTaskId?: string;
  currentNodeId?: DefaultCodeChangeWorkflowNodeId;
  completedCount: number;
  totalCount: number;
  queueRunId?: string;
  workflowGraphPlanId?: string;
  updatedAt: string;
}

export type StageResumeVerdictKind = "start-coder" | "continue-validation" | "continue-audit" | "continue-rework" | "completed" | "blocked";

export interface StageResumeVerdict {
  kind: StageResumeVerdictKind;
  taskRunId?: string;
  taskId?: string;
  runId?: string;
  worktreeId?: string;
  validationId?: string;
  auditId?: string;
  reason: string;
  evidenceRefs: string[];
}

export interface BoundaryViolation {
  kind: "source-root-modified" | "denied-path" | "outside-write-root" | "cross-demand-artifact" | "readonly-role-write" | "dirty-state";
  path?: string;
  reason: string;
}

export interface PostRunBoundaryAudit {
  version: "1.0";
  id: string;
  changeId: string;
  roleId: string;
  runId?: string;
  taskId?: string;
  enforcementMode: RuntimeEnforcementMode;
  status: "passed" | "failed";
  violations: BoundaryViolation[];
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
  workflowRunId?: string;
  workflowGraphPlanId?: string;
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
  workflowRunId?: string;
  workflowGraphPlanId?: string;
  blockedReason?: string;
  failureReason?: string;
}
