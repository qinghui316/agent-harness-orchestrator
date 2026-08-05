import type { AgentTaskStorePort } from "../../../agent-task/paths.js";
import { listRuns } from "../../../run/manager.js";
import { listDemandWorkers } from "../../../demand-worker/manager.js";
import type { DemandWorkerStorePort } from "../../../demand-worker/paths.js";
import { listTaskQueues } from "../../../task-queue/manager.js";
import type { ProjectRunsPathPort } from "../../../project-runtime/paths.js";
import type { SchedulerCurrentTransition } from "../../../workflow-actions/scheduler-current-transition.js";
import type { ReadySetWorkflowGraphPlan } from "../../../types/index.js";
import {
  buildTypedWorkflowNextAction,
  type WorkbenchSchedulerContractSummary,
  type WorkbenchSchedulerClaimReconcilePlanSummary,
  type WorkbenchSchedulerDispatchDryRunSummary,
  type WorkbenchSchedulerLaunchPreflightSummary,
  type WorkbenchSchedulerClaimReservationSummary,
  type WorkbenchSchedulerReconcileSnapshotSummary,
  type WorkbenchSchedulerRunSummary,
  type WorkbenchSchedulerRuntimeSummary,
  type WorkbenchSchedulerWorkerResultSummary,
  type WorkbenchSchedulerWorkerAuditSummary,
  type WorkbenchSchedulerWorkerReworkPlanSummary,
  type WorkbenchSchedulerWorkerReworkAuditSummary,
  type WorkbenchSchedulerWorkerReworkResultSummary,
  type WorkbenchSchedulerWorkerReworkValidationSummary,
  type WorkbenchSchedulerWorkerReworkStartSummary,
  type WorkbenchSchedulerIntegrationCandidateSummary,
  type WorkbenchSchedulerIntegrationCheckHandoffSummary,
  type WorkbenchSchedulerIntegrationOutcomeSummary,
  type WorkbenchSchedulerRunCompletionSummary,
  type WorkbenchSchedulerRunBlockedCloseoutSummary,
  type WorkbenchSchedulerWorkerStartSummary,
  type WorkbenchSchedulerWorkerValidationSummary,
  type WorkbenchSchedulerWorkerSessionPlanSummary,
  type WorkbenchSchedulerWorkerPathSummary,
  type WorkbenchWorkflowGraphPlanSummary,
} from "../../workflow-projection.js";
import { buildAgentTaskSummaries } from "./agent-task-summary.js";
import { latestByTimestamp, sortByTimestampDesc } from "./projection-summary.js";
import {
  emptyTaskGraph,
} from "./task-graph.js";
import type {
  AuditSummary,
  ValidationSummary,
  WorkflowRunSummary,
} from "../../../types/index.js";
import type {
  HarnessGap,
  WorkbenchAgentTaskSummary,
  WorkbenchApprovalItem,
  WorkbenchRolePipelineSummary,
  WorkbenchRoleRunSummary,
  WorkbenchTaskGraph,
  WorkbenchTaskQueueSummary,
  WorkbenchTopicDetail,
  WorkbenchTopicSummary,
  WorkbenchUserDecisionState,
  WorkbenchWorkpad,
  WorkbenchWorkpadRuntimeStatus,
  WorkbenchWorkpadSummary,
  WorkpadBackgroundActivitySummary,
  WorkpadIntakeSummary,
  WorkpadMemoryIsolationSummary,
  WorkpadNextAction,
  WorkpadProgress,
} from "../../read-model-types.js";

const OFFICIAL_REWORK_BUDGET = 1;

