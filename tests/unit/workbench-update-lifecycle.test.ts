import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchUpdateLifecycle } from "../../src/workbench/update-lifecycle.js";
import { isWorkbenchUpdateIdentity, type WorkbenchUpdateIdentity } from "../../src/types/workbench-update.js";

const identity: WorkbenchUpdateIdentity = {
  updateId: "update-1", generation: "generation-1", targetVersion: "0.1.3",
  artifactSha512: Buffer.alloc(64, 7).toString("base64"),
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
function fixture() {
  const release = vi.fn();
  const ports = {
    pauseNewWork: vi.fn(() => release),
    prepareRenderer: vi.fn(async () => {}),
    drainMutations: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
    cancelRenderer: vi.fn(async () => {}),
  };
  return { ports, release, owner: new WorkbenchUpdateLifecycle(ports, identity.generation, { prepareMs: 30, shutdownMs: 8 }) };
}
afterEach(() => vi.useRealTimers());

describe("Workbench update-only lifecycle admission", () => {
  it("validates bounded exact identities", () => {
    expect(isWorkbenchUpdateIdentity(identity)).toBe(true);
    for (const value of [null, {}, { ...identity, updateId: "../x" }, { ...identity, targetVersion: "0.1.3-beta" }, { ...identity, artifactSha512: "x" }]) {
      expect(isWorkbenchUpdateIdentity(value)).toBe(false);
    }
  });

  it("orders fences, durable preparation, drain and one shutdown", async () => {
    const { owner, ports, release } = fixture();
    const order: string[] = [];
    ports.pauseNewWork.mockImplementation(() => { order.push("pause"); return release; });
    ports.prepareRenderer.mockImplementation(async () => { order.push("drafts"); });
    ports.drainMutations.mockImplementation(async () => { order.push("drain"); });
    ports.shutdown.mockImplementation(async () => { order.push("stop"); });
    const first = owner.prepare(identity);
    expect(owner.prepare(identity)).toBe(first);
    expect((await first).status).toBe("prepared");
    const stop = owner.stop(identity);
    expect(owner.stop(identity)).toBe(stop);
    expect(await stop).toEqual({ identity, status: "stopped" });
    expect(order).toEqual(["pause", "drafts", "drain", "stop"]);
    expect(release).not.toHaveBeenCalled();
    await expect(owner.cancel(identity)).rejects.toThrow();
  });

  it("rejects wrong generation and parallel identity without pausing", async () => {
    const { owner, ports } = fixture();
    await expect(owner.prepare({ ...identity, generation: "old" })).rejects.toThrow();
    expect(ports.pauseNewWork).not.toHaveBeenCalled();
    await owner.prepare(identity);
    await expect(owner.prepare({ ...identity, updateId: "other" })).rejects.toThrow();
    await expect(owner.stop({ ...identity, artifactSha512: Buffer.alloc(64, 8).toString("base64") })).rejects.toThrow();
    expect(ports.shutdown).not.toHaveBeenCalled();
  });

  it("retains exact identity even if caller mutates its input/snapshot", async () => {
    const { owner } = fixture();
    const mutable = { ...identity };
    const prepare = owner.prepare(mutable);
    mutable.updateId = "changed";
    await prepare;
    const snapshot = owner.snapshot();
    if (snapshot.identity) Object.assign(snapshot.identity, { updateId: "changed-again" });
    expect(owner.snapshot().identity).toEqual(identity);
    await expect(owner.stop(mutable)).rejects.toThrow();
  });

  it("cancels on draft failure and never starts shutdown", async () => {
    const { owner, ports, release } = fixture();
    ports.prepareRenderer.mockRejectedValue(new Error("CAS conflict"));
    await expect(owner.prepare(identity)).rejects.toThrow("CAS conflict");
    expect(owner.snapshot().phase).toBe("canceled");
    expect(release).toHaveBeenCalledTimes(1);
    expect(ports.drainMutations).not.toHaveBeenCalled();
    await expect(owner.stop(identity)).rejects.toThrow();
  });

  it("rejects late renderer completion after cancellation", async () => {
    const { owner, ports, release } = fixture();
    const held = deferred();
    ports.prepareRenderer.mockReturnValue(held.promise);
    const prepare = owner.prepare(identity);
    const rejected = expect(prepare).rejects.toThrow();
    await Promise.resolve();
    await owner.cancel(identity);
    held.resolve();
    await rejected;
    expect(owner.snapshot().phase).toBe("canceled");
    expect(ports.drainMutations).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("timeout invalidates preparation instead of allowing a late receipt", async () => {
    vi.useFakeTimers();
    const { owner, ports, release } = fixture();
    const held = deferred();
    ports.drainMutations.mockReturnValue(held.promise);
    const prepare = owner.prepare(identity);
    const rejected = expect(prepare).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(31);
    await rejected;
    held.resolve();
    await Promise.resolve();
    expect(owner.snapshot().phase).toBe("canceled");
    expect(release).toHaveBeenCalledTimes(1);
    expect(ports.shutdown).not.toHaveBeenCalled();
  });

  it("keeps the fence and requires recovery after shutdown failure", async () => {
    const { owner, ports, release } = fixture();
    await owner.prepare(identity);
    ports.shutdown.mockRejectedValue(new Error("PTY still alive"));
    await expect(owner.stop(identity)).rejects.toThrow("PTY still alive");
    expect(owner.snapshot().phase).toBe("recovery-required");
    expect(release).not.toHaveBeenCalled();
    await expect(owner.prepare({ ...identity, updateId: "retry" })).rejects.toThrow();
  });

  it("late shutdown after deadline never changes recovery into stopped", async () => {
    vi.useFakeTimers();
    const { owner, ports } = fixture();
    await owner.prepare(identity);
    const held = deferred();
    ports.shutdown.mockReturnValue(held.promise);
    const stop = owner.stop(identity);
    const rejected = expect(stop).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(9);
    await rejected;
    held.resolve();
    await Promise.resolve();
    expect(owner.snapshot().phase).toBe("recovery-required");
  });

  it("does not resume work when renderer cancellation cannot be confirmed", async () => {
    const { owner, ports, release } = fixture();
    await owner.prepare(identity);
    ports.cancelRenderer.mockRejectedValue(new Error("Renderer disconnected"));
    await expect(owner.cancel(identity)).rejects.toThrow();
    expect(owner.snapshot().phase).toBe("recovery-required");
    expect(release).not.toHaveBeenCalled();
  });
});
