import { join } from "node:path";
import { canonicalThreadChangeIdForPath, readChangeMetadataFile } from "../change/metadata.js";
import type { ResolvedMemory } from "../types/index.js";
import { WorkbenchStore, type StoredTopicMessage } from "./store.js";
import type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  AssistantTurnBlockKind,
  TopicFileReference,
  TopicAttachment,
  TopicThreadEntry,
  TopicThreadEventType,
  WorkbenchAssistantEvent,
} from "./types.js";

export async function readConversationThread(memory: ResolvedMemory, changePath: string): Promise<TopicThreadEntry[]> {
  const changeId = await readCanonicalThreadChangeId(memory, changePath);
  const projectId = memory.projectId ?? "unregistered";
  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = store.readConversation(projectId, changeId) ?? store.findConversationForChange(projectId, changeId);
    if (!conversation) return [];
    return store.listConversationMessages(projectId, conversation.conversationId).map(fromStoredThreadMessage);
  } finally {
    store.close();
  }
}

export interface ConversationThreadPageOptions {
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

export async function readConversationThreadPage(
  memory: ResolvedMemory,
  changePath: string,
  options: ConversationThreadPageOptions = {},
): Promise<TopicThreadLogPage> {
  const changeId = await readCanonicalThreadChangeId(memory, changePath);
  const projectId = memory.projectId ?? "unregistered";
  const limit = normalizeThreadPageLimit(options.limit);
  const beforePosition = options.beforeCursor ? decodeTopicThreadCursor(options.beforeCursor) : undefined;
  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = store.readConversation(projectId, changeId) ?? store.findConversationForChange(projectId, changeId);
    if (!conversation) {
      return {
        entries: [],
        limit,
        totalCount: 0,
        hasMoreBefore: false,
      };
    }
    const totalCount = store.countMessages(projectId, conversation.conversationId);
    if (beforePosition !== undefined && beforePosition > totalCount) throw invalidCursor();
    const rows = beforePosition !== undefined
      ? store.listMessagesBeforePosition(projectId, conversation.conversationId, beforePosition, limit)
      : store.listLatestMessages(projectId, conversation.conversationId, limit);
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

export async function collectAllConversationThreadEntries(memory: ResolvedMemory): Promise<TopicThreadEntry[]> {
  if (!memory.projectId) return [];
  const store = await WorkbenchStore.open(memory);
  try {
    return store.listAllMessages(memory.projectId).map(fromStoredThreadMessage);
  } finally {
    store.close();
  }
}

async function readCanonicalThreadChangeId(memory: ResolvedMemory, changePath: string): Promise<string> {
  const fallback = changePath.split(/[\\/]/).at(-1) ?? "";
  const metadata = await readChangeMetadataFile(join(memory.memoryRoot, changePath)).catch(() => null);
  if (metadata) return canonicalThreadChangeIdForPath(memory, changePath, metadata);
  return fallback;
}

export function fromStoredThreadMessage(row: StoredTopicMessage): TopicThreadEntry {
  const raw = parseStoredRawJson(row.rawJson);
  return {
    id: row.id,
    type: row.type as TopicThreadEventType,
    timestamp: row.timestamp,
    conversationId: row.conversationId,
    graphScopeId: typeof raw.graphScopeId === "string" ? raw.graphScopeId : undefined,
    changeId: row.changeId,
    text: row.text ?? undefined,
    actionRunId: row.actionRunId ?? undefined,
    actionType: row.actionType ?? undefined,
    status: row.status ?? undefined,
    runId: row.runId ?? undefined,
    threadId: row.threadId ?? (typeof raw.threadId === "string" ? raw.threadId : undefined),
    parentThreadId: typeof raw.parentThreadId === "string" ? raw.parentThreadId : undefined,
    turnId: row.turnId ?? (typeof raw.turnId === "string" ? raw.turnId : undefined),
    itemId: row.itemId ?? (typeof raw.itemId === "string" ? raw.itemId : undefined),
    agentRoleId: typeof raw.agentRoleId === "string" ? raw.agentRoleId : undefined,
    agentTaskId: typeof raw.agentTaskId === "string" ? raw.agentTaskId : undefined,
    artifact: row.artifact ?? undefined,
    error: row.error ?? undefined,
    resultSummary: typeof raw.resultSummary === "string" ? raw.resultSummary : undefined,
    activity: Array.isArray(raw.activity) ? raw.activity.filter(isAssistantTurnActivity) : undefined,
    blocks: Array.isArray(raw.blocks) ? raw.blocks.filter(isAssistantTurnBlock) : undefined,
    intake: raw.intake,
    clarification: raw.clarification,
    providerId: row.providerId ?? (typeof raw.providerId === "string" ? raw.providerId : undefined),
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
    attemptId: typeof raw.attemptId === "string" ? raw.attemptId : undefined,
    providerUserInput: isWorkbenchProviderUserInputRequest(raw.providerUserInput) ? raw.providerUserInput : undefined,
    contextRefs: Array.isArray(raw.contextRefs) ? raw.contextRefs.filter(isTopicFileReference) : undefined,
    attachments: Array.isArray(raw.attachments) ? raw.attachments.filter(isTopicAttachment) : undefined,
    planHandoff: isValidatedPlanHandoffIntent(raw.planHandoff) ? raw.planHandoff : undefined,
    position: row.position,
    completedTurnSequence: typeof raw.completedTurnSequence === "number" ? raw.completedTurnSequence : undefined,
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

function isValidatedPlanHandoffIntent(value: unknown): value is import("./types.js").ValidatedPlanHandoffIntent {
  return isRecord(value)
    && value.sourceAgentRoleId === "planning-agent"
    && (value.kind === "execute-plan" || value.kind === "revise-plan" || value.kind === "skip-plan")
    && typeof value.sourceRunId === "string"
    && typeof value.planText === "string"
    && (value.executionMode === undefined || value.executionMode === "stepwise" || value.executionMode === "scoped-auto");
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
    "workflow-evidence",
    "usage",
    "error",
  ].includes(value);
}

function isTopicFileReference(value: unknown): value is TopicFileReference {
  if (!isRecord(value)) return false;
  return typeof value.relativePath === "string"
    && typeof value.name === "string"
    && (value.kind === "file" || value.kind === "directory");
}

function isTopicAttachment(value: unknown): value is TopicAttachment {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.fileName === "string"
    && typeof value.mediaType === "string"
    && (value.kind === "image" || value.kind === "text" || value.kind === "unsupported")
    && typeof value.size === "number"
    && typeof value.hash === "string"
    && value.source === "composer"
    && typeof value.createdAt === "string"
    && typeof value.storagePath === "string"
    && (value.runtimeMode === "provider-image-input" || value.runtimeMode === "bounded-text-preview" || value.runtimeMode === "metadata-only");
}

function isWorkbenchAssistantEvent(value: unknown): value is WorkbenchAssistantEvent {
  return isRecord(value) && typeof value.runId === "string" && typeof value.kind === "string";
}

function isWorkbenchProviderUserInputRequest(value: unknown): value is import("./types.js").WorkbenchProviderUserInputRequest {
  return isRecord(value)
    && typeof value.providerId === "string"
    && typeof value.attemptId === "string"
    && typeof value.requestKey === "string"
    && typeof value.requestId === "string"
    && typeof value.runId === "string"
    && typeof value.runtimeScopeId === "string"
    && Array.isArray(value.questions)
    && (value.status === "pending"
      || value.status === "submitting"
      || value.status === "submitted"
      || value.status === "interrupted"
      || value.status === "superseded");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
