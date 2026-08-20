import type { IncomingMessage, ServerResponse } from "node:http";
import { createSseResponse } from "../sse.js";
import type { ConversationTurnRetryOwner } from "../../workbench/conversation-turn-retry.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/projections/read-model/implementation.js";
import { createLiveSink } from "./live.js";
import { readJsonBody, requireProductMode } from "./http.js";
import type { ConversationTurnRetryBody } from "./types.js";

export async function sendConversationRetryLive(
  input: WorkbenchProjectInput & { project: NonNullable<WorkbenchProjectInput["project"]> },
  conversationId: string,
  request: IncomingMessage,
  response: ServerResponse,
  owner: ConversationTurnRetryOwner,
): Promise<void> {
  const body = await readJsonBody<ConversationTurnRetryBody>(request);
  const productMode = requireProductMode(body.productMode);
  if (productMode !== "agent") {
    const error = new Error("Conversation Retry is available only in Agent mode.");
    error.name = "Conflict";
    throw error;
  }
  const prepared = await owner.prepare(input.project, {
    conversationId,
    productMode,
    providerId: typeof body.providerId === "string" ? body.providerId : "",
    expectedAttemptId: typeof body.expectedAttemptId === "string" ? body.expectedAttemptId : "",
    sourceMessageId: typeof body.sourceMessageId === "string" ? body.sourceMessageId : "",
    clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : "",
  });
  const sse = createSseResponse(response);
  const sink = createLiveSink(sse, input.project.id);
  try {
    await owner.execute(prepared, sink);
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: conversationId, productMode: "agent" }) });
    sink.emit({
      event: "done",
      data: {
        projectId: input.project.id,
        productMode: "agent",
        conversationId,
        status: "completed",
      },
    });
  } catch (cause) {
    sink.emit({
      event: "error",
      data: {
        projectId: input.project.id,
        productMode: "agent",
        conversationId,
        message: cause instanceof Error ? cause.message : String(cause),
      },
    });
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: conversationId, productMode: "agent" }).catch(() => null) });
    sink.emit({ event: "done", data: { projectId: input.project.id, productMode: "agent", conversationId, status: "failed" } });
  } finally {
    sse.end();
  }
}
