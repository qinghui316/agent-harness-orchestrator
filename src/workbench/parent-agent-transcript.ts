import type { AssistantTurnActivity, AssistantTurnBlock, TopicAttachment, TopicFileReference } from "./types.js";
import { sanitizeMainAgentVisibleText } from "./main-agent-visible-text.js";

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
  agentRoleId?: string;
  agentTaskId?: string;
  runId?: string;
  timestamp?: string;
  title?: string;
  text: string;
  status?: string;
  evidenceRefs?: ParentAgentEvidenceRef[];
  isError?: boolean;
  realtime?: boolean;
  detailText?: string;
  contextRefs?: TopicFileReference[];
  attachments?: TopicAttachment[];
}

export interface ParentAgentTranscript {
  conversationId?: string;
  changeId?: string;
  title: string;
  cells: ParentAgentTranscriptCell[];
  items: ParentAgentTranscriptItem[];
  emptyMessage?: string;
  paging?: ParentAgentTranscriptPaging;
}

export interface ParentAgentTranscriptPaging {
  limit: number;
  totalCount: number;
  hasMoreBefore: boolean;
  nextBeforeCursor?: string;
}

export interface ParentAgentTranscriptPageOptions {
  beforeCursor?: string;
  limit?: number;
}

const DEFAULT_TRANSCRIPT_PAGE_LIMIT = 100;
const MAX_TRANSCRIPT_PAGE_LIMIT = 500;

interface TranscriptWorkpadInput {
  conversationId?: string;
  boundChangeId?: string;
  title: string;
}

interface TranscriptThreadItemInput {
  id: string;
  kind: string;
  label: string;
  body?: string;
  actionType?: string;
  timestamp?: string;
  source?: string;
  status?: string;
  runId?: string;
  artifact?: string;
  agentRoleId?: string;
  agentTaskId?: string;
  activity?: AssistantTurnActivity[];
  blocks?: AssistantTurnBlock[];
  contextRefs?: TopicFileReference[];
  attachments?: TopicAttachment[];
}

export function buildParentAgentTranscript(input: {
  workpad: TranscriptWorkpadInput;
  threadItems: TranscriptThreadItemInput[];
}): ParentAgentTranscript {
  const cells = dedupeTranscriptCellEvidenceRefs(consolidateTranscriptCells(input.threadItems
    .filter(shouldShowInParentTranscript)
    .flatMap((item) => transcriptCellsFromThreadItem(item, { parentVisible: true }))));
  return {
    conversationId: input.workpad.conversationId,
    changeId: input.workpad.boundChangeId,
    title: cleanPrimaryText(input.workpad.title) || "需求对话",
    cells,
    items: transcriptItemsFromCells(cells),
    emptyMessage: "暂无对话内容。输入需求后，主 agent 会在这里持续回复。",
  };
}

export function buildAgentScopedTranscriptCells(threadItems: TranscriptThreadItemInput[], agentRoleId: string): ParentAgentTranscriptCell[] {
  return dedupeTranscriptCellEvidenceRefs(consolidateTranscriptCells(threadItems
    .filter((item) => item.agentRoleId === agentRoleId)
    .flatMap((item) => transcriptCellsFromThreadItem(item, { forceAgentRoleId: agentRoleId }))));
}

export function pageParentAgentTranscript(
  transcript: ParentAgentTranscript,
  options: ParentAgentTranscriptPageOptions = {},
): ParentAgentTranscript {
  const limit = normalizeTranscriptPageLimit(options.limit);
  const displayCells = transcript.cells.filter((cell) => cell.kind !== "detail-only");
  const beforeIndex = options.beforeCursor
    ? displayCells.findIndex((cell) => cell.id === options.beforeCursor)
    : -1;
  const endExclusive = beforeIndex >= 0 ? beforeIndex : displayCells.length;
  const start = Math.max(0, endExclusive - limit);
  const cells = displayCells.slice(start, endExclusive);
  const hasMoreBefore = start > 0;
  return {
    ...transcript,
    cells,
    items: transcriptItemsFromCells(cells),
    paging: {
      limit,
      totalCount: displayCells.length,
      hasMoreBefore,
      nextBeforeCursor: hasMoreBefore ? cells[0]?.id : undefined,
    },
  };
}

