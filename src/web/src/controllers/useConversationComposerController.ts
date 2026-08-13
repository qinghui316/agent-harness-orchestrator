import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { consumeWorkbenchLiveStream, fetchJson, postJson } from "../api.js";
import { extractInlineFileMentions } from "../shell/file-mentions.js";
import { extractInlineSkillMentions } from "../shell/skill-mentions.js";
import type { ProductMode, SkillListItem, TopicAttachment, TopicFileReference, WorkbenchLiveEvent } from "../types.js";
import type { WorkbenchOperationToken } from "./useGlobalOperationGate.js";

export type ComposerTransition = "project-changed" | "conversation-changed" | "new-conversation";

export interface ConversationComposerScope {
  projectId: string | null;
  productMode?: ProductMode;
  conversation: {
    id: string;
    state: string;
    productMode?: ProductMode;
    selectedProviderId?: string;
  } | null;
  managed: boolean;
  running: boolean;
  selectedProviderId: string | null;
  providerCount: number;
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
}

export interface ComposerActionRequest {
  projectId: string;
  conversationId: string;
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
  };
  actions: {
    sendMessage?(request: ComposerMessageRequest): Promise<void>;
    steer(request: ComposerActionRequest): Promise<void>;
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
  const scopeGenerationRef = useRef(0);
  const skillRequestGenerationRef = useRef(0);
  const scopeIdentityRef = useRef(composerScopeIdentity(scope));
  const stateRef = useRef({ composerText, skillItems, draftSkillOverrides, fileRefs, attachments });
  const scopeRef = useRef(scope);
  const portsRef = useRef(ports);
  stateRef.current = { composerText, skillItems, draftSkillOverrides, fileRefs, attachments };
  scopeRef.current = scope;
  portsRef.current = ports;

  const activeSkillIds = useMemo(
    () => activeComposerSkillIds(skillItems, scope.conversation?.id ?? null, draftSkillOverrides),
    [draftSkillOverrides, scope.conversation?.id, skillItems],
  );

  const reloadSkills = useCallback(async (projectId = scopeRef.current.projectId): Promise<void> => {
    const generation = ++skillRequestGenerationRef.current;
    if (!projectId || !scopeRef.current.managed) {
      setSkillItems([]);
      return;
    }
    try {
      const identity = skillRequestIdentity({ ...scopeRef.current, projectId });
      const next = await (portsRef.current.skills ?? defaultSkillApi).load(identity);
      if (generation !== skillRequestGenerationRef.current
        || skillRequestIdentityKey(identity) !== skillRequestIdentityKey(skillRequestIdentity(scopeRef.current))) return;
      setSkillItems(next);
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

  const cleanupTransition = useCallback((transition: ComposerTransition): void => {
    scopeGenerationRef.current += 1;
    skillRequestGenerationRef.current += 1;
    setDraftSkillOverrides({});
    setFileRefs([]);
    setAttachments([]);
    if (transition === "new-conversation") setComposerText("");
  }, []);

  const setSelectedFileRefs = useCallback((next: TopicFileReference[]): void => {
    setFileRefs(normalizeComposerRefs(next));
  }, []);

  const addFileReference = useCallback((ref: TopicFileReference): void => {
    setFileRefs((current) => normalizeComposerRefs([...current, ref]));
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
      return;
    }
    try {
      await (portsRef.current.skills ?? defaultSkillApi).setEnabled(
        skillRequestIdentity(currentScope),
        skillId,
        !currentlyActive,
      );
      await reloadSkills(currentScope.projectId);
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
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
      return uploaded;
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
      return [];
    }
  }, [uploadFilesForProject]);

  const removeAttachment = useCallback(async (attachmentId: string): Promise<void> => {
    const projectId = scopeRef.current.projectId;
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    if (!projectId) return;
    try {
      await (portsRef.current.attachments ?? defaultAttachmentApi).remove(projectId, attachmentId);
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
    }
  }, []);

  const createConversation = useCallback(async (input: CreateConversationComposerInput = {}): Promise<ComposerCreatedConversation | null> => {
    const currentScope = scopeRef.current;
    const generation = scopeGenerationRef.current;
    const capturedProjectId = currentScope.projectId;
    const capturedProductMode = composerProductMode(currentScope);
    const capturedProviderId = currentScope.selectedProviderId ?? currentScope.conversation?.selectedProviderId ?? null;
    const clientRequestId = (portsRef.current.ids ?? defaultComposerIds).createClientRequestId();
    const body = input.body ?? stateRef.current.composerText;
    const selectedRefs = input.fileRefs ?? stateRef.current.fileRefs;
    const attachmentIds = input.attachmentIds ?? stateRef.current.attachments.map((attachment) => attachment.id);
    const attachmentFiles = input.attachmentFiles ?? [];
    if (!capturedProjectId || (!body.trim() && attachmentIds.length === 0 && attachmentFiles.length === 0)) return null;
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
        showPendingBeforeCreate: attachmentFiles.length === 0,
      });
      uploadedDraft = [];
      const requestProjectIds = [capturedProjectId, effectiveProjectId];
      if (composerRequestOwnsCurrentScope(generation, requestProjectIds, capturedProductMode, capturedProviderId, scopeGenerationRef, scopeRef, created.conversationId)) {
        setComposerText("");
        setFileRefs([]);
        setAttachments([]);
        setDraftSkillOverrides({});
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
    const draft = stateRef.current;
    const attachmentIds = draft.attachments.map((attachment) => attachment.id);
    if (!currentScope.projectId || !currentScope.conversation || (!draft.composerText.trim() && attachmentIds.length === 0)) return;
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
    await applySkillOverrides(currentScope.projectId, currentScope.conversation.id, prepared.skillOverrides);
    if (Object.keys(prepared.skillOverrides).length > 0) await reloadSkills(currentScope.projectId);
    if (!prepared.text && attachmentIds.length === 0) {
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
        setComposerText("");
        setFileRefs([]);
      }
      return;
    }
    if (currentScope.running && attachmentIds.length > 0) {
      portsRef.current.onError("当前执行中暂不支持追加附件；请等待执行暂停后再发送。");
      return;
    }
    const outboundMessage = prepared.text || defaultAttachmentPrompt(attachmentIds.length);
    if (currentScope.running) {
      await runAction("conversation.steer", () => portsRef.current.actions.steer({
        projectId: currentScope.projectId!,
        conversationId: currentScope.conversation!.id,
        prompt: outboundMessage,
      }), currentScope, draft.composerText, true);
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) setFileRefs([]);
      return;
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
      if (composerActionOwnsCurrentScope(generation, currentScope, scopeGenerationRef, scopeRef)) {
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
    await runAction("conversation.interrupt", () => portsRef.current.actions.stop({
      projectId: currentScope.projectId!,
      conversationId: currentScope.conversation!.id,
      prompt: submittedText.trim() || undefined,
    }), currentScope, submittedText, true);
  }, []);

  async function applySkillOverrides(projectId: string, conversationId: string, overrides: Record<string, boolean>): Promise<void> {
    for (const [skillId, enabled] of Object.entries(overrides)) {
      const current = scopeRef.current;
      await (portsRef.current.skills ?? defaultSkillApi).setEnabled({
        ...skillRequestIdentity(current),
        projectId,
        conversationId,
      }, skillId, enabled);
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

  async function runAction(
    key: string,
    action: () => Promise<void>,
    actionScope: ConversationComposerScope,
    submittedText: string,
    clearSubmittedText: boolean,
  ): Promise<void> {
    const token = portsRef.current.operation.begin(key);
    const generation = scopeGenerationRef.current;
    if (composerActionOwnsCurrentScope(generation, actionScope, scopeGenerationRef, scopeRef)) {
      portsRef.current.onError(null);
    }
    try {
      await action();
      if (clearSubmittedText && composerActionOwnsCurrentScope(generation, actionScope, scopeGenerationRef, scopeRef)) {
        setComposerText((current) => current === submittedText ? "" : current);
      }
    } catch (cause) {
      if (composerActionOwnsCurrentScope(generation, actionScope, scopeGenerationRef, scopeRef)) {
        portsRef.current.onError(errorMessage(cause));
      }
      throw cause;
    } finally {
      if (actionScope.projectId && actionScope.conversation
        && composerActionOwnsCurrentScope(generation, actionScope, scopeGenerationRef, scopeRef)) {
        await calibrateTimeline(
          actionScope.projectId,
          actionScope.conversation.id,
          () => composerActionOwnsCurrentScope(generation, actionScope, scopeGenerationRef, scopeRef),
        );
      }
      portsRef.current.operation.release(token);
    }
  }

  return {
    composerText,
    setComposerText,
    skillItems,
    activeSkillIds,
    enabledSkillCount: activeSkillIds.length,
    draftSkillOverrides,
    fileRefs,
    setFileRefs: setSelectedFileRefs,
    addFileReference,
    attachments,
    setAttachments,
    reloadSkills,
    toggleSkill,
    appendAttachments,
    removeAttachment,
    createConversation,
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
  return (generation === generationRef.current
      || Boolean(committedConversationId && currentScope.conversation?.id === committedConversationId))
    && currentScope.projectId !== null
    && projectIds.includes(currentScope.projectId)
    && composerProductMode(currentScope) === productMode
    && (currentScope.conversation?.selectedProviderId ?? currentScope.selectedProviderId ?? null) === providerId;
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
