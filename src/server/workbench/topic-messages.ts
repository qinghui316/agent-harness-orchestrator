import type { IncomingMessage, ServerResponse } from "node:http";
import { createSseResponse } from "../sse.js";
import { createWorkbenchConversation, postConversationMessage } from "../../workbench/conversation-service.js";
import { resolveConversationId } from "../../workbench/conversation-identity.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/projections/read-model/implementation.js";
import type { ManagedProject } from "../../types/index.js";
import { createLiveSink } from "./live.js";
import { readJsonBody } from "./http.js";
import type {
  CreateTopicRequest,
  TopicMessageRequest,
} from "./types.js";

export async function readCreateTopicBody(request: IncomingMessage): Promise<{ body?: string; contextRefs?: CreateTopicRequest["contextRefs"]; attachmentIds?: string[]; providerId?: string }> {
  const body = await readJsonBody<CreateTopicRequest>(request);
  if (body.confirm !== true) {
    const error = new Error("Creating a demand conversation requires confirm: true.");
    error.name = "Conflict";
    throw error;
  }
  const hasText = typeof body.body === "string" && body.body.trim() !== "";
  const hasAttachments = Array.isArray(body.attachmentIds) && body.attachmentIds.length > 0;
  if (!hasText && !hasAttachments) {
    const error = new Error("Demand conversation text or attachment is required.");
    error.name = "BadRequest";
    throw error;
  }
  return { body: body.body, contextRefs: body.contextRefs, attachmentIds: body.attachmentIds, providerId: body.providerId };
}

export async function readTopicMessageBody(request: IncomingMessage): Promise<TopicMessageRequest> {
  const raw = await readJsonBody<TopicMessageRequest>(request);
  const message: TopicMessageRequest = {
    text: raw.text,
    message: raw.message,
    mode: raw.mode,
    contextRefs: raw.contextRefs,
    attachmentIds: raw.attachmentIds,
    providerId: raw.providerId,
    providerSwitchIntent: raw.providerSwitchIntent,
    agentSurfaceId: raw.agentSurfaceId,
  };
  assertTopicMessageText(message);
  return message;
}

export async function sendCreateTopicLive(
  input: WorkbenchProjectInput & { project: ManagedProject },
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readCreateTopicBody(request);
  const sse = createSseResponse(response);
  const sink = createLiveSink(sse, input.project.id);
  let conversationId: string | undefined;
  try {
    const topic = await createWorkbenchConversation(input.project, body, sink);
    conversationId = topic.conversationId;
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: topic.conversationId }) });
    sink.emit({ event: "done", data: { status: "completed" } });
  } catch (cause) {
    sink.emit({ event: "error", data: { message: cause instanceof Error ? cause.message : String(cause) } });
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: conversationId }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })) });
    sink.emit({ event: "done", data: { status: "failed" } });
  } finally {
    sse.end();
  }
}

export async function sendConversationMessageLive(input: WorkbenchProjectInput & { project: ManagedProject }, conversationId: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const message = await readTopicMessageBody(request);
  const sse = createSseResponse(response);
  const sink = createLiveSink(sse, input.project.id);
  let resolvedConversationId = conversationId;
  try {
    resolvedConversationId = await resolveConversationId(input.project, conversationId);
    await postConversationMessage(input.project, resolvedConversationId, message, sink);
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: resolvedConversationId }) });
    sink.emit({ event: "done", data: { status: "completed" } });
  } catch (cause) {
    sink.emit({ event: "error", data: { message: cause instanceof Error ? cause.message : String(cause) } });
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: resolvedConversationId }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })) });
    sink.emit({ event: "done", data: { status: "failed" } });
  } finally {
    sse.end();
  }
}

function assertTopicMessageText(message: TopicMessageRequest): void {
  const hasText = typeof (message.message ?? message.text) === "string" && (message.message ?? message.text ?? "").trim() !== "";
  const hasAttachments = Array.isArray(message.attachmentIds) && message.attachmentIds.length > 0;
  if (!hasText && !hasAttachments) {
    const error = new Error("Message text is required.");
    error.name = "BadRequest";
    throw error;
  }
}
