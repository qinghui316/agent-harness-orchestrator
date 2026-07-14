import type { AssistantTurnBlock, LiveAssistantTurn, ParentAgentTranscript, ParentAgentTranscriptCell, ParentAgentTranscriptItem, ThreadStreamItem } from "./types.js";
import { commandDetailText, commandGroupDetailText, commandGroupSummary, commandRowTitle, groupConsecutiveCommandBlocks } from "../../command-transcript.js";

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
    ...coalesceMainLiveTurns(liveTurns).flatMap(parentTranscriptCellsFromLiveTurn),
  ];
  if (liveTranscriptCells.length === 0) return transcript;
  const cells = reconcileTimelineCells(transcript.cells ?? [], liveTranscriptCells);
  return {
    ...transcript,
    cells,
    items: transcriptItemsFromCells(cells),
  };
}

export function reconcileTimelineCells(
  snapshotCells: ParentAgentTranscriptCell[],
  liveCells: ParentAgentTranscriptCell[],
): ParentAgentTranscriptCell[] {
  const cells = [...snapshotCells];
  const positions = new Map(cells.map((cell, index) => [cell.id, index]));
  for (const liveCell of liveCells) {
    const position = positions.get(liveCell.id);
    if (position === undefined) {
      positions.set(liveCell.id, cells.length);
      cells.push(liveCell);
      continue;
    }
    cells[position] = mergeTimelineCell(cells[position], liveCell);
  }
  return cells;
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
    agentRoleId: turn.agentRoleId,
    agentTaskId: turn.agentTaskId,
    blocks: turn.blocks,
  };
  const cells = parentTranscriptCellsFromLiveThreadItem(item)
    .filter((cell) => !(cell.id.startsWith("cell:reasoning:") && turn.status !== "completed" && cell.status !== "completed"))
    .map((cell) => ({
    ...cell,
    threadId: turn.threadId,
    turnId: turn.turnId,
    agentSurfaceId: turn.agentSurfaceId,
    agentDisplayName: turn.agentDisplayName,
  }));
  if (turn.status === "completed") {
    const elapsed = completedTurnElapsedSeconds(turn);
    return [...cells, {
      id: turnTimelineCellId(turn),
      kind: "process-row",
      source: "codex-runtime",
      timestamp: turn.endedAt ?? turn.startedAt,
      agentRoleId: turn.agentRoleId,
      agentTaskId: turn.agentTaskId,
      runId: turn.runId,
      threadId: turn.threadId,
      turnId: turn.turnId,
      agentSurfaceId: turn.agentSurfaceId,
      agentDisplayName: turn.agentDisplayName,
      title: `已完成 · ${elapsed} 秒`,
      text: `已完成 · ${elapsed} 秒`,
      status: "completed",
      realtime: false,
      activityKind: "turn",
    }];
  }
  const statusText = liveTurnStatusText(turn);
  return [...cells, {
    id: turnTimelineCellId(turn),
    kind: "process-row",
    source: "codex-runtime",
    timestamp: turn.startedAt,
    agentRoleId: turn.agentRoleId,
    agentTaskId: turn.agentTaskId,
    runId: turn.runId,
    threadId: turn.threadId,
    turnId: turn.turnId,
    agentSurfaceId: turn.agentSurfaceId,
    agentDisplayName: turn.agentDisplayName,
    title: statusText,
    text: "",
    status: turn.status,
    realtime: true,
    activityKind: "turn",
  }];
}

