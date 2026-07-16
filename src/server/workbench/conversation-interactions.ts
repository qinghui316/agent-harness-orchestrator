import type { IncomingMessage, ServerResponse } from "node:http";
import { createSseResponse } from "../sse.js";
import { settleConversationInteraction } from "../../workbench/conversation-interaction-service.js";
import { getWorkbenchSnapshot, type WorkbenchProjectInput } from "../../workbench/manager.js";
import type { ManagedProject } from "../../types/index.js";
import type { ConversationInteractionSettlement } from "../../workbench/conversation-interaction-contract.js";
import { createLiveSink } from "./live.js";
import { readJsonBody } from "./http.js";

export async function sendConversationInteractionSettlement(
  input: WorkbenchProjectInput & { project: ManagedProject },
  conversationId: string,
  interactionId: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const settlement = await readJsonBody<ConversationInteractionSettlement>(request);
  const sse = createSseResponse(response);
  const sink = createLiveSink(sse);
  try {
    await settleConversationInteraction(input.project, conversationId, interactionId, settlement, sink);
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: conversationId }) });
    sink.emit({ event: "done", data: { status: "completed" } });
  } catch (cause) {
    sink.emit({ event: "error", data: { message: cause instanceof Error ? cause.message : String(cause) } });
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: conversationId }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })) });
    sink.emit({ event: "done", data: { status: "failed" } });
  } finally {
    sse.end();
  }
}
