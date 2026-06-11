import { existsSync } from "node:fs";
import { listRuns } from "../../../run/manager.js";
import { listDemandWorkers } from "../../../demand-worker/manager.js";
import { listTaskQueues } from "../../../task-queue/manager.js";
import { getLatestWorkflowRun, summarizeWorkflowRun } from "../../../workflow-run/manager.js";
import {
  buildTypedWorkflowNextAction,
  readLatestDecompositionPlanSummary,
  readLatestDecompositionReadinessSummary,
  readLatestSchedulerDispatchDryRunSummary,
  readLatestSchedulerContractSummary,
  readLatestSchedulerWorkerSessionPlanSummary,
  readLatestTaskQueueProposalSummary,
  readLatestWorkflowGraphPlanSummary,
  type WorkbenchDecompositionPlanSummary,
  type WorkbenchDecompositionReadinessSummary,
  type WorkbenchSchedulerContractSummary,
  type WorkbenchSchedulerDispatchDryRunSummary,
  type WorkbenchSchedulerWorkerSessionPlanSummary,
  type WorkbenchTaskQueueProposalSummary,
  type WorkbenchWorkflowGraphPlanSummary,
} from "../../workflow-projection.js";
import type { ClarificationRequest } from "../../intake.js";
import { isConcreteChangeFile } from "./thread-stream.js";
import { buildAgentTaskSummaries } from "./agent-task-summary.js";
import { buildMaintenanceSummary } from "./maintenance-summary.js";
import { readLatestPlanningBundleProjection } from "./lazy-projections.js";
import {
  buildResultReview,
  classifySelectedTopicFailure,
  requiresUserInputReason,
} from "./result-review.js";
import {
  buildCodingPackages,
  buildTaskGraph,
  buildTaskQueueSummary,
  emptyTaskGraph,
  latestOfficialReworkAttempt,
  taskNodeToPreview,
} from "./task-graph.js";
import type {
  AuditSummary,
  ManagedProject,
  ResolvedMemory,
  ValidationSummary,
  WorkflowRunSummary,
} from "../../../types/index.js";
import type {
  HarnessGap,
  WorkbenchAgentTaskSummary,
  WorkbenchApprovalItem,
  WorkbenchConversationLifecycle,
  WorkbenchDecisionItem,
  WorkbenchPendingFeedback,
  WorkbenchPlanningArtifactBundle,
  WorkbenchPostArchiveEvolutionCandidate,
  WorkbenchRolePipelineSummary,
  WorkbenchRoleRunSummary,
  WorkbenchScopedFeedbackTarget,
  WorkbenchTaskGraph,
  WorkbenchTaskQueueSummary,
  WorkbenchTopicDetail,
  WorkbenchTopicState,
  WorkbenchTopicSummary,
  WorkbenchUserDecisionState,
  WorkbenchWorkpad,
  WorkbenchWorkpadRuntimeStatus,
  WorkbenchWorkpadSummary,
  WorkpadBackgroundActivitySummary,
  WorkpadEvidenceSummary,
  WorkpadIntakeSummary,
  WorkpadMemoryIsolationSummary,
  WorkpadNextAction,
  WorkpadProgress,
  WorkpadRelatedMemorySummary,
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
      goal: "尚未选择可用的 AHO 项目记忆。",
      currentUnderstanding: "Workbench 只能显示诊断信息；需要注册项目并初始化 Harness 后才能读取 Topic、Run 和 evidence。",
      source: "diagnostic",
      relatedArtifacts: [],
      missingInfo: ["Durable memory is unavailable."],
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
      disabledReason: "当前 snapshot 没有可写的项目记忆。",
    },
    background: emptyWorkpadBackground(),
    memoryIsolation: diagnosticMemoryIsolation(warnings),
  };
}

