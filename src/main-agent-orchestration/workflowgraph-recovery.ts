import { getLatestTaskQueue } from "../task-queue/manager.js";
import { listTaskRuns } from "../task-run/manager.js";
import type { ManagedProject, ResolvedMemory, StageResumeVerdict, TaskQueueItem, TaskQueueRun, TaskRun, WorkflowRun } from "../types/index.js";
import { deriveStageResumeVerdict, getLatestWorkflowRun } from "../workflow-run/manager.js";
import { recomputeWorkflowRecoveryKey, sameJson } from "../workflow-run/recovery-key.js";
import type { MainAgentWorkflowGraphReplaySummary } from "./workflowgraph-replay.js";

export type MainAgentWorkflowGraphRecoveryKind =
  | "insufficient-evidence"
  | "stale"
  | "scope-mismatch"
  | "awaiting-queue-binding"
  | "queue-observable"
  | "stage-resume-observable"
  | "completed-await-result-gate"
  | "blocked";

export type MainAgentWorkflowGraphRecoveryGapStatus =
  | "missing"
  | "stale"
  | "scope-mismatch"
  | "malformed"
  | "unavailable";

export interface MainAgentWorkflowGraphRecoveryGap {
  source: "workflow-run" | "task-queue" | "task-run" | "recovery-key" | "stage-resume" | "replay-summary";
  status: MainAgentWorkflowGraphRecoveryGapStatus;
  reason: string;
  refs: string[];
}

export interface MainAgentWorkflowGraphRecoveryStageSummary {
  taskRunId: string;
  taskId: string | null;
  queueItemId: string | null;
  verdictKind: StageResumeVerdict["kind"];
  reason: string;
  refs: {
    runId: string | null;
    validationId: string | null;
    auditId: string | null;
    worktreeId: string | null;
    evidenceRefs: string[];
  };
}

export interface MainAgentWorkflowGraphRecoverySummary {
  version: "1.0";
  authority: "read-only-main-agent-workflowgraph-recovery-summary";
  executionStarted: false;
  changeId: string;
  projectId: string | null;
  builtAt: string;
  /**
   * Evidence-completeness label only. This is not a next action, policy
   * decision, confirmation source, or workflow authority.
   */
  kind: MainAgentWorkflowGraphRecoveryKind;
  reason: string;
  replay: {
    currentStateKind: MainAgentWorkflowGraphReplaySummary["currentState"]["kind"];
    nextObservationKind: MainAgentWorkflowGraphReplaySummary["nextObservation"]["kind"];
  };
  workflow: {
    id: string | null;
    status: WorkflowRun["status"] | null;
    queueRunId: string | null;
    recoveryKeyFreshness: {
      status: "fresh" | "stale" | "unavailable";
      reason: string;
    };
  };
  queue: {
    id: string | null;
    status: TaskQueueRun["status"] | null;
    scopeStatus: "matched" | "unbound" | "queue-only" | "scope-mismatch" | "unavailable";
    totalCount: number | null;
    completedCount: number | null;
    blockedCount: number | null;
    failedCount: number | null;
  };
  stages: MainAgentWorkflowGraphRecoveryStageSummary[];
  refs: {
    workflowRunIds: string[];
    taskQueueRunIds: string[];
    taskRunIds: string[];
    runIds: string[];
    validationIds: string[];
    auditIds: string[];
  };
  gaps: MainAgentWorkflowGraphRecoveryGap[];
}

