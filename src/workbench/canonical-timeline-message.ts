import type { StoredTopicMessageWrite } from "./persistence/contracts.js";
import type { TopicThreadEntry } from "./types.js";

export function toCanonicalTimelineMessage(
  projectId: string,
  conversationId: string,
  entry: TopicThreadEntry,
  completedTurnSequence = entry.completedTurnSequence,
): StoredTopicMessageWrite {
  const safeEntry = entry.attachments
    ? { ...entry, attachments: entry.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mediaType: attachment.mediaType,
      kind: attachment.kind,
      size: attachment.size,
      hash: attachment.hash,
      source: attachment.source,
      createdAt: attachment.createdAt,
      runtimeMode: attachment.runtimeMode,
    })) }
    : entry;
  return {
    id: entry.id,
    projectId,
    conversationId,
    changeId: entry.changeId,
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
    initialThreadInput: entry.initialThreadInput === true,
    artifact: entry.artifact ?? null,
    error: entry.error ?? null,
    rawJson: JSON.stringify({ ...safeEntry, ...(completedTurnSequence === undefined ? {} : { completedTurnSequence }) }),
  };
}

function canonicalAgentSurfaceId(entry: TopicThreadEntry): string {
  if (entry.agentSurfaceId?.trim()) return entry.agentSurfaceId;
  if (entry.agentRoleId && entry.agentRoleId !== "main-agent") {
    throw new Error(`Canonical child Timeline entry ${entry.id} requires agentSurfaceId.`);
  }
  return "main-agent";
}