export async function buildWorkbenchWorkpad(input: {
  project: ManagedProject | null;
  memory: ResolvedMemory;
  topics: WorkbenchTopicSummary[];
  workpads: WorkbenchWorkpadSummary[];
  selectedTopic: WorkbenchTopicDetail | null;
  approvals: WorkbenchApprovalItem[];
  decisions: WorkbenchDecisionItem[];
  warnings: string[];
  gaps: HarnessGap[];
}): Promise<WorkbenchWorkpad> {
  const { project, memory, topics, workpads, selectedTopic, approvals, decisions, warnings, gaps } = input;
  if (!selectedTopic) {
    return {
      title: "项目需求",
      subtitle: project?.name ?? "未选择项目",
      state: "empty",
      userStatus: "later",
      userStatusLabel: userDecisionStateLabel("later"),
      conversationLifecycle: "active",
      pendingFeedback: [],
      intake: {
        goal: topics.length > 0 ? "选择一个需求查看进度。" : "还没有需求对话。",
        currentUnderstanding: topics.length > 0
          ? `当前项目有 ${topics.length} 个 Topic，可从左侧选择继续。`
          : "输入需求后，AHO 会创建内部 Change，并把后续方案、运行和证据汇总到这个需求对话。",
        source: "project",
        relatedArtifacts: [],
        missingInfo: topics.length > 0 ? [] : ["No Topic exists yet."],
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
      evidence: approvals.slice(0, 5).map(approvalWorkpadEvidence),
      blockers: warnings,
      warnings: gaps.filter((gap) => gap.status !== "available").map((gap) => gap.summary),
      nextAction: {
        id: "create-topic",
        label: "输入需求创建需求对话",
        description: "在底部输入自然语言需求，创建新的需求对话。",
        kind: "read-only",
        enabled: true,
        requiresConfirmation: false,
      },
      background: buildWorkpadBackground(workpads, undefined),
      memoryIsolation: buildWorkpadMemoryIsolation(memory, null, workpads),
      maintenance: await buildMaintenanceSummary(memory),
    };
  }

  const [specReady, planReady, tasksReady] = await Promise.all([
    isConcreteChangeFile(memory, selectedTopic.path, "spec.md"),
    isConcreteChangeFile(memory, selectedTopic.path, "plan.md"),
    isConcreteChangeFile(memory, selectedTopic.path, "tasks.md"),
  ]);
  const topicApprovals = approvals.filter((approval) => !approval.changeId || approval.changeId === selectedTopic.id);
  const topicDecisions = decisions.filter((decision) => !decision.changeId || decision.changeId === selectedTopic.id);
  const latestRun = [...selectedTopic.runs].sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""))[0];
  const latestValidation = [...(selectedTopic.validations as ValidationSummary[])].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  const latestAudit = [...(selectedTopic.audits as AuditSummary[])].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  const intake = buildWorkpadIntake(selectedTopic);
  const taskQueue = buildTaskQueueSummary(selectedTopic, { specReady, planReady, tasksReady });
  const taskGraph = buildTaskGraph(selectedTopic, { specReady, planReady, tasksReady }, taskQueue);
  const codingPackages = buildCodingPackages(selectedTopic, taskGraph);
  const planningBundle = await readLatestPlanningBundleProjection(memory, selectedTopic.path);
  const decompositionPlan = await readLatestDecompositionPlanSummary(memory, selectedTopic.path);
  const decompositionReadiness = await readLatestDecompositionReadinessSummary(memory, selectedTopic.path);
  const taskQueueProposal = await readLatestTaskQueueProposalSummary(memory, selectedTopic.path);
  const workflowGraphPlan = await readLatestWorkflowGraphPlanSummary(memory, selectedTopic.path);
  const schedulerContract = await readLatestSchedulerContractSummary(memory, selectedTopic.path);
  const schedulerDispatchDryRun = await readLatestSchedulerDispatchDryRunSummary(memory, selectedTopic.path);
  const schedulerWorkerSessionPlan = await readLatestSchedulerWorkerSessionPlanSummary(memory, selectedTopic.path);
  const scopedSchedulerDispatchDryRun = schedulerContract && schedulerDispatchDryRun?.schedulerContractId === schedulerContract.id ? schedulerDispatchDryRun : null;
  const workflowRun = await getLatestWorkflowRun(memory, selectedTopic.id).then((run) => run ? summarizeWorkflowRun(run) : null).catch(() => null);
  const agentTasks = await buildAgentTaskSummaries(memory, selectedTopic.id);
  const rolePipeline = buildRolePipelineSummary(selectedTopic, planningBundle, agentTasks);
  const resultReview = await buildResultReview(project, memory, selectedTopic);
  const maintenance = await buildMaintenanceSummary(memory);
  const runningRun = selectedTopic.runs.find((run) => run.status === "created" || run.status === "running");
  const selectedWorkpadSummary = workpads.find((item) => item.id === selectedTopic.id || item.id === selectedTopic.name);
  const selectedUserState = selectedWorkpadSummary?.userStatus ?? userDecisionStateForSelectedTopic(selectedTopic, topicApprovals, taskQueue, taskGraph);
  const selectedLifecycle = selectedWorkpadSummary?.conversationLifecycle ?? conversationLifecycleForTopic(selectedTopic, taskQueue);

  return {
    title: selectedTopic.title,
    subtitle: `${project?.name ?? "project"} · ${stateLabelForWorkpad(selectedTopic.state)} · ${selectedTopic.id}`,
    state: selectedTopic.state === "active" ? "active" : "readonly",
    userStatus: selectedUserState,
    userStatusLabel: userDecisionStateLabel(selectedUserState),
    conversationId: selectedTopic.id,
    demandId: selectedTopic.id,
    boundChangeId: selectedTopic.id,
    conversationLifecycle: selectedLifecycle,
    pendingFeedback: buildPendingFeedback(selectedTopic),
    coderSelfTestSummary: summarizeCoderSelfTest(selectedTopic),
    officialValidationResult: latestValidation?.status,
    officialAuditResult: latestAudit?.status,
    officialReworkAttempt: latestOfficialReworkAttempt(taskGraph),
    reworkBudget: OFFICIAL_REWORK_BUDGET,
    failureClassification: classifySelectedTopicFailure(selectedTopic, latestValidation, latestAudit, taskGraph),
    requiresUserInputReason: requiresUserInputReason(selectedTopic, latestValidation, latestAudit, taskGraph),
    scopedFeedbackTarget: buildScopedFeedbackTarget(selectedTopic, taskGraph),
    postArchiveEvolutionCandidate: selectedTopic.state === "archive" ? buildPostArchiveEvolutionCandidate(selectedTopic) : undefined,
    planningDraft: planningBundle?.status === "draft" ? planningBundle : undefined,
    planningArtifactBundle: planningBundle ?? undefined,
    decompositionPlan: decompositionPlan ?? undefined,
    decompositionReadiness: decompositionReadiness ?? undefined,
    taskQueueProposal: taskQueueProposal ?? undefined,
    workflowGraphPlan: workflowGraphPlan ?? undefined,
    schedulerContract: schedulerContract ?? undefined,
    schedulerDispatchDryRun: scopedSchedulerDispatchDryRun ?? undefined,
    schedulerWorkerSessionPlan: scopedSchedulerDispatchDryRun && schedulerWorkerSessionPlan?.schedulerDispatchDryRunId === scopedSchedulerDispatchDryRun.id ? schedulerWorkerSessionPlan : undefined,
    workflowRun: workflowRun ?? undefined,
    rolePipeline,
    resultReview,
    maintenance,
    runControlState: {
      canStop: Boolean(runningRun),
      stopActionType: runningRun ? "conversation.interrupt" : undefined,
      pendingFeedbackCount: selectedTopic.threadItems.filter((item) => item.kind === "user-message" && item.status === "pending-feedback").length,
      explanation: runningRun ? "支持实时引导时，补充要求会发送给当前执行；不支持时会记录到下一轮。停止会保留证据并进入下一轮方案或修改。" : "当前没有正在执行的需求。",
    },
    intake,
    progress: {
      topicState: selectedTopic.state,
      spec: specReady ? "ready" : "missing",
      plan: planReady ? "ready" : "missing",
      tasks: tasksReady ? "ready" : "missing",
      acCount: selectedTopic.acCount ?? 0,
      taskCount: selectedTopic.taskCount ?? 0,
      runCount: selectedTopic.runs.length,
      latestRunStatus: latestRun?.status,
      validationStatus: latestValidation?.status,
      auditStatus: latestAudit?.status,
    },
    tasks: taskGraph.nodes.map(taskNodeToPreview),
    codingPackages,
    taskGraph,
    taskQueue,
    evidence: buildWorkpadEvidence(selectedTopic, topicApprovals, topicDecisions),
    blockers: [
      ...(selectedTopic.closeGate?.blockingIssues ?? []),
      ...(selectedTopic.closeGate?.warnings ?? []),
      ...warnings,
    ],
    warnings: [
      ...workpadMissingWarnings(specReady, planReady, tasksReady, selectedTopic),
      ...gaps.filter((gap) => gap.status !== "available").map((gap) => gap.summary),
    ],
    nextAction: buildWorkpadNextAction(selectedTopic, topicApprovals, { specReady, planReady, tasksReady }, intake, taskQueue, taskGraph, planningBundle, decompositionPlan, decompositionReadiness, taskQueueProposal, workflowGraphPlan, schedulerContract, scopedSchedulerDispatchDryRun, schedulerWorkerSessionPlan, workflowRun),
    background: buildWorkpadBackground(workpads, selectedTopic.id),
    memoryIsolation: buildWorkpadMemoryIsolation(memory, selectedTopic, workpads),
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

function conversationLifecycleForTopic(topic: WorkbenchTopicDetail, queue?: WorkbenchTaskQueueSummary): WorkbenchConversationLifecycle {
  if (topic.state === "archive") return "archived-readonly";
  if (topic.runs.some((run) => run.status === "created" || run.status === "running") || queue?.status === "running") return "running";
  const hasPendingFeedback = topic.threadItems.some((item) => item.status === "pending-feedback");
  return hasPendingFeedback ? "waiting-user" : "active";
}

function buildPendingFeedback(topic: WorkbenchTopicDetail): WorkbenchPendingFeedback[] {
  return topic.threadItems
    .filter((item) => item.kind === "user-message" && item.status === "pending-feedback")
    .map((item) => ({
      id: item.id,
      text: item.body ?? "",
      timestamp: item.timestamp ?? "",
      runId: item.runId,
      status: "pending-next-turn" as const,
    }));
}

function summarizeCoderSelfTest(topic: WorkbenchTopicDetail): string | undefined {
  const latestCoder = [...topic.runs]
    .filter((run) => run.runtime === "coder-codex")
    .sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""))[0];
  if (!latestCoder) return undefined;
  if (latestCoder.status === "running" || latestCoder.status === "created") return "正在实现、自测并修正。";
  if (latestCoder.status === "completed") return "Coder 已完成实现和可用自测，等待独立验证/审查确认。";
  return "Coder 执行失败，需查看运行证据。";
}

