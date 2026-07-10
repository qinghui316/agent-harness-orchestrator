import type { IncomingMessage, ServerResponse } from "node:http";
import { getWorkbenchProjection } from "./projections.js";
import { assertDirectProjectInput, assertRegisteredProject, readJsonBody, sendJson } from "./http.js";
import { handleIntakeReanalyze, handleIntakeScan } from "./intake.js";
import { sendWorkbenchActionLive } from "./live-actions.js";
import { sendConversationMessageLive } from "./topic-messages.js";
import { executeWorkbenchAction } from "./actions.js";
import {
  getWorkbenchSnapshot,
  getWorkbenchStream,
  getWorkbenchTopic,
  listWorkbenchApprovals,
  listWorkbenchTopics,
  type WorkbenchProjectInput,
} from "../../workbench/manager.js";
import type { IntakeRequest, WorkbenchActionRequest } from "./types.js";

export async function handleDirectWorkbenchApi(input: WorkbenchProjectInput | null, request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  if (request.method === "GET" && url.pathname === "/api/workbench/snapshot") {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchSnapshot(input, { topicId: url.searchParams.get("topic") ?? undefined }));
    return true;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/workbench/projections/")) {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchProjection(input, url.pathname.slice("/api/workbench/projections/".length), url.searchParams));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/workbench/topics") {
    assertDirectProjectInput(input);
    sendJson(response, 200, await listWorkbenchTopics(input));
    return true;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/workbench/topics/")) {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchTopic(input, decodeURIComponent(url.pathname.slice("/api/workbench/topics/".length))));
    return true;
  }
  const directTopicMessagesLiveMatch = url.pathname.match(/^\/api\/workbench\/topics\/([^/]+)\/messages\/live$/);
  if (request.method === "POST" && directTopicMessagesLiveMatch?.[1]) {
    assertDirectProjectInput(input);
    assertRegisteredProject(input);
    await sendConversationMessageLive(input, decodeURIComponent(directTopicMessagesLiveMatch[1]), request, response);
    return true;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/workbench/stream/")) {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchStream(input, decodeURIComponent(url.pathname.slice("/api/workbench/stream/".length))));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/workbench/approvals") {
    assertDirectProjectInput(input);
    sendJson(response, 200, await listWorkbenchApprovals(input, { topicId: url.searchParams.get("topic") ?? undefined }));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/workbench/actions") {
    assertDirectProjectInput(input);
    const result = await executeWorkbenchAction(input, await readJsonBody<WorkbenchActionRequest>(request));
    sendJson(response, 200, result);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/workbench/actions/live") {
    assertDirectProjectInput(input);
    assertRegisteredProject(input);
    await sendWorkbenchActionLive(input, request, response);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/workbench/intake/scan") {
    assertDirectProjectInput(input);
    assertRegisteredProject(input);
    sendJson(response, 200, await handleIntakeScan(input, await readJsonBody<IntakeRequest>(request)));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/workbench/intake/reanalyze") {
    assertDirectProjectInput(input);
    assertRegisteredProject(input);
    sendJson(response, 200, await handleIntakeReanalyze(input, await readJsonBody<IntakeRequest>(request)));
    return true;
  }
  return false;
}
