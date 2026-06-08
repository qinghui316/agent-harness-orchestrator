import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { startAuditRun } from "../audit/manager.js";
import {
  completeAgentTask,
  createAgentTask,
  listAgentTasks,
  recordMainAgentDecision,
  recordMaintenanceLedgerEntry,
} from "../agent-task/manager.js";
import {
  type AgentTaskRequest,
} from "../agent-task/delegate-task.js";
import { recordPostRunBoundaryAudit, boundaryAuditArtifactRef, recordToolEventAuditEntry } from "../agent-task/boundary-audit.js";
import { dispatchForegroundRoleTask } from "../agent-task/role-dispatcher.js";
import { evaluateToolPolicy, highImpactActions } from "../agent-task/tool-policy.js";
import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  recordMainAgentOrchestrationStep,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationRole,
  type MainAgentOrchestrationState,
} from "../agent-task/orchestration-engine.js";
import { startCodeRun, type CodeExecutionGateOptions } from "../code/manager.js";
import { buildCodexReadonlyArgv, buildCodexReadonlyResumeArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { detectCodexAppServerCapability, getActiveCodexAppServerTurn, runCodexAppServerTurn, type CodexAppServerNotification } from "../codex/app-server.js";
import { createCodexJsonlStreamParser, extractCodexSessionIdFromJsonl, extractFinalMessageFromCodexJsonl, truncateReadablePreview, type CodexJsonlStreamEvent } from "../codex/jsonl.js";
import { createConcurrentChange, getChangeStatusForChange } from "../change/manager.js";
import { acceptPlanProposal, acceptSpecProposal, startPlanProposalRun, startSpecProposalRun } from "../change/proposals.js";
import { getActiveChanges } from "../ecl/index.js";
import { buildAcMap } from "../ecl/anchors.js";
import {
  claimAvailableDemandWorkers,
  claimNextDemandWorker,
  completeDemandWorkerAttempt,
  enqueueDemandWorker,
  getDemandWorkerForChange,
  markDemandWorkerRunning,
  reconcileDemandWorkers,
  recordMainOrchestratorDecision,
  releaseDemandWorker,
} from "../demand-worker/manager.js";
import { readJsonFile, readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { appendRunEvent, buildContextProjection, buildRunId, listRuns } from "../run/manager.js";
import { isRunStopRequested, requestRunStop } from "../run/control.js";
import { executeProcessStreaming } from "../run/process.js";
import { getEnabledSkillContext } from "../skill/catalog.js";
import { getSpecTestDriftReport } from "../spec-test/drift.js";
import { runIntegrationCheck } from "../integration-check/manager.js";
import { prepareLandingPackage, reviewLandingPackage } from "../landing/manager.js";
import { latestLandingQueueSnapshot, mergeNextLandingQueueCandidate, prepareLandingQueue, refreshLandingQueue } from "../landing-queue/manager.js";
import { createDraftPr, preparePrDraftPackage, refreshPrDraftStatus } from "../pr-draft/manager.js";
import {
  completePrFeedbackReworkAttempt,
  refreshPrFeedback,
  startPrFeedbackReworkAttempt,
  updatePrDraftFromFeedback,
} from "../pr-feedback/manager.js";
import {
  preparePrReviewReadiness,
  preparePrReviewReplyDraft,
  refreshPrReviewState,
  resolvePrReviewThread,
  submitPrForHumanReview,
  submitPrReviewReply,
} from "../pr-review/manager.js";
import { mergeRemoteLanding, prepareRemoteLandingReadiness, refreshRemoteLanding } from "../remote-landing/manager.js";
import {
  cleanupRemoteBranchAfterMerge,
  prepareLocalSync,
  preparePostMergeHandoff,
  prepareRemoteBranchCleanup,
  syncLocalAfterMerge,
} from "../post-merge/manager.js";
import { finishTaskRunFromWorkflowResult, listTaskRuns, markTaskRunStarted, reconcileTaskRuns, retryTaskRun, startTaskRun } from "../task-run/manager.js";
import {
  failQueuedTaskItem,
  getNextQueuedTaskQueueItem,
  listTaskQueues,
  markTaskQueueItemRunning,
  markTaskQueueRunning,
  pauseTaskQueue,
  updateTaskQueueAfterItem,
  finishTaskQueueItem,
} from "../task-queue/manager.js";
import {
  createWorkflowRunForValidatedTaskQueue,
  deriveWorkflowStageResumeVerdict,
  reconcileWorkflowTaskQueue,
  startOrResumeWorkflowTaskQueue,
  syncWorkflowRunFromTaskQueue,
  validateWorkflowTaskQueueProposalStart,
} from "../workflow-runtime/taskqueue.js";
import { readWorkflowRun } from "../workflow-run/manager.js";
import {
  buildTaskQueueProposalFromReadiness,
  compileWorkflowGraphPlan,
  displayArtifactPath,
  hashArtifactRefs,
  readLatestDecompositionPlan,
  readLatestDecompositionReadinessManifest,
  readLatestTaskQueueProposal,
  readLatestWorkflowGraphPlan,
  readWorkflowGraphPlan,
  renderTaskQueueProposalMarkdown,
  supersedeExistingTaskQueueProposal,
  writeDecompositionPlan,
  writeDecompositionReadinessManifest,
  writeTaskQueueProposal,
  type DecompositionPlan,
  type DecompositionReadinessGuardrail,
  type DecompositionReadinessManifest,
  type DecompositionReadinessStatus,
  type DecompositionReadinessUnit,
  type DecompositionRecommendation,
  type DecompositionUnit,
  type TaskQueueProposal,
  type WorkflowGraphPlan,
} from "../workflow-artifacts/manager.js";
import {
  assertWorkflowActionRequiredTargets,
  workflowActionScopePayload as buildWorkflowActionScopePayload,
  workflowActionScopesMatchStrict,
  workflowActionTargetId as buildWorkflowActionTargetId,
} from "../workflow-actions/registry.js";
import { startValidationRun } from "../validation/manager.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../agent/catalog.js";
import type { AgentTask, ManagedProject, ResolvedMemory, RunMetadata, RunStatus, StageResumeVerdict, TaskRun } from "../types/index.js";
import { runWorkbenchWorkflowActionService } from "./actions/service.js";
import { WorkbenchStore, type StoredDecisionRecord } from "./store.js";
import { appendTopicThreadLogEntry, collectAllTopicThreadEntries, readTopicThreadLog as readThreadLog } from "./thread-log.js";
import type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  AssistantTurnBlockKind,
  OrchestrationPlanCard,
  PlanningArtifactBundle,
  SuggestedAction,
  TopicMessageInput,
  TopicMessageResult,
  TopicRoutingDecision,
  TopicRuntimeMetadata,
  TopicThreadEntry,
  WorkbenchAssistantEvent,
  WorkbenchLiveEvent,
  WorkbenchLiveSink,
  WorkbenchLiveToolEvent,
  WorkbenchWorkflowActionRequest,
  WorkbenchWorkflowActionResult,
  WorkbenchWorkflowActionType,
} from "./types.js";
export type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  AssistantTurnBlockKind,
  OrchestrationPlanCard,
  PlanningArtifactBundle,
  SuggestedAction,
  TopicMessageInput,
  TopicMessageResult,
  TopicRoutingDecision,
  TopicRuntimeMetadata,
  TopicThreadEntry,
  WorkbenchAssistantEvent,
  WorkbenchLiveEvent,
  WorkbenchLiveSink,
  WorkbenchLiveToolEvent,
  WorkbenchMessageMode,
  WorkbenchWorkflowActionRequest,
  WorkbenchWorkflowActionResult,
  WorkbenchWorkflowActionType,
} from "./types.js";

function emitLive(live: WorkbenchLiveSink | undefined, event: WorkbenchLiveEvent): void {
  try {
    live?.emit(event);
  } catch {
    // Live transport is best-effort; persisted thread/run artifacts remain canonical.
  }
}

function createAssistantTranscriptCapture(live: WorkbenchLiveSink | undefined): AssistantTranscriptCapture {
  const activity: AssistantTurnActivity[] = [];
  const blocks: AssistantTurnBlock[] = [];
  let sequence = 0;

  function nextSequence(): number {
    sequence += 1;
    return sequence;
  }

  function appendBlock(block: Omit<AssistantTurnBlock, "id" | "sequence" | "timestamp"> & { id?: string; sequence?: number; timestamp?: string }): void {
    const timestamp = block.timestamp ?? new Date().toISOString();
    const currentSequence = block.sequence ?? nextSequence();
    upsertTranscriptBlock(blocks, {
      ...block,
      id: block.id ?? `block-${timestamp}-${currentSequence}`,
      sequence: currentSequence,
      timestamp,
    });
  }

  function appendProse(delta: string, runId?: string): void {
    if (!delta) return;
    const last = blocks.at(-1);
    if (last?.kind === "prose" && last.source === "codex") {
      last.text = `${last.text ?? ""}${delta}`;
      return;
    }
    const currentSequence = nextSequence();
    appendBlock({
      id: `prose:${runId ?? "assistant"}:${currentSequence}`,
      runId,
      sequence: currentSequence,
      kind: "prose",
      source: "codex",
      text: delta,
    });
  }

  function appendAssistantEventBlock(event: WorkbenchAssistantEvent, timestamp: string): void {
    const block = assistantEventToBlock(event, timestamp, nextSequence());
    if (block) upsertTranscriptBlock(blocks, block);
  }

  function appendToolEventBlock(event: WorkbenchLiveToolEvent, timestamp: string): void {
    const block = toolEventToBlock(event, timestamp, nextSequence());
    if (block) upsertTranscriptBlock(blocks, block);
  }

  const capture: AssistantTranscriptCapture = {
    text: "",
    activity,
    blocks,
    sink: {
      emit(event: WorkbenchLiveEvent): void {
        const timestamp = new Date().toISOString();
        if (event.event === "run.started") {
          activity.push({
            kind: "status",
            label: "started",
            detail: event.data.runtime ?? event.data.actionType,
            timestamp,
          });
        } else if (event.event === "run.status") {
          activity.push({
            kind: "status",
            label: event.data.status,
            detail: event.data.label,
            timestamp,
          });
        } else if (event.event === "assistant.delta") {
          capture.text += event.data.delta;
          appendProse(event.data.delta, event.data.runId);
        } else if (event.event === "assistant.event") {
          activity.push({
            kind: "assistant-event",
            event: { ...event.data, timestamp: event.data.timestamp ?? timestamp },
            timestamp,
          });
          appendAssistantEventBlock({ ...event.data, timestamp: event.data.timestamp ?? timestamp }, timestamp);
        } else if (event.event === "tool.event") {
          activity.push({ kind: "tool", tool: event.data, timestamp });
          appendToolEventBlock(event.data, timestamp);
        } else if (event.event === "usage" && isRecord(event.data.usage)) {
          activity.push({ kind: "usage", usage: event.data.usage, timestamp });
          const currentSequence = nextSequence();
          upsertTranscriptBlock(blocks, {
            id: `usage:${event.data.runId ?? "assistant"}:${currentSequence}`,
            runId: event.data.runId,
            sequence: currentSequence,
            kind: "usage",
            timestamp,
            source: "codex",
            title: "Usage recorded",
            text: formatUsageSummary(event.data.usage),
          });
        } else if (event.event === "error") {
          activity.push({ kind: "error", message: event.data.message, timestamp });
          const currentSequence = nextSequence();
          blocks.push({
            id: `error:${event.data.runId ?? event.data.actionRunId ?? "assistant"}:${currentSequence}`,
            runId: event.data.runId,
            sequence: currentSequence,
            kind: "error",
            timestamp,
            source: "codex",
            title: "Error",
            text: event.data.message,
            isError: true,
          });
        }
        emitLive(live, event);
      },
    },
  };
  return capture;
}

interface AssistantTranscriptCapture {
  sink: WorkbenchLiveSink;
  text: string;
  activity: AssistantTurnActivity[];
  blocks: AssistantTurnBlock[];
}

function assistantEventToBlock(event: WorkbenchAssistantEvent, timestamp: string, sequence: number): AssistantTurnBlock | null {
  if (!isMainThreadAssistantStatus(event)) return null;
  const kind = assistantEventBlockKind(event.kind);
  const text = event.summary ?? (kind === "usage" ? undefined : event.preview);
  return {
    id: `assistant:${event.runId}:${event.itemId ?? event.kind}:${event.phase ?? "event"}:${sequence}`,
    runId: event.runId,
    sequence,
    kind,
    timestamp: event.timestamp ?? timestamp,
    source: "codex",
    status: event.phase,
    title: event.title ?? assistantEventTitle(event.kind),
    text,
    command: event.command,
    cwd: event.cwd,
    exitCode: event.exitCode,
    preview: kind === "usage" ? event.summary : event.preview,
    artifactRef: event.artifactRef,
    isError: event.isError,
    truncated: event.truncated,
    itemId: event.itemId,
  };
}

function toolEventToBlock(event: WorkbenchLiveToolEvent, timestamp: string, sequence: number): AssistantTurnBlock | null {
  if (event.phase === "stderr") return null;
  if (!event.command && event.phase === "status" && !event.isError) return null;
  return {
    id: `tool:${event.runId}:${event.command ?? event.name ?? event.phase}:${event.phase}:${sequence}`,
    runId: event.runId,
    sequence,
    kind: event.command ? "command" : "status",
    timestamp,
    source: "codex",
    status: event.status ?? event.phase,
    title: event.command
      ? event.phase === "started" ? "Command started" : event.isError ? "Command failed" : "Command completed"
      : event.name ?? "Run status",
    text: event.name,
    command: event.command,
    exitCode: event.exitCode,
    preview: event.outputTail,
    isError: event.isError,
    truncated: event.outputTail?.includes("[truncated") ? true : undefined,
    itemId: event.itemId,
  };
}

function upsertTranscriptBlock(blocks: AssistantTurnBlock[], block: AssistantTurnBlock): void {
  const key = assistantBlockSemanticKey(block);
  const index = blocks.findIndex((item) => assistantBlockSemanticKey(item) === key);
  if (index === -1) {
    blocks.push(block);
    return;
  }
  blocks[index] = mergeAssistantBlocks(blocks[index], block);
}

function mergeAssistantBlocks(existing: AssistantTurnBlock, incoming: AssistantTurnBlock): AssistantTurnBlock {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    sequence: existing.sequence,
    timestamp: existing.timestamp,
    text: incoming.text ?? existing.text,
    preview: incoming.preview ?? existing.preview,
    title: incoming.title ?? existing.title,
    status: incoming.status ?? existing.status,
    command: incoming.command ?? existing.command,
    cwd: incoming.cwd ?? existing.cwd,
    exitCode: incoming.exitCode ?? existing.exitCode,
    artifactRef: incoming.artifactRef ?? existing.artifactRef,
    truncated: incoming.truncated ?? existing.truncated,
    isError: incoming.isError ?? existing.isError,
  };
}

function assistantBlockSemanticKey(block: AssistantTurnBlock): string {
  const runId = block.runId ?? "";
  if (block.kind === "usage") return `usage:${runId}`;
  if (block.kind === "error") return `error:${runId}:${normalizeBlockText(block.text ?? block.preview ?? block.title)}`;
  if (block.kind === "workflow-evidence") return `workflow-evidence:${runId}:${block.artifactRef ?? block.title ?? block.status ?? block.id}`;
  if (block.kind === "command") {
    if (block.itemId) return `command:${runId}:item:${block.itemId}`;
    return `command:${runId}:command:${normalizeCommandKey(block.command)}`;
  }
  return block.itemId ? `${block.kind}:${runId}:item:${block.itemId}` : `${block.id}:${block.kind}`;
}

function normalizeCommandKey(command: string | undefined): string {
  return (command ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeBlockText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function assistantEventBlockKind(kind: WorkbenchAssistantEvent["kind"]): AssistantTurnBlockKind {
  if (kind === "reasoning-summary") return "reasoning-summary";
  if (kind === "command") return "command";
  if (kind === "file-change") return "file-change";
  if (kind === "usage") return "usage";
  if (kind === "error") return "error";
  if (kind === "status") return "status";
  return "tool-result";
}

function assistantEventTitle(kind: WorkbenchAssistantEvent["kind"]): string {
  if (kind === "reasoning-summary") return "Reasoning summary";
  if (kind === "command") return "Command";
  if (kind === "file-change") return "File change";
  if (kind === "mcp-tool") return "Tool call";
  if (kind === "web-search") return "Web search";
  if (kind === "plan-update") return "Plan update";
  if (kind === "tool-result") return "Tool result";
  if (kind === "usage") return "Usage";
  if (kind === "error") return "Error";
  return "Run status";
}

function isMainThreadAssistantStatus(event: WorkbenchAssistantEvent): boolean {
  if (event.kind !== "status") return true;
  const normalized = `${event.title ?? ""} ${event.summary ?? ""} ${event.phase ?? ""}`.toLowerCase();
  if (normalized.includes("codex thread started")) return false;
  if (normalized.includes("codex initialized the thread")) return false;
  if (normalized.includes("codex turn running")) return false;
  if (normalized.includes("codex started processing the turn")) return false;
  if (normalized.includes("codex turn completed")) return false;
  return Boolean(event.isError) || normalized.includes("validation") || normalized.includes("audit") || normalized.includes("failed") || normalized.includes("blocked");
}

const runtimeMetadataSchema = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  codexSessionId: z.string().nullable(),
  updatedAt: z.string(),
});
const OFFICIAL_REWORK_BUDGET = 1;
const PROJECT_SCOPED_WORKFLOW_ACTIONS = new Set<WorkbenchWorkflowActionType>([
  "demand.worker.start-available",
  "demand.worker.reconcile",
  "orchestrator.pump",
]);

export async function createWorkbenchTopic(project: ManagedProject, input: { title: string; body?: string }): Promise<{ changeId: string; title: string; state: "active" }> {
  const result = await createConcurrentChange(project, { title: input.title, body: input.body });
  await appendTopicThreadEntry(project, result.change.id, {
    type: "user.message",
    text: input.body ?? input.title,
  });
  return { changeId: result.change.id, title: result.change.title, state: "active" };
}

export async function listTopicMessages(project: ManagedProject, changeId: string): Promise<TopicThreadEntry[]> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  return readThreadLog(memory, changePath);
}

export async function readTopicThreadLog(memory: ResolvedMemory, changePath: string): Promise<TopicThreadEntry[]> {
  return readThreadLog(memory, changePath);
}

export async function postTopicMessage(project: ManagedProject, changeId: string, input: string | TopicMessageInput, live?: WorkbenchLiveSink): Promise<TopicMessageResult> {
  const parsed = normalizeTopicMessageInput(input);
  if (parsed.mode === "plan") return postTopicPlanMessage(project, changeId, parsed.message, live);
  const topicState = await getTopicLifecycleState(project, changeId);
  const runningRun = await findRunningRunForChange(project, changeId);
  if (topicState === "archive" && looksLikeImplementationRequest(parsed.message)) {
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, status: "follow-up-requested" });
    live?.emit({ event: "topic.message", data: user });
    const followUp = await createWorkbenchTopic(project, {
      title: `后续：${parsed.message.split(/\r?\n/)[0].slice(0, 44)}`,
      body: [`Linked follow-up from archived demand ${changeId}.`, "", parsed.message].join("\n"),
    });
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      text: `这个需求对话已归档，不能继续承载新的实现工作。我已创建 linked follow-up 需求对话：${followUp.changeId}。`,
      status: "follow-up-created",
      artifact: followUp.changeId,
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return { user, assistant, run: null, codexSessionId: null, mode: "chat", routingDecision: "new-topic-required", assistantMessage: assistant.text ?? "" };
  }
  if (runningRun) {
    const activeTurn = getActiveCodexAppServerTurn(changeId);
    if (activeTurn) {
      const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, status: "steering-sent", runId: activeTurn.runId });
      live?.emit({ event: "topic.message", data: user });
      await activeTurn.steer(parsed.message);
      const assistant = await appendTopicThreadEntry(project, changeId, {
        type: "assistant.message",
        text: "已发送给当前执行。",
        status: "steering-sent",
        runId: activeTurn.runId,
      });
      live?.emit({ event: "assistant.message", data: assistant });
      emitAssistantEvent(live, {
        runId: activeTurn.runId,
        kind: "status",
        phase: "steered",
        title: "已发送给当前执行",
        summary: "这条输入已通过 Codex app-server 发送给当前运行中的 turn。",
      });
      return { user, assistant, run: null, codexSessionId: null, mode: "chat", routingDecision: "same-topic", assistantMessage: assistant.text ?? "" };
    }
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, status: "pending-feedback", runId: runningRun.id });
    live?.emit({ event: "topic.message", data: user });
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      text: "已记录，将在下一轮生效。",
      status: "pending-feedback",
      runId: runningRun.id,
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return { user, assistant, run: null, codexSessionId: null, mode: "chat", routingDecision: "same-topic", assistantMessage: assistant.text ?? "" };
  }
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message });
  live?.emit({ event: "topic.message", data: user });
  const capture = createAssistantTranscriptCapture(live);
  const chat = await runCodexChat(project, changeId, parsed.message, capture.sink);
  const assistantText = chat.message.trim() || capture.text.trim();
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    text: assistantText,
    runId: chat.run.id,
    artifact: chat.run.artifacts.lastMessage,
    activity: capture.activity,
    blocks: capture.blocks,
  });
  live?.emit({ event: "assistant.message", data: assistant });
  return { user, assistant, run: chat.run, codexSessionId: chat.codexSessionId, mode: "chat", routingDecision: "same-topic", assistantMessage: assistantText };
}

async function findRunningRunForChange(project: ManagedProject, changeId: string): Promise<RunMetadata | null> {
  const memory = await resolveProjectMemory(project);
  const runs = await listRuns(memory).catch(() => []);
  return runs.find((run) => run.changeId === changeId && (run.status === "created" || run.status === "running")) ?? null;
}

async function getTopicLifecycleState(project: ManagedProject, changeId: string): Promise<"active" | "archive"> {
  const { changePath } = await resolveTopic(project, changeId);
  if (changePath.includes("/archive/")) return "archive";
  return "active";
}

function looksLikeImplementationRequest(message: string): boolean {
  return /(新增|修改|实现|修复|继续做|继续改|执行|开发|补测试|改代码|apply|merge|implement|fix|code)/i.test(message);
}

export async function appendTopicThreadEntry(project: ManagedProject, changeId: string, input: Omit<TopicThreadEntry, "id" | "timestamp" | "changeId">): Promise<TopicThreadEntry> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Topic thread update");
  const entry: TopicThreadEntry = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    changeId,
    ...input,
  };
  await appendTopicThreadLogEntry(memory, changePath, entry);
  return entry;
}

