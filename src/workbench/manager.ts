import { existsSync } from "node:fs";
import { open, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { previewWorktreeApply } from "../apply/manager.js";
import { listAuditResults, summarizeAudit } from "../audit/artifacts.js";
import { listPlanProposalSummaries, listSpecProposalSummaries } from "../change/proposals.js";
import { getChangeStatus } from "../change/manager.js";
import { buildAcMap } from "../ecl/anchors.js";
import { buildChangeIndex, hasPendingEvolution } from "../ecl/index.js";
import { readRequiredJsonFile } from "../fs/json.js";
import { getTemplateRoot } from "../template-source/paths.js";
import { getMemoryStatus } from "../memory/status.js";
import { resolveMemory } from "../memory/resolver.js";
import { readProjectMarker } from "../project/marker.js";
import { getProjectStatus } from "../project/status.js";
import { listRuns, readRun } from "../run/manager.js";
import { getSpecTestDriftReport } from "../spec-test/drift.js";
import { getSpecTestStatus } from "../spec-test/manager.js";
import { listSpecTestProposalSummaries } from "../spec-test/proposal.js";
import { isActiveTaskRunStatus, listTaskRuns, listWorkerLeases } from "../task-run/manager.js";
import { listTaskQueueItems, listTaskQueues } from "../task-queue/manager.js";
import { listValidationResults, summarizeValidation } from "../validation/artifacts.js";
import { listWorktreeStatuses, listWorktreesForChange } from "../worktree/manager.js";
import { readTopicThreadLog, type AssistantTurnActivity, type AssistantTurnBlock, type OrchestrationPlanCard, type TopicThreadEntry } from "./chat.js";
import type { ClarificationRequest, WorkbenchIntakeIteration, WorkbenchIntakeScan } from "./intake.js";
import { WorkbenchStore, type StoredDecisionRecord } from "./store.js";
import type {
  AuditSummary,
  AcMap,
  ChangeIndexItem,
  ChangeMetadata,
  ManagedProject,
  MemoryStatus,
  ResolvedMemory,
  RunEvent,
  RunMetadata,
  TaskQueueItem,
  TaskQueueRun,
  TaskRun,
  ValidationSummary,
  WorkerLease,
} from "../types/index.js";

export type WorkbenchTopicState = "active" | "parking" | "archive";
export type WorkbenchApprovalKind =
  | "spec-proposal"
  | "plan-proposal"
  | "spec-test-proposal"
  | "audit-proposal"
  | "worktree-apply"
  | "change-close"
  | "evolution"
  | "attention";
export type HarnessGapStatus = "missing" | "partial" | "available";
export type HarnessGapSeverity = "info" | "warning";

export interface WorkbenchProjectInput {
  project: ManagedProject | null;
  path: string;
}

export interface WorkbenchTopicSummary {
  id: string;
  name: string;
  title: string;
  state: WorkbenchTopicState;
  path: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
  archivePath?: string | null;
}

export type WorkbenchWorkpadRuntimeStatus = "active" | "running" | "queued" | "blocked" | "waiting-decision" | "archived" | "readonly";

export interface WorkbenchWorkpadSummary {
  id: string;
  title: string;
  state: WorkbenchTopicState;
  runtimeStatus: WorkbenchWorkpadRuntimeStatus;
  selected: boolean;
  waitingDecisionCount: number;
  latestRunStatus?: string;
  latestRunId?: string;
  queueStatus?: string;
  blocker?: string;
  updatedAt?: string;
}

export interface WorkbenchThreadEvent {
  id: string;
  type: string;
  label: string;
  timestamp?: string;
  source: "change" | "run" | "proposal" | "validation" | "audit" | "worktree" | "spec-test" | "evolution" | "chat" | "workflow";
  artifact?: string;
  status?: string;
  runId?: string;
  planCard?: OrchestrationPlanCard;
}

export interface ThreadStreamAction {
  actionType: "change.spec.propose" | "change.plan.propose" | "code.run" | "task.run.start" | "task.run.retry" | "task.queue.start" | "task.queue.reconcile" | "intake.scan" | "intake.reanalyze" | "clarification.answer" | "clarification.skip";
  label: string;
  enabled: boolean;
  requiresConfirmation: boolean;
  disabledReason?: string;
}

export interface ThreadStreamEvidence {
  id: string;
  label: string;
  source: "workflow" | "validation" | "audit" | "decision";
  timestamp?: string;
  body?: string;
  artifact?: string;
  status?: string;
  runId?: string;
  actionRunId?: string;
}

export interface ThreadStreamItem {
  id: string;
  kind: "user-message" | "assistant-turn" | "assistant-message" | "plan-card" | "workflow-summary" | "evidence" | "decision" | "change-state" | "intake-summary" | "clarification";
  label: string;
  timestamp?: string;
  body?: string;
  source: "change" | "chat" | "workflow" | "validation" | "audit" | "decision" | "intake";
  artifact?: string;
  status?: string;
  runId?: string;
  actionRunId?: string;
  semanticKey?: string;
  planCard?: OrchestrationPlanCard;
  actions?: ThreadStreamAction[];
  activity?: AssistantTurnActivity[];
  evidence?: ThreadStreamEvidence[];
  blocks?: AssistantTurnBlock[];
  intake?: {
    scan?: WorkbenchIntakeScan;
    iteration?: WorkbenchIntakeIteration;
  };
  clarification?: ClarificationRequest;
}

export interface WorkbenchApprovalItem {
  id: string;
  kind: WorkbenchApprovalKind;
  label: string;
  changeId?: string;
  runId?: string;
  targetId?: string;
  severity: "info" | "warning" | "blocking";
  action?: WorkbenchApprovalAction;
  artifact?: string;
  reason?: string;
}

export interface WorkbenchDecisionItem {
  id: string;
  kind: string;
  label: string;
  status: "pending" | "accepted" | "requested-changes" | "dismissed" | "completed" | "failed";
  changeId?: string;
  runId?: string;
  targetId?: string;
  artifact?: string;
  summary: string;
  feedback?: string;
  updatedAt: string;
  completedAt?: string;
}

export type WorkbenchDecisionContextKind =
  | "queue-blocker"
  | "task-blocker"
  | "validation-failed"
  | "audit-blocked"
  | "spec-proposal"
  | "plan-proposal"
  | "audit-approved"
  | "apply-gate"
  | "close-gate"
  | "evolution-pending"
  | "history";

export interface WorkbenchDecisionAction {
  id: string;
  label: string;
  kind: "approval" | "workflow-action" | "feedback" | "evidence" | "none";
  enabled: boolean;
  requiresConfirmation: boolean;
  approvalId?: string;
  action?: WorkbenchApprovalAction;
  actionType?: ThreadStreamAction["actionType"];
  taskIds?: string[];
  taskRunId?: string;
  artifact?: string;
  disabledReason?: string;
}

export interface WorkbenchReworkPrompt {
  mode: "inline-feedback" | "record-feedback";
  label: string;
  placeholder: string;
}

export interface WorkbenchDecisionContext {
  id: string;
  kind: WorkbenchDecisionContextKind;
  title: string;
  summary: string;
  severity: "info" | "warning" | "blocking";
  changeId?: string;
  taskId?: string;
  taskRunId?: string;
  queueRunId?: string;
  runId?: string;
  targetId?: string;
  artifact?: string;
  timestamp?: string;
  actions: WorkbenchDecisionAction[];
  rework?: WorkbenchReworkPrompt;
}

export interface WorkbenchDecisionInspector {
  primary: WorkbenchDecisionContext | null;
  related: WorkbenchDecisionContext[];
  history: WorkbenchDecisionContext[];
  selectedContextId?: string;
}

export interface WorkpadIntakeSummary {
  goal: string;
  currentUnderstanding: string;
  source: "project" | "topic" | "thread" | "diagnostic";
  relatedArtifacts: string[];
  missingInfo: string[];
  confirmedConstraints: string[];
  openQuestions: string[];
  assumptions: string[];
  pendingClarifications: ClarificationRequest[];
}

export interface WorkpadProgress {
  topicState: WorkbenchTopicState | "none";
  spec: "missing" | "ready" | "unknown";
  plan: "missing" | "ready" | "unknown";
  tasks: "missing" | "ready" | "unknown";
  acCount: number;
  taskCount: number;
  runCount: number;
  latestRunStatus?: string;
  validationStatus?: string;
  auditStatus?: string;
}

export interface WorkpadEvidenceSummary {
  id: string;
  label: string;
  source: "run" | "validation" | "audit" | "decision" | "approval";
  status?: string;
  artifact?: string;
  timestamp?: string;
}

export interface WorkpadNextAction {
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
}

export interface WorkpadBackgroundActivitySummary {
  totalCount: number;
  runningCount: number;
  queuedCount: number;
  blockedCount: number;
  waitingDecisionCount: number;
  items: WorkbenchWorkpadSummary[];
}

export interface WorkpadRelatedMemorySummary {
  changeId: string;
  title: string;
  status: WorkbenchWorkpadRuntimeStatus;
  factBoundary: "summary-only" | "local-evidence-only";
}

export interface WorkpadMemoryIsolationSummary {
  projectStableNamespace: "project/stable";
  currentChangeNamespace?: string;
  runNamespaces: string[];
  agentSessionNamespace: "agent/{roleId}/session/{sessionId}";
  relatedWorkpads: WorkpadRelatedMemorySummary[];
  stableFactSources: string[];
  writeBoundaries: string[];
  warnings: string[];
}

export interface WorkpadTaskPreview {
  id: string;
  title: string;
  done: boolean;
  acIds: string[];
  warnings: string[];
}

export type WorkbenchTaskNodeStatus = "planned" | "running" | "evidence-ready" | "blocked" | "checked";

export interface WorkbenchTaskEvidence {
  id: string;
  label: string;
  source: "run" | "validation" | "audit";
  status?: string;
  runId?: string;
  worktreeId?: string;
  artifact?: string;
  timestamp?: string;
}

export interface WorkbenchTaskNextAction {
  id: string;
  label: string;
  actionType?: ThreadStreamAction["actionType"];
  taskIds?: string[];
  taskRunId?: string;
  enabled: boolean;
  requiresConfirmation: boolean;
  disabledReason?: string;
}

export interface WorkbenchTaskRunSummary {
  id: string;
  status: string;
  attempt: number;
  roleId: string;
  runId?: string;
  worktreeId?: string;
  blockedReason?: string;
  failureReason?: string;
}

export interface WorkbenchWorkerLeaseSummary {
  id: string;
  status: string;
  workerId: string;
  claimedAt: string;
  expiresAt: string;
}

export interface WorkbenchTaskNode {
  taskId: string;
  title: string;
  acIds: string[];
  checked: boolean;
  status: WorkbenchTaskNodeStatus;
  taskRun?: WorkbenchTaskRunSummary;
  workerLease?: WorkbenchWorkerLeaseSummary;
  latestEvidence: WorkbenchTaskEvidence[];
  blockers: string[];
  nextAction: WorkbenchTaskNextAction;
}

export interface WorkbenchTaskGraph {
  source: "accepted-tasks" | "missing";
  nodes: WorkbenchTaskNode[];
  changeLevelEvidence: WorkbenchTaskEvidence[];
  warnings: string[];
}

export type WorkbenchCodingPackageExecutionUnit = "single-agent" | "future-parallel-candidate";
export type WorkbenchCodingPackageAssignmentStatus = "suggested" | "not-assigned";
export type WorkbenchCodingPackageSplitReadiness = "likely-single" | "candidate" | "unknown";
export type WorkbenchCodingPackageStatus = "missing" | "suggested" | "blocked" | "evidence-ready" | "readonly";

export interface WorkbenchCodingPackage {
  id: string;
  title: string;
  summary: string;
  taskIds: string[];
  completedTaskIds: string[];
  acIds: string[];
  coveredAcIds: string[];
  missingEvidenceAcIds: string[];
  recommendedRoleId: string;
  executionUnit: WorkbenchCodingPackageExecutionUnit;
  assignmentStatus: WorkbenchCodingPackageAssignmentStatus;
  splitReadiness: WorkbenchCodingPackageSplitReadiness;
  splitRationale: string;
  mergeRisk: string;
  status: WorkbenchCodingPackageStatus;
}

export interface WorkbenchTaskQueueItemSummary {
  id: string;
  taskId: string;
  order: number;
  status: string;
  taskRunId?: string;
  blockedReason?: string;
  failureReason?: string;
}

export interface WorkbenchTaskQueueSummary {
  id: string;
  status: string;
  currentTaskId?: string;
  totalCount: number;
  completedCount: number;
  blockedReason?: string;
  failureReason?: string;
  pausedReason?: string;
  nextAction?: WorkbenchTaskNextAction;
  items: WorkbenchTaskQueueItemSummary[];
}

export interface WorkbenchWorkpad {
  title: string;
  subtitle: string;
  state: "diagnostic" | "empty" | "active" | "readonly";
  intake: WorkpadIntakeSummary;
  progress: WorkpadProgress;
  tasks: WorkpadTaskPreview[];
  codingPackages: WorkbenchCodingPackage[];
  taskGraph: WorkbenchTaskGraph;
  taskQueue?: WorkbenchTaskQueueSummary;
  evidence: WorkpadEvidenceSummary[];
  blockers: string[];
  warnings: string[];
  nextAction: WorkpadNextAction;
  background: WorkpadBackgroundActivitySummary;
  memoryIsolation: WorkpadMemoryIsolationSummary;
}

export interface WorkbenchApprovalAction {
  actionId: string;
  label: string;
  command: string;
  args: string[];
  mutates: boolean;
  requiresConfirmation: boolean;
}

export interface WorkbenchArtifactPreview {
  key: string;
  path: string;
  kind: string;
  exists: boolean;
  sizeBytes?: number;
  preview?: string;
  tail?: string;
  truncated?: boolean;
  diagnostic?: string;
}

export interface WorkbenchStreamPacket {
  run: RunMetadata;
  live: false;
  events: WorkbenchThreadEvent[];
  artifacts: WorkbenchArtifactPreview[];
  diagnostics: string[];
  warnings: string[];
}

export interface WorkbenchRoleSummary {
  id: string;
  name: string;
  profilePath: string;
  writeCapability: "read-only" | "worktree-write" | "deterministic-writer";
  preferredRuntime: string;
  delegatable: boolean;
  humanConfirmation: string;
  sections: string[];
}

export interface HarnessGap {
  id: string;
  severity: HarnessGapSeverity;
  status: HarnessGapStatus;
  recommendedPhase: string;
  summary: string;
}

export interface WorkbenchTopicDetail extends WorkbenchTopicSummary {
  change: ChangeMetadata | null;
  reviewStatus?: string;
  closeGate?: {
    ready: boolean;
    warnings: string[];
    blockingIssues: string[];
  };
  acMap?: Awaited<ReturnType<typeof getChangeStatus>>["acMap"];
  acCount?: number;
  taskCount?: number;
  specTest?: unknown;
  drift?: unknown;
  runs: RunMetadata[];
  taskQueues: TaskQueueRun[];
  taskQueueItems: TaskQueueItem[];
  taskRuns: TaskRun[];
  workerLeases: WorkerLease[];
  worktrees: unknown[];
  validations: unknown[];
  audits: unknown[];
  threadItems: ThreadStreamItem[];
}

export interface WorkbenchSnapshot {
  project: unknown;
  memory: MemoryStatus;
  left: {
    project: unknown;
    memory: MemoryStatus;
    topics: WorkbenchTopicSummary[];
    workpads: WorkbenchWorkpadSummary[];
    repo: {
      path: string;
      exists?: boolean;
      git?: boolean;
      branch?: string | null;
      dirty?: boolean | null;
    };
  };
  center: {
    selectedTopic: WorkbenchTopicDetail | null;
    workpad: WorkbenchWorkpad;
    thread: {
      items: ThreadStreamItem[];
    };
    agentLoop: {
      runs: RunMetadata[];
    };
  };
  right: {
    approvals: WorkbenchApprovalItem[];
    decisions: WorkbenchDecisionItem[];
    decisionInspector: WorkbenchDecisionInspector;
  };
  roles: WorkbenchRoleSummary[];
  harnessGaps: HarnessGap[];
  warnings: string[];
}

const changeMetadataSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  title: z.string(),
  state: z.enum(["active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  archivePath: z.string().nullable(),
});

export async function getWorkbenchSnapshot(input: WorkbenchProjectInput, options: { topicId?: string } = {}): Promise<WorkbenchSnapshot> {
  const memoryStatus = await getMemoryStatus(input.project, input.path);
  const projectStatus = await getProjectStatus(input.project, input.path);
  const memory = await resolveWorkbenchMemory(input);
  const roles = await listWorkbenchRoles();
  const gaps = buildHarnessGaps();
  const warnings: string[] = [];

  if (!input.project) warnings.push("Project is not registered; snapshot is diagnostic only.");
  if (!memoryStatus.managed) warnings.push("Project is not managed by AHO.");
  if (!memoryStatus.memoryAvailable || !memory.supported) {
    warnings.push("Durable memory is unavailable. AHO will not infer project history.");
    const diagnosticWorkpad = buildDiagnosticWorkpad(input.project?.name ?? "未选择项目", warnings, gaps);
    return {
      project: input.project,
      memory: memoryStatus,
      left: {
        project: input.project,
        memory: memoryStatus,
        topics: [],
        workpads: [],
        repo: buildRepoSummary(projectStatus),
      },
      center: { selectedTopic: null, workpad: diagnosticWorkpad, thread: { items: [] }, agentLoop: { runs: [] } },
      right: { approvals: [], decisions: [], decisionInspector: emptyDecisionInspector() },
      roles,
      harnessGaps: gaps,
      warnings,
    };
  }

  const topics = await listWorkbenchTopicsFromMemory(memory);
  const selectedTopic = await selectTopicDetail(input.project, memory, topics, options.topicId);
  const approvals = input.project ? await buildApprovalInbox(input.project, memory, topics) : [];
  const decisions = input.project ? await listWorkbenchDecisions(memory, options.topicId) : [];
  const workpads = await buildMultiWorkpadSummaries(memory, topics, approvals, selectedTopic?.id);
  const workpad = await buildWorkbenchWorkpad({
    project: input.project,
    memory,
    topics,
    workpads,
    selectedTopic,
    approvals,
    decisions,
    warnings,
    gaps,
  });
  const decisionInspector = buildDecisionInspector({
    selectedTopic,
    workpad,
    approvals,
    decisions,
  });
  return {
    project: input.project,
    memory: memoryStatus,
    left: {
      project: input.project,
      memory: memoryStatus,
      topics,
      workpads,
      repo: buildRepoSummary(projectStatus),
    },
    center: {
      selectedTopic,
      workpad,
      thread: { items: selectedTopic?.threadItems ?? [] },
      agentLoop: { runs: selectedTopic?.runs ?? [] },
    },
    right: { approvals, decisions, decisionInspector },
    roles,
    harnessGaps: gaps,
    warnings,
  };
}

export async function listWorkbenchTopics(input: WorkbenchProjectInput): Promise<WorkbenchTopicSummary[]> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.memoryRoot)) return [];
  return listWorkbenchTopicsFromMemory(memory);
}

