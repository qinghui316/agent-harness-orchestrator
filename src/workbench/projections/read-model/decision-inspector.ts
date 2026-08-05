import type { AuditSummary, ValidationSummary } from "../../../types/index.js";
import { latestByTimestamp, sortByTimestampDesc } from "./projection-summary.js";
import { evidenceActions } from "./evidence-actions.js";
import { mainAgentExecutionForWorkpad } from "./main-agent-execution.js";
import type {
  WorkbenchApprovalAction,
  WorkbenchApprovalItem,
  WorkbenchApprovalKind,
  WorkbenchConfirmationQueueItem,
  WorkbenchDecisionAction,
  WorkbenchDecisionContext,
  WorkbenchDecisionContextKind,
  WorkbenchDecisionInspector,
  WorkbenchDecisionItem,
  WorkbenchResultReview,
  WorkbenchReworkPrompt,
  WorkbenchTaskNode,
  WorkbenchTaskQueueSummary,
  WorkbenchTopicDetail,
  WorkbenchUserDecisionState,
  WorkbenchWorkpad,
} from "../../read-model-types.js";

function approvalAction(actionId: string, label: string, command: string, args: string[], mutates: boolean): WorkbenchApprovalAction {
  return {
    actionId,
    label,
    command,
    args,
    mutates,
    requiresConfirmation: mutates,
  };
}

export function emptyDecisionInspector(): WorkbenchDecisionInspector {
  return {
    primary: null,
    related: [],
    history: [],
  };
}

export function buildDecisionInspector(input: {
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
  approvals: WorkbenchApprovalItem[];
  decisions: WorkbenchDecisionItem[];
}): WorkbenchDecisionInspector {
  const contexts: WorkbenchDecisionContext[] = [];
  if (input.selectedTopic && !hasActiveRolePipeline(input.workpad)) {
    const resultContext = resultReviewDecisionContext(input.selectedTopic, input.workpad);
    if (resultContext) contexts.push(resultContext);
    const autoReworkAvailable = input.workpad.taskGraph.nodes.some((node) => node.autoRework?.available);
    if (!autoReworkAvailable) {
      contexts.push(...queueDecisionContexts(input.selectedTopic, input.workpad));
      contexts.push(...taskDecisionContexts(input.selectedTopic, input.workpad));
      contexts.push(...latestValidationAuditContexts(input.selectedTopic));
    }
  }

  const hasCurrentBlocker = contexts.some((context) => ["queue-blocker", "task-blocker", "validation-failed", "audit-blocked"].includes(context.kind));
  const resultReviewApplyTargets = new Set(
    contexts
      .filter((context) => context.kind === "apply-gate" && context.targetId)
      .map((context) => `${context.changeId ?? ""}:${context.targetId ?? ""}`),
  );
  const approvalContexts = input.approvals
    .filter((approval) => approval.kind !== "worktree-apply" || !resultReviewApplyTargets.has(`${approval.changeId ?? ""}:${approval.targetId ?? ""}`))
    .map((approval) => approvalDecisionContext(approval));
  for (const context of approvalContexts) {
    if (hasCurrentBlocker && context.changeId === input.selectedTopic?.id && context.kind === "apply-gate") {
      contexts.push({ ...context, kind: "history", severity: "info" });
    } else if (hasCurrentBlocker && context.kind === "audit-approved") contexts.push({ ...context, kind: "history", severity: "info" });
    else contexts.push(context);
  }

  const decisionHistory = input.decisions.map(decisionHistoryContext);
  const enrichedContexts = contexts.map(enrichDecisionContext);
  const enrichedHistory = decisionHistory.map(enrichDecisionContext);
  const current = enrichedContexts.filter((context) => context.kind !== "history");
  const primary = choosePrimaryDecisionContext(current, input.selectedTopic?.id);
  const related = current.filter((context) => context.id !== primary?.id).sort(compareDecisionContexts);
  const history = sortByTimestampDesc([
    ...enrichedContexts.filter((context) => context.kind === "history"),
    ...enrichedHistory,
  ], (context) => context.timestamp);
  return { primary, related, history };
}

