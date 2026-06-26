import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement } from "react";
import {
  RefreshCw,
  Settings,
} from "lucide-react";
import { consumeWorkbenchLiveStream,
  fetchJson,
  postJson } from "./api.js";
import { MainConversationView,
  DecisionPaneShell,
  DecisionInspectorPane,
  BottomStatusBar
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
  SettingsPanel,
} from "./panels/ProjectHome.js";
import { workflowActionPayloadFromScope } from "./workflow-actions.js";
import {
  emptyParentAgentTranscript,
  isParentAgentTranscriptPayload,
  mergeLiveItemsIntoTranscript,
  mergeTranscriptPage,
  normalizeParentAgentTranscript
} from "./liveTranscript.js";

import {
  stateLabel,
  runtimeLabel,
} from "./formatters.js";
import type {
  AppStatus,
  CodexDiagnostics,
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
  WorkbenchLiveEvent,
  AssistantTurnBlock,
  LiveTurnEvent,
  LiveAssistantTurn,
} from "./types.js";

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

export function App(): ReactElement {
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selectedDecisionContextId, setSelectedDecisionContextId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [composerMode, setComposerMode] = useState<"chat" | "plan">("chat");
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [liveItems, setLiveItems] = useState<ThreadStreamItem[]>([]);
  const [liveTurns, setLiveTurns] = useState<LiveAssistantTurn[]>([]);
  const [loadedTranscript, setLoadedTranscript] = useState<ParentAgentTranscript | null>(null);
  const [loadingEarlierTranscript, setLoadingEarlierTranscript] = useState(false);
  const [loadedRunGraph, setLoadedRunGraph] = useState<DemandAgentRunGraph | null>(null);
  const [codexDiagnostics, setCodexDiagnostics] = useState<CodexDiagnostics | null>(null);
  const [decisionPaneCollapsed, setDecisionPaneCollapsed] = useState(true);
  const [projectionVersion, setProjectionVersion] = useState(0);
  const [latestHidden, setLatestHidden] = useState(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);

  async function loadApp(): Promise<void> {
    const status = await fetchJson<AppStatus>("/api/app/status");
    setAppStatus(status);
    const list = await fetchJson<{ projects: ProjectStatus[] }>("/api/projects");
    setProjects(list.projects);
    const directProject = status.directProjectId;
    if (directProject) {
      setSelectedProjectId(directProject);
      setExpandedProjects(new Set([directProject]));
      const directStatus = list.projects.find((item) => item.project?.id === directProject);
      if (directStatus?.managed) await refresh(directProject, null);
      else setSnapshot(snapshotForProject(directStatus));
    }
  }

  async function loadCodexDiagnostics(projectId = selectedProjectId): Promise<void> {
    const path = projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/codex/diagnostics`
      : "/api/codex/diagnostics";
    const diagnostics = await fetchJson<unknown>(path);
    setCodexDiagnostics(isCodexDiagnostics(diagnostics) ? diagnostics : null);
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
    fetchJson<unknown>(path)
      .then((diagnostics) => {
        if (!cancelled) setCodexDiagnostics(isCodexDiagnostics(diagnostics) ? diagnostics : null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  async function openProject(projectId: string): Promise<void> {
    setSelectedProjectId(projectId);
    setExpandedProjects((current) => new Set([...current, projectId]));
    setSelectedTopic(null);
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
    setSelectedProjectId(projectId);
    setSelectedTopic(null);
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
    setSelectedTopic(conversationId);
    setExpandedProjects((current) => new Set([...current, projectId]));
    setSelectedRun(null);
    setStream(null);
    invalidateProjectionCache();
    await refresh(projectId, conversationId);
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

  async function createTopicFromComposer(): Promise<void> {
    if (!selectedProjectId || !composerText.trim()) return;
    setActionRunning("topic.create");
    try {
      const title = composerText.trim().split(/\r?\n/)[0].slice(0, 60);
      const result = await postJson<{ topic: { changeId: string } }>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/topics`, {
        title,
        body: composerText.trim(),
        confirm: true,
      });
      setComposerText("");
      setSelectedTopic(result.topic.changeId);
      await refresh(selectedProjectId, result.topic.changeId);
    } finally {
      setActionRunning(null);
    }
  }

  async function sendTopicMessage(): Promise<void> {
    if (!selectedProjectId || !activeTopic || !composerText.trim()) return;
    if (activeTopic.state !== "active") {
      setError("已完成或稍后处理的需求对话为只读，不能继续发送消息。");
      return;
    }
    const message = composerText.trim();
    const runningConversation = activeWorkpad.conversationLifecycle === "running" || activeWorkpad.runControlState?.canStop || currentWorkpadSummary(snapshot, activeTopic)?.runtimeStatus === "running";
    if (runningConversation) {
      await runWorkflowAction("conversation.steer", { prompt: message });
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
      }, handleLiveEvent);
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
  const selectedProjectMemoryReady = Boolean(selectedProjectStatus?.managed
    && snapshot.project?.id === selectedProjectId
    && (snapshot.memory.harnessReady ?? selectedProjectStatus.memory?.harnessReady) !== false);
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

  useEffect(() => {
    setCenterTab("conversation");
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
          <div className="brand-title">Agent Harness<br />Orchestrator</div>
          <button className="icon-button" aria-label="刷新项目" onClick={() => void loadApp()}><RefreshCw size={14} /></button>
        </div>
        <ProjectConversationSidebar
          appStatus={appStatus}
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
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </aside>

      <main className="workspace">
        {!selectedProjectId ? (
          <ProjectHomeView
            projects={projects}
            snapshots={projectSnapshots}
            onOpenProject={openProject}
            onRefresh={loadApp}
          />
        ) : !selectedProjectStatus?.managed || !selectedProjectMemoryReady ? (
          <UnmanagedProjectView project={selectedProjectStatus} onDone={() => loadApp().then(() => selectedProjectId ? refresh(selectedProjectId, null) : undefined)} />
        ) : !activeTopic ? (
          <ProjectReadinessHome
            project={selectedProjectStatus}
            snapshot={snapshot}
            diagnostics={codexDiagnostics}
            onNewConversation={beginNewConversation}
            onOpenWorkbench={() => {
              const first = snapshot.left.workpads?.[0]?.id ?? snapshot.left.topics[0]?.id;
              if (first && selectedProjectId) void chooseConversation(selectedProjectId, first);
            }}
            onRefresh={() => loadApp().then(() => selectedProjectId ? refresh(selectedProjectId, null) : undefined)}
          />
        ) : (
          <>
            <header className="thread-header">
              <div className="thread-title-block">
                <strong>{activeTopic.title}</strong>
                <span>{snapshot.project?.name ?? "project"} · {stateLabel(activeTopic.state)} · 验收 {activeTopic.acCount ?? 0} · 任务 {activeTopic.taskCount ?? 0}</span>
              </div>
              <div className="topic-actions">
                <button className="secondary-button" onClick={() => void refresh()}><Settings size={15} />刷新状态</button>
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
                  />
                </div>
                {latestHidden ? <button className="latest-button" onClick={() => { const node = threadScrollRef.current; if (node) node.scrollTop = node.scrollHeight; setLatestHidden(false); }}>最新</button> : null}
                <TopicComposer
                  value={composerText}
                  onChange={setComposerText}
                  mode={composerMode}
                  onModeChange={setComposerMode}
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

      <DecisionPaneShell
        collapsed={decisionPaneCollapsed}
        pendingCount={pendingConfirmationCount}
        hasPrimary={Boolean(activeConfirmationQueue.primary)}
        onExpand={() => setDecisionPaneCollapsed(false)}
        onCollapse={() => setDecisionPaneCollapsed(true)}
      >
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
      </DecisionPaneShell>

      <SettingsPanel
        open={settingsOpen}
        project={selectedProjectStatus}
        diagnostics={codexDiagnostics}
        onClose={() => setSettingsOpen(false)}
        onRefresh={() => loadApp().then(() => loadCodexDiagnostics())}
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
    warnings: project.managed ? [] : ["Project is not managed by Harness yet."],
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