export async function getWorkbenchTopic(input: WorkbenchProjectInput, topicId: string): Promise<WorkbenchTopicDetail> {
  const memory = await resolveWorkbenchMemory(input);
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const detail = await selectTopicDetail(input.project, memory, topics, topicId);
  if (!detail) throw new Error(`Topic not found: ${topicId}.`);
  return detail;
}

export async function getWorkbenchStream(input: WorkbenchProjectInput, runId: string): Promise<WorkbenchStreamPacket> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.runsRoot)) {
    throw new Error("Durable memory is unavailable; cannot replay run stream.");
  }
  const run = await readRun(memory, runId);
  const events = await readRunEvents(memory, run);
  const { artifacts, diagnostics, warnings } = await summarizeRunArtifacts(memory, run);
  return {
    run,
    live: false,
    events,
    artifacts,
    diagnostics,
    warnings,
  };
}

export async function listWorkbenchApprovals(input: WorkbenchProjectInput, options: { topicId?: string } = {}): Promise<WorkbenchApprovalItem[]> {
  if (!input.project) return [];
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.memoryRoot)) return [];
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const approvals = await buildApprovalInbox(input.project, memory, topics);
  if (!options.topicId) return approvals;
  return approvals.filter((item) => !item.changeId || item.changeId === options.topicId);
}

export async function listWorkbenchRoles(): Promise<WorkbenchRoleSummary[]> {
  const profileRoot = join(dirname(getTemplateRoot()), "agent-profiles");
  if (!existsSync(profileRoot)) return [];
  const entries = await readdir(profileRoot, { withFileTypes: true });
  const roles = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(async (entry) => summarizeRoleProfile(profileRoot, entry.name)));
  return roles.sort((a, b) => a.id.localeCompare(b.id));
}

async function listWorkbenchDecisions(memory: ResolvedMemory, topicId?: string): Promise<WorkbenchDecisionItem[]> {
  if (!memory.projectId) return [];
  const store = await WorkbenchStore.open(memory);
  try {
    return store.listDecisions(memory.projectId, topicId).slice(0, 20).map(mapDecisionRecord);
  } finally {
    store.close();
  }
}

function mapDecisionRecord(record: StoredDecisionRecord): WorkbenchDecisionItem {
  return {
    id: record.id,
    kind: record.decisionType,
    label: record.label,
    status: record.status,
    changeId: record.changeId ?? undefined,
    runId: record.runId ?? undefined,
    targetId: record.targetId ?? undefined,
    artifact: record.artifact ?? undefined,
    summary: record.summary,
    feedback: record.feedback ?? undefined,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt ?? undefined,
  };
}

function buildDiagnosticWorkpad(projectName: string, warnings: string[], gaps: HarnessGap[]): WorkbenchWorkpad {
  return {
    title: "项目 Workpad",
    subtitle: projectName,
    state: "diagnostic",
    intake: {
      goal: "尚未选择可用的 AHO 项目记忆。",
      currentUnderstanding: "Workbench 只能显示诊断信息；需要注册项目并初始化 Harness 后才能读取 Topic、Run 和 evidence。",
      source: "diagnostic",
      relatedArtifacts: [],
      missingInfo: ["Durable memory is unavailable."],
      confirmedConstraints: [],
      openQuestions: [],
      assumptions: [],
      pendingClarifications: [],
    },
    progress: emptyProgress("none"),
    tasks: [],
    codingPackages: [],
    taskGraph: emptyTaskGraph(),
    taskQueue: undefined,
    evidence: [],
    blockers: warnings,
    warnings: gaps.filter((gap) => gap.status !== "available").map((gap) => gap.summary),
    nextAction: {
      id: "diagnostic",
      label: "初始化或选择项目",
      description: "先让项目进入 AHO 管理范围，再创建 Change Workpad。",
      kind: "read-only",
      enabled: false,
      requiresConfirmation: false,
      disabledReason: "当前 snapshot 没有可写的项目记忆。",
    },
    background: emptyWorkpadBackground(),
    memoryIsolation: diagnosticMemoryIsolation(warnings),
  };
}

async function buildWorkbenchWorkpad(input: {
  project: ManagedProject | null;
  memory: ResolvedMemory;
  topics: WorkbenchTopicSummary[];
  workpads: WorkbenchWorkpadSummary[];
  selectedTopic: WorkbenchTopicDetail | null;
  approvals: WorkbenchApprovalItem[];
  decisions: WorkbenchDecisionItem[];
  warnings: string[];
  gaps: HarnessGap[];
}): Promise<WorkbenchWorkpad> {
  const { project, memory, topics, workpads, selectedTopic, approvals, decisions, warnings, gaps } = input;
  if (!selectedTopic) {
    return {
      title: "项目 Workpad",
      subtitle: project?.name ?? "未选择项目",
      state: "empty",
      intake: {
        goal: topics.length > 0 ? "选择一个 Topic 查看 Change Workpad。" : "还没有 Topic / Change。",
        currentUnderstanding: topics.length > 0
          ? `当前项目有 ${topics.length} 个 Topic，可从左侧选择继续。`
          : "输入需求后，AHO 会创建 Topic/Change 并把后续 Spec、Plan、Run、Evidence 汇总到 Workpad。",
        source: "project",
        relatedArtifacts: [],
        missingInfo: topics.length > 0 ? [] : ["No Topic exists yet."],
        confirmedConstraints: [],
        openQuestions: [],
        assumptions: [],
        pendingClarifications: [],
      },
      progress: emptyProgress("none"),
      tasks: [],
      codingPackages: [],
      taskGraph: emptyTaskGraph(),
      taskQueue: undefined,
      evidence: approvals.slice(0, 5).map(approvalWorkpadEvidence),
      blockers: warnings,
      warnings: gaps.filter((gap) => gap.status !== "available").map((gap) => gap.summary),
      nextAction: {
        id: "create-topic",
        label: "输入需求创建 Topic",
        description: "在底部输入自然语言需求，创建新的 Change Workpad。",
        kind: "read-only",
        enabled: true,
        requiresConfirmation: false,
      },
      background: buildWorkpadBackground(workpads, undefined),
      memoryIsolation: buildWorkpadMemoryIsolation(memory, null, workpads),
    };
  }

  const [specReady, planReady, tasksReady] = await Promise.all([
    isConcreteChangeFile(memory, selectedTopic.path, "spec.md"),
    isConcreteChangeFile(memory, selectedTopic.path, "plan.md"),
    isConcreteChangeFile(memory, selectedTopic.path, "tasks.md"),
  ]);
  const topicApprovals = approvals.filter((approval) => !approval.changeId || approval.changeId === selectedTopic.id);
  const topicDecisions = decisions.filter((decision) => !decision.changeId || decision.changeId === selectedTopic.id);
  const latestRun = [...selectedTopic.runs].sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""))[0];
  const latestValidation = [...(selectedTopic.validations as ValidationSummary[])].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  const latestAudit = [...(selectedTopic.audits as AuditSummary[])].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  const intake = buildWorkpadIntake(selectedTopic);
  const taskQueue = buildTaskQueueSummary(selectedTopic, { specReady, planReady, tasksReady });
  const taskGraph = buildTaskGraph(selectedTopic, { specReady, planReady, tasksReady }, taskQueue);
  const codingPackages = buildCodingPackages(selectedTopic, taskGraph);

  return {
    title: selectedTopic.title,
    subtitle: `${project?.name ?? "project"} · ${stateLabelForWorkpad(selectedTopic.state)} · ${selectedTopic.id}`,
    state: selectedTopic.state === "active" ? "active" : "readonly",
    intake,
    progress: {
      topicState: selectedTopic.state,
      spec: specReady ? "ready" : "missing",
      plan: planReady ? "ready" : "missing",
      tasks: tasksReady ? "ready" : "missing",
      acCount: selectedTopic.acCount ?? 0,
      taskCount: selectedTopic.taskCount ?? 0,
      runCount: selectedTopic.runs.length,
      latestRunStatus: latestRun?.status,
      validationStatus: latestValidation?.status,
      auditStatus: latestAudit?.status,
    },
    tasks: taskGraph.nodes.map(taskNodeToPreview),
    codingPackages,
    taskGraph,
    taskQueue,
    evidence: buildWorkpadEvidence(selectedTopic, topicApprovals, topicDecisions),
    blockers: [
      ...(selectedTopic.closeGate?.blockingIssues ?? []),
      ...(selectedTopic.closeGate?.warnings ?? []),
      ...warnings,
    ],
    warnings: [
      ...workpadMissingWarnings(specReady, planReady, tasksReady, selectedTopic),
      ...gaps.filter((gap) => gap.status !== "available").map((gap) => gap.summary),
    ],
    nextAction: buildWorkpadNextAction(selectedTopic, topicApprovals, { specReady, planReady, tasksReady }, intake, taskQueue, taskGraph),
    background: buildWorkpadBackground(workpads, selectedTopic.id),
    memoryIsolation: buildWorkpadMemoryIsolation(memory, selectedTopic, workpads),
  };
}

function emptyProgress(topicState: WorkpadProgress["topicState"]): WorkpadProgress {
  return {
    topicState,
    spec: "unknown",
    plan: "unknown",
    tasks: "unknown",
    acCount: 0,
    taskCount: 0,
    runCount: 0,
  };
}

function emptyWorkpadBackground(): WorkpadBackgroundActivitySummary {
  return {
    totalCount: 0,
    runningCount: 0,
    queuedCount: 0,
    blockedCount: 0,
    waitingDecisionCount: 0,
    items: [],
  };
}

function buildWorkpadBackground(workpads: WorkbenchWorkpadSummary[], selectedId: string | undefined): WorkpadBackgroundActivitySummary {
  const backgroundItems = workpads.filter((item) => item.id !== selectedId && ["running", "queued", "blocked", "waiting-decision"].includes(item.runtimeStatus));
  return {
    totalCount: workpads.length,
    runningCount: backgroundItems.filter((item) => item.runtimeStatus === "running").length,
    queuedCount: backgroundItems.filter((item) => item.runtimeStatus === "queued").length,
    blockedCount: backgroundItems.filter((item) => item.runtimeStatus === "blocked").length,
    waitingDecisionCount: backgroundItems.filter((item) => item.runtimeStatus === "waiting-decision").length,
    items: backgroundItems.slice(0, 6),
  };
}

