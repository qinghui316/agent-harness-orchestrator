import { formatUsage } from "../formatters.js";
import type {
  AssistantReadableEvent,
  AssistantTurnBlock,
  WorkbenchLiveToolEvent,
  LiveTurnEvent,
} from "../types.js";

export function proseBlock(runId: string, text: string, sequence: number): AssistantTurnBlock {
  return { id: `live-prose:${runId}:${sequence}`, runId, sequence, kind: "prose", timestamp: new Date().toISOString(), source: "codex", text };
}

export function appendProseBlock(blocks: AssistantTurnBlock[], runId: string, delta: string): AssistantTurnBlock[] {
  const next = [...blocks];
  const last = next.at(-1);
  if (last?.kind === "prose" && last.source === "codex") {
    next[next.length - 1] = { ...last, text: `${last.text ?? ""}${delta}` };
    return next;
  }
  next.push(proseBlock(runId, delta, nextBlockSequence(next)));
  return next;
}

export function upsertBlock(blocks: AssistantTurnBlock[], block: AssistantTurnBlock): AssistantTurnBlock[] {
  const key = blockKey(block);
  const existingIndex = blocks.findIndex((item) => blockKey(item) === key);
  if (existingIndex === -1) return [...blocks, { ...block, sequence: block.sequence > 0 ? block.sequence : nextBlockSequence(blocks) }];
  const next = [...blocks];
  next[existingIndex] = mergeAssistantBlocks(next[existingIndex], block);
  return next;
}

export function mergeAssistantBlocks(existing: AssistantTurnBlock, incoming: AssistantTurnBlock): AssistantTurnBlock {
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

export function blockFromAssistantEvent(event: AssistantReadableEvent): AssistantTurnBlock | null {
  if (!mainThreadAssistantEvent(event)) return null;
  return {
    id: `live-assistant:${event.runId}:${event.itemId ?? event.kind}:${event.phase ?? "event"}`,
    runId: event.runId,
    sequence: 0,
    kind: assistantEventBlockKind(event.kind),
    timestamp: event.timestamp ?? new Date().toISOString(),
    source: "codex",
    status: event.phase,
    title: event.title ?? readableEventTitle(event),
    text: event.summary,
    command: event.command,
    cwd: event.cwd,
    exitCode: event.exitCode,
    preview: event.preview,
    artifactRef: event.artifactRef,
    isError: event.isError,
    truncated: event.truncated,
    itemId: event.itemId,
  };
}

export function blockFromToolEvent(event: WorkbenchLiveToolEvent): AssistantTurnBlock | null {
  if (event.phase === "stderr") return null;
  if (!event.command && event.phase === "status" && !event.isError) return null;
  return {
    id: `live-tool:${event.runId}:${event.command ?? event.name ?? event.phase}:${event.phase}`,
    runId: event.runId,
    sequence: 0,
    kind: event.command ? "command" : "status",
    timestamp: new Date().toISOString(),
    source: "codex",
    status: event.status ?? event.phase,
    title: event.command ? event.phase === "started" ? "正在运行命令" : event.isError ? "命令失败" : "命令完成" : event.name ?? "运行状态",
    text: event.name,
    command: event.command,
    exitCode: event.exitCode,
    preview: event.outputTail,
    isError: event.isError,
    itemId: event.itemId,
  };
}

export function usageBlock(runId: string, usage: Record<string, unknown>): AssistantTurnBlock {
  return { id: `live-usage:${runId}`, runId, sequence: 0, kind: "usage", timestamp: new Date().toISOString(), source: "codex", title: "用量", text: formatUsage(usage) };
}

export function normalizeTurnBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const ordered = dedupeBlocks(blocks)
    .filter((block) => isMainThreadBlock(block))
    .map((block) => hasInternalRunMetadata(block.preview) ? { ...block, preview: undefined, truncated: false } : block)
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const result: AssistantTurnBlock[] = [];
  let group: AssistantTurnBlock[] = [];
  function flushGroup(): void {
    if (group.length === 0) return;
    if (group.length === 1 && group[0].isError) result.push(group[0]);
    else {
      result.push({
        id: `command-group:${group[0].id}:${group.length}`,
        runId: group[0].runId,
        sequence: group[0].sequence,
        kind: "command-group",
        timestamp: group[0].timestamp,
        source: "codex",
        title: `已运行 ${group.length} 条命令`,
        children: group,
      });
    }
    group = [];
  }
  for (const block of ordered) {
    if (block.kind === "command" && !block.isError) {
      group.push(block);
      continue;
    }
    flushGroup();
    result.push(block);
  }
  flushGroup();
  return result;
}

export function blockTitle(block: AssistantTurnBlock): string {
  if (block.kind === "reasoning-summary") return "工作摘要";
  if (block.kind === "command") return block.isError ? "命令失败" : block.status === "started" ? "正在运行命令" : "命令完成";
  if (block.kind === "file-change") return "文件变更";
  if (block.kind === "tool-result") return "工具返回";
  if (block.kind === "workflow-evidence") return "工作流证据";
  if (block.kind === "error") return "错误";
  if (block.kind === "status") return "运行状态";
  return "本轮过程";
}