export function buildDiagnosticWorkpad(projectName: string, warnings: string[], gaps: HarnessGap[]): WorkbenchWorkpad {
  return {
    title: "项目需求",
    subtitle: projectName,
    state: "diagnostic",
    userStatus: "later",
    userStatusLabel: userDecisionStateLabel("later"),
    conversationLifecycle: "active",
    pendingFeedback: [],
    intake: {
      goal: "尚未选择可用的项目 Harness Skill。",
      currentUnderstanding: "Workbench 只能显示诊断信息；需要注册项目并完成 Harness onboarding 后才能读取 Conversation、Run 和 evidence。",
      source: "diagnostic",
      relatedArtifacts: [],
      missingInfo: ["Project Harness is unavailable."],
      confirmedConstraints: [],
      openQuestions: [],
      assumptions: [],
      pendingClarifications: [],
    },
    progress: emptyProgress("none"),
    tasks: [],
    codingPackages: [],
    taskGraph: emptyTaskGraph(),
    taskQueue: undefined,
    evidence: [],
    blockers: warnings,
    warnings: gaps.filter((gap) => gap.status !== "available").map((gap) => gap.summary),
    nextAction: {
      id: "diagnostic",
      label: "初始化或选择项目",
      description: "先让项目进入 AHO 管理范围，再创建需求对话。",
      kind: "read-only",
      enabled: false,
      requiresConfirmation: false,
      disabledReason: "当前 snapshot 没有 ready 的项目 Harness。",
    },
    background: emptyWorkpadBackground(),
    memoryIsolation: diagnosticMemoryIsolation(warnings),
  };
}

function emptyProgress(topicState: WorkpadProgress["topicState"]): WorkpadProgress {
  return {
    topicState,
    spec: "unknown",
    plan: "unknown",
    tasks: "unknown",
    acCount: 0,
    taskCount: 0,
    runCount: 0,
  };
}

function emptyWorkpadBackground(): WorkpadBackgroundActivitySummary {
  return {
    totalCount: 0,
    runningCount: 0,
    queuedCount: 0,
    blockedCount: 0,
    waitingDecisionCount: 0,
    items: [],
  };
}

export function buildRolePipelineSummary(
  topic: WorkbenchTopicDetail,
  agentTasks: WorkbenchAgentTaskSummary[],
): WorkbenchRolePipelineSummary | undefined {
  const coderRuns = topic.runs.filter((run) => run.runtime === "provider-code");
  const validationRuns = topic.validations as ValidationSummary[];
  const auditRuns = topic.audits as AuditSummary[];
  if (coderRuns.length === 0 && validationRuns.length === 0 && auditRuns.length === 0 && agentTasks.length === 0) return undefined;
  const latestCoder = latestByTimestamp(coderRuns, (run) => run.finishedAt ?? run.startedAt);
  const latestValidation = latestByTimestamp(validationRuns, (validation) => validation.finishedAt);
  const latestAudit = latestByTimestamp(auditRuns, (audit) => audit.finishedAt);
  const runs: WorkbenchRoleRunSummary[] = [];
  if (latestCoder) runs.push({ roleId: "coder-agent", status: latestCoder.status, runId: latestCoder.id, summary: latestCoder.status === "completed" ? "Coder finished implementation/self-test attempt." : "Coder attempt is not completed.", artifact: latestCoder.artifacts.directory });
  if (latestValidation) runs.push({ roleId: "validator", status: latestValidation.status, runId: latestValidation.runId, summary: `Validation ${latestValidation.status}.` });
  if (latestAudit) runs.push({ roleId: "auditor-agent", status: latestAudit.status, runId: latestAudit.runId, summary: `Audit ${latestAudit.status}.` });
  const activeAgentTask = agentTasks.find((task) => isActiveAgentTaskStatus(task.status));
  const stage: WorkbenchRolePipelineSummary["stage"] = activeAgentTask
    ? rolePipelineStageForActiveTask(activeAgentTask.roleId)
    : latestAudit
    ? (latestAudit.status === "approved" || latestAudit.status === "approved-with-notes" ? "done" : "needs-user-input")
    : latestValidation
      ? (latestValidation.status === "passed" ? "audit" : "rework")
      : latestCoder
        ? (latestCoder.status === "completed" ? "validation" : "coding")
        : "coding";
  const status: WorkbenchRolePipelineSummary["status"] = activeAgentTask || coderRuns.some((run) => run.status === "created" || run.status === "running")
    ? "running"
    : stage === "needs-user-input" ? "needs-user-input" : stage === "done" ? "completed" : "draft";
  return { stage, status, runs, agentTasks, reworkUsed: 0, reworkBudget: OFFICIAL_REWORK_BUDGET };
}

function isActiveAgentTaskStatus(status: WorkbenchAgentTaskSummary["status"]): boolean {
  return status === "queued" || status === "claimed" || status === "running";
}