function diagnosticMemoryIsolation(warnings: string[]): WorkpadMemoryIsolationSummary {
  return {
    projectStableNamespace: "project/stable",
    agentSessionNamespace: "agent/{roleId}/session/{sessionId}",
    runNamespaces: [],
    relatedWorkpads: [],
    stableFactSources: [],
    writeBoundaries: [],
    warnings: ["Durable memory is unavailable; AHO must not infer hidden project history.", ...warnings],
  };
}

function buildWorkpadMemoryIsolation(memory: ResolvedMemory, selectedTopic: WorkbenchTopicDetail | null, workpads: WorkbenchWorkpadSummary[]): WorkpadMemoryIsolationSummary {
  const relatedWorkpads = workpads
    .filter((item) => item.id !== selectedTopic?.id && ["running", "queued", "blocked", "waiting-decision"].includes(item.runtimeStatus))
    .slice(0, 6)
    .map((item): WorkpadRelatedMemorySummary => ({
      changeId: item.id,
      title: item.title,
      status: item.runtimeStatus,
      factBoundary: item.runtimeStatus === "running" || item.runtimeStatus === "queued" ? "local-evidence-only" : "summary-only",
    }));
  const warnings: string[] = [
    "Running Workpad proposals, diffs, stdout/stderr, JSONL, and process metadata are not project stable facts.",
    "Memory consolidation candidates and conflict review are future human-gated workflows.",
  ];
  if (!memory.supported || !existsSync(memory.memoryRoot)) warnings.unshift("Durable memory is unavailable; initialize, sync, or repair memory before relying on history.");
  return {
    projectStableNamespace: "project/stable",
    currentChangeNamespace: selectedTopic ? `change/${selectedTopic.id}` : undefined,
    runNamespaces: selectedTopic ? selectedTopic.runs.slice(0, 5).map((run) => `run/${run.id}`) : [],
    agentSessionNamespace: "agent/{roleId}/session/{sessionId}",
    relatedWorkpads,
    stableFactSources: [
      "applied source changes",
      "accepted spec / plan / tasks",
      "accepted architecture / product docs",
      "accepted Harness evolution results",
      "explicit human memory accepts",
    ],
    writeBoundaries: [
      "coder-agent writes assigned worktree proposal and run artifacts only",
      "orchestrator writes selected Workpad thread / decision / summary projection",
      "validator and auditor write validation / audit artifacts",
      "project/stable absorbs only human-gated stable facts",
    ],
    warnings,
  };
}

function emptyTaskGraph(): WorkbenchTaskGraph {
  return {
    source: "missing",
    nodes: [],
    changeLevelEvidence: [],
    warnings: [],
  };
}

function buildCodingPackages(topic: WorkbenchTopicDetail, taskGraph: WorkbenchTaskGraph): WorkbenchCodingPackage[] {
  if (taskGraph.nodes.length === 0) return [];
  const pendingTasks = taskGraph.nodes.filter((node) => !node.checked);
  const completedTasks = taskGraph.nodes.filter((node) => node.checked);
  const packageTasks = pendingTasks.length > 0 ? pendingTasks : taskGraph.nodes;
  const taskIds = packageTasks.map((node) => node.taskId);
  const completedTaskIds = completedTasks.map((node) => node.taskId);
  const acIds = uniqueStrings(taskGraph.nodes.flatMap((node) => node.acIds));
  const coveredAcIds = uniqueStrings(taskGraph.nodes
    .filter((node) => node.checked || node.latestEvidence.length > 0)
    .flatMap((node) => node.acIds));
  const missingEvidenceAcIds = acIds.filter((acId) => !coveredAcIds.includes(acId));
  const blocked = packageTasks.some((node) => node.status === "blocked");
  const hasEvidence = packageTasks.some((node) => node.latestEvidence.length > 0 || node.status === "evidence-ready" || node.status === "checked");
  const status: WorkbenchCodingPackageStatus = topic.state !== "active"
    ? "readonly"
    : blocked
      ? "blocked"
      : pendingTasks.length === 0 && hasEvidence
        ? "evidence-ready"
        : "suggested";
  const splitReadiness = codingPackageSplitReadiness(packageTasks);
  const executionUnit: WorkbenchCodingPackageExecutionUnit = splitReadiness === "candidate" ? "future-parallel-candidate" : "single-agent";
  return [{
    id: `coding-package:${topic.id}:implementation`,
    title: `${topic.title} implementation package`,
    summary: pendingTasks.length > 0
      ? `默认由一个 coder-agent 处理 ${pendingTasks.length} 个未勾选任务，并把已勾选任务作为上下文和 evidence。`
      : "当前 accepted tasks 均已勾选；该 package 只保留为完成上下文和 evidence 汇总。",
    taskIds,
    completedTaskIds,
    acIds,
    coveredAcIds,
    missingEvidenceAcIds,
    recommendedRoleId: "coder-agent",
    executionUnit,
    assignmentStatus: pendingTasks.length > 0 ? "suggested" : "not-assigned",
    splitReadiness,
    splitRationale: codingPackageSplitRationale(splitReadiness, packageTasks),
    mergeRisk: codingPackageMergeRisk(splitReadiness),
    status,
  }];
}

function codingPackageSplitReadiness(tasks: WorkbenchTaskNode[]): WorkbenchCodingPackageSplitReadiness {
  if (tasks.length === 0) return "unknown";
  if (tasks.length === 1) return "likely-single";
  const mappedTasks = tasks.filter((task) => task.acIds.length > 0);
  if (mappedTasks.length !== tasks.length) return "likely-single";
  const seen = new Set<string>();
  for (const task of mappedTasks) {
    for (const acId of task.acIds) {
      if (seen.has(acId)) return "likely-single";
      seen.add(acId);
    }
  }
  return "candidate";
}

function codingPackageSplitRationale(readiness: WorkbenchCodingPackageSplitReadiness, tasks: WorkbenchTaskNode[]): string {
  if (readiness === "candidate") return "这些未完成任务映射到不同 AC，未来可作为并行 worktree 候选；5Y 仍不自动拆分执行。";
  if (readiness === "unknown") return "缺少任务/AC 映射，无法判断是否适合拆分。";
  return tasks.length <= 1
    ? "当前只有一个主要待执行任务，默认不拆分。"
    : "多个任务仍属于同一个需求实现包，先由一个 coder-agent 处理，避免过早引入拆分和合并成本。";
}

function codingPackageMergeRisk(readiness: WorkbenchCodingPackageSplitReadiness): string {
  if (readiness === "candidate") return "未来并行执行需要 integration worktree、aggregate validation/audit 和 merge/rework 链路。";
  if (readiness === "unknown") return "拆分风险未知；保持单 agent 执行更稳妥。";
  return "单 agent work package 的合并风险较低；TaskGraph 用于检查覆盖和 evidence，不强制拆分 coder。";
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function emptyDecisionInspector(): WorkbenchDecisionInspector {
  return {
    primary: null,
    related: [],
    history: [],
  };
}

function buildWorkpadIntake(topic: WorkbenchTopicDetail): WorkpadIntakeSummary {
  const firstUser = topic.threadItems.find((item) => item.kind === "user-message" && item.body?.trim());
  const latestAssistant = [...topic.threadItems].reverse().find((item) => (item.kind === "assistant-turn" || item.kind === "assistant-message") && item.body?.trim());
  const latestIteration = [...topic.threadItems].reverse().find((item) => item.intake?.iteration)?.intake?.iteration;
  const latestScan = [...topic.threadItems].reverse().find((item) => item.intake?.scan)?.intake?.scan;
  const clarifications = topic.threadItems
    .map((item) => item.clarification)
    .filter((item): item is ClarificationRequest => Boolean(item));
  const latestClarificationById = new Map<string, ClarificationRequest>();
  for (const clarification of clarifications) latestClarificationById.set(clarification.id, clarification);
  const pendingClarifications = [...latestClarificationById.values()].filter((item) => item.status === "pending");
  const artifacts = topic.threadItems
    .map((item) => item.artifact ?? item.intake?.scan?.runId)
    .filter((artifact): artifact is string => Boolean(artifact))
    .slice(0, 5);
  return {
    goal: firstUser?.body?.trim() || topic.change?.title || topic.title,
    currentUnderstanding: latestIteration?.currentUnderstanding || latestAssistant?.body?.trim() || "等待 AHO 基于当前 Topic 事实继续推进。",
    source: latestScan ? "thread" : firstUser ? "thread" : "topic",
    relatedArtifacts: artifacts,
    missingInfo: [
      ...(topic.state === "active" ? [] : ["Topic is read-only because it is not active."]),
      ...(latestIteration?.openQuestions ?? latestScan?.missingInfo ?? []),
    ],
    confirmedConstraints: latestIteration?.confirmedConstraints ?? [],
    openQuestions: latestIteration?.openQuestions ?? [],
    assumptions: latestIteration?.assumptions ?? [],
    pendingClarifications,
  };
}

function taskNodeToPreview(node: WorkbenchTaskNode): WorkpadTaskPreview {
  return {
    id: node.taskId,
    title: node.title,
    done: node.checked,
    acIds: node.acIds,
    warnings: node.blockers,
  };
}

function buildTaskQueueSummary(
  topic: WorkbenchTopicDetail,
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
): WorkbenchTaskQueueSummary | undefined {
  const queue = [...(topic.taskQueues ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const disabledReason = taskActionDisabledReason(topic, readiness, false);
  const queueActionType = queue?.status === "paused" ? "task.queue.start" : "task.queue.reconcile";
  const baseAction: WorkbenchTaskNextAction | undefined = queue
    ? {
        id: `task-queue:${queue.id}:${queueActionType}`,
        label: queue.status === "paused" ? "恢复队列状态" : "刷新执行状态",
        actionType: queueActionType,
        enabled: topic.state === "active",
        requiresConfirmation: true,
        disabledReason: topic.state === "active" ? undefined : "Topic is not active.",
      }
    : {
        id: "task-queue:start",
        label: "运行任务队列",
        actionType: "task.queue.start",
        enabled: !disabledReason,
        requiresConfirmation: true,
        disabledReason,
      };
  if (!queue) return {
    id: "none",
    status: "none",
    totalCount: topic.acMap?.tasks.filter((task) => !task.done).length ?? 0,
    completedCount: 0,
    nextAction: baseAction,
    items: [],
  };
  const items = topic.taskQueueItems
    .filter((item) => item.queueRunId === queue.id)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      id: item.id,
      taskId: item.taskId,
      order: item.order,
      status: item.status,
      taskRunId: item.taskRunId,
      blockedReason: item.blockedReason,
      failureReason: item.failureReason,
    }));
  return {
    id: queue.id,
    status: queue.status,
    currentTaskId: queue.currentTaskId,
    totalCount: queue.totalCount,
    completedCount: queue.completedCount,
    blockedReason: queue.blockedReason,
    failureReason: queue.failureReason,
    pausedReason: queue.pausedReason,
    nextAction: baseAction,
    items,
  };
}

