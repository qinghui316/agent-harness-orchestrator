import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type PointerEvent as ReactPointerEvent } from "react";
import { consumeWorkbenchLiveStream,
  fetchJson,
  postJson } from "./api.js";
import { MainConversationView,
  AgentRelationGraphPanel,
  RightToolRailShell,
  DecisionInspectorPane,
  BottomStatusBar,
  ProjectFilesPanel,
  ProjectGitPanel,
  RuntimeDiagnosticsRailPanel,
  ResourceWorkspacePanel,
  projectFileResourceTabs,
  workspaceResourceRequestScope,
  TerminalDock,
  WorkspaceDockToggleBar,
  type RightToolRailTab,
  type RightToolRailView,
  type TerminalTab,
} from "./panels/WorkbenchPanels.js";
import {
  ProjectConversationSidebar,
  TopicComposer,
  UnmanagedProjectView,
  currentWorkpadSummary,
} from "./shell/WorkbenchShellParts.js";
import {
  ProjectHomeView,
  ProjectReadinessHome,
  ProviderModelPicker,
} from "./panels/ProjectHome.js";
import { SettingsSurface, type SettingsSection } from "./panels/SettingsSurface.js";
import { workflowActionPayloadFromScope } from "./workflow-actions.js";
import {
  canonicalTimelineScopeKey,
  selectCanonicalTimelineSurface,
  selectCanonicalTimelineTranscript,
} from "./canonicalTimelineStore.js";
import { canonicalTimelineReconnectScopes, useCanonicalTimelineController } from "./canonicalTimelineController.js";

import {
  projectDisplayName,
  stateLabel,
} from "./formatters.js";
import type {
  AppStatus,
  ProviderDiagnostics,
  ProviderModelSettingsSnapshot,
  ProviderCapabilitySnapshot,
  ProjectStatus,
  Snapshot,
  AgentRelationGraph,
  ParentAgentTranscript,
  Workpad,
  DecisionAction,
  DecisionContext,
  StreamPacket,
  SkillListItem,
  WorkbenchLiveEvent,
  TopicAttachment,
  TopicFileReference,
  RuntimeActivityLogSnapshot,
  RuntimeDiagnosticsSnapshot,
  AgentWorkspaceAgent,
  CanonicalTimelineScope,
  CanonicalDocumentReference,
  ConversationInteractionSettlement,
  TextDocumentResource,
  WorkspaceResourceTab,
  WorkspaceResourceTarget,
} from "./types.js";
import { extractInlineSkillMentions } from "./shell/skill-mentions.js";
import { extractInlineFileMentions } from "./shell/file-mentions.js";
import { ConversationInteractionDock, type ConversationInteractionDraft } from "./panels/workbench/ConversationInteractionDock.js";

const emptySnapshot: Snapshot = {
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
    agentRelationGraph: emptyAgentRelationGraph(),
  },
  right: {
    approvals: [],
    decisions: [],
    decisionInspector: { primary: null, related: [], history: [] },
    confirmationQueue: { primary: null, current: [], otherDemands: [], maintenance: [], history: [] },
    agentWorkspace: { selectedAgentId: "planning-agent", agents: [] },
  },
  harnessGaps: [],
  warnings: [],
};

const SELECTED_PROJECT_STORAGE_KEY = "aho.workbench.selectedProjectId";
const LEFT_SIDEBAR_DEFAULT_WIDTH = 280;
const LEFT_SIDEBAR_MIN_WIDTH = 220;
const LEFT_SIDEBAR_MAX_WIDTH = 420;
const RIGHT_RAIL_DEFAULT_WIDTH = 320;
const RIGHT_RAIL_MIN_WIDTH = 280;
const RIGHT_RAIL_MAX_WIDTH = 560;
const AGENT_PROJECTION_REFRESH_DELAY_MS = 180;
const AGENT_PROJECTION_MAX_RETRIES = 8;
type BottomDockKind = "terminal" | null;
type PendingDemandConversation = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  startedAt: string;
  canonical: boolean;
  selectedProviderId?: string;
};

function isSkillActiveForComposer(skill: SkillListItem, topicId: string | null, draftOverrides: Record<string, boolean>): boolean {
  if (topicId) {
    if (skill.disabledTopics.includes(topicId)) return false;
    return skill.enabledProject || skill.enabledTopics.includes(topicId);
  }
  const draftOverride = draftOverrides[skill.skillId];
  if (draftOverride !== undefined) return draftOverride;
  return skill.enabledProject;
}

