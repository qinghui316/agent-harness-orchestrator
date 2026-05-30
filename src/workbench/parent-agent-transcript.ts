import type { AssistantTurnBlock } from "./chat.js";
import type { ThreadStreamItem, WorkbenchWorkpad } from "./manager.js";

export type ParentAgentTranscriptActor = "user" | "parent-agent";
export type ParentAgentTranscriptBlockKind = "prose" | "process" | "tool-result" | "evidence";
export type ParentAgentTranscriptBlockSource = "user" | "codex-runtime" | "aho-orchestration" | "workflow-evidence" | "maintenance";
export type ParentAgentTranscriptCellKind = "user-message" | "assistant-message" | "process-row" | "evidence-row" | "detail-only";

export interface ParentAgentEvidenceRef {
  label: string;
  ref: string;
  kind: "artifact" | "run" | "decision" | "remote" | "maintenance";
}

export interface ParentAgentTranscriptBlock {
  id: string;
  kind: ParentAgentTranscriptBlockKind;
  source: ParentAgentTranscriptBlockSource;
  title?: string;
  text: string;
  status?: string;
  evidenceRefs?: ParentAgentEvidenceRef[];
  isError?: boolean;
}

export interface ParentAgentTranscriptItem {
  id: string;
  actor: ParentAgentTranscriptActor;
  timestamp?: string;
  blocks: ParentAgentTranscriptBlock[];
  derived?: boolean;
}

export interface ParentAgentTranscriptCell {
  id: string;
  kind: ParentAgentTranscriptCellKind;
  source: ParentAgentTranscriptBlockSource;
  timestamp?: string;
  title?: string;
  text: string;
  status?: string;
  evidenceRefs?: ParentAgentEvidenceRef[];
  isError?: boolean;
  realtime?: boolean;
  detailText?: string;
}

export interface ParentAgentTranscript {
  conversationId?: string;
  changeId?: string;
  title: string;
  cells: ParentAgentTranscriptCell[];
  items: ParentAgentTranscriptItem[];
  emptyMessage?: string;
}

export function buildParentAgentTranscript(input: {
  workpad: WorkbenchWorkpad;
  threadItems: ThreadStreamItem[];
}): ParentAgentTranscript {
  const cells = dedupeTranscriptCellEvidenceRefs(consolidateTranscriptCells(input.threadItems
    .filter((item) => item.kind !== "change-state")
    .flatMap((item) => transcriptCellsFromThreadItem(item))));
  return {
    conversationId: input.workpad.conversationId,
    changeId: input.workpad.boundChangeId,
    title: cleanPrimaryText(input.workpad.title) || "需求对话",
    cells,
    items: transcriptItemsFromCells(cells),
    emptyMessage: "暂无对话内容。输入需求后，主 agent 会在这里持续回复。",
  };
}

function transcriptCellsFromThreadItem(item: ThreadStreamItem): ParentAgentTranscriptCell[] {
  if (item.kind === "user-message") {
    const text = cleanPrimaryText(item.body ?? item.label);
    return text
      ? [{
          id: `cell:user:${item.id}`,
          kind: "user-message",
          source: "user",
          timestamp: item.timestamp,
          text,
        }]
      : [];
  }

  const cells: ParentAgentTranscriptCell[] = [];
  cells.push(...activityCellsFromThreadItem(item));
  for (const block of item.blocks ?? []) {
    const cell = transcriptCellFromAssistantBlock(block, item.id, item.timestamp);
    if (cell) cells.push(cell);
  }
  return cells.filter((cell) => Boolean(cell.text.trim()));
}