export async function runWorkbenchWorkflowAction(project: ManagedProject, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<WorkbenchWorkflowActionResult> {
  return runWorkbenchWorkflowActionService(project, request, live, {
    resolveChangeId: resolveWorkflowActionChangeId,
    createTranscriptCapture: createAssistantTranscriptCapture,
    appendThreadEntry: appendTopicThreadEntry,
    execute: executeWorkflowAction,
    labelForAction,
    extractRunId,
    failureMessage: workflowFailureMessage,
    summarizeResult: summarizeActionResult,
    artifactForResult: artifactForActionResult,
    targetId: workflowActionTargetId,
    scopePayload: workflowActionScopePayload,
    recordDecision: recordWorkbenchDecision,
  });
}

async function resolveWorkflowActionChangeId(project: ManagedProject, request: WorkbenchWorkflowActionRequest): Promise<string> {
  if (request.changeId) return request.changeId;
  if (PROJECT_SCOPED_WORKFLOW_ACTIONS.has(request.actionType)) return getSingleActiveChangeId(project);
  throw new Error(`${request.actionType} requires changeId.`);
}

export async function getWorkbenchActionEvents(project: ManagedProject, actionRunId: string): Promise<TopicThreadEntry[]> {
  const memory = await resolveProjectMemory(project);
  if (!existsSync(join(memory.changesRoot, "active"))) return [];
  const entries = await collectAllTopicThreadEntries(memory);
  return entries.filter((entry) => entry.actionRunId === actionRunId);
}

async function executeWorkflowAction(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<unknown> {
  assertWorkflowActionScope(request);
  await auditHighImpactWorkflowAction(project, changeId, request, live);
  switch (request.actionType) {
    case "chat.ask":
      if (!request.prompt) throw new Error("chat.ask requires prompt.");
      return postTopicMessage(project, changeId, request.prompt, live);
    case "change.spec.propose":
      return startSpecProposalRun(project, { prompt: request.prompt });
    case "change.spec.accept":
      if (!request.proposalId) throw new Error("change.spec.accept requires proposalId.");
      return acceptSpecProposal(project, request.proposalId);
    case "change.plan.propose":
      return startPlanProposalRun(project, { prompt: request.prompt });
    case "change.plan.accept":
      if (!request.proposalId) throw new Error("change.plan.accept requires proposalId.");
      return acceptPlanProposal(project, request.proposalId);
    case "planning.generate":
    case "planning.revise":
      return generatePlanningDraft(project, changeId, request.prompt, live, request.actionType === "planning.revise");
    case "planning.confirm-execution":
      return confirmPlanningAndStartPipeline(project, changeId, request, live);
    case "planning.decompose":
      return generateDecompositionPlan(project, changeId, request.prompt, live);
    case "planning.decomposition.confirm":
      return confirmDecompositionPlan(project, changeId, request, live);
    case "planning.decomposition.assess-readiness":
      return assessDecompositionReadiness(project, changeId, request, live);
    case "planning.taskqueue.propose":
      return proposeTaskQueue(project, changeId, request, live);
    case "planning.workflowgraph.compile":
      return compileTaskQueueWorkflowGraph(project, changeId, request, live);
    case "planning.taskqueue.confirm-start":
      return confirmTaskQueueProposalAndStart(project, changeId, request, live);
    case "orchestrator.evaluate":
      return evaluateDemandOrchestrator(project, changeId);
    case "demand.worker.enqueue":
      return enqueueDemandWorkerForAction(project, changeId);
    case "demand.worker.claim":
    case "demand.worker.start-next":
      return startNextDemandWorkerForAction(project, changeId, request.prompt, live);
    case "demand.worker.start-available":
    case "orchestrator.pump":
      return pumpDemandWorkersForAction(project, request.prompt, live, changeId);
    case "demand.worker.reconcile":
      return reconcileDemandWorkers(await resolveProjectMemory(project));
    case "demand.worker.release":
      return releaseDemandWorkerForAction(project, changeId, request.prompt);
    case "role.pipeline.start":
    case "role.pipeline.continue":
      return runMainAgentToolOrchestration(project, changeId, request.prompt, live, request.actionType === "role.pipeline.continue");
    case "role.pipeline.stop":
      return stopRunningPipeline(project, changeId, request.prompt, live);
    case "role.pipeline.reconcile":
      return reconcileTaskRuns(project, { changeId, taskRunId: request.taskRunId });
    case "conversation.steer":
      return steerConversation(project, changeId, request.prompt, live);
    case "conversation.interrupt":
      return interruptConversation(project, changeId, request.prompt, live);
    case "conversation.continue":
      return runMainAgentToolOrchestration(project, changeId, request.prompt, live, true);
    case "result.refresh-rework":
      if (!request.worktreeId) throw new Error("result.refresh-rework requires worktreeId.");
      return runCodeValidateAuditSequence(project, changeId, sourceRefreshReworkPrompt(request.worktreeId, request.prompt), live, undefined, undefined, "rework-coder");
    case "result.revalidate":
      if (!request.worktreeId) throw new Error("result.revalidate requires worktreeId.");
      return startValidationRun(project, { changeId, worktree: request.worktreeId });
    case "result.reaudit":
      if (!request.worktreeId) throw new Error("result.reaudit requires worktreeId.");
      return startAuditRun(project, { changeId, worktreeId: request.worktreeId, prompt: request.prompt ?? "Re-run audit for the selected result review evidence." });
    case "result.refresh-status":
      return { status: "refreshed", changeId, worktreeId: request.worktreeId };
    case "apply-check.run":
      return runIntegrationCheck(project, request.worktreeIds ?? (request.worktreeId ? [request.worktreeId] : undefined));
    case "landing.prepare":
      return prepareLandingForAction(project, changeId, request, live);
    case "landing.review":
      return reviewLandingForAction(project, changeId, request, live);
    case "landing.refresh":
      return prepareLandingForAction(project, changeId, request, live);
    case "landing-queue.prepare":
      return prepareLandingQueueForAction(project, changeId, live);
    case "landing-queue.refresh":
      return refreshLandingQueueForAction(project, changeId, live);
    case "landing-queue.merge-next":
      return mergeNextLandingQueueForAction(project, changeId, request, live);
    case "landing-queue.skip":
    case "landing-queue.remove-stale":
      return refreshLandingQueueForAction(project, changeId, live);
    case "pr-draft.prepare":
      return preparePrDraftForAction(project, changeId, request, live);
    case "pr-draft.create":
      return createPrDraftForAction(project, changeId, request, live);
    case "pr-draft.refresh":
      return refreshPrDraftForAction(project, changeId, request, live);
    case "pr-feedback.refresh":
    case "pr-feedback.evaluate":
      return refreshPrFeedbackForAction(project, changeId, request, live);
    case "pr-feedback.rework":
      return reworkPrFeedbackForAction(project, changeId, request, live);
    case "pr-feedback.update-draft":
      return updatePrDraftForAction(project, changeId, request, live);
    case "pr-review.prepare":
      return preparePrReviewForAction(project, changeId, request, live);
    case "pr-review.submit":
      return submitPrReviewForAction(project, changeId, request, live);
    case "pr-review.refresh":
      return refreshPrReviewForAction(project, changeId, request, live);
    case "pr-review.feedback-refresh":
    case "pr-review.feedback-evaluate":
      return refreshPrFeedbackForAction(project, changeId, { ...request, actionType: "pr-feedback.refresh" }, live);
    case "pr-review.rework":
      return reworkPrFeedbackForAction(project, changeId, { ...request, actionType: "pr-feedback.rework" }, live);
    case "pr-review.reply-prepare":
      return preparePrReviewReplyForAction(project, changeId, request, live);
    case "pr-review.reply-submit":
      return submitPrReviewReplyForAction(project, changeId, request, live);
    case "pr-review.thread-resolve":
      return resolvePrReviewThreadForAction(project, changeId, request, live);
    case "remote-landing.prepare":
      return prepareRemoteLandingForAction(project, changeId, request, live);
    case "remote-landing.merge":
      return mergeRemoteLandingForAction(project, changeId, request, live);
    case "remote-landing.refresh":
      return refreshRemoteLandingForAction(project, changeId, request, live);
    case "post-merge.prepare":
    case "post-merge.refresh":
      return preparePostMergeForAction(project, changeId, request, live);
    case "post-merge.sync-local.prepare":
      return prepareLocalSyncForAction(project, changeId, request, live);
    case "post-merge.sync-local.run":
      return syncLocalForAction(project, changeId, request, live);
    case "post-merge.cleanup-branch.prepare":
      return prepareRemoteBranchCleanupForAction(project, changeId, request, live);
    case "post-merge.cleanup-branch.run":
      return cleanupRemoteBranchForAction(project, changeId, request, live);
    case "code.run":
      return runMainAgentToolOrchestration(project, changeId, request.prompt, live, false, request.taskIds, request.readinessManifestId);
    case "task.run.start":
      return runTaskRunCodeValidateAuditSequence(project, changeId, request, live, "start");
    case "task.run.retry":
      return runTaskRunCodeValidateAuditSequence(project, changeId, request, live, "retry");
    case "task.run.reconcile":
      return reconcileTaskRuns(project, { changeId, taskRunId: request.taskRunId });
    case "task.queue.start":
      return runTaskQueueSequence(project, changeId, request, live);
    case "task.queue.reconcile":
      return reconcileWorkflowTaskQueue(project, { changeId, queueRunId: request.queueRunId });
    case "validate.run":
      return startValidationRun(project, { changeId, worktree: request.worktreeId });
    case "audit.run":
      return startAuditRun(project, { changeId, worktreeId: request.worktreeId, prompt: request.prompt });
    case "spec-test.drift":
      return getSpecTestDriftReport(project, { worktreeId: request.worktreeId });
    default:
      return assertNever(request.actionType);
  }
}

function assertWorkflowActionScope(request: WorkbenchWorkflowActionRequest): void {
  assertWorkflowActionRequiredTargets(request);
  const requireOne = (label: string, values: Array<unknown>): void => {
    if (!values.some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))) throw new Error(`${request.actionType} requires ${label}.`);
  };
  switch (request.actionType) {
    case "result.refresh-rework":
    case "result.revalidate":
    case "result.reaudit":
    case "result.refresh-status":
    case "validate.run":
    case "audit.run":
    case "spec-test.drift":
      requireOne("worktreeId", [request.worktreeId]);
      return;
    case "landing.prepare":
    case "landing.review":
    case "landing.refresh":
      requireOne("applyCheckId or worktreeId/worktreeIds", [request.applyCheckId, request.worktreeId, request.worktreeIds]);
      return;
    case "landing-queue.merge-next":
    case "landing-queue.refresh":
      requireOne("landingPackageId", [request.landingPackageId]);
      return;
    default:
      return;
  }
}

const HIGH_IMPACT_WORKBENCH_ACTIONS = new Set(highImpactActions());

async function auditHighImpactWorkflowAction(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<void> {
  if (!HIGH_IMPACT_WORKBENCH_ACTIONS.has(request.actionType)) return;
  const memory = await resolveProjectMemory(project);
  await assertCurrentHighImpactWorkflowTarget(memory, changeId, request);
  const targetId = workflowActionTargetId(request, changeId);
  const scope = workflowActionScopePayload(request, changeId);
  const decision = evaluateToolPolicy({
    actionType: request.actionType,
    actorRoleId: "main-agent",
    changeId,
    conversationId: changeId,
    targetId,
    enforcementMode: "broker-enforced",
  });
  const artifact = await recordToolEventAuditEntry(memory, {
    changeId,
    conversationId: changeId,
    actorRoleId: "main-agent",
    actionType: request.actionType,
    targetId,
    scope,
    decision,
  });
  live?.emit({
    event: "run.status",
    data: {
      actionRunId: decision.id,
      status: decision.status === "denied" || decision.status === "unavailable" ? "failed" : "running",
      label: "ToolPolicyGate",
    },
  });
  if (decision.status === "denied" || decision.status === "unavailable") {
    throw new Error(`${decision.readableMessage} Evidence: ${artifact}`);
  }
}

async function assertCurrentHighImpactWorkflowTarget(memory: ResolvedMemory, changeId: string, request: WorkbenchWorkflowActionRequest): Promise<void> {
  if (request.actionType === "planning.confirm-execution") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.confirm-execution target is stale or missing active Change: ${changeId}.`);
    if (!request.planningBundleId) throw new Error("planning.confirm-execution requires planningBundleId.");
    const bundle = await readLatestPlanningBundle(memory, target.path);
    if (bundle.id !== request.planningBundleId || bundle.status !== "draft" || !existsSync(join(memory.memoryRoot, target.path, "planning", "latest-bundle.json"))) {
      throw new Error("planning.confirm-execution target is stale or no longer confirmable.");
    }
  }
  if (request.actionType === "planning.decomposition.confirm") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.decomposition.confirm target is stale or missing active Change: ${changeId}.`);
    if (!request.decompositionPlanId) throw new Error("planning.decomposition.confirm requires decompositionPlanId.");
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.id !== request.decompositionPlanId || plan.status !== "draft") {
      throw new Error("planning.decomposition.confirm target is stale or no longer confirmable.");
    }
  }
  if (request.actionType === "planning.decomposition.assess-readiness") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.decomposition.assess-readiness target is stale or missing active Change: ${changeId}.`);
    if (!request.decompositionPlanId) throw new Error("planning.decomposition.assess-readiness requires decompositionPlanId.");
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.id !== request.decompositionPlanId || plan.status !== "confirmed") {
      throw new Error("planning.decomposition.assess-readiness target is stale or no longer assessable.");
    }
  }
  if (request.actionType === "planning.taskqueue.propose") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.taskqueue.propose target is stale or missing active Change: ${changeId}.`);
    if (!request.readinessManifestId) throw new Error("planning.taskqueue.propose requires readinessManifestId.");
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== request.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal" || manifest.nextAllowedAction !== "taskqueue.proposal") {
      throw new Error("planning.taskqueue.propose target is stale or no longer proposal-ready.");
    }
  }
  if (request.actionType === "planning.workflowgraph.compile") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.workflowgraph.compile target is stale or missing active Change: ${changeId}.`);
    if (!request.taskQueueProposalId) throw new Error("planning.workflowgraph.compile requires taskQueueProposalId.");
    if (!request.readinessManifestId) throw new Error("planning.workflowgraph.compile requires readinessManifestId.");
    const proposal = await readLatestTaskQueueProposal(memory, target.path);
    if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || !["draft", "confirmed"].includes(proposal.status)) {
      throw new Error("planning.workflowgraph.compile target is stale or no longer compilable.");
    }
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== request.readinessManifestId || manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
      throw new Error("planning.workflowgraph.compile readiness target is stale.");
    }
  }
  if (request.actionType === "planning.taskqueue.confirm-start") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.taskqueue.confirm-start target is stale or missing active Change: ${changeId}.`);
    if (!request.taskQueueProposalId) throw new Error("planning.taskqueue.confirm-start requires taskQueueProposalId.");
    if (!request.workflowGraphPlanId) throw new Error("planning.taskqueue.confirm-start requires workflowGraphPlanId.");
    if (!request.readinessManifestId) throw new Error("planning.taskqueue.confirm-start requires readinessManifestId.");
    if (!request.decompositionPlanId) throw new Error("planning.taskqueue.confirm-start requires decompositionPlanId.");
    const proposal = await readLatestTaskQueueProposal(memory, target.path);
    if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || proposal.status !== "confirmed" || proposal.decompositionPlanId !== request.decompositionPlanId || proposal.readinessManifestId !== request.readinessManifestId) {
      throw new Error("planning.taskqueue.confirm-start target is stale or no longer startable.");
    }
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
      throw new Error("planning.taskqueue.confirm-start readiness target is stale.");
    }
    const graph = await readLatestWorkflowGraphPlan(memory, target.path);
    if (graph.id !== request.workflowGraphPlanId || graph.taskQueueProposalId !== proposal.id || graph.readinessManifestId !== manifest.id || graph.status !== "compiled") {
      throw new Error("planning.taskqueue.confirm-start graph target is stale.");
    }
  }
  if (request.actionType === "code.run" && request.taskIds?.length) {
    assertKnownTaskIds(await getChangeStatusForChange(memory, changeId), request.taskIds, "code.run");
  }
  if (request.actionType === "task.run.start") {
    assertKnownTaskIds(await getChangeStatusForChange(memory, changeId), [requireSingleTaskId(request.taskIds)], "task.run.start");
  }
  if (request.actionType === "task.run.retry") {
    const taskRunId = requireTaskRunId(request.taskRunId);
    const runs = await listTaskRuns(memory, changeId);
    if (!runs.some((run) => run.id === taskRunId)) throw new Error(`task.run.retry target is stale or not scoped to Change ${changeId}.`);
  }
  if (request.actionType === "landing-queue.merge-next") {
    const snapshot = await latestLandingQueueSnapshot(memory);
    const candidate = snapshot?.candidates.find((item) => item.landingPackageId === request.landingPackageId);
    if (!candidate || !candidate.canMerge || !candidate.changeIds.includes(changeId)) {
      throw new Error("landing-queue.merge-next target is stale or not currently mergeable.");
    }
  }
  if (request.actionType === "task.queue.start") {
    const queues = await listTaskQueues(memory, changeId);
    if (request.queueRunId) {
      const queue = queues.find((item) => item.id === request.queueRunId);
      if (!queue || queue.status !== "paused") throw new Error("task.queue.start target is stale or not paused.");
      if (!workflowActionScopesMatchStrict({ ...queue, queueRunId: queue.id }, request)) throw new Error("task.queue.start target scope is stale or incomplete.");
      if (!queue.workflowRunId) throw new Error("task.queue.start target has no WorkflowRun binding.");
      const workflow = await readWorkflowRun(memory, changeId, queue.workflowRunId);
      if (!workflowActionScopesMatchStrict({ ...workflow, workflowRunId: workflow.id }, request)) throw new Error("task.queue.start WorkflowRun scope is stale or incomplete.");
      return;
    }
    if (!request.taskQueueProposalId) throw new Error("task.queue.start requires queueRunId for resume or taskQueueProposalId from planning.taskqueue.confirm-start.");
  }
}

function workflowActionTargetId(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): string {
  return buildWorkflowActionTargetId(request, changeId, result);
}

function workflowActionScopePayload(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): Record<string, unknown> {
  return buildWorkflowActionScopePayload(request, changeId, result);
}

async function generatePlanningDraft(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  revision: boolean,
): Promise<{ bundle: PlanningArtifactBundle }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Planning draft");
  const task = await createAgentTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "planning-agent",
    kind: "foreground",
    summary: revision ? "Revise planning artifact bundle from user feedback." : "Generate planning artifact bundle from the demand conversation.",
    inputArtifacts: [changePath],
    initialStatus: "running",
  });
  await recordMainAgentDecision(memory, {
    changeId,
    recommendedAction: revision ? "planning.revise" : "planning.generate",
    userMessage: revision ? "修改方案草案" : "生成方案草案",
    requiresUserDecision: false,
    createTask: {
      roleId: "planning-agent",
      kind: "foreground",
      summary: task.summary,
      inputArtifacts: task.inputArtifacts,
    },
    reason: "The current demand needs a user-reviewable planning draft before canonical artifacts are written.",
  });
  const role = await resolveAgentRole(memory, "planning-agent");
  const thread = await readThreadLog(memory, changePath);
  const latestUserText = prompt?.trim()
    || [...thread].reverse().find((entry) => entry.type === "user.message")?.text
    || changeId;
  const planningRuntime = await runCodexChat(project, changeId, [
    "作为 planning-agent，请基于当前需求对话生成或修订方案草案。",
    "输出目标、约束、验收标准、实现方案、任务清单、风险和待确认点。",
    "不要修改文件；AHO 会在用户确认执行后再写入 canonical artifacts。",
    "",
    latestUserText,
  ].join("\n")).catch((error: unknown) => {
    emitAssistantEvent(live, {
      runId: changeId,
      kind: "status",
      phase: "planning-runtime-fallback",
      title: "方案草案运行时不可用",
      summary: error instanceof Error ? error.message : String(error),
      isError: true,
    });
    return null;
  });
  const previous = await readLatestPlanningBundle(memory, changePath).catch(() => null);
  const bundle = buildDeterministicPlanningBundle(memory, changePath, changeId, latestUserText, previous, revision);
  await writePlanningBundle(memory, changePath, bundle);
  emitAssistantEvent(live, {
    runId: bundle.id,
    kind: "plan-update",
    phase: "draft",
    title: revision ? "Planning draft revised" : "Planning draft generated",
    summary: "planning-agent produced a proposal/spec/design/tasks bundle for user review.",
    artifactRef: bundle.artifact,
  });
  const planCard: OrchestrationPlanCard = {
    title: "方案草案",
    summary: `目标：${bundle.goal}`,
    steps: [
      { label: "验收标准", description: bundle.acceptanceCriteria.join("；") || "等待补充验收标准。" },
      { label: "实现方案", description: bundle.design },
      { label: "任务清单", description: bundle.tasks.map((task) => `${task.id} ${task.title}`).join("；") || "等待拆解任务。" },
    ],
    warnings: bundle.openQuestions,
  };
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "planning-draft",
    text: [planningRuntime?.message.trim(), renderPlanningBundleSummary(bundle)].filter(Boolean).join("\n\n"),
    runId: planningRuntime?.run.id,
    artifact: planningRuntime?.run.artifacts.lastMessage ?? bundle.artifact,
    planCard,
    blocks: [
      {
        id: `${bundle.id}:prose`,
        runId: planningRuntime?.run.id ?? bundle.id,
        sequence: 1,
        kind: "prose",
        timestamp: new Date().toISOString(),
        source: planningRuntime ? "codex" : "aho",
        title: revision ? "方案草案已更新" : "方案草案",
        text: [planningRuntime?.message.trim(), renderPlanningBundleSummary(bundle)].filter(Boolean).join("\n\n"),
      },
      {
        id: `${bundle.id}:plan-card`,
        runId: bundle.id,
        sequence: 2,
        kind: "plan-card",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "方案草案",
        planCard,
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: assistant });
  await recordWorkbenchDecision(project, {
    id: `planning:${bundle.id}`,
    changeId,
    decisionType: revision ? "planning.revise" : "planning.generate",
    status: "completed",
    label: revision ? "方案草案已更新" : "方案草案已生成",
    summary: "planning-agent generated a draft bundle. It is not canonical until confirmation.",
    targetId: bundle.id,
    runId: null,
    artifact: bundle.artifact,
    actionId: revision ? "planning.revise" : "planning.generate",
    payload: { role: buildRunAgentRecord(role), bundle },
    completedAt: new Date().toISOString(),
  });
  await completeAgentTask(memory, task, {
    status: "completed",
    summary: revision ? "Planning draft revised for user review." : "Planning draft generated for user review.",
    artifactRefs: [bundle.artifact, ...(planningRuntime?.run.artifacts.lastMessage ? [planningRuntime.run.artifacts.lastMessage] : [])],
    nextRecommendation: "Ask the user to confirm execution or request changes.",
  });
  return { bundle };
}

