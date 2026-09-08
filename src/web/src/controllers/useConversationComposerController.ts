import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, postJson } from "../api.js";
import {
  createDraftSubmissionSnapshot,
  type ComposerAttachmentUpload,
  type ComposerCreateConversationRequest,
  type ComposerCreatedConversation,
  type ComposerMessageRequest,
  type ComposerSkillOverride,
} from "./conversation-submission-contract.js";
import { userFacingErrorMessage } from "../presentation/user-facing-language.js";
import { extractInlineFileMentions } from "../shell/file-mentions.js";
import { extractInlineSkillMentions } from "../shell/skill-mentions.js";
import type { AgentTurnMode, ComposerDraftDiagnostic, ComposerDraftSnapshot, ConversationTurnQueueSnapshot, ProductMode, ProviderCapabilitySnapshot, ProviderModelSettingsSnapshot, SkillListItem, TopicAttachment, TopicFileReference, WorkbenchLiveEvent } from "../types.js";
import type { ConversationTurnQueueEnqueueInput } from "./conversation-turn-queue-contract.js";
import type { WorkbenchOperationToken } from "./useGlobalOperationGate.js";
import type { ConversationSteerOutcome } from "./useConversationActionController.js";
import {
  ComposerDraftSyncOwner,
  defaultComposerDraftApi,
  type ComposerDraftApi,
  type ComposerDraftContent,
  type ComposerDraftSettlementOptions,
} from "./ComposerDraftSyncOwner.js";
import {
  ConversationDraftController,
  type ConversationDraftViewModel,
} from "./ConversationDraftController.js";
import {
  ConversationTurnSubmissionController,
  type PendingConversationSubmission,
} from "./ConversationTurnSubmissionController.js";
import { projectComposerModelLabel } from "./ComposerExperienceProjection.js";
import { createConversationSubmissionPorts } from "./ConversationSubmissionComposition.js";

export type {
  ComposerAttachmentUpload,
  ComposerCreateConversationRequest,
  ComposerCreatedConversation,
  ComposerMessageRequest,
  ComposerSkillOverride,
} from "./conversation-submission-contract.js";

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
  projectRegistered: boolean;
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

