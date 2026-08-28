import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { consumeWorkbenchLiveStream, fetchJson, postJson } from "../api.js";
import { extractInlineFileMentions } from "../shell/file-mentions.js";
import { extractInlineSkillMentions } from "../shell/skill-mentions.js";
import type { AgentTurnMode, ComposerDraftDiagnostic, ComposerDraftSnapshot, ConversationTurnQueueSnapshot, ProductMode, ProviderCapabilitySnapshot, ProviderModelSettingsSnapshot, SkillListItem, TopicAttachment, TopicFileReference, WorkbenchLiveEvent } from "../types.js";
import type { ConversationTurnQueueEnqueueInput } from "./useConversationTurnQueueController.js";
import type { WorkbenchOperationToken } from "./useGlobalOperationGate.js";
import type { ConversationSteerOutcome } from "./useConversationActionController.js";
import {
  ComposerDraftApiConflict,
  ComposerDraftSyncOwner,
  defaultComposerDraftApi,
  type ComposerDraftApi,
  type ComposerDraftContent,
} from "./ComposerDraftSyncOwner.js";

export type ComposerTransition = "project-changed" | "conversation-changed" | "new-conversation";

export interface ConversationComposerScope {
  projectId: string | null;
  productMode?: ProductMode;
  conversation: {
    id: string;
    state: string;
    productMode?: ProductMode;
    agentTurnMode?: AgentTurnMode | null;
    agentModelId?: string | null;
    agentReasoningEffort?: string | null;
    selectedProviderId?: string;
  } | null;
  managed: boolean;
  running: boolean;
  runControlState?: {
    state?: "idle" | "running" | "stopping";
    canStop: boolean;
    canSteer?: boolean;
    steerState?: "idle" | "submitting";
    providerId?: string;
    attemptId?: string;
  };
  selectedProviderId: string | null;
  providerCount: number;
  providerCapabilities?: ProviderCapabilitySnapshot[];
  providerCapabilitiesLoading?: boolean;
  providerCapabilitiesError?: string | null;
  providerModelSettings?: ProviderModelSettingsSnapshot | null;
}

export interface PreparedComposerInput {
  text: string;
  contextRefs: TopicFileReference[];
  skillOverrides: Record<string, boolean>;
}

export interface ComposerCreateConversationRequest {
  projectId: string;
  productMode: ProductMode;
  clientRequestId: string;
  body: string;
  contextRefs: TopicFileReference[];
  attachmentIds: string[];
  providerId?: string;
  skillOverrides: ComposerSkillOverride[];
  agentTurnMode?: AgentTurnMode;
  modelId?: string | null;
  reasoningEffort?: string | null;
  showPendingBeforeCreate: boolean;
}

export interface ComposerSkillOverride {
  skillId: string;
  enabled: boolean;
}

export interface SkillRequestIdentity {
  projectId: string;
  productMode: ProductMode;
  conversationId: string | null;
  providerId: string | null;
}

export interface ComposerCreatedConversation {
  projectId: string;
  conversationId: string;
}

export interface ComposerMessageRequest {
  projectId: string;
  productMode: ProductMode;
  conversationId: string;
  message: string;
  contextRefs: TopicFileReference[];
  attachmentIds: string[];
  providerId?: string;
  providerSwitchIntent?: "resume-workflow";
  agentTurnMode?: AgentTurnMode;
  modelId?: string | null;
  reasoningEffort?: string | null;
}

export interface ComposerActionRequest {
  projectId: string;
  conversationId: string;
  productMode: ProductMode;
  providerId?: string;
  expectedAttemptId?: string;
  clientRequestId?: string;
  prompt?: string;
}

export interface ComposerAttachmentUpload {
  fileName: string;
  mediaType: string;
  data: string;
}

export interface ConversationComposerPorts {
  operation: {
    begin(key: string): WorkbenchOperationToken;
    release(token: WorkbenchOperationToken): void;
  };
  session: {
    ensureProjectRegistered(projectId: string): Promise<string | null>;
    createConversation(request: ComposerCreateConversationRequest): Promise<ComposerCreatedConversation>;
    restoreDraftProvider?(providerId: string | null): void;
    selectProvider?(providerId: string): void | Promise<void>;
  };
  actions: {
    sendMessage?(request: ComposerMessageRequest): Promise<void>;
    steer(request: ComposerActionRequest): Promise<ConversationSteerOutcome>;
    stop(request: ComposerActionRequest): Promise<void>;
  };
  projection: {
    refreshConversation(projectId: string, conversationId: string): Promise<void>;
    routeEvent?(projectId: string, event: WorkbenchLiveEvent): void;
  };
  timeline: {
    calibrate(projectId: string, conversationId: string, agentSurfaceId: "main-agent"): Promise<void>;
  };
  skills?: {
    load(identity: SkillRequestIdentity): Promise<SkillListItem[]>;
    setEnabled(identity: SkillRequestIdentity, skillId: string, enabled: boolean): Promise<void>;
  };
  attachments?: {
    upload(projectId: string, upload: ComposerAttachmentUpload): Promise<TopicAttachment>;
    remove(projectId: string, attachmentId: string): Promise<void>;
  };
  drafts?: ComposerDraftApi;
  queue?: {
    snapshot: ConversationTurnQueueSnapshot | null;
    loading: boolean;
    enqueue(input: ConversationTurnQueueEnqueueInput): Promise<ConversationTurnQueueSnapshot | null>;
    reclaim(queueItemId: string, expectedDraftUpdatedAt: string | null): Promise<ConversationTurnQueueSnapshot | null>;
  };
  ids?: {
    createClientRequestId(): string;
  };
  onError(message: string | null): void;
}

export interface CreateConversationComposerInput {
  body?: string;
  fileRefs?: TopicFileReference[];
  attachmentIds?: string[];
  attachmentFiles?: File[];
}