async function confirmPlanningAndStartPipeline(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Confirm planning execution");
  const bundle = await readLatestPlanningBundle(memory, changePath);
  if (!request.planningBundleId) throw new Error("planning.confirm-execution requires planningBundleId.");
  if (bundle.id !== request.planningBundleId || bundle.status !== "draft") throw new Error("planning.confirm-execution target is stale or no longer confirmable.");
  const changeDir = join(memory.memoryRoot, changePath);
  await writeFile(join(changeDir, "spec.md"), bundle.specMd, "utf8");
  await writeFile(join(changeDir, "plan.md"), bundle.planMd, "utf8");
  await writeFile(join(changeDir, "tasks.md"), bundle.tasksMd, "utf8");
  const acMap = buildAcMap({
    changeId,
    specContent: bundle.specMd,
    tasksContent: bundle.tasksMd,
    placeholderFiles: [
      { path: "spec.md", content: bundle.specMd },
      { path: "plan.md", content: bundle.planMd },
      { path: "tasks.md", content: bundle.tasksMd },
    ],
  });
  await writeJsonFile(join(changeDir, "ac-map.json"), acMap);
  const confirmed = { ...bundle, status: "confirmed" as const, acMapCandidate: acMap, updatedAt: new Date().toISOString() };
  await writePlanningBundle(memory, changePath, confirmed);
  await recordMainAgentDecision(memory, {
    changeId,
    recommendedAction: "planning.confirm-execution",
    userMessage: "确认执行",
    requiresUserDecision: false,
    createTask: {
      roleId: "main-agent",
      kind: "foreground",
      summary: "Canonical planning artifacts were accepted; execution requires decomposition and readiness gates.",
      inputArtifacts: [confirmed.artifact],
    },
    reason: "The user confirmed the planning artifact bundle; Phase 7J requires typed readiness before code-producing execution.",
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "planning-confirmed",
    text: "已确认规划：方案草案已写入内部 spec/plan/tasks/ac-map。下一步需要生成或确认 DecompositionPlan，并通过 readiness gate 后才能启动执行。",
    artifact: confirmed.artifact,
  });
  emitAssistantEvent(live, {
    runId: confirmed.id,
    kind: "status",
    phase: "confirmed",
    title: "Planning confirmed",
    summary: "Canonical planning artifacts were written after user confirmation.",
    artifactRef: confirmed.artifact,
  });
  return { bundle: confirmed, executionStarted: false };
}

async function generateDecompositionPlan(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<{ plan: DecompositionPlan }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Generate decomposition plan");
  const bundle = await readLatestPlanningBundle(memory, changePath).catch(() => null);
  const thread = await readThreadLog(memory, changePath);
  const plan = buildDeterministicDecompositionPlan(memory, changePath, changeId, bundle, thread, prompt);
  await writeDecompositionPlan(memory, changePath, plan);
  const planCard: OrchestrationPlanCard = {
    title: "拆分评估",
    summary: decompositionRecommendationLabel(plan.recommendation),
    steps: [
      { label: "建议", description: plan.rationale },
      { label: "执行单元", description: plan.units.map((unit) => `${unit.id} ${unit.title}`).join("；") || "无需拆分。" },
      { label: "恢复边界", description: plan.recoveryKeyInputs.notes.join("；") },
    ],
    warnings: [...plan.openQuestions, plan.riskSummary].filter(Boolean),
  };
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "decomposition-draft",
    text: renderDecompositionPlanSummary(plan),
    artifact: plan.artifact,
    planCard,
    blocks: [
      {
        id: `${plan.id}:plan-card`,
        runId: plan.id,
        sequence: 1,
        kind: "plan-card",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "拆分评估",
        planCard,
        artifactRef: plan.artifact,
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: plan.id,
    kind: "plan-update",
    phase: "decomposition-draft",
    title: "DecompositionPlan drafted",
    summary: "Main-agent proposal was recorded for user review. It does not start execution.",
    artifactRef: plan.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `decomposition:${plan.id}`,
    changeId,
    decisionType: "planning.decompose",
    status: "completed",
    label: "拆分评估已生成",
    summary: "Generated a proposal-only DecompositionPlan. No execution artifacts were created.",
    targetId: plan.id,
    runId: null,
    artifact: plan.artifact,
    actionId: "planning.decompose",
    payload: { plan },
    completedAt: new Date().toISOString(),
  });
  return { plan };
}

async function confirmDecompositionPlan(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ plan: DecompositionPlan; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Confirm decomposition plan");
  if (!request.decompositionPlanId) throw new Error("planning.decomposition.confirm requires decompositionPlanId.");
  const plan = await readLatestDecompositionPlan(memory, changePath);
  if (plan.id !== request.decompositionPlanId || plan.status !== "draft") {
    throw new Error("planning.decomposition.confirm target is stale or no longer confirmable.");
  }
  const confirmed: DecompositionPlan = { ...plan, status: "confirmed", updatedAt: new Date().toISOString() };
  await writeDecompositionPlan(memory, changePath, confirmed);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "decomposition-confirmed",
    text: "已确认拆分方向：本阶段只记录 DecompositionPlan 接受，不会创建子 Change、TaskRun、AgentTask 或启动执行。",
    artifact: confirmed.artifact,
  });
  emitAssistantEvent(live, {
    runId: confirmed.id,
    kind: "status",
    phase: "decomposition-confirmed",
    title: "DecompositionPlan confirmed",
    summary: "Proposal acceptance was recorded without starting execution.",
    artifactRef: confirmed.artifact,
  });
  return { plan: confirmed, executionStarted: false };
}

async function assessDecompositionReadiness(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ manifest: DecompositionReadinessManifest; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Assess decomposition readiness");
  if (!request.decompositionPlanId) throw new Error("planning.decomposition.assess-readiness requires decompositionPlanId.");
  const plan = await readLatestDecompositionPlan(memory, changePath);
  if (plan.id !== request.decompositionPlanId || plan.status !== "confirmed") {
    throw new Error("planning.decomposition.assess-readiness target is stale or no longer assessable.");
  }
  const manifest = await buildDecompositionReadinessManifest(memory, changePath, changeId, plan);
  await writeDecompositionReadinessManifest(memory, changePath, manifest);
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "decomposition-readiness",
    text: renderDecompositionReadinessSummary(manifest),
    artifact: manifest.artifact,
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: manifest.id,
    kind: "status",
    phase: "decomposition-readiness",
    title: "Decomposition readiness assessed",
    summary: "Confirmed DecompositionPlan was checked against execution guardrails. No execution artifacts were created.",
    artifactRef: manifest.artifact,
  });
  return { manifest, executionStarted: false };
}

async function proposeTaskQueue(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ proposal: TaskQueueProposal; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "TaskQueueProposal generation");
  if (!request.readinessManifestId) throw new Error("planning.taskqueue.propose requires readinessManifestId.");
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== request.readinessManifestId || manifest.changeId !== changeId) {
    throw new Error("planning.taskqueue.propose target is stale or not scoped to the selected Change.");
  }
  await supersedeExistingTaskQueueProposal(memory, changePath);
  const proposal = await buildTaskQueueProposalFromReadiness(memory, changePath, changeId, manifest);
  await writeTaskQueueProposal(memory, changePath, proposal);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "taskqueue-proposal",
    text: renderTaskQueueProposalMarkdown(proposal),
    artifact: proposal.artifact,
  });
  emitAssistantEvent(live, {
    runId: proposal.id,
    kind: "status",
    phase: "taskqueue-proposal",
    title: "TaskQueue proposal prepared",
    summary: "A typed TaskQueueProposal was generated; no execution records were created.",
    artifactRef: proposal.artifact,
  });
  return { proposal, executionStarted: false };
}

async function compileTaskQueueWorkflowGraph(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ graph: WorkflowGraphPlan; executionStarted: false }> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "WorkflowGraphPlan compile");
  if (!request.taskQueueProposalId) throw new Error("planning.workflowgraph.compile requires taskQueueProposalId.");
  if (!request.readinessManifestId) throw new Error("planning.workflowgraph.compile requires readinessManifestId.");
  const proposal = await readLatestTaskQueueProposal(memory, changePath);
  if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || !["draft", "confirmed"].includes(proposal.status)) {
    throw new Error("planning.workflowgraph.compile target is stale or no longer compilable.");
  }
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== request.readinessManifestId || manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
    throw new Error("planning.workflowgraph.compile readiness target is stale.");
  }
  const expectedSourceHashes = await hashArtifactRefs(memory, proposal.artifactRefs);
  for (const [artifact, hash] of Object.entries(expectedSourceHashes)) {
    if (proposal.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`WorkflowGraphPlan compile source artifact hash mismatch: ${artifact}.`);
    }
  }
  const confirmed = proposal.status === "confirmed"
    ? proposal
    : { ...proposal, status: "confirmed" as const, updatedAt: new Date().toISOString() };
  if (proposal.status !== "confirmed") await writeTaskQueueProposal(memory, changePath, confirmed);
  const graph = await compileWorkflowGraphPlan(memory, changePath, confirmed, manifest);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "workflowgraph-compiled",
    text: `WorkflowGraphPlan ${graph.id} compiled from TaskQueueProposal ${confirmed.id}. No execution records were created.`,
    artifact: graph.artifact,
  });
  emitAssistantEvent(live, {
    runId: graph.id,
    kind: "file-change",
    phase: "workflowgraph-compiled",
    title: "WorkflowGraphPlan compiled",
    summary: "A versioned typed workflow graph was generated; no TaskQueue or WorkflowRun was started.",
    artifactRef: graph.artifact,
  });
  return { graph, executionStarted: false };
}

async function confirmTaskQueueProposalAndStart(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "TaskQueueProposal start");
  if (!request.taskQueueProposalId) throw new Error("planning.taskqueue.confirm-start requires taskQueueProposalId.");
  if (!request.workflowGraphPlanId) throw new Error("planning.taskqueue.confirm-start requires workflowGraphPlanId.");
  if (!request.readinessManifestId) throw new Error("planning.taskqueue.confirm-start requires readinessManifestId.");
  if (!request.decompositionPlanId) throw new Error("planning.taskqueue.confirm-start requires decompositionPlanId.");
  const proposal = await readLatestTaskQueueProposal(memory, changePath);
  if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || proposal.status !== "confirmed" || proposal.decompositionPlanId !== request.decompositionPlanId || proposal.readinessManifestId !== request.readinessManifestId) {
    throw new Error("planning.taskqueue.confirm-start target is stale or no longer startable.");
  }
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
    throw new Error("planning.taskqueue.confirm-start readiness target is stale.");
  }
  const graph = await readWorkflowGraphPlan(memory, changePath, request.workflowGraphPlanId);
  if (graph.status !== "compiled" || graph.changeId !== changeId || graph.taskQueueProposalId !== proposal.id || graph.readinessManifestId !== manifest.id) {
    throw new Error("planning.taskqueue.confirm-start graph target is stale.");
  }
  const latestGraph = await readLatestWorkflowGraphPlan(memory, changePath);
  if (latestGraph.id !== graph.id) throw new Error("planning.taskqueue.confirm-start requires the latest matching WorkflowGraphPlan.");
  const validated = await validateWorkflowTaskQueueProposalStart(memory, project, changeId, proposal.id, graph.id);
  const workflow = await createWorkflowRunForValidatedTaskQueue(memory, project, validated);
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "taskqueue-starting",
    text: `WorkflowGraphPlan ${graph.id} confirmed for start; starting scoped sequential TaskQueue through WorkflowRun ${workflow.id}.`,
    artifact: graph.artifact,
  });
  const result = await runTaskQueueSequence(project, changeId, {
    ...request,
    actionType: "task.queue.start",
    taskQueueProposalId: proposal.id,
    workflowGraphPlanId: graph.id,
    readinessManifestId: manifest.id,
    decompositionPlanId: proposal.decompositionPlanId,
    workflowRunId: workflow.id,
  }, live);
  return result;
}

async function enqueueDemandWorkerForAction(project: ManagedProject, changeId: string): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker enqueue");
  return enqueueDemandWorker(memory, { changeId, waitingReason: "用户请求加入本地处理队列。" });
}

async function prepareLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const pkg = await prepareLandingPackage(project, { worktreeId: request.worktreeId, applyCheckId: request.applyCheckId });
  const reviewed = await reviewLandingPackage(project, pkg.id);
  const text = [
    "已完成提交/PR 前检查。",
    reviewed.review?.summary ?? reviewed.summary,
    "",
    reviewed.review?.riskSummary ?? reviewed.riskSummary,
  ].filter(Boolean).join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-readiness",
    text,
    artifact: reviewed.artifactRefs[1] ?? reviewed.artifactRefs[0],
    blocks: [
      {
        id: `${reviewed.id}:landing-prose`,
        runId: reviewed.id,
        sequence: 1,
        kind: "prose",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "提交/PR 前检查",
        text,
      },
      {
        id: `${reviewed.id}:landing-result`,
        runId: reviewed.id,
        sequence: 2,
        kind: "tool-result",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: reviewed.review?.verdict === "ready" ? "落地检查通过" : "落地检查需要处理",
        text: reviewed.review?.suggestedNextAction ?? "请查看证据后决定下一步。",
        artifactRef: reviewed.review ? reviewed.artifactRefs.find((ref) => ref.endsWith("merge-review.md")) : reviewed.artifactRefs[0],
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: entry });
  emitAssistantEvent(live, {
    runId: reviewed.id,
    kind: "tool-result",
    phase: "landing-readiness",
    title: "Landing readiness reviewed",
    summary: reviewed.review?.summary ?? reviewed.summary,
    artifactRef: reviewed.artifactRefs[0],
  });
  return { package: reviewed };
}

async function reviewLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("landing.review requires landingPackageId.");
  const reviewed = await reviewLandingPackage(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-review",
    text: reviewed.review?.summary ?? reviewed.summary,
    artifact: reviewed.artifactRefs.find((ref) => ref.endsWith("merge-review.md")) ?? reviewed.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: reviewed };
}

async function preparePrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-draft.prepare requires landingPackageId.");
  const pkg = await preparePrDraftPackage(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-prepared",
    text: `PR 草稿材料已准备好。这不会 push、创建 PR 或 merge。\n\n证据：${pkg.bodyArtifact}`,
    artifact: pkg.bodyArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: pkg };
}

async function createPrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-draft.create requires landingPackageId.");
  const pkg = await createDraftPr(project, request.landingPackageId);
  const text = [
    "已创建或更新 Draft PR。",
    "",
    `PR: ${pkg.prUrl ?? "unknown"}`,
    `Branch: ${pkg.branchName}`,
    "",
    "这是远端协作草稿，不会自动 merge 或 land。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-created",
    text,
    artifact: pkg.bodyArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: pkg };
}

async function refreshPrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-draft.refresh requires landingPackageId.");
  const pkg = await refreshPrDraftStatus(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-refreshed",
    text: pkg.prUrl ? `Draft PR 状态已刷新：${pkg.prUrl}` : "Draft PR 状态已刷新；还没有可用 PR URL。",
    artifact: pkg.packageArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { package: pkg };
}

async function refreshPrFeedbackForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-feedback.refresh requires landingPackageId.");
  const feedback = await refreshPrFeedback(project, request.landingPackageId);
  const text = [
    "已读取 Draft PR 远端反馈。",
    "",
    feedback.summary.summary,
    "",
    feedback.summary.actionable
      ? "主 agent 判断：这些反馈需要在同一需求中重新处理。"
      : "主 agent 判断：当前没有必须自动修改的远端反馈。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-feedback-refreshed",
    text,
    artifact: feedback.summary.evidenceRefs[0],
    blocks: [
      {
        id: `${feedback.snapshot.id}:pr-feedback-prose`,
        runId: feedback.snapshot.id,
        sequence: 1,
        kind: "prose",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: "PR 反馈",
        text,
      },
      {
        id: `${feedback.snapshot.id}:pr-feedback-result`,
        runId: feedback.snapshot.id,
        sequence: 2,
        kind: "tool-result",
        timestamp: new Date().toISOString(),
        source: "aho",
        title: feedback.summary.actionable ? "需要修改" : "暂无必须修改项",
        text: feedback.summary.recommendedAction,
        artifactRef: feedback.summary.evidenceRefs[0],
      },
    ],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return feedback;
}

async function reworkPrFeedbackForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-feedback.rework requires landingPackageId.");
  const memory = await resolveProjectMemory(project);
  const started = await startPrFeedbackReworkAttempt(project, request.landingPackageId, request.prompt);
  const intro = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-feedback-rework-started",
    text: [
      "已根据 PR 反馈创建同一需求的修改任务。",
      "",
      started.feedback.summary.summary,
      "",
      "接下来主 agent 会按证据继续委派 rework-coder、validator、auditor；通过后还需要重新做落地检查，再由你确认是否更新 Draft PR。",
    ].join("\n"),
    artifact: started.feedback.summary.evidenceRefs[0],
  });
  live?.emit({ event: "assistant.message", data: intro });
  const workflow = await runCodeValidateAuditSequence(project, changeId, started.prompt, live, undefined, undefined, "rework-coder");
  const artifactRefs = compactArtifactRefs(
    ...(isRecord(workflow) && isRecord(workflow.code) && isRecord(workflow.code.run) && isRecord(workflow.code.run.artifacts) && typeof workflow.code.run.artifacts.directory === "string"
      ? [workflow.code.run.artifacts.directory]
      : []),
  );
  const failed = isRecord(workflow) && typeof workflow.stoppedAt === "string" && workflow.stoppedAt;
  await completePrFeedbackReworkAttempt(memory, started.attempt, failed ? "failed" : "completed", artifactRefs);
  await completeAgentTask(memory, started.task, {
    status: failed ? "failed" : "completed",
    summary: failed ? "PR feedback rework needs more attention." : "PR feedback rework completed through main-agent role orchestration.",
    artifactRefs: [...started.feedback.summary.evidenceRefs, ...artifactRefs],
    nextRecommendation: failed ? "Return to the main conversation for next instructions." : "Prepare a new landing review before updating the Draft PR.",
    ...(failed ? { failureClassification: "pr-feedback-rework-failed", requiresUserInputReason: "Main-agent role orchestration did not complete after PR feedback rework." } : {}),
  });
  return { attempt: started.attempt, task: started.task, workflow };
}