export function parentTranscriptCellsFromLiveThreadItem(item: ThreadStreamItem): ParentAgentTranscriptCell[] {
  if (item.kind === "change-state") return [];
  if (item.kind === "user-message") {
    const text = cleanTranscriptText(item.body ?? item.label);
    return text ? [{
      id: `cell:user:${item.id}`,
      kind: "user-message",
      source: "user",
      timestamp: item.timestamp,
      agentRoleId: item.agentRoleId,
      agentTaskId: item.agentTaskId,
      runId: item.runId,
      text,
      contextRefs: item.contextRefs?.length ? item.contextRefs : undefined,
      attachments: item.attachments?.length ? item.attachments : undefined,
    }] : [];
  }
  const cells: ParentAgentTranscriptCell[] = [];
  for (const block of groupConsecutiveCommandBlocks(item.blocks ?? [])) {
    const text = cleanTranscriptText(block.text ?? block.preview ?? "");
    if (block.kind === "usage") continue;
    const canRenderWithoutText = block.kind === "command" || block.kind === "command-group" || block.kind === "tool-result" || block.kind === "file-change" || block.kind === "status" || block.kind === "error";
    if (!text && !canRenderWithoutText) continue;
    if (item.source === "workflow" && (block.source === "workflow" || block.source === "aho")) {
      cells.push({
        id: timelineCellIdForBlock(block),
        kind: block.kind === "error" ? "process-row" : "evidence-row",
        source: "workflow-evidence",
        timestamp: item.timestamp,
        agentRoleId: item.agentRoleId,
        agentTaskId: item.agentTaskId,
        runId: item.runId,
        title: cleanTranscriptTitle(block.title) ?? (block.kind === "error" ? "执行未完成" : "执行结果"),
        text: text || cleanTranscriptText(block.title ?? item.label),
        status: block.status ?? item.status,
        isError: block.isError,
        activityKind: "status",
        evidenceRefs: block.artifactRef ? [{ label: block.title ?? "执行证据", ref: block.artifactRef, kind: "artifact" }] : undefined,
      });
      continue;
    }
    const source = block.source === "codex" ? "codex-runtime" : "aho-orchestration";
    if (block.kind === "workflow-evidence") continue;
    const isProcess = block.kind === "command" || block.kind === "command-group" || block.kind === "tool-result" || block.kind === "file-change" || block.kind === "status" || block.kind === "error";
    const title = block.kind === "command-group"
      ? commandGroupSummary(block)
      : block.kind === "command"
        ? commandRowTitle(block)
      : block.kind === "file-change" ? "文件变更" : cleanTranscriptTitle(block.title);
    if (isGeneratedRunContextText(text)) {
      cells.push({
        id: `cell:detail:${timelineBlockIdentity(block)}`,
        kind: "detail-only",
        source,
        timestamp: item.timestamp,
        agentRoleId: item.agentRoleId,
        agentTaskId: item.agentTaskId,
        runId: item.runId,
        title: "运行上下文",
        text,
        status: block.status,
        isError: block.isError,
        activityKind: "status",
      });
      continue;
    }
    if (source !== "codex-runtime" && block.kind !== "error" && !(block.kind === "status" && isAgentLifecycleStatus(block))) continue;
    if (block.kind === "status" && !block.isError && !isAgentLifecycleStatus(block)) continue;
    const processSummary = liveProcessSummary(block);
    const detailText = liveProcessDetailText(block);
    const reasoningSummary = block.kind === "reasoning-summary";
    const reasoningTitle = reasoningSummary ? visibleReasoningTitle(text) : undefined;
    cells.push({
      id: timelineCellIdForBlock(block),
      kind: reasoningSummary ? "process-row" : block.kind === "prose" ? "assistant-message" : isProcess ? "process-row" : "detail-only",
      source,
      timestamp: item.timestamp,
      agentRoleId: item.agentRoleId,
      agentTaskId: item.agentTaskId,
      runId: item.runId,
      title: reasoningTitle ?? title,
      text: reasoningSummary ? "" : isProcess ? processSummary : text,
      status: block.status,
      isError: block.isError,
      activityKind: reasoningSummary
        ? "reasoning"
        : block.targetAgentSurfaceId
          ? "agent"
          : block.kind === "command" || block.kind === "command-group"
            ? "command"
            : block.kind === "file-change"
              ? "file"
              : /search/i.test(block.title ?? "")
                ? "search"
                : isProcess ? "tool" : undefined,
      detailText: reasoningSummary ? text : detailText,
      targetAgentSurfaceId: block.targetAgentSurfaceId,
      targetAgentDisplayName: block.targetAgentDisplayName,
      evidenceRefs: block.artifactRef ? [{ label: title ?? "详情", ref: block.artifactRef, kind: "artifact" }] : undefined,
    });
  }
  return cells;
}

