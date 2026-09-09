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

  it("does not overwrite a conflicting server draft until an explicit reload", async () => {
    const api = draftApi();
    api.save = vi.fn()
      .mockRejectedValueOnce(new ComposerDraftApiConflict(snapshot({ text: "other", updatedAt: "server-token" })))
      .mockResolvedValueOnce(snapshot({ text: "after reload", updatedAt: "next-token" }));
    api.load = vi.fn(async () => snapshot({ text: "other", updatedAt: "server-token" }));
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 0);
    owner.schedule(content("local"));
    await expect(owner.flush("repo", "agent")).rejects.toBeInstanceOf(ComposerDraftApiConflict);
    owner.schedule(content("after conflict"));
    await expect(owner.flush("repo", "agent")).rejects.toBeInstanceOf(ComposerDraftApiConflict);
    expect(api.save).toHaveBeenCalledOnce();

    await owner.load("repo", "agent");
    owner.schedule(content("after reload"));
    await owner.flush("repo", "agent");

    expect(api.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: "after reload",
      expectedUpdatedAt: "server-token",
    }));
  });

  it("preserves HTTP conflict identity for user-facing recovery guidance", () => {
    const conflict = new ComposerDraftApiConflict(null);

    expect(conflict.status).toBe(409);
    expect(userFacingErrorMessage(conflict, "save")).toBe("当前状态已经变化。刷新后再试一次。");
  });

  it("serializes load with a draft entered before the load response", async () => {
    const pendingLoad = deferred<ComposerDraftSnapshot | null>();
    const api = draftApi({ load: vi.fn(() => pendingLoad.promise) });
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 0);
    const loading = owner.load("repo", "agent");
    owner.schedule(content("typed while loading"));
    const flushing = owner.flush("repo", "agent");
    expect(api.save).not.toHaveBeenCalled();

    pendingLoad.resolve(snapshot({ text: "server draft", updatedAt: "loaded-token" }));
    await loading;
    await flushing;

    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({
      text: "typed while loading",
      expectedUpdatedAt: "loaded-token",
    }));
  });

  it("settles against the latest local value and preserves a newer pending draft", async () => {
    const api = draftApi({ load: vi.fn(async () => snapshot({ text: "submitted", updatedAt: "captured-token" })) });
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 10_000);
    await owner.load("repo", "agent");
    owner.schedule(content("next message"));

    await owner.settleAccepted(content("submitted"));

    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({
      text: "next message",
      expectedUpdatedAt: "captured-token",
    }));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("clears submitted text while preserving a newer model selection", async () => {
    const api = draftApi({ load: vi.fn(async () => snapshot({
      text: "submitted",
      agentModelId: "model-old",
      updatedAt: "captured-token",
    })) });
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 10_000);
    await owner.load("repo", "agent");
    owner.schedule(content("submitted", { agentModelId: "model-new" }));

    await owner.settleAccepted(content("submitted", { agentModelId: "model-old" }));

    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({
      text: "",
      agentModelId: "model-new",
      expectedUpdatedAt: "captured-token",
    }));
  });

  it("removes accepted resource identities while preserving resources added during submission", async () => {
    const submitted = content("submitted", {
      contextRefs: [{ relativePath: "src/a.ts", name: "a.ts", kind: "file", source: "composer" }],
      attachmentIds: ["attachment-a"],
      skillOverrides: { reviewer: true, changed: true },
    });
    const api = draftApi({ load: vi.fn(async () => snapshot({
      text: submitted.text,
      contextRefs: submitted.contextRefs,
      attachments: [],
      skillOverrides: submitted.skillOverrides,
      updatedAt: "captured-token",
    })) });
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 10_000);
    await owner.load("repo", "agent");
    owner.schedule(content("next message", {
      contextRefs: [
        ...submitted.contextRefs,
        { relativePath: "src/b.ts", name: "b.ts", kind: "file", source: "composer" },
      ],
      attachmentIds: ["attachment-a", "attachment-b"],
      skillOverrides: { reviewer: true, formatter: true, changed: false },
    }));

    await owner.settleAccepted(submitted);

    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({
      text: "next message",
      contextRefs: [expect.objectContaining({ relativePath: "src/b.ts" })],
      attachmentIds: ["attachment-b"],
      skillOverrides: { formatter: true, changed: false },
      expectedUpdatedAt: "captured-token",
    }));
  });

  it("uses the settlement token for an edit made while settlement is in flight", async () => {
    const settlement = deferred<ComposerDraftSnapshot>();
    const api = draftApi({ load: vi.fn(async () => snapshot({ text: "submitted", updatedAt: "captured-token" })) });
    api.save = vi.fn()
      .mockImplementationOnce(() => settlement.promise)
      .mockResolvedValueOnce(snapshot({ text: "next message", updatedAt: "next-token" }));
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 10_000);
    await owner.load("repo", "agent");

    const settling = owner.settleAccepted(content("submitted"));
    await vi.waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    owner.schedule(content("next message"));
    settlement.resolve(snapshot({ text: "", updatedAt: "settled-token" }));
    await settling;
    await owner.flush("repo", "agent");

    expect(api.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: "next message",
      expectedUpdatedAt: "settled-token",
    }));
  });

  it("rebases an external accepted clear without discarding edits made after its checkpoint", async () => {
    const api = draftApi({
      load: vi.fn()
        .mockResolvedValueOnce(snapshot({ text: "submitted", updatedAt: "captured-token" }))
        .mockResolvedValueOnce(snapshot({ text: "", updatedAt: "external-token" })),
      save: vi.fn(async (input) => snapshot({
        text: input.text,
        contextRefs: input.contextRefs,
        attachments: input.attachmentIds.map((id) => ({ id } as ComposerDraftSnapshot["attachments"][number])),
        skillOverrides: input.skillOverrides,
        updatedAt: "rebased-token",
      })),
    });
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 10_000);
    await owner.load("repo", "agent");
    const submitted = content("submitted", {
      contextRefs: [{ relativePath: "src/a.ts", name: "a.ts", kind: "file", source: "composer" }],
      attachmentIds: ["attachment-a"],
      skillOverrides: { reviewer: true, changed: true },
    });
    owner.schedule(submitted);
    const checkpoint = owner.checkpoint("repo", "agent");
    await owner.flush("repo", "agent");
    owner.schedule(content("next message", {
      contextRefs: [
        ...submitted.contextRefs,
        { relativePath: "src/b.ts", name: "b.ts", kind: "file", source: "composer" },
      ],
      attachmentIds: ["attachment-a", "attachment-b"],
      skillOverrides: { reviewer: true, formatter: true, changed: false },
    }));

    await owner.rebaseAcceptedExternal(checkpoint, submitted);

    expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({
      text: "next message",
      contextRefs: [expect.objectContaining({ relativePath: "src/b.ts" })],
      attachmentIds: ["attachment-b"],
      skillOverrides: { formatter: true, changed: false },
      expectedUpdatedAt: "external-token",
    }));
  });

  it("keeps same-value edits and same-identity resources re-added after an external checkpoint", async () => {
    const submitted = content("submitted", {
      contextRefs: [{ relativePath: "src/a.ts", name: "a.ts", kind: "file", source: "composer" }],
      attachmentIds: ["attachment-a"],
      skillOverrides: { reviewer: true },
    });
    const api = draftApi({
      load: vi.fn()
        .mockResolvedValueOnce(snapshot({
          text: submitted.text,
          contextRefs: submitted.contextRefs,
          attachments: submitted.attachmentIds.map((id) => ({ id } as ComposerDraftSnapshot["attachments"][number])),
          skillOverrides: submitted.skillOverrides,
          updatedAt: "captured-token",
        }))
        .mockResolvedValueOnce(snapshot({ text: "", updatedAt: "external-token" })),
      save: vi.fn(async (input) => snapshot({
        text: input.text,
        contextRefs: input.contextRefs,
        attachments: input.attachmentIds.map((id) => ({ id } as ComposerDraftSnapshot["attachments"][number])),
        skillOverrides: input.skillOverrides,
        updatedAt: "rebased-token",
      })),
    });
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 10_000);
    await owner.load("repo", "agent");
    owner.schedule(submitted);
    const checkpoint = owner.checkpoint("repo", "agent");
    await owner.flush("repo", "agent");
    owner.schedule(content("temporary", { contextRefs: [], attachmentIds: [], skillOverrides: {} }));
    owner.schedule(submitted);

    await owner.rebaseAcceptedExternal(checkpoint, submitted);

    expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({
      text: "submitted",
      contextRefs: [expect.objectContaining({ relativePath: "src/a.ts" })],
      attachmentIds: ["attachment-a"],
      skillOverrides: { reviewer: true },
      expectedUpdatedAt: "external-token",
    }));
  });

  it("keeps same-value edits and same-identity resources re-added after an ordinary send checkpoint", async () => {
    const submitted = content("submitted", {
      contextRefs: [{ relativePath: "src/a.ts", name: "a.ts", kind: "file", source: "composer" }],
      attachmentIds: ["attachment-a"],
      skillOverrides: { reviewer: true },
    });
    const api = draftApi({
      load: vi.fn(async () => snapshot({
        text: submitted.text,
        contextRefs: submitted.contextRefs,
        attachments: submitted.attachmentIds.map((id) => ({ id } as ComposerDraftSnapshot["attachments"][number])),
        skillOverrides: submitted.skillOverrides,
        updatedAt: "captured-token",
      })),
      save: vi.fn(async (input) => snapshot({
        text: input.text,
        contextRefs: input.contextRefs,
        attachments: input.attachmentIds.map((id) => ({ id } as ComposerDraftSnapshot["attachments"][number])),
        skillOverrides: input.skillOverrides,
        updatedAt: "settled-token",
      })),
    });
    const owner = new ComposerDraftSyncOwner(api, () => undefined, 10_000);
    await owner.load("repo", "agent");
    owner.schedule(submitted);
    const checkpoint = owner.checkpoint("repo", "agent");
    await owner.flush("repo", "agent");
    owner.schedule(content("temporary", { contextRefs: [], attachmentIds: [], skillOverrides: {} }));
    owner.schedule(submitted);

    await owner.settleAccepted(submitted, undefined, checkpoint);

    expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({
      text: "submitted",
      contextRefs: [expect.objectContaining({ relativePath: "src/a.ts" })],
      attachmentIds: ["attachment-a"],
      skillOverrides: { reviewer: true },
      expectedUpdatedAt: "settled-token",
    }));
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

function content(text: string, overrides: Partial<ComposerDraftContent> = {}): ComposerDraftContent {
  return {
    projectId: "repo",
    productMode: "agent",
    agentTurnMode: "default",
    text,
    contextRefs: [],
    attachmentIds: [],
    skillOverrides: {},
    selectedProviderId: "codex",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