export function useConversationComposerController(
  scope: ConversationComposerScope,
  ports: ConversationComposerPorts,
) {
  const [composerText, setComposerText] = useState("");
  const [skillItems, setSkillItems] = useState<SkillListItem[]>([]);
  const [draftSkillOverrides, setDraftSkillOverrides] = useState<Record<string, boolean>>({});
  const [fileRefs, setFileRefs] = useState<TopicFileReference[]>([]);
  const [attachments, setAttachments] = useState<TopicAttachment[]>([]);
  const [agentTurnMode, setAgentTurnMode] = useState<AgentTurnMode>(() => initialAgentTurnMode(scope));
  const [agentModelId, setAgentModelId] = useState<string | null>(() => initialAgentModelId(scope));
  const [agentReasoningEffort, setAgentReasoningEffort] = useState<string | null>(() => initialAgentReasoningEffort(scope));
  const [draftDiagnostics, setDraftDiagnostics] = useState<ComposerDraftDiagnostic[]>([]);
  const [draftLoadedScopeKey, setDraftLoadedScopeKey] = useState<string | null>(null);
  const [draftDirtyRevision, setDraftDirtyRevision] = useState(0);
  const [skillsLoadedIdentity, setSkillsLoadedIdentity] = useState<string | null>(null);
  const scopeGenerationRef = useRef(0);
  const skillRequestGenerationRef = useRef(0);
  const draftRequestGenerationRef = useRef(0);
  const draftMutationGenerationsRef = useRef(new Map<string, number>());
  const attachmentSelectionGenerationRef = useRef(0);
  const steerRetryRef = useRef<{ key: string; clientRequestId: string } | null>(null);
  const scopeIdentityRef = useRef(composerScopeIdentity(scope));
  const turnModeOwnerIdentityRef = useRef<string | null>(null);
  const draftLoadIdentityRef = useRef<string | null>(null);
  const confirmedTurnModesRef = useRef(new Map<string, AgentTurnMode>());
  const draftFingerprintsRef = useRef(new Map<string, string>());
  const draftScheduledRevisionsRef = useRef(new Map<string, number>());
  const draftObservedProvidersRef = useRef(new Map<string, string | null>());
  const draftRestoredModesRef = useRef(new Map<string, AgentTurnMode>());
  const draftRestoredModelSelectionsRef = useRef(new Map<string, { modelId: string | null; reasoningEffort: string | null }>());
  const stateRef = useRef({ composerText, skillItems, draftSkillOverrides, fileRefs, attachments, agentTurnMode, agentModelId, agentReasoningEffort });
  const scopeRef = useRef(scope);
  const portsRef = useRef(ports);
  stateRef.current = { composerText, skillItems, draftSkillOverrides, fileRefs, attachments, agentTurnMode, agentModelId, agentReasoningEffort };
  scopeRef.current = scope;
  portsRef.current = ports;
  const draftSyncOwnerRef = useRef<ComposerDraftSyncOwner | null>(null);
  if (!draftSyncOwnerRef.current) {
    draftSyncOwnerRef.current = new ComposerDraftSyncOwner(
      ports.drafts ?? defaultComposerDraftApi,
      (message) => portsRef.current.onError(message),
    );
  }

  function markDraftDirty(): void {
    const currentScope = scopeRef.current;
    const key = draftScopeIdentity(currentScope.projectId, composerProductMode(currentScope));
    draftMutationGenerationsRef.current.set(key, (draftMutationGenerationsRef.current.get(key) ?? 0) + 1);
    setDraftDirtyRevision((value) => value + 1);
  }

  const activeSkillIds = useMemo(
    () => activeComposerSkillIds(skillItems, scope.conversation?.id ?? null, draftSkillOverrides),
    [draftSkillOverrides, scope.conversation?.id, skillItems],
  );

  const reloadSkills = useCallback(async (
    projectId = scopeRef.current.projectId,
    capturedIdentity?: SkillRequestIdentity,
  ): Promise<void> => {
    const generation = ++skillRequestGenerationRef.current;
    if (!projectId || !scopeRef.current.managed) {
      setSkillItems([]);
      setSkillsLoadedIdentity(null);
      return;
    }
    try {
      const identity = capturedIdentity ?? skillRequestIdentity({ ...scopeRef.current, projectId });
      const next = await (portsRef.current.skills ?? defaultSkillApi).load(identity);
      if (generation !== skillRequestGenerationRef.current
        || skillRequestIdentityKey(identity) !== skillRequestIdentityKey(skillRequestIdentity(scopeRef.current))) return;
      setSkillItems(next);
      setSkillsLoadedIdentity(skillRequestIdentityKey(identity));
    } catch (cause) {
      if (generation === skillRequestGenerationRef.current) portsRef.current.onError(errorMessage(cause));
    }
  }, []);

  useEffect(() => {
    void reloadSkills(scope.projectId);
    return () => { skillRequestGenerationRef.current += 1; };
  }, [reloadSkills, scope.managed, scope.productMode, scope.projectId, scope.conversation?.id, scope.conversation?.productMode, scope.conversation?.selectedProviderId, scope.selectedProviderId]);

  useEffect(() => {
    const identity = composerScopeIdentity(scope);
    if (identity === scopeIdentityRef.current) return;
    scopeIdentityRef.current = identity;
    scopeGenerationRef.current += 1;
  }, [scope.productMode, scope.projectId, scope.conversation?.id, scope.conversation?.productMode, scope.conversation?.selectedProviderId, scope.selectedProviderId]);

  useEffect(() => {
    const productMode = composerProductMode(scope);
    const ownerIdentity = draftScopeIdentity(scope.projectId, productMode);
    const ownerChanged = ownerIdentity !== turnModeOwnerIdentityRef.current;
    const loadIdentity = scope.projectId && scope.managed ? ownerIdentity : null;
    if (!ownerChanged && loadIdentity === draftLoadIdentityRef.current) return;
    const previousScope = ownerChanged ? turnModeOwnerIdentityRef.current : null;
    if (ownerChanged) turnModeOwnerIdentityRef.current = ownerIdentity;
    draftLoadIdentityRef.current = loadIdentity;
    const generation = ++draftRequestGenerationRef.current;
    const mutationGeneration = draftMutationGenerationsRef.current.get(ownerIdentity) ?? 0;
    const storedConversationMode = scope.conversation && composerProductMode(scope) === "agent"
      ? initialAgentTurnMode(scope)
      : null;
    if (storedConversationMode) confirmedTurnModesRef.current.set(ownerIdentity, storedConversationMode);
    const immediate = storedConversationMode
      ?? confirmedTurnModesRef.current.get(ownerIdentity)
      ?? initialAgentTurnMode(scope);
    if (ownerChanged || !loadIdentity) {
      setAgentTurnMode(immediate);
      setAgentModelId(storedConversationMode ? scope.conversation?.agentModelId ?? null : null);
      setAgentReasoningEffort(storedConversationMode ? scope.conversation?.agentReasoningEffort ?? null : null);
      setDraftLoadedScopeKey(null);
      setDraftDirtyRevision(0);
      setComposerText("");
      setFileRefs([]);
      setAttachments([]);
      setDraftSkillOverrides({});
      setDraftDiagnostics([]);
    }
    if (previousScope) {
      const [previousProjectId, previousProductMode] = parseDraftScopeIdentity(previousScope);
      void draftSyncOwnerRef.current!.flush(previousProjectId, previousProductMode)
        .catch((cause) => portsRef.current.onError(errorMessage(cause)));
    }
    if (!loadIdentity || !scope.projectId) return;
    void draftSyncOwnerRef.current!.load(scope.projectId, productMode)
      .then((draft) => {
        if (generation !== draftRequestGenerationRef.current
          || ownerIdentity !== draftScopeIdentity(scopeRef.current.projectId, composerProductMode(scopeRef.current))) return;
        setDraftLoadedScopeKey(ownerIdentity);
        draftScheduledRevisionsRef.current.set(ownerIdentity, draftDirtyRevision);
        if (!draft) {
          const emptyContent: ComposerDraftContent = {
            projectId: scope.projectId!,
            productMode,
            agentTurnMode: productMode === "agent" ? immediate : null,
            agentModelId: null,
            agentReasoningEffort: null,
            text: "",
            contextRefs: [],
            attachmentIds: [],
            skillOverrides: {},
            selectedProviderId: scope.selectedProviderId,
          };
          draftFingerprintsRef.current.set(ownerIdentity, composerDraftFingerprint(emptyContent));
          draftObservedProvidersRef.current.set(ownerIdentity, emptyContent.selectedProviderId);
          draftRestoredModesRef.current.set(ownerIdentity, productMode === "agent" ? immediate : "default");
          draftRestoredModelSelectionsRef.current.set(ownerIdentity, { modelId: null, reasoningEffort: null });
          return;
        }
        const restoredContent = contentFromSnapshot(draft);
        draftFingerprintsRef.current.set(ownerIdentity, composerDraftFingerprint(restoredContent));
        draftObservedProvidersRef.current.set(ownerIdentity, restoredContent.selectedProviderId);
        if (mutationGeneration !== (draftMutationGenerationsRef.current.get(ownerIdentity) ?? 0)) return;
        const draftMode = productMode === "agent" ? draft.agentTurnMode ?? immediate : "default";
        draftRestoredModesRef.current.set(ownerIdentity, draftMode);
        confirmedTurnModesRef.current.set(ownerIdentity, draftMode);
        const draftModelSelection = productMode === "agent"
          ? { modelId: draft.agentModelId, reasoningEffort: draft.agentReasoningEffort }
          : { modelId: null, reasoningEffort: null };
        draftRestoredModelSelectionsRef.current.set(ownerIdentity, draftModelSelection);
        const currentConversation = scopeRef.current.conversation;
        setAgentTurnMode(productMode === "agent" && currentConversation
          ? currentConversation.agentTurnMode ?? "default"
          : draftMode);
        setAgentModelId(productMode === "agent" && currentConversation
          ? currentConversation.agentModelId ?? null
          : draftModelSelection.modelId);
        setAgentReasoningEffort(productMode === "agent" && currentConversation
          ? currentConversation.agentReasoningEffort ?? null
          : draftModelSelection.reasoningEffort);
        setComposerText(draft.text);
        setFileRefs(normalizeComposerRefs(draft.contextRefs));
        setAttachments(draft.attachments);
        setDraftSkillOverrides(draft.skillOverrides);
        setDraftDiagnostics(draft.diagnostics);
        portsRef.current.session.restoreDraftProvider?.(draft.selectedProviderId);
        if (draft.diagnostics.length > 0) {
          portsRef.current.onError(draft.diagnostics.map((item) => item.message).join(" "));
        }
      })
      .catch((cause: unknown) => {
        if (generation === draftRequestGenerationRef.current
          && ownerIdentity === draftScopeIdentity(scopeRef.current.projectId, composerProductMode(scopeRef.current))) {
          portsRef.current.onError(errorMessage(cause));
        }
      });
  }, [scope.productMode, scope.projectId, scope.managed]);

  useEffect(() => {
    const productMode = composerProductMode(scope);
    if (productMode !== "agent") {
      setAgentTurnMode("default");
      return;
    }
    if (scope.conversation) {
      setAgentTurnMode(scope.conversation.agentTurnMode ?? "default");
      return;
    }
    const restored = draftRestoredModesRef.current.get(draftScopeIdentity(scope.projectId, productMode));
    if (restored) setAgentTurnMode(restored);
  }, [scope.conversation?.agentTurnMode, scope.conversation?.id, scope.productMode, scope.projectId]);

  useEffect(() => {
    const productMode = composerProductMode(scope);
    if (productMode !== "agent") {
      setAgentModelId(null);
      setAgentReasoningEffort(null);
      return;
    }
    if (scope.conversation) {
      setAgentModelId(scope.conversation.agentModelId ?? null);
      setAgentReasoningEffort(scope.conversation.agentReasoningEffort ?? null);
      return;
    }
    const restored = draftRestoredModelSelectionsRef.current.get(draftScopeIdentity(scope.projectId, productMode));
    if (restored) {
      setAgentModelId(restored.modelId);
      setAgentReasoningEffort(restored.reasoningEffort);
    }
  }, [scope.conversation?.agentModelId, scope.conversation?.agentReasoningEffort, scope.conversation?.id, scope.productMode, scope.projectId]);

  const selectAgentTurnMode = useCallback(async (nextMode: AgentTurnMode): Promise<void> => {
    const currentScope = scopeRef.current;
    if (composerProductMode(currentScope) !== "agent") return;
    if (stateRef.current.agentTurnMode === nextMode) return;
    scopeGenerationRef.current += 1;
    confirmedTurnModesRef.current.set(draftScopeIdentity(currentScope.projectId, composerProductMode(currentScope)), nextMode);
    draftRestoredModesRef.current.set(draftScopeIdentity(currentScope.projectId, composerProductMode(currentScope)), nextMode);
    setAgentTurnMode(nextMode);
    markDraftDirty();
  }, []);

  const selectAgentModel = useCallback((nextModelId: string | null): void => {
    const currentScope = scopeRef.current;
    if (composerProductMode(currentScope) !== "agent") return;
    const normalized = normalizeNullableSelection(nextModelId);
    if (stateRef.current.agentModelId === normalized) return;
    const nextCandidate = resolveSelectedModelCandidate(currentScope.providerModelSettings, normalized);
    const currentEffort = stateRef.current.agentReasoningEffort;
    const nextEffort = currentEffort && nextCandidate?.supportedReasoningEfforts.some((option) => option.value === currentEffort)
      ? currentEffort
      : null;
    scopeGenerationRef.current += 1;
    setAgentModelId(normalized);
    setAgentReasoningEffort(nextEffort);
    draftRestoredModelSelectionsRef.current.set(
      draftScopeIdentity(currentScope.projectId, composerProductMode(currentScope)),
      { modelId: normalized, reasoningEffort: nextEffort },
    );
    markDraftDirty();
  }, []);

  const selectAgentReasoningEffort = useCallback((nextEffort: string | null): void => {
    const currentScope = scopeRef.current;
    if (composerProductMode(currentScope) !== "agent") return;
    const normalized = normalizeNullableSelection(nextEffort);
    if (stateRef.current.agentReasoningEffort === normalized) return;
    scopeGenerationRef.current += 1;
    setAgentReasoningEffort(normalized);
    draftRestoredModelSelectionsRef.current.set(
      draftScopeIdentity(currentScope.projectId, composerProductMode(currentScope)),
      { modelId: stateRef.current.agentModelId, reasoningEffort: normalized },
    );
    markDraftDirty();
  }, []);

  const selectProvider = useCallback(async (providerId: string): Promise<void> => {
    const currentScope = scopeRef.current;
    if (providerId === effectiveComposerProviderId(currentScope)) return;
    scopeGenerationRef.current += 1;
    setAgentModelId(null);
    setAgentReasoningEffort(null);
    draftRestoredModelSelectionsRef.current.set(
      draftScopeIdentity(currentScope.projectId, composerProductMode(currentScope)),
      { modelId: null, reasoningEffort: null },
    );
    markDraftDirty();
    await portsRef.current.session.selectProvider?.(providerId);
  }, []);

  useEffect(() => {
    if (!scope.projectId || !scope.managed || !draftLoadedScopeKey) return;
    const productMode = composerProductMode(scope);
    const key = draftScopeIdentity(scope.projectId, productMode);
    if (key !== draftLoadedScopeKey) return;
    const selectedProviderId = effectiveComposerProviderId(scope);
    const dirtyChanged = draftScheduledRevisionsRef.current.get(key) !== draftDirtyRevision;
    const providerChanged = draftObservedProvidersRef.current.get(key) !== selectedProviderId;
    if (!dirtyChanged && !providerChanged) return;
    const content = composerDraftContent({
      projectId: scope.projectId,
      productMode,
      agentTurnMode,
      agentModelId,
      agentReasoningEffort,
      text: composerText,
      contextRefs: fileRefs,
      attachments,
      skillOverrides: draftSkillOverrides,
      selectedProviderId,
    });
    const fingerprint = composerDraftFingerprint(content);
    if (draftFingerprintsRef.current.get(key) === fingerprint) return;
    draftScheduledRevisionsRef.current.set(key, draftDirtyRevision);
    draftObservedProvidersRef.current.set(key, selectedProviderId);
    draftFingerprintsRef.current.set(key, fingerprint);
    draftSyncOwnerRef.current!.schedule(content);
  }, [
    agentTurnMode,
    agentModelId,
    agentReasoningEffort,
    attachments,
    composerText,
    draftDirtyRevision,
    draftLoadedScopeKey,
    draftSkillOverrides,
    fileRefs,
    scope.managed,
    scope.productMode,
    scope.projectId,
    scope.selectedProviderId,
    scope.conversation?.selectedProviderId,
  ]);

  useEffect(() => {
    if (!draftLoadedScopeKey || scope.conversation || !skillsLoadedIdentity
      || skillsLoadedIdentity !== skillRequestIdentityKey(skillRequestIdentity(scope))) return;
    const known = new Set(skillItems.map((skill) => skill.skillId));
    const unavailable = Object.keys(draftSkillOverrides).filter((skillId) => !known.has(skillId));
    if (unavailable.length === 0) return;
    setDraftSkillOverrides((current) => Object.fromEntries(
      Object.entries(current).filter(([skillId]) => known.has(skillId)),
    ));
    setDraftDiagnostics((current) => [
      ...current.filter((item) => item.code !== "unavailable-skill"),
      {
        code: "unavailable-skill",
        message: "部分已保存的 Skill 当前不可用，已从草稿中停用。",
      },
    ]);
    markDraftDirty();
  }, [draftLoadedScopeKey, draftSkillOverrides, scope, skillItems, skillsLoadedIdentity]);

  useEffect(() => {
    const flush = (): void => { void draftSyncOwnerRef.current?.flushAll(); };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const agentTurnModeDisabledReason = resolveDraftProviderDisabledReason(scope)
    ?? resolveAgentTurnModeDisabledReason(scope, agentTurnMode)
    ?? resolveAgentTurnModelDisabledReason(scope, agentTurnMode, agentModelId, agentReasoningEffort)
    ?? resolveAttachmentCapabilityDisabledReason(scope, attachments);

  const cleanupTransition = useCallback((transition: ComposerTransition): void => {
    scopeGenerationRef.current += 1;
    skillRequestGenerationRef.current += 1;
    const currentScope = scopeRef.current;
    if (currentScope.projectId && currentScope.managed) {
      void draftSyncOwnerRef.current!.flush(currentScope.projectId, composerProductMode(currentScope))
        .catch((cause) => portsRef.current.onError(errorMessage(cause)));
    }
    if (transition === "project-changed") return;
    setDraftSkillOverrides({});
    setFileRefs([]);
    setAttachments([]);
    if (transition === "new-conversation") setComposerText("");
    markDraftDirty();
  }, []);

  const setSelectedFileRefs = useCallback((next: TopicFileReference[]): void => {
    setFileRefs(normalizeComposerRefs(next));
    markDraftDirty();
  }, []);

  const addFileReference = useCallback((ref: TopicFileReference): void => {
    setFileRefs((current) => normalizeComposerRefs([...current, ref]));
    markDraftDirty();
  }, []);

  const toggleSkill = useCallback(async (skillId: string): Promise<void> => {
    const currentScope = scopeRef.current;
    if (!currentScope.projectId) return;
    const currentlyActive = activeComposerSkillIds(
      stateRef.current.skillItems,
      currentScope.conversation?.id ?? null,
      stateRef.current.draftSkillOverrides,
    ).includes(skillId);
    if (!currentScope.conversation) {
      setDraftSkillOverrides((current) => ({ ...current, [skillId]: !currentlyActive }));
      markDraftDirty();
      return;
    }
    const generation = scopeGenerationRef.current;
    const identity = skillRequestIdentity(currentScope);
    const identityKey = skillRequestIdentityKey(identity);
    const ownsCurrentScope = (): boolean => generation === scopeGenerationRef.current
      && identityKey === skillRequestIdentityKey(skillRequestIdentity(scopeRef.current));
    try {
      await (portsRef.current.skills ?? defaultSkillApi).setEnabled(
        identity,
        skillId,
        !currentlyActive,
      );
      if (ownsCurrentScope()) await reloadSkills(currentScope.projectId, identity);
    } catch (cause) {
      if (ownsCurrentScope()) portsRef.current.onError(errorMessage(cause));
      throw cause;
    }
  }, [reloadSkills]);

  const uploadFilesForProject = useCallback(async (projectId: string, files: File[]): Promise<TopicAttachment[]> => {
    const uploaded: TopicAttachment[] = [];
    try {
      for (const file of files) {
        const data = await readFileAsDataUrl(file);
        const attachment = await (portsRef.current.attachments ?? defaultAttachmentApi).upload(projectId, {
          fileName: file.name,
          mediaType: file.type || "application/octet-stream",
          data,
        });
        uploaded.push({ ...attachment, previewUrl: attachment.kind === "image" ? data : undefined });
      }
      return uploaded;
    } catch (cause) {
      await Promise.allSettled(uploaded.map((attachment) => (portsRef.current.attachments ?? defaultAttachmentApi).remove(projectId, attachment.id)));
      throw cause;
    }
  }, []);

  const appendAttachments = useCallback(async (files: File[]): Promise<TopicAttachment[]> => {
    const projectId = scopeRef.current.projectId;
    if (!projectId || files.length === 0) return [];
    const generation = scopeGenerationRef.current;
    try {
      const uploaded = await uploadFilesForProject(projectId, files);
      if (generation !== scopeGenerationRef.current || projectId !== scopeRef.current.projectId) {
        await Promise.allSettled(uploaded.map((attachment) => (portsRef.current.attachments ?? defaultAttachmentApi).remove(projectId, attachment.id)));
        return [];
      }
      setAttachments((current) => mergeTopicAttachments(current, uploaded));
      attachmentSelectionGenerationRef.current += 1;
      markDraftDirty();
      return uploaded;
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
      return [];
    }
  }, [uploadFilesForProject]);

  const removeAttachment = useCallback(async (attachmentId: string): Promise<void> => {
    const projectId = scopeRef.current.projectId;
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    attachmentSelectionGenerationRef.current += 1;
    markDraftDirty();
    if (!projectId) return;
    try {
      await (portsRef.current.attachments ?? defaultAttachmentApi).remove(projectId, attachmentId);
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
    }
  }, []);

  const enqueue = useCallback(async (): Promise<void> => {
    const currentScope = scopeRef.current;
    const queue = portsRef.current.queue;
    const generation = scopeGenerationRef.current;
    const draft = stateRef.current;
    const productMode = composerProductMode(currentScope);
    if (!currentScope.projectId || !currentScope.conversation || !queue) return;
    if (queue.loading || !queue.snapshot) {
      portsRef.current.onError("正在读取当前会话队列，请稍后重试。");
      return;
    }
    if (currentScope.conversation.state !== "active") {
      portsRef.current.onError("已完成或稍后处理的需求对话为只读，不能加入队列。");
      return;
    }
    const attachmentIds = draft.attachments.map((attachment) => attachment.id);
    const attachmentGeneration = attachmentSelectionGenerationRef.current;
    if (!draft.composerText.trim() && attachmentIds.length === 0) return;
    const prepared = prepareComposerInput({
      body: draft.composerText,
      selectedRefs: draft.fileRefs,
      skills: draft.skillItems,
      conversationId: currentScope.conversation.id,
      draftSkillOverrides: draft.draftSkillOverrides,
    });
    const agentTurnMode = draft.agentTurnMode;
    const modelId = draft.agentModelId;
    const reasoningEffort = draft.agentReasoningEffort;
    const providerId = effectiveComposerProviderId(currentScope);
    const selectionError = resolveAgentTurnModeDisabledReason(currentScope, agentTurnMode)
      ?? resolveAgentTurnModelDisabledReason(currentScope, agentTurnMode, modelId, reasoningEffort)
      ?? resolveDraftProviderDisabledReason(currentScope)
      ?? resolveAttachmentCapabilityDisabledReason(currentScope, draft.attachments);
    if (selectionError) {
      portsRef.current.onError(selectionError);
      return;
    }
    if (!providerId) {
      portsRef.current.onError("请先选择本次对话使用的 Agent。");
      return;
    }
    let draftToken: string | null;
    try {
      draftToken = await draftSyncOwnerRef.current!.flush(currentScope.projectId, productMode);
      await queue.enqueue({
        text: prepared.text || defaultAttachmentPrompt(attachmentIds.length),
        contextRefs: prepared.contextRefs,
        attachmentIds,
        skillOverrides: prepared.skillOverrides,
        providerId,
        agentTurnMode: productMode === "agent" ? agentTurnMode : null,
        modelId: productMode === "agent" ? modelId : null,
        reasoningEffort: productMode === "agent" ? reasoningEffort : null,
        expectedDraftUpdatedAt: draftToken,
      });
      await draftSyncOwnerRef.current!.load(currentScope.projectId, productMode);
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
        setComposerText((current) => current === draft.composerText ? "" : current);
        setFileRefs((current) => composerFileRefsEqual(current, draft.fileRefs) ? [] : current);
        if (attachmentSelectionGenerationRef.current === attachmentGeneration) {
          setAttachments((current) => current.map((item) => item.id).join("\0") === attachmentIds.join("\0") ? [] : current);
        }
        setDraftSkillOverrides((current) => composerSkillOverridesEqual(current, draft.draftSkillOverrides) ? {} : current);
        portsRef.current.onError(null);
      }
    } catch (cause) {
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
        portsRef.current.onError(errorMessage(cause));
      }
      throw cause;
    }
  }, []);

  const reclaimQueuedTurn = useCallback(async (queueItemId: string): Promise<void> => {
    const currentScope = scopeRef.current;
    const generation = scopeGenerationRef.current;
    const queue = portsRef.current.queue;
    const draft = stateRef.current;
    if (!currentScope.projectId || !queue || draft.composerText.trim() || draft.fileRefs.length
      || draft.attachments.length || Object.keys(draft.draftSkillOverrides).length) {
      portsRef.current.onError("请先清空当前输入，再把队列项移回输入框。");
      return;
    }
    const productMode = composerProductMode(currentScope);
    const token = await draftSyncOwnerRef.current!.flush(currentScope.projectId, productMode);
    await queue.reclaim(queueItemId, token);
    const restored = await draftSyncOwnerRef.current!.load(currentScope.projectId, productMode);
    if (!restored || !composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) return;
    setComposerText(restored.text);
    setFileRefs(restored.contextRefs);
    setAttachments(restored.attachments);
    setDraftSkillOverrides(restored.skillOverrides);
    if (productMode === "agent") {
      setAgentTurnMode(restored.agentTurnMode ?? "default");
      setAgentModelId(restored.agentModelId);
      setAgentReasoningEffort(restored.agentReasoningEffort);
    }
  }, []);

  const createConversation = useCallback(async (input: CreateConversationComposerInput = {}): Promise<ComposerCreatedConversation | null> => {
    const currentScope = scopeRef.current;
    const generation = scopeGenerationRef.current;
    const capturedProjectId = currentScope.projectId;
    const capturedProductMode = composerProductMode(currentScope);
    const capturedProviderId = effectiveComposerProviderId(currentScope);
    const capturedAgentTurnMode = stateRef.current.agentTurnMode;
    const capturedAgentModelId = stateRef.current.agentModelId;
    const capturedAgentReasoningEffort = stateRef.current.agentReasoningEffort;
    const clientRequestId = (portsRef.current.ids ?? defaultComposerIds).createClientRequestId();
    const body = input.body ?? stateRef.current.composerText;
    const selectedRefs = input.fileRefs ?? stateRef.current.fileRefs;
    const attachmentIds = input.attachmentIds ?? stateRef.current.attachments.map((attachment) => attachment.id);
    const attachmentFiles = input.attachmentFiles ?? [];
    const capturedDraftSkillOverrides = { ...stateRef.current.draftSkillOverrides };
    if (!capturedProjectId || (!body.trim() && attachmentIds.length === 0 && attachmentFiles.length === 0)) return null;
    const turnModeError = resolveAgentTurnModeDisabledReason(currentScope, capturedAgentTurnMode)
      ?? resolveAgentTurnModelDisabledReason(currentScope, capturedAgentTurnMode, capturedAgentModelId, capturedAgentReasoningEffort);
    const draftProviderError = resolveDraftProviderDisabledReason(currentScope);
    if (draftProviderError ?? turnModeError) {
      portsRef.current.onError(draftProviderError ?? turnModeError);
      return null;
    }
    const attachmentCapabilityError = resolveAttachmentCapabilityDisabledReason(currentScope, [
      ...stateRef.current.attachments.filter((attachment) => attachmentIds.includes(attachment.id)),
      ...attachmentFiles.map(topicAttachmentCapabilityProbe),
    ]);
    if (attachmentCapabilityError) {
      portsRef.current.onError(attachmentCapabilityError);
      return null;
    }
    const attachmentGeneration = attachmentSelectionGenerationRef.current;
    const prepared = prepareComposerInput({
      body,
      selectedRefs,
      skills: stateRef.current.skillItems,
      conversationId: null,
      draftSkillOverrides: stateRef.current.draftSkillOverrides,
    });
    const demandBody = prepared.text || defaultAttachmentPrompt(attachmentIds.length + attachmentFiles.length);
    if (currentScope.providerCount > 1 && !currentScope.selectedProviderId) {
      portsRef.current.onError("请先选择本次对话使用的 Agent。");
      return null;
    }
    let capturedDraftToken: string | null;
    try {
      capturedDraftToken = await draftSyncOwnerRef.current!.flush(capturedProjectId, capturedProductMode);
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
      return null;
    }

    const token = portsRef.current.operation.begin("topic.create");
    let uploadedDraft: TopicAttachment[] = [];
    let uploadProjectId: string | null = null;
    let effectiveProjectId: string | null = null;
    let created: ComposerCreatedConversation | null = null;
    try {
      portsRef.current.onError(null);
      effectiveProjectId = await portsRef.current.session.ensureProjectRegistered(capturedProjectId);
      if (!effectiveProjectId) return null;
      uploadProjectId = effectiveProjectId;
      uploadedDraft = await uploadFilesForProject(effectiveProjectId, attachmentFiles);
      created = await portsRef.current.session.createConversation({
        projectId: effectiveProjectId,
        productMode: capturedProductMode,
        clientRequestId,
        body: demandBody,
        contextRefs: prepared.contextRefs,
        attachmentIds: [...attachmentIds, ...uploadedDraft.map((attachment) => attachment.id)],
        providerId: capturedProviderId ?? undefined,
        skillOverrides: normalizeSkillOverrideRecord(prepared.skillOverrides),
        agentTurnMode: capturedProductMode === "agent" ? capturedAgentTurnMode : undefined,
        modelId: capturedProductMode === "agent" ? capturedAgentModelId : undefined,
        reasoningEffort: capturedProductMode === "agent" ? capturedAgentReasoningEffort : undefined,
        showPendingBeforeCreate: attachmentFiles.length === 0,
      });
      uploadedDraft = [];
      try {
        await draftSyncOwnerRef.current!.deleteIfUnchanged(
          capturedProjectId,
          capturedProductMode,
          capturedDraftToken,
        );
      } catch (cause) {
        if (!(cause instanceof ComposerDraftApiConflict)) throw cause;
      }
      const requestProjectIds = [capturedProjectId, effectiveProjectId];
      if (attachmentGeneration === attachmentSelectionGenerationRef.current
        && composerRequestOwnsCurrentScope(generation, requestProjectIds, capturedProductMode, capturedProviderId, scopeGenerationRef, scopeRef, created.conversationId)) {
        setComposerText((current) => current === body ? "" : current);
        setFileRefs((current) => composerFileRefsEqual(current, selectedRefs) ? [] : current);
        setAttachments([]);
        setDraftSkillOverrides((current) => composerSkillOverridesEqual(current, capturedDraftSkillOverrides) ? {} : current);
        await reloadSkills(created.projectId);
        if (composerRequestOwnsCurrentScope(generation, requestProjectIds, capturedProductMode, capturedProviderId, scopeGenerationRef, scopeRef, created.conversationId)) {
          await portsRef.current.projection.refreshConversation(created.projectId, created.conversationId);
        }
      }
      return created;
    } catch (cause) {
      if (composerRequestOwnsCurrentScope(generation, [capturedProjectId, ...(effectiveProjectId ? [effectiveProjectId] : [])], capturedProductMode, capturedProviderId, scopeGenerationRef, scopeRef)) {
        portsRef.current.onError(errorMessage(cause));
      }
      throw cause;
    } finally {
      if (uploadedDraft.length > 0 && uploadProjectId) {
        await Promise.allSettled(uploadedDraft.map((attachment) => (portsRef.current.attachments ?? defaultAttachmentApi).remove(uploadProjectId!, attachment.id)));
      }
      const completedCreation = created;
      if (completedCreation && composerRequestOwnsCurrentScope(generation, [capturedProjectId, completedCreation.projectId], capturedProductMode, capturedProviderId, scopeGenerationRef, scopeRef, completedCreation.conversationId)) {
        await calibrateTimeline(
          completedCreation.projectId,
          completedCreation.conversationId,
          () => composerRequestOwnsCurrentScope(
            generation,
            [capturedProjectId, completedCreation.projectId],
            capturedProductMode,
            capturedProviderId,
            scopeGenerationRef,
            scopeRef,
            completedCreation.conversationId,
          ),
        );
      }
      portsRef.current.operation.release(token);
    }
  }, [reloadSkills, uploadFilesForProject]);

  const send = useCallback(async (): Promise<void> => {
    const currentScope = scopeRef.current;
    const generation = scopeGenerationRef.current;
    const capturedProductMode = composerProductMode(currentScope);
    const capturedAgentTurnMode = stateRef.current.agentTurnMode;
    const capturedAgentModelId = stateRef.current.agentModelId;
    const capturedAgentReasoningEffort = stateRef.current.agentReasoningEffort;
    const draft = stateRef.current;
    const attachmentIds = draft.attachments.map((attachment) => attachment.id);
    const capturedDraftContent = currentScope.projectId
      ? composerDraftContent({
        projectId: currentScope.projectId,
        productMode: capturedProductMode,
        agentTurnMode: capturedAgentTurnMode,
        agentModelId: capturedAgentModelId,
        agentReasoningEffort: capturedAgentReasoningEffort,
        text: draft.composerText,
        contextRefs: draft.fileRefs,
        attachments: draft.attachments,
        skillOverrides: draft.draftSkillOverrides,
        selectedProviderId: effectiveComposerProviderId(currentScope),
      })
      : null;
    const attachmentGeneration = attachmentSelectionGenerationRef.current;
    if (!currentScope.projectId || !currentScope.conversation || (!draft.composerText.trim() && attachmentIds.length === 0)) return;
    const capturedSkillIdentity: SkillRequestIdentity = {
      projectId: currentScope.projectId,
      productMode: capturedProductMode,
      conversationId: currentScope.conversation.id,
      providerId: currentScope.conversation.selectedProviderId ?? null,
    };
    if (currentScope.conversation.productMode
      && currentScope.conversation.productMode !== capturedProductMode) {
      portsRef.current.onError("Conversation productMode does not match the selected application mode.");
      return;
    }
    if (currentScope.conversation.state !== "active") {
      portsRef.current.onError("已完成或稍后处理的需求对话为只读，不能继续发送消息。");
      return;
    }
    const prepared = prepareComposerInput({
      body: draft.composerText,
      selectedRefs: draft.fileRefs,
      skills: draft.skillItems,
      conversationId: currentScope.conversation.id,
      draftSkillOverrides: draft.draftSkillOverrides,
    });
    if (currentScope.running) {
      const steerIdentityReady = capturedProductMode === "harness"
        || Boolean(currentScope.runControlState?.providerId && currentScope.runControlState.attemptId);
      const canSteer = Boolean(prepared.text
        && currentScope.runControlState?.canSteer
        && steerIdentityReady
        && currentScope.runControlState.state !== "stopping"
        && currentScope.runControlState.steerState !== "submitting");
      if (!canSteer) {
        await enqueue();
        return;
      }
      const productMode = composerProductMode(currentScope);
      const steerIdentity = composerStopIdentity(currentScope);
      const retryKey = `${steerIdentity}\0${prepared.text}`;
      const clientRequestId = steerRetryRef.current?.key === retryKey
        ? steerRetryRef.current.clientRequestId
        : (portsRef.current.ids ?? defaultComposerIds).createClientRequestId();
      steerRetryRef.current = { key: retryKey, clientRequestId };
      let capturedDraftToken: string | null;
      try {
        capturedDraftToken = await draftSyncOwnerRef.current!.flush(currentScope.projectId, capturedProductMode);
      } catch (cause) {
        portsRef.current.onError(errorMessage(cause));
        return;
      }
      const outcome = await runAction("conversation.steer", () => portsRef.current.actions.steer({
          projectId: currentScope.projectId!,
          conversationId: currentScope.conversation!.id,
          productMode,
          providerId: currentScope.runControlState?.providerId,
          expectedAttemptId: currentScope.runControlState?.attemptId,
          clientRequestId,
          prompt: prepared.text,
        }), currentScope, draft.composerText, true, (actionGeneration, actionScope) => (
          composerActionOwnsCurrentScope(actionGeneration, actionScope, scopeGenerationRef, scopeRef)
          && composerStopIdentity(scopeRef.current) === steerIdentity
        ), (result) => result.status !== "already-terminal");
      if (outcome.status !== "already-terminal" && capturedDraftContent) {
        try {
          await draftSyncOwnerRef.current!.replaceIfUnchanged(
            { ...capturedDraftContent, text: "" },
            capturedDraftToken,
          );
        } catch (cause) {
          if (!(cause instanceof ComposerDraftApiConflict)) throw cause;
        }
      }
      if (outcome.status === "already-terminal"
        && composerActionOwnsCurrentScope(scopeGenerationRef.current, currentScope, scopeGenerationRef, scopeRef)
        && composerStopIdentity(scopeRef.current) === steerIdentity) {
        portsRef.current.onError("当前执行已结束，这条文本已保留，可作为下一回合发送。");
      }
      if (steerRetryRef.current?.key === retryKey) steerRetryRef.current = null;
      return;
    }
    if (portsRef.current.queue?.snapshot?.items?.length) {
      await enqueue();
      return;
    }
    if (portsRef.current.queue && !portsRef.current.queue.snapshot) {
      portsRef.current.onError("当前会话队列状态不可用，校准完成前不能发送新的回合。");
      return;
    }
    if (!prepared.text && attachmentIds.length === 0) {
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
        setComposerText("");
        setFileRefs([]);
      }
      return;
    }
    const outboundMessage = prepared.text || defaultAttachmentPrompt(attachmentIds.length);
    const turnModeError = resolveAgentTurnModeDisabledReason(currentScope, capturedAgentTurnMode)
      ?? resolveAgentTurnModelDisabledReason(currentScope, capturedAgentTurnMode, capturedAgentModelId, capturedAgentReasoningEffort);
    const draftProviderError = resolveDraftProviderDisabledReason(currentScope);
    if (draftProviderError ?? turnModeError) {
      portsRef.current.onError(draftProviderError ?? turnModeError);
      return;
    }
    const attachmentCapabilityError = resolveAttachmentCapabilityDisabledReason(currentScope, draft.attachments);
    if (attachmentCapabilityError) {
      portsRef.current.onError(attachmentCapabilityError);
      return;
    }
    let capturedDraftToken: string | null;
    try {
      capturedDraftToken = await draftSyncOwnerRef.current!.flush(currentScope.projectId, capturedProductMode);
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
      return;
    }
    await applySkillOverrides(capturedSkillIdentity, prepared.skillOverrides);
    if (Object.keys(prepared.skillOverrides).length > 0) {
      await reloadSkills(capturedSkillIdentity.projectId, capturedSkillIdentity);
    }

    const token = portsRef.current.operation.begin("chat.ask");
    if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
      setComposerText("");
      portsRef.current.onError(null);
    }
    try {
      const request: ComposerMessageRequest = {
        projectId: currentScope.projectId,
        productMode: capturedProductMode,
        conversationId: currentScope.conversation.id,
        message: outboundMessage,
        contextRefs: prepared.contextRefs,
        attachmentIds,
        providerId: currentScope.selectedProviderId ?? currentScope.conversation.selectedProviderId,
        providerSwitchIntent: currentScope.selectedProviderId && currentScope.selectedProviderId !== currentScope.conversation.selectedProviderId
          ? "resume-workflow"
          : undefined,
        agentTurnMode: capturedProductMode === "agent" ? capturedAgentTurnMode : undefined,
        modelId: capturedProductMode === "agent" ? capturedAgentModelId : undefined,
        reasoningEffort: capturedProductMode === "agent" ? capturedAgentReasoningEffort : undefined,
      };
      await (portsRef.current.actions.sendMessage
        ?? ((input: ComposerMessageRequest) => sendComposerMessage(input, (projectId, event) => {
          const active = scopeRef.current;
          if (active.projectId === projectId
            && composerProductMode(active) === input.productMode
            && active.conversation?.id === input.conversationId
            && generation === scopeGenerationRef.current
            && workbenchEventMatchesConversation(event, input)) {
            portsRef.current.projection.routeEvent?.(projectId, event);
          }
        })))(request);
      if (capturedDraftContent) {
        try {
          await draftSyncOwnerRef.current!.replaceIfUnchanged({
            ...capturedDraftContent,
            text: "",
            contextRefs: [],
            attachmentIds: [],
            skillOverrides: {},
          }, capturedDraftToken);
        } catch (cause) {
          if (!(cause instanceof ComposerDraftApiConflict)) throw cause;
        }
      }
      if (attachmentGeneration === attachmentSelectionGenerationRef.current
        && composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
        setFileRefs([]);
        setAttachments([]);
      }
    } catch (cause) {
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
        setComposerText((current) => current ? current : draft.composerText);
        portsRef.current.onError(errorMessage(cause));
      }
      throw cause;
    } finally {
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
        await calibrateTimeline(
          currentScope.projectId,
          currentScope.conversation.id,
          () => composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef),
        );
      }
      portsRef.current.operation.release(token);
    }
  }, [reloadSkills]);

  const stop = useCallback(async (): Promise<void> => {
    const currentScope = scopeRef.current;
    if (!currentScope.projectId || !currentScope.conversation) return;
    const submittedText = stateRef.current.composerText;
    const productMode = composerProductMode(currentScope);
    if (productMode === "agent"
      && (!currentScope.runControlState?.canStop
        || !currentScope.runControlState.providerId
        || !currentScope.runControlState.attemptId)) {
      portsRef.current.onError("当前 Agent 回合没有可验证的停止身份，请刷新后重试。");
      return;
    }
    const stopIdentity = composerStopIdentity(currentScope);
    await runAction("conversation.interrupt", () => portsRef.current.actions.stop({
      projectId: currentScope.projectId!,
      conversationId: currentScope.conversation!.id,
      productMode,
      ...(productMode === "agent" ? {
        providerId: currentScope.runControlState!.providerId,
        expectedAttemptId: currentScope.runControlState!.attemptId,
      } : { prompt: submittedText.trim() || undefined }),
    }), currentScope, submittedText, productMode !== "agent", (generation, actionScope) => (
      composerActionOwnsCurrentScope(generation, actionScope, scopeGenerationRef, scopeRef)
      && composerStopIdentity(scopeRef.current) === stopIdentity
    ));
  }, []);

  async function applySkillOverrides(identity: SkillRequestIdentity, overrides: Record<string, boolean>): Promise<void> {
    for (const [skillId, enabled] of Object.entries(overrides)) {
      await (portsRef.current.skills ?? defaultSkillApi).setEnabled(identity, skillId, enabled);
    }
  }

  async function calibrateTimeline(
    projectId: string,
    conversationId: string,
    canPublishError: () => boolean,
  ): Promise<void> {
    try {
      await portsRef.current.timeline.calibrate(projectId, conversationId, "main-agent");
    } catch (cause) {
      if (canPublishError()) portsRef.current.onError(errorMessage(cause));
    }
  }

  async function runAction<TResult>(
    key: string,
    action: () => Promise<TResult>,
    actionScope: ConversationComposerScope,
    submittedText: string,
    clearSubmittedText: boolean,
    ownsCurrentScope: (generation: number, actionScope: ConversationComposerScope) => boolean = (
      generation,
      actionScope,
    ) => composerActionOwnsCurrentScope(generation, actionScope, scopeGenerationRef, scopeRef),
    shouldClearSubmittedText: (result: TResult) => boolean = () => true,
  ): Promise<TResult> {
    const token = portsRef.current.operation.begin(key);
    const generation = scopeGenerationRef.current;
    if (ownsCurrentScope(generation, actionScope)) {
      portsRef.current.onError(null);
    }
    try {
      const result = await action();
      if (clearSubmittedText && shouldClearSubmittedText(result) && ownsCurrentScope(generation, actionScope)) {
        setComposerText((current) => current === submittedText ? "" : current);
      }
      return result;
    } catch (cause) {
      if (ownsCurrentScope(generation, actionScope)) {
        portsRef.current.onError(errorMessage(cause));
      }
      throw cause;
    } finally {
      if (actionScope.projectId && actionScope.conversation
        && ownsCurrentScope(generation, actionScope)) {
        await calibrateTimeline(
          actionScope.projectId,
          actionScope.conversation.id,
          () => ownsCurrentScope(generation, actionScope),
        );
      }
      portsRef.current.operation.release(token);
    }
  }

  return {
    composerText,
    setComposerText: (next: string | ((current: string) => string)) => {
      setComposerText(next);
      markDraftDirty();
    },
    skillItems,
    activeSkillIds,
    enabledSkillCount: activeSkillIds.length,
    draftSkillOverrides,
    fileRefs,
    setFileRefs: setSelectedFileRefs,
    addFileReference,
    attachments,
    draftDiagnostics,
    agentTurnMode,
    agentModelId,
    agentReasoningEffort,
    selectAgentTurnMode,
    selectAgentModel,
    selectAgentReasoningEffort,
    selectProvider,
    agentTurnModeDisabledReason,
    setAttachments: (next: TopicAttachment[] | ((current: TopicAttachment[]) => TopicAttachment[])) => {
      attachmentSelectionGenerationRef.current += 1;
      setAttachments(next);
      markDraftDirty();
    },
    reloadSkills,
    toggleSkill,
    appendAttachments,
    removeAttachment,
    createConversation,
    enqueue,
    reclaimQueuedTurn,
    send,
    stop,
    cleanupTransition,
  };
}

