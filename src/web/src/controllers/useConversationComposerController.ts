import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { consumeWorkbenchLiveStream, fetchJson, postJson } from "../api.js";
import { extractInlineFileMentions } from "../shell/file-mentions.js";
import { extractInlineSkillMentions } from "../shell/skill-mentions.js";
import type { SkillListItem, TopicAttachment, TopicFileReference, WorkbenchLiveEvent } from "../types.js";
import type { WorkbenchOperationToken } from "./useGlobalOperationGate.js";

export type ComposerTransition = "project-changed" | "conversation-changed" | "new-conversation";

export interface ConversationComposerScope {
  projectId: string | null;
  conversation: {
    id: string;
    state: string;
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
  body: string;
  contextRefs: TopicFileReference[];
  attachmentIds: string[];
  providerId?: string;
  showPendingBeforeCreate: boolean;
}

export interface ComposerCreatedConversation {
  projectId: string;
  conversationId: string;
}

export interface ComposerMessageRequest {
  projectId: string;
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
    load(projectId: string): Promise<SkillListItem[]>;
    setEnabled(projectId: string, skillId: string, enabled: boolean, conversationId: string): Promise<void>;
  };
  attachments?: {
    upload(projectId: string, upload: ComposerAttachmentUpload): Promise<TopicAttachment>;
    remove(projectId: string, attachmentId: string): Promise<void>;
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
  const scopeIdentityRef = useRef(`${scope.projectId ?? ""}\0${scope.conversation?.id ?? ""}`);
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
      const next = await (portsRef.current.skills ?? defaultSkillApi).load(projectId);
      if (generation !== skillRequestGenerationRef.current || projectId !== scopeRef.current.projectId) return;
      setSkillItems(next);
    } catch (cause) {
      if (generation === skillRequestGenerationRef.current) portsRef.current.onError(errorMessage(cause));
    }
  }, []);

  useEffect(() => {
    void reloadSkills(scope.projectId);
    return () => { skillRequestGenerationRef.current += 1; };
  }, [reloadSkills, scope.managed, scope.projectId, scope.conversation?.id]);

  useEffect(() => {
    const identity = `${scope.projectId ?? ""}\0${scope.conversation?.id ?? ""}`;
    if (identity === scopeIdentityRef.current) return;
    scopeIdentityRef.current = identity;
    scopeGenerationRef.current += 1;
  }, [scope.projectId, scope.conversation?.id]);

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
        currentScope.projectId,
        skillId,
        !currentlyActive,
        currentScope.conversation.id,
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
    const body = input.body ?? stateRef.current.composerText;
    const selectedRefs = input.fileRefs ?? stateRef.current.fileRefs;
    const attachmentIds = input.attachmentIds ?? stateRef.current.attachments.map((attachment) => attachment.id);
    const attachmentFiles = input.attachmentFiles ?? [];
    if (!currentScope.projectId || (!body.trim() && attachmentIds.length === 0 && attachmentFiles.length === 0)) return null;
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
    let created: ComposerCreatedConversation | null = null;
    try {
      portsRef.current.onError(null);
      const effectiveProjectId = await portsRef.current.session.ensureProjectRegistered(currentScope.projectId);
      if (!effectiveProjectId) return null;
      uploadProjectId = effectiveProjectId;
      uploadedDraft = await uploadFilesForProject(effectiveProjectId, attachmentFiles);
      created = await portsRef.current.session.createConversation({
        projectId: effectiveProjectId,
        body: demandBody,
        contextRefs: prepared.contextRefs,
        attachmentIds: [...attachmentIds, ...uploadedDraft.map((attachment) => attachment.id)],
        providerId: currentScope.selectedProviderId ?? undefined,
        showPendingBeforeCreate: attachmentFiles.length === 0,
      });
      uploadedDraft = [];
      setComposerText("");
      setFileRefs([]);
      setAttachments([]);
      setDraftSkillOverrides({});
      await applySkillOverrides(created.projectId, created.conversationId, prepared.skillOverrides);
      await reloadSkills(created.projectId);
      await portsRef.current.projection.refreshConversation(created.projectId, created.conversationId);
      return created;
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
      throw cause;
    } finally {
      if (uploadedDraft.length > 0 && uploadProjectId) {
        await Promise.allSettled(uploadedDraft.map((attachment) => (portsRef.current.attachments ?? defaultAttachmentApi).remove(uploadProjectId!, attachment.id)));
      }
      if (created) await calibrateTimeline(created.projectId, created.conversationId);
      portsRef.current.operation.release(token);
    }
  }, [reloadSkills, uploadFilesForProject]);

  const send = useCallback(async (): Promise<void> => {
    const currentScope = scopeRef.current;
    const draft = stateRef.current;
    const attachmentIds = draft.attachments.map((attachment) => attachment.id);
    if (!currentScope.projectId || !currentScope.conversation || (!draft.composerText.trim() && attachmentIds.length === 0)) return;
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
      setComposerText("");
      setFileRefs([]);
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
      setFileRefs([]);
      return;
    }

    const token = portsRef.current.operation.begin("chat.ask");
    const generation = scopeGenerationRef.current;
    setComposerText("");
    portsRef.current.onError(null);
    try {
      const request: ComposerMessageRequest = {
        projectId: currentScope.projectId,
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
          if (active.projectId === projectId && active.conversation?.id === input.conversationId) {
            portsRef.current.projection.routeEvent?.(projectId, event);
          }
        })))(request);
      if (generation === scopeGenerationRef.current) {
        setFileRefs([]);
        setAttachments([]);
      }
    } catch (cause) {
      if (generation === scopeGenerationRef.current) {
        setComposerText((current) => current ? current : draft.composerText);
      }
      portsRef.current.onError(errorMessage(cause));
      throw cause;
    } finally {
      await calibrateTimeline(currentScope.projectId, currentScope.conversation.id);
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
      await (portsRef.current.skills ?? defaultSkillApi).setEnabled(projectId, skillId, enabled, conversationId);
    }
  }

  async function calibrateTimeline(projectId: string, conversationId: string): Promise<void> {
    try {
      await portsRef.current.timeline.calibrate(projectId, conversationId, "main-agent");
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
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
    portsRef.current.onError(null);
    try {
      await action();
      if (clearSubmittedText && generation === scopeGenerationRef.current) {
        setComposerText((current) => current === submittedText ? "" : current);
      }
    } catch (cause) {
      portsRef.current.onError(errorMessage(cause));
      throw cause;
    } finally {
      if (actionScope.projectId && actionScope.conversation) {
        await calibrateTimeline(actionScope.projectId, actionScope.conversation.id);
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

export function defaultAttachmentPrompt(count: number): string {
  return count === 1
    ? "请先查看我附上的文件，然后根据附件内容继续。"
    : "请先查看我附上的文件，然后根据这些附件内容继续。";
}

const defaultSkillApi = {
  async load(projectId: string): Promise<SkillListItem[]> {
    const payload = await fetchJson<{ skills?: SkillListItem[] }>(`/api/projects/${encodeURIComponent(projectId)}/skills`);
    return Array.isArray(payload.skills) ? payload.skills : [];
  },
  async setEnabled(projectId: string, skillId: string, enabled: boolean, conversationId: string): Promise<void> {
    await postJson(`/api/projects/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(skillId)}/enable`, {
      enabled,
      topic: conversationId,
    });
  },
};

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
    },
    (event) => routeEvent?.(request.projectId, event),
  );
}

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
