import type { ManagedProject } from "../../../../types/index.js";
import type { DecompositionRecommendation } from "../../../../workflow-artifacts/manager.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../../read-model-types.js";

export function workpadNextActionToConfirmationItems(
  project: ManagedProject | null,
  selectedTopic: WorkbenchTopicDetail | null,
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  const action = workpad.nextAction;
  if (!selectedTopic) return [];
  const planningBundleId = workpad.planningArtifactBundle?.status === "draft" ? workpad.planningArtifactBundle.id : undefined;
  if (!planningBundleId) return [];
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
    riskSummary: "确认规划不是执行授权；后续执行仍必须经过 DecompositionPlan、readiness、TaskQueueProposal/WorkflowGraphPlan 或 single-change code gate。",
    evidenceRefs: workpad.planningArtifactBundle?.artifact ? [workpad.planningArtifactBundle.artifact] : [],
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
  const targetId = action.schedulerWorkerReworkPlanId
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
  const workerResult = workpad.schedulerWorkerResult;
  const workerStart = workpad.schedulerWorkerStart;
  const runId = workerAudit?.auditRunId
    ?? workerValidation?.codeRunId
    ?? workerResult?.runId
    ?? workerStart?.runId;
  const taskRunId = action.taskRunId
    ?? workerAudit?.taskRunId
    ?? workerValidation?.taskRunId
    ?? workerResult?.taskRunId
    ?? workerStart?.taskRunId;
  const workerLeaseId = workerAudit?.workerLeaseId
    ?? workerValidation?.workerLeaseId
    ?? workerResult?.workerLeaseId
    ?? workerStart?.workerLeaseId;
  const worktreeId = action.worktreeId
    ?? workerAudit?.worktreeId
    ?? workerValidation?.worktreeId
    ?? workerResult?.worktreeId
    ?? workerStart?.worktreeId;
  const validationRunId = action.validationRunId ?? workerAudit?.validationRunId ?? workerValidation?.validationRunId;
  const auditRunId = action.auditRunId ?? workerAudit?.auditRunId;
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
    reservationIntentId: action.reservationIntentId,
    claimIntentId: action.claimIntentId,
    taskRunId,
    workerLeaseId,
    validationRunId,
    auditRunId,
    summary: action.label,
    whyNeedsConfirmation: "这是 Harness 阶段门：主 Agent 已给出下一步建议，确认后只执行该 scoped scheduler action。",
    confirmEffect: action.description,
    riskSummary: "服务端会重读 scoped evidence、执行 stale-target revalidation，并保留完整 decision/audit scope。",
    evidenceRefs: [],
    actions: [{
      id: `workflow:${action.actionType}:${selectedTopic.id}:${targetId}`,
      label: action.label,
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
      reservationIntentId: action.reservationIntentId,
      claimIntentId: action.claimIntentId,
      taskRunId,
      workerLeaseId,
      worktreeId,
      runId,
      validationRunId,
      auditRunId,
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
      whyNeedsConfirmation: "需要你确认检查执行边界。检查只写 readiness manifest，不会启动执行。",
      confirmEffect: "生成 DecompositionReadinessManifest；不会创建 TaskQueue、TaskRun、AgentTask、子 Change、worktree 或 run。",
      riskSummary: "Manifest 只说明后续执行层是否可安全消费该拆分提案；不能绕过 Harness workflow truth。",
      evidenceRefs: plan.artifact ? [plan.artifact] : [],
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
      primary: false,
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
    whyNeedsConfirmation: "需要你确认这个拆分方向。确认只记录 proposal 接受，不会启动执行。",
    confirmEffect: "记录 DecompositionPlan 已确认；不会创建子 Change、TaskRun、AgentTask 或启动 Code。",
    riskSummary: plan.riskSummary,
    evidenceRefs: plan.artifact ? [plan.artifact] : [],
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
    primary: false,
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
                summary: "第一个 scheduler worker 需要 rework 计划。",
                whyNeedsConfirmation: "这是 Harness 阶段门：只根据 validation failed 或 audit blocked/failed evidence 生成 bounded rework 计划，不启动 rework。",
                confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、WorkerStart、WorkerResult、WorkerValidation、可选 WorkerAudit、TaskRun、worktree 和 run gate；写 SchedulerRuntimeWorkerReworkPlan evidence。",
                riskSummary: "rework 计划不是执行授权；Phase 9K 不调用 startCodeRun，不创建新 TaskRun/WorkerLease/worktree/run，也不启动下一个 worker。",
                evidenceRefs: [workerValidation.artifact, workerAudit?.artifact, workerResult.artifact].filter((item): item is string => Boolean(item)),
                actions: [{
                  id: `workflow:planning.scheduler.worker.rework-plan.compile:${selectedTopic.id}:${workerValidation.id}:${workerAudit?.id ?? "validation"}`,
                  label: "生成第一个 worker rework 计划",
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
            if (workerReworkPlan?.schedulerWorkerValidationId === workerValidation?.id) return [];
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
                summary: "第一个 scheduler worker validation 已通过。可以审计同一个 worktree。",
                whyNeedsConfirmation: "这是 Harness 阶段门：只对 Phase 9G 创建且 Phase 9I 验证通过的第一个 worker worktree 运行一次 scoped Audit，不启动 rework、下一个 worker 或 whole wave。",
                confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、WorkerStart、WorkerResult、WorkerValidation、TaskRun、code run、validation run 和 worktree；对同一个 worktree 运行 Audit，并写 SchedulerRuntimeWorkerAudit evidence。",
                riskSummary: "audit approved 才能把该 TaskRun 标记 completed；audit blocked/failed 只阻塞当前 worker path，不自动 rework。",
                evidenceRefs: [workerValidation.artifact, workerResult.artifact].filter((item): item is string => Boolean(item)),
                actions: [{
                  id: `workflow:planning.scheduler.worker.audit-first:${selectedTopic.id}:${workerValidation.id}`,
                  label: "审计第一个 worker 结果",
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
              summary: "第一个 scheduler coder worker result 已就绪。可以验证它的 worktree。",
              whyNeedsConfirmation: "这是 Harness 阶段门：只对 Phase 9G 创建的第一个 worker worktree 运行一次 scoped Validation，不启动 audit、rework 或下一个 worker。",
              confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、WorkerResult、TaskRun、code run 和 worktree；对同一个 worktree 运行 Validation，并写 SchedulerRuntimeWorkerValidation evidence。",
              riskSummary: "验证通过仍不是任务完成；audit 才能在后续阶段决定完成。验证失败只阻塞当前 scheduler worker path，不自动 rework。",
              evidenceRefs: workerResult.artifact ? [workerResult.artifact] : [],
              actions: [{
                id: `workflow:planning.scheduler.worker.validate-first:${selectedTopic.id}:${workerResult.id}`,
                label: "验证第一个 worker 结果",
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
            summary: "第一个 scheduler coder worker 已启动。可以检查它的 code run / TaskRun / WorkerLease 结果。",
            whyNeedsConfirmation: "这是 Harness 阶段门：只对 9G 启动的第一个 worker 做结果对账，不启动 validation、audit、rework 或下一个 worker。",
            confirmEffect: "重读 latest SchedulerRun、RuntimeState、ClaimReservation、WorkerStart、TaskRun、WorkerLease、worktree 和 code run；若 code run terminal，则写 SchedulerRuntimeWorkerResult 并释放 WorkerLease；若仍 running，则只返回 running 摘要。",
            riskSummary: "对账不会启动任何新的 worker 或验证阶段；后续 validation/audit/rework 仍需另开阶段并重新经过 scoped evidence、ToolPolicyGate 和 human gate。",
            evidenceRefs: workerStart.artifact ? [workerStart.artifact] : [],
            actions: [{
              id: `workflow:planning.scheduler.worker.reconcile-result:${selectedTopic.id}:${workerStart.id}`,
              label: "检查第一个 worker 结果",
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
          evidenceRefs: claimReservation.artifact ? [claimReservation.artifact] : [],
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
        evidenceRefs: claimReservation.artifact ? [claimReservation.artifact] : [],
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
      evidenceRefs: readiness.artifact ? [readiness.artifact] : [],
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
      evidenceRefs: readiness.artifact ? [readiness.artifact] : [],
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
      evidenceRefs: proposal.artifact ? [proposal.artifact] : [],
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
    evidenceRefs: graph.artifact ? [graph.artifact] : [],
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
