import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { ProviderRegistry } from "../../src/provider-runtime/registry.js";
import { startWorkbenchServer, type WorkbenchServerHandle } from "../../src/server/workbench-server.js";

let root: string | undefined;
let server: WorkbenchServerHandle | undefined;
let streamAbort: AbortController | undefined;
const identity = { updateId: "test-update", generation: "test-generation", targetVersion: "0.1.3", artifactSha512: Buffer.alloc(64, 1).toString("base64") };
const cookie = "beaver_code_session=test-token";

afterEach(async () => {
  streamAbort?.abort();
  if (server?.server.listening) await server.close();
  if (root) await rm(root, { recursive: true, force: true, maxRetries: 5 });
  server = undefined;
});

async function start() {
  root = await mkdtemp(join(tmpdir(), "aho-update-http-"));
  server = await startWorkbenchServer(null, {
    port: 0, store: new ProjectRegistryStore(root), providerRegistry: new ProviderRegistry(),
    desktopHost: { sessionToken: "test-token", updateGeneration: identity.generation },
  });
  return server;
}

async function connect(handle: WorkbenchServerHandle, ok = true) {
  streamAbort = new AbortController();
  const response = await fetch(handle.url + "/api/desktop/update/events", {
    headers: { Cookie: cookie }, signal: streamAbort.signal,
  });
  expect(response.status).toBe(200);
  let connected!: () => void;
  const ready = new Promise<void>((resolve) => { connected = resolve; });
  const actions: string[] = [];
  const reader = response.body!.getReader();
  void (async () => {
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += new TextDecoder().decode(chunk.value);
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split("\n").find((line) => line.startsWith("data: "));
        if (!data) continue;
        const value = JSON.parse(data.slice(6));
        if (block.startsWith("event: connected")) connected();
        else if (block.startsWith("event: update")) {
          actions.push(value.action);
          await fetch(handle.url + "/api/desktop/update/ack", {
            method: "POST", headers: { Cookie: cookie, Origin: handle.url, "content-type": "application/json" },
            body: JSON.stringify({ requestId: value.requestId, connectionId: value.connectionId, ok: value.action === "cancel" || ok }),
          });
        }
      }
    }
  })().catch(() => undefined);
  await ready;
  return actions;
}

describe("real update HTTP/SSE composition", () => {
  it("requires authentication and hides update installation actions from HTTP", async () => {
    const handle = await start();
    expect((await fetch(handle.url + "/api/desktop/update/events")).status).toBe(403);
    expect((await fetch(handle.url + "/api/desktop/update/install", { headers: { Cookie: cookie } })).status).toBe(404);
    const status = await fetch(handle.url + "/api/app/status", { headers: { Cookie: cookie } });
    expect(await status.json()).toMatchObject({ desktopUpdates: true });
  });

  it("prepares over SSE, fences mutations, and cancels without stopping the server", async () => {
    const handle = await start();
    const actions = await connect(handle);
    expect(await handle.updates!.prepare(identity)).toMatchObject({ status: "prepared" });
    expect((await fetch(handle.url + "/api/dialog/open-folder", {
      method: "POST", headers: { Cookie: cookie, Origin: handle.url },
    })).status).toBe(409);
    await handle.updates!.cancel(identity);
    expect(actions).toEqual(["prepare", "cancel"]);
    expect(handle.server.listening).toBe(true);
    expect(handle.updates!.snapshot().phase).toBe("canceled");
  });

  it("failed renderer saves cancel installation preparation", async () => {
    const handle = await start();
    await connect(handle, false);
    await expect(handle.updates!.prepare(identity)).rejects.toThrow();
    expect(handle.updates!.snapshot().phase).toBe("canceled");
    await expect(handle.updates!.stop(identity)).rejects.toThrow();
    expect(handle.server.listening).toBe(true);
  });

  it("requires a second current renderer confirmation before actual shutdown", async () => {
    const handle = await start();
    const actions = await connect(handle);
    await handle.updates!.prepare(identity);
    expect(await handle.updates!.stop(identity)).toMatchObject({ status: "stopped" });
    expect(actions).toEqual(["prepare", "confirm"]);
    expect(handle.server.listening).toBe(false);
  });
});
