import { useCallback, useEffect, useRef, useState } from "react";
import { consumeWorkbenchLiveStream, fetchJson, postJson } from "../api.js";
import { projectDisplayName } from "../formatters.js";
import type {
  AppStatus,
  ProjectStatus,
  Snapshot,
  StreamPacket,
  Topic,
  TopicFileReference,
  WorkbenchLiveEvent,
  Workpad,
} from "../types.js";

const SELECTED_PROJECT_STORAGE_KEY = "aho.workbench.selectedProjectId";

class StaleSessionRequestError extends Error {
  constructor() {
    super("Session scope changed before the request completed.");
    this.name = "StaleSessionRequestError";
  }
}

export type PendingDemandConversation = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  startedAt: string;
  canonical: boolean;
  updatedAt?: string;
  selectedProviderId?: string;
};

export type CreateDemandConversationInput = {
  projectId: string;
  body: string;
  contextRefs: TopicFileReference[];
  attachmentIds: string[];
  providerId?: string;
  showPendingBeforeCreate: boolean;
};

export type SessionTransitionKind = "project-changed" | "conversation-changed" | "new-conversation";

export type SessionTransition = {
  kind: SessionTransitionKind;
  fromProjectId: string | null;
  fromConversationId: string | null;
  toProjectId: string;
  toConversationId: string | null;
  resetComposerText: boolean;
};

export type WorkbenchRestoreParams = {
  projectId: string | null;
  topicId: string | null;
  orchestrationOpen: boolean;
  settingsOpen: boolean;
};

export interface ProjectConversationSessionApi {
  loadAppStatus(): Promise<AppStatus>;
  loadProjects(): Promise<ProjectStatus[]>;
  loadSnapshot(projectId: string, conversationId: string | null): Promise<Snapshot>;
  loadStream(projectId: string, runId: string): Promise<StreamPacket>;
  removeProject(projectId: string): Promise<void>;
  hideConversation(projectId: string, conversationId: string): Promise<void>;
  updateConversationTitle(projectId: string, conversationId: string, title: string): Promise<{ conversation: Topic }>;
  registerProject(path: string): Promise<{ project: { id: string }; status?: ProjectStatus }>;
  createDemandConversation(
    input: CreateDemandConversationInput,
    onEvent: (event: WorkbenchLiveEvent) => void,
  ): Promise<void>;
}

export interface ProjectConversationSessionPorts {
  api?: Partial<ProjectConversationSessionApi>;
  navigation?: {
    readRestoreParams(): WorkbenchRestoreParams;
    readPersistedProjectId(): string | null;
    persistProjectId(projectId: string): void;
    clearPersistedProjectId(): void;
    syncLocation(projectId: string | null, conversationId: string | null): void;
  };
  timeline?: {
    invalidateProjection(): void;
    clearProject(projectId: string): void;
    clearConversation(projectId: string, conversationId: string): void;
  };
  resources?: {
    cleanupTransition(kind: SessionTransitionKind): void;
  };
  operations?: {
    invalidate(): void;
  };
  ui?: {
    transition(event: SessionTransition): void;
    restoreView(view: Pick<WorkbenchRestoreParams, "orchestrationOpen" | "settingsOpen">): void;
    confirmRemoveProject(projectName: string): boolean;
  };
  onError?(message: string): void;
  autoLoad?: boolean;
}

