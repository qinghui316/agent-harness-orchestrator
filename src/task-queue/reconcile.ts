import { listAuditResults } from "../audit/artifacts.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { listRuns } from "../run/manager.js";
import { isActiveTaskRunStatus, listTaskRuns, listWorkerLeases } from "../task-run/manager.js";
import { listValidationResults } from "../validation/artifacts.js";
import { readWorkflowRun, syncWorkflowRunFromQueue } from "../workflow-run/manager.js";
import type { ManagedProject, TaskQueueItem, TaskQueueRun } from "../types/index.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { TaskQueueReconcileOptions } from "./types.js";
import { finishTaskQueueItem, pauseTaskQueue, requeueTaskQueueItemAfterInterruption, updateTaskQueueAfterItem } from "./item-transitions.js";
import { listTaskQueueItems, listTaskQueues, readTaskQueueRun } from "./repository.js";

export async function reconcileTaskQueues(project: ManagedProject, options: TaskQueueReconcileOptions): Promise<{ queues: TaskQueueRun[]; items: TaskQueueItem[] }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "TaskQueue reconcile");
  return reconcileTaskQueuesFromRuntime(memory, options);
}

export async function reconcileTaskQueuesFromRuntime(
  memory: ProjectRunsPathPort,
  options: TaskQueueReconcileOptions,
): Promise<{ queues: TaskQueueRun[]; items: TaskQueueItem[] }> {
  const queues = await listTaskQueues(memory, options.changeId);
  const taskRuns = await listTaskRuns(memory, options.changeId);
  await listWorkerLeases(memory, options.changeId);
  await listRuns(memory);
  await listValidationResults(memory, options.changeId);
  await listAuditResults(memory, options.changeId);
  const reconciledQueues: TaskQueueRun[] = [];
  const reconciledItems: TaskQueueItem[] = [];
  for (const queue of queues) {
    if (options.queueRunId && queue.id !== options.queueRunId) continue;
    const items = await listTaskQueueItems(memory, options.changeId, queue.id);
    const nextItems: TaskQueueItem[] = [];
    for (const item of items) {
      const taskRun = item.taskRunId ? taskRuns.find((run) => run.id === item.taskRunId) : undefined;
      if (taskRun && item.status === "running" && !isActiveTaskRunStatus(taskRun.status)) {
        nextItems.push(taskRun.status === "interrupted"
          ? await requeueTaskQueueItemAfterInterruption(memory, item, taskRun, "模型执行已中断，当前 worktree 已保留，可继续。")
          : await finishTaskQueueItem(memory, item, taskRun));
      } else {
        nextItems.push(item);
      }
    }
    const latestQueue = await readTaskQueueRun(memory, queue.changeId, queue.id);
    let nextQueue = await updateTaskQueueAfterItem(memory, latestQueue);
    if (nextQueue.status === "running" && !nextItems.some((item) => item.status === "running")) {
      nextQueue = await pauseTaskQueue(memory, nextQueue, "队列已暂停，等待继续。");
    }
    const currentItems = await listTaskQueueItems(memory, options.changeId, queue.id);
    if (nextQueue.workflowRunId) {
      const workflow = await readWorkflowRun(memory, nextQueue.changeId, nextQueue.workflowRunId).catch(() => null);
      if (workflow) await syncWorkflowRunFromQueue(memory, workflow, nextQueue, currentItems, "workflow.reconciled");
    }
    reconciledQueues.push(nextQueue);
    reconciledItems.push(...currentItems);
  }
  return { queues: reconciledQueues, items: reconciledItems };
}
