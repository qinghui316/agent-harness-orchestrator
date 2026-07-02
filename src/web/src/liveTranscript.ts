import type { AssistantTurnBlock, LiveAssistantTurn, ParentAgentTranscript, ParentAgentTranscriptCell, ParentAgentTranscriptItem, ThreadStreamItem } from "./types.js";

export function emptyParentAgentTranscript(): ParentAgentTranscript {
  return {
    title: "需求对话",
    cells: [],
    items: [],
    emptyMessage: "暂无对话内容。输入需求后，主 agent 会在这里持续回复。",
  };
}

export function mergeLiveItemsIntoTranscript(transcript: ParentAgentTranscript, liveItems: ThreadStreamItem[], liveTurns: LiveAssistantTurn[]): ParentAgentTranscript {
  const liveTranscriptCells = [
    ...liveItems.flatMap(parentTranscriptCellsFromLiveThreadItem),
    ...liveTurns.flatMap(parentTranscriptCellsFromLiveTurn),
  ];
  if (liveTranscriptCells.length === 0) return transcript;
  const existingCellIds = new Set((transcript.cells ?? []).map((cell) => cell.id));
  const cells = [...(transcript.cells ?? []), ...liveTranscriptCells.filter((cell) => !existingCellIds.has(cell.id))];
  const liveTranscriptItems = transcriptItemsFromCells(liveTranscriptCells);
  const existingIds = new Set(transcript.items.map((item) => item.id));
  return {
    ...transcript,
    cells,
    items: [...transcript.items, ...liveTranscriptItems.filter((item) => !existingIds.has(item.id))],
  };
}

export function mergeTranscriptPage(current: ParentAgentTranscript | null, incoming: ParentAgentTranscript): ParentAgentTranscript {
  if (!current) return normalizeParentAgentTranscript(incoming);
  const incomingCells = incoming.cells ?? [];
  const currentCells = current.cells ?? [];
  const seen = new Set<string>();
  const cells = [...incomingCells, ...currentCells].filter((cell) => {
    if (seen.has(cell.id)) return false;
    seen.add(cell.id);
    return true;
  });
  return normalizeParentAgentTranscript({
    ...current,
    ...incoming,
    cells,
    items: transcriptItemsFromCells(cells),
    paging: incoming.paging ?? current.paging,
  });
}

export function parentTranscriptCellsFromLiveTurn(turn: LiveAssistantTurn): ParentAgentTranscriptCell[] {
  const item: ThreadStreamItem = {
    id: turn.id,
    kind: "assistant-turn",
    label: "assistant",
    source: "chat",
    timestamp: turn.startedAt,
    body: turn.text,
    runId: turn.runId,
    blocks: turn.blocks,
  };
  return parentTranscriptCellsFromLiveThreadItem(item);
}

export function parentTranscriptCellsFromLiveThreadItem(item: ThreadStreamItem): ParentAgentTranscriptCell[] {
  if (item.kind === "change-state") return [];
  if (item.kind === "user-message") {
    const text = cleanTranscriptText(item.body ?? item.label);
    return text ? [{
      id: `live-cell:user:${item.id}`,
      kind: "user-message",
      source: "user",
      timestamp: item.timestamp,
      text,
      contextRefs: item.contextRefs?.length ? item.contextRefs : undefined,
      attachments: item.attachments?.length ? item.attachments : undefined,
    }] : [];
  }
  const cells: ParentAgentTranscriptCell[] = [];
  for (const block of item.blocks ?? []) {
    const text = cleanTranscriptText(block.text ?? block.preview ?? "");
    if (block.kind === "usage") continue;
    const canRenderWithoutText = block.kind === "command" || block.kind === "command-group" || block.kind === "tool-result" || block.kind === "file-change" || block.kind === "status" || block.kind === "error";
    if (!text && !canRenderWithoutText) continue;
    if (item.source === "workflow" && (block.source === "workflow" || block.source === "legacy")) {
      cells.push({
        id: `live-cell:${block.id}`,
        kind: block.kind === "error" ? "process-row" : "evidence-row",
        source: "workflow-evidence",
        timestamp: item.timestamp,
        title: cleanTranscriptTitle(block.title) ?? (block.kind === "error" ? "执行未完成" : "执行结果"),
        text: text || cleanTranscriptText(block.title ?? item.label),
        status: block.status ?? item.status,
        isError: block.isError,
        evidenceRefs: block.artifactRef ? [{ label: block.title ?? "执行证据", ref: block.artifactRef, kind: "artifact" }] : undefined,
      });
      continue;
    }
    const source = block.source === "codex" ? "codex-runtime" : "aho-orchestration";
    if (source !== "codex-runtime" && block.kind !== "error") continue;
    if (block.kind === "workflow-evidence" || block.kind === "plan-card") continue;
    const isProcess = block.kind === "command" || block.kind === "command-group" || block.kind === "tool-result" || block.kind === "file-change" || block.kind === "status" || block.kind === "error";
    const title = block.kind === "command" || block.kind === "command-group"
      ? block.isError || block.status === "failed" ? "命令需要关注" : block.status === "running" ? "命令执行中" : "已运行命令"
      : block.kind === "file-change" ? "文件变更" : cleanTranscriptTitle(block.title);
    if (isGeneratedRunContextText(text)) {
      cells.push({
        id: `live-cell:detail:${block.id}`,
        kind: "detail-only",
        source,
        timestamp: item.timestamp,
        title: "运行上下文",
        text,
        status: block.status,
        isError: block.isError,
      });
      continue;
    }
    if (block.kind === "status" && !block.isError && !isAgentLifecycleStatus(block)) continue;
    const processSummary = liveProcessSummary(block);
    const detailText = liveProcessDetailText(block);
    cells.push({
      id: `live-cell:${block.id}`,
      kind: block.kind === "prose" || block.kind === "reasoning-summary" ? "assistant-message" : isProcess ? "process-row" : "detail-only",
      source,
      timestamp: item.timestamp,
      title,
      text: isProcess ? processSummary : text,
      status: block.status,
      isError: block.isError,
      detailText,
      evidenceRefs: block.artifactRef ? [{ label: title ?? "详情", ref: block.artifactRef, kind: "artifact" }] : undefined,
    });
  }
  return cells;
}

