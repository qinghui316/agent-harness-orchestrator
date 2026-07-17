import { assertWritableMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { resolveTopic } from "./topic-resolver.js";
import { openWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { CanonicalTimelineEnvelope } from "./canonical-timeline-contract.js";
import { CanonicalTimelineDelivery } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import type { TopicThreadEntry, WorkbenchLiveSink } from "./types.js";

export interface CanonicalTimelineWriter {
  upsert(entry: TopicThreadEntry): CanonicalTimelineEnvelope;
  close(): void;
}

export async function openCanonicalTimelineWriter(
  project: ManagedProject,
  changeId: string,
  live?: WorkbenchLiveSink,
): Promise<CanonicalTimelineWriter> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Topic thread update");
  const database = await openWorkbenchDatabase(memory);
  const conversation = database.conversations.findConversationForChange(project.id, changeId);
  if (!conversation) {
    database.close();
    throw new Error(`Change ${changeId} is not bound to a Demand Conversation.`);
  }
  const graphScopeId = database.conversations.findGraphScopeForChange(project.id, changeId) ?? undefined;
  const delivery = new CanonicalTimelineDelivery(database, live);
  return {
    upsert(entry) {
      const canonical: TopicThreadEntry = {
        ...entry,
        conversationId: conversation.conversationId,
        changeId,
        graphScopeId: entry.graphScopeId ?? graphScopeId,
      };
      return delivery.upsert(toCanonicalTimelineMessage(project.id, conversation.conversationId, canonical));
    },
    close: () => database.close(),
  };
}

export async function appendCanonicalTimelineEntry(
  project: ManagedProject,
  changeId: string,
  input: Omit<TopicThreadEntry, "id" | "timestamp" | "changeId">,
  live?: WorkbenchLiveSink,
): Promise<CanonicalTimelineEnvelope> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Topic thread update");
  const database = await openWorkbenchDatabase(memory);
  const conversation = database.conversations.findConversationForChange(project.id, changeId);
  if (!conversation) {
    database.close();
    throw new Error(`Change ${changeId} is not bound to a Demand Conversation.`);
  }
  const entry: TopicThreadEntry = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    conversationId: conversation.conversationId,
    changeId,
    graphScopeId: database.conversations.findGraphScopeForChange(project.id, changeId) ?? undefined,
    ...input,
  };
  try {
    return new CanonicalTimelineDelivery(database, live).append(toCanonicalTimelineMessage(project.id, conversation.conversationId, entry));
  } finally {
    database.close();
  }
}
