import type { AssistantTurnActivity, AssistantTurnBlock, AssistantTurnBlockKind, WorkbenchAssistantEvent, WorkbenchLiveEvent, WorkbenchLiveSink, WorkbenchLiveToolEvent } from "./types.js";

export function createAssistantTranscriptCapture(live: WorkbenchLiveSink | undefined): AssistantTranscriptCapture {
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