async function updatePrDraftForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-feedback.update-draft requires landingPackageId.");
  const result = await updatePrDraftFromFeedback(project, request.landingPackageId);
  const text = [
    "已更新同一个 Draft PR 分支。",
    "",
    `PR: ${result.package.prUrl ?? "unknown"}`,
    `Branch: ${result.package.branchName}`,
    "",
    "这只是更新 Draft PR，不会 merge、land、标记 ready for review 或归档需求。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-draft-updated",
    text,
    artifact: result.revision.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function preparePrReviewForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.prepare requires landingPackageId.");
  const readiness = await preparePrReviewReadiness(project, request.landingPackageId);
  const text = [
    readiness.summary,
    "",
    readiness.reason,
    "",
    readiness.canSubmit
      ? "右侧可以提交人工评审；这不会 merge、land 或启用自动合并。"
      : "当前不能提交人工评审，请先处理上面的原因。",
    readiness.prUrl ? `\nPR: ${readiness.prUrl}` : "",
  ].filter(Boolean).join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-readiness",
    text,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function submitPrReviewForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.submit requires landingPackageId.");
  const result = await submitPrForHumanReview(project, request.landingPackageId);
  const text = [
    "Draft PR 已提交人工评审。",
    "",
    result.handoff.prUrl ? `PR: ${result.handoff.prUrl}` : "PR: unknown",
    "",
    "当前需求进入等待远端评审状态。后续反馈仍通过“检查 PR 反馈”回到同一需求对话处理。",
    "这不会 merge、land、push main、启用自动合并或归档需求。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-submitted",
    text,
    artifact: result.handoff.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function refreshPrReviewForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.refresh requires landingPackageId.");
  const readiness = await refreshPrReviewState(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-refreshed",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function preparePrReviewReplyForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.reply-prepare requires landingPackageId.");
  const draft = await preparePrReviewReplyDraft(project, request.landingPackageId, { changeId, message: request.prompt });
  const text = [
    "已准备评审回复草稿。",
    "",
    draft.body,
    "",
    draft.canResolveThread
      ? "右侧可以确认回复评审；如果 provider 支持，也可以标记对应 thread 已处理。"
      : "右侧可以确认回复评审；当前 provider 没有可用的 thread resolve 能力。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-reply-draft",
    text,
    artifact: draft.artifactRef,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { draft };
}

async function submitPrReviewReplyForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.reply-submit requires landingPackageId.");
  const result = await submitPrReviewReply(project, request.landingPackageId);
  const text = [
    "已回复 PR 评审反馈。",
    "",
    "这只是提交回复，不会 merge、land、push main、归档需求或标记自动合并。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-reply-submitted",
    text,
    artifact: result.handoff.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function resolvePrReviewThreadForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("pr-review.thread-resolve requires landingPackageId.");
  const result = await resolvePrReviewThread(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "pr-review-thread-resolved",
    text: "已标记评审 thread 为已处理。此操作不会 merge、land、push main 或归档需求。",
    artifact: result.resolution.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function prepareLandingQueueForAction(
  project: ManagedProject,
  changeId: string,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const snapshot = await prepareLandingQueue(project);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-queue-prepared",
    text: `${snapshot.summary}\n\n右侧会只显示当前需要确认的 PR 合并动作；不会自动合并全部。`,
    artifact: snapshot.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { snapshot };
}

async function refreshLandingQueueForAction(
  project: ManagedProject,
  changeId: string,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const snapshot = await refreshLandingQueue(project);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "landing-queue-refreshed",
    text: `${snapshot.summary}\n\n我已经重新检查队列。每次合并前仍会再次刷新选中的 PR。`,
    artifact: snapshot.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { snapshot };
}

async function mergeNextLandingQueueForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const result = await mergeNextLandingQueueCandidate(project, request.landingPackageId);
  const text = [
    result.result.summary,
    "",
    result.after
      ? `剩余队列已刷新：${result.after.readyCount} 个可合并，${result.after.needsAttentionCount} 个需要先处理。`
      : "当前没有执行远端合并。",
    "",
    "每个 PR 仍需要单独确认；AHO 不会自动合并剩余 PR。",
  ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "merged" ? "landing-queue-merged-one" : "landing-queue-not-merged",
    text,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function prepareRemoteLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("remote-landing.prepare requires landingPackageId.");
  const readiness = await prepareRemoteLandingReadiness(project, request.landingPackageId);
  const text = [
    readiness.summary,
    "",
    readiness.reason,
    "",
    readiness.canMerge
      ? "右侧可以确认合并 PR。确认后会执行远端 squash merge，但不会同步本地源码。"
      : "当前不能合并 PR；请先处理上面的原因。",
    readiness.prUrl ? `\nPR: ${readiness.prUrl}` : "",
  ].filter(Boolean).join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "remote-landing-readiness",
    text,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function mergeRemoteLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("remote-landing.merge requires landingPackageId.");
  const result = await mergeRemoteLanding(project, request.landingPackageId);
  const text = result.result.status === "merged"
    ? [
      "PR 已在远端合并。",
      "",
      result.result.prUrl ? `PR: ${result.result.prUrl}` : "PR: unknown",
      result.result.mergeCommit ? `Merge commit: ${result.result.mergeCommit}` : "",
      "",
      "远端代码现在是稳定边界；本地项目不会自动同步。后台已记录本次合并的需求记忆 closeout 和维护账本。",
    ].filter(Boolean).join("\n")
    : [
      "PR 远端合并失败。",
      "",
      result.result.failureReason ?? "未提供失败原因。",
      "",
      "AHO 只记录失败证据，不会自动修复、合并或改写稳定记忆。",
    ].join("\n");
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "merged" ? "remote-landing-merged" : "remote-landing-failed",
    text,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function refreshRemoteLandingForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("remote-landing.refresh requires landingPackageId.");
  const readiness = await refreshRemoteLanding(project, request.landingPackageId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "remote-landing-refreshed",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function preparePostMergeForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.prepare requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.prepare requires remoteLandingResultId.");
  const handoff = await preparePostMergeHandoff(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "post-merge-prepared",
    text: [
      handoff.summary,
      "",
      handoff.localStatusSummary,
      "",
      handoff.cleanupSummary,
      "",
      "本地同步和远端分支清理是合并后的可选维护动作，不影响这个需求已合并的状态。",
    ].join("\n"),
    artifact: handoff.summaryArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { handoff };
}

async function prepareLocalSyncForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.sync-local.prepare requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.sync-local.prepare requires remoteLandingResultId.");
  const readiness = await prepareLocalSync(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "post-merge-local-sync-readiness",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.readinessArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function syncLocalForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.sync-local.run requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.sync-local.run requires remoteLandingResultId.");
  const result = await syncLocalAfterMerge(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "synced" ? "post-merge-local-synced" : "post-merge-local-sync-skipped",
    text: result.result.status === "synced"
      ? "本地项目已通过 fast-forward 同步到远端合并后的 base branch。AHO 没有 checkout、stash、reset、rebase 或创建 merge commit。"
      : `${result.readiness.summary}\n\n${result.result.failureReason ?? result.readiness.reason}`,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function prepareRemoteBranchCleanupForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.cleanup-branch.prepare requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.cleanup-branch.prepare requires remoteLandingResultId.");
  const readiness = await prepareRemoteBranchCleanup(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "post-merge-branch-cleanup-readiness",
    text: `${readiness.summary}\n\n${readiness.reason}`,
    artifact: readiness.readinessArtifact,
  });
  live?.emit({ event: "assistant.message", data: entry });
  return { readiness };
}

async function cleanupRemoteBranchForAction(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  if (!request.landingPackageId) throw new Error("post-merge.cleanup-branch.run requires landingPackageId.");
  if (!request.remoteLandingResultId) throw new Error("post-merge.cleanup-branch.run requires remoteLandingResultId.");
  const result = await cleanupRemoteBranchAfterMerge(project, request.landingPackageId, request.remoteLandingResultId);
  const entry = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "deleted" ? "post-merge-branch-cleaned" : "post-merge-branch-cleanup-skipped",
    text: result.result.status === "deleted"
      ? "远端 PR 分支已清理。本地分支没有被删除。"
      : `${result.readiness.summary}\n\n${result.result.failureReason ?? result.readiness.reason}`,
    artifact: result.result.artifactRefs[0],
  });
  live?.emit({ event: "assistant.message", data: entry });
  return result;
}

async function startNextDemandWorkerForAction(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  return startDemandWorkerForChange(project, changeId, prompt, live);
}

async function pumpDemandWorkersForAction(
  project: ManagedProject,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  liveChangeId?: string,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker pump");
  const claimed = await claimAvailableDemandWorkers(memory);
  if (claimed.length === 0) {
    if (liveChangeId) {
      const worker = await getDemandWorkerForChange(memory, liveChangeId);
      if (worker && worker.status === "queued") {
        await recordMainOrchestratorDecision(memory, {
          changeId: liveChangeId,
          workerId: worker.id,
          action: "enqueue",
          summary: "Demand is waiting for a local worker slot.",
          reason: "No demand worker slot is currently available.",
          artifactRefs: [],
        });
        return { status: "queued", claimed: 0, worker, results: [] };
      }
    }
    return { status: "idle", claimed: 0, results: [] };
  }
  const liveClaim = liveChangeId ? claimed.find((claim) => claim.worker.changeId === liveChangeId) : undefined;
  const backgroundClaims = claimed.filter((claim) => claim !== liveClaim);
  for (const claim of backgroundClaims) {
    scheduleClaimedDemandWorker(project, memory, claim);
  }
  if (!liveClaim) {
    if (liveChangeId) {
      const worker = await getDemandWorkerForChange(memory, liveChangeId);
      if (worker && worker.status === "queued") {
        await recordMainOrchestratorDecision(memory, {
          changeId: liveChangeId,
          workerId: worker.id,
          action: "enqueue",
          summary: "Demand is waiting for a local worker slot.",
          reason: "Available demand worker slots were assigned to earlier queued demands.",
          artifactRefs: [],
        });
        return { status: "queued", claimed: claimed.length, backgroundStarted: backgroundClaims.length, worker, results: [] };
      }
    }
    return { status: "pumped", claimed: claimed.length, backgroundStarted: backgroundClaims.length, results: [] };
  }
  try {
    const result = await runClaimedDemandWorker(project, memory, liveClaim, prompt, live);
    return { status: "pumped", claimed: claimed.length, backgroundStarted: backgroundClaims.length, results: [result] };
  } catch (error) {
    return {
      status: "pumped",
      claimed: claimed.length,
      backgroundStarted: backgroundClaims.length,
      results: [{
        status: "failed",
        worker: liveClaim.worker,
        attempt: liveClaim.attempt,
        error: error instanceof Error ? error.message : String(error),
      }],
    };
  }
}

async function evaluateDemandOrchestrator(project: ManagedProject, changeId: string): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  const worker = await getDemandWorkerForChange(memory, changeId);
  const decisions = (await reconcileDemandWorkers(memory)).decisions.filter((decision) => decision.changeId === changeId);
  return { worker, decisions };
}

async function releaseDemandWorkerForAction(project: ManagedProject, changeId: string, reason: string | undefined): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker release");
  return releaseDemandWorker(memory, changeId, reason?.trim() || "Demand worker released by user action.");
}

async function startDemandWorkerForChange(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Demand worker start");
  const claimed = await claimNextDemandWorker(memory, { changeId });
  if (!claimed) {
    const worker = await getDemandWorkerForChange(memory, changeId);
    await recordMainOrchestratorDecision(memory, {
      changeId,
      workerId: worker?.id,
      action: "enqueue",
      summary: "Demand is waiting for a local worker slot.",
      reason: "No demand worker slot is currently available.",
      artifactRefs: [],
    });
    return { status: "queued", worker };
  }
  return runClaimedDemandWorker(project, memory, claimed, prompt, live);
}

async function runClaimedDemandWorker(
  project: ManagedProject,
  memory: ResolvedMemory,
  claimed: NonNullable<Awaited<ReturnType<typeof claimNextDemandWorker>>>,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const changeId = claimed.worker.changeId;
  const running = await markDemandWorkerRunning(memory, claimed.worker, claimed.attempt);
  emitAssistantEvent(live, {
    runId: running.worker.id,
    kind: "status",
    phase: "demand-worker-running",
    title: "Demand worker started",
    summary: "本地主 orchestrator 已领取该需求，开始 main-agent tool orchestration。",
  });
  try {
    if (!await hasConfirmedPlanningArtifacts(project, changeId)) {
      const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
        status: "needs-user-input",
        resultStatus: "needs-user-input",
        summary: "Demand execution needs confirmed planning artifacts before role agents can run.",
        failureReason: "The demand worker was queued without confirmed spec, plan, tasks, and AC map artifacts.",
      });
      scheduleDemandWorkerPump(project);
      return { status: completed.worker.status, worker: completed.worker, attempt: completed.attempt, decision: completed.decision };
    }
    const beforeTasks = await listAgentTasks(memory, changeId).catch(() => []);
    const result = await runMainAgentToolOrchestration(project, changeId, prompt, live, false);
    const afterTasks = await listAgentTasks(memory, changeId).catch(() => []);
    const beforeTaskIds = new Set(beforeTasks.map((task) => task.id));
    const newAgentTaskIds = afterTasks.filter((task) => !beforeTaskIds.has(task.id)).map((task) => task.id);
    const status = workerStatusFromPipelineResult(result);
    const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
      status,
      resultStatus: isRecord(result) && typeof result.status === "string" ? result.status : status,
      summary: summarizePipelineResult(result),
      failureReason: status === "needs-user-input" || status === "failed" ? summarizePipelineResult(result) : undefined,
      agentTaskIds: newAgentTaskIds,
    });
    scheduleDemandWorkerPump(project);
    return { status: completed.worker.status, worker: completed.worker, attempt: completed.attempt, rolePipeline: result, decision: completed.decision };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const completed = await completeDemandWorkerAttempt(memory, running.worker, running.attempt, {
      status: "failed",
      resultStatus: "failed",
      summary: `Main-agent tool orchestration failed: ${message}`,
      failureReason: message,
    });
    scheduleDemandWorkerPump(project);
    throw Object.assign(error instanceof Error ? error : new Error(message), { demandWorker: completed.worker.id });
  }
}

async function hasConfirmedPlanningArtifacts(project: ManagedProject, changeId: string): Promise<boolean> {
  try {
    const { memory, changePath } = await resolveTopic(project, changeId);
    const changeDir = join(memory.memoryRoot, changePath);
    if (!existsSync(join(changeDir, "ac-map.json"))) return false;
    for (const file of ["spec.md", "plan.md", "tasks.md"]) {
      const path = join(changeDir, file);
      if (!existsSync(path)) return false;
      const content = await readFile(path, "utf8");
      if (hasUnresolvedPlanningPlaceholder(content)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hasUnresolvedPlanningPlaceholder(content: string): boolean {
  return /(^|\n)\s*(?:-\s*)?(?:\[[ xX]\]\s*)?TBD\s*(?=\n|$)/.test(content);
}

function scheduleClaimedDemandWorker(
  project: ManagedProject,
  memory: ResolvedMemory,
  claimed: NonNullable<Awaited<ReturnType<typeof claimNextDemandWorker>>>,
): void {
  setTimeout(() => {
    void runClaimedDemandWorker(project, memory, claimed, undefined, undefined).catch(() => undefined);
  }, 0);
}

function scheduleDemandWorkerPump(project: ManagedProject): void {
  setTimeout(() => {
    void pumpDemandWorkersForAction(project, undefined, undefined).catch(() => undefined);
  }, 0);
}

function workerStatusFromPipelineResult(result: unknown): "result-ready" | "needs-user-input" | "failed" {
  if (!isRecord(result)) return "result-ready";
  if (result.status === "failed") return "failed";
  if (result.status === "needs-user-input" || result.requiresUserInput) return "needs-user-input";
  return "result-ready";
}

function summarizePipelineResult(result: unknown): string {
  if (!isRecord(result)) return "Main-agent tool orchestration completed and produced result review evidence.";
  if (typeof result.status === "string") {
    if (result.status === "completed") return "Main-agent tool orchestration completed and produced result review evidence.";
    if (result.status === "needs-user-input") return `Main-agent tool orchestration needs user input${typeof result.stoppedAt === "string" ? ` after ${result.stoppedAt}` : ""}.`;
    if (result.status === "failed") return "Main-agent tool orchestration failed before result review.";
  }
  return "Main-agent tool orchestration finished with recorded evidence.";
}

async function runMainAgentToolOrchestration(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  continuation: boolean,
  taskIds?: string[],
  readinessManifestId?: string,
): Promise<unknown> {
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "status",
    phase: "main-agent-tool-orchestration",
    title: continuation ? "Main-agent orchestration continued" : "Main-agent orchestration started",
    summary: "主 agent 将按当前证据逐步委派角色任务；每一步都经过 ToolPolicyGate、RoleDispatcher 和 AgentTaskResult。",
  });
  let orchestration = createMainAgentOrchestrationState({ changeId });
  const firstDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(firstDecision, "coder-agent");
  const first = await runCodeValidateAuditSequence(project, changeId, prompt, live, taskIds, undefined, firstDecision.roleId, orchestration, firstDecision, readinessManifestId ? { mode: "single-change-readiness", readinessManifestId } : undefined);
  orchestration = readWorkflowOrchestration(first, orchestration);
  const next = decideNextMainAgentOrchestration(orchestration);
  if (next.kind === "completed") {
    return { status: "completed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, orchestration };
  }
  if (next.kind === "failed") {
    return { status: "failed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  if (next.kind === "needs-user-input") {
    return { status: "needs-user-input", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true, stoppedAt: next.stoppedAt, orchestration };
  }
  assertDelegateDecision(next, "rework-coder");
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "status",
    phase: "automatic-rework",
    title: "Automatic rework started",
    summary: `${next.reason} AHO is sending the evidence back to rework-coder once.`,
    isError: true,
  });
  const reworkPrompt = [
    "Use the failed official validation/audit evidence from the previous attempt.",
    "Repair only the accepted demand in the assigned worktree.",
    "Do not change canonical planning artifacts.",
    prompt ?? "",
  ].join("\n\n");
  const second = await runCodeValidateAuditSequence(project, changeId, reworkPrompt, live, undefined, undefined, next.roleId, orchestration, next);
  orchestration = readWorkflowOrchestration(second, orchestration);
  const finalDecision = decideNextMainAgentOrchestration(orchestration);
  return {
    status: finalDecision.kind === "completed" ? "completed" : finalDecision.kind,
    attempts: [
      { kind: "initial", result: first },
      { kind: "automatic-rework", result: second },
    ],
    reworkUsed: 1,
    requiresUserInput: finalDecision.kind !== "completed",
    stoppedAt: finalDecision.kind === "needs-user-input" || finalDecision.kind === "failed" ? finalDecision.stoppedAt : undefined,
    orchestration,
  };
}

function assertDelegateDecision(decision: MainAgentOrchestrationDecision, roleId: MainAgentOrchestrationRole): asserts decision is Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> {
  if (decision.kind !== "delegate-role" || decision.roleId !== roleId) {
    throw new Error(`Main-agent decision engine expected ${roleId}, got ${decision.kind}${decision.kind === "delegate-role" ? `:${decision.roleId}` : ""}.`);
  }
}

function readWorkflowOrchestration(result: unknown, fallback: MainAgentOrchestrationState): MainAgentOrchestrationState {
  if (isRecord(result) && isRecord(result.orchestration)) {
    const state = result.orchestration;
    if (typeof state.changeId === "string" && Array.isArray(state.steps) && typeof state.maxReworkAttempts === "number") {
      return state as unknown as MainAgentOrchestrationState;
    }
  }
  return fallback;
}

async function stopRunningPipeline(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const runningRun = await findRunningRunForChange(project, changeId);
  if (!runningRun) {
    const message = prompt?.trim()
      ? "当前执行已经结束，这条输入会作为完成后的修改反馈处理。"
      : "当前没有正在执行的本地 run。";
    const assistant = await appendTopicThreadEntry(project, changeId, { type: "assistant.message", status: "stop-not-needed", text: message });
    live?.emit({ event: "assistant.message", data: assistant });
    return { status: "already-completed", message };
  }
  requestRunStop(runningRun.id, prompt?.trim() || "User requested stop from the main conversation.");
  const user = prompt?.trim()
    ? await appendTopicThreadEntry(project, changeId, { type: "user.message", text: prompt.trim(), status: "stop-and-continue", runId: runningRun.id })
    : null;
  if (user) live?.emit({ event: "topic.message", data: user });
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "stop-requested",
    runId: runningRun.id,
    text: "已请求停止当前本地执行。停止证据会保留，随后会基于你的新指令进入下一轮方案或修改。",
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: runningRun.id,
    kind: "status",
    phase: "stopping",
    title: "Stop requested",
    summary: "AHO requested local runner termination; this is not Codex app-server resume.",
  });
  return { status: "stop-requested", runId: runningRun.id };
}

async function steerConversation(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const message = prompt?.trim();
  if (!message) throw new Error("conversation.steer requires prompt.");
  const activeTurn = getActiveCodexAppServerTurn(changeId);
  if (!activeTurn) {
    const runningRun = await findRunningRunForChange(project, changeId);
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message, status: "pending-feedback", runId: runningRun?.id });
    live?.emit({ event: "topic.message", data: user });
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      status: "pending-feedback",
      runId: runningRun?.id,
      text: "当前运行时不支持实时引导，已记录，将在下一轮生效。",
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return { status: "pending-feedback", realtime: false };
  }
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message, status: "steering-sent", runId: activeTurn.runId });
  live?.emit({ event: "topic.message", data: user });
  await activeTurn.steer(message);
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "steering-sent",
    runId: activeTurn.runId,
    text: "已发送给当前执行。",
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: activeTurn.runId,
    kind: "status",
    phase: "steered",
    title: "已发送给当前执行",
    summary: "这条输入已通过 Codex app-server 发送给当前运行中的 turn。",
  });
  return { status: "steered", realtime: true, runId: activeTurn.runId, roleId: activeTurn.roleId };
}

async function interruptConversation(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const activeTurn = getActiveCodexAppServerTurn(changeId);
  if (!activeTurn) {
    return stopRunningPipeline(project, changeId, prompt, live);
  }
  const message = prompt?.trim();
  if (message) {
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message, status: "interrupt-requested", runId: activeTurn.runId });
    live?.emit({ event: "topic.message", data: user });
  }
  await activeTurn.interrupt(message || "User requested interrupt from the main conversation.");
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "interrupt-requested",
    runId: activeTurn.runId,
    text: "已请求停止当前执行。停止证据会保留，你可以继续用自然语言说明下一步。",
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: activeTurn.runId,
    kind: "status",
    phase: "interrupt-requested",
    title: "已请求停止当前执行",
    summary: "AHO sent turn/interrupt to the active Codex app-server turn.",
    isError: true,
  });
  return { status: "interrupt-requested", realtime: true, runId: activeTurn.runId, roleId: activeTurn.roleId };
}

async function runOrchestratorPlan(project: ManagedProject, changeId: string, userMessage: string, live?: WorkbenchLiveSink): Promise<{
  run: RunMetadata;
  routingDecision: TopicRoutingDecision;
  assistantMessage: string;
  planCard: OrchestrationPlanCard;
  suggestedActions: SuggestedAction[];
}> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Orchestrator plan");
  const { changePath } = await resolveTopic(project, changeId);
  const role = await resolveAgentRole(memory, "orchestrator");
  const runId = buildRunId(changeId, ["orchestrator", userMessage]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    prompt: join(directory, "prompt.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    codexEvents: join(directory, "codex-events.jsonl"),
    lastMessage: join(directory, "last-message.md"),
    orchestrationPlan: join(directory, "orchestration-plan.json"),
    orchestrationPlanMarkdown: join(directory, "orchestration-plan.md"),
  };
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "orchestrator",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex", "exec"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts: {
      base: memory.artifactBase,
      directory: relativeDir,
      context: `${relativeDir}/context.md`,
      prompt: `${relativeDir}/prompt.md`,
      events: `${relativeDir}/events.jsonl`,
      stdout: `${relativeDir}/stdout.log`,
      stderr: `${relativeDir}/stderr.log`,
      codexEvents: `${relativeDir}/codex-events.jsonl`,
      lastMessage: `${relativeDir}/last-message.md`,
      orchestrationPlan: `${relativeDir}/orchestration-plan.json`,
      orchestrationPlanMarkdown: `${relativeDir}/orchestration-plan.md`,
    },
    promptStack: ["agent-role", "active-change", "topic-thread", "workflow-status", "user-message"],
    agent: buildRunAgentRecord(role),
  };
  await writeJsonFile(paths.run, run);
  live?.emit({ event: "run.started", data: { runId, changeId, runtime: "orchestrator", actionType: "orchestrator.plan" } });
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "orchestrator" } });
  await appendRunEvent(paths.events, { timestamp: now, type: "orchestrator.plan.started", runId, data: { changeId } });

  const context = await buildOrchestratorContext(project, memory, changePath, changeId, userMessage);
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: run.artifacts.context } });
  const prompt = `${buildAgentSystemPrompt(role)}\n\n${context}\n\n## User Message\n\n${userMessage}\n`;
  await writeFile(paths.prompt, prompt, "utf8");

  const capabilities = await detectCodexCapabilities();
  const heuristicDecision = classifyTopicRouting(userMessage, await readThreadLog(memory, changePath));
  if (capabilities.errors.length > 0) {
    const fallback = fallbackOrchestration(userMessage, heuristicDecision, capabilities.errors);
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    await writeFile(paths.lastMessage, JSON.stringify(fallback, null, 2), "utf8");
    await writeJsonFile(paths.orchestrationPlan, fallback);
    await writeFile(paths.orchestrationPlanMarkdown, renderPlanCardMarkdown(fallback), "utf8");
    run = await finishOrchestratorRun(paths.run, run, "completed", 0, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "orchestrator.plan.completed", runId, data: { routingDecision: fallback.routingDecision } });
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.completed", runId });
    return { ...fallback, run };
  }

  const argv = buildCodexReadonlyArgv(capabilities, {
    projectPath: project.path,
    lastMessagePath: paths.lastMessage,
    additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [],
  });
  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { phase: "orchestrator", command: run.command } });
  const parser = createLiveCodexParser(runId, live);
  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    onCallbackError: (_stream, error) => emitLive(live, { event: "error", data: { message: error instanceof Error ? error.message : String(error), runId } }),
    stopSignal: () => isRunStopRequested(runId),
  });
  parser.flush();
  const lastMessage = existsSync(paths.lastMessage)
    ? await readFile(paths.lastMessage, "utf8")
    : extractFinalMessageFromCodexJsonl(processResult.stdoutSample) ?? "";
  if (!existsSync(paths.lastMessage)) await writeFile(paths.lastMessage, lastMessage || "# Orchestrator Plan Not Captured\n", "utf8");
  const parsed = parseOrchestrationOutput(lastMessage, userMessage, heuristicDecision);
  await writeJsonFile(paths.orchestrationPlan, parsed);
  await writeFile(paths.orchestrationPlanMarkdown, renderPlanCardMarkdown(parsed), "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { phase: "orchestrator", exitCode: processResult.exitCode, signal: processResult.signal } });
  const status: RunStatus = processResult.exitCode === 0 ? "completed" : "failed";
  run = await finishOrchestratorRun(paths.run, run, status, processResult.exitCode, processResult.signal);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "orchestrator.plan.completed" : "orchestrator.plan.failed", runId, data: { routingDecision: parsed.routingDecision } });
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  return { ...parsed, run };
}