export async function buildMainAgentWorkflowGraphRecoverySummary(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  replaySummary: MainAgentWorkflowGraphReplaySummary,
): Promise<MainAgentWorkflowGraphRecoverySummary> {
  const latestQueue = await getLatestTaskQueue(memory, changeId).catch(() => null);
  const workflow = await getLatestWorkflowRun(memory, changeId).catch(() => null);
  const taskRuns = await listTaskRuns(memory, changeId).catch(() => []);
  const queue = latestQueue?.queue ?? null;
  const queueItems = latestQueue?.items ?? [];
  const gaps = replayGaps(replaySummary);
  const scopeStatus = queueScopeStatus(workflow, queue);
  if (scopeStatus === "scope-mismatch") {
    gaps.push({
      source: "task-queue",
      status: "scope-mismatch",
      reason: "WorkflowRun and TaskQueueRun are not mutually scoped.",
      refs: dedupeStrings([workflow?.id, workflow?.queueRunId, queue?.id, queue?.workflowRunId]),
    });
  }
  const recoveryKeyFreshness = await evaluateRecoveryKeyFreshness(memory, project, workflow, gaps);
  const stageResult = await summarizeBoundTaskRunStages(memory, changeId, workflow, queueItems, taskRuns);
  gaps.push(...stageResult.gaps);
  const refs = buildRefs(replaySummary, workflow, queue, stageResult.stages);
  const kindAndReason = deriveRecoveryKind({
    workflow,
    queue,
    scopeStatus,
    recoveryKeyStatus: recoveryKeyFreshness.status,
    stages: stageResult.stages,
    gaps,
    replaySummary,
  });
  return {
    version: "1.0",
    authority: "read-only-main-agent-workflowgraph-recovery-summary",
    executionStarted: false,
    changeId,
    projectId: project.id,
    builtAt: new Date().toISOString(),
    kind: kindAndReason.kind,
    reason: kindAndReason.reason,
    replay: {
      currentStateKind: replaySummary.currentState.kind,
      nextObservationKind: replaySummary.nextObservation.kind,
    },
    workflow: {
      id: workflow?.id ?? null,
      status: workflow?.status ?? null,
      queueRunId: workflow?.queueRunId ?? null,
      recoveryKeyFreshness,
    },
    queue: {
      id: queue?.id ?? null,
      status: queue?.status ?? null,
      scopeStatus,
      totalCount: queue?.totalCount ?? (queueItems.length || null),
      completedCount: queue?.completedCount ?? countStatus(queueItems, "completed"),
      blockedCount: countStatus(queueItems, "blocked"),
      failedCount: countStatus(queueItems, "failed"),
    },
    stages: stageResult.stages,
    refs,
    gaps,
  };
}

export function buildDegradedMainAgentWorkflowGraphRecoverySummary(
  project: ManagedProject,
  changeId: string,
  replaySummary: MainAgentWorkflowGraphReplaySummary,
  reason: string,
): MainAgentWorkflowGraphRecoverySummary {
  return {
    version: "1.0",
    authority: "read-only-main-agent-workflowgraph-recovery-summary",
    executionStarted: false,
    changeId,
    projectId: project.id,
    builtAt: new Date().toISOString(),
    kind: "insufficient-evidence",
    reason,
    replay: {
      currentStateKind: replaySummary.currentState.kind,
      nextObservationKind: replaySummary.nextObservation.kind,
    },
    workflow: {
      id: null,
      status: null,
      queueRunId: null,
      recoveryKeyFreshness: {
        status: "unavailable",
        reason,
      },
    },
    queue: {
      id: null,
      status: null,
      scopeStatus: "unavailable",
      totalCount: null,
      completedCount: null,
      blockedCount: null,
      failedCount: null,
    },
    stages: [],
    refs: emptyRefs(),
    gaps: [{
      source: "replay-summary",
      status: "malformed",
      reason,
      refs: [],
    }],
  };
}

function queueScopeStatus(workflow: WorkflowRun | null, queue: TaskQueueRun | null): MainAgentWorkflowGraphRecoverySummary["queue"]["scopeStatus"] {
  if (!workflow && !queue) return "unavailable";
  if (workflow && !queue) return "unbound";
  if (!workflow && queue) return "queue-only";
  if (!workflow || !queue) return "unavailable";
  if (workflow.changeId !== queue.changeId) return "scope-mismatch";
  if (workflow.queueRunId && workflow.queueRunId !== queue.id) return "scope-mismatch";
  if (queue.workflowRunId && queue.workflowRunId !== workflow.id) return "scope-mismatch";
  return "matched";
}

