import type { CodexReadableEvent } from "../codex/jsonl.js";
import type { HarnessExecutionMode, RunMetadata } from "../types/index.js";
import type { WorkflowActionType } from "../workflow-actions/registry.js";

export type TopicThreadEventType =
  | "user.message"
  | "assistant.message"
  | "orchestrator.plan"
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed"
  | "intake.scan"
  | "intake.iteration"
  | "clarification.request"
  | "clarification.answer"
  | "clarification.skip";

export type WorkbenchMessageMode = "chat";
export type WorkbenchWorkflowActionType = WorkflowActionType;

export interface TopicThreadEntry {
  id: string;
  type: TopicThreadEventType;
  timestamp: string;
  conversationId?: string;
  graphScopeId?: string;
  changeId: string;
  position?: number;
  text?: string;
  actionRunId?: string;
  actionType?: string;
  status?: string;
  runId?: string;
  threadId?: string;
  parentThreadId?: string;
  turnId?: string;
  agentRoleId?: string;
  agentTaskId?: string;
  artifact?: string;
  error?: string;
  resultSummary?: string;
  activity?: AssistantTurnActivity[];
  blocks?: AssistantTurnBlock[];
  intake?: unknown;
  clarification?: unknown;
  codexUserInput?: WorkbenchCodexUserInputRequest;
  contextRefs?: TopicFileReference[];
  attachments?: TopicAttachment[];
  planHandoff?: ValidatedPlanHandoffIntent;
}

export interface TopicFileReference {
  relativePath: string;
  name: string;
  kind: "file" | "directory";
  extension?: string;
  size?: number;
  source?: "composer";
}

export type TopicAttachmentKind = "image" | "text" | "unsupported";
export type TopicAttachmentRuntimeMode = "codex-image-input" | "bounded-text-preview" | "metadata-only";

export interface TopicAttachment {
  id: string;
  fileName: string;
  mediaType: string;
  kind: TopicAttachmentKind;
  size: number;
  hash: string;
  source: "composer";
  createdAt: string;
  storagePath: string;
  runtimeMode: TopicAttachmentRuntimeMode;
  message?: string;
}

export type AssistantTurnBlockKind =
  | "prose"
  | "status"
  | "command-group"
  | "command"
  | "tool-result"
  | "file-change"
  | "reasoning-summary"
  | "workflow-evidence"
  | "usage"
  | "error";

export interface AssistantTurnBlock {
  id: string;
  runId?: string;
  threadId?: string;
  turnId?: string;
  sequence: number;
  kind: AssistantTurnBlockKind;
  timestamp: string;
  source: "codex" | "aho" | "workflow" | "validation" | "audit" | "decision";
  status?: string;
  title?: string;
  text?: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  preview?: string;
  artifactRef?: string;
  isError?: boolean;
  truncated?: boolean;
  itemId?: string;
  targetAgentSurfaceId?: string;
  targetAgentDisplayName?: string;
  children?: AssistantTurnBlock[];
}

export type AssistantTurnActivity =
  | { kind: "status"; label: string; detail?: string; timestamp: string }
  | { kind: "assistant-event"; event: WorkbenchAssistantEvent; timestamp: string }
  | { kind: "tool"; tool: WorkbenchLiveToolEvent; timestamp: string }
  | { kind: "usage"; usage: Record<string, unknown>; timestamp: string }
  | { kind: "error"; message: string; timestamp: string };

export interface WorkbenchCodexUserInputQuestion {
  id: string;
  header?: string;
  question: string;
  isOther?: boolean;
  isSecret?: boolean;
  options?: Array<{ label: string; description?: string }>;
}

export interface WorkbenchCodexUserInputRequest {
  requestKey: string;
  requestId: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  runId: string;
  runtimeScopeId: string;
  changeId?: string;
  conversationId?: string;
  graphScopeId?: string;
  agentRoleId?: string;
  agentTaskId?: string;
  questions: WorkbenchCodexUserInputQuestion[];
  status: "pending" | "submitting" | "submitted";
  answers?: Record<string, string | string[]>;
  submittedAt?: string;
}

export interface TopicMessageResult {
  user: TopicThreadEntry;
  assistant: TopicThreadEntry | null;
  run: RunMetadata | null;
  codexSessionId: string | null;
  mode?: WorkbenchMessageMode;
  assistantMessage?: string;
}

export interface WorkbenchLiveIdentity {
  projectId?: string;
  conversationId?: string;
  graphScopeId?: string;
  changeId?: string;
  runId?: string;
  threadId?: string;
  parentThreadId?: string;
  turnId?: string;
  itemId?: string;
  agentRoleId?: string;
  agentTaskId?: string;
  agentSurfaceId?: string;
  agentDisplayName?: string;
  targetAgentSurfaceId?: string;
  targetAgentDisplayName?: string;
}

