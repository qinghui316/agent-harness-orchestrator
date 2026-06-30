import type { CodeExecutionGateOptions } from "../code/manager.js";
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
import type { WorkbenchLiveSink } from "../workbench/types.js";
import { reconcileWorkflowTaskQueue, syncWorkflowRunFromTaskQueue } from "../workflow-runtime/taskqueue.js";
import { emitAssistantEvent } from "../workflow-runtime/kernel/live-events.js";
import { isRecord, isTaskRunLike } from "../workflow-runtime/kernel/runtime-guards.js";
import { appendMainAgentLoopEvent, type MainAgentLoopRun } from "./loop-evidence.js";
import {
  recordMainAgentQueueDecisionEvidence,
  type MainAgentQueueDecisionKind,
  type MainAgentQueueObservationSummary,
} from "./queue-step-evidence.js";
import {
  runMainAgentTaskRunLifecycle,
  runMainAgentTaskRunReworkFromFinished,
  type MainAgentStartedTaskRun,
} from "./taskrun-lifecycle.js";
import {
  assertMainAgentResumeEvidenceScope,
  executeMainAgentResumedTaskRunStage,
  findMainAgentTaskQueueStageResumeCandidate,
} from "./taskqueue-stage-resume.js";

export interface MainAgentQueueObservation {
  queue: TaskQueueRun;
  workflow: WorkflowRun | null;
  nextItem: TaskQueueItem | null;
  liveClosed: boolean;
}

export interface MainAgentQueueDecision {
  kind: MainAgentQueueDecisionKind;
  reason: string;
  selectedItem: TaskQueueItem | null;
  expectedQueueStatus: string;
}

export interface MainAgentQueueStepResult {
  queue: TaskQueueRun;
  workflowRun: WorkflowRun | null;
  items: TaskQueueItem[];
  loopStatus: "completed" | "stopped";
  summary: string;
}

