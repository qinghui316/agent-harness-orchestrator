import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkbenchProjectInput } from "../../workbench/projections/read-model/implementation.js";
import { subscribeProjectLiveEvents } from "../../workbench/project-live-events.js";
import { createSseResponse } from "../sse.js";

export async function sendProjectLiveEvents(input: WorkbenchProjectInput, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sse = createSseResponse(response);
  const unsubscribe = subscribeProjectLiveEvents(input.project?.id ?? "", (event) => sse.send("message", event));
  const cleanup = (): void => {
    unsubscribe();
    sse.cleanup();
  };
  request.on("close", cleanup);
  response.on("close", cleanup);
}