async function postTopicPlanMessage(project: ManagedProject, changeId: string, message: string, live?: WorkbenchLiveSink): Promise<TopicMessageResult> {
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message });
  live?.emit({ event: "topic.message", data: user });
  const capture = createAssistantTranscriptCapture(live);
  const orchestration = await runOrchestratorPlan(project, changeId, message, capture.sink);
  const assistantText = orchestration.assistantMessage.trim() || capture.text.trim();
  if (orchestration.routingDecision !== "same-topic") {
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      text: assistantText,
      runId: orchestration.run.id,
      artifact: orchestration.run.artifacts.orchestrationPlanMarkdown,
      activity: capture.activity,
      blocks: capture.blocks,
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return {
      user,
      assistant,
      run: orchestration.run,
      codexSessionId: null,
      mode: "plan",
      routingDecision: orchestration.routingDecision,
      assistantMessage: assistantText,
      planCard: orchestration.planCard,
      suggestedActions: orchestration.suggestedActions,
    };
  }
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "orchestrator.plan",
    text: assistantText,
    runId: orchestration.run.id,
    artifact: orchestration.run.artifacts.orchestrationPlanMarkdown,
    planCard: orchestration.planCard,
    activity: capture.activity,
    blocks: capture.blocks,
  });
  live?.emit({ event: "assistant.message", data: assistant });
  return {
    user,
    assistant,
    run: orchestration.run,
    codexSessionId: null,
    mode: "plan",
    routingDecision: orchestration.routingDecision,
    assistantMessage: assistantText,
    planCard: orchestration.planCard,
    suggestedActions: orchestration.suggestedActions,
  };
}

async function runTaskRunCodeValidateAuditSequence(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
  mode: "start" | "retry",
): Promise<unknown> {
  const started = mode === "start"
    ? await startTaskRun(project, { changeId, taskId: requireSingleTaskId(request.taskIds) })
    : await retryTaskRun(project, { changeId, taskRunId: requireTaskRunId(request.taskRunId) });
  return executeStartedTaskRunWorkflow(project, started, request.prompt, live);
}

async function executeStartedTaskRunWorkflow(
  project: ManagedProject,
  started: Awaited<ReturnType<typeof startTaskRun>>,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  emitAssistantEvent(live, {
    runId: started.taskRun.id,
    kind: "status",
    phase: "claimed",
    title: "TaskRun claimed",
    summary: `${started.taskRun.taskId} attempt ${started.taskRun.attempt} was claimed by ${started.lease.workerId}.`,
  });
  try {
    const memory = await resolveProjectMemory(project);
    await markTaskRunStarted(memory, started.taskRun.id);
    emitAssistantEvent(live, {
      runId: started.taskRun.id,
      kind: "status",
      phase: "running",
      title: "TaskRun running",
      summary: `${started.taskRun.taskId} attempt ${started.taskRun.attempt} started the Coder -> Validation -> Audit workflow.`,
    });
    const workflow = await runCodeValidateAuditSequence(project, started.taskRun.changeId, prompt, live, [started.taskRun.taskId], started.taskRun.id, "coder-agent", undefined, undefined, executionGate);
    const taskRun = await finishTaskRunFromWorkflowResult(memory, started.taskRun.id, workflow);
    if (shouldAutoReworkTaskRun(taskRun)) {
      emitAssistantEvent(live, {
        runId: taskRun.id,
        kind: "status",
        phase: "auto-rework",
        title: "正在根据验证/审查结果自动修改",
        summary: `${taskRun.taskId} official attempt ${taskRun.attempt} did not pass. AHO is handing the evidence back to coder-agent for one bounded rework cycle.`,
      });
      const retry = await retryTaskRun(project, { changeId: taskRun.changeId, taskRunId: taskRun.id });
      const reworkPrompt = [
        prompt,
        "",
        "AHO official validation/audit did not accept the previous attempt.",
        "Read the latest validation/audit/run evidence for this Change and fix the assigned worktree proposal.",
        "Do not ask the user unless the evidence shows requirement ambiguity, product tradeoff, environment failure, or no real code rework path.",
      ].filter((item): item is string => Boolean(item)).join("\n");
      const rework = await executeStartedTaskRunWorkflow(project, retry, reworkPrompt, live, executionGate);
      const finalTaskRun = isRecord(rework) && isTaskRunLike(rework.taskRun) ? rework.taskRun : taskRun;
      return { taskRun: finalTaskRun, lease: started.lease, workflow, autoRework: { previousTaskRun: taskRun, result: rework } };
    }
    return { taskRun, lease: started.lease, workflow };
  } catch (cause) {
    const memory = await resolveProjectMemory(project);
    await finishTaskRunFromWorkflowResult(memory, started.taskRun.id, { stoppedAt: "code", code: { run: { status: "failed" } } }).catch(() => undefined);
    throw cause;
  }
}

function shouldAutoReworkTaskRun(taskRun: Awaited<ReturnType<typeof finishTaskRunFromWorkflowResult>>): boolean {
  if (taskRun.status !== "blocked" && taskRun.status !== "failed") return false;
  const officialReworkAttempt = Math.max(0, taskRun.attempt - 1);
  return officialReworkAttempt < OFFICIAL_REWORK_BUDGET;
}

async function runTaskQueueSequence(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  const start = await startOrResumeWorkflowTaskQueue(project, {
    changeId,
    taskQueueProposalId: request.taskQueueProposalId,
    workflowGraphPlanId: request.workflowGraphPlanId,
    decompositionPlanId: request.decompositionPlanId,
    readinessManifestId: request.readinessManifestId,
    workflowRunId: request.workflowRunId,
    queueRunId: request.queueRunId,
  });
  let queue = start.queue;
  let workflow = request.workflowRunId ? await readWorkflowRun(memory, changeId, request.workflowRunId) : null;
  if (queue.workflowRunId) workflow = await readWorkflowRun(memory, changeId, queue.workflowRunId).catch(() => workflow);
  const taskQueueProposalId = request.taskQueueProposalId ?? queue.taskQueueProposalId;
  const workflowGraphPlanId = request.workflowGraphPlanId ?? queue.workflowGraphPlanId ?? workflow?.workflowGraphPlanId;
  if (start.resumed) {
    const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
    queue = reconciled.queues.find((item) => item.id === queue.id) ?? queue;
  }
  queue = await markTaskQueueRunning(memory, queue);
  emitAssistantEvent(live, {
    runId: queue.id,
    kind: "status",
    phase: start.resumed ? "resumed" : "queued",
    title: start.resumed ? "任务队列已恢复" : "任务队列已创建",
    summary: `本地顺序执行 ${queue.totalCount} 个任务。`,
  });

  while (true) {
    const nextItem = await getNextQueuedTaskQueueItem(memory, queue);
    if (!nextItem) {
      queue = await updateTaskQueueAfterItem(memory, queue);
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, queue.status === "completed" ? "workflow.completed" : "workflow.reconciled");
      return { queue, workflowRun: workflow, items: reconciled.items };
    }
    if (live?.isClosed?.()) {
      queue = await pauseTaskQueue(memory, queue, "队列已暂停，等待继续。");
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, "workflow.paused", queue.pausedReason);
      return { queue, workflowRun: workflow, items: reconciled.items };
    }

    queue = await markTaskQueueRunning(memory, queue, nextItem.taskId);
    emitAssistantEvent(live, {
      runId: queue.id,
      kind: "status",
      phase: "running",
      title: "运行任务队列",
      summary: `当前任务 ${nextItem.taskId}，已完成 ${queue.completedCount}/${queue.totalCount}。`,
    });
    try {
      const resume = await findTaskQueueStageResumeCandidate(memory, changeId, nextItem.taskId);
      if (resume?.verdict.kind === "blocked") {
        emitAssistantEvent(live, {
          runId: queue.id,
          kind: "error",
          phase: "stage-resume-blocked",
          title: "恢复阶段判定",
          summary: resume.verdict.reason,
          artifactRef: resume.verdict.evidenceRefs[0],
        });
        await failQueuedTaskItem(memory, nextItem, resume.verdict.reason);
        queue = await updateTaskQueueAfterItem(memory, queue);
        const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
        if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, "workflow.blocked", resume.verdict.reason);
        return { queue, workflowRun: workflow, items: reconciled.items };
      }
      const executionGate = taskQueueProposalId && workflowGraphPlanId ? { mode: "taskqueue-proposal" as const, taskQueueProposalId, workflowGraphPlanId } : undefined;
      const started = resume
        ? { taskRun: resume.taskRun, lease: null }
        : await startTaskRun(project, { changeId, taskId: nextItem.taskId });
      const runningItem = await markTaskQueueItemRunning(memory, nextItem, started.taskRun);
      if (resume) {
        emitAssistantEvent(live, {
          runId: queue.id,
          kind: "status",
          phase: "stage-resume-verdict",
          title: "恢复阶段判定",
          summary: resume.verdict.reason,
          artifactRef: resume.verdict.evidenceRefs[0],
        });
      }
      const result = resume
        ? await executeResumedTaskRunStage(project, started.taskRun, resume.verdict, request.prompt, live, executionGate)
        : await executeStartedTaskRunWorkflow(project, started as Awaited<ReturnType<typeof startTaskRun>>, request.prompt, live, executionGate);
      const taskRun = isRecord(result) && isRecord(result.taskRun) ? result.taskRun : null;
      if (!isTaskRunLike(taskRun)) throw new Error(`Task ${nextItem.taskId} did not return a TaskRun result.`);
      const finishedItem = await finishTaskQueueItem(memory, runningItem, taskRun);
      queue = await updateTaskQueueAfterItem(memory, queue);
      if (finishedItem.status === "blocked" || finishedItem.status === "failed") {
        emitAssistantEvent(live, {
          runId: queue.id,
          kind: "error",
          phase: finishedItem.status,
          title: "任务队列已停止",
          summary: queue.blockedReason ?? queue.failureReason ?? `${finishedItem.taskId} 未完成。`,
        });
        const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
        if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, queue.status === "blocked" ? "workflow.blocked" : "workflow.failed", queue.blockedReason ?? queue.failureReason);
        return { queue, workflowRun: workflow, items: reconciled.items };
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const failedItem = await failQueuedTaskItem(memory, nextItem, message);
      queue = await updateTaskQueueAfterItem(memory, queue);
      emitAssistantEvent(live, {
        runId: queue.id,
        kind: "error",
        phase: "failed",
        title: "任务队列已停止",
        summary: `${failedItem.taskId}: ${message}`,
      });
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, "workflow.failed", queue.failureReason);
      return { queue, workflowRun: workflow, items: reconciled.items };
    }

    if (live?.isClosed?.()) {
      queue = await pauseTaskQueue(memory, queue, "队列已暂停，等待继续。");
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, "workflow.paused", queue.pausedReason);
      return { queue, workflowRun: workflow, items: reconciled.items };
    }
    if (queue.status === "blocked" || queue.status === "failed" || queue.status === "completed") {
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, queue.status === "completed" ? "workflow.completed" : queue.status === "blocked" ? "workflow.blocked" : "workflow.failed", queue.blockedReason ?? queue.failureReason);
      return { queue, workflowRun: workflow, items: reconciled.items };
    }
  }
}

async function findTaskQueueStageResumeCandidate(memory: ResolvedMemory, changeId: string, taskId: string): Promise<{ taskRun: TaskRun; verdict: StageResumeVerdict } | null> {
  const taskRuns = await listTaskRuns(memory, changeId);
  const candidates = taskRuns.filter((run) => run.taskId.toUpperCase() === taskId.toUpperCase() && !["queued", "claimed", "running"].includes(run.status));
  for (const taskRun of candidates) {
    const verdict = await deriveWorkflowStageResumeVerdict(memory, changeId, taskRun);
    if (verdict.kind !== "start-coder") return { taskRun, verdict };
  }
  return null;
}

async function executeResumedTaskRunStage(
  project: ManagedProject,
  taskRun: TaskRun,
  verdict: StageResumeVerdict,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  const coderRun = verdict.runId ? (await listRuns(memory)).find((run) => run.id === verdict.runId) : undefined;
  if (!coderRun || coderRun.status !== "completed" || !coderRun.worktree?.worktreeId) {
    const blocked = await finishTaskRunFromWorkflowResult(memory, taskRun.id, { stoppedAt: "code", code: { run: coderRun ?? { status: "failed" } } });
    return { taskRun: blocked, workflow: { stoppedAt: "code", code: { run: coderRun } } };
  }

  if (verdict.kind === "completed") {
    const completed = await finishTaskRunFromWorkflowResult(memory, taskRun.id, { stoppedAt: null, code: { run: coderRun }, audit: { audit: { status: "approved" } } });
    return { taskRun: completed, workflow: { stoppedAt: null, code: { run: coderRun } } };
  }

  if (verdict.kind === "continue-rework") {
    return executeBoundedTaskRunRework(project, taskRun, prompt, live, executionGate);
  }

  let validation: Awaited<ReturnType<typeof startValidationRun>> | undefined;
  if (verdict.kind === "continue-validation") {
    emitAssistantEvent(live, {
      runId: taskRun.id,
      kind: "status",
      phase: "validation-resume",
      title: "Validation running",
      summary: "Coder evidence already exists; AHO is resuming from validation.",
      artifactRef: coderRun.artifacts.directory,
    });
    validation = await startValidationRun(project, { changeId: taskRun.changeId, worktree: coderRun.worktree.worktreeId });
    emitValidationAssistantEvents(live, coderRun.id, validation);
    if (validation.validation.status !== "passed") {
      const workflow = { code: { run: coderRun }, validation, stoppedAt: "validation" };
      const blocked = await finishTaskRunFromWorkflowResult(memory, taskRun.id, workflow);
      if (shouldAutoReworkTaskRun(blocked)) return executeBoundedTaskRunRework(project, blocked, prompt, live, executionGate);
      return { taskRun: blocked, workflow };
    }
  }

  emitAssistantEvent(live, {
    runId: taskRun.id,
    kind: "status",
    phase: "audit-resume",
    title: "Audit running",
    summary: "Validation evidence is available; AHO is resuming from audit.",
    artifactRef: validation?.run.artifacts.validation ?? verdict.evidenceRefs[0],
  });
  const audit = await startAuditRun(project, {
    changeId: taskRun.changeId,
    worktreeId: coderRun.worktree.worktreeId,
    prompt: "This audit resumed from WorkflowRun stage recovery after coder and validation evidence were already present.",
  });
  emitAuditAssistantEvent(live, coderRun.id, audit);
  const auditAccepted = audit.audit.status === "approved" || audit.audit.status === "approved-with-notes";
  const workflow = { code: { run: coderRun }, ...(validation ? { validation } : {}), audit, stoppedAt: auditAccepted ? null : "audit" };
  const finished = await finishTaskRunFromWorkflowResult(memory, taskRun.id, workflow);
  if (!auditAccepted && shouldAutoReworkTaskRun(finished)) return executeBoundedTaskRunRework(project, finished, prompt, live, executionGate);
  return { taskRun: finished, workflow };
}

async function executeBoundedTaskRunRework(
  project: ManagedProject,
  taskRun: TaskRun,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  const retry = await retryTaskRun(project, { changeId: taskRun.changeId, taskRunId: taskRun.id });
  const reworkPrompt = [
    prompt,
    "",
    "AHO resumed a WorkflowRun and found validation/audit evidence that requires bounded rework.",
    "Read the latest validation/audit/run evidence for this Change and fix the assigned worktree proposal.",
    "Do not ask the user unless the evidence shows requirement ambiguity, product tradeoff, environment failure, or no real code rework path.",
  ].filter((item): item is string => Boolean(item)).join("\n");
  const rework = await executeStartedTaskRunWorkflow(project, retry, reworkPrompt, live, executionGate);
  const finalTaskRun = isRecord(rework) && isTaskRunLike(rework.taskRun) ? rework.taskRun : taskRun;
  return { taskRun: finalTaskRun, workflow: rework, autoRework: { previousTaskRun: taskRun, result: rework } };
}

function isTaskRunLike(value: unknown): value is Awaited<ReturnType<typeof startTaskRun>>["taskRun"] {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.changeId === "string"
    && typeof value.taskId === "string"
    && typeof value.status === "string";
}

function requireSingleTaskId(taskIds: string[] | undefined): string {
  const unique = Array.from(new Set((taskIds ?? []).map((taskId) => taskId.trim()).filter(Boolean)));
  if (unique.length !== 1) throw new Error("task.run.start requires exactly one taskId.");
  return unique[0];
}

function requireTaskRunId(taskRunId: string | undefined): string {
  if (typeof taskRunId === "string" && taskRunId.trim()) return taskRunId.trim();
  throw new Error("task.run.retry requires taskRunId.");
}

function assertKnownTaskIds(status: Awaited<ReturnType<typeof getChangeStatusForChange>>, taskIds: string[], actionType: string): void {
  const known = new Set(status.acMap?.tasks.map((task) => task.id) ?? []);
  const unique = Array.from(new Set(taskIds.map((taskId) => taskId.trim()).filter(Boolean)));
  if (unique.length === 0) throw new Error(`${actionType} requires taskIds.`);
  const missing = unique.filter((taskId) => !known.has(taskId));
  if (missing.length > 0) throw new Error(`${actionType} target taskIds are stale or not scoped to Change ${status.change?.id ?? "unknown"}: ${missing.join(", ")}.`);
}

async function createDelegatedForegroundTask(
  memory: ResolvedMemory,
  request: AgentTaskRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ task: AgentTask; policyAuditRef: string }> {
  const result = await dispatchForegroundRoleTask(memory, { ...request, delegationMode: request.delegationMode ?? "orchestrator-policy" });
  emitAssistantEvent(live, {
    runId: request.changeId,
    kind: "status",
    phase: "delegateTask.accepted",
    title: `调用 ${request.roleId}`,
    summary: "主 agent 已通过 ToolPolicyGate 和 RoleDispatcher 启动角色任务。",
    artifactRef: result.policyAuditRef,
  });
  emitAssistantEvent(live, {
    runId: request.changeId,
    kind: "status",
    phase: "delegateTask.running",
    title: `${request.roleId} 开始处理`,
    summary: "角色任务已进入 queued/claimed/running 生命周期。",
    artifactRef: result.policyAuditRef,
  });
  return result;
}

function emitDelegatedRoleReturn(live: WorkbenchLiveSink | undefined, changeId: string, roleId: string, status: string, summary: string, artifactRef?: string): void {
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "tool-result",
    phase: `delegateTask.${status}`,
    title: `${roleId} 返回结果`,
    summary,
    artifactRef,
    isError: status !== "completed",
  });
}