export async function runMainAgentTaskQueueStepLoop(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  queue: TaskQueueRun;
  workflow: WorkflowRun | null;
  loopRun: MainAgentLoopRun;
}): Promise<MainAgentQueueStepResult> {
  let queue = input.queue;
  let workflow = input.workflow;

  for (let queueStepIndex = 0; queueStepIndex < queue.totalCount + 8; queueStepIndex += 1) {
    const observation = await observeMainAgentQueue({
      memory: input.memory,
      queue,
      workflow,
      live: input.live,
    });
    await appendMainAgentLoopEvent(input.memory, input.loopRun, {
      type: "observation.recorded",
      stepIndex: queueStepIndex,
      entrypoint: "task-queue",
      summary: summarizeQueueObservation(observation),
      refs: queueObservationRefs(observation),
    });

    const decision = decideNextMainAgentQueueStep(observation);
    const decisionEvidence = await recordMainAgentQueueDecisionEvidence(input.memory, input.loopRun, {
      queueStepIndex,
      observation: summarizeQueueObservationForEvidence(observation),
      decision: {
        kind: decision.kind,
        reason: decision.reason,
        selectedItemId: decision.selectedItem?.id ?? null,
        taskId: decision.selectedItem?.taskId ?? null,
        expectedQueueStatus: decision.expectedQueueStatus,
      },
      refs: queueObservationRefs(observation),
    });
    await appendMainAgentLoopEvent(input.memory, input.loopRun, {
      type: "decision.recorded",
      stepIndex: queueStepIndex,
      entrypoint: "task-queue",
      decisionKind: decision.kind,
      decisionEvidenceId: decisionEvidence.id,
      decisionEvidenceRef: decisionEvidence.ref,
      reason: decision.reason,
      summary: summarizeQueueDecision(decision),
      refs: queueObservationRefs(observation),
    });

    if (decision.kind === "complete") {
      return finishQueue(input.memory, input.project, input.changeId, queue, workflow);
    }
    if (decision.kind === "pause") {
      return pauseQueue(input.memory, input.project, input.changeId, queue, workflow, decision.reason);
    }
    if (decision.kind === "block" || decision.kind === "fail") {
      return finishQueue(input.memory, input.project, input.changeId, queue, workflow);
    }
    if (!decision.selectedItem) {
      return failQueueWithoutItem(input.memory, input.project, input.changeId, queue, workflow, "Queue decision selected run-next-item without an item.");
    }

    queue = await markTaskQueueRunning(input.memory, queue, decision.selectedItem.taskId);
    emitAssistantEvent(input.live, {
      runId: queue.id,
      kind: "status",
      phase: "running",
      title: "运行任务队列",
      summary: `当前任务 ${decision.selectedItem.taskId}，已完成 ${queue.completedCount}/${queue.totalCount}。`,
    });
    await appendMainAgentLoopEvent(input.memory, input.loopRun, {
      type: "leaf.started",
      stepIndex: queueStepIndex,
      entrypoint: "task-queue",
      decisionKind: decision.kind,
      status: "running",
      reason: decision.reason,
      summary: `Queue selected ${decision.selectedItem.taskId}.`,
      refs: queueObservationRefs({ queue, workflow, nextItem: decision.selectedItem, liveClosed: false }),
    });

    try {
      const result = await runMainAgentQueueItem({
        project: input.project,
        memory: input.memory,
        changeId: input.changeId,
        prompt: input.prompt,
        live: input.live,
        queue,
        workflow,
        item: decision.selectedItem,
        loopRunId: input.loopRun.id,
      });
      queue = result.queue;
      workflow = result.workflow;
      await appendMainAgentLoopEvent(input.memory, input.loopRun, {
        type: "leaf.completed",
        stepIndex: queueStepIndex,
        entrypoint: "task-queue",
        decisionKind: decision.kind,
        status: result.finishedItemStatus,
        summary: `Queue item ${decision.selectedItem.taskId} finished with status ${result.finishedItemStatus}.`,
        refs: queueResultRefs(queue, workflow, decision.selectedItem, result.taskRunId),
      });
      if (result.terminal) return finishQueue(input.memory, input.project, input.changeId, queue, workflow);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const failedItem = await failQueuedTaskItem(input.memory, decision.selectedItem, message);
      queue = await updateTaskQueueAfterItem(input.memory, queue);
      emitAssistantEvent(input.live, {
        runId: queue.id,
        kind: "error",
        phase: "failed",
        title: "任务队列已停止",
        summary: `${failedItem.taskId}: ${message}`,
      });
      await appendMainAgentLoopEvent(input.memory, input.loopRun, {
        type: "leaf.completed",
        stepIndex: queueStepIndex,
        entrypoint: "task-queue",
        decisionKind: decision.kind,
        status: "failed",
        reason: message,
        summary: `Queue item ${failedItem.taskId} failed: ${message}`,
        refs: queueResultRefs(queue, workflow, failedItem, failedItem.taskRunId),
      });
      const reconciled = await reconcileWorkflowTaskQueue(input.project, { changeId: input.changeId, queueRunId: queue.id });
      if (workflow) workflow = await syncWorkflowRunFromTaskQueue(input.memory, workflow, queue, reconciled.items, "workflow.failed", queue.failureReason);
      return { queue, workflowRun: workflow, items: reconciled.items, loopStatus: "stopped", summary: queue.failureReason ?? message };
    }

    if (queue.status === "blocked" || queue.status === "failed") {
      return finishQueue(input.memory, input.project, input.changeId, queue, workflow);
    }
  }

  return failQueueWithoutItem(input.memory, input.project, input.changeId, queue, workflow, "TaskQueue step loop exceeded the V1 safety iteration limit.");
}

export async function observeMainAgentQueue(input: {
  memory: ResolvedMemory;
  queue: TaskQueueRun;
  workflow: WorkflowRun | null;
  live?: WorkbenchLiveSink;
}): Promise<MainAgentQueueObservation> {
  return {
    queue: input.queue,
    workflow: input.workflow,
    nextItem: await getNextQueuedTaskQueueItem(input.memory, input.queue),
    liveClosed: Boolean(input.live?.isClosed?.()),
  };
}

export function decideNextMainAgentQueueStep(observation: MainAgentQueueObservation): MainAgentQueueDecision {
  if (observation.queue.status === "completed") {
    return { kind: "complete", reason: "TaskQueue is already completed.", selectedItem: null, expectedQueueStatus: "completed" };
  }
  if (observation.queue.status === "blocked") {
    return { kind: "block", reason: observation.queue.blockedReason ?? "TaskQueue is blocked.", selectedItem: null, expectedQueueStatus: "blocked" };
  }
  if (observation.queue.status === "failed") {
    return { kind: "fail", reason: observation.queue.failureReason ?? "TaskQueue failed.", selectedItem: null, expectedQueueStatus: "failed" };
  }
  if (!observation.nextItem) {
    return { kind: "complete", reason: "No queued TaskQueue item remains.", selectedItem: null, expectedQueueStatus: "completed" };
  }
  if (observation.liveClosed) {
    return { kind: "pause", reason: "队列已暂停，等待继续。", selectedItem: observation.nextItem, expectedQueueStatus: "paused" };
  }
  return {
    kind: "run-next-item",
    reason: `Run next TaskQueue item ${observation.nextItem.taskId}.`,
    selectedItem: observation.nextItem,
    expectedQueueStatus: "running",
  };
}

