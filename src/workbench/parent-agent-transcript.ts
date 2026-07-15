import type { AssistantTurnActivity, AssistantTurnBlock, TopicAttachment, TopicFileReference, WorkbenchProviderUserInputRequest } from "./types.js";
import { commandDetailText, commandGroupDetailText, commandGroupSummary, commandRowTitle, groupConsecutiveCommandBlocks } from "../command-transcript.js";

export type ParentAgentTranscriptActor = "user" | "parent-agent";
export type ParentAgentTranscriptBlockKind = "prose" | "process" | "tool-result" | "evidence";
export type ParentAgentTranscriptBlockSource = "user" | "provider-runtime" | "aho-orchestration" | "workflow-evidence" | "maintenance";
export type ParentAgentTranscriptCellKind = "user-message" | "assistant-message" | "process-row" | "evidence-row" | "user-input" | "detail-only";

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
  threadId?: string;
  parentThreadId?: string;
  turnId?: string;
  agentSurfaceId?: string;
  targetAgentSurfaceId?: string;
  targetAgentDisplayName?: string;
  timestamp?: string;
  title?: string;
  text: string;
  status?: string;
  evidenceRefs?: ParentAgentEvidenceRef[];
  isError?: boolean;
  realtime?: boolean;
  activityKind?: "turn" | "reasoning" | "command" | "file" | "search" | "tool" | "agent" | "status";
  detailText?: string;
  contextRefs?: TopicFileReference[];
  attachments?: TopicAttachment[];
  providerUserInput?: WorkbenchProviderUserInputRequest;
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
  providerId?: string;
  attemptId?: string;
  runId?: string;
  threadId?: string;
  parentThreadId?: string;
  turnId?: string;
  artifact?: string;
  agentRoleId?: string;
  agentTaskId?: string;
  activity?: AssistantTurnActivity[];
  blocks?: AssistantTurnBlock[];
  contextRefs?: TopicFileReference[];
  attachments?: TopicAttachment[];
  providerUserInput?: WorkbenchProviderUserInputRequest;
}

export function buildParentAgentTranscript(input: {
  workpad: TranscriptWorkpadInput;
  threadItems: TranscriptThreadItemInput[];
}): ParentAgentTranscript {
  const cells = dedupeTranscriptCellEvidenceRefs(consolidateTranscriptCells(input.threadItems
    .filter(shouldShowInParentTranscript)
    .flatMap((item) => canonicalTranscriptCellsFromThreadItem(item, { parentVisible: true }))));
  return {
    conversationId: input.workpad.conversationId,
    changeId: input.workpad.boundChangeId,
    title: cleanPrimaryText(input.workpad.title) || "需求对话",
    cells,
    items: transcriptItemsFromCells(cells),
    emptyMessage: "暂无对话内容。输入需求后，主 agent 会在这里持续回复。",
  };
}

export function buildAgentScopedTranscriptCells(
  threadItems: TranscriptThreadItemInput[],
  scope: { agentRoleId: string; threadId?: string; runId?: string },
): ParentAgentTranscriptCell[] {
  return dedupeTranscriptCellEvidenceRefs(consolidateTranscriptCells(threadItems
    .filter((item) => (scope.threadId ? item.threadId === scope.threadId : item.agentRoleId === scope.agentRoleId)
      && (!scope.runId || item.runId === scope.runId))
    .flatMap((item) => canonicalTranscriptCellsFromThreadItem(item, { forceAgentRoleId: scope.agentRoleId }))));
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

export function canonicalTranscriptCellsFromThreadItem(
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
          threadId: item.threadId,
          parentThreadId: item.parentThreadId,
          text,
          contextRefs: item.contextRefs?.length ? item.contextRefs : undefined,
          attachments: item.attachments?.length ? item.attachments : undefined,
        }]
      : [];
  }

  if (item.providerUserInput) {
    const request = item.providerUserInput;
    const questionText = request.questions.map((question) => question.question).filter(Boolean).join("\n");
    return [{
      id: `cell:provider-user-input:${request.requestKey}`,
      kind: "user-input",
      source: "provider-runtime",
      timestamp: item.timestamp,
      agentRoleId,
      runId: request.runId,
      threadId: request.threadId,
      turnId: request.turnId,
      title: request.status === "submitted" ? "已回答" : "需要你回答",
      text: questionText || "Agent 需要你的回答。",
      status: request.status,
      providerUserInput: request,
    }];
  }

  const cells: ParentAgentTranscriptCell[] = [];
  for (const block of groupConsecutiveCommandBlocks(item.blocks ?? [])) {
    const cell = transcriptCellFromAssistantBlock(block, item);
    if (cell) {
      cells.push({
        ...cell,
        agentRoleId,
        agentTaskId: item.agentTaskId,
        runId: cell.runId ?? item.runId,
        status: cell.status ?? item.status,
        threadId: cell.threadId ?? block.threadId ?? item.threadId,
        parentThreadId: cell.parentThreadId ?? item.parentThreadId,
        turnId: cell.turnId ?? block.turnId,
        targetAgentSurfaceId: block.targetAgentSurfaceId,
        targetAgentDisplayName: block.targetAgentDisplayName,
        evidenceRefs: item.artifact
          ? [{ label: "Plan proposal", ref: item.artifact, kind: "artifact" }, ...(cell.evidenceRefs ?? [])]
          : cell.evidenceRefs,
      });
    }
  }
  cells.push(...activityCellsFromThreadItem(item, agentRoleId));
  return cells.filter((cell) => Boolean(cell.text.trim() || cell.detailText?.trim()));
}

