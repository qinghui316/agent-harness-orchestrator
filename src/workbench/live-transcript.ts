import type { AssistantTurnActivity, AssistantTurnBlock, AssistantTurnBlockKind, WorkbenchAssistantEvent, WorkbenchLiveEvent, WorkbenchLiveIdentity, WorkbenchLiveSink, WorkbenchLiveToolEvent } from "./types.js";
import { composeAgentDisplayLabel } from "../agent-display-label.js";

export function createAssistantTranscriptCapture(live: WorkbenchLiveSink | undefined): AssistantTranscriptCapture {
  const activity: AssistantTurnActivity[] = [];
  const blocks: AssistantTurnBlock[] = [];
  const childCaptures = new Map<string, ChildTranscriptCapture>();
  let sequence = 0;

  function nextSequence(): number {
    sequence += 1;
    return sequence;
  }

  function appendProseTo(target: AssistantTurnBlock[], delta: string, identity: { runId?: string; threadId?: string; turnId?: string; itemId?: string } = {}): void {
    if (!delta) return;
    const last = target.at(-1);
    if (last?.kind === "prose" && last.source === "codex" && (!identity.itemId || !last.itemId || last.itemId === identity.itemId)) {
      last.text = `${last.text ?? ""}${delta}`;
      return;
    }
    const currentSequence = nextSequence();
    upsertTranscriptBlock(target, {
      id: `prose:${identity.runId ?? "assistant"}:${identity.threadId ?? "main"}:${identity.itemId ?? currentSequence}`,
      runId: identity.runId,
      threadId: identity.threadId,
      turnId: identity.turnId,
      itemId: identity.itemId,
      sequence: currentSequence,
      kind: "prose",
      timestamp: new Date().toISOString(),
      source: "codex",
      text: delta,
    });
  }

  function appendProse(delta: string, identity: { runId?: string; threadId?: string; turnId?: string; itemId?: string } = {}): void {
    appendProseTo(blocks, delta, identity);
  }

  function childCaptureFor(identity: WorkbenchLiveIdentity): ChildTranscriptCapture | null {
    if (!identity.threadId || !identity.agentRoleId || identity.agentRoleId === "main-agent") return null;
    if (identity.agentDisplayName) {
      const targetSurfaceId = `thread:${identity.threadId}`;
      const targetDisplayName = composeAgentDisplayLabel(identity.agentRoleId, identity.agentDisplayName);
      for (const block of blocks) {
        if (block.targetAgentSurfaceId === targetSurfaceId) block.targetAgentDisplayName = targetDisplayName;
      }
    }
    const exactKey = childCaptureIdentity(identity.threadId, identity.turnId);
    let existing = childCaptures.get(exactKey);
    if (!existing && identity.turnId) {
      const provisionalKey = childCaptureIdentity(identity.threadId);
      const provisional = childCaptures.get(provisionalKey);
      if (provisional) {
        childCaptures.delete(provisionalKey);
        provisional.turnId = identity.turnId;
        childCaptures.set(exactKey, provisional);
        existing = provisional;
      }
    }
    if (!existing && !identity.turnId) {
      const matching = [...childCaptures.values()].filter((capture) => capture.threadId === identity.threadId);
      const active = matching.filter((capture) => !childCaptureIsTerminal(capture));
      if (active.length === 1) existing = active[0];
    }
    if (existing) {
      existing.runId = identity.runId ?? existing.runId;
      existing.parentThreadId = identity.parentThreadId ?? existing.parentThreadId;
      existing.turnId = identity.turnId ?? existing.turnId;
      existing.displayName = identity.agentDisplayName ?? existing.displayName;
      return existing;
    }
    const created: ChildTranscriptCapture = {
      runId: identity.runId,
      threadId: identity.threadId,
      parentThreadId: identity.parentThreadId,
      turnId: identity.turnId,
      roleId: identity.agentRoleId,
      displayName: identity.agentDisplayName,
      activity: [],
      blocks: [],
    };
    childCaptures.set(exactKey, created);
    return created;
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
    childCaptures,
    sink: {
      emit(event: WorkbenchLiveEvent): void {
        const timestamp = new Date().toISOString();
        if (event.event === "run.started") {
          const target = childCaptureFor(event.data)?.activity ?? activity;
          target.push({
            kind: "status",
            label: "started",
            detail: event.data.runtime ?? event.data.actionType,
            timestamp,
          });
        } else if (event.event === "run.status") {
          const target = childCaptureFor(event.data)?.activity ?? activity;
          target.push({
            kind: "status",
            label: event.data.status,
            detail: event.data.label,
            timestamp,
          });
        } else if (event.event === "assistant.delta") {
          const child = childCaptureFor(event.data);
          if (child) {
            appendProseTo(child.blocks, event.data.delta, event.data);
          } else {
            capture.text += event.data.delta;
            appendProse(event.data.delta, event.data);
          }
        } else if (event.event === "assistant.event") {
          const child = childCaptureFor(event.data);
          if (child) {
            child.activity.push({ kind: "assistant-event", event: { ...event.data, timestamp: event.data.timestamp ?? timestamp }, timestamp });
            const block = assistantEventToBlock({ ...event.data, timestamp: event.data.timestamp ?? timestamp }, timestamp, nextSequence());
            if (block) upsertTranscriptBlock(child.blocks, block);
          } else {
            activity.push({
              kind: "assistant-event",
              event: { ...event.data, timestamp: event.data.timestamp ?? timestamp },
              timestamp,
            });
            appendAssistantEventBlock({ ...event.data, timestamp: event.data.timestamp ?? timestamp }, timestamp);
          }
        } else if (event.event === "tool.event") {
          const child = childCaptureFor(event.data);
          if (child) {
            child.activity.push({ kind: "tool", tool: event.data, timestamp });
            const block = toolEventToBlock(event.data, timestamp, nextSequence());
            if (block) upsertTranscriptBlock(child.blocks, block);
          } else {
            activity.push({ kind: "tool", tool: event.data, timestamp });
            appendToolEventBlock(event.data, timestamp);
          }
        } else if (event.event === "usage" && isRecord(event.data.usage)) {
          const child = childCaptureFor(event.data);
          const targetActivity = child?.activity ?? activity;
          const targetBlocks = child?.blocks ?? blocks;
          targetActivity.push({ kind: "usage", usage: event.data.usage, timestamp });
          const currentSequence = nextSequence();
          upsertTranscriptBlock(targetBlocks, {
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
          if (isTransientReconnectMessage(event.data.message)) {
            activity.push({ kind: "status", label: "connecting", detail: "正在重新连接", timestamp });
            emitLive(live, { event: "run.status", data: { ...event.data, status: "connecting", label: "正在重新连接" } });
            return;
          }
          const child = childCaptureFor(event.data);
          const targetActivity = child?.activity ?? activity;
          const targetBlocks = child?.blocks ?? blocks;
          targetActivity.push({ kind: "error", message: event.data.message, timestamp });
          const currentSequence = nextSequence();
          targetBlocks.push({
            id: `error:${event.data.runId ?? event.data.actionRunId ?? "assistant"}:${currentSequence}`,
            runId: event.data.runId,
            sequence: currentSequence,
            kind: "error",
            timestamp,
            source: "codex",
            title: isConnectionFailureMessage(event.data.message) ? "连接失败" : "运行出错",
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
  childCaptures: Map<string, ChildTranscriptCapture>;
}

export interface ChildTranscriptCapture {
  runId?: string;
  threadId: string;
  parentThreadId?: string;
  turnId?: string;
  roleId: string;
  displayName?: string;
  activity: AssistantTurnActivity[];
  blocks: AssistantTurnBlock[];
}

export function childTranscriptCapturesForThread(
  captures: Map<string, ChildTranscriptCapture>,
  threadId: string,
): ChildTranscriptCapture[] {
  return [...captures.values()]
    .filter((capture) => capture.threadId === threadId)
    .sort((left, right) => childCaptureTimestamp(left).localeCompare(childCaptureTimestamp(right)));
}

function childCaptureIdentity(threadId: string, turnId?: string): string {
  return `${threadId}:${turnId ?? "pending"}`;
}

function childCaptureTimestamp(capture: ChildTranscriptCapture): string {
  return capture.blocks[0]?.timestamp ?? capture.activity[0]?.timestamp ?? "";
}

function childCaptureIsTerminal(capture: ChildTranscriptCapture): boolean {
  return capture.activity.some((activity) => activity.kind === "status"
    && (activity.label === "completed" || activity.label === "failed" || activity.label === "blocked"));
}

function assistantEventToBlock(event: WorkbenchAssistantEvent, timestamp: string, sequence: number): AssistantTurnBlock | null {
  if (!isMainThreadAssistantStatus(event)) return null;
  const kind = assistantEventBlockKind(event.kind);
  const text = event.summary ?? (kind === "usage" ? undefined : event.preview);
  return {
    id: `assistant:${event.runId}:${event.threadId ?? "main"}:${event.itemId ?? event.kind}:${event.kind}`,
    runId: event.runId,
    threadId: event.threadId,
    turnId: event.turnId,
    sequence,
    kind,
    timestamp: event.timestamp ?? timestamp,
    source: "codex",
    status: event.status ?? event.phase,
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
    targetAgentSurfaceId: event.targetAgentSurfaceId,
    targetAgentDisplayName: event.targetAgentDisplayName,
  };
}

function toolEventToBlock(event: WorkbenchLiveToolEvent, timestamp: string, sequence: number): AssistantTurnBlock | null {
  if (event.phase === "stderr") return null;
  if (!event.command && event.phase === "status" && !event.isError) return null;
  return {
    id: `tool:${event.runId}:${event.threadId ?? "main"}:${event.itemId ?? normalizeCommandKey(event.command ?? event.name)}`,
    runId: event.runId,
    threadId: event.threadId,
    turnId: event.turnId,
    sequence,
    kind: event.command ? "command" : "status",
    timestamp,
    source: "codex",
    status: event.status ?? event.phase,
    title: event.command
      ? commandResultTitle(event.status ?? event.phase)
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
  const reasoningDelta = existing.kind === "reasoning-summary" && incoming.kind === "reasoning-summary" && incoming.status === "updated";
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    sequence: existing.sequence,
    timestamp: existing.timestamp,
    threadId: incoming.threadId ?? existing.threadId,
    turnId: incoming.turnId ?? existing.turnId,
    text: reasoningDelta ? `${existing.text ?? ""}${incoming.text ?? ""}` : incoming.text ?? existing.text,
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
  const threadId = block.threadId ?? "main";
  if (block.kind === "usage") return `usage:${runId}`;
  if (block.kind === "error") return `error:${runId}:${normalizeBlockText(block.text ?? block.preview ?? block.title)}`;
  if (block.kind === "workflow-evidence") return `workflow-evidence:${runId}:${block.artifactRef ?? block.title ?? block.status ?? block.id}`;
  if (block.kind === "command") {
    if (block.itemId) return `command:${runId}:${threadId}:item:${block.itemId}`;
    return `command:${runId}:${threadId}:command:${normalizeCommandKey(block.command)}`;
  }
  return block.itemId ? `${block.kind}:${runId}:${threadId}:item:${block.itemId}` : `${block.id}:${block.kind}`;
}

function commandResultTitle(status: string | undefined): string {
  if (status === "failed") return "Command failed";
  if (status === "completed") return "Command completed";
  return "Command started";
}

function normalizeCommandKey(command: string | undefined): string {
  return (command ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeBlockText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function assistantEventBlockKind(kind: WorkbenchAssistantEvent["kind"]): AssistantTurnBlockKind {
  if (kind === "plan-update") return "prose";
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
  if (isAgentLifecycleStatus(normalized)) return true;
  if (normalized.includes("codex thread started")) return false;
  if (normalized.includes("codex initialized the thread")) return false;
  if (normalized.includes("codex turn running")) return false;
  if (normalized.includes("codex started processing the turn")) return false;
  if (normalized.includes("codex turn completed")) return false;
  return Boolean(event.isError) || normalized.includes("validation") || normalized.includes("audit") || normalized.includes("failed") || normalized.includes("blocked");
}

function isAgentLifecycleStatus(normalized: string): boolean {
  return normalized.includes("agent-task-created")
    || normalized.includes("agent-running")
    || normalized.includes("agent-completed")
    || normalized.includes("planning-agent")
    || normalized.includes("coder")
    || normalized.includes("validator")
    || normalized.includes("auditor")
    || normalized.includes("rework");
}

function emitLive(live: WorkbenchLiveSink | undefined, event: WorkbenchLiveEvent): void {
  try {
    live?.emit(event);
  } catch {
    // Live transport is best-effort; persisted thread/run artifacts remain canonical.
  }
}

function formatUsageSummary(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const pieces = [
    input === undefined ? null : `${input} input tokens`,
    output === undefined ? null : `${output} output tokens`,
  ].filter((item): item is string => Boolean(item));
  return pieces.length > 0 ? `Usage: ${pieces.join(" ? ")}` : "Usage recorded";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTransientReconnectMessage(message: string): boolean {
  return /^reconnecting(?:\.\.\.)?\s*\d+\/\d+/i.test(message.trim());
}

function isConnectionFailureMessage(message: string): boolean {
  return /connect|socket|network|transport|reconnect/i.test(message);
}
