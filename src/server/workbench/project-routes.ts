import type { IncomingMessage, ServerResponse } from "node:http";
import { createWorkbenchTopic, listTopicMessages, postTopicMessage } from "../../workbench/chat.js";
import {
  getWorkbenchSnapshot,
  getWorkbenchStream,
  getWorkbenchTopic,
  hideWorkbenchTopic,
  listWorkbenchApprovals,
  listWorkbenchTopics,
  type WorkbenchProjectInput,
} from "../../workbench/manager.js";
import { runIntakeScan } from "../../workbench/intake.js";
import { getWorkbenchProjection } from "./projections.js";
import { readWorkbenchActionEvents, sendActionEventReplay } from "./live.js";
import { assertConfirmed, assertRegisteredProject, readJsonBody, sendJson } from "./http.js";
import { handleClarificationAnswer, handleClarificationSkip, handleIntakeReanalyze, handleIntakeScan } from "./intake.js";
import { sendWorkbenchActionLive } from "./live-actions.js";
import { readCreateTopicBody, readTopicMessageBody, sendCreateTopicLive, sendTopicMessageLive, sendTopicMessageReplay } from "./topic-messages.js";
import { executeWorkbenchAction } from "./actions.js";
import type { ClarificationAnswerRequest, IntakeRequest, WorkbenchActionRequest, WorkbenchServerContext } from "./types.js";

export async function handleProjectWorkbenchApi(context: WorkbenchServerContext, input: WorkbenchProjectInput, request: IncomingMessage, response: ServerResponse, rest: string, url: URL): Promise<void> {
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
    await sendCreateTopicLive(input, request, response, { initialMainAgentTurn: context.initialMainAgentTurn });
    return;
  }
  if (request.method === "POST" && rest === "topics") {
    assertRegisteredProject(input);
    const body = await readCreateTopicBody(request);
    const topic = await createWorkbenchTopic(input.project, body);
    if (topic.state === "active") {
      await runIntakeScan(input.project, topic.changeId, body.body ?? body.title);
      await context.initialMainAgentTurn(input.project, topic.changeId, body.body ?? body.title);
    }
    sendJson(response, 200, { topic, snapshot: await getWorkbenchSnapshot(input, { topicId: topic.changeId }) });
    return;
  }
  const topicHideMatch = rest.match(/^topics\/([^/]+)\/hide$/);
  if (request.method === "POST" && topicHideMatch?.[1]) {
    assertRegisteredProject(input);
    assertConfirmed((await readJsonBody<{ confirm?: boolean }>(request)).confirm);
    sendJson(response, 200, await hideWorkbenchTopic(input, decodeURIComponent(topicHideMatch[1])));
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
  const clarificationAnswerMatch = rest.match(/^clarifications\/([^/]+)\/answer$/);
  if (request.method === "POST" && clarificationAnswerMatch?.[1]) {
    assertRegisteredProject(input);
    sendJson(response, 200, await handleClarificationAnswer(input, decodeURIComponent(clarificationAnswerMatch[1]), await readJsonBody<ClarificationAnswerRequest>(request)));
    return;
  }
  const clarificationSkipMatch = rest.match(/^clarifications\/([^/]+)\/skip$/);
  if (request.method === "POST" && clarificationSkipMatch?.[1]) {
    assertRegisteredProject(input);
    sendJson(response, 200, await handleClarificationSkip(input, decodeURIComponent(clarificationSkipMatch[1]), await readJsonBody<ClarificationAnswerRequest>(request)));
    return;
  }
  const topicMessagesMatch = rest.match(/^topics\/([^/]+)\/messages(?:\/stream)?$/);
  if (topicMessagesMatch?.[1]) {
    assertRegisteredProject(input);
    const changeId = decodeURIComponent(topicMessagesMatch[1]);
    if (rest.endsWith("/stream")) {
      await sendTopicMessageReplay(input.project, changeId, response);
      return;
    }
    if (request.method === "GET") {
      sendJson(response, 200, { messages: await listTopicMessages(input.project, changeId) });
      return;
    }
    if (request.method === "POST") {
      const message = await readTopicMessageBody(request);
      const result = await postTopicMessage(input.project, changeId, message);
      sendJson(response, 200, { result, messages: await listTopicMessages(input.project, changeId), snapshot: await getWorkbenchSnapshot(input, { topicId: changeId }) });
      return;
    }
  }
  const topicMessagesLiveMatch = rest.match(/^topics\/([^/]+)\/messages\/live$/);
  if (request.method === "POST" && topicMessagesLiveMatch?.[1]) {
    assertRegisteredProject(input);
    await sendTopicMessageLive(input, decodeURIComponent(topicMessagesLiveMatch[1]), request, response);
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