function buildScopedFeedbackTarget(topic: WorkbenchTopicDetail, taskGraph: WorkbenchTaskGraph): WorkbenchScopedFeedbackTarget | undefined {
  const blocked = taskGraph.nodes.find((node) => node.status === "blocked") ?? taskGraph.nodes.find((node) => node.taskRun);
  const latestRun = [...topic.runs].sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""))[0];
  if (!blocked && !latestRun) return undefined;
  return {
    changeId: topic.id,
    taskId: blocked?.taskId,
    taskRunId: blocked?.taskRun?.id,
    runId: blocked?.taskRun?.runId ?? latestRun?.id,
    roleId: blocked?.taskRun?.roleId ?? "coder",
    evidenceRef: blocked?.latestEvidence[0]?.artifact,
  };
}

function buildPostArchiveEvolutionCandidate(topic: WorkbenchTopicDetail): WorkbenchPostArchiveEvolutionCandidate {
  return {
    changeId: topic.id,
    status: "candidate",
    sources: ["main-thread", "accepted-artifacts", "diff", "validation", "audit", "final-decision", "archive-summary"],
    summary: "该归档需求可作为后续 Documentation / Architecture / Evolution agent 的候选输入；Phase 6A 不自动修改 canonical docs。",
  };
}

function buildRolePipelineSummary(
  topic: WorkbenchTopicDetail,
  planningBundle: WorkbenchPlanningArtifactBundle | null,
  agentTasks: WorkbenchAgentTaskSummary[],
): WorkbenchRolePipelineSummary | undefined {
  const coderRuns = topic.runs.filter((run) => run.runtime === "coder-codex");
  const validationRuns = topic.validations as ValidationSummary[];
  const auditRuns = topic.audits as AuditSummary[];
  if (!planningBundle && coderRuns.length === 0 && validationRuns.length === 0 && auditRuns.length === 0 && agentTasks.length === 0) return undefined;
  const latestCoder = [...coderRuns].sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""))[0];
  const latestValidation = [...validationRuns].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  const latestAudit = [...auditRuns].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  const runs: WorkbenchRoleRunSummary[] = [];
  if (planningBundle) runs.push({ roleId: "planning-agent", status: planningBundle.status, summary: planningBundle.goal, artifact: planningBundle.artifact });
  if (latestCoder) runs.push({ roleId: "coder-agent", status: latestCoder.status, runId: latestCoder.id, summary: latestCoder.status === "completed" ? "Coder finished implementation/self-test attempt." : "Coder attempt is not completed.", artifact: latestCoder.artifacts.directory });
  if (latestValidation) runs.push({ roleId: "validator", status: latestValidation.status, runId: latestValidation.runId, summary: `Validation ${latestValidation.status}.` });
  if (latestAudit) runs.push({ roleId: "auditor-agent", status: latestAudit.status, runId: latestAudit.runId, summary: `Audit ${latestAudit.status}.` });
  const stage: WorkbenchRolePipelineSummary["stage"] = latestAudit
    ? (latestAudit.status === "approved" || latestAudit.status === "approved-with-notes" ? "done" : "needs-user-input")
    : latestValidation
      ? (latestValidation.status === "passed" ? "audit" : "rework")
      : latestCoder
        ? (latestCoder.status === "completed" ? "validation" : "coding")
        : "planning";
  const status: WorkbenchRolePipelineSummary["status"] = topic.runs.some((run) => run.status === "created" || run.status === "running")
    ? "running"
    : stage === "needs-user-input" ? "needs-user-input" : stage === "done" ? "completed" : planningBundle?.status === "confirmed" ? "completed" : "draft";
  return { stage, status, runs, agentTasks, reworkUsed: 0, reworkBudget: OFFICIAL_REWORK_BUDGET };
}

