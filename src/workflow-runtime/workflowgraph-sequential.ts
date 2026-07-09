import type { ManagedProject } from "../types/index.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import {
  blockQueuedTaskItem,
  failQueuedTaskItem,
  finishTaskQueueItem,
  listTaskQueueItems,
  markTaskQueueItemRunning,
  markTaskQueueRunning,
  pauseTaskQueue,
  reconcileTaskQueues,
  startOrResumeTaskQueue,
  updateTaskQueueAfterItem,
} from "../task-queue/manager.js";
import { startTaskRun } from "../task-run/manager.js";
import type { CodeExecutionGateOptions } from "../code/manager.js";
import type { ResolvedMemory, SequentialWorkflowGraphPlan, TaskQueueItem, TaskQueueRun, WorkflowGraphPlan, WorkflowRun, WorkflowRunEventType } from "../types/index.js";
import { appendWorkflowRunEvent, readWorkflowRun, syncWorkflowRunFromQueue } from "../workflow-run/manager.js";
import { activeChangePath } from "../workflow-run/recovery-key.js";
import { readWorkflowGraphPlan } from "../workflow-artifacts/manager.js";
import { isTaskQueueWorkflowRun } from "../workflow-run/guards.js";
import { emitAssistantEvent } from "./kernel/live-events.js";
import { isRecord, isTaskRunLike } from "./kernel/runtime-guards.js";
import {
  assertTaskRunResumeEvidenceScope,
  findTaskRunStageResumeCandidate,
  runResumedTaskRunStage,
  runStartedTaskRunStage,
  type RuntimeStartedTaskRun,
} from "./taskrun-stage.js";

export interface WorkflowRuntimeLiveSink {
  emit(event: unknown): void;
  isClosed?(): boolean;
}

export interface WorkflowGraphSequentialRuntimeInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  workflowRunId?: string;
  queueRunId?: string;
}

export interface WorkflowGraphSequentialRuntimeResult {
  queue: TaskQueueRun;
  workflowRun: WorkflowRun | null;
  items: TaskQueueItem[];
  status: "completed" | "stopped";
  summary: string;
}

