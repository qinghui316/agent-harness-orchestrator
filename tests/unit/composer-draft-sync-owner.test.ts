import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ComposerDraftApiConflict,
  ComposerDraftSyncOwner,
  type ComposerDraftApi,
  type ComposerDraftContent,
} from "../../src/web/src/controllers/ComposerDraftSyncOwner.js";
import type { ComposerDraftSnapshot } from "../../src/web/src/types.js";
import { userFacingErrorMessage } from "../../src/web/src/presentation/user-facing-language.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("ComposerDraftSyncOwner", () => {
  it("debounces edits, serializes saves, and carries the latest CAS token", async () => {
    vi.useFakeTimers();
    const saved: Array<{ text: string; expectedUpdatedAt: string | null }> = [];
    const api = draftApi({
      save: vi.fn(async (input) => {
        saved.push({ text: input.text, expectedUpdatedAt: input.expectedUpdatedAt });
        return snapshot({ text: input.text, updatedAt: `2026-08-21T00:00:0${saved.length}.000Z` });
      }),
    });
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 350);
    await owner.load("repo", "agent");
    owner.schedule(content("first"));
    owner.schedule(content("latest"));
    await vi.advanceTimersByTimeAsync(350);
    await owner.flush("repo", "agent");

    expect(saved).toEqual([{ text: "latest", expectedUpdatedAt: null }]);
    owner.schedule(content("next"));
    await owner.flush("repo", "agent");
    expect(saved[1]).toEqual({ text: "next", expectedUpdatedAt: "2026-08-21T00:00:01.000Z" });
  });

  it("keeps local content after a CAS conflict and bases the next user edit on the returned token", async () => {
    const api = draftApi();
    api.save = vi.fn()
      .mockRejectedValueOnce(new ComposerDraftApiConflict(snapshot({ text: "other", updatedAt: "server-token" })))
      .mockResolvedValueOnce(snapshot({ text: "after conflict", updatedAt: "next-token" }));
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 0);
    owner.schedule(content("local"));
    await expect(owner.flush("repo", "agent")).rejects.toBeInstanceOf(ComposerDraftApiConflict);
    owner.schedule(content("after conflict"));
    await owner.flush("repo", "agent");

    expect(api.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: "after conflict",
      expectedUpdatedAt: "server-token",
    }));
  });

  it("preserves HTTP conflict identity for user-facing recovery guidance", () => {
    const conflict = new ComposerDraftApiConflict(null);

    expect(conflict.status).toBe(409);
    expect(userFacingErrorMessage(conflict, "save")).toBe("当前状态已经变化。刷新后再试一次。");
  });

  it("does not let an old send settlement delete a newer saved draft", async () => {
    const api = draftApi({ load: vi.fn(async () => snapshot({ updatedAt: "captured-token" })) });
    api.delete = vi.fn(async () => {
      throw new ComposerDraftApiConflict(snapshot({ text: "new input", updatedAt: "new-token" }));
    });
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 0);
    await owner.load("repo", "agent");
    await expect(owner.deleteIfUnchanged("repo", "agent", "captured-token"))
      .rejects.toBeInstanceOf(ComposerDraftApiConflict);
    expect(owner.token("repo", "agent")).toBe("new-token");
  });
});

function draftApi(overrides: Partial<ComposerDraftApi> = {}): ComposerDraftApi {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async (input) => snapshot({ text: input.text, updatedAt: "saved-token" })),
    delete: vi.fn(async () => true),
    ...overrides,
  };
}

function content(text: string): ComposerDraftContent {
  return {
    projectId: "repo",
    productMode: "agent",
    agentTurnMode: "default",
    text,
    contextRefs: [],
    attachmentIds: [],
    skillOverrides: {},
    selectedProviderId: "codex",
  };
}

function snapshot(overrides: Partial<ComposerDraftSnapshot> = {}): ComposerDraftSnapshot {
  return {
    projectId: "repo",
    productMode: "agent",
    agentTurnMode: "default",
    text: "",
    contextRefs: [],
    attachments: [],
    skillOverrides: {},
    selectedProviderId: "codex",
    updatedAt: "initial-token",
    diagnostics: [],
    ...overrides,
  };
}