export function prepareComposerInput(input: {
  body: string;
  selectedRefs: TopicFileReference[];
  skills: SkillListItem[];
  conversationId: string | null;
  draftSkillOverrides: Record<string, boolean>;
}): PreparedComposerInput {
  const fileExtraction = extractInlineFileMentions(input.body, input.selectedRefs);
  const skillExtraction = extractInlineSkillMentions(fileExtraction.cleanedText, input.skills);
  const skillOverrides = input.conversationId ? {} : { ...input.draftSkillOverrides };
  for (const skillId of skillExtraction.skillIds) skillOverrides[skillId] = true;
  return {
    text: skillExtraction.cleanedText.trim(),
    contextRefs: normalizeComposerRefs(fileExtraction.refs),
    skillOverrides,
  };
}

export function activeComposerSkillIds(
  skills: SkillListItem[],
  conversationId: string | null,
  draftOverrides: Record<string, boolean>,
): string[] {
  return skills
    .filter((skill) => {
      if (!skill.providerEnabled || skill.required || skill.runtimeAssigned) return false;
      if (conversationId) {
        if (skill.disabledTopics.includes(conversationId)) return false;
        return skill.enabledProject || skill.enabledTopics.includes(conversationId);
      }
      return draftOverrides[skill.skillId] ?? skill.enabledProject;
    })
    .map((skill) => skill.skillId);
}

