import type { ComposerDraftSnapshot, ComposerDraftWrite, ProductMode } from "../types.js";

export interface ComposerDraftApi {
  load(projectId: string, productMode: ProductMode): Promise<ComposerDraftSnapshot | null>;
  save(input: ComposerDraftWrite): Promise<ComposerDraftSnapshot>;
  delete(input: { projectId: string; productMode: ProductMode; expectedUpdatedAt: string | null }): Promise<boolean>;
}

export type ComposerDraftContent = Omit<ComposerDraftWrite, "expectedUpdatedAt">;

export class ComposerDraftApiConflict extends Error {
  constructor(readonly current: ComposerDraftSnapshot | null, message = "Composer draft changed in another window.") {
    super(message);
    this.name = "Conflict";
  }
}

interface ScopeState {
  updatedAt: string | null;
  pending: ComposerDraftContent | null;
  timer: ReturnType<typeof setTimeout> | null;
  chain: Promise<void>;
}

export class ComposerDraftSyncOwner {
  private readonly scopes = new Map<string, ScopeState>();

  constructor(
    private readonly api: ComposerDraftApi,
    private readonly onError: (message: string) => void,
    private readonly debounceMs = 350,
  ) {}

  async load(projectId: string, productMode: ProductMode): Promise<ComposerDraftSnapshot | null> {
    const snapshot = await this.api.load(projectId, productMode);
    this.state(projectId, productMode).updatedAt = snapshot?.updatedAt ?? null;
    return snapshot;
  }

  schedule(content: ComposerDraftContent): void {
    const state = this.state(content.projectId, content.productMode);
    state.pending = cloneContent(content);
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = null;
      void this.flush(content.projectId, content.productMode).catch((cause) => this.onError(errorMessage(cause)));
    }, this.debounceMs);
  }

  async flush(projectId: string, productMode: ProductMode): Promise<string | null> {
    const state = this.state(projectId, productMode);
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    const content = state.pending;
    state.pending = null;
    if (content) {
      await this.enqueue(projectId, productMode, async () => {
        try {
          const saved = await this.api.save({ ...content, expectedUpdatedAt: state.updatedAt });
          state.updatedAt = saved.updatedAt;
        } catch (cause) {
          if (cause instanceof ComposerDraftApiConflict) state.updatedAt = cause.current?.updatedAt ?? null;
          throw cause;
        }
      });
    } else {
      await state.chain;
    }
    return state.updatedAt;
  }

  async replaceIfUnchanged(content: ComposerDraftContent, expectedUpdatedAt: string | null): Promise<ComposerDraftSnapshot | null> {
    const state = this.state(content.projectId, content.productMode);
    let result: ComposerDraftSnapshot | null = null;
    await this.enqueue(content.projectId, content.productMode, async () => {
      try {
        result = await this.api.save({ ...cloneContent(content), expectedUpdatedAt });
        state.updatedAt = result.updatedAt;
      } catch (cause) {
        if (cause instanceof ComposerDraftApiConflict) state.updatedAt = cause.current?.updatedAt ?? null;
        throw cause;
      }
    });
    return result;
  }

  async deleteIfUnchanged(
    projectId: string,
    productMode: ProductMode,
    expectedUpdatedAt: string | null,
  ): Promise<boolean> {
    const state = this.state(projectId, productMode);
    let deleted = false;
    await this.enqueue(projectId, productMode, async () => {
      try {
        deleted = await this.api.delete({ projectId, productMode, expectedUpdatedAt });
        state.updatedAt = null;
      } catch (cause) {
        if (cause instanceof ComposerDraftApiConflict) state.updatedAt = cause.current?.updatedAt ?? null;
        throw cause;
      }
    });
    return deleted;
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.scopes.keys()].map((key) => {
      const [projectId, productMode] = key.split("\0") as [string, ProductMode];
      return this.flush(projectId, productMode);
    }));
  }

  token(projectId: string, productMode: ProductMode): string | null {
    return this.state(projectId, productMode).updatedAt;
  }

  private state(projectId: string, productMode: ProductMode): ScopeState {
    const key = scopeKey(projectId, productMode);
    const existing = this.scopes.get(key);
    if (existing) return existing;
    const created: ScopeState = { updatedAt: null, pending: null, timer: null, chain: Promise.resolve() };
    this.scopes.set(key, created);
    return created;
  }

  private enqueue(projectId: string, productMode: ProductMode, task: () => Promise<void>): Promise<void> {
    const state = this.state(projectId, productMode);
    const result = state.chain.then(task, task);
    state.chain = result.catch(() => undefined);
    return result;
  }
}

export const defaultComposerDraftApi: ComposerDraftApi = {
  async load(projectId, productMode) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workbench/composer-draft?productMode=${encodeURIComponent(productMode)}`);
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json() as { draft?: ComposerDraftSnapshot | null };
    return payload.draft ?? null;
  },
  async save(input) {
    const response = await fetch(`/api/projects/${encodeURIComponent(input.projectId)}/workbench/composer-draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    });
    const payload = await response.json() as { error?: string; draft?: ComposerDraftSnapshot | null };
    if (response.status === 409) throw new ComposerDraftApiConflict(payload.draft ?? null, payload.error);
    if (!response.ok || !payload.draft) throw new Error(payload.error ?? "Composer draft save failed.");
    return payload.draft;
  },
  async delete(input) {
    const params = new URLSearchParams({ productMode: input.productMode });
    if (input.expectedUpdatedAt !== null) params.set("expectedUpdatedAt", input.expectedUpdatedAt);
    const response = await fetch(
      `/api/projects/${encodeURIComponent(input.projectId)}/workbench/composer-draft?${params.toString()}`,
      { method: "DELETE", keepalive: true },
    );
    const payload = await response.json() as { error?: string; deleted?: boolean; draft?: ComposerDraftSnapshot | null };
    if (response.status === 409) throw new ComposerDraftApiConflict(payload.draft ?? null, payload.error);
    if (!response.ok) throw new Error(payload.error ?? "Composer draft delete failed.");
    return payload.deleted ?? false;
  },
};

function cloneContent(content: ComposerDraftContent): ComposerDraftContent {
  return {
    ...content,
    contextRefs: content.contextRefs.map((item) => ({ ...item })),
    attachmentIds: [...content.attachmentIds],
    skillOverrides: { ...content.skillOverrides },
  };
}

function scopeKey(projectId: string, productMode: ProductMode): string {
  return `${projectId}\0${productMode}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