async function runMainAgentQueueItem(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  changeId: string;
  prompt?: string;
  live?: WorkbenchLiveSink;
  queue: TaskQueueRun;
  workflow: WorkflowRun | null;
  item: TaskQueueItem;
  loopRunId: string;
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
      loopRunId: input.loopRunId,
      ownsLoopFinalization: false,
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
      loopRunId: input.loopRunId,
      ownsLoopFinalization: false,
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

async function finishQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null): Promise<MainAgentQueueStepResult> {
  queue = await updateTaskQueueAfterItem(memory, queue);
  const eventType = queue.status === "completed" ? "workflow.completed" : queue.status === "blocked" ? "workflow.blocked" : queue.status === "failed" ? "workflow.failed" : "workflow.reconciled";
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, eventType, queue.blockedReason ?? queue.failureReason);
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
  return {
    queue,
    workflowRun,
    items: reconciled.items,
    loopStatus: queue.status === "completed" ? "completed" : "stopped",
    summary: queue.status === "completed" ? "TaskQueue main-agent step loop completed." : queue.blockedReason ?? queue.failureReason ?? `TaskQueue stopped with status ${queue.status}.`,
  };
}

async function pauseQueue(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null, reason: string): Promise<MainAgentQueueStepResult> {
  queue = await pauseTaskQueue(memory, queue, reason);
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, "workflow.paused", queue.pausedReason);
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
  return { queue, workflowRun, items: reconciled.items, loopStatus: "stopped", summary: reason };
}

async function failQueueWithoutItem(memory: ResolvedMemory, project: ManagedProject, changeId: string, queue: TaskQueueRun, workflow: WorkflowRun | null, reason: string): Promise<MainAgentQueueStepResult> {
  const workflowRun = await syncQueue(memory, project, changeId, queue, workflow, "workflow.failed", reason);
  const reconciled = await reconcileWorkflowTaskQueue(project, { changeId, queueRunId: queue.id });
  return { queue, workflowRun, items: reconciled.items, loopStatus: "stopped", summary: reason };
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

function summarizeQueueObservation(observation: MainAgentQueueObservation): string {
  const next = observation.nextItem ? ` next item ${observation.nextItem.taskId}` : " no next item";
  return `Observed TaskQueue ${observation.queue.id} (${observation.queue.status}) with ${observation.queue.completedCount}/${observation.queue.totalCount} completed and${next}.`;
}

function summarizeQueueObservationForEvidence(observation: MainAgentQueueObservation): MainAgentQueueObservationSummary {
  return {
    queueRunId: observation.queue.id,
    workflowRunId: observation.workflow?.id ?? observation.queue.workflowRunId ?? null,
    taskQueueProposalId: observation.queue.taskQueueProposalId ?? observation.workflow?.taskQueueProposalId ?? null,
    workflowGraphPlanId: observation.queue.workflowGraphPlanId ?? observation.workflow?.workflowGraphPlanId ?? null,
    readinessManifestId: observation.queue.readinessManifestId ?? observation.workflow?.readinessManifestId ?? null,
    decompositionPlanId: observation.queue.decompositionPlanId ?? observation.workflow?.decompositionPlanId ?? null,
    queueStatus: observation.queue.status,
    workflowStatus: observation.workflow?.status ?? null,
    totalCount: observation.queue.totalCount,
    completedCount: observation.queue.completedCount,
    failedCount: observation.queue.status === "failed" ? 1 : 0,
    blockedCount: observation.queue.status === "blocked" ? 1 : 0,
    currentTaskId: observation.queue.currentTaskId ?? null,
    nextItemId: observation.nextItem?.id ?? null,
    nextTaskId: observation.nextItem?.taskId ?? null,
  };
}

function summarizeQueueDecision(decision: MainAgentQueueDecision): string {
  if (decision.kind === "run-next-item" && decision.selectedItem) {
    return `Main agent selected queue item ${decision.selectedItem.taskId}.`;
  }
  return `Main agent selected queue step ${decision.kind}: ${decision.reason}`;
}

function queueObservationRefs(observation: MainAgentQueueObservation) {
  return queueResultRefs(observation.queue, observation.workflow, observation.nextItem, observation.nextItem?.taskRunId ?? null);
}

function queueResultRefs(queue: TaskQueueRun, workflow: WorkflowRun | null, item: TaskQueueItem | null, taskRunId: string | null | undefined) {
  return {
    taskQueueRunIds: dedupeStrings([queue.id]),
    taskQueueItemIds: dedupeStrings([item?.id ?? ""]),
    taskRunIds: dedupeStrings([taskRunId ?? ""]),
    workflowRunIds: dedupeStrings([workflow?.id ?? queue.workflowRunId ?? ""]),
  };
}

function dedupeStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
