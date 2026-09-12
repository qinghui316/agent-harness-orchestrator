import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ComposerDraftApiConflict, ComposerDraftSyncOwner,
  type ComposerDraftApi, type ComposerDraftContent,
} from "../../src/web/src/controllers/ComposerDraftSyncOwner.js";
import type { ComposerDraftSnapshot } from "../../src/web/src/types.js";

afterEach(() => vi.useRealTimers());
const content = (text: string, projectId = "project", productMode: "agent" | "harness" = "agent"): ComposerDraftContent => ({
  projectId, productMode, agentTurnMode: productMode === "agent" ? "default" : null,
  text, contextRefs: [], attachmentIds: [], skillOverrides: {}, selectedProviderId: "codex",
});
const snapshot = (text: string, updatedAt = "saved"): ComposerDraftSnapshot => ({
  projectId: "project", productMode: "agent", agentTurnMode: "default",
  text, contextRefs: [], attachments: [], skillOverrides: {},
  selectedProviderId: "codex", updatedAt, diagnostics: [],
});
function fixture() {
  vi.useFakeTimers();
  const api: ComposerDraftApi = {
    load: vi.fn(async () => null),
    save: vi.fn(async (input) => snapshot(input.text)),
    delete: vi.fn(async () => true),
  };
  const owner = new ComposerDraftSyncOwner(api, vi.fn());
  return { api, owner };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("durable draft update receipts", () => {
  it("saves all scopes and produces an immutable revision-bound receipt", async () => {
    const { api, owner } = fixture();
    owner.schedule(content("a"));
    owner.schedule(content("b", "project", "harness"));
    owner.schedule(content("c", "other"));
    const receipt = await owner.saveForUpdate();
    expect(api.save).toHaveBeenCalledTimes(3);
    expect(receipt.scopes).toHaveLength(3);
    expect(Object.isFrozen(receipt.scopes[0])).toBe(true);
    expect(owner.isSaveReceiptCurrent(receipt)).toBe(true);
    owner.schedule(content("later"));
    expect(owner.isSaveReceiptCurrent(receipt)).toBe(false);
  });

  it("does not acknowledge a new scope opened while saving", async () => {
    const { owner } = fixture();
    owner.schedule(content("a"));
    const pending = owner.saveForUpdate();
    owner.schedule(content("b", "other"));
    await expect(pending).rejects.toThrow("Draft changed");
    await owner.flushAll();
  });

  it("invalidates the acknowledgement if a read/write is queued after capture", async () => {
    const { owner } = fixture();
    owner.schedule(content("a"));
    const pending = owner.saveForUpdate();
    const loading = owner.load("project", "agent");
    await expect(pending).rejects.toThrow();
    await loading;
  });

  it("retains unsaved content after a network error instead of returning false success", async () => {
    const { api, owner } = fixture();
    vi.mocked(api.save).mockRejectedValueOnce(new Error("offline"));
    owner.schedule(content("must survive"));
    await expect(owner.saveForUpdate()).rejects.toThrow("offline");
    expect(await owner.saveForUpdate()).toMatchObject({ scopes: [{ localRevision: 1, updatedAt: "saved" }] });
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({ text: "must survive" }));
  });

  it("preserves an edit made while an earlier network save fails", async () => {
    const { api, owner } = fixture();
    const held = deferred<ComposerDraftSnapshot>();
    vi.mocked(api.save).mockReturnValueOnce(held.promise);
    owner.schedule(content("first"));
    const pending = owner.saveForUpdate();
    const rejected = expect(pending).rejects.toThrow("offline");
    await Promise.resolve();
    owner.schedule(content("newer"));
    held.reject(new Error("offline"));
    await rejected;
    await owner.saveForUpdate();
    expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({ text: "newer" }));
  });

  it("fails closed on CAS conflict without retrying over another writer", async () => {
    const { api, owner } = fixture();
    vi.mocked(api.save).mockRejectedValueOnce(new ComposerDraftApiConflict(snapshot("other")));
    owner.schedule(content("mine"));
    await expect(owner.saveForUpdate()).rejects.toThrow();
    await expect(owner.saveForUpdate()).rejects.toThrow();
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("retains a failed accepted-snapshot settlement for the next explicit save", async () => {
    const { api, owner } = fixture();
    await owner.load("project", "agent");
    owner.schedule(content("new draft"));
    vi.mocked(api.save).mockRejectedValueOnce(new Error("offline"));
    await expect(owner.settleAccepted(content("previous send"))).rejects.toThrow();
    await owner.saveForUpdate();
    expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({ text: "new draft" }));
  });

  it("rejects duplicate scopes rather than letting one scope impersonate another", async () => {
    const { owner } = fixture();
    owner.schedule(content("one"));
    owner.schedule(content("two", "other"));
    const receipt = await owner.saveForUpdate();
    expect(owner.isSaveReceiptCurrent({ scopes: [receipt.scopes[0], receipt.scopes[0]] })).toBe(false);
  });
});
