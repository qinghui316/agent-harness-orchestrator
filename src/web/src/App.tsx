import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactElement,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction } from "react";
import { consumeWorkbenchLiveStream,
  fetchJson,
  postJson } from "./api.js";
import { MainConversationView,
  AgentRunGraphPanel,
  RightToolRailShell,
  DecisionInspectorPane,
  BottomStatusBar,
  ProjectFilesPanel,
  ProjectGitPanel,
  RuntimeDiagnosticsRailPanel,
  AgentWorkspacePanel,
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
  appendProseBlock,
  blockFromAssistantEvent,
  blockFromToolEvent,
  currentWorkpadSummary,
  proseBlock,
  threadItemFromTopicEntry,
  upsertBlock,
} from "./shell/WorkbenchShellParts.js";
import {
  ProjectHomeView,
  ProjectReadinessHome,
  CodexModelPicker,
} from "./panels/ProjectHome.js";
import { SettingsSurface, type SettingsSection } from "./panels/SettingsSurface.js";
import { workflowActionPayloadFromScope } from "./workflow-actions.js";
import {
  emptyParentAgentTranscript,
  findCompatibleLiveTurn,
  isParentAgentTranscriptPayload,
  mergeLiveItemsIntoTranscript,
  mergeTranscriptPage,
  normalizeParentAgentTranscript,
  transcriptContainsLiveItem,
  transcriptContainsMainTurn
} from "./liveTranscript.js";
import { derivePlanHandoffCandidate } from "./panels/workbench/planHandoff.js";
import { baseAgentDisplayLabel, composeAgentDisplayLabel } from "../../agent-display-label.js";

import {
  projectDisplayName,
  stateLabel,
  runtimeLabel,
} from "./formatters.js";
import type {
  AppStatus,
  CodexDiagnostics,
  CodexModelSettingsSnapshot,
  ProviderCapabilitySnapshot,
  ProjectStatus,
  Snapshot,
  DemandAgentRunGraph,
  ParentAgentTranscript,
  ParentAgentTranscriptCell,
  Workpad,
  ThreadStreamItem,
  DecisionAction,
  DecisionContext,
  StreamPacket,
  SkillListItem,
  WorkbenchLiveEvent,
  WorkbenchLiveIdentity,
  AssistantTurnBlock,
  LiveTurnEvent,
  LiveAssistantTurn,
  TopicAttachment,
  TopicFileReference,
  RuntimeActivityLogSnapshot,
  RuntimeDiagnosticsSnapshot,
  CodexUserInputRequest,
  AgentWorkspaceAgent,
  AgentWorkspace,
  TopicMessageEntry,
  PlanHandoffCandidate,
  PlanHandoffIntentKind,
} from "./types.js";
import { extractInlineSkillMentions } from "./shell/skill-mentions.js";
import { extractInlineFileMentions } from "./shell/file-mentions.js";