export function normalizeComposerRefs(refs: TopicFileReference[]): TopicFileReference[] {
  const seen = new Set<string>();
  const result: TopicFileReference[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.relativePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...ref, source: "composer" });
  }
  return result;
}

export function normalizeSkillOverrideRecord(overrides: Record<string, boolean>): ComposerSkillOverride[] {
  return Object.entries(overrides)
    .map(([skillId, enabled]) => ({ skillId: skillId.trim(), enabled }))
    .filter((override) => override.skillId.length > 0)
    .sort((left, right) => left.skillId.localeCompare(right.skillId));
}

function composerDraftContent(input: {
  projectId: string;
  productMode: ProductMode;
  agentTurnMode: AgentTurnMode;
  agentModelId: string | null;
  agentReasoningEffort: string | null;
  text: string;
  contextRefs: TopicFileReference[];
  attachments: TopicAttachment[];
  skillOverrides: Record<string, boolean>;
  selectedProviderId: string | null;
}): ComposerDraftContent {
  return {
    projectId: input.projectId,
    productMode: input.productMode,
    agentTurnMode: input.productMode === "agent" ? input.agentTurnMode : null,
    agentModelId: input.productMode === "agent" ? input.agentModelId : null,
    agentReasoningEffort: input.productMode === "agent" ? input.agentReasoningEffort : null,
    text: input.text,
    contextRefs: normalizeComposerRefs(input.contextRefs),
    attachmentIds: [...new Set(input.attachments.map((attachment) => attachment.id))],
    skillOverrides: Object.fromEntries(Object.entries(input.skillOverrides).sort(([left], [right]) => left.localeCompare(right))),
    selectedProviderId: input.selectedProviderId,
  };
}

