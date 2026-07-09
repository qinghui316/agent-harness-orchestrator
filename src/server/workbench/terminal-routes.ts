import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveProjectInputWithDirect } from "./direct-project.js";
import { readJsonBody, sendJson } from "./http.js";
import type { WorkbenchServerContext } from "./types.js";

interface TerminalOpenRequest {
  terminalId?: string;
  cols?: number;
  rows?: number;
}

interface TerminalWriteRequest {
  data?: string;
}

interface TerminalResizeRequest {
  cols?: number;
  rows?: number;
}

export async function handleTerminalApi(context: WorkbenchServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const openMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/terminal\/sessions$/);
  if (request.method === "POST" && openMatch?.[1]) {
    const input = await resolveProjectInputWithDirect(context.store, context.input, decodeURIComponent(openMatch[1]));
    if (!input.path) {
      sendJson(response, 400, { error: "Terminal requires a selected project path." });
      return true;
    }
    const body = await readJsonBody<TerminalOpenRequest>(request);
    try {
      const session = await context.terminalRuntime.open({
        projectId: decodeURIComponent(openMatch[1]),
        cwd: input.path,
        terminalId: body.terminalId,
        cols: body.cols,
        rows: body.rows,
      });
      sendJson(response, 200, { session });
    } catch (error) {
      sendJson(response, statusForTerminalError(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const writeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/terminal\/sessions\/([^/]+)\/write$/);
  if (request.method === "POST" && writeMatch?.[1] && writeMatch?.[2]) {
    const body = await readJsonBody<TerminalWriteRequest>(request);
    if (typeof body.data !== "string") {
      sendJson(response, 400, { error: "Terminal write data is required." });
      return true;
    }
    try {
      context.terminalRuntime.write(decodeURIComponent(writeMatch[1]), decodeURIComponent(writeMatch[2]), body.data);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, statusForTerminalError(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const resizeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/terminal\/sessions\/([^/]+)\/resize$/);
  if (request.method === "POST" && resizeMatch?.[1] && resizeMatch?.[2]) {
    const body = await readJsonBody<TerminalResizeRequest>(request);
    if (typeof body.cols !== "number" || typeof body.rows !== "number") {
      sendJson(response, 400, { error: "Terminal resize requires cols and rows." });
      return true;
    }
    try {
      context.terminalRuntime.resize(decodeURIComponent(resizeMatch[1]), decodeURIComponent(resizeMatch[2]), body.cols, body.rows);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, statusForTerminalError(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const closeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/terminal\/sessions\/([^/]+)$/);
  if (request.method === "DELETE" && closeMatch?.[1] && closeMatch?.[2]) {
    try {
      context.terminalRuntime.close(decodeURIComponent(closeMatch[1]), decodeURIComponent(closeMatch[2]));
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, statusForTerminalError(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const eventsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/terminal\/sessions\/([^/]+)\/events$/);
  if (request.method === "GET" && eventsMatch?.[1] && eventsMatch?.[2]) {
    const projectId = decodeURIComponent(eventsMatch[1]);
    const terminalId = decodeURIComponent(eventsMatch[2]);
    if (!context.terminalRuntime.hasSession(projectId, terminalId)) {
      sendJson(response, 404, { error: "Terminal session not found." });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    response.write("retry: 1000\n\n");
    const unsubscribe = context.terminalRuntime.subscribe(projectId, terminalId, (event) => {
      response.write(`event: ${event.type === "error" ? "terminal-error" : event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    request.on("close", unsubscribe);
    return true;
  }

  return false;
}

function statusForTerminalError(error: unknown): number {
  if (error instanceof Error && error.name === "ServiceUnavailable") return 503;
  if (error instanceof Error && error.name === "NotFound") return 404;
  if (error instanceof Error && error.name === "BadRequest") return 400;
  return 500;
}
