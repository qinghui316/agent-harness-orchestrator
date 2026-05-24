import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Check,
  CircleCheck,
  Clock3,
  Code2,
  FileText,
  Folder,
  GitBranch,
  MemoryStick,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";

type AppStatus = { mode: "app" | "project"; directProjectId: string | null };
type ProjectStatus = {
  project: { id: string; name: string; path: string } | null;
  path: string;
  pathExists: boolean;
  isGitRepo: boolean;
  managed: boolean;
  harness: { readiness: string };
};
type Snapshot = {
  project: { id: string; name: string; path: string } | null;
  memory: { memoryMode?: string; harnessReady?: boolean; artifactBase?: string };
  left: {
    topics: Topic[];
    repo?: { branch?: string; dirty?: boolean; path?: string; git?: boolean };
  };
  center: {
    selectedTopic: TopicDetail | null;
    workpad: Workpad;
    agentLoop: { runs: RunSummary[] };
    thread: { items: ThreadStreamItem[] };
  };
  right: { approvals: Approval[]; decisions: Decision[] };
  harnessGaps: Array<{ id: string; status: string; summary: string }>;
  warnings: string[];
};

type Topic = { id: string; title: string; state: string; updatedAt?: string };
type TopicDetail = Topic & {
  closeGate?: { ready: boolean; warnings: string[]; blockingIssues: string[] };
  reviewStatus?: string | null;
  acCount?: number;
  taskCount?: number;
};
type WorkpadNextAction = {
  id: string;
  label: string;
  description: string;
  kind: "workflow-action" | "approval" | "read-only" | "none";
  enabled: boolean;
  requiresConfirmation: boolean;
  actionType?: ThreadStreamAction["actionType"];
  approvalId?: string;
  disabledReason?: string;
};
type Workpad = {
  title: string;
  subtitle: string;
  state: "diagnostic" | "empty" | "active" | "readonly";
  intake: {
    goal: string;
    currentUnderstanding: string;
    source: "project" | "topic" | "thread" | "diagnostic";
    relatedArtifacts: string[];
    missingInfo: string[];
    confirmedConstraints: string[];
    openQuestions: string[];
    assumptions: string[];
    pendingClarifications: ClarificationRequest[];
  };
  progress: {
    topicState: string;
    spec: "missing" | "ready" | "unknown";
    plan: "missing" | "ready" | "unknown";
    tasks: "missing" | "ready" | "unknown";
    acCount: number;
    taskCount: number;
    runCount: number;
    latestRunStatus?: string;
    validationStatus?: string;
    auditStatus?: string;
  };
  tasks: Array<{ id: string; title: string; done: boolean; acIds: string[]; warnings: string[] }>;
  evidence: Array<{ id: string; label: string; source: string; status?: string; artifact?: string; timestamp?: string }>;
  blockers: string[];
  warnings: string[];
  nextAction: WorkpadNextAction;
};
type PlanCard = {
  title: string;
  summary: string;
  steps: Array<{ label: string; description: string; actionId?: string; requiresConfirmation?: boolean }>;
  warnings: string[];
};
type ThreadEvent = { id: string; type: string; label: string; timestamp?: string; status?: string; runId?: string; planCard?: PlanCard };
type ThreadStreamAction = {
  actionType: "change.spec.propose" | "change.plan.propose" | "code.run" | "intake.scan" | "intake.reanalyze" | "clarification.answer" | "clarification.skip";
  label: string;
  enabled: boolean;
  requiresConfirmation: boolean;
  disabledReason?: string;
};
type ThreadStreamItem = {
  id: string;
  kind: "user-message" | "assistant-turn" | "assistant-message" | "plan-card" | "workflow-summary" | "evidence" | "decision" | "change-state" | "intake-summary" | "clarification";
  label: string;
  timestamp?: string;
  body?: string;
  source: string;
  artifact?: string;
  status?: string;
  runId?: string;
  actionRunId?: string;
  semanticKey?: string;
  planCard?: PlanCard;
  actions?: ThreadStreamAction[];
  activity?: LiveTurnEvent[];
  evidence?: ThreadStreamEvidence[];
  blocks?: AssistantTurnBlock[];
  intake?: {
    scan?: { runId: string; candidateFiles?: string[]; scripts?: Array<{ name: string; command: string }>; missingInfo?: string[] };
    iteration?: { currentUnderstanding: string; confirmedConstraints: string[]; openQuestions: string[]; assumptions: string[] };
  };
  clarification?: ClarificationRequest;
};
type ClarificationRequest = {
  id: string;
  status: "pending" | "answered" | "skipped" | "expired";
  source: "aho" | "codex";
  stage: "intake" | "spec" | "plan" | "run";
  questions: Array<{ id: string; header?: string; question: string; options?: Array<{ label: string; description?: string }>; allowFreeform: boolean }>;
  answers?: Array<{ questionId: string; answer: string }>;
};
type ThreadStreamEvidence = {
  id: string;
  label: string;
  source: "workflow" | "validation" | "audit" | "decision";
  timestamp?: string;
  body?: string;
  artifact?: string;
  status?: string;
  runId?: string;
  actionRunId?: string;
};
type RunSummary = { id: string; runtime: string; status: string; startedAt?: string; finishedAt?: string };
type Approval = {
  id: string;
  kind: string;
  label: string;
  severity: string;
  changeId?: string;
  reason?: string;
  action?: { actionId: string; label: string; command: string; args: string[]; mutates: boolean; requiresConfirmation: boolean };
};
type Decision = {
  id: string;
  kind: string;
  label: string;
  status: string;
  changeId?: string;
  runId?: string;
  targetId?: string;
  artifact?: string;
  summary: string;
  feedback?: string;
  updatedAt: string;
  completedAt?: string;
};
type StreamPacket = {
  run: RunSummary;
  live: boolean;
  events: ThreadEvent[];
  artifacts: Array<{ key: string; path: string; kind: string; exists: boolean; preview?: string; tail?: string; truncated?: boolean; diagnostic?: string }>;
  diagnostics: string[];
};
type FolderDialogResult = { path: string | null; canceled: boolean; supported: boolean; error?: string };
type WorkbenchLiveEvent =
  | { event: "topic.message"; data: TopicMessageEntry }
  | { event: "run.started"; data: { runId: string; changeId: string; actionType?: string; runtime?: string } }
  | { event: "run.status"; data: { runId?: string; actionRunId?: string; status: string; label?: string } }
  | { event: "assistant.delta"; data: { delta: string; runId?: string } }
  | { event: "assistant.message"; data: TopicMessageEntry }
  | { event: "assistant.event"; data: AssistantReadableEvent }
  | { event: "tool.event"; data: WorkbenchLiveToolEvent }
  | { event: "usage"; data: { runId?: string; usage?: Record<string, unknown> } }
  | { event: "snapshot"; data: Snapshot }
  | { event: "error"; data: { message: string; runId?: string; actionRunId?: string } }
  | { event: "done"; data: { status: "completed" | "failed" } };
type WorkbenchLiveToolEvent = {
  runId: string;
  itemId?: string;
  phase: "started" | "completed" | "stderr" | "status";
  name?: string;
  command?: string;
  outputTail?: string;
  isError?: boolean;
  exitCode?: number;
  status?: string;
};
type AssistantReadableEvent = {
  runId: string;
  itemId?: string;
  kind: "status" | "reasoning-summary" | "command" | "file-change" | "mcp-tool" | "web-search" | "plan-update" | "tool-result" | "usage" | "error";
  phase?: string;
  title?: string;
  summary?: string;
  preview?: string;
  artifactRef?: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  isError?: boolean;
  truncated?: boolean;
  timestamp?: string;
};
type AssistantTurnBlock = {
  id: string;
  runId?: string;
  sequence: number;
  kind: "prose" | "status" | "command-group" | "command" | "tool-result" | "file-change" | "reasoning-summary" | "plan-card" | "workflow-evidence" | "usage" | "error";
  timestamp: string;
  source: "codex" | "aho" | "workflow" | "validation" | "audit" | "decision" | "legacy";
  status?: string;
  title?: string;
  text?: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  preview?: string;
  artifactRef?: string;
  isError?: boolean;
  truncated?: boolean;
  itemId?: string;
  children?: AssistantTurnBlock[];
  planCard?: PlanCard;
};
type LiveTurnEvent =
  | { kind: "status"; label: string; detail?: string }
  | { kind: "assistant-event"; event: AssistantReadableEvent }
  | { kind: "tool"; tool: WorkbenchLiveToolEvent }
  | { kind: "usage"; usage: Record<string, unknown> }
  | { kind: "error"; message: string };
type LiveAssistantTurn = {
  id: string;
  runId: string;
  runtime?: string;
  actionType?: string;
  status: string;
  text: string;
  events: LiveTurnEvent[];
  blocks: AssistantTurnBlock[];
  startedAt: string;
  endedAt?: string;
};
type TopicMessageEntry = {
  id: string;
  type: "user.message" | "assistant.message" | "orchestrator.plan" | "workflow.started" | "workflow.completed" | "workflow.failed" | "intake.scan" | "intake.iteration" | "clarification.request" | "clarification.answer" | "clarification.skip";
  timestamp?: string;
  changeId: string;
  text?: string;
  actionRunId?: string;
  actionType?: string;
  status?: string;
  runId?: string;
  artifact?: string;
  error?: string;
  planCard?: PlanCard;
  activity?: LiveTurnEvent[];
  blocks?: AssistantTurnBlock[];
  intake?: ThreadStreamItem["intake"];
  clarification?: ClarificationRequest;
};

const emptySnapshot: Snapshot = {
  project: null,
  memory: {},
  left: { topics: [] },
  center: { selectedTopic: null, workpad: emptyWorkpad(), agentLoop: { runs: [] }, thread: { items: [] } },
  right: { approvals: [], decisions: [] },
  harnessGaps: [],
  warnings: [],
};

