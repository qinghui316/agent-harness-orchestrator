import { startAuditRun } from "../audit/manager.js";
import { completeAgentTask, recordMaintenanceLedgerEntry } from "../agent-task/manager.js";
import { recordPostRunBoundaryAudit, boundaryAuditArtifactRef } from "../agent-task/boundary-audit.js";
import { dispatchForegroundRoleTask } from "../agent-task/role-dispatcher.js";
import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  recordMainAgentOrchestrationStep,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationRole,
  type MainAgentOrchestrationState,
} from "../agent-task/orchestration-engine.js";
import type { AgentTaskRequest } from "../agent-task/delegate-task.js";
import { startCodeRun, type CodeExecutionGateOptions } from "../code/manager.js";
import { truncateReadablePreview, type CodexJsonlStreamEvent } from "../codex/jsonl.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { listRuns } from "../run/manager.js";
import {
  failQueuedTaskItem,
  getNextQueuedTaskQueueItem,
  markTaskQueueItemRunning,
  markTaskQueueRunning,
  pauseTaskQueue,
  updateTaskQueueAfterItem,
  finishTaskQueueItem,
} from "../task-queue/manager.js";
import { finishTaskRunFromWorkflowResult, listTaskRuns, markTaskRunStarted, retryTaskRun, startTaskRun } from "../task-run/manager.js";
import type { AgentTask, ManagedProject, ResolvedMemory, StageResumeVerdict, TaskRun } from "../types/index.js";
import { startValidationRun } from "../validation/manager.js";
import { readWorkflowRun } from "../workflow-run/manager.js";
import {
  deriveWorkflowStageResumeVerdict,
  reconcileWorkflowTaskQueue,
  startOrResumeWorkflowTaskQueue,
  syncWorkflowRunFromTaskQueue,
} from "./taskqueue.js";
import type { WorkbenchAssistantEvent, WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../workbench/types.js";

const OFFICIAL_REWORK_BUDGET = 1;

export async function runTaskRunCodeValidateAuditSequence(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
  mode: "start" | "retry",
): Promise<unknown> {
  const started = mode === "start"
    ? await startTaskRun(project, { changeId, taskId: requireSingleTaskId(request.taskIds) })
    : await retryTaskRun(project, { changeId, taskRunId: requireTaskRunId(request.taskRunId) });
  return executeStartedTaskRunWorkflow(project, started, request.prompt, live);
}

async function executeStartedTaskRunWorkflow(
  project: ManagedProject,
  started: Awaited<ReturnType<typeof startTaskRun>>,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  emitAssistantEvent(live, {
    runId: started.taskRun.id,
    kind: "status",
    phase: "claimed",
    title: "TaskRun claimed",
    summary: `${started.taskRun.taskId} attempt ${started.taskRun.attempt} was claimed by ${started.lease.workerId}.`,
  });
  try {
    const memory = await resolveProjectMemory(project);
    await markTaskRunStarted(memory, started.taskRun.id);
    emitAssistantEvent(live, {
      runId: started.taskRun.id,
      kind: "status",
      phase: "running",
      title: "TaskRun running",
      summary: `${started.taskRun.taskId} attempt ${started.taskRun.attempt} started the Coder -> Validation -> Audit workflow.`,
    });
    const workflow = await runCodeValidateAuditSequence(project, started.taskRun.changeId, prompt, live, [started.taskRun.taskId], started.taskRun.id, "coder-agent", undefined, undefined, executionGate);
    const taskRun = await finishTaskRunFromWorkflowResult(memory, started.taskRun.id, workflow);
    if (shouldAutoReworkTaskRun(taskRun)) {
      emitAssistantEvent(live, {
        runId: taskRun.id,
        kind: "status",
        phase: "auto-rework",
        title: "正在根据验证/审查结果自动修改",
        summary: `${taskRun.taskId} official attempt ${taskRun.attempt} did not pass. AHO is handing the evidence back to coder-agent for one bounded rework cycle.`,
      });
      const retry = await retryTaskRun(project, { changeId: taskRun.changeId, taskRunId: taskRun.id });
      const reworkPrompt = [
        prompt,
        "",
        "AHO official validation/audit did not accept the previous attempt.",
        "Read the latest validation/audit/run evidence for this Change and fix the assigned worktree proposal.",
        "Do not ask the user unless the evidence shows requirement ambiguity, product tradeoff, environment failure, or no real code rework path.",
      ].filter((item): item is string => Boolean(item)).join("\n");
      const rework = await executeStartedTaskRunWorkflow(project, retry, reworkPrompt, live, executionGate);
      const finalTaskRun = isRecord(rework) && isTaskRunLike(rework.taskRun) ? rework.taskRun : taskRun;
      return { taskRun: finalTaskRun, lease: started.lease, workflow, autoRework: { previousTaskRun: taskRun, result: rework } };
    }
    return { taskRun, lease: started.lease, workflow };
  } catch (cause) {
    const memory = await resolveProjectMemory(project);
    await finishTaskRunFromWorkflowResult(memory, started.taskRun.id, { stoppedAt: "code", code: { run: { status: "failed" } } }).catch(() => undefined);
    throw cause;
  }
}

function shouldAutoReworkTaskRun(taskRun: Awaited<ReturnType<typeof finishTaskRunFromWorkflowResult>>): boolean {
  if (taskRun.status !== "blocked" && taskRun.status !== "failed") return false;
  const officialReworkAttempt = Math.max(0, taskRun.attempt - 1);
  return officialReworkAttempt < OFFICIAL_REWORK_BUDGET;
}

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
      const executionGate = taskQueueProposalId && workflowGraphPlanId ? { mode: "taskqueue-proposal" as const, taskQueueProposalId, workflowGraphPlanId } : undefined;
      const started = resume
        ? { taskRun: resume.taskRun, lease: null }
        : await startTaskRun(project, { changeId, taskId: nextItem.taskId });
      const runningItem = await markTaskQueueItemRunning(memory, nextItem, started.taskRun);
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
      const result = resume
        ? await executeResumedTaskRunStage(project, started.taskRun, resume.verdict, request.prompt, live, executionGate)
        : await executeStartedTaskRunWorkflow(project, started as Awaited<ReturnType<typeof startTaskRun>>, request.prompt, live, executionGate);
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

async function findTaskQueueStageResumeCandidate(memory: ResolvedMemory, changeId: string, taskId: string): Promise<{ taskRun: TaskRun; verdict: StageResumeVerdict } | null> {
  const taskRuns = await listTaskRuns(memory, changeId);
  const candidates = taskRuns.filter((run) => run.taskId.toUpperCase() === taskId.toUpperCase() && !["queued", "claimed", "running"].includes(run.status));
  for (const taskRun of candidates) {
    const verdict = await deriveWorkflowStageResumeVerdict(memory, changeId, taskRun);
    if (verdict.kind !== "start-coder") return { taskRun, verdict };
  }
  return null;
}

async function executeResumedTaskRunStage(
  project: ManagedProject,
  taskRun: TaskRun,
  verdict: StageResumeVerdict,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  const coderRun = verdict.runId ? (await listRuns(memory)).find((run) => run.id === verdict.runId) : undefined;
  if (!coderRun || coderRun.status !== "completed" || !coderRun.worktree?.worktreeId) {
    const blocked = await finishTaskRunFromWorkflowResult(memory, taskRun.id, { stoppedAt: "code", code: { run: coderRun ?? { status: "failed" } } });
    return { taskRun: blocked, workflow: { stoppedAt: "code", code: { run: coderRun } } };
  }

  if (verdict.kind === "completed") {
    const completed = await finishTaskRunFromWorkflowResult(memory, taskRun.id, { stoppedAt: null, code: { run: coderRun }, audit: { audit: { status: "approved" } } });
    return { taskRun: completed, workflow: { stoppedAt: null, code: { run: coderRun } } };
  }

  if (verdict.kind === "continue-rework") {
    return executeBoundedTaskRunRework(project, taskRun, prompt, live, executionGate);
  }

  let validation: Awaited<ReturnType<typeof startValidationRun>> | undefined;
  if (verdict.kind === "continue-validation") {
    emitAssistantEvent(live, {
      runId: taskRun.id,
      kind: "status",
      phase: "validation-resume",
      title: "Validation running",
      summary: "Coder evidence already exists; AHO is resuming from validation.",
      artifactRef: coderRun.artifacts.directory,
    });
    validation = await startValidationRun(project, { changeId: taskRun.changeId, worktree: coderRun.worktree.worktreeId });
    emitValidationAssistantEvents(live, coderRun.id, validation);
    if (validation.validation.status !== "passed") {
      const workflow = { code: { run: coderRun }, validation, stoppedAt: "validation" };
      const blocked = await finishTaskRunFromWorkflowResult(memory, taskRun.id, workflow);
      if (shouldAutoReworkTaskRun(blocked)) return executeBoundedTaskRunRework(project, blocked, prompt, live, executionGate);
      return { taskRun: blocked, workflow };
    }
  }

  emitAssistantEvent(live, {
    runId: taskRun.id,
    kind: "status",
    phase: "audit-resume",
    title: "Audit running",
    summary: "Validation evidence is available; AHO is resuming from audit.",
    artifactRef: validation?.run.artifacts.validation ?? verdict.evidenceRefs[0],
  });
  const audit = await startAuditRun(project, {
    changeId: taskRun.changeId,
    worktreeId: coderRun.worktree.worktreeId,
    prompt: "This audit resumed from WorkflowRun stage recovery after coder and validation evidence were already present.",
  });
  emitAuditAssistantEvent(live, coderRun.id, audit);
  const auditAccepted = audit.audit.status === "approved" || audit.audit.status === "approved-with-notes";
  const workflow = { code: { run: coderRun }, ...(validation ? { validation } : {}), audit, stoppedAt: auditAccepted ? null : "audit" };
  const finished = await finishTaskRunFromWorkflowResult(memory, taskRun.id, workflow);
  if (!auditAccepted && shouldAutoReworkTaskRun(finished)) return executeBoundedTaskRunRework(project, finished, prompt, live, executionGate);
  return { taskRun: finished, workflow };
}

async function executeBoundedTaskRunRework(
  project: ManagedProject,
  taskRun: TaskRun,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  const retry = await retryTaskRun(project, { changeId: taskRun.changeId, taskRunId: taskRun.id });
  const reworkPrompt = [
    prompt,
    "",
    "AHO resumed a WorkflowRun and found validation/audit evidence that requires bounded rework.",
    "Read the latest validation/audit/run evidence for this Change and fix the assigned worktree proposal.",
    "Do not ask the user unless the evidence shows requirement ambiguity, product tradeoff, environment failure, or no real code rework path.",
  ].filter((item): item is string => Boolean(item)).join("\n");
  const rework = await executeStartedTaskRunWorkflow(project, retry, reworkPrompt, live, executionGate);
  const finalTaskRun = isRecord(rework) && isTaskRunLike(rework.taskRun) ? rework.taskRun : taskRun;
  return { taskRun: finalTaskRun, workflow: rework, autoRework: { previousTaskRun: taskRun, result: rework } };
}

function isTaskRunLike(value: unknown): value is Awaited<ReturnType<typeof startTaskRun>>["taskRun"] {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.changeId === "string"
    && typeof value.taskId === "string"
    && typeof value.status === "string";
}

export function requireSingleTaskId(taskIds: string[] | undefined): string {
  const unique = Array.from(new Set((taskIds ?? []).map((taskId) => taskId.trim()).filter(Boolean)));
  if (unique.length !== 1) throw new Error("task.run.start requires exactly one taskId.");
  return unique[0];
}

export function requireTaskRunId(taskRunId: string | undefined): string {
  if (typeof taskRunId === "string" && taskRunId.trim()) return taskRunId.trim();
  throw new Error("task.run.retry requires taskRunId.");
}

export function assertKnownTaskIds(status: { acMap?: { tasks: Array<{ id: string }> } | null; change?: { id: string } | null }, taskIds: string[], actionType: string): void {
  const known = new Set(status.acMap?.tasks.map((task) => task.id) ?? []);
  const unique = Array.from(new Set(taskIds.map((taskId) => taskId.trim()).filter(Boolean)));
  if (unique.length === 0) throw new Error(`${actionType} requires taskIds.`);
  const missing = unique.filter((taskId) => !known.has(taskId));
  if (missing.length > 0) throw new Error(`${actionType} target taskIds are stale or not scoped to Change ${status.change?.id ?? "unknown"}: ${missing.join(", ")}.`);
}

async function createDelegatedForegroundTask(
  memory: ResolvedMemory,
  request: AgentTaskRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ task: AgentTask; policyAuditRef: string }> {
  const result = await dispatchForegroundRoleTask(memory, { ...request, delegationMode: request.delegationMode ?? "orchestrator-policy" });
  emitAssistantEvent(live, {
    runId: request.changeId,
    kind: "status",
    phase: "delegateTask.accepted",
    title: `调用 ${request.roleId}`,
    summary: "主 agent 已通过 ToolPolicyGate 和 RoleDispatcher 边界创建角色任务。",
    artifactRef: result.policyAuditRef,
  });
  emitAssistantEvent(live, {
    runId: request.changeId,
    kind: "status",
    phase: "delegateTask.running",
    title: `${request.roleId} 开始处理`,
    summary: "角色任务已进入 queued/claimed/running 生命周期。",
    artifactRef: result.policyAuditRef,
  });
  return result;
}

function emitDelegatedRoleReturn(live: WorkbenchLiveSink | undefined, changeId: string, roleId: string, status: string, summary: string, artifactRef?: string): void {
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "tool-result",
    phase: `delegateTask.${status}`,
    title: `${roleId} 返回结果`,
    summary,
    artifactRef,
    isError: status !== "completed",
  });
}