function rolePipelineStageForActiveTask(roleId: string): WorkbenchRolePipelineSummary["stage"] {
  if (roleId === "validator") return "validation";
  if (roleId === "auditor-agent") return "audit";
  if (roleId === "rework-coder") return "rework";
  if (roleId === "coder-agent") return "coding";
  return "planning";
}

export function buildWorkpadBackground(workpads: WorkbenchWorkpadSummary[], selectedId: string | undefined): WorkpadBackgroundActivitySummary {
  const backgroundItems = workpads.filter((item) => item.id !== selectedId && ["running", "queued", "blocked", "waiting-decision"].includes(item.runtimeStatus));
  return {
    totalCount: workpads.length,
    runningCount: backgroundItems.filter((item) => item.runtimeStatus === "running").length,
    queuedCount: backgroundItems.filter((item) => item.runtimeStatus === "queued").length,
    blockedCount: backgroundItems.filter((item) => item.runtimeStatus === "blocked").length,
    waitingDecisionCount: backgroundItems.filter((item) => item.runtimeStatus === "waiting-decision").length,
    items: backgroundItems.slice(0, 6),
  };
}

function diagnosticMemoryIsolation(warnings: string[]): WorkpadMemoryIsolationSummary {
  return {
    projectStableNamespace: "project/stable",
    providerSessionNamespace: "agent/{roleId}/session/{sessionId}",
    runNamespaces: [],
    relatedWorkpads: [],
    stableFactSources: [],
    writeBoundaries: [],
    warnings: ["Project Harness is unavailable; AHO must not infer hidden project history.", ...warnings],
  };
}

