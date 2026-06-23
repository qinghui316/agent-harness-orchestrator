import type { ManagedProject } from "../../../../types/index.js";
import type { DecompositionRecommendation } from "../../../../workflow-artifacts/manager.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../../read-model-types.js";
import { evidenceRefs } from "../evidence-refs.js";
import { schedulerUserFacingActionCopy } from "./scheduler-user-surface.js";

export function workpadNextActionToConfirmationItems(
  project: ManagedProject | null,
  selectedTopic: WorkbenchTopicDetail | null,
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  const action = workpad.nextAction;
  if (!selectedTopic) return [];
  const planningBundleId = workpad.planningArtifactBundle?.status === "draft"
    ? workpad.planningArtifactBundle.id
    : action.actionType === "planning.confirm-execution"
      ? action.planningBundleId
      : undefined;
  if (planningBundleId) {
    return [{
      id: `confirm:planning:${selectedTopic.id}`,
      kind: "planning-confirm",
      projectId: project?.id ?? null,
      conversationId: selectedTopic.id,
      changeId: selectedTopic.id,
      summary: "规划草案已经准备好，可以写入内部 spec/plan/tasks/ac-map。",
      whyNeedsConfirmation: "需要你确认将当前规划写入 canonical spec/plan/tasks/ac-map。",
      confirmEffect: action.actionType === "planning.confirm-execution"
        ? action.description
        : "确认只写 canonical spec/plan/tasks/ac-map 和确认记录；不会启动 coder、validator、auditor、TaskQueue、TaskRun 或 AgentTask。",
      riskSummary: "确认规划不是执行授权；后续执行仍必须经过拆分评估和执行边界检查。",
      evidenceRefs: evidenceRefs(workpad.planningArtifactBundle?.artifact),
      actions: [{
        id: `workflow:planning.confirm-execution:${selectedTopic.id}`,
        label: action.actionType === "planning.confirm-execution" ? action.label : "确认执行",
        kind: "workflow-action",
        changeId: selectedTopic.id,
        actionType: "planning.confirm-execution",
        planningBundleId,
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    }];
  }
  if (action.kind !== "workflow-action" || !action.enabled || !action.requiresConfirmation || !action.actionType) return [];
  if (action.actionType === "planning.generate") {
    return [genericWorkflowQueueItem({
      project,
      selectedTopic,
      id: `confirm:planning-generate:${selectedTopic.id}`,
      summary: "可以先生成方案草案。",
      whyNeedsConfirmation: "需要你确认让 planning-agent 生成一个可审阅方案草案。",
      confirmEffect: "只生成 proposal/spec/design/tasks 草案和证据；不会写 canonical artifacts，也不会启动执行。",
      riskSummary: "草案仍需后续确认执行后才会写入内部 spec/plan/tasks/ac-map。",
      label: action.label,
      actionType: "planning.generate",
      evidence: [],
    })];
  }
  if (action.actionType === "planning.decompose") {
    return [genericWorkflowQueueItem({
      project,
      selectedTopic,
      id: `confirm:planning-decompose:${selectedTopic.id}`,
      summary: "规划已确认，可以生成拆分提案。",
      whyNeedsConfirmation: "需要你确认生成拆分提案。它只是执行前的方案整理，不会启动执行。",
      confirmEffect: "记录拆分提案草案；不会创建子需求、后台执行任务、工作副本或启动执行。",
      riskSummary: "拆分提案必须再经过确认和执行边界检查后，才可能进入下一步真实执行。",
      label: action.label,
      actionType: "planning.decompose",
      evidence: evidenceRefs(workpad.planningArtifactBundle?.artifact),
    })];
  }
  if (action.actionType === "code.run" && action.readinessManifestId) {
    return [genericWorkflowQueueItem({
      project,
      selectedTopic,
      id: `confirm:code-run:${selectedTopic.id}:${action.readinessManifestId}`,
      summary: "执行边界已通过，可以运行 Code。",
      whyNeedsConfirmation: "需要你确认启动 coder、validation 和 audit 的现有代码工作流。",
      confirmEffect: "服务端会重新校验当前执行边界后启动现有代码工作流；不会应用、归档、合并或远端落地。",
      riskSummary: "执行产出仍只是候选结果和证据；项目源码只有在后续应用确认后才会修改。",
      label: action.label,
      actionType: "code.run",
      evidence: evidenceRefs(workpad.decompositionReadiness?.artifact),
      readinessManifestId: action.readinessManifestId,
      taskIds: action.taskIds,
    })];
  }
  return [];
}

function genericWorkflowQueueItem(input: {
  project: ManagedProject | null;
  selectedTopic: WorkbenchTopicDetail;
  id: string;
  summary: string;
  whyNeedsConfirmation: string;
  confirmEffect: string;
  riskSummary: string;
  label: string;
  actionType: NonNullable<WorkbenchWorkpad["nextAction"]["actionType"]>;
  evidence: string[];
  readinessManifestId?: string;
  taskIds?: string[];
}): WorkbenchConfirmationQueueItem {
  return {
    id: input.id,
    kind: "planning-confirm",
    projectId: input.project?.id ?? null,
    conversationId: input.selectedTopic.id,
    changeId: input.selectedTopic.id,
    summary: input.summary,
    whyNeedsConfirmation: input.whyNeedsConfirmation,
    confirmEffect: input.confirmEffect,
    riskSummary: input.riskSummary,
    evidenceRefs: input.evidence,
    actions: [{
      id: `workflow:${input.actionType}:${input.selectedTopic.id}${input.readinessManifestId ? `:${input.readinessManifestId}` : ""}`,
      label: input.label,
      kind: "workflow-action",
      changeId: input.selectedTopic.id,
      actionType: input.actionType,
      readinessManifestId: input.readinessManifestId,
      taskIds: input.taskIds,
      enabled: true,
      requiresConfirmation: true,
    }],
    primary: true,
    status: "pending",
  };
}

export function schedulerNextActionToConfirmationItems(
  project: ManagedProject | null,
  selectedTopic: WorkbenchTopicDetail | null,
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  if (!selectedTopic) return [];
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
    ?? action.readinessManifestId
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
    id: `confirm:${action.actionType}:${selectedTopic.id}:${targetId}`,
    kind: "planning-confirm",
    projectId: project?.id ?? null,
    conversationId: selectedTopic.id,
    changeId: selectedTopic.id,
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
      id: `workflow:${action.actionType}:${selectedTopic.id}:${targetId}`,
      label: userCopy.label,
      kind: "workflow-action",
      changeId: selectedTopic.id,
      actionType: action.actionType,
      decompositionPlanId: action.decompositionPlanId,
      readinessManifestId: action.readinessManifestId,
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

export function decompositionPlanToConfirmationItems(
  project: ManagedProject | null,
  selectedTopic: WorkbenchTopicDetail | null,
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  const plan = workpad.decompositionPlan;
  if (!selectedTopic || !plan) return [];
  if (plan.status === "confirmed") {
    const readiness = workpad.decompositionReadiness;
    if (readiness?.decompositionPlanId === plan.id) return [];
    return [{
      id: `confirm:decomposition-readiness:${selectedTopic.id}:${plan.id}`,
      kind: "planning-confirm",
      projectId: project?.id ?? null,
      conversationId: selectedTopic.id,
      changeId: selectedTopic.id,
      summary: `拆分方向已确认：${decompositionRecommendationSummary(plan.recommendation)}。`,
      whyNeedsConfirmation: "需要你确认检查执行边界。检查只记录是否可进入下一步，不会启动执行。",
      confirmEffect: "记录执行边界检查结果；不会创建后台执行任务、子需求、工作副本或启动执行。",
      riskSummary: "执行边界检查只说明下一步是否安全；不能绕过已确认方案、证据和人工确认。",
      evidenceRefs: evidenceRefs(plan.artifact),
      actions: [{
        id: `workflow:planning.decomposition.assess-readiness:${selectedTopic.id}:${plan.id}`,
        label: "检查执行边界",
        kind: "workflow-action",
        changeId: selectedTopic.id,
        actionType: "planning.decomposition.assess-readiness",
        decompositionPlanId: plan.id,
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    }];
  }
  if (plan.status !== "draft") return [];
  return [{
    id: `confirm:decomposition:${selectedTopic.id}:${plan.id}`,
    kind: "planning-confirm",
    projectId: project?.id ?? null,
    conversationId: selectedTopic.id,
    changeId: selectedTopic.id,
    summary: `拆分建议：${decompositionRecommendationSummary(plan.recommendation)}。`,
    whyNeedsConfirmation: "需要你确认这个拆分方向。确认只记录接受该拆分提案，不会启动执行。",
    confirmEffect: "记录拆分方向已确认；不会创建子需求、后台执行任务或启动代码工作流。",
    riskSummary: plan.riskSummary,
    evidenceRefs: evidenceRefs(plan.artifact),
    actions: [{
      id: `workflow:planning.decomposition.confirm:${selectedTopic.id}:${plan.id}`,
      label: "确认拆分方向",
      kind: "workflow-action",
      changeId: selectedTopic.id,
      actionType: "planning.decomposition.confirm",
      decompositionPlanId: plan.id,
      enabled: true,
      requiresConfirmation: true,
    }],
    primary: true,
    status: "pending",
  }];
}

export function taskQueueProposalToConfirmationItems(
  project: ManagedProject | null,
  selectedTopic: WorkbenchTopicDetail | null,
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  if (!selectedTopic) return [];
  const readiness = workpad.decompositionReadiness;
  if (readiness?.status === "ready-for-scheduler-contract" && readiness.nextAllowedAction === "scheduler.contract") {
    const plan = workpad.decompositionPlan;
    if (!plan || plan.id !== readiness.decompositionPlanId) return [];
    const schedulerRun = workpad.schedulerRun;
    const runtimeState = workpad.schedulerRuntime;
    const reconcileSnapshot = workpad.schedulerReconcileSnapshot;
    const claimReservation = workpad.schedulerClaimReservation;
    if (
      schedulerRun?.status === "prepared"
      && runtimeState?.schedulerRunId === schedulerRun.id
      && runtimeState.lastReconcileSnapshotId
      && reconcileSnapshot?.id === runtimeState.lastReconcileSnapshotId
      && runtimeState.lastClaimReservationId
      && runtimeState.lastClaimReservationSnapshotId === reconcileSnapshot.id
      && claimReservation?.id === runtimeState.lastClaimReservationId
      && claimReservation.schedulerRunId === schedulerRun.id
      && claimReservation.schedulerReconcileSnapshotId === reconcileSnapshot.id
    ) {
      if (claimReservation.launchConfirmed) {
        const workerStart = workpad.schedulerWorkerStart;
        const workerResult = workpad.schedulerWorkerResult;
        const workerValidation = workpad.schedulerWorkerValidation;
        const workerAudit = workpad.schedulerWorkerAudit;
        const workerReworkPlan = workpad.schedulerWorkerReworkPlan;
        const workerReworkStart = workpad.schedulerWorkerReworkStart;
        const workerReworkResult = workpad.schedulerWorkerReworkResult;
        const workerReworkValidation = workpad.schedulerWorkerReworkValidation;
        const workerReworkAudit = workpad.schedulerWorkerReworkAudit;
        if (workerStart?.schedulerClaimReservationId === claimReservation.id && workerStart.schedulerRunId === schedulerRun.id) {
          if (workerResult?.schedulerWorkerStartId === workerStart.id) {
            const needsReworkPlan = workerValidation?.status === "failed"
              || (workerValidation?.status === "passed" && (workerAudit?.status === "blocked" || workerAudit?.status === "failed"));
            if (needsReworkPlan && workerValidation && !workerReworkPlan) {
              return [{
                id: `confirm:scheduler-first-worker-rework-plan:${selectedTopic.id}:${workerValidation.id}:${workerAudit?.id ?? "validation"}`,
                kind: "planning-confirm",
                projectId: project?.id ?? null,
                conversationId: selectedTopic.id,
                changeId: selectedTopic.id,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: reconcileSnapshot.id,
                schedulerClaimReservationId: claimReservation.id,
                schedulerWorkerStartId: workerStart.id,
                schedulerWorkerResultId: workerResult.id,
                schedulerWorkerValidationId: workerValidation.id,
                schedulerWorkerAuditId: workerAudit?.id,
                reservationIntentId: workerValidation.reservationIntentId,
                claimIntentId: workerValidation.claimIntentId,
                runId: workerValidation.codeRunId,
                validationRunId: workerValidation.validationRunId,
                auditRunId: workerAudit?.auditRunId,
                worktreeId: workerValidation.worktreeId,
                taskRunId: workerValidation.taskRunId,
                workerLeaseId: workerValidation.workerLeaseId,
                summary: "当前 scheduler worker 需要 rework 计划。",
                whyNeedsConfirmation: "这是 Harness 阶段门：只根据 validation failed 或 audit blocked/failed evidence 生成 bounded rework 计划，不启动 rework。",
                confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、WorkerStart、WorkerResult、WorkerValidation、可选 WorkerAudit、TaskRun、worktree 和 run gate；写 SchedulerRuntimeWorkerReworkPlan evidence。",
                riskSummary: "rework 计划不是执行授权；Phase 9K 不调用 startCodeRun，不创建新 TaskRun/WorkerLease/worktree/run，也不启动下一个 worker。",
                evidenceRefs: evidenceRefs(workerValidation.artifact, workerAudit?.artifact, workerResult.artifact),
                actions: [{
                  id: `workflow:planning.scheduler.worker.rework-plan.compile:${selectedTopic.id}:${workerValidation.id}:${workerAudit?.id ?? "validation"}`,
                  label: "生成当前 worker rework 计划",
                  kind: "workflow-action",
                  changeId: selectedTopic.id,
                  actionType: "planning.scheduler.worker.rework-plan.compile",
                  decompositionPlanId: plan.id,
                  readinessManifestId: readiness.id,
                  schedulerContractId: schedulerRun.schedulerContractId,
                  schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                  schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                  schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                  schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                  schedulerRunId: schedulerRun.id,
                  schedulerReconcileSnapshotId: reconcileSnapshot.id,
                  schedulerClaimReservationId: claimReservation.id,
                  schedulerWorkerStartId: workerStart.id,
                  schedulerWorkerResultId: workerResult.id,
                  schedulerWorkerValidationId: workerValidation.id,
                  schedulerWorkerAuditId: workerAudit?.id,
                  reservationIntentId: workerValidation.reservationIntentId,
                  claimIntentId: workerValidation.claimIntentId,
                  taskRunId: workerValidation.taskRunId,
                  workerLeaseId: workerValidation.workerLeaseId,
                  worktreeId: workerValidation.worktreeId,
                  runId: workerValidation.codeRunId,
                  validationRunId: workerValidation.validationRunId,
                  auditRunId: workerAudit?.auditRunId,
                  enabled: true,
                  requiresConfirmation: true,
                }],
                primary: true,
                status: "pending",
              }];
            }
            if (workerReworkPlan && workerReworkPlan.schedulerWorkerValidationId === workerValidation?.id) {
              const reworkPlan = workerReworkPlan;
              if (workerReworkStart?.schedulerWorkerReworkPlanId === reworkPlan.id) {
                if (workerReworkResult?.schedulerWorkerReworkStartId === workerReworkStart.id) {
                  if (workerReworkValidation?.schedulerWorkerReworkResultId === workerReworkResult.id) {
                    if (workerReworkValidation.status !== "passed" || workerReworkAudit?.schedulerWorkerReworkValidationId === workerReworkValidation.id) return [];
                    return [{
                      id: `confirm:scheduler-first-worker-rework-audit:${selectedTopic.id}:${workerReworkValidation.id}`,
                      kind: "planning-confirm",
                      projectId: project?.id ?? null,
                      conversationId: selectedTopic.id,
                      changeId: selectedTopic.id,
                      schedulerRunId: schedulerRun.id,
                      schedulerReconcileSnapshotId: reconcileSnapshot.id,
                      schedulerClaimReservationId: claimReservation.id,
                      schedulerWorkerStartId: workerReworkValidation.schedulerWorkerStartId,
                      schedulerWorkerResultId: workerReworkValidation.schedulerWorkerResultId,
                      schedulerWorkerValidationId: workerReworkValidation.schedulerWorkerValidationId,
                      schedulerWorkerAuditId: workerReworkValidation.schedulerWorkerAuditId,
                      schedulerWorkerReworkPlanId: workerReworkValidation.schedulerWorkerReworkPlanId,
                      schedulerWorkerReworkStartId: workerReworkValidation.schedulerWorkerReworkStartId,
                      schedulerWorkerReworkResultId: workerReworkValidation.schedulerWorkerReworkResultId,
                      schedulerWorkerReworkValidationId: workerReworkValidation.id,
                      reservationIntentId: workerReworkValidation.reservationIntentId,
                      claimIntentId: workerReworkValidation.claimIntentId,
                      runId: workerReworkValidation.reworkRunId,
                      validationRunId: workerReworkValidation.validationRunId,
                      reworkValidationRunId: workerReworkValidation.validationRunId,
                      worktreeId: workerReworkValidation.worktreeId,
                      taskRunId: workerReworkValidation.reworkTaskRunId,
                      workerLeaseId: workerReworkValidation.reworkWorkerLeaseId,
                      summary: "当前 scheduler worker rework validation 已通过，可以审计同一个 worktree。",
                      whyNeedsConfirmation: "这是 Harness 阶段门：只对 Phase 9L 复用的同一个 worker worktree 运行一次 scoped Audit，不启动 next worker、integration 或 apply。",
                      confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、ReworkPlan、ReworkStart、ReworkResult、ReworkValidation、TaskRun、WorkerLease、worktree、code gate 和 exact validation run；对同一个 worktree 运行 Audit，并写 SchedulerRuntimeWorkerReworkAudit evidence。",
                      riskSummary: "audit approved 才能让 rework TaskRun completed；audit blocked/failed 只阻塞当前 rework path。",
                      evidenceRefs: evidenceRefs(workerReworkValidation.artifact, workerReworkResult.artifact, workerReworkStart.artifact, reworkPlan.artifact),
                      actions: [{
                        id: `workflow:planning.scheduler.worker.rework-audit-first:${selectedTopic.id}:${workerReworkValidation.id}`,
                        label: "审计当前 worker rework 结果",
                        kind: "workflow-action",
                        changeId: selectedTopic.id,
                        actionType: "planning.scheduler.worker.rework-audit-first",
                        decompositionPlanId: plan.id,
                        readinessManifestId: readiness.id,
                        schedulerContractId: schedulerRun.schedulerContractId,
                        schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                        schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                        schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                        schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                        schedulerRunId: schedulerRun.id,
                        schedulerReconcileSnapshotId: reconcileSnapshot.id,
                        schedulerClaimReservationId: workerReworkValidation.schedulerClaimReservationId,
                        schedulerWorkerStartId: workerReworkValidation.schedulerWorkerStartId,
                        schedulerWorkerResultId: workerReworkValidation.schedulerWorkerResultId,
                        schedulerWorkerValidationId: workerReworkValidation.schedulerWorkerValidationId,
                        schedulerWorkerAuditId: workerReworkValidation.schedulerWorkerAuditId,
                        schedulerWorkerReworkPlanId: workerReworkValidation.schedulerWorkerReworkPlanId,
                        schedulerWorkerReworkStartId: workerReworkValidation.schedulerWorkerReworkStartId,
                        schedulerWorkerReworkResultId: workerReworkValidation.schedulerWorkerReworkResultId,
                        schedulerWorkerReworkValidationId: workerReworkValidation.id,
                        reservationIntentId: workerReworkValidation.reservationIntentId,
                        claimIntentId: workerReworkValidation.claimIntentId,
                        taskRunId: workerReworkValidation.reworkTaskRunId,
                        workerLeaseId: workerReworkValidation.reworkWorkerLeaseId,
                        worktreeId: workerReworkValidation.worktreeId,
                        runId: workerReworkValidation.reworkRunId,
                        validationRunId: workerReworkValidation.validationRunId,
                        reworkValidationRunId: workerReworkValidation.validationRunId,
                        enabled: true,
                        requiresConfirmation: true,
                      }],
                      primary: true,
                      status: "pending",
                    }];
                  }
                  if (workerReworkResult.status !== "evidence-ready") return [];
                  return [{
                    id: `confirm:scheduler-first-worker-rework-validation:${selectedTopic.id}:${workerReworkResult.id}`,
                    kind: "planning-confirm",
                    projectId: project?.id ?? null,
                    conversationId: selectedTopic.id,
                    changeId: selectedTopic.id,
                    schedulerRunId: schedulerRun.id,
                    schedulerReconcileSnapshotId: reconcileSnapshot.id,
                    schedulerClaimReservationId: claimReservation.id,
                    schedulerWorkerStartId: workerReworkResult.schedulerWorkerStartId,
                    schedulerWorkerResultId: workerReworkResult.schedulerWorkerResultId,
                    schedulerWorkerValidationId: workerReworkResult.schedulerWorkerValidationId,
                    schedulerWorkerAuditId: workerReworkResult.schedulerWorkerAuditId,
                    schedulerWorkerReworkPlanId: workerReworkResult.schedulerWorkerReworkPlanId,
                    schedulerWorkerReworkStartId: workerReworkResult.schedulerWorkerReworkStartId,
                    schedulerWorkerReworkResultId: workerReworkResult.id,
                    reservationIntentId: workerReworkResult.reservationIntentId,
                    claimIntentId: workerReworkResult.claimIntentId,
                    runId: workerReworkResult.reworkRunId,
                    worktreeId: workerReworkResult.worktreeId,
                    taskRunId: workerReworkResult.reworkTaskRunId,
                    workerLeaseId: workerReworkResult.reworkWorkerLeaseId,
                    summary: "当前 scheduler worker rework 结果已对账，可以验证同一个 worktree。",
                    whyNeedsConfirmation: "这是 Harness 阶段门：只对 Phase 9L 复用的同一个 worker worktree 运行一次 scoped Validation，不启动 audit、next worker 或 whole wave。",
                    confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、ReworkPlan、ReworkStart、ReworkResult、TaskRun、WorkerLease、worktree 和 rework code gate；对同一个 worktree 运行 Validation，并写 SchedulerRuntimeWorkerReworkValidation evidence。",
                    riskSummary: "rework validation passed 仍不是任务完成；rework audit 另开阶段。validation failed 只阻塞当前 rework TaskRun。",
                    evidenceRefs: evidenceRefs(workerReworkResult.artifact, workerReworkStart.artifact, reworkPlan.artifact),
                    actions: [{
                      id: `workflow:planning.scheduler.worker.rework-validate-first:${selectedTopic.id}:${workerReworkResult.id}`,
                      label: "验证当前 worker rework 结果",
                      kind: "workflow-action",
                      changeId: selectedTopic.id,
                      actionType: "planning.scheduler.worker.rework-validate-first",
                      decompositionPlanId: plan.id,
                      readinessManifestId: readiness.id,
                      schedulerContractId: schedulerRun.schedulerContractId,
                      schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                      schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                      schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                      schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                      schedulerRunId: schedulerRun.id,
                      schedulerReconcileSnapshotId: reconcileSnapshot.id,
                      schedulerClaimReservationId: workerReworkResult.schedulerClaimReservationId,
                      schedulerWorkerStartId: workerReworkResult.schedulerWorkerStartId,
                      schedulerWorkerResultId: workerReworkResult.schedulerWorkerResultId,
                      schedulerWorkerValidationId: workerReworkResult.schedulerWorkerValidationId,
                      schedulerWorkerAuditId: workerReworkResult.schedulerWorkerAuditId,
                      schedulerWorkerReworkPlanId: workerReworkResult.schedulerWorkerReworkPlanId,
                      schedulerWorkerReworkStartId: workerReworkResult.schedulerWorkerReworkStartId,
                      schedulerWorkerReworkResultId: workerReworkResult.id,
                      reservationIntentId: workerReworkResult.reservationIntentId,
                      claimIntentId: workerReworkResult.claimIntentId,
                      taskRunId: workerReworkResult.reworkTaskRunId,
                      workerLeaseId: workerReworkResult.reworkWorkerLeaseId,
                      worktreeId: workerReworkResult.worktreeId,
                      runId: workerReworkResult.reworkRunId,
                      enabled: true,
                      requiresConfirmation: true,
                    }],
                    primary: true,
                    status: "pending",
                  }];
                }
                return [{
                  id: `confirm:scheduler-first-worker-rework-result:${selectedTopic.id}:${workerReworkStart.id}`,
                  kind: "planning-confirm",
                  projectId: project?.id ?? null,
                  conversationId: selectedTopic.id,
                  changeId: selectedTopic.id,
                  schedulerRunId: schedulerRun.id,
                  schedulerReconcileSnapshotId: reconcileSnapshot.id,
                  schedulerClaimReservationId: claimReservation.id,
                  schedulerWorkerStartId: workerReworkStart.schedulerWorkerStartId,
                  schedulerWorkerResultId: workerReworkStart.schedulerWorkerResultId,
                  schedulerWorkerValidationId: workerReworkStart.schedulerWorkerValidationId,
                  schedulerWorkerAuditId: workerReworkStart.schedulerWorkerAuditId,
                  schedulerWorkerReworkPlanId: workerReworkStart.schedulerWorkerReworkPlanId,
                  schedulerWorkerReworkStartId: workerReworkStart.id,
                  reservationIntentId: workerReworkStart.reservationIntentId,
                  claimIntentId: workerReworkStart.claimIntentId,
                  runId: workerReworkStart.reworkRunId,
                  worktreeId: workerReworkStart.worktreeId,
                  taskRunId: workerReworkStart.reworkTaskRunId,
                  workerLeaseId: workerReworkStart.reworkWorkerLeaseId,
                  summary: "当前 scheduler worker rework 已启动，可以检查结果。",
                  whyNeedsConfirmation: "这是 Harness 阶段门：只读取 rework TaskRun、WorkerLease、worktree 和 code run evidence，并写 scheduler-owned rework result。",
                  confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、ReworkPlan、ReworkStart、TaskRun、WorkerLease、worktree 和 rework code gate；完成时写 SchedulerRuntimeWorkerReworkResult 并释放 rework WorkerLease。",
                  riskSummary: "rework result 不是完成信号；validation/audit、next worker、whole wave、integration/apply 都是后续阶段。",
                  evidenceRefs: evidenceRefs(workerReworkStart.artifact, reworkPlan.artifact, workerValidation?.artifact, workerAudit?.artifact, workerResult.artifact),
                  actions: [{
                    id: `workflow:planning.scheduler.worker.rework-reconcile-result:${selectedTopic.id}:${workerReworkStart.id}`,
                    label: "检查当前 worker rework 结果",
                    kind: "workflow-action",
                    changeId: selectedTopic.id,
                    actionType: "planning.scheduler.worker.rework-reconcile-result",
                    decompositionPlanId: plan.id,
                    readinessManifestId: readiness.id,
                    schedulerContractId: schedulerRun.schedulerContractId,
                    schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                    schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                    schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                    schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                    schedulerRunId: schedulerRun.id,
                    schedulerReconcileSnapshotId: reconcileSnapshot.id,
                    schedulerClaimReservationId: workerReworkStart.schedulerClaimReservationId,
                    schedulerWorkerStartId: workerReworkStart.schedulerWorkerStartId,
                    schedulerWorkerResultId: workerReworkStart.schedulerWorkerResultId,
                    schedulerWorkerValidationId: workerReworkStart.schedulerWorkerValidationId,
                    schedulerWorkerAuditId: workerReworkStart.schedulerWorkerAuditId,
                    schedulerWorkerReworkPlanId: workerReworkStart.schedulerWorkerReworkPlanId,
                    schedulerWorkerReworkStartId: workerReworkStart.id,
                    reservationIntentId: workerReworkStart.reservationIntentId,
                    claimIntentId: workerReworkStart.claimIntentId,
                    taskRunId: workerReworkStart.reworkTaskRunId,
                    workerLeaseId: workerReworkStart.reworkWorkerLeaseId,
                    worktreeId: workerReworkStart.worktreeId,
                    runId: workerReworkStart.reworkRunId,
                    enabled: true,
                    requiresConfirmation: true,
                  }],
                  primary: true,
                  status: "pending",
                }];
              }
              return [{
                id: `confirm:scheduler-first-worker-rework-start:${selectedTopic.id}:${reworkPlan.id}`,
                kind: "planning-confirm",
                projectId: project?.id ?? null,
                conversationId: selectedTopic.id,
                changeId: selectedTopic.id,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: reconcileSnapshot.id,
                schedulerClaimReservationId: claimReservation.id,
                schedulerWorkerStartId: reworkPlan.schedulerWorkerStartId,
                schedulerWorkerResultId: reworkPlan.schedulerWorkerResultId,
                schedulerWorkerValidationId: reworkPlan.schedulerWorkerValidationId,
                schedulerWorkerAuditId: reworkPlan.schedulerWorkerAuditId,
                schedulerWorkerReworkPlanId: reworkPlan.id,
                reservationIntentId: reworkPlan.reservationIntentId,
                claimIntentId: reworkPlan.claimIntentId,
                runId: reworkPlan.targetCodeRunId,
                validationRunId: reworkPlan.validationRunId,
                auditRunId: reworkPlan.auditRunId,
                worktreeId: reworkPlan.targetWorktreeId,
                taskRunId: reworkPlan.taskRunId,
                workerLeaseId: reworkPlan.workerLeaseId,
                summary: "当前 scheduler worker rework 计划已准备好。",
                whyNeedsConfirmation: "这是 Harness 阶段门：只在原 worker worktree 上启动一次 scoped rework-coder，不启动下一个 worker 或 scheduler loop。",
                confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、WorkerReworkPlan、TaskRun、worktree 和 code gate；创建一个 rework TaskRun、WorkerLease、code run 与 Runtime Continuity sidecars。",
                riskSummary: "rework 复用原 worktree，不创建新 worktree；rework 结果对账、validation、audit、integration/apply 都是后续阶段。",
                evidenceRefs: evidenceRefs(reworkPlan.artifact, workerValidation?.artifact, workerAudit?.artifact, workerResult.artifact),
                actions: [{
                  id: `workflow:planning.scheduler.worker.rework-start-first:${selectedTopic.id}:${reworkPlan.id}`,
                  label: "启动当前 worker rework",
                  kind: "workflow-action",
                  changeId: selectedTopic.id,
                  actionType: "planning.scheduler.worker.rework-start-first",
                  decompositionPlanId: plan.id,
                  readinessManifestId: readiness.id,
                  schedulerContractId: schedulerRun.schedulerContractId,
                  schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                  schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                  schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                  schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                  schedulerRunId: schedulerRun.id,
                  schedulerReconcileSnapshotId: reconcileSnapshot.id,
                  schedulerClaimReservationId: claimReservation.id,
                  schedulerWorkerStartId: reworkPlan.schedulerWorkerStartId,
                  schedulerWorkerResultId: reworkPlan.schedulerWorkerResultId,
                  schedulerWorkerValidationId: reworkPlan.schedulerWorkerValidationId,
                  schedulerWorkerAuditId: reworkPlan.schedulerWorkerAuditId,
                  schedulerWorkerReworkPlanId: reworkPlan.id,
                  reservationIntentId: reworkPlan.reservationIntentId,
                  claimIntentId: reworkPlan.claimIntentId,
                  taskRunId: reworkPlan.taskRunId,
                  workerLeaseId: reworkPlan.workerLeaseId,
                  worktreeId: reworkPlan.targetWorktreeId,
                  runId: reworkPlan.targetCodeRunId,
                  validationRunId: reworkPlan.validationRunId,
                  auditRunId: reworkPlan.auditRunId,
                  enabled: true,
                  requiresConfirmation: true,
                }],
                primary: true,
                status: "pending",
              }];
            }
            if (workerValidation?.status === "passed" && workerValidation.schedulerWorkerResultId === workerResult.id && !workerAudit) {
              return [{
                id: `confirm:scheduler-first-worker-audit:${selectedTopic.id}:${workerValidation.id}`,
                kind: "planning-confirm",
                projectId: project?.id ?? null,
                conversationId: selectedTopic.id,
                changeId: selectedTopic.id,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: reconcileSnapshot.id,
                schedulerClaimReservationId: claimReservation.id,
                schedulerWorkerStartId: workerStart.id,
                schedulerWorkerResultId: workerResult.id,
                schedulerWorkerValidationId: workerValidation.id,
                reservationIntentId: workerValidation.reservationIntentId,
                claimIntentId: workerValidation.claimIntentId,
                runId: workerValidation.codeRunId,
                validationRunId: workerValidation.validationRunId,
                worktreeId: workerValidation.worktreeId,
                taskRunId: workerValidation.taskRunId,
                workerLeaseId: workerValidation.workerLeaseId,
                summary: "当前 scheduler worker validation 已通过。可以审计同一个 worktree。",
                whyNeedsConfirmation: "这是 Harness 阶段门：只对当前 scheduler worker 验证通过的 worktree 运行一次 scoped Audit，不启动 rework、下一个 worker 或 whole wave。",
                confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、WorkerStart、WorkerResult、WorkerValidation、TaskRun、code run、validation run 和 worktree；对同一个 worktree 运行 Audit，并写 SchedulerRuntimeWorkerAudit evidence。",
                riskSummary: "audit approved 才能把该 TaskRun 标记 completed；audit blocked/failed 只阻塞当前 worker path，不自动 rework。",
                evidenceRefs: evidenceRefs(workerValidation.artifact, workerResult.artifact),
                actions: [{
                  id: `workflow:planning.scheduler.worker.audit-first:${selectedTopic.id}:${workerValidation.id}`,
                  label: "审计当前 worker 结果",
                  kind: "workflow-action",
                  changeId: selectedTopic.id,
                  actionType: "planning.scheduler.worker.audit-first",
                  decompositionPlanId: plan.id,
                  readinessManifestId: readiness.id,
                  schedulerContractId: schedulerRun.schedulerContractId,
                  schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                  schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                  schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                  schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                  schedulerRunId: schedulerRun.id,
                  schedulerReconcileSnapshotId: reconcileSnapshot.id,
                  schedulerClaimReservationId: claimReservation.id,
                  schedulerWorkerStartId: workerStart.id,
                  schedulerWorkerResultId: workerResult.id,
                  schedulerWorkerValidationId: workerValidation.id,
                  reservationIntentId: workerValidation.reservationIntentId,
                  claimIntentId: workerValidation.claimIntentId,
                  taskRunId: workerValidation.taskRunId,
                  workerLeaseId: workerValidation.workerLeaseId,
                  worktreeId: workerValidation.worktreeId,
                  runId: workerValidation.codeRunId,
                  validationRunId: workerValidation.validationRunId,
                  enabled: true,
                  requiresConfirmation: true,
                }],
                primary: true,
                status: "pending",
              }];
            }
            if (workerResult.status !== "evidence-ready" || workerValidation?.schedulerWorkerResultId === workerResult.id) return [];
            return [{
              id: `confirm:scheduler-first-worker-validation:${selectedTopic.id}:${workerResult.id}`,
              kind: "planning-confirm",
              projectId: project?.id ?? null,
              conversationId: selectedTopic.id,
              changeId: selectedTopic.id,
              schedulerRunId: schedulerRun.id,
              schedulerReconcileSnapshotId: reconcileSnapshot.id,
              schedulerClaimReservationId: claimReservation.id,
              schedulerWorkerStartId: workerStart.id,
              schedulerWorkerResultId: workerResult.id,
              reservationIntentId: workerResult.reservationIntentId,
              claimIntentId: workerResult.claimIntentId,
              runId: workerResult.runId,
              worktreeId: workerResult.worktreeId,
              taskRunId: workerResult.taskRunId,
              workerLeaseId: workerResult.workerLeaseId,
              summary: "当前 scheduler coder worker result 已就绪。可以验证它的 worktree。",
              whyNeedsConfirmation: "这是 Harness 阶段门：只对当前 scheduler worker 的 worktree 运行一次 scoped Validation，不启动 audit、rework 或下一个 worker。",
              confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、WorkerResult、TaskRun、code run 和 worktree；对同一个 worktree 运行 Validation，并写 SchedulerRuntimeWorkerValidation evidence。",
              riskSummary: "验证通过仍不是任务完成；audit 才能在后续阶段决定完成。验证失败只阻塞当前 scheduler worker path，不自动 rework。",
              evidenceRefs: evidenceRefs(workerResult.artifact),
              actions: [{
                id: `workflow:planning.scheduler.worker.validate-first:${selectedTopic.id}:${workerResult.id}`,
                label: "验证当前 worker 结果",
                kind: "workflow-action",
                changeId: selectedTopic.id,
                actionType: "planning.scheduler.worker.validate-first",
                decompositionPlanId: plan.id,
                readinessManifestId: readiness.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: reconcileSnapshot.id,
                schedulerClaimReservationId: claimReservation.id,
                schedulerWorkerStartId: workerStart.id,
                schedulerWorkerResultId: workerResult.id,
                reservationIntentId: workerResult.reservationIntentId,
                claimIntentId: workerResult.claimIntentId,
                taskRunId: workerResult.taskRunId,
                workerLeaseId: workerResult.workerLeaseId,
                worktreeId: workerResult.worktreeId,
                runId: workerResult.runId,
                enabled: true,
                requiresConfirmation: true,
              }],
              primary: true,
              status: "pending",
            }];
          }
          return [{
            id: `confirm:scheduler-first-worker-result:${selectedTopic.id}:${workerStart.id}`,
            kind: "planning-confirm",
            projectId: project?.id ?? null,
            conversationId: selectedTopic.id,
            changeId: selectedTopic.id,
            schedulerRunId: schedulerRun.id,
            schedulerReconcileSnapshotId: reconcileSnapshot.id,
            schedulerClaimReservationId: claimReservation.id,
            schedulerWorkerStartId: workerStart.id,
            reservationIntentId: workerStart.reservationIntentId,
            claimIntentId: workerStart.claimIntentId,
            runId: workerStart.runId,
            worktreeId: workerStart.worktreeId,
            summary: "当前 scheduler coder worker 已启动。可以检查它的 code run / TaskRun / WorkerLease 结果。",
            whyNeedsConfirmation: "这是 Harness 阶段门：只对当前 worker 做结果对账，不启动 validation、audit、rework 或下一个 worker。",
            confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、WorkerStart、TaskRun、WorkerLease、worktree 和 code run；若 code run terminal，则写 SchedulerRuntimeWorkerResult 并释放 WorkerLease；若仍 running，则只返回 running 摘要。",
            riskSummary: "对账不会启动任何新的 worker 或验证阶段；后续 validation/audit/rework 仍需另开阶段并重新经过 scoped evidence、ToolPolicyGate 和 human gate。",
            evidenceRefs: evidenceRefs(workerStart.artifact),
            actions: [{
              id: `workflow:planning.scheduler.worker.reconcile-result:${selectedTopic.id}:${workerStart.id}`,
              label: "检查当前 worker 结果",
              kind: "workflow-action",
              changeId: selectedTopic.id,
              actionType: "planning.scheduler.worker.reconcile-result",
              decompositionPlanId: plan.id,
              readinessManifestId: readiness.id,
              schedulerContractId: schedulerRun.schedulerContractId,
              schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
              schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
              schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
              schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
              schedulerRunId: schedulerRun.id,
              schedulerReconcileSnapshotId: reconcileSnapshot.id,
              schedulerClaimReservationId: claimReservation.id,
              schedulerWorkerStartId: workerStart.id,
              reservationIntentId: workerStart.reservationIntentId,
              claimIntentId: workerStart.claimIntentId,
              taskRunId: workerStart.taskRunId,
              workerLeaseId: workerStart.workerLeaseId,
              worktreeId: workerStart.worktreeId,
              runId: workerStart.runId,
              enabled: true,
              requiresConfirmation: true,
            }],
            primary: true,
            status: "pending",
          }];
        }
        return [{
          id: `confirm:scheduler-first-worker:${selectedTopic.id}:${claimReservation.id}`,
          kind: "planning-confirm",
          projectId: project?.id ?? null,
          conversationId: selectedTopic.id,
          changeId: selectedTopic.id,
          summary: "并行执行计划启动意图已确认。可以先启动第一个 scheduler coder worker。",
          whyNeedsConfirmation: "这是 Harness 阶段门：只允许从 latest claim reservation 启动一个 coder-stage worker，不启动整 wave。",
          confirmEffect: "重读 latest SchedulerRun、RuntimeState、ReconcileSnapshot、ClaimReservation，创建 exactly one TaskRun、WorkerLease、worktree、code run 和 Runtime Continuity sidecar；不会启动 validation、audit、rework、scheduler loop、TaskQueueRun、WorkflowRun、AgentTask 或 child Change。",
          riskSummary: "后续 validation/audit/rework、wave dispatch、slot allocator 和完整 parallel executor 必须另开阶段并重新经过 scoped evidence、ToolPolicyGate 和 human gate。",
          evidenceRefs: evidenceRefs(claimReservation.artifact),
          actions: [{
            id: `workflow:planning.scheduler.worker.start-first:${selectedTopic.id}:${claimReservation.id}`,
            label: "启动第一个 worker",
            kind: "workflow-action",
            changeId: selectedTopic.id,
            actionType: "planning.scheduler.worker.start-first",
            decompositionPlanId: plan.id,
            readinessManifestId: readiness.id,
            schedulerContractId: schedulerRun.schedulerContractId,
            schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
            schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
            schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
            schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
            schedulerRunId: schedulerRun.id,
            schedulerReconcileSnapshotId: reconcileSnapshot.id,
            schedulerClaimReservationId: claimReservation.id,
            enabled: true,
            requiresConfirmation: true,
          }],
          primary: true,
          status: "pending",
        }];
      }
      return [{
        id: `confirm:scheduler-launch-intent:${selectedTopic.id}:${claimReservation.id}`,
        kind: "planning-confirm",
        projectId: project?.id ?? null,
        conversationId: selectedTopic.id,
        changeId: selectedTopic.id,
        summary: "并行执行计划已准备好。主 Agent 可以在对话里解释计划，并记录你的整体启动意图。",
        whyNeedsConfirmation: "需要你确认是否认可这个并行执行计划的启动方向；这不是工具权限弹窗，也不是实际启动 worker。",
        confirmEffect: "重读 latest SchedulerRun、RuntimeState、ReconcileSnapshot、ClaimReservation，生成主对话可读 launch brief 并记录 decision/audit scope；不会创建 worker、TaskRun、WorkerLease、WorkerSession、RuntimeWorkspace、EventSource、worktree、run 或 child Change。",
        riskSummary: "真正 parallel executor 必须另开阶段，并重新经过 scoped evidence、ToolPolicyGate 和 human gate。你也可以先要求主 Agent 修改计划后再确认。",
        evidenceRefs: evidenceRefs(claimReservation.artifact),
        actions: [{
          id: `workflow:planning.scheduler.plan.prepare:${selectedTopic.id}:${claimReservation.id}:launch-confirmation`,
          label: "确认启动这个并行执行计划",
          kind: "workflow-action",
          changeId: selectedTopic.id,
          actionType: "planning.scheduler.plan.prepare",
          decompositionPlanId: plan.id,
          readinessManifestId: readiness.id,
          schedulerContractId: schedulerRun.schedulerContractId,
          schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
          schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
          schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
          schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
          schedulerRunId: schedulerRun.id,
          schedulerReconcileSnapshotId: reconcileSnapshot.id,
          schedulerClaimReservationId: claimReservation.id,
          enabled: true,
          requiresConfirmation: true,
        }],
        primary: true,
        status: "pending",
      }];
    }
    return [{
      id: `confirm:scheduler-plan-prepare:${selectedTopic.id}:${readiness.id}`,
      kind: "planning-confirm",
      projectId: project?.id ?? null,
      conversationId: selectedTopic.id,
      changeId: selectedTopic.id,
      summary: "执行边界已通过：主 Agent 可以准备一个完整的并行执行计划。",
      whyNeedsConfirmation: "需要你确认让主 Agent 补齐内部 scheduler evidence。普通用户不需要逐个确认 SchedulerContract、dry-run、worker plan、runtime shell 或 claim reservation。",
      confirmEffect: "按顺序写入或校验 scheduler pre-executor evidence，并在主对话生成可读 launch brief；不会创建 worker、TaskRun、WorkerLease、WorkerSession、RuntimeWorkspace、EventSource、worktree、run 或 child Change。",
      riskSummary: "准备计划不是执行授权；真正 parallel executor 后续仍必须重新读取 scoped evidence、执行 ToolPolicyGate，并再次经过 human gate。",
      evidenceRefs: evidenceRefs(readiness.artifact),
      actions: [{
        id: `workflow:planning.scheduler.plan.prepare:${selectedTopic.id}:${readiness.id}`,
        label: "准备并行执行计划",
        kind: "workflow-action",
        changeId: selectedTopic.id,
        actionType: "planning.scheduler.plan.prepare",
        decompositionPlanId: plan.id,
        readinessManifestId: readiness.id,
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: true,
      status: "pending",
    }];
  }
  if (!readiness || readiness.status !== "ready-for-sequential-taskqueue-proposal" || readiness.nextAllowedAction !== "taskqueue.proposal") return [];
  const proposal = workpad.taskQueueProposal;
  if (!proposal || proposal.readinessManifestId !== readiness.id || proposal.status === "superseded" || proposal.status === "rejected") {
    return [{
      id: `confirm:taskqueue-propose:${selectedTopic.id}:${readiness.id}`,
      kind: "planning-confirm",
      projectId: project?.id ?? null,
      conversationId: selectedTopic.id,
      changeId: selectedTopic.id,
      summary: "执行边界已通过：可生成顺序 TaskQueue 提案。",
      whyNeedsConfirmation: "需要你确认生成 TaskQueueProposal。生成 proposal 不会启动执行。",
      confirmEffect: "写入 taskqueue-proposal.json/.md；不会创建 TaskQueue、TaskRun、AgentTask、worktree 或 run。",
      riskSummary: "TaskQueueProposal 是执行前 typed artifact，不是 workflow truth。",
      evidenceRefs: evidenceRefs(readiness.artifact),
      actions: [{
        id: `workflow:planning.taskqueue.propose:${selectedTopic.id}:${readiness.id}`,
        label: "生成 TaskQueue 提案",
        kind: "workflow-action",
        changeId: selectedTopic.id,
        actionType: "planning.taskqueue.propose",
        readinessManifestId: readiness.id,
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: false,
      status: "pending",
    }];
  }
  const graph = workpad.workflowGraphPlan;
  if (!graph || graph.taskQueueProposalId !== proposal.id || graph.readinessManifestId !== readiness.id) {
    return [{
      id: `confirm:workflowgraph-compile:${selectedTopic.id}:${proposal.id}`,
      kind: "planning-confirm",
      projectId: project?.id ?? null,
      conversationId: selectedTopic.id,
      changeId: selectedTopic.id,
      summary: `TaskQueue 提案包含 ${proposal.itemCount} 个顺序任务，可编译执行图。`,
      whyNeedsConfirmation: "需要你确认编译 versioned WorkflowGraphPlan。编译不会启动执行。",
      confirmEffect: "写入 workflow-graphs 下的 versioned graph artifact；不会创建 TaskQueue、TaskRun、AgentTask、worktree 或 run。",
      riskSummary: "过期、伪造或已 superseded 的 proposal/readiness 会被拒绝。",
      evidenceRefs: evidenceRefs(proposal.artifact),
      actions: [{
        id: `workflow:planning.workflowgraph.compile:${selectedTopic.id}:${proposal.id}`,
        label: "编译执行图",
        kind: "workflow-action",
        changeId: selectedTopic.id,
        actionType: "planning.workflowgraph.compile",
        taskQueueProposalId: proposal.id,
        readinessManifestId: readiness.id,
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: false,
      status: "pending",
    }];
  }
  if (workpad.workflowRun?.workflowGraphPlanId === graph.id) return [];
  return [{
    id: `confirm:taskqueue-start:${selectedTopic.id}:${graph.id}`,
    kind: "planning-confirm",
    projectId: project?.id ?? null,
    conversationId: selectedTopic.id,
    changeId: selectedTopic.id,
    summary: `执行图 ${graph.id} 包含 ${graph.nodeCount} 个顺序任务节点。`,
    whyNeedsConfirmation: "需要你确认启动这个 latest WorkflowGraphPlan。",
    confirmEffect: "重新读取 graph/proposal/readiness 后创建 TaskQueue/TaskRun 记录并开始顺序执行。",
    riskSummary: "过期、伪造或已 superseded 的 graph/proposal/readiness 会被拒绝。",
    evidenceRefs: evidenceRefs(graph.artifact),
    actions: [{
      id: `workflow:planning.taskqueue.confirm-start:${selectedTopic.id}:${graph.id}`,
      label: "确认启动 TaskQueue",
      kind: "workflow-action",
      changeId: selectedTopic.id,
      actionType: "planning.taskqueue.confirm-start",
      taskQueueProposalId: proposal.id,
      workflowGraphPlanId: graph.id,
      readinessManifestId: readiness.id,
      decompositionPlanId: proposal.decompositionPlanId,
      enabled: true,
      requiresConfirmation: true,
    }],
    primary: false,
    status: "pending",
  }];
}

export function decompositionRecommendationSummary(recommendation: DecompositionRecommendation): string {
  switch (recommendation) {
    case "single-change": return "保持单 Change";
    case "taskgraph-sequential": return "TaskGraph 顺序候选";
    case "taskgraph-parallel-candidate": return "TaskGraph 并行候选";
    case "multi-change-candidate": return "多 Change 候选";
    case "needs-clarification": return "先澄清";
  }
}