function activityCellsFromThreadItem(item: ThreadStreamItem): ParentAgentTranscriptCell[] {
  if (item.source === "workflow") return [];
  const activities = item.activity ?? [];
  if (activities.length === 0) return [];
  const toolCount = activities.filter((activity) => activity.kind === "tool").length;
  const errorCount = activities.filter((activity) => activity.kind === "error").length;
  if (toolCount === 0 && errorCount === 0) return [];
  const parts = [
    toolCount > 0 ? `已运行 ${toolCount} 条命令` : undefined,
    errorCount > 0 ? `${errorCount} 个步骤需要关注。` : undefined,
  ].filter(Boolean);
  if (parts.length === 0) return [];
  return [{
    id: `cell:activity:${item.id}`,
    kind: "process-row",
    source: "codex-runtime",
    timestamp: item.timestamp,
    title: errorCount > 0 ? "过程需要关注" : toolCount > 0 ? "已运行命令" : undefined,
    text: parts.join("\n"),
    status: item.status,
    isError: errorCount > 0,
  }];
}

function transcriptCellFromAssistantBlock(block: AssistantTurnBlock, itemId: string, timestamp?: string): ParentAgentTranscriptCell | null {
  if (block.kind === "usage") return null;
  const source: ParentAgentTranscriptBlockSource = block.source === "codex" ? "codex-runtime" : "aho-orchestration";
  const rawText = block.text ?? block.preview ?? "";
  const text = isGeneratedRunContext(rawText) ? "" : cleanPrimaryText(rawText);

  if (block.kind === "workflow-evidence" || block.kind === "plan-card") return null;
  if (source !== "codex-runtime" && block.kind !== "error") return null;

  if (block.kind === "prose" || block.kind === "reasoning-summary") {
    if (!text) return null;
    return {
      id: `cell:assistant:${block.id ?? itemId}`,
      kind: "assistant-message",
      source,
      timestamp,
      title: cleanToolTitle(block.title),
      text,
      status: block.status,
      isError: block.isError,
    };
  }

  if (block.kind === "status") {
    const statusText = cleanPrimaryText([block.title, block.text ?? block.preview].filter(Boolean).join("\n"));
    if (!statusText) return null;
    return {
      id: `cell:status:${block.id}`,
      kind: block.isError ? "process-row" : "detail-only",
      source,
      timestamp,
      title: block.isError ? "过程需要关注" : cleanToolTitle(block.title),
      text: statusText,
      status: block.status,
      isError: block.isError,
    };
  }

  if (block.kind === "command-group") {
    const commandCount = block.children?.filter((child) => child.kind === "command").length ?? 0;
    const failedCount = block.children?.filter((child) => child.kind === "command" && child.isError).length ?? 0;
    const commandText = cleanPrimaryText(block.text ?? block.preview ?? `已运行 ${commandCount || "多"} 条命令${failedCount ? `，${failedCount} 条需要关注` : ""}`);
    return {
      id: `cell:command-group:${block.id}`,
      kind: "process-row",
      source,
      timestamp,
      title: failedCount > 0 || block.isError ? "命令需要关注" : "已运行命令",
      text: commandText,
      status: block.status,
      isError: block.isError || failedCount > 0,
    };
  }

  if (block.kind === "command") {
    return {
      id: `cell:command:${block.id}`,
      kind: "process-row",
      source,
      timestamp,
      title: block.isError ? "命令需要关注" : "已运行命令",
      text: cleanPrimaryText(block.preview ?? (block.isError ? "命令执行失败" : "命令执行完成")),
      status: block.status,
      isError: block.isError,
      detailText: "command" in block && block.command ? String(block.command) : undefined,
    };
  }

  if (block.kind === "tool-result" || block.kind === "file-change") {
    if (!text) return null;
    const title = block.kind === "file-change" ? "文件变更" : cleanToolTitle(block.title);
    return {
      id: `cell:${block.kind}:${block.id}`,
      kind: "process-row",
      source,
      timestamp,
      title,
      text,
      status: block.status,
      isError: block.isError,
      evidenceRefs: block.artifactRef ? [{ label: title || "详情", ref: block.artifactRef, kind: "artifact" }] : undefined,
    };
  }

  if (block.kind === "error") {
    const errorText = text || cleanPrimaryText(block.preview ?? "运行出错");
    if (!errorText) return null;
    return {
      id: `cell:error:${block.id}`,
      kind: "process-row",
      source: "aho-orchestration",
      timestamp,
      title: cleanToolTitle(block.title) || "运行出错",
      text: errorText,
      status: block.status,
      isError: true,
    };
  }

  if (!text) return null;
  return {
    id: `cell:fallback:${block.id ?? itemId}`,
    kind: "assistant-message",
    source,
    timestamp,
    title: cleanToolTitle(block.title),
    text,
    status: block.status,
    isError: block.isError,
    evidenceRefs: block.artifactRef ? [{ label: cleanToolTitle(block.title) || "详情", ref: block.artifactRef, kind: "artifact" }] : undefined,
  };
}

