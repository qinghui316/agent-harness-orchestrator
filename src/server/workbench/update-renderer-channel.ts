import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkbenchUpdateIdentity } from "../../types/workbench-update.js";
import { assertLocalWorkbenchRequest, sendJson } from "./http.js";

/** Authenticated transport only. Preparation can be started only through the host port. */
export class WorkbenchUpdateRendererChannel {
  private connection: { id: string; response: ServerResponse } | null = null;
  private pending: {
    id: string; connectionId: string; resolve: () => void; reject: (cause: Error) => void;
  } | null = null;

  async handle(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith("/api/desktop/update/")) return false;
    assertLocalWorkbenchRequest(request);
    if (request.method === "GET" && url.pathname === "/api/desktop/update/events") {
      if (this.connection) { sendJson(response, 409, { error: "更新状态连接已存在。" }); return true; }
      const connection = { id: randomUUID(), response };
      this.connection = connection;
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      response.write(`event: connected\ndata: ${JSON.stringify({ connectionId: connection.id })}\n\n`);
      const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 10_000);
      heartbeat.unref();
      response.once("close", () => {
        clearInterval(heartbeat);
        if (this.connection === connection) this.connection = null;
        if (this.pending?.connectionId === connection.id) this.pending.reject(new Error("Update renderer disconnected."));
      });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/desktop/update/ack") {
      if (request.headers.origin !== `http://${request.headers.host}`) {
        sendJson(response, 403, { error: "更新确认来源无效。" }); return true;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > 4096) { sendJson(response, 413, { error: "更新确认内容过大。" }); return true; }
        chunks.push(buffer);
      }
      let value: unknown;
      try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { sendJson(response, 400, { error: "更新确认内容无效。" }); return true; }
      const ack = value as { requestId?: unknown; connectionId?: unknown; ok?: unknown } | null;
      const pending = this.pending;
      if (!ack || !pending || ack.requestId !== pending.id || ack.connectionId !== pending.connectionId
        || this.connection?.id !== pending.connectionId || typeof ack.ok !== "boolean") {
        sendJson(response, 409, { error: "更新准备状态已变化。" }); return true;
      }
      sendJson(response, 200, { accepted: true });
      if (ack.ok) pending.resolve(); else pending.reject(new Error("Renderer could not save a stable draft."));
      return true;
    }
    sendJson(response, 404, { error: "更新操作不存在。" });
    return true;
  }

  async request(action: "prepare" | "confirm" | "cancel", identity: WorkbenchUpdateIdentity, signal?: AbortSignal): Promise<void> {
    if (!this.connection || this.pending || signal?.aborted) throw new Error("Update renderer is not available.");
    const connection = this.connection;
    await new Promise<void>((resolve, reject) => {
      const id = randomUUID();
      const finish = (cause?: Error): void => {
        if (this.pending?.id !== id) return;
        this.pending = null;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (cause) reject(cause); else resolve();
      };
      const abort = (): void => finish(new Error("Update renderer request was canceled."));
      const timer = setTimeout(() => finish(new Error("Update renderer acknowledgement timed out.")), 30_000);
      this.pending = { id, connectionId: connection.id, resolve: () => finish(), reject: finish };
      signal?.addEventListener("abort", abort, { once: true });
      connection.response.write(`event: update\ndata: ${JSON.stringify({ requestId: id, connectionId: connection.id, action, identity })}\n\n`);
      if (signal?.aborted) abort();
    });
  }
}
