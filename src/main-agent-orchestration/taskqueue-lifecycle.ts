import { resolveProjectMemory } from "../memory/resolver.js";
import { markTaskQueueRunning } from "../task-queue/manager.js";
import type { ManagedProject, ResolvedMemory, TaskQueueRun, WorkflowRun } from "../types/index.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../workbench/types.js";
import { readWorkflowRun } from "../workflow-run/manager.js";
import { reconcileWorkflowTaskQueue, startOrResumeWorkflowTaskQueue } from "../workflow-runtime/taskqueue.js";
import { emitAssistantEvent } from "../workflow-runtime/kernel/live-events.js";
import { appendMainAgentLoopEvent, ensureMainAgentLoopRun, finishMainAgentLoopRun } from "./loop-evidence.js";
import { runMainAgentTaskQueueStepLoop } from "./taskqueue-step-loop.js";

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
  const workflow = await resolveWorkflowRunForQueue(memory, changeId, request.workflowRunId, queue);
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

  const { run: loopRun, created: loopCreated } = await ensureMainAgentLoopRun(memory, {
    changeId,
    projectId: project.id,
    entrypoint: "task-queue",
  });
  if (loopCreated) {
    await appendMainAgentLoopEvent(memory, loopRun, {
      type: "loop.started",
      entrypoint: "task-queue",
      summary: `Main-agent TaskQueue loop started for queue ${queue.id}.`,
      refs: {
        taskQueueRunIds: [queue.id],
        workflowRunIds: [workflow?.id ?? queue.workflowRunId ?? ""],
      },
    });
  }

  try {
    const result = await runMainAgentTaskQueueStepLoop({
      project,
      memory,
      changeId,
      prompt: request.prompt,
      live,
      queue,
      workflow,
      loopRun,
    });
    await finishMainAgentLoopRun(memory, loopRun.id, {
      status: result.loopStatus,
      summary: result.summary,
      refs: {
        taskQueueRunIds: [result.queue.id],
        workflowRunIds: [result.workflowRun?.id ?? result.queue.workflowRunId ?? ""],
      },
    });
    return { queue: result.queue, workflowRun: result.workflowRun, items: result.items };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await finishMainAgentLoopRun(memory, loopRun.id, {
      status: "stopped",
      summary: `TaskQueue main-agent loop failed: ${message}`,
      refs: {
        taskQueueRunIds: [queue.id],
        workflowRunIds: [workflow?.id ?? queue.workflowRunId ?? ""],
      },
    }).catch(() => undefined);
    throw cause;
  }
}

async function resolveWorkflowRunForQueue(memory: ResolvedMemory, changeId: string, requestedWorkflowRunId: string | undefined, queue: TaskQueueRun): Promise<WorkflowRun | null> {
  let workflow = requestedWorkflowRunId ? await readWorkflowRun(memory, changeId, requestedWorkflowRunId) : null;
  if (queue.workflowRunId) workflow = await readWorkflowRun(memory, changeId, queue.workflowRunId).catch(() => workflow);
  return workflow;
}