function buildTaskGraph(
  topic: WorkbenchTopicDetail,
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  queue?: WorkbenchTaskQueueSummary,
): WorkbenchTaskGraph {
  if (!topic.acMap || topic.acMap.tasks.length === 0) return emptyTaskGraph();

  const coderRuns = topic.runs.filter((run) => run.runtime === "coder-codex");
  const taskScopedCoderRuns = coderRuns.filter((run) => (run.taskIds?.length ?? 0) > 0);
  const taskRuns = topic.taskRuns ?? [];
  const workerLeases = topic.workerLeases ?? [];
  const taskIds = new Set(topic.acMap.tasks.map((task) => task.id));
  const worktreeTaskIds = new Map<string, string[]>();
  for (const run of taskScopedCoderRuns) {
    const worktreeId = run.worktree?.worktreeId;
    if (!worktreeId) continue;
    worktreeTaskIds.set(worktreeId, (run.taskIds ?? []).filter((taskId) => taskIds.has(taskId)));
  }

  const validations = topic.validations as ValidationSummary[];
  const audits = topic.audits as AuditSummary[];
  const matchedValidationIds = new Set<string>();
  const matchedAuditIds = new Set<string>();

  const nodes = topic.acMap.tasks.map((task) => {
    const runs = taskScopedCoderRuns.filter((run) => run.taskIds?.includes(task.id));
    const taskRunAttempts = taskRuns.filter((run) => run.taskId === task.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latestTaskRun = taskRunAttempts[0];
    const latestLease = latestTaskRun?.leaseId ? workerLeases.find((lease) => lease.id === latestTaskRun.leaseId) : undefined;
    const running = taskRunAttempts.some((run) => isActiveTaskRunStatus(run.status)) || runs.some((run) => run.status === "created" || run.status === "running");
    const worktreeIds = new Set(runs.map((run) => run.worktree?.worktreeId).filter((item): item is string => Boolean(item)));
    const taskValidations = validations.filter((validation) => Boolean(validation.worktreeId && worktreeIds.has(validation.worktreeId)));
    const taskAudits = audits.filter((audit) => Boolean(audit.worktreeId && worktreeIds.has(audit.worktreeId)));
    taskValidations.forEach((validation) => matchedValidationIds.add(validation.id));
    taskAudits.forEach((audit) => matchedAuditIds.add(audit.id));

    const evidence = [
      ...runs.map(taskRunEvidence),
      ...taskValidations.map(taskValidationEvidence),
      ...taskAudits.map(taskAuditEvidence),
    ].sort(compareEvidenceDesc).slice(0, 6);
    const queueActiveForTask = isQueueActiveForTask(queue, task.id);
    const blockers = buildTaskBlockers(topic, readiness, runs, taskValidations, taskAudits, running || queueActiveForTask, latestTaskRun, queueActiveForTask);
    const status: WorkbenchTaskNodeStatus = task.done
      ? "checked"
      : running
        ? "running"
        : latestTaskRun?.status === "blocked" || latestTaskRun?.status === "failed" || blockers.some((item) => item.includes("failed") || item.includes("blocked") || item.includes("失败") || item.includes("阻塞") || item.includes("前置条件"))
          ? "blocked"
          : latestTaskRun?.status === "completed" || evidence.length > 0
            ? "evidence-ready"
            : "planned";

    return {
      taskId: task.id,
      title: task.text,
      acIds: task.acIds,
      checked: task.done,
      status,
      taskRun: latestTaskRun ? summarizeTaskRun(latestTaskRun) : undefined,
      workerLease: latestLease ? summarizeWorkerLease(latestLease) : undefined,
      latestEvidence: evidence,
      blockers,
      nextAction: buildTaskNextAction(topic, readiness, task.id, running, latestTaskRun, queueActiveForTask),
    };
  });

  const changeLevelEvidence = [
    ...coderRuns.filter((run) => !run.taskIds?.length).map(taskRunEvidence),
    ...validations.filter((validation) => !validation.worktreeId || !worktreeTaskIds.has(validation.worktreeId) || !matchedValidationIds.has(validation.id)).map(taskValidationEvidence),
    ...audits.filter((audit) => !audit.worktreeId || !worktreeTaskIds.has(audit.worktreeId) || !matchedAuditIds.has(audit.id)).map(taskAuditEvidence),
  ].sort(compareEvidenceDesc).slice(0, 8);

  return {
    source: "accepted-tasks",
    nodes,
    changeLevelEvidence,
    warnings: [],
  };
}

function isQueueActiveForTask(queue: WorkbenchTaskQueueSummary | undefined, taskId: string): boolean {
  if (!queue || queue.status === "none") return false;
  if (!["queued", "running", "paused"].includes(queue.status)) return false;
  return queue.items.length === 0 || queue.items.some((item) => item.taskId === taskId && (item.status === "queued" || item.status === "running"));
}

function summarizeTaskRun(taskRun: TaskRun): WorkbenchTaskRunSummary {
  return {
    id: taskRun.id,
    status: taskRun.status,
    attempt: taskRun.attempt,
    roleId: taskRun.roleId,
    runId: taskRun.runId,
    worktreeId: taskRun.worktreeId,
    blockedReason: taskRun.blockedReason,
    failureReason: taskRun.failureReason,
  };
}

function summarizeWorkerLease(lease: WorkerLease): WorkbenchWorkerLeaseSummary {
  return {
    id: lease.id,
    status: lease.status,
    workerId: lease.workerId,
    claimedAt: lease.claimedAt,
    expiresAt: lease.expiresAt,
  };
}

function taskRunEvidence(run: RunMetadata): WorkbenchTaskEvidence {
  return {
    id: `run:${run.id}`,
    label: `Coder ${run.status}`,
    source: "run",
    status: run.status,
    runId: run.id,
    worktreeId: run.worktree?.worktreeId,
    artifact: run.artifacts.directory,
    timestamp: run.finishedAt ?? run.startedAt,
  };
}

function taskValidationEvidence(validation: ValidationSummary): WorkbenchTaskEvidence {
  return {
    id: `validation:${validation.id}`,
    label: `Validation ${validation.status}`,
    source: "validation",
    status: validation.status,
    runId: validation.runId,
    worktreeId: validation.worktreeId,
    timestamp: validation.finishedAt,
  };
}

function taskAuditEvidence(audit: AuditSummary): WorkbenchTaskEvidence {
  return {
    id: `audit:${audit.id}`,
    label: `Audit ${audit.status}`,
    source: "audit",
    status: audit.status,
    runId: audit.runId,
    worktreeId: audit.worktreeId,
    timestamp: audit.finishedAt,
  };
}

function compareEvidenceDesc(a: WorkbenchTaskEvidence, b: WorkbenchTaskEvidence): number {
  return (b.timestamp ?? "").localeCompare(a.timestamp ?? "");
}

function buildTaskBlockers(
  topic: WorkbenchTopicDetail,
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  runs: RunMetadata[],
  validations: ValidationSummary[],
  audits: AuditSummary[],
  running: boolean,
  latestTaskRun?: TaskRun,
  queueActiveForTask = false,
): string[] {
  const blockers: string[] = [];
  if (topic.state !== "active") blockers.push("Topic is read-only.");
  if (!readiness.specReady || !readiness.planReady || !readiness.tasksReady) blockers.push("前置条件未满足：需要 accepted Spec / Plan / Tasks。");
  if (queueActiveForTask) blockers.push("任务队列正在运行或等待恢复。");
  else if (running) blockers.push("已有该任务的运行正在进行。");
  const latestRun = [...runs].sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""))[0];
  const latestValidation = [...validations].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  const latestAudit = [...audits].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  if (latestRun?.status === "failed") blockers.push("Coder run failed.");
  if (latestValidation?.status === "failed") blockers.push("Validation failed.");
  if (latestAudit?.status === "blocked" || latestAudit?.status === "failed") blockers.push(`Audit ${latestAudit.status}.`);
  if (latestTaskRun?.blockedReason) blockers.push(latestTaskRun.blockedReason);
  if (latestTaskRun?.failureReason) blockers.push(latestTaskRun.failureReason);
  return blockers;
}

function buildTaskNextAction(
  topic: WorkbenchTopicDetail,
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  taskId: string,
  running: boolean,
  latestTaskRun?: TaskRun,
  queueActiveForTask = false,
): WorkbenchTaskNextAction {
  const disabledReason = queueActiveForTask ? "任务队列正在运行或等待恢复。" : taskActionDisabledReason(topic, readiness, running);
  if ((latestTaskRun?.status === "blocked" || latestTaskRun?.status === "failed") && !disabledReason) {
    return {
      id: `task:${taskId}:task.run.retry:${latestTaskRun.id}`,
      label: "重试此任务",
      actionType: "task.run.retry",
      taskIds: [taskId],
      taskRunId: latestTaskRun.id,
      enabled: true,
      requiresConfirmation: true,
    };
  }
  return {
    id: `task:${taskId}:task.run.start`,
    label: "运行此任务",
    actionType: "task.run.start",
    taskIds: [taskId],
    enabled: !disabledReason,
    requiresConfirmation: true,
    disabledReason,
  };
}

function taskActionDisabledReason(
  topic: WorkbenchTopicDetail,
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  running: boolean,
): string | undefined {
  if (topic.state !== "active") return "Topic is not active.";
  if (!readiness.specReady) return "先接受 Spec。";
  if (!readiness.planReady) return "先接受 Plan。";
  if (!readiness.tasksReady) return "先接受 Tasks。";
  if (running) return "该任务已有运行中 workflow。";
  return undefined;
}

function buildWorkpadEvidence(topic: WorkbenchTopicDetail, approvals: WorkbenchApprovalItem[], decisions: WorkbenchDecisionItem[]): WorkpadEvidenceSummary[] {
  const runEvidence = topic.runs.slice(-3).map((run) => ({
    id: `run:${run.id}`,
    label: `${run.runtime} · ${run.status}`,
    source: "run" as const,
    status: run.status,
    artifact: run.artifacts?.directory,
    timestamp: run.finishedAt ?? run.startedAt,
  }));
  const validationEvidence = (topic.validations as ValidationSummary[]).slice(-3).map((validation) => ({
    id: `validation:${validation.id}`,
    label: `Validation ${validation.status}`,
    source: "validation" as const,
    status: validation.status,
    timestamp: validation.finishedAt,
  }));
  const auditEvidence = (topic.audits as AuditSummary[]).slice(-3).map((audit) => ({
    id: `audit:${audit.id}`,
    label: `Audit ${audit.status}`,
    source: "audit" as const,
    status: audit.status,
    timestamp: audit.finishedAt,
  }));
  const decisionEvidence = decisions.slice(0, 5).map((decision) => ({
    id: `decision:${decision.id}`,
    label: decision.label,
    source: "decision" as const,
    status: decision.status,
    artifact: decision.artifact,
    timestamp: decision.completedAt ?? decision.updatedAt,
  }));
  const approvalEvidence = approvals.slice(0, 3).map(approvalWorkpadEvidence);
  return [...approvalEvidence, ...decisionEvidence, ...auditEvidence, ...validationEvidence, ...runEvidence]
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
    .slice(0, 8);
}

function approvalWorkpadEvidence(approval: WorkbenchApprovalItem): WorkpadEvidenceSummary {
  return {
    id: `approval:${approval.id}`,
    label: approval.label,
    source: "approval",
    status: approval.severity,
    artifact: approval.artifact,
  };
}

function workpadMissingWarnings(specReady: boolean, planReady: boolean, tasksReady: boolean, topic: WorkbenchTopicDetail): string[] {
  const warnings: string[] = [];
  if (!specReady) warnings.push("Spec 尚未生成或未被接受。");
  if (specReady && !planReady) warnings.push("Plan 尚未生成或未被接受。");
  if (planReady && !tasksReady) warnings.push("Tasks 尚未生成或未被接受。");
  if ((topic.acCount ?? 0) === 0) warnings.push("当前没有可用 AC 计数。");
  return warnings;
}

function buildWorkpadNextAction(
  topic: WorkbenchTopicDetail,
  approvals: WorkbenchApprovalItem[],
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  intake?: WorkpadIntakeSummary,
  queue?: WorkbenchTaskQueueSummary,
  taskGraph?: WorkbenchTaskGraph,
): WorkpadNextAction {
  if (topic.state !== "active") {
    return {
      id: "readonly-topic",
      label: "只读查看历史",
      description: "归档或暂停 Topic 只能查看 Thread、Evidence 和 Run Replay。",
      kind: "none",
      enabled: false,
      requiresConfirmation: false,
      disabledReason: "Topic is not active.",
    };
  }
  const queueBlockedAction = buildQueueBlockedNextAction(queue, taskGraph);
  if (queueBlockedAction) return queueBlockedAction;
  const actionableApproval = approvals.find((approval) => approval.action);
  if (actionableApproval) {
    return {
      id: `approval:${actionableApproval.id}`,
      label: actionableApproval.action?.label ?? actionableApproval.label,
      description: actionableApproval.reason ?? actionableApproval.label,
      kind: "approval",
      enabled: true,
      requiresConfirmation: actionableApproval.action?.requiresConfirmation ?? true,
      approvalId: actionableApproval.id,
    };
  }
  if (!readiness.specReady && !topic.runs.some((run) => run.runtime === "intake-scan")) {
    return workflowNextAction("intake.scan", "分析需求", "先只读扫描项目，整理当前理解、相关文件和待确认问题。", false);
  }
  if (!readiness.specReady && (intake?.pendingClarifications.length || intake?.openQuestions.length)) {
    return workflowNextAction("intake.reanalyze", "继续澄清需求", "回答需要确认的问题，AHO 会更新当前理解。", false);
  }
  if (!readiness.specReady) return workflowNextAction("change.spec.propose", "生成 Spec", "先生成需求和验收标准 proposal。");
  if (!readiness.planReady) return workflowNextAction("change.plan.propose", "生成 Plan", "基于已接受 Spec 生成实现计划。");
  if (!readiness.tasksReady) return workflowNextAction("change.plan.propose", "生成 Tasks", "补齐可执行任务和 AC 映射。");
  return workflowNextAction("code.run", "运行 Code", "基于已接受 Spec / Plan / Tasks 运行受控代码工作流。");
}

function buildQueueBlockedNextAction(queue?: WorkbenchTaskQueueSummary, taskGraph?: WorkbenchTaskGraph): WorkpadNextAction | null {
  if (!queue || !["blocked", "failed"].includes(queue.status)) return null;
  const blockedTask = taskGraph?.nodes.find((node) => node.taskId === queue.currentTaskId) ?? taskGraph?.nodes.find((node) => node.status === "blocked");
  const retry = blockedTask?.nextAction.actionType === "task.run.retry" && blockedTask.nextAction.enabled ? blockedTask.nextAction : null;
  if (retry) {
    return {
      id: `decision:${queue.id}:${blockedTask?.taskId}:retry`,
      label: "重试阻塞任务",
      description: queue.blockedReason ?? blockedTask?.blockers[0] ?? "任务队列已阻塞，需要重试当前任务或查看证据。",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: retry.requiresConfirmation,
      actionType: "task.run.retry",
      taskIds: retry.taskIds,
      taskRunId: retry.taskRunId,
    };
  }
  const reconcile = queue.nextAction?.actionType;
  if (reconcile) {
    return {
      id: `decision:${queue.id}:reconcile`,
      label: "刷新执行状态",
      description: queue.blockedReason ?? queue.failureReason ?? "任务队列已阻塞，先刷新 durable evidence 状态。",
      kind: "workflow-action",
      enabled: queue.nextAction?.enabled ?? true,
      requiresConfirmation: queue.nextAction?.requiresConfirmation ?? true,
      actionType: reconcile,
      disabledReason: queue.nextAction?.disabledReason,
    };
  }
  return {
    id: `decision:${queue.id}:blocked`,
    label: "查看阻塞任务",
    description: queue.blockedReason ?? queue.failureReason ?? "任务队列已阻塞，需要查看 evidence。",
    kind: "read-only",
    enabled: false,
    requiresConfirmation: false,
    disabledReason: "当前没有可执行的 retry/reconcile 路径。",
  };
}

function workflowNextAction(actionType: ThreadStreamAction["actionType"], label: string, description: string, requiresConfirmation = true): WorkpadNextAction {
  return {
    id: `workflow:${actionType}`,
    label,
    description,
    kind: "workflow-action",
    actionType,
    enabled: true,
    requiresConfirmation,
  };
}

function buildDecisionInspector(input: {
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
  approvals: WorkbenchApprovalItem[];
  decisions: WorkbenchDecisionItem[];
}): WorkbenchDecisionInspector {
  const contexts: WorkbenchDecisionContext[] = [];
  if (input.selectedTopic) {
    contexts.push(...queueDecisionContexts(input.selectedTopic, input.workpad));
    contexts.push(...taskDecisionContexts(input.selectedTopic, input.workpad));
    contexts.push(...latestValidationAuditContexts(input.selectedTopic));
  }

  const hasCurrentBlocker = contexts.some((context) => ["queue-blocker", "task-blocker", "validation-failed", "audit-blocked"].includes(context.kind));
  const approvalContexts = input.approvals.map((approval) => approvalDecisionContext(approval));
  for (const context of approvalContexts) {
    if (hasCurrentBlocker && context.kind === "audit-approved") contexts.push({ ...context, kind: "history", severity: "info" });
    else contexts.push(context);
  }

  const decisionHistory = input.decisions.map(decisionHistoryContext);
  const current = contexts.filter((context) => context.kind !== "history");
  const primary = current.sort(compareDecisionContexts)[0] ?? null;
  const related = current.filter((context) => context.id !== primary?.id).sort(compareDecisionContexts);
  const history = [
    ...contexts.filter((context) => context.kind === "history"),
    ...decisionHistory,
  ].sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  return { primary, related, history };
}