export async function runWorkflowGraphSequentialExecution(input: WorkflowGraphSequentialRuntimeInput): Promise<WorkflowGraphSequentialRuntimeResult> {
  const memory = await resolveProjectMemory(input.project);
  const start = await startOrResumeTaskQueue(input.project, {
    changeId: input.changeId,
    taskQueueProposalId: input.taskQueueProposalId,
    workflowGraphPlanId: input.workflowGraphPlanId,
    decompositionPlanId: input.decompositionPlanId,
    readinessManifestId: input.readinessManifestId,
    workflowRunId: input.workflowRunId,
    queueRunId: input.queueRunId,
  });
  let queue = start.queue;
  let workflow = await resolveWorkflowRunForQueue(memory, input.changeId, input.workflowRunId, queue);
  const graph = await resolveSequentialGraph(memory, input.changeId, queue, workflow);
  if (start.resumed) {
    const reconciled = await reconcileTaskQueues(input.project, { changeId: input.changeId, queueRunId: queue.id });
    queue = reconciled.queues.find((item) => item.id === queue.id) ?? queue;
  }
  queue = await markTaskQueueRunning(memory, queue);
  if (start.resumed) {
    workflow = await syncQueue(memory, input.project, input.changeId, queue, workflow, "workflow.started");
  }
  emitAssistantEvent(input.live, {
    runId: queue.id,
    kind: "status",
    phase: start.resumed ? "resumed" : "queued",
    title: start.resumed ? "任务队列已恢复" : "任务队列已创建",
    summary: `本地顺序执行 ${queue.totalCount} 个任务。`,
  });

  for (let stepIndex = 0; stepIndex < queue.totalCount + 8; stepIndex += 1) {
    const nextItem = await selectNextSequentialGraphQueueItem(memory, graph, queue);
    if (queue.status === "completed" || !nextItem) return finishQueue(memory, input.project, input.changeId, queue, workflow);
    if (queue.status === "blocked" || queue.status === "failed") return finishQueue(memory, input.project, input.changeId, queue, workflow);
    if (input.live?.isClosed?.()) return pauseQueue(memory, input.project, input.changeId, queue, workflow, "队列已暂停，等待继续。");

    queue = await markTaskQueueRunning(memory, queue, nextItem.taskId);
    emitAssistantEvent(input.live, {
      runId: queue.id,
      kind: "status",
      phase: "running",
      title: "运行任务队列",
      summary: `当前任务 ${nextItem.taskId}，已完成 ${queue.completedCount}/${queue.totalCount}。`,
    });
    await appendWorkflowEvent(memory, workflow, "node.started", {
      queueRunId: queue.id,
      taskId: nextItem.taskId,
      taskRunId: nextItem.taskRunId,
      status: "running",
      data: {
        taskQueueItemId: nextItem.id,
        workflowGraphPlanId: graph.id,
        workflowGraphNodeId: graphNodeIdForItem(graph, nextItem),
        stepIndex,
      },
    });

    try {
      const result = await runGraphQueueItem({
        project: input.project,
        memory,
        changeId: input.changeId,
        prompt: input.prompt,
        live: input.live,
        queue,
        workflow,
        item: nextItem,
      });
      queue = result.queue;
      workflow = result.workflow;
      await appendWorkflowEvent(memory, workflow, nodeEventTypeFromStatus(result.finishedItemStatus), {
        queueRunId: queue.id,
        taskId: nextItem.taskId,
        taskRunId: result.taskRunId ?? undefined,
        status: result.finishedItemStatus,
        data: {
          taskQueueItemId: nextItem.id,
          workflowGraphPlanId: graph.id,
          workflowGraphNodeId: graphNodeIdForItem(graph, nextItem),
          stepIndex,
        },
      });
      if (result.terminal) return finishQueue(memory, input.project, input.changeId, queue, workflow);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const failedItem = await failQueuedTaskItem(memory, nextItem, message);
      queue = await updateTaskQueueAfterItem(memory, queue);
      emitAssistantEvent(input.live, {
        runId: queue.id,
        kind: "error",
        phase: "failed",
        title: "任务队列已停止",
        summary: `${failedItem.taskId}: ${message}`,
      });
      const reconciled = await reconcileTaskQueues(input.project, { changeId: input.changeId, queueRunId: queue.id });
      workflow = await syncQueue(memory, input.project, input.changeId, queue, workflow, "workflow.failed", queue.failureReason ?? message);
      return { queue, workflowRun: workflow, items: reconciled.items, status: "stopped", summary: queue.failureReason ?? message };
    }
  }

  return failQueue(memory, input.project, input.changeId, queue, workflow, "WorkflowGraph sequential runtime exceeded the V0 safety iteration limit.");
}

export async function selectNextSequentialGraphQueueItem(memory: ResolvedMemory, graph: WorkflowGraphPlan, queue: TaskQueueRun): Promise<TaskQueueItem | null> {
  assertSequentialGraphScope(graph, queue);
  const items = await listTaskQueueItems(memory, queue.changeId, queue.id);
  if (items.some((item) => item.status === "running")) return null;
  const byTaskId = new Map<string, TaskQueueItem>();
  for (const item of items) {
    const key = item.taskId.toUpperCase();
    if (byTaskId.has(key)) throw new Error(`TaskQueue ${queue.id} has duplicate task item ${key}.`);
    byTaskId.set(key, item);
  }
  const graphTaskIds = new Set(graph.nodes.map((node) => node.taskId.toUpperCase()));
  for (const item of items) {
    if (item.status !== "skipped" && !graphTaskIds.has(item.taskId.toUpperCase())) {
      throw new Error(`TaskQueue item ${item.taskId} has no matching WorkflowGraph node.`);
    }
  }
  for (const node of orderedSequentialNodes(graph)) {
    const item = byTaskId.get(node.taskId.toUpperCase());
    if (!item) throw new Error(`WorkflowGraph node ${node.id} has no matching TaskQueue item.`);
    if (item.status === "queued") return item;
  }
  return null;
}