export function buildWorkpadNextAction(
  topic: WorkbenchTopicDetail,
  approvals: WorkbenchApprovalItem[],
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  intake?: WorkpadIntakeSummary,
  queue?: WorkbenchTaskQueueSummary,
  taskGraph?: WorkbenchTaskGraph,
  workflowGraphPlan?: WorkbenchWorkflowGraphPlanSummary | null,
  schedulerContract?: WorkbenchSchedulerContractSummary | null,
  schedulerDispatchDryRun?: WorkbenchSchedulerDispatchDryRunSummary | null,
  schedulerWorkerSessionPlan?: WorkbenchSchedulerWorkerSessionPlanSummary | null,
  schedulerClaimReconcilePlan?: WorkbenchSchedulerClaimReconcilePlanSummary | null,
  schedulerLaunchPreflight?: WorkbenchSchedulerLaunchPreflightSummary | null,
  schedulerRun?: WorkbenchSchedulerRunSummary | null,
  schedulerRuntime?: WorkbenchSchedulerRuntimeSummary | null,
  schedulerReconcileSnapshot?: WorkbenchSchedulerReconcileSnapshotSummary | null,
  schedulerClaimReservation?: WorkbenchSchedulerClaimReservationSummary | null,
  schedulerWorkerStart?: WorkbenchSchedulerWorkerStartSummary | null,
  schedulerWorkerResult?: WorkbenchSchedulerWorkerResultSummary | null,
  schedulerWorkerValidation?: WorkbenchSchedulerWorkerValidationSummary | null,
  schedulerWorkerAudit?: WorkbenchSchedulerWorkerAuditSummary | null,
  schedulerWorkerReworkPlan?: WorkbenchSchedulerWorkerReworkPlanSummary | null,
  schedulerWorkerReworkStart?: WorkbenchSchedulerWorkerReworkStartSummary | null,
  schedulerWorkerReworkResult?: WorkbenchSchedulerWorkerReworkResultSummary | null,
  schedulerWorkerReworkValidation?: WorkbenchSchedulerWorkerReworkValidationSummary | null,
  schedulerWorkerReworkAudit?: WorkbenchSchedulerWorkerReworkAuditSummary | null,
  schedulerWorkerPaths?: WorkbenchSchedulerWorkerPathSummary[],
  schedulerReadySetGraph?: ReadySetWorkflowGraphPlan | null,
  schedulerIntegrationCandidate?: WorkbenchSchedulerIntegrationCandidateSummary | null,
  schedulerIntegrationCheckHandoff?: WorkbenchSchedulerIntegrationCheckHandoffSummary | null,
  schedulerIntegrationOutcome?: WorkbenchSchedulerIntegrationOutcomeSummary | null,
  schedulerRunCompletion?: WorkbenchSchedulerRunCompletionSummary | null,
  schedulerRunBlockedCloseout?: WorkbenchSchedulerRunBlockedCloseoutSummary | null,
  schedulerTransition?: SchedulerCurrentTransition | null,
  schedulerIntegrationCandidateNeedsRefresh?: boolean,
  workflowRun?: WorkflowRunSummary | null,
): WorkpadNextAction {
  if (topic.state !== "active") {
    return {
      id: "readonly-topic",
      label: "只读查看历史",
      description: "归档或暂停的需求对话只能查看对话、证据和运行回放。",
      kind: "none",
      enabled: false,
      requiresConfirmation: false,
      disabledReason: "需求对话不是可执行状态。",
    };
  }
  const actionableApproval = approvals.find((approval) => approval.action);
  const schedulerWaitingForIntegrationDecision = (schedulerIntegrationCheckHandoff?.currentIntegrationCheckStatus
    ?? schedulerIntegrationCheckHandoff?.integrationCheckStatus) === "passed"
    && !schedulerIntegrationOutcome;
  const autoReworkTask = taskGraph?.nodes.find((node) => node.autoRework?.available);
  if (!schedulerTransition && autoReworkTask?.autoRework) {
    return {
      id: `auto-rework:${autoReworkTask.taskId}:${autoReworkTask.taskRun?.id ?? "latest"}`,
      label: "正在自动修改",
      description: autoReworkTask.autoRework.reason,
      kind: "read-only",
      enabled: false,
      requiresConfirmation: false,
      disabledReason: "系统会在本轮 official failure 后自动交回 coder-agent 修改；无需用户点击重试。",
    };
  }
  const queueBlockedAction = buildQueueBlockedNextAction(queue, taskGraph);
  if (queueBlockedAction) return queueBlockedAction;
  if (actionableApproval && !schedulerTransition?.actionType && !schedulerWaitingForIntegrationDecision) {
    return approvalToNextAction(actionableApproval);
  }
  return scopeTypedWorkflowNextAction(topic, buildTypedWorkflowNextAction({
    topic,
    readiness,
    intake,
    workflowGraphPlan,
    schedulerContract,
    schedulerDispatchDryRun,
    schedulerWorkerSessionPlan,
    schedulerClaimReconcilePlan,
    schedulerLaunchPreflight,
    schedulerRun,
    schedulerRuntime,
    schedulerReconcileSnapshot,
    schedulerClaimReservation,
    schedulerWorkerStart,
    schedulerWorkerResult,
    schedulerWorkerValidation,
    schedulerWorkerAudit,
    schedulerWorkerReworkPlan,
    schedulerWorkerReworkStart,
    schedulerWorkerReworkResult,
    schedulerWorkerReworkValidation,
    schedulerWorkerReworkAudit,
    schedulerWorkerPaths,
    schedulerReadySetGraph,
    schedulerIntegrationCandidate,
    schedulerIntegrationCheckHandoff,
    schedulerIntegrationOutcome,
    schedulerRunCompletion,
    schedulerRunBlockedCloseout,
    schedulerTransition,
    schedulerIntegrationCandidateNeedsRefresh,
    workflowRun,
  }));
}

function scopeTypedWorkflowNextAction(topic: WorkbenchTopicDetail, action: WorkpadNextAction): WorkpadNextAction {
  if (action.kind !== "workflow-action") return action;
  return { ...action, changeId: action.changeId ?? topic.id };
}

function approvalToNextAction(approval: WorkbenchApprovalItem): WorkpadNextAction {
  return {
    id: `approval:${approval.id}`,
    label: approval.action?.label ?? approval.label,
    description: approval.reason ?? approval.label,
    kind: "approval",
    enabled: true,
    requiresConfirmation: approval.action?.requiresConfirmation ?? true,
    changeId: approval.changeId,
    approvalId: approval.id,
  };
}