export function findCompatibleLiveTurn(
  turns: LiveAssistantTurn[],
  runId: string,
  identity: Partial<Pick<LiveAssistantTurn, "threadId" | "turnId" | "agentRoleId">>,
): LiveAssistantTurn | undefined {
  const exact = turns.find((turn) => turn.runId === runId
    && (turn.threadId ?? "main") === (identity.threadId ?? "main")
    && (turn.turnId ?? "turn") === (identity.turnId ?? "turn"));
  if (exact) return exact;
  const runTurns = turns.filter((turn) => turn.runId === runId);
  const provisional = runTurns.filter((turn) => !turn.threadId && !turn.turnId);
  if (provisional.length === 1) return provisional[0];
  if (!identity.threadId && !identity.turnId && runTurns.length === 1) return runTurns[0];
  const compatible = turns.filter((turn) => turn.runId === runId
    && (!turn.threadId || !identity.threadId || turn.threadId === identity.threadId)
    && (!turn.turnId || !identity.turnId || turn.turnId === identity.turnId)
    && (!turn.agentRoleId || !identity.agentRoleId || turn.agentRoleId === identity.agentRoleId));
  return compatible.length === 1 ? compatible[0] : undefined;
}

export function transcriptContainsMainTurn(cells: ParentAgentTranscriptCell[], turn: Pick<LiveAssistantTurn, "runId">): boolean {
  const identified = turn as Pick<LiveAssistantTurn, "runId" | "threadId" | "turnId">;
  const expected = turnTimelineCellId(identified);
  return cells.some((cell) => cell.id === expected
    || (cell.id === `cell:turn:${turn.runId}` && !identified.threadId && !identified.turnId));
}

export function transcriptContainsLiveItem(cells: ParentAgentTranscriptCell[], item: ThreadStreamItem): boolean {
  const ids = new Set(parentTranscriptCellsFromLiveThreadItem(item).map((cell) => cell.id));
  return ids.size > 0 && cells.some((cell) => ids.has(cell.id));
}

export function coalesceMainLiveTurns(turns: LiveAssistantTurn[]): LiveAssistantTurn[] {
  const byTurn = new Map<string, LiveAssistantTurn>();
  for (const turn of turns) {
    const key = turnTimelineIdentity(turn);
    const current = byTurn.get(key);
    if (!current) {
      byTurn.set(key, turn);
      continue;
    }
    const preferred = liveTurnScore(turn) >= liveTurnScore(current) ? turn : current;
    const fallback = preferred === turn ? current : turn;
    byTurn.set(key, {
      ...fallback,
      ...preferred,
      projectId: preferred.projectId ?? fallback.projectId,
      conversationId: preferred.conversationId ?? fallback.conversationId,
      changeId: preferred.changeId ?? fallback.changeId,
      threadId: preferred.threadId ?? fallback.threadId,
      turnId: preferred.turnId ?? fallback.turnId,
      agentRoleId: preferred.agentRoleId ?? fallback.agentRoleId,
      agentSurfaceId: preferred.agentSurfaceId ?? fallback.agentSurfaceId,
      agentDisplayName: preferred.agentDisplayName ?? fallback.agentDisplayName,
      text: preferred.text.length >= fallback.text.length ? preferred.text : fallback.text,
      blocks: mergeLiveBlocks(fallback.blocks, preferred.blocks),
      events: [...fallback.events, ...preferred.events],
      startedAt: fallback.startedAt < preferred.startedAt ? fallback.startedAt : preferred.startedAt,
      endedAt: preferred.endedAt ?? fallback.endedAt,
    });
  }
  return [...byTurn.values()];
}

function liveTurnScore(turn: LiveAssistantTurn): number {
  const statusScore = turn.status === "completed" ? 50 : turn.status === "replying" || turn.status === "streaming" ? 40 : turn.status === "thinking" || turn.status === "running" ? 30 : 10;
  return statusScore + turn.text.length + turn.blocks.length * 10 + (turn.turnId ? 5 : 0);
}

function mergeLiveBlocks(first: AssistantTurnBlock[], second: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const blocks = new Map(first.map((block) => [block.id, block]));
  for (const block of second) blocks.set(block.id, block);
  return [...blocks.values()].sort((a, b) => a.sequence - b.sequence);
}

function completedTurnElapsedSeconds(turn: Pick<LiveAssistantTurn, "startedAt" | "endedAt">): number {
  const started = Date.parse(turn.startedAt);
  const ended = Date.parse(turn.endedAt ?? turn.startedAt);
  return Math.max(1, Math.round((ended - started) / 1000));
}