export async function runCodeValidateAuditSequence(
  project: ManagedProject,
  changeId: string,
  prompt?: string,
  live?: WorkbenchLiveSink,
  taskIds?: string[],
  taskRunId?: string,
  coderRoleId = "coder-agent",
  orchestrationState?: MainAgentOrchestrationState,
  coderDecision?: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  const memory = await resolveProjectMemory(project);
  let orchestration = orchestrationState ?? createMainAgentOrchestrationState({ changeId });
  const coderRole = orchestrationCoderRole(coderRoleId);
  const coderInputArtifacts = coderDecision?.inputArtifacts.length ? coderDecision.inputArtifacts : taskRunId ? [taskRunId] : [];
  const coderDispatch = await createDelegatedForegroundTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: coderRoleId,
    kind: "foreground",
    goal: coderDecision?.goal ?? (coderRoleId === "rework-coder" ? "Repair implementation from validation or audit evidence." : "Implement the confirmed demand in an AHO-owned worktree."),
    inputArtifacts: coderInputArtifacts,
    delegationMode: "orchestrator-policy",
  }, live);
  const coderTask = coderDispatch.task;
  live?.emit({ event: "run.status", data: { status: "running", label: "Coder" } });
  let coderStartedEmitted = false;
  const code = await startCodeRun(project, {
    changeId,
    roleId: coderRoleId,
    prompt,
    taskIds,
    taskRunId,
    executionGate,
    live: {
      onRunStarted: (run) => {
        coderStartedEmitted = true;
        live?.emit({ event: "run.started", data: { runId: run.id, changeId: run.changeId, runtime: run.runtime, actionType: "code.run", taskIds: run.taskIds } });
      },
      onStatus: (event) => live?.emit({ event: "run.status", data: event }),
      onCodexEvent: (event) => forwardCodexStreamEvent(event.runId, event, live),
      onCallbackError: (event) => live?.emit({ event: "error", data: { runId: event.runId, message: event.error instanceof Error ? event.error.message : String(event.error) } }),
    },
  });
  if (!coderStartedEmitted) live?.emit({ event: "run.started", data: { runId: code.run.id, changeId: code.run.changeId, runtime: code.run.runtime, actionType: "code.run", taskIds: code.run.taskIds } });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: code.run.status, label: "Coder" } });
  const coderBoundaryAudit = await recordPostRunBoundaryAudit(memory, {
    changeId,
    roleId: coderRoleId,
    runId: code.run.id,
    taskId: coderTask.id,
    sourceChanged: code.warnings.some((warning) => warning.toLowerCase().includes("source project git status changed")),
    artifactRefs: compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation),
  });
  const coderBoundaryRef = boundaryAuditArtifactRef(memory, coderBoundaryAudit);
  emitAssistantEvent(live, {
    runId: code.run.id,
    kind: "tool-result",
    phase: "boundary-audit",
    title: coderBoundaryAudit.status === "passed" ? "边界审计通过" : "边界审计发现越界",
    summary: coderBoundaryAudit.status === "passed" ? "coder-agent 的输出未越过本次需求的运行边界。" : coderBoundaryAudit.violations.map((violation) => violation.reason).join("\n"),
    artifactRef: coderBoundaryRef,
    isError: coderBoundaryAudit.status === "failed",
  });
  if (coderBoundaryAudit.status === "failed") {
    const coderOutputArtifacts = compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation, coderBoundaryRef);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: coderRole,
      status: "failed",
      inputArtifacts: coderInputArtifacts,
      outputArtifacts: coderOutputArtifacts,
      failureClassification: "boundary-violation",
      stoppedAt: "boundary",
      summary: "Coder run failed boundary audit.",
    });
    await completeAgentTask(memory, coderTask, {
      status: "failed",
      summary: "Coder run failed boundary audit.",
      artifactRefs: [code.run.artifacts.directory],
      policyAuditRefs: [coderDispatch.policyAuditRef],
      boundaryAuditRefs: [coderBoundaryRef],
      boundaryViolations: coderBoundaryAudit.violations,
      failureClassification: "boundary-violation",
      requiresUserInputReason: "Coder modified outside its allowed boundary.",
    });
    emitDelegatedRoleReturn(live, changeId, coderRoleId, "failed", "coder-agent 越过了允许边界，结果不会进入应用流程。", coderBoundaryRef);
    return { code, stoppedAt: "boundary", boundaryAudit: coderBoundaryAudit, orchestration };
  }
  if (code.run.status !== "completed" || !code.run.worktree?.worktreeId) {
    const coderOutputArtifacts = compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: coderRole,
      status: "failed",
      inputArtifacts: coderInputArtifacts,
      outputArtifacts: coderOutputArtifacts,
      failureClassification: "code-failure",
      stoppedAt: "code",
      summary: "Coder did not produce a completed worktree proposal.",
    });
    await completeAgentTask(memory, coderTask, {
      status: "failed",
      summary: "Coder did not produce a completed worktree proposal.",
      artifactRefs: [code.run.artifacts.directory],
      policyAuditRefs: [coderDispatch.policyAuditRef],
      boundaryAuditRefs: [coderBoundaryRef],
      failureClassification: "code-failure",
      requiresUserInputReason: "Implementation failed before official validation could run.",
    });
    emitDelegatedRoleReturn(live, changeId, coderRoleId, "failed", "coder-agent 没有产出可验证的 worktree 结果。", code.run.artifacts.directory);
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Coder task failed before validation.",
      artifactRefs: [code.run.artifacts.directory],
    });
    return { code, stoppedAt: "code", orchestration };
  }
  const coderOutputArtifacts = compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation);
  orchestration = recordMainAgentOrchestrationStep(orchestration, {
    roleId: coderRole,
    status: "completed",
    inputArtifacts: coderInputArtifacts,
    outputArtifacts: coderOutputArtifacts,
    summary: "Coder produced a completed worktree proposal.",
  });
  await completeAgentTask(memory, coderTask, {
    status: "completed",
    summary: "Coder produced a completed worktree proposal.",
    artifactRefs: compactArtifactRefs(code.run.artifacts.directory, code.run.artifacts.implementation),
    policyAuditRefs: [coderDispatch.policyAuditRef],
    boundaryAuditRefs: [coderBoundaryRef],
    nextRecommendation: "Run independent validation.",
  });
  emitDelegatedRoleReturn(live, changeId, coderRoleId, "completed", "coder-agent 已返回实现和自测结果。", code.run.artifacts.directory);
  const validationDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(validationDecision, "validator");
  const validatorDispatch = await createDelegatedForegroundTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "validator",
    kind: "foreground",
    goal: validationDecision.goal,
    inputArtifacts: validationDecision.inputArtifacts,
    delegationMode: "orchestrator-policy",
  }, live);
  const validatorTask = validatorDispatch.task;
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: "running", label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: "running" } });
  emitAssistantEvent(live, { runId: code.run.id, kind: "status", phase: "running", title: "Validation running", summary: "AHO started validation for the coder worktree." });
  const validation = await startValidationRun(project, { changeId, worktree: code.run.worktree.worktreeId });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: validation.validation.status, label: "Validation" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Validation", status: validation.validation.status } });
  emitValidationAssistantEvents(live, code.run.id, validation);
  const validationBoundaryAudit = await recordPostRunBoundaryAudit(memory, {
    changeId,
    roleId: "validator",
    runId: validation.run.id,
    taskId: validatorTask.id,
    artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr),
  });
  const validationBoundaryRef = boundaryAuditArtifactRef(memory, validationBoundaryAudit);
  if (validation.validation.status !== "passed") {
    const validationOutputArtifacts = compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr, validationBoundaryRef);
    orchestration = recordMainAgentOrchestrationStep(orchestration, {
      roleId: "validator",
      status: "failed",
      inputArtifacts: validationDecision.inputArtifacts,
      outputArtifacts: validationOutputArtifacts,
      failureClassification: "validation-failure",
      stoppedAt: "validation",
      summary: "Independent validation failed.",
    });
    await completeAgentTask(memory, validatorTask, {
      status: "failed",
      summary: "Independent validation failed.",
      artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validation.run.artifacts.stderr),
      policyAuditRefs: [validatorDispatch.policyAuditRef],
      boundaryAuditRefs: [validationBoundaryRef],
      failureClassification: "validation-failure",
      requiresUserInputReason: "Validation failed; bounded automatic rework may be attempted.",
    });
    emitDelegatedRoleReturn(live, changeId, "validator", "failed", "validator 返回验证失败结果。", validation.run.artifacts.validation);
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Validation failed for a foreground main-agent role orchestration attempt.",
      artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stderr),
    });
    return { code, validation, stoppedAt: "validation", orchestration };
  }
  const validationOutputArtifacts = compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout, validationBoundaryRef);
  orchestration = recordMainAgentOrchestrationStep(orchestration, {
    roleId: "validator",
    status: "completed",
    inputArtifacts: validationDecision.inputArtifacts,
    outputArtifacts: validationOutputArtifacts,
    summary: "Independent validation passed.",
  });
  await completeAgentTask(memory, validatorTask, {
    status: "completed",
    summary: "Independent validation passed.",
    artifactRefs: compactArtifactRefs(validation.run.artifacts.validation, validation.run.artifacts.stdout),
    policyAuditRefs: [validatorDispatch.policyAuditRef],
    boundaryAuditRefs: [validationBoundaryRef],
    nextRecommendation: "Run semantic audit.",
  });
  emitDelegatedRoleReturn(live, changeId, "validator", "completed", "validator 返回验证通过结果。", validation.run.artifacts.validation);
  const auditDecision = decideNextMainAgentOrchestration(orchestration);
  assertDelegateDecision(auditDecision, "auditor-agent");
  const auditorDispatch = await createDelegatedForegroundTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "auditor-agent",
    kind: "foreground",
    goal: auditDecision.goal,
    inputArtifacts: auditDecision.inputArtifacts,
    delegationMode: "orchestrator-policy",
  }, live);
  const auditorTask = auditorDispatch.task;
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: "running", label: "Audit" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Audit", status: "running" } });
  emitAssistantEvent(live, { runId: code.run.id, kind: "status", phase: "running", title: "Audit running", summary: "AHO started audit after validation passed." });
  const audit = await startAuditRun(project, {
    changeId,
    worktreeId: code.run.worktree.worktreeId,
    prompt: "This audit was automatically started after the user confirmed the Coder run and validation passed for the same worktree.",
  });
  live?.emit({ event: "run.status", data: { runId: code.run.id, status: audit.audit.status, label: "Audit" } });
  live?.emit({ event: "tool.event", data: { runId: code.run.id, phase: "status", name: "Audit", status: audit.audit.status } });
  emitAuditAssistantEvent(live, code.run.id, audit);
  const auditBoundaryAudit = await recordPostRunBoundaryAudit(memory, {
    changeId,
    roleId: "auditor-agent",
    runId: audit.run.id,
    taskId: auditorTask.id,
    artifactRefs: compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage),
  });
  const auditBoundaryRef = boundaryAuditArtifactRef(memory, auditBoundaryAudit);
  const auditAccepted = audit.audit.status === "approved" || audit.audit.status === "approved-with-notes";
  const auditOutputArtifacts = compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage, auditBoundaryRef);
  orchestration = recordMainAgentOrchestrationStep(orchestration, {
    roleId: "auditor-agent",
    status: auditAccepted ? "completed" : "failed",
    inputArtifacts: auditDecision.inputArtifacts,
    outputArtifacts: auditOutputArtifacts,
    ...(auditAccepted ? {} : { failureClassification: "audit-failure" as const, stoppedAt: "audit" as const }),
    summary: auditAccepted ? "Independent audit accepted the validated worktree evidence." : "Independent audit did not accept the worktree evidence.",
  });
  await completeAgentTask(memory, auditorTask, {
    status: auditAccepted ? "completed" : "failed",
    summary: auditAccepted
      ? "Independent audit accepted the validated worktree evidence."
      : "Independent audit did not accept the worktree evidence.",
    artifactRefs: compactArtifactRefs(audit.audit.artifacts.audit, audit.audit.artifacts.auditMarkdown, audit.audit.artifacts.lastMessage),
    policyAuditRefs: [auditorDispatch.policyAuditRef],
    boundaryAuditRefs: [auditBoundaryRef],
    nextRecommendation: auditAccepted ? "Show result review and apply handoff." : "Attempt bounded automatic rework if budget remains.",
    ...(auditAccepted ? {} : { failureClassification: "audit-failure", requiresUserInputReason: "Audit did not accept the current evidence." }),
  });
  emitDelegatedRoleReturn(
    live,
    changeId,
    "auditor-agent",
    auditAccepted ? "completed" : "failed",
    auditAccepted
      ? "auditor-agent 返回审查通过结果。"
      : "auditor-agent 返回需要修改或补证据的结果。",
    audit.audit.artifacts.auditMarkdown,
  );
  if (!auditAccepted) {
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId,
      summary: "Audit did not accept foreground main-agent role orchestration evidence.",
      artifactRefs: compactArtifactRefs(audit.audit.artifacts.auditMarkdown),
    });
  }
  return { code, validation, audit, stoppedAt: auditAccepted ? null : "audit", orchestration };
}

