import type { ServerResponse } from "node:http";
import { getWorkbenchActionEvents } from "../../workbench/workflow-conversation-bridge.js";
import type { WorkbenchLiveEvent, WorkbenchLiveSink } from "../../workbench/types.js";
import type { ManagedProject } from "../../types/index.js";
import { publishProjectLiveEvent } from "../../workbench/project-live-events.js";
import type { createSseResponse } from "../sse.js";

export async function sendActionEventReplay(project: ManagedProject, actionRunId: string, response: ServerResponse): Promise<void> {
  response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "close" });
  for (const event of await readWorkbenchActionEvents(project, actionRunId)) {
    response.write(`event: action\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  response.end();
}

export async function readWorkbenchActionEvents(project: ManagedProject, actionRunId: string): Promise<unknown[]> {
  return getWorkbenchActionEvents(project, actionRunId);
}

export function createLiveSink(sse: ReturnType<typeof createSseResponse>, projectId?: string): WorkbenchLiveSink {
  let id = 0;
  return {
    emit(event: WorkbenchLiveEvent): void {
      if (projectId && event.event === "timeline.patch") publishProjectLiveEvent(projectId, event);
      if (sse.closed) return;
      sse.send(event.event, event.data, ++id);
    },
    isClosed(): boolean {
      return sse.closed;
    },
  };
}
