import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement } from "react";
import { consumeWorkbenchLiveStream,
  fetchJson,
  postJson } from "./api.js";
import { MainConversationView,
  RightToolRailShell,
  DecisionInspectorPane,
  BottomStatusBar,
  ProjectFilesPanel,
  ProjectGitPanel,
  GitDiffViewer,
  type RightToolRailTab
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
  usageBlock,
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
  isParentAgentTranscriptPayload,
  mergeLiveItemsIntoTranscript,
  mergeTranscriptPage,
  normalizeParentAgentTranscript
} from "./liveTranscript.js";
import {
  migrateDraftComposerExecutionMode,
  readComposerExecutionMode,
  writeComposerExecutionMode,
  type ComposerExecutionMode,
} from "./shell/composer-session.js";

import {
  stateLabel,
  runtimeLabel,
} from "./formatters.js";
import type {
  AppStatus,
  CodexDiagnostics,
  CodexModelSettingsSnapshot,
  ProjectStatus,
  Snapshot,
  DemandAgentRunGraph,
  CenterTab,
  ParentAgentTranscript,
  Workpad,
  ThreadStreamItem,
  DecisionAction,
  DecisionContext,
  StreamPacket,
  SkillListItem,
  WorkbenchLiveEvent,
  AssistantTurnBlock,
  LiveTurnEvent,
  LiveAssistantTurn,
  TopicFileReference,
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
  right: { approvals: [], decisions: [], decisionInspector: { primary: null, related: [], history: [] }, confirmationQueue: { primary: null, current: [], otherDemands: [], maintenance: [], history: [] } },
  harnessGaps: [],
  warnings: [],
};

const SELECTED_PROJECT_STORAGE_KEY = "aho.workbench.selectedProjectId";

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