export function App(): ReactElement {
  const [, setAppStatus] = useState<AppStatus | null>(null);
  const [projects, setProjects] = useState<ProjectStatus[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamPacket | null>(null);
  const [tab, setTab] = useState<"workpad" | "thread" | "loop">("workpad");
  const [navPanel, setNavPanel] = useState<"topics" | "repo" | "memory" | "settings">("topics");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [composerMode, setComposerMode] = useState<"chat" | "plan">("chat");
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [liveItems, setLiveItems] = useState<ThreadStreamItem[]>([]);
  const [liveTurns, setLiveTurns] = useState<LiveAssistantTurn[]>([]);
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
      const directStatus = list.projects.find((item) => item.project?.id === directProject);
      if (directStatus?.managed) await refresh(directProject, null);
      else setSnapshot(snapshotForProject(directStatus));
    }
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
    const runId = selectedRun ?? next.center.agentLoop.runs[0]?.id ?? null;
    setSelectedRun(runId);
    if (runId) setStream(await fetchJson<StreamPacket>(`/api/projects/${encodeURIComponent(projectId)}/workbench/stream/${encodeURIComponent(runId)}`));
  }

  useEffect(() => {
    loadApp().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  async function openProject(projectId: string): Promise<void> {
    setSelectedProjectId(projectId);
    setSelectedTopic(null);
    setSelectedRun(null);
    setStream(null);
    await refresh(projectId, null);
  }

  async function chooseTopic(topicId: string): Promise<void> {
    setSelectedTopic(topicId);
    await refresh(selectedProjectId, topicId);
  }

  async function chooseRun(runId: string): Promise<void> {
    if (!selectedProjectId) return;
    setSelectedRun(runId);
    setStream(await fetchJson<StreamPacket>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/stream/${encodeURIComponent(runId)}`));
  }

  async function executeApproval(approval: Approval): Promise<void> {
    if (!approval.action || !selectedProjectId) return;
    const result = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: approval.action, confirm: true }),
    });
    if (!result.ok) throw new Error(await result.text());
    setConfirming(null);
    await refresh();
  }

  async function requestApprovalChanges(approval: Approval): Promise<void> {
    if (!approval.action || !selectedProjectId) return;
    const feedback = window.prompt("写下你希望修改的地方");
    if (!feedback?.trim()) return;
    const result = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: approval.action, feedback }),
    });
    if (!result.ok) throw new Error(await result.text());
    setConfirming(null);
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
      setError("归档或暂停 Topic 为只读，不能继续发送消息。");
      return;
    }
    const message = composerText.trim();
    const pendingClarificationCount = activeWorkpad.intake.pendingClarifications?.length ?? 0;
    if (composerMode === "chat" && tab === "workpad" && (activeWorkpad.nextAction.actionType === "intake.reanalyze" || activeWorkpad.nextAction.actionType === "change.spec.propose" || pendingClarificationCount > 0)) {
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
    setTab("thread");
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
    if (!selectedProjectId || !activeTopic) return;
    setActionRunning(actionType);
    if (!actionType.startsWith("intake.") && !actionType.startsWith("clarification.")) setTab("thread");
    setError(null);
    try {
      if (actionType === "intake.scan") {
        const result = await postJson<{ snapshot: Snapshot }>(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/intake/scan`, {
          changeId: activeTopic.id,
          prompt: composerText.trim() || activeTopic.title,
        });
        setSnapshot(result.snapshot);
        if (composerText.trim()) setComposerText("");
        return;
      }
      if (actionType === "intake.reanalyze") {
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
        changeId: activeTopic.id,
        confirm: true,
        prompt: composerText.trim() || undefined,
        ...options,
      }, handleLiveEvent);
      if (composerText.trim()) setComposerText("");
    } finally {
      setActionRunning(null);
    }
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
      text: turn.text || text || "",
      blocks: turn.blocks.length > 0 ? turn.blocks : text ? [proseBlock(runId, text, 1)] : turn.blocks,
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

  const activeTopic = snapshot.center.selectedTopic;
  const activeWorkpad = snapshot.center.workpad ?? emptyWorkpad(activeTopic?.title ?? snapshot.project?.name);
  const activeRun = useMemo(() => snapshot.center.agentLoop.runs.find((run) => run.id === selectedRun) ?? snapshot.center.agentLoop.runs[0], [snapshot, selectedRun]);
  const selectedProjectStatus = useMemo(() => projects.find((item) => item.project?.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const runIds = useMemo(() => snapshot.center.agentLoop.runs.map((run) => run.id).join("|"), [snapshot.center.agentLoop.runs]);
  const threadItems = useMemo(() => {
    return [...snapshot.center.thread.items, ...liveItems].filter((item) => item.kind !== "change-state");
  }, [snapshot.center.thread.items, liveItems]);

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
  }, [threadItems.length, liveTurns.length]);

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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">Agent Harness<br />Orchestrator</div>
          <button className="icon-button" aria-label="刷新项目" onClick={() => void loadApp()}><RefreshCw size={14} /></button>
        </div>
        <section className="nav-section">
          <div className="section-label">项目</div>
          <div className="project-select"><Folder size={16} />{selectedProjectStatus?.project?.name ?? "未选择项目"}</div>
          <ProjectSidebar projects={projects} selectedProjectId={selectedProjectId} onOpen={openProject} onRefresh={loadApp} />
        </section>
        <nav className="nav-list">
          <button className={`nav-item ${navPanel === "topics" ? "active" : ""}`} onClick={() => setNavPanel("topics")}><FileText size={17} />主题</button>
          <button className={`nav-item ${navPanel === "repo" ? "active" : ""}`} onClick={() => setNavPanel("repo")}><GitBranch size={17} />仓库</button>
          <button className={`nav-item ${navPanel === "memory" ? "active" : ""}`} onClick={() => setNavPanel("memory")}><MemoryStick size={17} />记忆</button>
          <button className={`nav-item ${navPanel === "settings" ? "active" : ""}`} onClick={() => setNavPanel("settings")}><Settings size={17} />设置</button>
        </nav>
        <SidebarPanel
          panel={navPanel}
          snapshot={snapshot}
          project={selectedProjectStatus}
          activeTopic={activeTopic}
          selectedProjectId={selectedProjectId}
          onChooseTopic={chooseTopic}
          onRefresh={() => refresh()}
        />
      </aside>

      <main className="workspace">
        {!selectedProjectId ? (
          <EmptyWorkbench title="选择一个项目开始" description="从左侧添加已有项目或新建空仓库。AHO 会把项目、记忆、主题和确认动作组织在这个工作台里。" />
        ) : !selectedProjectStatus?.managed ? (
          <UnmanagedProjectView project={selectedProjectStatus} onDone={() => loadApp().then(() => selectedProjectId ? refresh(selectedProjectId, null) : undefined)} />
        ) : !activeTopic ? (
          <TopicEmptyView
            snapshot={snapshot}
            composerText={composerText}
            setComposerText={setComposerText}
            onCreate={createTopicFromComposer}
            busy={actionRunning !== null}
          />
        ) : (
          <>
            <header className="thread-header">
              <div className="thread-title-block">
                <strong>{activeTopic.title}</strong>
                <span>{snapshot.project?.name ?? "project"} · {stateLabel(activeTopic.state)} · AC {activeTopic.acCount ?? 0} · Tasks {activeTopic.taskCount ?? 0}</span>
              </div>
              <div className="topic-actions">
                <button className="secondary-button" onClick={() => void refresh()}><Settings size={15} />刷新状态</button>
              </div>
            </header>

            <div className="tabs">
              <button className={tab === "workpad" ? "active" : ""} onClick={() => setTab("workpad")}>Workpad</button>
              <button className={tab === "thread" ? "active" : ""} onClick={() => setTab("thread")}>线程</button>
              <button className={tab === "loop" ? "active" : ""} onClick={() => setTab("loop")}>Agent 循环</button>
            </div>

            <section className="center-grid">
              <div className="timeline-panel">
                {tab === "workpad" ? (
                  <>
                    <div className="thread-scroll workpad-scroll">
                      <WorkpadView
                        workpad={activeWorkpad}
                        approvals={snapshot.right.approvals}
                        busy={actionRunning !== null}
                        onWorkflowAction={runWorkflowAction}
                        onConfirmApproval={(approvalId) => setConfirming(approvalId)}
                        onAnswerClarification={answerClarification}
                      />
                    </div>
                    <TopicComposer
                      value={composerText}
                      onChange={setComposerText}
                      mode={composerMode}
                      onModeChange={setComposerMode}
                      busy={actionRunning !== null || activeTopic.state !== "active"}
                      disabledReason={activeTopic.state !== "active" ? "归档或暂停 Topic 为只读。" : undefined}
                      onSend={sendTopicMessage}
                      onRunCode={() => runWorkflowAction("code.run")}
                      actionRunning={actionRunning}
                      canRunCode={activeTopic.state === "active" && (activeTopic.taskCount ?? 0) > 0}
                    />
                  </>
                ) : tab === "thread" ? (
                  <>
                    <div
                      className="thread-scroll"
                      ref={threadScrollRef}
                      onScroll={(event) => {
                        const node = event.currentTarget;
                        setLatestHidden(node.scrollHeight - node.scrollTop - node.clientHeight > 180);
                      }}
                    >
                      <ThreadStreamView items={threadItems} liveTurns={liveTurns} busy={actionRunning !== null} onAction={runWorkflowAction} />
                    </div>
                    {latestHidden ? <button className="latest-button" onClick={() => { const node = threadScrollRef.current; if (node) node.scrollTop = node.scrollHeight; setLatestHidden(false); }}>最新</button> : null}
                    <TopicComposer
                      value={composerText}
                      onChange={setComposerText}
                      mode={composerMode}
                      onModeChange={setComposerMode}
                      busy={actionRunning !== null || activeTopic.state !== "active"}
                      disabledReason={activeTopic.state !== "active" ? "归档或暂停 Topic 为只读。" : undefined}
                      onSend={sendTopicMessage}
                      onRunCode={() => runWorkflowAction("code.run")}
                      actionRunning={actionRunning}
                      canRunCode={activeTopic.state === "active" && (activeTopic.taskCount ?? 0) > 0}
                    />
                  </>
                ) : (
                  <div className="loop-stack">
                    <RunList runs={snapshot.center.agentLoop.runs} selectedRun={activeRun?.id} onSelect={chooseRun} />
                    <RunReplay stream={stream} run={activeRun} />
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <aside className="approval-pane">
        <div className="approval-header">
          <h2>决策</h2>
          <span>{snapshot.right.approvals.length}</span>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
        <div className="approval-list">
          {snapshot.right.approvals.length === 0 ? (
            <div className="approval-empty">
              <h3>暂无待确认动作</h3>
              <p>当审查、Worktree 应用或关闭变更需要你确认时，会显示在这里。</p>
            </div>
          ) : null}
          {snapshot.right.approvals.map((approval) => (
            <article key={approval.id} className="approval-card">
              <div className="approval-meta">
                <span>{approvalKind(approval.kind)}</span>
                <small>{approval.severity}</small>
              </div>
              <h3>{approval.label}</h3>
              <p>{approval.reason ?? "等待你确认后推进下一步。"}</p>
              <dl className="approval-fields">
                <div><dt>动作</dt><dd>{approval.action?.actionId ?? approval.kind}</dd></div>
                <div><dt>变更</dt><dd>{approval.changeId ?? activeTopic?.title ?? "-"}</dd></div>
                <div><dt>状态</dt><dd>{approval.severity}</dd></div>
              </dl>
              <div className="approval-actions">
                {confirming === approval.id ? (
                  <>
                    <button className="primary-button" onClick={() => void executeApproval(approval)}><Check size={15} />确认执行</button>
                    <button className="outline-button" onClick={() => setConfirming(null)}><X size={15} />取消</button>
                  </>
                ) : (
                  <>
                    <button className="primary-button" onClick={() => setConfirming(approval.id)}><Check size={15} />确认</button>
                    <button className="outline-button" onClick={() => void requestApprovalChanges(approval)}><FileText size={15} />要求修改</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        <DecisionHistory decisions={snapshot.right.decisions ?? []} />
      </aside>

      <BottomStatusBar snapshot={snapshot} project={selectedProjectStatus} topic={activeTopic} />
    </div>
  );
}

function proseBlock(runId: string, text: string, sequence: number): AssistantTurnBlock {
  return { id: `live-prose:${runId}:${sequence}`, runId, sequence, kind: "prose", timestamp: new Date().toISOString(), source: "codex", text };
}

function appendProseBlock(blocks: AssistantTurnBlock[], runId: string, delta: string): AssistantTurnBlock[] {
  const next = [...blocks];
  const last = next.at(-1);
  if (last?.kind === "prose" && last.source === "codex") {
    next[next.length - 1] = { ...last, text: `${last.text ?? ""}${delta}` };
    return next;
  }
  next.push(proseBlock(runId, delta, nextBlockSequence(next)));
  return next;
}

function upsertBlock(blocks: AssistantTurnBlock[], block: AssistantTurnBlock): AssistantTurnBlock[] {
  const key = blockKey(block);
  const existingIndex = blocks.findIndex((item) => blockKey(item) === key);
  if (existingIndex === -1) return [...blocks, { ...block, sequence: block.sequence > 0 ? block.sequence : nextBlockSequence(blocks) }];
  const next = [...blocks];
  next[existingIndex] = mergeAssistantBlocks(next[existingIndex], block);
  return next;
}

function mergeAssistantBlocks(existing: AssistantTurnBlock, incoming: AssistantTurnBlock): AssistantTurnBlock {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    sequence: existing.sequence,
    timestamp: existing.timestamp,
    text: incoming.text ?? existing.text,
    preview: incoming.preview ?? existing.preview,
    title: incoming.title ?? existing.title,
    status: incoming.status ?? existing.status,
    command: incoming.command ?? existing.command,
    cwd: incoming.cwd ?? existing.cwd,
    exitCode: incoming.exitCode ?? existing.exitCode,
    artifactRef: incoming.artifactRef ?? existing.artifactRef,
    truncated: incoming.truncated ?? existing.truncated,
    isError: incoming.isError ?? existing.isError,
  };
}

function blockFromAssistantEvent(event: AssistantReadableEvent): AssistantTurnBlock | null {
  if (!mainThreadAssistantEvent(event)) return null;
  return {
    id: `live-assistant:${event.runId}:${event.itemId ?? event.kind}:${event.phase ?? "event"}`,
    runId: event.runId,
    sequence: 0,
    kind: assistantEventBlockKind(event.kind),
    timestamp: event.timestamp ?? new Date().toISOString(),
    source: "codex",
    status: event.phase,
    title: event.title ?? readableEventTitle(event),
    text: event.summary,
    command: event.command,
    cwd: event.cwd,
    exitCode: event.exitCode,
    preview: event.preview,
    artifactRef: event.artifactRef,
    isError: event.isError,
    truncated: event.truncated,
    itemId: event.itemId,
  };
}

function blockFromToolEvent(event: WorkbenchLiveToolEvent): AssistantTurnBlock | null {
  if (event.phase === "stderr") return null;
  if (!event.command && event.phase === "status" && !event.isError) return null;
  return {
    id: `live-tool:${event.runId}:${event.command ?? event.name ?? event.phase}:${event.phase}`,
    runId: event.runId,
    sequence: 0,
    kind: event.command ? "command" : "status",
    timestamp: new Date().toISOString(),
    source: "codex",
    status: event.status ?? event.phase,
    title: event.command ? event.phase === "started" ? "正在运行命令" : event.isError ? "命令失败" : "命令完成" : event.name ?? "运行状态",
    text: event.name,
    command: event.command,
    exitCode: event.exitCode,
    preview: event.outputTail,
    isError: event.isError,
    itemId: event.itemId,
  };
}

function usageBlock(runId: string, usage: Record<string, unknown>): AssistantTurnBlock {
  return { id: `live-usage:${runId}`, runId, sequence: 0, kind: "usage", timestamp: new Date().toISOString(), source: "codex", title: "用量", text: formatUsage(usage) };
}

function assistantEventBlockKind(kind: AssistantReadableEvent["kind"]): AssistantTurnBlock["kind"] {
  if (kind === "reasoning-summary") return "reasoning-summary";
  if (kind === "command") return "command";
  if (kind === "file-change") return "file-change";
  if (kind === "usage") return "usage";
  if (kind === "error") return "error";
  if (kind === "status") return "status";
  return "tool-result";
}

function nextBlockSequence(blocks: AssistantTurnBlock[]): number {
  return Math.max(0, ...blocks.map((block) => block.sequence)) + 1;
}

function blockKey(block: AssistantTurnBlock): string {
  const runId = block.runId ?? "";
  if (block.kind === "usage") return `usage:${runId}`;
  if (block.kind === "error") return `error:${runId}:${normalizeBlockText(block.text ?? block.preview ?? block.title)}`;
  if (block.kind === "workflow-evidence") return `workflow-evidence:${runId}:${block.artifactRef ?? block.title ?? block.status ?? block.id}`;
  if (block.kind === "command") {
    if (block.itemId) return `command:${runId}:item:${block.itemId}`;
    return `command:${runId}:command:${normalizeCommandKey(block.command)}`;
  }
  return block.itemId ? `${block.kind}:${runId}:item:${block.itemId}` : `${block.id}:${block.kind}`;
}

function normalizeCommandKey(command: string | undefined): string {
  return (command ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeBlockText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function ProjectSidebar({ projects, selectedProjectId, onRefresh, onOpen }: { projects: ProjectStatus[]; selectedProjectId: string | null; onRefresh: () => Promise<void>; onOpen: (projectId: string) => Promise<void> }): ReactElement {
  const [mode, setMode] = useState<"list" | "add" | "new">("list");
  async function afterProjectAdded(projectId?: string): Promise<void> {
    await onRefresh();
    if (projectId) await onOpen(projectId);
    setMode("list");
  }
  return (
    <div className="project-sidebar">
      <div className="project-actions">
        <button className="small-action primary" onClick={() => setMode(mode === "add" ? "list" : "add")}><Plus size={14} />添加</button>
        <button className="small-action" onClick={() => setMode(mode === "new" ? "list" : "new")}>新建</button>
      </div>
      {mode === "add" ? <div className="project-inline-panel"><ProjectAddForm onDone={afterProjectAdded} /></div> : null}
      {mode === "new" ? <div className="project-inline-panel"><ProjectCreateForm onDone={afterProjectAdded} /></div> : null}
      <div className="project-rows">
        {projects.length === 0 ? <div className="empty-state sidebar-empty">还没有注册项目。</div> : null}
        {projects.map((item) => (
          <button key={item.project?.id ?? item.path} className={`project-row ${item.project?.id === selectedProjectId ? "selected" : ""}`} onClick={() => item.project ? void onOpen(item.project.id) : undefined}>
            <span>{item.project?.name ?? item.path}</span>
            <small>{item.managed ? "Harness 就绪" : "未初始化"}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function SidebarPanel({
  panel,
  snapshot,
  project,
  activeTopic,
  selectedProjectId,
  onChooseTopic,
  onRefresh,
}: {
  panel: "topics" | "repo" | "memory" | "settings";
  snapshot: Snapshot;
  project: ProjectStatus | null;
  activeTopic: TopicDetail | null;
  selectedProjectId: string | null;
  onChooseTopic: (topicId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}): ReactElement {
  if (panel === "topics") {
    return (
      <section className="topic-list">
        <div className="section-label">主题</div>
        {!selectedProjectId ? <div className="empty-state sidebar-empty">先在项目区添加或选择项目。</div> : null}
        {selectedProjectId && !project?.managed ? <div className="empty-state sidebar-empty">初始化 Harness 后显示主题。</div> : null}
        {snapshot.left.topics.map((topic) => (
          <button key={topic.id} className={`topic-row ${activeTopic?.id === topic.id ? "selected" : ""}`} onClick={() => void onChooseTopic(topic.id)}>
            <span>{topic.title}</span>
            <small>{stateLabel(topic.state)}</small>
          </button>
        ))}
      </section>
    );
  }
  if (panel === "repo") {
    return (
      <section className="topic-list operational-panel">
        <div className="section-label">仓库</div>
        <InfoRow label="路径" value={snapshot.left.repo?.path ?? project?.path ?? "-"} />
        <InfoRow label="Git" value={snapshot.left.repo?.git ? "已初始化" : project?.isGitRepo ? "已初始化" : "未检测到"} />
        <InfoRow label="分支" value={snapshot.left.repo?.branch ?? "-"} />
        <InfoRow label="工作区" value={snapshot.left.repo?.dirty ? "有未提交改动" : "干净或未知"} />
        <InfoRow label="Runs" value={`${snapshot.center.agentLoop.runs.length}`} />
      </section>
    );
  }
  if (panel === "memory") {
    return (
      <section className="topic-list operational-panel">
        <div className="section-label">记忆</div>
        <InfoRow label="模式" value={snapshot.memory.memoryMode ?? "unknown"} />
        <InfoRow label="Harness" value={snapshot.memory.harnessReady ? "就绪" : "未就绪"} />
        <InfoRow label="Artifact" value={snapshot.memory.artifactBase ?? "-"} />
        <InfoRow label="Gaps" value={`${snapshot.harnessGaps.length}`} />
        {snapshot.harnessGaps.slice(0, 4).map((gap) => <p className="panel-note" key={gap.id}>{gap.summary}</p>)}
      </section>
    );
  }
  return (
    <section className="topic-list operational-panel">
      <div className="section-label">设置</div>
      <InfoRow label="项目" value={project?.project?.name ?? "未选择"} />
      <InfoRow label="状态" value={project?.managed ? "Harness 就绪" : "未初始化"} />
      <InfoRow label="当前 Topic" value={activeTopic?.id ?? "-"} />
      <button className="outline-button wide-button" onClick={() => void onRefresh()}><RefreshCw size={15} />刷新工作台</button>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectAddForm({ onDone }: { onDone: (projectId?: string) => Promise<void> }): ReactElement {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [manual, setManual] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(selectedPath = path): Promise<void> {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedPath, name: name || undefined, confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as { project: { id: string } };
    setMessage("项目已添加。");
    await onDone(result.project.id);
  }
  async function chooseFolder(): Promise<void> {
    setMessage(null);
    const result = await postJson<FolderDialogResult>("/api/dialog/open-folder", {});
    if (result.path) {
      setPath(result.path);
      await submit(result.path);
      return;
    }
    if (result.supported === false) {
      setManual(true);
      setMessage("当前系统无法打开文件夹选择器，请手动输入路径。");
      return;
    }
    if (result.canceled) {
      setMessage("已取消选择。");
      return;
    }
    setManual(true);
    setMessage(result.error ?? "无法打开文件夹选择器，请手动输入路径。");
  }
  return (
    <form className="project-form" onSubmit={(event) => { event.preventDefault(); void submit().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause))); }}>
      <button type="button" className="primary-button" onClick={() => void chooseFolder().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}><Folder size={15} />选择文件夹添加</button>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="显示名称，可选" />
      <button type="button" className="text-button" onClick={() => setManual(!manual)}>{manual ? "收起手动路径" : "手动输入路径"}</button>
      {manual ? (
        <>
          <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="本地项目路径，例如 E:\\work\\my-app" />
          <button className="outline-button"><Plus size={15} />添加这个路径</button>
        </>
      ) : null}
      {message ? <small>{message}</small> : null}
    </form>
  );
}

function ProjectCreateForm({ onDone }: { onDone: (projectId?: string) => Promise<void> }): ReactElement {
  const [parentPath, setParentPath] = useState("");
  const [name, setName] = useState("");
  const [git, setGit] = useState(true);
  const [readme, setReadme] = useState(true);
  const [initialCommit, setInitialCommit] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(): Promise<void> {
    const response = await fetch("/api/projects/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentPath, name, git, readme, initialCommit, confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as { project: { id: string } };
    setMessage("新项目已创建并注册。");
    await onDone(result.project.id);
  }
  async function chooseParent(): Promise<void> {
    setMessage(null);
    const result = await postJson<FolderDialogResult>("/api/dialog/open-folder", {});
    if (result.path) {
      setParentPath(result.path);
      return;
    }
    if (result.supported === false) {
      setMessage("当前系统无法打开文件夹选择器，请手动输入父目录。");
      return;
    }
    if (result.canceled) {
      setMessage("已取消选择。");
      return;
    }
    setMessage(result.error ?? "无法打开文件夹选择器，请手动输入父目录。");
  }
  return (
    <form className="project-form" onSubmit={(event) => { event.preventDefault(); void submit().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause))); }}>
      <button type="button" className="outline-button" onClick={() => void chooseParent().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}><Folder size={15} />选择父目录</button>
      <input value={parentPath} onChange={(event) => setParentPath(event.target.value)} placeholder="父目录路径，例如 E:\\work" />
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="项目目录名" />
      <label><input type="checkbox" checked={git} onChange={(event) => setGit(event.target.checked)} /> 初始化 Git</label>
      <label><input type="checkbox" checked={readme} onChange={(event) => setReadme(event.target.checked)} /> 创建 README</label>
      <label><input type="checkbox" checked={initialCommit} onChange={(event) => setInitialCommit(event.target.checked)} /> 创建初始提交</label>
      <button className="primary-button"><Plus size={15} />新建项目</button>
      {message ? <small>{message}</small> : null}
    </form>
  );
}

function UnmanagedProjectView({ project, onDone }: { project: ProjectStatus | null; onDone: () => Promise<void> }): ReactElement {
  if (!project?.project) return <EmptyWorkbench title="项目不可用" description="请选择左侧项目或重新刷新项目列表。" />;
  return (
    <section className="empty-workbench">
      <p className="eyebrow">项目已添加</p>
      <h1>{project.project.name}</h1>
      <p>{project.path}</p>
      <p>这个项目还没有初始化 Harness。初始化后会创建项目入口地图和 external-local 记忆。</p>
      <HarnessInitButton projectId={project.project.id} onDone={onDone} />
    </section>
  );
}

function TopicEmptyView({
  snapshot,
  composerText,
  setComposerText,
  onCreate,
  busy,
}: {
  snapshot: Snapshot;
  composerText: string;
  setComposerText: (value: string) => void;
  onCreate: () => Promise<void>;
  busy: boolean;
}): ReactElement {
  return (
    <section className="topic-empty-view">
      <div className="breadcrumb">{snapshot.project?.name ?? "project"} / 主题</div>
      <div className="topic-empty-content">
        <p className="eyebrow">本地工作台</p>
        <h1>暂无主题</h1>
        <p>输入一个需求或问题来创建第一个 Topic。AHO 会先进入计划模式，而不是直接写代码。</p>
        <div className="empty-composer">
          <textarea value={composerText} onChange={(event) => setComposerText(event.target.value)} placeholder="例如：帮我新增会员满 100 元 9 折，并补测试。" />
          <button className="primary-button" disabled={busy || !composerText.trim()} onClick={() => void onCreate()}>创建 Topic</button>
        </div>
      </div>
    </section>
  );
}

function EmptyWorkbench({ title, description }: { title: string; description: string }): ReactElement {
  return (
    <section className="empty-workbench">
      <p className="eyebrow">本地工作台</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

function DecisionHistory({ decisions }: { decisions: Decision[] }): ReactElement {
  return (
    <section className="decision-history">
      <div className="approval-header compact">
        <h2>已完成</h2>
        <span>{decisions.length}</span>
      </div>
      {decisions.length === 0 ? <div className="approval-empty"><h3>暂无决策记录</h3><p>接受、要求修改或完成的动作会保留在这里。</p></div> : null}
      <div className="decision-list">
        {decisions.slice(0, 8).map((decision) => (
          <article key={decision.id} className="decision-item">
            <div className="approval-meta"><span>{decision.status}</span><small>{formatTime(decision.completedAt ?? decision.updatedAt)}</small></div>
            <h3>{decision.label}</h3>
            <p>{decision.summary}</p>
            <dl className="approval-fields">
              <div><dt>目标</dt><dd>{decision.targetId ?? decision.changeId ?? "-"}</dd></div>
              <div><dt>证据</dt><dd>{decision.artifact ?? decision.runId ?? "-"}</dd></div>
            </dl>
            {decision.feedback ? <p className="feedback-note">{decision.feedback}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function BottomStatusBar({ snapshot, project, topic }: { snapshot: Snapshot; project: ProjectStatus | null; topic: TopicDetail | null }): ReactElement {
  const repoPath = snapshot.left.repo?.path ?? project?.path ?? "-";
  const issueCount = snapshot.warnings.length + (topic?.closeGate?.blockingIssues.length ?? 0);
  return (
    <footer className="bottom-status">
      <span>记忆：{snapshot.memory.memoryMode ?? (project?.project ? "unknown" : "未选择")}</span>
      <span>根目录：{repoPath}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />状态：{snapshot.memory.harnessReady ? "就绪" : "未就绪"}</span>
      <span>当前变更：{topic?.title ?? "无"}</span>
      <span><i className={snapshot.memory.harnessReady ? "status-dot ready-dot" : "status-dot muted-dot"} />Harness {snapshot.memory.harnessReady ? "就绪" : "未就绪"}</span>
      <span>{issueCount} 个问题</span>
    </footer>
  );
}

function HarnessInitButton({ projectId, onDone }: { projectId: string; onDone: () => Promise<void> }): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  async function init(): Promise<void> {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/harness/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryMode: "external-local", confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    setMessage("Harness 已初始化。");
    await onDone();
  }
  return (
    <>
      <button className="secondary-button" onClick={() => void init().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}>初始化 Harness</button>
      {message ? <small>{message}</small> : null}
    </>
  );
}

function WorkpadView({
  workpad,
  approvals,
  busy,
  onWorkflowAction,
  onConfirmApproval,
  onAnswerClarification,
}: {
  workpad: Workpad;
  approvals: Approval[];
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
}): ReactElement {
  const approval = workpad.nextAction.approvalId ? approvals.find((item) => item.id === workpad.nextAction.approvalId) : undefined;
  const confirmedConstraints = workpad.intake.confirmedConstraints ?? [];
  const openQuestions = workpad.intake.openQuestions ?? [];
  const assumptions = workpad.intake.assumptions ?? [];
  const pendingClarifications = workpad.intake.pendingClarifications ?? [];
  return (
    <div className="workpad" data-testid="workpad-view">
      <section className="workpad-hero">
        <div>
          <span className={`workpad-state ${workpad.state}`}>{workpadStateLabel(workpad.state)}</span>
          <h2>{workpad.title}</h2>
          <p>{workpad.subtitle}</p>
        </div>
        <WorkpadActionButton
          action={workpad.nextAction}
          approval={approval}
          busy={busy}
          onWorkflowAction={onWorkflowAction}
          onConfirmApproval={onConfirmApproval}
        />
      </section>

      <section className="workpad-section">
        <div className="workpad-section-header">
          <h3>目标与当前理解</h3>
          <span>{workpad.intake.source}</span>
        </div>
        <p className="workpad-goal">{workpad.intake.goal}</p>
        <p>{workpad.intake.currentUnderstanding}</p>
        {confirmedConstraints.length > 0 ? (
          <div className="workpad-chip-list" aria-label="Confirmed constraints">
            {confirmedConstraints.map((constraint) => <span key={constraint}>{constraint}</span>)}
          </div>
        ) : null}
        {workpad.intake.relatedArtifacts.length > 0 ? (
          <div className="workpad-links">
            {workpad.intake.relatedArtifacts.map((artifact) => <span className="artifact-link" key={artifact}>查看证据：{artifactName(artifact)}</span>)}
          </div>
        ) : null}
      </section>

      {pendingClarifications.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>需要确认</h3>
            <span>{pendingClarifications.length}</span>
          </div>
          <div className="clarification-list">
            {pendingClarifications.map((clarification) => (
              <ClarificationCard
                key={clarification.id}
                clarification={clarification}
                busy={busy}
                onAnswer={onAnswerClarification}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="workpad-progress-grid" aria-label="Workpad progress">
        <WorkpadMetric label="Spec" value={readinessLabel(workpad.progress.spec)} />
        <WorkpadMetric label="Plan" value={readinessLabel(workpad.progress.plan)} />
        <WorkpadMetric label="Tasks" value={readinessLabel(workpad.progress.tasks)} />
        <WorkpadMetric label="AC / Tasks" value={`${workpad.progress.acCount} / ${workpad.progress.taskCount}`} />
        <WorkpadMetric label="Runs" value={`${workpad.progress.runCount}${workpad.progress.latestRunStatus ? ` · ${humanStatus(workpad.progress.latestRunStatus)}` : ""}`} />
        <WorkpadMetric label="Validation / Audit" value={`${statusOrDash(workpad.progress.validationStatus)} / ${statusOrDash(workpad.progress.auditStatus)}`} />
      </section>

      {workpad.tasks.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>TaskGraph 预览</h3>
            <span>来自 tasks.md / ac-map.json</span>
          </div>
          <div className="workpad-task-list">
            {workpad.tasks.map((task) => (
              <div className="workpad-task" key={task.id}>
                <strong>{task.id}</strong>
                <span>{task.title}</span>
                <small>{task.done ? "已完成" : "未完成"} · {task.acIds.join(", ") || "未映射 AC"}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="workpad-section">
        <div className="workpad-section-header">
          <h3>证据与决策</h3>
          <span>{workpad.evidence.length}</span>
        </div>
        {workpad.evidence.length === 0 ? <p className="panel-note">暂无 run、validation、audit 或 decision evidence。</p> : null}
        <div className="workpad-evidence-list">
          {workpad.evidence.map((item) => (
            <div className="workpad-evidence" key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.source}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
              {item.artifact ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
            </div>
          ))}
        </div>
      </section>

      {(workpad.blockers.length > 0 || workpad.warnings.length > 0 || workpad.intake.missingInfo.length > 0 || openQuestions.length > 0 || assumptions.length > 0) ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>阻塞与缺口</h3>
            <span>{workpad.blockers.length + workpad.warnings.length + workpad.intake.missingInfo.length + openQuestions.length + assumptions.length}</span>
          </div>
          <ul className="workpad-issue-list">
            {[...workpad.blockers, ...workpad.warnings, ...workpad.intake.missingInfo, ...openQuestions.map((item) => `待确认：${item}`), ...assumptions.map((item) => `假设：${item}`)].map((item, index) => <li key={`${item}:${index}`}>{item}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ClarificationCard({
  clarification,
  busy,
  onAnswer,
}: {
  clarification: ClarificationRequest;
  busy: boolean;
  onAnswer: (clarificationId: string, answer: string) => Promise<void>;
}): ReactElement {
  const [answer, setAnswer] = useState("");
  const firstQuestion = clarification.questions[0];
  const canSubmit = !busy && answer.trim().length > 0;
  async function submit(): Promise<void> {
    if (!canSubmit) return;
    await onAnswer(clarification.id, answer);
    setAnswer("");
  }
  return (
    <article className="clarification-card" data-testid="clarification-card">
      <div className="clarification-questions">
        {clarification.questions.map((question) => (
          <div key={question.id}>
            <strong>{question.header ?? "请确认"}</strong>
            <p>{question.question}</p>
            {question.options && question.options.length > 0 ? (
              <div className="clarification-options">
                {question.options.map((option) => (
                  <button
                    className="outline-button"
                    key={option.label}
                    type="button"
                    onClick={() => setAnswer(option.description ? `${option.label}：${option.description}` : option.label)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <label>
        <span>回答</span>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={firstQuestion?.allowFreeform === false ? "选择一个选项后提交" : "补充你的约束或答案"}
          rows={3}
        />
      </label>
      <button className="primary-button" type="button" disabled={!canSubmit} onClick={() => void submit()}>
        提交回答
      </button>
    </article>
  );
}

function WorkpadActionButton({
  action,
  approval,
  busy,
  onWorkflowAction,
  onConfirmApproval,
}: {
  action: WorkpadNextAction;
  approval?: Approval;
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
}): ReactElement {
  const disabled = busy || !action.enabled || action.kind === "none" || action.kind === "read-only";
  function run(): void {
    if (action.kind === "approval" && action.approvalId) {
      onConfirmApproval(action.approvalId);
      return;
    }
    if (action.kind === "workflow-action" && action.actionType) void onWorkflowAction(action.actionType);
  }
  return (
    <div className="workpad-next-action">
      <span>下一步</span>
      <strong>{approval?.action?.label ?? action.label}</strong>
      <p>{action.description}</p>
      <button className="primary-button" disabled={disabled} title={action.disabledReason} onClick={run}>
        {action.enabled ? "执行" : "不可执行"}
      </button>
    </div>
  );
}

function WorkpadMetric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="workpad-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ThreadStreamView({ items, liveTurns, busy, onAction }: { items: ThreadStreamItem[]; liveTurns: LiveAssistantTurn[]; busy: boolean; onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void> }): ReactElement {
  if (items.length === 0 && liveTurns.length === 0) return <div className="empty-state">暂无线程内容。</div>;
  return (
    <div className="timeline">
      {items.map((item) => (
        <div className={`timeline-item ${threadTone(item)}`} key={item.id}>
          <div className="timeline-icon">{threadIcon(item)}</div>
          <div>
            <strong>{threadLabel(item)}</strong>
            {item.blocks && item.blocks.length > 0 ? (
              <AssistantTurnBlocks blocks={item.blocks} actions={item.actions ?? []} busy={busy} onAction={onAction} completed={item.status !== "running"} />
            ) : (
              <>
                <p>{item.body ?? item.label} {item.status ? `· ${item.status}` : ""}</p>
                {item.activity && item.activity.length > 0 ? <AssistantActivity events={item.activity} /> : null}
                {item.evidence && item.evidence.length > 0 ? <AssistantEvidenceBlocks evidence={item.evidence} /> : null}
                {item.planCard ? <PlanCardView planCard={item.planCard} actions={item.actions ?? []} busy={busy} onAction={onAction} /> : null}
              </>
            )}
            {item.artifact && !(item.blocks && item.blocks.some((block) => block.artifactRef === item.artifact)) ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
          </div>
          <time>{formatTime(item.timestamp)}</time>
        </div>
      ))}
      {liveTurns.map((turn) => <LiveAssistantTurnView key={turn.id} turn={turn} />)}
    </div>
  );
}

function AssistantActivity({ events }: { events: LiveTurnEvent[] }): ReactElement {
  const statusEvents = events.filter((event): event is Extract<LiveTurnEvent, { kind: "status" }> => event.kind === "status");
  const assistantEvents = events
    .filter((event): event is Extract<LiveTurnEvent, { kind: "assistant-event" }> => event.kind === "assistant-event")
    .map((event) => mainThreadAssistantEvent(event.event))
    .filter((event): event is AssistantReadableEvent => Boolean(event));
  const toolEvents = filterLegacyToolEvents(
    events.filter((event): event is Extract<LiveTurnEvent, { kind: "tool" }> => event.kind === "tool" && event.tool.phase !== "stderr"),
    assistantEvents,
  );
  const usage = assistantEvents.some((event) => event.kind === "usage") ? undefined : events.find((event): event is Extract<LiveTurnEvent, { kind: "usage" }> => event.kind === "usage");
  const errors = events.filter((event): event is Extract<LiveTurnEvent, { kind: "error" }> => event.kind === "error");
  return (
    <div className="assistant-activity">
      {statusEvents.length > 0 ? (
        <div className="activity-status-row">
          {statusEvents.slice(-4).map((event, index) => (
            <span key={`${event.label}:${index}`}>{humanStatus(event.detail ?? event.label)}</span>
          ))}
        </div>
      ) : null}
      {assistantEvents.length > 0 ? <AssistantReadableEventCards events={assistantEvents} /> : null}
      {toolEvents.length > 0 ? <ToolEventGroup events={toolEvents} /> : null}
      {usage ? <small className="usage-line">{formatUsage(usage.usage)}</small> : null}
      {errors.map((error, index) => <div className="live-error" key={`activity-error:${index}`}>{error.message}</div>)}
    </div>
  );
}

function LiveAssistantTurnView({ turn }: { turn: LiveAssistantTurn }): ReactElement {
  const assistantEvents = turn.events
    .filter((event): event is Extract<LiveTurnEvent, { kind: "assistant-event" }> => event.kind === "assistant-event")
    .map((event) => mainThreadAssistantEvent(event.event))
    .filter((event): event is AssistantReadableEvent => Boolean(event));
  const toolEvents = filterLegacyToolEvents(
    turn.events.filter((event): event is Extract<LiveTurnEvent, { kind: "tool" }> => event.kind === "tool" && event.tool.phase !== "stderr"),
    assistantEvents,
  );
  const statusEvents = turn.events.filter((event): event is Extract<LiveTurnEvent, { kind: "status" }> => event.kind === "status");
  const usage = assistantEvents.some((event) => event.kind === "usage") ? undefined : turn.events.find((event): event is Extract<LiveTurnEvent, { kind: "usage" }> => event.kind === "usage");
  const errors = turn.events.filter((event): event is Extract<LiveTurnEvent, { kind: "error" }> => event.kind === "error");
  const latestStatus = statusEvents.at(-1);
  return (
    <div className={`timeline-item live-turn ${turn.status === "failed" ? "danger" : "success"}`}>
      <div className="timeline-icon"><Code2 size={16} /></div>
      <div>
        <strong>{runtimeLabel(turn.runtime ?? turn.actionType ?? "AI 运行")}</strong>
        <div className="live-status-pill">
          <Clock3 size={14} />
          <span>{humanStatus(latestStatus?.label ?? turn.status)}</span>
          {latestStatus?.detail ? <small>{latestStatus.detail}</small> : null}
        </div>
        {turn.blocks.length > 0 ? (
          <AssistantTurnBlocks blocks={turn.blocks} defaultOpenProcess completed={false} />
        ) : (
          <>
            {turn.text.trim() ? <p className="assistant-live-text">{turn.text}</p> : <p className="assistant-live-text muted">等待首批输出中...</p>}
            {assistantEvents.length > 0 ? <AssistantReadableEventCards events={assistantEvents} defaultOpenProcess /> : null}
            {toolEvents.length > 0 ? <ToolEventGroup events={toolEvents} /> : null}
            {usage ? <small className="usage-line">{formatUsage(usage.usage)}</small> : null}
            {errors.map((error, index) => <div className="live-error" key={`${turn.id}:error:${index}`}>{error.message}</div>)}
          </>
        )}
      </div>
      <time>{formatTime(turn.startedAt)}</time>
    </div>
  );
}

function AssistantTurnBlocks({
  blocks,
  actions = [],
  busy = false,
  onAction = async () => undefined,
  defaultOpenProcess = false,
  completed = true,
}: {
  blocks: AssistantTurnBlock[];
  actions?: ThreadStreamAction[];
  busy?: boolean;
  onAction?: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  defaultOpenProcess?: boolean;
  completed?: boolean;
}): ReactElement {
  const displayBlocks = normalizeTurnBlocks(blocks);
  if (displayBlocks.length === 0) return <></>;
  return (
    <div className="assistant-block-stack">
      {displayBlocks.map((block) => {
        if (block.kind === "command-group") {
          const children = block.children ?? [];
          const open = defaultOpenProcess || !completed || children.some((child) => child.isError);
          return (
            <details className="assistant-command-group" open={open} key={block.id} data-testid="assistant-block-command-group">
              <summary>{block.title ?? `已运行 ${children.length} 条命令`}</summary>
              <div className="assistant-block-stack compact">
                {children.map((child) => <AssistantBlockView block={child} key={child.id} />)}
              </div>
            </details>
          );
        }
        if (block.kind === "plan-card" && block.planCard) {
          return <div data-testid="assistant-block-plan-card" key={block.id}><PlanCardView planCard={block.planCard} actions={actions} busy={busy} onAction={onAction} /></div>;
        }
        return <AssistantBlockView block={block} key={block.id} />;
      })}
    </div>
  );
}

function AssistantBlockView({ block }: { block: AssistantTurnBlock }): ReactElement {
  if (block.kind === "prose") return <p className="assistant-prose-block" data-testid="assistant-block-prose">{block.text}</p>;
  if (block.kind === "usage") return <small className="usage-line" data-testid="assistant-block-usage">{block.text ?? block.preview ?? "用量已记录"}</small>;
  const className = `assistant-block-card ${block.isError || block.kind === "error" ? "danger" : ""}`;
  return (
    <div className={className} data-testid={`assistant-block-${block.kind}`}>
      <div className="assistant-event-header">
        <strong>{block.title ?? blockTitle(block)}</strong>
        {block.status ? <small>{humanStatus(block.status)}</small> : null}
      </div>
      {block.text ? <p>{block.text}</p> : null}
      {block.command ? <code>{block.command}</code> : null}
      {block.cwd ? <small className="event-muted">cwd: {block.cwd}</small> : null}
      {typeof block.exitCode === "number" ? <small className="event-muted">exit {block.exitCode}</small> : null}
      {block.preview ? <pre className="event-preview">{block.preview}</pre> : null}
      {block.artifactRef ? <small className="artifact-link">查看证据：{artifactName(block.artifactRef)}</small> : null}
      {block.truncated ? <small className="event-muted">输出已截断，完整内容在 Agent Loop 原始日志中。</small> : null}
    </div>
  );
}

function normalizeTurnBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const ordered = dedupeBlocks(blocks)
    .filter((block) => isMainThreadBlock(block))
    .map((block) => hasInternalRunMetadata(block.preview) ? { ...block, preview: undefined, truncated: false } : block)
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const result: AssistantTurnBlock[] = [];
  let group: AssistantTurnBlock[] = [];
  function flushGroup(): void {
    if (group.length === 0) return;
    if (group.length === 1 && group[0].isError) result.push(group[0]);
    else {
      result.push({
        id: `command-group:${group[0].id}:${group.length}`,
        runId: group[0].runId,
        sequence: group[0].sequence,
        kind: "command-group",
        timestamp: group[0].timestamp,
        source: "codex",
        title: `已运行 ${group.length} 条命令`,
        children: group,
      });
    }
    group = [];
  }
  for (const block of ordered) {
    if (block.kind === "command" && !block.isError) {
      group.push(block);
      continue;
    }
    flushGroup();
    result.push(block);
  }
  flushGroup();
  return result;
}

function dedupeBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const byKey = new Map<string, AssistantTurnBlock>();
  for (const block of blocks) {
    const key = blockKey(block);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeAssistantBlocks(existing, block) : block);
  }
  return [...byKey.values()];
}

function isMainThreadBlock(block: AssistantTurnBlock): boolean {
  if (block.kind !== "status") return true;
  const normalized = `${block.title ?? ""} ${block.text ?? ""} ${block.status ?? ""}`.toLowerCase();
  if (normalized.includes("codex thread started")) return false;
  if (normalized.includes("codex initialized the thread")) return false;
  if (normalized.includes("codex turn running")) return false;
  if (normalized.includes("codex started processing the turn")) return false;
  if (normalized.includes("codex turn completed")) return false;
  return Boolean(block.isError) || normalized.includes("validation") || normalized.includes("audit") || normalized.includes("failed") || normalized.includes("blocked");
}

function blockTitle(block: AssistantTurnBlock): string {
  if (block.kind === "reasoning-summary") return "工作摘要";
  if (block.kind === "command") return block.isError ? "命令失败" : block.status === "started" ? "正在运行命令" : "命令完成";
  if (block.kind === "file-change") return "文件变更";
  if (block.kind === "tool-result") return "工具返回";
  if (block.kind === "workflow-evidence") return "工作流证据";
  if (block.kind === "error") return "错误";
  if (block.kind === "status") return "运行状态";
  return "本轮过程";
}

function filterLegacyToolEvents(events: Array<Extract<LiveTurnEvent, { kind: "tool" }>>, assistantEvents: AssistantReadableEvent[]): Array<Extract<LiveTurnEvent, { kind: "tool" }>> {
  const commandKeys = new Set(assistantEvents.filter((event) => event.kind === "command" && event.command).map((event) => `${event.command}:${event.phase ?? ""}:${event.exitCode ?? ""}`));
  return events.filter((event) => !event.tool.command || !commandKeys.has(`${event.tool.command}:${event.tool.phase ?? ""}:${event.tool.exitCode ?? ""}`));
}

function AssistantReadableEventCards({ events, defaultOpenProcess = false }: { events: AssistantReadableEvent[]; defaultOpenProcess?: boolean }): ReactElement {
  const displayEvents = dedupeAssistantEvents(events.map(mainThreadAssistantEvent).filter((event): event is AssistantReadableEvent => Boolean(event)));
  if (displayEvents.length === 0) return <></>;
  const processEvents = displayEvents.filter(isFoldableProcessEvent);
  const primaryEvents = displayEvents.filter((event) => !isFoldableProcessEvent(event));
  return (
    <div className="assistant-event-stack">
      {primaryEvents.map((event, index) => <AssistantReadableEventCard event={event} key={`${event.runId}:${event.itemId ?? event.kind}:${event.phase ?? ""}:primary:${index}`} />)}
      {processEvents.length > 0 ? (
        <details className="assistant-process-details" open={defaultOpenProcess}>
          <summary>展开本轮全部过程（{processEvents.length} 条）</summary>
          <div className="assistant-event-stack compact">
            {processEvents.map((event, index) => <AssistantReadableEventCard event={event} key={`${event.runId}:${event.itemId ?? event.kind}:${event.phase ?? ""}:process:${index}`} />)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function isFoldableProcessEvent(event: AssistantReadableEvent): boolean {
  if (event.isError) return false;
  return event.kind === "command" || event.kind === "mcp-tool" || event.kind === "web-search" || event.kind === "tool-result" || event.kind === "plan-update";
}

function mainThreadAssistantEvent(event: AssistantReadableEvent): AssistantReadableEvent | null {
  if (!isMainThreadAssistantEvent(event)) return null;
  if (hasInternalRunMetadata(event.preview)) {
    return {
      ...event,
      title: event.kind === "command" ? readableEventTitle(event) : event.title,
      summary: event.summary ?? "内部执行详情已记录到 Agent Loop，可在原始日志中查看。",
      preview: undefined,
      truncated: false,
    };
  }
  return event;
}

function isMainThreadAssistantEvent(event: AssistantReadableEvent): boolean {
  if (event.kind !== "status") return true;
  const normalized = `${event.title ?? ""} ${event.summary ?? ""} ${event.phase ?? ""}`.toLowerCase();
  if (normalized.includes("codex thread started")) return false;
  if (normalized.includes("codex initialized the thread")) return false;
  if (normalized.includes("codex turn running")) return false;
  if (normalized.includes("codex started processing the turn")) return false;
  if (normalized.includes("codex turn completed")) return false;
  if (normalized.includes("codex completed the turn")) return false;
  return event.isError === true || normalized.includes("validation") || normalized.includes("audit") || normalized.includes("failed") || normalized.includes("blocked");
}

function hasInternalRunMetadata(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  const artifactSignals = ["codex-events.jsonl", "events.jsonl", "stdout.log", "stderr.log", "last-message.md"];
  const hasArtifactSignal = artifactSignals.some((signal) => normalized.includes(signal));
  const hasRunMetadataShape = normalized.includes('"runtime"') && normalized.includes('"artifacts"') && normalized.includes('"promptstack"');
  const hasCodexInvocation = normalized.includes('"command"') && normalized.includes('"codex"') && normalized.includes("--output-last-message");
  return hasRunMetadataShape || hasCodexInvocation || (hasArtifactSignal && normalized.includes('"artifacts"'));
}

function AssistantEvidenceBlocks({ evidence }: { evidence: ThreadStreamEvidence[] }): ReactElement {
  const visible = dedupeEvidence(evidence);
  if (visible.length === 0) return <></>;
  return (
    <div className="assistant-evidence-stack">
      {visible.map((item) => (
        <div className={`assistant-evidence-row ${item.status === "failed" || item.status === "blocked" ? "danger" : ""}`} key={item.id}>
          <div>
            <strong>{evidenceLabel(item)}</strong>
            {item.body ? <p>{item.body}</p> : null}
          </div>
          <span>{humanStatus(item.status ?? item.source)}</span>
          {item.artifact ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
        </div>
      ))}
    </div>
  );
}

function dedupeEvidence(evidence: ThreadStreamEvidence[]): ThreadStreamEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function evidenceLabel(item: ThreadStreamEvidence): string {
  if (item.source === "validation") return `验证：${humanStatus(item.status ?? item.label)}`;
  if (item.source === "audit") return `审查：${humanStatus(item.status ?? item.label)}`;
  if (item.source === "workflow") return "执行结果";
  if (item.source === "decision") return "决策";
  return item.label;
}

function AssistantReadableEventCard({ event }: { event: AssistantReadableEvent }): ReactElement {
  const label = event.title ?? readableEventTitle(event);
  return (
    <div className={`assistant-event-card ${event.isError ? "danger" : ""}`}>
      <div className="assistant-event-header">
        <strong>{label}</strong>
        {event.phase ? <small>{humanStatus(event.phase)}</small> : null}
      </div>
      {event.summary ? <p>{event.summary}</p> : null}
      {event.command ? <code>{event.command}</code> : null}
      {event.cwd ? <small className="event-muted">cwd: {event.cwd}</small> : null}
      {typeof event.exitCode === "number" ? <small className="event-muted">exit {event.exitCode}</small> : null}
      {event.preview ? <pre className="event-preview">{event.preview}</pre> : null}
      {event.artifactRef ? <small className="artifact-link">查看证据：{artifactName(event.artifactRef)}</small> : null}
      {event.truncated ? <small className="event-muted">输出已截断，完整内容在 Agent Loop 原始日志中。</small> : null}
    </div>
  );
}

function dedupeAssistantEvents(events: AssistantReadableEvent[]): AssistantReadableEvent[] {
  const map = new Map<string, AssistantReadableEvent>();
  for (const event of events) {
    map.set(`${event.runId}:${event.itemId ?? event.title ?? event.summary ?? ""}:${event.kind}:${event.phase ?? ""}`, event);
  }
  return Array.from(map.values());
}

function readableEventTitle(event: AssistantReadableEvent): string {
  if (event.kind === "reasoning-summary") return "推理摘要";
  if (event.kind === "command") return event.isError ? "命令失败" : event.phase === "started" ? "正在运行命令" : "命令完成";
  if (event.kind === "file-change") return "文件变更";
  if (event.kind === "mcp-tool") return "MCP 工具调用";
  if (event.kind === "web-search") return "网页搜索";
  if (event.kind === "plan-update") return "计划更新";
  if (event.kind === "tool-result") return "工具返回";
  if (event.kind === "usage") return "用量";
  if (event.kind === "error") return "错误";
  return "运行状态";
}

function ToolEventGroup({ events }: { events: Array<Extract<LiveTurnEvent, { kind: "tool" }>> }): ReactElement {
  const commandEvents = events.filter((event) => event.tool.command);
  const phaseEvents = events.filter((event) => !event.tool.command);
  return (
    <div className="tool-event-stack">
      {commandEvents.length > 1 ? (
        <details className="tool-event-details">
          <summary>已运行 {commandEvents.length} 条命令</summary>
          {commandEvents.map((event, index) => <ToolEventCard event={event.tool} key={`${event.tool.runId}:${index}`} />)}
        </details>
      ) : commandEvents.map((event, index) => <ToolEventCard event={event.tool} key={`${event.tool.runId}:${index}`} />)}
      {phaseEvents.map((event, index) => <ToolEventCard event={event.tool} key={`${event.tool.runId}:phase:${index}`} />)}
    </div>
  );
}

function ToolEventCard({ event }: { event: WorkbenchLiveToolEvent }): ReactElement {
  const label = event.command
    ? event.phase === "started" ? "正在运行命令" : event.isError ? "命令失败" : "命令完成"
    : event.name ? `${event.name} ${humanStatus(event.status ?? event.phase)}` : humanStatus(event.phase);
  return (
    <div className={`tool-event-card ${event.isError ? "danger" : ""}`}>
      <strong>{label}</strong>
      {event.command ? <code>{event.command}</code> : null}
      {typeof event.exitCode === "number" ? <small>exit {event.exitCode}</small> : null}
      {event.outputTail ? <pre className="event-preview">{event.outputTail}</pre> : null}
    </div>
  );
}

function PlanCardView({ planCard, actions, busy, onAction }: { planCard: PlanCard; actions: ThreadStreamAction[]; busy: boolean; onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void> }): ReactElement {
  const [confirmingAction, setConfirmingAction] = useState<ThreadStreamAction | null>(null);
  return (
    <div className="plan-card">
      <h3>{planCard.title}</h3>
      <p>{planCard.summary}</p>
      <ol>
        {planCard.steps.map((step, index) => <li key={`${step.label}-${index}`}><strong>{step.label}</strong><span>{step.description}</span></li>)}
      </ol>
      {planCard.warnings.length > 0 ? <div className="plan-warnings">{planCard.warnings.join(" · ")}</div> : null}
      {actions.length > 0 ? (
        <div className="plan-actions">
          {confirmingAction ? (
            <div className="inline-confirm">
              <span>确认执行 {confirmingAction.label}</span>
              <button className="primary-button" disabled={busy} onClick={() => { setConfirmingAction(null); void onAction(confirmingAction.actionType); }}>确认执行</button>
              <button className="outline-button" disabled={busy} onClick={() => setConfirmingAction(null)}>取消</button>
            </div>
          ) : null}
          {actions.map((action) => (
            <button
              className={action.enabled ? "outline-button" : "outline-button disabled"}
              disabled={busy || !action.enabled}
              key={`${action.actionType}-${action.label}`}
              title={action.disabledReason}
              onClick={() => action.requiresConfirmation ? setConfirmingAction(action) : void onAction(action.actionType)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TopicComposer({
  value,
  onChange,
  mode,
  onModeChange,
  busy,
  disabledReason,
  onSend,
  onRunCode,
  actionRunning,
  canRunCode,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: "chat" | "plan";
  onModeChange: (mode: "chat" | "plan") => void;
  busy: boolean;
  disabledReason?: string;
  onSend: () => Promise<void>;
  onRunCode?: () => Promise<void>;
  actionRunning: string | null;
  canRunCode: boolean;
}): ReactElement {
  const [confirmingCode, setConfirmingCode] = useState(false);
  return (
    <div className="topic-composer" aria-label="Topic composer">
        <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={Boolean(disabledReason)}
        placeholder={disabledReason ?? (mode === "chat" ? "输入问题或下一步需求" : "要求后续变更")}
      />
      <div className="composer-toolbar">
        <div className="mode-switch compact" role="tablist" aria-label="Composer mode">
          <button className={mode === "chat" ? "active" : ""} disabled={Boolean(disabledReason)} onClick={() => onModeChange("chat")}>Chat</button>
          <button className={mode === "plan" ? "active" : ""} disabled={Boolean(disabledReason)} onClick={() => onModeChange("plan")}>Plan</button>
        </div>
        {disabledReason ? <span className="composer-pill">只读</span> : null}
        {canRunCode ? (
          <button
            className="composer-link"
            type="button"
            disabled={busy}
            title="运行 Code workflow"
            onClick={() => setConfirmingCode(true)}
          >
            运行 Code
          </button>
        ) : null}
        {confirmingCode ? (
          <div className="inline-confirm composer-confirm">
            <span>确认运行 Code workflow</span>
            <button className="primary-button" disabled={busy} onClick={() => { setConfirmingCode(false); void onRunCode?.(); }}>确认执行</button>
            <button className="outline-button" disabled={busy} onClick={() => setConfirmingCode(false)}>取消</button>
          </div>
        ) : null}
        <span className="composer-spacer" />
        {actionRunning ? <span className="composer-pill subtle">正在运行：{workflowActionLabel(actionRunning)}</span> : null}
        <button
          className={`composer-send ${actionRunning ? "running" : ""}`}
          disabled={Boolean(disabledReason) || Boolean(actionRunning) || !value.trim()}
          title={actionRunning ? "正在运行，当前版本会让运行完成" : "发送"}
          onClick={() => void onSend()}
        >
          {actionRunning ? <Clock3 size={16} /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

function RunList({ runs, selectedRun, onSelect }: { runs: RunSummary[]; selectedRun?: string; onSelect: (runId: string) => Promise<void> }): ReactElement {
  if (runs.length === 0) return <div className="empty-state">暂无运行记录。</div>;
  return (
    <div className="run-list">
      {runs.map((run) => (
        <button className={`run-row ${run.id === selectedRun ? "selected" : ""}`} key={run.id} onClick={() => void onSelect(run.id)}>
          <Code2 size={16} />
          <span>{runtimeLabel(run.runtime)}</span>
          <small>{humanStatus(run.status)}</small>
        </button>
      ))}
    </div>
  );
}

function RunReplay({ stream, run }: { stream: StreamPacket | null; run?: RunSummary }): ReactElement {
  if (!run) return <div className="dark-panel empty-dark">选择一个 Run 查看回放。</div>;
  const finalOutput = artifactPreview(stream, "lastMessage") ?? artifactPreview(stream, "implementation") ?? "暂无 AI 最终输出";
  const rawPreview = artifactPreview(stream, "codexEvents") ?? artifactPreview(stream, "events") ?? artifactPreview(stream, "stdout") ?? "暂无原始日志";
  const visibleEvents = (stream?.events ?? []).slice(0, 8);
  const readableEvents = readableEventsFromStream(stream, run.id);
  return (
    <div className="dark-panel">
      <div className="replay-header">
        <div><span>{runtimeLabel(run.runtime)}</span><small>{run.id}</small></div>
        <em>{humanStatus(run.status)}</em>
      </div>
      <div className="run-summary-grid">
        <div><span>状态</span><strong>{humanStatus(run.status)}</strong></div>
        <div><span>开始</span><strong>{formatTime(run.startedAt) || "-"}</strong></div>
        <div><span>结束</span><strong>{formatTime(run.finishedAt) || "-"}</strong></div>
      </div>
      <section className="run-readable-section">
        <h3>运行阶段</h3>
        <div className="phase-list">
          {visibleEvents.length === 0 ? <div className="phase-row muted-row"><span>暂无阶段</span><small>等待 run artifact</small></div> : null}
          {visibleEvents.map((event) => (
            <div className="phase-row" key={event.id}>
              <time>{formatTime(event.timestamp)}</time>
              <span>{eventLabel(event.type)}</span>
              <small>{humanStatus(event.status ?? event.label)}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="run-readable-section">
        <h3>模型事件转录</h3>
        {readableEvents.length > 0 ? <AssistantReadableEventCards events={readableEvents} /> : <div className="phase-row muted-row"><span>暂无可读转录</span><small>查看原始日志</small></div>}
      </section>
      <section className="run-readable-section">
        <h3>AI 最终输出</h3>
        <pre className="final-output">{finalOutput}</pre>
      </section>
      <details className="raw-log-details">
        <summary>查看原始日志</summary>
        <pre className="code-preview">{rawPreview}</pre>
      </details>
      <div className="artifact-grid">
        {(stream?.artifacts ?? []).filter((item) => ["events", "stdout", "stderr", "codexEvents", "lastMessage", "diff", "implementation", "validation", "audit"].includes(item.key)).map((artifact) => (
          <div className="artifact-chip" key={artifact.key}>
            <FileText size={15} />
            <span>{artifact.path.split("/").at(-1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function consumeWorkbenchLiveStream(url: string, body: unknown, onEvent: (event: WorkbenchLiveEvent) => void): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  if (!response.body) throw new Error("Live response did not include a readable body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const event = parseWorkbenchSseFrame(frame);
      if (event) onEvent(event);
      index = buffer.indexOf("\n\n");
    }
  }
  const trailing = buffer.trim();
  if (trailing) {
    const event = parseWorkbenchSseFrame(trailing);
    if (event) onEvent(event);
  }
}

function parseWorkbenchSseFrame(frame: string): WorkbenchLiveEvent | null {
  if (!frame.trim() || frame.trim().startsWith(":")) return null;
  let eventName = "";
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trimStart());
  }
  if (!eventName || dataLines.length === 0) return null;
  return { event: eventName, data: JSON.parse(dataLines.join("\n")) } as WorkbenchLiveEvent;
}

function threadItemFromTopicEntry(entry: TopicMessageEntry): ThreadStreamItem | null {
  if (entry.type === "user.message") {
    return { id: `live:${entry.id}`, kind: "user-message", label: "User", timestamp: entry.timestamp, body: entry.text, source: "chat" };
  }
  if (entry.type === "assistant.message") {
    return { id: `live:${entry.id}`, kind: "assistant-turn", label: "AI", timestamp: entry.timestamp, body: entry.text, source: "chat", artifact: entry.artifact, runId: entry.runId, activity: entry.activity, blocks: entry.blocks };
  }
  if (entry.type === "orchestrator.plan") {
    return { id: `live:${entry.id}`, kind: "assistant-turn", label: "Orchestrator plan", timestamp: entry.timestamp, body: entry.text, source: "chat", artifact: entry.artifact, runId: entry.runId, planCard: entry.planCard, activity: entry.activity, blocks: entry.blocks };
  }
  if (entry.type === "workflow.started" || entry.type === "workflow.completed" || entry.type === "workflow.failed") {
    return null;
  }
  if (entry.type === "intake.scan" || entry.type === "intake.iteration") {
    return { id: `live:${entry.id}`, kind: "intake-summary", label: entry.type === "intake.scan" ? "需求分析" : "当前需求理解", timestamp: entry.timestamp, body: entry.text, source: "intake", artifact: entry.artifact, runId: entry.runId, intake: entry.intake };
  }
  if (entry.type === "clarification.request" || entry.type === "clarification.answer" || entry.type === "clarification.skip") {
    return { id: `live:${entry.id}`, kind: "clarification", label: entry.type === "clarification.request" ? "需要确认" : "需求确认", timestamp: entry.timestamp, body: entry.text, source: "intake", runId: entry.runId, status: entry.clarification?.status, clarification: entry.clarification };
  }
  return null;
}

function artifactName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function snapshotForProject(project: ProjectStatus | null | undefined): Snapshot {
  if (!project?.project) return emptySnapshot;
  return {
    ...emptySnapshot,
    project: project.project,
    memory: { harnessReady: project.managed },
    center: { ...emptySnapshot.center, workpad: emptyWorkpad(project.project.name) },
    warnings: project.managed ? [] : ["Project is not managed by Harness yet."],
  };
}

function emptyWorkpad(projectName = "未选择项目"): Workpad {
  return {
    title: "项目 Workpad",
    subtitle: projectName,
    state: "diagnostic",
    intake: {
      goal: "尚未选择可用 Topic。",
      currentUnderstanding: "选择项目并创建 Topic 后，AHO 会在这里汇总目标、进度、证据和下一步。",
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
    evidence: [],
    blockers: [],
    warnings: [],
    nextAction: {
      id: "empty",
      label: "选择或创建 Topic",
      description: "先选择项目中的 Topic，或在输入框里创建新需求。",
      kind: "read-only",
      enabled: false,
      requiresConfirmation: false,
    },
  };
}

function formatTime(value?: string): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function workpadStateLabel(state: Workpad["state"]): string {
  if (state === "active") return "进行中";
  if (state === "readonly") return "只读";
  if (state === "empty") return "待创建";
  return "诊断";
}

function readinessLabel(value: "missing" | "ready" | "unknown"): string {
  if (value === "ready") return "已就绪";
  if (value === "missing") return "缺失";
  return "未知";
}

function statusOrDash(value?: string): string {
  return value ? humanStatus(value) : "-";
}

function stateLabel(state: string): string {
  if (state === "active") return "进行中";
  if (state === "archive") return "已归档";
  if (state === "parking") return "暂停";
  return state;
}

function runtimeLabel(runtime: string): string {
  if (runtime === "codex-readonly") return "AI 只读回复";
  if (runtime === "coder-codex") return "代码实现";
  if (runtime === "validator") return "验证";
  if (runtime === "auditor") return "审查";
  if (runtime === "orchestrator" || runtime === "orchestrator.plan") return "AI 计划";
  if (runtime === "code.run") return "代码工作流";
  if (runtime === "chat.ask") return "AI 回复";
  return runtime;
}

function humanStatus(status: string): string {
  if (status === "created") return "已创建";
  if (status === "preparing") return "正在准备";
  if (status === "context-prepared") return "上下文已准备";
  if (status === "running") return "运行中";
  if (status === "streaming") return "流式输出中";
  if (status === "completed") return "已完成";
  if (status === "passed") return "已通过";
  if (status === "approved") return "已批准";
  if (status === "approved-with-notes") return "带备注批准";
  if (status === "failed") return "失败";
  if (status === "started") return "已开始";
  if (status === "stderr") return "错误输出";
  return status;
}

function eventLabel(type: string): string {
  if (type === "run.created") return "创建运行";
  if (type === "context.prepared") return "准备上下文";
  if (type === "codex.started" || type === "coder.started") return "启动 Codex";
  if (type === "codex.exited" || type === "coder.exited") return "Codex 结束";
  if (type === "validation.started") return "开始验证";
  if (type === "validation.command.started") return "运行验证命令";
  if (type === "validation.command.exited") return "验证命令结束";
  if (type === "audit.started") return "开始审查";
  if (type === "audit.completed") return "审查完成";
  if (type === "diff.collected") return "收集 diff";
  if (type === "run.completed") return "运行完成";
  if (type === "run.failed") return "运行失败";
  return type;
}

function formatUsage(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const pieces = [
    input === undefined ? null : `${input} input tokens`,
    output === undefined ? null : `${output} output tokens`,
  ].filter((item): item is string => Boolean(item));
  return pieces.length > 0 ? `用量：${pieces.join(" · ")}` : "用量已记录";
}

function threadLabel(item: ThreadStreamItem): string {
  if (item.kind === "user-message") return "用户消息";
  if (item.kind === "assistant-turn") return item.source === "workflow" ? "执行结果" : "AI";
  if (item.kind === "assistant-message") return "AI 回复";
  if (item.kind === "plan-card") return "AI 计划";
  if (item.kind === "workflow-summary") return "工作流摘要";
  if (item.source === "validation") return "验证证据";
  if (item.source === "audit") return "审查证据";
  if (item.kind === "decision") return "决策记录";
  if (item.kind === "change-state") return "需求意图";
  return item.label;
}

function threadTone(item: ThreadStreamItem): string {
  if (item.status === "failed" || item.status === "blocked" || item.label.toLowerCase().includes("failed")) return "danger";
  if (item.kind === "decision") return "action";
  if (item.kind === "plan-card" || item.label.toLowerCase().includes("spec") || item.label.toLowerCase().includes("plan")) return "coral";
  return "success";
}

function threadIcon(item: ThreadStreamItem): ReactElement {
  if (item.kind === "user-message" || item.kind === "change-state") return <UserRound size={16} />;
  if (item.kind === "assistant-turn" || item.kind === "assistant-message" || item.kind === "plan-card") return <FileText size={16} />;
  if (item.source === "workflow") return <Code2 size={16} />;
  if (item.source === "decision") return <Upload size={16} />;
  if (item.source === "audit") return <ShieldCheck size={16} />;
  return <CircleCheck size={16} />;
}

function approvalKind(kind: string): string {
  if (kind.includes("audit")) return "审查";
  if (kind.includes("apply")) return "应用";
  if (kind.includes("close")) return "关闭";
  if (kind.includes("spec")) return "Spec";
  if (kind.includes("plan")) return "计划";
  return "确认";
}

function workflowActionLabel(actionType: string | undefined): string {
  if (actionType === "change.spec.propose") return "Spec proposal";
  if (actionType === "change.plan.propose") return "Plan/Tasks proposal";
  if (actionType === "code.run") return "Code workflow";
  if (actionType === "chat.ask") return "Chat";
  return actionType ?? "Workflow";
}

function artifactPreview(stream: StreamPacket | null, key: string): string | null {
  const artifact = stream?.artifacts.find((item) => item.key === key);
  return artifact?.preview ?? artifact?.tail ?? null;
}

function readableEventsFromStream(stream: StreamPacket | null, runId: string): AssistantReadableEvent[] {
  const events: AssistantReadableEvent[] = [];
  const codexPreview = artifactPreview(stream, "codexEvents");
  if (codexPreview) {
    for (const line of codexPreview.split(/\r?\n/)) {
      const parsed = parseJsonLine(line);
      if (!parsed) continue;
      const event = readableEventFromCodexArtifact(parsed, runId);
      if (event) events.push(event);
    }
  }
  for (const event of stream?.events ?? []) {
    if (event.type.startsWith("validation.")) {
      events.push({
        runId,
        itemId: event.id,
        kind: "status",
        phase: event.status ?? event.label,
        title: event.type === "validation.command.exited" ? "Validation command" : "Validation",
        summary: eventLabel(event.type),
        isError: event.status === "failed",
      });
    }
    if (event.type.startsWith("audit.")) {
      events.push({
        runId,
        itemId: event.id,
        kind: "status",
        phase: event.status ?? event.label,
        title: "Audit",
        summary: eventLabel(event.type),
        isError: event.status === "failed",
      });
    }
  }
  return dedupeAssistantEvents(events).slice(-12);
}

function readableEventFromCodexArtifact(raw: Record<string, unknown>, runId: string): AssistantReadableEvent | null {
  if ((raw.type === "item.started" || raw.type === "item.completed") && isRecord(raw.item)) {
    const item = raw.item;
    const itemType = normalizeCodexItemType(item.type);
    const phase = raw.type === "item.started" ? "started" : "completed";
    const itemId = typeof item.id === "string" ? item.id : undefined;
    if (itemType === "commandexecution") {
      const output = stringField(item, "aggregated_output", "aggregatedOutput", "output");
      return {
        runId,
        itemId,
        kind: "command",
        phase,
        title: phase === "started" ? "Command started" : "Command completed",
        summary: stringField(item, "command") ?? "Command execution",
        command: stringField(item, "command"),
        cwd: stringField(item, "cwd"),
        exitCode: numberField(item, "exit_code", "exitCode"),
        preview: output ? truncatePreview(output, 900) : undefined,
        truncated: output ? output.length > 900 : undefined,
        isError: numberField(item, "exit_code", "exitCode") !== undefined ? numberField(item, "exit_code", "exitCode") !== 0 : item.status === "failed",
      };
    }
    if (itemType === "reasoning") {
      const summary = stringField(item, "summary_text", "summaryText", "thinking_summary", "thinkingSummary");
      if (!summary) return null;
      return { runId, itemId, kind: "reasoning-summary", phase, title: "Reasoning summary", preview: truncatePreview(summary, 900) };
    }
    if (itemType === "filechange") {
      return { runId, itemId, kind: "file-change", phase, title: "File change", summary: stringField(item, "path", "file_path", "filePath") ?? "File changes recorded." };
    }
    if (itemType === "mcptoolcall" || itemType === "dynamictoolcall" || itemType === "collabtoolcall") {
      return { runId, itemId, kind: "mcp-tool", phase, title: stringField(item, "tool", "name") ?? "Tool call", summary: stringField(item, "server") };
    }
    if (itemType === "websearch") {
      return { runId, itemId, kind: "web-search", phase, title: "Web search", summary: stringField(item, "query") };
    }
  }
  if (raw.type === "turn.completed" && isRecord(raw.usage)) {
    return { runId, kind: "usage", phase: "completed", title: "Usage recorded", summary: formatUsage(raw.usage) };
  }
  if (raw.type === "error") {
    return { runId, kind: "error", phase: "failed", title: "Codex error", summary: stringField(raw, "message", "error"), isError: true };
  }
  return null;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeCodexItemType(value: unknown): string {
  return typeof value === "string" ? value.replace(/[_\-/]/g, "").toLowerCase() : "";
}

function stringField(object: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function numberField(object: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

function truncatePreview(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+$/u, "")}\n[truncated; see raw log]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
