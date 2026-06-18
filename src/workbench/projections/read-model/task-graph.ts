import { isActiveTaskRunStatus } from "../../../task-run/manager.js";
import type {
  AuditSummary,
  RunMetadata,
  TaskRun,
  ValidationSummary,
  WorkerLease,
} from "../../../types/index.js";
import type {
  WorkbenchAutoReworkSummary,
  WorkbenchCodingPackage,
  WorkbenchCodingPackageExecutionUnit,
  WorkbenchCodingPackageSplitReadiness,
  WorkbenchCodingPackageStatus,
  WorkbenchTaskEvidence,
  WorkbenchTaskGraph,
  WorkbenchTaskNextAction,
  WorkbenchTaskNode,
  WorkbenchTaskNodeStatus,
  WorkbenchTaskQueueSummary,
  WorkbenchTaskRunSummary,
  WorkbenchTopicDetail,
  WorkbenchWorkerLeaseSummary,
  WorkpadTaskPreview,
} from "../../read-model-types.js";
import { latestByCreatedAt, latestByTimestamp, sortByTimestampDesc } from "./projection-summary.js";

const OFFICIAL_REWORK_BUDGET = 1;

export function emptyTaskGraph(): WorkbenchTaskGraph {
  return {
    source: "missing",
    nodes: [],
    changeLevelEvidence: [],
    warnings: [],
  };
}

export function buildCodingPackages(topic: WorkbenchTopicDetail, taskGraph: WorkbenchTaskGraph): WorkbenchCodingPackage[] {
  if (taskGraph.nodes.length === 0) return [];
  const pendingTasks = taskGraph.nodes.filter((node) => !node.checked);
  const completedTasks = taskGraph.nodes.filter((node) => node.checked);
  const packageTasks = pendingTasks.length > 0 ? pendingTasks : taskGraph.nodes;
  const taskIds = packageTasks.map((node) => node.taskId);
  const completedTaskIds = completedTasks.map((node) => node.taskId);
  const acIds = uniqueStrings(taskGraph.nodes.flatMap((node) => node.acIds));
  const coveredAcIds = uniqueStrings(taskGraph.nodes
    .filter((node) => node.checked || node.latestEvidence.length > 0)
    .flatMap((node) => node.acIds));
  const missingEvidenceAcIds = acIds.filter((acId) => !coveredAcIds.includes(acId));
  const blocked = packageTasks.some((node) => node.status === "blocked");
  const hasEvidence = packageTasks.some((node) => node.latestEvidence.length > 0 || node.status === "evidence-ready" || node.status === "checked");
  const status: WorkbenchCodingPackageStatus = topic.state !== "active"
    ? "readonly"
    : blocked
      ? "blocked"
      : pendingTasks.length === 0 && hasEvidence
        ? "evidence-ready"
        : "suggested";
  const splitReadiness = codingPackageSplitReadiness(packageTasks);
  const executionUnit: WorkbenchCodingPackageExecutionUnit = splitReadiness === "candidate" ? "future-parallel-candidate" : "single-agent";
  return [{
    id: `coding-package:${topic.id}:implementation`,
    title: `${topic.title} implementation package`,
    summary: pendingTasks.length > 0
      ? `默认由一个 coder-agent 处理 ${pendingTasks.length} 个未勾选任务，并把已勾选任务作为上下文和 evidence。`
      : "当前已确认任务均已勾选；该执行单元只保留为完成上下文和证据汇总。",
    taskIds,
    completedTaskIds,
    acIds,
    coveredAcIds,
    missingEvidenceAcIds,
    recommendedRoleId: "coder-agent",
    executionUnit,
    assignmentStatus: pendingTasks.length > 0 ? "suggested" : "not-assigned",
    splitReadiness,
    splitRationale: codingPackageSplitRationale(splitReadiness, packageTasks),
    mergeRisk: codingPackageMergeRisk(splitReadiness),
    status,
  }];
}

export function taskNodeToPreview(node: WorkbenchTaskNode): WorkpadTaskPreview {
  return {
    id: node.taskId,
    title: node.title,
    done: node.checked,
    acIds: node.acIds,
    warnings: node.blockers,
  };
}