export function useProjectConversationSession(ports: ProjectConversationSessionPorts = {}) {
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const [projects, setProjects] = useState<ProjectStatus[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptyWorkbenchSnapshot);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamPacket | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectSnapshots, setProjectSnapshots] = useState<Record<string, Snapshot>>({});
  const [pendingDemandConversation, setPendingDemandConversation] = useState<PendingDemandConversation | null>(null);
  const requestGenerationRef = useRef(0);
  const folderRequestGenerationsRef = useRef(new Map<string, number>());
  const streamEffectGenerationRef = useRef(0);
  const pendingDemandRef = useRef<PendingDemandConversation | null>(null);
  const stateRef = useRef({ projects, selectedProjectId, snapshot, selectedTopic, selectedRun, pendingDemandConversation });
  stateRef.current = { projects, selectedProjectId, snapshot, selectedTopic, selectedRun, pendingDemandConversation };

  const reportError = useCallback((cause: unknown): void => {
    portsRef.current.onError?.(cause instanceof Error ? cause.message : String(cause));
  }, []);

  const beginTransition = useCallback((kind: SessionTransitionKind, projectId: string, conversationId: string | null): number => {
    const generation = ++requestGenerationRef.current;
    const previous = stateRef.current;
    portsRef.current.operations?.invalidate();
    portsRef.current.resources?.cleanupTransition(kind);
    portsRef.current.ui?.transition({
      kind,
      fromProjectId: previous.selectedProjectId,
      fromConversationId: previous.selectedTopic,
      toProjectId: projectId,
      toConversationId: conversationId,
      resetComposerText: kind === "new-conversation",
    });
    return generation;
  }, []);

  const commitProjectSelection = useCallback((projectId: string, conversationId: string | null): void => {
    setSelectedProjectId(projectId);
    setSelectedTopic(conversationId);
    setExpandedProjects((current) => new Set([...current, projectId]));
    navigation(portsRef.current).persistProjectId(projectId);
    navigation(portsRef.current).syncLocation(projectId, conversationId);
  }, []);

  const refreshAtGeneration = useCallback(async (
    projectId: string | null,
    conversationId: string | null,
    generation: number,
  ): Promise<Snapshot | void> => {
    const api = sessionApi(portsRef.current);
    const list = await api.loadProjects();
    if (generation !== requestGenerationRef.current) return;
    setProjects(list);
    if (!projectId) return;
    const status = findProject(list, projectId);
    if (!status?.managed) {
      const next = snapshotForProject(status);
      setSnapshot(next);
      setStream(null);
      setSelectedRun(null);
      setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
      return next;
    }
    const next = await api.loadSnapshot(projectId, conversationId);
    if (generation !== requestGenerationRef.current) return;
    setSnapshot(next);
    setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
    portsRef.current.timeline?.invalidateProjection();
    const previousRun = stateRef.current.selectedRun;
    const runId = previousRun && next.center.agentLoop.runs.some((run) => run.id === previousRun)
      ? previousRun
      : next.center.agentLoop.runs[0]?.id ?? null;
    setSelectedRun(runId);
    if (!runId) {
      setStream(null);
      return next;
    }
    const nextStream = await api.loadStream(projectId, runId);
    if (generation === requestGenerationRef.current) setStream(nextStream);
    return generation === requestGenerationRef.current ? next : undefined;
  }, []);

  const refresh = useCallback(async (
    projectId = stateRef.current.selectedProjectId,
    conversationId = stateRef.current.selectedTopic,
  ): Promise<Snapshot | void> => {
    const generation = ++requestGenerationRef.current;
    return refreshAtGeneration(projectId, conversationId, generation);
  }, [refreshAtGeneration]);

  const loadApp = useCallback(async (): Promise<void> => {
    const generation = ++requestGenerationRef.current;
    const currentPorts = portsRef.current;
    const restore = navigation(currentPorts).readRestoreParams();
    const api = sessionApi(currentPorts);
    const [status, list] = await Promise.all([api.loadAppStatus(), api.loadProjects()]);
    if (generation !== requestGenerationRef.current) return;
    setProjects(list);
    const urlProjectStatus = findProject(list, restore.projectId);
    if (restore.projectId && !urlProjectStatus) {
      setSelectedProjectId(null);
      setSelectedTopic(null);
      setSelectedRun(null);
      setStream(null);
      setSnapshot(emptyWorkbenchSnapshot);
      return;
    }
    const persistedProjectId = navigation(currentPorts).readPersistedProjectId();
    const selectedStatus = urlProjectStatus
      ?? findProject(list, persistedProjectId)
      ?? findProject(list, status.directProjectId);
    const projectId = selectedStatus?.project?.id ?? null;
    currentPorts.ui?.restoreView({
      orchestrationOpen: restore.orchestrationOpen,
      settingsOpen: restore.settingsOpen,
    });
    if (!projectId) {
      if (persistedProjectId) navigation(currentPorts).clearPersistedProjectId();
      return;
    }
    const conversationId = restore.topicId && (restore.projectId || urlProjectStatus) ? restore.topicId : null;
    setSelectedProjectId(projectId);
    setSelectedTopic(conversationId);
    setExpandedProjects(new Set([projectId]));
    navigation(currentPorts).persistProjectId(projectId);
    if (selectedStatus?.managed) {
      await refreshAtGeneration(projectId, conversationId, generation);
    } else if (generation === requestGenerationRef.current) {
      const next = snapshotForProject(selectedStatus);
      setSnapshot(next);
      setProjectSnapshots({ [projectId]: next });
    }
  }, [refreshAtGeneration]);

  const openProject = useCallback(async (projectId: string): Promise<void> => {
    const kind: SessionTransitionKind = stateRef.current.selectedProjectId === projectId
      ? "conversation-changed"
      : "project-changed";
    const generation = beginTransition(kind, projectId, null);
    commitProjectSelection(projectId, null);
    setSelectedRun(null);
    setStream(null);
    setPendingDemandConversation(null);
    pendingDemandRef.current = null;
    await refreshAtGeneration(projectId, null, generation);
  }, [beginTransition, commitProjectSelection, refreshAtGeneration]);

  const beginNewConversation = useCallback(async (projectId = stateRef.current.selectedProjectId ?? undefined): Promise<void> => {
    if (!projectId) {
      reportError("请先选择项目，再在该项目下新建需求对话。");
      return;
    }
    const status = findProject(stateRef.current.projects, projectId);
    if (!status?.managed) {
      reportError("请先初始化这个项目，再新建需求对话。");
      return;
    }
    const generation = beginTransition("new-conversation", projectId, null);
    const cached = projectSnapshots[projectId];
    const baseSnapshot = cached
      ?? (status.project?.id === stateRef.current.selectedProjectId
        ? stateRef.current.snapshot
        : await sessionApi(portsRef.current).loadSnapshot(projectId, null));
    if (generation !== requestGenerationRef.current) return;
    commitProjectSelection(projectId, null);
    setSelectedRun(null);
    setStream(null);
    setPendingDemandConversation(null);
    pendingDemandRef.current = null;
    const next = newConversationSnapshot(baseSnapshot, status);
    setSnapshot(next);
    setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
    portsRef.current.timeline?.invalidateProjection();
  }, [beginTransition, commitProjectSelection, projectSnapshots, reportError]);

  const toggleProjectFolder = useCallback(async (projectId: string): Promise<void> => {
    const shouldOpen = !expandedProjects.has(projectId);
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (shouldOpen) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
    if (!shouldOpen || projectSnapshots[projectId]) return;
    const status = findProject(stateRef.current.projects, projectId);
    if (!status?.managed) return;
    const generation = (folderRequestGenerationsRef.current.get(projectId) ?? 0) + 1;
    folderRequestGenerationsRef.current.set(projectId, generation);
    const next = await sessionApi(portsRef.current).loadSnapshot(projectId, null);
    if (folderRequestGenerationsRef.current.get(projectId) !== generation) return;
    setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
  }, [expandedProjects, projectSnapshots]);

  const chooseConversation = useCallback(async (projectId: string, conversationId: string): Promise<void> => {
    const kind: SessionTransitionKind = stateRef.current.selectedProjectId === projectId
      ? "conversation-changed"
      : "project-changed";
    const generation = beginTransition(kind, projectId, conversationId);
    commitProjectSelection(projectId, conversationId);
    setSelectedRun(null);
    setStream(null);
    setPendingDemandConversation(null);
    pendingDemandRef.current = null;
    await refreshAtGeneration(projectId, conversationId, generation);
  }, [beginTransition, commitProjectSelection, refreshAtGeneration]);

  const removeProject = useCallback(async (projectId: string): Promise<void> => {
    const status = findProject(stateRef.current.projects, projectId);
    const name = projectDisplayName(status?.project, projectId);
    if (!(portsRef.current.ui?.confirmRemoveProject(name) ?? defaultConfirmRemoveProject(name))) return;
    ++requestGenerationRef.current;
    await sessionApi(portsRef.current).removeProject(projectId);
    portsRef.current.timeline?.clearProject(projectId);
    setProjectSnapshots((current) => withoutProject(current, projectId));
    setExpandedProjects((current) => withoutSetValue(current, projectId));
    if (stateRef.current.selectedProjectId === projectId) {
      portsRef.current.operations?.invalidate();
      portsRef.current.resources?.cleanupTransition("project-changed");
      navigation(portsRef.current).clearPersistedProjectId();
      navigation(portsRef.current).syncLocation(null, null);
      setSelectedProjectId(null);
      setSelectedTopic(null);
      setSelectedRun(null);
      setStream(null);
      setSnapshot(emptyWorkbenchSnapshot);
      setPendingDemandConversation(null);
      pendingDemandRef.current = null;
    }
    await refresh(null, null);
  }, [refresh]);

  const hideConversation = useCallback(async (projectId: string, conversationId: string): Promise<void> => {
    const generation = ++requestGenerationRef.current;
    await sessionApi(portsRef.current).hideConversation(projectId, conversationId);
    if (generation !== requestGenerationRef.current) return;
    portsRef.current.timeline?.clearConversation(projectId, conversationId);
    const wasSelected = stateRef.current.selectedProjectId === projectId
      && stateRef.current.selectedTopic === conversationId;
    const conversationToRefresh = stateRef.current.selectedProjectId === projectId && !wasSelected
      ? stateRef.current.selectedTopic
      : null;
    if (wasSelected) {
      beginTransition("conversation-changed", projectId, null);
      setSelectedTopic(null);
      setSelectedRun(null);
      setStream(null);
      setPendingDemandConversation(null);
      pendingDemandRef.current = null;
      navigation(portsRef.current).syncLocation(projectId, null);
    }
    await refresh(projectId, conversationToRefresh);
  }, [beginTransition, refresh]);

  const chooseRun = useCallback(async (runId: string): Promise<void> => {
    const projectId = stateRef.current.selectedProjectId;
    if (!projectId) return;
    const generation = ++requestGenerationRef.current;
    setSelectedRun(runId);
    const next = await sessionApi(portsRef.current).loadStream(projectId, runId);
    if (generation !== requestGenerationRef.current) return;
    setStream(next);
  }, []);

  const beginPendingDemand = useCallback((input: Omit<PendingDemandConversation, "id" | "startedAt" | "canonical"> & {
    id?: string;
    startedAt?: string;
  }): PendingDemandConversation => {
    const pending: PendingDemandConversation = {
      ...input,
      id: input.id ?? `pending:${Date.now().toString(36)}`,
      startedAt: input.startedAt ?? new Date().toISOString(),
      canonical: false,
    };
    setSelectedProjectId(input.projectId);
    setSelectedTopic(pending.id);
    setSelectedRun(null);
    setStream(null);
    setPendingDemandConversation(pending);
    pendingDemandRef.current = pending;
    navigation(portsRef.current).persistProjectId(input.projectId);
    navigation(portsRef.current).syncLocation(input.projectId, pending.id);
    return pending;
  }, []);

  const ensureProjectRegistered = useCallback(async (projectId: string): Promise<string | null> => {
    let status = stateRef.current.projects.find((item) => item.project?.id === projectId) ?? null;
    if (!status?.project) {
      reportError("请先选择一个项目。");
      return null;
    }
    let effectiveProjectId = status.project.id;
    if (!status.managed && status.memory?.registered === false) {
      const saved = await sessionApi(portsRef.current).registerProject(status.path);
      effectiveProjectId = saved.project.id;
      if (saved.status) {
        setProjects((current) => {
          const index = current.findIndex((candidate) => candidate.project?.id === saved.project.id);
          if (index < 0) return [...current, saved.status!];
          const next = [...current];
          next[index] = saved.status!;
          return next;
        });
      }
      status = saved.status ?? status;
    }
    if (status.managed && status.memory?.memoryAvailable === false) {
      reportError("项目历史不可用，请在项目设置的高级诊断中确认应用数据目录。");
      return null;
    }
    return effectiveProjectId;
  }, [reportError]);

  const createDemandConversation = useCallback(async (
    request: CreateDemandConversationInput,
    routeEvent: (projectId: string, event: WorkbenchLiveEvent) => void,
  ): Promise<{ projectId: string; conversationId: string }> => {
    const previousConversationId = stateRef.current.selectedTopic;
    let conversationId: string | null = null;
    let requestGeneration: number;
    if (request.showPendingBeforeCreate) {
      portsRef.current.ui?.restoreView({ orchestrationOpen: false, settingsOpen: false });
      beginPendingDemand({
        projectId: request.projectId,
        title: "新需求",
        body: request.body,
        selectedProviderId: request.providerId,
      });
      requestGeneration = requestGenerationRef.current;
    } else requestGeneration = ++requestGenerationRef.current;
    try {
      await sessionApi(portsRef.current).createDemandConversation(request, (event) => {
          if (requestGenerationRef.current !== requestGeneration) return;
          if (event.event === "topic.created") {
            conversationId = event.data.topic.conversationId ?? event.data.topic.id ?? event.data.topic.changeId ?? null;
          }
          routeEvent(request.projectId, event);
        });
      if (requestGenerationRef.current !== requestGeneration) throw new StaleSessionRequestError();
      if (!conversationId) throw new Error("Demand conversation was not created.");
      ++requestGenerationRef.current;
      setSelectedProjectId(request.projectId);
      setSelectedTopic(conversationId);
      setPendingDemandConversation(null);
      pendingDemandRef.current = null;
      navigation(portsRef.current).persistProjectId(request.projectId);
      navigation(portsRef.current).syncLocation(request.projectId, conversationId);
      return { projectId: request.projectId, conversationId };
    } catch (cause) {
      if (cause instanceof StaleSessionRequestError || requestGenerationRef.current !== requestGeneration) throw cause;
      ++requestGenerationRef.current;
      setPendingDemandConversation(null);
      pendingDemandRef.current = null;
      setSelectedTopic(previousConversationId);
      navigation(portsRef.current).syncLocation(stateRef.current.selectedProjectId, previousConversationId);
      throw cause;
    }
  }, [beginPendingDemand]);

  const acceptCanonicalConversation = useCallback((input: {
    projectId: string;
    conversationId: string;
    title: string;
    selectedProviderId?: string;
  }): void => {
    const pending = pendingDemandRef.current;
    if (!pending || pending.projectId !== input.projectId) return;
    ++requestGenerationRef.current;
    setSelectedProjectId(input.projectId);
    setSelectedTopic(input.conversationId);
    navigation(portsRef.current).persistProjectId(input.projectId);
    navigation(portsRef.current).syncLocation(input.projectId, input.conversationId);
    setPendingDemandConversation((current) => current && current.projectId === input.projectId
      ? {
        ...current,
        id: input.conversationId,
        title: input.title,
        canonical: true,
        selectedProviderId: input.selectedProviderId ?? current.selectedProviderId,
      }
      : null);
    pendingDemandRef.current = {
      ...pending,
      id: input.conversationId,
      title: input.title,
      canonical: true,
      selectedProviderId: input.selectedProviderId ?? pending.selectedProviderId,
    };
  }, []);

  const reconcileConversationTitle = useCallback((projectId: string, conversation: Topic): void => {
    const patchSnapshot = (current: Snapshot): Snapshot => ({
      ...current,
      left: {
        ...current.left,
        topics: current.left.topics.map((topic) => topic.id === conversation.id
          && canApplyConversationVersion(topic, conversation)
          ? { ...topic, ...conversation }
          : topic),
        workpads: current.left.workpads?.map((workpad) => workpad.id === conversation.id
          && canApplyConversationVersion(workpad, conversation)
          ? { ...workpad, title: conversation.title, updatedAt: conversation.updatedAt ?? workpad.updatedAt }
          : workpad),
      },
      center: {
        ...current.center,
        selectedTopic: current.center.selectedTopic?.id === conversation.id
          && canApplyConversationVersion(current.center.selectedTopic, conversation)
          ? { ...current.center.selectedTopic, title: conversation.title, updatedAt: conversation.updatedAt }
          : current.center.selectedTopic,
      },
    });
    if (stateRef.current.selectedProjectId === projectId) setSnapshot(patchSnapshot);
    setProjectSnapshots((current) => current[projectId]
      ? { ...current, [projectId]: patchSnapshot(current[projectId]!) }
      : current);
    setPendingDemandConversation((current) => current?.projectId === projectId && current.id === conversation.id
      && canApplyConversationVersion(current, conversation)
      ? { ...current, title: conversation.title, updatedAt: conversation.updatedAt }
      : current);
  }, []);

  const updateConversationTitle = useCallback(async (projectId: string, conversationId: string, title: string): Promise<void> => {
    const result = await sessionApi(portsRef.current).updateConversationTitle(projectId, conversationId, title);
    reconcileConversationTitle(projectId, result.conversation);
  }, [reconcileConversationTitle]);

  const completePendingDemand = useCallback((): void => {
    setPendingDemandConversation(null);
    pendingDemandRef.current = null;
  }, []);

  const cancelPendingDemand = useCallback((restoreConversationId: string | null): void => {
    ++requestGenerationRef.current;
    setPendingDemandConversation(null);
    pendingDemandRef.current = null;
    setSelectedTopic(restoreConversationId);
    navigation(portsRef.current).syncLocation(stateRef.current.selectedProjectId, restoreConversationId);
  }, []);

  const acceptSnapshot = useCallback((projectId: string, next: Snapshot): void => {
    if (stateRef.current.selectedProjectId !== projectId) return;
    const conversationId = next.center.selectedTopic?.id ?? null;
    const selectedConversationId = stateRef.current.selectedTopic;
    if (selectedConversationId && !selectedConversationId.startsWith("pending:") && conversationId !== selectedConversationId) return;
    setSnapshot(next);
    setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
    setPendingDemandConversation(null);
    pendingDemandRef.current = null;
  }, []);

  const updateSnapshot = useCallback((updater: (current: Snapshot) => Snapshot): void => {
    setSnapshot((current) => {
      const next = updater(current);
      const projectId = stateRef.current.selectedProjectId;
      if (projectId) setProjectSnapshots((cached) => ({ ...cached, [projectId]: next }));
      return next;
    });
  }, []);

  const cacheProjectSnapshot = useCallback((projectId: string, next: Snapshot): void => {
    setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
  }, []);

  const upsertProjectStatus = useCallback((status: ProjectStatus): void => {
    const projectId = status.project?.id;
    if (!projectId) return;
    setProjects((current) => {
      const index = current.findIndex((candidate) => candidate.project?.id === projectId);
      if (index < 0) return [...current, status];
      const next = [...current];
      next[index] = status;
      return next;
    });
  }, []);

  useEffect(() => {
    if (ports.autoLoad === false) return;
    loadApp().catch(reportError);
    return () => { requestGenerationRef.current += 1; };
  }, [loadApp, ports.autoLoad, reportError]);

  useEffect(() => {
    const projectId = selectedProjectId;
    if (!projectId) return;
    const runs = snapshot.center.agentLoop.runs;
    const runId = selectedRun ?? runs[0]?.id ?? null;
    if (!runId) {
      setSelectedRun(null);
      setStream(null);
      return;
    }
    if (runId !== selectedRun) setSelectedRun(runId);
    const generation = ++streamEffectGenerationRef.current;
    sessionApi(portsRef.current).loadStream(projectId, runId)
      .then((next) => {
        if (generation === streamEffectGenerationRef.current && stateRef.current.selectedProjectId === projectId) setStream(next);
      })
      .catch(reportError);
    return () => { streamEffectGenerationRef.current += 1; };
  }, [reportError, selectedProjectId, selectedRun, snapshot.center.agentLoop.runs]);

  return {
    projects,
    selectedProjectId,
    snapshot,
    selectedTopic,
    selectedRun,
    stream,
    expandedProjects,
    projectSnapshots,
    pendingDemandConversation,
    loadApp,
    refresh,
    openProject,
    beginNewConversation,
    toggleProjectFolder,
    chooseConversation,
    chooseRun,
    removeProject,
    hideConversation,
    beginPendingDemand,
    ensureProjectRegistered,
    createDemandConversation,
    acceptCanonicalConversation,
    reconcileConversationTitle,
    updateConversationTitle,
    completePendingDemand,
    cancelPendingDemand,
    acceptSnapshot,
    updateSnapshot,
    cacheProjectSnapshot,
    upsertProjectStatus,
  };
}

