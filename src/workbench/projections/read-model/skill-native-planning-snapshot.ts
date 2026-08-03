import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canApplyResultFromGate, classifyApplyReadiness, evaluateSkillNativeApplyGate } from "../../../apply/gate.js";
import { listAuditResults, summarizeAudit } from "../../../audit/repository.js";
import { getProjectStatus } from "../../../project/status.js";
import { readProjectHarnessPlanningGate } from "../../../project-harness/planning-gate-query.js";
import { projectExecutionRuntimePort, projectHarnessExecutionPort } from "../../../project-runtime/execution-ports.js";
import type { ProjectRuntimeResolution } from "../../../project-runtime/context.js";
import { listRuns } from "../../../run/repository.js";
import { listTaskQueueItems, listTaskQueues } from "../../../task-queue/repository.js";
import { listTaskRuns, listWorkerLeases } from "../../../task-run/repository.js";
import { listValidationResults, summarizeValidation } from "../../../validation/repository.js";
import { listWorktreesForChange } from "../../../worktree/status.js";
import { listWorkflowRuns } from "../../../workflow-run/manager.js";
import { summarizeWorkflowRun } from "../../../workflow-run/summary.js";
import { readExecutionAuthorization } from "../../../workflow-runtime/execution-authorization.js";
import {
  listSkillNativeSchedulerRuns,
  readSkillNativeReadySetInitialization,
  type SkillNativeReadySetInitialization,
} from "../../../workflow-runtime/skill-native-ready-set.js";
import type { AuditResult, ManagedProject, ValidationResult, WorkflowGraphPlan, WorkflowRun } from "../../../types/index.js";
import { buildConversationInteractionQueue } from "../../conversation-interactions.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../persistence/open-workbench-database.js";
import type {
  HarnessGap,
  WorkbenchConfirmationQueue,
  WorkbenchProjectHarnessStatus,
  WorkbenchSnapshot,
  WorkbenchDecisionContext,
  WorkbenchResultReview,
  WorkbenchTopicDetail,
  WorkbenchTopicSummary,
  WorkbenchWorkpad,
  WorkbenchWorkpadSummary,
} from "../../read-model-types.js";
import type { WorkbenchWorkflowGraphPlanSummary } from "../../workflow-projection.js";
import { buildTypedWorkflowNextAction } from "../../workflow-projection.js";
import { sequentialWorkflowToConfirmationItems } from "./confirmation/typed-workflow.js";
import { decisionContextToConfirmationItems } from "./confirmation/decision-context.js";
import { emptyDecisionInspector } from "./decision-inspector.js";
import { buildHarnessGaps, buildRepoSummary } from "./support.js";
import { buildDiagnosticWorkpad } from "./workpad.js";
import { listWorkbenchRoles } from "./roles.js";

