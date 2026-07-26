import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type PointerEvent as ReactPointerEvent } from "react";
import { fetchJson } from "./api.js";
import { MainConversationView,
  AgentOfficePanel,
  RightToolRailShell,
  DecisionInspectorPane,
  BottomStatusBar,
  ProjectFilesPanel,
  ProjectGitPanel,
  RuntimeDiagnosticsRailPanel,
  ResourceWorkspacePanel,
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
import {
  canonicalTimelineScopeKey,
  selectCanonicalTimelineSurface,
  selectCanonicalTimelineTranscript,
} from "./canonicalTimelineStore.js";
import { canonicalTimelineReconnectScopes, useCanonicalTimelineController } from "./canonicalTimelineController.js";
import { useWorkbenchProjectionStream } from "./workbenchProjectionStream.js";

import {
  projectDisplayName,
  stateLabel,
} from "./formatters.js";
import type {
  Snapshot,
  ParentAgentTranscript,
  Workpad,
  DecisionAction,
  DecisionContext,
  WorkbenchLiveEvent,
  TopicAttachment,
  TopicFileReference,
  RuntimeActivityLogSnapshot,
  RuntimeDiagnosticsSnapshot,
  CanonicalTimelineScope,
  CanonicalDocumentReference,
  ConversationInteractionSettlement,
  WorkspaceResourceTarget,
} from "./types.js";
import { ConversationInteractionDock } from "./panels/workbench/ConversationInteractionDock.js";
import { useGlobalOperationGate } from "./controllers/useGlobalOperationGate.js";
import { useMainConversationViewport } from "./controllers/useMainConversationViewport.js";
import { useWorkspaceResourceController } from "./controllers/useWorkspaceResourceController.js";
import { useProviderConfigurationController } from "./controllers/useProviderConfigurationController.js";
import { useConversationActionController } from "./controllers/useConversationActionController.js";
import { useAgentSurfaceController } from "./controllers/useAgentSurfaceController.js";
import { OfficeLoadingScreen } from "./office/OfficeLoadingScreen.js";
import {
  useConversationComposerController,
  type ComposerActionRequest,
} from "./controllers/useConversationComposerController.js";
import { useProjectConversationSession } from "./controllers/useProjectConversationSession.js";

const LEFT_SIDEBAR_DEFAULT_WIDTH = 280;
const LEFT_SIDEBAR_MIN_WIDTH = 220;
const LEFT_SIDEBAR_MAX_WIDTH = 420;
const RIGHT_RAIL_DEFAULT_WIDTH = 320;
const RIGHT_RAIL_MIN_WIDTH = 280;
const RIGHT_RAIL_MAX_WIDTH = 560;
type BottomDockKind = "terminal" | null;

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
  const [orchestrationOpen, setOrchestrationOpen] = useState(false);
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
  const operationGate = useGlobalOperationGate();
  const actionRunning = operationGate.activeKey;
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
  const [projectionVersion, setProjectionVersion] = useState(0);
  const selectedProjectIdRef = useRef<string | null>(null);
  const projectionEventRouterRef = useRef<(projectId: string, event: WorkbenchLiveEvent) => void>(() => undefined);
  const session = useProjectConversationSession({
    timeline: {
      invalidateProjection: invalidateProjectionCache,
      clearProject: timeline.clearProject,
      clearConversation: timeline.clearConversation,
    },
    resources: {
      cleanupTransition: (kind) => workspaceResources.cleanupTransition(kind),
    },
    operations: operationGate,
    ui: {
      transition: (event) => {
        composer.cleanupTransition(event.kind);
        setRuntimeActivityLog(null);
        setOrchestrationOpen(false);
        if (event.resetComposerText) setHomeComposerResetToken((value) => value + 1);
      },
      restoreView: (view) => {
        if (view.orchestrationOpen) setOrchestrationOpen(true);
        if (view.settingsOpen) {
          setSettingsSection("basic");
          setSettingsOpen(true);
        }
      },
      confirmRemoveProject: (projectName) => window.confirm(`移出“${projectName}”？\n\n只会从 App 项目列表移出，不会删除代码、不会修改 Git，也不会删除项目证据。之后可以重新添加。`),
    },
    onError: setError,
  });
  const projects = session.projects;
  const selectedProjectId = session.selectedProjectId;
  const snapshot = session.snapshot;
  const selectedTopic = session.selectedTopic;
  const expandedProjects = session.expandedProjects;
  const projectSnapshots = session.projectSnapshots;
  const pendingDemandConversation = session.pendingDemandConversation;

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
    await session.loadApp();
  }

  async function loadSkillSummary(projectId = selectedProjectId, topicId = selectedTopic): Promise<void> {
    void topicId;
    await composer.reloadSkills(projectId);
  }

  async function refresh(projectId = selectedProjectId, topic = selectedTopic): Promise<Snapshot | void> {
    return session.refresh(projectId, topic);
  }

  async function openProject(projectId: string): Promise<void> {
    await session.openProject(projectId);
  }

  async function beginNewConversation(projectId = selectedProjectId ?? undefined): Promise<void> {
    await session.beginNewConversation(projectId);
  }

  async function toggleProjectFolder(projectId: string): Promise<void> {
    await session.toggleProjectFolder(projectId);
  }

  async function chooseConversation(projectId: string, conversationId: string): Promise<void> {
    await session.chooseConversation(projectId, conversationId);
  }

  async function removeProject(projectId: string): Promise<void> {
    await session.removeProject(projectId);
  }

  async function hideConversation(projectId: string, conversationId: string): Promise<void> {
    await session.hideConversation(projectId, conversationId);
  }

  async function chooseRun(runId: string): Promise<void> {
    await session.chooseRun(runId);
  }

  async function executeDecisionAction(action: DecisionAction, context: DecisionContext): Promise<void> {
    await conversationActions.executeDecisionAction(action, context);
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
    await providerConfiguration.openModelPicker();
  }

  async function updateProviderModelSettings(body: unknown): Promise<void> {
    await providerConfiguration.updateModelSettings(body);
  }

  async function requestDecisionFeedback(context: DecisionContext, action: DecisionAction, feedback: string): Promise<void> {
    await conversationActions.requestDecisionFeedback(context, action, feedback);
  }

  async function toggleComposerSkill(skillId: string): Promise<void> {
    await composer.toggleSkill(skillId);
  }

  async function appendComposerAttachments(files: File[]): Promise<TopicAttachment[]> {
    return composer.appendAttachments(files);
  }

  async function removeComposerAttachment(attachmentId: string): Promise<void> {
    await composer.removeAttachment(attachmentId);
  }

  async function createTopicFromText(body: string, fileRefs: TopicFileReference[] = [], attachmentIds: string[] = [], attachmentFiles: File[] = []): Promise<void> {
    await composer.createConversation({ body, fileRefs, attachmentIds, attachmentFiles });
  }

  async function sendTopicMessage(): Promise<void> {
    await composer.send();
  }

  async function stopAndContinueCurrentRun(): Promise<void> {
    await composer.stop();
  }

  async function settleConversationInteraction(interactionId: string, settlement: ConversationInteractionSettlement): Promise<void> {
    await conversationActions.settleInteraction(interactionId, settlement);
  }

  async function runComposerActionRequest(actionType: "conversation.steer" | "conversation.interrupt", request: ComposerActionRequest): Promise<void> {
    await conversationActions.runWorkflowAction(actionType, { prompt: request.prompt });
  }


  function openChildAgentWorkspace(agentSurfaceId: string): void {
    if (!agentSurfaceId || agentSurfaceId === "main-agent") return;
    const registered = agentSurfaces.surfaces.some((surface) => surface.kind === "agent" && surface.agentSurfaceId === agentSurfaceId);
    if (!registered) return;
    const conversationId = activeTopic?.id;
    if (!conversationId || !selectedProjectId) return;
    openWorkspaceResource({ kind: "agent", conversationId, agentSurfaceId });
    void timeline.loadLatest({ projectId: selectedProjectId, conversationId, agentSurfaceId });
  }

  function openWorkspaceResource(target: WorkspaceResourceTarget): void {
    workspaceResources.openResource(target);
    setRightToolView("agent");
    setDecisionPaneCollapsed(false);
  }

  function selectWorkspaceResource(resourceId: string): void {
    workspaceResources.selectResource(resourceId);
  }

  function closeWorkspaceResource(resourceId: string): void {
    workspaceResources.closeResource(resourceId);
  }

  function invalidateProjectionCache(): void {
    setProjectionVersion((value) => value + 1);
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
  const workspaceResources = useWorkspaceResourceController({
    projectId: selectedProjectId,
    conversationId: activeTopic?.id ?? null,
    loadAgentTranscript: (target) => {
      if (!selectedProjectId) return;
      return timeline.loadLatest({
        projectId: selectedProjectId,
        conversationId: target.conversationId,
        agentSurfaceId: target.agentSurfaceId,
      });
    },
    operation: operationGate,
    routeProjectionEvent: routeProjectionEventForProject,
    calibrateAgentTranscript: (projectId, conversationId, agentSurfaceId) => timeline.loadLatest({
      projectId,
      conversationId,
      agentSurfaceId,
    }),
  });
  const workspaceResourceTabs = workspaceResources.tabs;
  const selectedWorkspaceResourceId = workspaceResources.selectedResourceId;
  const workspaceDocuments = workspaceResources.documents;
  const workspaceResourceErrors = workspaceResources.resourceErrors;
  const loadingWorkspaceResourceIds = workspaceResources.loadingResourceIds;
  const activeTopicIsConversation = activeTopic?.kind === "conversation";
  selectedProjectIdRef.current = selectedProjectId;
  const selectedProjectDefaultProviderId = projects.find((item) => item.project?.id === selectedProjectId)?.project?.defaultProviderId ?? null;
  const providerConfiguration = useProviderConfigurationController({
    projectId: selectedProjectId,
    projectDefaultProviderId: selectedProjectDefaultProviderId,
    conversationProviderId: activeTopic?.selectedProviderId ?? null,
    onError: setError,
  });
  const providerDiagnostics = providerConfiguration.diagnostics;
  const providerModelSettings = providerConfiguration.modelSettings;
  const providerCapabilities = providerConfiguration.capabilities;
  const composerProviderId = providerConfiguration.selectedProviderId;
  const providerModelPickerOpen = providerConfiguration.modelPickerOpen;
  const providerModelSettingsBusy = providerConfiguration.modelSettingsBusy;
  const providerModelSettingsMessage = providerConfiguration.modelSettingsMessage;
  const composerProviderOptions = providerCapabilities.map((provider) => ({ id: provider.providerId, label: provider.displayName }));
  const isPendingTopic = Boolean(activePendingConversation && !activePendingConversation.canonical);
  const activeWorkpad = activePendingConversation ? emptyWorkpad(activePendingConversation.title) : snapshot.center.workpad ?? emptyWorkpad(activeTopic?.title ?? projectDisplayName(snapshot.project));
  const selectedProjectStatus = useMemo(() => projects.find((item) => item.project?.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const selectedProjectHistoryUnavailable = Boolean(selectedProjectStatus?.managed && selectedProjectStatus.memory?.memoryAvailable === false);
  const composer = useConversationComposerController({
    projectId: selectedProjectId,
    conversation: activeTopic ? {
      id: activeTopic.id,
      state: activeTopic.state,
      selectedProviderId: activeTopic.selectedProviderId,
    } : null,
    managed: Boolean(selectedProjectStatus?.managed),
    running: activeWorkpad.conversationLifecycle === "running"
      || Boolean(activeWorkpad.runControlState?.canStop)
      || currentWorkpadSummary(snapshot, activeTopic)?.runtimeStatus === "running",
    selectedProviderId: composerProviderId,
    providerCount: providerCapabilities.length,
  }, {
    operation: operationGate,
    session: {
      ensureProjectRegistered: session.ensureProjectRegistered,
      createConversation: (request) => session.createDemandConversation(request, routeProjectionEventForProject),
    },
    actions: {
      steer: (request) => runComposerActionRequest("conversation.steer", request),
      stop: (request) => runComposerActionRequest("conversation.interrupt", request),
    },
    projection: {
      refreshConversation: async (projectId, conversationId) => { await refresh(projectId, conversationId); },
      routeEvent: routeProjectionEventForProject,
    },
    timeline: {
      calibrate: (projectId, conversationId, agentSurfaceId) => timeline.loadLatest({ projectId, conversationId, agentSurfaceId }),
    },
    onError: setError,
  });
  const composerText = composer.composerText;
  const setComposerText = composer.setComposerText;
  const skillItems = composer.skillItems;
  const selectedComposerSkillIds = composer.activeSkillIds;
  const enabledSkillCount = composer.enabledSkillCount;
  const composerFileRefs = composer.fileRefs;
  const setComposerFileRefs = composer.setFileRefs;
  const composerAttachments = composer.attachments;
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
  const mainViewport = useMainConversationViewport({
    scopeKey: activeTimelineScope ? canonicalTimelineScopeKey(activeTimelineScope) : null,
    mutation: activeTimelineSurface?.lastMutation ?? null,
    hasMoreBefore: Boolean(activeTranscript.paging?.hasMoreBefore),
    loadingEarlier: loadingEarlierTranscript,
    loadEarlier: loadEarlierTranscriptPage,
  });
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
  const agentSurfaces = useAgentSurfaceController({
    projectId: selectedProjectId,
    conversationId: activeTopic?.id ?? null,
    officeViewOpen: orchestrationOpen,
    ports: {
      cleanupResources: workspaceResources.cleanupTransition,
      openAgentSurface: ({ conversationId, agentSurfaceId }) => {
        openWorkspaceResource({ kind: "agent", conversationId, agentSurfaceId });
        if (selectedProjectId) void timeline.loadLatest({ projectId: selectedProjectId, conversationId, agentSurfaceId });
        if (globalThis.matchMedia?.("(max-width: 720px)").matches) closeOrchestrationOverlay();
      },
      closeOfficeView: closeOrchestrationOverlay,
    },
  });
  const activeAgentSurfaces = agentSurfaces.surfaces.filter((surface) => surface.kind !== "main-agent");
  const activeAgentTranscripts = useMemo<Record<string, ParentAgentTranscript>>(() => {
    if (!selectedProjectId || !activeTopic?.id) return {};
    return Object.fromEntries(activeAgentSurfaces.map((agent) => [
      agent.agentSurfaceId,
      selectCanonicalTimelineTranscript(timeline.state, {
        projectId: selectedProjectId,
        conversationId: activeTopic.id,
        agentSurfaceId: agent.agentSurfaceId,
      }),
    ]));
  }, [activeAgentSurfaces, activeTopic?.id, selectedProjectId, timeline.state]);
  const projectionStream = useWorkbenchProjectionStream(selectedProjectId, {
    timeline: {
      patch: (projectId, envelope) => {
        timeline.ingestEnvelope(projectId, envelope);
      },
    },
    topic: {
      created: (projectId, data) => {
        const topicId = data.topic.conversationId ?? data.topic.id ?? data.topic.changeId;
        if (!topicId) return;
        session.acceptCanonicalConversation({
          projectId,
          conversationId: topicId,
          title: data.topic.title,
          selectedProviderId: data.topic.selectedProviderId,
        });
      },
    },
    interaction: {
      updated: (projectId, queue) => {
        if (selectedProjectIdRef.current !== projectId || (activeTopic?.id && queue.conversationId !== activeTopic.id)) return;
        session.updateSnapshot((current) => ({
          ...current,
          center: { ...current.center, conversationInteractions: queue },
        }));
      },
    },
    snapshot: {
      received: (projectId, next) => {
        if (selectedProjectIdRef.current !== projectId) return;
        session.acceptSnapshot(projectId, next);
      },
    },
    agentSurfaces: {
      invalidate: ({ projectId, conversationId, graphScopeId, reason }) => {
        if (selectedProjectIdRef.current === projectId) {
          agentSurfaces.invalidate({ conversationId, graphScopeId, reason });
        }
      },
    },
    error: {
      received: (projectId, data) => {
        if (selectedProjectIdRef.current !== projectId || isTransientReconnectMessage(data.message)) return;
        setError(data.message);
      },
    },
  }, {
    onConnected: (projectId) => {
      const conversationId = activeTopic?.id;
      if (!conversationId || isPendingTopic) return;
      agentSurfaces.invalidate({ conversationId, reason: "snapshot" });
      for (const scope of canonicalTimelineReconnectScopes(projectId, conversationId, workspaceResourceTabs)) {
        void timeline.loadLatest(scope);
      }
    },
  });
  projectionEventRouterRef.current = projectionStream.routeEventForProject;
  const conversationActions = useConversationActionController({
    session: {
      projectId: selectedProjectId,
      conversationId: activeTopic?.id ?? null,
      selectedTopicId: selectedTopic,
      snapshot,
      composerText,
    },
    ports: {
      operationGate,
      routeProjectionEvent: projectionStream.routeEventForProject,
      refreshSession: (projectId, conversationId) => refresh(projectId, conversationId),
      calibrateTimeline: timeline.loadLatest,
      applySnapshot: (next) => {
        if (selectedProjectId) session.acceptSnapshot(selectedProjectId, next);
      },
      cacheProjectSnapshot: session.cacheProjectSnapshot,
      setComposerText,
      setError,
      clearConfirmation: () => setConfirming(null),
      chooseRun,
      openOrchestration: () => {
        setOrchestrationOpen(true);
        syncWorkbenchOrchestrationTab(true);
      },
    },
  });
  const activeConversationInteraction = snapshot.center.conversationInteractions?.items[0] ?? null;
  const pendingConfirmationCount = (activeConfirmationQueue.primary ? 1 : 0)
    + activeConfirmationQueue.otherDemands.length
    + activeConfirmationQueue.maintenance.length;
  const officeSurfaceProjection = agentSurfaces.projection;
  const providerModelLabel = providerModelSettings?.effectiveModel?.modelId
    || providerDiagnostics?.models.effectiveModel?.modelId
    || "默认模型";
  const providerDisplayName = providerDiagnostics?.displayName
    ?? composerProviderOptions.find((provider) => provider.id === composerProviderId)?.label
    ?? (composerProviderOptions.length === 1 ? composerProviderOptions[0]!.label : "正在加载");

  function appendComposerFileRefs(refs: TopicFileReference[]): void {
    composer.setFileRefs([...composerFileRefs, ...refs]);
  }

  function expandRightToolRail(): void {
    setRightToolView("launcher");
    setDecisionPaneCollapsed(false);
  }

  function openRightToolPanel(tab: RightToolRailTab): void {
    setRightToolView(tab);
    if (tab === "agent") {
      if (!selectedWorkspaceResourceId && workspaceResourceTabs.length === 0) {
        const agentId = activeAgentSurfaces.find((agent) => agent.status === "running")?.agentSurfaceId
          ?? activeAgentSurfaces[0]?.agentSurfaceId;
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

  function routeProjectionEventForProject(projectId: string, event: WorkbenchLiveEvent): void {
    projectionEventRouterRef.current(projectId, event);
  }

  function toggleOrchestrationOverlay(): void {
    if (!activeTopic?.id) return;
    if (orchestrationOpen) closeOrchestrationOverlay();
    else {
      setOrchestrationOpen(true);
      syncWorkbenchOrchestrationTab(true);
    }
  }

  useEffect(() => {
    setRuntimeActivityLog(null);
  }, [activeTopic?.id, isPendingTopic]);

  async function loadEarlierTranscriptPage(): Promise<void> {
    if (!activeTimelineScope || loadingEarlierTranscript) return;
    const cursor = activeTranscript.paging?.nextBeforeCursor;
    if (!cursor || activeTranscript.paging?.hasMoreBefore === false) return;
    await timeline.loadEarlier(activeTimelineScope, cursor);
  }

  async function createTopicFromComposer(): Promise<void> {
    await composer.createConversation();
  }

  useEffect(() => {
    if (!activeTimelineScope) return;
    void timeline.loadLatest(activeTimelineScope);
  }, [activeTimelineScope, projectionVersion, timeline.loadLatest]);

  return (
    <div
      className={`app-shell ${settingsOpen ? "settings-open" : decisionPaneCollapsed ? "decision-pane-collapsed" : "decision-pane-expanded"} sidebar-expanded${orchestrationOpen ? " orchestration-open" : ""}`}
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
            onRefresh={() => loadApp().then(() => providerConfiguration.reload()).then(() => loadSkillSummary())}
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
            onSelectProvider={(providerId) => { void providerConfiguration.selectProvider(providerId); }}
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

            <section className={`center-grid${orchestrationOpen ? " agent-office-center-grid" : ""}`}>
              {orchestrationOpen ? (
                <div className="agent-office-center-view" data-testid="agent-office-center-view">
                  {(agentSurfaces.loadState === "idle" || agentSurfaces.loadState === "loading") && !officeSurfaceProjection ? (
                    <OfficeLoadingScreen progress={agentSurfaces.loadState === "loading" ? 18 : 8} />
                  ) : agentSurfaces.loadState === "error" || !officeSurfaceProjection || !selectedProjectId ? (
                    <div className="agent-office-view-state error" role="alert">
                      <strong>Agent 办公室加载失败</strong>
                      <span>{agentSurfaces.loadError ?? "请稍后重试。"}</span>
                      <button type="button" className="outline-button" onClick={agentSurfaces.reload}>重试</button>
                    </div>
                  ) : (
                    <AgentOfficePanel
                      projectId={selectedProjectId}
                      projection={officeSurfaceProjection}
                      onOpenSurface={(agentSurfaceId) => agentSurfaces.openExactSurface(agentSurfaceId, officeSurfaceProjection.graphScopeId)}
                    />
                  )}
                </div>
              ) : (
              <div className="timeline-panel">
                <div
                  className="thread-scroll"
                  ref={mainViewport.scrollContainerRef}
                  onScroll={mainViewport.onUserScroll}
                >
                  <MainConversationView
                    key={`timeline:${selectedProjectId ?? ""}:${activeTopic.id}:main-agent`}
                    transcript={activeTranscript}
                    scrollContainerRef={mainViewport.scrollContainerRef}
                    loadingEarlierTranscript={loadingEarlierTranscript}
                    onOpenAgent={openChildAgentWorkspace}
                    canOpenAgent={(agentSurfaceId) => agentSurfaces.surfaces.some((surface) => surface.kind === "agent" && surface.agentSurfaceId === agentSurfaceId)}
                    onOpenDocument={(document: CanonicalDocumentReference) => {
                      if (!activeTopic?.id) return;
                      openWorkspaceResource({ kind: "document", conversationId: activeTopic.id, documentId: document.documentId });
                    }}
                    documentResources={workspaceDocuments}
                    onEnsureDocument={(document: CanonicalDocumentReference) => {
                      if (!activeTopic?.id) return;
                      void workspaceResources.ensureLoaded({
                        kind: "document",
                        conversationId: activeTopic.id,
                        documentId: document.documentId,
                      });
                    }}
                  />
                </div>
                {mainViewport.showLatest ? <button className="latest-button" onClick={mainViewport.scrollToLatest}>最新</button> : null}
              </div>
              )}
              {activeConversationInteraction && !orchestrationOpen ? (
                <ConversationInteractionDock
                  interaction={activeConversationInteraction}
                  busy={Boolean(actionRunning?.startsWith("interaction."))}
                  canStop={activeWorkpad.conversationLifecycle === "running" || Boolean(activeWorkpad.runControlState?.canStop)}
                  initialDraft={conversationActions.getInteractionDraft(activeConversationInteraction.interactionId)}
                  onDraftChange={conversationActions.setInteractionDraft}
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
                  onSelectProvider={(providerId) => { void providerConfiguration.selectProvider(providerId); }}
                /> : null}
            </section>
          </>
        )}
        </div>
        {!settingsOpen ? <WorkspaceDockToggleBar
          orchestrationActive={orchestrationOpen}
          orchestrationNeedsAttention={agentSurfaces.surfaces.some((surface) => surface.status === "waiting-user")}
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
            agents={activeAgentSurfaces}
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
            agentDrafts={workspaceResources.agentDrafts}
            pendingAgentMessages={workspaceResources.pendingAgentMessages}
            onAgentDraftChange={workspaceResources.setAgentDraft}
            onSubmitAgentMessage={workspaceResources.submitAgentMessage}
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
        onClose={providerConfiguration.closeModelPicker}
        onRefresh={() => providerConfiguration.reload()}
        onSelect={(selectedModel) => updateProviderModelSettings({ selectedModel })}
      />
      {activeTopic && !settingsOpen ? <BottomStatusBar snapshot={snapshot} project={selectedProjectStatus} topic={activeTopic} /> : null}
    </div>
  );
}

function isOrchestrationTabParam(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "orchestration";
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
