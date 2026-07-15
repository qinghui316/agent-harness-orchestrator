import { assertWritableMemory } from "../memory/resolver.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { resolveTopic } from "./topic-resolver.js";
import { WorkbenchStore } from "./store.js";
import type { TopicThreadEntry } from "./types.js";

export async function appendConversationThreadEntry(project: ManagedProject, changeId: string, input: Omit<TopicThreadEntry, "id" | "timestamp" | "changeId">): Promise<TopicThreadEntry> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Topic thread update");
  const store = await WorkbenchStore.open(memory);
  const conversation = store.findConversationForChange(project.id, changeId);
  if (!conversation) {
    store.close();
    throw new Error(`Change ${changeId} is not bound to a Demand Conversation.`);
  }
  const entry: TopicThreadEntry = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    conversationId: conversation.conversationId,
    changeId,
    graphScopeId: store.findGraphScopeForChange(project.id, changeId) ?? undefined,
    ...input,
  };
  try {
    store.appendMessage({
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
      artifact: entry.artifact ?? null,
      error: entry.error ?? null,
      rawJson: JSON.stringify(entry),
    });
  } finally {
    store.close();
  }
  return entry;
}

export async function deleteConversation(memory: ResolvedMemory, conversationId: string): Promise<void> {
  const store = await requireConversationStore(memory);
  try {
    const conversation = store.readConversation(memory.projectId!, conversationId, { includeDeleted: true });
    if (!conversation) throw conversationNotFound(conversationId);
    store.deleteConversation(memory.projectId!, conversationId, new Date().toISOString());
  } finally {
    store.close();
  }
}

export async function hideConversation(memory: ResolvedMemory, conversationId: string): Promise<void> {
  const store = await requireConversationStore(memory);
  try {
    const conversation = store.readConversation(memory.projectId!, conversationId);
    if (!conversation) throw conversationNotFound(conversationId);
    if (conversation.state !== "archive") {
      const error = new Error("Only archived or completed conversations can be removed from the sidebar.");
      error.name = "Conflict";
      throw error;
    }
    store.hideConversation(memory.projectId!, conversationId, new Date().toISOString());
  } finally {
    store.close();
  }
}

async function requireConversationStore(memory: ResolvedMemory): Promise<WorkbenchStore> {
  if (!memory.projectId) {
    const error = new Error("Project id is required to update a conversation.");
    error.name = "Conflict";
    throw error;
  }
  return WorkbenchStore.open(memory);
}

function conversationNotFound(conversationId: string): Error {
  const error = new Error(`Conversation not found: ${conversationId}.`);
  error.name = "NotFound";
  return error;
}
