import { existsSync } from "node:fs";
import { appendFile, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { canonicalThreadChangeIdForPath, readChangeMetadataFile } from "../change/metadata.js";
import type { ResolvedMemory } from "../types/index.js";
import { importThreadJsonlIfNeeded, WorkbenchStore, type StoredTopicMessage } from "./store.js";
import type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  AssistantTurnBlockKind,
  OrchestrationPlanCard,
  TopicThreadEntry,
  TopicThreadEventType,
  WorkbenchAssistantEvent,
} from "./types.js";

export async function readTopicThreadLog(memory: ResolvedMemory, changePath: string): Promise<TopicThreadEntry[]> {
  const changeId = await readCanonicalThreadChangeId(memory, changePath);
  const projectId = memory.projectId ?? "unregistered";
  await importThreadJsonlIfNeeded(memory, projectId, changeId, changePath);
  const store = await WorkbenchStore.open(memory);
  try {
    const rows = store.listMessages(projectId, changeId);
    if (rows.length > 0) return rows.map(fromStoredThreadMessage);
  } finally {
    store.close();
  }
  const path = join(memory.memoryRoot, changePath, "thread.jsonl");
  if (!existsSync(path)) return [];
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => ({ ...(JSON.parse(line) as TopicThreadEntry), position: index + 1 }));
}

export interface TopicThreadLogPageOptions {
  limit?: number;
  beforeCursor?: string;
}

export interface TopicThreadLogPage {
  entries: TopicThreadEntry[];
  limit: number;
  totalCount: number;
  hasMoreBefore: boolean;
  nextBeforeCursor?: string;
}

const DEFAULT_THREAD_PAGE_LIMIT = 100;
const MAX_THREAD_PAGE_LIMIT = 500;

export async function readTopicThreadLogPage(
  memory: ResolvedMemory,
  changePath: string,
  options: TopicThreadLogPageOptions = {},
): Promise<TopicThreadLogPage> {
  const changeId = await readCanonicalThreadChangeId(memory, changePath);
  const projectId = memory.projectId ?? "unregistered";
  const limit = normalizeThreadPageLimit(options.limit);
  const beforePosition = options.beforeCursor ? decodeTopicThreadCursor(options.beforeCursor) : undefined;
  await importThreadJsonlIfNeeded(memory, projectId, changeId, changePath);
  const store = await WorkbenchStore.open(memory);
  try {
    const totalCount = store.countMessages(projectId, changeId);
    if (beforePosition !== undefined && beforePosition > totalCount) throw invalidCursor();
    const rows = beforePosition !== undefined
      ? store.listMessagesBeforePosition(projectId, changeId, beforePosition, limit)
      : store.listLatestMessages(projectId, changeId, limit);
    const firstPosition = rows[0]?.position;
    return {
      entries: rows.map(fromStoredThreadMessage),
      limit,
      totalCount,
      hasMoreBefore: firstPosition !== undefined ? firstPosition > 1 : false,
      nextBeforeCursor: firstPosition !== undefined && firstPosition > 1 ? encodeTopicThreadCursor(firstPosition) : undefined,
    };
  } finally {
    store.close();
  }
}

export function encodeTopicThreadCursor(position: number): string {
  return `thread-position:${Buffer.from(JSON.stringify({ position }), "utf8").toString("base64url")}`;
}

export function decodeTopicThreadCursor(cursor: string): number {
  const prefix = "thread-position:";
  if (!cursor.startsWith(prefix)) throw invalidCursor();
  try {
    const decoded = JSON.parse(Buffer.from(cursor.slice(prefix.length), "base64url").toString("utf8")) as unknown;
    if (!isRecord(decoded) || typeof decoded.position !== "number") throw invalidCursor();
    const position = Math.trunc(decoded.position);
    if (!Number.isSafeInteger(position) || position < 1) throw invalidCursor();
    return position;
  } catch (error) {
    if (error instanceof Error && error.name === "BadRequest") throw error;
    throw invalidCursor();
  }
}

function normalizeThreadPageLimit(value?: number): number {
  if (!Number.isFinite(value) || !value) return DEFAULT_THREAD_PAGE_LIMIT;
  return Math.max(1, Math.min(MAX_THREAD_PAGE_LIMIT, Math.trunc(value)));
}

function invalidCursor(): Error {
  const error = new Error("Invalid transcript cursor.");
  error.name = "BadRequest";
  return error;
}

