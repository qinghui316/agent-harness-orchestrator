import type { ComposerDraftSnapshot, ComposerDraftWrite, ProductMode } from "../types.js";
import { userFacingErrorMessage } from "../presentation/user-facing-language.js";
import type { ComposerDraftSettlementGuard } from "./conversation-draft-settlement-contract.js";
export type { ComposerDraftSettlementGuard } from "./conversation-draft-settlement-contract.js";

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
  textMutationRevision: number;
  contextMutationRevisions: Map<string, number>;
  attachmentMutationRevisions: Map<string, number>;
  skillMutationRevisions: Map<string, number>;
  conflict: ComposerDraftApiConflict | null;
}

export interface ComposerDraftSettlementOptions {
  text?: boolean;
  contextRefs?: boolean;
  attachmentIds?: boolean;
  skillOverrides?: boolean;
}

export interface ComposerDraftCheckpoint {
  projectId: string;
  productMode: ProductMode;
  localRevision: number;
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
    const nextRevision = state.localRevision + 1;
    recordContentMutations(state, state.latestContent, content, nextRevision);
    state.latestContent = cloneContent(content);
    state.pendingContent = cloneContent(content);
    state.localRevision = nextRevision;
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
    checkpoint?: ComposerDraftCheckpoint,
    externalGuard?: ComposerDraftSettlementGuard,
  ): Promise<ComposerDraftSnapshot | null> {
    if (checkpoint
      && (checkpoint.projectId !== accepted.projectId || checkpoint.productMode !== accepted.productMode)) {
      throw new Error("Composer draft checkpoint does not match the accepted draft scope.");
    }
    const state = this.state(accepted.projectId, accepted.productMode);
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    return this.enqueue(accepted.projectId, accepted.productMode, async () => {
      if (state.conflict) throw state.conflict;
      const current = state.latestContent ?? cloneContent(accepted);
      const settled = settleContent(current, accepted, options, checkpoint ? {
        checkpointRevision: checkpoint.localRevision,
        textMutationRevision: state.textMutationRevision,
        contextMutationRevisions: state.contextMutationRevisions,
        attachmentMutationRevisions: state.attachmentMutationRevisions,
        skillMutationRevisions: state.skillMutationRevisions,
      } : undefined, externalGuard);
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

  checkpoint(projectId: string, productMode: ProductMode): ComposerDraftCheckpoint {
    return { projectId, productMode, localRevision: this.state(projectId, productMode).localRevision };
  }

  async rebaseAcceptedExternal(
    checkpoint: ComposerDraftCheckpoint,
    accepted: ComposerDraftContent,
    options: ComposerDraftSettlementOptions = {
      text: true,
      contextRefs: true,
      attachmentIds: true,
      skillOverrides: true,
    },
    externalGuard?: ComposerDraftSettlementGuard,
  ): Promise<ComposerDraftSnapshot | null> {
    if (checkpoint.projectId !== accepted.projectId || checkpoint.productMode !== accepted.productMode) {
      throw new Error("Composer draft checkpoint does not match the accepted draft scope.");
    }
    const state = this.state(checkpoint.projectId, checkpoint.productMode);
    return this.enqueue(checkpoint.projectId, checkpoint.productMode, async () => {
      const remote = await this.api.load(checkpoint.projectId, checkpoint.productMode);
      state.updatedAt = remote?.updatedAt ?? null;
      state.conflict = null;
      if (state.localRevision === checkpoint.localRevision) {
        state.latestContent = remote ? contentFromSnapshot(remote) : null;
        state.pendingContent = null;
        return remote;
      }
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      const current = state.latestContent
        ?? (remote ? contentFromSnapshot(remote) : cloneContent(accepted));
      const settled = settleContent(current, accepted, options, {
        checkpointRevision: checkpoint.localRevision,
        textMutationRevision: state.textMutationRevision,
        contextMutationRevisions: state.contextMutationRevisions,
        attachmentMutationRevisions: state.attachmentMutationRevisions,
        skillMutationRevisions: state.skillMutationRevisions,
      }, externalGuard);
      state.latestContent = settled;
      state.pendingContent = null;
      state.localRevision += 1;
      try {
        const saved = await this.api.save({ ...cloneContent(settled), expectedUpdatedAt: state.updatedAt });
        state.updatedAt = saved.updatedAt;
        return saved;
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
      textMutationRevision: 0,
      contextMutationRevisions: new Map(),
      attachmentMutationRevisions: new Map(),
      skillMutationRevisions: new Map(),
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
  mutationGuard?: {
    checkpointRevision: number;
    textMutationRevision: number;
    contextMutationRevisions: ReadonlyMap<string, number>;
    attachmentMutationRevisions: ReadonlyMap<string, number>;
    skillMutationRevisions: ReadonlyMap<string, number>;
  },
  externalGuard?: ComposerDraftSettlementGuard,
): ComposerDraftContent {
  const preservedContextRefs = new Set(externalGuard?.preserveContextRefIdentities ?? []);
  const preservedAttachments = new Set(externalGuard?.preserveAttachmentIds ?? []);
  const preservedSkills = new Set(externalGuard?.preserveSkillIds ?? []);
  const mayRemove = (revisions: ReadonlyMap<string, number>, identity: string): boolean => (
    !mutationGuard || (revisions.get(identity) ?? 0) <= mutationGuard.checkpointRevision
  );
  return {
    ...cloneContent(current),
    text: options.text && current.text === accepted.text
      && (!mutationGuard || mutationGuard.textMutationRevision <= mutationGuard.checkpointRevision)
      && !externalGuard?.preserveText
      ? "" : current.text,
    contextRefs: options.contextRefs
      ? removeAcceptedReferences(current.contextRefs, accepted.contextRefs, (identity) => (
        mayRemove(mutationGuard?.contextMutationRevisions ?? new Map(), identity)
          && !preservedContextRefs.has(identity)
      ))
      : current.contextRefs.map((item) => ({ ...item })),
    attachmentIds: options.attachmentIds
      ? removeAcceptedStrings(current.attachmentIds, accepted.attachmentIds, (identity) => (
        mayRemove(mutationGuard?.attachmentMutationRevisions ?? new Map(), identity)
          && !preservedAttachments.has(identity)
      ))
      : [...current.attachmentIds],
    skillOverrides: options.skillOverrides
      ? removeAcceptedOverrides(current.skillOverrides, accepted.skillOverrides, (identity) => (
        mayRemove(mutationGuard?.skillMutationRevisions ?? new Map(), identity)
          && !preservedSkills.has(identity)
      ))
      : { ...current.skillOverrides },
  };
}

function removeAcceptedReferences(
  current: ComposerDraftContent["contextRefs"],
  accepted: ComposerDraftContent["contextRefs"],
  mayRemove: (identity: string) => boolean = () => true,
): ComposerDraftContent["contextRefs"] {
  const acceptedKeys = new Set(accepted.map((reference) => `${reference.kind}:${reference.relativePath}`));
  return current
    .filter((reference) => {
      const identity = `${reference.kind}:${reference.relativePath}`;
      return !acceptedKeys.has(identity) || !mayRemove(identity);
    })
    .map((reference) => ({ ...reference }));
}

function removeAcceptedStrings(
  current: readonly string[],
  accepted: readonly string[],
  mayRemove: (identity: string) => boolean = () => true,
): string[] {
  const acceptedValues = new Set(accepted);
  return current.filter((value) => !acceptedValues.has(value) || !mayRemove(value));
}

function removeAcceptedOverrides(
  current: Readonly<Record<string, boolean>>,
  accepted: Readonly<Record<string, boolean>>,
  mayRemove: (identity: string) => boolean = () => true,
): Record<string, boolean> {
  const next = { ...current };
  for (const [skillId, acceptedValue] of Object.entries(accepted)) {
    if (next[skillId] === acceptedValue && mayRemove(skillId)) delete next[skillId];
  }
  return next;
}

function recordContentMutations(
  state: ScopeState,
  current: ComposerDraftContent | null,
  next: ComposerDraftContent,
  revision: number,
): void {
  if (!current || current.text !== next.text) state.textMutationRevision = revision;
  recordIdentityMembershipMutations(
    current?.contextRefs ?? [],
    next.contextRefs,
    (reference) => `${reference.kind}:${reference.relativePath}`,
    state.contextMutationRevisions,
    revision,
  );
  recordIdentityMembershipMutations(
    current?.attachmentIds ?? [],
    next.attachmentIds,
    (identity) => identity,
    state.attachmentMutationRevisions,
    revision,
  );
  const currentSkills = current?.skillOverrides ?? {};
  for (const skillId of new Set([...Object.keys(currentSkills), ...Object.keys(next.skillOverrides)])) {
    if (currentSkills[skillId] === next.skillOverrides[skillId]
      && Object.hasOwn(currentSkills, skillId) === Object.hasOwn(next.skillOverrides, skillId)) continue;
    state.skillMutationRevisions.set(skillId, revision);
  }
}

function recordIdentityMembershipMutations<T>(
  current: readonly T[],
  next: readonly T[],
  identityOf: (item: T) => string,
  revisions: Map<string, number>,
  revision: number,
): void {
  const currentIds = new Set(current.map(identityOf));
  const nextIds = new Set(next.map(identityOf));
  for (const identity of new Set([...currentIds, ...nextIds])) {
    if (currentIds.has(identity) !== nextIds.has(identity)) revisions.set(identity, revision);
  }
}
