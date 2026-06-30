import type { CodeExecutionGateOptions } from "../../code/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import {
  failQueuedTaskItem,
  finishTaskQueueItem,
  getNextQueuedTaskQueueItem,
  markTaskQueueItemRunning,
  markTaskQueueRunning,
  pauseTaskQueue,
  updateTaskQueueAfterItem,
} from "../../task-queue/manager.js";
import { startTaskRun } from "../../task-run/manager.js";
import type { ManagedProject } from "../../types/index.js";
import { readWorkflowRun } from "../../workflow-run/manager.js";
import { reconcileWorkflowTaskQueue, startOrResumeWorkflowTaskQueue, syncWorkflowRunFromTaskQueue } from "../taskqueue.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../../workbench/types.js";
import { emitAssistantEvent } from "./live-events.js";
import { isRecord, isTaskRunLike } from "./runtime-guards.js";
import { findTaskQueueStageResumeCandidate, executeResumedTaskRunStage } from "./stage-resume-runner.js";
import { executeStartedTaskRunWorkflow, executeTaskRunReworkIfEligible } from "./task-run-sequence.js";

export async function runTaskQueueSequence(
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
  let workflow = request.workflowRunId ? await readWorkflowRun(memory, changeId, request.workflowRunId) : null;
  if (queue.workflowRunId) workflow = await readWorkflowRun(memory, changeId, queue.workflowRunId).catch(() => workflow);
  const taskQueueProposalId = request.taskQueueProposalId ?? queue.taskQueueProposalId;
  const workflowGraphPlanId = request.workflowGraphPlanId ?? queue.workflowGraphPlanId ?? workflow?.workflowGraphPlanId;
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
    if (!nextItem) {
      queue = await updateTaskQueueAfterItem(memory, queue);
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, queue.status === "completed" ? "workflow.completed" : "workflow.reconciled");
      return { queue, workflowRun: workflow, items: reconciled.items };
    }
    if (live?.isClosed?.()) {
      queue = await pauseTaskQueue(memory, queue, "队列已暂停，等待继续。");
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, "workflow.paused", queue.pausedReason);
      return { queue, workflowRun: workflow, items: reconciled.items };
    }

    queue = await markTaskQueueRunning(memory, queue, nextItem.taskId);
    emitAssistantEvent(live, {
      runId: queue.id,
      kind: "status",
      phase: "running",
      title: "运行任务队列",
      summary: `当前任务 ${nextItem.taskId}，已完成 ${queue.completedCount}/${queue.totalCount}。`,
    });
    try {
      const resume = await findTaskQueueStageResumeCandidate(memory, changeId, nextItem.taskId);
      if (resume?.verdict.kind === "blocked") {
        emitAssistantEvent(live, {
          runId: queue.id,
          kind: "error",
          phase: "stage-resume-blocked",
          title: "恢复阶段判定",
          summary: resume.verdict.reason,
          artifactRef: resume.verdict.evidenceRefs[0],
        });
        await failQueuedTaskItem(memory, nextItem, resume.verdict.reason);
        queue = await updateTaskQueueAfterItem(memory, queue);
        const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
        if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, "workflow.blocked", resume.verdict.reason);
        return { queue, workflowRun: workflow, items: reconciled.items };
      }
      const executionGate = taskQueueExecutionGate(taskQueueProposalId, workflowGraphPlanId);
      const started = resume
        ? { taskRun: resume.taskRun, lease: null }
        : await startTaskRun(project, { changeId, taskId: nextItem.taskId });
      let runningItem = await markTaskQueueItemRunning(memory, nextItem, started.taskRun);
      const bindRetryTaskRunToItem = async (retryStarted: { taskRun: typeof started.taskRun }) => {
        runningItem = await markTaskQueueItemRunning(memory, runningItem, retryStarted.taskRun);
      };
      if (resume) {
        emitAssistantEvent(live, {
          runId: queue.id,
          kind: "status",
          phase: "stage-resume-verdict",
          title: "恢复阶段判定",
          summary: resume.verdict.reason,
          artifactRef: resume.verdict.evidenceRefs[0],
        });
      }
      const stageResult = resume
        ? await executeResumedTaskRunStage(project, memory, started.taskRun, resume.verdict, request.prompt, live, executionGate)
        : await executeStartedTaskRunWorkflow(project, started as Awaited<ReturnType<typeof startTaskRun>>, request.prompt, live, executionGate, bindRetryTaskRunToItem);
      const resumedTaskRun = isRecord(stageResult) && isTaskRunLike(stageResult.taskRun) ? stageResult.taskRun : null;
      const result = resume && resumedTaskRun
        ? await executeTaskRunReworkIfEligible(project, resumedTaskRun, isRecord(stageResult) && "workflow" in stageResult ? stageResult.workflow : stageResult, request.prompt, live, executionGate, bindRetryTaskRunToItem)
        : stageResult;
      const taskRun = isRecord(result) && isRecord(result.taskRun) ? result.taskRun : null;
      if (!isTaskRunLike(taskRun)) throw new Error(`Task ${nextItem.taskId} did not return a TaskRun result.`);
      const finishedItem = await finishTaskQueueItem(memory, runningItem, taskRun);
      queue = await updateTaskQueueAfterItem(memory, queue);
      if (finishedItem.status === "blocked" || finishedItem.status === "failed") {
        emitAssistantEvent(live, {
          runId: queue.id,
          kind: "error",
          phase: finishedItem.status,
          title: "任务队列已停止",
          summary: queue.blockedReason ?? queue.failureReason ?? `${finishedItem.taskId} 未完成。`,
        });
        const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
        if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, queue.status === "blocked" ? "workflow.blocked" : "workflow.failed", queue.blockedReason ?? queue.failureReason);
        return { queue, workflowRun: workflow, items: reconciled.items };
      }
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

    if (live?.isClosed?.()) {
      queue = await pauseTaskQueue(memory, queue, "队列已暂停，等待继续。");
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, "workflow.paused", queue.pausedReason);
      return { queue, workflowRun: workflow, items: reconciled.items };
    }
    if (queue.status === "blocked" || queue.status === "failed" || queue.status === "completed") {
      const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(memory, workflow, queue, reconciled.items, queue.status === "completed" ? "workflow.completed" : queue.status === "blocked" ? "workflow.blocked" : "workflow.failed", queue.blockedReason ?? queue.failureReason);
      return { queue, workflowRun: workflow, items: reconciled.items };
    }
  }
}

function taskQueueExecutionGate(taskQueueProposalId: string | undefined, workflowGraphPlanId: string | undefined): CodeExecutionGateOptions | undefined {
  return taskQueueProposalId && workflowGraphPlanId
    ? { mode: "taskqueue-proposal", taskQueueProposalId, workflowGraphPlanId }
    : undefined;
}
