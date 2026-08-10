import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import type { ProviderUserInputRequest } from "../provider-runtime/index.js";
import type { ProjectWorkbenchPathPort } from "../project-runtime/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { CanonicalTimelineEnvelope } from "./canonical-timeline-contract.js";
import { CanonicalTimelineDelivery, type CanonicalTimelinePublisher } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import type { TopicThreadEntry, WorkbenchProviderUserInputRequest } from "./types.js";

export async function persistProviderUserInputRequest(
  runtime: ProjectWorkbenchPathPort,
  request: WorkbenchProviderUserInputRequest,
  publisher?: CanonicalTimelinePublisher,
): Promise<CanonicalTimelineEnvelope> {
  if (!request.conversationId) throw new Error("Provider user input requires a project conversation.");
  const agentSurfaceId = request.agentRoleId && request.agentRoleId !== "main-agent"
    ? request.threadId?.trim()
      ? agentThreadSurfaceId(request.providerId, request.threadId)
      : failMissingChildIdentity()
    : "main-agent";
  const entry: TopicThreadEntry = {
    id: `provider-user-input:${request.requestKey}`,
    type: "assistant.message",
    timestamp: new Date().toISOString(),
    conversationId: request.conversationId,
    graphScopeId: request.graphScopeId,
    changeId: request.changeId ?? "",
    runId: request.runId,
    providerId: request.providerId,
    attemptId: request.attemptId,
    sessionId: request.threadId,
    threadId: request.threadId,
    turnId: request.turnId,
    agentRoleId: request.agentRoleId,
    agentSurfaceId,
    status: request.status,
    providerUserInput: request,
  };
  const database = await openProjectRuntimeWorkbenchDatabase(runtime);
  try {
    return new CanonicalTimelineDelivery(database, "harness", publisher).append(toCanonicalTimelineMessage(runtime.projectId, request.conversationId, entry));
  } finally {
    database.close();
  }
}

export function providerUserInputRequestKey(
  runId: string,
  request: Pick<ProviderUserInputRequest, "requestId" | "threadId" | "turnId" | "itemId">,
): string {
  return [runId, request.threadId ?? "main", request.turnId ?? "turn", request.itemId ?? "item", request.requestId]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

function failMissingChildIdentity(): never {
  throw new Error("Child provider user input requires canonical thread identity.");
}