function liveTurnStatusText(turn: LiveAssistantTurn): string {
  if (turn.blocks.some((block) => block.status === "started" && block.kind !== "prose")) return "正在调用工具";
  const reasoning = [...turn.blocks].reverse().find((block) => block.kind === "reasoning-summary" && block.status !== "completed" && cleanTranscriptText(block.text ?? block.preview));
  if (reasoning) return `正在思考 · ${reasoningHeadline(reasoning.text ?? reasoning.preview ?? "")}`;
  if (turn.status === "thinking" || turn.status === "running") return "正在思考";
  if (turn.status === "replying" || turn.status === "streaming") return "正在回复";
  if (turn.status === "waiting-user") return "等待你回答";
  return turn.status === "failed" ? "需要处理" : "正在连接";
}

function mergeTimelineCell(snapshot: ParentAgentTranscriptCell, live: ParentAgentTranscriptCell): ParentAgentTranscriptCell {
  return {
    ...snapshot,
    ...live,
    id: snapshot.id,
    timestamp: snapshot.timestamp ?? live.timestamp,
    detailText: live.detailText ?? snapshot.detailText,
    evidenceRefs: live.evidenceRefs ?? snapshot.evidenceRefs,
    realtime: live.status === "completed" || live.status === "failed" ? false : live.realtime ?? snapshot.realtime,
  };
}

function turnTimelineCellId(turn: Pick<LiveAssistantTurn, "runId" | "threadId" | "turnId">): string {
  return `cell:turn:${turnTimelineIdentity(turn)}`;
}

function turnTimelineIdentity(turn: Pick<LiveAssistantTurn, "runId" | "threadId" | "turnId">): string {
  return `${turn.runId}:${turn.threadId ?? "main"}:${turn.turnId ?? "turn"}`;
}

function timelineCellIdForBlock(block: AssistantTurnBlock): string {
  const identity = timelineBlockIdentity(block);
  if (block.kind === "prose") return `cell:assistant:${identity}`;
  if (block.kind === "reasoning-summary") return `cell:reasoning:${identity}`;
  if (block.kind === "command" || block.kind === "command-group") return `cell:command:${identity}`;
  if (block.kind === "error") return `cell:error:${identity}`;
  return `cell:${block.kind}:${identity}`;
}

function timelineBlockIdentity(block: AssistantTurnBlock): string {
  if (block.itemId) return `${block.runId ?? "run"}:${block.threadId ?? "main"}:${block.itemId}`;
  return block.id;
}

function visibleReasoningTitle(text: string): string {
  return `思考摘要 · ${reasoningHeadline(text)}`;
}

function reasoningHeadline(text: string): string {
  const normalized = cleanTranscriptText(text).replace(/\s+/g, " ");
  return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized;
}

export function liveProcessSummary(block: AssistantTurnBlock): string {
  if (block.targetAgentSurfaceId) {
    const name = block.targetAgentDisplayName ?? "子 Agent";
    if (block.isError || block.status === "failed") return `${name} 需要处理`;
    if (block.status === "started" || block.status === "running" || block.status === "updated") return `${name} 正在处理`;
    return `${name} 已完成`;
  }
  if (block.kind === "command" || block.kind === "command-group") {
    if (block.kind === "command-group") return commandGroupSummary(block);
    return commandRowTitle(block);
  }
  if (block.kind === "file-change") return "文件已变更";
  if (block.kind === "tool-result") return block.isError ? "工具调用失败" : "工具调用已完成";
  if (block.kind === "error") return cleanTranscriptText(block.text ?? block.preview ?? "运行出错");
  return cleanTranscriptText(block.title ?? block.text ?? block.preview ?? "运行状态已更新");
}

export function liveProcessDetailText(block: AssistantTurnBlock): string | undefined {
  if (block.kind === "command-group" && block.children?.length) return commandGroupDetailText(block.children);
  if (block.kind === "command") return commandDetailText(block);
  const parts: string[] = [];
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
  if (text === "Command completed") return "命令已完成";
  if (text === "Command started") return "正在运行命令";
  if (text === "Command failed") return "命令执行失败";
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
