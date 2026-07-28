import type { IncomingMessage, ServerResponse } from "node:http";
import { createWorkbenchConversation, updateWorkbenchConversationTitle } from "../../workbench/conversation-service.js";
import {
  getWorkbenchSnapshot,
  getWorkbenchStream,
  getWorkbenchTopic,
  deleteWorkbenchConversation,
  hideWorkbenchTopic,
  listWorkbenchApprovals,
  listWorkbenchTopics,
  type WorkbenchProjectInput,
} from "../../workbench/projections/read-model/implementation.js";
import { getCanonicalTimelinePage } from "../../workbench/canonical-timeline-query.js";
import { getWorkbenchProjection } from "./projections.js";
import { readWorkbenchActionEvents, sendActionEventReplay } from "./live.js";
import { assertConfirmed, assertRegisteredProject, readJsonBody, sendJson } from "./http.js";
import { handleIntakeReanalyze, handleIntakeScan } from "./intake.js";
import { sendConversationInteractionSettlement } from "./conversation-interactions.js";
import { sendWorkbenchActionLive } from "./live-actions.js";
import { readCreateTopicBody, sendConversationMessageLive, sendCreateTopicLive } from "./topic-messages.js";
import { executeWorkbenchAction } from "./actions.js";
import { sendProjectLiveEvents } from "./project-live-events.js";
import type { IntakeRequest, UpdateConversationTitleRequest, WorkbenchActionRequest, WorkbenchServerContext } from "./types.js";