function contentFromSnapshot(snapshot: ComposerDraftSnapshot): ComposerDraftContent {
  return {
    projectId: snapshot.projectId,
    productMode: snapshot.productMode,
    agentTurnMode: snapshot.agentTurnMode,
    agentModelId: snapshot.agentModelId,
    agentReasoningEffort: snapshot.agentReasoningEffort,
    text: snapshot.text,
    contextRefs: snapshot.contextRefs,
    attachmentIds: snapshot.attachments.map((attachment) => attachment.id),
    skillOverrides: snapshot.skillOverrides,
    selectedProviderId: snapshot.selectedProviderId,
  };
}

function composerDraftFingerprint(content: ComposerDraftContent): string {
  return JSON.stringify(content);
}

function composerFileRefsEqual(left: TopicFileReference[], right: TopicFileReference[]): boolean {
  return JSON.stringify(normalizeComposerRefs(left)) === JSON.stringify(normalizeComposerRefs(right));
}

function composerSkillOverridesEqual(left: Record<string, boolean>, right: Record<string, boolean>): boolean {
  return JSON.stringify(Object.entries(left).sort(([a], [b]) => a.localeCompare(b)))
    === JSON.stringify(Object.entries(right).sort(([a], [b]) => a.localeCompare(b)));
}

function draftScopeIdentity(projectId: string | null, productMode: ProductMode): string {
  return `${projectId ?? ""}\0${productMode}`;
}

