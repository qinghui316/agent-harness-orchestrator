import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { UtilityProcess } from "electron";
import { DesktopUpdateHostBridge } from "../../src/desktop/update-host-bridge.js";
import type { DesktopHostMessage } from "../../src/desktop/protocol.js";

const identity = { updateId: "u1", generation: "g1", targetVersion: "0.1.3", artifactSha512: Buffer.alloc(64).toString("base64") };
function fixture() {
  const events = new EventEmitter();
  let sent: Extract<DesktopHostMessage, { type: "update-request" }>;
  Object.assign(events, { postMessage: (message: typeof sent) => { sent = message; } });
  let child: UtilityProcess | null = events as unknown as UtilityProcess;
  const authorize = vi.fn();
  const bridge = new DesktopUpdateHostBridge(() => ({ child, generation: "g1" }), authorize);
  return {
    bridge, authorize, events,
    respond: (result: "prepared" | "stopped" | "failed") => events.emit("message", {
      type: "update-result", requestId: sent!.requestId, identity, generation: "g1", result,
    }),
    exit: (code: number) => { child = null; events.emit("exit", code); },
  };
}

describe("desktop update process evidence", () => {
  it("requires both exact stopped receipt and normal Utility exit", async () => {
    const { bridge, respond, exit, authorize } = fixture();
    const prepared = bridge.prepare(identity);
    respond("prepared");
    await prepared;
    let done = false;
    const stopping = bridge.stop(identity).then(() => { done = true; });
    respond("stopped");
    await Promise.resolve();
    expect(done).toBe(false);
    expect(() => bridge.authorizeInstallerExit(identity)).toThrow();
    exit(0);
    await stopping;
    bridge.authorizeInstallerExit(identity);
    expect(authorize).toHaveBeenCalledTimes(1);
  });
  it("does not use unexpected process exit as successful shutdown", async () => {
    const { bridge, exit, authorize } = fixture();
    const stopping = bridge.stop(identity);
    const rejected = expect(stopping).rejects.toThrow();
    exit(0);
    await rejected;
    expect(authorize).not.toHaveBeenCalled();
  });
});