export function alignDecisionInspectorWithConfirmationPrimary(
  inspector: WorkbenchDecisionInspector,
  primary: WorkbenchConfirmationQueueItem | null,
  selectedChangeId: string | undefined,
): WorkbenchDecisionInspector {
  if (!primary || !selectedChangeId) return inspector;
  if (inspector.primary && !shouldOverrideDecisionInspectorPrimary(primary)) return inspector;
  if (primary.changeId !== selectedChangeId && primary.conversationId !== selectedChangeId) return inspector;
  const context = enrichDecisionContext({
    id: `confirmation:${primary.id}`,
    kind: "workflow-gate",
    title: primary.summary,
    summary: primary.confirmEffect || primary.summary,
    severity: primary.status === "failed" ? "warning" : "info",
    changeId: primary.changeId ?? primary.conversationId,
    targetId: primary.applyCheckId
      ?? primary.landingPackageId
      ?? primary.worktreeId
      ?? primary.schedulerRunCompletionId
      ?? primary.schedulerIntegrationOutcomeId
      ?? primary.schedulerIntegrationCheckHandoffId
      ?? primary.schedulerIntegrationCandidateId
      ?? primary.schedulerRunId,
    artifact: primary.evidenceRefs[0],
    evidenceRefs: primary.evidenceRefs,
    actions: primary.actions,
  });
  return {
    ...inspector,
    primary: context,
    related: inspector.related.filter((item) => item.id !== context.id),
  };
}

function shouldOverrideDecisionInspectorPrimary(primary: WorkbenchConfirmationQueueItem): boolean {
  if (primary.id.startsWith("landing:local-terminal-blocker:")) return true;
  if (primary.kind === "landing-readiness" && primary.actions.some((action) => (action.actionType === "landing.prepare" || action.actionType === "landing.refresh") && action.enabled)) return true;
  return primary.actions.some((action) => action.actionType === "planning.scheduler.integration-check.run");
}

function hasActiveRolePipeline(workpad: WorkbenchWorkpad): boolean {
  const mainAgentExecution = mainAgentExecutionForWorkpad(workpad);
  return mainAgentExecution?.status === "running"
    || Boolean(mainAgentExecution?.agentTasks.some((task) => task.status === "queued" || task.status === "claimed" || task.status === "running"));
}

function resultReviewDecisionContext(topic: WorkbenchTopicDetail, workpad: WorkbenchWorkpad): WorkbenchDecisionContext | null {
  const review = workpad.resultReview;
  if (!review?.worktreeId) return null;
  if (review.status === "applied-clean" || review.status === "applied-source-dirty") return null;
  const severity: WorkbenchDecisionContext["severity"] = review.applyReadiness.kind === "ready" ? "info" : review.applyReadiness.kind === "dirty-source" ? "warning" : "blocking";
  return {
    id: `result:${topic.id}:${review.worktreeId}:${review.applyReadiness.kind}`,
    kind: "apply-gate",
    title: review.applyReadiness.kind === "ready" ? "结果可以应用到项目" : review.applyReadiness.message,
    summary: review.summary,
    severity,
    changeId: topic.id,
    targetId: review.worktreeId,
    artifact: review.audit?.artifact,
    actions: decisionActionsForResultReview(topic, review),
    rework: review.applyReadiness.kind === "not-approved" ? recordFeedbackPrompt("要求修改") : undefined,
  };
}

