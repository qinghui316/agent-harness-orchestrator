import type { ManagedProject } from "../../../../types/index.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../../read-model-types.js";
import { evidenceRefs } from "../evidence-refs.js";
import { schedulerUserFacingActionCopy } from "./scheduler-user-surface.js";

export function schedulerNextActionToConfirmationItems(
  project: ManagedProject | null,
  selectedTopic: WorkbenchTopicDetail | null,
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  if (!selectedTopic) return [];
  const conversationId = selectedTopic.id;
  const changeId = selectedTopic.boundChangeId ?? conversationId;
  const action = workpad.nextAction;
  if (action.kind !== "workflow-action" || !action.enabled || !action.requiresConfirmation || !action.actionType?.startsWith("planning.scheduler.")) {
    return [];
  }
  const targetId = action.schedulerIntegrationCheckHandoffId
    ?? action.schedulerRunCompletionId
    ?? action.schedulerIntegrationOutcomeId
    ?? action.schedulerIntegrationCandidateId
    ?? action.schedulerWorkerReworkAuditId
    ?? action.schedulerWorkerReworkValidationId
    ?? action.schedulerWorkerReworkResultId
    ?? action.schedulerWorkerReworkStartId
    ?? action.schedulerWorkerReworkPlanId
    ?? action.schedulerWorkerAuditId
    ?? action.schedulerWorkerValidationId
    ?? action.schedulerWorkerResultId
    ?? action.schedulerWorkerStartId
    ?? action.schedulerClaimReservationId
    ?? action.schedulerRunId
    ?? action.workflowGraphPlanId
    ?? "next";
  const workerValidation = workpad.schedulerWorkerValidation;
  const workerAudit = workpad.schedulerWorkerAudit;
  const workerReworkValidation = workpad.schedulerWorkerReworkValidation;
  const workerReworkAudit = workpad.schedulerWorkerReworkAudit;
  const workerReworkResult = workpad.schedulerWorkerReworkResult;
  const workerReworkStart = workpad.schedulerWorkerReworkStart;
  const workerResult = workpad.schedulerWorkerResult;
  const workerStart = workpad.schedulerWorkerStart;
  const runId = workerAudit?.auditRunId
    ?? workerReworkAudit?.reworkRunId
    ?? workerReworkValidation?.reworkRunId
    ?? workerReworkResult?.reworkRunId
    ?? workerReworkStart?.reworkRunId
    ?? workerValidation?.codeRunId
    ?? workerResult?.runId
    ?? workerStart?.runId;
  const taskRunId = action.taskRunId
    ?? workerReworkAudit?.reworkTaskRunId
    ?? workerReworkValidation?.reworkTaskRunId
    ?? workerReworkResult?.reworkTaskRunId
    ?? workerReworkStart?.reworkTaskRunId
    ?? workerAudit?.taskRunId
    ?? workerValidation?.taskRunId
    ?? workerResult?.taskRunId
    ?? workerStart?.taskRunId;
  const workerLeaseId = workerAudit?.workerLeaseId
    ?? workerReworkAudit?.reworkWorkerLeaseId
    ?? workerReworkValidation?.reworkWorkerLeaseId
    ?? workerReworkResult?.reworkWorkerLeaseId
    ?? workerReworkStart?.reworkWorkerLeaseId
    ?? workerValidation?.workerLeaseId
    ?? workerResult?.workerLeaseId
    ?? workerStart?.workerLeaseId;
  const worktreeId = action.worktreeId
    ?? workerReworkAudit?.worktreeId
    ?? workerReworkValidation?.worktreeId
    ?? workerReworkResult?.worktreeId
    ?? workerReworkStart?.worktreeId
    ?? workerAudit?.worktreeId
    ?? workerValidation?.worktreeId
    ?? workerResult?.worktreeId
    ?? workerStart?.worktreeId;
  const validationRunId = action.validationRunId ?? workerAudit?.validationRunId ?? workerValidation?.validationRunId;
  const reworkValidationRunId = action.reworkValidationRunId ?? workerReworkValidation?.validationRunId;
  const auditRunId = action.auditRunId ?? workerAudit?.auditRunId;
  const reworkAuditRunId = action.reworkAuditRunId ?? workerReworkAudit?.auditRunId;
  const userCopy = schedulerUserFacingActionCopy(action.actionType);
  return [{
    id: `confirm:${action.actionType}:${changeId}:${targetId}`,
    kind: "planning-confirm",
    projectId: project?.id ?? null,
    conversationId,
    changeId,
    runId,
    worktreeId,
    schedulerRunId: action.schedulerRunId,
    schedulerReconcileSnapshotId: action.schedulerReconcileSnapshotId,
    schedulerClaimReservationId: action.schedulerClaimReservationId,
    schedulerWorkerStartId: action.schedulerWorkerStartId,
    schedulerWorkerResultId: action.schedulerWorkerResultId,
    schedulerWorkerValidationId: action.schedulerWorkerValidationId,
    schedulerWorkerAuditId: action.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: action.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: action.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: action.schedulerWorkerReworkResultId,
    schedulerWorkerReworkValidationId: action.schedulerWorkerReworkValidationId,
    schedulerWorkerReworkAuditId: action.schedulerWorkerReworkAuditId,
    schedulerIntegrationCandidateId: action.schedulerIntegrationCandidateId,
    schedulerIntegrationCheckHandoffId: action.schedulerIntegrationCheckHandoffId,
    schedulerIntegrationOutcomeId: action.schedulerIntegrationOutcomeId,
    schedulerRunCompletionId: action.schedulerRunCompletionId,
    reservationIntentId: action.reservationIntentId,
    claimIntentId: action.claimIntentId,
    taskRunId,
    workerLeaseId,
    validationRunId,
    reworkValidationRunId,
    auditRunId,
    reworkAuditRunId,
    summary: userCopy.summary,
    whyNeedsConfirmation: userCopy.whyNeedsConfirmation,
    confirmEffect: userCopy.confirmEffect,
    riskSummary: userCopy.riskSummary,
    evidenceRefs: [],
    actions: [{
      id: `workflow:${action.actionType}:${changeId}:${targetId}`,
      label: userCopy.label,
      kind: "workflow-action",
      changeId,
      actionType: action.actionType,
      workflowGraphPlanId: action.workflowGraphPlanId,
      schedulerContractId: action.schedulerContractId,
      schedulerDispatchDryRunId: action.schedulerDispatchDryRunId,
      schedulerWorkerPlanId: action.schedulerWorkerPlanId,
      schedulerClaimReconcilePlanId: action.schedulerClaimReconcilePlanId,
      schedulerLaunchPreflightId: action.schedulerLaunchPreflightId,
      schedulerRunId: action.schedulerRunId,
      schedulerReconcileSnapshotId: action.schedulerReconcileSnapshotId,
      schedulerClaimReservationId: action.schedulerClaimReservationId,
      schedulerWorkerStartId: action.schedulerWorkerStartId,
      schedulerWorkerResultId: action.schedulerWorkerResultId,
      schedulerWorkerValidationId: action.schedulerWorkerValidationId,
      schedulerWorkerAuditId: action.schedulerWorkerAuditId,
      schedulerWorkerReworkPlanId: action.schedulerWorkerReworkPlanId,
      schedulerWorkerReworkStartId: action.schedulerWorkerReworkStartId,
      schedulerWorkerReworkResultId: action.schedulerWorkerReworkResultId,
      schedulerWorkerReworkValidationId: action.schedulerWorkerReworkValidationId,
      schedulerWorkerReworkAuditId: action.schedulerWorkerReworkAuditId,
      schedulerIntegrationCandidateId: action.schedulerIntegrationCandidateId,
      schedulerIntegrationCheckHandoffId: action.schedulerIntegrationCheckHandoffId,
      schedulerIntegrationOutcomeId: action.schedulerIntegrationOutcomeId,
      schedulerRunCompletionId: action.schedulerRunCompletionId,
      reservationIntentId: action.reservationIntentId,
      claimIntentId: action.claimIntentId,
      taskRunId,
      workerLeaseId,
      worktreeId,
      runId,
      worktreeIds: action.worktreeIds,
      applyCheckId: action.applyCheckId,
      validationRunId,
      reworkValidationRunId,
      auditRunId,
      reworkAuditRunId,
      enabled: true,
      requiresConfirmation: true,
    }],
    primary: true,
    status: "pending",
  }];
}