async function evaluateRecoveryKeyFreshness(
  memory: ResolvedMemory,
  project: ManagedProject,
  workflow: WorkflowRun | null,
  gaps: MainAgentWorkflowGraphRecoveryGap[],
): Promise<MainAgentWorkflowGraphRecoverySummary["workflow"]["recoveryKeyFreshness"]> {
  if (!workflow) {
    gaps.push({
      source: "workflow-run",
      status: "missing",
      reason: "No WorkflowRun exists for recovery key freshness.",
      refs: [],
    });
    return { status: "unavailable", reason: "No WorkflowRun exists for recovery key freshness." };
  }
  try {
    const next = await recomputeWorkflowRecoveryKey(memory, project, workflow);
    if (sameJson(next, workflow.recoveryKey)) {
      return { status: "fresh", reason: "WorkflowRun recovery key matches current accepted artifacts and source state." };
    }
    gaps.push({
      source: "recovery-key",
      status: "stale",
      reason: "WorkflowRun recovery key differs from current accepted artifacts or source state.",
      refs: [workflow.id],
    });
    return { status: "stale", reason: "WorkflowRun recovery key differs from current accepted artifacts or source state." };
  } catch (error) {
    const reason = `WorkflowRun recovery key could not be recomputed: ${errorMessage(error)}.`;
    gaps.push({
      source: "recovery-key",
      status: "unavailable",
      reason,
      refs: [workflow.id],
    });
    return { status: "unavailable", reason };
  }
}

async function summarizeBoundTaskRunStages(
  memory: ResolvedMemory,
  changeId: string,
  workflow: WorkflowRun | null,
  queueItems: TaskQueueItem[],
  taskRuns: TaskRun[],
): Promise<{ stages: MainAgentWorkflowGraphRecoveryStageSummary[]; gaps: MainAgentWorkflowGraphRecoveryGap[] }> {
  const gaps: MainAgentWorkflowGraphRecoveryGap[] = [];
  const taskRunById = new Map(taskRuns.map((run) => [run.id, run]));
  const itemByTaskRunId = new Map(queueItems
    .filter((item) => item.taskRunId)
    .map((item) => [item.taskRunId as string, item]));
  const boundTaskRunIds = dedupeStrings([
    ...queueItems.map((item) => item.taskRunId),
    ...(workflow?.items.map((item) => item.taskRunId) ?? []),
  ]);
  if (boundTaskRunIds.length === 0) {
    return { stages: [], gaps };
  }
  const stages: MainAgentWorkflowGraphRecoveryStageSummary[] = [];
  for (const taskRunId of boundTaskRunIds) {
    const taskRun = taskRunById.get(taskRunId);
    const queueItem = itemByTaskRunId.get(taskRunId) ?? null;
    if (!taskRun) {
      gaps.push({
        source: "task-run",
        status: "missing",
        reason: `Queue or WorkflowRun references missing TaskRun ${taskRunId}.`,
        refs: [taskRunId],
      });
      continue;
    }
    try {
      const verdict = await deriveStageResumeVerdict(memory, changeId, taskRun);
      stages.push({
        taskRunId,
        taskId: verdict.taskId ?? taskRun.taskId,
        queueItemId: queueItem?.id ?? null,
        verdictKind: verdict.kind,
        reason: verdict.reason,
        refs: {
          runId: verdict.runId ?? null,
          validationId: verdict.validationId ?? null,
          auditId: verdict.auditId ?? null,
          worktreeId: verdict.worktreeId ?? null,
          evidenceRefs: verdict.evidenceRefs,
        },
      });
    } catch (error) {
      gaps.push({
        source: "stage-resume",
        status: "unavailable",
        reason: `Stage resume verdict could not be derived for TaskRun ${taskRunId}: ${errorMessage(error)}.`,
        refs: [taskRunId],
      });
    }
  }
  return { stages, gaps };
}

function replayGaps(replaySummary: MainAgentWorkflowGraphReplaySummary): MainAgentWorkflowGraphRecoveryGap[] {
  return replaySummary.gaps.map((gap) => ({
    source: "replay-summary",
    status: recoveryGapStatus(gap.status),
    reason: gap.reason,
    refs: [],
  }));
}

function recoveryGapStatus(status: MainAgentWorkflowGraphReplaySummary["gaps"][number]["status"]): MainAgentWorkflowGraphRecoveryGapStatus {
  switch (status) {
    case "available":
      return "unavailable";
    case "old-schema":
      return "malformed";
    case "missing":
    case "stale":
    case "scope-mismatch":
    case "malformed":
      return status;
  }
}

