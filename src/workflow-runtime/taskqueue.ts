import type { ManagedProject } from "../types/index.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import {
  blockQueuedTaskItem,
  failQueuedTaskItem,
  finishTaskQueueItem,
  getNextQueuedTaskQueueItem,
  markTaskQueueItemRunning,
  markTaskQueueRunning,
  pauseTaskQueue,
  reconcileTaskQueues,
  startOrResumeTaskQueue,
  updateTaskQueueAfterItem,
  type TaskQueueReconcileOptions,
  type TaskQueueStartOptions,
  type TaskQueueStartResult,
} from "../task-queue/manager.js";
import { startTaskRun } from "../task-run/manager.js";
import type { CodeExecutionGateOptions } from "../code/manager.js";
import type { ResolvedMemory, TaskRun } from "../types/index.js";
import {
  appendWorkflowRunEvent,
  createWorkflowRunForTaskQueue,
  deriveStageResumeVerdict,
  readWorkflowRun,
  syncWorkflowRunFromQueue,
  validateTaskQueueProposalStart,
  type ValidatedTaskQueueProposal,
} from "../workflow-run/manager.js";
import type { TaskQueueItem, TaskQueueRun, WorkflowRun, WorkflowRunEventType } from "../types/index.js";
import { isTaskQueueWorkflowRun } from "../workflow-run/guards.js";
import { emitAssistantEvent } from "./kernel/live-events.js";
import { isRecord, isTaskRunLike } from "./kernel/runtime-guards.js";
import {
  runMainAgentTaskRunLifecycle,
  runMainAgentTaskRunReworkFromFinished,
  type MainAgentStartedTaskRun,
} from "../main-agent-orchestration/taskrun-lifecycle.js";
import {
  assertMainAgentResumeEvidenceScope,
  executeMainAgentResumedTaskRunStage,
  findMainAgentTaskQueueStageResumeCandidate,
} from "../main-agent-orchestration/taskqueue-stage-resume.js";

export interface WorkflowRuntimeLiveSink {
  emit(event: unknown): void;
  isClosed?(): boolean;
}

