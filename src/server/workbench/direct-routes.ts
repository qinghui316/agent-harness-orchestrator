import type { IncomingMessage, ServerResponse } from "node:http";
import { getWorkbenchProjection } from "./projections.js";
import { assertDirectProjectInput, assertRegisteredProject, readJsonBody, requireProductMode, sendJson } from "./http.js";
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
} from "../../workbench/projections/read-model/implementation.js";
import type { IntakeRequest, WorkbenchActionRequest, WorkbenchServerContext } from "./types.js";

export async function handleDirectWorkbenchApi(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const input = context.input?.project
    ? {
      ...context.input,
      runtimeStateResolver: (project: NonNullable<typeof context.input.project>) => context.projectRuntimeCoordinator.resolve(project),
    }
    : context.input;
  if (request.method === "GET" && url.pathname === "/api/workbench/snapshot") {
    assertDirectProjectInput(input);
    const productMode = requireProductMode(url.searchParams.get("productMode"));
    sendJson(response, 200, await getWorkbenchSnapshot(input, { topicId: url.searchParams.get("topic") ?? undefined, productMode }));
    return true;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/workbench/projections/")) {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchProjection(input, url.pathname.slice("/api/workbench/projections/".length), url.searchParams));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/workbench/topics") {
    assertDirectProjectInput(input);
    sendJson(response, 200, await listWorkbenchTopics(input, requireProductMode(url.searchParams.get("productMode"))));
    return true;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/workbench/topics/")) {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchTopic(
      input,
      decodeURIComponent(url.pathname.slice("/api/workbench/topics/".length)),
      requireProductMode(url.searchParams.get("productMode")),
    ));
    return true;
  }
  const directTopicMessagesLiveMatch = url.pathname.match(/^\/api\/workbench\/topics\/([^/]+)\/messages\/live$/);
  if (request.method === "POST" && directTopicMessagesLiveMatch?.[1]) {
    assertDirectProjectInput(input);
    assertRegisteredProject(input);
    await sendConversationMessageLive(input, decodeURIComponent(directTopicMessagesLiveMatch[1]), request, response, context.turnRouter);
    return true;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/workbench/stream/")) {
    assertDirectProjectInput(input);
    sendJson(response, 200, await getWorkbenchStream(input, decodeURIComponent(url.pathname.slice("/api/workbench/stream/".length))));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/workbench/approvals") {
    assertDirectProjectInput(input);
    sendJson(response, 200, await listWorkbenchApprovals(input, {
      topicId: url.searchParams.get("topic") ?? undefined,
      productMode: requireProductMode(url.searchParams.get("productMode")),
    }));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/workbench/actions") {
    assertDirectProjectInput(input);
    const result = await executeWorkbenchAction(input, await readJsonBody<WorkbenchActionRequest>(request), undefined, context.turnRouter);
    sendJson(response, 200, result);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/workbench/actions/live") {
    assertDirectProjectInput(input);
    assertRegisteredProject(input);
    await sendWorkbenchActionLive(input, request, response, context.turnRouter);
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