export interface SkillRequestIdentity {
  projectId: string;
  productMode: ProductMode;
  conversationId: string | null;
  providerId: string | null;
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

export interface ConversationComposerPorts {
  operation: {
    begin(key: string): WorkbenchOperationToken;
    release(token: WorkbenchOperationToken): void;
  };
  session: {
    ensureProjectRegistered(projectId: string): Promise<string | null>;
    createConversation(request: ComposerCreateConversationRequest): Promise<ComposerCreatedConversation>;
    beginPendingConversation?(input: {
      id: string;
      projectId: string;
      productMode: ProductMode;
      clientRequestId: string;
      title: string;
      body: string;
      selectedProviderId?: string;
    }): void;
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
    showPending?(scope: { projectId: string; productMode: ProductMode; conversationId: string }, clientRequestId: string, text: string): void;
    markPending?(scope: { projectId: string; productMode: ProductMode; conversationId: string }, clientRequestId: string, state: "sending" | "uncertain" | "failed", failure?: string): void;
    consumePending?(scope: { projectId: string; productMode: ProductMode; conversationId: string }, clientRequestId: string): void;
    rekeyPending?(from: { projectId: string; productMode: ProductMode; conversationId: string }, to: { projectId: string; productMode: ProductMode; conversationId: string }, clientRequestId: string): void;
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
  const writeAgentTurnMode = (value: AgentTurnMode): void => {
    stateRef.current = { ...stateRef.current, agentTurnMode: value };
    setAgentTurnMode(value);
  };
  const writeAgentModelId = (value: string | null): void => {
    stateRef.current = { ...stateRef.current, agentModelId: value };
    setAgentModelId(value);
  };
  const writeAgentReasoningEffort = (value: string | null): void => {
    stateRef.current = { ...stateRef.current, agentReasoningEffort: value };
    setAgentReasoningEffort(value);
  };
  const draftSyncOwnerRef = useRef<ComposerDraftSyncOwner | null>(null);
  const draftControllerRef = useRef<ConversationDraftController | null>(null);
  const submissionOwnerRef = useRef<ConversationTurnSubmissionController | null>(null);
  if (!draftSyncOwnerRef.current) {
    draftSyncOwnerRef.current = new ComposerDraftSyncOwner(
      ports.drafts ?? defaultComposerDraftApi,
      (message) => portsRef.current.onError(message),
    );
  }
  if (!draftControllerRef.current) {
    draftControllerRef.current = new ConversationDraftController({
      read: () => conversationDraftViewModel(stateRef.current),
      setText: setComposerText,
      setContextRefs: setFileRefs,
      setAttachments,
      setSkillOverrides: setDraftSkillOverrides,
      setAgentTurnMode: writeAgentTurnMode,
      setModelId: writeAgentModelId,
      setReasoningEffort: writeAgentReasoningEffort,
      markDirty: markDraftDirty,
    });
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
    if (!projectId || !scopeRef.current.projectRegistered) {
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
  }, [reloadSkills, scope.projectRegistered, scope.productMode, scope.projectId, scope.conversation?.id, scope.conversation?.productMode, scope.conversation?.selectedProviderId, scope.selectedProviderId]);

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
    const loadIdentity = scope.projectId && scope.projectRegistered ? ownerIdentity : null;
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
    const restoredMode = draftRestoredModesRef.current.get(ownerIdentity);
    const restoredModelSelection = draftRestoredModelSelectionsRef.current.get(ownerIdentity);
    const immediate = storedConversationMode
      ?? restoredMode
      ?? confirmedTurnModesRef.current.get(ownerIdentity)
      ?? initialAgentTurnMode(scope);
    if (ownerChanged || !loadIdentity) {
      writeAgentTurnMode(immediate);
      writeAgentModelId(restoredModelSelection
        ? restoredModelSelection.modelId
        : storedConversationMode ? scope.conversation?.agentModelId ?? null : null);
      writeAgentReasoningEffort(restoredModelSelection
        ? restoredModelSelection.reasoningEffort
        : storedConversationMode ? scope.conversation?.agentReasoningEffort ?? null : null);
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
        writeAgentTurnMode(productMode === "agent" && currentConversation
          ? currentConversation.agentTurnMode ?? "default"
          : draftMode);
        writeAgentModelId(draftModelSelection.modelId);
        writeAgentReasoningEffort(draftModelSelection.reasoningEffort);
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
  }, [scope.productMode, scope.projectId, scope.projectRegistered]);

  useEffect(() => {
    const productMode = composerProductMode(scope);
    if (productMode !== "agent") {
      writeAgentTurnMode("default");
      return;
    }
    if (scope.conversation) {
      writeAgentTurnMode(scope.conversation.agentTurnMode ?? "default");
      return;
    }
    const restored = draftRestoredModesRef.current.get(draftScopeIdentity(scope.projectId, productMode));
    if (restored) writeAgentTurnMode(restored);
  }, [scope.conversation?.agentTurnMode, scope.conversation?.id, scope.productMode, scope.projectId]);

  useEffect(() => {
    const productMode = composerProductMode(scope);
    if (productMode !== "agent") {
      writeAgentModelId(null);
      writeAgentReasoningEffort(null);
      return;
    }
    const restored = draftRestoredModelSelectionsRef.current.get(draftScopeIdentity(scope.projectId, productMode));
    if (restored) {
      writeAgentModelId(restored.modelId);
      writeAgentReasoningEffort(restored.reasoningEffort);
      return;
    }
    if (scope.conversation) {
      writeAgentModelId(scope.conversation.agentModelId ?? null);
      writeAgentReasoningEffort(scope.conversation.agentReasoningEffort ?? null);
    }
  }, [scope.conversation?.agentModelId, scope.conversation?.agentReasoningEffort, scope.conversation?.id, scope.productMode, scope.projectId]);

  const selectAgentTurnMode = useCallback(async (nextMode: AgentTurnMode): Promise<void> => {
    const currentScope = scopeRef.current;
    if (composerProductMode(currentScope) !== "agent") return;
    if (stateRef.current.agentTurnMode === nextMode) return;
    confirmedTurnModesRef.current.set(draftScopeIdentity(currentScope.projectId, composerProductMode(currentScope)), nextMode);
    draftRestoredModesRef.current.set(draftScopeIdentity(currentScope.projectId, composerProductMode(currentScope)), nextMode);
    writeAgentTurnMode(nextMode);
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
    writeAgentModelId(normalized);
    writeAgentReasoningEffort(nextEffort);
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
    writeAgentReasoningEffort(normalized);
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
    writeAgentModelId(null);
    writeAgentReasoningEffort(null);
    draftRestoredModelSelectionsRef.current.set(
      draftScopeIdentity(currentScope.projectId, composerProductMode(currentScope)),
      { modelId: null, reasoningEffort: null },
    );
    markDraftDirty();
    await portsRef.current.session.selectProvider?.(providerId);
  }, []);

