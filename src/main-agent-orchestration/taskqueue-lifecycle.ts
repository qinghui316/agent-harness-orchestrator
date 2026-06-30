import type { CodeExecutionGateOptions } from "../code/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import {
  blockQueuedTaskItem,
  failQueuedTaskItem,
  finishTaskQueueItem,
  getNextQueuedTaskQueueItem,
  markTaskQueueItemRunning,
  markTaskQueueRunning,
  pauseTaskQueue,
  updateTaskQueueAfterItem,
} from "../task-queue/manager.js";
import { startTaskRun } from "../task-run/manager.js";
import type { ManagedProject, ResolvedMemory, TaskQueueItem, TaskQueueRun, WorkflowRun } from "../types/index.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../workbench/types.js";
import { readWorkflowRun } from "../workflow-run/manager.js";
import { reconcileWorkflowTaskQueue, startOrResumeWorkflowTaskQueue, syncWorkflowRunFromTaskQueue } from "../workflow-runtime/taskqueue.js";
import { emitAssistantEvent } from "../workflow-runtime/kernel/live-events.js";
import { isRecord, isTaskRunLike } from "../workflow-runtime/kernel/runtime-guards.js";
import { runMainAgentTaskRunLifecycle, runMainAgentTaskRunReworkFromFinished, type MainAgentStartedTaskRun } from "./taskrun-lifecycle.js";
import {
  assertMainAgentResumeEvidenceScope,
  executeMainAgentResumedTaskRunStage,
  findMainAgentTaskQueueStageResumeCandidate,
} from "./taskqueue-stage-resume.js";

export async function runMainAgentTaskQueueLifecycle(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  const start = await startOrResumeWorkflowTaskQueue(project, {
    changeId,
    taskQueueProposalId: request.taskQueueProposalId,
    workflowGraphPlanId: request.workflowGraphPlanId,
    decompositionPlanId: request.decompositionPlanId,
    readinessManifestId: request.readinessManifestId,
    workflowRunId: request.workflowRunId,
    queueRunId: request.queueRunId,
  });
  let queue = start.queue;
  let workflow = await resolveWorkflowRunForQueue(memory, changeId, request.workflowRunId, queue);
  if (start.resumed) {
    const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
    queue = reconciled.queues.find((item) => item.id === queue.id) ?? queue;
  }
  queue = await markTaskQueueRunning(memory, queue);
  emitAssistantEvent(live, {
    runId: queue.id,
    kind: "status",
    phase: start.resumed ? "resumed" : "queued",
    title: start.resumed ? "任务队列已恢复" : "任务队列已创建",
    summary: `本地顺序执行 ${queue.totalCount} 个任务。`,
  });

  while (true) {
    const nextItem = await getNextQueuedTaskQueueItem(memory, queue);
    if (!nextItem) return finishQueue(memory, project, changeId, queue, workflow);
    if (live?.isClosed?.()) return pauseQueue(memory, project, changeId, queue, workflow, "队列已暂停，等待继续。");

    queue = await markTaskQueueRunning(memory, queue, nextItem.taskId);
    emitAssistantEvent(live, {
      runId: queue.id,
      kind: "status",
      phase: "running",
      title: "运行任务队列",
      summary: `当前任务 ${nextItem.taskId}，已完成 ${queue.completedCount}/${queue.totalCount}。`,
    });
    try {
      const result = await runMainAgentQueueItem({ project, memory, changeId, request, live, queue, workflow, item: nextItem });
      queue = result.queue;
      workflow = result.workflow;
      if (result.terminal) return finishQueue(memory, project, changeId, queue, workflow);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const failedItem = await failQueuedTaskItem(memory, nextItem, message);
      queue = await updateTaskQueueAfterItem(memory, queue);
      emitAssistantEvent(live, {
        runId: queue.id,
        kind: "error",
        phase: "failed",
        title: "任务队列已停止",
        summary: `${failedItem.taskId}: ${message}`,
      });
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, "workflow.failed", queue.failureReason);
      return { queue, workflowRun: workflow, items: reconciled.items };
    }

    if (live?.isClosed?.()) return pauseQueue(memory, project, changeId, queue, workflow, "队列已暂停，等待继续。");
    if (queue.status === "blocked" || queue.status === "failed" || queue.status === "completed") {
      return finishQueue(memory, project, changeId, queue, workflow);
    }
  }
}