export async function tryBuildSkillNativePlanningSnapshot(input: {
  project: ManagedProject;
  resolution: ProjectRuntimeResolution;
  topicId?: string;
}): Promise<WorkbenchSnapshot | null> {
  const conversations = await readPlanningConversations(input.resolution);
  const selected = input.topicId
    ? conversations.find((item) => item.conversationId === input.topicId || item.boundChangeId === input.topicId)
    : conversations.find((item) => item.state === "active" && item.boundChangeId);
  if (!selected) return null;
  const existingWorkflowRun = selected.boundChangeId
    ? (await listWorkflowRuns(input.resolution.paths, selected.boundChangeId))[0] ?? null
    : null;
  const existingSchedulerRun = selected.boundChangeId
    ? (await listSkillNativeSchedulerRuns(input.resolution.paths, selected.boundChangeId))[0] ?? null
    : null;
  const status = projectHarnessStatus(input.resolution);
  const gaps = buildHarnessGaps();
  const topic = conversationTopic(selected);
  const warnings: string[] = [];
  let graph: WorkflowGraphPlan | null = null;
  let planningEvidence: Awaited<ReturnType<typeof readProjectHarnessPlanningGate>> | null = null;
  let schedulerInitialization: SkillNativeReadySetInitialization | null = null;
  let gateReady = false;
  if (!selected.boundChangeId || !selected.currentGraphScopeId) {
    warnings.push("Planning gate requires an exact Change and current Conversation graph scope.");
  } else try {
    const evidence = await readProjectHarnessPlanningGate({
      projectId: input.resolution.harness.projectId,
      projectRoot: input.resolution.projectRoot,
      skillRoot: input.resolution.harness.skillRoot,
      conversationId: selected.conversationId,
      graphScopeId: selected.currentGraphScopeId,
      changeId: selected.boundChangeId,
    });
    planningEvidence = evidence;
    graph = evidence.graph;
    if (evidence.authorizationIntent.status === "issued" && evidence.authorizationIntent.authorizationId) {
      const authorization = await readExecutionAuthorization(
        input.resolution.paths,
        evidence.authorizationIntent.authorizationId,
      );
      if (authorization.status !== "active"
        || authorization.projectId !== input.resolution.harness.projectId
        || authorization.changeId !== selected.boundChangeId
        || authorization.conversationId !== selected.conversationId
        || authorization.acceptedPlanHash !== evidence.authorizationIntent.proposalHash
        || authorization.graphId !== graph.id) {
        throw new Error("Planning gate execution authorization lineage is stale.");
      }
      gateReady = true;
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }

  if (existingSchedulerRun && graph?.graphMode === "ready-set-v1" && selected.boundChangeId) {
    schedulerInitialization = await readSkillNativeReadySetInitialization(
      input.resolution.paths,
      selected.boundChangeId,
      existingSchedulerRun.id,
      graph,
    );
    gateReady = false;
  }

  if (existingWorkflowRun && graph && planningEvidence && selected.boundChangeId) {
    return buildSkillNativeExecutionSnapshot({
      ...input,
      conversations,
      selected: { ...selected, boundChangeId: selected.boundChangeId },
      status,
      gaps,
      graph,
      planningEvidence,
      workflowRun: existingWorkflowRun,
      warnings,
    });
  }

  const graphSummary = graph ? workflowGraphSummary(graph) : undefined;
  const baseWorkpad = planningWorkpad(input.project, topic, graphSummary, gateReady, warnings, gaps);
  const workpad = schedulerInitialization && graph?.graphMode === "ready-set-v1" && graphSummary
    ? {
        ...baseWorkpad,
        userStatus: "processing" as const,
        userStatusLabel: "处理中",
        nextAction: {
          id: `scheduler-initialized:${schedulerInitialization.schedulerRun.id}`,
          label: "Scheduler 已初始化",
          description: "当前 ready-set 计划已完成受控启动和 sidecar 状态初始化。",
          kind: "read-only" as const,
          enabled: false,
          requiresConfirmation: false,
          disabledReason: "当前状态只提供只读的 Scheduler 初始化证据。",
        },
      }
    : baseWorkpad;
  const gateItems = gateReady ? sequentialWorkflowToConfirmationItems(input.project, topic, workpad) : [];
  const confirmationQueue: WorkbenchConfirmationQueue = {
    primary: gateItems[0] ?? null,
    current: gateItems,
    otherDemands: [],
    maintenance: [],
    history: [],
  };
  const topics = conversations.map(conversationTopicSummary);
  const workpads = topics.map((item): WorkbenchWorkpadSummary => ({
    id: item.id,
    title: item.title,
    state: item.state,
    runtimeStatus: item.id === topic.id ? "waiting-decision" : "active",
    userStatus: item.id === topic.id ? "waiting-confirmation" : "processing",
    userStatusLabel: item.id === topic.id ? "等待确认" : "处理中",
    conversationLifecycle: item.state === "active" ? "active" : "archived-readonly",
    linkedFromChangeId: item.boundChangeId ?? undefined,
    selected: item.id === topic.id,
    waitingDecisionCount: item.id === topic.id && gateReady ? 1 : 0,
    updatedAt: item.updatedAt,
  }));
  const [projectStatus, roles, conversationInteractions] = await Promise.all([
    getProjectStatus(input.project, input.project.path),
    listWorkbenchRoles(),
    selected.currentGraphScopeId
      ? buildConversationInteractionQueue(input.resolution.paths, selected.conversationId, selected.currentGraphScopeId)
      : Promise.resolve({ items: [] }),
  ]);
  return {
    project: input.project,
    memory: status,
    left: {
      project: input.project,
      memory: status,
      topics,
      workpads,
      repo: buildRepoSummary(projectStatus),
    },
    center: {
      selectedTopic: topic,
      workpad,
      thread: { items: [] },
      conversationInteractions,
      activeTab: "conversation",
      agentLoop: { runs: [] },
    },
    right: {
      approvals: [],
      decisions: [],
      decisionInspector: emptyDecisionInspector(),
      confirmationQueue,
    },
    roles,
    harnessGaps: gaps,
    warnings,
  };
}

async function buildSkillNativeExecutionSnapshot(input: {
  project: ManagedProject;
  resolution: ProjectRuntimeResolution;
  topicId?: string;
  conversations: PlanningConversation[];
  selected: PlanningConversation & { boundChangeId: string };
  status: WorkbenchProjectHarnessStatus;
  gaps: HarnessGap[];
  graph: WorkflowGraphPlan;
  planningEvidence: Awaited<ReturnType<typeof readProjectHarnessPlanningGate>>;
  workflowRun: WorkflowRun;
  warnings: string[];
}): Promise<WorkbenchSnapshot> {
  const runtime = projectExecutionRuntimePort(input.project, input.resolution);
  const evidenceRoot = join(
    input.resolution.harness.skillRoot,
    "state",
    "changes",
    "active",
    input.selected.boundChangeId,
  );
  const harness = await projectHarnessExecutionPort(input.project, evidenceRoot, input.planningEvidence);
  const [runs, taskQueues, taskQueueItems, taskRuns, workerLeases, worktrees, validations, audits] = await Promise.all([
    listRuns(runtime).then((items) => items.filter((item) => item.changeId === input.selected.boundChangeId)),
    listTaskQueues(runtime, input.selected.boundChangeId),
    listTaskQueueItems(runtime, input.selected.boundChangeId),
    listTaskRuns(runtime, input.selected.boundChangeId),
    listWorkerLeases(runtime, input.selected.boundChangeId),
    listWorktreesForChange(runtime, input.selected.boundChangeId),
    listValidationResults(runtime, input.selected.boundChangeId),
    listAuditResults(runtime, input.selected.boundChangeId),
  ]);
  const topic: WorkbenchTopicDetail = {
    ...conversationTopic(input.selected),
    path: `state/changes/active/${input.selected.boundChangeId}`,
    change: harness.changeStatus.change,
    reviewStatus: harness.changeStatus.reviewStatus,
    closeGate: harness.changeStatus.closeGate,
    acMap: harness.changeStatus.acMap,
    acCount: harness.changeStatus.acMap?.acceptanceCriteria.length,
    taskCount: harness.changeStatus.acMap?.tasks.length,
    runs,
    taskQueues,
    taskQueueItems,
    taskRuns,
    workerLeases,
    worktrees,
    validations: validations.map(summarizeValidation),
    audits: audits.map(summarizeAudit),
    threadItems: [],
  };
  const resultReview = await buildSkillNativeResultReview(
    input.project,
    runtime,
    harness,
    worktrees,
    validations,
    audits,
  );
  const graphSummary = workflowGraphSummary(input.graph);
  const base = planningWorkpad(input.project, topic, graphSummary, false, input.warnings, input.gaps);
  const queue = taskQueues[0];
  const workpad: WorkbenchWorkpad = {
    ...base,
    userStatus: "waiting-confirmation",
    userStatusLabel: "等待确认",
    workflowRun: summarizeWorkflowRun(input.workflowRun),
    resultReview,
    taskQueue: queue ? {
      id: queue.id,
      status: queue.status,
      currentTaskId: queue.currentTaskId,
      totalCount: queue.totalCount,
      completedCount: queue.completedCount,
      blockedReason: queue.blockedReason,
      failureReason: queue.failureReason,
      pausedReason: queue.pausedReason,
      workflowRunId: queue.workflowRunId,
      workflowGraphPlanId: queue.workflowGraphPlanId,
      items: taskQueueItems.filter((item) => item.queueRunId === queue.id).map((item) => ({
        id: item.id,
        taskId: item.taskId,
        order: item.order,
        status: item.status,
        taskRunId: item.taskRunId,
        blockedReason: item.blockedReason,
        failureReason: item.failureReason,
      })),
    } : undefined,
    evidence: resultReview?.evidence ?? [],
    nextAction: resultReview?.status === "ready-to-apply"
      ? {
          id: "result-apply-ready",
          label: "应用到项目",
          description: "验证、审查和人工接受证据已完整。",
          kind: "approval",
          approvalId: `apply:${resultReview.worktreeId}`,
          enabled: true,
          requiresConfirmation: true,
        }
      : {
          id: "audit-accept-required",
          label: "接受审查结果",
          description: "审查已通过，等待人工接受后才可进入 apply gate。",
          kind: "approval",
          approvalId: resultReview?.audit ? `audit:${resultReview.audit.id}` : undefined,
          enabled: Boolean(resultReview?.audit),
          requiresConfirmation: true,
        },
  };
  const decision = resultDecisionContext(input.project, topic, resultReview);
  const current = decisionContextToConfirmationItems(decision, true, topic.id);
  const confirmationQueue: WorkbenchConfirmationQueue = {
    primary: current[0] ?? null,
    current,
    otherDemands: [],
    maintenance: [],
    history: [],
  };
  const topics = input.conversations.map(conversationTopicSummary);
  const workpads = topics.map((item): WorkbenchWorkpadSummary => ({
    id: item.id,
    title: item.title,
    state: item.state,
    runtimeStatus: item.id === topic.id ? "waiting-decision" : "active",
    userStatus: item.id === topic.id ? "waiting-confirmation" : "processing",
    userStatusLabel: item.id === topic.id ? "等待确认" : "处理中",
    conversationLifecycle: item.state === "active" ? "active" : "archived-readonly",
    linkedFromChangeId: item.boundChangeId ?? undefined,
    selected: item.id === topic.id,
    waitingDecisionCount: item.id === topic.id && current.length ? 1 : 0,
    updatedAt: item.updatedAt,
  }));
  const [projectStatus, roles, conversationInteractions] = await Promise.all([
    getProjectStatus(input.project, input.project.path),
    listWorkbenchRoles(),
    input.selected.currentGraphScopeId
      ? buildConversationInteractionQueue(input.resolution.paths, input.selected.conversationId, input.selected.currentGraphScopeId)
      : Promise.resolve({ items: [] }),
  ]);
  return {
    project: input.project,
    memory: input.status,
    left: { project: input.project, memory: input.status, topics, workpads, repo: buildRepoSummary(projectStatus) },
    center: {
      selectedTopic: topic,
      workpad,
      thread: { items: [] },
      conversationInteractions,
      activeTab: "conversation",
      agentLoop: { runs },
    },
    right: { approvals: [], decisions: [], decisionInspector: emptyDecisionInspector(), confirmationQueue },
    roles,
    harnessGaps: input.gaps,
    warnings: input.warnings,
  };
}

async function buildSkillNativeResultReview(
  project: ManagedProject,
  runtime: ReturnType<typeof projectExecutionRuntimePort>,
  harness: Awaited<ReturnType<typeof projectHarnessExecutionPort>>,
  worktrees: Awaited<ReturnType<typeof listWorktreesForChange>>,
  validations: ValidationResult[],
  audits: AuditResult[],
): Promise<WorkbenchResultReview | undefined> {
  const worktree = worktrees.find((item) => item.status === "active") ?? worktrees[0];
  const validation = latestForWorktree(validations, worktree?.worktreeId);
  const audit = latestForWorktree(audits, worktree?.worktreeId);
  if (!worktree && !validation && !audit) return undefined;
  const auditAccepted = audit ? await reviewAcceptsAudit(harness.evidenceRoot, audit.id) : false;
  const gate = worktree ? await evaluateSkillNativeApplyGate(project, runtime, harness, worktree.worktreeId).catch(() => null) : null;
  const failed = validation?.status === "failed" || audit?.status === "blocked" || audit?.status === "failed";
  const readiness = gate && auditAccepted ? classifyApplyReadiness(gate) : null;
  const ready = Boolean(gate && auditAccepted && canApplyResultFromGate(gate));
  const status = failed ? "needs-rework" : ready ? "ready-to-apply" : "not-ready";
  const notes = audit?.findings.filter((finding) => finding.severity === "note").map((finding) => finding.text) ?? [];
  return {
    status,
    title: ready ? "结果可应用到项目" : failed ? "结果需要修改" : "结果证据尚未完整",
    summary: ready ? "验证和审查已通过，可以由你确认应用到项目。" : "验证和审查已完成，等待人工接受审查结果。",
    worktreeId: worktree?.worktreeId,
    changedFiles: gate?.changedPaths.slice(0, 8) ?? [],
    diffStat: gate?.diffStat ?? audit?.artifacts.diffStat,
    validation: validation ? { id: validation.id, status: validation.status, runId: validation.runId } : undefined,
    audit: audit ? {
      id: audit.id,
      status: audit.status,
      runId: audit.runId,
      findingCount: audit.findings.length,
      notes,
      artifact: audit.artifacts.audit,
    } : undefined,
    applyReadiness: {
      ready,
      kind: readiness?.kind ?? "not-approved",
      label: readiness?.message ?? "等待人工接受审查结果",
      message: readiness?.message ?? "等待人工接受审查结果",
      blockingIssues: auditAccepted ? gate?.blockingIssues ?? [] : [],
      warnings: auditAccepted ? gate?.warnings ?? [] : [],
    },
    evidence: [
      ...(validation ? [{ id: `result-validation:${validation.id}`, label: `验证 ${validation.status}`, source: "validation" as const, status: validation.status, timestamp: validation.finishedAt }] : []),
      ...(audit ? [{ id: `result-audit:${audit.id}`, label: `审查 ${audit.status}`, source: "audit" as const, status: audit.status, artifact: audit.artifacts.audit, timestamp: audit.finishedAt }] : []),
    ],
  };
}

function resultDecisionContext(
  project: ManagedProject,
  topic: WorkbenchTopicDetail,
  review: WorkbenchResultReview | undefined,
): WorkbenchDecisionContext | null {
  const changeId = topic.boundChangeId ?? topic.id;
  if (!review?.audit) return null;
  if (review.status === "ready-to-apply" && review.worktreeId) {
    return {
      id: `apply:${review.worktreeId}`,
      kind: "apply-gate",
      title: "结果已满足 apply gate",
      summary: review.summary,
      severity: "info",
      changeId,
      targetId: review.worktreeId,
      actions: [{
        id: `result.apply:${review.worktreeId}`,
        label: "应用到项目",
        kind: "approval",
        enabled: true,
        requiresConfirmation: true,
        changeId,
        worktreeId: review.worktreeId,
        action: {
          actionId: "result.apply",
          label: "应用到项目",
          command: "result",
          args: ["apply", project.id, changeId, review.worktreeId],
          mutates: true,
          requiresConfirmation: true,
        },
      }],
    };
  }
  return {
    id: `approval:audit:${review.audit.id}`,
    kind: "audit-approved",
    title: "审查结果等待接受",
    summary: review.summary,
    severity: "info",
    changeId,
    runId: review.audit.runId,
    targetId: review.audit.id,
    artifact: review.audit.artifact,
    actions: [{
      id: `audit.accept:${review.audit.id}`,
      label: "接受审查",
      kind: "approval",
      enabled: true,
      requiresConfirmation: true,
      changeId,
      approvalId: `audit:${review.audit.id}`,
      action: {
        actionId: "audit.accept",
        label: "接受审查",
        command: "audit",
        args: ["accept", project.id, review.audit.id],
        mutates: true,
        requiresConfirmation: true,
      },
    }],
  };
}

function latestForWorktree<T extends { worktreeId?: string; finishedAt: string }>(items: T[], worktreeId: string | undefined): T | undefined {
  return items
    .filter((item) => !worktreeId || item.worktreeId === worktreeId)
    .sort((left, right) => right.finishedAt.localeCompare(left.finishedAt))[0];
}

async function reviewAcceptsAudit(evidenceRoot: string, auditId: string): Promise<boolean> {
  const path = join(evidenceRoot, "reviews", "review.md");
  if (!existsSync(path)) return false;
  return (await readFile(path, "utf8")).includes(`Audit ID: ${auditId}`);
}

interface PlanningConversation {
  conversationId: string;
  title: string;
  state: "active" | "archive";
  boundChangeId: string | null;
  currentGraphScopeId: string | null;
  selectedProviderId: string;
  createdAt: string;
  updatedAt: string;
}

async function readPlanningConversations(resolution: ProjectRuntimeResolution): Promise<PlanningConversation[]> {
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    return store.conversations.listConversations(resolution.harness.projectId).map((conversation) => ({
      conversationId: conversation.conversationId,
      title: conversation.title,
      state: conversation.state,
      boundChangeId: conversation.boundChangeId,
      currentGraphScopeId: conversation.currentGraphScopeId,
      selectedProviderId: conversation.selectedProviderId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }));
  } finally {
    store.close();
  }
}