export type WorkbenchLiveEvent =
  | { event: "topic.created"; data: { topic: { id?: string; conversationId?: string; changeId?: string; title: string; state: "active" } } }
  | { event: "topic.message"; data: TopicThreadEntry }
  | { event: "run.started"; data: WorkbenchLiveIdentity & { runId: string; actionType?: string; runtime?: string; taskIds?: string[] } }
  | { event: "run.status"; data: WorkbenchLiveIdentity & { actionRunId?: string; status: string; label?: string } }
  | { event: "assistant.delta"; data: WorkbenchLiveIdentity & { delta: string } }
  | { event: "assistant.message"; data: TopicThreadEntry }
  | { event: "assistant.event"; data: WorkbenchAssistantEvent }
  | { event: "tool.event"; data: WorkbenchLiveToolEvent }
  | { event: "codex.userInput.requested"; data: WorkbenchCodexUserInputRequest }
  | { event: "codex.userInput.submitted"; data: WorkbenchLiveIdentity & { requestKey: string; requestId: string } }
  | { event: "usage"; data: WorkbenchLiveIdentity & { usage?: Record<string, unknown> } }
  | { event: "snapshot"; data: unknown }
  | { event: "error"; data: WorkbenchLiveIdentity & { message: string; runId?: string; actionRunId?: string } }
  | { event: "done"; data: { status: "completed" | "failed" } };

export interface WorkbenchLiveSink {
  emit(event: WorkbenchLiveEvent): void;
  isClosed?(): boolean;
}

export interface WorkbenchLiveToolEvent {
  runId: string;
  projectId?: string;
  conversationId?: string;
  changeId?: string;
  threadId?: string;
  parentThreadId?: string;
  turnId?: string;
  itemId?: string;
  agentRoleId?: string;
  agentTaskId?: string;
  agentSurfaceId?: string;
  agentDisplayName?: string;
  targetAgentSurfaceId?: string;
  targetAgentDisplayName?: string;
  phase: "started" | "updated" | "completed" | "stderr" | "status";
  name?: string;
  command?: string;
  outputTail?: string;
  isError?: boolean;
  exitCode?: number;
  status?: string;
}

export interface WorkbenchAssistantEvent extends CodexReadableEvent {
  runId: string;
  projectId?: string;
  conversationId?: string;
  changeId?: string;
  threadId?: string;
  parentThreadId?: string;
  turnId?: string;
  timestamp?: string;
  agentRoleId?: string;
  agentTaskId?: string;
  agentSurfaceId?: string;
  agentDisplayName?: string;
  targetAgentSurfaceId?: string;
  targetAgentDisplayName?: string;
}

export interface TopicMessageInput {
  mode?: WorkbenchMessageMode;
  message?: string;
  text?: string;
  contextRefs?: TopicFileReference[];
  attachmentIds?: string[];
  planHandoffIntent?: PlanHandoffIntent;
}

export type PlanHandoffAgentRoleId = "planning-agent";
export type PlanHandoffIntentKind = "execute-plan" | "revise-plan" | "cancel-plan";

export interface PlanHandoffIntent {
  sourceRunId: string;
  sourceAgentRoleId: PlanHandoffAgentRoleId;
  sourceArtifact?: string;
  kind: PlanHandoffIntentKind;
  executionMode?: HarnessExecutionMode;
  feedback?: string;
}

export interface ValidatedPlanHandoffIntent extends PlanHandoffIntent {
  planText: string;
  sourceArtifact: string;
}

export interface WorkbenchWorkflowActionRequest {
  actionType: WorkbenchWorkflowActionType;
  changeId?: string;
  prompt?: string;
  feedback?: string;
  proposalId?: string;
  workflowGraphPlanId?: string;
  schedulerContractId?: string;
  schedulerDispatchDryRunId?: string;
  schedulerWorkerPlanId?: string;
  schedulerClaimReconcilePlanId?: string;
  schedulerLaunchPreflightId?: string;
  schedulerRunId?: string;
  schedulerReconcileSnapshotId?: string;
  schedulerClaimReservationId?: string;
  schedulerWorkerStartId?: string;
  schedulerWorkerResultId?: string;
  schedulerWorkerValidationId?: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId?: string;
  schedulerWorkerReworkStartId?: string;
  schedulerWorkerReworkResultId?: string;
  schedulerWorkerReworkValidationId?: string;
  schedulerWorkerReworkAuditId?: string;
  schedulerIntegrationCandidateId?: string;
  schedulerIntegrationCheckHandoffId?: string;
  schedulerIntegrationOutcomeId?: string;
  schedulerRunCompletionId?: string;
  schedulerRunBlockedCloseoutId?: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  worktreeId?: string;
  taskIds?: string[];
  worktreeIds?: string[];
  taskRunId?: string;
  workerLeaseId?: string;
  runId?: string;
  validationRunId?: string;
  reworkValidationRunId?: string;
  auditRunId?: string;
  reworkAuditRunId?: string;
  applyCheckId?: string;
  landingPackageId?: string;
  remoteLandingResultId?: string;
}

export interface WorkbenchWorkflowActionResult {
  actionRunId: string;
  actionType: WorkbenchWorkflowActionType;
  status: "completed" | "failed";
  result?: unknown;
  runId?: string;
  error?: string;
}