async function runGraphQueueItem(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  queue: TaskQueueRun;
  workflow: WorkflowRun | null;
  item: TaskQueueItem;
}): Promise<{ queue: TaskQueueRun; workflow: WorkflowRun | null; terminal: boolean; taskRunId: string | null; finishedItemStatus: string }> {
  const executionGate = taskQueueExecutionGate(input.queue, input.workflow, input.item);
  const resume = await findTaskRunStageResumeCandidate(input.memory, input.changeId, input.item);
  if (resume?.verdict.kind === "blocked") {
    await assertTaskRunResumeEvidenceScope(input.memory, input.changeId, input.item, resume.verdict);
    emitAssistantEvent(input.live, {
      runId: input.queue.id,
      kind: "error",
      phase: "stage-resume-blocked",
      title: "恢复阶段判定",
      summary: resume.verdict.reason,
      artifactRef: resume.verdict.evidenceRefs[0],
    });
    const blockedItem = await blockQueuedTaskItem(input.memory, input.item, resume.verdict.reason);
    const queue = await updateTaskQueueAfterItem(input.memory, input.queue);
    const workflow = await syncQueue(input.memory, input.project, input.changeId, queue, input.workflow, "workflow.blocked", resume.verdict.reason);
    return { queue, workflow, terminal: true, taskRunId: blockedItem.taskRunId ?? resume.taskRun.id, finishedItemStatus: blockedItem.status };
  }

  const started = resume
    ? { taskRun: resume.taskRun, lease: null }
    : await startTaskRun(input.project, { changeId: input.changeId, taskId: input.item.taskId });
  let runningItem = await markTaskQueueItemRunning(input.memory, input.item, started.taskRun);
  const bindRetryTaskRunToItem = async (retryStarted: RuntimeStartedTaskRun) => {
    runningItem = await markTaskQueueItemRunning(input.memory, runningItem, retryStarted.taskRun);
  };
  if (resume) {
    await assertTaskRunResumeEvidenceScope(input.memory, input.changeId, runningItem, resume.verdict);
    emitAssistantEvent(input.live, {
      runId: input.queue.id,
      kind: "status",
      phase: "stage-resume-verdict",
      title: "恢复阶段判定",
      summary: resume.verdict.reason,
      artifactRef: resume.verdict.evidenceRefs[0],
    });
  }

  const result = resume
    ? await runResumedTaskRunStage({
      project: input.project,
      memory: input.memory,
      taskRun: started.taskRun,
      verdict: resume.verdict,
      prompt: input.prompt,
      live: input.live,
      executionGate,
      onRetryTaskRunStarted: bindRetryTaskRunToItem,
    })
    : await runStartedTaskRunStage({
      project: input.project,
      started,
      prompt: input.prompt,
      live: input.live,
      executionGate,
      ownsLoopFinalization: true,
      onRetryTaskRunStarted: bindRetryTaskRunToItem,
    });
  const taskRun = isRecord(result) && isRecord(result.taskRun) ? result.taskRun : null;
  if (!isTaskRunLike(taskRun)) throw new Error(`Task ${input.item.taskId} did not return a TaskRun result.`);
  const finishedItem = await finishTaskQueueItem(input.memory, runningItem, taskRun);
  const queue = await updateTaskQueueAfterItem(input.memory, input.queue);
  if (finishedItem.status === "blocked" || finishedItem.status === "failed") {
    emitAssistantEvent(input.live, {
      runId: queue.id,
      kind: "error",
      phase: finishedItem.status,
      title: "任务队列已停止",
      summary: queue.blockedReason ?? queue.failureReason ?? `${finishedItem.taskId} 未完成。`,
    });
    const workflow = await syncQueue(input.memory, input.project, input.changeId, queue, input.workflow, queue.status === "blocked" ? "workflow.blocked" : "workflow.failed", queue.blockedReason ?? queue.failureReason);
    return { queue, workflow, terminal: true, taskRunId: taskRun.id, finishedItemStatus: finishedItem.status };
  }
  return { queue, workflow: input.workflow, terminal: false, taskRunId: taskRun.id, finishedItemStatus: finishedItem.status };
}