function canApplyConversationVersion(
  current: { title: string; updatedAt?: string },
  incoming: { title: string; updatedAt?: string },
): boolean {
  if (!current.updatedAt) return true;
  if (!incoming.updatedAt) return false;
  if (incoming.updatedAt > current.updatedAt) return true;
  return incoming.updatedAt === current.updatedAt && incoming.title === current.title;
}

const defaultApi: ProjectConversationSessionApi = {
  loadAppStatus: () => fetchJson<AppStatus>("/api/app/status"),
  loadProjects: async () => (await fetchJson<{ projects: ProjectStatus[] }>("/api/projects")).projects,
  loadSnapshot: (projectId, conversationId) => fetchJson<Snapshot>(
    `/api/projects/${encodeURIComponent(projectId)}/workbench/snapshot${conversationId ? `?topic=${encodeURIComponent(conversationId)}` : ""}`,
  ),
  loadStream: (projectId, runId) => fetchJson<StreamPacket>(
    `/api/projects/${encodeURIComponent(projectId)}/workbench/stream/${encodeURIComponent(runId)}`,
  ),
  removeProject: async (projectId) => { await postJson(`/api/projects/${encodeURIComponent(projectId)}/remove`, { confirm: true }); },
  hideConversation: async (projectId, conversationId) => {
    await postJson(`/api/projects/${encodeURIComponent(projectId)}/workbench/topics/${encodeURIComponent(conversationId)}/delete`, { confirm: true });
  },
  updateConversationTitle: (projectId, conversationId, title) => postJson(
    `/api/projects/${encodeURIComponent(projectId)}/workbench/topics/${encodeURIComponent(conversationId)}/title`,
    { title },
  ),
  registerProject: (path) => postJson("/api/projects", { path, confirm: true }),
  createDemandConversation: (input, onEvent) => consumeWorkbenchLiveStream<WorkbenchLiveEvent>(
    `/api/projects/${encodeURIComponent(input.projectId)}/workbench/topics/live`,
    {
      body: input.body,
      contextRefs: input.contextRefs,
      attachmentIds: input.attachmentIds,
      confirm: true,
      providerId: input.providerId,
    },
    onEvent,
  ),
};

