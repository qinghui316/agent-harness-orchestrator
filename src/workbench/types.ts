import type { CodexReadableEvent } from "../codex/jsonl.js";
import type { RunMetadata } from "../types/index.js";
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

export type WorkbenchMessageMode = "chat" | "plan";
export type TopicRoutingDecision = "same-topic" | "new-topic-required" | "clarify";
export type WorkbenchWorkflowActionType = WorkflowActionType;

export interface SuggestedAction {
  actionType: Exclude<WorkbenchWorkflowActionType, "chat.ask" | "change.spec.accept" | "change.plan.accept" | "validate.run" | "audit.run">;
  label: string;
  requiresConfirmation: boolean;
  prompt?: string;
}

export interface OrchestrationPlanCard {
  title: string;
  summary: string;
  steps: Array<{
    label: string;
    description: string;
    actionId?: string;
    requiresConfirmation?: boolean;
  }>;
  warnings: string[];
}

export interface TopicThreadEntry {
  id: string;
  type: TopicThreadEventType;
  timestamp: string;
  changeId: string;
  position?: number;
  text?: string;
  actionRunId?: string;
  actionType?: string;
  status?: string;
  runId?: string;
  artifact?: string;
  error?: string;
  planCard?: OrchestrationPlanCard;
  activity?: AssistantTurnActivity[];
  blocks?: AssistantTurnBlock[];
  intake?: unknown;
  clarification?: unknown;
}

export type AssistantTurnBlockKind =
  | "prose"
  | "status"
  | "command-group"
  | "command"
  | "tool-result"
  | "file-change"
  | "reasoning-summary"
  | "plan-card"
  | "workflow-evidence"
  | "usage"
  | "error";

export interface AssistantTurnBlock {
  id: string;
  runId?: string;
  sequence: number;
  kind: AssistantTurnBlockKind;
  timestamp: string;
  source: "codex" | "aho" | "workflow" | "validation" | "audit" | "decision" | "legacy";
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
  children?: AssistantTurnBlock[];
  planCard?: OrchestrationPlanCard;
}

export type AssistantTurnActivity =
  | { kind: "status"; label: string; detail?: string; timestamp: string }
  | { kind: "assistant-event"; event: WorkbenchAssistantEvent; timestamp: string }
  | { kind: "tool"; tool: WorkbenchLiveToolEvent; timestamp: string }
  | { kind: "usage"; usage: Record<string, unknown>; timestamp: string }
  | { kind: "error"; message: string; timestamp: string };

export interface TopicRuntimeMetadata {
  version: "1.0";
  changeId: string;
  codexSessionId: string | null;
  updatedAt: string;
}

export interface TopicMessageResult {
  user: TopicThreadEntry;
  assistant: TopicThreadEntry | null;
  run: RunMetadata | null;
  codexSessionId: string | null;
  mode?: WorkbenchMessageMode;
  routingDecision?: TopicRoutingDecision;
  assistantMessage?: string;
  planCard?: OrchestrationPlanCard;
  suggestedActions?: SuggestedAction[];
}

export type WorkbenchLiveEvent =
  | { event: "topic.message"; data: TopicThreadEntry }
  | { event: "run.started"; data: { runId: string; changeId: string; actionType?: string; runtime?: string; taskIds?: string[] } }
  | { event: "run.status"; data: { runId?: string; actionRunId?: string; status: string; label?: string } }
  | { event: "assistant.delta"; data: { delta: string; runId?: string } }
  | { event: "assistant.message"; data: TopicThreadEntry }
  | { event: "assistant.event"; data: WorkbenchAssistantEvent }
  | { event: "tool.event"; data: WorkbenchLiveToolEvent }
  | { event: "usage"; data: { runId?: string; usage?: Record<string, unknown> } }
  | { event: "snapshot"; data: unknown }
  | { event: "error"; data: { message: string; runId?: string; actionRunId?: string } }
  | { event: "done"; data: { status: "completed" | "failed" } };

export interface WorkbenchLiveSink {
  emit(event: WorkbenchLiveEvent): void;
  isClosed?(): boolean;
}

export interface WorkbenchLiveToolEvent {
  runId: string;
  itemId?: string;
  phase: "started" | "completed" | "stderr" | "status";
  name?: string;
  command?: string;
  outputTail?: string;
  isError?: boolean;
  exitCode?: number;
  status?: string;
}

export interface WorkbenchAssistantEvent extends CodexReadableEvent {
  runId: string;
  timestamp?: string;
}

export interface TopicMessageInput {
  mode?: WorkbenchMessageMode;
  message?: string;
  text?: string;
}

export interface WorkbenchWorkflowActionRequest {
  actionType: WorkbenchWorkflowActionType;
  changeId?: string;
  prompt?: string;
  proposalId?: string;
  planningBundleId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
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

export interface PlanningArtifactBundle {
  id: string;
  status: "draft" | "confirmed";
  goal: string;
  constraints: string[];
  acceptanceCriteria: string[];
  design: string;
  tasks: Array<{ id: string; title: string; acIds: string[] }>;
  risks: string[];
  openQuestions: string[];
  specMd: string;
  planMd: string;
  tasksMd: string;
  acMapCandidate?: unknown;
  artifact: string;
  updatedAt: string;
}