const emptySnapshot: Snapshot = {
  project: null,
  memory: {},
  left: { topics: [], workpads: [] },
  center: {
    selectedTopic: null,
    workpad: emptyWorkpad(),
    agentLoop: { runs: [] },
    thread: { items: [] },
    parentAgentTranscript: emptyParentAgentTranscript(),
    activeTab: "conversation",
    agentRunGraph: emptyAgentRunGraph(),
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
type BottomDockKind = "terminal" | null;
type LiveTurnSetter = Dispatch<SetStateAction<LiveAssistantTurn[]>>;
type PendingDemandConversation = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  startedAt: string;
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

function pendingDemandTranscript(pending: PendingDemandConversation, includeUserMessage: boolean): ParentAgentTranscript {
  const cells: ParentAgentTranscriptCell[] = [];
  if (includeUserMessage) {
    cells.push({
      id: `pending:user:${pending.id}`,
      kind: "user-message",
      source: "user",
      timestamp: pending.startedAt,
      text: pending.body,
    });
  }
  return normalizeParentAgentTranscript({
    title: pending.title,
    cells,
    items: cells.map((cell) => ({
      id: `pending:item:${cell.id}`,
      actor: cell.kind === "user-message" ? "user" : "parent-agent",
      timestamp: cell.timestamp,
      derived: cell.kind !== "user-message",
      blocks: [{
        id: `pending:block:${cell.id}`,
        kind: cell.kind === "user-message" ? "prose" : "process",
        source: cell.source,
        title: cell.title,
        text: cell.text,
        status: cell.status,
      }],
    })),
    emptyMessage: "正在等待主 Agent 回复。",
  });
}

export function App(): ReactElement {
  const [projects, setProjects] = useState<ProjectStatus[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamPacket | null>(null);
  const [orchestrationOpen, setOrchestrationOpen] = useState(false);
  const [selectedRunGraphNodeId, setSelectedRunGraphNodeId] = useState<string | null>(null);
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
  const [composerText, setComposerText] = useState("");
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [liveItems, setLiveItems] = useState<ThreadStreamItem[]>([]);
  const [liveTurns, setLiveTurns] = useState<LiveAssistantTurn[]>([]);
  const [agentLiveTurns, setAgentLiveTurns] = useState<LiveAssistantTurn[]>([]);
  const [openAgentSurfaceIds, setOpenAgentSurfaceIds] = useState<string[]>([]);
  const [loadedTranscript, setLoadedTranscript] = useState<ParentAgentTranscript | null>(null);
  const [loadingEarlierTranscript, setLoadingEarlierTranscript] = useState(false);
  const [loadedRunGraph, setLoadedRunGraph] = useState<DemandAgentRunGraph | null>(null);
  const [runGraphLoadState, setRunGraphLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [runGraphLoadError, setRunGraphLoadError] = useState<string | null>(null);
  const [runGraphReloadVersion, setRunGraphReloadVersion] = useState(0);
  const [pendingDemandConversation, setPendingDemandConversation] = useState<PendingDemandConversation | null>(null);
  const [codexDiagnostics, setCodexDiagnostics] = useState<CodexDiagnostics | null>(null);
  const [codexModelSettings, setCodexModelSettings] = useState<CodexModelSettingsSnapshot | null>(null);
  const [providerCapabilities, setProviderCapabilities] = useState<ProviderCapabilitySnapshot[]>([]);
  const [codexModelPickerOpen, setCodexModelPickerOpen] = useState(false);
  const [codexModelSettingsBusy, setCodexModelSettingsBusy] = useState(false);
  const [codexModelSettingsMessage, setCodexModelSettingsMessage] = useState<string | null>(null);
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
  const [selectedAgentWorkspaceAgentId, setSelectedAgentWorkspaceAgentId] = useState<string | null>(null);
  const [projectionVersion, setProjectionVersion] = useState(0);
  const [latestHidden, setLatestHidden] = useState(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const graphScopeRef = useRef<string | null>(null);
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

  async function loadCodexDiagnostics(projectId = selectedProjectId): Promise<void> {
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/codex/diagnostics`
      : "/api/codex/diagnostics";
    const diagnostics = await fetchJson<unknown>(path);
    setCodexDiagnostics(isCodexDiagnostics(diagnostics) ? diagnostics : null);
  }

  async function loadCodexModelSettings(projectId = selectedProjectId): Promise<void> {
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/codex/models`
      : "/api/codex/models";
    const payload = await fetchJson<unknown>(path);
    setCodexModelSettings(isCodexModelSettingsSnapshot(payload) ? payload : null);
  }

  async function loadProviderCapabilities(projectId = selectedProjectId): Promise<void> {
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/providers/capabilities`
      : "/api/providers/capabilities";
    const payload = await fetchJson<{ providers?: unknown[] }>(path);
    setProviderCapabilities(Array.isArray(payload.providers) ? payload.providers.filter(isProviderCapabilitySnapshot) : []);
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
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/codex/diagnostics`
      : "/api/codex/diagnostics";
    Promise.all([
      fetchJson<unknown>(path),
      fetchJson<unknown>(projectId ? `/api/projects/${encodeURIComponent(projectId)}/codex/models` : "/api/codex/models"),
      fetchJson<{ providers?: unknown[] }>(projectId ? `/api/projects/${encodeURIComponent(projectId)}/providers/capabilities` : "/api/providers/capabilities"),
    ])
      .then(([diagnostics, models, providers]) => {
        if (cancelled) return;
        setCodexDiagnostics(isCodexDiagnostics(diagnostics) ? diagnostics : null);
        setCodexModelSettings(isCodexModelSettingsSnapshot(models) ? models : null);
        setProviderCapabilities(Array.isArray(providers.providers) ? providers.providers.filter(isProviderCapabilitySnapshot) : []);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  useEffect(() => {
    loadSkillSummary().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [selectedProjectId, selectedTopic, projects]);

  async function openProject(projectId: string): Promise<void> {
    setSelectedProjectId(projectId);
    persistSelectedProjectId(projectId);
    setExpandedProjects((current) => new Set([...current, projectId]));
    setSelectedTopic(null);
    syncWorkbenchLocation(projectId, null);
    clearTopicScopedLiveState();
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
    clearTopicScopedLiveState();
    setDraftSkillOverrides({});
    setOrchestrationOpen(false);
    setExpandedProjects((current) => new Set([...current, projectId]));
    const nextSnapshot = {
      ...baseSnapshot,
      center: {
        selectedTopic: null,
        workpad: emptyWorkpad(projectDisplayName(baseSnapshot.project ?? status.project, "当前项目")),
        thread: { items: [] },
        parentAgentTranscript: emptyParentAgentTranscript(),
        activeTab: "conversation" as const,
        agentLoop: { runs: [] },
        agentRunGraph: emptyAgentRunGraph(),
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
    clearTopicScopedLiveState();
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
      setLoadedTranscript(null);
    }
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

  async function openCodexModelPicker(): Promise<void> {
    setCodexModelPickerOpen(true);
    setCodexModelSettingsMessage(null);
    try {
      await loadCodexModelSettings();
    } catch (cause) {
      setCodexModelSettingsMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function updateCodexModelSettings(body: unknown): Promise<void> {
    setCodexModelSettingsBusy(true);
    setCodexModelSettingsMessage(null);
    try {
      const path = selectedProjectId
        ? `/api/projects/${encodeURIComponent(selectedProjectId)}/codex/models`
        : "/api/codex/models";
      const payload = await postJson<unknown>(path, body);
      setCodexModelSettings(isCodexModelSettingsSnapshot(payload) ? payload : null);
      await loadCodexDiagnostics();
      await loadProviderCapabilities();
    } catch (cause) {
      setCodexModelSettingsMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCodexModelSettingsBusy(false);
    }
  }

  function confirmWorkpadApproval(approvalId: string): void {
    const approval = snapshot.right.approvals.find((item) => item.id === approvalId);
    if (!approval?.action || !selectedProjectId) return;
    setError(null);
    void (async () => {
      try {
        const result = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: approval.action, confirm: true }),
        });
        if (!result.ok) throw new Error(await result.text());
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
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
      };
      if (showPendingBeforeCreate) {
        setOrchestrationOpen(false);
        setSelectedProjectId(effectiveProjectId);
        persistSelectedProjectId(effectiveProjectId);
        setSelectedTopic(pendingConversation.id);
        setPendingDemandConversation(pendingConversation);
        setLiveItems([]);
        setLiveTurns([]);
        setLoadedTranscript(null);
        setLoadedRunGraph(null);
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
            ? { ...current, id: createdId, title: event.data.topic.title }
            : {
              ...pendingConversation,
              id: createdId,
              title: event.data.topic.title,
              startedAt: new Date().toISOString(),
            });
        }
        handleLiveEvent(event);
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
      }, handleLiveEvent);
      setComposerFileRefs([]);
      setComposerAttachments([]);
    } finally {
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
      }, handleLiveEvent);
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
      setActionRunning(null);
    }
  }

  async function stopAndContinueCurrentRun(): Promise<void> {
    await runWorkflowAction("conversation.interrupt", { prompt: composerText.trim() || undefined });
  }

  async function answerClarification(clarificationId: string, answer: string): Promise<void> {
    if (!selectedProjectId || !activeTopic || !answer.trim()) return;
    setActionRunning("clarification.answer");
    setError(null);
    try {
      const result = await postJson<{ snapshot: Snapshot }>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/clarifications/${encodeURIComponent(clarificationId)}/answer`, {
        changeId: activeTopic.id,
        answer: answer.trim(),
      });
      setSnapshot(result.snapshot);
    } finally {
      setActionRunning(null);
    }
  }

  async function answerCodexUserInput(request: CodexUserInputRequest, answers: Record<string, string | string[]>): Promise<void> {
    if (!selectedProjectId || !activeTopic) return;
    setActionRunning("codex.userInput.answer");
    setError(null);
    setLiveItems((current) => current.map((item) => item.codexUserInput?.requestKey === request.requestKey ? {
      ...item,
      status: "submitting",
      codexUserInput: { ...item.codexUserInput!, status: "submitting", answers },
    } : item));
    try {
      const result = await postJson<{ result: unknown; snapshot: Snapshot }>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/codex/user-input/${encodeURIComponent(request.requestId)}/answer`, {
        changeId: request.changeId,
        conversationId: request.conversationId ?? (!request.changeId ? activeTopic.id : undefined),
        requestKey: request.requestKey,
        answers,
      });
      setSnapshot(result.snapshot);
      const submittedAt = new Date().toISOString();
      setLiveItems((current) => current.map((item) => item.codexUserInput?.requestKey === request.requestKey ? {
        ...item,
        status: "submitted",
        codexUserInput: { ...item.codexUserInput!, status: "submitted", answers, submittedAt },
      } : item));
    } catch (cause) {
      setLiveItems((current) => current.map((item) => item.codexUserInput?.requestKey === request.requestKey ? {
        ...item,
        status: "pending",
        codexUserInput: { ...item.codexUserInput!, status: "pending" },
      } : item));
      throw cause;
    } finally {
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
      }, handleLiveEvent);
    } finally {
      setActionRunning(null);
    }
  }

  async function sendPlanHandoff(candidate: PlanHandoffCandidate, kind: PlanHandoffIntentKind, feedback?: string): Promise<void> {
    if (!selectedProjectId || !activeTopic) return;
    if (activeTopic.state !== "active") {
      setError("已完成或稍后处理的需求对话为只读，不能继续交接计划。");
      return;
    }
    setActionRunning("plan.handoff");
    setError(null);
    const trimmedFeedback = feedback?.trim();
    const message = kind === "cancel-plan"
      ? "取消当前计划，不进入执行。"
      : kind === "revise-plan"
      ? `请主 Agent 先审查下面的计划修改意见，再决定是否让 Plan Agent 修改计划：\n\n${trimmedFeedback ?? ""}`
      : "请主 Agent 基于当前计划继续判断执行路径。";
    try {
      await consumeWorkbenchLiveStream(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/topics/${encodeURIComponent(activeTopic.id)}/messages/live`, {
        mode: "chat",
        message,
        planHandoffIntent: {
          sourceRunId: candidate.sourceRunId,
          sourceAgentRoleId: candidate.sourceAgentRoleId,
          sourceArtifact: candidate.sourceArtifact,
          kind,
          feedback: trimmedFeedback || undefined,
        },
      }, handleLiveEvent);
    } finally {
      setActionRunning(null);
    }
  }

  async function cancelPlanHandoff(candidate: PlanHandoffCandidate): Promise<void> {
    await sendPlanHandoff(candidate, "cancel-plan");
  }

  function handleLiveEvent(event: WorkbenchLiveEvent): void {
    if (event.event === "topic.created") {
      const topicId = event.data.topic.conversationId ?? event.data.topic.id ?? event.data.topic.changeId;
      if (!topicId) return;
      setSelectedTopic(topicId);
      syncWorkbenchLocation(selectedProjectId, topicId);
      setPendingDemandConversation((current) => current
        ? { ...current, id: topicId, title: event.data.topic.title }
        : current);
      return;
    }
    if (event.event === "snapshot") {
      setSnapshot(event.data);
      const snapshotCells = event.data.center.parentAgentTranscript.cells ?? [];
      setLiveItems((current) => current.filter((item) => !transcriptContainsLiveItem(snapshotCells, item)));
      setLiveTurns((current) => current.filter((turn) => !snapshotContainsTurn(event.data, turn)));
      setAgentLiveTurns((current) => current.filter((turn) => !snapshotContainsAgentTurn(event.data, turn)));
      setPendingDemandConversation(null);
      invalidateProjectionCache();
      return;
    }
    if (event.event === "error") {
      if (event.data.runId) {
        if (isTransientReconnectMessage(event.data.message)) {
          if (isChildLiveIdentity(event.data)) {
            appendAgentLiveTurnEvent(event.data.runId, { kind: "status", label: "connecting", detail: "正在重新连接" }, event.data, "connecting");
          } else {
            appendLiveTurnEvent(event.data.runId, { kind: "status", label: "connecting", detail: "正在重新连接" }, "connecting", undefined, event.data);
          }
          return;
        }
        if (isChildLiveIdentity(event.data)) {
          appendAgentLiveTurnEvent(event.data.runId, { kind: "error", message: event.data.message }, event.data, "failed");
        } else {
          appendLiveTurnEvent(event.data.runId, { kind: "error", message: event.data.message }, "failed", undefined, event.data);
        }
        return;
      }
      setError(event.data.message);
      return;
    }
    if (event.event === "assistant.delta") {
      const runId = event.data.runId ?? event.data.agentTaskId ?? "assistant";
      if (isChildLiveIdentity(event.data)) {
        appendAgentLiveTurnText(runId, event.data.delta, event.data);
      } else {
        appendLiveTurnText(runId, event.data.delta, event.data);
      }
      return;
    }
    if (event.event === "codex.userInput.requested") {
      appendLiveItem({
        id: `codex-user-input:${event.data.requestKey}`,
        kind: "assistant-turn",
        label: "需要你回答",
        timestamp: new Date().toISOString(),
        source: "chat",
        status: event.data.status,
        graphScopeId: event.data.graphScopeId,
        runId: event.data.runId,
        threadId: event.data.threadId,
        turnId: event.data.turnId,
        agentRoleId: event.data.agentRoleId,
        agentTaskId: event.data.agentTaskId,
        codexUserInput: event.data,
      });
      return;
    }
    if (event.event === "codex.userInput.submitted") {
      setLiveItems((current) => current.map((item) => item.codexUserInput?.requestKey === event.data.requestKey ? {
        ...item,
        status: "submitted",
        codexUserInput: { ...item.codexUserInput!, status: "submitted" },
      } : item));
      return;
    }
    if (event.event === "assistant.message") {
      if (event.data.agentRoleId && event.data.agentRoleId !== "main-agent") {
        const runId = event.data.runId ?? event.data.agentTaskId ?? `agent-message:${event.data.id}`;
        mergeAgentDurableMessage(runId, event.data.agentRoleId, event.data.agentTaskId, event.data);
        return;
      }
      if (event.data.runId) completeLiveTurn(event.data.runId, event.data.text, event.data);
      else appendLiveItem(threadItemFromTopicEntry(event.data));
      return;
    }
    if (event.event === "assistant.event") {
      if (isChildLiveIdentity(event.data)) {
        appendAgentLiveTurnEvent(event.data.runId, { kind: "assistant-event", event: event.data }, event.data, event.data.isError ? "failed" : event.data.phase, blockFromAssistantEvent(event.data));
      } else {
        appendLiveTurnEvent(event.data.runId, { kind: "assistant-event", event: event.data }, event.data.isError ? "failed" : event.data.phase, blockFromAssistantEvent(event.data), event.data);
      }
      return;
    }
    if (event.event === "tool.event") {
      if (isChildLiveIdentity(event.data)) {
        appendAgentLiveTurnEvent(event.data.runId, { kind: "tool", tool: event.data }, event.data, event.data.isError ? "failed" : undefined, blockFromToolEvent(event.data));
      } else {
        appendLiveTurnEvent(event.data.runId, { kind: "tool", tool: event.data }, event.data.isError ? "failed" : undefined, blockFromToolEvent(event.data), event.data);
      }
      return;
    }
    if (event.event === "usage") {
      // Usage can describe the previous provider turn during reconnect. It is
      // diagnostic-only in the conversation UI and must not establish turn identity.
      return;
    }
    if (event.event === "topic.message") {
      appendLiveItem(threadItemFromTopicEntry(event.data));
      return;
    }
    if (event.event === "run.started") {
      const patch = {
        runtime: event.data.runtime,
        actionType: event.data.actionType,
        status: "running",
        events: [{ kind: "status", label: "running", detail: runtimeLabel(event.data.runtime ?? event.data.actionType ?? "Run") }],
      } satisfies Partial<Omit<LiveAssistantTurn, "id" | "runId" | "startedAt">> & { events?: LiveTurnEvent[] };
      if (isChildLiveIdentity(event.data)) {
        upsertAgentLiveTurn(event.data.runId, event.data.agentRoleId ?? "child-agent", event.data.agentTaskId, { ...patch, ...liveTurnIdentity(event.data) });
      } else {
        upsertLiveTurn(event.data.runId, { ...patch, ...liveTurnIdentity(event.data) });
      }
      return;
    }
    if (event.event === "run.status") {
      const runId = event.data.runId ?? event.data.actionRunId ?? (event.data.agentRoleId ? latestAgentLiveRunId() : latestLiveRunId());
      if (runId) {
        if (isChildLiveIdentity(event.data)) {
          appendAgentLiveTurnEvent(runId, { kind: "status", label: event.data.status, detail: event.data.label }, event.data, event.data.status);
        } else {
          appendLiveTurnEvent(runId, { kind: "status", label: event.data.status, detail: event.data.label }, event.data.status, undefined, event.data);
        }
      }
    }
  }

  function latestLiveRunId(): string | undefined {
    return liveTurns[liveTurns.length - 1]?.runId;
  }

  function latestAgentLiveRunId(): string | undefined {
    return agentLiveTurns[agentLiveTurns.length - 1]?.runId;
  }

  function openChildAgentWorkspace(agentSurfaceId: string): void {
    if (!agentSurfaceId || agentSurfaceId === "main-agent") return;
    setOpenAgentSurfaceIds((current) => current.includes(agentSurfaceId) ? current : [...current, agentSurfaceId]);
    setSelectedAgentWorkspaceAgentId(agentSurfaceId);
    setRightToolView("agent");
    setDecisionPaneCollapsed(false);
  }

  function closeChildAgentWorkspace(agentSurfaceId: string): void {
    setOpenAgentSurfaceIds((current) => {
      const index = current.indexOf(agentSurfaceId);
      const next = current.filter((id) => id !== agentSurfaceId);
      setSelectedAgentWorkspaceAgentId((selected) => selected === agentSurfaceId ? next[Math.min(index, next.length - 1)] ?? null : selected);
      return next;
    });
  }

  function upsertLiveTurn(runId: string, patch: Partial<Omit<LiveAssistantTurn, "id" | "runId" | "startedAt">> & { events?: LiveTurnEvent[] }): void {
    upsertLiveTurnIn(setLiveTurns, runId, patch);
  }

  function upsertAgentLiveTurn(
    runId: string,
    agentRoleId: string,
    agentTaskId: string | undefined,
    patch: Partial<Omit<LiveAssistantTurn, "id" | "runId" | "startedAt">> & { events?: LiveTurnEvent[] },
  ): void {
    upsertLiveTurnIn(setAgentLiveTurns, runId, { ...patch, agentRoleId, agentTaskId });
  }

  function mergeAgentDurableMessage(
    runId: string,
    agentRoleId: string,
    agentTaskId: string | undefined,
    message: TopicMessageEntry,
  ): void {
    setAgentLiveTurns((current) => {
      const identity = { ...liveTurnIdentity(message), agentRoleId, agentTaskId };
      const existing = findCompatibleLiveTurn(current, runId, identity);
      if (!existing) {
        return [...current, {
          id: `live-turn:${liveTurnIdentityKey(runId, identity)}`,
          runId,
          ...identity,
          status: "completed",
          text: message.text ?? "",
          events: [],
          blocks: message.blocks ?? [],
          startedAt: message.timestamp ?? new Date().toISOString(),
          endedAt: message.timestamp ?? new Date().toISOString(),
        }];
      }
      const mergedBlocks = (message.blocks ?? []).reduce((items, block) => upsertBlock(items, block), existing.blocks);
      const messageText = message.text?.trim();
      const text = messageText && !existing.text.includes(messageText)
        ? [existing.text.trim(), messageText].filter(Boolean).join("\n\n")
        : existing.text;
      return current.map((turn) => turn === existing ? {
        ...turn,
        ...identity,
        status: "completed",
        text,
        blocks: mergedBlocks,
        endedAt: message.timestamp ?? turn.endedAt ?? new Date().toISOString(),
      } : turn);
    });
  }

  function upsertLiveTurnIn(
    setter: LiveTurnSetter,
    runId: string,
    patch: Partial<Omit<LiveAssistantTurn, "id" | "runId" | "startedAt">> & { events?: LiveTurnEvent[] },
  ): void {
    setter((current) => {
      const identityKey = liveTurnIdentityKey(runId, patch);
      const existing = findCompatibleLiveTurn(current, runId, patch);
      if (!existing) {
        return [...current, {
          id: `live-turn:${identityKey}`,
          runId,
          projectId: patch.projectId,
          conversationId: patch.conversationId,
          changeId: patch.changeId,
          threadId: patch.threadId,
          parentThreadId: patch.parentThreadId,
          turnId: patch.turnId,
          agentSurfaceId: patch.agentSurfaceId,
          agentDisplayName: patch.agentDisplayName,
          agentRoleId: patch.agentRoleId,
          agentTaskId: patch.agentTaskId,
          runtime: patch.runtime,
          actionType: patch.actionType,
          status: patch.status ?? "running",
          text: patch.text ?? "",
          events: patch.events ?? [],
          blocks: patch.blocks ?? [],
          startedAt: new Date().toISOString(),
          endedAt: patch.endedAt,
        }];
      }
      return current.map((turn) => turn === existing ? { ...turn, ...patch, events: patch.events ?? turn.events, blocks: patch.blocks ?? turn.blocks } : turn);
    });
  }

  function appendLiveTurnText(runId: string, delta: string, identity?: WorkbenchLiveIdentity): void {
    appendLiveTurnTextIn(setLiveTurns, runId, delta, identity);
  }

  function appendAgentLiveTurnText(runId: string, delta: string, identity: WorkbenchLiveIdentity): void {
    appendLiveTurnTextIn(setAgentLiveTurns, runId, delta, identity);
  }

  function appendLiveTurnTextIn(setter: LiveTurnSetter, runId: string, delta: string, identity: WorkbenchLiveIdentity = {}): void {
    setter((current) => {
      const identityKey = liveTurnIdentityKey(runId, identity);
      const existing = findCompatibleLiveTurn(current, runId, identity);
      if (!existing) {
        return [...current, {
          id: `live-turn:${identityKey}`,
          runId,
          ...liveTurnIdentity(identity),
          status: "replying",
          text: delta,
          events: [{ kind: "status", label: "replying" }],
          blocks: [proseBlock(runId, delta, 1, identity)],
          startedAt: new Date().toISOString(),
        }];
      }
      return current.map((turn) => {
        if (turn !== existing) return turn;
        return { ...turn, ...liveTurnIdentity(identity), status: "replying", text: `${turn.text}${delta}`, blocks: appendProseBlock(turn.blocks, runId, delta, identity) };
      });
    });
  }

  function appendLiveTurnEvent(runId: string, event: LiveTurnEvent, status?: string, block?: AssistantTurnBlock | null, identity?: WorkbenchLiveIdentity): void {
    appendLiveTurnEventIn(setLiveTurns, runId, event, status, block, identity);
  }

  function appendAgentLiveTurnEvent(
    runId: string,
    event: LiveTurnEvent,
    identity: WorkbenchLiveIdentity,
    status?: string,
    block?: AssistantTurnBlock | null,
  ): void {
    appendLiveTurnEventIn(setAgentLiveTurns, runId, event, status, block, identity);
  }

  function appendLiveTurnEventIn(setter: LiveTurnSetter, runId: string, event: LiveTurnEvent, status?: string, block?: AssistantTurnBlock | null, identity: WorkbenchLiveIdentity = {}): void {
    setter((current) => {
      const identityKey = liveTurnIdentityKey(runId, identity);
      const existing = findCompatibleLiveTurn(current, runId, identity);
      if (!existing) {
        return [...current, {
          id: `live-turn:${identityKey}`,
          runId,
          ...liveTurnIdentity(identity),
          status: status ?? "running",
          text: "",
          events: [event],
          blocks: block ? [block] : [],
          startedAt: new Date().toISOString(),
        }];
      }
      return current.map((turn) => {
        if (turn !== existing) return turn;
        const key = liveTurnEventKey(event);
        const nextEvents = key && turn.events.some((existingEvent) => liveTurnEventKey(existingEvent) === key)
          ? turn.events.map((existingEvent) => liveTurnEventKey(existingEvent) === key ? event : existingEvent)
          : [...turn.events, event];
        return { ...turn, ...liveTurnIdentity(identity), status: status ?? turn.status, events: nextEvents, blocks: block ? upsertBlock(turn.blocks, block) : turn.blocks };
      });
    });
  }

  function completeLiveTurn(runId: string, text?: string, identity?: WorkbenchLiveIdentity): void {
    completeLiveTurnIn(setLiveTurns, runId, text, identity);
  }

  function completeLiveTurnIn(setter: LiveTurnSetter, runId: string, text?: string, identity: WorkbenchLiveIdentity = {}): void {
    setter((current) => {
      const existing = findCompatibleLiveTurn(current, runId, identity);
      if (!existing) return current;
      return current.map((turn) => turn === existing ? {
        ...turn,
        ...liveTurnIdentity(identity),
        status: "completed",
        text: text || turn.text || "",
        blocks: text && !turn.blocks.some((block) => block.kind === "prose")
          ? [proseBlock(runId, text, 1, identity), ...turn.blocks]
          : turn.blocks,
        endedAt: new Date().toISOString(),
      } : turn);
    });
  }

  function liveTurnEventKey(event: LiveTurnEvent): string | null {
    if (event.kind === "assistant-event") {
      const item = event.event;
      return `assistant:${item.runId}:${item.threadId ?? "main"}:${item.itemId ?? item.title ?? item.summary ?? ""}:${item.kind}`;
    }
    if (event.kind === "tool") {
      return `tool:${event.tool.runId}:${event.tool.threadId ?? "main"}:${event.tool.itemId ?? event.tool.command ?? event.tool.name ?? ""}`;
    }
    if (event.kind === "usage") return `usage:${JSON.stringify(event.usage)}`;
    if (event.kind === "error") return `error:${event.message}`;
    return null;
  }

  function appendLiveItem(item: ThreadStreamItem | null): void {
    if (!item) return;
    setLiveItems((current) => {
      const withoutDuplicate = current.filter((existing) => existing.id !== item.id);
      return [...withoutDuplicate, item];
    });
  }

  function invalidateProjectionCache(): void {
    setLoadedTranscript(null);
    setLoadedRunGraph(null);
    setProjectionVersion((value) => value + 1);
  }

  function clearTopicScopedLiveState(): void {
    setLiveItems([]);
    setLiveTurns([]);
    setAgentLiveTurns([]);
    setActionRunning(null);
    setLatestHidden(false);
    setSelectedAgentWorkspaceAgentId(null);
    setOpenAgentSurfaceIds([]);
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
    }
    : snapshot.center.selectedTopic;
  const activeTopicIsConversation = activeTopic?.kind === "conversation";
  const isPendingTopic = Boolean(activePendingConversation && activeTopic?.id === activePendingConversation.id);
  const activeWorkpad = activePendingConversation ? emptyWorkpad(activePendingConversation.title) : snapshot.center.workpad ?? emptyWorkpad(activeTopic?.title ?? projectDisplayName(snapshot.project));
  const activeRun = useMemo(() => snapshot.center.agentLoop.runs.find((run) => run.id === selectedRun) ?? snapshot.center.agentLoop.runs[0], [snapshot, selectedRun]);
  const selectedProjectStatus = useMemo(() => projects.find((item) => item.project?.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const selectedProjectHistoryUnavailable = Boolean(selectedProjectStatus?.managed && selectedProjectStatus.memory?.memoryAvailable === false);
  const runIds = useMemo(() => snapshot.center.agentLoop.runs.map((run) => run.id).join("|"), [snapshot.center.agentLoop.runs]);
  const pendingHasLiveUserMessage = Boolean(activePendingConversation && liveItems.some((item) => item.kind === "user-message" && (item.body ?? item.label) === activePendingConversation.body));
  const snapshotTranscript = useMemo(() => {
    if (activePendingConversation) return pendingDemandTranscript(activePendingConversation, !pendingHasLiveUserMessage);
    return normalizeParentAgentTranscript(loadedTranscript ?? snapshot.center.parentAgentTranscript);
  }, [activePendingConversation, loadedTranscript, pendingHasLiveUserMessage, snapshot.center.parentAgentTranscript]);
  const activeTranscript = useMemo(() => {
    return mergeLiveItemsIntoTranscript(
      snapshotTranscript,
      liveItems.filter((item) => !item.agentRoleId || item.agentRoleId === "main-agent"),
      liveTurns,
    );
  }, [snapshotTranscript, liveItems, liveTurns]);
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
  const activeAgentWorkspace = useMemo(() => mergeLiveAgentWorkspace(
    snapshot.right.agentWorkspace ?? { selectedAgentId: "planning-agent", agents: [] },
    agentLiveTurns,
  ), [snapshot.right.agentWorkspace, agentLiveTurns]);

  useEffect(() => {
    if (!selectedProjectId || !selectedProjectStatus?.managed || typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/events/live`);
    source.onmessage = (message) => {
      try {
        handleLiveEvent(JSON.parse(message.data) as WorkbenchLiveEvent);
      } catch {
        // The request-level snapshot remains authoritative after malformed diagnostic frames.
      }
    };
    return () => source.close();
  }, [selectedProjectId, selectedProjectStatus?.managed, selectedTopic]);
  const rawPlanHandoffCandidate = useMemo(() => derivePlanHandoffCandidate(activeAgentWorkspace), [activeAgentWorkspace]);
  const planHandoffCandidate = activeTopic?.id ? rawPlanHandoffCandidate : null;
  const pendingConfirmationCount = (activeConfirmationQueue.primary ? 1 : 0)
    + activeConfirmationQueue.otherDemands.length
    + activeConfirmationQueue.maintenance.length;
  const rawActiveRunGraph = isPendingTopic
    ? pendingMainAgentRunGraph(selectedProjectId, activeTopic?.id)
    : loadedRunGraph ?? snapshot.center.agentRunGraph;
  const mainConversationRequestRunning = Boolean(activePendingConversation)
    || actionRunning === "topic.create"
    || actionRunning === "chat.ask";
  const activeRunGraph = mergeLiveAgentGraph(
    isDemandAgentRunGraph(rawActiveRunGraph) ? rawActiveRunGraph : emptyAgentRunGraph(),
    [...liveTurns, ...agentLiveTurns].filter((turn) => liveTurnBelongsToTopic(turn, activeTopic?.id, activeTopic?.boundChangeId)),
    mainConversationRequestRunning,
  );
  useEffect(() => {
    const graphScopeId = activeRunGraph.graphScopeId;
    if (!graphScopeId) return;
    const previous = graphScopeRef.current;
    graphScopeRef.current = graphScopeId;
    if (!previous || previous === graphScopeId) return;
    setSelectedRunGraphNodeId(null);
    setSelectedAgentWorkspaceAgentId(null);
    setOpenAgentSurfaceIds([]);
  }, [activeRunGraph.graphScopeId]);
  const selectedRunGraphNode = useMemo(() => (
    activeRunGraph.nodes.find((node) => node.id === selectedRunGraphNodeId) ?? activeRunGraph.nodes[0] ?? null
  ), [activeRunGraph.nodes, selectedRunGraphNodeId]);
  function selectRunGraphNode(nodeId: string): void {
    const node = activeRunGraph.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    setSelectedRunGraphNodeId(nodeId);
    if (node.kind === "main-agent") {
      closeOrchestrationOverlay();
      return;
    }
    const agentId = node.target.agentSurfaceId ?? node.id;
    openChildAgentWorkspace(agentId);
  }
  const codexModelLabel = codexModelSettings?.effectiveModel?.trim()
    || codexDiagnostics?.effectiveModel?.trim()
    || codexDiagnostics?.currentModel?.trim()
    || "默认模型";

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
      const agentId = selectedAgentWorkspaceAgentId
        ?? activeAgentWorkspace.agents.find((agent) => agent.status === "running")?.id
        ?? activeAgentWorkspace.agents[0]?.id;
      if (agentId) openChildAgentWorkspace(agentId);
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
      setRunGraphLoadState("loading");
      setOrchestrationOpen(true);
      syncWorkbenchOrchestrationTab(true);
    }
  }

  useEffect(() => {
    const restore = readWorkbenchRestoreParams();
    setOrchestrationOpen((current) => current || Boolean(
      restore.topicId && restore.topicId === activeTopic?.id && restore.orchestrationOpen,
    ));
    setSelectedRunGraphNodeId(null);
    setLoadedTranscript(null);
    setLoadedRunGraph(null);
    setRunGraphLoadState("idle");
    setRunGraphLoadError(null);
    setComposerAttachments([]);
    setRuntimeActivityLog(null);
  }, [activeTopic?.id, isPendingTopic]);

  async function loadEarlierTranscriptPage(): Promise<void> {
    if (!selectedProjectId || !activeTopic?.id || isPendingTopic || loadingEarlierTranscript) return;
    const cursor = activeTranscript.paging?.nextBeforeCursor;
    if (!cursor || activeTranscript.paging?.hasMoreBefore === false) return;
    setLoadingEarlierTranscript(true);
    try {
      const projection = await fetchJson<ParentAgentTranscript>(
        `/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/projections/transcript/${encodeURIComponent(activeTopic.id)}?limit=100&beforeCursor=${encodeURIComponent(cursor)}`,
      );
      if (isParentAgentTranscriptPayload(projection)) {
        setLoadedTranscript((current) => mergeTranscriptPage(current, normalizeParentAgentTranscript(projection)));
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingEarlierTranscript(false);
    }
  }

  async function createTopicFromComposer(): Promise<void> {
    await createTopicFromText(composerText, composerFileRefs, composerAttachments.map((attachment) => attachment.id));
  }

  useEffect(() => {
    if (!selectedProjectId || !activeTopic?.id || isPendingTopic) return;
    let cancelled = false;
    fetchJson<ParentAgentTranscript>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/projections/transcript/${encodeURIComponent(activeTopic.id)}?limit=100`)
      .then((projection) => {
        if (!cancelled && isParentAgentTranscriptPayload(projection)) {
          const normalized = normalizeParentAgentTranscript(projection);
          setLoadedTranscript(normalized);
          setLiveItems((current) => current.filter((item) => !transcriptContainsLiveItem(normalized.cells ?? [], item)));
          setLiveTurns((current) => current.filter((turn) => !transcriptContainsMainTurn(normalized.cells ?? [], turn)));
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [selectedProjectId, activeTopic?.id, isPendingTopic, projectionVersion]);

  useEffect(() => {
    if (!selectedProjectId || !activeTopic?.id || !orchestrationOpen || isPendingTopic) return;
    let cancelled = false;
    setRunGraphLoadState("loading");
    setRunGraphLoadError(null);
    fetchJson<DemandAgentRunGraph>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/projections/run-graph/${encodeURIComponent(activeTopic.id)}`)
      .then((projection) => {
        if (cancelled) return;
        if (!isDemandAgentRunGraph(projection) || projection.nodes.length === 0) {
          setRunGraphLoadState("error");
          setRunGraphLoadError("无法加载 Agent 关系，请重试。");
          return;
        }
        setLoadedRunGraph(projection);
        setRunGraphLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setRunGraphLoadState("error");
          setRunGraphLoadError("暂时无法读取 Agent 关系，请重试。");
        }
      });
    return () => { cancelled = true; };
  }, [selectedProjectId, activeTopic?.id, orchestrationOpen, isPendingTopic, projectionVersion, runGraphReloadVersion]);

  useEffect(() => {
    const node = threadScrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distance < 140) {
      node.scrollTop = node.scrollHeight;
      setLatestHidden(false);
    } else {
      setLatestHidden(true);
    }
  }, [activeTranscript.items.length, liveTurns.length]);

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
            diagnostics={codexDiagnostics}
            modelSettings={codexModelSettings}
            providerCapabilities={providerCapabilities}
            modelSettingsBusy={codexModelSettingsBusy}
            modelSettingsMessage={codexModelSettingsMessage}
            onOpenModelSettings={() => void openCodexModelPicker()}
            onClose={closeSettings}
            onRefresh={() => loadApp().then(() => loadCodexDiagnostics()).then(() => loadCodexModelSettings()).then(() => loadProviderCapabilities()).then(() => loadSkillSummary())}
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
            modelLabel={codexModelLabel}
            onOpenModelSettings={() => void openCodexModelPicker()}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onCreateDemand={createTopicFromText}
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
                  {(runGraphLoadState === "idle" || runGraphLoadState === "loading") && activeRunGraph.nodes.length === 0 ? (
                    <div className="agent-graph-view-state" role="status">正在加载 Agent 关系...</div>
                  ) : runGraphLoadState === "error" ? (
                    <div className="agent-graph-view-state error" role="alert">
                      <strong>Agent 关系加载失败</strong>
                      <span>{runGraphLoadError ?? "请稍后重试。"}</span>
                      <button type="button" className="outline-button" onClick={() => setRunGraphReloadVersion((value) => value + 1)}>重试</button>
                    </div>
                  ) : (
                    <AgentRunGraphPanel
                      graph={activeRunGraph}
                      selectedNode={selectedRunGraphNode}
                      activeRun={activeRun}
                      stream={stream}
                      onSelectNode={selectRunGraphNode}
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
                    setLatestHidden(node.scrollHeight - node.scrollTop - node.clientHeight > 180);
                  }}
                >
                  <MainConversationView
                    workpad={activeWorkpad}
                    transcript={activeTranscript}
                    scrollContainerRef={threadScrollRef}
                    onLoadEarlierTranscript={loadEarlierTranscriptPage}
                    loadingEarlierTranscript={loadingEarlierTranscript}
                    liveTurns={liveTurns}
                    busy={actionRunning !== null}
                    approvals={snapshot.right.approvals}
                    onAction={runWorkflowAction}
                    onConfirmApproval={confirmWorkpadApproval}
                    onAnswerClarification={answerClarification}
                    onAnswerCodexUserInput={answerCodexUserInput}
                    onSelectDecisionContext={setSelectedDecisionContextId}
                    onOpenAgent={openChildAgentWorkspace}
                    planHandoffCandidate={planHandoffCandidate}
                    onPlanHandoff={sendPlanHandoff}
                    onCancelPlanHandoff={cancelPlanHandoff}
                  />
                </div>
                {latestHidden ? <button className="latest-button" onClick={() => { const node = threadScrollRef.current; if (node) node.scrollTop = node.scrollHeight; setLatestHidden(false); }}>最新</button> : null}
                <TopicComposer
                    value={composerText}
                    onChange={setComposerText}
                    modelLabel={codexModelLabel}
                    onOpenModelSettings={() => void openCodexModelPicker()}
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
                />
              </div>
              )}
            </section>
          </>
        )}
        </div>
        {!settingsOpen ? <WorkspaceDockToggleBar
          orchestrationActive={orchestrationOpen}
          orchestrationNeedsAttention={activeRunGraph.nodes.some((node) => node.status === "waiting-user")}
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
          <AgentWorkspacePanel
            workspace={activeAgentWorkspace}
            selectedAgentId={selectedAgentWorkspaceAgentId}
            openAgentIds={openAgentSurfaceIds}
            liveItems={liveItems}
            liveTurns={agentLiveTurns}
            busy={actionRunning !== null}
            onSelectAgent={setSelectedAgentWorkspaceAgentId}
            onCloseAgent={closeChildAgentWorkspace}
            onBack={() => setRightToolView("launcher")}
            onAnswerClarification={answerClarification}
            onAnswerCodexUserInput={answerCodexUserInput}
            onSendAgentMessage={sendAgentWorkspaceMessage}
            modelLabel={codexModelLabel}
            onOpenModelSettings={() => void openCodexModelPicker()}
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

      <CodexModelPicker
        open={codexModelPickerOpen}
        snapshot={codexModelSettings}
        busy={codexModelSettingsBusy}
        message={codexModelSettingsMessage}
        onClose={() => setCodexModelPickerOpen(false)}
        onRefresh={() => loadCodexModelSettings()}
        onSelect={(selectedModel) => updateCodexModelSettings({ selectedModel })}
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

function emptyAgentRunGraph(): DemandAgentRunGraph {
  return {
    title: "Agent 关系",
    summary: "真实子 Agent 开始工作后，会在这里显示父子关系。",
    lanes: [
      { id: "main", label: "主 Agent", description: "当前需求对话" },
      { id: "roles", label: "子 Agent", description: "真实创建的 Agent" },
    ],
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
      parentAgentTranscript: previous.center.parentAgentTranscript,
      agentRunGraph: previous.center.agentRunGraph,
      agentLoop: previous.center.agentLoop,
    },
    right: {
      ...next.right,
      agentWorkspace: previous.right.agentWorkspace,
    },
  };
}