export async function handleProjectWorkbenchApi(context: WorkbenchServerContext, input: WorkbenchProjectInput, request: IncomingMessage, response: ServerResponse, rest: string, url: URL): Promise<void> {
  if (request.method === "GET" && rest === "events/live") {
    assertRegisteredProject(input);
    await sendProjectLiveEvents(input, request, response);
    return;
  }
  if (request.method === "GET" && rest === "snapshot") {
    sendJson(response, 200, await getWorkbenchSnapshot(input, { topicId: url.searchParams.get("topic") ?? undefined }));
    return;
  }
  if (request.method === "GET" && rest.startsWith("projections/")) {
    sendJson(response, 200, await getWorkbenchProjection(input, rest.slice("projections/".length), url.searchParams));
    return;
  }
  if (request.method === "GET" && rest === "topics") {
    sendJson(response, 200, await listWorkbenchTopics(input));
    return;
  }
  if (request.method === "POST" && rest === "topics/live") {
    assertRegisteredProject(input);
    await sendCreateTopicLive(input, request, response);
    return;
  }
  if (request.method === "POST" && rest === "topics") {
    assertRegisteredProject(input);
    const body = await readCreateTopicBody(request);
    const topic = await createWorkbenchConversation(input.project, body, undefined, { runMainAgent: false });
    sendJson(response, 200, {
      topic: { id: topic.conversationId, conversationId: topic.conversationId, title: topic.title, state: topic.state },
      snapshot: await getWorkbenchSnapshot(input, { topicId: topic.conversationId }),
    });
    return;
  }
  const topicHideMatch = rest.match(/^topics\/([^/]+)\/hide$/);
  if (request.method === "POST" && topicHideMatch?.[1]) {
    assertRegisteredProject(input);
    assertConfirmed((await readJsonBody<{ confirm?: boolean }>(request)).confirm);
    sendJson(response, 200, await hideWorkbenchTopic(input, decodeURIComponent(topicHideMatch[1])));
    return;
  }
  const topicDeleteMatch = rest.match(/^topics\/([^/]+)\/delete$/);
  if (request.method === "POST" && topicDeleteMatch?.[1]) {
    assertRegisteredProject(input);
    assertConfirmed((await readJsonBody<{ confirm?: boolean }>(request)).confirm);
    sendJson(response, 200, await deleteWorkbenchConversation(input, decodeURIComponent(topicDeleteMatch[1])));
    return;
  }
  if (request.method === "POST" && rest === "intake/scan") {
    assertRegisteredProject(input);
    sendJson(response, 200, await handleIntakeScan(input, await readJsonBody<IntakeRequest>(request)));
    return;
  }
  if (request.method === "POST" && rest === "intake/reanalyze") {
    assertRegisteredProject(input);
    sendJson(response, 200, await handleIntakeReanalyze(input, await readJsonBody<IntakeRequest>(request)));
    return;
  }
  const timelineMatch = rest.match(/^conversations\/([^/]+)\/timeline$/);
  if (request.method === "GET" && timelineMatch?.[1]) {
    const conversationId = decodeURIComponent(timelineMatch[1]);
    const agentSurfaceId = url.searchParams.get("agentSurfaceId")?.trim();
    if (!agentSurfaceId) {
      const error = new Error("Canonical Timeline requires agentSurfaceId.");
      error.name = "BadRequest";
      throw error;
    }
    const limitRaw = url.searchParams.get("limit");
    sendJson(response, 200, await getCanonicalTimelinePage(input, conversationId, agentSurfaceId, {
      limit: limitRaw === null ? undefined : Number(limitRaw),
      beforeCursor: url.searchParams.get("beforeCursor") ?? undefined,
    }));
    return;
  }
  const topicTitleMatch = rest.match(/^topics\/([^/]+)\/title$/);
  if (request.method === "POST" && topicTitleMatch?.[1]) {
    assertRegisteredProject(input);
    const body = await readJsonBody<UpdateConversationTitleRequest>(request);
    if (typeof body.title !== "string") {
      const error = new Error("Conversation title is required.");
      error.name = "BadRequest";
      throw error;
    }
    const conversation = await updateWorkbenchConversationTitle(input.project, decodeURIComponent(topicTitleMatch[1]), { title: body.title });
    sendJson(response, 200, { conversation });
    return;
  }
  const interactionSettlementMatch = rest.match(/^conversations\/([^/]+)\/interactions\/([^/]+)\/settle$/);
  if (request.method === "POST" && interactionSettlementMatch?.[1] && interactionSettlementMatch[2]) {
    assertRegisteredProject(input);
    await sendConversationInteractionSettlement(
      input,
      decodeURIComponent(interactionSettlementMatch[1]),
      decodeURIComponent(interactionSettlementMatch[2]),
      request,
      response,
    );
    return;
  }
  const topicMessagesLiveMatch = rest.match(/^topics\/([^/]+)\/messages\/live$/);
  if (request.method === "POST" && topicMessagesLiveMatch?.[1]) {
    assertRegisteredProject(input);
    const id = decodeURIComponent(topicMessagesLiveMatch[1]);
    await sendConversationMessageLive(input, id, request, response);
    return;
  }
  if (request.method === "GET" && /^topics\/[^/]+\/messages(?:\/stream)?$/.test(rest)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  if (request.method === "GET" && rest.startsWith("topics/")) {
    sendJson(response, 200, await getWorkbenchTopic(input, decodeURIComponent(rest.slice("topics/".length))));
    return;
  }
  if (request.method === "GET" && rest.startsWith("stream/")) {
    sendJson(response, 200, await getWorkbenchStream(input, decodeURIComponent(rest.slice("stream/".length))));
    return;
  }
  if (request.method === "GET" && rest === "approvals") {
    sendJson(response, 200, await listWorkbenchApprovals(input, { topicId: url.searchParams.get("topic") ?? undefined }));
    return;
  }
  if (request.method === "POST" && rest === "actions") {
    sendJson(response, 200, await executeWorkbenchAction(input, await readJsonBody<WorkbenchActionRequest>(request)));
    return;
  }
  if (request.method === "POST" && rest === "actions/live") {
    assertRegisteredProject(input);
    await sendWorkbenchActionLive(input, request, response);
    return;
  }
  const actionEventsMatch = rest.match(/^actions\/([^/]+)\/events$/);
  if (request.method === "GET" && actionEventsMatch?.[1]) {
    assertRegisteredProject(input);
    await sendActionEventReplay(input.project, decodeURIComponent(actionEventsMatch[1]), response);
    return;
  }
  const actionMatch = rest.match(/^actions\/([^/]+)$/);
  if (request.method === "GET" && actionMatch?.[1]) {
    assertRegisteredProject(input);
    sendJson(response, 200, { events: await readWorkbenchActionEvents(input.project, decodeURIComponent(actionMatch[1])) });
    return;
  }
  sendJson(response, 404, { error: "Not found." });
}
