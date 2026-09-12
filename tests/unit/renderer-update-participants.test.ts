import { describe, expect, it, vi } from "vitest";
import { RendererUpdateParticipants } from "../../src/web/src/controllers/RendererUpdateParticipants.js";

describe("Renderer update save participants", () => {
  it("requires all participants and their current revisions", async () => {
    const registry = new RendererUpdateParticipants();
    let current = true;
    const save = vi.fn(async () => () => current);
    registry.register(save);
    await registry.prepare("update");
    expect(registry.confirm("update")).toBe(true);
    expect(registry.confirm("old")).toBe(false);
    current = false;
    expect(registry.confirm("update")).toBe(false);
  });
  it("invalidates receipts when a composer unmounts or registers", async () => {
    const registry = new RendererUpdateParticipants();
    const release = registry.register(async () => () => true);
    await registry.prepare("update");
    release();
    expect(registry.confirm("update")).toBe(false);
  });
  it("does not acknowledge a failed or uploading participant", async () => {
    const registry = new RendererUpdateParticipants();
    registry.register(async () => { throw new Error("uploading"); });
    await expect(registry.prepare("update")).rejects.toThrow("uploading");
    expect(registry.confirm("update")).toBe(false);
  });
});