async function runMainAgentQueueItem(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  changeId: string;
  request: WorkbenchWorkflowActionRequest;
  live?: WorkbenchLiveSink;
  queue: TaskQueueRun;
  workflow: WorkflowRun | null;
  item: TaskQueueItem;
}): Promise<{ queue: TaskQueueRun; workflow: WorkflowRun | null; terminal: boolean }> {
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
    await blockQueuedTaskItem(input.memory, input.item, resume.verdict.reason);
    const queue = await updateTaskQueueAfterItem(input.memory, input.queue);
    const workflow = await syncQueue(input.memory, input.project, input.changeId, queue, input.workflow, "workflow.blocked", resume.verdict.reason);
    return { queue, workflow, terminal: true };
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
    ? await executeMainAgentResumedTaskRunStage(input.project, input.memory, started.taskRun, resume.verdict, input.request.prompt, input.live, executionGate)
    : await runMainAgentTaskRunLifecycle({
      project: input.project,
      started,
      prompt: input.request.prompt,
      live: input.live,
      executionGate,
      onRetryTaskRunStarted: bindRetryTaskRunToItem,
    });
  const resumedTaskRun = isRecord(stageResult) && isTaskRunLike(stageResult.taskRun) ? stageResult.taskRun : null;
  const result = resume && resumedTaskRun
    ? await runMainAgentTaskRunReworkFromFinished({
      project: input.project,
      taskRun: resumedTaskRun,
      workflow: isRecord(stageResult) && "workflow" in stageResult ? stageResult.workflow : stageResult,
      prompt: input.request.prompt,
      live: input.live,
      executionGate,
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
    return { queue, workflow, terminal: true };
  }
  return { queue, workflow: input.workflow, terminal: false };
}

async function resolveWorkflowRunForQueue(memory: ResolvedMemory, changeId: string, requestedWorkflowRunId: string | undefined, queue: TaskQueueRun): Promise<WorkflowRun | null> {
  let workflow = requestedWorkflowRunId ? await readWorkflowRun(memory, changeId, requestedWorkflowRunId) : null;
  if (queue.workflowRunId) workflow = await readWorkflowRun(memory, changeId, queue.workflowRunId).catch(() => workflow);
  return workflow;
}

async function finishQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null): Promise<unknown> {
  queue = await updateTaskQueueAfterItem(memory, queue);
  const eventType = queue.status === "completed" ? "workflow.completed" : queue.status === "blocked" ? "workflow.blocked" : queue.status === "failed" ? "workflow.failed" : "workflow.reconciled";
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, eventType, queue.blockedReason ?? queue.failureReason);
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
  return { queue, workflowRun, items: reconciled.items };
}

async function pauseQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null, reason: string): Promise<unknown> {
  queue = await pauseTaskQueue(memory, queue, reason);
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, "workflow.paused", queue.pausedReason);
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
  return { queue, workflowRun, items: reconciled.items };
}

async function syncQueue(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  queue: TaskQueueRun,
  workflow: WorkflowRun | null,
  eventType: Parameters<typeof syncWorkflowRunFromTaskQueue>[4],
  reason?: string,
): Promise<WorkflowRun | null> {
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
  if (!workflow) return null;
  return syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, eventType, reason);
}

function taskQueueExecutionGate(queue: TaskQueueRun, workflow: WorkflowRun | null, item: TaskQueueItem): CodeExecutionGateOptions {
  const taskQueueProposalId = item.taskQueueProposalId ?? queue.taskQueueProposalId ?? workflow?.taskQueueProposalId;
  const workflowGraphPlanId = item.workflowGraphPlanId ?? queue.workflowGraphPlanId ?? workflow?.workflowGraphPlanId;
  if (!taskQueueProposalId) throw new Error("TaskQueue lifecycle requires taskQueueProposalId.");
  if (!workflowGraphPlanId) throw new Error("TaskQueue lifecycle requires workflowGraphPlanId.");
  if (queue.taskQueueProposalId && queue.taskQueueProposalId !== taskQueueProposalId) throw new Error("TaskQueue lifecycle proposal scope is stale.");
  if (queue.workflowGraphPlanId && queue.workflowGraphPlanId !== workflowGraphPlanId) throw new Error("TaskQueue lifecycle graph scope is stale.");
  if (workflow?.taskQueueProposalId && workflow.taskQueueProposalId !== taskQueueProposalId) throw new Error("TaskQueue lifecycle WorkflowRun proposal scope is stale.");
  if (workflow?.workflowGraphPlanId && workflow.workflowGraphPlanId !== workflowGraphPlanId) throw new Error("TaskQueue lifecycle WorkflowRun graph scope is stale.");
  if (item.taskQueueProposalId !== taskQueueProposalId) throw new Error("TaskQueue item proposal scope is stale.");
  if (item.workflowGraphPlanId !== workflowGraphPlanId) throw new Error("TaskQueue item graph scope is stale.");
  return { mode: "taskqueue-proposal", taskQueueProposalId, workflowGraphPlanId };
}