function buildQueueBlockedNextAction(queue?: WorkbenchTaskQueueSummary, taskGraph?: WorkbenchTaskGraph): WorkpadNextAction | null {
  if (!queue || !["blocked", "failed"].includes(queue.status)) return null;
  const blockedTask = taskGraph?.nodes.find((node) => node.taskId === queue.currentTaskId) ?? taskGraph?.nodes.find((node) => node.status === "blocked");
  const retry = blockedTask?.nextAction.actionType === "task.run.retry" && blockedTask.nextAction.enabled ? blockedTask.nextAction : null;
  if (retry) {
    return {
      id: `decision:${queue.id}:${blockedTask?.taskId}:retry`,
      label: "要求修改",
      description: queue.blockedReason ?? blockedTask?.blockers[0] ?? "任务暂停，需要把修改意见交回当前需求。",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: retry.requiresConfirmation,
      actionType: "task.run.retry",
      taskIds: retry.taskIds,
      taskRunId: retry.taskRunId,
    };
  }
  const reconcile = queue.nextAction?.actionType;
  if (reconcile) {
    return {
      id: `decision:${queue.id}:reconcile`,
      label: "继续处理",
      description: queue.blockedReason ?? queue.failureReason ?? "任务暂停，先刷新 durable evidence 状态。",
      kind: "workflow-action",
      enabled: queue.nextAction?.enabled ?? true,
      requiresConfirmation: queue.nextAction?.requiresConfirmation ?? true,
      actionType: reconcile,
      workflowRunId: queue.nextAction?.workflowRunId,
      queueRunId: queue.nextAction?.queueRunId,
      workflowGraphPlanId: queue.nextAction?.workflowGraphPlanId,
      disabledReason: queue.nextAction?.disabledReason,
    };
  }
  return {
    id: `decision:${queue.id}:blocked`,
    label: "查看证据",
    description: queue.blockedReason ?? queue.failureReason ?? "任务暂停，需要查看 evidence。",
    kind: "read-only",
    enabled: false,
    requiresConfirmation: false,
    disabledReason: "当前没有可执行的 retry/reconcile 路径。",
  };
}