function buildWorkpadBackground(workpads: WorkbenchWorkpadSummary[], selectedId: string | undefined): WorkpadBackgroundActivitySummary {
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
    agentSessionNamespace: "agent/{roleId}/session/{sessionId}",
    runNamespaces: [],
    relatedWorkpads: [],
    stableFactSources: [],
    writeBoundaries: [],
    warnings: ["Durable memory is unavailable; AHO must not infer hidden project history.", ...warnings],
  };
}

function buildWorkpadMemoryIsolation(memory: ResolvedMemory, selectedTopic: WorkbenchTopicDetail | null, workpads: WorkbenchWorkpadSummary[]): WorkpadMemoryIsolationSummary {
  const relatedWorkpads = workpads
    .filter((item) => item.id !== selectedTopic?.id && ["running", "queued", "blocked", "waiting-decision"].includes(item.runtimeStatus))
    .slice(0, 6)
    .map((item): WorkpadRelatedMemorySummary => ({
      changeId: item.id,
      title: item.title,
      status: item.runtimeStatus,
      factBoundary: item.runtimeStatus === "running" || item.runtimeStatus === "queued" ? "local-evidence-only" : "summary-only",
    }));
  const warnings: string[] = [
    "进行中的需求草案、diff、原始输出、JSONL 和进程信息不会进入项目稳定记忆。",
    "Memory consolidation candidates and conflict review are future human-gated workflows.",
  ];
  if (!memory.supported || !existsSync(memory.memoryRoot)) warnings.unshift("Durable memory is unavailable; initialize, sync, or repair memory before relying on history.");
  return {
    projectStableNamespace: "project/stable",
    currentChangeNamespace: selectedTopic ? `change/${selectedTopic.id}` : undefined,
    runNamespaces: selectedTopic ? selectedTopic.runs.slice(0, 5).map((run) => `run/${run.id}`) : [],
    agentSessionNamespace: "agent/{roleId}/session/{sessionId}",
    relatedWorkpads,
    stableFactSources: [
      "applied source changes",
      "已确认的需求说明 / 执行方案 / 任务",
      "已确认的架构 / 产品文档",
      "已确认的 Harness evolution 结果",
      "explicit human memory accepts",
    ],
    writeBoundaries: [
      "coder-agent writes assigned worktree proposal and run artifacts only",
      "orchestrator writes selected demand thread / decision / summary projection",
      "validator and auditor write validation / audit artifacts",
      "project/stable absorbs only human-gated stable facts",
    ],
    warnings,
  };
}

