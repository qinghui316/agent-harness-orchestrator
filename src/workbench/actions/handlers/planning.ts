import { assertWritableMemory } from "../../../memory/resolver.js";
import {
  renderSchedulerIntegrationCheckHandoffMarkdown,
  renderSchedulerIntegrationCandidateMarkdown,
  renderSchedulerIntegrationOutcomeMarkdown,
  renderSchedulerRunBlockedCloseoutMarkdown,
  renderSchedulerRunCompletionMarkdown,
  renderSchedulerRuntimeWorkerResultMarkdown,
  renderSchedulerRuntimeWorkerStartMarkdown,
  renderSchedulerRuntimeWorkerAuditMarkdown,
  renderSchedulerRuntimeWorkerReworkPlanMarkdown,
  renderSchedulerRuntimeWorkerReworkResultMarkdown,
  renderSchedulerRuntimeWorkerReworkStartMarkdown,
  renderSchedulerRuntimeWorkerReworkAuditMarkdown,
  renderSchedulerRuntimeWorkerReworkValidationMarkdown,
  renderSchedulerRuntimeWorkerValidationMarkdown,
  type SchedulerRuntimeWorkerStart,
} from "../../../scheduler-runtime/manager.js";
import type { ManagedProject } from "../../../types/index.js";
import { runTaskQueueSequentialWorkflow } from "../../../workflow-runtime/taskqueue.js";
import {
  runSchedulerIntegrationCandidateCompile,
  runSchedulerIntegrationCheck,
  runSchedulerIntegrationOutcomeReconcile,
  runSchedulerRunCloseBlocked,
  runSchedulerRunComplete,
  runSchedulerWorkerAudit,
  runSchedulerWorkerReworkAudit,
  runSchedulerWorkerReworkPlanCompile,
  runSchedulerWorkerReworkResultReconcile,
  runSchedulerWorkerReworkStart,
  runSchedulerWorkerReworkValidation,
  runSchedulerWorkerResultReconcile,
  runSchedulerWorkerStartFirst,
  runSchedulerWorkerStartNext,
  runSchedulerWorkerValidation,
  type SchedulerFirstWorkerReworkStartResult,
  type SchedulerIntegrationCandidateResult,
  type SchedulerIntegrationCheckHandoffResult,
  type SchedulerIntegrationOutcomeResult,
  type SchedulerRunBlockedCloseoutResult,
  type SchedulerRunCompletionResult,
  type SchedulerWorkerAuditResult,
  type SchedulerWorkerResultReconcileResult,
  type SchedulerWorkerReworkAuditResult,
  type SchedulerWorkerReworkPlanResult,
  type SchedulerWorkerReworkResultReconcileResult,
  type SchedulerWorkerReworkValidationResult,
  type SchedulerWorkerValidationResult,
} from "../../../workflow-runtime/scheduler.js";
import {
  readLatestWorkflowGraphPlan,
  readWorkflowGraphPlan,
} from "../../../workflow-artifacts/manager.js";
import { recordWorkbenchDecision } from "../../decisions.js";
import { emitAssistantEvent } from "../../live-events.js";
import { appendConversationTimelineEntry } from "../../conversation-thread.js";
import { resolveTopic } from "../../topic-resolver.js";
import { readExecutionAuthorization } from "../../../workflow-runtime/execution-authorization.js";
import type {
  WorkbenchLiveSink,
  WorkbenchWorkflowActionRequest,
} from "../../types.js";