function queueDecisionContexts(topic: WorkbenchTopicDetail, workpad: WorkbenchWorkpad): WorkbenchDecisionContext[] {
  const queue = workpad.taskQueue;
  if (!queue || !["blocked", "failed"].includes(queue.status)) return [];
  const task = workpad.taskGraph.nodes.find((node) => node.taskId === queue.currentTaskId) ?? workpad.taskGraph.nodes.find((node) => node.status === "blocked");
  return [{
    id: `queue:${queue.id}:blocked`,
    kind: "queue-blocker",
    title: `任务队列已阻塞${task ? `：${task.taskId}` : ""}`,
    summary: queue.blockedReason ?? queue.failureReason ?? task?.blockers[0] ?? "队列停在阻塞任务，等待你查看证据或重试。",
    severity: "blocking",
    changeId: topic.id,
    taskId: task?.taskId ?? queue.currentTaskId,
    taskRunId: task?.taskRun?.id,
    queueRunId: queue.id,
    runId: task?.taskRun?.runId,
    actions: decisionActionsForQueueBlocker(queue, task),
  }];
}

function taskDecisionContexts(topic: WorkbenchTopicDetail, workpad: WorkbenchWorkpad): WorkbenchDecisionContext[] {
  return workpad.taskGraph.nodes
    .filter((task) => task.status === "blocked")
    .map((task) => ({
      id: `task:${task.taskId}:blocked`,
      kind: "task-blocker" as const,
      title: `任务阻塞：${task.taskId}`,
      summary: task.blockers[0] ?? "该任务需要处理阻塞后才能继续。",
      severity: "blocking" as const,
      changeId: topic.id,
      taskId: task.taskId,
      taskRunId: task.taskRun?.id,
      runId: task.taskRun?.runId,
      timestamp: latestTaskEvidenceTimestamp(task),
      actions: decisionActionsForTaskBlocker(task),
    }));
}

function latestValidationAuditContexts(topic: WorkbenchTopicDetail): WorkbenchDecisionContext[] {
  const validations = (topic.validations as ValidationSummary[]).sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
  const audits = (topic.audits as AuditSummary[]).sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
  const contexts: WorkbenchDecisionContext[] = [];
  const validation = validations[0];
  if (validation?.status === "failed") {
    contexts.push({
      id: `validation:${validation.id}:failed`,
      kind: "validation-failed",
      title: `Validation failed: ${validation.id}`,
      summary: "Validation failed and blocks safe progress.",
      severity: "blocking",
      changeId: topic.id,
      targetId: validation.id,
      runId: validation.runId,
      timestamp: validation.finishedAt,
      actions: evidenceActions(undefined),
    });
  }
  const audit = audits[0];
  if (audit?.status === "blocked" || audit?.status === "failed") {
    contexts.push({
      id: `audit:${audit.id}:blocked`,
      kind: "audit-blocked",
      title: `Audit ${audit.status}: ${audit.id}`,
      summary: "Audit blocked safe progress. Review the blocker and retry the related task when a retry path exists.",
      severity: "blocking",
      changeId: topic.id,
      targetId: audit.id,
      runId: audit.runId,
      timestamp: audit.finishedAt,
      actions: evidenceActions(undefined),
      rework: recordFeedbackPrompt("记录审查阻塞反馈"),
    });
  }
  return contexts;
}

function approvalDecisionContext(approval: WorkbenchApprovalItem): WorkbenchDecisionContext {
  const kind = decisionKindForApproval(approval.kind);
  const title = decisionTitleForApproval(approval);
  return {
    id: `approval:${approval.id}`,
    kind,
    title,
    summary: approval.reason ?? approval.label,
    severity: approval.severity,
    changeId: approval.changeId,
    runId: approval.runId,
    targetId: approval.targetId,
    artifact: approval.artifact,
    actions: decisionActionsForApproval(approval, kind),
    rework: proposalLikeDecision(kind) ? inlineFeedbackPrompt("要求修改") : kind === "audit-approved" ? inlineFeedbackPrompt("要求复审") : undefined,
  };
}

function decisionHistoryContext(decision: WorkbenchDecisionItem): WorkbenchDecisionContext {
  return {
    id: `decision:${decision.id}`,
    kind: "history",
    title: decision.label,
    summary: decision.feedback ? `${decision.summary}\n${decision.feedback}` : decision.summary,
    severity: decision.status === "failed" ? "blocking" : decision.status === "requested-changes" ? "warning" : "info",
    changeId: decision.changeId,
    runId: decision.runId,
    targetId: decision.targetId,
    artifact: decision.artifact,
    timestamp: decision.completedAt ?? decision.updatedAt,
    actions: decision.artifact ? evidenceActions(decision.artifact) : [],
  };
}

function decisionActionsForQueueBlocker(queue: WorkbenchTaskQueueSummary, task?: WorkbenchTaskNode): WorkbenchDecisionAction[] {
  const actions: WorkbenchDecisionAction[] = [];
  if (task?.nextAction.actionType === "task.run.retry" && task.nextAction.taskRunId) {
    actions.push({
      id: `retry:${task.nextAction.taskRunId}`,
      label: "重试任务",
      kind: "workflow-action",
      actionType: "task.run.retry",
      taskIds: [task.taskId],
      taskRunId: task.nextAction.taskRunId,
      enabled: task.nextAction.enabled,
      requiresConfirmation: true,
      disabledReason: task.nextAction.disabledReason,
    });
  }
  if (queue.nextAction?.actionType) {
    actions.push({
      id: `reconcile:${queue.id}`,
      label: "刷新执行状态",
      kind: "workflow-action",
      actionType: queue.nextAction.actionType,
      enabled: queue.nextAction.enabled,
      requiresConfirmation: queue.nextAction.requiresConfirmation,
      disabledReason: queue.nextAction.disabledReason,
    });
  }
  return actions;
}

function decisionActionsForTaskBlocker(task: WorkbenchTaskNode): WorkbenchDecisionAction[] {
  const actions = task.nextAction.actionType === "task.run.retry" && task.nextAction.taskRunId
    ? [{
        id: `retry:${task.nextAction.taskRunId}`,
        label: "重试任务",
        kind: "workflow-action" as const,
        actionType: "task.run.retry" as const,
        taskIds: [task.taskId],
        taskRunId: task.nextAction.taskRunId,
        enabled: task.nextAction.enabled,
        requiresConfirmation: true,
        disabledReason: task.nextAction.disabledReason,
      }]
    : [];
  return [...actions, ...task.latestEvidence.flatMap((item) => evidenceActions(item.artifact))];
}

function decisionActionsForApproval(approval: WorkbenchApprovalItem, kind: WorkbenchDecisionContextKind): WorkbenchDecisionAction[] {
  const actions: WorkbenchDecisionAction[] = [];
  if (approval.action) {
    actions.push({
      id: `accept:${approval.id}`,
      label: actionLabelForDecision(kind, approval.action.label),
      kind: "approval",
      approvalId: approval.id,
      action: { ...approval.action, label: actionLabelForDecision(kind, approval.action.label) },
      enabled: true,
      requiresConfirmation: approval.action.requiresConfirmation,
    });
  }
  if (approval.artifact) actions.push(...evidenceActions(approval.artifact));
  if (proposalLikeDecision(kind) || kind === "audit-approved") {
    actions.push({
      id: `feedback:${approval.id}`,
      label: kind === "audit-approved" ? "要求复审" : "要求修改",
      kind: "feedback",
      approvalId: approval.id,
      action: approval.action,
      enabled: Boolean(approval.action),
      requiresConfirmation: false,
      disabledReason: approval.action ? undefined : "该对象没有可记录反馈的 action context。",
    });
  }
  return actions;
}

function evidenceActions(artifact?: string): WorkbenchDecisionAction[] {
  return artifact ? [{
    id: `evidence:${artifact}`,
    label: "查看证据",
    kind: "evidence",
    enabled: true,
    requiresConfirmation: false,
    artifact,
  }] : [];
}

function decisionKindForApproval(kind: WorkbenchApprovalKind): WorkbenchDecisionContextKind {
  if (kind === "spec-proposal") return "spec-proposal";
  if (kind === "plan-proposal" || kind === "spec-test-proposal") return "plan-proposal";
  if (kind === "audit-proposal") return "audit-approved";
  if (kind === "worktree-apply") return "apply-gate";
  if (kind === "change-close") return "close-gate";
  if (kind === "evolution") return "evolution-pending";
  return "history";
}

function decisionTitleForApproval(approval: WorkbenchApprovalItem): string {
  if (approval.kind === "spec-proposal") return `Spec proposal: ${approval.targetId ?? approval.id}`;
  if (approval.kind === "plan-proposal") return `Plan proposal: ${approval.targetId ?? approval.id}`;
  if (approval.kind === "audit-proposal") return `审查证据可接受：${approval.targetId ?? approval.id}`;
  if (approval.kind === "worktree-apply") return `Worktree 可应用：${approval.targetId ?? approval.id}`;
  if (approval.kind === "change-close") return `Change 可关闭：${approval.targetId ?? approval.id}`;
  return approval.label;
}

function actionLabelForDecision(kind: WorkbenchDecisionContextKind, fallback: string): string {
  if (kind === "spec-proposal") return "接受 Spec";
  if (kind === "plan-proposal") return "接受 Plan";
  if (kind === "audit-approved") return "接受审查证据";
  if (kind === "apply-gate") return "应用到源码";
  if (kind === "close-gate") return "关闭并归档";
  return fallback;
}

function proposalLikeDecision(kind: WorkbenchDecisionContextKind): boolean {
  return kind === "spec-proposal" || kind === "plan-proposal";
}

function inlineFeedbackPrompt(label: string): WorkbenchReworkPrompt {
  return {
    mode: "inline-feedback",
    label,
    placeholder: "写下需要修改的点、补充约束或复审要求。",
  };
}

function recordFeedbackPrompt(label: string): WorkbenchReworkPrompt {
  return {
    mode: "record-feedback",
    label,
    placeholder: "记录你的判断或后续修复要求。",
  };
}

function compareDecisionContexts(a: WorkbenchDecisionContext, b: WorkbenchDecisionContext): number {
  return decisionPriority(a) - decisionPriority(b) || (b.timestamp ?? "").localeCompare(a.timestamp ?? "");
}

function decisionPriority(context: WorkbenchDecisionContext): number {
  if (context.kind === "queue-blocker") return 0;
  if (context.kind === "task-blocker") return 1;
  if (context.kind === "validation-failed" || context.kind === "audit-blocked") return 2;
  if (context.kind === "spec-proposal" || context.kind === "plan-proposal") return 3;
  if (context.kind === "audit-approved") return 4;
  if (context.kind === "apply-gate" || context.kind === "close-gate") return 5;
  if (context.kind === "evolution-pending") return 6;
  return 99;
}

function latestTaskEvidenceTimestamp(task: WorkbenchTaskNode): string | undefined {
  return task.latestEvidence.map((item) => item.timestamp).filter((item): item is string => Boolean(item)).sort().at(-1);
}

async function buildMultiWorkpadSummaries(
  memory: ResolvedMemory,
  topics: WorkbenchTopicSummary[],
  approvals: WorkbenchApprovalItem[],
  selectedTopicId: string | undefined,
): Promise<WorkbenchWorkpadSummary[]> {
  const allRuns = await listRuns(memory).catch(() => []);
  const summaries = await Promise.all(topics.map(async (topic): Promise<WorkbenchWorkpadSummary> => {
    const runs = allRuns.filter((run) => run.changeId === topic.id || run.changeId === topic.name);
    const latestRun = [...runs].sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""))[0];
    const runningRun = runs.find((run) => run.status === "created" || run.status === "running");
    const queues = await listTaskQueues(memory, topic.id).catch(() => []);
    const latestQueue = [...queues].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
    const topicApprovals = approvals.filter((approval) => approval.changeId === topic.id || approval.changeId === topic.name);
    const blockingApproval = topicApprovals.find((approval) => approval.severity === "blocking");
    let runtimeStatus: WorkbenchWorkpadRuntimeStatus = topic.state === "archive" ? "archived" : topic.state === "parking" ? "queued" : "active";
    let blocker = blockingApproval?.reason ?? blockingApproval?.label;
    if (topic.state === "active") {
      if (latestQueue && ["blocked", "failed"].includes(latestQueue.status)) {
        runtimeStatus = "blocked";
        blocker = latestQueue.blockedReason ?? latestQueue.failureReason ?? "Task queue is blocked.";
      } else if (blockingApproval) {
        runtimeStatus = "blocked";
      } else if (runningRun || latestQueue?.status === "running") {
        runtimeStatus = "running";
      } else if (latestQueue && ["queued", "paused"].includes(latestQueue.status)) {
        runtimeStatus = "queued";
      } else if (topicApprovals.length > 0) {
        runtimeStatus = "waiting-decision";
      }
    }
    return {
      id: topic.id,
      title: topic.title,
      state: topic.state,
      runtimeStatus,
      selected: topic.id === selectedTopicId || topic.name === selectedTopicId,
      waitingDecisionCount: topicApprovals.length,
      latestRunStatus: latestRun?.status,
      latestRunId: latestRun?.id,
      queueStatus: latestQueue?.status,
      blocker,
      updatedAt: latestRun?.finishedAt ?? latestRun?.startedAt ?? latestQueue?.updatedAt ?? topic.updatedAt,
    };
  }));
  const running = summaries
    .filter((item) => item.runtimeStatus === "running")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  for (const extra of running.slice(1)) {
    extra.runtimeStatus = "queued";
    extra.blocker = "Single-worker mode: this Workpad is waiting for the current run slot.";
  }
  return summaries.sort((a, b) => workpadRuntimeRank(a.runtimeStatus) - workpadRuntimeRank(b.runtimeStatus) || (b.updatedAt ?? b.title).localeCompare(a.updatedAt ?? a.title));
}

function workpadRuntimeRank(status: WorkbenchWorkpadRuntimeStatus): number {
  if (status === "running") return 0;
  if (status === "blocked") return 1;
  if (status === "waiting-decision") return 2;
  if (status === "queued") return 3;
  if (status === "active") return 4;
  if (status === "readonly") return 5;
  return 6;
}

function stateLabelForWorkpad(state: WorkbenchTopicState): string {
  if (state === "active") return "进行中";
  if (state === "parking") return "暂停";
  return "已归档";
}

async function listWorkbenchTopicsFromMemory(memory: ResolvedMemory): Promise<WorkbenchTopicSummary[]> {
  const index = await buildChangeIndex(memory);
  const groups: Array<[WorkbenchTopicState, ChangeIndexItem[]]> = [
    ["active", index.active],
    ["parking", index.parking],
    ["archive", index.archive],
  ];
  const topics: WorkbenchTopicSummary[] = [];
  for (const [state, items] of groups) {
    for (const item of items) topics.push(await topicSummaryFromItem(memory, state, item));
  }
  return topics.sort((a, b) => stateRank(a.state) - stateRank(b.state) || (b.updatedAt ?? b.name).localeCompare(a.updatedAt ?? a.name));
}