async function finishQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null): Promise<WorkflowGraphSequentialRuntimeResult> {
  queue = await updateTaskQueueAfterItem(memory, queue);
  const eventType = queue.status === "completed" ? "workflow.completed" : queue.status === "blocked" ? "workflow.blocked" : queue.status === "failed" ? "workflow.failed" : "workflow.reconciled";
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, eventType, queue.blockedReason ?? queue.failureReason);
  const reconciled = await reconcileTaskQueues(project, { changeId, queueRunId: queue.id });
  return {
    queue,
    workflowRun,
    items: reconciled.items,
    status: queue.status === "completed" ? "completed" : "stopped",
    summary: queue.status === "completed" ? "WorkflowGraph sequential runtime completed." : queue.blockedReason ?? queue.failureReason ?? `TaskQueue stopped with status ${queue.status}.`,
  };
}

async function pauseQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null, reason: string): Promise<WorkflowGraphSequentialRuntimeResult> {
  queue = await pauseTaskQueue(memory, queue, reason);
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, "workflow.paused", queue.pausedReason);
  const reconciled = await reconcileTaskQueues(project, { changeId, queueRunId: queue.id });
  return { queue, workflowRun, items: reconciled.items, status: "stopped", summary: reason };
}

async function failQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null, reason: string): Promise<WorkflowGraphSequentialRuntimeResult> {
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, "workflow.failed", reason);
  const reconciled = await reconcileTaskQueues(project, { changeId, queueRunId: queue.id });
  return { queue, workflowRun, items: reconciled.items, status: "stopped", summary: reason };
}

async function syncQueue(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  queue: TaskQueueRun,
  workflow: WorkflowRun | null,
  eventType: WorkflowRunEventType,
  reason?: string,
): Promise<WorkflowRun | null> {
  const reconciled = await reconcileTaskQueues(project, { changeId, queueRunId: queue.id });
  if (!isTaskQueueWorkflowRun(workflow)) return null;
  return syncWorkflowRunFromQueue(memory, workflow, queue, reconciled.items, eventType, reason);
}

function taskQueueExecutionGate(queue: TaskQueueRun, workflow: WorkflowRun | null, item: TaskQueueItem): CodeExecutionGateOptions {
  const queueWorkflow = isTaskQueueWorkflowRun(workflow) ? workflow : null;
  const taskQueueProposalId = item.taskQueueProposalId ?? queue.taskQueueProposalId ?? queueWorkflow?.taskQueueProposalId;
  const workflowGraphPlanId = item.workflowGraphPlanId ?? queue.workflowGraphPlanId ?? queueWorkflow?.workflowGraphPlanId;
  if (!taskQueueProposalId) throw new Error("TaskQueue lifecycle requires taskQueueProposalId.");
  if (!workflowGraphPlanId) throw new Error("TaskQueue lifecycle requires workflowGraphPlanId.");
  if (queue.taskQueueProposalId && queue.taskQueueProposalId !== taskQueueProposalId) throw new Error("TaskQueue lifecycle proposal scope is stale.");
  if (queue.workflowGraphPlanId && queue.workflowGraphPlanId !== workflowGraphPlanId) throw new Error("TaskQueue lifecycle graph scope is stale.");
  if (queueWorkflow?.taskQueueProposalId && queueWorkflow.taskQueueProposalId !== taskQueueProposalId) throw new Error("TaskQueue lifecycle WorkflowRun proposal scope is stale.");
  if (queueWorkflow?.workflowGraphPlanId && queueWorkflow.workflowGraphPlanId !== workflowGraphPlanId) throw new Error("TaskQueue lifecycle WorkflowRun graph scope is stale.");
  if (item.taskQueueProposalId !== taskQueueProposalId) throw new Error("TaskQueue item proposal scope is stale.");
  if (item.workflowGraphPlanId !== workflowGraphPlanId) throw new Error("TaskQueue item graph scope is stale.");
  return { mode: "taskqueue-proposal", taskQueueProposalId, workflowGraphPlanId };
}

