import { findIntegrationCheckCandidate,
  listIntegrationChecks,
  type IntegrationCheckCandidate,
  type IntegrationCheckRecord } from "../../../integration-check/manager.js";
import { findLandingCandidate,
  listLandingPackages,
  type LandingCandidate,
  type LandingReadinessPackage } from "../../../landing/manager.js";
import { latestLandingQueueSnapshot } from "../../../landing-queue/manager.js";
import { detectRemoteProviderCapability,
  findLatestCreatedPrDraftPackageForChanges,
  findPrDraftPackageForLanding,
  type RemoteProviderCapability } from "../../../pr-draft/manager.js";
import { latestPrFeedbackSummaryForDraft } from "../../../pr-feedback/manager.js";
import { latestPrReviewReadinessForDraft,
  latestPrReviewReplyDraftForLanding } from "../../../pr-review/manager.js";
import { latestMergedRemoteLandingResultForLanding,
  latestRemoteLandingReadinessForDraft } from "../../../remote-landing/manager.js";
import { latestPostMergeHandoffForLanding } from "../../../post-merge/manager.js";
import type { ManagedProject,
  ResolvedMemory,
  LandingQueueCandidate,
  LandingQueueSnapshot } from "../../../types/index.js";
import type { DecompositionRecommendation } from "../../../workflow-artifacts/manager.js";
import type {
  WorkbenchApprovalAction,
  WorkbenchConfirmationQueue,
  WorkbenchConfirmationQueueItem,
  WorkbenchConfirmationQueueItemKind,
  WorkbenchDecisionAction,
  WorkbenchDecisionContext,
  WorkbenchDecisionInspector,
  WorkbenchTopicDetail,
  WorkbenchWorkpad,
} from "../../read-model-types.js";
export function emptyConfirmationQueue(): WorkbenchConfirmationQueue {
  return {
    primary: null,
    current: [],
    otherDemands: [],
    maintenance: [],
    history: [],
  };
}