function decisionActionsForResultReview(topic: WorkbenchTopicDetail, review: WorkbenchResultReview): WorkbenchDecisionAction[] {
  const worktreeId = review.worktreeId;
  if (!worktreeId) return [];
  const actions: WorkbenchDecisionAction[] = [];
  if (review.applyReadiness.kind === "ready") {
    actions.push({
      id: `apply:${worktreeId}`,
      label: "应用并本地提交",
      kind: "approval",
      changeId: topic.id,
      action: approvalAction("result.apply", "应用并本地提交", "result", ["apply", "", topic.id, worktreeId], true),
      options: {
        commit: true,
        message: `Apply AHO result: ${topic.id}`,
      },
      enabled: true,
      requiresConfirmation: true,
    });
  } else if (review.applyReadiness.kind === "source-drift") {
    actions.push({
      id: `refresh-rework:${worktreeId}`,
      label: "重新处理这个结果",
      kind: "workflow-action",
      changeId: topic.id,
      actionType: "result.refresh-rework",
      worktreeId,
      enabled: true,
      requiresConfirmation: true,
    });
  } else if (review.applyReadiness.kind === "dirty-source") {
    actions.push({
      id: `refresh-status:${worktreeId}`,
      label: "刷新状态",
      kind: "workflow-action",
      changeId: topic.id,
      actionType: "result.refresh-status",
      worktreeId,
      enabled: true,
      requiresConfirmation: false,
    });
  } else if (review.applyReadiness.kind === "stale-validation") {
    actions.push({
      id: `revalidate:${worktreeId}`,
      label: "重新验证",
      kind: "workflow-action",
      changeId: topic.id,
      actionType: "result.revalidate",
      worktreeId,
      enabled: true,
      requiresConfirmation: true,
    });
  } else if (review.applyReadiness.kind === "stale-audit") {
    actions.push({
      id: `reaudit:${worktreeId}`,
      label: "重新审查",
      kind: "workflow-action",
      changeId: topic.id,
      actionType: "result.reaudit",
      worktreeId,
      enabled: true,
      requiresConfirmation: true,
    });
  } else if (review.applyReadiness.kind === "not-approved" && review.validation?.status === "failed") {
    actions.push({
      id: `refresh-rework:${worktreeId}`,
      label: "要求修改",
      kind: "workflow-action",
      changeId: topic.id,
      actionType: "result.refresh-rework",
      worktreeId,
      enabled: true,
      requiresConfirmation: true,
    });
    actions.push({
      id: `revalidate:${worktreeId}`,
      label: "重新验证",
      kind: "workflow-action",
      changeId: topic.id,
      actionType: "result.revalidate",
      worktreeId,
      enabled: true,
      requiresConfirmation: true,
    });
  } else if (review.applyReadiness.kind === "not-approved" && (review.audit?.status === "blocked" || review.audit?.status === "failed")) {
    actions.push({
      id: `reaudit:${worktreeId}`,
      label: "重新审查",
      kind: "workflow-action",
      changeId: topic.id,
      actionType: "result.reaudit",
      worktreeId,
      enabled: true,
      requiresConfirmation: true,
    });
  } else {
    actions.push({
      id: `feedback:${worktreeId}`,
      label: "要求修改",
      kind: "feedback",
      changeId: topic.id,
      worktreeId,
      enabled: true,
      requiresConfirmation: false,
    });
  }
  if (!actions.some((action) => action.kind === "feedback")) {
    actions.push({
      id: `feedback:${worktreeId}`,
      label: "要求修改",
      kind: "feedback",
      changeId: topic.id,
      worktreeId,
      enabled: true,
      requiresConfirmation: false,
    });
  }
  if (review.audit?.artifact) actions.push(...evidenceActions(review.audit.artifact));
  actions.push({
    id: `discard:${worktreeId}`,
    label: "放弃这次结果",
    kind: "approval",
    changeId: topic.id,
    action: approvalAction("worktree.discard", "放弃这次结果", "worktree", ["discard", "", topic.id, worktreeId], true),
    enabled: true,
    requiresConfirmation: true,
  });
  return actions;
}

function enrichDecisionContext(context: WorkbenchDecisionContext): WorkbenchDecisionContext {
  const userStatus = userDecisionStateForDecisionContext(context);
  return {
    ...context,
    userStatus,
    title: userDecisionTitle(context),
    resultSummary: userResultSummary(context),
    recommendation: userRecommendation(context),
    explanation: userDecisionExplanation(context),
  };
}

function userDecisionStateForDecisionContext(context: WorkbenchDecisionContext): WorkbenchUserDecisionState {
  if (context.kind === "queue-blocker" || context.kind === "task-blocker" || context.kind === "validation-failed" || context.kind === "audit-blocked") return "needs-rework";
  if (context.kind === "history") return "completed";
  return "waiting-confirmation";
}

function userDecisionTitle(context: WorkbenchDecisionContext): string {
  if (context.kind === "queue-blocker") return "任务暂停";
  if (context.kind === "task-blocker") return "需要修改或补证据";
  if (context.kind === "validation-failed") return "验证未通过";
  if (context.kind === "audit-blocked") return "审查未通过，需要修改或补证据";
  if (context.kind === "spec-proposal") return "确认需求说明";
  if (context.kind === "plan-proposal") return "确认实施计划";
  if (context.kind === "audit-approved") return "确认审查证据";
  if (context.kind === "apply-gate") {
    return context.actions.some((action) => action.actionType === "result.refresh-rework" || action.actionType === "result.revalidate" || action.actionType === "result.reaudit" || action.actionType === "result.refresh-status")
      ? context.title
      : resultApplyCommits(context)
        ? "确认应用并本地提交"
      : "确认应用到项目";
  }
  if (context.kind === "evolution-pending") return "确认 Harness 演进";
  return context.title;
}