export function liveProcessSummary(block: AssistantTurnBlock): string {
  if (block.kind === "command" || block.kind === "command-group") {
    const commandCount = block.kind === "command-group" ? block.children?.filter((child) => child.kind === "command").length ?? 0 : 1;
    const failedCount = block.kind === "command-group" ? block.children?.filter((child) => child.kind === "command" && child.isError).length ?? 0 : block.isError || block.status === "failed" ? 1 : 0;
    const count = commandCount > 0 ? commandCount : 1;
    if (block.status === "running" || block.status === "started") return "正在运行命令";
    if (block.isError || block.status === "failed" || failedCount > 0) return failedCount > 0 ? `已运行 ${count} 条命令，${failedCount} 条需要关注` : `已运行 ${count} 条命令，需要关注`;
    return `已运行 ${count} 条命令`;
  }
  if (block.kind === "file-change") return "文件已变更";
  if (block.kind === "tool-result") return block.isError ? "工具调用失败" : "工具调用已完成";
  if (block.kind === "error") return cleanTranscriptText(block.text ?? block.preview ?? "运行出错");
  return cleanTranscriptText(block.title ?? block.text ?? block.preview ?? "运行状态已更新");
}

export function liveProcessDetailText(block: AssistantTurnBlock): string | undefined {
  if (block.kind === "command-group" && block.children?.length) {
    const childDetails = block.children.map(liveProcessDetailText).filter((item): item is string => Boolean(item));
    return childDetails.length ? childDetails.join("\n\n---\n\n") : undefined;
  }
  const parts: string[] = [];
  if (block.command) parts.push(`$ ${block.command}`);
  if (block.cwd) parts.push(`cwd: ${block.cwd}`);
  if (typeof block.exitCode === "number") parts.push(`exit: ${block.exitCode}`);
  const output = cleanTranscriptText([block.text, block.preview].filter(Boolean).join("\n\n"));
  if (output && block.kind !== "error") parts.push(output);
  return parts.length ? parts.join("\n") : undefined;
}

export function isGeneratedRunContextText(value: string): boolean {
  return value.includes("# AHO 需求对话 Chat")
    || value.includes("# Run Context Projection")
    || value.includes("You are answering inside the AHO Workbench")
    || value.includes("## Current User Message")
    || value.includes("## User Message");
}

export function transcriptItemsFromCells(cells: ParentAgentTranscriptCell[]): ParentAgentTranscriptItem[] {
  return cells
    .filter((cell) => cell.kind !== "detail-only")
    .map((cell) => ({
      id: `cell-item:${cell.id}`,
      actor: cell.kind === "user-message" ? "user" : "parent-agent",
      timestamp: cell.timestamp,
      derived: cell.source !== "codex-runtime" && cell.source !== "user",
      blocks: [{
        id: `cell-block:${cell.id}`,
        kind: cell.kind === "assistant-message" || cell.kind === "user-message" ? "prose" : cell.kind === "process-row" ? "process" : "evidence",
        source: cell.source,
        title: cell.title,
        text: cell.text,
        status: cell.status,
        evidenceRefs: cell.evidenceRefs,
        isError: cell.isError,
      }],
    }));
}

export function cleanTranscriptTitle(value?: string): string | undefined {
  const text = cleanTranscriptText(value ?? "");
  if (!text || text === "AI" || text === "AI 回复" || text === "执行结果") return undefined;
  if (text === "Command completed") return "已运行命令";
  if (text === "Command started") return "命令执行中";
  if (text === "Command failed") return "命令需要关注";
  return text;
}

export function cleanTranscriptText(value?: string): string {
  return (value ?? "").trim();
}

export function normalizeParentAgentTranscript(value: ParentAgentTranscript | null | undefined): ParentAgentTranscript {
  const empty = emptyParentAgentTranscript();
  return {
    ...empty,
    ...(value ?? {}),
    cells: Array.isArray(value?.cells) ? value.cells : [],
    items: Array.isArray(value?.items) ? value.items : [],
    paging: value?.paging,
  };
}

function isAgentLifecycleStatus(block: AssistantTurnBlock): boolean {
  const normalized = `${block.title ?? ""} ${block.text ?? ""} ${block.status ?? ""}`.toLowerCase();
  return normalized.includes("agent-task-created")
    || normalized.includes("agent-running")
    || normalized.includes("agent-completed")
    || normalized.includes("planning-agent")
    || normalized.includes("coder")
    || normalized.includes("validator")
    || normalized.includes("auditor")
    || normalized.includes("rework");
}

export function isParentAgentTranscriptPayload(value: ParentAgentTranscript | null | undefined): boolean {
  return Array.isArray(value?.cells) || Array.isArray(value?.items);
}