export function buildTaskQueueSummary(
  topic: WorkbenchTopicDetail,
  _readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
): WorkbenchTaskQueueSummary | undefined {
  const queue = latestByCreatedAt(topic.taskQueues ?? []);
  const queueActionType = queue?.status === "paused" ? "task.queue.start" : "task.queue.reconcile";
  const baseAction: WorkbenchTaskNextAction | undefined = queue
    ? {
        id: `task-queue:${queue.id}:${queueActionType}`,
        label: queue.status === "paused" ? "继续处理" : "刷新执行状态",
        actionType: queueActionType,
        enabled: topic.state === "active",
        requiresConfirmation: true,
        workflowRunId: queue.workflowRunId,
        queueRunId: queue.id,
        taskQueueProposalId: queue.taskQueueProposalId,
        workflowGraphPlanId: queue.workflowGraphPlanId,
        readinessManifestId: queue.readinessManifestId,
        decompositionPlanId: queue.decompositionPlanId,
        disabledReason: topic.state === "active" ? undefined : "需求对话不是可执行状态。",
      }
    : undefined;
  if (!queue) return {
    id: "none",
    status: "none",
    totalCount: topic.acMap?.tasks.filter((task) => !task.done).length ?? 0,
    completedCount: 0,
    nextAction: baseAction,
    items: [],
  };
  const items = topic.taskQueueItems
    .filter((item) => item.queueRunId === queue.id)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      id: item.id,
      taskId: item.taskId,
      order: item.order,
      status: item.status,
      taskRunId: item.taskRunId,
      blockedReason: item.blockedReason,
      failureReason: item.failureReason,
    }));
  return {
    id: queue.id,
    status: queue.status,
    currentTaskId: queue.currentTaskId,
    totalCount: queue.totalCount,
    completedCount: queue.completedCount,
    blockedReason: queue.blockedReason,
    failureReason: queue.failureReason,
    pausedReason: queue.pausedReason,
    workflowRunId: queue.workflowRunId,
    taskQueueProposalId: queue.taskQueueProposalId,
    workflowGraphPlanId: queue.workflowGraphPlanId,
    readinessManifestId: queue.readinessManifestId,
    decompositionPlanId: queue.decompositionPlanId,
    nextAction: baseAction,
    items,
  };
}

