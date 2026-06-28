import type { IncomingMessage, ServerResponse } from "node:http";
import { createSseResponse } from "../sse.js";
import { listTopicMessages, postTopicMessage } from "../../workbench/chat.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import type { ManagedProject } from "../../types/index.js";
import { createLiveSink } from "./live.js";
import { readJsonBody } from "./http.js";
import type { CreateTopicRequest, TopicMessageRequest } from "./types.js";

export async function readCreateTopicBody(request: IncomingMessage): Promise<{ title: string; body?: string; contextRefs?: CreateTopicRequest["contextRefs"]; attachmentIds?: string[] }> {
  const body = await readJsonBody<CreateTopicRequest>(request);
  if (body.confirm !== true) {
    const error = new Error("Creating a demand conversation requires confirm: true.");
    error.name = "Conflict";
    throw error;
  }
  if (typeof body.title !== "string" || body.title.trim() === "") {
    const error = new Error("Demand conversation title is required.");
    error.name = "BadRequest";
    throw error;
  }
  return { title: body.title.trim(), body: body.body, contextRefs: body.contextRefs, attachmentIds: body.attachmentIds };
}

export async function readTopicMessageBody(request: IncomingMessage): Promise<TopicMessageRequest> {
  const message = await readJsonBody<TopicMessageRequest>(request);
  assertTopicMessageText(message);
  return message;
}

export async function sendTopicMessageReplay(project: ManagedProject, changeId: string, response: ServerResponse): Promise<void> {
  response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "close" });
  for (const message of await listTopicMessages(project, changeId)) {
    response.write(`event: message\n`);
    response.write(`data: ${JSON.stringify(message)}\n\n`);
  }
  response.end();
}

export async function sendTopicMessageLive(input: WorkbenchProjectInput & { project: ManagedProject }, changeId: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const message = await readJsonBody<TopicMessageRequest>(request);
  assertTopicMessageText(message);
  const sse = createSseResponse(response);
  const sink = createLiveSink(sse);
  try {
    await postTopicMessage(input.project, changeId, message, sink);
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: changeId }) });
    sink.emit({ event: "done", data: { status: "completed" } });
  } catch (cause) {
    sink.emit({ event: "error", data: { message: cause instanceof Error ? cause.message : String(cause) } });
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: changeId }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })) });
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