function userResultSummary(context: WorkbenchDecisionContext): string {
  if (context.kind === "queue-blocker") return "本地顺序执行暂停在当前任务，详细原因可在诊断工具中查看。";
  if (context.kind === "task-blocker") return "当前任务还没有形成可接受结果，详细原因可在诊断工具中查看。";
  if (context.kind === "validation-failed") return context.summary || "机械验证没有通过。";
  if (context.kind === "audit-blocked") return context.summary || "审查认为当前结果还不能安全接受。";
  if (context.kind === "spec-proposal") return context.summary || "AI 提出了 Spec 草案。";
  if (context.kind === "plan-proposal") return context.summary || "AI 提出了 Plan / Tasks 草案。";
  if (context.kind === "audit-approved") return context.summary || "审查证据显示结果可以接受。";
  if (context.kind === "apply-gate") return context.summary || "当前结果已准备应用到项目。";
  return context.summary;
}

function userRecommendation(context: WorkbenchDecisionContext): string {
  if (context.kind === "queue-blocker" || context.kind === "task-blocker") return "补充修改要求后，系统会把反馈带入下一轮修改。";
  if (context.kind === "validation-failed") return "验证失败会先作为 agent 修改输入；若自动修改用尽，再请你补充要求。";
  if (context.kind === "audit-blocked") return "审查失败会先作为 agent 修改输入；若仍失败，再请你补充业务判断。";
  if (context.kind === "spec-proposal" || context.kind === "plan-proposal") return "同意会接受该草案；要求修改会把反馈记录回当前需求。";
  if (context.kind === "audit-approved") return "同意会接受审查证据；要求修改会记录复审要求。";
  if (context.kind === "apply-gate") {
    if (context.actions.some((action) => action.actionType === "result.refresh-rework")) return "重新处理会基于最新项目状态创建同一需求的新结果；旧结果保留为历史证据。";
    if (context.actions.some((action) => action.actionType === "result.revalidate")) return "当前结果需要先重新验证，验证通过后再决定是否应用。";
    if (context.actions.some((action) => action.actionType === "result.reaudit")) return "当前结果需要先重新审查，审查通过后再决定是否应用。";
    if (context.actions.some((action) => action.actionType === "result.refresh-status")) return "先刷新当前项目状态或处理本地改动；系统不会把本地脏状态自动交给 coder 修改。";
    if (resultApplyCommits(context)) return "应用会把当前结果写入项目并创建本地提交；要求修改会进入下一轮修改；放弃只丢弃这次结果。";
    return "应用会把当前结果写入项目；要求修改会进入下一轮修改；放弃只丢弃这次结果。";
  }
  return "查看历史决策和证据。";
}

function userDecisionExplanation(context: WorkbenchDecisionContext): string {
  if (context.kind === "queue-blocker") return "执行状态仍用于恢复和归因；你只需要处理当前暂停的任务。";
  if (context.kind === "task-blocker") return "任务状态来自执行记录、验证和审查证据，不会自动修改任务清单。";
  if (context.kind === "validation-failed" || context.kind === "audit-blocked") return "这不是最终失败，而是需要修改或补证据的检查结果。";
  if (context.kind === "apply-gate") {
    if (resultApplyCommits(context)) return "应用和本地提交都是高影响动作，仍需要明确确认；这不会执行远端提交、PR 或合并。";
    return "应用是高影响动作，仍需要明确确认；这不会执行远端提交或合并。";
  }
  return "右侧只显示当前对象的主决策，旧决策折叠到历史。";
}

function resultApplyCommits(context: WorkbenchDecisionContext): boolean {
  return context.actions.some((action) => action.action?.actionId === "result.apply" && action.options?.commit === true);
}

