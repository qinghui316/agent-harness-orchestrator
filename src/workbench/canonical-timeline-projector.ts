import { canonicalTranscriptCellsFromThreadItem } from "./parent-agent-transcript.js";
import { fromStoredThreadMessage } from "./conversation-thread-log.js";
import type { StoredTopicMessage } from "./persistence/contracts.js";
import type { CanonicalTimelineEnvelope } from "./canonical-timeline-contract.js";
import type { ProductMode } from "../provider-runtime/index.js";

export function projectCanonicalTimelineEnvelope(row: StoredTopicMessage, productMode: ProductMode): CanonicalTimelineEnvelope {
  const entry = fromStoredThreadMessage(row);
  const child = row.agentSurfaceId !== "main-agent";
  const forkedAssistantText = row.text?.trim() ?? "";
  const forkedAssistantHistory = row.type === "assistant.message" && isForkedHistory(row.rawJson) && forkedAssistantText
    ? [{
        id: `cell:forked-assistant:${row.id}`,
        kind: "assistant-message" as const,
        source: "provider-runtime" as const,
        timestamp: row.timestamp,
        text: forkedAssistantText,
        status: row.status ?? undefined,
        activityKind: "status" as const,
      }]
    : null;
  return {
    projectId: row.projectId,
    productMode,
    conversationId: row.conversationId,
    agentSurfaceId: row.agentSurfaceId,
    messageId: row.id,
    position: row.position,
    revision: row.revision,
    orderClass: row.initialThreadInput ? "thread-start" : "sequence",
    graphScopeId: entry.graphScopeId,
    cells: row.status === "retry-requested" ? [] : forkedAssistantHistory ?? canonicalTranscriptCellsFromThreadItem({
      ...entry,
      kind: entry.type === "user.message" ? "user-message" : "assistant-turn",
      label: entry.text ?? entry.type,
      body: entry.text,
      retryTarget: entry.retryTarget,
      forkTarget: entry.forkTarget,
    }, child ? { forceAgentRoleId: entry.agentRoleId } : { parentVisible: true }),
  };
}

function isForkedHistory(rawJson: string): boolean {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && (parsed as Record<string, unknown>).forkedHistory === true);
  } catch {
    return false;
  }
}