async function runCodeValidateAuditSequence(
  project: ManagedProject,
  changeId: string,
  prompt?: string,
  live?: WorkbenchLiveSink,
  taskIds?: string[],
  taskRunId?: string,
  coderRoleId = "coder-agent",
  orchestrationState?: MainAgentOrchestrationState,
  coderDecision?: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  let orchestration = orchestrationState ?? createMainAgentOrchestrationState({ changeId });
  const coderRole = orchestrationCoderRole(coderRoleId);
  const coderInputArtifacts = coderDecision?.inputArtifacts.length ? coderDecision.inputArtifacts : taskRunId ? [taskRunId] : [];
  const coderDispatch = await createDelegatedForegroundTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: coderRoleId,
    kind: "foreground",
    goal: coderDecision?.goal ?? (coderRoleId === "rework-coder" ? "Repair implementation from validation or audit evidence." : "Implement the confirmed demand in an AHO-owned worktree."),
    inputArtifacts: coderInputArtifacts,
    delegationMode: "orchestrator-policy",
  }, live);
  const coderTask = coderDispatch.task;
  live?.emit({ event: "run.status", data: { status: "running", label: "Coder" } });
  let coderStartedEmitted = false;
  const code = await startCodeRun(project, {
    changeId,
    roleId: coderRoleId,
    prompt,
    taskIds,
    taskRunId,
    executionGate,
    live: {
      onRunStarted: (run) => {
        coderStartedEmitted = true;
        live?.emit({ event: "run.started", data: { runId: run.id, changeId: run.changeId, runtime: run.runtime, actionType: "code.run", taskIds: run.taskIds } });
      },
      onStatus: (event) => live?.emit({ event: "run.status", data: event }),
      onCodexEvent: (event) => forwardCodexStreamEvent(event.runId, event, live),
      onCallbackError: (event) => emitLive(live, { event: "error", data: { runId: event.runId, message: event.error instanceof Error ? event.error.message : String(event.error) } }),
    },
  });
  if (!coderStartedEmitted) live?.emit({ event: "run.started", data: { runId: code.run.id, changeId: code.run.changeId, runtime: code.run.runtime, actionType: "code.run", taskIds: code.run.taskIds } });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: code.run.status, label: "Coder" } });
  const coderBoundaryAudit = await recordPostRunBoundaryAudit(memory, {
    changeId,
    roleId: coderRoleId,
    runId: code.run.id,
    taskId: coderTask.id,
    sourceChanged: code.warnings.some((warning) => warning.toLowerCase().includes("source project git status changed")),
    artifactRefs: compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation),
  });
  const coderBoundaryRef = boundaryAuditArtifactRef(memory, coderBoundaryAudit);
  emitAssistantEvent(live, {
    runId: code.run.id,
    kind: "tool-result",
    phase: "boundary-audit",
    title: coderBoundaryAudit.status === "passed" ? "边界审计通过" : "边界审计发现越界",
    summary: coderBoundaryAudit.status === "passed" ? "coder-agent 的输出未越过本次需求的运行边界。" : coderBoundaryAudit.violations.map((violation) => violation.reason).join("\n"),
    artifactRef: coderBoundaryRef,
    isError: coderBoundaryAudit.status === "failed",
  });
  if (coderBoundaryAudit.status === "failed") {
    const coderOutputArtifacts = compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation, coderBoundaryRef);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: coderRole,
      status: "failed",
      inputArtifacts: coderInputArtifacts,
      outputArtifacts: coderOutputArtifacts,
      failureClassification: "boundary-violation",
      stoppedAt: "boundary",
      summary: "Coder run failed boundary audit.",
    });
    await completeAgentTask(memory, coderTask, {
      status: "failed",
      summary: "Coder run failed boundary audit.",
      artifactRefs: [code.run.artifacts.directory],
      policyAuditRefs: [coderDispatch.policyAuditRef],
      boundaryAuditRefs: [coderBoundaryRef],
      boundaryViolations: coderBoundaryAudit.violations,
      failureClassification: "boundary-violation",
      requiresUserInputReason: "Coder modified outside its allowed boundary.",
    });
    emitDelegatedRoleReturn(live, changeId, coderRoleId, "failed", "coder-agent 越过了允许边界，结果不会进入应用流程。", coderBoundaryRef);
    return { code, stoppedAt: "boundary", boundaryAudit: coderBoundaryAudit, orchestration };
  }
  if (code.run.status !== "completed" || !code.run.worktree?.worktreeId) {
    const coderOutputArtifacts = compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: coderRole,
      status: "failed",
      inputArtifacts: coderInputArtifacts,
      outputArtifacts: coderOutputArtifacts,
      failureClassification: "code-failure",
      stoppedAt: "code",
      summary: "Coder did not produce a completed worktree proposal.",
    });
    await completeAgentTask(memory, coderTask, {
      status: "failed",
      summary: "Coder did not produce a completed worktree proposal.",
      artifactRefs: [code.run.artifacts.directory],
      policyAuditRefs: [coderDispatch.policyAuditRef],
      boundaryAuditRefs: [coderBoundaryRef],
      failureClassification: "code-failure",
      requiresUserInputReason: "Implementation failed before official validation could run.",
    });
    emitDelegatedRoleReturn(live, changeId, coderRoleId, "failed", "coder-agent 没有产出可验证的 worktree 结果。", code.run.artifacts.directory);
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Coder task failed before validation.",
      artifactRefs: [code.run.artifacts.directory],
    });
    return { code, stoppedAt: "code", orchestration };
  }
  const coderOutputArtifacts = compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation);
  orchestration = recordMainAgentOrchestrationStep(orchestration, {
    roleId: coderRole,
    status: "completed",
    inputArtifacts: coderInputArtifacts,
    outputArtifacts: coderOutputArtifacts,
    summary: "Coder produced a completed worktree proposal.",
  });
  await completeAgentTask(memory, coderTask, {
    status: "completed",
    summary: "Coder produced a completed worktree proposal.",
    artifactRefs: compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation),
    policyAuditRefs: [coderDispatch.policyAuditRef],
    boundaryAuditRefs: [coderBoundaryRef],
    nextRecommendation: "Run independent validation.",
  });
  emitDelegatedRoleReturn(live, changeId, coderRoleId, "completed", "coder-agent 已返回实现和自测结果。", code.run.artifacts.directory);
  const validationDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(validationDecision, "validator");
  const validatorDispatch = await createDelegatedForegroundTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "validator",
    kind: "foreground",
    goal: validationDecision.goal,
    inputArtifacts: validationDecision.inputArtifacts,
    delegationMode: "orchestrator-policy",
  }, live);
  const validatorTask = validatorDispatch.task;
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: "running", label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: "running" } });
  emitAssistantEvent(live, { runId: code.run.id, kind: "status", phase: "running", title: "Validation running", summary: "AHO started validation for the coder worktree." });
  const validation = await startValidationRun(project, { changeId, worktree: code.run.worktree.worktreeId });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: validation.validation.status, label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: validation.validation.status } });
  emitValidationAssistantEvents(live, code.run.id, validation);
  const validationBoundaryAudit = await recordPostRunBoundaryAudit(memory, {
    changeId,
    roleId: "validator",
    runId: validation.run.id,
    taskId: validatorTask.id,
    artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr),
  });
  const validationBoundaryRef = boundaryAuditArtifactRef(memory, validationBoundaryAudit);
  if (validation.validation.status !== "passed") {
    const validationOutputArtifacts = compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr, validationBoundaryRef);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: "validator",
      status: "failed",
      inputArtifacts: validationDecision.inputArtifacts,
      outputArtifacts: validationOutputArtifacts,
      failureClassification: "validation-failure",
      stoppedAt: "validation",
      summary: "Independent validation failed.",
    });
    await completeAgentTask(memory, validatorTask, {
      status: "failed",
      summary: "Independent validation failed.",
      artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr),
      policyAuditRefs: [validatorDispatch.policyAuditRef],
      boundaryAuditRefs: [validationBoundaryRef],
      failureClassification: "validation-failure",
      requiresUserInputReason: "Validation failed; bounded automatic rework may be attempted.",
    });
    emitDelegatedRoleReturn(live, changeId, "validator", "failed", "validator 返回验证失败结果。", validation.run.artifacts.validation);
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Validation failed for a foreground main-agent role orchestration attempt.",
      artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stderr),
    });
    return { code, validation, stoppedAt: "validation", orchestration };
  }
  const validationOutputArtifacts = compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validationBoundaryRef);
  orchestration = recordMainAgentOrchestrationStep(orchestration, {
    roleId: "validator",
    status: "completed",
    inputArtifacts: validationDecision.inputArtifacts,
    outputArtifacts: validationOutputArtifacts,
    summary: "Independent validation passed.",
  });
  await completeAgentTask(memory, validatorTask, {
    status: "completed",
    summary: "Independent validation passed.",
    artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout),
    policyAuditRefs: [validatorDispatch.policyAuditRef],
    boundaryAuditRefs: [validationBoundaryRef],
    nextRecommendation: "Run semantic audit.",
  });
  emitDelegatedRoleReturn(live, changeId, "validator", "completed", "validator 返回验证通过结果。", validation.run.artifacts.validation);
  const auditDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(auditDecision, "auditor-agent");
  const auditorDispatch = await createDelegatedForegroundTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "auditor-agent",
    kind: "foreground",
    goal: auditDecision.goal,
    inputArtifacts: auditDecision.inputArtifacts,
    delegationMode: "orchestrator-policy",
  }, live);
  const auditorTask = auditorDispatch.task;
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: "running", label: "Audit" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Audit", status: "running" } });
  emitAssistantEvent(live, { runId: code.run.id, kind: "status", phase: "running", title: "Audit running", summary: "AHO started audit after validation passed." });
  const audit = await startAuditRun(project, {
    changeId,
    worktreeId: code.run.worktree.worktreeId,
    prompt: "This audit was automatically started after the user confirmed the Coder run and validation passed for the same worktree.",
  });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: audit.audit.status, label: "Audit" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Audit", status: audit.audit.status } });
  emitAuditAssistantEvent(live, code.run.id, audit);
  const auditBoundaryAudit = await recordPostRunBoundaryAudit(memory, {
    changeId,
    roleId: "auditor-agent",
    runId: audit.run.id,
    taskId: auditorTask.id,
    artifactRefs: compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage),
  });
  const auditBoundaryRef = boundaryAuditArtifactRef(memory, auditBoundaryAudit);
  const auditAccepted = audit.audit.status === "approved" || audit.audit.status === "approved-with-notes";
  const auditOutputArtifacts = compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage, auditBoundaryRef);
  orchestration = recordMainAgentOrchestrationStep(orchestration, {
    roleId: "auditor-agent",
    status: auditAccepted ? "completed" : "failed",
    inputArtifacts: auditDecision.inputArtifacts,
    outputArtifacts: auditOutputArtifacts,
    ...(auditAccepted ? {} : { failureClassification: "audit-failure" as const, stoppedAt: "audit" as const }),
    summary: auditAccepted ? "Independent audit accepted the validated worktree evidence." : "Independent audit did not accept the worktree evidence.",
  });
  await completeAgentTask(memory, auditorTask, {
    status: auditAccepted ? "completed" : "failed",
    summary: auditAccepted
      ? "Independent audit accepted the validated worktree evidence."
      : "Independent audit did not accept the worktree evidence.",
    artifactRefs: compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage),
    policyAuditRefs: [auditorDispatch.policyAuditRef],
    boundaryAuditRefs: [auditBoundaryRef],
    nextRecommendation: auditAccepted ? "Show result review and apply handoff." : "Attempt bounded automatic rework if budget remains.",
    ...(auditAccepted ? {} : { failureClassification: "audit-failure", requiresUserInputReason: "Audit did not accept the current evidence." }),
  });
  emitDelegatedRoleReturn(
    live,
    changeId,
    "auditor-agent",
    auditAccepted ? "completed" : "failed",
    auditAccepted
      ? "auditor-agent 返回审查通过结果。"
      : "auditor-agent 返回需要修改或补证据的结果。",
    audit.audit.artifacts.auditMarkdown,
  );
  if (!auditAccepted) {
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Audit did not accept foreground main-agent role orchestration evidence.",
      artifactRefs: compactArtifactRefs(audit.audit.artifacts.auditMarkdown),
    });
  }
  return { code, validation, audit, stoppedAt: auditAccepted ? null : "audit", orchestration };
}

function orchestrationCoderRole(roleId: string): MainAgentOrchestrationRole {
  return roleId === "rework-coder" ? "rework-coder" : "coder-agent";
}

function sourceRefreshReworkPrompt(worktreeId: string, extraPrompt?: string): string {
  return [
    "The previous result is no longer safe to apply because the project source changed after the worktree was created.",
    "Re-read the accepted demand artifacts, current source tree, prior result summary, validation/audit evidence, and user feedback.",
    `Do not patch the old result in place. Create a fresh same-demand implementation attempt from the current source state. Prior worktree: ${worktreeId}.`,
    "After implementation, preserve evidence for independent validation and audit.",
    extraPrompt?.trim() ? `Additional user feedback:\n${extraPrompt.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}

async function runCodexChat(project: ManagedProject, changeId: string, userMessage: string, live?: WorkbenchLiveSink): Promise<{ run: RunMetadata; message: string; codexSessionId: string | null }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Topic chat");
  const { changePath } = await resolveTopic(project, changeId);
  const runtime = await readTopicRuntime(memory, changePath, changeId);
  const skillContext = await getEnabledSkillContext(project, changeId);
  const runId = buildRunId(changeId, ["codex", "chat"]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    prompt: join(directory, "prompt.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    codexEvents: join(directory, "codex-events.jsonl"),
    appServerEvents: join(directory, "app-server-events.jsonl"),
    appServerStderr: join(directory, "app-server-stderr.log"),
    appServerLastMessage: join(directory, "app-server-last-message.md"),
    agentSession: join(directory, "agent-session.json"),
    lastMessage: join(directory, "last-message.md"),
  };
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "codex-readonly",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex", "exec"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts: {
      base: memory.artifactBase,
      directory: relativeDir,
      context: `${relativeDir}/context.md`,
      prompt: `${relativeDir}/prompt.md`,
      events: `${relativeDir}/events.jsonl`,
      stdout: `${relativeDir}/stdout.log`,
      stderr: `${relativeDir}/stderr.log`,
      codexEvents: `${relativeDir}/codex-events.jsonl`,
      appServerEvents: `${relativeDir}/app-server-events.jsonl`,
      appServerStderr: `${relativeDir}/app-server-stderr.log`,
      appServerLastMessage: `${relativeDir}/app-server-last-message.md`,
      agentSession: `${relativeDir}/agent-session.json`,
      lastMessage: `${relativeDir}/last-message.md`,
    },
    promptStack: ["active-change", "topic-thread", "aho-skills", "user-message"],
    enabledSkills: skillContext.records,
  };
  await writeJsonFile(paths.run, run);
  live?.emit({ event: "run.started", data: { runId, changeId, runtime: "codex-readonly", actionType: "chat.ask" } });
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "codex-chat", requestedResume: Boolean(runtime.codexSessionId), skills: skillContext.records.map((item) => item.id) } });
  const context = await buildChatContext(project, memory, changeId, userMessage);
  await writeFile(paths.context, context, "utf8");
  const prompt = `${context}${skillContext.promptSection ? `\n\n${skillContext.promptSection}` : ""}\n\n## User Message\n\n${userMessage}\n`;
  await writeFile(paths.prompt, prompt, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: run.artifacts.context } });

  const appServerCapabilities = await detectCodexAppServerCapability();
  if (appServerCapabilities.available) {
    run = { ...run, command: ["codex", "app-server", "--listen", "stdio://"], status: "running" };
    await writeJsonFile(paths.run, run);
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.started", runId, data: { phase: "chat", resumed: Boolean(runtime.codexSessionId) } });
    const result = await runCodexAppServerTurn({
      projectId: project.id,
      changeId,
      roleId: "planning-agent",
      runId,
      cwd: project.path,
      prompt,
      sandboxPolicy: "read-only",
      paths: {
        events: paths.appServerEvents,
        stderr: paths.appServerStderr,
        lastMessage: paths.appServerLastMessage,
        session: paths.agentSession,
      },
      existingThreadId: runtime.codexSessionId,
      onTextDelta: (delta) => emitLive(live, { event: "assistant.delta", data: { delta, runId } }),
      onNotification: (notification) => forwardAppServerNotification(runId, notification, live),
      onError: (error) => emitLive(live, { event: "error", data: { runId, message: error instanceof Error ? error.message : String(error) } }),
    });
    const status: RunStatus = result.status === "completed" ? "completed" : "failed";
    const lastMessage = result.lastMessage.trim() || result.error || "Codex app-server did not return a final message.";
    await writeFile(paths.lastMessage, lastMessage, "utf8");
    await writeTopicRuntime(memory, changePath, { version: "1.0", changeId, codexSessionId: result.threadId ?? runtime.codexSessionId, updatedAt: new Date().toISOString() });
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.exited", runId, data: { phase: "chat", status: result.status, threadId: result.threadId, turnId: result.turnId, error: result.error } });
    run = { ...run, status, exitCode: status === "completed" ? 0 : 1, signal: null, finishedAt: new Date().toISOString() };
    await writeJsonFile(paths.run, run);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
    live?.emit({ event: "run.status", data: { runId, status } });
    return { run, message: lastMessage, codexSessionId: result.threadId ?? runtime.codexSessionId };
  }
  emitAssistantEvent(live, {
    runId,
    kind: "status",
    phase: "fallback",
    title: "实时引导不可用",
    summary: "Codex app-server 不可用，当前输入会在下一轮生效。",
  });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.unavailable", runId, data: { errors: appServerCapabilities.errors } });

  const capabilities = await detectCodexCapabilities();
  const canResume = Boolean(runtime.codexSessionId) && capabilities.supportsSafeResume;
  const argv = canResume
    ? buildCodexReadonlyResumeArgv(capabilities, { projectPath: project.path, lastMessagePath: paths.lastMessage, sessionId: runtime.codexSessionId as string, additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [] })
    : buildCodexReadonlyArgv(capabilities, { projectPath: project.path, lastMessagePath: paths.lastMessage, additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [] });

  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { phase: "chat", resumed: canResume, resumeFallback: Boolean(runtime.codexSessionId) && !canResume, skillWarnings: skillContext.warnings } });
  const parser = createLiveCodexParser(runId, live);
  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    onCallbackError: (_stream, error) => emitLive(live, { event: "error", data: { message: error instanceof Error ? error.message : String(error), runId } }),
    stopSignal: () => isRunStopRequested(runId),
  });
  parser.flush();
  const stdout = processResult.stdoutSample;
  const lastMessage = existsSync(paths.lastMessage)
    ? await readFile(paths.lastMessage, "utf8")
    : extractFinalMessageFromCodexJsonl(stdout) ?? "";
  if (!existsSync(paths.lastMessage)) await writeFile(paths.lastMessage, lastMessage || "# Codex Chat Not Captured\n", "utf8");
  const nextSessionId = extractCodexSessionIdFromJsonl(stdout) ?? runtime.codexSessionId;
  await writeTopicRuntime(memory, changePath, { version: "1.0", changeId, codexSessionId: nextSessionId, updatedAt: new Date().toISOString() });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { phase: "chat", exitCode: processResult.exitCode, signal: processResult.signal, sessionLinked: Boolean(nextSessionId) } });
  const status: RunStatus = processResult.exitCode === 0 ? "completed" : "failed";
  run = { ...run, status, exitCode: processResult.exitCode, signal: processResult.signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  live?.emit({ event: "run.status", data: { runId, status } });
  return { run, message: lastMessage.trim() || processResult.stderrSample || "Codex did not return a final message.", codexSessionId: nextSessionId };
}

function compactArtifactRefs(...refs: Array<string | undefined | null>): string[] {
  return refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0);
}

function createLiveCodexParser(runId: string, live: WorkbenchLiveSink | undefined): ReturnType<typeof createCodexJsonlStreamParser> {
  return createCodexJsonlStreamParser((event: CodexJsonlStreamEvent) => {
    forwardCodexStreamEvent(runId, event, live);
  });
}

function forwardCodexStreamEvent(runId: string, event: CodexJsonlStreamEvent, live: WorkbenchLiveSink | undefined): void {
    if (!live) return;
    if (event.type === "readable_event") {
      emitAssistantEvent(live, { ...event.event, runId });
      return;
    }
    if (event.type === "text_delta") {
      emitLive(live, { event: "assistant.delta", data: { delta: event.delta, runId } });
      return;
    }
    if (event.type === "status") {
      emitLive(live, { event: "run.status", data: { runId, status: event.label } });
      return;
    }
    if (event.type === "usage") {
      emitLive(live, { event: "usage", data: { runId, usage: event.usage } });
      emitAssistantEvent(live, {
        runId,
        kind: "usage",
        phase: "completed",
        title: "Usage recorded",
        summary: formatUsageSummary(event.usage),
      });
      return;
    }
    if (event.type === "error") {
      emitLive(live, { event: "error", data: { runId, message: event.message } });
      emitAssistantEvent(live, { runId, kind: "error", phase: "failed", title: "Codex error", summary: event.message, isError: true });
      return;
    }
    if (event.type === "tool_event") {
      const preview = truncateReadablePreview(event.output);
      emitLive(live, {
        event: "tool.event",
        data: {
          runId,
          itemId: event.id,
          phase: event.phase,
          name: event.name,
          command: event.command,
          outputTail: preview.preview,
          isError: event.isError,
          exitCode: typeof event.raw === "object" && event.raw && "item" in event.raw ? exitCodeFromRaw(event.raw) : undefined,
        },
      });
    }
}

function forwardAppServerNotification(runId: string, notification: CodexAppServerNotification, live: WorkbenchLiveSink | undefined): void {
  if (!live) return;
  const method = notification.method;
  if (method === "turn/completed") {
    emitLive(live, { event: "run.status", data: { runId, status: "completed" } });
    return;
  }
  if (method === "turn/failed") {
    const message = JSON.stringify(notification.params);
    emitLive(live, { event: "error", data: { runId, message } });
    emitAssistantEvent(live, { runId, kind: "error", phase: "failed", title: "Codex app-server turn failed", summary: message, isError: true });
    return;
  }
  if (method.includes("commandExecution")) {
    const command = commandFromAppServerParams(notification.params);
    emitAssistantEvent(live, {
      runId,
      itemId: itemIdFromAppServerParams(notification.params),
      kind: "command",
      phase: method.includes("completed") || method.includes("finished") ? "completed" : "running",
      title: "Command event",
      summary: command ?? method,
      command,
      preview: previewFromAppServerParams(notification.params),
    });
    return;
  }
  if (method.startsWith("item/") || method.startsWith("tool/")) {
    emitAssistantEvent(live, {
      runId,
      itemId: itemIdFromAppServerParams(notification.params),
      kind: "status",
      phase: "running",
      title: "Codex activity",
      summary: method,
    });
  }
}

function emitAssistantEvent(live: WorkbenchLiveSink | undefined, event: WorkbenchAssistantEvent): void {
  emitLive(live, { event: "assistant.event", data: { ...event, timestamp: event.timestamp ?? new Date().toISOString() } });
}

function emitValidationAssistantEvents(live: WorkbenchLiveSink | undefined, runId: string, result: unknown): void {
  const validation = isRecord(result) && isRecord(result.validation) ? result.validation : undefined;
  const status = typeof validation?.status === "string" ? validation.status : "completed";
  emitAssistantEvent(live, {
    runId,
    kind: "status",
    phase: status,
    title: status === "passed" ? "Validation passed" : "Validation completed",
    summary: `Validation ${status}.`,
    artifactRef: artifactRefFromRecord(validation?.artifacts),
    isError: status !== "passed",
  });
  const commands = Array.isArray(validation?.commands) ? validation.commands.filter(isRecord) : [];
  for (const [index, command] of commands.entries()) {
    const commandText = Array.isArray(command.command)
      ? command.command.filter((part): part is string => typeof part === "string").join(" ")
      : typeof command.command === "string" ? command.command : undefined;
    const exitCode = typeof command.exitCode === "number" ? command.exitCode : undefined;
    const commandStatus = typeof command.status === "string" ? command.status : undefined;
    emitAssistantEvent(live, {
      runId,
      itemId: `validation:${index}`,
      kind: "command",
      phase: commandStatus ?? (exitCode === 0 ? "completed" : "failed"),
      title: exitCode === 0 || commandStatus === "passed" ? "Validation command passed" : "Validation command completed",
      summary: commandText ?? "Validation command",
      command: commandText,
      exitCode,
      isError: exitCode !== undefined ? exitCode !== 0 : commandStatus === "failed",
      artifactRef: artifactRefFromRecord(command.artifacts),
    });
  }
}

function emitAuditAssistantEvent(live: WorkbenchLiveSink | undefined, runId: string, result: unknown): void {
  const audit = isRecord(result) && isRecord(result.audit) ? result.audit : undefined;
  const status = typeof audit?.status === "string" ? audit.status : "completed";
  emitAssistantEvent(live, {
    runId,
    kind: "status",
    phase: status,
    title: status === "approved" || status === "approved-with-notes" ? "Audit approved" : "Audit completed",
    summary: `Audit ${status}.`,
    artifactRef: artifactRefFromRecord(audit?.artifacts),
    isError: status !== "approved" && status !== "approved-with-notes",
  });
}

function artifactRefFromRecord(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["lastMessage", "auditMarkdown", "validationMarkdown", "report", "stdout", "stderr", "directory"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return undefined;
}

function formatUsageSummary(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const pieces = [
    input === undefined ? null : `${input} input tokens`,
    output === undefined ? null : `${output} output tokens`,
  ].filter((item): item is string => Boolean(item));
  return pieces.length > 0 ? pieces.join(" · ") : "Usage recorded.";
}

function exitCodeFromRaw(raw: unknown): number | undefined {
  if (!raw || typeof raw !== "object" || !("item" in raw)) return undefined;
  const item = (raw as { item?: unknown }).item;
  if (!item || typeof item !== "object" || !("exit_code" in item)) return undefined;
  const exitCode = (item as { exit_code?: unknown }).exit_code;
  return typeof exitCode === "number" ? exitCode : undefined;
}

function itemIdFromAppServerParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.itemId === "string") return params.itemId;
  if (typeof params.id === "string") return params.id;
  if (isRecord(params.item) && typeof params.item.id === "string") return params.item.id;
  return undefined;
}

function commandFromAppServerParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.command === "string") return params.command;
  if (Array.isArray(params.command)) return params.command.filter((part): part is string => typeof part === "string").join(" ");
  if (isRecord(params.item) && typeof params.item.command === "string") return params.item.command;
  if (isRecord(params.item) && Array.isArray(params.item.command)) return params.item.command.filter((part): part is string => typeof part === "string").join(" ");
  return undefined;
}

function previewFromAppServerParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.output === "string") return truncateReadablePreview(params.output).preview;
  if (typeof params.text === "string") return truncateReadablePreview(params.text).preview;
  if (isRecord(params.item) && typeof params.item.output === "string") return truncateReadablePreview(params.item.output).preview;
  return undefined;
}

async function buildChatContext(project: ManagedProject, memory: ResolvedMemory, changeId: string, userMessage: string): Promise<string> {
  const status = await getChangeStatusForChange(project, changeId);
  const { changePath } = await resolveTopic(project, changeId);
  const recentMessages = (await readThreadLog(memory, changePath)).slice(-12);
  return [
    "# AHO Topic Chat",
    "",
    "You are answering inside the AHO Workbench Topic chat.",
    "This is ordinary read-only conversation. Do not edit files, create worktrees, apply changes, close changes, or claim approval.",
    "Use AHO artifacts as source of truth. Codex session memory is only runtime continuity.",
    "",
    buildContextProjection(status),
    "## Recent Topic Messages",
    "",
    ...recentMessages.map((entry) => `- ${entry.type}: ${entry.text ?? entry.actionType ?? entry.status ?? ""}`),
    "",
    "## Current User Message",
    "",
    userMessage,
  ].join("\n");
}

