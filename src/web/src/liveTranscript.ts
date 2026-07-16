import type { ParentAgentTranscript, ParentAgentTranscriptCell, ParentAgentTranscriptItem } from "./types.js";

export function emptyParentAgentTranscript(): ParentAgentTranscript {
  return {
    title: "需求对话",
    cells: [],
    items: [],
    emptyMessage: "暂无对话内容。输入需求后，主 agent 会在这里持续回复。",
  };
}

export function replaceCanonicalMessageCells(
  transcript: ParentAgentTranscript,
  previousCellIds: readonly string[],
  nextCells: ParentAgentTranscriptCell[],
  placement?: "thread-start",
): ParentAgentTranscript {
  const previous = new Set(previousCellIds);
  const nextIds = new Set(nextCells.map((cell) => cell.id));
  const current = transcript.cells ?? [];
  const firstOwnedIndex = current.findIndex((cell) => previous.has(cell.id) || nextIds.has(cell.id));
  const retained = current.filter((cell) => !previous.has(cell.id) && !nextIds.has(cell.id));
  const canonicalThreadStart = firstOwnedIndex < 0 && placement === "thread-start" ? exactProviderThreadStart(retained, nextCells) : -1;
  const canonicalTurnStart = firstOwnedIndex < 0 && canonicalThreadStart < 0 ? exactProviderTurnStart(retained, nextCells) : -1;
  const insertionIndex = firstOwnedIndex >= 0
    ? Math.min(firstOwnedIndex, retained.length)
    : canonicalThreadStart >= 0 ? canonicalThreadStart : canonicalTurnStart >= 0 ? canonicalTurnStart : retained.length;
  const cells = [...retained];
  cells.splice(insertionIndex, 0, ...nextCells);
  return normalizeParentAgentTranscript({ ...transcript, cells, items: transcriptItemsFromCells(cells) });
}

function exactProviderThreadStart(
  current: ParentAgentTranscriptCell[],
  incoming: ParentAgentTranscriptCell[],
): number {
  if (incoming.length !== 1 || incoming[0]?.kind !== "user-message") return -1;
  const user = incoming[0];
  if (!user.providerId || !user.attemptId || !user.threadId) return -1;
  return current.findIndex((cell) => cell.providerId === user.providerId
    && cell.attemptId === user.attemptId
    && cell.threadId === user.threadId);
}

function exactProviderTurnStart(
  current: ParentAgentTranscriptCell[],
  incoming: ParentAgentTranscriptCell[],
): number {
  if (incoming.length !== 1 || incoming[0]?.kind !== "user-message") return -1;
  const user = incoming[0];
  if (!user.providerId || !user.attemptId || !user.threadId || !user.turnId) return -1;
  return current.findIndex((cell) => cell.providerId === user.providerId
    && cell.attemptId === user.attemptId
    && cell.threadId === user.threadId
    && cell.turnId === user.turnId);
}

export function mergeTranscriptPage(current: ParentAgentTranscript | null, incoming: ParentAgentTranscript): ParentAgentTranscript {
  if (!current) return normalizeParentAgentTranscript(incoming);
  const seen = new Set<string>();
  const cells = [...(incoming.cells ?? []), ...(current.cells ?? [])].filter((cell) => {
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

export function transcriptItemsFromCells(cells: ParentAgentTranscriptCell[]): ParentAgentTranscriptItem[] {
  return cells
    .filter((cell) => cell.kind !== "detail-only")
    .map((cell) => ({
      id: `cell-item:${cell.id}`,
      actor: cell.kind === "user-message" ? "user" : "parent-agent",
      timestamp: cell.timestamp,
      derived: cell.source !== "provider-runtime" && cell.source !== "user",
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

export function isParentAgentTranscriptPayload(value: ParentAgentTranscript | null | undefined): boolean {
  return Array.isArray(value?.cells) || Array.isArray(value?.items);
}
