import type { ParentAgentTranscriptCell } from "./parent-agent-transcript.js";
import { canonicalTranscriptCellsFromThreadItem } from "./parent-agent-transcript.js";
import type { WorkbenchProjectInput } from "./read-model-types.js";
import { resolveWorkbenchMemory } from "./projections/read-model/support.js";
import { fromStoredThreadMessage } from "./conversation-thread-log.js";
import { WorkbenchStore, type StoredTopicMessage } from "./store.js";

export interface CanonicalTimelineScope {
  projectId: string;
  conversationId: string;
  agentSurfaceId: string;
}

export interface CanonicalTimelineEnvelope {
  conversationId: string;
  agentSurfaceId: string;
  messageId: string;
  position: number;
  revision: number;
  orderClass: "sequence" | "thread-start";
  graphScopeId?: string;
  cells: ParentAgentTranscriptCell[];
}

export interface CanonicalTimelinePage {
  conversationId: string;
  agentSurfaceId: string;
  watermark: number;
  pinned: CanonicalTimelineEnvelope[];
  entries: CanonicalTimelineEnvelope[];
  paging: {
    limit: number;
    totalCount: number;
    hasMoreBefore: boolean;
    nextBeforeCursor?: string;
  };
}

interface CanonicalTimelineCursor {
  projectId: string;
  conversationId: string;
  agentSurfaceId: string;
  beforePosition: number;
  watermarkRevision: number;
}

const DEFAULT_TIMELINE_PAGE_LIMIT = 100;
const MAX_TIMELINE_PAGE_LIMIT = 500;
const TIMELINE_CURSOR_PREFIX = "canonical-timeline-v1:";

export async function getCanonicalTimelinePage(
  input: WorkbenchProjectInput,
  conversationId: string,
  agentSurfaceId: string,
  options: { limit?: number; beforeCursor?: string } = {},
): Promise<CanonicalTimelinePage> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !memory.projectId) throw notFound(`Conversation not found: ${conversationId}.`);
  const scope = { projectId: memory.projectId, conversationId, agentSurfaceId };
  const limit = normalizePageLimit(options.limit);
  const store = await WorkbenchStore.open(memory);
  try {
    const cursor = options.beforeCursor ? decodeCanonicalTimelineCursor(options.beforeCursor, scope) : undefined;
    const snapshot = store.readTimelineSurfacePageSnapshot(scope.projectId, conversationId, agentSurfaceId, {
      beforePosition: cursor?.beforePosition,
      limit,
    });
    if (!snapshot) throw notFound(`Conversation not found: ${conversationId}.`);
    if (cursor && cursor.watermarkRevision > snapshot.conversation.timelineRevision) throw invalidCursor();
    const { rows, pinnedRows, totalCount, hasMoreBefore } = snapshot;
    const firstPosition = rows[0]?.position;
    const watermark = snapshot.conversation.timelineRevision;
    return {
      conversationId,
      agentSurfaceId,
      watermark,
      pinned: pinnedRows.map(canonicalTimelineEnvelopeFromStoredRow),
      entries: rows.map(canonicalTimelineEnvelopeFromStoredRow),
      paging: {
        limit,
        totalCount,
        hasMoreBefore,
        ...(hasMoreBefore && firstPosition !== undefined ? {
          nextBeforeCursor: encodeCanonicalTimelineCursor({ ...scope, beforePosition: firstPosition, watermarkRevision: watermark }),
        } : {}),
      },
    };
  } finally {
    store.close();
  }
}

export function canonicalTimelineEnvelopeFromStoredRow(row: StoredTopicMessage): CanonicalTimelineEnvelope {
  const entry = fromStoredThreadMessage(row);
  const child = row.agentSurfaceId !== "main-agent";
  return {
    conversationId: row.conversationId,
    agentSurfaceId: row.agentSurfaceId,
    messageId: row.id,
    position: row.position,
    revision: row.revision,
    orderClass: row.initialThreadInput ? "thread-start" : "sequence",
    graphScopeId: entry.graphScopeId,
    cells: canonicalTranscriptCellsFromThreadItem({
      ...entry,
      kind: entry.type === "user.message" ? "user-message" : "assistant-turn",
      label: entry.text ?? entry.type,
      body: entry.text,
    }, child ? { forceAgentRoleId: entry.agentRoleId } : { parentVisible: true }),
  };
}

export function encodeCanonicalTimelineCursor(cursor: CanonicalTimelineCursor): string {
  return `${TIMELINE_CURSOR_PREFIX}${Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")}`;
}

export function decodeCanonicalTimelineCursor(cursor: string, expectedScope: CanonicalTimelineScope): CanonicalTimelineCursor {
  if (!cursor.startsWith(TIMELINE_CURSOR_PREFIX)) throw invalidCursor();
  try {
    const decoded = JSON.parse(Buffer.from(cursor.slice(TIMELINE_CURSOR_PREFIX.length), "base64url").toString("utf8")) as unknown;
    if (!isRecord(decoded)
      || decoded.projectId !== expectedScope.projectId
      || decoded.conversationId !== expectedScope.conversationId
      || decoded.agentSurfaceId !== expectedScope.agentSurfaceId
      || !isPositiveSafeInteger(decoded.beforePosition)
      || !isNonNegativeSafeInteger(decoded.watermarkRevision)) throw invalidCursor();
    return decoded as unknown as CanonicalTimelineCursor;
  } catch (error) {
    if (error instanceof Error && error.name === "BadRequest") throw error;
    throw invalidCursor();
  }
}

function normalizePageLimit(value?: number): number {
  if (!Number.isFinite(value) || !value) return DEFAULT_TIMELINE_PAGE_LIMIT;
  return Math.max(1, Math.min(MAX_TIMELINE_PAGE_LIMIT, Math.trunc(value)));
}

function invalidCursor(): Error {
  const error = new Error("Invalid canonical Timeline cursor.");
  error.name = "BadRequest";
  return error;
}

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFound";
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