export function filterLegacyToolEvents(events: Array<Extract<LiveTurnEvent, { kind: "tool" }>>, assistantEvents: AssistantReadableEvent[]): Array<Extract<LiveTurnEvent, { kind: "tool" }>> {
  const commandKeys = new Set(assistantEvents.filter((event) => event.kind === "command" && event.command).map((event) => `${event.command}:${event.phase ?? ""}:${event.exitCode ?? ""}`));
  return events.filter((event) => !event.tool.command || !commandKeys.has(`${event.tool.command}:${event.tool.phase ?? ""}:${event.tool.exitCode ?? ""}`));
}

export function mainThreadAssistantEvent(event: AssistantReadableEvent): AssistantReadableEvent | null {
  if (!isMainThreadAssistantEvent(event)) return null;
  if (hasInternalRunMetadata(event.preview)) {
    return {
      ...event,
      title: event.kind === "command" ? readableEventTitle(event) : event.title,
      summary: event.summary ?? "内部执行详情已记录到 Agent Loop，可在原始日志中查看。",
      preview: undefined,
      truncated: false,
    };
  }
  return event;
}

export function hasInternalRunMetadata(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  const artifactSignals = ["codex-events.jsonl", "events.jsonl", "stdout.log", "stderr.log", "last-message.md"];
  const hasArtifactSignal = artifactSignals.some((signal) => normalized.includes(signal));
  const hasRunMetadataShape = normalized.includes('"runtime"') && normalized.includes('"artifacts"') && normalized.includes('"promptstack"');
  const hasCodexInvocation = normalized.includes('"command"') && normalized.includes('"codex"') && normalized.includes("--output-last-message");
  return hasRunMetadataShape || hasCodexInvocation || (hasArtifactSignal && normalized.includes('"artifacts"'));
}

export function readableEventTitle(event: AssistantReadableEvent): string {
  if (event.kind === "reasoning-summary") return "推理摘要";
  if (event.kind === "command") return event.isError ? "命令失败" : event.phase === "started" ? "正在运行命令" : "命令完成";
  if (event.kind === "file-change") return "文件变更";
  if (event.kind === "mcp-tool") return "MCP 工具调用";
  if (event.kind === "web-search") return "网页搜索";
  if (event.kind === "plan-update") return "计划更新";
  if (event.kind === "tool-result") return "工具返回";
  if (event.kind === "usage") return "用量";
  if (event.kind === "error") return "错误";
  return "运行状态";
}

function assistantEventBlockKind(kind: AssistantReadableEvent["kind"]): AssistantTurnBlock["kind"] {
  if (kind === "plan-update") return "prose";
  if (kind === "reasoning-summary") return "reasoning-summary";
  if (kind === "command") return "command";
  if (kind === "file-change") return "file-change";
  if (kind === "usage") return "usage";
  if (kind === "error") return "error";
  if (kind === "status") return "status";
  return "tool-result";
}

function nextBlockSequence(blocks: AssistantTurnBlock[]): number {
  return Math.max(0, ...blocks.map((block) => block.sequence)) + 1;
}

function blockKey(block: AssistantTurnBlock): string {
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

function dedupeBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const byKey = new Map<string, AssistantTurnBlock>();
  for (const block of blocks) {
    const key = blockKey(block);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeAssistantBlocks(existing, block) : block);
  }
  return [...byKey.values()];
}

function isMainThreadBlock(block: AssistantTurnBlock): boolean {
  if (block.kind !== "status") return true;
  const normalized = `${block.title ?? ""} ${block.text ?? ""} ${block.status ?? ""}`.toLowerCase();
  if (isAgentLifecycleStatus(normalized)) return true;
  if (normalized.includes("codex thread started")) return false;
  if (normalized.includes("codex initialized the thread")) return false;
  if (normalized.includes("codex turn running")) return false;
  if (normalized.includes("codex started processing the turn")) return false;
  if (normalized.includes("codex turn completed")) return false;
  return Boolean(block.isError) || normalized.includes("validation") || normalized.includes("audit") || normalized.includes("failed") || normalized.includes("blocked");
}

function isMainThreadAssistantEvent(event: AssistantReadableEvent): boolean {
  if (event.kind !== "status") return true;
  const normalized = `${event.title ?? ""} ${event.summary ?? ""} ${event.phase ?? ""}`.toLowerCase();
  if (isAgentLifecycleStatus(normalized)) return true;
  if (normalized.includes("codex thread started")) return false;
  if (normalized.includes("codex initialized the thread")) return false;
  if (normalized.includes("codex turn running")) return false;
  if (normalized.includes("codex started processing the turn")) return false;
  if (normalized.includes("codex turn completed")) return false;
  if (normalized.includes("codex completed the turn")) return false;
  return event.isError === true || normalized.includes("validation") || normalized.includes("audit") || normalized.includes("failed") || normalized.includes("blocked");
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

function normalizeCommandKey(command: string | undefined): string {
  return (command ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeBlockText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