function parseDraftScopeIdentity(identity: string): [string, ProductMode] {
  const [projectId = "", productMode = "harness"] = identity.split("\0");
  return [projectId, productMode === "agent" ? "agent" : "harness"];
}

export function defaultAttachmentPrompt(count: number): string {
  return count === 1
    ? "请先查看我附上的文件，然后根据附件内容继续。"
    : "请先查看我附上的文件，然后根据这些附件内容继续。";
}

const defaultSkillApi = {
  async load(identity: SkillRequestIdentity): Promise<SkillListItem[]> {
    const params = skillRequestSearchParams(identity);
    const payload = await fetchJson<{ skills?: SkillListItem[] }>(`/api/projects/${encodeURIComponent(identity.projectId)}/skills?${params.toString()}`);
    return Array.isArray(payload.skills) ? payload.skills : [];
  },
  async setEnabled(identity: SkillRequestIdentity, skillId: string, enabled: boolean): Promise<void> {
    await postJson(`/api/projects/${encodeURIComponent(identity.projectId)}/skills/${encodeURIComponent(skillId)}/enable`, {
      enabled,
      productMode: identity.productMode,
      conversationId: identity.conversationId ?? undefined,
      providerId: identity.providerId ?? undefined,
    });
  },
};

export function skillRequestIdentity(scope: ConversationComposerScope): SkillRequestIdentity {
  return {
    projectId: scope.projectId ?? "",
    productMode: composerProductMode(scope),
    conversationId: scope.conversation?.id ?? null,
    providerId: scope.conversation?.selectedProviderId ?? scope.selectedProviderId,
  };
}

