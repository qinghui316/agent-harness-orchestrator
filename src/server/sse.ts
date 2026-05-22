import type { ServerResponse } from "node:http";

export interface SseResponse {
  send(event: string, data: unknown, id?: string | number | null): boolean;
  writeKeepAlive(): boolean;
  cleanup(): void;
  end(): void;
  readonly closed: boolean;
}

export function createSseResponse(response: ServerResponse, options: { keepAliveIntervalMs?: number } = {}): SseResponse {
  const keepAliveIntervalMs = options.keepAliveIntervalMs ?? 15_000;
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;
  let heartbeat: NodeJS.Timeout | null = null;
  const canWrite = (): boolean => !closed && !response.destroyed && !response.writableEnded;

  const cleanup = (): void => {
    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  response.on("close", cleanup);
  response.on("finish", cleanup);

  const sse: SseResponse = {
    send(event: string, data: unknown, id?: string | number | null): boolean {
      if (!canWrite()) return false;
      const idLine = id !== undefined && id !== null ? `id: ${id}\n` : "";
      return response.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    writeKeepAlive(): boolean {
      if (!canWrite()) return false;
      return response.write(": keepalive\n\n");
    },
    cleanup,
    end(): void {
      cleanup();
      if (!response.destroyed && !response.writableEnded) response.end();
    },
    get closed(): boolean {
      return closed;
    },
  };

  if (keepAliveIntervalMs > 0) {
    heartbeat = setInterval(() => {
      sse.writeKeepAlive();
    }, keepAliveIntervalMs);
    heartbeat.unref?.();
  }

  return sse;
}