function activityCellsFromThreadItem(item: TranscriptThreadItemInput, agentRoleId?: string): ParentAgentTranscriptCell[] {
  if (item.source === "workflow") return [];
  const activities = item.activity ?? [];
  if (activities.length === 0) return [];
  const startedAt = activities.find((activity) => activity.kind === "status" && ["started", "connecting", "thinking", "running"].includes(activity.label))?.timestamp;
  const terminal = [...activities].reverse().find((activity): activity is Extract<AssistantTurnActivity, { kind: "status" }> =>
    activity.kind === "status" && ["completed", "failed", "blocked", "cancelled"].includes(activity.label));
  if (!startedAt) return [];
  if (!terminal) {
    const latest = [...activities].reverse().find((activity): activity is Extract<AssistantTurnActivity, { kind: "status" }> => activity.kind === "status");
    const title = liveActivityTitle(latest?.label);
    return [{
      id: item.attemptId && item.turnId
        ? `cell:turn:${item.providerId ?? "provider"}:${item.attemptId}:${item.threadId ?? "main"}:${item.turnId}`
        : item.attemptId
        ? `cell:turn:${item.providerId ?? "provider"}:${item.attemptId}:provisional`
        : `cell:turn:${item.providerId ?? "provider"}:${item.runId ?? item.id}:${item.threadId ?? "main"}:${item.turnId ?? "turn"}`,
      kind: "process-row",
      source: "provider-runtime",
      timestamp: item.timestamp,
      agentRoleId,
      agentTaskId: item.agentTaskId,
      runId: item.runId,
      threadId: item.threadId,
      parentThreadId: item.parentThreadId,
      turnId: item.turnId,
      title,
      text: "",
      status: latest?.label ?? "running",
      realtime: true,
      activityKind: "turn",
    }];
  }
  const elapsedSeconds = Math.max(1, Math.round((Date.parse(terminal.timestamp) - Date.parse(startedAt)) / 1000));
  const failed = terminal.label !== "completed";
  const title = failed ? `本轮需要处理 · ${elapsedSeconds} 秒` : `已完成 · ${elapsedSeconds} 秒`;
  return [{
    id: item.attemptId && item.turnId
      ? `cell:turn:${item.providerId ?? "provider"}:${item.attemptId}:${item.threadId ?? "main"}:${item.turnId}`
      : item.attemptId
      ? `cell:turn:${item.providerId ?? "provider"}:${item.attemptId}:provisional`
      : `cell:turn:${item.providerId ?? "provider"}:${item.runId ?? item.id}:${item.threadId ?? "main"}:${item.turnId ?? "turn"}`,
    kind: "process-row",
    source: "provider-runtime",
    timestamp: item.timestamp,
    agentRoleId,
    agentTaskId: item.agentTaskId,
    runId: item.runId,
    threadId: item.threadId,
    parentThreadId: item.parentThreadId,
    turnId: item.turnId,
    title,
    text: title,
    status: terminal.label,
    isError: failed,
    activityKind: "turn",
  }];
}

function liveActivityTitle(status: string | undefined): string {
  if (status === "connecting") return "正在连接";
  if (status === "replying" || status === "streaming") return "正在回复";
  if (status === "waiting-user") return "等待你回答";
  if (status === "tool" || status === "tool-running") return "正在调用工具";
  return "正在思考";
}