function isCodexDiagnostics(value: unknown): value is CodexDiagnostics {
  if (!value || typeof value !== "object") return false;
  const diagnostics = value as Partial<CodexDiagnostics>;
  return diagnostics.provider === "codex"
    && typeof diagnostics.available === "boolean"
    && typeof diagnostics.configPath === "string"
    && Array.isArray(diagnostics.errors)
    && typeof diagnostics.capabilities === "object"
    && diagnostics.capabilities !== null;
}

function isCodexModelSettingsSnapshot(value: unknown): value is CodexModelSettingsSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<CodexModelSettingsSnapshot>;
  return (snapshot.effectiveModel === null || typeof snapshot.effectiveModel === "string" || snapshot.effectiveModel === undefined)
    && (snapshot.effectiveModelSource === "selected" || snapshot.effectiveModelSource === "config" || snapshot.effectiveModelSource === "codex-default")
    && Array.isArray(snapshot.candidates)
    && typeof snapshot.modelList === "object"
    && snapshot.modelList !== null
    && Array.isArray(snapshot.modelList.candidates);
}

function isProviderCapabilitySnapshot(value: unknown): value is ProviderCapabilitySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ProviderCapabilitySnapshot>;
  return snapshot.providerId === "codex"
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

function pendingMainAgentRunGraph(projectId: string | null, conversationId?: string): DemandAgentRunGraph {
  return {
    ...emptyAgentRunGraph(),
    conversationId,
    summary: "主 Agent 正在处理当前需求。",
    nodes: [{
      id: "main-agent",
      kind: "main-agent",
      lane: "main",
      label: "主 Agent",
      roleId: "main-agent",
      status: "running",
      summary: "",
      reason: "",
      target: { projectId, conversationId, roleId: "main-agent", agentSurfaceId: "main-agent" },
      visualKind: "agent",
      evidenceRefs: [],
      attempts: [],
    }],
  };
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

function isChildLiveIdentity(identity: WorkbenchLiveIdentity): boolean {
  return Boolean(identity.parentThreadId || (identity.agentRoleId && identity.agentRoleId !== "main-agent"));
}

function isTransientReconnectMessage(message: string): boolean {
  return /^reconnecting(?:\.\.\.)?\s*\d+\/\d+/i.test(message.trim());
}

function liveTurnIdentity(identity: WorkbenchLiveIdentity): Partial<LiveAssistantTurn> {
  const result: Partial<LiveAssistantTurn> = {};
  if (identity.projectId !== undefined) result.projectId = identity.projectId;
  if (identity.conversationId !== undefined) result.conversationId = identity.conversationId;
  if (identity.graphScopeId !== undefined) result.graphScopeId = identity.graphScopeId;
  if (identity.changeId !== undefined) result.changeId = identity.changeId;
  if (identity.threadId !== undefined) result.threadId = identity.threadId;
  if (identity.parentThreadId !== undefined) result.parentThreadId = identity.parentThreadId;
  if (identity.turnId !== undefined) result.turnId = identity.turnId;
  if (identity.agentRoleId !== undefined) result.agentRoleId = identity.agentRoleId;
  if (identity.agentTaskId !== undefined) result.agentTaskId = identity.agentTaskId;
  const agentSurfaceId = identity.agentSurfaceId ?? (identity.threadId ? `thread:${identity.threadId}` : undefined);
  if (agentSurfaceId !== undefined) result.agentSurfaceId = agentSurfaceId;
  if (identity.agentDisplayName !== undefined) result.agentDisplayName = identity.agentDisplayName;
  return result;
}

function liveTurnIdentityKey(runId: string, identity: Pick<LiveAssistantTurn, "threadId" | "turnId"> | WorkbenchLiveIdentity): string {
  return `${runId}:${identity.threadId ?? "main"}:${identity.turnId ?? "turn"}`;
}

function snapshotContainsTurn(snapshot: Snapshot, turn: LiveAssistantTurn): boolean {
  return transcriptContainsMainTurn(snapshot.center.parentAgentTranscript.cells ?? [], turn);
}

function snapshotContainsAgentTurn(snapshot: Snapshot, turn: LiveAssistantTurn): boolean {
  return snapshot.right.agentWorkspace.agents.some((agent) => (
    agent.id === turn.agentSurfaceId
    || (turn.threadId && agent.providerThreadId === turn.threadId)
    || (turn.runId && agent.runId === turn.runId)
  ) && transcriptContainsMainTurn(agent.transcript.cells ?? [], turn));
}

function mergeLiveAgentWorkspace(workspace: AgentWorkspace, liveTurns: LiveAssistantTurn[]): AgentWorkspace {
  const agents = new Map(workspace.agents.map((agent) => [agent.id, agent]));
  for (const turn of liveTurns) {
    const id = turn.agentSurfaceId ?? (turn.threadId ? `thread:${turn.threadId}` : `run:${turn.runId}`);
    const existing = agents.get(id);
    agents.set(id, existing ? {
      ...existing,
      providerThreadId: existing.providerThreadId ?? turn.threadId,
      parentThreadId: existing.parentThreadId ?? turn.parentThreadId,
      runId: existing.runId ?? turn.runId,
      label: turn.agentDisplayName ? composeAgentDisplayLabel(turn.agentRoleId ?? existing.roleId, turn.agentDisplayName) : existing.label,
      status: turn.status,
    } : {
      id,
      roleId: turn.agentRoleId ?? "child-agent",
      providerThreadId: turn.threadId,
      parentThreadId: turn.parentThreadId,
      runId: turn.runId,
      label: composeAgentDisplayLabel(turn.agentRoleId, turn.agentDisplayName),
      status: turn.status,
      summary: "真实 Agent 对话。",
      transcript: { title: composeAgentDisplayLabel(turn.agentRoleId, turn.agentDisplayName), cells: [], items: [], emptyMessage: "Agent 正在处理。" },
      evidenceRefs: [],
      actions: [],
    });
  }
  const numbered = numberDuplicateAgentLabels([...agents.values()]);
  return { ...workspace, agents: numbered };
}

function liveTurnBelongsToTopic(turn: LiveAssistantTurn, topicId?: string, changeId?: string | null): boolean {
  if (!topicId) return false;
  return turn.conversationId === topicId || turn.changeId === (changeId ?? topicId);
}

function mergeLiveAgentGraph(graph: DemandAgentRunGraph, turns: LiveAssistantTurn[], mainRequestRunning = false): DemandAgentRunGraph {
  const liveGraphScopeId = [...turns].reverse().find((turn) => turn.graphScopeId)?.graphScopeId;
  const scopeChanged = Boolean(liveGraphScopeId && liveGraphScopeId !== graph.graphScopeId);
  const scopedTurns = liveGraphScopeId ? turns.filter((turn) => turn.graphScopeId === liveGraphScopeId) : turns;
  const baseGraph = scopeChanged ? { ...graph, graphScopeId: liveGraphScopeId, edges: [] } : graph;
  const nodes = scopeChanged ? graph.nodes.filter((node) => node.kind === "main-agent") : [...graph.nodes];
  if (scopedTurns.length === 0) return { ...baseGraph, nodes: withRunningMainNode(nodes, mainRequestRunning) };
  let edges = [...baseGraph.edges];
  for (const turn of scopedTurns) {
    if (turn.agentRoleId === "main-agent") {
      const mainIndex = nodes.findIndex((node) => node.kind === "main-agent");
      if (mainIndex >= 0) nodes[mainIndex] = { ...nodes[mainIndex], status: graphNodeStatus(turn.status) };
      continue;
    }
    const id = turn.agentSurfaceId ?? (turn.threadId ? `thread:${turn.threadId}` : `run:${turn.runId}`);
    const existingIndex = nodes.findIndex((node) => node.id === id);
    const nextNode: DemandAgentRunGraph["nodes"][number] = {
      ...(existingIndex >= 0 ? nodes[existingIndex] : {}),
      id,
      kind: agentGraphKind(turn.agentRoleId),
      lane: "roles",
      label: composeAgentDisplayLabel(turn.agentRoleId, turn.agentDisplayName),
      roleId: turn.agentRoleId,
      status: graphNodeStatus(turn.status),
      summary: "",
      reason: "",
      target: {
        projectId: turn.projectId ?? null,
        conversationId: turn.conversationId,
        changeId: turn.changeId,
        roleId: turn.agentRoleId,
        agentSurfaceId: id,
        providerThreadId: turn.threadId,
        parentThreadId: turn.parentThreadId,
        runId: turn.runId,
      },
      visualKind: "agent",
      evidenceRefs: [],
      attempts: [],
    };
    if (existingIndex >= 0) nodes[existingIndex] = nextNode;
    else nodes.push(nextNode);
  }
  const ids = new Set(nodes.map((node) => node.id));
  for (const turn of scopedTurns) {
    if (turn.agentRoleId === "main-agent") continue;
    const id = turn.agentSurfaceId ?? (turn.threadId ? `thread:${turn.threadId}` : `run:${turn.runId}`);
    const parentId = turn.parentThreadId && ids.has(`thread:${turn.parentThreadId}`) ? `thread:${turn.parentThreadId}` : "main-agent";
    edges = edges.filter((edge) => edge.to !== id);
    edges.push({ id: `agent-edge:${parentId}:${id}`, from: parentId, to: id, kind: "delegates", label: "" });
  }
  return { ...baseGraph, nodes: numberGraphNodeLabels(withRunningMainNode(nodes, mainRequestRunning)), edges, summary: `${nodes.length} 个真实 Agent` };
}

function withRunningMainNode(nodes: DemandAgentRunGraph["nodes"], running: boolean): DemandAgentRunGraph["nodes"] {
  if (!running) return nodes;
  return nodes.map((node) => node.kind === "main-agent" ? { ...node, status: "running" } : node);
}

function numberGraphNodeLabels(nodes: DemandAgentRunGraph["nodes"]): DemandAgentRunGraph["nodes"] {
  return numberDuplicateDisplayLabels(nodes, (node) => node.kind !== "main-agent");
}

function agentGraphKind(roleId?: string): DemandAgentRunGraph["nodes"][number]["kind"] {
  if (roleId === "planning-agent") return "planning-agent";
  if (roleId === "coder-agent") return "coder-agent";
  if (roleId === "rework-coder") return "rework-coder";
  if (roleId === "auditor-agent") return "auditor-agent";
  if (roleId === "memory-maintenance-agent") return "documentation-agent";
  if (roleId === "harness-evolution-agent") return "evolution-agent";
  if (roleId === "evolution-scorer") return "evolution-scorer";
  return "delegate-task";
}

function graphNodeStatus(status: string): DemandAgentRunGraph["nodes"][number]["status"] {
  if (status === "running" || status === "thinking" || status === "replying" || status === "claimed") return "running";
  if (status === "queued") return "queued";
  if (status === "completed") return "completed";
  if (status === "waiting-user") return "waiting-user";
  if (status === "blocked") return "needs-change";
  if (status === "failed") return "failed";
  return "idle";
}

function numberDuplicateAgentLabels(agents: AgentWorkspaceAgent[]): AgentWorkspaceAgent[] {
  return numberDuplicateDisplayLabels(agents, () => true);
}

function numberDuplicateDisplayLabels<T extends { id: string; label: string; roleId?: string }>(items: T[], include: (item: T) => boolean): T[] {
  const bases = new Map(items.map((item) => [item.id, baseAgentDisplayLabel(item.label, item.roleId)]));
  const totals = new Map<string, number>();
  for (const item of items) if (include(item)) {
    const base = bases.get(item.id)!;
    totals.set(base, (totals.get(base) ?? 0) + 1);
  }
  const indexes = new Map<string, number>();
  const nextByBase = new Map<string, number>();
  for (const item of [...items].filter(include).sort((left, right) => left.id.localeCompare(right.id))) {
    const base = bases.get(item.id)!;
    const next = (nextByBase.get(base) ?? 0) + 1;
    nextByBase.set(base, next);
    indexes.set(item.id, next);
  }
  return items.map((item) => {
    if (!include(item)) return item;
    const base = bases.get(item.id)!;
    return { ...item, label: (totals.get(base) ?? 0) > 1 ? `${base} ${indexes.get(item.id) ?? 1}` : base };
  });
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

function isDemandAgentRunGraph(value: unknown): value is DemandAgentRunGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as Partial<DemandAgentRunGraph>;
  return typeof graph.title === "string"
    && typeof graph.summary === "string"
    && Array.isArray(graph.lanes)
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