function activeComposerSkillIds(skills: SkillListItem[], topicId: string | null, draftOverrides: Record<string, boolean>): string[] {
  return skills.filter((skill) => isSkillActiveForComposer(skill, topicId, draftOverrides)).map((skill) => skill.skillId);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointerClientX(event: { clientX?: number; pageX?: number; screenX?: number }): number {
  if (Number.isFinite(event.clientX)) return event.clientX ?? 0;
  if (Number.isFinite(event.pageX)) return event.pageX ?? 0;
  if (Number.isFinite(event.screenX)) return event.screenX ?? 0;
  return 0;
}

export function App(): ReactElement {
  const [projects, setProjects] = useState<ProjectStatus[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamPacket | null>(null);
  const [orchestrationOpen, setOrchestrationOpen] = useState(false);
  const [selectedAgentGraphNodeId, setSelectedAgentGraphNodeId] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectSnapshots, setProjectSnapshots] = useState<Record<string, Snapshot>>({});
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [projectMenuMode, setProjectMenuMode] = useState<"closed" | "add" | "new">("closed");
  const [projectDetailsId, setProjectDetailsId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("basic");
  const [homeComposerResetToken, setHomeComposerResetToken] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selectedDecisionContextId, setSelectedDecisionContextId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeline = useCanonicalTimelineController(setError);
  const [composerText, setComposerText] = useState("");
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const interactionDraftsRef = useRef<Record<string, ConversationInteractionDraft>>({});
  const [workspaceResourceTabs, setWorkspaceResourceTabs] = useState<WorkspaceResourceTab[]>([]);
  const [workspaceDocuments, setWorkspaceDocuments] = useState<Record<string, TextDocumentResource>>({});
  const [workspaceResourceErrors, setWorkspaceResourceErrors] = useState<Record<string, string>>({});
  const [loadingWorkspaceResourceIds, setLoadingWorkspaceResourceIds] = useState<string[]>([]);
  const [loadedAgentRelationGraph, setLoadedAgentRelationGraph] = useState<AgentRelationGraph | null>(null);
  const [agentGraphLoadState, setAgentGraphLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [agentGraphLoadError, setAgentGraphLoadError] = useState<string | null>(null);
  const [agentGraphReloadVersion, setAgentGraphReloadVersion] = useState(0);
  const [pendingDemandConversation, setPendingDemandConversation] = useState<PendingDemandConversation | null>(null);
  const [providerDiagnostics, setProviderDiagnostics] = useState<ProviderDiagnostics | null>(null);
  const [providerModelSettings, setProviderModelSettings] = useState<ProviderModelSettingsSnapshot | null>(null);
  const [providerCapabilities, setProviderCapabilities] = useState<ProviderCapabilitySnapshot[]>([]);
  const [composerProviderId, setComposerProviderId] = useState<string | null>(null);
  const [providerModelPickerOpen, setProviderModelPickerOpen] = useState(false);
  const [providerModelSettingsBusy, setProviderModelSettingsBusy] = useState(false);
  const [providerModelSettingsMessage, setProviderModelSettingsMessage] = useState<string | null>(null);
  const [skillItems, setSkillItems] = useState<SkillListItem[]>([]);
  const [draftSkillOverrides, setDraftSkillOverrides] = useState<Record<string, boolean>>({});
  const [composerFileRefs, setComposerFileRefs] = useState<TopicFileReference[]>([]);
  const [composerAttachments, setComposerAttachments] = useState<TopicAttachment[]>([]);
  const [selectedGitDiffPath, setSelectedGitDiffPath] = useState<string | null>(null);
  const [bottomDockKind, setBottomDockKind] = useState<BottomDockKind>(null);
  const [terminalDockHeight, setTerminalDockHeight] = useState(280);
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<RuntimeDiagnosticsSnapshot | null>(null);
  const [runtimeDiagnosticsLoading, setRuntimeDiagnosticsLoading] = useState(false);
  const [runtimeActivityLog, setRuntimeActivityLog] = useState<RuntimeActivityLogSnapshot | null>(null);
  const [runtimeActivityLogLoading, setRuntimeActivityLogLoading] = useState(false);
  const [decisionPaneCollapsed, setDecisionPaneCollapsed] = useState(true);
  const [rightToolView, setRightToolView] = useState<RightToolRailView>("launcher");
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(LEFT_SIDEBAR_DEFAULT_WIDTH);
  const [rightToolRailWidth, setRightToolRailWidth] = useState(RIGHT_RAIL_DEFAULT_WIDTH);
  const [selectedWorkspaceResourceId, setSelectedWorkspaceResourceId] = useState<string | null>(null);
  const [projectionVersion, setProjectionVersion] = useState(0);
  const [latestHidden, setLatestHidden] = useState(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const threadPinnedToBottomRef = useRef(true);
  const handledTimelineMutationRef = useRef<string | null>(null);
  const agentProjectionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAgentSurfaceRefreshesRef = useRef(new Map<string, number>());
  const agentProjectionContextRef = useRef<string | null>(null);
  const graphScopeRef = useRef<string | null>(null);
  const workspaceResourceRequestCounterRef = useRef(0);
  const workspaceResourceRequestTokensRef = useRef(new Map<string, number>());
  const workspaceResourceScopeRef = useRef("");
  const selectedProjectIdRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (agentProjectionRefreshTimerRef.current) clearTimeout(agentProjectionRefreshTimerRef.current);
    agentProjectionRefreshTimerRef.current = null;
    agentProjectionContextRef.current = null;
    pendingAgentSurfaceRefreshesRef.current.clear();
  }, []);
  const selectedComposerSkillIds = useMemo(
    () => activeComposerSkillIds(skillItems, selectedTopic, draftSkillOverrides),
    [draftSkillOverrides, selectedTopic, skillItems],
  );
  const enabledSkillCount = selectedComposerSkillIds.length;

  const appShellStyle = !settingsOpen ? ({
    "--left-sidebar-width": `${leftSidebarWidth}px`,
    "--right-rail-width": decisionPaneCollapsed ? "48px" : `${rightToolRailWidth}px`,
  } as CSSProperties) : undefined;

  function beginShellColumnResize(event: ReactPointerEvent, side: "left" | "right"): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = pointerClientX(event);
    const startWidth = side === "left" ? leftSidebarWidth : rightToolRailWidth;
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "ew-resize";
    document.body.classList.add("is-resizing-column");
    function onPointerMove(moveEvent: PointerEvent): void {
      const delta = pointerClientX(moveEvent) - startX;
      if (side === "left") {
        setLeftSidebarWidth(clampNumber(startWidth + delta, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH));
      } else {
        setRightToolRailWidth(clampNumber(startWidth - delta, RIGHT_RAIL_MIN_WIDTH, RIGHT_RAIL_MAX_WIDTH));
      }
    }
    function onPointerUp(): void {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.body.style.cursor = previousCursor;
      document.body.classList.remove("is-resizing-column");
    }
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
    document.addEventListener("pointercancel", onPointerUp, { once: true });
  }

  function ensureTerminalTab(): string {
    if (activeTerminalId && terminalTabs.some((tab) => tab.id === activeTerminalId)) return activeTerminalId;
    const id = `terminal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setTerminalTabs((current) => [...current, { id, title: `终端 ${current.length + 1}` }]);
    setActiveTerminalId(id);
    return id;
  }

  function openTerminalDock(): void {
    ensureTerminalTab();
    setBottomDockKind("terminal");
  }

  function toggleTerminalDock(): void {
    if (bottomDockKind === "terminal") {
      setBottomDockKind(null);
      return;
    }
    openTerminalDock();
  }

  function createTerminalTab(): void {
    const id = `terminal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setTerminalTabs((current) => [...current, { id, title: `终端 ${current.length + 1}` }]);
    setActiveTerminalId(id);
    setBottomDockKind("terminal");
  }

  function closeTerminalTab(id: string): void {
    if (selectedProjectId) {
      void fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/terminal/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
    setTerminalTabs((current) => {
      const next = current.filter((tab) => tab.id !== id);
      if (activeTerminalId === id) setActiveTerminalId(next[0]?.id ?? null);
      if (next.length === 0 && bottomDockKind === "terminal") setBottomDockKind(null);
      return next;
    });
  }

  async function loadRuntimeDiagnostics(projectId = selectedProjectId): Promise<void> {
    setRuntimeDiagnosticsLoading(true);
    try {
      const path = projectId
        ? `/api/projects/${encodeURIComponent(projectId)}/runtime/diagnostics`
        : "/api/runtime/diagnostics";
      setRuntimeDiagnostics(await fetchJson<RuntimeDiagnosticsSnapshot>(path));
    } catch (cause) {
      setRuntimeDiagnostics({
        generatedAt: new Date().toISOString(),
        summary: { status: "error", issueCount: 1, degradedCount: 0 },
        items: [{
          id: "diagnostics:load-error",
          title: "诊断读取失败",
          status: "error",
          summary: "无法读取运行诊断。",
          detail: cause instanceof Error ? cause.message : String(cause),
        }],
      });
    } finally {
      setRuntimeDiagnosticsLoading(false);
    }
  }

  async function loadRuntimeActivityLog(projectId = selectedProjectId, topicId = activeTopic?.id ?? null): Promise<void> {
    if (!projectId) {
      setRuntimeActivityLog(null);
      return;
    }
    setRuntimeActivityLogLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (topicId) params.set("topicId", topicId);
      setRuntimeActivityLog(await fetchJson<RuntimeActivityLogSnapshot>(
        `/api/projects/${encodeURIComponent(projectId)}/runtime/activity?${params.toString()}`,
      ));
    } catch (cause) {
      const generatedAt = new Date().toISOString();
      setRuntimeActivityLog({
        generatedAt,
        projectId,
        topicId,
        limit: 100,
        truncated: false,
        items: [{
          id: "runtime-activity:load-error",
          timestamp: generatedAt,
          type: "action-error",
          severity: "error",
          title: "运行日志读取失败",
          summary: cause instanceof Error ? cause.message : String(cause),
          refs: [],
        }],
      });
    } finally {
      setRuntimeActivityLogLoading(false);
    }
  }

  async function loadApp(): Promise<void> {
    const restore = readWorkbenchRestoreParams();
    const status = await fetchJson<AppStatus>("/api/app/status");
    const list = await fetchJson<{ projects: ProjectStatus[] }>("/api/projects");
    setProjects(list.projects);
    const findProject = (projectId: string | null): ProjectStatus | null => projectId
      ? list.projects.find((item) => item.project?.id === projectId) ?? null
      : null;
    const urlProjectStatus = findProject(restore.projectId);
    if (restore.projectId && !urlProjectStatus) {
      setSelectedProjectId(null);
      setSelectedTopic(null);
      setSnapshot(emptySnapshot);
      return;
    }
    const restoredProject = readPersistedSelectedProjectId();
    const restoredProjectStatus = findProject(restoredProject);
    const directProjectStatus = findProject(status.directProjectId);
    const selectedStatus = urlProjectStatus ?? restoredProjectStatus ?? directProjectStatus;
    const selectedProject = selectedStatus?.project?.id ?? null;
    if (selectedProject) {
      setSelectedProjectId(selectedProject);
      persistSelectedProjectId(selectedProject);
      setExpandedProjects(new Set([selectedProject]));
      const topic = restore.topicId && (restore.projectId || urlProjectStatus) ? restore.topicId : null;
      setSelectedTopic(topic);
      setOrchestrationOpen(Boolean(topic && restore.orchestrationOpen));
      if (restore.settingsOpen) {
        setSettingsSection("basic");
        setSettingsOpen(true);
      }
      if (selectedStatus?.managed) await refresh(selectedProject, topic);
      else setSnapshot(snapshotForProject(selectedStatus));
      return;
    }
    if (restoredProject) clearPersistedSelectedProjectId();
    if (restore.settingsOpen) {
      setSettingsSection("basic");
      setSettingsOpen(true);
    }
  }

  async function loadProviderDiagnostics(projectId = selectedProjectId, requestedProviderId?: string): Promise<void> {
    const providerId = requestedProviderId ?? providerDiagnostics?.providerId ?? await resolveDefaultProviderId();
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/providers/${encodeURIComponent(providerId)}/diagnostics`
      : `/api/providers/${encodeURIComponent(providerId)}/diagnostics`;
    const diagnostics = await fetchJson<unknown>(path);
    setProviderDiagnostics(isProviderDiagnostics(diagnostics) ? diagnostics : null);
  }

  async function loadProviderModelSettings(projectId = selectedProjectId, requestedProviderId?: string): Promise<void> {
    const providerId = requestedProviderId ?? providerDiagnostics?.providerId ?? providerModelSettings?.providerId ?? await resolveDefaultProviderId();
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/providers/${encodeURIComponent(providerId)}/models`
      : `/api/providers/${encodeURIComponent(providerId)}/models`;
    const payload = await fetchJson<unknown>(path);
    setProviderModelSettings(isProviderModelSettingsSnapshot(payload) ? payload : null);
  }

  async function loadProviderCapabilities(projectId = selectedProjectId): Promise<void> {
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/providers/capabilities`
      : "/api/providers/capabilities";
    const payload = await fetchJson<{ providers?: unknown[] }>(path);
    const providers = Array.isArray(payload.providers) ? payload.providers.filter(isProviderCapabilitySnapshot) : [];
    setProviderCapabilities(providers);
    setComposerProviderId((current) => current ?? (providers.length === 1 ? providers[0]!.providerId : null));
  }

  async function selectComposerProvider(providerId: string): Promise<void> {
    if (providerId === composerProviderId) return;
    setComposerProviderId(providerId);
    await Promise.all([
      loadProviderDiagnostics(selectedProjectId, providerId),
      loadProviderModelSettings(selectedProjectId, providerId),
    ]);
  }

  async function loadSkillSummary(projectId = selectedProjectId, topicId = selectedTopic): Promise<void> {
    void topicId;
    if (!projectId) {
      setSkillItems([]);
      return;
    }
    const status = projects.find((item) => item.project?.id === projectId);
    if (!status?.managed) {
      setSkillItems([]);
      return;
    }
    const payload = await fetchJson<{ skills?: SkillListItem[] }>(`/api/projects/${encodeURIComponent(projectId)}/skills`);
    setSkillItems(Array.isArray(payload.skills) ? payload.skills : []);
  }

  async function refresh(projectId = selectedProjectId, topic = selectedTopic): Promise<Snapshot | void> {
    if (!projectId) {
      const list = await fetchJson<{ projects: ProjectStatus[] }>("/api/projects");
      setProjects(list.projects);
      return;
    }
    const list = await fetchJson<{ projects: ProjectStatus[] }>("/api/projects");
    setProjects(list.projects);
    const status = list.projects.find((item) => item.project?.id === projectId);
    if (!status?.managed) {
      setSnapshot(snapshotForProject(status));
      setStream(null);
      return;
    }
    const query = topic ? `?topic=${encodeURIComponent(topic)}` : "";
    const next = await fetchJson<Snapshot>(`/api/projects/${encodeURIComponent(projectId)}/workbench/snapshot${query}`);
    setSnapshot(next);
    invalidateProjectionCache();
    setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
    const runId = selectedRun ?? next.center.agentLoop.runs[0]?.id ?? null;
    setSelectedRun(runId);
    if (runId) setStream(await fetchJson<StreamPacket>(`/api/projects/${encodeURIComponent(projectId)}/workbench/stream/${encodeURIComponent(runId)}`));
    return next;
  }

  useEffect(() => {
    loadApp().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const projectId = selectedProjectId;
    const projectDefaultProviderId = projects.find((item) => item.project?.id === projectId)?.project?.defaultProviderId;
    fetchJson<{ providers?: unknown[] }>(projectId ? `/api/projects/${encodeURIComponent(projectId)}/providers/capabilities` : "/api/providers/capabilities")
      .then(async (payload) => {
        const providers = Array.isArray(payload.providers) ? payload.providers.filter(isProviderCapabilitySnapshot) : [];
        const providerId = projectDefaultProviderId && providers.some((provider) => provider.providerId === projectDefaultProviderId)
          ? projectDefaultProviderId
          : providers.length === 1 ? providers[0]!.providerId : null;
        if (!providerId) return { providers, diagnostics: null, models: null };
        const [diagnostics, models] = await Promise.all([
          fetchJson<unknown>(projectId ? `/api/projects/${encodeURIComponent(projectId)}/providers/${encodeURIComponent(providerId)}/diagnostics` : `/api/providers/${encodeURIComponent(providerId)}/diagnostics`),
          fetchJson<unknown>(projectId ? `/api/projects/${encodeURIComponent(projectId)}/providers/${encodeURIComponent(providerId)}/models` : `/api/providers/${encodeURIComponent(providerId)}/models`),
        ]);
        return { providers, diagnostics, models };
      })
      .then(({ diagnostics, models, providers }) => {
        if (cancelled) return;
        setProviderDiagnostics(isProviderDiagnostics(diagnostics) ? diagnostics : null);
        setProviderModelSettings(isProviderModelSettingsSnapshot(models) ? models : null);
        setProviderCapabilities(providers);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [selectedProjectId, projects]);

  useEffect(() => {
    loadSkillSummary().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [selectedProjectId, selectedTopic, projects]);

  async function openProject(projectId: string): Promise<void> {
    setSelectedProjectId(projectId);
    persistSelectedProjectId(projectId);
    setExpandedProjects((current) => new Set([...current, projectId]));
    setSelectedTopic(null);
    syncWorkbenchLocation(projectId, null);
    clearTopicScopedLiveState({ preserveProjectFiles: projectId === selectedProjectId });
    setDraftSkillOverrides({});
    setComposerAttachments([]);
    setComposerFileRefs([]);
    setRuntimeActivityLog(null);
    setOrchestrationOpen(false);
    setSelectedRun(null);
    setStream(null);
    const status = projects.find((item) => item.project?.id === projectId);
    if (!status?.managed) {
      const next = snapshotForProject(status);
      setSnapshot(next);
      setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
      return;
    }
    await refresh(projectId, null);
  }

  async function beginNewConversation(projectId = selectedProjectId ?? undefined): Promise<void> {
    if (!projectId) {
      setError("请先选择项目，再在该项目下新建需求对话。");
      return;
    }
    const status = projects.find((item) => item.project?.id === projectId);
    if (!status?.managed) {
      setError("请先初始化这个项目，再新建需求对话。");
      return;
    }
    const baseSnapshot = projectSnapshots[projectId] ?? (status.project?.id === selectedProjectId ? snapshot : await fetchJson<Snapshot>(`/api/projects/${encodeURIComponent(projectId)}/workbench/snapshot`));
    setComposerText("");
    setComposerFileRefs([]);
    setComposerAttachments([]);
    setHomeComposerResetToken((value) => value + 1);
    setSelectedProjectId(projectId);
    persistSelectedProjectId(projectId);
    setSelectedTopic(null);
    syncWorkbenchLocation(projectId, null);
    clearTopicScopedLiveState({ preserveProjectFiles: projectId === selectedProjectId });
    setDraftSkillOverrides({});
    setOrchestrationOpen(false);
    setExpandedProjects((current) => new Set([...current, projectId]));
    const nextSnapshot = {
      ...baseSnapshot,
      center: {
        selectedTopic: null,
        workpad: emptyWorkpad(projectDisplayName(baseSnapshot.project ?? status.project, "当前项目")),
        thread: { items: [] },
        conversationInteractions: { items: [] },
        activeTab: "conversation" as const,
        agentLoop: { runs: [] },
        agentRelationGraph: emptyAgentRelationGraph(),
      },
      right: {
        ...baseSnapshot.right,
        decisionInspector: { primary: null, related: [], history: [] },
        confirmationQueue: { primary: null, current: [], otherDemands: [], maintenance: [], history: [] },
        agentWorkspace: { selectedAgentId: "planning-agent", agents: [] },
      },
    };
    setSnapshot(nextSnapshot);
    setProjectSnapshots((current) => ({ ...current, [projectId]: nextSnapshot }));
  }

  async function toggleProjectFolder(projectId: string): Promise<void> {
    const shouldOpen = !expandedProjects.has(projectId);
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (shouldOpen) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
    if (shouldOpen && !projectSnapshots[projectId]) {
      const status = projects.find((item) => item.project?.id === projectId);
      if (status?.managed) {
        const next = await fetchJson<Snapshot>(`/api/projects/${encodeURIComponent(projectId)}/workbench/snapshot`);
        setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
      }
    }
  }

  async function chooseConversation(projectId: string, conversationId: string): Promise<void> {
    setSelectedProjectId(projectId);
    persistSelectedProjectId(projectId);
    setSelectedTopic(conversationId);
    syncWorkbenchLocation(projectId, conversationId);
    clearTopicScopedLiveState({ preserveProjectFiles: projectId === selectedProjectId });
    setDraftSkillOverrides({});
    setComposerAttachments([]);
    setComposerFileRefs([]);
    setExpandedProjects((current) => new Set([...current, projectId]));
    setSelectedRun(null);
    setStream(null);
    invalidateProjectionCache();
    await refresh(projectId, conversationId);
  }

  async function removeProject(projectId: string): Promise<void> {
    const status = projects.find((item) => item.project?.id === projectId);
    const name = projectDisplayName(status?.project, projectId);
    const ok = window.confirm(`移出“${name}”？\n\n只会从 App 项目列表移出，不会删除代码、不会修改 Git，也不会删除项目证据。之后可以重新添加。`);
    if (!ok) return;
    await postJson(`/api/projects/${encodeURIComponent(projectId)}/remove`, { confirm: true });
    timeline.clearProject(projectId);
    if (selectedProjectId === projectId) {
      clearPersistedSelectedProjectId();
      setSelectedProjectId(null);
      setSelectedTopic(null);
      syncWorkbenchLocation(null, null);
      setSnapshot(emptySnapshot);
      setProjectSnapshots((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
    }
    await loadApp();
  }

  async function hideConversation(projectId: string, conversationId: string): Promise<void> {
    await postJson(`/api/projects/${encodeURIComponent(projectId)}/workbench/topics/${encodeURIComponent(conversationId)}/delete`, { confirm: true });
    const topicToRefresh = selectedProjectId === projectId && selectedTopic !== conversationId ? selectedTopic : null;
    if (selectedProjectId === projectId && selectedTopic === conversationId) {
      setSelectedTopic(null);
      syncWorkbenchLocation(projectId, null);
    }
    timeline.clearConversation(projectId, conversationId);
    await refresh(projectId, topicToRefresh);
  }

  async function ensureProjectRegisteredForDemand(projectId: string): Promise<string | null> {
    let status = projects.find((item) => item.project?.id === projectId) ?? null;
    if (!status?.project) {
      setError("请先选择一个项目。");
      return null;
    }

    let effectiveProjectId = status.project.id;
    if (!status.managed && status.memory?.registered === false) {
      const saved = await postJson<{ project: { id: string }; status?: ProjectStatus }>("/api/projects", {
        path: status.path,
        confirm: true,
      });
      effectiveProjectId = saved.project.id;
      setSelectedProjectId(effectiveProjectId);
      persistSelectedProjectId(effectiveProjectId);
      setExpandedProjects((current) => new Set([...current, effectiveProjectId]));
      status = saved.status ?? status;
    }

    if (status.managed && status.memory?.memoryAvailable === false) {
      setError("项目历史不可用，请在项目设置的高级诊断中确认应用数据目录。");
      return null;
    }

    return effectiveProjectId;
  }

  async function chooseRun(runId: string): Promise<void> {
    if (!selectedProjectId) return;
    setSelectedRun(runId);
    setStream(await fetchJson<StreamPacket>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/stream/${encodeURIComponent(runId)}`));
  }

  async function executeDecisionAction(action: DecisionAction, context: DecisionContext): Promise<void> {
    if (!selectedProjectId || !action.enabled) return;
    if (action.kind === "approval" && action.action) {
      const body = action.options
        ? { action: action.action, confirm: true, options: action.options }
        : { action: action.action, confirm: true };
      const result = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!result.ok) throw new Error(await result.text());
      setConfirming(null);
      await refresh();
      return;
    }
    if (action.kind === "workflow-action" && action.actionType) {
      await runWorkflowAction(action.actionType, workflowActionPayloadFromScope(action, { changeId: action.changeId ?? context.changeId, worktreeId: action.worktreeId ?? context.targetId }));
      return;
    }
    if (action.kind === "abandon") {
      const result = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          abandon: {
            changeId: context.changeId,
            reason: "用户选择放弃这个需求。",
          },
          confirm: true,
          feedbackContext: {
            contextId: context.id,
            changeId: context.changeId,
            targetId: context.targetId,
            runId: context.runId,
          },
        }),
      });
      if (!result.ok) throw new Error(await result.text());
      setConfirming(null);
      await refresh();
      return;
    }
    if (action.kind === "evidence" && context.runId) {
      await chooseRun(context.runId);
      setOrchestrationOpen(true);
    }
  }

  function openSettings(section: SettingsSection = "basic"): void {
    setSettingsSection(section);
    setSettingsOpen(true);
    if (section === "skills") {
      loadSkillSummary().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    }
  }

  function closeSettings(): void {
    setSettingsOpen(false);
  }

  function changeSettingsSection(section: SettingsSection): void {
    setSettingsSection(section);
    if (section === "skills") {
      loadSkillSummary().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    }
  }

  async function openProviderModelPicker(): Promise<void> {
    setProviderModelPickerOpen(true);
    setProviderModelSettingsMessage(null);
    try {
      await loadProviderModelSettings();
    } catch (cause) {
      setProviderModelSettingsMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function updateProviderModelSettings(body: unknown): Promise<void> {
    setProviderModelSettingsBusy(true);
    setProviderModelSettingsMessage(null);
    try {
      const providerId = providerDiagnostics?.providerId ?? providerModelSettings?.providerId ?? await resolveDefaultProviderId();
      const path = selectedProjectId
        ? `/api/projects/${encodeURIComponent(selectedProjectId)}/providers/${encodeURIComponent(providerId)}/models`
        : `/api/providers/${encodeURIComponent(providerId)}/models`;
      const payload = await postJson<unknown>(path, body);
      setProviderModelSettings(isProviderModelSettingsSnapshot(payload) ? payload : null);
      await loadProviderDiagnostics();
      await loadProviderCapabilities();
    } catch (cause) {
      setProviderModelSettingsMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProviderModelSettingsBusy(false);
    }
  }

  async function requestDecisionFeedback(context: DecisionContext, action: DecisionAction, feedback: string): Promise<void> {
    if (!selectedProjectId || !feedback.trim()) return;
    if (action.actionType) {
      await runWorkflowAction(action.actionType, {
        ...workflowActionPayloadFromScope(action, { changeId: action.changeId ?? context.changeId, worktreeId: action.worktreeId ?? context.targetId }),
        feedback: feedback.trim(),
      });
      return;
    }
    const result = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: action.action,
        feedback: feedback.trim(),
        feedbackContext: {
          contextId: context.id,
          actionId: action.id,
          actionKind: action.kind,
          actionType: action.actionType,
          approvalActionId: action.action?.actionId,
          approvalId: action.approvalId,
          changeId: context.changeId,
          targetId: context.targetId,
          runId: context.runId,
          worktreeId: action.worktreeId ?? context.targetId,
          applyCheckId: action.applyCheckId,
          landingPackageId: action.landingPackageId,
          artifact: action.artifact ?? context.artifact,
        },
      }),
    });
    if (!result.ok) throw new Error(await result.text());
    await refresh();
  }

  async function applyTopicSkillOverrides(topicId: string, overrides: Record<string, boolean>, projectId = selectedProjectId): Promise<void> {
    if (!projectId) return;
    for (const [skillId, enabled] of Object.entries(overrides)) {
      await postJson(`/api/projects/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(skillId)}/enable`, { enabled, topic: topicId });
    }
  }

  function resolveComposerTextWithSkills(body: string): { text: string; overrides: Record<string, boolean> } {
    const extracted = extractInlineSkillMentions(body, skillItems);
    const overrides: Record<string, boolean> = selectedTopic ? {} : { ...draftSkillOverrides };
    for (const skillId of extracted.skillIds) overrides[skillId] = true;
    return { text: extracted.cleanedText.trim(), overrides };
  }

  function resolveComposerTextWithContext(body: string, selectedRefs: TopicFileReference[] = composerFileRefs): { text: string; overrides: Record<string, boolean>; contextRefs: TopicFileReference[] } {
    const fileExtraction = extractInlineFileMentions(body, selectedRefs);
    const skillExtraction = resolveComposerTextWithSkills(fileExtraction.cleanedText);
    return {
      text: skillExtraction.text,
      overrides: skillExtraction.overrides,
      contextRefs: fileExtraction.refs,
    };
  }

  async function toggleComposerSkill(skillId: string): Promise<void> {
    if (!selectedProjectId) return;
    const currentlyActive = selectedComposerSkillIds.includes(skillId);
    if (selectedTopic) {
      await postJson(`/api/projects/${encodeURIComponent(selectedProjectId)}/skills/${encodeURIComponent(skillId)}/enable`, { enabled: !currentlyActive, topic: selectedTopic });
      await loadSkillSummary(selectedProjectId, selectedTopic);
      return;
    }
    setDraftSkillOverrides((current) => ({ ...current, [skillId]: !currentlyActive }));
  }

  async function uploadFilesForProject(projectId: string, files: File[]): Promise<TopicAttachment[]> {
    if (files.length === 0) return [];
    const uploaded: TopicAttachment[] = [];
    try {
      for (const file of files) {
        const data = await readFileAsDataUrl(file);
        const payload = await postJson<{ attachment: TopicAttachment }>(
          `/api/projects/${encodeURIComponent(projectId)}/attachments`,
          { fileName: file.name, mediaType: file.type || "application/octet-stream", data },
        );
        uploaded.push({
          ...payload.attachment,
          previewUrl: payload.attachment.kind === "image" ? data : undefined,
        });
      }
      return uploaded;
    } catch (cause) {
      await Promise.all(uploaded.map((attachment) => deleteAttachmentForProject(projectId, attachment.id)));
      throw cause;
    }
  }

  async function uploadComposerFiles(files: File[]): Promise<TopicAttachment[]> {
    if (!selectedProjectId || files.length === 0) return [];
    return uploadFilesForProject(selectedProjectId, files);
  }

  async function appendComposerAttachments(files: File[]): Promise<TopicAttachment[]> {
    try {
      const uploaded = await uploadComposerFiles(files);
      setComposerAttachments((current) => mergeTopicAttachments(current, uploaded));
      return uploaded;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return [];
    }
  }

  async function removeComposerAttachment(attachmentId: string): Promise<void> {
    setComposerAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    if (!selectedProjectId) return;
    await deleteAttachmentForProject(selectedProjectId, attachmentId);
  }

  async function deleteAttachmentForProject(projectId: string, attachmentId: string): Promise<void> {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await response.text());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function createTopicFromText(body: string, fileRefs: TopicFileReference[] = [], attachmentIds: string[] = [], attachmentFiles: File[] = []): Promise<void> {
    if (!selectedProjectId || (!body.trim() && attachmentIds.length === 0 && attachmentFiles.length === 0)) return;
    setActionRunning("topic.create");
    let uploadedDraft: TopicAttachment[] = [];
    let draftUploadProjectId: string | null = null;
    let createdTopicId: string | null = null;
    const previousSelectedTopic = selectedTopic;
    try {
      const resolved = resolveComposerTextWithContext(body, fileRefs);
      const demandBody = resolved.text || defaultAttachmentPrompt(attachmentIds.length + attachmentFiles.length);
      if (!demandBody && attachmentIds.length === 0 && attachmentFiles.length === 0) return;
      if (providerCapabilities.length > 1 && !composerProviderId) {
        setError("请先选择本次对话使用的 Agent。");
        return;
      }
      const title = demandBody.split(/\r?\n/)[0].slice(0, 60);
      const effectiveProjectId = await ensureProjectRegisteredForDemand(selectedProjectId);
      if (!effectiveProjectId) return;
      const showPendingBeforeCreate = attachmentFiles.length === 0;
      const pendingConversation: PendingDemandConversation = {
        id: `pending:${Date.now().toString(36)}`,
        projectId: effectiveProjectId,
        title,
        body: demandBody,
        startedAt: new Date().toISOString(),
        canonical: false,
        selectedProviderId: composerProviderId ?? undefined,
      };
      if (showPendingBeforeCreate) {
        setOrchestrationOpen(false);
        setSelectedProjectId(effectiveProjectId);
        persistSelectedProjectId(effectiveProjectId);
        setSelectedTopic(pendingConversation.id);
        setPendingDemandConversation(pendingConversation);
        setLoadedAgentRelationGraph(null);
      }
      draftUploadProjectId = effectiveProjectId;
      uploadedDraft = await uploadFilesForProject(effectiveProjectId, attachmentFiles);
      const finalAttachmentIds = [...attachmentIds, ...uploadedDraft.map((attachment) => attachment.id)];
      await consumeWorkbenchLiveStream<WorkbenchLiveEvent>(`/api/projects/${encodeURIComponent(effectiveProjectId)}/workbench/topics/live`, {
        title,
        body: demandBody,
        contextRefs: resolved.contextRefs,
        attachmentIds: finalAttachmentIds,
        confirm: true,
        providerId: composerProviderId ?? undefined,
      }, (event) => {
        if (event.event === "topic.created") {
          const createdId = event.data.topic.conversationId ?? event.data.topic.id ?? event.data.topic.changeId;
          if (!createdId) throw new Error("Conversation was created without an id.");
          createdTopicId = createdId;
          setSelectedProjectId(effectiveProjectId);
          persistSelectedProjectId(effectiveProjectId);
          setSelectedTopic(createdId);
          syncWorkbenchLocation(effectiveProjectId, createdId);
          setPendingDemandConversation((current) => current && current.projectId === effectiveProjectId
            ? { ...current, id: createdId, title: event.data.topic.title, canonical: true, selectedProviderId: event.data.topic.selectedProviderId ?? current.selectedProviderId }
            : {
              ...pendingConversation,
              id: createdId,
              title: event.data.topic.title,
              startedAt: new Date().toISOString(),
              canonical: true,
              selectedProviderId: event.data.topic.selectedProviderId,
            });
        }
        handleLiveEvent(effectiveProjectId, event);
      });
      if (!createdTopicId) throw new Error("Demand conversation was not created.");
      uploadedDraft = [];
      await applyTopicSkillOverrides(createdTopicId, resolved.overrides, effectiveProjectId);
      setDraftSkillOverrides({});
      setComposerText("");
      setComposerFileRefs([]);
      setComposerAttachments([]);
      setSelectedProjectId(effectiveProjectId);
      persistSelectedProjectId(effectiveProjectId);
      setSelectedTopic(createdTopicId);
      syncWorkbenchLocation(effectiveProjectId, createdTopicId);
      setPendingDemandConversation(null);
      await loadSkillSummary(effectiveProjectId, createdTopicId);
      await refresh(effectiveProjectId, createdTopicId);
    } catch (cause) {
      setPendingDemandConversation(null);
      if (!createdTopicId) {
        setSelectedTopic(previousSelectedTopic);
        syncWorkbenchLocation(selectedProjectId, previousSelectedTopic);
      }
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      if (createdTopicId && draftUploadProjectId) {
        await timeline.loadLatest({
          projectId: draftUploadProjectId,
          conversationId: createdTopicId,
          agentSurfaceId: "main-agent",
        });
      }
      if (uploadedDraft.length > 0 && draftUploadProjectId) {
        const cleanupProjectId = draftUploadProjectId;
        await Promise.all(uploadedDraft.map((attachment) => deleteAttachmentForProject(cleanupProjectId, attachment.id)));
      }
      setActionRunning(null);
    }
  }

  async function sendTopicMessage(): Promise<void> {
    const attachmentIds = composerAttachments.map((attachment) => attachment.id);
    if (!selectedProjectId || !activeTopic || (!composerText.trim() && attachmentIds.length === 0)) return;
    if (activeTopic.state !== "active") {
      setError("已完成或稍后处理的需求对话为只读，不能继续发送消息。");
      return;
    }
    const resolved = resolveComposerTextWithContext(composerText);
    const message = resolved.text;
    if (Object.keys(resolved.overrides).length > 0) {
      await applyTopicSkillOverrides(activeTopic.id, resolved.overrides);
      await loadSkillSummary(selectedProjectId, activeTopic.id);
    }
    if (!message && attachmentIds.length === 0) {
      setComposerText("");
      setComposerFileRefs([]);
      return;
    }
    const runningConversation = activeWorkpad.conversationLifecycle === "running" || activeWorkpad.runControlState?.canStop || currentWorkpadSummary(snapshot, activeTopic)?.runtimeStatus === "running";
    if (runningConversation && attachmentIds.length > 0) {
      setError("当前执行中暂不支持追加附件；请等待执行暂停后再发送。");
      return;
    }
    const outboundMessage = message || defaultAttachmentPrompt(attachmentIds.length);
    if (runningConversation) {
      await runWorkflowAction("conversation.steer", { prompt: outboundMessage });
      setComposerFileRefs([]);
      return;
    }
    setActionRunning("chat.ask");
    setComposerText("");
    setError(null);
    try {
      await consumeWorkbenchLiveStream(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/topics/${encodeURIComponent(activeTopic.id)}/messages/live`, {
        mode: "chat",
        message: outboundMessage,
        contextRefs: resolved.contextRefs,
        attachmentIds,
        providerId: composerProviderId ?? activeTopic.selectedProviderId,
        providerSwitchIntent: composerProviderId && composerProviderId !== activeTopic.selectedProviderId ? "resume-workflow" : undefined,
      }, (event: WorkbenchLiveEvent) => handleLiveEvent(selectedProjectId, event));
      setComposerFileRefs([]);
      setComposerAttachments([]);
    } finally {
      await timeline.loadLatest({ projectId: selectedProjectId, conversationId: activeTopic.id, agentSurfaceId: "main-agent" });
      setActionRunning(null);
    }
  }

  async function runWorkflowAction(actionType: string, options: Record<string, unknown> = {}): Promise<void> {
    const { preserveSelectedTopic, ...actionOptions } = options;
    const shouldPreserveSelectedTopic = preserveSelectedTopic === true;
    if (!selectedProjectId || !activeTopic) return;
    const topicBeforeAction = activeTopic?.id ?? selectedTopic;
    const snapshotBeforeAction = snapshot;
    setActionRunning(actionType);
    setError(null);
    try {
      if (actionType === "intake.scan") {
        if (!activeTopic) return;
        const result = await postJson<{ snapshot: Snapshot }>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/intake/scan`, {
          changeId: activeTopic.id,
          prompt: composerText.trim() || activeTopic.title,
        });
        setSnapshot(result.snapshot);
        if (composerText.trim()) setComposerText("");
        return;
      }
      if (actionType === "intake.reanalyze") {
        if (!activeTopic) return;
        const message = (composerText.trim() || window.prompt("补充需求或回答需要确认的问题") || "").trim();
        if (!message) return;
        const result = await postJson<{ snapshot: Snapshot }>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/intake/reanalyze`, {
          changeId: activeTopic.id,
          message,
        });
        setSnapshot(result.snapshot);
        setComposerText("");
        return;
      }
      await consumeWorkbenchLiveStream(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions/live`, {
        actionType,
        changeId: activeTopic?.id,
        confirm: true,
        prompt: composerText.trim() || undefined,
        ...actionOptions,
      }, (event: WorkbenchLiveEvent) => handleLiveEvent(selectedProjectId, event));
      if (shouldPreserveSelectedTopic && topicBeforeAction) {
        const refreshed = await refresh(selectedProjectId, topicBeforeAction);
        if (refreshed && !refreshed.center.selectedTopic && snapshotBeforeAction.center.selectedTopic?.id === topicBeforeAction) {
          const restored = preserveSelectedWorkbenchTopic(refreshed, snapshotBeforeAction);
          setSnapshot(restored);
          setProjectSnapshots((current) => ({ ...current, [selectedProjectId]: restored }));
        }
      }
      if (composerText.trim()) setComposerText("");
    } finally {
      await timeline.loadLatest({ projectId: selectedProjectId, conversationId: activeTopic.id, agentSurfaceId: "main-agent" });
      setActionRunning(null);
    }
  }

  async function stopAndContinueCurrentRun(): Promise<void> {
    await runWorkflowAction("conversation.interrupt", { prompt: composerText.trim() || undefined });
  }

  async function settleConversationInteraction(interactionId: string, settlement: ConversationInteractionSettlement): Promise<void> {
    if (!selectedProjectId || !activeTopic) return;
    setActionRunning(`interaction.${settlement.action}`);
    setError(null);
    let failed = false;
    try {
      await consumeWorkbenchLiveStream(
        `/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/conversations/${encodeURIComponent(activeTopic.id)}/interactions/${encodeURIComponent(interactionId)}/settle`,
        settlement,
        (event: WorkbenchLiveEvent) => {
          if (event.event === "error") failed = true;
          if (event.event === "snapshot") {
            const interaction = event.data.center.conversationInteractions?.items.find((item) => item.interactionId === interactionId);
            if (interaction?.status === "submitting") delete interactionDraftsRef.current[interactionId];
          }
          handleLiveEvent(selectedProjectId, event);
        },
      );
      if (!failed) delete interactionDraftsRef.current[interactionId];
    } finally {
      await timeline.loadLatest({ projectId: selectedProjectId, conversationId: activeTopic.id, agentSurfaceId: "main-agent" });
      setActionRunning(null);
    }
  }

  async function sendAgentWorkspaceMessage(agent: AgentWorkspaceAgent, message: string): Promise<void> {
    if (!selectedProjectId || !activeTopic || !message.trim()) return;
    setActionRunning(`agent.message.${agent.id}`);
    setError(null);
    try {
      await consumeWorkbenchLiveStream(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/topics/${encodeURIComponent(activeTopic.id)}/messages/live`, {
        mode: "chat",
        message: message.trim(),
      }, (event: WorkbenchLiveEvent) => handleLiveEvent(selectedProjectId, event));
    } finally {
      await timeline.loadLatest({ projectId: selectedProjectId, conversationId: activeTopic.id, agentSurfaceId: agent.id });
      setActionRunning(null);
    }
  }


  function handleLiveEvent(projectId: string, event: WorkbenchLiveEvent): void {
    const timelineEvent = timeline.ingestLiveEvent(projectId, event);
    if (timelineEvent.handled) {
      if (timelineEvent.refreshAgentProjection) scheduleAgentProjectionRefresh();
      return;
    }
    if (event.event === "topic.created") {
      const topicId = event.data.topic.conversationId ?? event.data.topic.id ?? event.data.topic.changeId;
      if (!topicId) return;
      setSelectedTopic(topicId);
      syncWorkbenchLocation(selectedProjectId, topicId);
      setPendingDemandConversation((current) => current
        ? { ...current, id: topicId, title: event.data.topic.title, canonical: true }
        : current);
      return;
    }
    if (event.event === "snapshot") {
      setSnapshot(event.data);
      setPendingDemandConversation(null);
      invalidateProjectionCache();
      return;
    }
    if (event.event === "conversation.interactions.updated") {
      if (activeTopic?.id && event.data.conversationId !== activeTopic.id) return;
      setSnapshot((current) => ({
        ...current,
        center: { ...current.center, conversationInteractions: event.data },
      }));
      return;
    }
    if (event.event === "error") {
      if (isTransientReconnectMessage(event.data.message)) return;
      setError(event.data.message);
      return;
    }
    // Raw provider lifecycle events are diagnostic transport only. Conversation,
    // Agent workspace, and graph surfaces consume canonical server projections.
  }


  function scheduleAgentProjectionRefresh(): void {
    if (!selectedProjectId || !activeTopic?.id || agentProjectionRefreshTimerRef.current) return;
    const projectionContext = `${selectedProjectId}:${activeTopic.id}`;
    agentProjectionRefreshTimerRef.current = setTimeout(() => {
      agentProjectionRefreshTimerRef.current = null;
      const projectId = selectedProjectId;
      const topicId = activeTopic.id;
      void Promise.all([
        fetchJson<Snapshot>(`/api/projects/${encodeURIComponent(projectId)}/workbench/snapshot?topic=${encodeURIComponent(topicId)}`),
        fetchJson<AgentRelationGraph>(`/api/projects/${encodeURIComponent(projectId)}/workbench/projections/agent-graph/${encodeURIComponent(topicId)}`),
      ])
        .then(([next, graph]) => {
          if (agentProjectionContextRef.current !== projectionContext) return;
          setSnapshot((current) => ({
            ...current,
            center: { ...current.center, agentRelationGraph: graph },
            right: { ...current.right, agentWorkspace: next.right.agentWorkspace },
          }));
          setLoadedAgentRelationGraph(graph);
          const availableAgentIds = new Set(next.right.agentWorkspace.agents.map((agent) => agent.id));
          if (advancePendingAgentProjectionRefreshes(availableAgentIds)) scheduleAgentProjectionRefresh();
        })
        .catch(() => {
          if (agentProjectionContextRef.current !== projectionContext) return;
          if (advancePendingAgentProjectionRefreshes()) scheduleAgentProjectionRefresh();
        });
    }, AGENT_PROJECTION_REFRESH_DELAY_MS);
  }

  function advancePendingAgentProjectionRefreshes(availableAgentIds = new Set<string>()): boolean {
    let shouldRetry = false;
    for (const [agentSurfaceId, attempt] of pendingAgentSurfaceRefreshesRef.current) {
      if (availableAgentIds.has(agentSurfaceId)) {
        pendingAgentSurfaceRefreshesRef.current.delete(agentSurfaceId);
        continue;
      }
      if (attempt >= AGENT_PROJECTION_MAX_RETRIES) {
        pendingAgentSurfaceRefreshesRef.current.delete(agentSurfaceId);
        continue;
      }
      pendingAgentSurfaceRefreshesRef.current.set(agentSurfaceId, attempt + 1);
      shouldRetry = true;
    }
    return shouldRetry;
  }

  function openChildAgentWorkspace(agentSurfaceId: string): void {
    if (!agentSurfaceId || agentSurfaceId === "main-agent") return;
    if (!activeAgentWorkspace.agents.some((agent) => agent.id === agentSurfaceId)) {
      pendingAgentSurfaceRefreshesRef.current.set(agentSurfaceId, 0);
    }
    const conversationId = activeTopic?.id;
    if (!conversationId || !selectedProjectId) return;
    openWorkspaceResource({ kind: "agent", conversationId, agentSurfaceId });
    void timeline.loadLatest({ projectId: selectedProjectId, conversationId, agentSurfaceId });
    scheduleAgentProjectionRefresh();
  }

  function openWorkspaceResource(target: WorkspaceResourceTarget): void {
    const resourceId = workspaceResourceId(target);
    setWorkspaceResourceTabs((current) => current.some((tab) => tab.resourceId === resourceId) ? current : [...current, { resourceId, target }]);
    setSelectedWorkspaceResourceId(resourceId);
    setRightToolView("agent");
    setDecisionPaneCollapsed(false);
    if (target.kind !== "agent") void loadWorkspaceResource(target, resourceId);
  }

  async function loadWorkspaceResource(target: Exclude<WorkspaceResourceTarget, { kind: "agent" }>, resourceId = workspaceResourceId(target)): Promise<void> {
    if (!selectedProjectId) return;
    const projectId = selectedProjectId;
    const scope = workspaceResourceRequestScope(projectId, activeTopic?.id ?? "", target);
    const requestToken = ++workspaceResourceRequestCounterRef.current;
    workspaceResourceRequestTokensRef.current.set(resourceId, requestToken);
    const isCurrentRequest = (): boolean => (
      (target.kind === "project-file" ? selectedProjectIdRef.current === projectId : workspaceResourceScopeRef.current === scope)
      && workspaceResourceRequestTokensRef.current.get(resourceId) === requestToken
    );
    setLoadingWorkspaceResourceIds((current) => current.includes(resourceId) ? current : [...current, resourceId]);
    setWorkspaceResourceErrors((current) => {
      const next = { ...current };
      delete next[resourceId];
      return next;
    });
    try {
      const resource = await postJson<TextDocumentResource>(`/api/projects/${encodeURIComponent(projectId)}/workspace-resources/resolve`, { target });
      if (!isCurrentRequest()) return;
      setWorkspaceDocuments((current) => ({ ...current, [resourceId]: resource }));
    } catch (cause) {
      if (!isCurrentRequest()) return;
      setWorkspaceResourceErrors((current) => ({ ...current, [resourceId]: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      if (isCurrentRequest()) setLoadingWorkspaceResourceIds((current) => current.filter((id) => id !== resourceId));
    }
  }

  function selectWorkspaceResource(resourceId: string): void {
    setSelectedWorkspaceResourceId(resourceId);
    const tab = workspaceResourceTabs.find((candidate) => candidate.resourceId === resourceId);
    if (!tab) return;
    if (tab.target.kind === "agent") {
      if (selectedProjectId) void timeline.loadLatest({
          projectId: selectedProjectId,
          conversationId: tab.target.conversationId,
          agentSurfaceId: tab.target.agentSurfaceId,
        });
      return;
    }
    void loadWorkspaceResource(tab.target, resourceId);
  }

  function closeWorkspaceResource(resourceId: string): void {
    workspaceResourceRequestTokensRef.current.delete(resourceId);
    setWorkspaceResourceTabs((current) => {
      const index = current.findIndex((tab) => tab.resourceId === resourceId);
      const next = current.filter((tab) => tab.resourceId !== resourceId);
      setSelectedWorkspaceResourceId((selected) => selected === resourceId ? next[Math.min(index, next.length - 1)]?.resourceId ?? null : selected);
      return next;
    });
    setWorkspaceDocuments((current) => {
      if (!(resourceId in current)) return current;
      const next = { ...current };
      delete next[resourceId];
      return next;
    });
  }

  function invalidateProjectionCache(): void {
    setLoadedAgentRelationGraph(null);
    setProjectionVersion((value) => value + 1);
  }

  function clearTopicScopedLiveState(options: { preserveProjectFiles?: boolean } = {}): void {
    if (agentProjectionRefreshTimerRef.current) clearTimeout(agentProjectionRefreshTimerRef.current);
    agentProjectionRefreshTimerRef.current = null;
    pendingAgentSurfaceRefreshesRef.current.clear();
    setActionRunning(null);
    setLatestHidden(false);
    if (!options.preserveProjectFiles) {
      workspaceResourceRequestTokensRef.current.clear();
      setSelectedWorkspaceResourceId(null);
      setWorkspaceResourceTabs([]);
      setWorkspaceDocuments({});
      setWorkspaceResourceErrors({});
      setLoadingWorkspaceResourceIds([]);
      return;
    }
    setWorkspaceResourceTabs((current) => {
      const retained = projectFileResourceTabs(current);
      const retainedIds = new Set(retained.map((tab) => tab.resourceId));
      workspaceResourceRequestTokensRef.current = new Map(
        [...workspaceResourceRequestTokensRef.current].filter(([resourceId]) => retainedIds.has(resourceId)),
      );
      setSelectedWorkspaceResourceId((selected) => selected && retainedIds.has(selected) ? selected : retained.at(-1)?.resourceId ?? null);
      setWorkspaceDocuments((documents) => Object.fromEntries(Object.entries(documents).filter(([resourceId]) => retainedIds.has(resourceId))));
      setWorkspaceResourceErrors((errors) => Object.fromEntries(Object.entries(errors).filter(([resourceId]) => retainedIds.has(resourceId))));
      setLoadingWorkspaceResourceIds((resourceIds) => resourceIds.filter((resourceId) => retainedIds.has(resourceId)));
      return retained;
    });
  }

  const activePendingConversation = pendingDemandConversation
    && selectedProjectId === pendingDemandConversation.projectId
    && selectedTopic === pendingDemandConversation.id
    ? pendingDemandConversation
    : null;
  const activeTopic = activePendingConversation
    ? {
      id: activePendingConversation.id,
      title: activePendingConversation.title,
      state: "active" as const,
      acCount: 0,
      taskCount: 0,
      kind: "conversation" as const,
      boundChangeId: null,
      selectedProviderId: activePendingConversation.selectedProviderId,
    }
    : snapshot.center.selectedTopic;
  agentProjectionContextRef.current = selectedProjectId && activeTopic?.id
    ? `${selectedProjectId}:${activeTopic.id}`
    : null;
  const activeTopicIsConversation = activeTopic?.kind === "conversation";
  selectedProjectIdRef.current = selectedProjectId;
  workspaceResourceScopeRef.current = `conversation:${selectedProjectId ?? ""}:${activeTopic?.id ?? ""}`;
  const composerProviderOptions = providerCapabilities.map((provider) => ({ id: provider.providerId, label: provider.displayName }));
  const selectedProjectDefaultProviderId = projects.find((item) => item.project?.id === selectedProjectId)?.project?.defaultProviderId ?? null;

  useEffect(() => {
    const selected = activeTopic?.selectedProviderId
      ?? (selectedProjectDefaultProviderId && providerCapabilities.some((provider) => provider.providerId === selectedProjectDefaultProviderId)
        ? selectedProjectDefaultProviderId
        : providerCapabilities.length === 1 ? providerCapabilities[0]!.providerId : null);
    setComposerProviderId(selected);
  }, [activeTopic?.id, activeTopic?.selectedProviderId, providerCapabilities, selectedProjectDefaultProviderId, selectedProjectId]);
  const isPendingTopic = Boolean(activePendingConversation && !activePendingConversation.canonical);
  const activeWorkpad = activePendingConversation ? emptyWorkpad(activePendingConversation.title) : snapshot.center.workpad ?? emptyWorkpad(activeTopic?.title ?? projectDisplayName(snapshot.project));
  const activeRun = useMemo(() => snapshot.center.agentLoop.runs.find((run) => run.id === selectedRun) ?? snapshot.center.agentLoop.runs[0], [snapshot, selectedRun]);
  const selectedProjectStatus = useMemo(() => projects.find((item) => item.project?.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const selectedProjectHistoryUnavailable = Boolean(selectedProjectStatus?.managed && selectedProjectStatus.memory?.memoryAvailable === false);
  const runIds = useMemo(() => snapshot.center.agentLoop.runs.map((run) => run.id).join("|"), [snapshot.center.agentLoop.runs]);
  const activeTimelineScope = useMemo<CanonicalTimelineScope | null>(() => (
    selectedProjectId && activeTopic?.id && !isPendingTopic
      ? { projectId: selectedProjectId, conversationId: activeTopic.id, agentSurfaceId: "main-agent" }
      : null
  ), [activeTopic?.id, isPendingTopic, selectedProjectId]);
  const activeTranscript = useMemo<ParentAgentTranscript>(() => activeTimelineScope
    ? selectCanonicalTimelineTranscript(timeline.state, activeTimelineScope)
    : {
      conversationId: activeTopic?.id,
      title: activeTopic?.title ?? "需求对话",
      cells: [],
      items: [],
      emptyMessage: activePendingConversation ? "正在等待主 Agent 回复。" : "暂无对话内容。",
    }, [activePendingConversation, activeTimelineScope, activeTopic?.id, activeTopic?.title, timeline.state]);
  const activeTimelineSurface = activeTimelineScope
    ? selectCanonicalTimelineSurface(timeline.state, activeTimelineScope)
    : null;
  const loadingEarlierTranscript = activeTimelineSurface?.requests.before.status === "loading";
  const activeDecisionInspector = useMemo(() => {
    const inspector = snapshot.right.decisionInspector ?? { primary: null, related: [], history: [] };
    if (!selectedDecisionContextId) return inspector;
    const selected = [inspector.primary, ...inspector.related, ...inspector.history].find((item): item is DecisionContext => Boolean(item && item.id === selectedDecisionContextId));
    if (!selected) return inspector;
    return {
      primary: selected,
      related: [inspector.primary, ...inspector.related].filter((item): item is DecisionContext => Boolean(item && item.id !== selected.id)),
      history: inspector.history.filter((item) => item.id !== selected.id),
      selectedContextId: selected.id,
    };
  }, [selectedDecisionContextId, snapshot.right.decisionInspector]);
  const activeConfirmationQueue = snapshot.right.confirmationQueue ?? { primary: null, current: [], otherDemands: [], maintenance: [], history: [] };
  const activeAgentWorkspace = snapshot.right.agentWorkspace ?? { selectedAgentId: "planning-agent", agents: [] };
  const activeAgentTranscripts = useMemo<Record<string, ParentAgentTranscript>>(() => {
    if (!selectedProjectId || !activeTopic?.id) return {};
    return Object.fromEntries(activeAgentWorkspace.agents.map((agent) => [
      agent.id,
      selectCanonicalTimelineTranscript(timeline.state, {
        projectId: selectedProjectId,
        conversationId: activeTopic.id,
        agentSurfaceId: agent.id,
      }),
    ]));
  }, [activeAgentWorkspace.agents, activeTopic?.id, selectedProjectId, timeline.state]);

  useEffect(() => {
    if (!selectedProjectId || typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/events/live`);
    source.onopen = () => {
      const conversationId = activeTopic?.id;
      if (!conversationId || isPendingTopic) return;
      for (const scope of canonicalTimelineReconnectScopes(selectedProjectId, conversationId, workspaceResourceTabs)) {
        void timeline.loadLatest(scope);
      }
    };
    source.onmessage = (message) => {
      try {
        handleLiveEvent(selectedProjectId, JSON.parse(message.data) as WorkbenchLiveEvent);
      } catch {
        // The request-level snapshot remains authoritative after malformed diagnostic frames.
      }
    };
    return () => source.close();
  }, [activeTopic?.id, isPendingTopic, selectedProjectId, selectedTopic, timeline.loadLatest, workspaceResourceTabs]);
  const activeConversationInteraction = snapshot.center.conversationInteractions?.items[0] ?? null;
  const pendingConfirmationCount = (activeConfirmationQueue.primary ? 1 : 0)
    + activeConfirmationQueue.otherDemands.length
    + activeConfirmationQueue.maintenance.length;
  const rawActiveAgentGraph = loadedAgentRelationGraph ?? snapshot.center.agentRelationGraph;
  const activeAgentGraph = isAgentRelationGraph(rawActiveAgentGraph) ? rawActiveAgentGraph : emptyAgentRelationGraph();
  useEffect(() => {
    const graphScopeId = activeAgentGraph.graphScopeId;
    if (!graphScopeId) return;
    const previous = graphScopeRef.current;
    graphScopeRef.current = graphScopeId;
    if (!previous || previous === graphScopeId) return;
    setSelectedAgentGraphNodeId(null);
    setWorkspaceResourceTabs((current) => {
      const next = current.filter((tab) => tab.target.kind !== "agent");
      setSelectedWorkspaceResourceId((selected) => {
        const selectedTab = current.find((tab) => tab.resourceId === selected);
        return selectedTab?.target.kind === "agent" ? next.at(-1)?.resourceId ?? null : selected;
      });
      return next;
    });
  }, [activeAgentGraph.graphScopeId]);
  const selectedAgentGraphNode = useMemo(() => (
    activeAgentGraph.nodes.find((node) => node.id === selectedAgentGraphNodeId) ?? activeAgentGraph.nodes[0] ?? null
  ), [activeAgentGraph.nodes, selectedAgentGraphNodeId]);
  function selectAgentGraphNode(nodeId: string): void {
    const node = activeAgentGraph.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    setSelectedAgentGraphNodeId(nodeId);
    if (node.kind === "main-agent") {
      closeOrchestrationOverlay();
      return;
    }
    const agentId = node.target.agentSurfaceId ?? node.id;
    openChildAgentWorkspace(agentId);
  }
  const providerModelLabel = providerModelSettings?.effectiveModel?.modelId
    || providerDiagnostics?.models.effectiveModel?.modelId
    || "默认模型";
  const providerDisplayName = providerDiagnostics?.displayName
    ?? composerProviderOptions.find((provider) => provider.id === composerProviderId)?.label
    ?? (composerProviderOptions.length === 1 ? composerProviderOptions[0]!.label : "正在加载");

  function appendComposerFileRefs(refs: TopicFileReference[]): void {
    const next = [...composerFileRefs];
    const seen = new Set(next.map((ref) => ref.relativePath));
    for (const ref of refs) {
      if (seen.has(ref.relativePath)) continue;
      seen.add(ref.relativePath);
      next.push({ ...ref, source: "composer" });
    }
    setComposerFileRefs(next);
  }

  function expandRightToolRail(): void {
    setRightToolView("launcher");
    setDecisionPaneCollapsed(false);
  }

  function openRightToolPanel(tab: RightToolRailTab): void {
    setRightToolView(tab);
    if (tab === "agent") {
      if (!selectedWorkspaceResourceId && workspaceResourceTabs.length === 0) {
        const agentId = activeAgentWorkspace.agents.find((agent) => agent.status === "running")?.id
          ?? activeAgentWorkspace.agents[0]?.id;
        if (agentId) openChildAgentWorkspace(agentId);
      }
    }
    if (tab === "diagnostics") {
      void loadRuntimeDiagnostics();
      void loadRuntimeActivityLog();
    }
  }

  function closeOrchestrationOverlay(): void {
    setOrchestrationOpen(false);
    syncWorkbenchOrchestrationTab(false);
  }

  function toggleOrchestrationOverlay(): void {
    if (!activeTopic?.id) return;
    if (orchestrationOpen) closeOrchestrationOverlay();
    else {
      setAgentGraphLoadState("loading");
      setOrchestrationOpen(true);
      syncWorkbenchOrchestrationTab(true);
    }
  }

  useEffect(() => {
    const restore = readWorkbenchRestoreParams();
    setOrchestrationOpen((current) => current || Boolean(
      restore.topicId && restore.topicId === activeTopic?.id && restore.orchestrationOpen,
    ));
    setSelectedAgentGraphNodeId(null);
    setLoadedAgentRelationGraph(null);
    setAgentGraphLoadState("idle");
    setAgentGraphLoadError(null);
    setComposerAttachments([]);
    setRuntimeActivityLog(null);
  }, [activeTopic?.id, isPendingTopic]);

  async function loadEarlierTranscriptPage(): Promise<void> {
    if (!activeTimelineScope || loadingEarlierTranscript) return;
    const cursor = activeTranscript.paging?.nextBeforeCursor;
    if (!cursor || activeTranscript.paging?.hasMoreBefore === false) return;
    await timeline.loadEarlier(activeTimelineScope, cursor);
  }

  async function createTopicFromComposer(): Promise<void> {
    await createTopicFromText(composerText, composerFileRefs, composerAttachments.map((attachment) => attachment.id));
  }

  useEffect(() => {
    if (!activeTimelineScope) return;
    void timeline.loadLatest(activeTimelineScope);
  }, [activeTimelineScope, projectionVersion, timeline.loadLatest]);

  useEffect(() => {
    if (!selectedProjectId || !activeTopic?.id || !orchestrationOpen) return;
    let cancelled = false;
    setAgentGraphLoadState("loading");
    setAgentGraphLoadError(null);
    fetchJson<AgentRelationGraph>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/projections/agent-graph/${encodeURIComponent(activeTopic.id)}`)
      .then((projection) => {
        if (cancelled) return;
        if (!isAgentRelationGraph(projection) || projection.nodes.length === 0) {
          setAgentGraphLoadState("error");
          setAgentGraphLoadError("无法加载 Agent 关系，请重试。");
          return;
        }
        setLoadedAgentRelationGraph(projection);
        setAgentGraphLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setAgentGraphLoadState("error");
          setAgentGraphLoadError("暂时无法读取 Agent 关系，请重试。");
        }
      });
    return () => { cancelled = true; };
  }, [selectedProjectId, activeTopic?.id, orchestrationOpen, isPendingTopic, projectionVersion, agentGraphReloadVersion]);

  useEffect(() => {
    const node = threadScrollRef.current;
    const mutation = activeTimelineSurface?.lastMutation;
    if (!node || !mutation || mutation.scopeKey !== (activeTimelineScope ? canonicalTimelineScopeKey(activeTimelineScope) : null)) return;
    const mutationKey = `${mutation.scopeKey}:${mutation.revision}:${mutation.kind}:${mutation.addedMessageIds.join(",")}:${mutation.updatedMessageIds.join(",")}`;
    if (handledTimelineMutationRef.current === mutationKey) return;
    handledTimelineMutationRef.current = mutationKey;
    if (!threadPinnedToBottomRef.current || (mutation.kind !== "append-tail" && mutation.kind !== "replace-tail-growth")) return;
    requestAnimationFrame(() => {
      const current = threadScrollRef.current;
      if (!current || !threadPinnedToBottomRef.current) return;
      current.scrollTop = current.scrollHeight;
      setLatestHidden(false);
    });
  }, [activeTimelineScope, activeTimelineSurface?.lastMutation]);

  useEffect(() => {
    threadPinnedToBottomRef.current = true;
    handledTimelineMutationRef.current = null;
    setLatestHidden(false);
  }, [activeTimelineScope ? canonicalTimelineScopeKey(activeTimelineScope) : null]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const runs = snapshot.center.agentLoop.runs;
    const runId = runs.find((run) => run.id === selectedRun)?.id ?? runs[0]?.id ?? null;
    if (!runId) {
      setStream(null);
      return;
    }
    if (runId !== selectedRun) setSelectedRun(runId);
    fetchJson<StreamPacket>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/stream/${encodeURIComponent(runId)}`)
      .then(setStream)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [selectedProjectId, selectedRun, runIds, snapshot.center.agentLoop.runs]);

  return (
    <div
      className={`app-shell ${settingsOpen ? "settings-open" : decisionPaneCollapsed ? "decision-pane-collapsed" : "decision-pane-expanded"} sidebar-expanded`}
      style={appShellStyle}
    >
      {!settingsOpen ? (
        <aside className="sidebar sidebar-expanded" aria-label="左侧项目栏">
          <div className="brand compact-brand">
            <div className="brand-title">AHO</div>
          </div>
              <ProjectConversationSidebar
                projects={projects}
          selectedProjectId={selectedProjectId}
          selectedTopicId={activeTopic?.id ?? selectedTopic}
          snapshots={projectSnapshots}
          snapshot={snapshot}
          search={sidebarSearch}
          onSearch={setSidebarSearch}
          expandedProjects={expandedProjects}
          projectMenuMode={projectMenuMode}
          projectDetailsId={projectDetailsId}
          onProjectMenuMode={setProjectMenuMode}
          onProjectDetails={setProjectDetailsId}
          onNewConversation={beginNewConversation}
          onOpenProject={openProject}
          onToggleProject={toggleProjectFolder}
          onChooseConversation={chooseConversation}
          onHideConversation={hideConversation}
          onRemoveProject={removeProject}
          onRefresh={loadApp}
          onOpenSettings={() => openSettings("basic")}
          onOpenProjectSettings={(projectId) => {
            void (async () => {
              if (projectId !== selectedProjectId) await openProject(projectId);
              openSettings("project");
            })();
          }}
        />
          <div
            className="shell-resize-grip sidebar-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整左侧项目栏宽度"
            onPointerDown={(event) => beginShellColumnResize(event, "left")}
          />
        </aside>
      ) : null}

      <main className={`workspace${settingsOpen ? " settings-workspace" : ""}`}>
        <div className="workspace-main" data-testid="workspace-main">
        {settingsOpen ? (
          <SettingsSurface
            section={settingsSection}
            onSectionChange={changeSettingsSection}
            project={selectedProjectStatus}
            diagnostics={providerDiagnostics}
            modelSettings={providerModelSettings}
            providerCapabilities={providerCapabilities}
            modelSettingsBusy={providerModelSettingsBusy}
            modelSettingsMessage={providerModelSettingsMessage}
            onOpenModelSettings={() => void openProviderModelPicker()}
            onClose={closeSettings}
            onRefresh={() => loadApp().then(() => loadProviderDiagnostics()).then(() => loadProviderModelSettings()).then(() => loadProviderCapabilities()).then(() => loadSkillSummary())}
          />
        ) : !selectedProjectId ? (
          <ProjectHomeView
            projects={projects}
            onOpenProject={openProject}
            onRefresh={loadApp}
          />
        ) : !selectedProjectStatus?.project ? (
          <ProjectHomeView
            projects={projects}
            onOpenProject={openProject}
            onRefresh={loadApp}
          />
        ) : !activeTopic && selectedProjectHistoryUnavailable ? (
          <UnmanagedProjectView project={selectedProjectStatus} />
        ) : !activeTopic ? (
          <ProjectReadinessHome
            project={selectedProjectStatus}
            providerDisplayName={providerDisplayName}
            modelLabel={providerModelLabel}
            onOpenModelSettings={() => void openProviderModelPicker()}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onCreateDemand={createTopicFromText}
            providerOptions={composerProviderOptions}
            selectedProviderId={composerProviderId ?? undefined}
            onSelectProvider={(providerId) => { void selectComposerProvider(providerId); }}
            enabledSkillCount={enabledSkillCount}
            skills={skillItems}
            activeSkillIds={selectedComposerSkillIds}
            onToggleSkill={toggleComposerSkill}
            onOpenSkillsSettings={() => openSettings("skills")}
            onOpenProject={openProject}
            onRefresh={loadApp}
            resetToken={homeComposerResetToken}
          />
        ) : (
          <>
            <header className="thread-header">
              <div className="thread-title-block">
                <strong>{activeTopic.title}</strong>
                <span>
                  {activeTopicIsConversation
                    ? `${projectDisplayName(snapshot.project, "project")} · ${stateLabel(activeTopic.state)}`
                    : `${projectDisplayName(snapshot.project, "project")} · ${stateLabel(activeTopic.state)} · 验收 ${activeTopic.acCount ?? 0} · 任务 ${activeTopic.taskCount ?? 0}`}
                </span>
              </div>
            </header>

            <section className={`center-grid${orchestrationOpen ? " agent-graph-center-grid" : ""}`}>
              {orchestrationOpen ? (
                <div className="agent-graph-center-view" data-testid="agent-graph-center-view">
                  {(agentGraphLoadState === "idle" || agentGraphLoadState === "loading") && activeAgentGraph.nodes.length === 0 ? (
                    <div className="agent-graph-view-state" role="status">正在加载 Agent 关系...</div>
                  ) : agentGraphLoadState === "error" ? (
                    <div className="agent-graph-view-state error" role="alert">
                      <strong>Agent 关系加载失败</strong>
                      <span>{agentGraphLoadError ?? "请稍后重试。"}</span>
                      <button type="button" className="outline-button" onClick={() => setAgentGraphReloadVersion((value) => value + 1)}>重试</button>
                    </div>
                  ) : (
                    <AgentRelationGraphPanel
                      graph={activeAgentGraph}
                      selectedNode={selectedAgentGraphNode}
                      activeRun={activeRun}
                      stream={stream}
                      onSelectNode={selectAgentGraphNode}
                      onSelectRun={(runId) => void chooseRun(runId)}
                    />
                  )}
                </div>
              ) : (
              <div className="timeline-panel">
                <div
                  className="thread-scroll"
                  ref={threadScrollRef}
                  onScroll={(event) => {
                    const node = event.currentTarget;
                    const pinned = node.scrollHeight - node.scrollTop - node.clientHeight <= 140;
                    threadPinnedToBottomRef.current = pinned;
                    setLatestHidden(!pinned);
                  }}
                >
                  <MainConversationView
                    key={`timeline:${selectedProjectId ?? ""}:${activeTopic.id}:main-agent`}
                    transcript={activeTranscript}
                    scrollContainerRef={threadScrollRef}
                    onLoadEarlierTranscript={loadEarlierTranscriptPage}
                    loadingEarlierTranscript={loadingEarlierTranscript}
                    onOpenAgent={openChildAgentWorkspace}
                    onOpenDocument={(document: CanonicalDocumentReference) => {
                      if (!activeTopic?.id) return;
                      openWorkspaceResource({ kind: "document", conversationId: activeTopic.id, documentId: document.documentId });
                    }}
                    projectId={selectedProjectId}
                    conversationId={activeTopic.id}
                  />
                </div>
                {latestHidden ? <button className="latest-button" onClick={() => {
                  threadPinnedToBottomRef.current = true;
                  const node = threadScrollRef.current;
                  if (node) node.scrollTop = node.scrollHeight;
                  setLatestHidden(false);
                }}>最新</button> : null}
              </div>
              )}
              {activeConversationInteraction && !orchestrationOpen ? (
                <ConversationInteractionDock
                  interaction={activeConversationInteraction}
                  busy={Boolean(actionRunning?.startsWith("interaction."))}
                  canStop={activeWorkpad.conversationLifecycle === "running" || Boolean(activeWorkpad.runControlState?.canStop)}
                  initialDraft={interactionDraftsRef.current[activeConversationInteraction.interactionId]}
                  onDraftChange={(interactionId, draft) => {
                    interactionDraftsRef.current[interactionId] = draft;
                  }}
                  onSettle={settleConversationInteraction}
                  onStop={stopAndContinueCurrentRun}
                />
              ) : !orchestrationOpen ? <TopicComposer
                  value={composerText}
                  onChange={setComposerText}
                  providerDisplayName={providerDisplayName}
                  modelLabel={providerModelLabel}
                  onOpenModelSettings={() => void openProviderModelPicker()}
                  enabledSkillCount={enabledSkillCount}
                  projectId={selectedProjectId}
                  skills={skillItems}
                  activeSkillIds={selectedComposerSkillIds}
                  selectedFileRefs={composerFileRefs}
                  attachments={composerAttachments}
                  onAttachFiles={(files) => { void appendComposerAttachments(files); }}
                  onRemoveAttachment={removeComposerAttachment}
                  onSelectedFileRefsChange={setComposerFileRefs}
                  onToggleSkill={toggleComposerSkill}
                  onOpenSkillsSettings={() => openSettings("skills")}
                  busy={actionRunning !== null || activeTopic.state !== "active"}
                  disabledReason={activeTopic.state !== "active"
                    ? "已完成或稍后处理的需求对话为只读。"
                    : undefined}
                  onSend={sendTopicMessage}
                  onStopAndContinue={stopAndContinueCurrentRun}
                  onNewWorkpad={createTopicFromComposer}
                  actionRunning={actionRunning}
                  currentWorkpadStatus={activeWorkpad.conversationLifecycle === "running" || activeWorkpad.runControlState?.canStop ? "running" : currentWorkpadSummary(snapshot, activeTopic)?.runtimeStatus}
                  providerOptions={composerProviderOptions}
                  selectedProviderId={composerProviderId ?? activeTopic.selectedProviderId}
                  onSelectProvider={(providerId) => { void selectComposerProvider(providerId); }}
                /> : null}
            </section>
          </>
        )}
        </div>
        {!settingsOpen ? <WorkspaceDockToggleBar
          orchestrationActive={orchestrationOpen}
          orchestrationNeedsAttention={activeAgentGraph.nodes.some((node) => node.status === "waiting-user")}
          orchestrationDisabled={!activeTopic?.id}
          onToggleOrchestration={toggleOrchestrationOverlay}
          terminalActive={bottomDockKind === "terminal"}
          terminalDisabled={!selectedProjectId}
          onToggleTerminal={toggleTerminalDock}
        /> : null}
        {!settingsOpen ? <TerminalDock
          projectId={selectedProjectId}
          open={bottomDockKind === "terminal"}
          height={terminalDockHeight}
          tabs={terminalTabs}
          activeTabId={activeTerminalId}
          onOpen={() => setBottomDockKind("terminal")}
          onCollapse={() => setBottomDockKind(null)}
          onHeightChange={setTerminalDockHeight}
          onNewTab={createTerminalTab}
          onSelectTab={(id) => {
            setActiveTerminalId(id);
            setBottomDockKind("terminal");
          }}
          onCloseTab={closeTerminalTab}
        /> : null}
      </main>

      {!settingsOpen ? <RightToolRailShell
        collapsed={decisionPaneCollapsed}
        activeView={rightToolView}
        pendingCount={pendingConfirmationCount}
        hasPrimary={Boolean(activeConfirmationQueue.primary)}
        onExpand={expandRightToolRail}
        onCollapse={() => setDecisionPaneCollapsed(true)}
        onToolOpen={openRightToolPanel}
        onBackToLauncher={() => setRightToolView("launcher")}
        agentPanel={
          <ResourceWorkspacePanel
            workspace={activeAgentWorkspace}
            agentTranscripts={activeAgentTranscripts}
            conversationId={activeTopic?.id ?? ""}
            tabs={workspaceResourceTabs}
            selectedResourceId={selectedWorkspaceResourceId}
            documents={workspaceDocuments}
            loadingResourceIds={loadingWorkspaceResourceIds}
            resourceErrors={workspaceResourceErrors}
            onSelectResource={selectWorkspaceResource}
            onCloseResource={closeWorkspaceResource}
            onBack={() => setRightToolView("launcher")}
            onSendAgentMessage={sendAgentWorkspaceMessage}
            onLoadEarlierAgentTranscript={async (agentSurfaceId, cursor) => {
              if (!selectedProjectId || !activeTopic?.id) return;
              await timeline.loadEarlier({
                projectId: selectedProjectId,
                conversationId: activeTopic.id,
                agentSurfaceId,
              }, cursor);
            }}
            providerDisplayName={providerDisplayName}
            modelLabel={providerModelLabel}
            onOpenModelSettings={() => void openProviderModelPicker()}
          />
        }
        confirmPanel={
          <DecisionInspectorPane
            inspector={activeDecisionInspector}
            confirmationQueue={activeConfirmationQueue}
            confirming={confirming}
            busy={actionRunning !== null}
            error={error}
            onConfirmingChange={setConfirming}
            onExecuteAction={executeDecisionAction}
            onFeedback={requestDecisionFeedback}
            onSelectContext={setSelectedDecisionContextId}
          />
        }
        filesPanel={
          <ProjectFilesPanel
            projectId={selectedProjectId}
            selectedRefs={composerFileRefs}
            onSelectedRefsChange={appendComposerFileRefs}
            onOpenTextDocument={(relativePath) => openWorkspaceResource({ kind: "project-file", relativePath })}
          />
        }
        gitPanel={
          <ProjectGitPanel
            projectId={selectedProjectId}
            selectedPath={selectedGitDiffPath}
            selectedRefs={composerFileRefs}
            onSelectedPathChange={(relativePath) => {
              setSelectedGitDiffPath(relativePath);
            }}
            onSelectedRefsChange={appendComposerFileRefs}
          />
        }
        diagnosticsPanel={
          <RuntimeDiagnosticsRailPanel
            snapshot={runtimeDiagnostics}
            loading={runtimeDiagnosticsLoading}
            onRefresh={() => void loadRuntimeDiagnostics()}
            runtimeLog={runtimeActivityLog}
            runtimeLogLoading={runtimeActivityLogLoading}
            onRefreshRuntimeLog={() => void loadRuntimeActivityLog()}
          />
        }
        onResizeStart={(event) => beginShellColumnResize(event, "right")}
      /> : null}

      <ProviderModelPicker
        open={providerModelPickerOpen}
        snapshot={providerModelSettings}
        busy={providerModelSettingsBusy}
        message={providerModelSettingsMessage}
        onClose={() => setProviderModelPickerOpen(false)}
        onRefresh={() => loadProviderModelSettings()}
        onSelect={(selectedModel) => updateProviderModelSettings({ selectedModel })}
      />
      {activeTopic && !settingsOpen ? <BottomStatusBar snapshot={snapshot} project={selectedProjectStatus} topic={activeTopic} /> : null}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Attachment reader did not return a data URL."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function mergeTopicAttachments(current: TopicAttachment[], next: TopicAttachment[]): TopicAttachment[] {
  const result = [...current];
  const seen = new Set(current.map((attachment) => attachment.id));
  for (const attachment of next) {
    if (seen.has(attachment.id)) continue;
    seen.add(attachment.id);
    result.push(attachment);
  }
  return result;
}