export async function buildMultiWorkpadSummaries(
  memory: ProjectRunsPathPort & DemandWorkerStorePort & AgentTaskStorePort,
  topics: WorkbenchTopicSummary[],
  approvals: WorkbenchApprovalItem[],
  selectedTopicId: string | undefined,
): Promise<WorkbenchWorkpadSummary[]> {
  const allRuns = await listRuns(memory).catch(() => []);
  const demandWorkers = await listDemandWorkers(memory).catch(() => []);
  const summaries = await Promise.all(topics.map(async (topic): Promise<WorkbenchWorkpadSummary> => {
    if (topic.kind === "conversation" && !topic.boundChangeId) {
      return {
        id: topic.id,
        title: topic.title,
        state: topic.state,
        runtimeStatus: topic.state === "archive" ? "archived" : "active",
        userStatus: topic.state === "archive" ? "completed" : "later",
        userStatusLabel: userDecisionStateLabel(topic.state === "archive" ? "completed" : "later"),
        conversationLifecycle: topic.state === "archive" ? "archived-readonly" : "active",
        linkedFromChangeId: topic.boundChangeId ?? undefined,
        selected: topic.id === selectedTopicId,
        waitingDecisionCount: 0,
        updatedAt: topic.updatedAt,
      };
    }
    const changeId = topic.boundChangeId ?? topic.id;
    const runs = allRuns.filter((run) => run.changeId === changeId || run.changeId === topic.name);
    const latestRun = latestByTimestamp(runs, (run) => run.finishedAt ?? run.startedAt);
    const runningRun = runs.find((run) => run.status === "created" || run.status === "running");
    const demandWorker = demandWorkers.find((worker) => worker.changeId === changeId || worker.changeId === topic.name);
    const queues = topic.state === "active"
      ? await listTaskQueues(memory, changeId).catch(() => [])
      : [];
    const latestQueue = latestByTimestamp(queues, (queue) => queue.updatedAt ?? queue.createdAt);
    const topicApprovals = approvals.filter((approval) => approval.changeId === changeId || approval.changeId === topic.name);
    const blockingApproval = topicApprovals.find((approval) => approval.severity === "blocking");
    const agentTasks = topic.state === "active"
      ? await buildAgentTaskSummaries(memory, changeId).catch(() => [])
      : [];
    const activeAgentTask = agentTasks.find((task) => isActiveAgentTaskStatus(task.status));
    let runtimeStatus: WorkbenchWorkpadRuntimeStatus = topic.state === "archive" ? "archived" : "active";
    let blocker = blockingApproval?.reason ?? blockingApproval?.label;
    if (topic.state === "active") {
      if (demandWorker && ["claimed", "running"].includes(demandWorker.status)) {
        runtimeStatus = "running";
      } else if (activeAgentTask) {
        runtimeStatus = "running";
      } else if (demandWorker?.status === "queued") {
        runtimeStatus = "queued";
        blocker = demandWorker.waitingReason ?? "等待本地处理槽位。";
      } else if (demandWorker && ["needs-user-input", "failed"].includes(demandWorker.status)) {
        runtimeStatus = "blocked";
        blocker = demandWorker.failureReason ?? demandWorker.resultSummary ?? "需要用户补充要求或处理证据。";
      } else if (demandWorker?.status === "result-ready") {
        runtimeStatus = "waiting-decision";
      } else if (latestQueue && ["blocked", "failed"].includes(latestQueue.status)) {
        runtimeStatus = "blocked";
        blocker = latestQueue.blockedReason ?? latestQueue.failureReason ?? "任务暂停，需要处理当前任务。";
      } else if (blockingApproval) {
        runtimeStatus = "blocked";
      } else if (runningRun || latestQueue?.status === "running") {
        runtimeStatus = "running";
      } else if (latestQueue && ["queued", "paused"].includes(latestQueue.status)) {
        runtimeStatus = "queued";
      } else if (topicApprovals.length > 0) {
        runtimeStatus = "waiting-decision";
      }
    }
    return {
      id: topic.id,
      title: topic.title,
      state: topic.state,
      runtimeStatus,
      userStatus: userDecisionStateForRuntime(runtimeStatus),
      userStatusLabel: userDecisionStateLabel(userDecisionStateForRuntime(runtimeStatus)),
      conversationLifecycle: topic.state === "archive" ? "archived-readonly" : runtimeStatus === "running" ? "running" : "active",
      linkedFromChangeId: topic.boundChangeId ?? undefined,
      selected: topic.id === selectedTopicId || topic.name === selectedTopicId,
      waitingDecisionCount: topicApprovals.length,
      latestRunStatus: demandWorker?.status ?? latestRun?.status,
      latestRunId: latestRun?.id,
      queueStatus: demandWorker?.status ?? latestQueue?.status,
      blocker,
      updatedAt: demandWorker?.updatedAt ?? latestRun?.finishedAt ?? latestRun?.startedAt ?? latestQueue?.updatedAt ?? topic.updatedAt,
    };
  }));
  const running = sortByTimestampDesc(
    summaries.filter((item) => item.runtimeStatus === "running"),
    (item) => item.updatedAt,
  );
  for (const extra of running.slice(1)) {
    extra.runtimeStatus = "queued";
    extra.userStatus = "later";
    extra.userStatusLabel = userDecisionStateLabel("later");
    extra.conversationLifecycle = "waiting-user";
    extra.blocker = "Single-worker mode: this demand is waiting for the current run slot.";
  }
  return summaries.sort((a, b) => workpadRuntimeRank(a.runtimeStatus) - workpadRuntimeRank(b.runtimeStatus) || (b.updatedAt ?? b.title).localeCompare(a.updatedAt ?? a.title));
}

function workpadRuntimeRank(status: WorkbenchWorkpadRuntimeStatus): number {
  if (status === "running") return 0;
  if (status === "blocked") return 1;
  if (status === "waiting-decision") return 2;
  if (status === "queued") return 3;
  if (status === "active") return 4;
  if (status === "readonly") return 5;
  return 6;
}

function userDecisionStateForRuntime(status: WorkbenchWorkpadRuntimeStatus): WorkbenchUserDecisionState {
  if (status === "running") return "processing";
  if (status === "blocked") return "needs-rework";
  if (status === "waiting-decision") return "waiting-confirmation";
  if (status === "queued" || status === "readonly") return "later";
  if (status === "archived") return "completed";
  return "waiting-confirmation";
}

function userDecisionStateLabel(state: WorkbenchUserDecisionState): string {
  if (state === "processing") return "处理中";
  if (state === "waiting-confirmation") return "等你确认";
  if (state === "needs-rework") return "需要修改或补证据";
  if (state === "later") return "稍后处理";
  if (state === "abandoned") return "已放弃";
  return "已完成";
}