function sessionApi(ports: ProjectConversationSessionPorts): ProjectConversationSessionApi {
  return { ...defaultApi, ...ports.api };
}

function navigation(ports: ProjectConversationSessionPorts) {
  return ports.navigation ?? defaultNavigation;
}

const defaultNavigation = {
  readRestoreParams: readWorkbenchRestoreParams,
  readPersistedProjectId(): string | null {
    try {
      const value = window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
      return value?.trim() || null;
    } catch {
      return null;
    }
  },
  persistProjectId(projectId: string): void {
    try { window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, projectId); } catch { /* preference only */ }
  },
  clearPersistedProjectId(): void {
    try { window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY); } catch { /* preference only */ }
  },
  syncLocation(projectId: string | null, conversationId: string | null): void {
    try {
      const url = new URL(window.location.href);
      if (projectId) url.searchParams.set("project", projectId);
      else url.searchParams.delete("project");
      if (projectId && conversationId && !conversationId.startsWith("pending:")) url.searchParams.set("topic", conversationId);
      else url.searchParams.delete("topic");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Session state remains usable without host History APIs.
    }
  },
};

function readWorkbenchRestoreParams(): WorkbenchRestoreParams {
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab")?.trim().toLowerCase();
    return {
      projectId: nonEmpty(params.get("project")),
      topicId: nonEmpty(params.get("topic")),
      orchestrationOpen: tab === "orchestration",
      settingsOpen: tab === "settings",
    };
  } catch {
    return { projectId: null, topicId: null, orchestrationOpen: false, settingsOpen: false };
  }
}