export function buildTaskGraph(
  topic: WorkbenchTopicDetail,
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  queue?: WorkbenchTaskQueueSummary,
): WorkbenchTaskGraph {
  if (!topic.acMap || topic.acMap.tasks.length === 0) return emptyTaskGraph();

  const coderRuns = topic.runs.filter((run) => run.runtime === "coder-codex");
  const taskScopedCoderRuns = coderRuns.filter((run) => (run.taskIds?.length ?? 0) > 0);
  const taskRuns = topic.taskRuns ?? [];
  const workerLeases = topic.workerLeases ?? [];
  const taskIds = new Set(topic.acMap.tasks.map((task) => task.id));
  const worktreeTaskIds = new Map<string, string[]>();
  for (const run of taskScopedCoderRuns) {
    const worktreeId = run.worktree?.worktreeId;
    if (!worktreeId) continue;
    worktreeTaskIds.set(worktreeId, (run.taskIds ?? []).filter((taskId) => taskIds.has(taskId)));
  }

  const validations = topic.validations as ValidationSummary[];
  const audits = topic.audits as AuditSummary[];
  const matchedValidationIds = new Set<string>();
  const matchedAuditIds = new Set<string>();

  const nodes = topic.acMap.tasks.map((task) => {
    const runs = taskScopedCoderRuns.filter((run) => run.taskIds?.includes(task.id));
    const taskRunAttempts = sortByTimestampDesc(
      taskRuns.filter((run) => run.taskId === task.id),
      (run) => run.createdAt,
    );
    const latestTaskRun = taskRunAttempts[0];
    const latestLease = latestTaskRun?.leaseId ? workerLeases.find((lease) => lease.id === latestTaskRun.leaseId) : undefined;
    const running = taskRunAttempts.some((run) => isActiveTaskRunStatus(run.status)) || runs.some((run) => run.status === "created" || run.status === "running");
    const worktreeIds = new Set(runs.map((run) => run.worktree?.worktreeId).filter((item): item is string => Boolean(item)));
    const taskValidations = validations.filter((validation) => Boolean(validation.worktreeId && worktreeIds.has(validation.worktreeId)));
    const taskAudits = audits.filter((audit) => Boolean(audit.worktreeId && worktreeIds.has(audit.worktreeId)));
    taskValidations.forEach((validation) => matchedValidationIds.add(validation.id));
    taskAudits.forEach((audit) => matchedAuditIds.add(audit.id));

    const evidence = [
      ...runs.map(taskRunEvidence),
      ...taskValidations.map(taskValidationEvidence),
      ...taskAudits.map(taskAuditEvidence),
    ].sort(compareEvidenceDesc).slice(0, 6);
    const queueActiveForTask = isQueueActiveForTask(queue, task.id);
    const blockers = buildTaskBlockers(topic, readiness, runs, taskValidations, taskAudits, running || queueActiveForTask, latestTaskRun, queueActiveForTask);
    const latestValidation = latestByTimestamp(taskValidations, (validation) => validation.finishedAt);
    const latestAudit = latestByTimestamp(taskAudits, (audit) => audit.finishedAt);
    const status: WorkbenchTaskNodeStatus = task.done
      ? "checked"
      : running
        ? "running"
        : latestTaskRun?.status === "blocked" || latestTaskRun?.status === "failed" || blockers.some((item) => item.includes("failed") || item.includes("blocked") || item.includes("失败") || item.includes("阻塞") || item.includes("前置条件"))
          ? "blocked"
          : latestTaskRun?.status === "completed" || evidence.length > 0
            ? "evidence-ready"
            : "planned";

    return {
      taskId: task.id,
      title: task.text,
      acIds: task.acIds,
      checked: task.done,
      status,
      taskRun: latestTaskRun ? summarizeTaskRun(latestTaskRun) : undefined,
      workerLease: latestLease ? summarizeWorkerLease(latestLease) : undefined,
      latestEvidence: evidence,
      blockers,
      nextAction: buildTaskNextAction(topic, readiness, task.id, running, latestTaskRun, queueActiveForTask),
      autoRework: latestTaskRun ? buildAutoReworkSummary(latestTaskRun, latestValidation, latestAudit) : undefined,
    };
  });

  const changeLevelEvidence = [
    ...coderRuns.filter((run) => !run.taskIds?.length).map(taskRunEvidence),
    ...validations.filter((validation) => !validation.worktreeId || !worktreeTaskIds.has(validation.worktreeId) || !matchedValidationIds.has(validation.id)).map(taskValidationEvidence),
    ...audits.filter((audit) => !audit.worktreeId || !worktreeTaskIds.has(audit.worktreeId) || !matchedAuditIds.has(audit.id)).map(taskAuditEvidence),
  ].sort(compareEvidenceDesc).slice(0, 8);

  return {
    source: "accepted-tasks",
    nodes,
    changeLevelEvidence,
    warnings: [],
  };
}

export function latestOfficialReworkAttempt(taskGraph: WorkbenchTaskGraph): number | undefined {
  const attempts = taskGraph.nodes
    .map((node) => node.taskRun?.attempt)
    .filter((attempt): attempt is number => typeof attempt === "number");
  return attempts.length > 0 ? Math.max(...attempts) - 1 : undefined;
}

function codingPackageSplitReadiness(tasks: WorkbenchTaskNode[]): WorkbenchCodingPackageSplitReadiness {
  if (tasks.length === 0) return "unknown";
  if (tasks.length === 1) return "likely-single";
  const mappedTasks = tasks.filter((task) => task.acIds.length > 0);
  if (mappedTasks.length !== tasks.length) return "likely-single";
  const seen = new Set<string>();
  for (const task of mappedTasks) {
    for (const acId of task.acIds) {
      if (seen.has(acId)) return "likely-single";
      seen.add(acId);
    }
  }
  return "candidate";
}