function defaultAttachmentPrompt(count: number): string {
  return count === 1
    ? "请先查看我附上的文件，然后根据附件内容继续。"
    : "请先查看我附上的文件，然后根据这些附件内容继续。";
}

function emptyAgentRelationGraph(): AgentRelationGraph {
  return {
    title: "Agent 关系",
    summary: "真实子 Agent 开始工作后，会在这里显示父子关系。",
    nodes: [],
    edges: [],
  };
}

function preserveSelectedWorkbenchTopic(next: Snapshot, previous: Snapshot): Snapshot {
  return {
    ...next,
    center: {
      ...next.center,
      selectedTopic: previous.center.selectedTopic,
      workpad: previous.center.workpad,
      agentRelationGraph: previous.center.agentRelationGraph,
      agentLoop: previous.center.agentLoop,
    },
    right: {
      ...next.right,
      agentWorkspace: previous.right.agentWorkspace,
    },
  };
}

function isProviderDiagnostics(value: unknown): value is ProviderDiagnostics {
  if (!value || typeof value !== "object") return false;
  const diagnostics = value as Partial<ProviderDiagnostics>;
  return typeof diagnostics.providerId === "string"
    && typeof diagnostics.displayName === "string"
    && typeof diagnostics.installation === "object"
    && diagnostics.installation !== null
    && typeof diagnostics.models === "object"
    && diagnostics.models !== null;
}

