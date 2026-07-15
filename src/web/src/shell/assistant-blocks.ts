import { formatUsage } from "../formatters.js";
import type {
  AssistantReadableEvent,
  AssistantTurnBlock,
  WorkbenchLiveToolEvent,
  LiveTurnEvent,
  WorkbenchLiveIdentity,
} from "../types.js";

export function proseBlock(runId: string, text: string, sequence: number, identity: WorkbenchLiveIdentity = {}): AssistantTurnBlock {
  return {
    id: `prose:${identity.providerId ?? "provider"}:${identity.attemptId ?? "attempt"}:${runId}:${identity.threadId ?? "main"}:${identity.itemId ?? sequence}`,
    providerId: identity.providerId,
    attemptId: identity.attemptId,
    runId,
    threadId: identity.threadId,
    turnId: identity.turnId,
    itemId: identity.itemId,
    sequence,
    kind: "prose",
    timestamp: new Date().toISOString(),
    source: "provider",
    text,
  };
}

export function appendProseBlock(blocks: AssistantTurnBlock[], runId: string, delta: string, identity: WorkbenchLiveIdentity = {}): AssistantTurnBlock[] {
  const next = [...blocks];
  const last = next.at(-1);
  if (last?.kind === "prose" && last.source === "provider" && (!identity.itemId || !last.itemId || last.itemId === identity.itemId)) {
    next[next.length - 1] = { ...last, text: `${last.text ?? ""}${delta}` };
    return next;
  }
  next.push(proseBlock(runId, delta, nextBlockSequence(next), identity));
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
    targetAgentSurfaceId: incoming.targetAgentSurfaceId ?? existing.targetAgentSurfaceId,
    targetAgentDisplayName: incoming.targetAgentDisplayName ?? existing.targetAgentDisplayName,
  };
}

export function blockFromAssistantEvent(event: AssistantReadableEvent): AssistantTurnBlock | null {
  if (isProviderInternalMetadata(event)) return null;
  return {
    id: `assistant:${event.providerId ?? "provider"}:${event.attemptId ?? "attempt"}:${event.runId}:${event.threadId ?? "main"}:${event.itemId ?? event.kind}:${event.kind}`,
    providerId: event.providerId,
    attemptId: event.attemptId,
    runId: event.runId,
    threadId: event.threadId,
    turnId: event.turnId,
    sequence: 0,
    kind: assistantEventBlockKind(event.kind),
    timestamp: event.timestamp ?? new Date().toISOString(),
    source: "provider",
    status: event.status ?? event.phase,
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
    targetAgentSurfaceId: event.targetAgentSurfaceId,
    targetAgentDisplayName: event.targetAgentDisplayName,
  };
}

export function blockFromToolEvent(event: WorkbenchLiveToolEvent): AssistantTurnBlock | null {
  if (event.phase === "stderr") return null;
  if (!event.command && event.phase === "status" && !event.isError) return null;
  return {
    id: `tool:${event.providerId ?? "provider"}:${event.attemptId ?? "attempt"}:${event.runId}:${event.threadId ?? "main"}:${event.itemId ?? normalizeCommandKey(event.command ?? event.name)}`,
    providerId: event.providerId,
    attemptId: event.attemptId,
    runId: event.runId,
    threadId: event.threadId,
    turnId: event.turnId,
    sequence: 0,
    kind: event.command ? "command" : "status",
    timestamp: new Date().toISOString(),
    source: "provider",
    status: event.status ?? event.phase,
    title: event.command ? commandResultTitle(event.status ?? event.phase) : event.name ?? "运行状态",
    text: event.name,
    command: event.command,
    exitCode: event.exitCode,
    preview: event.outputTail,
    isError: event.isError,
    itemId: event.itemId,
  };
}

export function usageBlock(runId: string, usage: Record<string, unknown>): AssistantTurnBlock {
  return { id: `live-usage:${runId}`, runId, sequence: 0, kind: "usage", timestamp: new Date().toISOString(), source: "provider", title: "用量", text: formatUsage(usage) };
}

export function normalizeTurnBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const ordered = dedupeBlocks(blocks)
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const result: AssistantTurnBlock[] = [];
  let group: AssistantTurnBlock[] = [];
  function flushGroup(): void {
    if (group.length === 0) return;
    if (group.length === 1) result.push(group[0]);
    else {
      const failedCount = group.filter((block) => block.status === "failed" || block.isError).length;
      const processing = group.some((block) => block.status === "processing" || block.status === "started" || block.status === "running");
      result.push({
        id: `command-group:${group[0].id}:${group.length}`,
        providerId: group[0].providerId,
        attemptId: group[0].attemptId,
        runId: group[0].runId,
        sequence: group[0].sequence,
        kind: "command-group",
        timestamp: group[0].timestamp,
        source: "provider",
        status: failedCount > 0 ? "failed" : processing ? "processing" : "completed",
        title: "运行命令",
        isError: failedCount > 0,
        children: group,
      });
    }
    group = [];
  }
  for (const block of ordered) {
    if (block.kind === "command") {
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
  const providerId = block.providerId ?? "provider";
  const attemptId = block.attemptId ?? "attempt";
  const runId = block.runId ?? "";
  const threadId = block.threadId ?? "main";
  if (block.kind === "usage") return `usage:${providerId}:${attemptId}:${runId}`;
  if (block.kind === "error") return `error:${providerId}:${attemptId}:${runId}:${normalizeBlockText(block.text ?? block.preview ?? block.title)}`;
  if (block.kind === "workflow-evidence") return `workflow-evidence:${providerId}:${attemptId}:${runId}:${block.artifactRef ?? block.title ?? block.status ?? block.id}`;
  if (block.kind === "command") {
    if (block.itemId) return `command:${providerId}:${attemptId}:${runId}:${threadId}:item:${block.itemId}`;
    return `command:${providerId}:${attemptId}:${runId}:${threadId}:command:${normalizeCommandKey(block.command)}`;
  }
  return block.itemId ? `${block.kind}:${providerId}:${attemptId}:${runId}:${threadId}:item:${block.itemId}` : `${block.id}:${block.kind}`;
}

function isProviderInternalMetadata(event: AssistantReadableEvent): boolean {
  if (event.kind !== "status") return false;
  const value = `${event.title ?? ""} ${event.summary ?? ""} ${event.phase ?? ""}`.trim().toLowerCase();
  return /(?:^|\s)(?:thread|turn|item|run)\/(?:started|completed|delta|updated)(?:\s|$)/.test(value)
    || /(?:app-server|provider (?:thread|turn)|run\.(?:started|status|completed))/.test(value);
}

function commandResultTitle(status: string | undefined): string {
  if (status === "failed") return "命令执行失败";
  if (status === "completed") return "命令已完成";
  return "正在运行命令";
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

function normalizeCommandKey(command: string | undefined): string {
  return (command ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeBlockText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