function codingPackageSplitRationale(readiness: WorkbenchCodingPackageSplitReadiness, tasks: WorkbenchTaskNode[]): string {
  if (readiness === "candidate") return "这些未完成任务映射到不同 AC，未来可作为并行 worktree 候选；5Y 仍不自动拆分执行。";
  if (readiness === "unknown") return "缺少任务/AC 映射，无法判断是否适合拆分。";
  return tasks.length <= 1
    ? "当前只有一个主要待执行任务，默认不拆分。"
    : "多个任务仍属于同一个需求实现包，先由一个 coder-agent 处理，避免过早引入拆分和合并成本。";
}

function codingPackageMergeRisk(readiness: WorkbenchCodingPackageSplitReadiness): string {
  if (readiness === "candidate") return "未来并行执行需要 integration worktree、aggregate validation/audit 和 merge/rework 链路。";
  if (readiness === "unknown") return "拆分风险未知；保持单 agent 执行更稳妥。";
  return "单 agent work package 的合并风险较低；任务覆盖检查用于确认验收范围，不强制拆分 coder。";
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function buildAutoReworkSummary(
  taskRun: TaskRun,
  latestValidation: ValidationSummary | undefined,
  latestAudit: AuditSummary | undefined,
): WorkbenchAutoReworkSummary {
  const officialReworkAttempt = Math.max(0, taskRun.attempt - 1);
  return {
    available: ["blocked", "failed"].includes(taskRun.status) && officialReworkAttempt < OFFICIAL_REWORK_BUDGET,
    attempt: officialReworkAttempt,
    budget: OFFICIAL_REWORK_BUDGET,
    reason: latestValidation?.status === "failed"
      ? "验证未通过，系统会把证据交回 coder-agent 修改。"
      : latestAudit?.status === "blocked" || latestAudit?.status === "failed"
        ? "审查未通过，系统会把审查证据交回 coder-agent 修改或补证据。"
        : taskRun.failureReason ?? taskRun.blockedReason ?? "任务未完成，需要判断是否能自动修改。",
    failureClassification: latestValidation?.status === "failed"
      ? "code-test-failure"
      : latestAudit?.status === "blocked" || latestAudit?.status === "failed"
        ? "audit-semantic-failure"
        : taskRun.status === "failed"
          ? "environment-failure"
          : "unknown",
  };
}

function isQueueActiveForTask(queue: WorkbenchTaskQueueSummary | undefined, taskId: string): boolean {
  if (!queue || queue.status === "none") return false;
  if (!["queued", "running", "paused"].includes(queue.status)) return false;
  return queue.items.length === 0 || queue.items.some((item) => item.taskId === taskId && (item.status === "queued" || item.status === "running"));
}

function summarizeTaskRun(taskRun: TaskRun): WorkbenchTaskRunSummary {
  const officialReworkAttempt = Math.max(0, taskRun.attempt - 1);
  return {
    id: taskRun.id,
    status: taskRun.status,
    attempt: taskRun.attempt,
    roleId: taskRun.roleId,
    runId: taskRun.runId,
    worktreeId: taskRun.worktreeId,
    blockedReason: taskRun.blockedReason,
    failureReason: taskRun.failureReason,
    officialReworkAttempt,
    autoReworkAvailable: ["blocked", "failed"].includes(taskRun.status) && officialReworkAttempt < OFFICIAL_REWORK_BUDGET,
    reworkBudget: OFFICIAL_REWORK_BUDGET,
  };
}

function summarizeWorkerLease(lease: WorkerLease): WorkbenchWorkerLeaseSummary {
  return {
    id: lease.id,
    status: lease.status,
    workerId: lease.workerId,
    claimedAt: lease.claimedAt,
    expiresAt: lease.expiresAt,
  };
}

function taskRunEvidence(run: RunMetadata): WorkbenchTaskEvidence {
  return {
    id: `run:${run.id}`,
    label: `Coder ${run.status}`,
    source: "run",
    status: run.status,
    runId: run.id,
    worktreeId: run.worktree?.worktreeId,
    artifact: run.artifacts.directory,
    timestamp: run.finishedAt ?? run.startedAt,
  };
}

function taskValidationEvidence(validation: ValidationSummary): WorkbenchTaskEvidence {
  return {
    id: `validation:${validation.id}`,
    label: `Validation ${validation.status}`,
    source: "validation",
    status: validation.status,
    runId: validation.runId,
    worktreeId: validation.worktreeId,
    timestamp: validation.finishedAt,
  };
}

function taskAuditEvidence(audit: AuditSummary): WorkbenchTaskEvidence {
  return {
    id: `audit:${audit.id}`,
    label: `Audit ${audit.status}`,
    source: "audit",
    status: audit.status,
    runId: audit.runId,
    worktreeId: audit.worktreeId,
    timestamp: audit.finishedAt,
  };
}

function compareEvidenceDesc(a: WorkbenchTaskEvidence, b: WorkbenchTaskEvidence): number {
  return (b.timestamp ?? "").localeCompare(a.timestamp ?? "");
}

function buildTaskBlockers(
  topic: WorkbenchTopicDetail,
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  runs: RunMetadata[],
  validations: ValidationSummary[],
  audits: AuditSummary[],
  running: boolean,
  latestTaskRun?: TaskRun,
  queueActiveForTask = false,
): string[] {
  const blockers: string[] = [];
  if (topic.state !== "active") blockers.push("需求对话已只读。");
  if (!readiness.specReady || !readiness.planReady || !readiness.tasksReady) blockers.push("前置条件未满足：需要已确认的需求说明 / 执行方案 / 任务。");
  if (queueActiveForTask) blockers.push("本地顺序执行正在运行或等待恢复。");
  else if (running) blockers.push("已有该任务的运行正在进行。");
  const latestRun = latestByTimestamp(runs, (run) => run.finishedAt ?? run.startedAt);
  const latestValidation = latestByTimestamp(validations, (validation) => validation.finishedAt);
  const latestAudit = latestByTimestamp(audits, (audit) => audit.finishedAt);
  if (latestRun?.status === "failed") blockers.push("Coder run failed.");
  if (latestValidation?.status === "failed") blockers.push("Validation failed.");
  if (latestAudit?.status === "blocked" || latestAudit?.status === "failed") blockers.push(`Audit ${latestAudit.status}.`);
  if (latestTaskRun?.blockedReason) blockers.push(latestTaskRun.blockedReason);
  if (latestTaskRun?.failureReason) blockers.push(latestTaskRun.failureReason);
  return blockers;
}

function buildTaskNextAction(
  topic: WorkbenchTopicDetail,
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  taskId: string,
  running: boolean,
  latestTaskRun?: TaskRun,
  queueActiveForTask = false,
): WorkbenchTaskNextAction {
  const disabledReason = queueActiveForTask ? "本地顺序执行正在运行或等待恢复。" : taskActionDisabledReason(topic, readiness, running);
  if ((latestTaskRun?.status === "blocked" || latestTaskRun?.status === "failed") && !disabledReason) {
    const officialReworkAttempt = Math.max(0, latestTaskRun.attempt - 1);
    if (officialReworkAttempt < OFFICIAL_REWORK_BUDGET) {
      return {
        id: `task:${taskId}:auto-rework:${latestTaskRun.id}`,
        label: "正在自动修改",
        actionType: "task.run.retry",
        taskIds: [taskId],
        taskRunId: latestTaskRun.id,
        enabled: false,
        requiresConfirmation: false,
        disabledReason: "系统会自动把官方验证/审查失败证据交回 coder-agent。",
      };
    }
    return {
      id: `task:${taskId}:task.run.retry:${latestTaskRun.id}`,
      label: "要求修改",
      actionType: "task.run.retry",
      taskIds: [taskId],
      taskRunId: latestTaskRun.id,
      enabled: true,
      requiresConfirmation: true,
    };
  }
  return {
    id: `task:${taskId}:task.run.start`,
    label: "运行此任务",
    actionType: "task.run.start",
    taskIds: [taskId],
    enabled: !disabledReason,
    requiresConfirmation: true,
    disabledReason,
  };
}

function taskActionDisabledReason(
  topic: WorkbenchTopicDetail,
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  running: boolean,
): string | undefined {
  if (topic.state !== "active") return "需求对话不是可执行状态。";
  if (!readiness.specReady) return "先接受 Spec。";
  if (!readiness.planReady) return "先接受 Plan。";
  if (!readiness.tasksReady) return "先接受 Tasks。";
  if (running) return "该任务已有运行中 workflow。";
  return undefined;
}
