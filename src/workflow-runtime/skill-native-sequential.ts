import { startSkillNativeAuditRun } from "../audit/service.js";
import { startSkillNativeCodeRun } from "../code/manager.js";
import type {
  ProjectCodeExecutionRuntimePort,
  ProjectHarnessExecutionPort,
} from "../project-runtime/execution-ports.js";
import {
  failQueuedTaskItem,
  finishTaskQueueItem,
  listTaskQueueItems,
  markTaskQueueItemRunning,
  markTaskQueueRunning,
  pauseTaskQueue,
  updateTaskQueueAfterItem,
} from "../task-queue/manager.js";
import { startTaskRunFromRuntime } from "../task-run/start-retry.js";
import type {
  ManagedProject,
  SequentialWorkflowGraphPlan,
  TaskQueueItem,
  TaskQueueRun,
  WorkflowRun,
} from "../types/index.js";
import { startSkillNativeValidationRun } from "../validation/service.js";
import {
  appendWorkflowRunEvent,
  readWorkflowRun,
  syncWorkflowRunFromQueue,
} from "../workflow-run/manager.js";
import type { SkillNativeSequentialInitialization } from "./skill-native-initialization.js";
import { emitAssistantEvent, type WorkflowRuntimeLiveSink } from "./kernel/live-events.js";
import {
  runStartedTaskRunStage,
  type RuntimeStartedTaskRun,
} from "./taskrun-stage.js";

export interface SkillNativeSequentialExecutionResult {
  queue: TaskQueueRun;
  workflowRun: WorkflowRun;
  items: TaskQueueItem[];
  status: "completed" | "stopped";
  summary: string;
}