function buildRefs(
  replaySummary: MainAgentWorkflowGraphReplaySummary,
  workflow: WorkflowRun | null,
  queue: TaskQueueRun | null,
  stages: MainAgentWorkflowGraphRecoveryStageSummary[],
): MainAgentWorkflowGraphRecoverySummary["refs"] {
  return {
    workflowRunIds: dedupeStrings([workflow?.id, ...replaySummary.refs.workflowRunIds]),
    taskQueueRunIds: dedupeStrings([queue?.id, ...replaySummary.refs.taskQueueRunIds]),
    taskRunIds: dedupeStrings(stages.map((stage) => stage.taskRunId)),
    runIds: dedupeStrings(stages.map((stage) => stage.refs.runId)),
    validationIds: dedupeStrings(stages.map((stage) => stage.refs.validationId)),
    auditIds: dedupeStrings(stages.map((stage) => stage.refs.auditId)),
  };
}

function deriveRecoveryKind(input: {
  workflow: WorkflowRun | null;
  queue: TaskQueueRun | null;
  scopeStatus: MainAgentWorkflowGraphRecoverySummary["queue"]["scopeStatus"];
  recoveryKeyStatus: MainAgentWorkflowGraphRecoverySummary["workflow"]["recoveryKeyFreshness"]["status"];
  stages: MainAgentWorkflowGraphRecoveryStageSummary[];
  gaps: MainAgentWorkflowGraphRecoveryGap[];
  replaySummary: MainAgentWorkflowGraphReplaySummary;
}): { kind: MainAgentWorkflowGraphRecoveryKind; reason: string } {
  if (input.scopeStatus === "scope-mismatch" || hasGap(input.gaps, "scope-mismatch")) {
    return { kind: "scope-mismatch", reason: "WorkflowGraph recovery evidence is scoped to mismatched WorkflowRun or TaskQueue records." };
  }
  if (input.workflow?.status === "created" && !input.queue) {
    return { kind: "awaiting-queue-binding", reason: "WorkflowRun is created and waiting for queue binding or recovery observation." };
  }
  if (input.recoveryKeyStatus === "stale") {
    return { kind: "stale", reason: "WorkflowRun recovery key is stale relative to current evidence." };
  }
  if (input.queue?.status === "completed" || input.workflow?.status === "completed" || input.replaySummary.currentState.kind === "queue-completed") {
    return { kind: "completed-await-result-gate", reason: "WorkflowGraph execution evidence is complete enough to await existing result gates." };
  }
  if (input.queue?.status === "blocked" || input.queue?.status === "failed" || input.workflow?.status === "blocked" || input.workflow?.status === "failed") {
    return { kind: "blocked", reason: "WorkflowGraph execution evidence is blocked or failed." };
  }
  if (input.stages.some((stage) => stage.verdictKind !== "completed")) {
    return { kind: "stage-resume-observable", reason: "A currently bound TaskRun has incomplete Run/Validation/Audit evidence that can be observed for resume decisions." };
  }
  if (input.queue && ["queued", "running", "paused"].includes(input.queue.status)) {
    return { kind: "queue-observable", reason: "A current TaskQueue is bound and observable without starting recovery execution." };
  }
  if (input.workflow || input.queue || input.replaySummary.refs.workflowRunIds.length || input.replaySummary.refs.taskQueueRunIds.length) {
    return { kind: "queue-observable", reason: "WorkflowGraph recovery evidence is partially observable but has no actionable completeness label." };
  }
  return { kind: "insufficient-evidence", reason: "No current WorkflowGraph recovery evidence exists." };
}

function hasGap(gaps: MainAgentWorkflowGraphRecoveryGap[], status: MainAgentWorkflowGraphRecoveryGapStatus): boolean {
  return gaps.some((gap) => gap.status === status);
}

function emptyRefs(): MainAgentWorkflowGraphRecoverySummary["refs"] {
  return {
    workflowRunIds: [],
    taskQueueRunIds: [],
    taskRunIds: [],
    runIds: [],
    validationIds: [],
    auditIds: [],
  };
}

function countStatus(items: TaskQueueItem[], status: TaskQueueItem["status"]): number {
  return items.filter((item) => item.status === status).length;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = `${value ?? ""}`.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown error";
}