async function topicSummaryFromItem(memory: ResolvedMemory, state: WorkbenchTopicState, item: ChangeIndexItem): Promise<WorkbenchTopicSummary> {
  const metadata = await readChangeMetadataAt(memory, item.path);
  return {
    id: metadata?.id ?? item.name,
    name: item.name,
    title: metadata?.title ?? item.name,
    state,
    path: item.path,
    createdAt: metadata?.createdAt,
    updatedAt: metadata?.updatedAt,
    closedAt: metadata?.closedAt,
    archivePath: metadata?.archivePath,
  };
}

async function buildTopicAcMap(memory: ResolvedMemory, topic: WorkbenchTopicSummary): Promise<AcMap | null> {
  const specPath = join(memory.memoryRoot, topic.path, "spec.md");
  const tasksPath = join(memory.memoryRoot, topic.path, "tasks.md");
  if (!existsSync(specPath) || !existsSync(tasksPath)) return null;
  const [specContent, tasksContent] = await Promise.all([
    readFile(specPath, "utf8"),
    readFile(tasksPath, "utf8"),
  ]);
  return buildAcMap({
    changeId: topic.id,
    specContent,
    tasksContent,
    placeholderFiles: [
      { path: "spec.md", content: specContent },
      { path: "tasks.md", content: tasksContent },
    ],
  });
}

async function selectTopicDetail(project: ManagedProject | null, memory: ResolvedMemory, topics: WorkbenchTopicSummary[], topicId?: string): Promise<WorkbenchTopicDetail | null> {
  const topic = topicId
    ? topics.find((item) => item.id === topicId || item.name === topicId)
    : topics.find((item) => item.state === "active") ?? topics[0];
  if (!topic) return null;

  const change = await readChangeMetadataAt(memory, topic.path);
  const allRuns = await listRuns(memory);
  const runs = allRuns.filter((run) => run.changeId === topic.id || run.changeId === topic.name);
  const [worktrees, validations, audits, taskRuns, workerLeases, taskQueues, taskQueueItems] = await Promise.all([
    listWorktreesForChange(memory, topic.id).catch(() => []),
    listValidationResults(memory, topic.id).then((items) => items.map(summarizeValidation)).catch(() => []),
    listAuditResults(memory, topic.id).then((items) => items.map(summarizeAudit)).catch(() => []),
    listTaskRuns(memory, topic.id).catch(() => []),
    listWorkerLeases(memory, topic.id).catch(() => []),
    listTaskQueues(memory, topic.id).catch(() => []),
    listTaskQueueItems(memory, topic.id).catch(() => []),
  ]);

  let statusDetail: Awaited<ReturnType<typeof getChangeStatus>> | null = null;
  let specTest: unknown = null;
  let drift: unknown = null;
  if (project && topic.state === "active") {
    statusDetail = await getChangeStatus(project).catch(() => null);
    specTest = await getSpecTestStatus(memory).catch(() => null);
    drift = await getSpecTestDriftReport(memory).catch(() => null);
  }
  const acMap = statusDetail?.acMap ?? await buildTopicAcMap(memory, topic);

  const decisions = project ? await listWorkbenchDecisions(memory, topic.id) : [];
  const threadItems = await buildThreadStream(memory, topic, runs, validations, audits, decisions);
  return {
    ...topic,
    change,
    reviewStatus: statusDetail?.reviewStatus,
    closeGate: statusDetail?.closeGate,
    acMap,
    acCount: acMap?.acceptanceCriteria.length,
    taskCount: acMap?.tasks.length,
    specTest,
    drift,
    runs,
    taskQueues,
    taskQueueItems,
    taskRuns,
    workerLeases,
    worktrees,
    validations,
    audits,
    threadItems,
  };
}

interface ThreadStreamDraft extends ThreadStreamItem {
  sortKey: number;
  subOrder: number;
}

async function buildThreadStream(
  memory: ResolvedMemory,
  topic: WorkbenchTopicSummary,
  runs: RunMetadata[],
  validations: unknown[],
  audits: unknown[],
  decisions: WorkbenchDecisionItem[],
): Promise<ThreadStreamItem[]> {
  const items: ThreadStreamDraft[] = [{
    id: `${topic.id}:change-state`,
    kind: "change-state",
    label: topic.state === "archive" ? `Archived: ${topic.title}` : `Topic: ${topic.title}`,
    timestamp: topic.updatedAt ?? topic.createdAt,
    body: topic.path,
    source: "change",
    artifact: topic.path,
    status: topic.state,
    semanticKey: `change:${topic.id}`,
    sortKey: 0,
    subOrder: 0,
  }];
  const messages = await readTopicThreadLog(memory, topic.path).catch(() => []);
  const terminalWorkflowByAction = new Map<string, TopicThreadEntry>();
  const workflowStartedByAction = new Map<string, TopicThreadEntry>();
  const runAnchors = new Map<string, number>();
  const assistantByRun = new Map<string, ThreadStreamDraft>();

  messages.forEach((message, index) => {
    const sortKey = message.position ?? index + 1;
    if (message.type === "workflow.started" && message.actionRunId) {
      workflowStartedByAction.set(message.actionRunId, message);
      return;
    }
    if ((message.type === "workflow.completed" || message.type === "workflow.failed") && message.actionRunId) {
      terminalWorkflowByAction.set(message.actionRunId, message);
      if (message.runId) runAnchors.set(message.runId, sortKey);
      return;
    }
    const mapped = threadItemFromMessage(message, sortKey);
    if (mapped) {
      items.push(mapped);
      if (mapped.kind === "assistant-turn" && mapped.runId) assistantByRun.set(mapped.runId, mapped);
    }
  });

  for (const [actionRunId, started] of workflowStartedByAction) {
    const terminal = terminalWorkflowByAction.get(actionRunId);
    const message = terminal ?? started;
    const sortKey = message.position ?? started.position ?? messages.length + items.length + 1;
    const workflowItem = workflowItemFromMessage(message, sortKey);
    const existing = message.runId ? assistantByRun.get(message.runId) : undefined;
    if (existing) mergeAssistantTurn(existing, workflowItem);
    else {
      items.push(workflowItem);
      if (workflowItem.runId) assistantByRun.set(workflowItem.runId, workflowItem);
    }
    if (message.runId) runAnchors.set(message.runId, sortKey);
  }
  for (const run of runs) {
    if (!runAnchors.has(run.id)) runAnchors.set(run.id, timestampSortKey(run.finishedAt ?? run.startedAt, 3000));
  }

  for (const validation of validations as ValidationSummary[]) {
    const anchor = validation.runId ? runAnchors.get(validation.runId) : undefined;
    const evidence = {
      id: `validation:${validation.id}`,
      label: `Validation ${validation.status}`,
      timestamp: validation.finishedAt,
      body: `${validation.commandCount} command${validation.commandCount === 1 ? "" : "s"} · ${validation.executionMode}`,
      source: "validation",
      status: validation.status,
      runId: validation.runId,
    } satisfies ThreadStreamEvidence;
    const assistant = validation.runId ? assistantByRun.get(validation.runId) : undefined;
    if (assistant) {
      assistant.evidence = [...(assistant.evidence ?? []), evidence];
      assistant.blocks = mergeBlocks(assistant.blocks, [workflowEvidenceBlock(evidence, nextBlockSequence(assistant.blocks), "validation")]);
    } else {
      items.push({
      ...evidence,
      kind: "evidence",
      semanticKey: `validation:${validation.id}`,
      sortKey: anchor !== undefined ? anchor : timestampSortKey(validation.finishedAt, 4000),
      subOrder: 20,
      });
    }
  }
  for (const audit of audits as AuditSummary[]) {
    const anchor = audit.runId ? runAnchors.get(audit.runId) : undefined;
    const evidence = {
      id: `audit:${audit.id}`,
      label: `Audit ${audit.status}`,
      timestamp: audit.finishedAt,
      body: `${audit.findingCount} finding${audit.findingCount === 1 ? "" : "s"}`,
      source: "audit",
      status: audit.status,
      runId: audit.runId,
    } satisfies ThreadStreamEvidence;
    const assistant = audit.runId ? assistantByRun.get(audit.runId) : undefined;
    if (assistant) {
      assistant.evidence = [...(assistant.evidence ?? []), evidence];
      assistant.blocks = mergeBlocks(assistant.blocks, [workflowEvidenceBlock(evidence, nextBlockSequence(assistant.blocks), "audit")]);
    } else {
      items.push({
      ...evidence,
      kind: "evidence",
      semanticKey: `audit:${audit.id}`,
      sortKey: anchor !== undefined ? anchor : timestampSortKey(audit.finishedAt, 5000),
      subOrder: 30,
      });
    }
  }
  for (const decision of decisions.filter((item) => !item.id.startsWith("workflow:"))) {
    items.push({
      id: `decision:${decision.id}`,
      kind: "decision",
      label: decision.label,
      timestamp: decision.completedAt ?? decision.updatedAt,
      body: decision.summary,
      source: "decision",
      artifact: decision.artifact,
      status: decision.status,
      runId: decision.runId,
      semanticKey: `decision:${decision.id}`,
      sortKey: timestampSortKey(decision.completedAt ?? decision.updatedAt, 6000),
      subOrder: 40,
    });
  }

  const actions = await buildPlanCardActions(memory, topic);
  for (const item of items) {
    if (item.kind === "plan-card" || item.planCard) item.actions = actions;
    item.blocks = finalizeAssistantBlocks(item);
  }
  return dedupeThreadItems(items)
    .sort((a, b) => a.sortKey - b.sortKey || a.subOrder - b.subOrder || (a.timestamp ?? "").localeCompare(b.timestamp ?? "") || a.id.localeCompare(b.id))
    .map(({ sortKey: _sortKey, subOrder: _subOrder, ...item }) => item);
}

function threadItemFromMessage(message: TopicThreadEntry, sortKey: number): ThreadStreamDraft | null {
  if (message.type === "user.message") {
    return {
      id: message.id,
      kind: "user-message",
      label: "User",
      timestamp: message.timestamp,
      body: message.text,
      source: "chat",
      semanticKey: `message:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "assistant.message") {
    return {
      id: message.id,
      kind: "assistant-turn",
      label: "AI",
      timestamp: message.timestamp,
      body: message.text,
      source: "chat",
      artifact: message.artifact,
      runId: message.runId,
      activity: message.activity,
      blocks: blocksFromMessage(message),
      semanticKey: `message:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "orchestrator.plan") {
    return {
      id: message.id,
      kind: "assistant-turn",
      label: "Orchestrator plan",
      timestamp: message.timestamp,
      body: message.text,
      source: "chat",
      artifact: message.artifact,
      runId: message.runId,
      planCard: message.planCard,
      activity: message.activity,
      blocks: blocksFromMessage(message),
      semanticKey: `message:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "intake.scan") {
    const intake = parseIntakePayload(message.intake);
    return {
      id: message.id,
      kind: "intake-summary",
      label: "需求分析",
      timestamp: message.timestamp,
      body: message.text,
      source: "intake",
      artifact: message.artifact,
      runId: message.runId,
      intake,
      semanticKey: `intake-scan:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "intake.iteration") {
    const intake = parseIntakePayload(message.intake);
    return {
      id: message.id,
      kind: "intake-summary",
      label: "当前需求理解",
      timestamp: message.timestamp,
      body: message.text,
      source: "intake",
      artifact: message.artifact,
      intake,
      semanticKey: `intake-iteration:${message.id}`,
      sortKey,
      subOrder: 0,
    };
  }
  if (message.type === "clarification.request" || message.type === "clarification.answer" || message.type === "clarification.skip") {
    const clarification = parseClarificationPayload(message.clarification);
    return {
      id: message.id,
      kind: "clarification",
      label: message.type === "clarification.request" ? "需要确认" : message.type === "clarification.answer" ? "已回答确认" : "已跳过确认",
      timestamp: message.timestamp,
      body: message.text,
      source: "intake",
      runId: message.runId,
      clarification,
      status: clarification?.status,
      semanticKey: `clarification:${clarification?.id ?? message.id}:${message.type}`,
      sortKey,
      subOrder: 0,
    };
  }
  return null;
}

function parseIntakePayload(value: unknown): ThreadStreamItem["intake"] | undefined {
  if (!isRecord(value)) return undefined;
  const result: ThreadStreamItem["intake"] = {};
  if (isRecord(value.scan)) result.scan = value.scan as unknown as WorkbenchIntakeScan;
  if (isRecord(value.iteration)) result.iteration = value.iteration as unknown as WorkbenchIntakeIteration;
  return result.scan || result.iteration ? result : undefined;
}

function parseClarificationPayload(value: unknown): ClarificationRequest | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.questions)) return undefined;
  return value as unknown as ClarificationRequest;
}

function workflowItemFromMessage(message: TopicThreadEntry, sortKey: number): ThreadStreamDraft {
  const evidence = workflowEvidenceFromMessage(message);
  return {
    id: `assistant-turn:${message.runId ?? message.actionRunId ?? message.id}`,
    kind: "assistant-turn",
    label: workflowLabel(message.actionType, message.status),
    timestamp: message.timestamp,
    body: message.text ?? message.error ?? workflowBody(message.actionType, message.status),
    source: "workflow",
    artifact: message.artifact,
    status: message.status,
    runId: message.runId,
    actionRunId: message.actionRunId,
    activity: message.activity,
    evidence: [evidence],
    blocks: blocksFromMessage(message, evidence),
    semanticKey: `assistant-turn:${message.runId ?? message.actionRunId ?? message.id}`,
    sortKey,
    subOrder: 10,
  };
}

function workflowEvidenceFromMessage(message: TopicThreadEntry): ThreadStreamEvidence {
  return {
    id: `workflow:${message.actionRunId ?? message.id}`,
    label: workflowLabel(message.actionType, message.status),
    source: "workflow",
    timestamp: message.timestamp,
    body: message.error ?? workflowBody(message.actionType, message.status),
    artifact: message.artifact,
    status: message.status,
    runId: message.runId,
    actionRunId: message.actionRunId,
  };
}