function conversationTopicSummary(conversation: PlanningConversation): WorkbenchTopicSummary {
  return {
    id: conversation.conversationId,
    kind: "conversation",
    name: conversation.conversationId,
    title: conversation.title,
    state: conversation.state,
    path: `runtime-sidecar:conversation/${conversation.conversationId}`,
    boundChangeId: conversation.boundChangeId,
    graphScopeId: conversation.currentGraphScopeId ?? undefined,
    selectedProviderId: conversation.selectedProviderId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function conversationTopic(conversation: PlanningConversation): WorkbenchTopicDetail {
  return {
    ...conversationTopicSummary(conversation),
    change: null,
    runs: [],
    taskQueues: [],
    taskQueueItems: [],
    taskRuns: [],
    workerLeases: [],
    worktrees: [],
    validations: [],
    audits: [],
    threadItems: [],
  };
}

function workflowGraphSummary(graph: WorkflowGraphPlan): WorkbenchWorkflowGraphPlanSummary {
  return {
    id: graph.id,
    changeId: graph.changeId,
    status: graph.status,
    graphMode: graph.graphMode,
    authoringContractVersion: graph.authoringContractVersion,
    schedulerContractId: graph.graphMode === "ready-set-v1" ? graph.schedulerContractId : undefined,
    schedulerWorkerPlanId: graph.graphMode === "ready-set-v1" ? graph.schedulerWorkerPlanId : undefined,
    schedulerClaimReconcilePlanId: graph.graphMode === "ready-set-v1" ? graph.schedulerClaimReconcilePlanId : undefined,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    waveCount: graph.graphMode === "ready-set-v1" ? graph.waves.length : undefined,
    artifact: graph.artifact,
    markdownArtifact: graph.markdownArtifact,
    updatedAt: graph.updatedAt,
  };
}

function planningWorkpad(
  project: ManagedProject,
  topic: WorkbenchTopicDetail,
  graph: WorkbenchWorkflowGraphPlanSummary | undefined,
  gateReady: boolean,
  warnings: string[],
  gaps: HarnessGap[],
): WorkbenchWorkpad {
  const base = buildDiagnosticWorkpad(project.name, warnings, gaps);
  const nextAction = graph && gateReady
    ? buildTypedWorkflowNextAction({
        topic: { runs: [] },
        readiness: { specReady: true, planReady: true, tasksReady: true },
        workflowGraphPlan: graph,
        workflowRun: null,
      })
    : {
        id: "planning-gate-unavailable",
        label: "等待计划就绪",
        description: warnings[0] ?? "当前计划尚未形成可确认的执行门禁。",
        kind: "read-only" as const,
        enabled: false,
        requiresConfirmation: false,
        disabledReason: warnings[0] ?? "执行授权尚未就绪。",
      };
  return {
    ...base,
    title: topic.title,
    subtitle: topic.boundChangeId ?? topic.id,
    state: "active",
    userStatus: gateReady ? "waiting-confirmation" : "processing",
    userStatusLabel: gateReady ? "等待确认" : "处理中",
    conversationId: topic.id,
    demandId: topic.id,
    boundChangeId: topic.boundChangeId ?? undefined,
    conversationLifecycle: topic.state === "active" ? "active" : "archived-readonly",
    workflowGraphPlan: graph,
    intake: {
      ...base.intake,
      goal: topic.title,
      currentUnderstanding: graph ? "计划已接受并绑定当前项目 Harness Change。" : "正在核对当前计划证据。",
      source: "topic",
      relatedArtifacts: graph?.artifact ? [graph.artifact] : [],
      missingInfo: [],
    },
    blockers: warnings,
    warnings: [],
    nextAction,
    memoryIsolation: {
      projectStableNamespace: "project/stable",
      currentChangeNamespace: topic.boundChangeId ? `project/change/${topic.boundChangeId}` : undefined,
      providerSessionNamespace: "agent/{roleId}/session/{sessionId}",
      runNamespaces: [],
      relatedWorkpads: [],
      stableFactSources: ["project-harness"],
      writeBoundaries: ["runtime-sidecar", "project-skill"],
      warnings: [],
    },
  };
}

function projectHarnessStatus(resolution: ProjectRuntimeResolution): WorkbenchProjectHarnessStatus {
  return {
    kind: "project-skill",
    registered: true,
    managed: true,
    memoryAvailable: true,
    harnessReady: true,
    projectId: resolution.harness.projectId,
    skillName: resolution.harness.skillName,
    skillRevision: resolution.harness.skillRevision,
    contentFingerprint: resolution.harness.contentFingerprint,
    runtimeAvailable: true,
  };
}