async function resolveWorkflowRunForQueue(memory: ResolvedMemory, changeId: string, requestedWorkflowRunId: string | undefined, queue: TaskQueueRun): Promise<WorkflowRun | null> {
  let workflow = requestedWorkflowRunId ? await readWorkflowRun(memory, changeId, requestedWorkflowRunId) : null;
  if (queue.workflowRunId) workflow = await readWorkflowRun(memory, changeId, queue.workflowRunId).catch(() => workflow);
  return workflow;
}

async function resolveSequentialGraph(memory: ResolvedMemory, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null): Promise<SequentialWorkflowGraphPlan> {
  const graphId = queue.workflowGraphPlanId ?? (isTaskQueueWorkflowRun(workflow) ? workflow.workflowGraphPlanId : undefined);
  if (!graphId) throw new Error("WorkflowGraph sequential execution requires workflowGraphPlanId.");
  const changePath = await activeChangePath(memory, changeId);
  const graph = await readWorkflowGraphPlan(memory, changePath, graphId);
  assertSequentialGraphScope(graph, queue);
  if (isTaskQueueWorkflowRun(workflow)) {
    if (workflow.changeId !== changeId || workflow.workflowGraphPlanId !== graph.id) {
      throw new Error("WorkflowGraph sequential execution WorkflowRun scope is stale.");
    }
    if (workflow.taskQueueProposalId !== graph.taskQueueProposalId) {
      throw new Error("WorkflowGraph sequential execution proposal scope is stale.");
    }
  }
  return graph;
}

function assertSequentialGraphScope(graph: WorkflowGraphPlan, queue: TaskQueueRun): asserts graph is SequentialWorkflowGraphPlan {
  if (graph.graphMode !== "sequential-v1") throw new Error(`Unsupported WorkflowGraph mode: ${graph.graphMode}.`);
  if (graph.status !== "compiled") throw new Error("WorkflowGraph sequential execution requires a compiled graph.");
  if (graph.changeId !== queue.changeId) throw new Error("WorkflowGraph sequential execution change scope mismatch.");
  if (queue.workflowGraphPlanId && queue.workflowGraphPlanId !== graph.id) throw new Error("WorkflowGraph sequential execution graph scope is stale.");
  if (queue.taskQueueProposalId && queue.taskQueueProposalId !== graph.taskQueueProposalId) throw new Error("WorkflowGraph sequential execution proposal scope is stale.");
  if (queue.decompositionPlanId && queue.decompositionPlanId !== graph.decompositionPlanId) throw new Error("WorkflowGraph sequential execution decomposition scope is stale.");
  if (queue.readinessManifestId && queue.readinessManifestId !== graph.readinessManifestId) throw new Error("WorkflowGraph sequential execution readiness scope is stale.");
}

function orderedSequentialNodes(graph: SequentialWorkflowGraphPlan): SequentialWorkflowGraphPlan["nodes"] {
  const nodes = graph.nodes.slice().sort((left, right) => left.order - right.order);
  const orderedIds = nodes.map((node) => node.id);
  const taskOrderEdges = graph.edges.filter((edge) => edge.kind === "task-order");
  for (let index = 0; index < orderedIds.length - 1; index += 1) {
    const from = orderedIds[index];
    const to = orderedIds[index + 1];
    if (!taskOrderEdges.some((edge) => edge.from === from && edge.to === to)) {
      throw new Error("WorkflowGraph sequential task-order edges do not match node order.");
    }
  }
  return nodes;
}

function graphNodeIdForItem(graph: SequentialWorkflowGraphPlan, item: TaskQueueItem): string | undefined {
  return graph.nodes.find((node) => node.taskId.toUpperCase() === item.taskId.toUpperCase())?.id;
}

async function appendWorkflowEvent(memory: ResolvedMemory, workflow: WorkflowRun | null, type: WorkflowRunEventType, input: Parameters<typeof appendWorkflowRunEvent>[3]): Promise<void> {
  if (!isTaskQueueWorkflowRun(workflow)) return;
  await appendWorkflowRunEvent(memory, workflow, type, input);
}

function nodeEventTypeFromStatus(status: string): WorkflowRunEventType {
  if (status === "blocked") return "node.blocked";
  if (status === "failed") return "node.failed";
  return "node.completed";
}