function buildWorkpadIntake(topic: WorkbenchTopicDetail): WorkpadIntakeSummary {
  const firstUser = topic.threadItems.find((item) => item.kind === "user-message" && item.body?.trim());
  const latestAssistant = [...topic.threadItems].reverse().find((item) => (item.kind === "assistant-turn" || item.kind === "assistant-message") && item.body?.trim());
  const latestIteration = [...topic.threadItems].reverse().find((item) => item.intake?.iteration)?.intake?.iteration;
  const latestScan = [...topic.threadItems].reverse().find((item) => item.intake?.scan)?.intake?.scan;
  const clarifications = topic.threadItems
    .map((item) => item.clarification)
    .filter((item): item is ClarificationRequest => Boolean(item));
  const latestClarificationById = new Map<string, ClarificationRequest>();
  for (const clarification of clarifications) latestClarificationById.set(clarification.id, clarification);
  const pendingClarifications = [...latestClarificationById.values()].filter((item) => item.status === "pending");
  const artifacts = topic.threadItems
    .map((item) => item.artifact ?? item.intake?.scan?.runId)
    .filter((artifact): artifact is string => Boolean(artifact))
    .slice(0, 5);
  return {
    goal: firstUser?.body?.trim() || topic.change?.title || topic.title,
    currentUnderstanding: latestIteration?.currentUnderstanding || latestAssistant?.body?.trim() || "等待 AHO 基于当前需求对话事实继续推进。",
    source: latestScan ? "thread" : firstUser ? "thread" : "topic",
    relatedArtifacts: artifacts,
    missingInfo: [
      ...(topic.state === "active" ? [] : ["需求对话已只读，不能继续执行。"]),
      ...(latestIteration?.openQuestions ?? latestScan?.missingInfo ?? []),
    ],
    confirmedConstraints: latestIteration?.confirmedConstraints ?? [],
    openQuestions: latestIteration?.openQuestions ?? [],
    assumptions: latestIteration?.assumptions ?? [],
    pendingClarifications,
  };
}