function queueDecisionContexts(topic: WorkbenchTopicDetail, workpad: WorkbenchWorkpad): WorkbenchDecisionContext[] {
  const queue = workpad.taskQueue;
  if (!queue || !["blocked", "failed"].includes(queue.status)) return [];
  const task = workpad.taskGraph.nodes.find((node) => node.taskId === queue.currentTaskId) ?? workpad.taskGraph.nodes.find((node) => node.status === "blocked");
  return [{
    id: `queue:${queue.id}:blocked`,
    kind: "queue-blocker",
      title: `任务暂停${task ? `：${task.taskId}` : ""}`,
    summary: queue.blockedReason ?? queue.failureReason ?? task?.blockers[0] ?? "任务暂停，等待你查看证据或重试。",
    severity: "blocking",
    changeId: topic.id,
    taskId: task?.taskId ?? queue.currentTaskId,
    taskRunId: task?.taskRun?.id,
    queueRunId: queue.id,
    runId: task?.taskRun?.runId,
    actions: decisionActionsForQueueBlocker(queue, task),
    rework: recordFeedbackPrompt("要求修改"),
  }];
}

function taskDecisionContexts(topic: WorkbenchTopicDetail, workpad: WorkbenchWorkpad): WorkbenchDecisionContext[] {
  return workpad.taskGraph.nodes
    .filter((task) => task.status === "blocked")
    .map((task) => ({
      id: `task:${task.taskId}:blocked`,
      kind: "task-blocker" as const,
      title: `需要修改或补证据：${task.taskId}`,
      summary: task.blockers[0] ?? "该任务需要修改或补证据后才能继续。",
      severity: "blocking" as const,
      changeId: topic.id,
      taskId: task.taskId,
      taskRunId: task.taskRun?.id,
      runId: task.taskRun?.runId,
      timestamp: latestTaskEvidenceTimestamp(task),
      actions: decisionActionsForTaskBlocker(task),
      rework: recordFeedbackPrompt("要求修改"),
    }));
}

function latestValidationAuditContexts(topic: WorkbenchTopicDetail): WorkbenchDecisionContext[] {
  const contexts: WorkbenchDecisionContext[] = [];
  const validation = latestByTimestamp(topic.validations as ValidationSummary[], (item) => item.finishedAt);
  if (validation?.status === "failed") {
    contexts.push({
      id: `validation:${validation.id}:failed`,
      kind: "validation-failed",
      title: `验证未通过：${validation.id}`,
      summary: "验证未通过，需要修改实现或补齐验证证据。",
      severity: "blocking",
      changeId: topic.id,
      targetId: validation.id,
      runId: validation.runId,
      timestamp: validation.finishedAt,
      actions: validation.worktreeId
        ? [
          {
            id: `refresh-rework:${validation.worktreeId}`,
            label: "要求修改",
            kind: "workflow-action",
            changeId: topic.id,
            actionType: "result.refresh-rework",
            worktreeId: validation.worktreeId,
            enabled: true,
            requiresConfirmation: true,
          },
          {
            id: `revalidate:${validation.worktreeId}`,
            label: "重新验证",
            kind: "workflow-action",
            changeId: topic.id,
            actionType: "result.revalidate",
            worktreeId: validation.worktreeId,
            enabled: true,
            requiresConfirmation: true,
          },
        ]
        : evidenceActions(undefined),
    });
  }
  const audit = latestByTimestamp(topic.audits as AuditSummary[], (item) => item.finishedAt);
  if (audit?.status === "blocked" || audit?.status === "failed") {
    contexts.push({
      id: `audit:${audit.id}:blocked`,
      kind: "audit-blocked",
      title: `审查未通过：${audit.id}`,
      summary: "审查未通过，需要修改或补证据。查看审查原因后再重试相关任务。",
      severity: "blocking",
      changeId: topic.id,
      targetId: audit.id,
      runId: audit.runId,
      timestamp: audit.finishedAt,
      actions: audit.worktreeId
        ? [
          {
            id: `refresh-rework:${audit.worktreeId}`,
            label: "要求修改",
            kind: "workflow-action",
            changeId: topic.id,
            actionType: "result.refresh-rework",
            worktreeId: audit.worktreeId,
            enabled: true,
            requiresConfirmation: true,
          },
          {
            id: `reaudit:${audit.worktreeId}`,
            label: "重新审查",
            kind: "workflow-action",
            changeId: topic.id,
            actionType: "result.reaudit",
            worktreeId: audit.worktreeId,
            enabled: true,
            requiresConfirmation: true,
          },
        ]
        : evidenceActions(undefined),
      rework: recordFeedbackPrompt("记录审查反馈"),
    });
  }
  return contexts;
}