export function skillRequestIdentityKey(identity: SkillRequestIdentity): string {
  return [identity.projectId, identity.productMode, identity.conversationId ?? "", identity.providerId ?? ""].join("\0");
}

function skillRequestSearchParams(identity: SkillRequestIdentity): URLSearchParams {
  const params = new URLSearchParams({ productMode: identity.productMode });
  if (identity.conversationId) params.set("conversationId", identity.conversationId);
  if (identity.providerId) params.set("providerId", identity.providerId);
  return params;
}

const defaultAttachmentApi = {
  async upload(projectId: string, upload: ComposerAttachmentUpload): Promise<TopicAttachment> {
    return (
      await postJson<{ attachment: TopicAttachment }>(
        `/api/projects/${encodeURIComponent(projectId)}/attachments`,
        upload,
      )
    ).attachment;
  },
  async remove(projectId: string, attachmentId: string): Promise<void> {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" },
    );
    if (!response.ok) throw new Error(await response.text());
  },
};

async function sendComposerMessage(
  request: ComposerMessageRequest,
  routeEvent?: (projectId: string, event: WorkbenchLiveEvent) => void,
): Promise<void> {
  await consumeWorkbenchLiveStream<WorkbenchLiveEvent>(
    `/api/projects/${encodeURIComponent(request.projectId)}/workbench/topics/${encodeURIComponent(request.conversationId)}/messages/live`,
    {
      mode: "chat",
      message: request.message,
      contextRefs: request.contextRefs,
      attachmentIds: request.attachmentIds,
      providerId: request.providerId,
      providerSwitchIntent: request.providerSwitchIntent,
      productMode: request.productMode,
      agentTurnMode: request.agentTurnMode,
      modelId: request.modelId,
      reasoningEffort: request.reasoningEffort,
    },
    (event) => routeEvent?.(request.projectId, event),
  );
}

function composerProductMode(scope: ConversationComposerScope): ProductMode {
  return scope.productMode ?? scope.conversation?.productMode ?? "harness";
}

function composerScopeIdentity(scope: ConversationComposerScope): string {
  return skillRequestIdentityKey(skillRequestIdentity(scope));
}

function composerStopIdentity(scope: ConversationComposerScope): string {
  return [
    composerScopeIdentity(scope),
    scope.runControlState?.providerId ?? "",
    scope.runControlState?.attemptId ?? "",
  ].join("\0");
}

function initialAgentTurnMode(scope: ConversationComposerScope): AgentTurnMode {
  return composerProductMode(scope) === "agent"
    ? scope.conversation?.agentTurnMode ?? "default"
    : "default";
}

function initialAgentModelId(scope: ConversationComposerScope): string | null {
  return composerProductMode(scope) === "agent" ? scope.conversation?.agentModelId ?? null : null;
}