export async function startPlanningSchedulerFirstWorker(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ workerStart: SchedulerRuntimeWorkerStart; taskRun: unknown; lease: unknown; code: unknown; executionStarted: true }> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler first worker start");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.start-first requires schedulerRunId.");
  if (!request.schedulerClaimReservationId) throw new Error("planning.scheduler.worker.start-first requires schedulerClaimReservationId.");
  if (!request.reservationIntentId) throw new Error("planning.scheduler.worker.start-first requires reservationIntentId.");
  if (!request.claimIntentId) throw new Error("planning.scheduler.worker.start-first requires claimIntentId.");
  const result = await runSchedulerWorkerStartFirst(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerClaimReservationId: request.schedulerClaimReservationId,
    reservationIntentId: request.reservationIntentId,
    claimIntentId: request.claimIntentId,
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-first-worker-started",
    text: renderSchedulerRuntimeWorkerStartMarkdown(result.workerStart),
    artifact: result.workerStart.artifact,
    runId: result.code.run.id,
  }, live);
  emitAssistantEvent(live, {
    runId: result.code.run.id,
    kind: "file-change",
    phase: "scheduler-first-worker-started",
    title: "第一个 scheduler coder worker 已启动",
    summary: `Started coder stage for ${result.workerStart.reservationIntentId}; no validation, audit, rework, wave dispatch, scheduler loop, TaskQueueRun, WorkflowRun, AgentTask, or child Change was created.`,
    artifactRef: result.workerStart.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-started:${result.workerStart.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.start-first",
    status: "completed",
    label: "第一个 worker 已启动",
    summary: "Started exactly one scheduler coder-stage worker from the latest claim reservation.",
    targetId: result.workerStart.id,
    runId: result.code.run.id,
    artifact: result.workerStart.artifact,
    actionId: "planning.scheduler.worker.start-first",
    payload: {
      schedulerRunId: result.workerStart.schedulerRunId,
      schedulerClaimReservationId: result.workerStart.schedulerClaimReservationId,
      reservationIntentId: result.workerStart.reservationIntentId,
      claimIntentId: result.workerStart.claimIntentId,
      nodeId: result.workerStart.nodeId,
      unitId: result.workerStart.unitId,
      taskRunId: result.workerStart.taskRunId,
      workerLeaseId: result.workerStart.workerLeaseId,
      worktreeId: result.workerStart.worktreeId,
      runId: result.workerStart.runId,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function startPlanningSchedulerNextWorker(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<{ workerStart: SchedulerRuntimeWorkerStart; taskRun: unknown; lease: unknown; code: unknown; executionStarted: true }> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler next worker start");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.start-next requires schedulerRunId.");
  if (!request.schedulerClaimReservationId) throw new Error("planning.scheduler.worker.start-next requires schedulerClaimReservationId.");
  if (!request.reservationIntentId) throw new Error("planning.scheduler.worker.start-next requires reservationIntentId.");
  if (!request.claimIntentId) throw new Error("planning.scheduler.worker.start-next requires claimIntentId.");
  const result = await runSchedulerWorkerStartNext(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerClaimReservationId: request.schedulerClaimReservationId,
    reservationIntentId: request.reservationIntentId,
    claimIntentId: request.claimIntentId,
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-next-worker-started",
    text: renderSchedulerRuntimeWorkerStartMarkdown(result.workerStart),
    artifact: result.workerStart.artifact,
    runId: result.code.run.id,
  }, live);
  emitAssistantEvent(live, {
    runId: result.code.run.id,
    kind: "file-change",
    phase: "scheduler-next-worker-started",
    title: "下一个 scheduler coder worker 已启动",
    summary: `Started one additional coder stage for ${result.workerStart.reservationIntentId}; no validation, audit, rework, wave dispatch, scheduler loop, IntegrationCheck, apply, or child Change was created.`,
    artifactRef: result.workerStart.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-next-worker-started:${result.workerStart.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.start-next",
    status: "completed",
    label: "下一个 worker 已启动",
    summary: "Started exactly one additional scheduler coder-stage worker from the latest claim reservation.",
    targetId: result.workerStart.id,
    runId: result.code.run.id,
    artifact: result.workerStart.artifact,
    actionId: "planning.scheduler.worker.start-next",
    payload: {
      schedulerRunId: result.workerStart.schedulerRunId,
      schedulerClaimReservationId: result.workerStart.schedulerClaimReservationId,
      reservationIntentId: result.workerStart.reservationIntentId,
      claimIntentId: result.workerStart.claimIntentId,
      nodeId: result.workerStart.nodeId,
      unitId: result.workerStart.unitId,
      taskRunId: result.workerStart.taskRunId,
      workerLeaseId: result.workerStart.workerLeaseId,
      worktreeId: result.workerStart.worktreeId,
      runId: result.workerStart.runId,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function reconcilePlanningSchedulerFirstWorkerResult(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerResultReconcileResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler current worker result reconcile");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.reconcile-result requires schedulerRunId.");
  if (!request.schedulerWorkerStartId) throw new Error("planning.scheduler.worker.reconcile-result requires schedulerWorkerStartId.");
  const result = await runSchedulerWorkerResultReconcile(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerStartId: request.schedulerWorkerStartId,
  });
  if (result.status === "running") {
    await appendConversationTimelineEntry(project, changeId, {
      type: "assistant.message",
      status: "scheduler-first-worker-running",
      text: `第一个 scheduler coder worker 仍在运行：TaskRun ${result.taskRun.id}，WorkerLease ${result.lease.id}${result.codeRun?.id ? `，code run ${result.codeRun.id}` : ""}。未写入 terminal result，也未释放 lease。`,
      artifact: result.workerStart.artifact,
      runId: result.codeRun?.id,
    }, live);
    emitAssistantEvent(live, {
      runId: result.codeRun?.id ?? result.workerStart.id,
      kind: "status",
      phase: "scheduler-first-worker-running",
      title: "当前 scheduler worker 仍在运行",
      summary: "Result reconcile observed a non-terminal code run; no terminal SchedulerRuntimeWorkerResult was written and the WorkerLease remains active.",
      artifactRef: result.workerStart.artifact,
    });
    await recordWorkbenchDecision(project, {
      id: `scheduler-first-worker-running:${result.workerStart.id}`,
      changeId,
      decisionType: "planning.scheduler.worker.reconcile-result",
      status: "completed",
      label: "当前 worker 仍在运行",
      summary: "Scheduler current worker result reconcile observed running evidence and did not release the lease.",
      targetId: result.workerStart.id,
      runId: result.codeRun?.id ?? null,
      artifact: result.workerStart.artifact,
      actionId: "planning.scheduler.worker.reconcile-result",
      payload: {
        schedulerRunId: result.workerStart.schedulerRunId,
        schedulerClaimReservationId: result.workerStart.schedulerClaimReservationId,
        schedulerWorkerStartId: result.workerStart.id,
        reservationIntentId: result.workerStart.reservationIntentId,
        claimIntentId: result.workerStart.claimIntentId,
        taskRunId: result.taskRun.id,
        workerLeaseId: result.lease.id,
        worktreeId: result.workerStart.worktreeId,
        runId: result.codeRun?.id,
        resultStatus: "running",
      },
      completedAt: new Date().toISOString(),
    });
    return result;
  }
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "evidence-ready" ? "scheduler-first-worker-result-ready" : "scheduler-first-worker-result-failed",
    text: renderSchedulerRuntimeWorkerResultMarkdown(result.result),
    artifact: result.result.artifact,
    runId: result.codeRun?.id ?? undefined,
  }, live);
  emitAssistantEvent(live, {
    runId: result.codeRun?.id ?? result.result.id,
    kind: "file-change",
    phase: result.result.status === "evidence-ready" ? "scheduler-first-worker-result-ready" : "scheduler-first-worker-result-failed",
    title: result.result.status === "evidence-ready" ? "当前 scheduler worker 结果已就绪" : "当前 scheduler worker 结果失败",
    summary: "Scheduler-owned worker result evidence was reconciled from TaskRun, WorkerLease, worktree, and code run evidence. No validation, audit, rework, next worker, or scheduler loop was started.",
    artifactRef: result.result.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-result:${result.result.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.reconcile-result",
    status: "completed",
    label: result.result.status === "evidence-ready" ? "当前 worker 结果已就绪" : "当前 worker 结果失败",
    summary: "Reconciled exactly one scheduler coder worker result without starting validation, audit, rework, or the next worker.",
    targetId: result.result.id,
    runId: result.codeRun?.id ?? null,
    artifact: result.result.artifact,
    actionId: "planning.scheduler.worker.reconcile-result",
    payload: {
      schedulerRunId: result.result.schedulerRunId,
      schedulerClaimReservationId: result.result.schedulerClaimReservationId,
      schedulerWorkerStartId: result.result.schedulerWorkerStartId,
      schedulerWorkerResultId: result.result.id,
      reservationIntentId: result.result.reservationIntentId,
      claimIntentId: result.result.claimIntentId,
      nodeId: result.result.nodeId,
      unitId: result.result.unitId,
      taskRunId: result.result.taskRunId,
      workerLeaseId: result.result.workerLeaseId,
      worktreeId: result.result.worktreeId,
      runId: result.result.runId,
      resultStatus: result.result.status,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function validatePlanningSchedulerFirstWorker(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerValidationResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler current worker validation");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.validate-first requires schedulerRunId.");
  if (!request.schedulerWorkerResultId) throw new Error("planning.scheduler.worker.validate-first requires schedulerWorkerResultId.");
  const result = await runSchedulerWorkerValidation(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerResultId: request.schedulerWorkerResultId,
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: result.schedulerValidation.status === "passed" ? "scheduler-first-worker-validation-passed" : "scheduler-first-worker-validation-failed",
    text: renderSchedulerRuntimeWorkerValidationMarkdown(result.schedulerValidation),
    artifact: result.schedulerValidation.artifact,
    runId: result.validationRun.id,
  }, live);
  emitAssistantEvent(live, {
    runId: result.validationRun.id,
    kind: "file-change",
    phase: result.schedulerValidation.status === "passed" ? "scheduler-first-worker-validation-passed" : "scheduler-first-worker-validation-failed",
    title: result.schedulerValidation.status === "passed" ? "当前 scheduler worker 验证通过" : "当前 scheduler worker 验证失败",
    summary: result.schedulerValidation.status === "passed"
      ? "Validation passed for the first scheduler worker worktree. TaskRun remains evidence-ready for a later audit gate."
      : "Validation failed for the first scheduler worker worktree. TaskRun was blocked; audit, rework, and next worker were not started.",
    artifactRef: result.schedulerValidation.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-validation:${result.schedulerValidation.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.validate-first",
    status: "completed",
    label: result.schedulerValidation.status === "passed" ? "当前 worker 验证通过" : "当前 worker 验证失败",
    summary: "Validated exactly one scheduler coder worker worktree without starting audit, rework, or the next worker.",
    targetId: result.schedulerValidation.id,
    runId: result.validationRun.id,
    artifact: result.schedulerValidation.artifact,
    actionId: "planning.scheduler.worker.validate-first",
    payload: {
      schedulerRunId: result.schedulerValidation.schedulerRunId,
      schedulerClaimReservationId: result.schedulerValidation.schedulerClaimReservationId,
      schedulerWorkerStartId: result.schedulerValidation.schedulerWorkerStartId,
      schedulerWorkerResultId: result.schedulerValidation.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.schedulerValidation.id,
      reservationIntentId: result.schedulerValidation.reservationIntentId,
      claimIntentId: result.schedulerValidation.claimIntentId,
      nodeId: result.schedulerValidation.nodeId,
      unitId: result.schedulerValidation.unitId,
      taskRunId: result.schedulerValidation.taskRunId,
      workerLeaseId: result.schedulerValidation.workerLeaseId,
      worktreeId: result.schedulerValidation.worktreeId,
      runId: result.schedulerValidation.codeRunId,
      validationRunId: result.schedulerValidation.validationRunId,
      validationStatus: result.schedulerValidation.status,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function auditPlanningSchedulerFirstWorker(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerAuditResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler current worker audit");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.audit-first requires schedulerRunId.");
  if (!request.schedulerWorkerValidationId) throw new Error("planning.scheduler.worker.audit-first requires schedulerWorkerValidationId.");
  const result = await runSchedulerWorkerAudit(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerValidationId: request.schedulerWorkerValidationId,
  });
  const approved = result.schedulerAudit.status === "approved" || result.schedulerAudit.status === "approved-with-notes";
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: approved ? "scheduler-first-worker-audit-approved" : "scheduler-first-worker-audit-blocked",
    text: renderSchedulerRuntimeWorkerAuditMarkdown(result.schedulerAudit),
    artifact: result.schedulerAudit.artifact,
    runId: result.auditRun.id,
  }, live);
  emitAssistantEvent(live, {
    runId: result.auditRun.id,
    kind: "file-change",
    phase: approved ? "scheduler-first-worker-audit-approved" : "scheduler-first-worker-audit-blocked",
    title: approved ? "当前 scheduler worker 审计通过" : "当前 scheduler worker 审计未通过",
    summary: approved
      ? "Audit approved the first scheduler worker worktree. The scheduler TaskRun was completed."
      : "Audit blocked or failed for the first scheduler worker worktree. The scheduler TaskRun was blocked; rework and next worker were not started.",
    artifactRef: result.schedulerAudit.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-audit:${result.schedulerAudit.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.audit-first",
    status: "completed",
    label: approved ? "当前 worker 审计通过" : "当前 worker 审计未通过",
    summary: "Audited exactly one scheduler coder worker worktree without starting rework, the next worker, or a scheduler loop.",
    targetId: result.schedulerAudit.id,
    runId: result.auditRun.id,
    artifact: result.schedulerAudit.artifact,
    actionId: "planning.scheduler.worker.audit-first",
    payload: {
      schedulerRunId: result.schedulerAudit.schedulerRunId,
      schedulerClaimReservationId: result.schedulerAudit.schedulerClaimReservationId,
      schedulerWorkerStartId: result.schedulerAudit.schedulerWorkerStartId,
      schedulerWorkerResultId: result.schedulerAudit.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.schedulerAudit.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.schedulerAudit.id,
      reservationIntentId: result.schedulerAudit.reservationIntentId,
      claimIntentId: result.schedulerAudit.claimIntentId,
      nodeId: result.schedulerAudit.nodeId,
      unitId: result.schedulerAudit.unitId,
      taskRunId: result.schedulerAudit.taskRunId,
      workerLeaseId: result.schedulerAudit.workerLeaseId,
      worktreeId: result.schedulerAudit.worktreeId,
      runId: result.schedulerAudit.codeRunId,
      validationRunId: result.schedulerAudit.validationRunId,
      auditRunId: result.schedulerAudit.auditRunId,
      auditStatus: result.schedulerAudit.status,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function compilePlanningSchedulerFirstWorkerReworkPlan(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerReworkPlanResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler current worker rework plan");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-plan.compile requires schedulerRunId.");
  if (!request.schedulerWorkerValidationId) throw new Error("planning.scheduler.worker.rework-plan.compile requires schedulerWorkerValidationId.");
  const result = await runSchedulerWorkerReworkPlanCompile(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerValidationId: request.schedulerWorkerValidationId,
    ...(request.schedulerWorkerAuditId ? { schedulerWorkerAuditId: request.schedulerWorkerAuditId } : {}),
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-first-worker-rework-plan-compiled",
    text: renderSchedulerRuntimeWorkerReworkPlanMarkdown(result.reworkPlan),
    artifact: result.reworkPlan.artifact,
  }, live);
  emitAssistantEvent(live, {
    runId: result.reworkPlan.id,
    kind: "file-change",
    phase: "scheduler-first-worker-rework-plan-compiled",
    title: "当前 scheduler worker rework 计划已生成",
    summary: "Rework planning evidence was compiled for the first scheduler worker. No rework execution, next worker, or scheduler loop was started.",
    artifactRef: result.reworkPlan.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-plan:${result.reworkPlan.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-plan.compile",
    status: "completed",
    label: "当前 worker rework 计划已生成",
    summary: "Compiled bounded rework planning evidence for exactly one scheduler worker without starting rework or any additional worker.",
    targetId: result.reworkPlan.id,
    runId: result.reworkPlan.targetCodeRunId,
    artifact: result.reworkPlan.artifact,
    actionId: "planning.scheduler.worker.rework-plan.compile",
    payload: {
      schedulerRunId: result.reworkPlan.schedulerRunId,
      schedulerClaimReservationId: result.reworkPlan.schedulerClaimReservationId,
      schedulerWorkerStartId: result.reworkPlan.schedulerWorkerStartId,
      schedulerWorkerResultId: result.reworkPlan.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.reworkPlan.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.reworkPlan.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.reworkPlan.id,
      reservationIntentId: result.reworkPlan.reservationIntentId,
      claimIntentId: result.reworkPlan.claimIntentId,
      nodeId: result.reworkPlan.nodeId,
      unitId: result.reworkPlan.unitId,
      taskRunId: result.reworkPlan.taskRunId,
      workerLeaseId: result.reworkPlan.workerLeaseId,
      worktreeId: result.reworkPlan.targetWorktreeId,
      runId: result.reworkPlan.targetCodeRunId,
      validationRunId: result.reworkPlan.validationRunId,
      auditRunId: result.reworkPlan.auditRunId,
      blockingSource: result.reworkPlan.blockingSource,
      futureCodeGateMode: result.reworkPlan.futureCodeGateMode,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function startPlanningSchedulerFirstWorkerRework(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerFirstWorkerReworkStartResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler current worker rework start");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-start-first requires schedulerRunId.");
  if (!request.schedulerWorkerReworkPlanId) throw new Error("planning.scheduler.worker.rework-start-first requires schedulerWorkerReworkPlanId.");
  const result = await runSchedulerWorkerReworkStart(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerReworkPlanId: request.schedulerWorkerReworkPlanId,
    prompt: request.prompt,
    live: live ? {
      onStatus: (event) => emitAssistantEvent(live, {
        runId: event.runId,
        kind: "status",
        phase: event.status,
        title: event.label ?? "Scheduler rework-coder",
      }),
      onRunStarted: (run) => emitAssistantEvent(live, {
        runId: run.id,
        kind: "status",
        phase: "scheduler-first-worker-rework-started",
        title: "当前 scheduler worker rework 已启动",
        summary: run.worktree ? `Reusing worktree ${run.worktree.worktreeId}.` : undefined,
      }),
    } : undefined,
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-first-worker-rework-started",
    text: renderSchedulerRuntimeWorkerReworkStartMarkdown(result.reworkStart),
    artifact: result.reworkStart.artifact,
  }, live);
  emitAssistantEvent(live, {
    runId: result.reworkStart.id,
    kind: "file-change",
    phase: "scheduler-first-worker-rework-started",
    title: "当前 scheduler worker rework 已启动",
    summary: "Started exactly one rework-coder on the original scheduler worker worktree. No validation, audit, result reconcile, next worker, apply, or merge was started.",
    artifactRef: result.reworkStart.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-start:${result.reworkStart.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-start-first",
    status: "completed",
    label: "当前 worker rework 已启动",
    summary: "Started exactly one scoped rework-coder on the original scheduler worker worktree without creating a new worktree or starting follow-up gates.",
    targetId: result.reworkStart.id,
    runId: result.code.run.id,
    artifact: result.reworkStart.artifact,
    actionId: "planning.scheduler.worker.rework-start-first",
    payload: {
      schedulerRunId: result.reworkStart.schedulerRunId,
      schedulerClaimReservationId: result.reworkStart.schedulerClaimReservationId,
      schedulerWorkerStartId: result.reworkStart.schedulerWorkerStartId,
      schedulerWorkerResultId: result.reworkStart.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.reworkStart.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.reworkStart.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.reworkStart.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: result.reworkStart.id,
      reservationIntentId: result.reworkStart.reservationIntentId,
      claimIntentId: result.reworkStart.claimIntentId,
      nodeId: result.reworkStart.nodeId,
      unitId: result.reworkStart.unitId,
      originalTaskRunId: result.reworkStart.originalTaskRunId,
      taskRunId: result.reworkStart.reworkTaskRunId,
      originalWorkerLeaseId: result.reworkStart.originalWorkerLeaseId,
      workerLeaseId: result.reworkStart.reworkWorkerLeaseId,
      worktreeId: result.reworkStart.worktreeId,
      originalRunId: result.reworkStart.originalCodeRunId,
      runId: result.reworkStart.reworkRunId ?? null,
      executionGateMode: "scheduler-claim-rework",
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function reconcilePlanningSchedulerFirstWorkerReworkResult(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerReworkResultReconcileResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler current worker rework result reconcile");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-reconcile-result requires schedulerRunId.");
  if (!request.schedulerWorkerReworkStartId) throw new Error("planning.scheduler.worker.rework-reconcile-result requires schedulerWorkerReworkStartId.");
  const result = await runSchedulerWorkerReworkResultReconcile(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerReworkStartId: request.schedulerWorkerReworkStartId,
  });
  if (result.status === "running") {
    emitAssistantEvent(live, {
      runId: result.reworkStart.id,
      kind: "status",
      phase: "scheduler-first-worker-rework-result-running",
      title: "当前 scheduler worker rework 仍在运行",
      summary: result.codeRun ? `Rework code run ${result.codeRun.id} is ${result.codeRun.status}.` : "Rework code run has not produced terminal evidence yet.",
    });
    await recordWorkbenchDecision(project, {
      id: `scheduler-first-worker-rework-result-running:${result.reworkStart.id}`,
      changeId,
      decisionType: "planning.scheduler.worker.rework-reconcile-result",
      status: "completed",
      label: "当前 worker rework 仍在运行",
      summary: "Rework result reconcile found non-terminal code evidence; no terminal SchedulerRuntimeWorkerReworkResult was written.",
      targetId: result.reworkStart.id,
      runId: result.reworkStart.reworkRunId ?? null,
      artifact: result.reworkStart.artifact,
      actionId: "planning.scheduler.worker.rework-reconcile-result",
      payload: {
        schedulerRunId: result.reworkStart.schedulerRunId,
        schedulerClaimReservationId: result.reworkStart.schedulerClaimReservationId,
        schedulerWorkerStartId: result.reworkStart.schedulerWorkerStartId,
        schedulerWorkerResultId: result.reworkStart.schedulerWorkerResultId,
        schedulerWorkerValidationId: result.reworkStart.schedulerWorkerValidationId,
        schedulerWorkerAuditId: result.reworkStart.schedulerWorkerAuditId,
        schedulerWorkerReworkPlanId: result.reworkStart.schedulerWorkerReworkPlanId,
        schedulerWorkerReworkStartId: result.reworkStart.id,
        reservationIntentId: result.reworkStart.reservationIntentId,
        claimIntentId: result.reworkStart.claimIntentId,
        taskRunId: result.reworkStart.reworkTaskRunId,
        workerLeaseId: result.reworkStart.reworkWorkerLeaseId,
        worktreeId: result.reworkStart.worktreeId,
        runId: result.reworkStart.reworkRunId,
        reworkStatus: "running",
      },
      completedAt: new Date().toISOString(),
    });
    return result;
  }
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: result.result.status === "evidence-ready" ? "scheduler-first-worker-rework-result-ready" : "scheduler-first-worker-rework-result-failed",
    text: renderSchedulerRuntimeWorkerReworkResultMarkdown(result.result),
    artifact: result.result.artifact,
  }, live);
  emitAssistantEvent(live, {
    runId: result.result.id,
    kind: "file-change",
    phase: result.result.status === "evidence-ready" ? "scheduler-first-worker-rework-result-ready" : "scheduler-first-worker-rework-result-failed",
    title: result.result.status === "evidence-ready" ? "当前 scheduler worker rework 结果已对账" : "当前 scheduler worker rework 结果失败",
    summary: "Reconciled one same-worktree rework-coder result. No validation, audit, next worker, apply, or merge was started.",
    artifactRef: result.result.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-result:${result.result.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-reconcile-result",
    status: "completed",
    label: result.result.status === "evidence-ready" ? "当前 worker rework 结果已对账" : "当前 worker rework 结果失败",
    summary: result.result.status === "evidence-ready"
      ? "Rework code evidence is evidence-ready for later rework validation/audit."
      : "Rework code evidence failed; no follow-up gate was started.",
    targetId: result.result.id,
    runId: result.result.reworkRunId ?? null,
    artifact: result.result.artifact,
    actionId: "planning.scheduler.worker.rework-reconcile-result",
    payload: {
      schedulerRunId: result.result.schedulerRunId,
      schedulerClaimReservationId: result.result.schedulerClaimReservationId,
      schedulerWorkerStartId: result.result.schedulerWorkerStartId,
      schedulerWorkerResultId: result.result.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.result.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.result.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.result.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: result.result.schedulerWorkerReworkStartId,
      schedulerWorkerReworkResultId: result.result.id,
      reservationIntentId: result.result.reservationIntentId,
      claimIntentId: result.result.claimIntentId,
      nodeId: result.result.nodeId,
      unitId: result.result.unitId,
      originalTaskRunId: result.result.originalTaskRunId,
      taskRunId: result.result.reworkTaskRunId,
      originalWorkerLeaseId: result.result.originalWorkerLeaseId,
      workerLeaseId: result.result.reworkWorkerLeaseId,
      worktreeId: result.result.worktreeId,
      originalRunId: result.result.originalCodeRunId,
      runId: result.result.reworkRunId,
      reworkRunId: result.result.reworkRunId,
      reworkResultStatus: result.result.status,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function validatePlanningSchedulerFirstWorkerRework(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerReworkValidationResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler current worker rework validation");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-validate-first requires schedulerRunId.");
  if (!request.schedulerWorkerReworkResultId) throw new Error("planning.scheduler.worker.rework-validate-first requires schedulerWorkerReworkResultId.");
  const result = await runSchedulerWorkerReworkValidation(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerReworkResultId: request.schedulerWorkerReworkResultId,
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: result.schedulerReworkValidation.status === "passed" ? "scheduler-first-worker-rework-validation-passed" : "scheduler-first-worker-rework-validation-failed",
    text: renderSchedulerRuntimeWorkerReworkValidationMarkdown(result.schedulerReworkValidation),
    artifact: result.schedulerReworkValidation.artifact,
  }, live);
  emitAssistantEvent(live, {
    runId: result.schedulerReworkValidation.id,
    kind: "file-change",
    phase: result.schedulerReworkValidation.status === "passed" ? "scheduler-first-worker-rework-validation-passed" : "scheduler-first-worker-rework-validation-failed",
    title: result.schedulerReworkValidation.status === "passed" ? "当前 scheduler worker rework 验证通过" : "当前 scheduler worker rework 验证失败",
    summary: "Ran one scoped Validation on the same scheduler rework worktree. No audit, next worker, apply, or merge was started.",
    artifactRef: result.schedulerReworkValidation.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-validation:${result.schedulerReworkValidation.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-validate-first",
    status: "completed",
    label: result.schedulerReworkValidation.status === "passed" ? "当前 worker rework 验证通过" : "当前 worker rework 验证失败",
    summary: result.schedulerReworkValidation.status === "passed"
      ? "Rework validation passed; rework audit remains required before task completion."
      : "Rework validation failed; the rework TaskRun is blocked and no follow-up gate was started.",
    targetId: result.schedulerReworkValidation.id,
    runId: result.schedulerReworkValidation.validationRunId,
    artifact: result.schedulerReworkValidation.artifact,
    actionId: "planning.scheduler.worker.rework-validate-first",
    payload: {
      schedulerRunId: result.schedulerReworkValidation.schedulerRunId,
      schedulerClaimReservationId: result.schedulerReworkValidation.schedulerClaimReservationId,
      schedulerWorkerStartId: result.schedulerReworkValidation.schedulerWorkerStartId,
      schedulerWorkerResultId: result.schedulerReworkValidation.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.schedulerReworkValidation.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.schedulerReworkValidation.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.schedulerReworkValidation.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: result.schedulerReworkValidation.schedulerWorkerReworkStartId,
      schedulerWorkerReworkResultId: result.schedulerReworkValidation.schedulerWorkerReworkResultId,
      schedulerWorkerReworkValidationId: result.schedulerReworkValidation.id,
      reservationIntentId: result.schedulerReworkValidation.reservationIntentId,
      claimIntentId: result.schedulerReworkValidation.claimIntentId,
      nodeId: result.schedulerReworkValidation.nodeId,
      unitId: result.schedulerReworkValidation.unitId,
      originalTaskRunId: result.schedulerReworkValidation.originalTaskRunId,
      taskRunId: result.schedulerReworkValidation.reworkTaskRunId,
      originalWorkerLeaseId: result.schedulerReworkValidation.originalWorkerLeaseId,
      workerLeaseId: result.schedulerReworkValidation.reworkWorkerLeaseId,
      worktreeId: result.schedulerReworkValidation.worktreeId,
      originalRunId: result.schedulerReworkValidation.originalCodeRunId,
      runId: result.schedulerReworkValidation.reworkRunId,
      reworkRunId: result.schedulerReworkValidation.reworkRunId,
      validationRunId: result.schedulerReworkValidation.validationRunId,
      reworkValidationRunId: result.schedulerReworkValidation.validationRunId,
      validationStatus: result.schedulerReworkValidation.validationStatus,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function auditPlanningSchedulerFirstWorkerRework(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerWorkerReworkAuditResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler current worker rework audit");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-audit-first requires schedulerRunId.");
  if (!request.schedulerWorkerReworkValidationId) throw new Error("planning.scheduler.worker.rework-audit-first requires schedulerWorkerReworkValidationId.");
  const result = await runSchedulerWorkerReworkAudit(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerWorkerReworkValidationId: request.schedulerWorkerReworkValidationId,
  });
  const approved = result.schedulerReworkAudit.status === "approved" || result.schedulerReworkAudit.status === "approved-with-notes";
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: approved ? "scheduler-first-worker-rework-audit-approved" : "scheduler-first-worker-rework-audit-blocked",
    text: renderSchedulerRuntimeWorkerReworkAuditMarkdown(result.schedulerReworkAudit),
    artifact: result.schedulerReworkAudit.artifact,
  }, live);
  emitAssistantEvent(live, {
    runId: result.schedulerReworkAudit.id,
    kind: "file-change",
    phase: approved ? "scheduler-first-worker-rework-audit-approved" : "scheduler-first-worker-rework-audit-blocked",
    title: approved ? "当前 scheduler worker rework 审计通过" : "当前 scheduler worker rework 审计阻塞",
    summary: "Ran one scoped Audit on the same scheduler rework worktree. No next worker, integration, apply, or merge was started.",
    artifactRef: result.schedulerReworkAudit.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-first-worker-rework-audit:${result.schedulerReworkAudit.id}`,
    changeId,
    decisionType: "planning.scheduler.worker.rework-audit-first",
    status: "completed",
    label: approved ? "当前 worker rework 审计通过" : "当前 worker rework 审计阻塞",
    summary: approved
      ? "Rework audit approved; the rework TaskRun is completed."
      : "Rework audit blocked or failed; the current rework path is blocked and no follow-up gate was started.",
    targetId: result.schedulerReworkAudit.id,
    runId: result.schedulerReworkAudit.auditRunId,
    artifact: result.schedulerReworkAudit.artifact,
    actionId: "planning.scheduler.worker.rework-audit-first",
    payload: {
      schedulerRunId: result.schedulerReworkAudit.schedulerRunId,
      schedulerClaimReservationId: result.schedulerReworkAudit.schedulerClaimReservationId,
      schedulerWorkerStartId: result.schedulerReworkAudit.schedulerWorkerStartId,
      schedulerWorkerResultId: result.schedulerReworkAudit.schedulerWorkerResultId,
      schedulerWorkerValidationId: result.schedulerReworkAudit.schedulerWorkerValidationId,
      schedulerWorkerAuditId: result.schedulerReworkAudit.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: result.schedulerReworkAudit.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: result.schedulerReworkAudit.schedulerWorkerReworkStartId,
      schedulerWorkerReworkResultId: result.schedulerReworkAudit.schedulerWorkerReworkResultId,
      schedulerWorkerReworkValidationId: result.schedulerReworkAudit.schedulerWorkerReworkValidationId,
      schedulerWorkerReworkAuditId: result.schedulerReworkAudit.id,
      reservationIntentId: result.schedulerReworkAudit.reservationIntentId,
      claimIntentId: result.schedulerReworkAudit.claimIntentId,
      nodeId: result.schedulerReworkAudit.nodeId,
      unitId: result.schedulerReworkAudit.unitId,
      originalTaskRunId: result.schedulerReworkAudit.originalTaskRunId,
      taskRunId: result.schedulerReworkAudit.reworkTaskRunId,
      originalWorkerLeaseId: result.schedulerReworkAudit.originalWorkerLeaseId,
      workerLeaseId: result.schedulerReworkAudit.reworkWorkerLeaseId,
      worktreeId: result.schedulerReworkAudit.worktreeId,
      originalRunId: result.schedulerReworkAudit.originalCodeRunId,
      runId: result.schedulerReworkAudit.reworkRunId,
      reworkRunId: result.schedulerReworkAudit.reworkRunId,
      validationRunId: result.schedulerReworkAudit.validationRunId,
      reworkValidationRunId: result.schedulerReworkAudit.validationRunId,
      auditRunId: result.schedulerReworkAudit.auditRunId,
      reworkAuditRunId: result.schedulerReworkAudit.auditRunId,
      auditStatus: result.schedulerReworkAudit.auditStatus,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function compilePlanningSchedulerIntegrationCandidate(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerIntegrationCandidateResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler integration candidate");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.integration-candidate.compile requires schedulerRunId.");
  const result = await runSchedulerIntegrationCandidateCompile(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-integration-candidate-compiled",
    text: renderSchedulerIntegrationCandidateMarkdown(result.candidate),
    artifact: result.candidate.artifact,
  }, live);
  emitAssistantEvent(live, {
    runId: result.candidate.schedulerRunId,
    kind: "file-change",
    phase: "scheduler-integration-candidate-compiled",
    title: "Scheduler integration candidate compiled",
    summary: result.candidate.readyCount >= 2
      ? `Scheduler integration candidate has ${result.candidate.readyCount} ready target(s). No IntegrationCheck or apply was started.`
      : `Scheduler integration candidate is waiting for more ready worker outputs (${result.candidate.readyCount}/2). No IntegrationCheck or apply was started.`,
    artifactRef: result.candidate.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-integration-candidate:${result.candidate.id}`,
    changeId,
    decisionType: "planning.scheduler.integration-candidate.compile",
    status: "completed",
    label: "Scheduler Integration Candidate 已生成",
    summary: "Compiled scheduler worker outputs into integration candidate evidence without running IntegrationCheck, apply, merge, or another worker.",
    targetId: result.candidate.id,
    runId: null,
    artifact: result.candidate.artifact,
    actionId: "planning.scheduler.integration-candidate.compile",
    payload: {
      candidate: result.candidate,
      schedulerIntegrationCandidateId: result.candidate.id,
      schedulerRunId: result.candidate.schedulerRunId,
      schedulerClaimReservationId: result.candidate.schedulerClaimReservationId,
      schedulerReconcileSnapshotId: result.candidate.schedulerReconcileSnapshotId,
      readyWorktreeIds: result.candidate.readyWorktreeIds,
      readyCount: result.candidate.readyCount,
      blockedCount: result.candidate.blockedCount,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function runPlanningSchedulerIntegrationCheckHandoff(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerIntegrationCheckHandoffResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler IntegrationCheck handoff");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.integration-check.run requires schedulerRunId.");
  if (!request.schedulerIntegrationCandidateId) throw new Error("planning.scheduler.integration-check.run requires schedulerIntegrationCandidateId.");
  const result = await runSchedulerIntegrationCheck(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerIntegrationCandidateId: request.schedulerIntegrationCandidateId,
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: "scheduler-integration-check-handoff-completed",
    text: renderSchedulerIntegrationCheckHandoffMarkdown(result.handoff),
    artifact: result.handoff.artifact,
  }, live);
  emitAssistantEvent(live, {
    runId: result.handoff.integrationCheckId,
    kind: "file-change",
    phase: "scheduler-integration-check-handoff-completed",
    title: "Scheduler IntegrationCheck completed",
    summary: `Scheduler ready targets were handed to IntegrationCheck ${result.handoff.integrationCheckId} (${result.handoff.integrationCheckStatus}). No apply, landing, PR, merge, or next worker was started.`,
    artifactRef: result.handoff.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-integration-check-handoff:${result.handoff.id}`,
    changeId,
    decisionType: "planning.scheduler.integration-check.run",
    status: "completed",
    label: "Scheduler IntegrationCheck 已运行",
    summary: "Ran existing IntegrationCheck with explicit scheduler ready worktree targets. Apply/landing/merge remains a separate human gate.",
    targetId: result.handoff.id,
    runId: null,
    artifact: result.handoff.artifact,
    actionId: "planning.scheduler.integration-check.run",
    payload: {
      handoff: result.handoff,
      schedulerIntegrationCheckHandoffId: result.handoff.id,
      schedulerIntegrationCandidateId: result.handoff.schedulerIntegrationCandidateId,
      schedulerRunId: result.handoff.schedulerRunId,
      schedulerClaimReservationId: result.handoff.schedulerClaimReservationId,
      schedulerReconcileSnapshotId: result.handoff.schedulerReconcileSnapshotId,
      worktreeIds: result.handoff.readyWorktreeIds,
      applyCheckId: result.handoff.integrationCheckId,
      integrationCheckId: result.handoff.integrationCheckId,
      integrationCheckStatus: result.handoff.integrationCheckStatus,
      resultTargetWorktreeIds: result.handoff.resultTargetWorktreeIds,
    },
    completedAt: new Date().toISOString(),
  });
  return result;
}

export async function reconcilePlanningSchedulerIntegrationOutcome(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerIntegrationOutcomeResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Scheduler integration outcome");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.integration-outcome.reconcile requires schedulerRunId.");
  if (!request.schedulerIntegrationCheckHandoffId) throw new Error("planning.scheduler.integration-outcome.reconcile requires schedulerIntegrationCheckHandoffId.");
  const result = await runSchedulerIntegrationOutcomeReconcile(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerIntegrationCheckHandoffId: request.schedulerIntegrationCheckHandoffId,
  });
  const title = result.outcome ? "Scheduler integration outcome recorded" : "Scheduler IntegrationCheck waiting for apply/discard";
  const text = result.outcome
    ? renderSchedulerIntegrationOutcomeMarkdown(result.outcome)
    : `IntegrationCheck ${result.integrationCheck.id} passed and is waiting for the existing apply/discard confirmation. No scheduler apply/discard action was created.`;
  const event = {
    runId: result.outcome?.integrationCheckId ?? result.integrationCheck.id,
    text,
  };
  emitAssistantEvent(live, {
    runId: event.runId,
    kind: "file-change",
    phase: result.outcome ? "scheduler-integration-outcome-recorded" : "scheduler-integration-outcome-waiting",
    title,
    summary: result.summary,
    artifactRef: result.outcome?.artifact ?? result.integrationCheck.artifactRefs[0],
  });
  await recordWorkbenchDecision(project, {
    id: result.outcome ? `scheduler-integration-outcome:${result.outcome.id}` : `scheduler-integration-outcome-waiting:${result.integrationCheck.id}`,
    changeId,
    decisionType: "planning.scheduler.integration-outcome.reconcile",
    status: "completed",
    label: result.outcome ? "Scheduler integration outcome 已记录" : "Scheduler IntegrationCheck 等待 apply/discard",
    actionId: "planning.scheduler.integration-outcome.reconcile",
    targetId: result.outcome?.id ?? request.schedulerIntegrationCheckHandoffId,
    runId: result.integrationCheck.id,
    artifact: result.outcome?.artifact ?? null,
    summary: result.outcome
      ? `Scheduler integration outcome ${result.outcome.status} recorded for IntegrationCheck ${result.integrationCheck.id}. No source mutation was performed by this action.`
      : `Scheduler IntegrationCheck ${result.integrationCheck.id} is passed and still waits for existing apply/discard confirmation. No scheduler apply/discard was created.`,
    payload: {
      outcome: result.outcome,
      schedulerIntegrationOutcomeId: result.outcome?.id,
      schedulerIntegrationCheckHandoffId: request.schedulerIntegrationCheckHandoffId,
      integrationCheckId: result.integrationCheck.id,
      integrationCheckStatus: result.integrationCheck.status,
      sourceMutated: false,
    },
    completedAt: new Date().toISOString(),
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    text: event.text,
    actionRunId: event.runId,
    runId: result.integrationCheck.id,
  }, live);
  return result;
}

export async function completePlanningSchedulerRun(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerRunCompletionResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "SchedulerRun completion");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.run.complete requires schedulerRunId.");
  if (!request.schedulerIntegrationOutcomeId) throw new Error("planning.scheduler.run.complete requires schedulerIntegrationOutcomeId.");
  const result = await runSchedulerRunComplete(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerIntegrationOutcomeId: request.schedulerIntegrationOutcomeId,
  });
  const text = renderSchedulerRunCompletionMarkdown(result.completion);
  emitAssistantEvent(live, {
    runId: result.completion.integrationCheckId,
    kind: "file-change",
    phase: "scheduler-run-completed",
    title: "SchedulerRun completion recorded",
    summary: `SchedulerRun completion recorded as ${result.completion.status}. No source mutation was performed by this action.`,
    artifactRef: result.completion.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-run-completion:${result.completion.id}`,
    changeId,
    decisionType: "planning.scheduler.run.complete",
    status: "completed",
    label: "SchedulerRun completion 已记录",
    actionId: "planning.scheduler.run.complete",
    targetId: result.completion.id,
    runId: result.completion.integrationCheckId,
    artifact: result.completion.artifact,
    summary: `SchedulerRun completion ${result.completion.status} recorded from scheduler integration outcome ${result.completion.schedulerIntegrationOutcomeId}. No source mutation was performed by this action.`,
    payload: {
      completion: result.completion,
      schedulerRunCompletionId: result.completion.id,
      schedulerIntegrationOutcomeId: result.completion.schedulerIntegrationOutcomeId,
      schedulerIntegrationCheckHandoffId: result.completion.schedulerIntegrationCheckHandoffId,
      schedulerIntegrationCandidateId: result.completion.schedulerIntegrationCandidateId,
      schedulerClaimReservationId: result.completion.schedulerClaimReservationId,
      integrationCheckId: result.completion.integrationCheckId,
      integrationCheckStatus: result.completion.integrationCheckStatus,
      completionStatus: result.completion.status,
      outcomeStatus: result.completion.outcomeStatus,
      sourceMutated: false,
    },
    completedAt: new Date().toISOString(),
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    text,
    actionRunId: result.completion.integrationCheckId,
    runId: result.completion.integrationCheckId,
  }, live);
  return result;
}

export async function closeBlockedPlanningSchedulerRun(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<SchedulerRunBlockedCloseoutResult> {
  const { memory } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "SchedulerRun blocked closeout");
  if (!request.schedulerRunId) throw new Error("planning.scheduler.run.close-blocked requires schedulerRunId.");
  if (!request.schedulerClaimReservationId) throw new Error("planning.scheduler.run.close-blocked requires schedulerClaimReservationId.");
  if (!request.schedulerIntegrationCandidateId) throw new Error("planning.scheduler.run.close-blocked requires schedulerIntegrationCandidateId.");
  const result = await runSchedulerRunCloseBlocked(project, {
    changeId,
    schedulerRunId: request.schedulerRunId,
    schedulerClaimReservationId: request.schedulerClaimReservationId,
    schedulerIntegrationCandidateId: request.schedulerIntegrationCandidateId,
  });
  const text = renderSchedulerRunBlockedCloseoutMarkdown(result.closeout);
  emitAssistantEvent(live, {
    runId: result.closeout.schedulerRunId,
    kind: "file-change",
    phase: "scheduler-run-closeout-recorded",
    title: "SchedulerRun closeout recorded",
    summary: `SchedulerRun closeout recorded as ${result.closeout.status}. No IntegrationCheck, source mutation, worker, or merge was started.`,
    artifactRef: result.closeout.artifact,
  });
  await recordWorkbenchDecision(project, {
    id: `scheduler-run-closeout:${result.closeout.id}`,
    changeId,
    decisionType: "planning.scheduler.run.close-blocked",
    status: "completed",
    label: "SchedulerRun closeout 已记录",
    actionId: "planning.scheduler.run.close-blocked",
    targetId: result.closeout.id,
    runId: result.closeout.schedulerRunId,
    artifact: result.closeout.artifact,
    summary: `SchedulerRun closeout ${result.closeout.status} recorded before IntegrationCheck. No source mutation was performed by this action.`,
    payload: {
      closeout: result.closeout,
      schedulerRunBlockedCloseoutId: result.closeout.id,
      schedulerIntegrationCandidateId: result.closeout.schedulerIntegrationCandidateId,
      schedulerClaimReservationId: result.closeout.schedulerClaimReservationId,
      schedulerReconcileSnapshotId: result.closeout.schedulerReconcileSnapshotId,
      closeoutStatus: result.closeout.status,
      closeoutReason: result.closeout.reason,
      readyCount: result.closeout.readyCount,
      blockedCount: result.closeout.blockedCount,
      readyWorktreeIds: result.closeout.readyWorktreeIds,
      sourceMutated: false,
      executionStarted: false,
    },
    completedAt: new Date().toISOString(),
  });
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    text,
    actionRunId: result.closeout.schedulerRunId,
    runId: result.closeout.schedulerRunId,
  }, live);
  return result;
}

export async function startAcceptedSequentialWorkflow(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "accepted workflow start");
  if (!request.workflowGraphPlanId) throw new Error("workflow.run.start requires workflowGraphPlanId.");
  const authoredGraph = await readWorkflowGraphPlan(memory, changePath, request.workflowGraphPlanId);
  const latestGraph = await readLatestWorkflowGraphPlan(memory, changePath);
  if (authoredGraph.authoringContractVersion !== "1.0" || authoredGraph.graphMode !== "sequential-v1" || authoredGraph.status !== "compiled" || authoredGraph.changeId !== changeId || latestGraph.id !== authoredGraph.id) {
    throw new Error("workflow.run.start authored graph target is stale.");
  }
  await appendConversationTimelineEntry(project, changeId, {
    type: "assistant.message",
    status: "taskqueue-starting",
    text: `WorkflowGraphPlan ${authoredGraph.id} confirmed for scoped sequential execution.`,
    artifact: authoredGraph.artifact,
  }, live);
  let executionMode: "stepwise" | "scoped-auto" | undefined;
  try {
    const intentPath = join(memory.changesRoot, "active", changeId, "planning", "execution-authorization-intent.json");
    const intent = JSON.parse(await readFile(intentPath, "utf8")) as { status?: unknown; authorizationId?: unknown };
    if (intent.status === "issued" && typeof intent.authorizationId === "string") {
      executionMode = (await readExecutionAuthorization(memory, intent.authorizationId)).mode;
    }
  } catch {
    executionMode = undefined;
  }
  return runTaskQueueSequentialWorkflow({ project, changeId, live, workflowGraphPlanId: authoredGraph.id, executionMode });
}
import { readFile } from "node:fs/promises";
import { join } from "node:path";