function nonEmpty(value: string | null): string | null {
  return value?.trim() || null;
}

function findProject(projects: ProjectStatus[], projectId: string | null): ProjectStatus | null {
  return projectId ? projects.find((item) => item.project?.id === projectId) ?? null : null;
}

function withoutProject<T>(values: Record<string, T>, projectId: string): Record<string, T> {
  const next = { ...values };
  delete next[projectId];
  return next;
}

function withoutSetValue(values: Set<string>, value: string): Set<string> {
  const next = new Set(values);
  next.delete(value);
  return next;
}

function defaultConfirmRemoveProject(projectName: string): boolean {
  return window.confirm(`移出“${projectName}”？\n\n只会从 App 项目列表移出，不会删除代码、不会修改 Git，也不会删除项目证据。之后可以重新添加。`);
}

export function snapshotForProject(project: ProjectStatus | null | undefined): Snapshot {
  if (!project?.project) return emptyWorkbenchSnapshot;
  return {
    ...emptyWorkbenchSnapshot,
    project: project.project,
    memory: {
      harnessReady: project.memory?.harnessReady ?? project.managed,
      memoryMode: project.memory?.memoryMode,
      artifactBase: project.memory?.artifactBase,
    },
    center: { ...emptyWorkbenchSnapshot.center, workpad: emptyWorkpad(projectDisplayName(project.project)) },
    warnings: project.managed ? [] : ["首次需求会根据项目情况建立必要工作说明。"],
  };
}