function buildWorkpadEvidence(topic: WorkbenchTopicDetail, approvals: WorkbenchApprovalItem[], decisions: WorkbenchDecisionItem[]): WorkpadEvidenceSummary[] {
  const runEvidence = topic.runs.slice(-3).map((run) => ({
    id: `run:${run.id}`,
    label: `${run.runtime} · ${run.status}`,
    source: "run" as const,
    status: run.status,
    artifact: run.artifacts?.directory,
    timestamp: run.finishedAt ?? run.startedAt,
  }));
  const validationEvidence = (topic.validations as ValidationSummary[]).slice(-3).map((validation) => ({
    id: `validation:${validation.id}`,
    label: `Validation ${validation.status}`,
    source: "validation" as const,
    status: validation.status,
    timestamp: validation.finishedAt,
  }));
  const auditEvidence = (topic.audits as AuditSummary[]).slice(-3).map((audit) => ({
    id: `audit:${audit.id}`,
    label: `Audit ${audit.status}`,
    source: "audit" as const,
    status: audit.status,
    timestamp: audit.finishedAt,
  }));
  const decisionEvidence = decisions.slice(0, 5).map((decision) => ({
    id: `decision:${decision.id}`,
    label: decision.label,
    source: "decision" as const,
    status: decision.status,
    artifact: decision.artifact,
    timestamp: decision.completedAt ?? decision.updatedAt,
  }));
  const approvalEvidence = approvals.slice(0, 3).map(approvalWorkpadEvidence);
  return [...approvalEvidence, ...decisionEvidence, ...auditEvidence, ...validationEvidence, ...runEvidence]
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
    .slice(0, 8);
}