export interface TaskQueueSequentialRuntimeInput {
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

export interface TaskQueueSequentialRuntimeResult {
  queue: TaskQueueRun;
  workflowRun: WorkflowRun | null;
  items: TaskQueueItem[];
  status: "completed" | "stopped";
  summary: string;
}

export function startOrResumeWorkflowTaskQueue(project: ManagedProject, options: TaskQueueStartOptions): Promise<TaskQueueStartResult> {
  return startOrResumeTaskQueue(project, options);
}

export function reconcileWorkflowTaskQueue(project: ManagedProject, options: TaskQueueReconcileOptions) {
  return reconcileTaskQueues(project, options);
}

export function validateWorkflowTaskQueueProposalStart(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  taskQueueProposalId: string,
  workflowGraphPlanId: string,
): Promise<ValidatedTaskQueueProposal> {
  return validateTaskQueueProposalStart(memory, project, changeId, taskQueueProposalId, workflowGraphPlanId);
}

export function createWorkflowRunForValidatedTaskQueue(memory: ResolvedMemory, project: ManagedProject, validated: ValidatedTaskQueueProposal): Promise<WorkflowRun> {
  return createWorkflowRunForTaskQueue(memory, project, validated);
}

export function syncWorkflowRunFromTaskQueue(
  memory: ResolvedMemory,
  run: WorkflowRun,
  queue: TaskQueueRun,
  items: TaskQueueItem[],
  eventType: WorkflowRunEventType = "workflow.reconciled",
  reason?: string,
): Promise<WorkflowRun> {
  return syncWorkflowRunFromQueue(memory, run, queue, items, eventType, reason);
}

export function deriveWorkflowStageResumeVerdict(memory: ResolvedMemory, changeId: string, taskRun: TaskRun) {
  return deriveStageResumeVerdict(memory, changeId, taskRun);
}

export async function runTaskQueueSequentialWorkflow(input: TaskQueueSequentialRuntimeInput): Promise<TaskQueueSequentialRuntimeResult> {
  const memory = await resolveProjectMemory(input.project);
  const start = await startOrResumeWorkflowTaskQueue(input.project, {
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
  if (start.resumed) {
    const reconciled = await reconcileWorkflowTaskQueue(input.project, { changeId: input.changeId, queueRunId: queue.id });
    queue = reconciled.queues.find((item) => item.id === queue.id) ?? queue;
  }
  queue = await markTaskQueueRunning(memory, queue);
  emitAssistantEvent(input.live, {
    runId: queue.id,
    kind: "status",
    phase: start.resumed ? "resumed" : "queued",
    title: start.resumed ? "任务队列已恢复" : "任务队列已创建",
    summary: `本地顺序执行 ${queue.totalCount} 个任务。`,
  });

  for (let stepIndex = 0; stepIndex < queue.totalCount + 8; stepIndex += 1) {
    const nextItem = await getNextQueuedTaskQueueItem(memory, queue);
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
    await appendWorkflowEvent(memory, workflow, "task.started", {
      queueRunId: queue.id,
      taskId: nextItem.taskId,
      taskRunId: nextItem.taskRunId,
      status: "running",
      data: { taskQueueItemId: nextItem.id, stepIndex },
    });

    try {
      const result = await runQueueItem({
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
      await appendWorkflowEvent(memory, workflow, taskEventTypeFromStatus(result.finishedItemStatus), {
        queueRunId: queue.id,
        taskId: nextItem.taskId,
        taskRunId: result.taskRunId ?? undefined,
        status: result.finishedItemStatus,
        data: { taskQueueItemId: nextItem.id, stepIndex },
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
      const reconciled = await reconcileWorkflowTaskQueue(input.project, { changeId: input.changeId, queueRunId: queue.id });
      workflow = await syncQueue(memory, input.project, input.changeId, queue, workflow, "workflow.failed", queue.failureReason ?? message);
      return { queue, workflowRun: workflow, items: reconciled.items, status: "stopped", summary: queue.failureReason ?? message };
    }
  }

  return failQueue(memory, input.project, input.changeId, queue, workflow, "TaskQueue sequential runtime exceeded the V0 safety iteration limit.");
}

async function runQueueItem(input: {
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
  const resume = await findMainAgentTaskQueueStageResumeCandidate(input.memory, input.changeId, input.item);
  if (resume?.verdict.kind === "blocked") {
    await assertMainAgentResumeEvidenceScope(input.memory, input.changeId, input.item, resume.verdict);
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
  const bindRetryTaskRunToItem = async (retryStarted: MainAgentStartedTaskRun) => {
    runningItem = await markTaskQueueItemRunning(input.memory, runningItem, retryStarted.taskRun);
  };
  if (resume) {
    await assertMainAgentResumeEvidenceScope(input.memory, input.changeId, runningItem, resume.verdict);
    emitAssistantEvent(input.live, {
      runId: input.queue.id,
      kind: "status",
      phase: "stage-resume-verdict",
      title: "恢复阶段判定",
      summary: resume.verdict.reason,
      artifactRef: resume.verdict.evidenceRefs[0],
    });
  }

  const stageResult = resume
    ? await executeMainAgentResumedTaskRunStage(input.project, input.memory, started.taskRun, resume.verdict, input.prompt, input.live, executionGate)
    : await runMainAgentTaskRunLifecycle({
      project: input.project,
      started,
      prompt: input.prompt,
      live: input.live,
      executionGate,
      ownsLoopFinalization: true,
      onRetryTaskRunStarted: bindRetryTaskRunToItem,
    });
  const resumedTaskRun = isRecord(stageResult) && isTaskRunLike(stageResult.taskRun) ? stageResult.taskRun : null;
  const result = resume && resumedTaskRun
    ? await runMainAgentTaskRunReworkFromFinished({
      project: input.project,
      taskRun: resumedTaskRun,
      workflow: isRecord(stageResult) && "workflow" in stageResult ? stageResult.workflow : stageResult,
      prompt: input.prompt,
      live: input.live,
      executionGate,
      ownsLoopFinalization: true,
      onRetryTaskRunStarted: bindRetryTaskRunToItem,
    })
    : stageResult;
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

async function finishQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null): Promise<TaskQueueSequentialRuntimeResult> {
  queue = await updateTaskQueueAfterItem(memory, queue);
  const eventType = queue.status === "completed" ? "workflow.completed" : queue.status === "blocked" ? "workflow.blocked" : queue.status === "failed" ? "workflow.failed" : "workflow.reconciled";
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, eventType, queue.blockedReason ?? queue.failureReason);
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
  return {
    queue,
    workflowRun,
    items: reconciled.items,
    status: queue.status === "completed" ? "completed" : "stopped",
    summary: queue.status === "completed" ? "TaskQueue sequential runtime completed." : queue.blockedReason ?? queue.failureReason ?? `TaskQueue stopped with status ${queue.status}.`,
  };
}

async function pauseQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null, reason: string): Promise<TaskQueueSequentialRuntimeResult> {
  queue = await pauseTaskQueue(memory, queue, reason);
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, "workflow.paused", queue.pausedReason);
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
  return { queue, workflowRun, items: reconciled.items, status: "stopped", summary: reason };
}

async function failQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null, reason: string): Promise<TaskQueueSequentialRuntimeResult> {
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, "workflow.failed", reason);
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
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
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
  if (!isTaskQueueWorkflowRun(workflow)) return null;
  return syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, eventType, reason);
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

async function appendWorkflowEvent(memory: ResolvedMemory, workflow: WorkflowRun | null, type: WorkflowRunEventType, input: Parameters<typeof appendWorkflowRunEvent>[3]): Promise<void> {
  if (!isTaskQueueWorkflowRun(workflow)) return;
  await appendWorkflowRunEvent(memory, workflow, type, input);
}

function taskEventTypeFromStatus(status: string): WorkflowRunEventType {
  if (status === "blocked") return "task.blocked";
  if (status === "failed") return "task.failed";
  return "task.completed";
}
