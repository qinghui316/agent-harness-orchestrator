import { canonicalTranscriptCellsFromThreadItem } from "./parent-agent-transcript.js";
import { fromStoredThreadMessage } from "./conversation-thread-log.js";
import type { StoredTopicMessage } from "./persistence/contracts.js";
import type { CanonicalTimelineEnvelope } from "./canonical-timeline-contract.js";

export function projectCanonicalTimelineEnvelope(row: StoredTopicMessage): CanonicalTimelineEnvelope {
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