function approvalDecisionContext(approval: WorkbenchApprovalItem): WorkbenchDecisionContext {
  const kind = decisionKindForApproval(approval.kind);
  const title = decisionTitleForApproval(approval);
  return {
    id: `approval:${approval.id}`,
    kind,
    title,
    summary: approval.reason ?? approval.label,
    severity: approval.severity,
    changeId: approval.changeId,
    runId: approval.runId,
    targetId: approval.targetId,
    artifact: approval.artifact,
    actions: decisionActionsForApproval(approval, kind),
    rework: proposalLikeDecision(kind) ? inlineFeedbackPrompt("要求修改") : kind === "audit-approved" ? inlineFeedbackPrompt("要求复审") : undefined,
  };
}

function decisionHistoryContext(decision: WorkbenchDecisionItem): WorkbenchDecisionContext {
  return {
    id: `decision:${decision.id}`,
    kind: "history",
    title: decision.label,
    summary: decision.feedback ? `${decision.summary}\n${decision.feedback}` : decision.summary,
    severity: decision.status === "failed" ? "blocking" : decision.status === "requested-changes" ? "warning" : "info",
    changeId: decision.changeId,
    runId: decision.runId,
    targetId: decision.targetId,
    artifact: decision.artifact,
    timestamp: decision.completedAt ?? decision.updatedAt,
    actions: evidenceActions(decision.artifact),
  };
}

function decisionActionsForQueueBlocker(queue: WorkbenchTaskQueueSummary, task?: WorkbenchTaskNode): WorkbenchDecisionAction[] {
  const actions: WorkbenchDecisionAction[] = [];
  actions.push({
    id: `feedback:${queue.id}:${task?.taskId ?? "queue"}`,
    label: "要求修改",
    kind: "feedback",
    enabled: true,
    requiresConfirmation: false,
  });
  const evidenceAction = firstEvidenceAction(task);
  if (evidenceAction) actions.push(evidenceAction);
  actions.push({
    id: `abandon:${queue.id}`,
    label: "放弃",
    kind: "abandon",
    enabled: true,
    requiresConfirmation: true,
  });
  return actions;
}

function decisionActionsForTaskBlocker(task: WorkbenchTaskNode): WorkbenchDecisionAction[] {
  const actions: WorkbenchDecisionAction[] = [
    {
      id: `feedback:${task.taskId}:${task.taskRun?.id ?? "task"}`,
      label: "要求修改",
      kind: "feedback" as const,
      enabled: true,
      requiresConfirmation: false,
    },
  ];
  const evidenceAction = firstEvidenceAction(task);
  if (evidenceAction) actions.push(evidenceAction);
  actions.push({
      id: `abandon:${task.taskId}`,
      label: "放弃",
      kind: "abandon" as const,
      enabled: true,
      requiresConfirmation: true,
  });
  return actions;
}

function decisionActionsForApproval(approval: WorkbenchApprovalItem, kind: WorkbenchDecisionContextKind): WorkbenchDecisionAction[] {
  const actions: WorkbenchDecisionAction[] = [];
  if (approval.action) {
    actions.push({
      id: `accept:${approval.id}`,
      label: actionLabelForDecision(kind, approval.action.label),
      kind: "approval",
      changeId: approval.changeId,
      approvalId: approval.id,
      action: { ...approval.action, label: actionLabelForDecision(kind, approval.action.label) },
      enabled: true,
      requiresConfirmation: approval.action.requiresConfirmation,
    });
  }
  if (approval.artifact) actions.push(...evidenceActions(approval.artifact));
  if (proposalLikeDecision(kind) || kind === "audit-approved" || kind === "apply-gate") {
    actions.push({
      id: `feedback:${approval.id}`,
      label: kind === "audit-approved" ? "要求复审" : "要求修改",
      kind: "feedback",
      changeId: approval.changeId,
      approvalId: approval.id,
      action: approval.action,
      enabled: Boolean(approval.action),
      requiresConfirmation: false,
      disabledReason: approval.action ? undefined : "该对象没有可记录反馈的 action context。",
    });
  }
  if (kind === "apply-gate" && approval.targetId) {
    actions.push({
      id: `discard:${approval.targetId}`,
      label: "放弃这次结果",
      kind: "approval",
      changeId: approval.changeId,
      approvalId: approval.id,
      action: approvalAction("worktree.discard", "放弃这次结果", "worktree", ["discard", approval.changeId ?? "", approval.targetId], true),
      enabled: true,
      requiresConfirmation: true,
    });
    return actions;
  }
  if (kind === "spec-proposal" || kind === "plan-proposal" || kind === "audit-approved" || kind === "apply-gate") {
    actions.push({
      id: `abandon:${approval.id}`,
      label: "放弃",
      kind: "abandon",
      changeId: approval.changeId,
      enabled: Boolean(approval.changeId),
      requiresConfirmation: true,
      disabledReason: approval.changeId ? undefined : "该决策缺少需求上下文，不能结束需求。",
    });
  }
  return actions;
}