function newConversationSnapshot(base: Snapshot, status: ProjectStatus): Snapshot {
  return {
    ...base,
    center: {
      selectedTopic: null,
      workpad: emptyWorkpad(projectDisplayName(base.project ?? status.project, "当前项目")),
      thread: { items: [] },
      conversationInteractions: { items: [] },
      activeTab: "conversation",
      agentLoop: { runs: [] },
    },
    right: {
      ...base.right,
      decisionInspector: { primary: null, related: [], history: [] },
      confirmationQueue: { primary: null, current: [], otherDemands: [], maintenance: [], history: [] },
    },
  };
}

function emptyWorkpad(projectName = "未选择项目"): Workpad {
  return {
    title: "项目需求",
    subtitle: projectName,
    state: "diagnostic",
    userStatus: "later",
    userStatusLabel: "稍后处理",
    conversationLifecycle: "active",
    pendingFeedback: [],
    intake: {
      goal: "尚未选择可用需求对话。",
      currentUnderstanding: "选择项目并创建需求对话后，AHO 会在这里汇总目标、进度、证据和下一步。",
      source: "diagnostic",
      relatedArtifacts: [],
      missingInfo: [],
      confirmedConstraints: [],
      openQuestions: [],
      assumptions: [],
      pendingClarifications: [],
    },
    progress: {
      topicState: "none",
      spec: "unknown",
      plan: "unknown",
      tasks: "unknown",
      acCount: 0,
      taskCount: 0,
      runCount: 0,
    },
    tasks: [],
    codingPackages: [],
    taskGraph: { source: "missing", nodes: [], changeLevelEvidence: [], warnings: [] },
    evidence: [],
    blockers: [],
    warnings: [],
    nextAction: {
      id: "empty",
      label: "选择或创建需求对话",
      description: "先选择项目中的需求对话，或在输入框里创建新需求。",
      kind: "read-only",
      enabled: false,
      requiresConfirmation: false,
    },
  };
}

export const emptyWorkbenchSnapshot: Snapshot = {
  project: null,
  memory: {},
  left: { topics: [], workpads: [] },
  center: {
    selectedTopic: null,
    workpad: emptyWorkpad(),
    agentLoop: { runs: [] },
    thread: { items: [] },
    conversationInteractions: { items: [] },
    activeTab: "conversation",
  },
  right: {
    approvals: [],
    decisions: [],
    decisionInspector: { primary: null, related: [], history: [] },
    confirmationQueue: { primary: null, current: [], otherDemands: [], maintenance: [], history: [] },
  },
  harnessGaps: [],
  warnings: [],
};