export async function appendTopicThreadLogEntry(memory: ResolvedMemory, changePath: string, entry: TopicThreadEntry): Promise<void> {
  await appendFile(join(memory.memoryRoot, changePath, "thread.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
  const store = await WorkbenchStore.open(memory);
  try {
    store.appendMessage(toStoredThreadMessage(memory, entry));
  } finally {
    store.close();
  }
}

export async function collectAllTopicThreadEntries(memory: ResolvedMemory): Promise<TopicThreadEntry[]> {
  if (memory.projectId) {
    const store = await WorkbenchStore.open(memory);
    try {
      const rows = store.listAllMessages(memory.projectId);
      if (rows.length > 0) return rows.map(fromStoredThreadMessage);
    } finally {
      store.close();
    }
  }
  const roots = [join(memory.changesRoot, "active"), join(memory.changesRoot, "archive")];
  const entries: TopicThreadEntry[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const changePath = relative(memory.memoryRoot, join(root, entry.name)).replace(/\\/g, "/");
      entries.push(...await readTopicThreadLog(memory, changePath));
    }
  }
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function readCanonicalThreadChangeId(memory: ResolvedMemory, changePath: string): Promise<string> {
  const fallback = changePath.split(/[\\/]/).at(-1) ?? "";
  const metadata = await readChangeMetadataFile(join(memory.memoryRoot, changePath)).catch(() => null);
  if (metadata) return canonicalThreadChangeIdForPath(memory, changePath, metadata);
  return fallback;
}

function toStoredThreadMessage(memory: ResolvedMemory, entry: TopicThreadEntry): Omit<StoredTopicMessage, "position"> {
  return {
    id: entry.id,
    projectId: memory.projectId ?? "unregistered",
    changeId: entry.changeId,
    type: entry.type,
    timestamp: entry.timestamp,
    text: entry.text ?? null,
    actionRunId: entry.actionRunId ?? null,
    actionType: entry.actionType ?? null,
    status: entry.status ?? null,
    runId: entry.runId ?? null,
    artifact: entry.artifact ?? null,
    error: entry.error ?? null,
    rawJson: JSON.stringify(entry),
  };
}

function fromStoredThreadMessage(row: StoredTopicMessage): TopicThreadEntry {
  const raw = parseStoredRawJson(row.rawJson);
  return {
    id: row.id,
    type: row.type as TopicThreadEventType,
    timestamp: row.timestamp,
    changeId: row.changeId,
    text: row.text ?? undefined,
    actionRunId: row.actionRunId ?? undefined,
    actionType: row.actionType ?? undefined,
    status: row.status ?? undefined,
    runId: row.runId ?? undefined,
    artifact: row.artifact ?? undefined,
    error: row.error ?? undefined,
    resultSummary: typeof raw.resultSummary === "string" ? raw.resultSummary : undefined,
    planCard: isPlanCard(raw.planCard) ? raw.planCard : undefined,
    activity: Array.isArray(raw.activity) ? raw.activity.filter(isAssistantTurnActivity) : undefined,
    blocks: Array.isArray(raw.blocks) ? raw.blocks.filter(isAssistantTurnBlock) : undefined,
    intake: raw.intake,
    clarification: raw.clarification,
    position: row.position,
  };
}

function parseStoredRawJson(rawJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isPlanCard(value: unknown): value is OrchestrationPlanCard {
  return isRecord(value) && typeof value.title === "string" && typeof value.summary === "string" && Array.isArray(value.steps);
}

function isAssistantTurnActivity(value: unknown): value is AssistantTurnActivity {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.timestamp !== "string") return false;
  if (value.kind === "status") return typeof value.label === "string";
  if (value.kind === "assistant-event") return isWorkbenchAssistantEvent(value.event);
  if (value.kind === "tool") return isRecord(value.tool) && typeof value.tool.runId === "string";
  if (value.kind === "usage") return isRecord(value.usage);
  if (value.kind === "error") return typeof value.message === "string";
  return false;
}

function isAssistantTurnBlock(value: unknown): value is AssistantTurnBlock {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.sequence !== "number" || typeof value.timestamp !== "string") return false;
  if (!isAssistantTurnBlockKind(value.kind) || typeof value.source !== "string") return false;
  if (value.children !== undefined && (!Array.isArray(value.children) || !value.children.every(isAssistantTurnBlock))) return false;
  if (value.planCard !== undefined && !isPlanCard(value.planCard)) return false;
  return true;
}

function isAssistantTurnBlockKind(value: unknown): value is AssistantTurnBlockKind {
  return typeof value === "string" && [
    "prose",
    "status",
    "command-group",
    "command",
    "tool-result",
    "file-change",
    "reasoning-summary",
    "plan-card",
    "workflow-evidence",
    "usage",
    "error",
  ].includes(value);
}

function isWorkbenchAssistantEvent(value: unknown): value is WorkbenchAssistantEvent {
  return isRecord(value) && typeof value.runId === "string" && typeof value.kind === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