export async function buildConfirmationQueue(input: {
  project: ManagedProject | null;
  memory: ResolvedMemory;
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
  decisionInspector: WorkbenchDecisionInspector;
}): Promise<WorkbenchConfirmationQueue> {
  const queue = emptyConfirmationQueue();
  const currentItems = [
    ...workpadNextActionToConfirmationItems(input.project, input.selectedTopic, input.workpad),
    ...decompositionPlanToConfirmationItems(input.project, input.selectedTopic, input.workpad),
    ...taskQueueProposalToConfirmationItems(input.project, input.selectedTopic, input.workpad),
    ...decisionContextToConfirmationItems(input.decisionInspector.primary, true),
    ...input.decisionInspector.related.flatMap((context) => decisionContextToConfirmationItems(context, false)),
  ];
  queue.current = currentItems;

  if (input.project) {
    const project = input.project;
    const checks = await listIntegrationChecks(input.memory).catch(() => []);
    const latestActionableCheck = checks.find((check) => integrationCheckNeedsUserAction(check.status));
    if (latestActionableCheck) {
      const item = integrationCheckNeedsActionQueueItem(project, latestActionableCheck, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    const candidate = await findIntegrationCheckCandidate(project).catch(() => null);
    const candidateAlreadyChecked = candidate && latestActionableCheck
      ? sameIntegrationTargets(candidate.targets, latestActionableCheck.resultTargets)
      : false;
    if (candidate && !candidateAlreadyChecked) {
      const item = integrationCandidateQueueItem(project, candidate, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    const latestPassed = checks.find((check) => check.status === "passed");
    if (latestPassed) {
      const item = integrationCheckQueueItem(project, latestPassed, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    const landingPackages = await listLandingPackages(input.memory).catch(() => []);
    const queueSnapshot = await latestLandingQueueSnapshot(input.memory).catch(() => null);
    const queuedLandingPackageIds = new Set<string>();
    if (queueSnapshot) {
      const queueItems = landingQueueSnapshotItems(project, queueSnapshot, input.selectedTopic?.id);
      for (const item of queueItems) {
        if (item.landingPackageId) queuedLandingPackageIds.add(item.landingPackageId);
        if (item.primary) queue.current.unshift(item);
        else queue.otherDemands.push(item);
      }
    } else {
      const prepareItem = await landingQueuePrepareItem(project, input.memory, landingPackages, input.selectedTopic?.id).catch(() => null);
      if (prepareItem) {
        if (prepareItem.primary) queue.current.unshift(prepareItem);
        else queue.otherDemands.push(prepareItem);
      }
    }
    const latestLanding = landingPackages[0];
    if (latestLanding && latestLanding.reviewedAt && !queuedLandingPackageIds.has(latestLanding.id)) {
      const item = latestLanding.review?.verdict === "ready"
        ? await prDraftQueueItem(project, input.memory, latestLanding, input.selectedTopic?.id)
        : landingPackageQueueItem(project, latestLanding, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    const landingCandidate = await findLandingCandidate(project).catch(() => null);
    if (landingCandidate) {
      const item = landingCandidateQueueItem(project, landingCandidate, input.selectedTopic?.id);
      if (item.primary) queue.current.unshift(item);
      else queue.otherDemands.push(item);
    }
    queue.history = checks
      .filter((check) => check.status === "applied" || check.status === "discarded" || check.status === "conflict" || check.status === "failed")
      .slice(0, 8)
      .map((check) => integrationCheckHistoryItem(project, check));
  }

  queue.maintenance = [];
  queue.current = dedupeConfirmationItems(queue.current.filter((item) => item.kind !== "maintenance").map(scopeConfirmationQueueItemActions));
  queue.otherDemands = dedupeConfirmationItems(queue.otherDemands.map(scopeConfirmationQueueItemActions));
  queue.history = dedupeConfirmationItems(queue.history.map(scopeConfirmationQueueItemActions));
  queue.primary = queue.current.find((item) => item.primary) ?? queue.current[0] ?? null;
  return queue;
}

function scopeConfirmationQueueItemActions(item: WorkbenchConfirmationQueueItem): WorkbenchConfirmationQueueItem {
  return {
    ...item,
    actions: item.actions.map((action) => ({
      ...action,
      changeId: action.changeId ?? item.changeId,
      worktreeId: action.worktreeId ?? item.worktreeId,
      applyCheckId: action.applyCheckId ?? item.applyCheckId,
      landingPackageId: action.landingPackageId ?? item.landingPackageId,
    })),
  };
}

function workpadNextActionToConfirmationItems(
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
    summary: "方案已经准备好，可以进入实现、验证和审查。",
    whyNeedsConfirmation: "需要你确认当前方案进入执行。",
    confirmEffect: action.actionType === "planning.confirm-execution" ? action.description : "确认后，主 agent 会通过受控委派启动后续角色执行。",
    riskSummary: "执行只会在 AHO-owned worktree 中产出结果；应用到项目仍需要之后单独确认。",
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

function decompositionPlanToConfirmationItems(
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

function taskQueueProposalToConfirmationItems(
  project: ManagedProject | null,
  selectedTopic: WorkbenchTopicDetail | null,
  workpad: WorkbenchWorkpad,
): WorkbenchConfirmationQueueItem[] {
  if (!selectedTopic) return [];
  const readiness = workpad.decompositionReadiness;
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

function decompositionRecommendationSummary(recommendation: DecompositionRecommendation): string {
  switch (recommendation) {
    case "single-change": return "保持单 Change";
    case "taskgraph-sequential": return "TaskGraph 顺序候选";
    case "taskgraph-parallel-candidate": return "TaskGraph 并行候选";
    case "multi-change-candidate": return "多 Change 候选";
    case "needs-clarification": return "先澄清";
  }
}

function evidenceActions(artifact?: string): WorkbenchDecisionAction[] {
  if (!artifact) return [];
  return [{
    id: `evidence:${artifact}`,
    label: "查看证据",
    kind: "evidence",
    enabled: true,
    requiresConfirmation: false,
    artifact,
  }];
}

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

function landingCandidateQueueItem(project: ManagedProject, candidate: LandingCandidate, selectedChangeId: string | undefined): WorkbenchConfirmationQueueItem {
  const selected = Boolean(selectedChangeId && candidate.changeIds.includes(selectedChangeId));
  const itemChangeId = selected ? selectedChangeId : candidate.changeIds[0];
  return {
    id: `landing:candidate:${candidate.applyCheckId ?? candidate.worktreeId ?? candidate.changeIds.join("+")}`,
    kind: "landing-readiness",
    projectId: project.id,
    conversationId: itemChangeId,
    changeId: itemChangeId,
    worktreeId: candidate.worktreeId,
    applyCheckId: candidate.applyCheckId,
    summary: candidate.summary,
    whyNeedsConfirmation: "本地结果已应用，可以做提交/PR 前检查。",
    confirmEffect: "会生成本地落地证据包和 merge-reviewer 审查；不会 commit、push、创建 PR 或 merge。",
    riskSummary: candidate.riskSummary,
    evidenceRefs: [],
    actions: [{
      id: `landing-prepare:${candidate.applyCheckId ?? candidate.worktreeId}`,
      label: "开始落地检查",
      kind: "workflow-action",
      actionType: "landing.prepare",
      worktreeId: candidate.worktreeId,
      worktreeIds: candidate.worktreeId ? [candidate.worktreeId] : undefined,
      applyCheckId: candidate.applyCheckId,
      enabled: true,
      requiresConfirmation: true,
    }],
    primary: selected,
    status: "pending",
  };
}

async function landingQueuePrepareItem(
  project: ManagedProject,
  memory: ResolvedMemory,
  packages: LandingReadinessPackage[],
  selectedChangeId: string | undefined,
): Promise<WorkbenchConfirmationQueueItem | null> {
  const readyPackages: LandingReadinessPackage[] = [];
  for (const pkg of packages.filter((item) => item.review?.verdict === "ready")) {
    const draft = await findPrDraftPackageForLanding(memory, pkg.id).catch(() => null);
    if (!draft || draft.status !== "created" || !draft.prUrl) continue;
    const merged = await latestMergedRemoteLandingResultForLanding(memory, pkg.id).catch(() => null);
    if (!merged) readyPackages.push(pkg);
  }
  if (readyPackages.length < 2) return null;
  const selectedPackage = selectedChangeId
    ? readyPackages.find((pkg) => pkg.target.changeIds.includes(selectedChangeId))
    : undefined;
  const primaryPkg = selectedPackage ?? readyPackages[0];
  const itemChangeId = (selectedPackage && selectedChangeId) || primaryPkg?.target.changeIds[0];
  if (!primaryPkg || !itemChangeId) return null;
  return {
    id: `landing-queue:prepare:${readyPackages.map((pkg) => pkg.id).join("+")}`,
    kind: "landing-queue",
    projectId: project.id,
    conversationId: itemChangeId,
    changeId: itemChangeId,
    landingPackageId: primaryPkg.id,
    summary: `${readyPackages.length} 个 PR 可以进入合并队列检查。`,
    whyNeedsConfirmation: "先刷新每个 PR 的远端状态，再决定哪些可以逐个确认合并。",
    confirmEffect: "只会读取 PR 状态并写入 landing queue evidence；不会合并 PR。",
    riskSummary: "AHO 不会自动合并全部；每个 PR 合并前仍需要单独确认。",
    evidenceRefs: readyPackages.flatMap((pkg) => pkg.artifactRefs).slice(0, 8),
    actions: [{
      id: "landing-queue-prepare",
      label: "检查合并队列",
      kind: "workflow-action",
      actionType: "landing-queue.prepare",
      landingPackageId: primaryPkg.id,
      enabled: true,
      requiresConfirmation: false,
    }],
    primary: Boolean(selectedPackage),
    status: "pending",
  };
}

function landingQueueSnapshotItems(project: ManagedProject, snapshot: LandingQueueSnapshot, selectedChangeId: string | undefined): WorkbenchConfirmationQueueItem[] {
  const items: WorkbenchConfirmationQueueItem[] = [];
  for (const candidate of snapshot.candidates) {
    if (candidate.status === "merged") continue;
    const selected = Boolean(selectedChangeId && candidate.changeIds.includes(selectedChangeId));
    const item = landingQueueCandidateItem(project, snapshot, candidate, selectedChangeId, selected);
    if (item) items.push(item);
  }
  if (items.length === 0 && snapshot.candidates.length > 0) {
    const first = snapshot.candidates[0];
    if (first) {
      items.push({
        id: `landing-queue:status:${snapshot.id}`,
        kind: "landing-queue",
        projectId: project.id,
        conversationId: selectedChangeId ?? first.conversationId,
        changeId: selectedChangeId ?? first.conversationId,
        summary: snapshot.summary,
        whyNeedsConfirmation: "当前合并队列没有可直接合并的 PR。",
        confirmEffect: "只会刷新队列状态；不会执行远端合并。",
        riskSummary: "请先处理 PR 反馈、checks 或 provider 状态。",
        evidenceRefs: snapshot.evidenceRefs,
        actions: [{
          id: `landing-queue-refresh:${snapshot.id}`,
          label: "刷新合并队列",
          kind: "workflow-action",
          actionType: "landing-queue.refresh",
          enabled: true,
          requiresConfirmation: false,
        }, ...evidenceActions(snapshot.summaryArtifact)],
        primary: true,
        status: "pending",
      });
    }
  }
  return items;
}

function landingQueueCandidateItem(
  project: ManagedProject,
  snapshot: LandingQueueSnapshot,
  candidate: LandingQueueCandidate,
  selectedChangeId: string | undefined,
  selected: boolean,
): WorkbenchConfirmationQueueItem | null {
  const itemChangeId = selected ? selectedChangeId : candidate.conversationId;
  if (!itemChangeId) return null;
  const otherReadyCount = snapshot.candidates.filter((item) => item.canMerge && item.id !== candidate.id).length;
  const readyWithComments = candidate.status === "ready-with-comments";
  return {
    id: `landing-queue:candidate:${candidate.id}`,
    kind: "landing-queue",
    projectId: project.id,
    conversationId: itemChangeId,
    changeId: itemChangeId,
    landingPackageId: candidate.landingPackageId,
    summary: candidate.canMerge
      ? readyWithComments
        ? "PR 可合并，但有普通评论需要你确认。"
        : "PR 已进入合并队列，可以逐个确认合并。"
      : candidate.summary,
    whyNeedsConfirmation: candidate.canMerge
      ? candidate.reason
      : "该 PR 当前不能合并，需要先处理远端状态。",
    confirmEffect: candidate.canMerge
      ? `${candidate.confirmEffect} 合并成功后会刷新剩余 ${otherReadyCount} 个可合并 PR。`
      : "只会刷新队列或查看证据；不会执行远端合并。",
    riskSummary: readyWithComments
      ? `${candidate.riskSummary} 该 PR 有普通评论；请确认仍要合并。`
      : candidate.riskSummary,
    evidenceRefs: candidate.evidenceRefs,
    actions: [
      ...(candidate.canMerge ? [{
        id: `landing-queue-merge-next:${candidate.landingPackageId}`,
        label: "合并 PR",
        kind: "workflow-action" as const,
        actionType: "landing-queue.merge-next" as const,
        landingPackageId: candidate.landingPackageId,
        enabled: true,
        requiresConfirmation: true,
      }] : [{
        id: `landing-queue-refresh:${candidate.landingPackageId}`,
        label: "刷新合并队列",
        kind: "workflow-action" as const,
        actionType: "landing-queue.refresh" as const,
        landingPackageId: candidate.landingPackageId,
        enabled: true,
        requiresConfirmation: false,
      }]),
      ...evidenceActions(snapshot.summaryArtifact),
    ],
    primary: selected,
    status: candidate.canMerge ? "pending" : "failed",
  };
}

function landingPackageQueueItem(project: ManagedProject, pkg: LandingReadinessPackage, selectedChangeId: string | undefined): WorkbenchConfirmationQueueItem {
  const selected = Boolean(selectedChangeId && pkg.target.changeIds.includes(selectedChangeId));
  const itemChangeId = selected ? selectedChangeId : pkg.target.changeIds[0];
  const reviewArtifact = pkg.artifactRefs.find((ref) => ref.endsWith("merge-review.md")) ?? pkg.artifactRefs[1] ?? pkg.artifactRefs[0];
  return {
    id: `landing:package:${pkg.id}`,
    kind: "landing-readiness",
    projectId: project.id,
    conversationId: itemChangeId,
    changeId: itemChangeId,
    landingPackageId: pkg.id,
    summary: pkg.review?.summary ?? pkg.summary,
    whyNeedsConfirmation: pkg.review?.verdict === "ready" ? "提交/PR 前检查已通过。" : "提交/PR 前检查需要处理。",
    confirmEffect: "这是本地落地证据；当前版本不会 commit、push、创建 PR 或 merge。",
    riskSummary: pkg.review?.riskSummary ?? pkg.riskSummary,
    evidenceRefs: pkg.artifactRefs,
    actions: reviewArtifact ? evidenceActions(reviewArtifact) : [],
    primary: selected,
    status: pkg.review?.verdict === "ready" ? "passed" : "failed",
  };
}

async function prDraftQueueItem(
  project: ManagedProject,
  memory: ResolvedMemory,
  pkg: LandingReadinessPackage,
  selectedChangeId: string | undefined,
): Promise<WorkbenchConfirmationQueueItem> {
  const selected = Boolean(selectedChangeId && pkg.target.changeIds.includes(selectedChangeId));
  const itemChangeId = selected ? selectedChangeId : pkg.target.changeIds[0];
  const reviewArtifact = pkg.artifactRefs.find((ref) => ref.endsWith("merge-review.md")) ?? pkg.artifactRefs[1] ?? pkg.artifactRefs[0];
  const existingDraft = await findPrDraftPackageForLanding(memory, pkg.id).catch(() => null);
  const existingDemandDraft = existingDraft ?? await findLatestCreatedPrDraftPackageForChanges(memory, pkg.target.changeIds).catch(() => null);
  if (!existingDraft && existingDemandDraft?.status === "created") {
    return {
      id: `pr-draft:update:${existingDemandDraft.id}:${pkg.id}`,
      kind: "pr-draft",
      projectId: project.id,
      conversationId: itemChangeId,
      changeId: itemChangeId,
      landingPackageId: pkg.id,
      summary: existingDemandDraft.prUrl ? `可以更新已有 Draft PR：${existingDemandDraft.prUrl}` : "可以更新已有 Draft PR。",
      whyNeedsConfirmation: "同一需求已有 Draft PR；新结果通过落地检查后需要你确认是否更新它。",
      confirmEffect: "会 push 到同一个 Draft PR 分支并更新 PR body；不会 merge、land、标记 ready for review 或归档需求。",
      riskSummary: "这是远端草稿更新，不是合并授权。",
      evidenceRefs: [existingDemandDraft.bodyArtifact, ...pkg.artifactRefs],
      actions: [
        {
          id: `pr-feedback-update-draft:${pkg.id}`,
          label: "更新 PR 草稿",
          kind: "workflow-action",
          actionType: "pr-feedback.update-draft",
          landingPackageId: pkg.id,
          enabled: true,
          requiresConfirmation: true,
        },
        ...(reviewArtifact ? evidenceActions(reviewArtifact) : []),
      ],
      primary: selected,
      status: "pending",
    };
  }
  if (existingDraft?.status === "created") {
    const mergedLanding = await latestMergedRemoteLandingResultForLanding(memory, pkg.id).catch(() => null);
    if (mergedLanding) {
      const postMerge = await latestPostMergeHandoffForLanding(memory, pkg.id).catch(() => null);
      if (postMerge) {
        const actions: WorkbenchDecisionAction[] = [
          ...(postMerge.localSyncReadiness.canSync ? [{
            id: `post-merge-sync-local:${pkg.id}`,
            label: "同步本地项目",
            kind: "workflow-action" as const,
            actionType: "post-merge.sync-local.run" as const,
            landingPackageId: pkg.id,
            remoteLandingResultId: mergedLanding.id,
            enabled: true,
            requiresConfirmation: true,
          }] : [{
            id: `post-merge-refresh-sync:${pkg.id}`,
            label: "刷新本地同步状态",
            kind: "workflow-action" as const,
            actionType: "post-merge.sync-local.prepare" as const,
            landingPackageId: pkg.id,
            remoteLandingResultId: mergedLanding.id,
            enabled: true,
            requiresConfirmation: false,
          }]),
          ...(postMerge.remoteBranchCleanupReadiness.canCleanup ? [{
            id: `post-merge-cleanup-branch:${pkg.id}`,
            label: "清理远端 PR 分支",
            kind: "workflow-action" as const,
            actionType: "post-merge.cleanup-branch.run" as const,
            landingPackageId: pkg.id,
            remoteLandingResultId: mergedLanding.id,
            enabled: true,
            requiresConfirmation: true,
          }] : []),
          {
            id: `post-merge-refresh:${pkg.id}`,
            label: "刷新合并后状态",
            kind: "workflow-action" as const,
            actionType: "post-merge.refresh" as const,
            landingPackageId: pkg.id,
            remoteLandingResultId: mergedLanding.id,
            enabled: true,
            requiresConfirmation: false,
          },
          ...(postMerge.summaryArtifact ? evidenceActions(postMerge.summaryArtifact) : []),
        ];
        return {
          id: `post-merge:handoff:${postMerge.id}`,
          kind: "post-merge",
          projectId: project.id,
          conversationId: itemChangeId,
          changeId: itemChangeId,
          landingPackageId: pkg.id,
          summary: postMerge.summary,
          whyNeedsConfirmation: "远端 PR 已合并；本地同步和远端分支清理是可选收尾动作。",
          confirmEffect: postMerge.localSyncReadiness.canSync
            ? postMerge.localSyncReadiness.confirmEffect
            : postMerge.remoteBranchCleanupReadiness.canCleanup
              ? postMerge.remoteBranchCleanupReadiness.confirmEffect
              : "当前没有安全的一键收尾动作；只会刷新状态或查看证据。",
          riskSummary: [postMerge.localSyncReadiness.riskSummary, postMerge.remoteBranchCleanupReadiness.riskSummary].filter(Boolean).join(" "),
          evidenceRefs: postMerge.evidenceRefs,
          actions,
          primary: selected,
          status: "passed",
        };
      }
      return {
        id: `post-merge:prepare:${mergedLanding.id}`,
        kind: "post-merge",
        projectId: project.id,
        conversationId: itemChangeId,
        changeId: itemChangeId,
        landingPackageId: pkg.id,
        summary: "PR 已远端合并，可以检查本地项目和远端分支收尾状态。",
        whyNeedsConfirmation: "先刷新远端/本地状态，再决定是否显示同步或清理动作。",
        confirmEffect: "只读取状态并写入 post-merge evidence；不会修改本地项目或删除分支。",
        riskSummary: "AHO 不会假设本地一定在 base branch，也不会自动 checkout/reset/stash/rebase。",
        evidenceRefs: mergedLanding.artifactRefs,
        actions: [
          {
            id: `post-merge-prepare:${pkg.id}`,
            label: "检查合并后状态",
            kind: "workflow-action" as const,
            actionType: "post-merge.prepare" as const,
            landingPackageId: pkg.id,
            remoteLandingResultId: mergedLanding.id,
            enabled: true,
            requiresConfirmation: false,
          },
          ...(mergedLanding.artifactRefs[0] ? evidenceActions(mergedLanding.artifactRefs[0]) : []),
        ],
        primary: selected,
        status: "pending",
      };
    }
    const remoteReadiness = await latestRemoteLandingReadinessForDraft(memory, existingDraft.id).catch(() => null);
    if (remoteReadiness?.canMerge) {
      return {
        id: `remote-landing:merge:${remoteReadiness.id}`,
        kind: "remote-landing",
        projectId: project.id,
        conversationId: itemChangeId,
        changeId: itemChangeId,
        landingPackageId: pkg.id,
        summary: remoteReadiness.summary,
        whyNeedsConfirmation: remoteReadiness.reason,
        confirmEffect: remoteReadiness.confirmEffect,
        riskSummary: remoteReadiness.riskSummary,
        evidenceRefs: remoteReadiness.evidenceRefs,
        actions: [
          {
            id: `remote-landing-merge:${pkg.id}`,
            label: "合并 PR",
            kind: "workflow-action" as const,
            actionType: "remote-landing.merge" as const,
            landingPackageId: pkg.id,
            enabled: true,
            requiresConfirmation: true,
          },
          ...(remoteReadiness.summaryArtifact ? evidenceActions(remoteReadiness.summaryArtifact) : []),
        ],
        primary: selected,
        status: "pending",
      };
    }
    const readiness = await latestPrReviewReadinessForDraft(memory, existingDraft.id).catch(() => null);
    if (readiness?.canSubmit) {
      return {
        id: `pr-review:submit:${readiness.id}`,
        kind: "pr-review",
        projectId: project.id,
        conversationId: itemChangeId,
        changeId: itemChangeId,
        landingPackageId: pkg.id,
        summary: readiness.summary,
        whyNeedsConfirmation: readiness.reason,
        confirmEffect: readiness.confirmEffect,
        riskSummary: readiness.riskSummary,
        evidenceRefs: readiness.evidenceRefs,
        actions: [
          {
            id: `pr-review-submit:${pkg.id}`,
            label: "提交人工评审",
            kind: "workflow-action",
            actionType: "pr-review.submit",
            landingPackageId: pkg.id,
            enabled: true,
            requiresConfirmation: true,
          },
          ...(readiness.summaryArtifact ? evidenceActions(readiness.summaryArtifact) : []),
        ],
        primary: selected,
        status: "pending",
      };
    }
    if (readiness?.status === "already-ready") {
      const landingReadiness = await latestRemoteLandingReadinessForDraft(memory, existingDraft.id).catch(() => null);
      if (landingReadiness?.canMerge) {
        return {
          id: `remote-landing:merge:${landingReadiness.id}`,
          kind: "remote-landing",
          projectId: project.id,
          conversationId: itemChangeId,
          changeId: itemChangeId,
          landingPackageId: pkg.id,
          summary: landingReadiness.summary,
          whyNeedsConfirmation: landingReadiness.reason,
          confirmEffect: landingReadiness.confirmEffect,
          riskSummary: landingReadiness.riskSummary,
          evidenceRefs: landingReadiness.evidenceRefs,
          actions: [
            {
              id: `remote-landing-merge:${pkg.id}`,
              label: "合并 PR",
              kind: "workflow-action" as const,
              actionType: "remote-landing.merge" as const,
              landingPackageId: pkg.id,
              enabled: true,
              requiresConfirmation: true,
            },
            ...(landingReadiness.summaryArtifact ? evidenceActions(landingReadiness.summaryArtifact) : []),
          ],
          primary: selected,
          status: "pending",
        };
      }
      if (landingReadiness && !landingReadiness.canMerge) {
        return {
          id: `remote-landing:status:${landingReadiness.id}`,
          kind: "remote-landing",
          projectId: project.id,
          conversationId: itemChangeId,
          changeId: itemChangeId,
          landingPackageId: pkg.id,
          summary: landingReadiness.summary,
          whyNeedsConfirmation: landingReadiness.reason,
          confirmEffect: "请先处理 PR 反馈、远端检查或 provider 状态；AHO 不会显示假合并按钮。",
          riskSummary: landingReadiness.riskSummary,
          evidenceRefs: landingReadiness.evidenceRefs,
          actions: [
            {
              id: `remote-landing-refresh:${pkg.id}`,
              label: "刷新合并状态",
              kind: "workflow-action" as const,
              actionType: "remote-landing.refresh" as const,
              landingPackageId: pkg.id,
              enabled: true,
              requiresConfirmation: false,
            },
            {
              id: `pr-feedback-refresh:${pkg.id}`,
              label: "检查 PR 反馈",
              kind: "workflow-action" as const,
              actionType: "pr-review.feedback-refresh" as const,
              landingPackageId: pkg.id,
              enabled: true,
              requiresConfirmation: false,
            },
            ...(landingReadiness.summaryArtifact ? evidenceActions(landingReadiness.summaryArtifact) : []),
          ],
          primary: selected,
          status: "pending",
        };
      }
      const replyDraft = await latestPrReviewReplyDraftForLanding(memory, pkg.id).catch(() => null);
      if (replyDraft && (replyDraft.status === "draft" || (replyDraft.status === "submitted" && replyDraft.canResolveThread))) {
        return {
          id: `pr-review:reply:${replyDraft.id}`,
          kind: "pr-review",
          projectId: project.id,
          conversationId: itemChangeId,
          changeId: itemChangeId,
          landingPackageId: pkg.id,
          summary: replyDraft.status === "draft" ? "评审回复草稿已准备好。" : "评审回复已提交，可标记对应反馈已处理。",
          whyNeedsConfirmation: replyDraft.status === "draft" ? "回复评审需要你确认。" : "只有 provider 支持 review thread 时才可以标记已处理。",
          confirmEffect: replyDraft.status === "draft" ? "会向 PR 评审反馈提交回复；不会 merge、land 或归档需求。" : "会在远端标记 review thread 已处理；不会 merge、land 或归档需求。",
          riskSummary: "这是 PR review handoff，不是合并授权。",
          evidenceRefs: replyDraft.evidenceRefs,
          actions: [
            ...(replyDraft.status === "draft" ? [{
              id: `pr-review-reply-submit:${pkg.id}`,
              label: "回复评审",
              kind: "workflow-action" as const,
              actionType: "pr-review.reply-submit" as const,
              landingPackageId: pkg.id,
              enabled: true,
              requiresConfirmation: true,
            }] : []),
            ...(replyDraft.canResolveThread ? [{
              id: `pr-review-thread-resolve:${pkg.id}`,
              label: "标记已处理",
              kind: "workflow-action" as const,
              actionType: "pr-review.thread-resolve" as const,
              landingPackageId: pkg.id,
              enabled: true,
              requiresConfirmation: true,
            }] : []),
            ...evidenceActions(replyDraft.artifactRef),
          ],
          primary: selected,
          status: "pending",
        };
      }
      return {
        id: `pr-review:ready:${readiness.id}`,
        kind: "pr-review",
        projectId: project.id,
        conversationId: itemChangeId,
        changeId: itemChangeId,
        landingPackageId: pkg.id,
        summary: readiness.summary,
        whyNeedsConfirmation: "PR 已进入人工评审。",
        confirmEffect: "无需重复提交；后续请检查远端反馈。",
        riskSummary: "这不是 merge 或 land。",
        evidenceRefs: readiness.evidenceRefs,
        actions: [
          {
            id: `remote-landing-prepare:${pkg.id}`,
            label: "检查合并状态",
            kind: "workflow-action",
            actionType: "remote-landing.prepare",
            landingPackageId: pkg.id,
            enabled: true,
            requiresConfirmation: false,
          },
          {
            id: `pr-feedback-refresh:${pkg.id}`,
            label: "检查 PR 反馈",
            kind: "workflow-action",
            actionType: "pr-review.feedback-refresh",
            landingPackageId: pkg.id,
            enabled: true,
            requiresConfirmation: false,
          },
          ...(readiness.summaryArtifact ? evidenceActions(readiness.summaryArtifact) : []),
        ],
        primary: selected,
        status: "passed",
      };
    }
    const feedback = await latestPrFeedbackSummaryForDraft(memory, existingDraft.id).catch(() => null);
    return {
      id: `pr-draft:created:${existingDraft.id}`,
      kind: "pr-draft",
      projectId: project.id,
      conversationId: itemChangeId,
      changeId: itemChangeId,
      landingPackageId: pkg.id,
      summary: feedback?.summary ?? (existingDraft.prUrl ? `Draft PR 已创建：${existingDraft.prUrl}` : "Draft PR 已创建。"),
      whyNeedsConfirmation: feedback?.actionable ? "远端 PR 反馈需要修改。" : "远端 PR 草稿已经创建。",
      confirmEffect: feedback?.actionable
        ? "会在同一需求中创建修改任务；通过后仍需要重新落地检查并由你确认更新 PR 草稿。"
        : "可以刷新远端反馈；后续 review / merge 仍需要在远端或后续阶段处理。",
      riskSummary: feedback?.actionable ? "PR 反馈修改不会自动 push；更新 Draft PR 仍需要确认。" : "这是 Draft PR handoff，不是 merge authority。",
      evidenceRefs: feedback?.evidenceRefs ?? [existingDraft.bodyArtifact, ...pkg.artifactRefs],
      actions: [
        ...(feedback?.actionable ? [{
          id: `pr-feedback-rework:${pkg.id}`,
          label: "根据 PR 反馈修改",
          kind: "workflow-action" as const,
          actionType: "pr-review.rework" as const,
          landingPackageId: pkg.id,
          enabled: true,
          requiresConfirmation: true,
        }] : []),
        ...(!feedback?.actionable ? [{
          id: `pr-review-prepare:${pkg.id}`,
          label: "准备人工评审",
          kind: "workflow-action" as const,
          actionType: "pr-review.prepare" as const,
          landingPackageId: pkg.id,
          enabled: true,
          requiresConfirmation: false,
        }] : []),
        ...(!feedback?.actionable && feedback?.classification === "comments-only" ? [{
          id: `pr-review-reply-prepare:${pkg.id}`,
          label: "准备评审回复",
          kind: "workflow-action" as const,
          actionType: "pr-review.reply-prepare" as const,
          landingPackageId: pkg.id,
          enabled: true,
          requiresConfirmation: false,
        }] : []),
        {
          id: `pr-feedback-refresh:${pkg.id}`,
          label: feedback ? "重新检查 PR 反馈" : "检查 PR 反馈",
          kind: "workflow-action",
          actionType: "pr-review.feedback-refresh",
          landingPackageId: pkg.id,
          enabled: true,
          requiresConfirmation: false,
        },
        {
          id: `pr-draft-refresh:${pkg.id}`,
          label: "刷新 PR 状态",
          kind: "workflow-action",
          actionType: "pr-draft.refresh",
          landingPackageId: pkg.id,
          enabled: true,
          requiresConfirmation: true,
        },
        ...(reviewArtifact ? evidenceActions(reviewArtifact) : []),
      ],
      primary: selected,
      status: "passed",
    };
  }
  const capability = await detectRemoteProviderCapability(project).catch((cause: unknown): RemoteProviderCapability => ({
    provider: "github-cli",
    status: "unsupported",
    ready: false,
    reason: cause instanceof Error ? cause.message : String(cause),
    setupHint: "无法检测远端 PR 能力；请确认 GitHub CLI 和仓库 remote 配置。",
  }));
  if (!capability.ready) {
    return {
      id: `pr-draft:provider:${pkg.id}`,
      kind: "pr-draft",
      projectId: project.id,
      conversationId: itemChangeId,
      changeId: itemChangeId,
      landingPackageId: pkg.id,
      summary: capability.reason ?? "Draft PR provider 未配置。",
      whyNeedsConfirmation: "远端 PR 能力未配置。",
      confirmEffect: capability.setupHint,
      riskSummary: "AHO 不会伪造创建 PR；provider ready 前不会显示创建 PR 草稿按钮。",
      evidenceRefs: pkg.artifactRefs,
      actions: reviewArtifact ? evidenceActions(reviewArtifact) : [],
      primary: selected,
      status: "pending",
    };
  }
  return {
    id: `pr-draft:create:${pkg.id}`,
    kind: "pr-draft",
    projectId: project.id,
    conversationId: itemChangeId,
    changeId: itemChangeId,
    landingPackageId: pkg.id,
    summary: "提交/PR 前检查已通过，可以创建 Draft PR。",
    whyNeedsConfirmation: "需要你确认是否创建远端 Draft PR。",
    confirmEffect: "会创建或更新远端分支并创建 Draft PR；不会 merge、land 或启用自动合并。",
    riskSummary: "创建 Draft PR 会产生本地提交并 push 到远端分支。",
    evidenceRefs: pkg.artifactRefs,
    actions: [
      {
        id: `pr-draft-create:${pkg.id}`,
        label: "创建 PR 草稿",
        kind: "workflow-action",
        actionType: "pr-draft.create",
        landingPackageId: pkg.id,
        enabled: true,
        requiresConfirmation: true,
      },
      ...(reviewArtifact ? evidenceActions(reviewArtifact) : []),
    ],
    primary: selected,
    status: "pending",
  };
}

function decisionContextToConfirmationItems(context: WorkbenchDecisionContext | null, primary: boolean): WorkbenchConfirmationQueueItem[] {
  if (!context) return [];
  const confirmActions = context.actions.filter((action) => action.kind !== "none" && action.enabled);
  if (confirmActions.length === 0) return [];
  const kind: WorkbenchConfirmationQueueItemKind = context.kind === "spec-proposal" || context.kind === "plan-proposal"
    ? "planning-confirm"
    : context.kind === "apply-gate"
      ? "single-result-apply"
      : context.kind === "evolution-pending"
        ? "maintenance"
        : context.kind === "queue-blocker" || context.kind === "task-blocker" || context.kind === "validation-failed" || context.kind === "audit-blocked"
          ? "request-changes"
          : "request-changes";
  return [{
    id: `confirm:${context.id}`,
    kind,
    conversationId: context.changeId,
    changeId: context.changeId,
    resultId: context.targetId,
    runId: context.runId,
    worktreeId: context.kind === "apply-gate" ? context.targetId : undefined,
    summary: context.resultSummary ?? context.summary,
    whyNeedsConfirmation: context.title,
    confirmEffect: context.recommendation ?? "确认后会推进当前需求的下一步。",
    riskSummary: context.explanation ?? "执行前请确认摘要和证据。",
    evidenceRefs: [context.artifact].filter((item): item is string => Boolean(item)),
    actions: confirmActions,
    primary,
    status: "pending",
  }];
}

function integrationCandidateQueueItem(project: ManagedProject, candidate: IntegrationCheckCandidate, selectedChangeId: string | undefined): WorkbenchConfirmationQueueItem {
  const selected = Boolean(selectedChangeId && candidate.targets.some((target) => target.changeId === selectedChangeId));
  return {
    id: `apply-check:candidate:${candidate.targets.map((target) => target.worktreeId).join("+")}`,
    kind: "integration-check",
    projectId: project.id,
    conversationId: selectedChangeId,
    changeId: selectedChangeId,
    summary: candidate.summary,
    whyNeedsConfirmation: "多个结果都已准备好应用。",
    confirmEffect: "会在临时工作区检查这些结果能否一起应用；不会修改项目源码。",
    riskSummary: candidate.riskSummary,
    evidenceRefs: [],
    actions: [{
      id: `run-apply-check:${candidate.targets.map((target) => target.worktreeId).join("+")}`,
      label: "检查兼容性",
      kind: "workflow-action",
      actionType: "apply-check.run",
      worktreeIds: candidate.targets.map((target) => target.worktreeId),
      enabled: true,
      requiresConfirmation: true,
    }],
    primary: selected,
    status: "pending",
  };
}

function integrationCheckNeedsUserAction(status: IntegrationCheckRecord["status"]): boolean {
  return status === "conflict" || status === "validation-failed" || status === "audit-failed" || status === "failed" || status === "stale-result";
}

function sameIntegrationTargets(left: IntegrationCheckCandidate["targets"], right: IntegrationCheckRecord["resultTargets"]): boolean {
  const normalize = (targets: Array<{ changeId: string; worktreeId: string; diffHash: string }>): string[] => {
    return targets.map((target) => `${target.changeId}:${target.worktreeId}:${target.diffHash}`).sort();
  };
  const leftKey = normalize(left);
  const rightKey = normalize(right);
  return leftKey.length === rightKey.length && leftKey.every((item, index) => item === rightKey[index]);
}

function integrationCheckQueueItem(project: ManagedProject, check: IntegrationCheckRecord, selectedChangeId: string | undefined): WorkbenchConfirmationQueueItem {
  const selected = Boolean(selectedChangeId && check.resultTargets.some((target) => target.changeId === selectedChangeId));
  const itemChangeId = selected ? selectedChangeId : check.resultTargets[0]?.changeId;
  return {
    id: `apply-check:${check.id}`,
    kind: "integration-apply",
    projectId: project.id,
    conversationId: itemChangeId,
    changeId: itemChangeId,
    applyCheckId: check.id,
    summary: check.summary,
    whyNeedsConfirmation: "兼容性检查已通过，是否应用这些结果需要你确认。",
    confirmEffect: "确认后会把检查通过的组合结果应用到项目源码。",
    riskSummary: check.riskSummary,
    evidenceRefs: check.artifactRefs,
    actions: [
      {
        id: `apply-check-apply:${check.id}`,
        label: "确认应用到项目",
        kind: "approval",
        action: approvalAction("apply-check.apply", "确认应用到项目", "apply-check", ["apply", check.id, check.latestArtifactHash ?? ""], true),
        enabled: true,
        requiresConfirmation: true,
      },
      {
        id: `apply-check-feedback:${check.id}`,
        label: "要求修改",
        kind: "feedback",
        enabled: true,
        requiresConfirmation: false,
      },
      {
        id: `apply-check-discard:${check.id}`,
        label: "放弃",
        kind: "approval",
        action: approvalAction("apply-check.discard", "放弃组合结果", "apply-check", ["discard", check.id], true),
        enabled: true,
        requiresConfirmation: true,
      },
      ...(check.artifactRefs[0] ? evidenceActions(check.artifactRefs[0]).map((action) => ({ ...action, label: "查看证据" })) : []),
    ],
    primary: selected,
    status: "passed",
  };
}

function integrationCheckNeedsActionQueueItem(project: ManagedProject, check: IntegrationCheckRecord, selectedChangeId: string | undefined): WorkbenchConfirmationQueueItem {
  const selected = Boolean(selectedChangeId && check.resultTargets.some((target) => target.changeId === selectedChangeId));
  const itemChangeId = selected ? selectedChangeId : check.resultTargets[0]?.changeId;
  return {
    id: `apply-check-needs-action:${check.id}`,
    kind: "request-changes",
    projectId: project.id,
    conversationId: itemChangeId,
    changeId: itemChangeId,
    applyCheckId: check.id,
    summary: check.summary,
    whyNeedsConfirmation: check.status === "stale-result"
      ? "结果已过期，需要回到对应需求重新处理。"
      : "兼容性检查没有通过，需要修改其中一个结果或放弃这次组合应用。",
    confirmEffect: "要求修改会把反馈绑定到这次检查和相关需求；放弃只结束这次组合应用结果，不修改项目源码。",
    riskSummary: check.riskSummary,
    evidenceRefs: check.artifactRefs,
    actions: [
      {
        id: `apply-check-feedback:${check.id}`,
        label: "要求修改",
        kind: "feedback",
        enabled: true,
        requiresConfirmation: false,
      },
      {
        id: `apply-check-discard:${check.id}`,
        label: "放弃",
        kind: "approval",
        action: approvalAction("apply-check.discard", "放弃组合结果", "apply-check", ["discard", check.id], true),
        enabled: true,
        requiresConfirmation: true,
      },
      ...(check.artifactRefs[0] ? evidenceActions(check.artifactRefs[0]).map((action) => ({ ...action, label: "查看证据" })) : []),
    ],
    primary: selected,
    status: "failed",
  };
}

function integrationCheckHistoryItem(project: ManagedProject, check: IntegrationCheckRecord): WorkbenchConfirmationQueueItem {
  return {
    id: `apply-check-history:${check.id}`,
    kind: "integration-apply",
    projectId: project.id,
    applyCheckId: check.id,
    summary: check.summary,
    whyNeedsConfirmation: "历史兼容性检查。",
    confirmEffect: "无当前动作。",
    riskSummary: check.riskSummary,
    evidenceRefs: check.artifactRefs,
    actions: check.artifactRefs[0] ? evidenceActions(check.artifactRefs[0]) : [],
    primary: false,
    status: check.status === "applied" ? "applied" : check.status === "discarded" ? "discarded" : "failed",
  };
}

function dedupeConfirmationItems(items: WorkbenchConfirmationQueueItem[]): WorkbenchConfirmationQueueItem[] {
  const seen = new Set<string>();
  const result: WorkbenchConfirmationQueueItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}


