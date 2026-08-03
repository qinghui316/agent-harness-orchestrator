import type { ManagedProject } from "../../../../types/index.js";
import type {
  WorkbenchConfirmationQueueItem,
  WorkbenchTopicDetail,
  WorkbenchWorkpad,
} from "../../../read-model-types.js";
import type { WorkbenchWorkflowGraphPlanSummary } from "../../../workflow-projection.js";
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
    graphScopeId: selectedTopic.graphScopeId,
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
      graphScopeId: selectedTopic.graphScopeId,
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
  if (!authoredGraph || workpad.workflowRun?.workflowGraphPlanId === authoredGraph.id) return [];
  return sequentialWorkflowPlanToConfirmationItems(project, {
    conversationId,
    changeId,
    graphScopeId: selectedTopic.graphScopeId,
    authoredGraph,
  });
}

function sequentialWorkflowPlanToConfirmationItems(
  project: ManagedProject | null,
  input: {
    conversationId: string;
    changeId: string;
    graphScopeId?: string;
    authoredGraph: WorkbenchWorkflowGraphPlanSummary;
  },
): WorkbenchConfirmationQueueItem[] {
  const { conversationId, changeId, graphScopeId, authoredGraph } = input;
  if (authoredGraph.authoringContractVersion === "1.0"
    && (authoredGraph.graphMode === "sequential-v1" || authoredGraph.graphMode === "ready-set-v1")) {
    const readySet = authoredGraph.graphMode === "ready-set-v1";
    return [{
      id: `confirm:workflow-start:${changeId}:${authoredGraph.id}`,
      kind: "planning-confirm",
      projectId: project?.id ?? null,
      conversationId,
      changeId,
      graphScopeId,
      summary: readySet
        ? `已准备好按 ${authoredGraph.waveCount ?? 0} 个波次处理 ${authoredGraph.nodeCount} 项任务。`
        : `已准备好按顺序处理 ${authoredGraph.nodeCount} 项任务。`,
      whyNeedsConfirmation: readySet
        ? "确认后初始化 Scheduler 运行态并准备第一个明确的 worker。"
        : "确认后开始按顺序处理这些事项。",
      confirmEffect: readySet
        ? "系统只创建 Scheduler 运行证据并显示下一项 worker 操作；不会自动开始整波或应用代码。"
        : "系统会逐项处理并返回结果；不会自动提交或合并代码。",
      riskSummary: "每项结果都会经过检查，后续需要你决定是否落地。",
      evidenceRefs: evidenceRefs(authoredGraph.artifact),
      actions: [{
        id: `workflow:workflow.run.start:${changeId}:${authoredGraph.id}`,
        label: "开始执行计划",
        kind: "workflow-action",
        changeId,
        graphScopeId,
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