function consolidateTranscriptCells(cells: ParentAgentTranscriptCell[]): ParentAgentTranscriptCell[] {
  const result: ParentAgentTranscriptCell[] = [];
  for (const cell of cells) {
    if (!cell.text.trim()) continue;
    const prev = result.at(-1);
    if (
      prev
      && prev.kind === "assistant-message"
      && cell.kind === "assistant-message"
      && prev.source === cell.source
      && !prev.title
      && !cell.title
    ) {
      result[result.length - 1] = {
        ...prev,
        id: `${prev.id}+${cell.id}`,
        text: cleanPrimaryText(`${prev.text}\n\n${cell.text}`),
        timestamp: prev.timestamp ?? cell.timestamp,
      };
      continue;
    }
    result.push(cell);
  }
  return result;
}

function dedupeTranscriptCellEvidenceRefs(cells: ParentAgentTranscriptCell[]): ParentAgentTranscriptCell[] {
  const seenCells = new Set<string>();
  const seenRefs = new Set<string>();
  const result: ParentAgentTranscriptCell[] = [];
  for (const cell of cells) {
    const refs = cell.evidenceRefs?.filter((ref) => {
      const key = `${ref.kind}:${ref.ref}`;
      if (seenRefs.has(key)) return false;
      seenRefs.add(key);
      return true;
    });
    const key = `${cell.kind}:${cell.source}:${cell.title ?? ""}:${cell.text}:${cell.status ?? ""}:${refs?.map((ref) => ref.ref).join("|") ?? ""}`;
    if (seenCells.has(key)) continue;
    seenCells.add(key);
    result.push({ ...cell, ...(refs?.length ? { evidenceRefs: refs } : { evidenceRefs: undefined }) });
  }
  return result;
}

function transcriptItemsFromCells(cells: ParentAgentTranscriptCell[]): ParentAgentTranscriptItem[] {
  return cells
    .filter((cell) => cell.kind !== "detail-only")
    .map((cell) => ({
      id: `item:${cell.id}`,
      actor: cell.kind === "user-message" ? "user" : "parent-agent",
      timestamp: cell.timestamp,
      derived: cell.source !== "user" && cell.source !== "codex-runtime",
      blocks: [{
        id: `block:${cell.id}`,
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

function isGeneratedRunContext(value: string | undefined): boolean {
  const text = value ?? "";
  return text.includes("# AHO 需求对话 Chat")
    || text.includes("# Run Context Projection")
    || text.includes("You are answering inside the AHO Workbench")
    || text.includes("## Current User Message")
    || text.includes("## User Message");
}

function cleanToolTitle(value: string | undefined): string | undefined {
  const text = cleanPrimaryText(value ?? "");
  if (!text || text === "AI" || text === "AI 回复" || text === "执行结果") return undefined;
  if (text === "Command completed") return "已运行命令";
  if (text === "Command started") return "命令执行中";
  if (text === "Command failed") return "命令需要关注";
  return text;
}

function cleanPrimaryText(value: string | undefined): string {
  return (value ?? "").trim();
}
