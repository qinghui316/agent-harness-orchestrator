import type { ComposerDraftSnapshot, ComposerDraftWrite, ProductMode } from "../types.js";
import { userFacingErrorMessage } from "../presentation/user-facing-language.js";

export interface ComposerDraftApi {
  load(projectId: string, productMode: ProductMode): Promise<ComposerDraftSnapshot | null>;
  save(input: ComposerDraftWrite): Promise<ComposerDraftSnapshot>;
  delete(input: { projectId: string; productMode: ProductMode; expectedUpdatedAt: string | null }): Promise<boolean>;
}

export type ComposerDraftContent = Omit<ComposerDraftWrite, "expectedUpdatedAt">;

export class ComposerDraftApiConflict extends Error {
  readonly status = 409;

  constructor(readonly current: ComposerDraftSnapshot | null, message = "Composer draft changed in another window.") {
    super(message);
    this.name = "Conflict";
  }
}

interface ScopeState {
  updatedAt: string | null;
  latestContent: ComposerDraftContent | null;
  pendingContent: ComposerDraftContent | null;
  timer: ReturnType<typeof setTimeout> | null;
  chain: Promise<void>;
  localRevision: number;
  conflict: ComposerDraftApiConflict | null;
}

export interface ComposerDraftSettlementOptions {
  text?: boolean;
  contextRefs?: boolean;
  attachmentIds?: boolean;
  skillOverrides?: boolean;
}

export class ComposerDraftSyncOwner {
  private readonly scopes = new Map<string, ScopeState>();

  constructor(
    private readonly api: ComposerDraftApi,
    private readonly onError: (message: string) => void,
    private readonly debounceMs = 350,
  ) {}

  async load(projectId: string, productMode: ProductMode): Promise<ComposerDraftSnapshot | null> {
    const state = this.state(projectId, productMode);
    const localRevision = state.localRevision;
    return this.enqueue(projectId, productMode, async () => {
      const snapshot = await this.api.load(projectId, productMode);
      state.updatedAt = snapshot?.updatedAt ?? null;
      state.conflict = null;
      if (state.localRevision === localRevision) {
        state.latestContent = snapshot ? contentFromSnapshot(snapshot) : null;
        state.pendingContent = null;
      }
      return snapshot;
    });
  }

  schedule(content: ComposerDraftContent): void {
    const state = this.state(content.projectId, content.productMode);
    state.latestContent = cloneContent(content);
    state.pendingContent = cloneContent(content);
    state.localRevision += 1;
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
    return this.enqueue(projectId, productMode, async () => {
      if (state.conflict) throw state.conflict;
      const content = state.pendingContent;
      if (!content) return state.updatedAt;
      state.pendingContent = null;
      try {
        const saved = await this.api.save({ ...cloneContent(content), expectedUpdatedAt: state.updatedAt });
        state.updatedAt = saved.updatedAt;
        return state.updatedAt;
      } catch (cause) {
        this.recordConflict(state, cause);
        throw cause;
      }
    });
  }

  async settleAccepted(
    accepted: ComposerDraftContent,
    options: ComposerDraftSettlementOptions = {
      text: true,
      contextRefs: true,
      attachmentIds: true,
      skillOverrides: true,
    },
  ): Promise<ComposerDraftSnapshot | null> {
    const state = this.state(accepted.projectId, accepted.productMode);
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    return this.enqueue(accepted.projectId, accepted.productMode, async () => {
      if (state.conflict) throw state.conflict;
      const current = state.latestContent ?? cloneContent(accepted);
      const settled = settleContent(current, accepted, options);
      state.pendingContent = null;
      state.latestContent = settled;
      state.localRevision += 1;
      try {
        const result = await this.api.save({ ...cloneContent(settled), expectedUpdatedAt: state.updatedAt });
        state.updatedAt = result.updatedAt;
        return result;
      } catch (cause) {
        this.recordConflict(state, cause);
        throw cause;
      }
    });
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
    const created: ScopeState = {
      updatedAt: null,
      latestContent: null,
      pendingContent: null,
      timer: null,
      chain: Promise.resolve(),
      localRevision: 0,
      conflict: null,
    };
    this.scopes.set(key, created);
    return created;
  }

  private enqueue<T>(projectId: string, productMode: ProductMode, task: () => Promise<T>): Promise<T> {
    const state = this.state(projectId, productMode);
    const result = state.chain.then(task, task);
    state.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  private recordConflict(state: ScopeState, cause: unknown): void {
    if (!(cause instanceof ComposerDraftApiConflict)) return;
    state.updatedAt = cause.current?.updatedAt ?? null;
    state.conflict = cause;
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
  return userFacingErrorMessage(cause, "save");
}

function contentFromSnapshot(snapshot: ComposerDraftSnapshot): ComposerDraftContent {
  return {
    projectId: snapshot.projectId,
    productMode: snapshot.productMode,
    agentTurnMode: snapshot.agentTurnMode,
    agentModelId: snapshot.agentModelId,
    agentReasoningEffort: snapshot.agentReasoningEffort,
    text: snapshot.text,
    contextRefs: snapshot.contextRefs.map((item) => ({ ...item })),
    attachmentIds: snapshot.attachments.map((item) => item.id),
    skillOverrides: { ...snapshot.skillOverrides },
    selectedProviderId: snapshot.selectedProviderId,
  };
}

function settleContent(
  current: ComposerDraftContent,
  accepted: ComposerDraftContent,
  options: ComposerDraftSettlementOptions,
): ComposerDraftContent {
  return {
    ...cloneContent(current),
    text: options.text && current.text === accepted.text ? "" : current.text,
    contextRefs: options.contextRefs
      ? removeAcceptedReferences(current.contextRefs, accepted.contextRefs)
      : current.contextRefs.map((item) => ({ ...item })),
    attachmentIds: options.attachmentIds
      ? removeAcceptedStrings(current.attachmentIds, accepted.attachmentIds)
      : [...current.attachmentIds],
    skillOverrides: options.skillOverrides
      ? removeAcceptedOverrides(current.skillOverrides, accepted.skillOverrides)
      : { ...current.skillOverrides },
  };
}

function removeAcceptedReferences(
  current: ComposerDraftContent["contextRefs"],
  accepted: ComposerDraftContent["contextRefs"],
): ComposerDraftContent["contextRefs"] {
  const acceptedKeys = new Set(accepted.map((reference) => `${reference.kind}:${reference.relativePath}`));
  return current
    .filter((reference) => !acceptedKeys.has(`${reference.kind}:${reference.relativePath}`))
    .map((reference) => ({ ...reference }));
}

function removeAcceptedStrings(current: readonly string[], accepted: readonly string[]): string[] {
  const acceptedValues = new Set(accepted);
  return current.filter((value) => !acceptedValues.has(value));
}

function removeAcceptedOverrides(
  current: Readonly<Record<string, boolean>>,
  accepted: Readonly<Record<string, boolean>>,
): Record<string, boolean> {
  const next = { ...current };
  for (const [skillId, acceptedValue] of Object.entries(accepted)) {
    if (next[skillId] === acceptedValue) delete next[skillId];
  }
  return next;
}