function isProviderModelSettingsSnapshot(value: unknown): value is ProviderModelSettingsSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ProviderModelSettingsSnapshot>;
  return typeof snapshot.providerId === "string"
    && (snapshot.effectiveModel === null || typeof snapshot.effectiveModel === "object")
    && (snapshot.effectiveModelSource === "selected" || snapshot.effectiveModelSource === "config" || snapshot.effectiveModelSource === "provider-default")
    && Array.isArray(snapshot.candidates)
    && typeof snapshot.available === "boolean";
}

function isProviderCapabilitySnapshot(value: unknown): value is ProviderCapabilitySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ProviderCapabilitySnapshot>;
  return typeof snapshot.providerId === "string"
    && snapshot.productMode === "harness"
    && (snapshot.status === "ready" || snapshot.status === "degraded" || snapshot.status === "unavailable")
    && typeof snapshot.runnable === "boolean"
    && typeof snapshot.snapshotHash === "string"
    && typeof snapshot.snapshotVersion === "number"
    && Array.isArray(snapshot.capabilities);
}

function readPersistedSelectedProjectId(): string | null {
  try {
    const value = window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
    return value && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

function persistSelectedProjectId(projectId: string): void {
  try {
    window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, projectId);
  } catch {
    // Frontend preference only; ignore unavailable storage.
  }
}

function clearPersistedSelectedProjectId(): void {
  try {
    window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
  } catch {
    // Frontend preference only; ignore unavailable storage.
  }
}

function readWorkbenchRestoreParams(): { projectId: string | null; topicId: string | null; orchestrationOpen: boolean; settingsOpen: boolean } {
  try {
    const params = new URLSearchParams(window.location.search);
    const rawTab = params.get("tab");
    return {
      projectId: nonEmptyParam(params.get("project")),
      topicId: nonEmptyParam(params.get("topic")),
      orchestrationOpen: isOrchestrationTabParam(rawTab),
      settingsOpen: rawTab?.trim().toLowerCase() === "settings",
    };
  } catch {
    return { projectId: null, topicId: null, orchestrationOpen: false, settingsOpen: false };
  }
}

function nonEmptyParam(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isOrchestrationTabParam(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "orchestration" || normalized === "agentgraph" || normalized === "agent-graph";
}

async function resolveDefaultProviderId(): Promise<string> {
  const payload = await fetchJson<{ providers?: Array<{ providerId?: string }> }>("/api/providers");
  const providers = (payload.providers ?? []).filter((provider): provider is { providerId: string } => typeof provider.providerId === "string");
  if (providers.length === 0) throw new Error("没有可用的 Agent provider。");
  if (providers.length > 1) throw new Error("当前存在多个 Agent provider，请先选择当前 provider。");
  return providers[0]!.providerId;
}

function workspaceResourceId(target: WorkspaceResourceTarget): string {
  if (target.kind === "agent") return `agent:${target.agentSurfaceId}`;
  if (target.kind === "document") return target.documentId;
  return `project-file:${target.relativePath.replace(/\\/g, "/")}`;
}

function syncWorkbenchLocation(projectId: string | null, topicId: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (projectId) url.searchParams.set("project", projectId);
    else url.searchParams.delete("project");
    if (projectId && topicId && !topicId.startsWith("pending:")) url.searchParams.set("topic", topicId);
    else url.searchParams.delete("topic");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Navigation state remains usable when the host does not expose History APIs.
  }
}

function syncWorkbenchOrchestrationTab(open: boolean): void {
  try {
    const url = new URL(window.location.href);
    if (open) url.searchParams.set("tab", "orchestration");
    else if (isOrchestrationTabParam(url.searchParams.get("tab"))) url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // The center view remains usable when the host does not expose History APIs.
  }
}

function isTransientReconnectMessage(message: string): boolean {
  return /^reconnecting(?:\.\.\.)?\s*\d+\/\d+/i.test(message.trim());
}

function snapshotForProject(project: ProjectStatus | null | undefined): Snapshot {
  if (!project?.project) return emptySnapshot;
  return {
    ...emptySnapshot,
    project: project.project,
    memory: {
      harnessReady: project.memory?.harnessReady ?? project.managed,
      memoryMode: project.memory?.memoryMode,
      artifactBase: project.memory?.artifactBase,
    },
    center: { ...emptySnapshot.center, workpad: emptyWorkpad(projectDisplayName(project.project)) },
    warnings: project.managed ? [] : ["首次需求会根据项目情况建立必要工作说明。"],
  };
}

function isAgentRelationGraph(value: unknown): value is AgentRelationGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as Partial<AgentRelationGraph>;
  return typeof graph.title === "string"
    && typeof graph.summary === "string"
    && Array.isArray(graph.nodes)
    && Array.isArray(graph.edges);
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