function approvalWorkpadEvidence(approval: WorkbenchApprovalItem): WorkpadEvidenceSummary {
  return {
    id: `approval:${approval.id}`,
    label: approval.label,
    source: "approval",
    status: approval.severity,
    artifact: approval.artifact,
  };
}

function workpadMissingWarnings(specReady: boolean, planReady: boolean, tasksReady: boolean, topic: WorkbenchTopicDetail): string[] {
  const warnings: string[] = [];
  if (!specReady) warnings.push("Spec 尚未生成或未被接受。");
  if (specReady && !planReady) warnings.push("Plan 尚未生成或未被接受。");
  if (planReady && !tasksReady) warnings.push("Tasks 尚未生成或未被接受。");
  if ((topic.acCount ?? 0) === 0) warnings.push("当前没有可用 AC 计数。");
  return warnings;
}

function buildWorkpadNextAction(
  topic: WorkbenchTopicDetail,
  approvals: WorkbenchApprovalItem[],
  readiness: { specReady: boolean; planReady: boolean; tasksReady: boolean },
  intake?: WorkpadIntakeSummary,
  queue?: WorkbenchTaskQueueSummary,
  taskGraph?: WorkbenchTaskGraph,
  planningBundle?: WorkbenchPlanningArtifactBundle | null,
  decompositionPlan?: WorkbenchDecompositionPlanSummary | null,
  decompositionReadiness?: WorkbenchDecompositionReadinessSummary | null,
  taskQueueProposal?: WorkbenchTaskQueueProposalSummary | null,
  workflowGraphPlan?: WorkbenchWorkflowGraphPlanSummary | null,
  schedulerContract?: WorkbenchSchedulerContractSummary | null,
  schedulerDispatchDryRun?: WorkbenchSchedulerDispatchDryRunSummary | null,
  schedulerWorkerSessionPlan?: WorkbenchSchedulerWorkerSessionPlanSummary | null,
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
  const autoReworkTask = taskGraph?.nodes.find((node) => node.autoRework?.available);
  if (autoReworkTask?.autoRework) {
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
  if (decompositionReadiness?.nextAllowedAction === "scheduler.contract") {
    return buildTypedWorkflowNextAction({
      topic,
      readiness,
      intake,
      planningBundle,
      decompositionPlan,
      decompositionReadiness,
      taskQueueProposal,
      workflowGraphPlan,
      schedulerContract,
      schedulerDispatchDryRun,
      schedulerWorkerSessionPlan,
      workflowRun,
    });
  }
  const actionableApproval = approvals.find((approval) => approval.action);
  if (actionableApproval) {
    return {
      id: `approval:${actionableApproval.id}`,
      label: actionableApproval.action?.label ?? actionableApproval.label,
      description: actionableApproval.reason ?? actionableApproval.label,
      kind: "approval",
      enabled: true,
      requiresConfirmation: actionableApproval.action?.requiresConfirmation ?? true,
      approvalId: actionableApproval.id,
    };
  }
  return buildTypedWorkflowNextAction({
    topic,
    readiness,
    intake,
    planningBundle,
    decompositionPlan,
    decompositionReadiness,
    taskQueueProposal,
    workflowGraphPlan,
    schedulerContract,
    schedulerDispatchDryRun,
    schedulerWorkerSessionPlan,
    workflowRun,
  });
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
      taskQueueProposalId: queue.nextAction?.taskQueueProposalId,
      workflowGraphPlanId: queue.nextAction?.workflowGraphPlanId,
      readinessManifestId: queue.nextAction?.readinessManifestId,
      decompositionPlanId: queue.nextAction?.decompositionPlanId,
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
  memory: ResolvedMemory,
  topics: WorkbenchTopicSummary[],
  approvals: WorkbenchApprovalItem[],
  selectedTopicId: string | undefined,
): Promise<WorkbenchWorkpadSummary[]> {
  const allRuns = await listRuns(memory).catch(() => []);
  const demandWorkers = await listDemandWorkers(memory).catch(() => []);
  const summaries = await Promise.all(topics.map(async (topic): Promise<WorkbenchWorkpadSummary> => {
    const runs = allRuns.filter((run) => run.changeId === topic.id || run.changeId === topic.name);
    const latestRun = [...runs].sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""))[0];
    const runningRun = runs.find((run) => run.status === "created" || run.status === "running");
    const demandWorker = demandWorkers.find((worker) => worker.changeId === topic.id || worker.changeId === topic.name);
    const queues = await listTaskQueues(memory, topic.id).catch(() => []);
    const latestQueue = [...queues].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
    const topicApprovals = approvals.filter((approval) => approval.changeId === topic.id || approval.changeId === topic.name);
    const blockingApproval = topicApprovals.find((approval) => approval.severity === "blocking");
    let runtimeStatus: WorkbenchWorkpadRuntimeStatus = topic.state === "archive" ? "archived" : "active";
    let blocker = blockingApproval?.reason ?? blockingApproval?.label;
    if (topic.state === "active") {
      if (demandWorker && ["claimed", "running"].includes(demandWorker.status)) {
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
      selected: topic.id === selectedTopicId || topic.name === selectedTopicId,
      waitingDecisionCount: topicApprovals.length,
      latestRunStatus: demandWorker?.status ?? latestRun?.status,
      latestRunId: latestRun?.id,
      queueStatus: demandWorker?.status ?? latestQueue?.status,
      blocker,
      updatedAt: demandWorker?.updatedAt ?? latestRun?.finishedAt ?? latestRun?.startedAt ?? latestQueue?.updatedAt ?? topic.updatedAt,
    };
  }));
  const running = summaries
    .filter((item) => item.runtimeStatus === "running")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
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

function userDecisionStateForSelectedTopic(
  topic: WorkbenchTopicDetail,
  approvals: WorkbenchApprovalItem[],
  queue: WorkbenchTaskQueueSummary | undefined,
  taskGraph: WorkbenchTaskGraph,
): WorkbenchUserDecisionState {
  if (topic.state === "archive") return "completed";
  if (taskGraph.nodes.some((task) => task.autoRework?.available)) return "processing";
  if (queue && ["blocked", "failed"].includes(queue.status)) return "needs-rework";
  if (taskGraph.nodes.some((task) => task.status === "blocked")) return "needs-rework";
  const latestValidation = [...(topic.validations as ValidationSummary[])].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  if (latestValidation?.status === "failed") return "needs-rework";
  const latestAudit = [...(topic.audits as AuditSummary[])].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  if (latestAudit?.status === "blocked" || latestAudit?.status === "failed") return "needs-rework";
  if (topic.runs.some((run) => run.status === "created" || run.status === "running")) return "processing";
  if (queue && ["queued", "paused", "running"].includes(queue.status)) return queue.status === "running" ? "processing" : "later";
  if (approvals.length > 0) return "waiting-confirmation";
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

function stateLabelForWorkpad(state: WorkbenchTopicState): string {
  if (state === "active") return "进行中";
  return "已归档";
}