function normalizeTranscriptPageLimit(value?: number): number {
  if (!Number.isFinite(value) || !value) return DEFAULT_TRANSCRIPT_PAGE_LIMIT;
  return Math.max(1, Math.min(MAX_TRANSCRIPT_PAGE_LIMIT, Math.trunc(value)));
}

function shouldShowInParentTranscript(item: TranscriptThreadItemInput): boolean {
  if (item.kind === "change-state") return false;
  if (item.agentRoleId && item.agentRoleId !== "main-agent") return false;
  return true;
}

function transcriptCellsFromThreadItem(
  item: TranscriptThreadItemInput,
  options: { forceAgentRoleId?: string; parentVisible?: boolean } = {},
): ParentAgentTranscriptCell[] {
  const agentRoleId = options.forceAgentRoleId ?? item.agentRoleId;
  if (item.kind === "user-message") {
    const text = cleanPrimaryText(item.body ?? item.label);
    return text
      ? [{
          id: `cell:user:${item.id}`,
          kind: "user-message",
          source: "user",
          timestamp: item.timestamp,
          agentRoleId,
          agentTaskId: item.agentTaskId,
          runId: item.runId,
          text,
          contextRefs: item.contextRefs?.length ? item.contextRefs : undefined,
          attachments: item.attachments?.length ? item.attachments : undefined,
        }]
      : [];
  }

  const cells: ParentAgentTranscriptCell[] = [];
  cells.push(...activityCellsFromThreadItem(item, agentRoleId));
  for (const block of item.blocks ?? []) {
    const cell = transcriptCellFromAssistantBlock(block, item, agentRoleId, Boolean(options.parentVisible));
    if (cell) {
      cells.push({
        ...cell,
        agentRoleId,
        agentTaskId: item.agentTaskId,
        runId: cell.runId ?? item.runId,
        evidenceRefs: item.artifact
          ? [{ label: "Plan proposal", ref: item.artifact, kind: "artifact" }, ...(cell.evidenceRefs ?? [])]
          : cell.evidenceRefs,
      });
    }
  }
  return cells.filter((cell) => Boolean(cell.text.trim()));
}

function activityCellsFromThreadItem(item: TranscriptThreadItemInput, agentRoleId?: string): ParentAgentTranscriptCell[] {
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
    agentRoleId,
    agentTaskId: item.agentTaskId,
    runId: item.runId,
    title: errorCount > 0 ? "过程需要关注" : toolCount > 0 ? "已运行命令" : undefined,
    text: parts.join("\n"),
    status: item.status,
    isError: errorCount > 0,
  }];
}