function firstEvidenceAction(task?: WorkbenchTaskNode): WorkbenchDecisionAction | undefined {
  const artifact = task?.latestEvidence.find((item) => item.artifact)?.artifact;
  return evidenceActions(artifact)[0];
}

function decisionKindForApproval(kind: WorkbenchApprovalKind): WorkbenchDecisionContextKind {
  if (kind === "spec-proposal") return "spec-proposal";
  if (kind === "plan-proposal" || kind === "spec-test-proposal") return "plan-proposal";
  if (kind === "audit-proposal") return "audit-approved";
  if (kind === "worktree-apply") return "apply-gate";
  if (kind === "evolution") return "evolution-pending";
  return "history";
}

function decisionTitleForApproval(approval: WorkbenchApprovalItem): string {
  if (approval.kind === "spec-proposal") return `Spec proposal: ${approval.targetId ?? approval.id}`;
  if (approval.kind === "plan-proposal") return `Plan proposal: ${approval.targetId ?? approval.id}`;
  if (approval.kind === "audit-proposal") return `审查证据可接受：${approval.targetId ?? approval.id}`;
  if (approval.kind === "worktree-apply") return `结果可应用到项目：${approval.targetId ?? approval.id}`;
  return approval.label;
}

function actionLabelForDecision(kind: WorkbenchDecisionContextKind, fallback: string): string {
  if (kind === "apply-gate") return "应用到项目";
  if (kind === "spec-proposal" || kind === "plan-proposal" || kind === "audit-approved") return "同意";
  return fallback;
}

function proposalLikeDecision(kind: WorkbenchDecisionContextKind): boolean {
  return kind === "spec-proposal" || kind === "plan-proposal";
}

function inlineFeedbackPrompt(label: string): WorkbenchReworkPrompt {
  return {
    mode: "inline-feedback",
    label,
    placeholder: "写下需要修改的点、补充约束或复审要求。",
  };
}

function recordFeedbackPrompt(label: string): WorkbenchReworkPrompt {
  return {
    mode: "record-feedback",
    label,
    placeholder: "记录你的判断或后续修复要求。",
  };
}

function compareDecisionContexts(a: WorkbenchDecisionContext, b: WorkbenchDecisionContext): number {
  return decisionPriority(a) - decisionPriority(b) || (b.timestamp ?? "").localeCompare(a.timestamp ?? "");
}

function choosePrimaryDecisionContext(contexts: WorkbenchDecisionContext[], selectedChangeId: string | undefined): WorkbenchDecisionContext | null {
  const scoped = selectedChangeId ? contexts.filter((context) => context.changeId === selectedChangeId) : contexts;
  return [...(scoped.length > 0 ? scoped : contexts)].sort(compareDecisionContexts)[0] ?? null;
}

function decisionPriority(context: WorkbenchDecisionContext): number {
  if (context.kind === "queue-blocker") return 0;
  if (context.kind === "task-blocker") return 1;
  if (context.kind === "validation-failed" || context.kind === "audit-blocked") return 2;
  if (context.kind === "spec-proposal" || context.kind === "plan-proposal") return 3;
  if (context.kind === "apply-gate") return 4;
  if (context.kind === "audit-approved") return 5;
  if (context.kind === "evolution-pending") return 6;
  return 99;
}

function latestTaskEvidenceTimestamp(task: WorkbenchTaskNode): string | undefined {
  return task.latestEvidence.map((item) => item.timestamp).filter((item): item is string => Boolean(item)).sort().at(-1);
}

