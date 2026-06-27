import type { ArtifactBase } from "./project-memory.js";

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
  contextPacket?: string;
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

export interface RunContextPacketRef {
  ref: string;
  hash: string;
  format: "role-context-packet@1.0";
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
  contextPacket?: RunContextPacketRef;
  executionGate?: {
    allowed: boolean;
    mode: string;
    changeId: string;
    readinessManifestId?: string;
    decompositionPlanId?: string;
    taskQueueProposalId?: string;
    workflowGraphPlanId?: string;
    schedulerRunId?: string;
    schedulerClaimReservationId?: string;
    schedulerWorkerReworkPlanId?: string;
    schedulerWorkerValidationId?: string;
    schedulerWorkerAuditId?: string;
    reservationIntentId?: string;
    claimIntentId?: string;
    nodeId?: string;
    unitId?: string;
    taskRunId?: string;
    taskIds?: string[];
    reason: string;
  };
}

export interface RunSkillRecord {
  id: string;
  runtimeTarget?: "codex";
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
    | "app-server.skipped"
    | "app-server.unavailable"
    | "runtime_continuity.append_failed"
    | "validation.started"
    | "validation.command.started"
    | "validation.command.exited"
    | "validation.completed"
    | "validation.failed"
    | "audit.started"
    | "audit.completed"
    | "audit.failed"
    | "worktree.created"
    | "worktree.reused"
    | "worktree.apply.started"
    | "worktree.apply.completed"
    | "worktree.apply.failed"
    | "worktree.discard.started"
    | "worktree.discard.completed"
    | "worktree.discard.failed"
    | "code.execution_gate.allowed"
    | "code.dependency_bridge.prepared"
    | "code.dependency_bridge.failed"
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
