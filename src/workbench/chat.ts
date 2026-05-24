import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { startAuditRun } from "../audit/manager.js";
import { startCodeRun } from "../code/manager.js";
import { buildCodexReadonlyArgv, buildCodexReadonlyResumeArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { createCodexJsonlStreamParser, extractCodexSessionIdFromJsonl, extractFinalMessageFromCodexJsonl, truncateReadablePreview, type CodexJsonlStreamEvent, type CodexReadableEvent } from "../codex/jsonl.js";
import { createChange } from "../change/manager.js";
import { acceptPlanProposal, acceptSpecProposal, startPlanProposalRun, startSpecProposalRun } from "../change/proposals.js";
import { getActiveChanges } from "../ecl/index.js";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { appendRunEvent, buildContextProjection, buildRunId } from "../run/manager.js";
import { executeProcessStreaming } from "../run/process.js";
import { getEnabledSkillContext } from "../skill/catalog.js";
import { getSpecTestDriftReport } from "../spec-test/drift.js";
import { finishTaskRunFromWorkflowResult, markTaskRunStarted, reconcileTaskRuns, retryTaskRun, startTaskRun } from "../task-run/manager.js";
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
  | "code.run"
  | "task.run.start"
  | "task.run.retry"
  | "task.run.reconcile"
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
  taskRunId?: string;
}

export interface WorkbenchWorkflowActionResult {
  actionRunId: string;
  actionType: WorkbenchWorkflowActionType;
  status: "completed" | "failed";
  result?: unknown;
  runId?: string;
  error?: string;
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

export async function createWorkbenchTopic(project: ManagedProject, input: { title: string; body?: string }): Promise<{ changeId: string; title: string }> {
  const result = await createChange(project, { title: input.title, body: input.body });
  await appendTopicThreadEntry(project, result.change.id, {
    type: "user.message",
    text: input.body ?? input.title,
  });
  return { changeId: result.change.id, title: result.change.title };
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
    case "code.run":
      return runCodeValidateAuditSequence(project, request.prompt, live, request.taskIds);
    case "task.run.start":
      return runTaskRunCodeValidateAuditSequence(project, changeId, request, live, "start");
    case "task.run.retry":
      return runTaskRunCodeValidateAuditSequence(project, changeId, request, live, "retry");
    case "task.run.reconcile":
      return reconcileTaskRuns(project, { changeId, taskRunId: request.taskRunId });
    case "validate.run":
      return startValidationRun(project, { worktree: request.worktreeId });
    case "audit.run":
      return startAuditRun(project, { worktreeId: request.worktreeId, prompt: request.prompt });
    case "spec-test.drift":
      return getSpecTestDriftReport(project, { worktreeId: request.worktreeId });
    default:
      return assertNever(request.actionType);
  }
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
    const workflow = await runCodeValidateAuditSequence(project, request.prompt, live, [started.taskRun.taskId], started.taskRun.id);
    const taskRun = await finishTaskRunFromWorkflowResult(memory, started.taskRun.id, workflow);
    return { taskRun, lease: started.lease, workflow };
  } catch (cause) {
    const memory = await resolveProjectMemory(project);
    await finishTaskRunFromWorkflowResult(memory, started.taskRun.id, { stoppedAt: "code", code: { run: { status: "failed" } } }).catch(() => undefined);
    throw cause;
  }
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

async function runCodeValidateAuditSequence(project: ManagedProject, prompt?: string, live?: WorkbenchLiveSink, taskIds?: string[], taskRunId?: string): Promise<unknown> {
  live?.emit({ event: "run.status", data: { status: "running", label: "Coder" } });
  let coderStartedEmitted = false;
  const code = await startCodeRun(project, {
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
  if (code.run.status !== "completed" || !code.run.worktree?.worktreeId) return { code, stoppedAt: "code" };
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: "running", label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: "running" } });
  emitAssistantEvent(live, { runId: code.run.id, kind: "status", phase: "running", title: "Validation running", summary: "AHO started validation for the coder worktree." });
  const validation = await startValidationRun(project, { worktree: code.run.worktree.worktreeId });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: validation.validation.status, label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: validation.validation.status } });
  emitValidationAssistantEvents(live, code.run.id, validation);
  if (validation.validation.status !== "passed") return { code, validation, stoppedAt: "validation" };
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: "running", label: "Audit" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Audit", status: "running" } });
  emitAssistantEvent(live, { runId: code.run.id, kind: "status", phase: "running", title: "Audit running", summary: "AHO started audit after validation passed." });
  const audit = await startAuditRun(project, {
    worktreeId: code.run.worktree.worktreeId,
    prompt: "This audit was automatically started after the user confirmed the Coder run and validation passed for the same worktree.",
  });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: audit.audit.status, label: "Audit" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Audit", status: audit.audit.status } });
  emitAuditAssistantEvent(live, code.run.id, audit);
  return { code, validation, audit, stoppedAt: audit.audit.status === "approved" || audit.audit.status === "approved-with-notes" ? null : "audit" };
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

async function finishOrchestratorRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const next = { ...run, status, exitCode, signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}

async function resolveTopic(project: ManagedProject, changeId: string): Promise<{ memory: ResolvedMemory; changePath: string }> {
  const memory = await resolveProjectMemory(project);
  const active = await getActiveChanges(memory);
  const match = active.find((item) => item.name === changeId);
  if (!match) throw new Error(`Topic not found or not active: ${changeId}.`);
  return { memory, changePath: match.path };
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
  const roots = [join(memory.changesRoot, "active"), join(memory.changesRoot, "parking"), join(memory.changesRoot, "archive")];
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
  if (isRecord(result) && isRecord(result.run) && isRecord(result.run.artifacts) && typeof result.run.artifacts.directory === "string") return result.run.artifacts.directory;
  if (isRecord(result) && isRecord(result.code) && isRecord(result.code.run) && isRecord(result.code.run.artifacts) && typeof result.code.run.artifacts.directory === "string") return result.code.run.artifacts.directory;
  if (isRecord(result) && isRecord(result.workflow) && isRecord(result.workflow.code) && isRecord(result.workflow.code.run) && isRecord(result.workflow.code.run.artifacts) && typeof result.workflow.code.run.artifacts.directory === "string") return result.workflow.code.run.artifacts.directory;
  return null;
}

function summarizeActionResult(actionType: string, result: unknown): string {
  if (actionType === "task.run.reconcile" && isRecord(result) && Array.isArray(result.taskRuns)) {
    return `Reconciled ${result.taskRuns.length} TaskRun record(s).`;
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
    case "code.run": return "Coder run confirmed";
    case "task.run.start": return "Task workflow started";
    case "task.run.retry": return "Task workflow retried";
    case "task.run.reconcile": return "Task runs reconciled";
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