function orchestrationCoderRole(roleId: string): MainAgentOrchestrationRole {
  return roleId === "rework-coder" ? "rework-coder" : "coder-agent";
}

export function sourceRefreshReworkPrompt(worktreeId: string, extraPrompt?: string): string {
  return [
    "The previous result is no longer safe to apply because the project source changed after the worktree was created.",
    "Re-read the accepted demand artifacts, current source tree, prior result summary, validation/audit evidence, and user feedback.",
    `Do not patch the old result in place. Create a fresh same-demand implementation attempt from the current source state. Prior worktree: ${worktreeId}.`,
    "After implementation, preserve evidence for independent validation and audit.",
    extraPrompt?.trim() ? `Additional user feedback:\n${extraPrompt.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}

function assertDelegateDecision(decision: MainAgentOrchestrationDecision, roleId: MainAgentOrchestrationRole): asserts decision is Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }> {
  if (decision.kind !== "delegate-role" || decision.roleId !== roleId) throw new Error(`Expected ${roleId} delegation but got ${decision.kind}.`);
}

function compactArtifactRefs(...refs: Array<string | undefined | null>): string[] {
  return refs.filter((ref): ref is string => Boolean(ref));
}

function forwardCodexStreamEvent(runId: string, event: CodexJsonlStreamEvent, live: WorkbenchLiveSink | undefined): void {
  if (!live) return;
  if (event.type === "readable_event") {
    emitAssistantEvent(live, { ...event.event, runId });
    return;
  }
  if (event.type === "text_delta") {
    live.emit({ event: "assistant.delta", data: { delta: event.delta, runId } });
    return;
  }
  if (event.type === "status") {
    live.emit({ event: "run.status", data: { runId, status: event.label } });
    return;
  }
  if (event.type === "usage") {
    live.emit({ event: "usage", data: { runId, usage: event.usage } });
    emitAssistantEvent(live, {
      runId,
      kind: "usage",
      phase: "completed",
      title: "Usage recorded",
      summary: formatUsageSummary(event.usage),
    });
    return;
  }
  if (event.type === "error") {
    live.emit({ event: "error", data: { runId, message: event.message } });
    emitAssistantEvent(live, { runId, kind: "error", phase: "failed", title: "Codex error", summary: event.message, isError: true });
    return;
  }
  if (event.type === "tool_event") {
    const preview = truncateReadablePreview(event.output);
    live.emit({
      event: "tool.event",
      data: {
        runId,
        itemId: event.id,
        phase: event.phase,
        name: event.name,
        command: event.command,
        outputTail: preview.preview,
        isError: event.isError,
      },
    });
  }
}

function formatUsageSummary(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
  if (input === undefined && output === undefined) return "Token usage recorded.";
  return `Input ${input ?? "?"}, output ${output ?? "?"} tokens.`;
}

function emitAssistantEvent(live: WorkbenchLiveSink | undefined, event: WorkbenchAssistantEvent): void {
  live?.emit({ event: "assistant.event", data: event });
}

function emitValidationAssistantEvents(live: WorkbenchLiveSink | undefined, runId: string, result: unknown): void {
  if (!isRecord(result) || !isRecord(result.validation)) return;
  const status = typeof result.validation.status === "string" ? result.validation.status : "unknown";
  const summary = typeof result.validation.summary === "string" ? result.validation.summary : `Validation ${status}.`;
  const artifacts = isRecord(result.validation.artifacts) ? result.validation.artifacts : {};
  const artifactRef = typeof artifacts.validation === "string" ? artifacts.validation : undefined;
  emitAssistantEvent(live, {
    runId,
    kind: status === "passed" ? "tool-result" : "error",
    phase: "validation",
    title: status === "passed" ? "Validation passed" : "Validation did not pass",
    summary,
    artifactRef,
    isError: status !== "passed",
  });
}

function emitAuditAssistantEvent(live: WorkbenchLiveSink | undefined, runId: string, result: unknown): void {
  if (!isRecord(result) || !isRecord(result.audit)) return;
  const audit = result.audit;
  const status = typeof audit.status === "string" ? audit.status : "unknown";
  const summary = typeof audit.summary === "string" ? audit.summary : `Audit ${status}.`;
  const artifacts = isRecord(audit.artifacts) ? audit.artifacts : {};
  const artifactRef = typeof artifacts.auditMarkdown === "string" ? artifacts.auditMarkdown : typeof artifacts.audit === "string" ? artifacts.audit : undefined;
  const accepted = status === "approved" || status === "approved-with-notes";
  emitAssistantEvent(live, {
    runId,
    kind: accepted ? "tool-result" : "error",
    phase: "audit",
    title: accepted ? "Audit approved" : "Audit did not approve",
    summary,
    artifactRef,
    isError: !accepted,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