async function buildOrchestratorContext(project: ManagedProject, memory: ResolvedMemory, changePath: string, changeId: string, userMessage: string): Promise<string> {
  const status = await getChangeStatusForChange(project, changeId);
  const recentMessages = (await readThreadLog(memory, changePath)).slice(-16);
  return [
    "# AHO Workbench Orchestrator Context",
    "",
    "You are planning inside a single AHO Topic.",
    "The Orchestrator plan card is an interaction projection. It is not canonical workflow truth.",
    "Do not mutate files or claim acceptance.",
    "",
    buildContextProjection(status),
    "## Current Topic",
    "",
    `- Change ID: ${changeId}`,
    `- Active Changes: ${status.activeChanges.map((item) => item.name).join(", ") || "none"}`,
    "",
    "## Recent Topic Messages",
    "",
    ...recentMessages.map((entry) => `- ${entry.type}: ${entry.text ?? entry.actionType ?? entry.status ?? ""}`),
    "",
    "## Routing Policy",
    "",
    "- If the request is unrelated to this Topic, return routingDecision new-topic-required.",
    "- If routing is uncertain, return routingDecision clarify.",
    "- Otherwise return same-topic and suggest the next safe workflow action.",
    "",
    "## Current User Message",
    "",
    userMessage,
  ].join("\n");
}

function normalizeTopicMessageInput(input: string | TopicMessageInput): Required<Pick<TopicMessageInput, "mode" | "message">> {
  const mode = typeof input === "string" ? "chat" : input.mode ?? "chat";
  const message = typeof input === "string" ? input : input.message ?? input.text ?? "";
  if (mode !== "chat" && mode !== "plan") throw new Error("Message mode must be chat or plan.");
  if (!message.trim()) throw new Error("Message text is required.");
  return { mode, message: message.trim() };
}

function parseOrchestrationOutput(message: string, userMessage: string, fallbackDecision: TopicRoutingDecision): {
  routingDecision: TopicRoutingDecision;
  assistantMessage: string;
  planCard: OrchestrationPlanCard;
  suggestedActions: SuggestedAction[];
} {
  const json = extractJsonObject(message);
  if (!json) return fallbackOrchestration(userMessage, fallbackDecision, ["Orchestrator output did not include parseable JSON."]);
  try {
    const parsed = orchestrationOutputSchema.parse(JSON.parse(json));
    return {
      routingDecision: parsed.routingDecision,
      assistantMessage: parsed.assistantMessage,
      planCard: {
        title: parsed.planCard.title,
        summary: parsed.planCard.summary,
        steps: parsed.planCard.steps,
        warnings: parsed.planCard.warnings,
      },
      suggestedActions: parsed.suggestedActions.filter(isAllowedSuggestedAction),
    };
  } catch (cause) {
    return fallbackOrchestration(userMessage, fallbackDecision, [`Orchestrator JSON was invalid: ${cause instanceof Error ? cause.message : String(cause)}`]);
  }
}

const orchestrationOutputSchema = z.object({
  routingDecision: z.enum(["same-topic", "new-topic-required", "clarify"]).default("same-topic"),
  assistantMessage: z.string().default("I prepared a workflow plan."),
  planCard: z.object({
    title: z.string().default("Plan mode"),
    summary: z.string().default("Review the suggested action before advancing the workflow."),
    steps: z.array(z.object({
      label: z.string(),
      description: z.string(),
      actionId: z.string().optional(),
      requiresConfirmation: z.boolean().optional(),
    })).default([]),
    warnings: z.array(z.string()).default([]),
  }).default({ title: "Plan mode", summary: "Review the suggested action before advancing the workflow.", steps: [], warnings: [] }),
  suggestedActions: z.array(z.object({
    actionType: z.enum(["change.spec.propose", "change.plan.propose", "code.run", "spec-test.drift"]),
    label: z.string(),
    requiresConfirmation: z.boolean().default(true),
    prompt: z.string().optional(),
  })).default([]),
});

function fallbackOrchestration(userMessage: string, routingDecision: TopicRoutingDecision, warnings: string[]): {
  routingDecision: TopicRoutingDecision;
  assistantMessage: string;
  planCard: OrchestrationPlanCard;
  suggestedActions: SuggestedAction[];
} {
  const actionType: SuggestedAction["actionType"] = routingDecision === "same-topic" ? "change.spec.propose" : "spec-test.drift";
  const assistantMessage = routingDecision === "same-topic"
    ? "I prepared a controlled plan. Start with a Spec proposal so the request is anchored before coding."
    : routingDecision === "new-topic-required"
      ? "This looks like a different request. Create or switch Topic before continuing so the current Change stays clean."
      : "I need a routing decision before attaching this request to the current Topic.";
  return {
    routingDecision,
    assistantMessage,
    planCard: {
      title: routingDecision === "same-topic" ? "Controlled implementation plan" : "Topic routing required",
      summary: routingDecision === "same-topic"
        ? `Convert the request into a Spec proposal, then proceed through Plan, Coder, Validation, Audit, and explicit Apply/Close gates. Request: ${userMessage}`
        : "AHO will not mix unrelated or uncertain work into the current Topic.",
      steps: routingDecision === "same-topic"
        ? [
            { label: "Draft Spec", description: "Generate a proposal only; user acceptance writes canonical spec.md.", actionId: "change.spec.propose", requiresConfirmation: true },
            { label: "Draft Plan", description: "After Spec acceptance, generate plan.md and tasks.md proposal.", actionId: "change.plan.propose", requiresConfirmation: true },
            { label: "Code and verify", description: "After explicit Code confirmation, run Coder, validation, and audit on the same worktree.", actionId: "code.run", requiresConfirmation: true },
          ]
        : [{ label: "Resolve routing", description: "Create/switch/park/close a Topic before continuing.", requiresConfirmation: true }],
      warnings,
    },
    suggestedActions: routingDecision === "same-topic"
      ? [{ actionType, label: "Generate Spec proposal", requiresConfirmation: true, prompt: userMessage }]
      : [],
  };
}

function classifyTopicRouting(userMessage: string, recentMessages: TopicThreadEntry[]): TopicRoutingDecision {
  const normalized = userMessage.trim().toLowerCase();
  if (/新(topic|主题)|另一个|无关|换个需求|new topic/.test(normalized)) return "new-topic-required";
  if (/这个需求|继续|补充|修改上面|刚才|current|same topic/.test(normalized)) return "same-topic";
  if (recentMessages.length === 0) return "same-topic";
  if (normalized.length < 8) return "clarify";
  return "same-topic";
}