export function sequentialWorkflowToConfirmationItems(
  project: ManagedProject | null,
  selectedTopic: WorkbenchTopicDetail | null,
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  if (!selectedTopic) return [];
  const conversationId = selectedTopic.id;
  const changeId = selectedTopic.boundChangeId ?? conversationId;
  const authoredGraph = workpad.workflowGraphPlan;
  if (authoredGraph?.authoringContractVersion === "1.0" && authoredGraph.graphMode === "sequential-v1") {
    if (workpad.workflowRun?.workflowGraphPlanId === authoredGraph.id) return [];
    return [{
      id: `confirm:workflow-start:${changeId}:${authoredGraph.id}`,
      kind: "planning-confirm",
      projectId: project?.id ?? null,
      conversationId,
      changeId,
      summary: `已确认的执行图包含 ${authoredGraph.nodeCount} 个顺序任务。`,
      whyNeedsConfirmation: "需要你确认启动当前执行图。",
      confirmEffect: "运行时会重新读取执行图并逐个执行任务；不会自动应用、合并或关闭。",
      riskSummary: "执行结果仍需检查、审查和后续人工 gate。",
      evidenceRefs: evidenceRefs(authoredGraph.artifact),
      actions: [{
        id: `workflow:workflow.run.start:${changeId}:${authoredGraph.id}`,
        label: "开始执行计划",
        kind: "workflow-action",
        changeId,
        actionType: "workflow.run.start",
        workflowGraphPlanId: authoredGraph.id,
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    }];
  }
  return [];
}