export function App(): ReactElement {
  const [projects, setProjects] = useState<ProjectStatus[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamPacket | null>(null);
  const [centerTab, setCenterTab] = useState<CenterTab>("conversation");
  const [selectedRunGraphNodeId, setSelectedRunGraphNodeId] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectSnapshots, setProjectSnapshots] = useState<Record<string, Snapshot>>({});
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [projectMenuMode, setProjectMenuMode] = useState<"closed" | "add" | "new">("closed");
  const [projectDetailsId, setProjectDetailsId] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("basic");
  const [homeComposerResetToken, setHomeComposerResetToken] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selectedDecisionContextId, setSelectedDecisionContextId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [composerMode, setComposerMode] = useState<"chat" | "plan">("chat");
  const [automationMode, setAutomationMode] = useState<ComposerExecutionMode>("request-approval");
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [liveItems, setLiveItems] = useState<ThreadStreamItem[]>([]);
  const [liveTurns, setLiveTurns] = useState<LiveAssistantTurn[]>([]);
  const [loadedTranscript, setLoadedTranscript] = useState<ParentAgentTranscript | null>(null);
  const [loadingEarlierTranscript, setLoadingEarlierTranscript] = useState(false);
  const [loadedRunGraph, setLoadedRunGraph] = useState<DemandAgentRunGraph | null>(null);
  const [codexDiagnostics, setCodexDiagnostics] = useState<CodexDiagnostics | null>(null);
  const [codexModelSettings, setCodexModelSettings] = useState<CodexModelSettingsSnapshot | null>(null);
  const [codexModelPickerOpen, setCodexModelPickerOpen] = useState(false);
  const [codexModelSettingsBusy, setCodexModelSettingsBusy] = useState(false);
  const [codexModelSettingsMessage, setCodexModelSettingsMessage] = useState<string | null>(null);
  const [skillItems, setSkillItems] = useState<SkillListItem[]>([]);
  const [draftSkillOverrides, setDraftSkillOverrides] = useState<Record<string, boolean>>({});
  const [composerFileRefs, setComposerFileRefs] = useState<TopicFileReference[]>([]);
  const [selectedGitDiffPath, setSelectedGitDiffPath] = useState<string | null>(null);
  const [decisionPaneCollapsed, setDecisionPaneCollapsed] = useState(true);
  const [rightToolTab, setRightToolTab] = useState<RightToolRailTab>("confirm");
  const [projectionVersion, setProjectionVersion] = useState(0);
  const [latestHidden, setLatestHidden] = useState(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedComposerSkillIds = useMemo(
    () => activeComposerSkillIds(skillItems, selectedTopic, draftSkillOverrides),
    [draftSkillOverrides, selectedTopic, skillItems],
  );
  const enabledSkillCount = selectedComposerSkillIds.length;

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
      if (restore.centerTab) setCenterTab(restore.centerTab);
      if (selectedStatus?.managed) await refresh(selectedProject, topic);
      else setSnapshot(snapshotForProject(selectedStatus));
      return;
    }
    if (restoredProject) clearPersistedSelectedProjectId();
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

  async function refresh(projectId = selectedProjectId, topic = selectedTopic): Promise<void> {
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
    ])
      .then(([diagnostics, models]) => {
        if (cancelled) return;
        setCodexDiagnostics(isCodexDiagnostics(diagnostics) ? diagnostics : null);
        setCodexModelSettings(isCodexModelSettingsSnapshot(models) ? models : null);
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
    setDraftSkillOverrides({});
    setCenterTab("conversation");
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
    setHomeComposerResetToken((value) => value + 1);
    setSelectedProjectId(projectId);
    persistSelectedProjectId(projectId);
    setSelectedTopic(null);
    setDraftSkillOverrides({});
    setCenterTab("conversation");
    setExpandedProjects((current) => new Set([...current, projectId]));
    const nextSnapshot = {
      ...baseSnapshot,
      center: {
        selectedTopic: null,
        workpad: emptyWorkpad(baseSnapshot.project?.name ?? status.project?.name ?? "当前项目"),
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
    setDraftSkillOverrides({});
    setExpandedProjects((current) => new Set([...current, projectId]));
    setSelectedRun(null);
    setStream(null);
    invalidateProjectionCache();
    await refresh(projectId, conversationId);
  }

  async function ensureProjectReadyForDemand(projectId: string): Promise<string | null> {
    let status = projects.find((item) => item.project?.id === projectId) ?? null;
    if (!status?.project) {
      setError("请先选择一个项目。");
      return null;
    }

    let effectiveProjectId = status.project.id;
    if (!status.managed && status.memory?.registered === false) {
      const saved = await postJson<{ project: { id: string }; status?: ProjectStatus }>("/api/projects", {
        path: status.path,
        name: status.project.name,
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

    const memoryReady = status.memory?.harnessReady ?? status.harness.readiness === "ready";
    if (!memoryReady) {
      await postJson(`/api/projects/${encodeURIComponent(effectiveProjectId)}/harness/init`, {
        memoryMode: "external-local",
        confirm: true,
      });
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
      setCenterTab("agentGraph");
    }
  }

  function openSettings(section: SettingsSection = "basic"): void {
    setSettingsSection(section);
    setCenterTab("settings");
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
          planningBundleId: action.planningBundleId ?? context.planningBundleId,
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

  async function createTopicFromText(body: string, fileRefs: TopicFileReference[] = []): Promise<void> {
    if (!selectedProjectId || !body.trim()) return;
    setActionRunning("topic.create");
    try {
      const resolved = resolveComposerTextWithContext(body, fileRefs);
      const demandBody = resolved.text;
      if (!demandBody) return;
      const title = demandBody.split(/\r?\n/)[0].slice(0, 60);
      const modeForNewTopic = automationMode;
      const effectiveProjectId = await ensureProjectReadyForDemand(selectedProjectId);
      if (!effectiveProjectId) return;
      const result = await postJson<{ topic: { changeId: string } }>(`/api/projects/${encodeURIComponent(effectiveProjectId)}/workbench/topics`, {
        title,
        body: demandBody,
        contextRefs: resolved.contextRefs,
        confirm: true,
      });
      await applyTopicSkillOverrides(result.topic.changeId, resolved.overrides, effectiveProjectId);
      const migratedMode = migrateDraftComposerExecutionMode(effectiveProjectId, result.topic.changeId, modeForNewTopic);
      setAutomationMode(migratedMode);
      setDraftSkillOverrides({});
      setComposerText("");
      setComposerFileRefs([]);
      setSelectedProjectId(effectiveProjectId);
      persistSelectedProjectId(effectiveProjectId);
      setSelectedTopic(result.topic.changeId);
      await loadSkillSummary(effectiveProjectId, result.topic.changeId);
      await refresh(effectiveProjectId, result.topic.changeId);
    } finally {
      setActionRunning(null);
    }
  }

  function handleComposerExecutionModeChange(mode: ComposerExecutionMode): void {
    setAutomationMode(mode);
    writeComposerExecutionMode(selectedProjectId, activeTopic?.id ?? null, mode);
  }

  async function sendTopicMessage(): Promise<void> {
    if (!selectedProjectId || !activeTopic || !composerText.trim()) return;
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
    if (!message) {
      setComposerText("");
      setComposerFileRefs([]);
      return;
    }
    const runningConversation = activeWorkpad.conversationLifecycle === "running" || activeWorkpad.runControlState?.canStop || currentWorkpadSummary(snapshot, activeTopic)?.runtimeStatus === "running";
    if (runningConversation) {
      await runWorkflowAction("conversation.steer", { prompt: message });
      setComposerFileRefs([]);
      return;
    }
    const pendingClarificationCount = activeWorkpad.intake.pendingClarifications?.length ?? 0;
    if (composerMode === "chat" && (activeWorkpad.nextAction.actionType === "planning.generate" || activeWorkpad.nextAction.actionType === "planning.revise")) {
      await runWorkflowAction(activeWorkpad.nextAction.actionType, { prompt: message });
      return;
    }
    if (composerMode === "chat" && (activeWorkpad.nextAction.actionType === "intake.reanalyze" || activeWorkpad.nextAction.actionType === "change.spec.propose" || pendingClarificationCount > 0)) {
      setActionRunning("intake.reanalyze");
      setComposerText("");
      setError(null);
      try {
        const result = await postJson<{ snapshot: Snapshot }>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/intake/reanalyze`, {
          changeId: activeTopic.id,
          message,
          contextRefs: resolved.contextRefs,
        });
        setSnapshot(result.snapshot);
      } finally {
        setActionRunning(null);
      }
      return;
    }
    setActionRunning(composerMode === "plan" ? "orchestrator.plan" : "chat.ask");
    setComposerText("");
    setError(null);
    try {
      await consumeWorkbenchLiveStream(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/topics/${encodeURIComponent(activeTopic.id)}/messages/live`, {
        mode: composerMode,
        message,
        contextRefs: resolved.contextRefs,
      }, handleLiveEvent);
      setComposerFileRefs([]);
    } finally {
      setActionRunning(null);
    }
  }

  async function runWorkflowAction(actionType: string, options: Record<string, unknown> = {}): Promise<void> {
    const projectScopedAction = actionType === "maintenance.canonical-update.decision.record"
      || actionType === "maintenance.canonical-patch.application-gate.record"
      || actionType === "maintenance.canonical-patch.apply";
    if (!selectedProjectId || (!activeTopic && !projectScopedAction)) return;
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
      if (projectScopedAction) {
        const result = await postJson<{ snapshot: Snapshot }>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
          actionType,
          changeId: activeTopic?.id,
          confirm: true,
          ...options,
        });
        setSnapshot(result.snapshot);
        return;
      }
      await consumeWorkbenchLiveStream(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions/live`, {
        actionType,
        changeId: activeTopic?.id,
        confirm: true,
        prompt: composerText.trim() || undefined,
        ...options,
      }, handleLiveEvent);
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

  function handleLiveEvent(event: WorkbenchLiveEvent): void {
    if (event.event === "snapshot") {
      setSnapshot(event.data);
      setLiveItems([]);
      setLiveTurns([]);
      invalidateProjectionCache();
      return;
    }
    if (event.event === "error") {
      if (event.data.runId) {
        appendLiveTurnEvent(event.data.runId, { kind: "error", message: event.data.message }, "failed");
        return;
      }
      setError(event.data.message);
      return;
    }
    if (event.event === "assistant.delta") {
      appendLiveTurnText(event.data.runId ?? "assistant", event.data.delta);
      return;
    }
    if (event.event === "assistant.message") {
      if (event.data.runId) completeLiveTurn(event.data.runId, event.data.text);
      else appendLiveItem(threadItemFromTopicEntry(event.data));
      return;
    }
    if (event.event === "assistant.event") {
      appendLiveTurnEvent(event.data.runId, { kind: "assistant-event", event: event.data }, event.data.isError ? "failed" : event.data.phase, blockFromAssistantEvent(event.data));
      return;
    }
    if (event.event === "tool.event") {
      appendLiveTurnEvent(event.data.runId, { kind: "tool", tool: event.data }, event.data.isError ? "failed" : undefined, blockFromToolEvent(event.data));
      return;
    }
    if (event.event === "usage") {
      const runId = event.data.runId ?? latestLiveRunId();
      if (runId && event.data.usage) appendLiveTurnEvent(runId, { kind: "usage", usage: event.data.usage }, undefined, usageBlock(runId, event.data.usage));
      return;
    }
    if (event.event === "topic.message") {
      appendLiveItem(threadItemFromTopicEntry(event.data));
      return;
    }
    if (event.event === "run.started") {
      upsertLiveTurn(event.data.runId, {
        runtime: event.data.runtime,
        actionType: event.data.actionType,
        status: "running",
        events: [{ kind: "status", label: "running", detail: runtimeLabel(event.data.runtime ?? event.data.actionType ?? "Run") }],
      });
      return;
    }
    if (event.event === "run.status") {
      const runId = event.data.runId ?? event.data.actionRunId ?? latestLiveRunId();
      if (runId) {
        appendLiveTurnEvent(runId, { kind: "status", label: event.data.status, detail: event.data.label }, event.data.status);
      }
    }
  }

  function latestLiveRunId(): string | undefined {
    return liveTurns[liveTurns.length - 1]?.runId;
  }

  function upsertLiveTurn(runId: string, patch: Partial<Omit<LiveAssistantTurn, "id" | "runId" | "startedAt">> & { events?: LiveTurnEvent[] }): void {
    setLiveTurns((current) => {
      const existing = current.find((turn) => turn.runId === runId);
      if (!existing) {
        return [...current, {
          id: `live-turn:${runId}`,
          runId,
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
      return current.map((turn) => turn.runId === runId ? { ...turn, ...patch, events: patch.events ?? turn.events, blocks: patch.blocks ?? turn.blocks } : turn);
    });
  }

  function appendLiveTurnText(runId: string, delta: string): void {
    setLiveTurns((current) => {
      const existing = current.find((turn) => turn.runId === runId);
      if (!existing) {
        return [...current, { id: `live-turn:${runId}`, runId, status: "streaming", text: delta, events: [{ kind: "status", label: "streaming" }], blocks: [proseBlock(runId, delta, 1)], startedAt: new Date().toISOString() }];
      }
      return current.map((turn) => {
        if (turn.runId !== runId) return turn;
        return { ...turn, status: "streaming", text: `${turn.text}${delta}`, blocks: appendProseBlock(turn.blocks, runId, delta) };
      });
    });
  }

  function appendLiveTurnEvent(runId: string, event: LiveTurnEvent, status?: string, block?: AssistantTurnBlock | null): void {
    setLiveTurns((current) => {
      const existing = current.find((turn) => turn.runId === runId);
      if (!existing) {
        return [...current, { id: `live-turn:${runId}`, runId, status: status ?? "running", text: "", events: [event], blocks: block ? [block] : [], startedAt: new Date().toISOString() }];
      }
      return current.map((turn) => {
        if (turn.runId !== runId) return turn;
        const key = liveTurnEventKey(event);
        const nextEvents = key && turn.events.some((existingEvent) => liveTurnEventKey(existingEvent) === key)
          ? turn.events.map((existingEvent) => liveTurnEventKey(existingEvent) === key ? event : existingEvent)
          : [...turn.events, event];
        return { ...turn, status: status ?? turn.status, events: nextEvents, blocks: block ? upsertBlock(turn.blocks, block) : turn.blocks };
      });
    });
  }

  function completeLiveTurn(runId: string, text?: string): void {
    setLiveTurns((current) => current.map((turn) => turn.runId === runId ? {
      ...turn,
      status: "completed",
      text: text || turn.text || "",
      blocks: text ? [proseBlock(runId, text, 1), ...turn.blocks.filter((block) => block.kind !== "prose")] : turn.blocks,
      endedAt: new Date().toISOString(),
    } : turn));
  }

  function liveTurnEventKey(event: LiveTurnEvent): string | null {
    if (event.kind === "assistant-event") {
      const item = event.event;
      return `assistant:${item.runId}:${item.itemId ?? item.title ?? item.summary ?? ""}:${item.kind}:${item.phase ?? ""}`;
    }
    if (event.kind === "tool") {
      return `tool:${event.tool.runId}:${event.tool.command ?? event.tool.name ?? ""}:${event.tool.phase}:${event.tool.exitCode ?? ""}:${event.tool.status ?? ""}`;
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

  const activeTopic = snapshot.center.selectedTopic;
  const activeWorkpad = snapshot.center.workpad ?? emptyWorkpad(activeTopic?.title ?? snapshot.project?.name);
  const activeRun = useMemo(() => snapshot.center.agentLoop.runs.find((run) => run.id === selectedRun) ?? snapshot.center.agentLoop.runs[0], [snapshot, selectedRun]);
  const selectedProjectStatus = useMemo(() => projects.find((item) => item.project?.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const selectedProjectHistoryUnavailable = Boolean(selectedProjectStatus?.managed && selectedProjectStatus.memory?.memoryAvailable === false);
  const selectedProjectIsTemporary = Boolean(selectedProjectStatus?.project && selectedProjectStatus.memory?.registered === false);
  const runIds = useMemo(() => snapshot.center.agentLoop.runs.map((run) => run.id).join("|"), [snapshot.center.agentLoop.runs]);
  const snapshotTranscript = useMemo(() => {
    return normalizeParentAgentTranscript(loadedTranscript ?? snapshot.center.parentAgentTranscript);
  }, [loadedTranscript, snapshot.center.parentAgentTranscript]);
  const activeTranscript = useMemo(() => {
    return mergeLiveItemsIntoTranscript(snapshotTranscript, liveItems, liveTurns);
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
  const pendingConfirmationCount = (activeConfirmationQueue.primary ? 1 : 0)
    + activeConfirmationQueue.otherDemands.length
    + activeConfirmationQueue.maintenance.length;
  const rawActiveRunGraph = loadedRunGraph ?? snapshot.center.agentRunGraph;
  const activeRunGraph = isDemandAgentRunGraph(rawActiveRunGraph) ? rawActiveRunGraph : emptyAgentRunGraph();
  const selectedRunGraphNode = useMemo(() => {
    return activeRunGraph.nodes.find((node) => node.id === selectedRunGraphNodeId) ?? activeRunGraph.nodes[0] ?? null;
  }, [activeRunGraph.nodes, selectedRunGraphNodeId]);
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
    if (pendingConfirmationCount > 0) setRightToolTab("confirm");
    setDecisionPaneCollapsed(false);
  }

  useEffect(() => {
    setAutomationMode(readComposerExecutionMode(selectedProjectId, activeTopic?.id ?? null));
  }, [selectedProjectId, activeTopic?.id]);

  useEffect(() => {
    const restore = readWorkbenchRestoreParams();
    if (restore.topicId && restore.topicId === activeTopic?.id && restore.centerTab) {
      setCenterTab(restore.centerTab);
    } else {
      setCenterTab("conversation");
    }
    setSelectedRunGraphNodeId(null);
    setLoadedTranscript(null);
    setLoadedRunGraph(null);
  }, [activeTopic?.id]);

  async function loadEarlierTranscriptPage(): Promise<void> {
    if (!selectedProjectId || !activeTopic?.id || loadingEarlierTranscript) return;
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
    await createTopicFromText(composerText, composerFileRefs);
  }

  useEffect(() => {
    if (!selectedProjectId || !activeTopic?.id) return;
    let cancelled = false;
    fetchJson<ParentAgentTranscript>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/projections/transcript/${encodeURIComponent(activeTopic.id)}?limit=100`)
      .then((projection) => {
        if (!cancelled && isParentAgentTranscriptPayload(projection)) setLoadedTranscript(normalizeParentAgentTranscript(projection));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [selectedProjectId, activeTopic?.id, projectionVersion]);

  useEffect(() => {
    if (!selectedProjectId || !activeTopic?.id || centerTab !== "agentGraph") return;
    let cancelled = false;
    fetchJson<DemandAgentRunGraph>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/projections/run-graph/${encodeURIComponent(activeTopic.id)}`)
      .then((projection) => {
        if (!cancelled && isDemandAgentRunGraph(projection)) setLoadedRunGraph(projection);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [selectedProjectId, activeTopic?.id, centerTab, projectionVersion]);

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
  }, [activeTranscript.items.length, liveTurns.length, centerTab]);

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
    <div className={`app-shell ${decisionPaneCollapsed ? "decision-pane-collapsed" : "decision-pane-expanded"}`}>
      <aside className="sidebar">
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
          onRefresh={loadApp}
          onOpenSettings={() => openSettings("basic")}
          onOpenProjectSettings={(projectId) => {
            void (async () => {
              if (projectId !== selectedProjectId) await openProject(projectId);
              openSettings("project");
            })();
          }}
        />
      </aside>

      <main className="workspace">
        {centerTab === "settings" ? (
          <SettingsSurface
            section={settingsSection}
            onSectionChange={setSettingsSection}
            project={selectedProjectStatus}
            diagnostics={codexDiagnostics}
            modelSettings={codexModelSettings}
            modelSettingsBusy={codexModelSettingsBusy}
            modelSettingsMessage={codexModelSettingsMessage}
            onOpenModelSettings={() => void openCodexModelPicker()}
            onClose={() => setCenterTab("conversation")}
            onRefresh={() => loadApp().then(() => loadCodexDiagnostics()).then(() => loadCodexModelSettings()).then(() => loadSkillSummary())}
          />
        ) : !selectedProjectId ? (
          <ProjectHomeView
            projects={projects}
            snapshots={projectSnapshots}
            onOpenProject={openProject}
            onRefresh={loadApp}
          />
        ) : !selectedProjectStatus?.project ? (
          <ProjectHomeView
            projects={projects}
            snapshots={projectSnapshots}
            onOpenProject={openProject}
            onRefresh={loadApp}
          />
        ) : selectedProjectIsTemporary || selectedProjectHistoryUnavailable ? (
          <UnmanagedProjectView project={selectedProjectStatus} onDone={() => loadApp().then(() => selectedProjectId ? refresh(selectedProjectId, null) : undefined)} />
        ) : !activeTopic && centerTab === "gitDiff" ? (
          <GitDiffViewer projectId={selectedProjectId} selectedPath={selectedGitDiffPath} />
        ) : !activeTopic ? (
          <ProjectReadinessHome
            project={selectedProjectStatus}
            snapshot={snapshot}
            automationMode={automationMode}
            modelLabel={codexModelLabel}
            onOpenModelSettings={() => void openCodexModelPicker()}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onCreateDemand={createTopicFromText}
            onAutomationModeChange={handleComposerExecutionModeChange}
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
                <span>{snapshot.project?.name ?? "project"} · {stateLabel(activeTopic.state)} · 验收 {activeTopic.acCount ?? 0} · 任务 {activeTopic.taskCount ?? 0}</span>
              </div>
            </header>

            <section className="center-grid">
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
                    graph={activeRunGraph}
                    transcript={activeTranscript}
                    scrollContainerRef={threadScrollRef}
                    onLoadEarlierTranscript={loadEarlierTranscriptPage}
                    loadingEarlierTranscript={loadingEarlierTranscript}
                    activeTab={centerTab}
                    liveTurns={liveTurns}
                    activeRun={activeRun}
                    stream={stream}
                    busy={actionRunning !== null}
                    approvals={snapshot.right.approvals}
                    onAction={runWorkflowAction}
                    onConfirmApproval={confirmWorkpadApproval}
                    onAnswerClarification={answerClarification}
                    onSelectDecisionContext={setSelectedDecisionContextId}
                    onTabChange={setCenterTab}
                    selectedNode={selectedRunGraphNode}
                    onSelectNode={setSelectedRunGraphNodeId}
                    onSelectRun={(runId) => void chooseRun(runId)}
                    gitDiffPanel={<GitDiffViewer projectId={selectedProjectId} selectedPath={selectedGitDiffPath} />}
                  />
                </div>
                {latestHidden ? <button className="latest-button" onClick={() => { const node = threadScrollRef.current; if (node) node.scrollTop = node.scrollHeight; setLatestHidden(false); }}>最新</button> : null}
                <TopicComposer
                  value={composerText}
                  onChange={setComposerText}
                  mode={composerMode}
                  onModeChange={setComposerMode}
                  automationMode={automationMode}
                  onAutomationModeChange={handleComposerExecutionModeChange}
                  modelLabel={codexModelLabel}
                  onOpenModelSettings={() => void openCodexModelPicker()}
                  enabledSkillCount={enabledSkillCount}
                  projectId={selectedProjectId}
                  skills={skillItems}
                  activeSkillIds={selectedComposerSkillIds}
                  selectedFileRefs={composerFileRefs}
                  onSelectedFileRefsChange={setComposerFileRefs}
                  onToggleSkill={toggleComposerSkill}
                  onOpenSkillsSettings={() => openSettings("skills")}
                  busy={actionRunning !== null || activeTopic.state !== "active"}
                  disabledReason={activeTopic.state !== "active" ? "已完成或稍后处理的需求对话为只读。" : undefined}
                  onSend={sendTopicMessage}
                  onStopAndContinue={stopAndContinueCurrentRun}
                  onNewWorkpad={createTopicFromComposer}
                  onRunCode={() => runWorkflowAction("code.run", {
                    readinessManifestId: activeWorkpad.nextAction.actionType === "code.run" ? activeWorkpad.nextAction.readinessManifestId : undefined,
                  })}
                  actionRunning={actionRunning}
                  canRunCode={activeTopic.state === "active" && activeWorkpad.nextAction.actionType === "code.run" && Boolean(activeWorkpad.nextAction.readinessManifestId)}
                  currentWorkpadStatus={activeWorkpad.conversationLifecycle === "running" || activeWorkpad.runControlState?.canStop ? "running" : currentWorkpadSummary(snapshot, activeTopic)?.runtimeStatus}
                />
              </div>
            </section>
          </>
        )}
      </main>

      <RightToolRailShell
        collapsed={decisionPaneCollapsed}
        activeTab={rightToolTab}
        pendingCount={pendingConfirmationCount}
        hasPrimary={Boolean(activeConfirmationQueue.primary)}
        onExpand={expandRightToolRail}
        onCollapse={() => setDecisionPaneCollapsed(true)}
        onTabChange={setRightToolTab}
        confirmPanel={
          <DecisionInspectorPane
            inspector={activeDecisionInspector}
            confirmationQueue={activeConfirmationQueue}
            automationMode={automationMode}
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
              setCenterTab("gitDiff");
            }}
            onSelectedRefsChange={appendComposerFileRefs}
          />
        }
      />

      <CodexModelPicker
        open={codexModelPickerOpen}
        snapshot={codexModelSettings}
        busy={codexModelSettingsBusy}
        message={codexModelSettingsMessage}
        onClose={() => setCodexModelPickerOpen(false)}
        onRefresh={() => loadCodexModelSettings()}
        onSelect={(selectedModel) => updateCodexModelSettings({ selectedModel })}
      />
      <BottomStatusBar snapshot={snapshot} project={selectedProjectStatus} topic={activeTopic} />
    </div>
  );
}

function emptyAgentRunGraph(): DemandAgentRunGraph {
  return {
    title: "暂无运行图",
    summary: "选择需求对话后，AHO 会把主 agent 调用角色 agent、工具和后台维护的过程投影到这里。",
    lanes: [
      { id: "main", label: "主 agent", description: "用户交流和调度入口" },
      { id: "roles", label: "角色执行", description: "方案、实现、验证和审查" },
      { id: "integration", label: "集成与远端", description: "应用、PR、评审、合并和同步" },
      { id: "maintenance", label: "后台维护", description: "记忆、文档漂移和演进候选" },
    ],
    nodes: [],
    edges: [],
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

function readWorkbenchRestoreParams(): { projectId: string | null; topicId: string | null; centerTab: CenterTab | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      projectId: nonEmptyParam(params.get("project")),
      topicId: nonEmptyParam(params.get("topic")),
      centerTab: normalizeCenterTabParam(params.get("tab")),
    };
  } catch {
    return { projectId: null, topicId: null, centerTab: null };
  }
}

function nonEmptyParam(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCenterTabParam(value: string | null): CenterTab | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "conversation" || normalized === "chat") return "conversation";
  if (normalized === "workbench" || normalized === "workpad") return "workpad";
  if (normalized === "orchestration" || normalized === "agentgraph" || normalized === "agent-graph") return "agentGraph";
  if (normalized === "gitdiff" || normalized === "git-diff" || normalized === "diff") return "gitDiff";
  if (normalized === "settings") return "settings";
  return null;
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
    center: { ...emptySnapshot.center, workpad: emptyWorkpad(project.project.name) },
    warnings: project.managed ? [] : ["项目需要准备后才能开始需求对话。"],
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

