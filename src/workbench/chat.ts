import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
import { startCodeRun } from "../code/manager.js";
import { buildCodexReadonlyArgv, buildCodexReadonlyResumeArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { detectCodexAppServerCapability, getActiveCodexAppServerTurn, runCodexAppServerTurn, type CodexAppServerNotification } from "../codex/app-server.js";
import { createCodexJsonlStreamParser, extractCodexSessionIdFromJsonl, extractFinalMessageFromCodexJsonl, truncateReadablePreview, type CodexJsonlStreamEvent, type CodexReadableEvent } from "../codex/jsonl.js";
import { createConcurrentChange } from "../change/manager.js";
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
import { finishTaskRunFromWorkflowResult, markTaskRunStarted, reconcileTaskRuns, retryTaskRun, startTaskRun } from "../task-run/manager.js";
import {
  failQueuedTaskItem,
  getNextQueuedTaskQueueItem,
  markTaskQueueItemRunning,
  markTaskQueueRunning,
  pauseTaskQueue,
  reconcileTaskQueues,
  startOrResumeTaskQueue,
  updateTaskQueueAfterItem,
  finishTaskQueueItem,
} from "../task-queue/manager.js";
import { startValidationRun } from "../validation/manager.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../agent/catalog.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, RunStatus } from "../types/index.js";
import { importThreadJsonlIfNeeded, WorkbenchStore, type StoredDecisionRecord, type StoredTopicMessage } from "./store.js";

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

export interface TopicMessageInput {
  mode?: WorkbenchMessageMode;
  message?: string;
  text?: string;
}

export type WorkbenchWorkflowActionType =
  | "chat.ask"
  | "change.spec.propose"
  | "change.spec.accept"
  | "change.plan.propose"
  | "change.plan.accept"
  | "planning.generate"
  | "planning.revise"
  | "planning.confirm-execution"
  | "orchestrator.evaluate"
  | "demand.worker.enqueue"
  | "demand.worker.claim"
  | "demand.worker.start-next"
  | "demand.worker.start-available"
  | "demand.worker.reconcile"
  | "demand.worker.release"
  | "orchestrator.pump"
  | "role.pipeline.start"
  | "role.pipeline.stop"
  | "role.pipeline.continue"
  | "role.pipeline.reconcile"
  | "conversation.steer"
  | "conversation.interrupt"
  | "conversation.continue"
  | "result.refresh-rework"
  | "result.revalidate"
  | "result.reaudit"
  | "result.refresh-status"
  | "apply-check.run"
  | "landing.prepare"
  | "landing.review"
  | "landing.refresh"
  | "code.run"
  | "task.run.start"
  | "task.run.retry"
  | "task.run.reconcile"
  | "task.queue.start"
  | "task.queue.reconcile"
  | "validate.run"
  | "audit.run"
  | "spec-test.drift";

export interface WorkbenchWorkflowActionRequest {
  actionType: WorkbenchWorkflowActionType;
  changeId?: string;
  prompt?: string;
  proposalId?: string;
  worktreeId?: string;
  taskIds?: string[];
  worktreeIds?: string[];
  taskRunId?: string;
  applyCheckId?: string;
  landingPackageId?: string;
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

const runtimeMetadataSchema = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  codexSessionId: z.string().nullable(),
  updatedAt: z.string(),
});
const threadChangeMetadataSchema = z.object({
  id: z.string(),
});
const OFFICIAL_REWORK_BUDGET = 1;

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
  await appendFile(join(memory.memoryRoot, changePath, "thread.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
  const store = await WorkbenchStore.open(memory);
  try {
    store.appendMessage(toStoredMessage(memory, entry));
  } finally {
    store.close();
  }
  return entry;
}

export async function runWorkbenchWorkflowAction(project: ManagedProject, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<WorkbenchWorkflowActionResult> {
  const actionRunId = `action-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const changeId = request.changeId ?? await getSingleActiveChangeId(project);
  const started = await appendTopicThreadEntry(project, changeId, { type: "workflow.started", actionRunId, actionType: request.actionType, status: "running" });
  live?.emit({ event: "topic.message", data: started });
  live?.emit({ event: "run.status", data: { actionRunId, status: "running", label: labelForAction(request.actionType) } });
  const capture = createAssistantTranscriptCapture(live);
  try {
    capture.sink.emit({ event: "run.status", data: { actionRunId, status: "running", label: labelForAction(request.actionType) } });
    const result = await executeWorkflowAction(project, changeId, request, capture.sink);
    const runId = extractRunId(result);
    const failureMessage = workflowFailureMessage(request.actionType, result);
    const finalStatus = failureMessage ? "failed" : "completed";
    capture.sink.emit({ event: "run.status", data: { runId, actionRunId, status: finalStatus, label: labelForAction(request.actionType) } });
    const completed = await appendTopicThreadEntry(project, changeId, {
      type: failureMessage ? "workflow.failed" : "workflow.completed",
      actionRunId,
      actionType: request.actionType,
      status: finalStatus,
      runId,
      error: failureMessage ?? undefined,
      text: capture.text.trim() || undefined,
      activity: capture.activity,
      blocks: capture.blocks,
    });
    live?.emit({ event: "topic.message", data: completed });
    if (failureMessage) live?.emit({ event: "error", data: { message: failureMessage, runId, actionRunId } });
    await recordWorkbenchDecision(project, {
      id: `workflow:${actionRunId}`,
      changeId,
      decisionType: request.actionType,
      status: finalStatus,
      label: labelForAction(request.actionType),
      summary: failureMessage ?? summarizeActionResult(request.actionType, result),
      targetId: request.proposalId ?? request.worktreeId ?? null,
      runId: runId ?? null,
      artifact: artifactForActionResult(result),
      actionId: request.actionType,
      payload: result,
      completedAt: new Date().toISOString(),
    });
    return { actionRunId, actionType: request.actionType, status: finalStatus, result, runId, error: failureMessage ?? undefined };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    capture.sink.emit({ event: "error", data: { message: error, actionRunId } });
    const failed = await appendTopicThreadEntry(project, changeId, { type: "workflow.failed", actionRunId, actionType: request.actionType, status: "failed", error, text: capture.text.trim() || undefined, activity: capture.activity, blocks: capture.blocks });
    live?.emit({ event: "topic.message", data: failed });
    return { actionRunId, actionType: request.actionType, status: "failed", error };
  }
}

export async function getWorkbenchActionEvents(project: ManagedProject, actionRunId: string): Promise<TopicThreadEntry[]> {
  const memory = await resolveProjectMemory(project);
  if (!existsSync(join(memory.changesRoot, "active"))) return [];
  const entries = await collectAllThreadEntries(memory);
  return entries.filter((entry) => entry.actionRunId === actionRunId);
}

async function executeWorkflowAction(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<unknown> {
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
      return runRolePipelineSequence(project, changeId, request.prompt, live, request.actionType === "role.pipeline.continue");
    case "role.pipeline.stop":
      return stopRunningPipeline(project, changeId, request.prompt, live);
    case "role.pipeline.reconcile":
      return reconcileTaskRuns(project, { changeId, taskRunId: request.taskRunId });
    case "conversation.steer":
      return steerConversation(project, changeId, request.prompt, live);
    case "conversation.interrupt":
      return interruptConversation(project, changeId, request.prompt, live);
    case "conversation.continue":
      return runRolePipelineSequence(project, changeId, request.prompt, live, true);
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
    case "code.run":
      return runCodeValidateAuditSequence(project, changeId, request.prompt, live, request.taskIds);
    case "task.run.start":
      return runTaskRunCodeValidateAuditSequence(project, changeId, request, live, "start");
    case "task.run.retry":
      return runTaskRunCodeValidateAuditSequence(project, changeId, request, live, "retry");
    case "task.run.reconcile":
      return reconcileTaskRuns(project, { changeId, taskRunId: request.taskRunId });
    case "task.queue.start":
      return runTaskQueueSequence(project, changeId, request, live);
    case "task.queue.reconcile":
      return reconcileTaskQueues(project, { changeId });
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
      roleId: "coder-agent",
      kind: "foreground",
      summary: "Start implementation from confirmed planning artifacts.",
      inputArtifacts: [confirmed.artifact],
    },
    reason: "The user confirmed the planning artifact bundle; implementation can start in an AHO-owned worktree.",
  });
  await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "planning-confirmed",
    text: "已确认执行：方案草案已写入内部 spec/plan/tasks/ac-map，需求已交给本地主 orchestrator 排队处理。",
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
  const queued = await enqueueDemandWorker(memory, {
    changeId,
    waitingReason: "用户已确认执行，等待本地处理槽位。",
  });
  emitAssistantEvent(live, {
    runId: queued.worker.id,
    kind: "status",
    phase: queued.resumed ? "demand-worker-resumed" : "demand-worker-enqueued",
    title: queued.resumed ? "Demand already queued" : "Demand enqueued",
    summary: queued.resumed ? "该需求已经在本地处理队列中。" : "该需求已加入本地处理队列。",
  });
  return pumpDemandWorkersForAction(project, request.prompt ?? renderPipelinePromptFromBundle(confirmed), live, changeId);
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
    summary: "本地主 orchestrator 已领取该需求，开始执行角色流水线。",
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
    const result = await runRolePipelineSequence(project, changeId, prompt, live, false);
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
      summary: `Role pipeline failed: ${message}`,
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
  if (!isRecord(result)) return "Role pipeline completed and produced result review evidence.";
  if (typeof result.status === "string") {
    if (result.status === "completed") return "Role pipeline completed and produced result review evidence.";
    if (result.status === "needs-user-input") return `Role pipeline needs user input${typeof result.stoppedAt === "string" ? ` after ${result.stoppedAt}` : ""}.`;
    if (result.status === "failed") return "Role pipeline failed before result review.";
  }
  return "Role pipeline finished with recorded evidence.";
}

async function runRolePipelineSequence(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  continuation: boolean,
): Promise<unknown> {
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "status",
    phase: "role-pipeline",
    title: continuation ? "Role pipeline continued" : "Role pipeline started",
    summary: "AHO is running coder-agent, validator, and auditor in sequence.",
  });
  const first = await runCodeValidateAuditSequence(project, changeId, prompt, live);
  const stoppedAt = isRecord(first) && typeof first.stoppedAt === "string" ? first.stoppedAt : null;
  if (!stoppedAt) return { status: "completed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0 };
  if (stoppedAt === "code") return { status: "failed", attempts: [{ kind: "initial", result: first }], reworkUsed: 0, requiresUserInput: true };
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "status",
    phase: "automatic-rework",
    title: "Automatic rework started",
    summary: `${stoppedAt} did not pass, so AHO is sending the evidence back to rework-coder once.`,
    isError: true,
  });
  const reworkPrompt = [
    "Use the failed official validation/audit evidence from the previous attempt.",
    "Repair only the accepted demand in the assigned worktree.",
    "Do not change canonical planning artifacts.",
    prompt ?? "",
  ].join("\n\n");
  const second = await runCodeValidateAuditSequence(project, changeId, reworkPrompt, live, undefined, undefined, "rework-coder");
  const secondStoppedAt = isRecord(second) && typeof second.stoppedAt === "string" ? second.stoppedAt : null;
  return {
    status: secondStoppedAt ? "needs-user-input" : "completed",
    attempts: [
      { kind: "initial", result: first },
      { kind: "automatic-rework", result: second },
    ],
    reworkUsed: 1,
    requiresUserInput: Boolean(secondStoppedAt),
    stoppedAt: secondStoppedAt,
  };
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
    const workflow = await runCodeValidateAuditSequence(project, started.taskRun.changeId, prompt, live, [started.taskRun.taskId], started.taskRun.id);
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
      const rework = await executeStartedTaskRunWorkflow(project, retry, reworkPrompt, live);
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
  const start = await startOrResumeTaskQueue(project, { changeId });
  let queue = start.queue;
  if (start.resumed) {
    const reconciled = await reconcileTaskQueues(project, { changeId, queueRunId: queue.id });
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
      return { queue, items: (await reconcileTaskQueues(project, { changeId, queueRunId: queue.id })).items };
    }
    if (live?.isClosed?.()) {
      queue = await pauseTaskQueue(memory, queue, "队列已暂停，等待继续。");
      return { queue, items: (await reconcileTaskQueues(project, { changeId, queueRunId: queue.id })).items };
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
      const started = await startTaskRun(project, { changeId, taskId: nextItem.taskId });
      await markTaskQueueItemRunning(memory, nextItem, started.taskRun);
      const result = await executeStartedTaskRunWorkflow(project, started, request.prompt, live);
      const taskRun = isRecord(result) && isRecord(result.taskRun) ? result.taskRun : null;
      if (!isTaskRunLike(taskRun)) throw new Error(`Task ${nextItem.taskId} did not return a TaskRun result.`);
      const finishedItem = await finishTaskQueueItem(memory, nextItem, taskRun);
      queue = await updateTaskQueueAfterItem(memory, queue);
      if (finishedItem.status === "blocked" || finishedItem.status === "failed") {
        emitAssistantEvent(live, {
          runId: queue.id,
          kind: "error",
          phase: finishedItem.status,
          title: "任务队列已停止",
          summary: queue.blockedReason ?? queue.failureReason ?? `${finishedItem.taskId} 未完成。`,
        });
        return { queue, items: (await reconcileTaskQueues(project, { changeId, queueRunId: queue.id })).items };
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
      return { queue, items: (await reconcileTaskQueues(project, { changeId, queueRunId: queue.id })).items };
    }

    if (live?.isClosed?.()) {
      queue = await pauseTaskQueue(memory, queue, "队列已暂停，等待继续。");
      return { queue, items: (await reconcileTaskQueues(project, { changeId, queueRunId: queue.id })).items };
    }
    if (queue.status === "blocked" || queue.status === "failed" || queue.status === "completed") {
      return { queue, items: (await reconcileTaskQueues(project, { changeId, queueRunId: queue.id })).items };
    }
  }
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

async function runCodeValidateAuditSequence(
  project: ManagedProject,
  changeId: string,
  prompt?: string,
  live?: WorkbenchLiveSink,
  taskIds?: string[],
  taskRunId?: string,
  coderRoleId = "coder-agent",
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  const coderTask = await createAgentTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: coderRoleId,
    kind: "foreground",
    summary: coderRoleId === "rework-coder" ? "Repair implementation from validation or audit evidence." : "Implement the confirmed demand in an AHO-owned worktree.",
    inputArtifacts: taskRunId ? [taskRunId] : [],
  });
  await recordMainAgentDecision(memory, {
    changeId,
    recommendedAction: coderRoleId === "rework-coder" ? "rework-coder" : "coder-agent",
    userMessage: coderRoleId === "rework-coder" ? "自动修改未通过结果" : "开始实现",
    requiresUserDecision: false,
    createTask: {
      roleId: coderRoleId,
      kind: "foreground",
      summary: coderTask.summary,
      inputArtifacts: coderTask.inputArtifacts,
    },
    reason: coderRoleId === "rework-coder"
      ? "Official validation or audit evidence requires bounded automatic rework."
      : "The demand has confirmed planning artifacts and can move to implementation.",
  });
  live?.emit({ event: "run.status", data: { status: "running", label: "Coder" } });
  let coderStartedEmitted = false;
  const code = await startCodeRun(project, {
    changeId,
    prompt,
    taskIds,
    taskRunId,
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
  if (code.run.status !== "completed" || !code.run.worktree?.worktreeId) {
    await completeAgentTask(memory, coderTask, {
      status: "failed",
      summary: "Coder did not produce a completed worktree proposal.",
      artifactRefs: [code.run.artifacts.directory],
      failureClassification: "code-failure",
      requiresUserInputReason: "Implementation failed before official validation could run.",
    });
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Coder task failed before validation.",
      artifactRefs: [code.run.artifacts.directory],
    });
    return { code, stoppedAt: "code" };
  }
  await completeAgentTask(memory, coderTask, {
    status: "completed",
    summary: "Coder produced a completed worktree proposal.",
    artifactRefs: compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation),
    nextRecommendation: "Run independent validation.",
  });
  const validatorTask = await createAgentTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "validator",
    kind: "foreground",
    summary: "Run independent mechanical validation for the coder worktree.",
    inputArtifacts: [code.run.artifacts.directory],
  });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: "running", label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: "running" } });
  emitAssistantEvent(live, { runId: code.run.id, kind: "status", phase: "running", title: "Validation running", summary: "AHO started validation for the coder worktree." });
  const validation = await startValidationRun(project, { changeId, worktree: code.run.worktree.worktreeId });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: validation.validation.status, label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: validation.validation.status } });
  emitValidationAssistantEvents(live, code.run.id, validation);
  if (validation.validation.status !== "passed") {
    await completeAgentTask(memory, validatorTask, {
      status: "failed",
      summary: "Independent validation failed.",
      artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr),
      failureClassification: "validation-failure",
      requiresUserInputReason: "Validation failed; bounded automatic rework may be attempted.",
    });
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Validation failed for a foreground role pipeline attempt.",
      artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stderr),
    });
    return { code, validation, stoppedAt: "validation" };
  }
  await completeAgentTask(memory, validatorTask, {
    status: "completed",
    summary: "Independent validation passed.",
    artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout),
    nextRecommendation: "Run semantic audit.",
  });
  const auditorTask = await createAgentTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "auditor-agent",
    kind: "foreground",
    summary: "Run independent semantic audit for the validated worktree.",
    inputArtifacts: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout),
  });
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
  await completeAgentTask(memory, auditorTask, {
    status: audit.audit.status === "approved" || audit.audit.status === "approved-with-notes" ? "completed" : "failed",
    summary: audit.audit.status === "approved" || audit.audit.status === "approved-with-notes"
      ? "Independent audit accepted the validated worktree evidence."
      : "Independent audit did not accept the worktree evidence.",
    artifactRefs: compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage),
    nextRecommendation: audit.audit.status === "approved" || audit.audit.status === "approved-with-notes" ? "Show result review and apply handoff." : "Attempt bounded automatic rework if budget remains.",
    ...(audit.audit.status === "approved" || audit.audit.status === "approved-with-notes" ? {} : { failureClassification: "audit-failure", requiresUserInputReason: "Audit did not accept the current evidence." }),
  });
  if (!(audit.audit.status === "approved" || audit.audit.status === "approved-with-notes")) {
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Audit did not accept foreground role pipeline evidence.",
      artifactRefs: compactArtifactRefs(audit.audit.artifacts.auditMarkdown),
    });
  }
  return { code, validation, audit, stoppedAt: audit.audit.status === "approved" || audit.audit.status === "approved-with-notes" ? null : "audit" };
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
  const status = await import("../change/manager.js").then((module) => module.getChangeStatus(project));
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
  const status = await import("../change/manager.js").then((module) => module.getChangeStatus(project));
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

function renderPipelinePromptFromBundle(bundle: PlanningArtifactBundle): string {
  return [
    "# Accepted Planning Bundle",
    "",
    renderPlanningBundleMarkdown(bundle),
    "",
    "Implement this demand in the assigned worktree, run targeted self-tests, and leave final apply/merge to AHO human confirmation.",
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

async function readThreadLog(memory: ResolvedMemory, changePath: string): Promise<TopicThreadEntry[]> {
  const changeId = await readCanonicalChangeId(memory, changePath);
  const projectId = memory.projectId ?? "unregistered";
  await importThreadJsonlIfNeeded(memory, projectId, changeId, changePath);
  const store = await WorkbenchStore.open(memory);
  try {
    const rows = store.listMessages(projectId, changeId);
    if (rows.length > 0) return rows.map(fromStoredMessage);
  } finally {
    store.close();
  }
  const path = join(memory.memoryRoot, changePath, "thread.jsonl");
  if (!existsSync(path)) return [];
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => ({ ...(JSON.parse(line) as TopicThreadEntry), position: index + 1 }));
}

async function readCanonicalChangeId(memory: ResolvedMemory, changePath: string): Promise<string> {
  const fallback = changePath.split(/[\\/]/).at(-1) ?? "";
  const metadata = await readJsonFile(join(memory.memoryRoot, changePath, "change.json"), threadChangeMetadataSchema, { id: fallback });
  return metadata.id;
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

async function collectAllThreadEntries(memory: ResolvedMemory): Promise<TopicThreadEntry[]> {
  if (memory.projectId) {
    const store = await WorkbenchStore.open(memory);
    try {
      const rows = store.listAllMessages(memory.projectId);
      if (rows.length > 0) return rows.map(fromStoredMessage);
    } finally {
      store.close();
    }
  }
  const roots = [join(memory.changesRoot, "active"), join(memory.changesRoot, "archive")];
  const entries: TopicThreadEntry[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const changePath = relative(memory.memoryRoot, join(root, entry.name)).replace(/\\/g, "/");
      entries.push(...await readThreadLog(memory, changePath));
    }
  }
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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
  if ((actionType === "planning.confirm-execution" || actionType.startsWith("role.pipeline.") || actionType.startsWith("demand.worker.")) && isRecord(result)) {
    const status = typeof result.status === "string" ? result.status : "completed";
    return actionType.startsWith("demand.worker.") || actionType === "planning.confirm-execution"
      ? `Demand worker finished with status ${status}.`
      : `Role pipeline finished with status ${status}.`;
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
    case "planning.confirm-execution": return "Planning confirmed and demand enqueued";
    case "orchestrator.evaluate": return "Main orchestrator evaluated";
    case "orchestrator.pump": return "Main orchestrator pumped available demands";
    case "demand.worker.enqueue": return "Demand enqueued";
    case "demand.worker.claim": return "Demand worker claimed";
    case "demand.worker.start-next": return "Demand worker started";
    case "demand.worker.start-available": return "Available demand workers started";
    case "demand.worker.reconcile": return "Demand workers reconciled";
    case "demand.worker.release": return "Demand worker released";
    case "role.pipeline.start": return "Role pipeline started";
    case "role.pipeline.stop": return "Role pipeline stop requested";
    case "role.pipeline.continue": return "Role pipeline continued";
    case "role.pipeline.reconcile": return "Role pipeline reconciled";
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

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow action: ${value}`);
}

function toStoredMessage(memory: ResolvedMemory, entry: TopicThreadEntry): Omit<StoredTopicMessage, "position"> {
  return {
    id: entry.id,
    projectId: memory.projectId ?? "unregistered",
    changeId: entry.changeId,
    type: entry.type,
    timestamp: entry.timestamp,
    text: entry.text ?? null,
    actionRunId: entry.actionRunId ?? null,
    actionType: entry.actionType ?? null,
    status: entry.status ?? null,
    runId: entry.runId ?? null,
    artifact: entry.artifact ?? null,
    error: entry.error ?? null,
    rawJson: JSON.stringify(entry),
  };
}

function fromStoredMessage(row: StoredTopicMessage): TopicThreadEntry {
  const raw = parseStoredRawJson(row.rawJson);
  return {
    id: row.id,
    type: row.type as TopicThreadEventType,
    timestamp: row.timestamp,
    changeId: row.changeId,
    text: row.text ?? undefined,
    actionRunId: row.actionRunId ?? undefined,
    actionType: row.actionType ?? undefined,
    status: row.status ?? undefined,
    runId: row.runId ?? undefined,
    artifact: row.artifact ?? undefined,
    error: row.error ?? undefined,
    planCard: isPlanCard(raw.planCard) ? raw.planCard : undefined,
    activity: Array.isArray(raw.activity) ? raw.activity.filter(isAssistantTurnActivity) : undefined,
    blocks: Array.isArray(raw.blocks) ? raw.blocks.filter(isAssistantTurnBlock) : undefined,
    intake: raw.intake,
    clarification: raw.clarification,
    position: row.position,
  };
}

function parseStoredRawJson(rawJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isPlanCard(value: unknown): value is OrchestrationPlanCard {
  return isRecord(value) && typeof value.title === "string" && typeof value.summary === "string" && Array.isArray(value.steps);
}

function isAssistantTurnActivity(value: unknown): value is AssistantTurnActivity {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.timestamp !== "string") return false;
  if (value.kind === "status") return typeof value.label === "string";
  if (value.kind === "assistant-event") return isWorkbenchAssistantEvent(value.event);
  if (value.kind === "tool") return isRecord(value.tool) && typeof value.tool.runId === "string";
  if (value.kind === "usage") return isRecord(value.usage);
  if (value.kind === "error") return typeof value.message === "string";
  return false;
}

function isAssistantTurnBlock(value: unknown): value is AssistantTurnBlock {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.sequence !== "number" || typeof value.timestamp !== "string") return false;
  if (!isAssistantTurnBlockKind(value.kind) || typeof value.source !== "string") return false;
  if (value.children !== undefined && (!Array.isArray(value.children) || !value.children.every(isAssistantTurnBlock))) return false;
  if (value.planCard !== undefined && !isPlanCard(value.planCard)) return false;
  return true;
}

function isAssistantTurnBlockKind(value: unknown): value is AssistantTurnBlockKind {
  return typeof value === "string" && [
    "prose",
    "status",
    "command-group",
    "command",
    "tool-result",
    "file-change",
    "reasoning-summary",
    "plan-card",
    "workflow-evidence",
    "usage",
    "error",
  ].includes(value);
}

function isWorkbenchAssistantEvent(value: unknown): value is WorkbenchAssistantEvent {
  return isRecord(value) && typeof value.runId === "string" && typeof value.kind === "string";
}
