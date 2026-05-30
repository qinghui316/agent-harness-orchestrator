import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Code2,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Search,
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
    workpads?: WorkpadSummary[];
    repo?: { branch?: string; dirty?: boolean; path?: string; git?: boolean };
  };
  center: {
    selectedTopic: TopicDetail | null;
    workpad: Workpad;
    agentLoop: { runs: RunSummary[] };
    thread: { items: ThreadStreamItem[] };
  };
  right: { approvals: Approval[]; decisions: Decision[]; decisionInspector: DecisionInspector; confirmationQueue: ConfirmationQueue };
  harnessGaps: Array<{ id: string; status: string; summary: string }>;
  warnings: string[];
};

type Topic = { id: string; title: string; state: string; updatedAt?: string };
type WorkpadRuntimeStatus = "active" | "running" | "queued" | "blocked" | "waiting-decision" | "archived" | "readonly";
type WorkpadUserStatus = "processing" | "waiting-confirmation" | "needs-rework" | "later" | "completed" | "abandoned";
type ConversationLifecycle = "active" | "running" | "waiting-user" | "archived-readonly" | "abandoned";
type WorkpadSummary = {
  id: string;
  title: string;
  state: string;
  runtimeStatus: WorkpadRuntimeStatus;
  userStatus?: WorkpadUserStatus;
  userStatusLabel?: string;
  conversationLifecycle?: ConversationLifecycle;
  linkedFromChangeId?: string;
  selected: boolean;
  waitingDecisionCount: number;
  latestRunStatus?: string;
  latestRunId?: string;
  queueStatus?: string;
  blocker?: string;
  updatedAt?: string;
};
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
  taskIds?: string[];
  taskRunId?: string;
  disabledReason?: string;
};
type DecisionActionKind = "approval" | "workflow-action" | "feedback" | "evidence" | "abandon" | "none";
type WorkbenchTaskEvidence = {
  id: string;
  label: string;
  source: "run" | "validation" | "audit";
  status?: string;
  runId?: string;
  worktreeId?: string;
  artifact?: string;
  timestamp?: string;
};
type WorkbenchTaskNextAction = {
  id: string;
  label: string;
  actionType?: ThreadStreamAction["actionType"];
  taskIds?: string[];
  taskRunId?: string;
  enabled: boolean;
  requiresConfirmation: boolean;
  disabledReason?: string;
};
type WorkbenchTaskRunSummary = {
  id: string;
  status: string;
  attempt: number;
  roleId: string;
  runId?: string;
  worktreeId?: string;
  blockedReason?: string;
  failureReason?: string;
  officialReworkAttempt?: number;
  autoReworkAvailable?: boolean;
  reworkBudget?: number;
};
type WorkbenchWorkerLeaseSummary = {
  id: string;
  status: string;
  workerId: string;
  claimedAt: string;
  expiresAt: string;
};
type WorkbenchTaskNode = {
  taskId: string;
  title: string;
  acIds: string[];
  checked: boolean;
  status: "planned" | "running" | "evidence-ready" | "blocked" | "checked";
  taskRun?: WorkbenchTaskRunSummary;
  workerLease?: WorkbenchWorkerLeaseSummary;
  latestEvidence: WorkbenchTaskEvidence[];
  blockers: string[];
  nextAction: WorkbenchTaskNextAction;
  autoRework?: { available: boolean; attempt: number; budget: number; reason: string; failureClassification: string };
};
type WorkbenchTaskGraph = {
  source: "accepted-tasks" | "missing";
  nodes: WorkbenchTaskNode[];
  changeLevelEvidence: WorkbenchTaskEvidence[];
  warnings: string[];
};
type WorkbenchCodingPackage = {
  id: string;
  title: string;
  summary: string;
  taskIds: string[];
  completedTaskIds: string[];
  acIds: string[];
  coveredAcIds: string[];
  missingEvidenceAcIds: string[];
  recommendedRoleId: string;
  executionUnit: "single-agent" | "future-parallel-candidate";
  assignmentStatus: "suggested" | "not-assigned";
  splitReadiness: "likely-single" | "candidate" | "unknown";
  splitRationale: string;
  mergeRisk: string;
  status: "missing" | "suggested" | "blocked" | "evidence-ready" | "readonly";
};
type WorkbenchTaskQueueSummary = {
  id: string;
  status: string;
  currentTaskId?: string;
  totalCount: number;
  completedCount: number;
  blockedReason?: string;
  failureReason?: string;
  pausedReason?: string;
  nextAction?: WorkbenchTaskNextAction;
  items: Array<{
    id: string;
    taskId: string;
    order: number;
    status: string;
    taskRunId?: string;
    blockedReason?: string;
    failureReason?: string;
  }>;
};
type Workpad = {
  title: string;
  subtitle: string;
  state: "diagnostic" | "empty" | "active" | "readonly";
  userStatus?: WorkpadUserStatus;
  userStatusLabel?: string;
  conversationId?: string;
  demandId?: string;
  boundChangeId?: string;
  conversationLifecycle?: ConversationLifecycle;
  linkedFromChangeId?: string;
  pendingFeedback?: Array<{ id: string; text: string; timestamp: string; runId?: string; status: "pending-next-turn" | "applied" }>;
  coderSelfTestSummary?: string;
  officialValidationResult?: string;
  officialAuditResult?: string;
  officialReworkAttempt?: number;
  reworkBudget?: number;
  failureClassification?: string;
  requiresUserInputReason?: string;
  scopedFeedbackTarget?: Record<string, unknown>;
  postArchiveEvolutionCandidate?: { changeId: string; status: "candidate"; sources: string[]; summary: string };
  planningDraft?: PlanningArtifactBundle;
  planningArtifactBundle?: PlanningArtifactBundle;
  rolePipeline?: {
    stage: "planning" | "coding" | "validation" | "audit" | "rework" | "done" | "needs-user-input";
    status: "draft" | "running" | "completed" | "needs-user-input" | "stopped";
    runs: Array<{ roleId: string; status: string; runId?: string; summary: string; artifact?: string }>;
    agentTasks: Array<{
      id: string;
      roleId: string;
      kind: "foreground" | "background";
      status: string;
      changeId?: string;
      runId?: string;
      summary: string;
      resultSummary?: string;
      evidenceRefs: string[];
      createdAt: string;
      completedAt?: string;
    }>;
    reworkUsed: number;
    reworkBudget: number;
  };
  resultReview?: {
    status: "not-ready" | "ready-to-apply" | "needs-rework" | "applied-clean" | "applied-source-dirty";
    title: string;
    summary: string;
    worktreeId?: string;
    changedFiles: string[];
    diffStat?: string;
    validation?: { id: string; status: string; runId: string };
    audit?: { id: string; status: string; runId: string; findingCount: number; notes: string[]; artifact?: string };
    applyReadiness: { ready: boolean; kind?: string; label: string; message?: string; blockingIssues: string[]; warnings: string[] };
    evidence: Array<{ id: string; label: string; source: string; status?: string; artifact?: string; timestamp?: string }>;
  };
  maintenance?: {
    ledgerCount: number;
    closeoutCount?: number;
    latestReviewWindowId?: string;
    unreviewedTerminalCount?: number;
    latest?: { id: string; eventType: string; changeId?: string; summary: string; severity: string; createdAt: string };
    status: "idle" | "collecting" | "review-ready" | "reviewed";
    note: string;
  };
  runControlState?: { canStop: boolean; stopActionType?: ThreadStreamAction["actionType"]; pendingFeedbackCount: number; explanation: string };
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
  codingPackages: WorkbenchCodingPackage[];
  taskGraph: WorkbenchTaskGraph;
  taskQueue?: WorkbenchTaskQueueSummary;
  evidence: Array<{ id: string; label: string; source: string; status?: string; artifact?: string; timestamp?: string }>;
  blockers: string[];
  warnings: string[];
  nextAction: WorkpadNextAction;
  background?: {
    totalCount: number;
    runningCount: number;
    queuedCount: number;
    blockedCount: number;
    waitingDecisionCount: number;
    items: WorkpadSummary[];
  };
  memoryIsolation?: {
    projectStableNamespace: "project/stable";
    currentChangeNamespace?: string;
    runNamespaces: string[];
    agentSessionNamespace: "agent/{roleId}/session/{sessionId}";
    relatedWorkpads: Array<{ changeId: string; title: string; status: WorkpadRuntimeStatus; factBoundary: "summary-only" | "local-evidence-only" }>;
    stableFactSources: string[];
    writeBoundaries: string[];
    warnings: string[];
  };
};
type PlanningArtifactBundle = {
  id: string;
  status?: "draft" | "confirmed";
  goal: string;
  constraints: string[];
  acceptanceCriteria: string[];
  design: string;
  tasks: Array<{ id: string; title: string; acIds: string[] }>;
  risks: string[];
  openQuestions: string[];
  artifact?: string;
  updatedAt?: string;
};
type PlanCard = {
  title: string;
  summary: string;
  steps: Array<{ label: string; description: string; actionId?: string; requiresConfirmation?: boolean }>;
  warnings: string[];
};
type ThreadEvent = { id: string; type: string; label: string; timestamp?: string; status?: string; runId?: string; planCard?: PlanCard };
type ThreadStreamAction = {
  actionType: "change.spec.propose" | "change.plan.propose" | "planning.generate" | "planning.revise" | "planning.confirm-execution" | "orchestrator.evaluate" | "orchestrator.pump" | "demand.worker.enqueue" | "demand.worker.claim" | "demand.worker.start-next" | "demand.worker.start-available" | "demand.worker.reconcile" | "demand.worker.release" | "role.pipeline.start" | "role.pipeline.stop" | "role.pipeline.continue" | "role.pipeline.reconcile" | "conversation.steer" | "conversation.interrupt" | "conversation.continue" | "result.refresh-rework" | "result.revalidate" | "result.reaudit" | "result.refresh-status" | "apply-check.run" | "landing.prepare" | "landing.review" | "landing.refresh" | "landing-queue.prepare" | "landing-queue.refresh" | "landing-queue.merge-next" | "landing-queue.skip" | "landing-queue.remove-stale" | "pr-draft.prepare" | "pr-draft.create" | "pr-draft.refresh" | "pr-feedback.refresh" | "pr-feedback.evaluate" | "pr-feedback.rework" | "pr-feedback.update-draft" | "pr-review.prepare" | "pr-review.submit" | "pr-review.refresh" | "pr-review.feedback-refresh" | "pr-review.feedback-evaluate" | "pr-review.rework" | "pr-review.reply-prepare" | "pr-review.reply-submit" | "pr-review.thread-resolve" | "remote-landing.prepare" | "remote-landing.merge" | "remote-landing.refresh" | "post-merge.prepare" | "post-merge.refresh" | "post-merge.sync-local.prepare" | "post-merge.sync-local.run" | "post-merge.cleanup-branch.prepare" | "post-merge.cleanup-branch.run" | "code.run" | "task.run.start" | "task.run.retry" | "task.queue.start" | "task.queue.reconcile" | "intake.scan" | "intake.reanalyze" | "clarification.answer" | "clarification.skip";
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
type DecisionAction = {
  id: string;
  label: string;
  kind: DecisionActionKind;
  enabled: boolean;
  requiresConfirmation: boolean;
  approvalId?: string;
  action?: { actionId: string; label: string; command: string; args: string[]; mutates: boolean; requiresConfirmation: boolean };
  actionType?: ThreadStreamAction["actionType"];
  taskIds?: string[];
  taskRunId?: string;
  worktreeId?: string;
  worktreeIds?: string[];
  applyCheckId?: string;
  landingPackageId?: string;
  remoteLandingResultId?: string;
  artifact?: string;
  disabledReason?: string;
};
type DecisionContext = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  userStatus?: WorkpadUserStatus;
  resultSummary?: string;
  recommendation?: string;
  explanation?: string;
  severity: "info" | "warning" | "blocking";
  changeId?: string;
  taskId?: string;
  taskRunId?: string;
  queueRunId?: string;
  runId?: string;
  targetId?: string;
  artifact?: string;
  timestamp?: string;
  actions: DecisionAction[];
  rework?: { mode: "inline-feedback" | "record-feedback"; label: string; placeholder: string };
};
type DecisionInspector = {
  primary: DecisionContext | null;
  related: DecisionContext[];
  history: DecisionContext[];
  selectedContextId?: string;
};
type ConfirmationQueueItem = {
  id: string;
  kind: string;
  projectId?: string | null;
  conversationId?: string;
  changeId?: string;
  resultId?: string;
  runId?: string;
  worktreeId?: string;
  applyCheckId?: string;
  summary: string;
  whyNeedsConfirmation: string;
  confirmEffect: string;
  riskSummary: string;
  evidenceRefs: string[];
  actions: DecisionAction[];
  primary: boolean;
  status?: string;
};
type ConfirmationQueue = {
  primary: ConfirmationQueueItem | null;
  current: ConfirmationQueueItem[];
  otherDemands: ConfirmationQueueItem[];
  maintenance: ConfirmationQueueItem[];
  history: ConfirmationQueueItem[];
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
  | { event: "run.started"; data: { runId: string; changeId: string; actionType?: string; runtime?: string; taskIds?: string[] } }
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
  left: { topics: [], workpads: [] },
  center: { selectedTopic: null, workpad: emptyWorkpad(), agentLoop: { runs: [] }, thread: { items: [] } },
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
  const [tab, setTab] = useState<"workpad" | "thread" | "loop">("workpad");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectSnapshots, setProjectSnapshots] = useState<Record<string, Snapshot>>({});
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [projectMenuMode, setProjectMenuMode] = useState<"closed" | "add" | "new">("closed");
  const [projectDetailsId, setProjectDetailsId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selectedDecisionContextId, setSelectedDecisionContextId] = useState<string | null>(null);
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
      setExpandedProjects(new Set([directProject]));
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
    setProjectSnapshots((current) => ({ ...current, [projectId]: next }));
    const runId = selectedRun ?? next.center.agentLoop.runs[0]?.id ?? null;
    setSelectedRun(runId);
    if (runId) setStream(await fetchJson<StreamPacket>(`/api/projects/${encodeURIComponent(projectId)}/workbench/stream/${encodeURIComponent(runId)}`));
  }

  useEffect(() => {
    loadApp().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

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
    setTab("workpad");
    const nextSnapshot = {
      ...baseSnapshot,
      center: {
        selectedTopic: null,
        workpad: emptyWorkpad(baseSnapshot.project?.name ?? status.project?.name ?? "当前项目"),
        thread: { items: [] },
        agentLoop: { runs: [] },
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
      const result = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.action, confirm: true }),
      });
      if (!result.ok) throw new Error(await result.text());
      setConfirming(null);
      await refresh();
      return;
    }
    if (action.kind === "workflow-action" && action.actionType) {
        await runWorkflowAction(action.actionType, { taskIds: action.taskIds, taskRunId: action.taskRunId, worktreeId: action.worktreeId ?? context.targetId, worktreeIds: action.worktreeIds, applyCheckId: action.applyCheckId, landingPackageId: action.landingPackageId, remoteLandingResultId: action.remoteLandingResultId });
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
      setTab("loop");
    }
  }

  async function requestDecisionFeedback(context: DecisionContext, action: DecisionAction, feedback: string): Promise<void> {
    if (!selectedProjectId || !feedback.trim()) return;
    const result = await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: action.action,
        feedback: feedback.trim(),
        feedbackContext: {
          contextId: context.id,
          approvalId: action.approvalId,
          changeId: context.changeId,
          targetId: context.targetId,
          runId: context.runId,
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
    if (composerMode === "chat" && tab === "workpad" && (activeWorkpad.nextAction.actionType === "planning.generate" || activeWorkpad.nextAction.actionType === "planning.revise")) {
      await runWorkflowAction(activeWorkpad.nextAction.actionType, { prompt: message });
      return;
    }
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
    if (!actionType.startsWith("intake.") && !actionType.startsWith("clarification.") && actionType !== "task.queue.reconcile") setTab("thread");
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
        />
      </aside>

      <main className="workspace">
        {!selectedProjectId ? (
          <EmptyWorkbench title="选择一个项目开始" description="从左侧添加已有项目或新建空仓库。AHO 会把项目、记忆、需求对话和确认动作组织在这个工作台里。" />
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
                <span>{snapshot.project?.name ?? "project"} · {stateLabel(activeTopic.state)} · 验收 {activeTopic.acCount ?? 0} · 任务 {activeTopic.taskCount ?? 0}</span>
              </div>
              <div className="topic-actions">
                <button className="secondary-button" onClick={() => void refresh()}><Settings size={15} />刷新状态</button>
              </div>
            </header>

            <div className="tabs">
              <button className={tab === "workpad" ? "active" : ""} onClick={() => setTab("workpad")}>需求</button>
              <button className={tab === "thread" ? "active" : ""} onClick={() => setTab("thread")}>对话</button>
              <button className={tab === "loop" ? "active" : ""} onClick={() => setTab("loop")}>执行证据</button>
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
                        onSelectDecisionContext={setSelectedDecisionContextId}
                      />
                    </div>
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
                      onRunCode={() => runWorkflowAction("code.run")}
                      actionRunning={actionRunning}
                      canRunCode={activeTopic.state === "active" && (activeTopic.taskCount ?? 0) > 0}
                      currentWorkpadStatus={activeWorkpad.conversationLifecycle === "running" || activeWorkpad.runControlState?.canStop ? "running" : currentWorkpadSummary(snapshot, activeTopic)?.runtimeStatus}
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
                      <ThreadStreamView
                        items={threadItems}
                        liveTurns={liveTurns}
                        busy={actionRunning !== null}
                        onAction={runWorkflowAction}
                        onSelectDecisionContext={setSelectedDecisionContextId}
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
                      onRunCode={() => runWorkflowAction("code.run")}
                      actionRunning={actionRunning}
                      canRunCode={activeTopic.state === "active" && (activeTopic.taskCount ?? 0) > 0}
                      currentWorkpadStatus={activeWorkpad.conversationLifecycle === "running" || activeWorkpad.runControlState?.canStop ? "running" : currentWorkpadSummary(snapshot, activeTopic)?.runtimeStatus}
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
        <DecisionInspectorPane
          inspector={activeDecisionInspector}
          confirmationQueue={activeConfirmationQueue}
          confirming={confirming}
          error={error}
          onConfirmingChange={setConfirming}
          onExecuteAction={executeDecisionAction}
          onFeedback={requestDecisionFeedback}
          onSelectContext={setSelectedDecisionContextId}
        />
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

function ProjectConversationSidebar({
  appStatus,
  projects,
  selectedProjectId,
  selectedTopicId,
  snapshots,
  snapshot,
  search,
  onSearch,
  expandedProjects,
  projectMenuMode,
  projectDetailsId,
  onProjectMenuMode,
  onProjectDetails,
  onNewConversation,
  onOpenProject,
  onToggleProject,
  onChooseConversation,
  onRefresh,
}: {
  appStatus: AppStatus | null;
  projects: ProjectStatus[];
  selectedProjectId: string | null;
  selectedTopicId: string | null;
  snapshots: Record<string, Snapshot>;
  snapshot: Snapshot;
  search: string;
  onSearch: (value: string) => void;
  expandedProjects: Set<string>;
  projectMenuMode: "closed" | "add" | "new";
  projectDetailsId: string | null;
  onProjectMenuMode: (mode: "closed" | "add" | "new") => void;
  onProjectDetails: (projectId: string | null) => void;
  onNewConversation: (projectId?: string) => Promise<void>;
  onOpenProject: (projectId: string) => Promise<void>;
  onToggleProject: (projectId: string) => Promise<void>;
  onChooseConversation: (projectId: string, conversationId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const visibleProjects = appStatus?.mode === "project" && appStatus.directProjectId
    ? projects.filter((item) => item.project?.id === appStatus.directProjectId)
    : projects;
  const normalizedSearch = search.trim().toLowerCase();
  async function afterProjectAdded(projectId?: string): Promise<void> {
    await onRefresh();
    if (projectId) await onOpenProject(projectId);
    onProjectMenuMode("closed");
  }
  return (
    <div className="codex-sidebar">
      <nav className="global-nav" aria-label="全局入口">
        <label className="sidebar-search">
          <Search size={15} />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索" aria-label="搜索已加载对话" />
        </label>
      </nav>

      <section className="project-tree" aria-label="项目">
        <div className="project-tree-header">
          <span className="section-label">项目</span>
          <button className="icon-button compact-icon" aria-label="项目菜单" onClick={() => onProjectMenuMode(projectMenuMode === "closed" ? "add" : "closed")}><FolderPlus size={15} /></button>
        </div>
        {projectMenuMode !== "closed" ? (
          <div className="project-menu-popover">
            <button className={`project-menu-item ${projectMenuMode === "new" ? "selected" : ""}`} onClick={() => onProjectMenuMode("new")}><FolderPlus size={15} />新建空项目</button>
            <button className={`project-menu-item ${projectMenuMode === "add" ? "selected" : ""}`} onClick={() => onProjectMenuMode("add")}><Folder size={15} />使用现有文件夹</button>
            {projectMenuMode === "add" ? <ProjectAddForm onDone={afterProjectAdded} /> : null}
            {projectMenuMode === "new" ? <ProjectCreateForm onDone={afterProjectAdded} /> : null}
          </div>
        ) : null}

        <div className="project-folder-list">
          {visibleProjects.length === 0 ? <div className="empty-state sidebar-empty">还没有注册项目。</div> : null}
          {visibleProjects.map((item) => {
            const projectId = item.project?.id ?? item.path;
            const projectName = item.project?.name ?? item.path;
            const selected = item.project?.id === selectedProjectId;
            const expanded = selected || expandedProjects.has(projectId);
            const projectSnapshot = item.project?.id === selectedProjectId ? snapshot : item.project?.id ? snapshots[item.project.id] : undefined;
            const conversations = conversationsForSidebar(projectSnapshot, selectedTopicId);
            const filteredConversations = normalizedSearch
              ? conversations.filter((conversation) => conversation.title.toLowerCase().includes(normalizedSearch) || conversation.status.toLowerCase().includes(normalizedSearch))
              : conversations;
            const showProject = !normalizedSearch || projectName.toLowerCase().includes(normalizedSearch) || filteredConversations.length > 0;
            if (!showProject) return null;
            return (
              <div className="project-folder" key={projectId}>
                <div className={`project-folder-row ${selected ? "selected" : ""}`}>
                  <button className="project-folder-toggle" aria-label={expanded ? "收起项目" : "展开项目"} onClick={() => item.project ? void onToggleProject(item.project.id) : undefined}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <button className="project-folder-main" onClick={() => item.project ? void onOpenProject(item.project.id) : undefined}>
                    <Folder size={16} />
                    <span>{projectName}</span>
                    {item.managed ? null : <small>未初始化</small>}
                  </button>
                  {item.project && item.managed ? (
                    <button
                      className="project-folder-new"
                      aria-label={`在 ${projectName} 中开始新对话`}
                      title={`在 ${projectName} 中开始新对话`}
                      onClick={() => void onNewConversation(item.project?.id)}
                    >
                      <FileText size={15} />
                    </button>
                  ) : null}
                  <button className="project-folder-more" aria-label="项目详情" onClick={() => onProjectDetails(projectDetailsId === projectId ? null : projectId)}>
                    <MoreHorizontal size={15} />
                  </button>
                </div>
                {projectDetailsId === projectId ? (
                  <ProjectDetailsPanel
                    project={item}
                    snapshot={projectSnapshot}
                    selected={selected}
                    onOpen={() => item.project ? void onOpenProject(item.project.id) : undefined}
                    onRefresh={() => void onRefresh()}
                  />
                ) : null}
                {expanded ? (
                  <div className="conversation-list">
                    {item.managed && !projectSnapshot ? <div className="conversation-placeholder">展开后加载对话。</div> : null}
                    {!item.managed ? <div className="conversation-placeholder">选择项目后初始化 Harness。</div> : null}
                    {filteredConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        className={`conversation-row ${conversation.selected ? "selected" : ""}`}
                        onClick={() => item.project ? void onChooseConversation(item.project.id, conversation.id) : undefined}
                      >
                        <span>{userFacingText(conversation.title)}</span>
                        <small>{conversation.status}{conversation.waitingDecisionCount > 0 ? ` · ${conversation.waitingDecisionCount} 个待确认` : ""}</small>
                        {conversation.blocker ? <em>{userFacingText(conversation.blocker)}</em> : null}
                      </button>
                    ))}
                    {item.managed && projectSnapshot && filteredConversations.length === 0 ? <div className="conversation-placeholder">暂无已加载对话。</div> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="sidebar-settings">
        <button className="global-nav-item settings-entry"><Settings size={16} />设置</button>
      </div>
    </div>
  );
}

type SidebarConversation = {
  id: string;
  title: string;
  status: string;
  selected: boolean;
  waitingDecisionCount: number;
  blocker?: string;
};

function conversationsForSidebar(snapshot: Snapshot | undefined, selectedTopicId: string | null): SidebarConversation[] {
  if (!snapshot) return [];
  return (snapshot.left.workpads ?? snapshot.left.topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    state: topic.state,
    runtimeStatus: topic.state === "archive" ? "archived" : "active",
    userStatus: topic.state === "archive" ? "completed" : "waiting-confirmation",
    userStatusLabel: topic.state === "archive" ? "已完成" : "等你确认",
    selected: selectedTopicId === topic.id,
    waitingDecisionCount: 0,
    blocker: undefined,
  } satisfies WorkpadSummary))).map((workpad) => ({
    id: workpad.id,
    title: workpad.title,
    status: workpad.userStatusLabel ?? workpadStatusLabel(workpad.runtimeStatus),
    selected: selectedTopicId === workpad.id || workpad.selected,
    waitingDecisionCount: workpad.waitingDecisionCount,
    blocker: workpad.blocker,
  }));
}

function ProjectDetailsPanel({ project, snapshot, selected, onOpen, onRefresh }: { project: ProjectStatus; snapshot: Snapshot | undefined; selected: boolean; onOpen: () => void; onRefresh: () => void }): ReactElement {
  return (
    <div className="project-details-panel">
      <InfoRow label="仓库" value={snapshot?.left.repo?.branch ?? (project.isGitRepo ? "已初始化" : "未检测到")} />
      <InfoRow label="记忆" value={snapshot?.memory.memoryMode ?? (project.managed ? "已配置" : "未初始化")} />
      <InfoRow label="状态" value={project.managed ? "Harness 就绪" : "未初始化"} />
      {!selected ? <button className="project-detail-action" onClick={onOpen}>{project.managed ? "打开项目" : "初始化 Harness"}</button> : null}
      <button className="project-detail-action" onClick={onRefresh}>刷新项目</button>
    </div>
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

function currentWorkpadSummary(snapshot: Snapshot, topic: TopicDetail | null): WorkpadSummary | undefined {
  if (!topic) return undefined;
  return snapshot.left.workpads?.find((item) => item.id === topic.id);
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
      <div className="breadcrumb">{snapshot.project?.name ?? "project"} / 需求对话</div>
      <div className="topic-empty-content">
        <p className="eyebrow">本地工作台</p>
        <h1>暂无需求对话</h1>
        <p>输入一个需求或问题来创建第一个需求对话。AHO 会先生成方案草案，而不是直接写代码。</p>
        <div className="empty-composer">
          <textarea value={composerText} onChange={(event) => setComposerText(event.target.value)} placeholder="例如：帮我新增会员满 100 元 9 折，并补测试。" />
          <button className="primary-button" disabled={busy || !composerText.trim()} onClick={() => void onCreate()}>创建需求对话</button>
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

function DecisionInspectorPane({
  inspector,
  confirmationQueue,
  confirming,
  error,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
  onSelectContext,
}: {
  inspector: DecisionInspector;
  confirmationQueue: ConfirmationQueue;
  confirming: string | null;
  error: string | null;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
  onSelectContext: (id: string | null) => void;
}): ReactElement {
  const primaryQueueItem = confirmationQueue.primary;
  return (
    <>
      <div className="approval-header">
        <h2>需要你确认</h2>
        <span>{primaryQueueItem ? 1 : 0}</span>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      {!primaryQueueItem ? (
        <div className="approval-empty">
          <h3>暂无需要确认</h3>
          <p>执行过程、证据和后台维护不会堆在这里；只有需要你做决定的事项会出现。</p>
        </div>
      ) : (
        <ConfirmationQueueCard
          item={primaryQueueItem}
          confirming={confirming}
          onConfirmingChange={onConfirmingChange}
          onExecuteAction={onExecuteAction}
          onFeedback={onFeedback}
        />
      )}
      {confirmationQueue.otherDemands.length > 0 ? (
        <section className="decision-related">
          <div className="approval-header compact">
            <h2>其他需求等你确认</h2>
            <span>{confirmationQueue.otherDemands.length}</span>
          </div>
          {confirmationQueue.otherDemands.map((item) => (
            <button className="decision-row" key={item.id} onClick={() => item.changeId ? onSelectContext(`confirm:${item.changeId}`) : undefined}>
              <strong>{userFacingText(item.whyNeedsConfirmation)}</strong>
              <span>{confirmationKindLabel(item.kind)} · {userFacingText(item.summary)}</span>
            </button>
          ))}
        </section>
      ) : null}
      <DecisionContextHistory contexts={inspector.history} onSelectContext={onSelectContext} />
    </>
  );
}

function ConfirmationQueueCard({
  item,
  confirming,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
}: {
  item: ConfirmationQueueItem;
  confirming: string | null;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
}): ReactElement {
  const context = confirmationItemToDecisionContext(item);
  return (
    <DecisionContextCard
      context={context}
      confirming={confirming}
      onConfirmingChange={onConfirmingChange}
      onExecuteAction={onExecuteAction}
      onFeedback={onFeedback}
    />
  );
}

function confirmationItemToDecisionContext(item: ConfirmationQueueItem): DecisionContext {
  return {
    id: item.id,
    kind: item.kind,
    title: item.whyNeedsConfirmation,
    summary: item.summary,
    resultSummary: item.summary,
    recommendation: item.confirmEffect,
    explanation: item.riskSummary,
    severity: item.status === "failed" ? "blocking" : "info",
    changeId: item.changeId ?? item.conversationId,
    runId: item.runId,
    targetId: item.worktreeId ?? item.applyCheckId ?? item.resultId,
    artifact: item.evidenceRefs[0],
    actions: item.actions,
    userStatus: "waiting-confirmation",
  };
}

function DecisionContextCard({
  context,
  confirming,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
}: {
  context: DecisionContext;
  confirming: string | null;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
}): ReactElement {
  const [feedbackActionId, setFeedbackActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const feedbackAction = context.actions.find((action) => action.id === feedbackActionId);
  async function submitFeedback(): Promise<void> {
    if (!feedbackAction || !feedback.trim()) return;
    await onFeedback(context, feedbackAction, feedback);
    setFeedback("");
    setFeedbackActionId(null);
  }
  return (
    <article className={`approval-card decision-primary ${context.severity}`} data-testid="decision-inspector-primary">
      <div className="approval-meta">
        <span>当前需要你决定</span>
        <small>{context.userStatus ? userStatusLabel(context.userStatus) : decisionKindLabel(context.kind)}</small>
      </div>
      <h3>{userFacingText(context.title)}</h3>
      <div className="decision-explainer">
        <strong>结果摘要</strong>
        <p>{userFacingText(context.resultSummary ?? context.summary)}</p>
      </div>
      <div className="decision-explainer">
        <strong>推荐动作</strong>
        <p>{userFacingText(context.recommendation ?? "查看证据后选择同意、要求修改或放弃。")}</p>
      </div>
      <div className="decision-explainer muted">
        <strong>说明</strong>
        <p>{userFacingText(context.explanation ?? "内部运行状态只作为证据和恢复信息，不是用户主决策语言。")}</p>
      </div>
      <dl className="approval-fields">
        <div><dt>变更</dt><dd>{context.changeId ?? "-"}</dd></div>
        {context.taskId ? <div><dt>任务</dt><dd>{context.taskId}</dd></div> : null}
        {context.queueRunId ? <div><dt>队列</dt><dd>{context.queueRunId}</dd></div> : null}
        {context.taskRunId ? <div><dt>执行尝试</dt><dd>{context.taskRunId}</dd></div> : null}
        {context.runId ? <div><dt>运行证据</dt><dd>{context.runId}</dd></div> : null}
      </dl>
      <div className="approval-actions">
        {context.actions.map((action) => {
          if (action.kind === "feedback") {
            return <button key={action.id} className="outline-button" disabled={!action.enabled} title={action.disabledReason} onClick={() => setFeedbackActionId(action.id)}><FileText size={15} />{userFacingText(action.label)}</button>;
          }
          if (action.kind === "evidence") {
            return <button key={action.id} className="outline-button" disabled={!action.enabled} onClick={() => void onExecuteAction(action, context)}><FileText size={15} />{userFacingText(action.label)}</button>;
          }
          if (action.kind !== "approval" && action.kind !== "workflow-action" && action.kind !== "abandon") return null;
          return confirming === action.id ? (
            <span className="confirm-inline" key={action.id}>
              <button className="primary-button" onClick={() => void onExecuteAction(action, context)}><Check size={15} />确认</button>
              <button className="outline-button" onClick={() => onConfirmingChange(null)}><X size={15} />取消</button>
            </span>
          ) : (
            <button key={action.id} className="primary-button" disabled={!action.enabled} title={action.disabledReason} onClick={() => action.requiresConfirmation ? onConfirmingChange(action.id) : void onExecuteAction(action, context)}><Check size={15} />{userFacingText(action.label)}</button>
          );
        })}
      </div>
      {feedbackAction ? (
        <div className="decision-feedback" data-testid="decision-feedback-editor">
          <label>
            <span>{userFacingText(context.rework?.label ?? feedbackAction.label)}</span>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={context.rework?.placeholder ?? "写下需要修改的地方"}
              rows={4}
            />
          </label>
          <div className="approval-actions">
            <button className="primary-button" disabled={!feedback.trim()} onClick={() => void submitFeedback()}>提交反馈</button>
            <button className="outline-button" onClick={() => { setFeedback(""); setFeedbackActionId(null); }}>取消</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DecisionContextHistory({ contexts, onSelectContext }: { contexts: DecisionContext[]; onSelectContext: (id: string) => void }): ReactElement {
  return (
    <section className="decision-history">
      <div className="approval-header compact">
        <h2>历史</h2>
        <span>{contexts.length}</span>
      </div>
      {contexts.length === 0 ? <div className="approval-empty"><h3>暂无历史决策</h3><p>接受、要求修改或完成的动作会保留在这里。</p></div> : null}
      <details className="decision-history-details" open={false}>
        <summary>查看历史决策</summary>
        {contexts.map((context) => (
          <button className="decision-row" key={context.id} onClick={() => onSelectContext(context.id)}>
            <strong>{userFacingText(context.title)}</strong>
            <span>{decisionKindLabel(context.kind)} · {context.timestamp ? formatTime(context.timestamp) : userFacingText(context.severity)}</span>
          </button>
        ))}
      </details>
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
      <span>当前需求：{topic?.title ?? "无"}</span>
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

function WorkpadView(props: {
  workpad: Workpad;
  approvals: Approval[];
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  const { workpad, approvals, busy, onWorkflowAction, onConfirmApproval } = props;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const approval = workpad.nextAction.approvalId ? approvals.find((item) => item.id === workpad.nextAction.approvalId) : undefined;
  const maintenanceNotice = workpad.maintenance?.status && workpad.maintenance.status !== "idle" ? workpad.maintenance : null;
  return (
    <div className="parent-conversation" data-testid="workpad-view">
      <section className="parent-agent-card">
        <div>
          <span className={`workpad-state user-state ${workpad.userStatus ?? "later"}`}>{workpad.userStatusLabel ?? userStatusLabel(workpad.userStatus)}</span>
          <h2>{workpad.title}</h2>
          <p>{parentAgentNarrative(workpad)}</p>
        </div>
        <WorkpadActionButton
          action={workpad.nextAction}
          approval={approval}
          busy={busy}
          sanitizeInternal
          onWorkflowAction={onWorkflowAction}
          onConfirmApproval={onConfirmApproval}
        />
      </section>

      {workpad.pendingFeedback?.length ? (
        <section className="parent-agent-section">
          <h3>已记录的补充</h3>
          {workpad.pendingFeedback.slice(-3).map((feedback) => (
            <p key={feedback.id}>{feedback.text} <span className="muted-inline">本轮完成后会用于下一次调整。</span></p>
          ))}
        </section>
      ) : null}

      {workpad.planningArtifactBundle ? <PlanningNarrativeCard bundle={workpad.planningArtifactBundle} /> : null}
      {workpad.rolePipeline ? <RoleToolResultRows pipeline={workpad.rolePipeline} /> : null}
      {workpad.resultReview ? <ResultReviewNarrative review={workpad.resultReview} /> : null}

      <section className="parent-agent-section">
        <h3>当前理解</h3>
        <p className="parent-agent-lead">{workpad.intake.goal}</p>
        <p>{workpad.intake.currentUnderstanding}</p>
        {workpad.intake.confirmedConstraints?.length ? (
          <div className="parent-chip-list">
            {workpad.intake.confirmedConstraints.slice(0, 4).map((constraint) => <span key={constraint}>{constraint}</span>)}
          </div>
        ) : null}
      </section>

      {workpad.intake.pendingClarifications?.length ? (
        <section className="parent-agent-section">
          <div className="parent-section-header">
            <h3>需要确认</h3>
            <span>{workpad.intake.pendingClarifications.length}</span>
          </div>
          <div className="clarification-list">
            {workpad.intake.pendingClarifications.map((clarification) => (
              <ClarificationCard
                key={clarification.id}
                clarification={clarification}
                busy={busy}
                onAnswer={props.onAnswerClarification}
              />
            ))}
          </div>
        </section>
      ) : null}

      {maintenanceNotice ? (
        <section className="parent-agent-section maintenance-nudge">
          <h3>后台维护</h3>
          <p>{userFacingText(maintenanceNotice.note)}</p>
        </section>
      ) : null}

      <details className="parent-details" open={detailsOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setDetailsOpen((open) => !open);
          }}
        >
          查看详情与证据
        </summary>
        {detailsOpen ? <WorkpadDiagnosticDetails {...props} /> : null}
      </details>
    </div>
  );
}

function PlanningNarrativeCard({ bundle }: { bundle: NonNullable<Workpad["planningArtifactBundle"]> }): ReactElement {
  const criteria = bundle.acceptanceCriteria.filter((item) => !/^\s*(AC-\d+|TBD)\s*$/i.test(item)).slice(0, 4);
  const tasks = bundle.tasks.filter((task) => task.title && !/^\s*TBD\s*$/i.test(task.title)).slice(0, 3);
  return (
    <section className="parent-agent-section" data-testid="planning-draft-card">
      <div className="parent-section-header">
        <h3>{bundle.status === "confirmed" ? "已确认方案" : "方案草案"}</h3>
        <span>{bundle.status === "confirmed" ? "准备执行" : "等待确认"}</span>
      </div>
      <p className="parent-agent-lead">我理解你要做的是：{parentSurfaceText(bundle.goal)}</p>
      {bundle.design ? <p>实现上，我会按现有代码结构处理：{userFacingText(stripInternalPlanningText(bundle.design))}</p> : null}
      {criteria.length > 0 ? (
        <div className="parent-chip-list">
          {criteria.map((item) => <span key={item}>{userFacingText(stripInternalPlanningText(item))}</span>)}
        </div>
      ) : null}
      {tasks.length > 0 ? (
        <div className="role-result-list">
          {tasks.map((task) => (
            <div className="role-result-row" key={task.id}>
              <strong>会处理</strong>
              <span>{userFacingText(stripInternalPlanningText(task.title))}</span>
            </div>
          ))}
        </div>
      ) : null}
      {bundle.openQuestions.length > 0 ? (
        <p className="parent-agent-note">还有 {bundle.openQuestions.length} 个点需要确认后再执行。</p>
      ) : null}
    </section>
  );
}

function RoleToolResultRows({ pipeline }: { pipeline: NonNullable<Workpad["rolePipeline"]> }): ReactElement {
  const rows = [
    ...pipeline.runs.map((run) => ({ id: `${run.roleId}:${run.runId ?? run.artifact ?? run.status}`, roleId: run.roleId, status: run.status, summary: run.summary, artifact: run.artifact })),
    ...pipeline.agentTasks.slice(-6).map((task) => ({ id: task.id, roleId: task.roleId, status: task.status, summary: task.resultSummary ?? task.summary, artifact: task.evidenceRefs[0] })),
  ];
  if (rows.length === 0) return <></>;
  return (
    <section className="parent-agent-section" data-testid="role-pipeline-summary">
      <div className="parent-section-header">
        <h3>执行过程</h3>
        <span>{humanStatus(pipeline.status)}</span>
      </div>
      <div className="role-result-list">
        {rows.map((row) => (
          <div className="role-result-row" key={row.id}>
            <strong>{roleLabel(row.roleId)}</strong>
            <span>{parentSurfaceText(row.summary)}</span>
            <small>{humanStatus(row.status)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultReviewNarrative({ review }: { review: NonNullable<Workpad["resultReview"]> }): ReactElement {
  return (
    <section className={`parent-agent-section result-review ${review.status}`} data-testid="result-review-card">
      <div className="parent-section-header">
        <h3>结果</h3>
        <span>{resultReviewStatusLabel(review.status)}</span>
      </div>
      <p className="parent-agent-lead">{userFacingText(review.title)}</p>
      <p>{userFacingText(review.summary)}</p>
      {review.changedFiles.length > 0 ? (
        <div className="parent-chip-list">
          {review.changedFiles.slice(0, 6).map((file) => <span key={file}>{file}</span>)}
        </div>
      ) : null}
      <div className="role-result-list">
        <div className="role-result-row"><strong>验证</strong><span>{review.validation ? humanStatus(review.validation.status) : "未完成"}</span></div>
        <div className="role-result-row"><strong>审查</strong><span>{review.audit ? humanStatus(review.audit.status) : "未完成"}</span></div>
        <div className="role-result-row"><strong>下一步</strong><span>{userFacingText(review.applyReadiness.message ?? review.applyReadiness.label)}</span></div>
      </div>
      {review.audit?.notes.length ? <p className="parent-agent-note">注意事项：{userFacingText(review.audit.notes[0])}</p> : null}
    </section>
  );
}

function parentAgentNarrative(workpad: Workpad): string {
  if (workpad.resultReview) return "我已经整理了本轮实现结果、验证与审查证据。你可以查看摘要后决定是否应用到项目，或继续要求修改。";
  if (workpad.rolePipeline) return "我正在把这次需求交给内部角色执行，并会把实现、验证和审查结果汇总回这个对话。";
  if (workpad.planningArtifactBundle) return workpad.planningArtifactBundle.status === "confirmed"
    ? "方案已经确认，接下来会进入实现、验证和审查。"
    : "我先把需求整理成可执行方案。你可以继续补充要求，或确认后开始执行。";
  if (workpad.intake.currentUnderstanding) return "我会基于当前需求对话继续分析目标、约束和下一步。";
  return "描述你的需求后，我会先整理方案，再进入实现和验证。";
}

function stripInternalPlanningText(value: string): string {
  return value
    .replace(/\bT-\d+\s*[:：]?\s*/g, "")
    .replace(/\bAC-\d+\s*[:：]?\s*/g, "")
    .replace(/\blatest-bundle\.md\b/gi, "")
    .replace(/\bplanning-agent\b/gi, "主 agent")
    .replace(/\bAgentTask\b/gi, "执行记录")
    .replace(/\bTaskRepository\b/gi, "后台任务")
    .replace(/\bTBD\b/gi, "待确认")
    .replace(/^\s*[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parentSurfaceText(value: string): string {
  return userFacingText(stripInternalPlanningText(value));
}

function WorkpadDiagnosticDetails({
  workpad,
  approvals,
  busy,
  onWorkflowAction,
  onConfirmApproval,
  onAnswerClarification,
  onSelectDecisionContext,
}: {
  workpad: Workpad;
  approvals: Approval[];
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
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
          <span className={`workpad-state user-state ${workpad.userStatus ?? "later"}`}>{workpad.userStatusLabel ?? userStatusLabel(workpad.userStatus)}</span>
          <h2>{workpad.title}</h2>
          <p>{workpad.subtitle}</p>
          {workpad.background && (workpad.background.runningCount + workpad.background.queuedCount + workpad.background.blockedCount + workpad.background.waitingDecisionCount) > 0 ? (
            <p className="workpad-background-summary" data-testid="workpad-background-summary">
              后台需求：{workpad.background.runningCount} 个处理中，{workpad.background.queuedCount} 个稍后处理，{workpad.background.blockedCount} 个需要修改或补证据，{workpad.background.waitingDecisionCount} 个等你确认
            </p>
          ) : null}
        </div>
        <WorkpadActionButton
          action={workpad.nextAction}
          approval={approval}
          busy={busy}
          onWorkflowAction={onWorkflowAction}
          onConfirmApproval={onConfirmApproval}
        />
      </section>

      {(workpad.pendingFeedback?.length || workpad.coderSelfTestSummary || workpad.postArchiveEvolutionCandidate) ? (
        <section className="workpad-section compact-section" data-testid="conversation-lifecycle">
          <div className="workpad-section-header">
            <h3>对话状态</h3>
            <span>{conversationLifecycleLabel(workpad.conversationLifecycle)}</span>
          </div>
          {workpad.pendingFeedback?.length ? (
            <div className="workpad-evidence-list">
              {workpad.pendingFeedback.map((feedback) => (
                <div className="workpad-evidence" key={feedback.id}>
                  <strong>已记录，将在下一轮生效</strong>
                  <span>{feedback.text}</span>
                </div>
              ))}
            </div>
          ) : null}
          {workpad.coderSelfTestSummary ? <p>{workpad.coderSelfTestSummary}</p> : null}
          {workpad.postArchiveEvolutionCandidate ? (
            <p>{workpad.postArchiveEvolutionCandidate.summary}</p>
          ) : null}
        </section>
      ) : null}

      {workpad.planningArtifactBundle ? (
        <section className="workpad-section" data-testid="planning-draft-card">
          <div className="workpad-section-header">
            <h3>{workpad.planningArtifactBundle.status === "confirmed" ? "已确认方案" : "方案草案"}</h3>
            <span>planning-agent</span>
          </div>
          <p className="workpad-goal">{workpad.planningArtifactBundle.goal}</p>
          <div className="workpad-chip-list">
            {workpad.planningArtifactBundle.acceptanceCriteria.slice(0, 5).map((item) => <span key={item}>{userFacingText(item)}</span>)}
          </div>
          <p>{workpad.planningArtifactBundle.design}</p>
          <div className="workpad-evidence-list">
            {workpad.planningArtifactBundle.tasks.map((task) => (
              <div className="workpad-evidence" key={task.id}>
                <strong>{task.id} {task.title}</strong>
                <span>{task.acIds.join(" · ")}</span>
              </div>
            ))}
          </div>
          {workpad.planningArtifactBundle.openQuestions.length > 0 ? (
            <ul className="workpad-issue-list">
              {workpad.planningArtifactBundle.openQuestions.map((item) => <li key={item}>{userFacingText(item)}</li>)}
            </ul>
          ) : null}
          {workpad.planningArtifactBundle.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.planningArtifactBundle.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.rolePipeline ? (
        <section className="workpad-section" data-testid="role-pipeline-summary">
          <div className="workpad-section-header">
            <h3>角色流水线</h3>
            <span>{humanStatus(workpad.rolePipeline.status)}</span>
          </div>
          <div className="workpad-evidence-list">
            {workpad.rolePipeline.runs.map((run) => (
              <div className="workpad-evidence" key={`${run.roleId}:${run.runId ?? run.artifact ?? run.status}`}>
                <strong>{roleLabel(run.roleId)} · {humanStatus(run.status)}</strong>
                <span>{userFacingText(run.summary)}</span>
                {run.artifact ? <small className="artifact-link">查看证据：{artifactName(run.artifact)}</small> : null}
              </div>
            ))}
            {workpad.rolePipeline.agentTasks.slice(-6).map((task) => (
              <div className="workpad-evidence" key={task.id}>
                <strong>{roleLabel(task.roleId)} 任务 · {humanStatus(task.status)}</strong>
                <span>{userFacingText(task.resultSummary ?? task.summary)}</span>
                {task.evidenceRefs[0] ? <small className="artifact-link">查看证据：{artifactName(task.evidenceRefs[0])}</small> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {workpad.resultReview ? (
        <section className={`workpad-section result-review ${workpad.resultReview.status}`} data-testid="workpad-result-review-card">
          <div className="workpad-section-header">
            <h3>结果</h3>
            <span>{resultReviewStatusLabel(workpad.resultReview.status)}</span>
          </div>
          <p className="workpad-goal">{userFacingText(workpad.resultReview.title)}</p>
          <p>{userFacingText(workpad.resultReview.summary)}</p>
          {workpad.resultReview.changedFiles.length > 0 ? (
            <div className="workpad-chip-list" aria-label="Changed files">
              {workpad.resultReview.changedFiles.map((file) => <span key={file}>{file}</span>)}
            </div>
          ) : null}
          <div className="workpad-progress-grid">
            <WorkpadMetric label="验证" value={workpad.resultReview.validation ? humanStatus(workpad.resultReview.validation.status) : "未完成"} />
            <WorkpadMetric label="审查" value={workpad.resultReview.audit ? humanStatus(workpad.resultReview.audit.status) : "未完成"} />
            <WorkpadMetric label="应用状态" value={userFacingText(workpad.resultReview.applyReadiness.message ?? workpad.resultReview.applyReadiness.label)} />
          </div>
          {workpad.resultReview.audit?.notes.length ? (
            <ul className="workpad-issue-list">
              {workpad.resultReview.audit.notes.slice(0, 3).map((note) => <li key={note}>注意事项：{userFacingText(note)}</li>)}
            </ul>
          ) : null}
          {workpad.resultReview.applyReadiness.blockingIssues.length > 0 ? (
            <ul className="workpad-issue-list">
              {workpad.resultReview.applyReadiness.blockingIssues.slice(0, 3).map((issue) => <li key={issue}>{userFacingText(issue)}</li>)}
            </ul>
          ) : null}
          {workpad.resultReview.diffStat ? <pre className="result-diff-stat">{workpad.resultReview.diffStat}</pre> : null}
        </section>
      ) : null}

      {workpad.background?.items.length ? (
        <section className="workpad-section compact-section" data-testid="background-workpads">
          <div className="workpad-section-header">
            <h3>后台需求</h3>
            <span>{workpad.background.items.length}</span>
          </div>
          <div className="workpad-chip-list">
            {workpad.background.items.map((item) => (
              <span key={item.id}>{userFacingText(item.title)} · {item.userStatusLabel ?? workpadStatusLabel(item.runtimeStatus)}</span>
            ))}
          </div>
        </section>
      ) : null}

      {workpad.maintenance ? (
        <section className="workpad-section compact-section" data-testid="maintenance-summary">
          <div className="workpad-section-header">
            <h3>后台维护</h3>
            <span>{workpad.maintenance.closeoutCount ?? workpad.maintenance.ledgerCount}</span>
          </div>
          <p>{userFacingText(workpad.maintenance.note)}</p>
          <p className="panel-note">终态需求：{workpad.maintenance.closeoutCount ?? 0} · 待维护审查：{workpad.maintenance.unreviewedTerminalCount ?? 0}</p>
          {workpad.maintenance.latest ? (
            <div className="workpad-evidence">
              <strong>{userFacingText(workpad.maintenance.latest.eventType)}</strong>
              <span>{userFacingText(workpad.maintenance.latest.summary)}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="workpad-section">
        <div className="workpad-section-header">
          <h3>目标与当前理解</h3>
          <span>{sourceLabel(workpad.intake.source)}</span>
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

      <section className="workpad-progress-grid" aria-label="需求进度">
        <WorkpadMetric label="需求说明" value={readinessLabel(workpad.progress.spec)} />
        <WorkpadMetric label="执行方案" value={readinessLabel(workpad.progress.plan)} />
        <WorkpadMetric label="任务" value={readinessLabel(workpad.progress.tasks)} />
        <WorkpadMetric label="验收 / 任务" value={`${workpad.progress.acCount} / ${workpad.progress.taskCount}`} />
        <WorkpadMetric label="执行" value={`${workpad.progress.runCount}${workpad.progress.latestRunStatus ? ` · ${humanStatus(workpad.progress.latestRunStatus)}` : ""}`} />
        <WorkpadMetric label="验证 / 审查" value={`${statusOrDash(workpad.progress.validationStatus)} / ${statusOrDash(workpad.progress.auditStatus)}`} />
      </section>

      {workpad.codingPackages.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>执行范围</h3>
            <span>{workpad.codingPackages.length} 个推荐执行单元</span>
          </div>
          <div className="coding-package-list">
            {workpad.codingPackages.map((item) => <CodingPackageCard key={item.id} item={item} />)}
          </div>
        </section>
      ) : null}

      {workpad.taskGraph.nodes.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>任务清单</h3>
            <span>{workpad.taskGraph.nodes.length} 个任务 · 来自已确认方案</span>
          </div>
          {workpad.taskQueue ? (
            <TaskQueuePanel
              queue={workpad.taskQueue}
              busy={busy}
              onWorkflowAction={onWorkflowAction}
              onSelectDecisionContext={onSelectDecisionContext}
            />
          ) : null}
          <div className="workpad-task-list">
            {workpad.taskGraph.nodes.map((task) => (
              <TaskGraphCard
                key={task.taskId}
                task={task}
                busy={busy}
                onWorkflowAction={onWorkflowAction}
                onSelectDecisionContext={onSelectDecisionContext}
              />
            ))}
          </div>
          {workpad.taskGraph.changeLevelEvidence.length > 0 ? (
            <div className="workpad-task-change-evidence">
              <strong>需求级证据</strong>
              {workpad.taskGraph.changeLevelEvidence.slice(0, 4).map((item) => (
                <span key={item.id}>{userFacingText(item.label)}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="workpad-section">
        <div className="workpad-section-header">
          <h3>证据与决策</h3>
          <span>{workpad.evidence.length}</span>
        </div>
        {workpad.evidence.length === 0 ? <p className="panel-note">暂无执行、验证、审查或决策证据。</p> : null}
        <div className="workpad-evidence-list">
          {workpad.evidence.map((item) => (
            <div className="workpad-evidence" key={item.id}>
              <strong>{userFacingText(item.label)}</strong>
              <span>{sourceLabel(item.source)}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
              {item.artifact ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
            </div>
          ))}
        </div>
      </section>

      {workpad.memoryIsolation ? (
        <section className="workpad-section" data-testid="memory-isolation">
          <div className="workpad-section-header">
            <h3>记忆边界</h3>
            <span>{workpad.memoryIsolation.currentChangeNamespace ?? "project"}</span>
          </div>
          <p>项目稳定记忆：{workpad.memoryIsolation.projectStableNamespace}</p>
          {workpad.memoryIsolation.runNamespaces.length > 0 ? <p>本需求运行证据：{workpad.memoryIsolation.runNamespaces.slice(0, 3).join("，")}</p> : null}
          {workpad.memoryIsolation.relatedWorkpads.length > 0 ? (
            <div className="workpad-links">
              {workpad.memoryIsolation.relatedWorkpads.map((item) => (
                <span className="artifact-link" key={item.changeId}>{userFacingText(item.title)} · {workpadStatusLabel(item.status)} · {item.factBoundary === "local-evidence-only" ? "局部证据" : "摘要可读"}</span>
              ))}
            </div>
          ) : null}
          <ul className="workpad-issue-list">
            {workpad.memoryIsolation.warnings.slice(0, 3).map((warning) => <li key={warning}>{userFacingText(warning)}</li>)}
          </ul>
        </section>
      ) : null}

      {(workpad.blockers.length > 0 || workpad.warnings.length > 0 || workpad.intake.missingInfo.length > 0 || openQuestions.length > 0 || assumptions.length > 0) ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>需要处理的问题</h3>
            <span>{workpad.blockers.length + workpad.warnings.length + workpad.intake.missingInfo.length + openQuestions.length + assumptions.length}</span>
          </div>
          <ul className="workpad-issue-list">
            {[...workpad.blockers, ...workpad.warnings, ...workpad.intake.missingInfo, ...openQuestions.map((item) => `待确认：${item}`), ...assumptions.map((item) => `假设：${item}`)].map((item, index) => <li key={`${item}:${index}`}>{userFacingText(item)}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TaskQueuePanel({
  queue,
  busy,
  onWorkflowAction,
  onSelectDecisionContext,
}: {
  queue: WorkbenchTaskQueueSummary;
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  const action = queue.nextAction;
  const disabled = busy || !action?.enabled || !action.actionType;
  const blockerContextId = ["blocked", "failed"].includes(queue.status) ? `queue:${queue.id}:blocked` : null;
  const showQueueAction = action && !["blocked", "failed"].includes(queue.status);
  const runningCopy = queue.status === "running"
    ? `当前任务 ${queue.currentTaskId ?? "待确定"}`
    : queue.status === "paused"
      ? userFacingText(queue.pausedReason ?? "任务已暂停，等待继续。")
      : queue.status === "blocked"
        ? userFacingText(queue.blockedReason ?? "任务暂停，需要修改或补证据。")
        : queue.status === "failed"
          ? userFacingText(queue.failureReason ?? "任务执行未通过。")
          : queue.status === "completed"
            ? "队列已完成，等待查看 evidence 与后续人工 gate。"
            : "本地顺序执行已确认任务。";
  function runQueueAction(): void {
    if (!action?.actionType || disabled) return;
    void onWorkflowAction(action.actionType);
  }
  return (
    <div className={`task-queue-panel ${queue.status}`} data-testid="task-queue-panel">
      <div className="task-queue-summary">
        <div>
          <strong>本地顺序执行</strong>
          <span>{humanStatus(queue.status)} · {queue.completedCount}/{queue.totalCount}</span>
        </div>
        {showQueueAction ? (
          <button
            className="secondary-button"
            type="button"
            disabled={disabled}
            title={action.disabledReason}
            onClick={runQueueAction}
          >
            {userFacingText(action.label)}
          </button>
        ) : null}
      </div>
      <p>{runningCopy}</p>
      {blockerContextId ? (
        <button className="context-link" type="button" onClick={() => onSelectDecisionContext(blockerContextId)}>
          查看当前决策
        </button>
      ) : null}
      {queue.items.length > 0 ? (
        <div className="task-queue-items" aria-label="Task queue items">
          {queue.items.map((item) => (
            <span key={item.id} className={`task-queue-item ${item.status}`}>
              {item.order}. {item.taskId} · {humanStatus(item.status)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CodingPackageCard({ item }: { item: WorkbenchCodingPackage }): ReactElement {
  const pendingText = item.taskIds.length > 0 ? item.taskIds.join(", ") : "无待执行任务";
  const completedText = item.completedTaskIds.length > 0 ? item.completedTaskIds.join(", ") : "无已完成任务上下文";
  return (
    <article className={`coding-package-card ${item.status}`} data-testid="coding-package-card">
      <div className="coding-package-header">
        <div>
          <strong>{item.title}</strong>
          <span>{item.summary}</span>
        </div>
        <span className={`task-status ${item.status}`}>{codingPackageStatusLabel(item.status)}</span>
      </div>
      <div className="coding-package-meta">
        <span>推荐角色：{item.recommendedRoleId}</span>
        <span>执行粒度：{codingPackageExecutionLabel(item.executionUnit)}</span>
        <span>分拆判断：{codingPackageSplitLabel(item.splitReadiness)}</span>
      </div>
      <div className="coding-package-grid">
        <div>
          <strong>待执行任务</strong>
          <p>{pendingText}</p>
        </div>
        <div>
          <strong>已完成上下文</strong>
          <p>{completedText}</p>
        </div>
      </div>
      <div className="coding-package-chips" aria-label="Coding package AC coverage">
        {item.acIds.map((acId) => (
          <span key={acId} className={item.missingEvidenceAcIds.includes(acId) ? "missing" : "covered"}>
            {acId}{item.missingEvidenceAcIds.includes(acId) ? " · 缺 evidence" : " · covered"}
          </span>
        ))}
      </div>
      <p className="panel-note">{item.splitRationale}</p>
      <p className="panel-note">{item.mergeRisk}</p>
      <p className="panel-note">5Y 只提供推荐执行单元；现有运行仍通过单任务或本地顺序执行入口触发，不提供执行单元级运行按钮。</p>
    </article>
  );
}

function TaskGraphCard({
  task,
  busy,
  onWorkflowAction,
  onSelectDecisionContext,
}: {
  task: WorkbenchTaskNode;
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  const action = task.nextAction;
  const disabled = busy || !action.enabled || !action.actionType;
  const blockerContextId = task.status === "blocked" ? `task:${task.taskId}:blocked` : null;
  function runTask(): void {
    if (!action.actionType || disabled) return;
    void onWorkflowAction(action.actionType, { taskIds: action.taskIds ?? [task.taskId], taskRunId: action.taskRunId });
  }
  return (
    <article className={`workpad-task ${task.status}`} data-testid={`taskgraph-node-${task.taskId}`}>
      <div className="workpad-task-header">
        <div>
          <strong>{task.taskId}</strong>
          <span>{userFacingText(task.title)}</span>
        </div>
        <span className={`task-status ${task.status}`}>{taskStatusLabel(task.status)}</span>
      </div>
      <small>{task.checked ? "已勾选" : "未勾选"} · {task.acIds.join(", ") || "未映射 AC"}</small>
      {task.taskRun ? (
        <div className="task-run-summary">
          <span>执行尝试 #{task.taskRun.attempt}</span>
          <strong>{humanStatus(task.taskRun.status)}</strong>
          <small>{task.taskRun.id}</small>
          {task.workerLease ? <small>执行会话 {humanStatus(task.workerLease.status)} · {task.workerLease.workerId}</small> : null}
        </div>
      ) : null}
      {task.latestEvidence.length > 0 ? (
        <div className="task-evidence-list">
          {task.latestEvidence.map((item) => (
            <span key={item.id}>{userFacingText(item.label)}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
          ))}
        </div>
      ) : <small className="panel-note">暂无任务级 evidence。</small>}
      {task.blockers.length > 0 ? (
        <ul className="task-blockers">
          {task.blockers.map((blocker) => <li key={blocker}>{userFacingText(blocker)}</li>)}
        </ul>
      ) : null}
      {blockerContextId ? (
        <button className="context-link" type="button" onClick={() => onSelectDecisionContext(blockerContextId)}>
          查看当前决策
        </button>
      ) : null}
      <button
        className="secondary-button"
        type="button"
        disabled={disabled}
        title={action.disabledReason}
        onClick={runTask}
      >
        {userFacingText(action.label)}
      </button>
    </article>
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
  sanitizeInternal = false,
  onWorkflowAction,
  onConfirmApproval,
}: {
  action: WorkpadNextAction;
  approval?: Approval;
  busy: boolean;
  sanitizeInternal?: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
}): ReactElement {
  const disabled = busy || !action.enabled || action.kind === "none" || action.kind === "read-only";
  const format = sanitizeInternal ? parentSurfaceText : userFacingText;
  function run(): void {
    if (action.kind === "approval" && action.approvalId) {
      onConfirmApproval(action.approvalId);
      return;
    }
    if (action.kind === "workflow-action" && action.actionType) void onWorkflowAction(action.actionType, { taskIds: action.taskIds, taskRunId: action.taskRunId });
  }
  return (
    <div className="workpad-next-action">
      <span>下一步</span>
      <strong>{format(approval?.action?.label ?? action.label)}</strong>
      <p>{format(action.description)}</p>
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

function ThreadStreamView({
  items,
  liveTurns,
  busy,
  onAction,
  onSelectDecisionContext,
}: {
  items: ThreadStreamItem[];
  liveTurns: LiveAssistantTurn[];
  busy: boolean;
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  if (items.length === 0 && liveTurns.length === 0) return <div className="empty-state">暂无对话内容。</div>;
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
            {item.kind === "decision" ? (
              <button className="context-link" type="button" onClick={() => onSelectDecisionContext(`decision:${item.id}`)}>
                在右侧查看决策
              </button>
            ) : null}
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
  const visibleActions = actions.filter((action) => action.actionType !== "code.run");
  return (
    <div className="plan-card">
      <h3>{planCard.title}</h3>
      <p>{userFacingText(planCard.summary)}</p>
      <ol>
        {planCard.steps.map((step, index) => <li key={`${step.label}-${index}`}><strong>{userFacingText(step.label)}</strong><span>{userFacingText(step.description)}</span></li>)}
      </ol>
      {planCard.warnings.length > 0 ? <div className="plan-warnings">{planCard.warnings.map(userFacingText).join(" · ")}</div> : null}
      {visibleActions.length > 0 ? (
        <div className="plan-actions">
          {confirmingAction ? (
            <div className="inline-confirm">
              <span>确认执行 {userFacingText(confirmingAction.label)}</span>
              <button className="primary-button" disabled={busy} onClick={() => { setConfirmingAction(null); void onAction(confirmingAction.actionType); }}>确认执行</button>
              <button className="outline-button" disabled={busy} onClick={() => setConfirmingAction(null)}>取消</button>
            </div>
          ) : null}
          {visibleActions.map((action) => (
            <button
              className={action.enabled ? "outline-button" : "outline-button disabled"}
              disabled={busy || !action.enabled}
              key={`${action.actionType}-${action.label}`}
              title={action.disabledReason}
              onClick={() => action.requiresConfirmation ? setConfirmingAction(action) : void onAction(action.actionType)}
            >
              {userFacingText(action.label)}
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
  mode: _mode,
  onModeChange: _onModeChange,
  busy: _busy,
  disabledReason,
  onSend,
  onStopAndContinue,
  onNewWorkpad: _onNewWorkpad,
  onRunCode: _onRunCode,
  actionRunning,
  canRunCode: _canRunCode,
  currentWorkpadStatus,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: "chat" | "plan";
  onModeChange: (mode: "chat" | "plan") => void;
  busy: boolean;
  disabledReason?: string;
  onSend: () => Promise<void>;
  onStopAndContinue?: () => Promise<void>;
  onNewWorkpad?: () => Promise<void>;
  onRunCode?: () => Promise<void>;
  actionRunning: string | null;
  canRunCode: boolean;
  currentWorkpadStatus?: WorkpadRuntimeStatus;
}): ReactElement {
  const runningConversation = Boolean(actionRunning) || currentWorkpadStatus === "running";
  const canStop = runningConversation && Boolean(onStopAndContinue) && !value.trim();
  const canSend = Boolean(value.trim());
  const sendDisabled = Boolean(disabledReason) || (!canSend && !canStop);
  const buttonTitle = canStop ? "停止当前执行" : runningConversation ? "发送给当前执行" : "发送";
  const buttonIcon = canStop ? <X size={16} /> : <Send size={16} />;
  function submit(): void {
    if (canStop) void onStopAndContinue?.();
    else void onSend();
  }
  return (
    <div className="topic-composer" aria-label="需求对话输入框">
        <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={Boolean(disabledReason)}
        placeholder={disabledReason ?? (runningConversation ? "补充要求；支持实时引导时会发送给当前执行" : "输入问题或下一步需求")}
      />
      <div className="composer-toolbar">
        {disabledReason ? <span className="composer-pill">只读</span> : null}
        {runningConversation ? <span className="composer-pill subtle">{value.trim() ? "会发送给当前执行" : "可停止当前执行"}</span> : null}
        <span className="composer-spacer" />
        {actionRunning ? <span className="composer-pill subtle">正在运行：{workflowActionLabel(actionRunning)}</span> : null}
        <button
          className={`composer-send ${actionRunning ? "running" : ""}`}
          disabled={sendDisabled}
          title={buttonTitle}
          onClick={submit}
        >
          {buttonIcon}
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
        {(stream?.artifacts ?? []).filter((item) => ["events", "stdout", "stderr", "codexEvents", "lastMessage", "appServerEvents", "appServerStderr", "appServerLastMessage", "agentSession", "diff", "implementation", "validation", "audit"].includes(item.key)).map((artifact) => (
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

function workpadStatusLabel(status: WorkpadRuntimeStatus): string {
  if (status === "running") return "处理中";
  if (status === "queued") return "稍后处理";
  if (status === "blocked") return "需要修改或补证据";
  if (status === "waiting-decision") return "等你确认";
  if (status === "archived") return "已完成";
  if (status === "readonly") return "稍后处理";
  return "等你确认";
}

function userStatusLabel(status?: WorkpadUserStatus): string {
  if (status === "processing") return "处理中";
  if (status === "waiting-confirmation") return "等你确认";
  if (status === "needs-rework") return "需要修改或补证据";
  if (status === "later") return "稍后处理";
  if (status === "abandoned") return "已放弃";
  return "已完成";
}

function conversationLifecycleLabel(status?: ConversationLifecycle): string {
  if (status === "running") return "执行中";
  if (status === "waiting-user") return "等待补充";
  if (status === "archived-readonly") return "历史只读";
  if (status === "abandoned") return "已放弃";
  return "当前需求";
}

function readinessLabel(value: "missing" | "ready" | "unknown"): string {
  if (value === "ready") return "已就绪";
  if (value === "missing") return "缺失";
  return "未知";
}

function taskStatusLabel(status: WorkbenchTaskNode["status"]): string {
  if (status === "planned") return "计划中";
  if (status === "running") return "处理中";
  if (status === "evidence-ready") return "有证据";
  if (status === "blocked") return "需要修改";
  return "已勾选";
}

function codingPackageStatusLabel(status: WorkbenchCodingPackage["status"]): string {
  if (status === "suggested") return "建议执行";
  if (status === "blocked") return "需要修改";
  if (status === "evidence-ready") return "证据就绪";
  if (status === "readonly") return "只读";
  return "缺失";
}

function codingPackageExecutionLabel(value: WorkbenchCodingPackage["executionUnit"]): string {
  return value === "future-parallel-candidate" ? "未来并行候选" : "单一 coder-agent";
}

function codingPackageSplitLabel(value: WorkbenchCodingPackage["splitReadiness"]): string {
  if (value === "candidate") return "可作为未来拆分候选";
  if (value === "unknown") return "信息不足";
  return "默认不拆分";
}

function statusOrDash(value?: string): string {
  return value ? humanStatus(value) : "-";
}

function sourceLabel(source: string): string {
  if (source === "run" || source === "workflow") return "执行";
  if (source === "validation") return "验证";
  if (source === "audit") return "审查";
  if (source === "decision") return "决策";
  if (source === "thread") return "对话";
  if (source === "task") return "任务";
  if (source === "queue") return "本地顺序执行";
  return userFacingText(source);
}

function userFacingText(value: string): string {
  return value
    .replace(/\bTask queue started\b/gi, "本地顺序执行已开始")
    .replace(/\bTask runs reconciled\b/gi, "任务状态已同步")
    .replace(/\bTask workflow started\b/gi, "任务执行已开始")
    .replace(/\bCoder run confirmed\b/gi, "代码执行已确认")
    .replace(/\bRefresh execution status\b/gi, "继续处理")
    .replace(/\bWorkpad\b/g, "需求")
    .replace(/\bChange\b/g, "需求")
    .replace(/刷新执行状态/g, "继续处理")
    .replace(/重试此任务/g, "重试")
    .replace(/\bDirty worktree blocks close:/gi, "未清理的工作区会阻止完成：")
    .replace(/\bLatest Audit blocked close:/gi, "最新审查未通过，会阻止完成：")
    .replace(/\bReview status is pending\./gi, "Review 还未完成。")
    .replace(/\bAC-([0-9]+) has no linked test evidence\./gi, "AC-$1 还没有关联测试证据。")
    .replace(/\bActive change has AHO-managed worktree:/gi, "当前需求有 AHO 管理的工作区：")
    .replace(/Running Workpad proposals, diffs, stdout\/stderr, JSONL, and process metadata are not project stable facts\./g, "进行中的需求草案、diff、原始输出、JSONL 和进程信息不会进入项目稳定记忆。")
    .replace(/Memory consolidation candidates and conflict review are future human-gated workflows\./g, "记忆合并候选和冲突复核是后续人工确认流程。")
    .replace(/\bAudit blocked\.?/gi, "审查未通过，需要修改或补证据。")
    .replace(/\bAudit failed\.?/gi, "审查未通过。")
    .replace(/\bAudit approved-with-notes\b/gi, "审查带备注通过")
    .replace(/\bAudit approved\b/gi, "审查通过")
    .replace(/\bValidation failed\.?/gi, "验证未通过。")
    .replace(/\bValidation passed\b/gi, "验证已通过")
    .replace(/\bCoder completed\b/gi, "代码执行已完成")
    .replace(/\bTask queue\b/gi, "本地顺序执行")
    .replace(/\bGenerate Spec\b/gi, "生成需求说明")
    .replace(/\bGenerate Plan\b/gi, "生成执行方案")
    .replace(/\bGenerate Tasks\b/gi, "生成任务")
    .replace(/生成 Spec/g, "生成需求说明")
    .replace(/生成 Plan/g, "生成执行方案")
    .replace(/生成 Tasks/g, "生成任务")
    .replace(/\bAccept spec proposal\b/gi, "接受需求说明")
    .replace(/\bAccept plan proposal\b/gi, "接受执行方案")
    .replace(/\bAccept audit proposal\b/gi, "接受审查证据")
    .replace(/接受 Spec/g, "接受需求说明")
    .replace(/接受 Plan/g, "接受执行方案")
    .replace(/\bPlan\/Tasks proposal\b/gi, "执行方案草案")
    .replace(/\bPlan\/Tasks acceptance\b/gi, "执行方案确认")
    .replace(/\bSpec proposal\b/gi, "需求说明草案")
    .replace(/\bSpec\b/g, "需求说明")
    .replace(/\bPlan\b/g, "执行方案")
    .replace(/\bTasks\b/g, "任务")
    .replace(/\bqueue\b/gi, "本地顺序执行")
    .replace(/\bblocked\b/gi, "需要修改或补证据")
    .replace(/\bfailed\b/gi, "未通过")
    .replace(/\brunning\b/gi, "处理中")
    .replace(/\bqueued\b/gi, "稍后处理")
    .replace(/\bwaiting-decision\b/gi, "等你确认")
    .replace(/\bblocking\b/gi, "需处理")
    .replace(/\bstdout\/stderr, JSONL\b/gi, "原始输出和 JSONL")
    .replace(/\band process metadata are not project stable facts\./gi, "和进程信息不会进入项目稳定记忆。");
}

function stateLabel(state: string): string {
  if (state === "active") return "进行中";
  if (state === "archive") return "已归档";
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
  if (status === "running") return "处理中";
  if (status === "queued") return "稍后处理";
  if (status === "paused") return "稍后处理";
  if (status === "blocked") return "需要修改或补证据";
  if (status === "waiting-decision") return "等你确认";
  if (status === "claimed") return "已领取";
  if (status === "released") return "已释放";
  if (status === "evidence-ready") return "证据就绪";
  if (status === "readonly") return "只读";
  if (status === "streaming") return "流式输出中";
  if (status === "completed") return "已完成";
  if (status === "passed") return "已通过";
  if (status === "approved") return "已批准";
  if (status === "approved-with-notes") return "带备注批准";
  if (status === "failed") return "失败";
  if (status === "started") return "已开始";
  if (status === "stderr") return "错误输出";
  if (status === "draft") return "草案";
  if (status === "confirmed") return "已确认";
  if (status === "needs-user-input") return "需要用户补充";
  if (status === "stopped") return "已停止";
  return status;
}

function resultReviewStatusLabel(status: NonNullable<Workpad["resultReview"]>["status"]): string {
  if (status === "ready-to-apply") return "可应用";
  if (status === "needs-rework") return "需要修改";
  if (status === "applied-clean") return "已应用";
  if (status === "applied-source-dirty") return "已应用，待处理本地改动";
  return "证据未完整";
}

function roleLabel(roleId: string): string {
  if (roleId === "planning-agent") return "规划";
  if (roleId === "coder-agent" || roleId === "coder") return "实现";
  if (roleId === "validator") return "验证";
  if (roleId === "auditor-agent" || roleId === "auditor") return "审查";
  if (roleId === "rework-coder") return "自动修改";
  return roleId;
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

function decisionKindLabel(kind: string): string {
  if (kind === "queue-blocker") return "任务暂停";
  if (kind === "task-blocker") return "需要修改";
  if (kind === "validation-failed") return "验证未通过";
  if (kind === "audit-blocked") return "审查未通过";
  if (kind === "spec-proposal") return "Spec";
  if (kind === "plan-proposal") return "计划";
  if (kind === "audit-approved") return "审查";
  if (kind === "apply-gate") return "应用";
  if (kind === "close-gate") return "完成";
  if (kind === "evolution-pending") return "Harness";
  return "历史";
}

function confirmationKindLabel(kind: string): string {
  if (kind === "planning-confirm") return "方案确认";
  if (kind === "single-result-apply") return "结果应用";
  if (kind === "integration-check") return "兼容性检查";
  if (kind === "integration-apply") return "组合应用";
  if (kind === "landing-readiness") return "落地检查";
  if (kind === "landing-queue") return "合并队列";
  if (kind === "pr-draft") return "PR 草稿";
  if (kind === "pr-review") return "人工评审";
  if (kind === "remote-landing") return "远端合并";
  if (kind === "post-merge") return "合并后收尾";
  if (kind === "request-changes") return "要求修改";
  if (kind === "discard-result") return "放弃结果";
  if (kind === "maintenance") return "维护建议";
  return userFacingText(kind);
}

function workflowActionLabel(actionType: string | undefined): string {
  if (actionType === "change.spec.propose") return "Spec proposal";
  if (actionType === "change.plan.propose") return "Plan/Tasks proposal";
  if (actionType === "planning.generate") return "生成方案草案";
  if (actionType === "planning.revise") return "修改方案草案";
  if (actionType === "planning.confirm-execution") return "确认执行";
  if (actionType === "orchestrator.evaluate") return "检查处理状态";
  if (actionType === "orchestrator.pump") return "继续处理需求";
  if (actionType === "demand.worker.enqueue") return "加入处理队列";
  if (actionType === "demand.worker.claim") return "领取需求";
  if (actionType === "demand.worker.start-next") return "开始处理";
  if (actionType === "demand.worker.start-available") return "开始可处理需求";
  if (actionType === "demand.worker.reconcile") return "恢复处理状态";
  if (actionType === "demand.worker.release") return "结束处理";
  if (actionType === "role.pipeline.start") return "角色流水线";
  if (actionType === "role.pipeline.stop") return "停止当前执行";
  if (actionType === "conversation.steer") return "引导当前执行";
  if (actionType === "conversation.interrupt") return "停止当前执行";
  if (actionType === "conversation.continue") return "继续执行";
  if (actionType === "result.refresh-rework") return "重新处理这个结果";
  if (actionType === "result.revalidate") return "重新验证";
  if (actionType === "result.reaudit") return "重新审查";
  if (actionType === "result.refresh-status") return "刷新状态";
  if (actionType === "apply-check.run") return "检查兼容性";
  if (actionType === "landing.prepare") return "提交/PR 前检查";
  if (actionType === "landing.review") return "审查落地检查";
  if (actionType === "landing.refresh") return "刷新落地检查";
  if (actionType === "landing-queue.prepare") return "检查合并队列";
  if (actionType === "landing-queue.refresh") return "刷新合并队列";
  if (actionType === "landing-queue.merge-next") return "合并 PR";
  if (actionType === "landing-queue.skip") return "跳过这个 PR";
  if (actionType === "landing-queue.remove-stale") return "移出过期项";
  if (actionType === "pr-draft.prepare") return "准备 PR 草稿";
  if (actionType === "pr-draft.create") return "创建 PR 草稿";
  if (actionType === "pr-draft.refresh") return "刷新 PR 状态";
  if (actionType === "pr-feedback.refresh") return "检查 PR 反馈";
  if (actionType === "pr-feedback.evaluate") return "分析 PR 反馈";
  if (actionType === "pr-feedback.rework") return "根据 PR 反馈修改";
  if (actionType === "pr-feedback.update-draft") return "更新 PR 草稿";
  if (actionType === "pr-review.prepare") return "准备人工评审";
  if (actionType === "pr-review.submit") return "提交人工评审";
  if (actionType === "pr-review.refresh") return "刷新评审状态";
  if (actionType === "pr-review.feedback-refresh") return "检查评审反馈";
  if (actionType === "pr-review.feedback-evaluate") return "分析评审反馈";
  if (actionType === "pr-review.rework") return "根据评审修改";
  if (actionType === "pr-review.reply-prepare") return "准备评审回复";
  if (actionType === "pr-review.reply-submit") return "回复评审";
  if (actionType === "pr-review.thread-resolve") return "标记已处理";
  if (actionType === "remote-landing.prepare") return "检查合并状态";
  if (actionType === "remote-landing.merge") return "合并 PR";
  if (actionType === "remote-landing.refresh") return "刷新合并状态";
  if (actionType === "post-merge.prepare") return "检查合并后状态";
  if (actionType === "post-merge.refresh") return "刷新合并后状态";
  if (actionType === "post-merge.sync-local.prepare") return "检查本地同步";
  if (actionType === "post-merge.sync-local.run") return "同步本地项目";
  if (actionType === "post-merge.cleanup-branch.prepare") return "检查远端分支";
  if (actionType === "post-merge.cleanup-branch.run") return "清理远端 PR 分支";
  if (actionType === "role.pipeline.continue") return "继续执行";
  if (actionType === "role.pipeline.reconcile") return "恢复执行状态";
  if (actionType === "code.run") return "Code workflow";
  if (actionType === "task.run.start") return "Task workflow";
  if (actionType === "task.run.retry") return "Retry task";
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
