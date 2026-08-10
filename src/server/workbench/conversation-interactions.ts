import type { IncomingMessage, ServerResponse } from "node:http";
import { createSseResponse } from "../sse.js";
import { settleConversationInteraction } from "../../workbench/conversation-interaction-service.js";
import { getWorkbenchSnapshot, getWorkbenchTopic, type WorkbenchProjectInput } from "../../workbench/projections/read-model/implementation.js";
import type { ManagedProject } from "../../types/index.js";
import type { ConversationInteractionSettlement } from "../../workbench/conversation-interaction-contract.js";
import { createLiveSink } from "./live.js";
import { readJsonBody, requireProductMode } from "./http.js";

export async function sendConversationInteractionSettlement(
  input: WorkbenchProjectInput & { project: ManagedProject },
  conversationId: string,
  interactionId: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readJsonBody<ConversationInteractionSettlement & { productMode?: import("../../provider-runtime/index.js").ProductMode }>(request);
  const productMode = requireProductMode(body.productMode);
  const settlement: ConversationInteractionSettlement = {
    action: body.action,
    answers: body.answers,
    skippedQuestionIds: body.skippedQuestionIds,
    feedback: body.feedback,
  };
  const sse = createSseResponse(response);
  const sink = createLiveSink(sse, input.project.id);
  try {
    await getWorkbenchTopic(input, conversationId, productMode);
    await settleConversationInteraction(input.project, conversationId, interactionId, settlement, sink);
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: conversationId, productMode }) });
    sink.emit({ event: "done", data: { projectId: input.project.id, productMode, conversationId, status: "completed" } });
  } catch (cause) {
    sink.emit({ event: "error", data: { projectId: input.project.id, productMode, conversationId, message: cause instanceof Error ? cause.message : String(cause) } });
    sink.emit({ event: "snapshot", data: await getWorkbenchSnapshot(input, { topicId: conversationId, productMode }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })) });
    sink.emit({ event: "done", data: { projectId: input.project.id, productMode, conversationId, status: "failed" } });
  } finally {
    sse.end();
  }
}