function transcriptCellFromAssistantBlock(
  block: AssistantTurnBlock,
  item: TranscriptThreadItemInput,
): ParentAgentTranscriptCell | null {
  if (block.kind === "usage") return null;
  const source: ParentAgentTranscriptBlockSource =
    block.source === "provider" ? "provider-runtime" : block.source === "workflow" ? "workflow-evidence" : "aho-orchestration";
  const rawText = block.text ?? block.preview ?? "";
  const text = isGeneratedRunContext(rawText) ? "" : cleanPrimaryText(rawText);
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
  if (block.kind === "reasoning-summary") {
    if (source !== "provider-runtime" || !text) return null;
    return {
      id: transcriptCellIdForBlock(block, "reasoning"),
      kind: "process-row",
      source,
      timestamp,
      title: `思考摘要 · ${reasoningHeadline(text)}`,
      text: "",
      detailText: text,
      status: block.status,
      isError: block.isError,
      activityKind: "reasoning",
    };
  }
  if (block.kind === "prose") {
    if (source !== "provider-runtime") return null;
    if (!text) return null;
    return {
      id: transcriptCellIdForBlock(block, "assistant"),
      kind: "assistant-message",
      source,
      timestamp,
      title: cleanToolTitle(block.title),
      text,
      status: block.status,
      isError: block.isError,
      activityKind: "status",
    };
  }

  if (block.kind === "status") {
    const statusText = cleanPrimaryText([block.title, block.text ?? block.preview].filter(Boolean).join("\n"));
    if (!statusText) return null;
    if (source !== "provider-runtime" && !block.isError && !isAgentLifecycleStatus(statusText.toLowerCase())) return null;
    return {
      id: transcriptCellIdForBlock(block, "status"),
      kind: block.isError || source !== "provider-runtime" ? "process-row" : "detail-only",
      source,
      timestamp,
      title: block.isError ? "过程需要关注" : cleanToolTitle(block.title),
      text: statusText,
      status: block.status,
      isError: block.isError,
    };
  }

  const isPlanReadyArtifact = source === "aho-orchestration"
    && block.kind === "tool-result"
    && Boolean(block.artifactRef)
    && cleanToolTitle(block.title) === "计划已准备";
  if (source !== "provider-runtime" && block.kind !== "error" && !isPlanReadyArtifact) return null;

  if (block.kind === "command-group") {
    const failedCount = block.children?.filter((child) => child.kind === "command" && child.isError).length ?? 0;
    const commandText = commandGroupSummary(block);
    const detailText = commandGroupDetailText(block.children ?? []);
    return {
      id: transcriptCellIdForBlock(block, "command"),
      kind: "process-row",
      source,
      timestamp,
      title: commandText,
      text: commandText,
      status: block.status,
      isError: block.isError || failedCount > 0,
      activityKind: "command",
      detailText,
    };
  }

  if (block.kind === "command") {
    const title = commandRowTitle(block);
    return {
      id: transcriptCellIdForBlock(block, "command"),
      kind: "process-row",
      source,
      timestamp,
      title,
      text: title,
      status: block.status,
      isError: block.isError,
      activityKind: "command",
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
      id: transcriptCellIdForBlock(block, block.kind),
      kind: "process-row",
      source,
      timestamp,
      title,
      text: summary,
      status: block.status,
      isError: block.isError,
      activityKind: block.targetAgentSurfaceId ? "agent" : block.kind === "file-change" ? "file" : /search/i.test(block.title ?? "") ? "search" : "tool",
      detailText: detailText || undefined,
      evidenceRefs: block.artifactRef ? [{ label: title || "详情", ref: block.artifactRef, kind: "artifact" }] : undefined,
    };
  }

  if (block.kind === "error") {
    const errorText = text || cleanPrimaryText(block.preview ?? "运行出错");
    if (!errorText) return null;
    return {
      id: transcriptCellIdForBlock(block, "error"),
      kind: "process-row",
      source: "aho-orchestration",
      timestamp,
      title: cleanToolTitle(block.title) || "运行出错",
      text: errorText,
      status: block.status,
      isError: true,
      activityKind: "status",
    };
  }

  return assertNever(block.kind);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported assistant turn block kind: ${String(value)}`);
}

function transcriptCellIdForBlock(block: AssistantTurnBlock, kind: string): string {
  const identity = block.itemId
    ? `${block.providerId ?? "provider"}:${block.attemptId ?? "attempt"}:${block.runId ?? "run"}:${block.threadId ?? "main"}:${block.turnId ?? "turn"}:${block.itemId}`
    : block.id;
  return `cell:${kind}:${identity}`;
}

function reasoningHeadline(text: string): string {
  const normalized = cleanPrimaryText(text).replace(/\s+/g, " ");
  return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized;
}

function consolidateTranscriptCells(cells: ParentAgentTranscriptCell[]): ParentAgentTranscriptCell[] {
  const result: ParentAgentTranscriptCell[] = [];
  for (const cell of cells) {
    if (!cell.text.trim() && !cell.detailText?.trim()) continue;
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

function transcriptItemsFromCells(cells: ParentAgentTranscriptCell[]): ParentAgentTranscriptItem[] {
  return cells
    .filter((cell) => cell.kind !== "detail-only")
    .map((cell) => ({
      id: `item:${cell.id}`,
      actor: cell.kind === "user-message" ? "user" : "parent-agent",
      timestamp: cell.timestamp,
      derived: cell.source !== "user" && cell.source !== "provider-runtime",
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
  if (text === "Command completed") return "命令已完成";
  if (text === "Command started") return "正在运行命令";
  if (text === "Command failed") return "命令执行失败";
  if (text === "Planning draft generated") return "计划已生成";
  if (text === "Planning draft revised") return "计划已修改";
  if (text === "Planning confirmed") return "计划已确认";
  return text;
}

function cleanPrimaryText(value: string | undefined): string {
  return (value ?? "").trim();
}