function extractJsonObject(text: string): string | null {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

function isAllowedSuggestedAction(action: SuggestedAction): boolean {
  return action.actionType === "change.spec.propose" || action.actionType === "change.plan.propose" || action.actionType === "code.run" || action.actionType === "spec-test.drift";
}

function renderPlanCardMarkdown(plan: { routingDecision: TopicRoutingDecision; assistantMessage: string; planCard: OrchestrationPlanCard; suggestedActions: SuggestedAction[] }): string {
  return [
    `# ${plan.planCard.title}`,
    "",
    `Routing: ${plan.routingDecision}`,
    "",
    plan.assistantMessage,
    "",
    "## Summary",
    "",
    plan.planCard.summary,
    "",
    "## Steps",
    "",
    ...plan.planCard.steps.map((step) => `- ${step.label}: ${step.description}`),
    "",
    "## Suggested Actions",
    "",
    ...(plan.suggestedActions.length > 0 ? plan.suggestedActions.map((action) => `- ${action.actionType}: ${action.label}`) : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(plan.planCard.warnings.length > 0 ? plan.planCard.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
  ].join("\n");
}

function buildDeterministicPlanningBundle(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  prompt: string,
  previous: PlanningArtifactBundle | null,
  revision: boolean,
): PlanningArtifactBundle {
  const now = new Date().toISOString();
  const id = `planning-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const goal = revision && previous ? `${previous.goal}\n\nRevision request: ${prompt}` : prompt;
  const constraints = uniqueStrings([
    ...(previous?.constraints ?? []),
    ...extractConstraintCandidates(prompt),
  ]);
  const acceptanceCriteria = buildAcceptanceCriteria(goal, constraints);
  const tasks = [
    { id: "T-001", title: "Implement the accepted demand and update tests.", acIds: acceptanceCriteria.map((_item, index) => `AC-${String(index + 1).padStart(3, "0")}`) },
  ];
  const specMd = renderSpecMarkdown(changeId, goal, constraints, acceptanceCriteria);
  const planMd = renderImplementationPlanMarkdown(goal, tasks);
  const tasksMd = renderTasksMarkdown(tasks);
  const changeDir = join(memory.memoryRoot, changePath);
  const artifact = displayArtifactPath(memory, join(changeDir, "planning", "latest-bundle.md"));
  return {
    id,
    status: "draft",
    goal,
    constraints,
    acceptanceCriteria,
    design: "Use the smallest focused implementation in an AHO-owned worktree, add or update tests for the pricing rule, then run independent validation and audit.",
    tasks,
    risks: ["Validation or audit may require one bounded rework cycle.", "User confirmation is still required before applying/merging source changes."],
    openQuestions: constraints.length > 0 ? [] : ["Confirm rounding, membership eligibility, and test coverage expectations if they are not already stated."],
    specMd,
    planMd,
    tasksMd,
    acMapCandidate: buildAcMap({ changeId, specContent: specMd, tasksContent: tasksMd, placeholderFiles: [] }),
    artifact,
    updatedAt: now,
  };
}

async function writePlanningBundle(memory: ResolvedMemory, changePath: string, bundle: PlanningArtifactBundle): Promise<void> {
  const dir = join(memory.memoryRoot, changePath, "planning");
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, "latest-bundle.json"), bundle);
  await writeFile(join(dir, "latest-bundle.md"), renderPlanningBundleMarkdown(bundle), "utf8");
}

async function readLatestPlanningBundle(memory: ResolvedMemory, changePath: string): Promise<PlanningArtifactBundle> {
  const schema = z.object({
    id: z.string(),
    status: z.enum(["draft", "confirmed"]),
    goal: z.string(),
    constraints: z.array(z.string()),
    acceptanceCriteria: z.array(z.string()),
    design: z.string(),
    tasks: z.array(z.object({ id: z.string(), title: z.string(), acIds: z.array(z.string()) })),
    risks: z.array(z.string()),
    openQuestions: z.array(z.string()),
    specMd: z.string(),
    planMd: z.string(),
    tasksMd: z.string(),
    acMapCandidate: z.any(),
    artifact: z.string(),
    updatedAt: z.string(),
  });
  return readRequiredJsonFile(join(memory.memoryRoot, changePath, "planning", "latest-bundle.json"), schema);
}

function buildDeterministicDecompositionPlan(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  bundle: PlanningArtifactBundle | null,
  thread: TopicThreadEntry[],
  prompt: string | undefined,
): DecompositionPlan {
  const now = new Date().toISOString();
  const id = `decomposition-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const threadText = thread.map((entry) => entry.text ?? "").join("\n");
  const signalText = [bundle?.goal, bundle?.design, prompt, threadText].filter(Boolean).join("\n");
  const tasks = bundle?.tasks.length ? bundle.tasks : [{ id: "T-001", title: bundle?.goal ?? "Clarify and implement the accepted demand.", acIds: [] }];
  const asksClarification = (bundle?.openQuestions.length ?? 0) > 0 || /不明确|澄清|clarify/i.test(signalText);
  const parallelSignal = /并行|parallel|多个模块|多模块|independent|独立/.test(signalText);
  const multiChangeSignal = /多个 change|multi-change|多个需求|拆成多个/.test(signalText);
  const recommendation: DecompositionRecommendation = asksClarification
    ? "needs-clarification"
    : multiChangeSignal
      ? "multi-change-candidate"
      : tasks.length > 1
        ? parallelSignal ? "taskgraph-parallel-candidate" : "taskgraph-sequential"
        : "single-change";
  const units: DecompositionUnit[] = tasks.map((task, index) => ({
    id: `DU-${String(index + 1).padStart(3, "0")}`,
    title: task.title,
    summary: recommendation === "single-change" ? "Keep this demand as one Coding Work Package." : "Candidate scoped execution unit from accepted planning tasks.",
    taskIds: [task.id],
    acIds: task.acIds,
    scopeHints: ["selected-demand", "AHO-owned worktree only"],
    dependsOn: index === 0 ? [] : [`DU-${String(index).padStart(3, "0")}`],
    recommendedRoleId: "coder-agent",
  }));
  const dependencies = units.slice(1).map((unit, index) => ({ from: units[index]?.id ?? units[0]?.id ?? unit.id, to: unit.id, kind: "blocks" as const }));
  const changeDir = join(memory.memoryRoot, changePath);
  const artifact = displayArtifactPath(memory, join(changeDir, "planning", "decomposition-plan.json"));
  const markdownArtifact = displayArtifactPath(memory, join(changeDir, "planning", "decomposition-plan.md"));
  return {
    id,
    changeId,
    status: "draft",
    recommendation,
    rationale: rationaleForRecommendation(recommendation, units.length),
    units,
    dependencies,
    conflictScopes: recommendation === "single-change" ? [] : ["source overlap must be checked before parallel execution"],
    riskSummary: "This is a proposal only. User confirmation does not start execution, create child Changes, or trust recovered work.",
    openQuestions: bundle?.openQuestions ?? [],
    artifactRefs: [bundle?.artifact].filter((item): item is string => Boolean(item)),
    recoveryKeyInputs: {
      changeId,
      planningBundleId: bundle?.id,
      acceptedArtifactRefs: [bundle?.artifact].filter((item): item is string => Boolean(item)),
      contextScope: "selected-demand",
      rolePolicyProfile: "main-agent proposal; worker roles remain leaves",
      notes: [
        "Recovery may reuse only scoped execution progress in later phases.",
        "Change, context, source, policy, and accepted artifact hashes must still match.",
      ],
    },
    artifact,
    markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

async function buildDecompositionReadinessManifest(
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  plan: DecompositionPlan,
): Promise<DecompositionReadinessManifest> {
  const status = await getChangeStatusForChange(memory, changeId);
  if (!status.change) throw new Error(`planning.decomposition.assess-readiness target is stale or missing active Change: ${changeId}.`);
  if (plan.changeId !== changeId) throw new Error("DecompositionPlan is not scoped to the selected Change.");
  const knownTasks = new Set((status.acMap?.tasks ?? []).map((task) => task.id));
  const knownAcs = new Set((status.acMap?.acceptanceCriteria ?? []).map((ac) => ac.id));
  const unitIds = new Set(plan.units.map((unit) => unit.id));
  const taskIds = unique(plan.units.flatMap((unit) => unit.taskIds));
  const acIds = unique(plan.units.flatMap((unit) => unit.acIds));
  const guardrails: DecompositionReadinessGuardrail[] = [];
  const addGuardrail = (id: string, passed: boolean, summary: string, refs: string[] = []): void => {
    guardrails.push({ id, status: passed ? "passed" : "failed", summary, refs });
  };
  addGuardrail("change-scope", status.acMap?.changeId === changeId, "Plan and accepted AC map must belong to the selected demand.", [changeId]);
  addGuardrail("plan-confirmed", plan.status === "confirmed", "Only a confirmed DecompositionPlan can be assessed.", [plan.id]);
  addGuardrail("task-ids-known", taskIds.every((id) => knownTasks.has(id)), "Every referenced task id must exist in accepted tasks.", taskIds);
  addGuardrail("ac-ids-known", acIds.every((id) => knownAcs.has(id)), "Every referenced AC id must exist in accepted acceptance criteria.", acIds);
  addGuardrail(
    "dependency-units-known",
    plan.units.every((unit) => unit.dependsOn.every((id) => unitIds.has(id))) && plan.dependencies.every((dep) => unitIds.has(dep.from) && unitIds.has(dep.to)),
    "Every dependency must reference a known DecompositionUnit.",
    plan.dependencies.flatMap((dep) => [dep.from, dep.to]),
  );
  const integrityFailure = guardrails.some((item) => item.status === "failed");
  if (integrityFailure) {
    throw new Error(`DecompositionReadiness guardrail failed: ${guardrails.filter((item) => item.status === "failed").map((item) => item.id).join(", ")}.`);
  }

  const sourceScopesSpecific = plan.units.every((unit) => unit.scopeHints.some((hint) => isSpecificSourceScope(hint)));
  const conflictScopesSpecific = plan.conflictScopes.length > 0 && plan.conflictScopes.every((scope) => isSpecificSourceScope(scope));
  const parallelReady = sourceScopesSpecific && conflictScopesSpecific;
  const recommendationGuardrail: DecompositionReadinessGuardrail = plan.recommendation === "taskgraph-parallel-candidate"
    ? {
        id: "parallel-conflict-scopes",
        status: parallelReady ? "passed" : "blocked",
        summary: parallelReady
          ? "Parallel candidate has explicit source and conflict scopes."
          : "Parallel candidate is blocked until source/task scopes and conflict scopes are concrete.",
        refs: [...plan.conflictScopes, ...plan.units.flatMap((unit) => unit.scopeHints)],
      }
    : {
        id: "recommendation-boundary",
        status: "passed",
        summary: "Recommendation maps to a non-executing readiness verdict in this phase.",
        refs: [plan.recommendation],
      };
  guardrails.push(recommendationGuardrail);

  const readinessStatus = readinessStatusForRecommendation(plan.recommendation, parallelReady);
  const now = new Date().toISOString();
  const dir = join(memory.memoryRoot, changePath, "planning");
  const artifact = displayArtifactPath(memory, join(dir, "decomposition-readiness.json"));
  const markdownArtifact = displayArtifactPath(memory, join(dir, "decomposition-readiness.md"));
  const units: DecompositionReadinessUnit[] = plan.units.map((unit) => ({
    id: unit.id,
    title: unit.title,
    taskIds: unit.taskIds,
    acIds: unit.acIds,
    dependsOn: unit.dependsOn,
    guardrailStatus: recommendationGuardrail.status === "failed" ? "failed" : recommendationGuardrail.status === "blocked" ? "blocked" : "passed",
    sourceScopes: unit.scopeHints,
  }));
  return {
    id: `readiness-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    changeId,
    decompositionPlanId: plan.id,
    status: readinessStatus,
    recommendation: plan.recommendation,
    executable: false,
    schedulerEligible: readinessStatus === "ready-for-sequential-taskqueue-proposal",
    nextAllowedAction: nextAllowedActionForReadiness(readinessStatus),
    units,
    dependencies: plan.dependencies,
    conflictScopes: plan.conflictScopes,
    guardrails,
    recoveryKeyMaterial: {
      ...plan.recoveryKeyInputs,
      decompositionPlanId: plan.id,
      taskIds,
      acIds,
    },
    artifactRefs: unique([...plan.artifactRefs, plan.artifact, plan.markdownArtifact, ...plan.recoveryKeyInputs.acceptedArtifactRefs]),
    artifact,
    markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function readinessStatusForRecommendation(recommendation: DecompositionRecommendation, parallelReady: boolean): DecompositionReadinessStatus {
  switch (recommendation) {
    case "single-change": return "ready-for-single-change";
    case "taskgraph-sequential": return "ready-for-sequential-taskqueue-proposal";
    case "taskgraph-parallel-candidate": return parallelReady ? "ready-for-sequential-taskqueue-proposal" : "blocked-parallel-guardrails";
    case "multi-change-candidate": return "blocked-multi-change-boundary";
    case "needs-clarification": return "blocked-needs-clarification";
  }
}

function nextAllowedActionForReadiness(status: DecompositionReadinessStatus): DecompositionReadinessManifest["nextAllowedAction"] {
  switch (status) {
    case "ready-for-single-change": return "code.run";
    case "ready-for-sequential-taskqueue-proposal": return "taskqueue.proposal";
    case "blocked-needs-clarification": return "clarification.answer";
    case "blocked-parallel-guardrails":
    case "blocked-multi-change-boundary":
    case "invalid":
      return "none";
  }
}

function isSpecificSourceScope(scope: string): boolean {
  const normalized = scope.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "selected-demand") return false;
  if (normalized === "aho-owned worktree only") return false;
  if (normalized.includes("must be checked")) return false;
  if (normalized.includes("source overlap")) return false;
  return /[/.\\]/.test(normalized) || /\bsrc\b|\btest\b|\bdocs\b|\bmodule\b|\bpackage\b/.test(normalized);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function rationaleForRecommendation(recommendation: DecompositionRecommendation, unitCount: number): string {
  switch (recommendation) {
    case "needs-clarification": return "The current demand still has open questions, so execution should wait for user clarification.";
    case "multi-change-candidate": return "The demand appears broad enough to consider multiple child Changes, but this phase records only the proposal.";
    case "taskgraph-parallel-candidate": return "Multiple execution units may be independent, but conflict scopes and synthesis still need Harness checks.";
    case "taskgraph-sequential": return `The demand maps to ${unitCount} ordered TaskGraph candidate units.`;
    case "single-change": return "The accepted scope fits one Change and one Coding Work Package.";
  }
}

function decompositionRecommendationLabel(recommendation: DecompositionRecommendation): string {
  switch (recommendation) {
    case "needs-clarification": return "需要先澄清";
    case "multi-change-candidate": return "可考虑拆成多个 Change";
    case "taskgraph-parallel-candidate": return "可考虑 TaskGraph 并行候选";
    case "taskgraph-sequential": return "建议 TaskGraph 顺序执行";
    case "single-change": return "建议保持单 Change";
  }
}

function renderDecompositionPlanSummary(plan: DecompositionPlan): string {
  return [
    `拆分建议：${decompositionRecommendationLabel(plan.recommendation)}`,
    "",
    plan.rationale,
    "",
    `执行单元：${plan.units.map((unit) => `${unit.id} ${unit.title}`).join("；") || "无需拆分"}`,
    "",
    "确认这个拆分方向只会记录 proposal 接受，不会启动执行。",
  ].join("\n");
}

function renderDecompositionReadinessSummary(manifest: DecompositionReadinessManifest): string {
  return [
    `执行边界检查：${manifest.status}`,
    "",
    `建议：${decompositionRecommendationLabel(manifest.recommendation)}`,
    `下一步允许动作：${manifest.nextAllowedAction}`,
    "",
    `调度资格：${manifest.schedulerEligible ? "可进入后续 TaskQueue proposal" : "不可直接调度"}`,
    "本检查不会启动执行、创建子 Change、TaskRun、AgentTask、worktree 或恢复重放。",
  ].join("\n");
}

function extractConstraintCandidates(prompt: string): string[] {
  const candidates: string[] = [];
  if (/四舍五入|分/.test(prompt)) candidates.push("金额按分处理，涉及折扣时需要明确舍入规则。");
  if (/会员/.test(prompt)) candidates.push("只有会员订单参与会员折扣规则。");
  if (/非会员/.test(prompt)) candidates.push("非会员不打折。");
  if (/100/.test(prompt)) candidates.push("会员订单满 100 元才触发折扣。");
  if (/测试|test/i.test(prompt)) candidates.push("需要补充或更新测试覆盖核心规则。");
  return candidates;
}

function buildAcceptanceCriteria(goal: string, constraints: string[]): string[] {
  const criteria = constraints.length > 0 ? constraints : [goal];
  return criteria.slice(0, 5).map((criterion, index) => `AC-${String(index + 1).padStart(3, "0")}: ${criterion}`);
}

function renderSpecMarkdown(changeId: string, goal: string, constraints: string[], acceptanceCriteria: string[]): string {
  return [
    `# Spec: ${changeId}`,
    "",
    "## Goal",
    "",
    goal,
    "",
    "## Constraints",
    "",
    ...(constraints.length > 0 ? constraints.map((item) => `- ${item}`) : ["- No extra constraints confirmed yet."]),
    "",
    "## Acceptance Criteria",
    "",
    ...acceptanceCriteria.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderImplementationPlanMarkdown(goal: string, tasks: PlanningArtifactBundle["tasks"]): string {
  return [
    "# Plan",
    "",
    "## Approach",
    "",
    `Implement the accepted demand in one Coding Work Package: ${goal}`,
    "",
    "## Tasks",
    "",
    ...tasks.map((task) => `- ${task.id}: ${task.title} (${task.acIds.join(", ")})`),
    "",
    "## Verification",
    "",
    "- Run targeted tests, then independent validation and audit.",
    "",
  ].join("\n");
}

function renderTasksMarkdown(tasks: PlanningArtifactBundle["tasks"]): string {
  return [
    "# Tasks",
    "",
    ...tasks.map((task) => `- [ ] ${task.id}: ${task.title} Covers: ${task.acIds.join(", ")}`),
    "",
  ].join("\n");
}

function renderPlanningBundleSummary(bundle: PlanningArtifactBundle): string {
  return [
    `我准备了方案草案：${bundle.goal}`,
    "",
    `验收标准：${bundle.acceptanceCriteria.join("；")}`,
    `实现方案：${bundle.design}`,
    `任务：${bundle.tasks.map((task) => `${task.id} ${task.title}`).join("；")}`,
    bundle.openQuestions.length > 0 ? `待确认：${bundle.openQuestions.join("；")}` : "如果认可，可以确认执行；如果不认可，可以直接在主对话里要求修改。",
  ].join("\n");
}

function renderPlanningBundleMarkdown(bundle: PlanningArtifactBundle): string {
  return [
    `# Planning Draft ${bundle.id}`,
    "",
    `Status: ${bundle.status}`,
    "",
    "## Goal",
    "",
    bundle.goal,
    "",
    "## Constraints",
    "",
    ...(bundle.constraints.length > 0 ? bundle.constraints.map((item) => `- ${item}`) : ["- None confirmed."]),
    "",
    "## Acceptance Criteria",
    "",
    ...bundle.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "## Design",
    "",
    bundle.design,
    "",
    "## Tasks",
    "",
    ...bundle.tasks.map((task) => `- ${task.id}: ${task.title} (${task.acIds.join(", ")})`),
    "",
    "## Risks",
    "",
    ...bundle.risks.map((item) => `- ${item}`),
    "",
    "## Open Questions",
    "",
    ...(bundle.openQuestions.length > 0 ? bundle.openQuestions.map((item) => `- ${item}`) : ["- None."]),
    "",
  ].join("\n");
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

async function finishOrchestratorRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const next = { ...run, status, exitCode, signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}

async function resolveTopic(project: ManagedProject, changeId: string): Promise<{ memory: ResolvedMemory; changePath: string }> {
  const memory = await resolveProjectMemory(project);
  const roots = [join(memory.changesRoot, "active"), join(memory.changesRoot, "archive")];
  for (const root of roots) {
    const candidate = join(root, changeId);
    if (existsSync(candidate)) {
      return { memory, changePath: relative(memory.memoryRoot, candidate).replace(/\\/g, "/") };
    }
    if (root.endsWith("archive")) {
      const archived = await readdir(root, { withFileTypes: true }).catch(() => []);
      for (const entry of archived) {
        if (!entry.isDirectory()) continue;
        const archivedCandidate = join(root, entry.name);
        const metadata = await readJsonFile(join(archivedCandidate, "change.json"), z.object({ id: z.string().optional() }), { id: undefined }).catch(() => ({ id: undefined }));
        if (metadata.id === changeId) {
          return { memory, changePath: relative(memory.memoryRoot, archivedCandidate).replace(/\\/g, "/") };
        }
      }
    }
  }
  throw new Error(`Topic not found: ${changeId}.`);
}

async function getSingleActiveChangeId(project: ManagedProject): Promise<string> {
  const memory = await resolveProjectMemory(project);
  const active = await getActiveChanges(memory);
  if (active.length !== 1) throw new Error(`Expected exactly one active Topic; found ${active.length}.`);
  return active[0].name;
}

async function readTopicRuntime(memory: ResolvedMemory, changePath: string, changeId: string): Promise<TopicRuntimeMetadata> {
  const projectId = memory.projectId ?? "unregistered";
  const store = await WorkbenchStore.open(memory);
  try {
    const link = store.readCodexSession(projectId, changeId);
    if (link) return { version: "1.0", changeId, codexSessionId: link.codexSessionId, updatedAt: link.updatedAt };
  } finally {
    store.close();
  }
  return readJsonFile(join(memory.memoryRoot, changePath, "topic-runtime.json"), runtimeMetadataSchema, {
    version: "1.0",
    changeId,
    codexSessionId: null,
    updatedAt: new Date(0).toISOString(),
  });
}

async function writeTopicRuntime(memory: ResolvedMemory, changePath: string, metadata: TopicRuntimeMetadata): Promise<void> {
  const store = await WorkbenchStore.open(memory);
  try {
    store.writeCodexSession({
      projectId: memory.projectId ?? "unregistered",
      changeId: metadata.changeId,
      codexSessionId: metadata.codexSessionId,
      updatedAt: metadata.updatedAt,
    });
  } finally {
    store.close();
  }
  await writeJsonFile(join(memory.memoryRoot, changePath, "topic-runtime.json"), metadata);
}

function extractRunId(result: unknown): string | undefined {
  if (isRecord(result) && isRecord(result.run) && typeof result.run.id === "string") return result.run.id;
  if (isRecord(result) && isRecord(result.code) && isRecord(result.code.run) && typeof result.code.run.id === "string") return result.code.run.id;
  if (isRecord(result) && isRecord(result.workflow) && isRecord(result.workflow.code) && isRecord(result.workflow.code.run) && typeof result.workflow.code.run.id === "string") return result.workflow.code.run.id;
  if (isRecord(result) && isRecord(result.result) && isRecord(result.result.run) && typeof result.result.run.id === "string") return result.result.run.id;
  return undefined;
}

function artifactForActionResult(result: unknown): string | null {
  if (isRecord(result) && isRecord(result.package) && Array.isArray(result.package.artifactRefs) && typeof result.package.artifactRefs[0] === "string") return result.package.artifactRefs[0];
  if (isRecord(result) && isRecord(result.summary) && Array.isArray(result.summary.evidenceRefs) && typeof result.summary.evidenceRefs[0] === "string") return result.summary.evidenceRefs[0];
  if (isRecord(result) && isRecord(result.snapshot) && typeof result.snapshot.summaryArtifact === "string") return result.snapshot.summaryArtifact;
  if (isRecord(result) && isRecord(result.result) && Array.isArray(result.result.artifactRefs) && typeof result.result.artifactRefs[0] === "string") return result.result.artifactRefs[0];
  if (isRecord(result) && isRecord(result.readiness) && typeof result.readiness.summaryArtifact === "string") return result.readiness.summaryArtifact;
  if (isRecord(result) && isRecord(result.manifest) && typeof result.manifest.artifact === "string") return result.manifest.artifact;
  if (isRecord(result) && isRecord(result.handoff) && Array.isArray(result.handoff.artifactRefs) && typeof result.handoff.artifactRefs[0] === "string") return result.handoff.artifactRefs[0];
  if (isRecord(result) && isRecord(result.revision) && Array.isArray(result.revision.artifactRefs) && typeof result.revision.artifactRefs[0] === "string") return result.revision.artifactRefs[0];
  if (isRecord(result) && isRecord(result.run) && isRecord(result.run.artifacts) && typeof result.run.artifacts.directory === "string") return result.run.artifacts.directory;
  if (isRecord(result) && isRecord(result.code) && isRecord(result.code.run) && isRecord(result.code.run.artifacts) && typeof result.code.run.artifacts.directory === "string") return result.code.run.artifacts.directory;
  if (isRecord(result) && isRecord(result.workflow) && isRecord(result.workflow.code) && isRecord(result.workflow.code.run) && isRecord(result.workflow.code.run.artifacts) && typeof result.workflow.code.run.artifacts.directory === "string") return result.workflow.code.run.artifacts.directory;
  return null;
}

function summarizeActionResult(actionType: string, result: unknown): string {
  if ((actionType === "landing.prepare" || actionType === "landing.review" || actionType === "landing.refresh") && isRecord(result) && isRecord(result.package)) {
    const summary = typeof result.package.summary === "string" ? result.package.summary : "Landing readiness package updated.";
    return summary;
  }
  if ((actionType === "landing-queue.prepare" || actionType === "landing-queue.refresh") && isRecord(result) && isRecord(result.snapshot)) {
    return typeof result.snapshot.summary === "string" ? result.snapshot.summary : "Landing queue refreshed.";
  }
  if (actionType === "landing-queue.merge-next" && isRecord(result) && isRecord(result.result)) {
    return typeof result.result.summary === "string" ? result.result.summary : "Landing queue merge step completed.";
  }
  if ((actionType === "pr-draft.prepare" || actionType === "pr-draft.create" || actionType === "pr-draft.refresh") && isRecord(result) && isRecord(result.package)) {
    const prUrl = typeof result.package.prUrl === "string" ? ` ${result.package.prUrl}` : "";
    return `Draft PR handoff updated.${prUrl}`;
  }
  if ((actionType === "pr-feedback.refresh" || actionType === "pr-feedback.evaluate" || actionType === "pr-review.feedback-refresh" || actionType === "pr-review.feedback-evaluate") && isRecord(result) && isRecord(result.summary)) {
    return typeof result.summary.summary === "string" ? result.summary.summary : "PR feedback refreshed.";
  }
  if ((actionType === "pr-feedback.rework" || actionType === "pr-review.rework") && isRecord(result)) {
    return "PR feedback rework was routed through the same demand.";
  }
  if (actionType === "pr-review.reply-prepare" && isRecord(result) && isRecord(result.draft)) {
    return "PR review reply draft prepared.";
  }
  if (actionType === "pr-review.reply-submit" && isRecord(result) && isRecord(result.handoff)) {
    return "PR review reply submitted.";
  }
  if (actionType === "pr-review.thread-resolve" && isRecord(result) && isRecord(result.resolution)) {
    return "PR review thread marked as handled.";
  }
  if (actionType === "pr-feedback.update-draft" && isRecord(result) && isRecord(result.package)) {
    const prUrl = typeof result.package.prUrl === "string" ? ` ${result.package.prUrl}` : "";
    return `Draft PR branch updated.${prUrl}`;
  }
  if ((actionType === "pr-review.prepare" || actionType === "pr-review.refresh") && isRecord(result) && isRecord(result.readiness)) {
    return typeof result.readiness.summary === "string" ? result.readiness.summary : "PR review readiness refreshed.";
  }
  if (actionType === "pr-review.submit" && isRecord(result) && isRecord(result.handoff)) {
    const prUrl = typeof result.handoff.prUrl === "string" ? ` ${result.handoff.prUrl}` : "";
    return `Draft PR submitted for human review.${prUrl}`;
  }
  if ((actionType === "remote-landing.prepare" || actionType === "remote-landing.refresh") && isRecord(result) && isRecord(result.readiness)) {
    return typeof result.readiness.summary === "string" ? result.readiness.summary : "Remote landing readiness refreshed.";
  }
  if (actionType === "remote-landing.merge" && isRecord(result) && isRecord(result.result)) {
    const status = typeof result.result.status === "string" ? result.result.status : "completed";
    const prUrl = typeof result.result.prUrl === "string" ? ` ${result.result.prUrl}` : "";
    return `Remote landing ${status}.${prUrl}`;
  }
  if ((actionType === "post-merge.prepare" || actionType === "post-merge.refresh") && isRecord(result) && isRecord(result.handoff)) {
    return typeof result.handoff.summary === "string" ? result.handoff.summary : "Post-merge state refreshed.";
  }
  if (actionType === "post-merge.sync-local.prepare" && isRecord(result) && isRecord(result.readiness)) {
    return typeof result.readiness.summary === "string" ? result.readiness.summary : "Local sync readiness refreshed.";
  }
  if (actionType === "post-merge.sync-local.run" && isRecord(result) && isRecord(result.result)) {
    const status = typeof result.result.status === "string" ? result.result.status : "completed";
    return `Post-merge local sync ${status}.`;
  }
  if (actionType === "post-merge.cleanup-branch.prepare" && isRecord(result) && isRecord(result.readiness)) {
    return typeof result.readiness.summary === "string" ? result.readiness.summary : "Remote branch cleanup readiness refreshed.";
  }
  if (actionType === "post-merge.cleanup-branch.run" && isRecord(result) && isRecord(result.result)) {
    const status = typeof result.result.status === "string" ? result.result.status : "completed";
    return `Post-merge remote branch cleanup ${status}.`;
  }
  if (actionType === "task.run.reconcile" && isRecord(result) && Array.isArray(result.taskRuns)) {
    return `Reconciled ${result.taskRuns.length} TaskRun record(s).`;
  }
  if (actionType === "task.queue.reconcile" && isRecord(result) && Array.isArray(result.queues)) {
    return `Recovered ${result.queues.length} task queue record(s).`;
  }
  if (actionType === "task.queue.start" && isRecord(result) && isRecord(result.queue)) {
    const status = typeof result.queue.status === "string" ? result.queue.status : "completed";
    const completed = typeof result.queue.completedCount === "number" ? result.queue.completedCount : 0;
    const total = typeof result.queue.totalCount === "number" ? result.queue.totalCount : 0;
    return `Task queue finished with status ${status}. Completed ${completed}/${total}.`;
  }
  if (actionType === "code.run" && isRecord(result)) {
    const stoppedAt = typeof result.stoppedAt === "string" && result.stoppedAt ? ` Stopped at ${result.stoppedAt}.` : " Validation and audit sequence completed.";
    return `Coder run was confirmed by the user.${stoppedAt}`;
  }
  if ((actionType === "task.run.start" || actionType === "task.run.retry") && isRecord(result) && isRecord(result.taskRun)) {
    const taskId = typeof result.taskRun.taskId === "string" ? result.taskRun.taskId : "task";
    const status = typeof result.taskRun.status === "string" ? result.taskRun.status : "completed";
    return `TaskRun for ${taskId} finished with status ${status}.`;
  }
  if ((actionType === "planning.generate" || actionType === "planning.revise") && isRecord(result) && isRecord(result.bundle)) {
    return `Planning draft is ready: ${typeof result.bundle.goal === "string" ? result.bundle.goal : "draft bundle"}.`;
  }
  if (actionType === "planning.decomposition.assess-readiness" && isRecord(result) && isRecord(result.manifest)) {
    return typeof result.manifest.status === "string"
      ? `Decomposition readiness assessed: ${result.manifest.status}. No execution was started.`
      : "Decomposition readiness assessed. No execution was started.";
  }
  if (actionType === "planning.taskqueue.propose" && isRecord(result) && isRecord(result.proposal)) {
    return typeof result.proposal.id === "string"
      ? `TaskQueueProposal ${result.proposal.id} generated. No execution was started.`
      : "TaskQueueProposal generated. No execution was started.";
  }
  if (actionType === "planning.workflowgraph.compile" && isRecord(result) && isRecord(result.graph)) {
    return typeof result.graph.id === "string"
      ? `WorkflowGraphPlan ${result.graph.id} compiled. No execution was started.`
      : "WorkflowGraphPlan compiled. No execution was started.";
  }
  if (actionType === "planning.confirm-execution" && isRecord(result)) {
    return "Planning confirmed and canonical artifacts were written. No execution was started.";
  }
  if ((actionType.startsWith("role.pipeline.") || actionType.startsWith("demand.worker.")) && isRecord(result)) {
    const status = typeof result.status === "string" ? result.status : "completed";
    return actionType.startsWith("demand.worker.")
      ? `Demand worker finished with status ${status}.`
      : `Main-agent role orchestration finished with status ${status}.`;
  }
  return `${labelForAction(actionType)} completed.`;
}

function workflowFailureMessage(actionType: string, result: unknown): string | null {
  if (!isRecord(result)) return null;
  const workflow = (actionType === "task.run.start" || actionType === "task.run.retry") && isRecord(result.workflow) ? result.workflow : result;
  if (actionType !== "code.run" && actionType !== "task.run.start" && actionType !== "task.run.retry") return null;
  const stoppedAt = typeof workflow.stoppedAt === "string" ? workflow.stoppedAt : null;
  if (!stoppedAt) return null;
  if (stoppedAt === "code") return "Code workflow stopped because the Coder run did not complete successfully.";
  if (stoppedAt === "validation") return "Code workflow stopped because validation did not pass.";
  if (stoppedAt === "audit") return "Code workflow stopped because audit did not approve the worktree.";
  return `Code workflow stopped at ${stoppedAt}.`;
}

function labelForAction(actionType: string): string {
  switch (actionType) {
    case "change.spec.propose": return "Spec proposal generated";
    case "change.spec.accept": return "Spec proposal accepted";
    case "change.plan.propose": return "Plan proposal generated";
    case "change.plan.accept": return "Plan proposal accepted";
    case "planning.generate": return "Planning draft generated";
    case "planning.revise": return "Planning draft revised";
    case "planning.confirm-execution": return "Planning confirmed";
    case "planning.decompose": return "DecompositionPlan drafted";
    case "planning.decomposition.confirm": return "DecompositionPlan confirmed";
    case "planning.decomposition.assess-readiness": return "Decomposition readiness assessed";
    case "planning.taskqueue.propose": return "TaskQueueProposal generated";
    case "planning.workflowgraph.compile": return "WorkflowGraphPlan compiled";
    case "planning.taskqueue.confirm-start": return "TaskQueueProposal confirmed and started";
    case "orchestrator.evaluate": return "Main orchestrator evaluated";
    case "orchestrator.pump": return "Main orchestrator pumped available demands";
    case "demand.worker.enqueue": return "Demand enqueued";
    case "demand.worker.claim": return "Demand worker claimed";
    case "demand.worker.start-next": return "Demand worker started";
    case "demand.worker.start-available": return "Available demand workers started";
    case "demand.worker.reconcile": return "Demand workers reconciled";
    case "demand.worker.release": return "Demand worker released";
    case "role.pipeline.start": return "Role orchestration started";
    case "role.pipeline.stop": return "Role orchestration stop requested";
    case "role.pipeline.continue": return "Role orchestration continued";
    case "role.pipeline.reconcile": return "Role orchestration reconciled";
    case "conversation.steer": return "Conversation steering recorded";
    case "conversation.interrupt": return "Conversation interrupt requested";
    case "conversation.continue": return "Conversation continued";
    case "result.refresh-rework": return "Result refreshed against latest project state";
    case "result.revalidate": return "Result validation refreshed";
    case "result.reaudit": return "Result audit refreshed";
    case "result.refresh-status": return "Result status refreshed";
    case "apply-check.run": return "Integration check completed";
    case "landing.prepare": return "Landing readiness prepared";
    case "landing.review": return "Landing readiness reviewed";
    case "landing.refresh": return "Landing readiness refreshed";
    case "landing-queue.prepare": return "Landing queue prepared";
    case "landing-queue.refresh": return "Landing queue refreshed";
    case "landing-queue.merge-next": return "Landing queue merged next PR";
    case "landing-queue.skip": return "Landing queue item skipped";
    case "landing-queue.remove-stale": return "Landing queue stale item removed";
    case "pr-draft.prepare": return "PR draft package prepared";
    case "pr-draft.create": return "Draft PR created";
    case "pr-draft.refresh": return "Draft PR refreshed";
    case "pr-feedback.refresh": return "PR feedback refreshed";
    case "pr-feedback.evaluate": return "PR feedback evaluated";
    case "pr-feedback.rework": return "PR feedback rework started";
    case "pr-feedback.update-draft": return "Draft PR updated";
    case "pr-review.prepare": return "PR review readiness prepared";
    case "pr-review.submit": return "Draft PR submitted for review";
    case "pr-review.refresh": return "PR review state refreshed";
    case "pr-review.feedback-refresh": return "PR review feedback refreshed";
    case "pr-review.feedback-evaluate": return "PR review feedback evaluated";
    case "pr-review.rework": return "PR review feedback rework started";
    case "pr-review.reply-prepare": return "PR review reply draft prepared";
    case "pr-review.reply-submit": return "PR review reply submitted";
    case "pr-review.thread-resolve": return "PR review thread resolved";
    case "remote-landing.prepare": return "Remote landing readiness prepared";
    case "remote-landing.merge": return "Remote PR merged";
    case "remote-landing.refresh": return "Remote landing state refreshed";
    case "post-merge.prepare": return "Post-merge state prepared";
    case "post-merge.refresh": return "Post-merge state refreshed";
    case "post-merge.sync-local.prepare": return "Local sync readiness prepared";
    case "post-merge.sync-local.run": return "Local project synchronized";
    case "post-merge.cleanup-branch.prepare": return "Remote branch cleanup readiness prepared";
    case "post-merge.cleanup-branch.run": return "Remote PR branch cleaned up";
    case "code.run": return "Coder run confirmed";
    case "task.run.start": return "Task workflow started";
    case "task.run.retry": return "Task workflow retried";
    case "task.run.reconcile": return "Task runs reconciled";
    case "task.queue.start": return "Task queue started";
    case "task.queue.reconcile": return "Task queue reconciled";
    case "workpad.abandon": return "Workpad abandoned";
    case "validate.run": return "Validation run completed";
    case "audit.run": return "Audit run completed";
    case "spec-test.drift": return "Spec-Test drift checked";
    default: return actionType;
  }
}

export async function recordWorkbenchDecision(project: ManagedProject, input: {
  id: string;
  changeId: string | null;
  decisionType: string;
  status: StoredDecisionRecord["status"];
  label: string;
  summary: string;
  targetId: string | null;
  runId: string | null;
  artifact: string | null;
  actionId: string | null;
  feedback?: string | null;
  payload: unknown;
  completedAt?: string | null;
}): Promise<void> {
  const memory = await resolveProjectMemory(project);
  const now = new Date().toISOString();
  const store = await WorkbenchStore.open(memory);
  try {
    store.upsertDecision({
      id: input.id,
      projectId: memory.projectId ?? "unregistered",
      changeId: input.changeId,
      decisionType: input.decisionType,
      status: input.status,
      label: input.label,
      summary: input.summary,
      targetId: input.targetId,
      runId: input.runId,
      artifact: input.artifact,
      actionId: input.actionId,
      feedback: input.feedback ?? null,
      payloadJson: JSON.stringify(input.payload),
      createdAt: now,
      updatedAt: now,
      completedAt: input.completedAt ?? null,
    });
  } finally {
    store.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow action: ${value}`);
}