function blocksFromMessage(message: TopicThreadEntry, evidence?: ThreadStreamEvidence): AssistantTurnBlock[] | undefined {
  const explicit = normalizeBlocks(message.blocks);
  const blocks: AssistantTurnBlock[] = explicit.length > 0 ? [...explicit] : [];
  const hasExplicitBlocks = blocks.length > 0;
  let sequence = nextBlockSequence(blocks);
  if (blocks.length === 0 && message.text?.trim()) {
    blocks.push({
      id: `legacy-prose:${message.id}`,
      runId: message.runId,
      sequence: sequence++,
      kind: "prose",
      timestamp: message.timestamp,
      source: message.type === "workflow.completed" || message.type === "workflow.failed" ? "workflow" : "legacy",
      title: message.type === "workflow.completed" || message.type === "workflow.failed" ? "执行结果" : undefined,
      text: message.text,
      isError: message.status === "failed",
    });
  }
  if (blocks.length === 0 && message.error?.trim()) {
    blocks.push({
      id: `legacy-error:${message.id}`,
      runId: message.runId,
      sequence: sequence++,
      kind: "error",
      timestamp: message.timestamp,
      source: "workflow",
      title: "执行失败",
      text: message.error,
      isError: true,
    });
  }
  if (!hasExplicitBlocks) {
    for (const block of blocksFromActivity(message.activity, message)) {
      block.sequence = sequence++;
      blocks.push(block);
    }
  }
  if (!hasExplicitBlocks && message.planCard) {
    blocks.push({
      id: `plan-card:${message.id}`,
      runId: message.runId,
      sequence: sequence++,
      kind: "plan-card",
      timestamp: message.timestamp,
      source: "aho",
      title: message.planCard.title,
      text: message.planCard.summary,
      artifactRef: message.artifact,
      planCard: message.planCard,
    });
  }
  if (evidence) {
    blocks.push(workflowEvidenceBlock(evidence, sequence++, evidence.source));
  }
  return blocks.length > 0 ? dedupeBlocks(blocks).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)) : undefined;
}

function normalizeBlocks(blocks: AssistantTurnBlock[] | undefined): AssistantTurnBlock[] {
  return (blocks ?? [])
    .filter((block) => isMainThreadBlock(block))
    .map((block) => ({ ...block, preview: hasInternalRunMetadata(block.preview) ? undefined : block.preview }));
}

function blocksFromActivity(activity: AssistantTurnActivity[] | undefined, message: TopicThreadEntry): AssistantTurnBlock[] {
  const blocks: AssistantTurnBlock[] = [];
  for (const [index, event] of (activity ?? []).entries()) {
    if (event.kind === "assistant-event") {
      const assistantEvent = event.event;
      const kind = assistantEventBlockKind(assistantEvent.kind);
      const block: AssistantTurnBlock = {
        id: `legacy-activity:${message.id}:${index}`,
        runId: assistantEvent.runId ?? message.runId,
        sequence: index + 1,
        kind,
        timestamp: assistantEvent.timestamp ?? event.timestamp,
        source: "codex",
        status: assistantEvent.phase,
        title: assistantEvent.title ?? assistantEventTitle(assistantEvent.kind),
        text: assistantEvent.summary,
        command: assistantEvent.command,
        cwd: assistantEvent.cwd,
        exitCode: assistantEvent.exitCode,
        preview: hasInternalRunMetadata(assistantEvent.preview) ? undefined : assistantEvent.preview,
        artifactRef: assistantEvent.artifactRef,
        isError: assistantEvent.isError,
        truncated: assistantEvent.truncated,
        itemId: assistantEvent.itemId,
      };
      if (isMainThreadBlock(block)) blocks.push(block);
    } else if (event.kind === "tool" && event.tool.phase !== "stderr" && event.tool.command) {
      blocks.push({
        id: `legacy-tool:${message.id}:${index}`,
        runId: event.tool.runId,
        sequence: index + 1,
        kind: "command",
        timestamp: event.timestamp,
        source: "codex",
        status: event.tool.status ?? event.tool.phase,
        title: event.tool.isError ? "命令失败" : event.tool.phase === "started" ? "正在运行命令" : "命令完成",
        command: event.tool.command,
        exitCode: event.tool.exitCode,
        preview: hasInternalRunMetadata(event.tool.outputTail) ? undefined : event.tool.outputTail,
        isError: event.tool.isError,
      });
    } else if (event.kind === "usage") {
      blocks.push({
        id: `legacy-usage:${message.id}:${index}`,
        runId: message.runId,
        sequence: index + 1,
        kind: "usage",
        timestamp: event.timestamp,
        source: "codex",
        title: "用量",
        text: formatUsageSummary(event.usage),
      });
    } else if (event.kind === "error") {
      blocks.push({
        id: `legacy-error:${message.id}:${index}`,
        runId: message.runId,
        sequence: index + 1,
        kind: "error",
        timestamp: event.timestamp,
        source: "codex",
        title: "错误",
        text: event.message,
        isError: true,
      });
    }
  }
  return blocks;
}

function workflowEvidenceBlock(evidence: ThreadStreamEvidence, sequence: number, source: AssistantTurnBlock["source"]): AssistantTurnBlock {
  return {
    id: `evidence-block:${evidence.id}`,
    runId: evidence.runId,
    sequence,
    kind: "workflow-evidence",
    timestamp: evidence.timestamp ?? new Date().toISOString(),
    source,
    status: evidence.status,
    title: evidenceLabel(evidence),
    text: evidence.body,
    artifactRef: evidence.artifact,
    isError: evidence.status === "failed" || evidence.status === "blocked",
  };
}

function finalizeAssistantBlocks(item: ThreadStreamItem): AssistantTurnBlock[] | undefined {
  if (item.kind !== "assistant-turn" && item.kind !== "plan-card") return item.blocks;
  let blocks = normalizeBlocks(item.blocks);
  let sequence = nextBlockSequence(blocks);
  if (blocks.length === 0 && item.body?.trim()) {
    blocks.push({
      id: `final-prose:${item.id}`,
      runId: item.runId,
      sequence: sequence++,
      kind: "prose",
      timestamp: item.timestamp ?? new Date().toISOString(),
      source: item.source === "workflow" ? "workflow" : "legacy",
      title: item.source === "workflow" ? "执行结果" : undefined,
      text: item.body,
      isError: item.status === "failed",
    });
  }
  for (const evidence of item.evidence ?? []) {
    blocks.push(workflowEvidenceBlock(evidence, sequence++, evidence.source));
  }
  blocks = dedupeBlocks(blocks).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  return blocks.length > 0 ? blocks : undefined;
}

function mergeBlocks(left: AssistantTurnBlock[] | undefined, right: AssistantTurnBlock[] | undefined): AssistantTurnBlock[] | undefined {
  const merged = dedupeBlocks([...(left ?? []), ...(right ?? [])]);
  if (merged.length === 0) return undefined;
  return merged.sort((a, b) => a.sequence - b.sequence || (a.timestamp ?? "").localeCompare(b.timestamp ?? "") || a.id.localeCompare(b.id));
}

function dedupeBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const byKey = new Map<string, AssistantTurnBlock>();
  for (const block of blocks) {
    const key = assistantBlockSemanticKey(block);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeAssistantBlock(existing, block) : block);
  }
  return [...byKey.values()];
}