function transcriptCellFromAssistantBlock(
  block: AssistantTurnBlock,
  item: TranscriptThreadItemInput,
  agentRoleId: string | undefined,
  parentVisible: boolean,
): ParentAgentTranscriptCell | null {
  if (block.kind === "usage") return null;
  const source: ParentAgentTranscriptBlockSource =
    block.source === "codex" ? "codex-runtime" : block.source === "workflow" ? "workflow-evidence" : "aho-orchestration";
  const rawText = block.text ?? block.preview ?? "";
  const text = isGeneratedRunContext(rawText)
    ? ""
    : cleanPrimaryText(parentVisible && (!agentRoleId || agentRoleId === "main-agent")
      ? sanitizeMainAgentVisibleText(rawText)
      : rawText);
  const itemId = item.id;
  const timestamp = item.timestamp;

  if (block.kind === "workflow-evidence") return null;
  if (source === "workflow-evidence" && block.kind === "prose") {
    if (!text) return null;
    return {
      id: `cell:workflow-result:${block.id ?? itemId}`,
      kind: "assistant-message",
      source,
      timestamp,
      title: cleanToolTitle(block.title),
      text,
      status: block.status,
      isError: block.isError,
    };
  }
  if (block.kind === "prose" || block.kind === "reasoning-summary") {
    if (source !== "codex-runtime") return null;
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
    if (source !== "codex-runtime" && !block.isError && !isAgentLifecycleStatus(statusText.toLowerCase())) return null;
    return {
      id: `cell:status:${block.id}`,
      kind: block.isError || source !== "codex-runtime" ? "process-row" : "detail-only",
      source,
      timestamp,
      title: block.isError ? "过程需要关注" : cleanToolTitle(block.title),
      text: statusText,
      status: block.status,
      isError: block.isError,
    };
  }

  if (source !== "codex-runtime" && block.kind !== "error") return null;

  if (block.kind === "command-group") {
    const commandCount = block.children?.filter((child) => child.kind === "command").length ?? 0;
    const failedCount = block.children?.filter((child) => child.kind === "command" && child.isError).length ?? 0;
    const commandText = summarizeCommandCount(commandCount, failedCount, block.status, block.isError);
    const detailText = commandGroupDetailText(block.children ?? []);
    return {
      id: `cell:command-group:${block.id}`,
      kind: "process-row",
      source,
      timestamp,
      title: failedCount > 0 || block.isError ? "命令需要关注" : "已运行命令",
      text: commandText,
      status: block.status,
      isError: block.isError || failedCount > 0,
      detailText,
    };
  }

  if (block.kind === "command") {
    return {
      id: `cell:command:${block.id}`,
      kind: "process-row",
      source,
      timestamp,
      title: block.isError ? "命令需要关注" : "已运行命令",
      text: summarizeCommandCount(1, block.isError ? 1 : 0, block.status, block.isError),
      status: block.status,
      isError: block.isError,
      detailText: commandDetailText(block),
    };
  }

  if (block.kind === "tool-result" || block.kind === "file-change") {
    const title = block.kind === "file-change" ? "文件变更" : cleanToolTitle(block.title);
    const summary = block.kind === "file-change"
      ? "文件已变更"
      : title
        ? `${title} 已完成`
        : block.isError
          ? "工具调用失败"
          : "工具调用已完成";
    const detailText = cleanPrimaryText([block.text, block.preview].filter(Boolean).join("\n\n"));
    return {
      id: `cell:${block.kind}:${block.id}`,
      kind: "process-row",
      source,
      timestamp,
      title,
      text: summary,
      status: block.status,
      isError: block.isError,
      detailText: detailText || undefined,
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
      && prev.agentRoleId === cell.agentRoleId
      && prev.agentTaskId === cell.agentTaskId
      && prev.runId === cell.runId
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
    const key = `${cell.agentRoleId ?? ""}:${cell.agentTaskId ?? ""}:${cell.kind}:${cell.source}:${cell.title ?? ""}:${cell.text}:${cell.status ?? ""}:${refs?.map((ref) => ref.ref).join("|") ?? ""}`;
    if (seenCells.has(key)) continue;
    seenCells.add(key);
    result.push({ ...cell, ...(refs?.length ? { evidenceRefs: refs } : { evidenceRefs: undefined }) });
  }
  return result;
}

function isAgentLifecycleStatus(value: string): boolean {
  return /(委派|创建|运行中|返回结果|失败).{0,24}(planning-agent|coder-agent|validator|auditor|rework|scheduler worker)/i.test(value)
    || /(planning-agent|coder-agent|validator|auditor|rework|scheduler worker).{0,24}(委派|创建|运行中|返回结果|失败)/i.test(value);
}

function summarizeCommandCount(commandCount: number, failedCount: number, status?: string, isError?: boolean): string {
  if (status === "running" || status === "started") return "正在运行命令";
  const count = commandCount > 0 ? commandCount : 1;
  if (isError || failedCount > 0) return failedCount > 0 ? `已运行 ${count} 条命令，${failedCount} 条需要关注` : `已运行 ${count} 条命令，需要关注`;
  return `已运行 ${count} 条命令`;
}

function commandGroupDetailText(children: AssistantTurnBlock[]): string | undefined {
  const details = children
    .filter((child) => child.kind === "command")
    .map(commandDetailText)
    .filter((item): item is string => Boolean(item));
  return details.length ? details.join("\n\n---\n\n") : undefined;
}

function commandDetailText(block: AssistantTurnBlock): string | undefined {
  const sections: string[] = [];
  if (block.command) sections.push(`$ ${block.command}`);
  if (block.cwd) sections.push(`cwd: ${block.cwd}`);
  if (typeof block.exitCode === "number") sections.push(`exit: ${block.exitCode}`);
  const output = cleanPrimaryText([block.text, block.preview].filter(Boolean).join("\n\n"));
  if (output) sections.push(output);
  return sections.length ? sections.join("\n") : undefined;
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
  if (text === "Planning draft generated") return "计划已生成";
  if (text === "Planning draft revised") return "计划已修改";
  if (text === "Planning confirmed") return "计划已确认";
  return text;
}

function cleanPrimaryText(value: string | undefined): string {
  return (value ?? "").trim();
}
