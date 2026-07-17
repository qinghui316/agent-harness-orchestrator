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

export async function readRecentConversationThread(
  memory: ResolvedMemory,
  changePath: string,
  limit = 100,
): Promise<TopicThreadEntry[]> {
  const changeId = await readCanonicalThreadChangeId(memory, changePath);
  const projectId = memory.projectId ?? "unregistered";
  const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = store.readConversation(projectId, changeId) ?? store.findConversationForChange(projectId, changeId);
    if (!conversation) return [];
    return store.listRecentSemanticMessages(projectId, conversation.conversationId, boundedLimit).map(fromStoredThreadMessage);
  } finally {
    store.close();
  }
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
    agentSurfaceId: row.agentSurfaceId,
    threadId: row.threadId ?? undefined,
    parentThreadId: typeof raw.parentThreadId === "string" ? raw.parentThreadId : undefined,
    turnId: row.turnId ?? undefined,
    itemId: row.itemId ?? undefined,
    agentRoleId: typeof raw.agentRoleId === "string" ? raw.agentRoleId : undefined,
    agentTaskId: typeof raw.agentTaskId === "string" ? raw.agentTaskId : undefined,
    initialThreadInput: row.initialThreadInput ? true : undefined,
    artifact: row.artifact ?? undefined,
    error: row.error ?? undefined,
    resultSummary: typeof raw.resultSummary === "string" ? raw.resultSummary : undefined,
    activity: Array.isArray(raw.activity) ? raw.activity.filter(isAssistantTurnActivity) : undefined,
    blocks: Array.isArray(raw.blocks) ? raw.blocks.filter(isAssistantTurnBlock) : undefined,
    intake: raw.intake,
    clarification: raw.clarification,
    providerId: row.providerId ?? undefined,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
    attemptId: typeof raw.attemptId === "string" ? raw.attemptId : undefined,
    providerUserInput: isWorkbenchProviderUserInputRequest(raw.providerUserInput) ? raw.providerUserInput : undefined,
    contextRefs: Array.isArray(raw.contextRefs) ? raw.contextRefs.filter(isTopicFileReference) : undefined,
    attachments: Array.isArray(raw.attachments) ? raw.attachments.filter(isTopicAttachment) : undefined,
    planHandoff: isValidatedPlanHandoffIntent(raw.planHandoff) ? raw.planHandoff : undefined,
    document: isCanonicalPlanDocument(raw.document) ? raw.document : undefined,
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
    && typeof value.sourceDocumentId === "string"
    && typeof value.sourceCanonicalItemId === "string"
    && typeof value.sourceProposalHash === "string"
    && typeof value.planText === "string"
    && (value.executionMode === undefined || value.executionMode === "stepwise" || value.executionMode === "scoped-auto");
}

function isCanonicalPlanDocument(value: unknown): value is import("./types.js").CanonicalPlanDocument {
  return isRecord(value)
    && value.documentKind === "plan"
    && typeof value.documentId === "string"
    && typeof value.title === "string"
    && typeof value.sourceMessageId === "string"
    && typeof value.sourceCanonicalItemId === "string"
    && typeof value.proposalId === "string"
    && typeof value.proposalHash === "string"
    && typeof value.proposalArtifact === "string"
    && typeof value.contentHash === "string"
    && typeof value.agentSurfaceId === "string";
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