function mergeAssistantBlock(existing: AssistantTurnBlock, incoming: AssistantTurnBlock): AssistantTurnBlock {
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

function assistantBlockSemanticKey(block: AssistantTurnBlock): string {
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

function nextBlockSequence(blocks: AssistantTurnBlock[] | undefined): number {
  const max = Math.max(0, ...(blocks ?? []).map((block) => block.sequence));
  return max + 1;
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

function assistantEventBlockKind(kind: string): AssistantTurnBlock["kind"] {
  if (kind === "reasoning-summary") return "reasoning-summary";
  if (kind === "command") return "command";
  if (kind === "file-change") return "file-change";
  if (kind === "usage") return "usage";
  if (kind === "error") return "error";
  if (kind === "status") return "status";
  return "tool-result";
}

function assistantEventTitle(kind: string): string {
  if (kind === "reasoning-summary") return "工作摘要";
  if (kind === "command") return "命令";
  if (kind === "file-change") return "文件变更";
  if (kind === "mcp-tool") return "工具调用";
  if (kind === "web-search") return "网页搜索";
  if (kind === "plan-update") return "计划更新";
  if (kind === "usage") return "用量";
  if (kind === "error") return "错误";
  return "运行状态";
}

function evidenceLabel(item: ThreadStreamEvidence): string {
  if (item.source === "validation") return `验证：${item.status ?? item.label}`;
  if (item.source === "audit") return `审查：${item.status ?? item.label}`;
  if (item.source === "workflow") return "执行结果";
  if (item.source === "decision") return "决策";
  return item.label;
}

function formatUsageSummary(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const pieces = [
    input === undefined ? null : `${input} input tokens`,
    output === undefined ? null : `${output} output tokens`,
  ].filter((item): item is string => Boolean(item));
  return pieces.length > 0 ? pieces.join(" · ") : "Usage recorded.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function mergeAssistantTurn(target: ThreadStreamDraft, incoming: ThreadStreamDraft): void {
  target.actionRunId = target.actionRunId ?? incoming.actionRunId;
  target.status = target.status ?? incoming.status;
  target.artifact = target.artifact ?? incoming.artifact;
  if (!target.body?.trim() && incoming.body?.trim()) target.body = incoming.body;
  target.activity = mergeActivity(target.activity, incoming.activity);
  target.evidence = mergeEvidence(target.evidence, incoming.evidence);
  target.blocks = mergeBlocks(target.blocks, incoming.blocks);
}

function mergeActivity(left: AssistantTurnActivity[] | undefined, right: AssistantTurnActivity[] | undefined): AssistantTurnActivity[] | undefined {
  const merged = [...(left ?? []), ...(right ?? [])];
  if (merged.length === 0) return undefined;
  const seen = new Set<string>();
  return merged.filter((event) => {
    const key = JSON.stringify(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeEvidence(left: ThreadStreamEvidence[] | undefined, right: ThreadStreamEvidence[] | undefined): ThreadStreamEvidence[] | undefined {
  const merged = [...(left ?? []), ...(right ?? [])];
  if (merged.length === 0) return undefined;
  const seen = new Set<string>();
  return merged.filter((event) => {
    const key = event.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function buildPlanCardActions(memory: ResolvedMemory, topic: WorkbenchTopicSummary): Promise<ThreadStreamAction[]> {
  const specReady = await isConcreteChangeFile(memory, topic.path, "spec.md");
  const planReady = await isConcreteChangeFile(memory, topic.path, "plan.md");
  const tasksReady = await isConcreteChangeFile(memory, topic.path, "tasks.md");
  return [
    {
      actionType: "change.spec.propose",
      label: "生成 Spec",
      enabled: topic.state === "active" && !specReady,
      requiresConfirmation: true,
      disabledReason: specReady ? "Spec 已存在" : topic.state === "active" ? undefined : "归档或暂停 Topic 不能执行动作",
    },
    {
      actionType: "change.plan.propose",
      label: "生成 Plan",
      enabled: topic.state === "active" && specReady && !planReady,
      requiresConfirmation: true,
      disabledReason: !specReady ? "先生成并接受 Spec" : planReady ? "Plan 已存在" : topic.state === "active" ? undefined : "归档或暂停 Topic 不能执行动作",
    },
    {
      actionType: "change.plan.propose",
      label: "生成 Tasks",
      enabled: topic.state === "active" && specReady && planReady && !tasksReady,
      requiresConfirmation: true,
      disabledReason: !specReady ? "先生成并接受 Spec" : !planReady ? "先生成 Plan" : tasksReady ? "Tasks 已存在" : topic.state === "active" ? undefined : "归档或暂停 Topic 不能执行动作",
    },
    {
      actionType: "code.run",
      label: "运行 Code",
      enabled: topic.state === "active" && specReady && planReady && tasksReady,
      requiresConfirmation: true,
      disabledReason: !specReady ? "先生成并接受 Spec" : !planReady ? "先生成并接受 Plan" : !tasksReady ? "先生成 Tasks" : topic.state === "active" ? undefined : "归档或暂停 Topic 不能执行动作",
    },
  ];
}

async function isConcreteChangeFile(memory: ResolvedMemory, changePath: string, fileName: "spec.md" | "plan.md" | "tasks.md"): Promise<boolean> {
  const path = join(memory.memoryRoot, changePath, fileName);
  if (!existsSync(path)) return false;
  const content = await readFile(path, "utf8").catch(() => "");
  if (!content.trim()) return false;
  return !/^\s*(?:(?:[-*]|\d+[.)])\s*)?(?:\[\s\]\s*)?(?:T-\d{3,}:\s*)?TBD\.?\s*$/im.test(content);
}

function workflowLabel(actionType: string | undefined, status: string | undefined): string {
  const label = actionType ? workflowActionLabel(actionType) : "Workflow action";
  if (status === "failed") return `${label} failed`;
  if (status === "running") return `${label} running`;
  return `${label} completed`;
}

function workflowBody(actionType: string | undefined, status: string | undefined): string {
  if (status === "running") return "The action has started and is waiting for a terminal result.";
  if (status === "failed") return "The action failed. See Run Replay for low-level events and artifacts.";
  if (actionType === "code.run") return "Coder, validation, and audit ran as the sequential confirmed workflow.";
  return "The confirmed workflow action completed.";
}

function workflowActionLabel(actionType: string): string {
  switch (actionType) {
    case "change.spec.propose": return "Spec proposal";
    case "change.spec.accept": return "Spec acceptance";
    case "change.plan.propose": return "Plan/Tasks proposal";
    case "change.plan.accept": return "Plan/Tasks acceptance";
    case "code.run": return "Code workflow";
    case "validate.run": return "Validation";
    case "audit.run": return "Audit";
    case "spec-test.drift": return "Spec-Test drift";
    default: return actionType;
  }
}

function timestampSortKey(timestamp: string | undefined, offset: number): number {
  const millis = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(millis) ? 100000 + millis / 1000 + offset : 100000 + offset;
}

function dedupeThreadItems(items: ThreadStreamDraft[]): ThreadStreamDraft[] {
  const seen = new Set<string>();
  const result: ThreadStreamDraft[] = [];
  for (const item of items) {
    const key = item.semanticKey ?? item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function readRunEvents(memory: ResolvedMemory, run: RunMetadata): Promise<WorkbenchThreadEvent[]> {
  const eventsPath = join(memory.runsRoot, run.id, "events.jsonl");
  if (!existsSync(eventsPath)) return [];
  const content = await readFile(eventsPath, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => parseRunEventLine(line, index, run))
    .filter((item): item is WorkbenchThreadEvent => item !== null);
}

function parseRunEventLine(line: string, index: number, run: RunMetadata): WorkbenchThreadEvent | null {
  try {
    const event = JSON.parse(line) as RunEvent;
    return {
      id: `${run.id}:event:${index}`,
      type: event.type,
      label: event.type,
      timestamp: event.timestamp,
      source: sourceForEvent(event.type),
      artifact: run.artifacts.directory,
      status: typeof event.data?.status === "string" ? event.data.status : undefined,
      runId: run.id,
    };
  } catch {
    return null;
  }
}

async function buildApprovalInbox(project: ManagedProject, memory: ResolvedMemory, topics: WorkbenchTopicSummary[]): Promise<WorkbenchApprovalItem[]> {
  const approvals: WorkbenchApprovalItem[] = [];
  const activeTopic = topics.find((item) => item.state === "active") ?? null;
  const [specProposals, planProposals, specTestProposals] = await Promise.all([
    listSpecProposalSummaries(project).catch(() => []),
    listPlanProposalSummaries(project).catch(() => []),
    listSpecTestProposalSummaries(project).catch(() => []),
  ]);

  for (const proposal of specProposals.filter((item) => item.status === "proposed")) {
    if (await runHasEvent(memory, proposal.runId, "change.spec.proposal.accepted")) continue;
    approvals.push({
      id: `spec:${proposal.id}`,
      kind: "spec-proposal",
      label: `Spec proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: approvalAction("change.spec.accept", "Accept spec proposal", "change", ["spec", "accept", project.id, proposal.id], true),
    });
  }
  for (const proposal of planProposals.filter((item) => item.status === "proposed")) {
    if (await runHasEvent(memory, proposal.runId, "change.plan.proposal.accepted")) continue;
    approvals.push({
      id: `plan:${proposal.id}`,
      kind: "plan-proposal",
      label: `Plan proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: approvalAction("change.plan.accept", "Accept plan proposal", "change", ["plan", "accept", project.id, proposal.id], true),
    });
  }
  for (const proposal of specTestProposals.filter((item) => item.status === "proposed" && item.acceptedSourceRootCount === 0)) {
    approvals.push({
      id: `spec-test:${proposal.id}`,
      kind: "spec-test-proposal",
      label: `Spec-test evidence proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: approvalAction("spec-test.proposal.accept-all-existing", "Accept source-root spec-test evidence", "spec-test", ["proposal", "accept", project.id, proposal.id, "--all-existing"], true),
    });
  }

  if (activeTopic) {
    const audits = await listAuditResults(memory, activeTopic.id).catch(() => []);
    for (const audit of audits.filter((item) => item.status === "approved" || item.status === "approved-with-notes").slice(0, 3)) {
      if (await auditAlreadyAccepted(memory, activeTopic.path, audit.id)) continue;
      approvals.push({
        id: `audit:${audit.id}`,
        kind: "audit-proposal",
        label: `Audit proposal can be accepted: ${audit.id}`,
        changeId: audit.changeId,
        runId: audit.runId,
        targetId: audit.id,
        severity: "info",
        action: approvalAction("audit.accept", "Accept audit", "audit", ["accept", project.id, audit.id], true),
        artifact: audit.artifacts.audit,
      });
    }
    const worktrees = await listWorktreeStatuses(memory).catch(() => []);
    for (const worktree of worktrees.filter((item) => item.changeId === activeTopic.id && item.status !== "applied")) {
      const preview = await previewWorktreeApply(project, worktree.worktreeId).catch(() => null);
      if (preview?.gate.ready) {
        approvals.push({
          id: `apply:${worktree.worktreeId}`,
          kind: "worktree-apply",
          label: `Worktree ready to apply: ${worktree.worktreeId}`,
          changeId: worktree.changeId,
          targetId: worktree.worktreeId,
          severity: "info",
          action: approvalAction("worktree.apply", "Apply worktree", "worktree", ["apply", project.id, worktree.worktreeId], true),
        });
      }
    }
    const status = await getChangeStatus(project).catch(() => null);
    if (status?.closeGate.ready) {
      approvals.push({
        id: `close:${activeTopic.id}`,
        kind: "change-close",
        label: `Change ready to close: ${activeTopic.id}`,
        changeId: activeTopic.id,
        targetId: activeTopic.id,
        severity: "info",
        action: approvalAction("change.close", "Close change", "change", ["close", project.id], true),
      });
    }
    if (status?.latestValidation?.status === "failed") {
      approvals.push({
        id: `attention:validation:${status.latestValidation.id}`,
        kind: "attention",
        label: `Latest validation failed: ${status.latestValidation.id}`,
        changeId: activeTopic.id,
        targetId: status.latestValidation.id,
        severity: "blocking",
        reason: "Failed validation blocks close.",
      });
    }
    if (status?.latestAudit?.status === "blocked") {
      approvals.push({
        id: `attention:audit:${status.latestAudit.id}`,
        kind: "attention",
        label: `Latest audit blocked: ${status.latestAudit.id}`,
        changeId: activeTopic.id,
        targetId: status.latestAudit.id,
        severity: "blocking",
        reason: "Blocked audit prevents safe close.",
      });
    }
  }

  if (hasPendingEvolution(memory)) {
    approvals.push({
      id: "evolution:pending",
      kind: "evolution",
      label: "Harness evolution pending",
      severity: "warning",
      action: approvalAction("evolution.handle", "Handle Harness evolution", "harness-evolve", ["status"], false),
      artifact: "harness/evolution/pending.md",
      reason: "Handle through proposal, independent review, validation, results.tsv, and mark-complete.",
    });
  }
  return approvals;
}

async function runHasEvent(memory: ResolvedMemory, runId: string, eventType: string): Promise<boolean> {
  try {
    const run = await readRun(memory, runId);
    const events = await readRunEvents(memory, run);
    return events.some((event) => event.type === eventType);
  } catch {
    return false;
  }
}

async function auditAlreadyAccepted(memory: ResolvedMemory, changePath: string, auditId: string): Promise<boolean> {
  const reviewPath = join(memory.memoryRoot, changePath, "reviews", "review.md");
  if (!existsSync(reviewPath)) return false;
  try {
    const content = await readFile(reviewPath, "utf8");
    return content.includes(`- Audit ID: ${auditId}`) || content.includes(`Audit ID: ${auditId}`);
  } catch {
    return false;
  }
}

async function summarizeRunArtifacts(memory: ResolvedMemory, run: RunMetadata): Promise<{ artifacts: WorkbenchArtifactPreview[]; diagnostics: string[]; warnings: string[] }> {
  const diagnostics: string[] = [];
  const warnings: string[] = [];
  const artifacts: WorkbenchArtifactPreview[] = [];
  const baseRoot = run.artifacts.base === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  const runDirectory = resolve(baseRoot, run.artifacts.directory);
  const known = Object.entries(run.artifacts)
    .filter(([key, value]) => key !== "base" && key !== "directory" && typeof value === "string") as Array<[string, string]>;
  const extraKnown = ["codex-events.jsonl", "last-message.md", "diff.patch", "diff-stat.txt", "validation.json", "audit.json", "audit.md", "implementation.md"];

  for (const [key, artifactPath] of known) {
    artifacts.push(await summarizeArtifact(key, artifactPath, baseRoot, runDirectory, diagnostics));
  }
  for (const fileName of extraKnown) {
    const artifactPath = `${run.artifacts.directory}/${fileName}`;
    if (known.some(([, existing]) => existing === artifactPath)) continue;
    const key = keyForKnownArtifact(fileName);
    const summary = await summarizeArtifact(key, artifactPath, baseRoot, runDirectory, diagnostics, false);
    if (summary.exists) artifacts.push(summary);
  }
  if (!artifacts.some((item) => item.key === "events" && item.exists)) {
    diagnostics.push("Run events artifact is missing.");
  }
  return { artifacts, diagnostics, warnings };
}

async function summarizeArtifact(key: string, artifactPath: string, baseRoot: string, runDirectory: string, diagnostics: string[], includeMissing = true): Promise<WorkbenchArtifactPreview> {
  const absolutePath = resolve(baseRoot, artifactPath);
  const base: WorkbenchArtifactPreview = {
    key,
    path: artifactPath,
    kind: artifactKind(key, artifactPath),
    exists: false,
  };
  if (!isWithinDirectory(absolutePath, runDirectory)) {
    const diagnostic = `Artifact ${key} is outside the run directory and was not read.`;
    diagnostics.push(diagnostic);
    return { ...base, diagnostic };
  }
  if (!existsSync(absolutePath)) {
    if (includeMissing) diagnostics.push(`Artifact ${key} is missing: ${artifactPath}`);
    return base;
  }
  const stats = await stat(absolutePath);
  if (!stats.isFile()) return { ...base, exists: true, sizeBytes: stats.size, diagnostic: "Artifact path is not a file." };
  const preview = await readTextPreview(absolutePath, stats.size);
  return {
    ...base,
    exists: true,
    sizeBytes: stats.size,
    ...preview,
  };
}

async function readTextPreview(path: string, sizeBytes: number): Promise<Pick<WorkbenchArtifactPreview, "preview" | "tail" | "truncated">> {
  const maxChars = 4000;
  if (sizeBytes > 1024 * 1024) {
    const chunkBytes = 16 * 1024;
    const file = await open(path, "r");
    try {
      const firstBuffer = Buffer.alloc(chunkBytes);
      const lastBuffer = Buffer.alloc(chunkBytes);
      const firstRead = await file.read(firstBuffer, 0, chunkBytes, 0);
      const lastRead = await file.read(lastBuffer, 0, chunkBytes, Math.max(0, sizeBytes - chunkBytes));
      const firstText = firstBuffer.subarray(0, firstRead.bytesRead).toString("utf8");
      const lastText = lastBuffer.subarray(0, lastRead.bytesRead).toString("utf8");
      return {
        preview: firstText.slice(0, maxChars),
        tail: lastText.slice(-maxChars),
        truncated: true,
      };
    } finally {
      await file.close();
    }
  }
  const content = await readFile(path, "utf8");
  return {
    preview: content.slice(0, maxChars),
    tail: content.length > maxChars ? content.slice(-maxChars) : content,
    truncated: content.length > maxChars,
  };
}

function isWithinDirectory(path: string, directory: string): boolean {
  const relativePath = relative(directory, path);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(":"));
}

function keyForKnownArtifact(fileName: string): string {
  if (fileName === "codex-events.jsonl") return "codexEvents";
  if (fileName === "last-message.md") return "lastMessage";
  if (fileName === "diff.patch") return "diff";
  if (fileName === "diff-stat.txt") return "diffStat";
  if (fileName === "audit.md") return "auditMarkdown";
  return fileName.replace(/\.[^.]+$/, "");
}

function artifactKind(key: string, path: string): string {
  if (key === "stdout" || key === "stderr") return "log";
  if (key === "events" || key === "codexEvents") return "jsonl";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".patch")) return "patch";
  if (path.endsWith(".md")) return "markdown";
  return "text";
}

function approvalAction(actionId: string, label: string, command: string, args: string[], mutates: boolean): WorkbenchApprovalAction {
  return {
    actionId,
    label,
    command,
    args,
    mutates,
    requiresConfirmation: mutates,
  };
}

async function summarizeRoleProfile(profileRoot: string, fileName: string): Promise<WorkbenchRoleSummary> {
  const profilePath = join(profileRoot, fileName);
  const content = await readFile(profilePath, "utf8");
  const id = fileName.replace(/\.md$/, "");
  const title = /^#\s+(.+)\s*$/m.exec(content)?.[1] ?? id;
  const sections = [...content.matchAll(/^##\s+(.+)\s*$/gm)].map((match) => match[1]);
  return {
    id,
    name: title,
    profilePath: relative(dirname(getTemplateRoot()), profilePath).replace(/\\/g, "/"),
    writeCapability: writeCapabilityForRole(id),
    preferredRuntime: preferredRuntimeForRole(id),
    delegatable: id !== "validator",
    humanConfirmation: humanConfirmationForRole(id),
    sections,
  };
}

function buildHarnessGaps(): HarnessGap[] {
  return [
    {
      id: "roleCatalog",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5A",
      summary: "Bundled role profiles exist and are readable, but there is no declarative project role registry yet.",
    },
    {
      id: "runStreamIndex",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5B",
      summary: "Run stream replay packets are available after Phase 5B, but live transport and cancel/interrupt remain future work.",
    },
    {
      id: "approvalIndex",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5B",
      summary: "Approvals are derived from canonical state; no materialized approval queue exists.",
    },
    {
      id: "sessionModel",
      severity: "info",
      status: "missing",
      recommendedPhase: "Future",
      summary: "Run is the current execution source of truth. Session remains a future runtime auxiliary.",
    },
    {
      id: "workspaceIndex",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5C",
      summary: "Memory Resolver provides roots, but there is no workspace-wide index comparable to AgentScope workspace indexes.",
    },
    {
      id: "subagentSpec",
      severity: "info",
      status: "missing",
      recommendedPhase: "Phase 5C",
      summary: "No declarative subagent registry exists. Current roles are bundled profiles selected by commands.",
    },
    {
      id: "backgroundEvolutionQueue",
      severity: "warning",
      status: "partial",
      recommendedPhase: "Future",
      summary: "Evolution is explicit and controlled. There is no asynchronous background evolution queue.",
    },
  ];
}

async function resolveWorkbenchMemory(input: WorkbenchProjectInput): Promise<ResolvedMemory> {
  const marker = await readProjectMarker(input.path);
  return resolveMemory(input.project ? { ...input.project, marker } : { path: input.path, marker });
}

async function readChangeMetadataAt(memory: ResolvedMemory, relativePath: string): Promise<ChangeMetadata | null> {
  const path = join(memory.memoryRoot, relativePath, "change.json");
  if (!existsSync(path)) return null;
  try {
    return await readRequiredJsonFile(path, changeMetadataSchema);
  } catch {
    return null;
  }
}

function stateRank(state: WorkbenchTopicState): number {
  if (state === "active") return 0;
  if (state === "parking") return 1;
  return 2;
}

function buildRepoSummary(status: Awaited<ReturnType<typeof getProjectStatus>>): WorkbenchSnapshot["left"]["repo"] {
  return {
    path: status.path,
    exists: status.pathExists,
    git: status.isGitRepo,
    branch: status.branch,
    dirty: status.dirty,
  };
}

function sourceForEvent(type: string): WorkbenchThreadEvent["source"] {
  if (type.startsWith("validation.")) return "validation";
  if (type.startsWith("audit.")) return "audit";
  if (type.startsWith("worktree.")) return "worktree";
  if (type.startsWith("spec-test.")) return "spec-test";
  return "run";
}

function writeCapabilityForRole(id: string): WorkbenchRoleSummary["writeCapability"] {
  if (id === "coder" || id === "spec-test-generator") return "worktree-write";
  if (id === "validator") return "deterministic-writer";
  return "read-only";
}

function preferredRuntimeForRole(id: string): string {
  if (id === "validator") return "local-command";
  return "codex";
}

function humanConfirmationForRole(id: string): string {
  if (id === "validator") return "Validation is mechanical evidence; failed validation blocks close.";
  if (id === "coder" || id === "spec-test-generator") return "Requires validation, audit, and explicit worktree apply.";
  if (id === "auditor") return "Requires explicit audit accept before writing review.md.";
  return "Requires explicit accept command before canonical state changes.";
}
