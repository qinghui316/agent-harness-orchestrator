import { assertWritableMemory } from "../memory/resolver.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { resolveTopic } from "./topic-resolver.js";
import { openWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { WorkbenchDatabase } from "./persistence/database.js";
import { canonicalTimelineEnvelopeFromStoredRow, type CanonicalTimelineEnvelope } from "./canonical-timeline.js";
import type { TopicThreadEntry, WorkbenchLiveSink } from "./types.js";

export interface ConversationTimelineWriter {
  upsert(entry: TopicThreadEntry): CanonicalTimelineEnvelope;
  close(): void;
}

export async function openConversationTimelineWriter(
  project: ManagedProject,
  changeId: string,
  live?: WorkbenchLiveSink,
): Promise<ConversationTimelineWriter> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Topic thread update");
  const store = await openWorkbenchDatabase(memory);
  const conversation = store.conversations.findConversationForChange(project.id, changeId);
  if (!conversation) {
    store.close();
    throw new Error(`Change ${changeId} is not bound to a Demand Conversation.`);
  }
  const graphScopeId = store.conversations.findGraphScopeForChange(project.id, changeId) ?? undefined;
  const knownIds = new Set(
    store.timeline.listConversationMessages(project.id, conversation.conversationId).map((message) => message.id),
  );
  return {
    upsert(entry) {
      const canonical: TopicThreadEntry = {
        ...entry,
        conversationId: conversation.conversationId,
        changeId,
        graphScopeId: entry.graphScopeId ?? graphScopeId,
      };
      const stored = {
        id: canonical.id,
        projectId: project.id,
        conversationId: conversation.conversationId,
        changeId,
        type: canonical.type,
        timestamp: canonical.timestamp,
        text: canonical.text ?? null,
        actionRunId: canonical.actionRunId ?? null,
        actionType: canonical.actionType ?? null,
        status: canonical.status ?? null,
        runId: canonical.runId ?? null,
        agentSurfaceId: canonicalAgentSurfaceId(canonical),
        providerId: canonical.providerId ?? null,
        threadId: canonical.threadId ?? null,
        turnId: canonical.turnId ?? null,
        itemId: canonical.itemId ?? null,
        artifact: canonical.artifact ?? null,
        error: canonical.error ?? null,
        rawJson: JSON.stringify(canonical),
      };
      let storedRow;
      if (knownIds.has(canonical.id)) {
        storedRow = store.timeline.updateMessage(stored);
      } else {
        storedRow = store.timeline.appendMessage(stored);
        knownIds.add(canonical.id);
      }
      const envelope = canonicalTimelineEnvelopeFromStoredRow(storedRow);
      live?.emit({ event: "timeline.patch", data: envelope });
      return envelope;
    },
    close() {
      store.close();
    },
  };
}

export async function appendConversationTimelineEntry(
  project: ManagedProject,
  changeId: string,
  input: Omit<TopicThreadEntry, "id" | "timestamp" | "changeId">,
  live?: WorkbenchLiveSink,
): Promise<CanonicalTimelineEnvelope> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Topic thread update");
  const store = await openWorkbenchDatabase(memory);
  const conversation = store.conversations.findConversationForChange(project.id, changeId);
  if (!conversation) {
    store.close();
    throw new Error(`Change ${changeId} is not bound to a Demand Conversation.`);
  }
  const entry: TopicThreadEntry = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    conversationId: conversation.conversationId,
    changeId,
    graphScopeId: store.conversations.findGraphScopeForChange(project.id, changeId) ?? undefined,
    ...input,
  };
  try {
    const stored = store.timeline.appendMessage({
      id: entry.id,
      projectId: project.id,
      conversationId: conversation.conversationId,
      changeId,
      type: entry.type,
      timestamp: entry.timestamp,
      text: entry.text ?? null,
      actionRunId: entry.actionRunId ?? null,
      actionType: entry.actionType ?? null,
      status: entry.status ?? null,
      runId: entry.runId ?? null,
      agentSurfaceId: canonicalAgentSurfaceId(entry),
      providerId: entry.providerId ?? null,
      threadId: entry.threadId ?? null,
      turnId: entry.turnId ?? null,
      itemId: entry.itemId ?? null,
      artifact: entry.artifact ?? null,
      error: entry.error ?? null,
      rawJson: JSON.stringify(entry),
    });
    const envelope = canonicalTimelineEnvelopeFromStoredRow(stored);
    live?.emit({ event: "timeline.patch", data: envelope });
    return envelope;
  } finally {
    store.close();
  }
}

function canonicalAgentSurfaceId(entry: TopicThreadEntry): string {
  if (entry.agentSurfaceId?.trim()) return entry.agentSurfaceId;
  if (entry.agentRoleId && entry.agentRoleId !== "main-agent") {
    throw new Error(`Canonical child Timeline entry ${entry.id} requires agentSurfaceId.`);
  }
  return "main-agent";
}

export async function deleteConversation(memory: ResolvedMemory, conversationId: string): Promise<void> {
  const store = await requireConversationStore(memory);
  try {
    const conversation = store.conversations.readConversation(memory.projectId!, conversationId, { includeDeleted: true });
    if (!conversation) throw conversationNotFound(conversationId);
    store.unitOfWork.deleteConversation(memory.projectId!, conversationId, new Date().toISOString());
  } finally {
    store.close();
  }
}

export async function hideConversation(memory: ResolvedMemory, conversationId: string): Promise<void> {
  const store = await requireConversationStore(memory);
  try {
    const conversation = store.conversations.readConversation(memory.projectId!, conversationId);
    if (!conversation) throw conversationNotFound(conversationId);
    if (conversation.state !== "archive") {
      const error = new Error("Only archived or completed conversations can be removed from the sidebar.");
      error.name = "Conflict";
      throw error;
    }
    store.conversations.hideConversation(memory.projectId!, conversationId, new Date().toISOString());
  } finally {
    store.close();
  }
}

async function requireConversationStore(memory: ResolvedMemory): Promise<WorkbenchDatabase> {
  if (!memory.projectId) {
    const error = new Error("Project id is required to update a conversation.");
    error.name = "Conflict";
    throw error;
  }
  return openWorkbenchDatabase(memory);
}

function conversationNotFound(conversationId: string): Error {
  const error = new Error(`Conversation not found: ${conversationId}.`);
  error.name = "NotFound";
  return error;
}