export async function runSkillNativeSequentialExecution(input: {
  project: ManagedProject;
  runtime: ProjectCodeExecutionRuntimePort;
  harness: ProjectHarnessExecutionPort;
  initialized: SkillNativeSequentialInitialization;
  live?: WorkflowRuntimeLiveSink;
}): Promise<SkillNativeSequentialExecutionResult> {
  const graph = input.harness.planning.graph;
  if (graph.graphMode !== "sequential-v1") {
    throw new Error("Skill-native sequential execution requires a sequential-v1 WorkflowGraphPlan.");
  }
  assertExecutionScope(input, graph);
  let queue = await markTaskQueueRunning(input.runtime, input.initialized.queue);
  let workflow = await readWorkflowRun(
    input.runtime,
    input.harness.changeStatus.change!.id,
    input.initialized.workflowRun.id,
  );
  emitAssistantEvent(input.live, {
    runId: queue.id,
    kind: "status",
    phase: "queued",
    title: "任务队列已创建",
    summary: `本地顺序执行 ${queue.totalCount} 个任务。`,
  });

  for (let stepIndex = 0; stepIndex < queue.totalCount + 8; stepIndex += 1) {
    const items = await listTaskQueueItems(input.runtime, queue.changeId, queue.id);
    const nextItem = nextGraphItem(graph, items);
    if (!nextItem) return finishExecution(input.runtime, queue, workflow);
    queue = await markTaskQueueRunning(input.runtime, queue, nextItem.taskId);
    await appendWorkflowRunEvent(input.runtime, workflow, "node.started", {
      queueRunId: queue.id,
      taskId: nextItem.taskId,
      status: "running",
      data: {
        taskQueueItemId: nextItem.id,
        workflowGraphPlanId: graph.id,
        workflowGraphNodeId: graph.nodes.find((node) => node.taskId.toUpperCase() === nextItem.taskId.toUpperCase())!.id,
        stepIndex,
      },
    });
    try {
      const node = graph.nodes.find((candidate) => candidate.taskId.toUpperCase() === nextItem.taskId.toUpperCase());
      if (!node?.prompt) throw new Error(`WorkflowGraph node for ${nextItem.taskId} has no accepted coder objective.`);
      const started = await startTaskRunFromRuntime(
        input.runtime,
        input.harness.changeStatus,
        { changeId: queue.changeId, taskId: nextItem.taskId },
      );
      let runningItem = await markTaskQueueItemRunning(input.runtime, nextItem, started.taskRun);
      const bindRetry = async (retry: RuntimeStartedTaskRun) => {
        runningItem = await markTaskQueueItemRunning(input.runtime, runningItem, retry.taskRun);
      };
      const result = await runStartedTaskRunStage({
        project: input.project,
        started,
        prompt: node.prompt,
        live: input.live,
        executionGate: { mode: "workflow-graph", workflowGraphPlanId: graph.id },
        ownsLoopFinalization: true,
        onRetryTaskRunStarted: bindRetry,
        skillNative: {
          runtime: input.runtime,
          changeStatus: input.harness.changeStatus,
          leafServices: {
            startCode: (project, options) => startSkillNativeCodeRun(project, input.runtime, input.harness, options),
            startValidation: (project, options) => startSkillNativeValidationRun(project, input.runtime, input.harness, options),
            startAudit: (project, options) => startSkillNativeAuditRun(project, input.runtime, input.harness, options),
          },
        },
      });
      if (result.taskRun.status === "interrupted") {
        queue = await pauseTaskQueue(input.runtime, queue, "模型执行已中断，当前 worktree 已保留，可继续。");
        workflow = await syncWorkflowRunFromQueue(
          input.runtime,
          workflow,
          queue,
          await listTaskQueueItems(input.runtime, queue.changeId, queue.id),
          "workflow.paused",
          queue.pausedReason,
        );
        return executionResult(queue, workflow, await listTaskQueueItems(input.runtime, queue.changeId, queue.id));
      }
      const finished = await finishTaskQueueItem(input.runtime, runningItem, result.taskRun);
      queue = await updateTaskQueueAfterItem(input.runtime, queue);
      workflow = await syncWorkflowRunFromQueue(
        input.runtime,
        workflow,
        queue,
        await listTaskQueueItems(input.runtime, queue.changeId, queue.id),
        finished.status === "completed" ? "node.completed" : finished.status === "blocked" ? "workflow.blocked" : "workflow.failed",
        finished.blockedReason ?? finished.failureReason,
      );
      if (finished.status !== "completed") {
        return executionResult(queue, workflow, await listTaskQueueItems(input.runtime, queue.changeId, queue.id));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failQueuedTaskItem(input.runtime, nextItem, message);
      queue = await updateTaskQueueAfterItem(input.runtime, queue);
      workflow = await syncWorkflowRunFromQueue(
        input.runtime,
        workflow,
        queue,
        await listTaskQueueItems(input.runtime, queue.changeId, queue.id),
        "workflow.failed",
        message,
      );
      return executionResult(queue, workflow, await listTaskQueueItems(input.runtime, queue.changeId, queue.id));
    }
  }
  throw new Error("Skill-native sequential execution exceeded the safety iteration limit.");
}

function assertExecutionScope(
  input: Parameters<typeof runSkillNativeSequentialExecution>[0],
  graph: SequentialWorkflowGraphPlan,
): void {
  const changeId = input.harness.changeStatus.change?.id;
  if (!changeId
    || changeId !== graph.changeId
    || changeId !== input.initialized.queue.changeId
    || input.initialized.queue.workflowGraphPlanId !== graph.id
    || input.initialized.workflowRun.workflowGraphPlanId !== graph.id
    || input.runtime.projectId !== input.project.id) {
    throw new Error("Skill-native sequential execution lineage is stale.");
  }
}

function nextGraphItem(
  graph: SequentialWorkflowGraphPlan,
  items: TaskQueueItem[],
): TaskQueueItem | null {
  if (items.some((item) => item.status === "running")) {
    throw new Error("Skill-native sequential execution found an unexpected running queue item.");
  }
  const byTask = new Map(items.map((item) => [item.taskId.toUpperCase(), item]));
  for (const node of graph.nodes.slice().sort((left, right) => left.order - right.order)) {
    const item = byTask.get(node.taskId.toUpperCase());
    if (!item) throw new Error(`WorkflowGraph node ${node.id} has no matching TaskQueue item.`);
    if (item.status === "queued") return item;
  }
  return null;
}

async function finishExecution(
  runtime: ProjectCodeExecutionRuntimePort,
  queue: TaskQueueRun,
  workflow: WorkflowRun,
): Promise<SkillNativeSequentialExecutionResult> {
  const updatedQueue = await updateTaskQueueAfterItem(runtime, queue);
  const items = await listTaskQueueItems(runtime, updatedQueue.changeId, updatedQueue.id);
  const updatedWorkflow = await syncWorkflowRunFromQueue(
    runtime,
    workflow,
    updatedQueue,
    items,
    updatedQueue.status === "completed" ? "workflow.completed" : "workflow.reconciled",
  );
  return executionResult(updatedQueue, updatedWorkflow, items);
}

function executionResult(
  queue: TaskQueueRun,
  workflowRun: WorkflowRun,
  items: TaskQueueItem[],
): SkillNativeSequentialExecutionResult {
  return {
    queue,
    workflowRun,
    items,
    status: queue.status === "completed" ? "completed" : "stopped",
    summary: queue.status === "completed"
      ? "WorkflowGraph sequential runtime completed and is ready for result review."
      : queue.blockedReason ?? queue.failureReason ?? queue.pausedReason ?? `TaskQueue stopped with status ${queue.status}.`,
  };
}
