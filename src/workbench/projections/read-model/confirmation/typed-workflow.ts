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
    const contract = workpad.schedulerContract;
    if (contract?.status === "compiled" && contract.decompositionPlanId === plan.id && contract.readinessManifestId === readiness.id) {
      const dryRun = workpad.schedulerDispatchDryRun;
      if (dryRun?.status === "generated" && dryRun.schedulerContractId === contract.id) {
        const workerPlan = workpad.schedulerWorkerSessionPlan;
        if (workerPlan?.status === "planned" && workerPlan.schedulerDispatchDryRunId === dryRun.id) return [];
        return [{
          id: `confirm:scheduler-worker-plan:${selectedTopic.id}:${dryRun.id}`,
          kind: "planning-confirm",
          projectId: project?.id ?? null,
          conversationId: selectedTopic.id,
          changeId: selectedTopic.id,
          summary: "Scheduler Dispatch / Reconcile dry-run 已生成，可编译 Worker Session Plan。",
          whyNeedsConfirmation: "需要你确认生成 SchedulerWorkerSessionPlan。worker plan 不会启动 scheduler、worker 或并行执行。",
          confirmEffect: "写入 scheduler-worker-session-plan.json/.md 和 versioned worker plan artifact；不会创建 Runtime Continuity sidecars、WorkflowRun、TaskQueue、TaskRun、WorkerLease、AgentTask、worktree 或 run。",
          riskSummary: "Worker Session Plan 只是 session/workspace/permission/event/recovery 合同，不是执行授权；真正 parallel executor 必须另行确认。",
          evidenceRefs: dryRun.artifact ? [dryRun.artifact] : [],
          actions: [{
            id: `workflow:planning.scheduler.worker-plan.compile:${selectedTopic.id}:${dryRun.id}`,
            label: "编译 Worker Session Plan",
            kind: "workflow-action",
            changeId: selectedTopic.id,
            actionType: "planning.scheduler.worker-plan.compile",
            schedulerContractId: contract.id,
            schedulerDispatchDryRunId: dryRun.id,
            enabled: true,
            requiresConfirmation: true,
          }],
          primary: false,
          status: "pending",
        }];
      }
      return [{
        id: `confirm:scheduler-dispatch-dry-run:${selectedTopic.id}:${contract.id}`,
        kind: "planning-confirm",
        projectId: project?.id ?? null,
        conversationId: selectedTopic.id,
        changeId: selectedTopic.id,
        summary: "SchedulerContract 已生成，可生成调度预演。",
        whyNeedsConfirmation: "需要你确认生成 Scheduler Dispatch / Reconcile dry-run。dry-run 不会启动 scheduler 或并行执行。",
        confirmEffect: "写入 scheduler-dispatch-dry-run.json/.md 和 versioned dry-run artifact；不会创建 WorkflowRun、TaskQueue、TaskRun、AgentTask、worktree 或 run。",
        riskSummary: "Dry-run 只是 dispatch/reconcile evidence，不是执行授权；后续真正 parallel scheduler 必须另行确认。",
        evidenceRefs: contract.artifact ? [contract.artifact] : [],
        actions: [{
          id: `workflow:planning.scheduler.dispatch.dry-run:${selectedTopic.id}:${contract.id}`,
          label: "生成调度预演",
          kind: "workflow-action",
          changeId: selectedTopic.id,
          actionType: "planning.scheduler.dispatch.dry-run",
          schedulerContractId: contract.id,
          enabled: true,
          requiresConfirmation: true,
        }],
        primary: false,
        status: "pending",
      }];
    }
    return [{
      id: `confirm:scheduler-contract:${selectedTopic.id}:${readiness.id}`,
      kind: "planning-confirm",
      projectId: project?.id ?? null,
      conversationId: selectedTopic.id,
      changeId: selectedTopic.id,
      summary: "执行边界已通过：可编译并行 Scheduler Contract。",
      whyNeedsConfirmation: "需要你确认生成 SchedulerContract。生成 contract 不会启动 scheduler 或并行执行。",
      confirmEffect: "写入 scheduler-contract.json/.md 和 versioned scheduler-contracts artifact；不会创建 WorkflowRun、TaskQueue、TaskRun、AgentTask、worktree 或 run。",
      riskSummary: "SchedulerContract 是 execution-planning evidence，不是 workflow truth；后续真正 parallel scheduler 必须另行确认。",
      evidenceRefs: readiness.artifact ? [readiness.artifact] : [],
      actions: [{
        id: `workflow:planning.scheduler.contract.compile:${selectedTopic.id}:${readiness.id}`,
        label: "编译 Scheduler Contract",
        kind: "workflow-action",
        changeId: selectedTopic.id,
        actionType: "planning.scheduler.contract.compile",
        decompositionPlanId: plan.id,
        readinessManifestId: readiness.id,
        enabled: true,
        requiresConfirmation: true,
      }],
      primary: false,
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