  useEffect(() => {
    if (!scope.projectId || !scope.projectRegistered || !draftLoadedScopeKey) return;
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
    scope.projectRegistered,
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
        message: "部分已保存的技能当前不可用，已从草稿中停用。",
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
  const modelLabel = projectComposerModelLabel({
    productMode: composerProductMode(scope),
    composerModelId: agentModelId,
    savedConversationModelId: scope.conversation?.agentModelId ?? null,
    modelSettings: scope.providerModelSettings ?? null,
  });

  const cleanupTransition = useCallback((transition: ComposerTransition): void => {
    scopeGenerationRef.current += 1;
    skillRequestGenerationRef.current += 1;
    const currentScope = scopeRef.current;
    if (currentScope.projectId && currentScope.projectRegistered) {
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
    const currentState = stateRef.current;
    const draft = draftControllerRef.current!.read();
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
    if (!draft.text.trim() && attachmentIds.length === 0) return;
    const prepared = prepareComposerInput({
      body: draft.text,
      selectedRefs: draft.contextRefs,
      skills: currentState.skillItems,
      conversationId: currentScope.conversation.id,
      draftSkillOverrides: draft.skillOverrides,
    });
    const agentTurnMode = draft.agentTurnMode;
    const modelId = draft.modelId;
    const reasoningEffort = draft.reasoningEffort;
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
      const queued = await queue.enqueue({
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
      if (!queued) {
        if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
          portsRef.current.onError("当前会话队列已变化，请等待校准后重试。");
        }
        return;
      }
      await draftSyncOwnerRef.current!.load(currentScope.projectId, productMode);
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
        draftControllerRef.current!.clearAcceptedSnapshot(draft, {
          text: true,
          contextRefs: true,
          attachments: attachmentSelectionGenerationRef.current === attachmentGeneration,
          skillOverrides: true,
        });
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
    const reclaimed = await queue.reclaim(queueItemId, token);
    if (!reclaimed) {
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
        portsRef.current.onError("当前会话队列已变化，请等待校准后重试。");
      }
      return;
    }
    const restored = await draftSyncOwnerRef.current!.load(currentScope.projectId, productMode);
    if (!restored || !composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) return;
    setComposerText(restored.text);
    setFileRefs(restored.contextRefs);
    setAttachments(restored.attachments);
    setDraftSkillOverrides(restored.skillOverrides);
    if (productMode === "agent") {
      const restoredMode = restored.agentTurnMode ?? "default";
      writeAgentTurnMode(restoredMode);
      writeAgentModelId(restored.agentModelId);
      writeAgentReasoningEffort(restored.agentReasoningEffort);
      draftRestoredModesRef.current.set(draftScopeIdentity(currentScope.projectId, productMode), restoredMode);
      draftRestoredModelSelectionsRef.current.set(
        draftScopeIdentity(currentScope.projectId, productMode),
        { modelId: restored.agentModelId, reasoningEffort: restored.agentReasoningEffort },
      );
    }
  }, []);

  const flushDraft = useCallback(async (): Promise<string | null> => {
    const currentScope = scopeRef.current;
    if (!currentScope.projectId) return null;
    return draftSyncOwnerRef.current!.flush(currentScope.projectId, composerProductMode(currentScope));
  }, []);

  const settleAcceptedDraft = useCallback(async (
    accepted: ComposerDraftContent,
    options?: ComposerDraftSettlementOptions,
  ): Promise<void> => {
    try {
      await draftSyncOwnerRef.current!.settleAccepted(accepted, options);
      return;
    } catch {
      try {
        await draftSyncOwnerRef.current!.load(accepted.projectId, accepted.productMode);
        const currentScope = scopeRef.current;
        if (currentScope.projectId === accepted.projectId
          && composerProductMode(currentScope) === accepted.productMode
          && currentScope.projectRegistered) {
          draftSyncOwnerRef.current!.schedule(composerDraftContent({
            projectId: accepted.projectId,
            productMode: accepted.productMode,
            agentTurnMode: stateRef.current.agentTurnMode,
            agentModelId: stateRef.current.agentModelId,
            agentReasoningEffort: stateRef.current.agentReasoningEffort,
            text: stateRef.current.composerText,
            contextRefs: stateRef.current.fileRefs,
            attachments: stateRef.current.attachments,
            skillOverrides: stateRef.current.draftSkillOverrides,
            selectedProviderId: effectiveComposerProviderId(currentScope),
          }));
        }
        portsRef.current.onError("消息已发送，草稿已重新同步。");
      } catch {
        portsRef.current.onError("消息已发送，草稿暂时无法同步。请刷新后确认输入框内容。");
      }
    }
  }, []);

  function submissionOwner(): ConversationTurnSubmissionController {
    if (!submissionOwnerRef.current) {
      submissionOwnerRef.current = new ConversationTurnSubmissionController(createConversationSubmissionPorts({
        operation: () => portsRef.current.operation,
        ids: () => portsRef.current.ids ?? defaultComposerIds,
        session: () => portsRef.current.session,
        actions: () => portsRef.current.actions,
        timeline: () => portsRef.current.timeline,
        projection: () => portsRef.current.projection,
        attachments: () => portsRef.current.attachments ?? defaultAttachmentApi,
        drafts: () => ({
          flush: (projectId, productMode) => draftSyncOwnerRef.current!.flush(projectId, productMode),
          settleAccepted: settleAcceptedDraft,
        }),
        skills: () => ({
          apply: applySkillOverrides,
          reload: (identity) => reloadSkills(identity.projectId, identity),
        }),
        onError: (message) => portsRef.current.onError(message),
      }));
    }
    return submissionOwnerRef.current;
  }

  const clearAcceptedReviewCommand = useCallback(async (
    capturedText: string,
    _expectedDraftUpdatedAt: string | null,
  ): Promise<void> => {
    const currentScope = scopeRef.current;
    const draft = draftControllerRef.current!.read();
    if (!currentScope.projectId) return;
    const productMode = composerProductMode(currentScope);
    draftControllerRef.current!.clearAcceptedSnapshot({ ...draft, text: capturedText }, {
      text: true,
    });
    const content = composerDraftContent({
      projectId: currentScope.projectId,
      productMode,
      agentTurnMode: draft.agentTurnMode,
      agentModelId: draft.modelId,
      agentReasoningEffort: draft.reasoningEffort,
      text: capturedText,
      contextRefs: draft.contextRefs,
      attachments: draft.attachments,
      skillOverrides: draft.skillOverrides,
      selectedProviderId: effectiveComposerProviderId(currentScope),
    });
    await settleAcceptedDraft(content, { text: true });
  }, [settleAcceptedDraft]);

  const createConversation = useCallback(async (input: CreateConversationComposerInput = {}): Promise<ComposerCreatedConversation | null> => {
    const currentScope = scopeRef.current;
    const generation = scopeGenerationRef.current;
    const capturedDraft = draftControllerRef.current!.read();
    const capturedProjectId = currentScope.projectId;
    const capturedProductMode = composerProductMode(currentScope);
    const capturedProviderId = effectiveComposerProviderId(currentScope);
    const capturedAgentTurnMode = capturedDraft.agentTurnMode;
    const capturedAgentModelId = capturedDraft.modelId;
    const capturedAgentReasoningEffort = capturedDraft.reasoningEffort;
    const clientRequestId = (portsRef.current.ids ?? defaultComposerIds).createClientRequestId();
    const body = input.body ?? capturedDraft.text;
    const selectedRefs = input.fileRefs ?? capturedDraft.contextRefs;
    const attachmentIds = input.attachmentIds ?? capturedDraft.attachments.map((attachment) => attachment.id);
    const attachmentFiles = input.attachmentFiles ?? [];
    const capturedAttachments = capturedDraft.attachments.filter((attachment) => attachmentIds.includes(attachment.id));
    const acceptedDraft = {
      ...capturedDraft,
      text: body,
      contextRefs: selectedRefs,
      attachments: capturedAttachments,
    };
    if (!capturedProjectId || (!body.trim() && attachmentIds.length === 0 && attachmentFiles.length === 0)) return null;
    const turnModeError = resolveAgentTurnModeDisabledReason(currentScope, capturedAgentTurnMode)
      ?? resolveAgentTurnModelDisabledReason(currentScope, capturedAgentTurnMode, capturedAgentModelId, capturedAgentReasoningEffort);
    const draftProviderError = resolveDraftProviderDisabledReason(currentScope);
    if (draftProviderError ?? turnModeError) {
      portsRef.current.onError(draftProviderError ?? turnModeError);
      return null;
    }
    const attachmentCapabilityError = resolveAttachmentCapabilityDisabledReason(currentScope, [
      ...capturedAttachments,
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
      draftSkillOverrides: capturedDraft.skillOverrides,
    });
    const acceptedDraftContent = composerDraftContent({
      projectId: capturedProjectId,
      productMode: capturedProductMode,
      agentTurnMode: capturedAgentTurnMode,
      agentModelId: capturedAgentModelId,
      agentReasoningEffort: capturedAgentReasoningEffort,
      text: acceptedDraft.text,
      contextRefs: acceptedDraft.contextRefs,
      attachments: acceptedDraft.attachments,
      skillOverrides: acceptedDraft.skillOverrides,
      selectedProviderId: capturedProviderId,
    });
    const demandBody = prepared.text || defaultAttachmentPrompt(attachmentIds.length + attachmentFiles.length);
    if (currentScope.providerCount > 1 && !currentScope.selectedProviderId) {
      portsRef.current.onError("请先选择本次对话使用的 Agent。");
      return null;
    }
    const submissionSnapshot = createDraftSubmissionSnapshot({
      projectId: capturedProjectId,
      productMode: capturedProductMode,
      conversationId: null,
      clientRequestId,
      draftRevision: null,
      text: demandBody,
      contextRefs: prepared.contextRefs,
      attachments: capturedAttachments,
      skillOverrides: prepared.skillOverrides,
      providerId: capturedProviderId,
      agentTurnMode: capturedProductMode === "agent" ? capturedAgentTurnMode : null,
      modelId: capturedProductMode === "agent" ? capturedAgentModelId : null,
      reasoningEffort: capturedProductMode === "agent" ? capturedAgentReasoningEffort : null,
    });
    return submissionOwner().submitCreate({
      snapshot: submissionSnapshot,
      attachments: capturedAttachments,
      attachmentFiles,
      acceptedDraft: acceptedDraftContent,
      isCurrent: (created) => composerRequestOwnsCurrentScope(
        generation,
        [capturedProjectId, ...(created ? [created.projectId] : [])],
        capturedProductMode,
        capturedProviderId,
        scopeGenerationRef,
        scopeRef,
        created?.conversationId,
      ),
      onPending: () => {
        if (!composerRequestOwnsCurrentScope(
          generation,
          [capturedProjectId],
          capturedProductMode,
          capturedProviderId,
          scopeGenerationRef,
          scopeRef,
        )) return;
        draftControllerRef.current!.clearAcceptedSnapshot(acceptedDraft, { text: true });
        portsRef.current.onError(null);
      },
      onAccepted: async (created) => {
        if (attachmentGeneration !== attachmentSelectionGenerationRef.current) return;
        draftControllerRef.current!.clearAcceptedSnapshot(acceptedDraft);
        await reloadSkills(created.projectId);
      },
    });
  }, [reloadSkills]);

  const send = useCallback(async (): Promise<void> => {
    const currentScope = scopeRef.current;
    const generation = scopeGenerationRef.current;
    const capturedProductMode = composerProductMode(currentScope);
    const currentState = stateRef.current;
    const draft = draftControllerRef.current!.read();
    const capturedAgentTurnMode = draft.agentTurnMode;
    const capturedAgentModelId = draft.modelId;
    const capturedAgentReasoningEffort = draft.reasoningEffort;
    const attachmentIds = draft.attachments.map((attachment) => attachment.id);
    const capturedDraftContent = currentScope.projectId
      ? composerDraftContent({
        projectId: currentScope.projectId,
        productMode: capturedProductMode,
        agentTurnMode: capturedAgentTurnMode,
        agentModelId: capturedAgentModelId,
        agentReasoningEffort: capturedAgentReasoningEffort,
        text: draft.text,
        contextRefs: draft.contextRefs,
        attachments: draft.attachments,
        skillOverrides: draft.skillOverrides,
        selectedProviderId: effectiveComposerProviderId(currentScope),
      })
      : null;
    const attachmentGeneration = attachmentSelectionGenerationRef.current;
    if (!currentScope.projectId || !currentScope.conversation || (!draft.text.trim() && attachmentIds.length === 0)) return;
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
      body: draft.text,
      selectedRefs: draft.contextRefs,
      skills: currentState.skillItems,
      conversationId: currentScope.conversation.id,
      draftSkillOverrides: draft.skillOverrides,
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
      try {
        await draftSyncOwnerRef.current!.flush(currentScope.projectId, capturedProductMode);
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
        }), currentScope, draft.text, true, (actionGeneration, actionScope) => (
          composerActionOwnsCurrentScope(actionGeneration, actionScope, scopeGenerationRef, scopeRef)
          && composerStopIdentity(scopeRef.current) === steerIdentity
        ), (result) => result.status !== "already-terminal");
      if (outcome.status !== "already-terminal" && capturedDraftContent) {
        await settleAcceptedDraft(capturedDraftContent, { text: true });
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
    const clientRequestId = (portsRef.current.ids ?? defaultComposerIds).createClientRequestId();
    const submissionSnapshot = createDraftSubmissionSnapshot({
      projectId: currentScope.projectId,
      productMode: capturedProductMode,
      conversationId: currentScope.conversation.id,
      clientRequestId,
      draftRevision: null,
      text: outboundMessage,
      contextRefs: prepared.contextRefs,
      attachments: draft.attachments,
      skillOverrides: prepared.skillOverrides,
      providerId: currentScope.selectedProviderId ?? currentScope.conversation.selectedProviderId ?? null,
      agentTurnMode: capturedProductMode === "agent" ? capturedAgentTurnMode : null,
      modelId: capturedProductMode === "agent" ? capturedAgentModelId : null,
      reasoningEffort: capturedProductMode === "agent" ? capturedAgentReasoningEffort : null,
    });
    await submissionOwner().submitMessage({
      snapshot: submissionSnapshot,
      attachments: draft.attachments,
      acceptedDraft: capturedDraftContent,
      skillIdentity: {
        projectId: currentScope.projectId,
        productMode: capturedProductMode,
        conversationId: currentScope.conversation.id,
        providerId: currentScope.conversation.selectedProviderId ?? null,
      },
      providerSwitchIntent: currentScope.selectedProviderId && currentScope.selectedProviderId !== currentScope.conversation.selectedProviderId
        ? "resume-workflow"
        : undefined,
      isCurrent: () => composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef),
      acceptsEvent: (event) => workbenchEventMatchesConversation(event, {
        projectId: submissionSnapshot.projectId,
        productMode: submissionSnapshot.productMode,
        conversationId: submissionSnapshot.conversationId!,
      }),
      onPending: () => {
        if (!composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) return;
        draftControllerRef.current!.clearAcceptedSnapshot(draft, { text: true });
        portsRef.current.onError(null);
      },
      onAccepted: () => {
        if (attachmentGeneration !== attachmentSelectionGenerationRef.current) return;
        draftControllerRef.current!.clearAcceptedSnapshot(draft, {
          contextRefs: true,
          attachments: true,
          skillOverrides: true,
        });
      },
    });
  }, [settleAcceptedDraft]);

  const retryPendingIntent = useCallback(async (clientRequestId: string): Promise<void> => {
    const currentScope = scopeRef.current;
    const generation = scopeGenerationRef.current;
    await submissionOwner().retryPendingIntent(clientRequestId, {
      matchesCurrent: (submission: PendingConversationSubmission) => (
        generation === scopeGenerationRef.current
        && currentScope.projectId === submission.snapshot.projectId
        && composerProductMode(currentScope) === submission.snapshot.productMode
        && (submission.kind === "create" || currentScope.conversation?.id === submission.snapshot.conversationId)
      ),
      selectedConversationProviderId: currentScope.conversation?.selectedProviderId ?? null,
      isCurrent: (snapshot, created) => {
        const active = scopeRef.current;
        return generation === scopeGenerationRef.current
          && active.projectId === (created?.projectId ?? snapshot.projectId)
          && composerProductMode(active) === snapshot.productMode
          && active.conversation?.id === (created?.conversationId ?? snapshot.conversationId);
      },
      acceptsEvent: (snapshot, event) => workbenchEventMatchesConversation(event, {
        projectId: snapshot.projectId,
        productMode: snapshot.productMode,
        conversationId: snapshot.conversationId!,
      }),
      onAccepted: async (submission, created) => {
        const accepted = pendingSubmissionDraftViewModel(submission);
        if (accepted) {
          draftControllerRef.current!.clearAcceptedSnapshot(accepted, {
            contextRefs: true,
            attachments: true,
            skillOverrides: true,
          });
        }
        if (created) await reloadSkills(created.projectId);
      },
    });
  }, [reloadSkills]);

  const restorePendingIntent = useCallback((clientRequestId: string): void => {
    const pending = submissionOwner().inspect(clientRequestId);
    if (!pending) return;
    const currentScope = scopeRef.current;
    const snapshot = pending.snapshot;
    if (currentScope.projectId !== snapshot.projectId || composerProductMode(currentScope) !== snapshot.productMode) {
      portsRef.current.onError("这条消息不属于当前项目或模式，无法放回输入框。");
      return;
    }
    if (pending.kind === "message" && currentScope.conversation?.id !== snapshot.conversationId) {
      portsRef.current.onError("请切回原会话，再把这条消息放回输入框。");
      return;
    }
    const submission = submissionOwner().restore(clientRequestId);
    if (!submission) return;
    draftControllerRef.current!.restore(snapshot, submission.attachments, {
      restoreSkillOverrides: submission.kind === "create",
      restoreConfiguration: true,
    });
    if (submission.attachmentFiles.length > 0) {
      void appendAttachments(submission.attachmentFiles);
    }
    portsRef.current.onError(null);
  }, [appendAttachments]);

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
      if (typeof next === "function") {
        const current = draftControllerRef.current!.read().text;
        draftControllerRef.current!.updateText(next(current));
      } else {
        draftControllerRef.current!.updateText(next);
      }
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
    modelLabel,
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
    flushDraft,
    clearAcceptedReviewCommand,
    send,
    retryPendingIntent,
    restorePendingIntent,
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

function conversationDraftViewModel(input: {
  composerText: string;
  draftSkillOverrides: Record<string, boolean>;
  fileRefs: TopicFileReference[];
  attachments: TopicAttachment[];
  agentTurnMode: AgentTurnMode;
  agentModelId: string | null;
  agentReasoningEffort: string | null;
}): ConversationDraftViewModel {
  return {
    text: input.composerText,
    contextRefs: input.fileRefs,
    attachments: input.attachments,
    skillOverrides: input.draftSkillOverrides,
    agentTurnMode: input.agentTurnMode,
    modelId: input.agentModelId,
    reasoningEffort: input.agentReasoningEffort,
  };
}

function pendingSubmissionDraftViewModel(
  submission: PendingConversationSubmission,
): ConversationDraftViewModel | null {
  const accepted = submission.acceptedDraft;
  if (!accepted) return null;
  const acceptedAttachmentIds = new Set(accepted.attachmentIds);
  return {
    text: accepted.text,
    contextRefs: accepted.contextRefs.map((reference) => ({ ...reference })),
    attachments: submission.attachments
      .filter((attachment) => acceptedAttachmentIds.has(attachment.id))
      .map((attachment) => ({ ...attachment })),
    skillOverrides: { ...accepted.skillOverrides },
    agentTurnMode: accepted.agentTurnMode ?? "default",
    modelId: accepted.agentModelId,
    reasoningEffort: accepted.agentReasoningEffort,
  };
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
  if (scope.providerCapabilitiesLoading) return "正在检查当前 Agent 是否支持计划模式。";
  if (scope.providerCapabilitiesError) return "暂时无法确认计划模式是否可用，请刷新后重试。";
  const providerId = effectiveComposerProviderId(scope);
  if (!providerId) return "请先选择支持计划模式的 Agent。";
  const snapshot = scope.providerCapabilities?.find((candidate) => candidate.providerId === providerId);
  const plan = snapshot?.capabilities.find((capability) => capability.key === "turn.plan");
  if (!snapshot || plan?.runtime !== "ready") {
    return plan?.reason ?? "当前 Agent 不支持计划模式。";
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
  if (agentTurnMode === "plan" && !resolvedModelId) return "计划模式需要先选择可用模型。";
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
  if (scope.providerCapabilitiesError) return "暂时无法确认附件是否可用，请刷新后重试。";
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
  return userFacingErrorMessage(cause, "send");
}