function initialAgentReasoningEffort(scope: ConversationComposerScope): string | null {
  return composerProductMode(scope) === "agent" ? scope.conversation?.agentReasoningEffort ?? null : null;
}

export function resolveAgentTurnModeDisabledReason(
  scope: ConversationComposerScope,
  agentTurnMode: AgentTurnMode,
): string | null {
  if (composerProductMode(scope) !== "agent" || agentTurnMode === "default" || scope.running) return null;
  if (scope.providerCapabilitiesLoading) return "正在检查当前 Agent 是否支持 Plan 模式。";
  if (scope.providerCapabilitiesError) return `无法确认 Plan 模式能力：${scope.providerCapabilitiesError}`;
  const providerId = effectiveComposerProviderId(scope);
  if (!providerId) return "请先选择支持 Plan 模式的 Agent。";
  const snapshot = scope.providerCapabilities?.find((candidate) => candidate.providerId === providerId);
  const plan = snapshot?.capabilities.find((capability) => capability.key === "turn.plan");
  if (!snapshot || plan?.runtime !== "ready") {
    return plan?.reason ?? "当前 Agent 不支持 Plan 模式。";
  }
  return null;
}

export function resolveAgentTurnModelDisabledReason(
  scope: ConversationComposerScope,
  agentTurnMode: AgentTurnMode,
  modelId: string | null,
  reasoningEffort: string | null,
): string | null {
  if (composerProductMode(scope) !== "agent" || scope.running) return null;
  const providerId = effectiveComposerProviderId(scope);
  if (!providerId) {
    return agentTurnMode === "plan" || modelId || reasoningEffort
      ? "请先选择本次 Turn 使用的 Agent。"
      : null;
  }
  const snapshot = scope.providerModelSettings;
  if (!snapshot || snapshot.providerId !== providerId) return "正在读取当前 Agent 的模型目录。";
  const candidate = resolveSelectedModelCandidate(snapshot, modelId);
  if (modelId && !candidate) return "已选择的模型当前不可用，请重新选择后再发送。";
  const resolvedModelId = modelId ?? snapshot.effectiveModel?.modelId ?? null;
  if (agentTurnMode === "plan" && !resolvedModelId) return "Plan 模式需要当前 Agent 解析出有效模型。";
  if (reasoningEffort) {
    if (!candidate) return "显式推理强度需要先解析出可验证的模型。";
    if (candidate.supportedReasoningEfforts.length === 0) return "当前模型没有可验证的推理强度选项，请使用模型默认值。";
    if (!candidate.supportedReasoningEfforts.some((option) => option.value === reasoningEffort)) {
      return "已选择的推理强度不再受当前模型支持，请重新选择。";
    }
  }
  return null;
}

function resolveSelectedModelCandidate(
  snapshot: ProviderModelSettingsSnapshot | null | undefined,
  modelId: string | null,
): ProviderModelSettingsSnapshot["candidates"][number] | null {
  if (!snapshot) return null;
  const resolved = modelId ?? snapshot.effectiveModel?.modelId ?? null;
  if (!resolved) return null;
  return snapshot.candidates.find((candidate) => candidate.modelId.toLowerCase() === resolved.toLowerCase()) ?? null;
}

function normalizeNullableSelection(value: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveDraftProviderDisabledReason(scope: ConversationComposerScope): string | null {
  const providerId = effectiveComposerProviderId(scope);
  if (!providerId || scope.providerCapabilitiesLoading || scope.running) return null;
  if (scope.providerCapabilitiesError) return `无法确认已选择的 Agent：${scope.providerCapabilitiesError}`;
  if (!scope.providerCapabilities) return null;
  if (!scope.providerCapabilities?.some((candidate) => candidate.providerId === providerId)) {
    return "已保存的 Agent 当前不可用，请重新选择后再发送。";
  }
  return null;
}

export function resolveAttachmentCapabilityDisabledReason(
  scope: ConversationComposerScope,
  attachments: readonly Pick<TopicAttachment, "kind">[],
): string | null {
  if (composerProductMode(scope) !== "agent" || attachments.length === 0 || scope.running) return null;
  if (scope.providerCapabilitiesLoading) return "正在检查当前 Agent 是否支持附件输入。";
  if (scope.providerCapabilitiesError) return `无法确认附件能力：${scope.providerCapabilitiesError}`;
  const providerId = effectiveComposerProviderId(scope);
  if (!providerId) return "请先选择支持附件输入的 Agent。";
  const snapshot = scope.providerCapabilities?.find((candidate) => candidate.providerId === providerId);
  if (!snapshot) return "无法确认当前 Agent 的附件能力。";
  const readiness = new Map(snapshot.capabilities.map((capability) => [capability.key, capability]));
  if (attachments.some((attachment) => attachment.kind === "image") && readiness.get("image.input")?.runtime !== "ready") {
    return readiness.get("image.input")?.reason ?? "当前 Agent 不支持图片输入。";
  }
  if (attachments.some((attachment) => attachment.kind === "text") && readiness.get("file.reference")?.runtime !== "ready") {
    return readiness.get("file.reference")?.reason ?? "当前 Agent 不支持文件引用。";
  }
  return null;
}

function topicAttachmentCapabilityProbe(file: File): Pick<TopicAttachment, "kind"> {
  const image = file.type.startsWith("image/");
  return { kind: image ? "image" : "text" };
}

function effectiveComposerProviderId(scope: ConversationComposerScope): string | null {
  return scope.selectedProviderId
    ?? scope.conversation?.selectedProviderId
    ?? (scope.providerCount === 1 ? scope.providerCapabilities?.[0]?.providerId ?? null : null);
}

export function workbenchEventMatchesConversation(
  event: WorkbenchLiveEvent,
  expected: Pick<ComposerMessageRequest, "projectId" | "productMode" | "conversationId">,
): boolean {
  const data = event.data as Record<string, unknown>;
  const nestedConversation = data.conversation && typeof data.conversation === "object"
    ? data.conversation as Record<string, unknown>
    : null;
  const center = data.center && typeof data.center === "object"
    ? data.center as Record<string, unknown>
    : null;
  const selectedTopic = center?.selectedTopic && typeof center.selectedTopic === "object"
    ? center.selectedTopic as Record<string, unknown>
    : null;
  const projectId = typeof data.projectId === "string" ? data.projectId : expected.projectId;
  const productMode = data.productMode === "agent" || data.productMode === "harness" ? data.productMode : undefined;
  const effectiveProductMode = productMode
    ?? (nestedConversation?.productMode === "agent" || nestedConversation?.productMode === "harness"
      ? nestedConversation.productMode
      : selectedTopic?.productMode === "agent" || selectedTopic?.productMode === "harness"
        ? selectedTopic.productMode
        : undefined);
  const conversationId = typeof data.conversationId === "string"
    ? data.conversationId
    : typeof nestedConversation?.id === "string"
      ? nestedConversation.id
      : typeof selectedTopic?.id === "string"
        ? selectedTopic.id
        : undefined;
  return projectId === expected.projectId
    && effectiveProductMode === expected.productMode
    && conversationId === expected.conversationId;
}

function composerRequestOwnsCurrentScope(
  generation: number,
  projectIds: readonly string[],
  productMode: ProductMode,
  providerId: string | null,
  generationRef: { current: number },
  currentScopeRef: { current: ConversationComposerScope },
  committedConversationId?: string,
): boolean {
  const currentScope = currentScopeRef.current;
  const committedSingleProviderDefault = providerId === null
    && Boolean(committedConversationId)
    && currentScope.conversation?.id === committedConversationId
    && currentScope.providerCount === 1;
  return (generation === generationRef.current
      || Boolean(committedConversationId && currentScope.conversation?.id === committedConversationId))
    && currentScope.projectId !== null
    && projectIds.includes(currentScope.projectId)
    && composerProductMode(currentScope) === productMode
    && (effectiveComposerProviderId(currentScope) === providerId || committedSingleProviderDefault);
}

function composerActionOwnsCurrentScope(
  generation: number,
  actionScope: ConversationComposerScope,
  generationRef: { current: number },
  currentScopeRef: { current: ConversationComposerScope },
): boolean {
  return generation === generationRef.current
    && composerScopeIdentity(actionScope) === composerScopeIdentity(currentScopeRef.current);
}

const defaultComposerIds = {
  createClientRequestId(): string {
    return globalThis.crypto?.randomUUID?.()
      ?? `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  },
};

function mergeTopicAttachments(current: TopicAttachment[], next: TopicAttachment[]): TopicAttachment[] {
  const seen = new Set(current.map((attachment) => attachment.id));
  return [...current, ...next.filter((attachment) => {
    if (seen.has(attachment.id)) return false;
    seen.add(attachment.id);
    return true;
  })];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment."));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Attachment reader did not return a data URL."));
    reader.readAsDataURL(file);
  });
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
