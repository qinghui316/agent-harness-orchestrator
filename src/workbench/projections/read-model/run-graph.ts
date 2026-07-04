import type {
  DemandAgentRunAttemptSummary,
  DemandAgentRunEvidenceRef,
  DemandAgentRunGraph,
  DemandAgentRunGraphEdge,
  DemandAgentRunGraphEdgeKind,
  DemandAgentRunGraphEdgeRole,
  DemandAgentRunGraphEdgeStyle,
  DemandAgentRunGraphLane,
  DemandAgentRunGraphLaneId,
  DemandAgentRunGraphNode,
  DemandAgentRunGraphNodeKind,
  DemandAgentRunGraphNodeStatus,
  WorkbenchAgentTaskSummary,
  WorkbenchConfirmationQueue,
  WorkbenchConfirmationQueueItem,
  WorkbenchConfirmationQueueItemKind,
  WorkbenchConversationLifecycle,
  WorkbenchResultReview,
  WorkbenchRolePipelineSummary,
  WorkbenchRoleRunSummary,
  WorkbenchTopicDetail,
  WorkbenchWorkpad,
} from "../../read-model-types.js";
import type { ManagedProject } from "../../../types/index.js";
import type { ParentAgentTranscript } from "../../parent-agent-transcript.js";
import { mainAgentExecutionForWorkpad } from "./main-agent-execution.js";
export function emptyAgentRunGraph(): DemandAgentRunGraph {
  return {
    title: "执行过程",
    summary: "选择一个需求后，这里会显示主 agent 调用了哪些角色和工具。",
    lanes: demandAgentRunGraphLanes(),
    nodes: [],
    edges: [],
  };
}

export function emptyParentAgentTranscript(): ParentAgentTranscript {
  return {
    title: "需求对话",
    cells: [],
    items: [],
    emptyMessage: "打开对话后会加载运行时 transcript。",
  };
}

export function shellWorkbenchWorkpad(workpad: WorkbenchWorkpad): WorkbenchWorkpad {
  return {
    ...workpad,
    maintenance: undefined,
  };
}

function demandAgentRunGraphLanes(): DemandAgentRunGraphLane[] {
  return [
    { id: "main", label: "主 agent", description: "用户交互入口和调度解释。" },
    { id: "roles", label: "主流程", description: "规划、实现、验证、审查和结果整理。" },
    { id: "integration", label: "集成 / PR / 合并", description: "兼容性检查、PR、评审、远端合并和合并后处理。" },
    { id: "maintenance", label: "后台维护", description: "需求记忆、文档漂移和 Harness 演进候选。" },
  ];
}

export function buildDemandAgentRunGraph(input: {
  project: ManagedProject | null;
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
  confirmationQueue: WorkbenchConfirmationQueue;
}): DemandAgentRunGraph {
  const { project, selectedTopic, workpad, confirmationQueue } = input;
  if (!selectedTopic) return emptyAgentRunGraph();

  const nodes = new Map<string, DemandAgentRunGraphNode>();
  const edges: DemandAgentRunGraphEdge[] = [];
  const targetBase = { projectId: project?.id ?? null, conversationId: selectedTopic.id, changeId: selectedTopic.id };

  const mainStatus = graphStatusFromLifecycle(workpad.conversationLifecycle);
  addGraphNode(nodes, {
    id: "main-agent",
    kind: "main-agent",
    lane: "main",
    label: "主 agent",
    status: mainStatus,
    summary: parentAgentGraphSummary(workpad),
    reason: "负责理解需求、解释进展、委派角色，并在收回结果后决定下一步。",
    target: targetBase,
    inputSummary: workpad.intake.goal,
    outputSummary: workpad.intake.currentUnderstanding,
    evidenceRefs: [],
    attempts: [],
  });

  if (workpad.planningArtifactBundle || workpad.planningDraft) {
    const bundle = workpad.planningArtifactBundle ?? workpad.planningDraft;
    if (bundle) {
      addGraphNode(nodes, {
        id: "role:planning-agent",
        kind: "planning-agent",
        lane: "roles",
        label: "planning-agent",
        roleId: "planning-agent",
        status: workpad.planningArtifactBundle?.status === "confirmed" ? "completed" : "waiting-user",
        summary: bundle.goal,
        reason: "主 agent 用它把需求沉淀为可执行计划。",
        target: { ...targetBase, roleId: "planning-agent" },
        inputSummary: workpad.intake.currentUnderstanding,
        outputSummary: bundle.design,
        evidenceRefs: bundle.artifact ? [{ label: "计划证据", ref: bundle.artifact, kind: "artifact" }] : [],
        attempts: [],
      });
      addGraphEdge(edges, "main-agent", "role:planning-agent", "delegates", "整理计划");
      addGraphEdge(edges, "role:planning-agent", "main-agent", "returns", "计划返回给主 Agent");
    }
  }

  const roleNodeIds = addRolePipelineGraphNodes(nodes, edges, targetBase, mainAgentExecutionForWorkpad(workpad));
  connectRolePath(edges, roleNodeIds);
  addResultReviewGraphNode(nodes, edges, targetBase, workpad.resultReview, roleNodeIds.at(-1));
  addGoalLoopGraphNodes(nodes, edges, targetBase, workpad);
  addSchedulerGraphNodes(nodes, edges, targetBase, workpad);
  addConfirmationGraphNodes(nodes, edges, targetBase, confirmationQueue);

  const nodeList = [...nodes.values()];
  const nodeIds = new Set(nodeList.map((node) => node.id));
  return {
    conversationId: selectedTopic.id,
    changeId: selectedTopic.id,
    title: selectedTopic.title,
    summary: `${nodes.size} 个 agent/tool 节点；项目维护不进入默认选中需求运行图。`,
    lanes: demandAgentRunGraphLanes(),
    nodes: nodeList,
    edges: dedupeGraphEdges(edges).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)),
    updatedAt: selectedTopic.updatedAt,
  };
}

function parentAgentGraphSummary(workpad: WorkbenchWorkpad): string {
  if (workpad.resultReview) return "已汇总实现结果、验证、审查和下一步决定。";
  const mainAgentExecution = mainAgentExecutionForWorkpad(workpad);
  if (mainAgentExecution?.status === "running") return "正在调度角色 agent 执行当前需求。";
  if (mainAgentExecution) return "已建立角色执行链路并收集结果。";
  if (workpad.planningArtifactBundle) return "已整理计划，等待确认或后续边界检查。";
  return "正在理解当前需求。";
}

function addRolePipelineGraphNodes(
  nodes: Map<string, DemandAgentRunGraphNode>,
  edges: DemandAgentRunGraphEdge[],
  targetBase: DemandAgentRunGraphNode["target"],
  pipeline: WorkbenchRolePipelineSummary | undefined,
): string[] {
  if (!pipeline) return [];
  const roleIds: string[] = [];
  const taskByRole = latestAgentTaskByRole(pipeline.agentTasks);
  const runByRole = latestRunByRole(pipeline.runs);
  const orderedRoles = ["planning-agent", "coder-agent", "rework-coder", "validator", "auditor-agent"];
  for (const roleId of orderedRoles) {
    const task = taskByRole.get(roleId);
    const run = runByRole.get(roleId);
    if (!task && !run) continue;
    const nodeId = `role:${roleId}`;
    const evidenceRefs = [
      ...(task?.evidenceRefs ?? []).map((ref): DemandAgentRunEvidenceRef => ({ label: "角色输出", ref, kind: "artifact" })),
      ...(task?.policyAuditRefs ?? []).map((ref): DemandAgentRunEvidenceRef => ({ label: "策略审计", ref, kind: "artifact" })),
      ...(task?.boundaryAuditRefs ?? []).map((ref): DemandAgentRunEvidenceRef => ({ label: "边界审计", ref, kind: "artifact" })),
      ...(run?.artifact ? [{ label: "运行证据", ref: run.artifact, kind: "artifact" } satisfies DemandAgentRunEvidenceRef] : []),
      ...(run?.runId ? [{ label: "运行记录", ref: run.runId, kind: "run" } satisfies DemandAgentRunEvidenceRef] : []),
    ];
    addGraphNode(nodes, {
      id: nodeId,
      kind: roleKindFromRoleId(roleId),
      lane: "roles",
      label: roleLabelForGraph(roleId),
      roleId,
      status: graphStatusFromRoleStatus(task?.status ?? run?.status),
      summary: task?.resultSummary ?? task?.summary ?? run?.summary ?? "角色执行记录已生成。",
      reason: roleReason(roleId),
      target: { ...targetBase, roleId, agentTaskId: task?.id, runId: run?.runId },
      inputSummary: task?.summary,
      outputSummary: task?.resultSummary ?? run?.summary,
      evidenceRefs,
      attempts: buildRoleAttempts(roleId, pipeline.agentTasks, pipeline.runs),
    });
    addGraphEdge(edges, "main-agent", nodeId, "delegates", `委派 ${roleLabelForGraph(roleId)}`);
    addGraphEdge(edges, nodeId, "main-agent", "returns", "结果返回给主 Agent");
    addRolePolicyAndBoundaryGraphNodes(nodes, edges, targetBase, task, nodeId);
    roleIds.push(nodeId);
  }
  return roleIds;
}

function addRolePolicyAndBoundaryGraphNodes(
  nodes: Map<string, DemandAgentRunGraphNode>,
  edges: DemandAgentRunGraphEdge[],
  targetBase: DemandAgentRunGraphNode["target"],
  task: WorkbenchAgentTaskSummary | undefined,
  roleNodeId: string,
): void {
  if (!task) return;
  if (task.policyAuditRefs.length > 0) {
    const policyNodeId = `policy:${task.id}`;
    addGraphNode(nodes, {
      id: policyNodeId,
      kind: "tool-policy-gate",
      lane: "roles",
      label: "ToolPolicyGate",
      status: "completed",
      summary: "已检查角色、范围、权限和人类确认边界。",
      reason: "主 agent 的委派请求必须先通过 AHO 级策略门，不能让角色 agent 直接执行高影响动作。",
      target: { ...targetBase, roleId: task.roleId, agentTaskId: task.id },
      inputSummary: task.summary,
      outputSummary: "delegateTask 请求已按策略记录和审计。",
      evidenceRefs: task.policyAuditRefs.map((ref): DemandAgentRunEvidenceRef => ({ label: "策略审计", ref, kind: "artifact" })),
      attempts: [],
    });
    addGraphEdge(edges, "main-agent", policyNodeId, "delegates", "请求策略检查");
    addGraphEdge(edges, policyNodeId, roleNodeId, "continues-to", "策略放行后委派角色");
  }
  if (task.boundaryAuditRefs.length > 0) {
    const failed = task.boundaryViolations.length > 0;
    const boundaryNodeId = `boundary:${task.id}`;
    addGraphNode(nodes, {
      id: boundaryNodeId,
      kind: "boundary-audit",
      lane: "roles",
      label: "边界审计",
      status: failed ? "failed" : "completed",
      summary: failed ? task.boundaryViolations.join("；") : "角色输出没有越过本次需求边界。",
      reason: "AHO 对角色运行后的 worktree/source/evidence 状态做兜底检查，发现越界时阻止结果进入应用流程。",
      target: { ...targetBase, roleId: task.roleId, agentTaskId: task.id },
      inputSummary: task.resultSummary ?? task.summary,
      outputSummary: failed ? "发现越界，结果已隔离。" : "边界审计通过。",
      evidenceRefs: task.boundaryAuditRefs.map((ref): DemandAgentRunEvidenceRef => ({ label: "边界审计", ref, kind: "artifact" })),
      attempts: [],
    });
    addGraphEdge(edges, roleNodeId, boundaryNodeId, "returns", "输出进入边界审计");
    addGraphEdge(edges, boundaryNodeId, "main-agent", "returns", failed ? "边界问题返回给主 Agent" : "审计结果返回给主 Agent");
  }
}

function latestAgentTaskByRole(tasks: WorkbenchAgentTaskSummary[]): Map<string, WorkbenchAgentTaskSummary> {
  const map = new Map<string, WorkbenchAgentTaskSummary>();
  for (const task of tasks) {
    const existing = map.get(task.roleId);
    if (!existing || (task.completedAt ?? task.createdAt).localeCompare(existing.completedAt ?? existing.createdAt) > 0) {
      map.set(task.roleId, task);
    }
  }
  return map;
}

function latestRunByRole(runs: WorkbenchRoleRunSummary[]): Map<string, WorkbenchRoleRunSummary> {
  const map = new Map<string, WorkbenchRoleRunSummary>();
  for (const run of runs) map.set(run.roleId, run);
  return map;
}

function buildRoleAttempts(roleId: string, tasks: WorkbenchAgentTaskSummary[], runs: WorkbenchRoleRunSummary[]): DemandAgentRunAttemptSummary[] {
  const attempts: DemandAgentRunAttemptSummary[] = tasks
    .filter((task) => task.roleId === roleId)
    .map((task) => ({
      id: task.id,
      status: graphStatusFromRoleStatus(task.status),
      summary: task.resultSummary ?? task.summary,
      timestamp: task.completedAt ?? task.createdAt,
    evidenceRefs: task.evidenceRefs.map((ref): DemandAgentRunEvidenceRef => ({ label: "角色输出", ref, kind: "artifact" })),
    }));
  for (const run of runs.filter((item) => item.roleId === roleId && item.runId)) {
    attempts.push({
      id: run.runId ?? `${roleId}:${run.status}`,
      status: graphStatusFromRoleStatus(run.status),
      summary: run.summary,
      evidenceRefs: [
        ...(run.runId ? [{ label: "运行记录", ref: run.runId, kind: "run" } satisfies DemandAgentRunEvidenceRef] : []),
        ...(run.artifact ? [{ label: "运行证据", ref: run.artifact, kind: "artifact" } satisfies DemandAgentRunEvidenceRef] : []),
      ],
    });
  }
  return attempts.slice(-5);
}

function addResultReviewGraphNode(
  nodes: Map<string, DemandAgentRunGraphNode>,
  edges: DemandAgentRunGraphEdge[],
  targetBase: DemandAgentRunGraphNode["target"],
  review: WorkbenchResultReview | undefined,
  previousNodeId: string | undefined,
): void {
  if (!review) return;
  const evidenceRefs = review.evidence.map((item): DemandAgentRunEvidenceRef => ({
    label: item.label,
    ref: item.artifact ?? item.id,
    kind: item.artifact ? "artifact" : "decision",
  }));
  if (review.validation?.runId) evidenceRefs.push({ label: "验证运行", ref: review.validation.runId, kind: "run" });
  if (review.audit?.artifact) evidenceRefs.push({ label: "审查证据", ref: review.audit.artifact, kind: "artifact" });
  addGraphNode(nodes, {
    id: "result-review",
    kind: "result-review",
    lane: "roles",
    label: "结果整理",
    status: review.status === "needs-rework" ? "needs-change" : review.status === "not-ready" ? "idle" : "completed",
    summary: review.summary,
    reason: "主 agent 把实现、验证和审查整理成用户可决定的结果。",
    target: { ...targetBase, worktreeId: review.worktreeId, resultId: review.worktreeId },
    inputSummary: review.changedFiles.join(", "),
    outputSummary: review.applyReadiness.message,
    evidenceRefs,
    attempts: [],
  });
  if (previousNodeId) addGraphEdge(edges, previousNodeId, "result-review", "continues-to", "汇总结果");
  addGraphEdge(edges, "result-review", "main-agent", "returns", "结果返回给主 Agent");
}

function addGoalLoopGraphNodes(
  nodes: Map<string, DemandAgentRunGraphNode>,
  edges: DemandAgentRunGraphEdge[],
  targetBase: DemandAgentRunGraphNode["target"],
  workpad: WorkbenchWorkpad,
): void {
  if (workpad.goalLoop) {
    addGraphNode(nodes, {
      id: "goal-loop",
      kind: "goal-loop",
      lane: "main",
      label: "目标循环",
      status: workpad.conversationLifecycle === "running" ? "running" : "completed",
      summary: workpad.goalLoop.summary,
      reason: "主 Agent 观察当前证据，判断下一步应该继续、等待、修复或停回用户；它只是解释和选择策略，不替代真实 gate。",
      target: {
        ...targetBase,
        schedulerRunId: readStringScope(workpad.goalLoop.recommendedActionScope, "schedulerRunId"),
      },
      stage: "demand",
      visualKind: "tool",
      inputSummary: workpad.goalLoop.routingLabel,
      outputSummary: workpad.goalLoop.recommendedActionReason ?? workpad.goalLoop.stalenessInstruction,
      evidenceRefs: [
        ...(workpad.goalLoop.artifact ? [{ label: "Goal Loop", ref: workpad.goalLoop.artifact, kind: "artifact" } satisfies DemandAgentRunEvidenceRef] : []),
        ...(workpad.goalLoop.nextStepPacketArtifact ? [{ label: "下一步包", ref: workpad.goalLoop.nextStepPacketArtifact, kind: "artifact" } satisfies DemandAgentRunEvidenceRef] : []),
      ],
      attempts: [],
    });
    addGraphEdge(edges, "main-agent", "goal-loop", "continues-to", "观察证据", "loop", "primary");
    addGraphEdge(edges, "goal-loop", "main-agent", "returns", "建议回到真实 gate", "loop", "return");
  }
  if (workpad.controlledSchedulerStepReceipt || workpad.controlledSchedulerStepTrace) {
    const receipt = workpad.controlledSchedulerStepReceipt ?? workpad.controlledSchedulerStepTrace?.items[0];
    addGraphNode(nodes, {
      id: "controlled-continuation",
      kind: "automation-loop",
      lane: "roles",
      label: "受控连续推进",
      status: receipt?.status === "needs-review" || receipt?.status === "needs-reevaluation" ? "needs-change" : "completed",
      summary: receipt?.body ?? workpad.controlledSchedulerStepTrace?.body ?? "已记录受控连续推进证据。",
      reason: "一次人工授权后，AHO 只推进已支持的本地 scheduler gate，并在终点、人类 gate、阻塞或预算边界停下。",
      target: { ...targetBase },
      stage: "execution",
      visualKind: "tool",
      inputSummary: receipt?.executedStepLabel,
      outputSummary: receipt?.nextStepLabel ?? receipt?.readinessLabel,
      evidenceRefs: (receipt?.evidenceRefs ?? workpad.controlledSchedulerStepTrace?.evidenceRefs ?? [])
        .map((ref): DemandAgentRunEvidenceRef => ({ label: "受控推进", ref, kind: "artifact" })),
      attempts: [],
    });
    addGraphEdge(edges, nodes.has("goal-loop") ? "goal-loop" : "main-agent", "controlled-continuation", "continues-to", "受控推进", "loop", "primary");
  }
}

function addSchedulerGraphNodes(
  nodes: Map<string, DemandAgentRunGraphNode>,
  edges: DemandAgentRunGraphEdge[],
  targetBase: DemandAgentRunGraphNode["target"],
  workpad: WorkbenchWorkpad,
): void {
  const workerPaths = workpad.schedulerWorkerPaths ?? [];
  const workerNodeIds: string[] = [];
  for (const path of workerPaths) {
    const nodeId = `scheduler-worker:${path.start.id}`;
    workerNodeIds.push(nodeId);
    addGraphNode(nodes, {
      id: nodeId,
      kind: "scheduler-worker",
      lane: "roles",
      label: `worker ${path.start.unitId}`,
      status: graphStatusFromSchedulerWorkerPath(path.status),
      summary: schedulerWorkerPathSummary(path),
      reason: "低冲突任务在独立 worktree 中执行；worker 输出只是候选结果，必须通过验证、审查和后续集成检查。",
      target: {
        ...targetBase,
        schedulerRunId: path.start.schedulerRunId,
        schedulerWorkerStartId: path.start.id,
        runId: path.reworkResult?.reworkRunId ?? path.result?.runId ?? path.start.runId,
        worktreeId: path.reworkResult?.worktreeId ?? path.result?.worktreeId ?? path.start.worktreeId,
      },
      stage: "execution",
      visualKind: "worker",
      inputSummary: `任务单元：${path.start.unitId}`,
      outputSummary: path.audit?.auditStatus ?? path.reworkAudit?.auditStatus ?? path.validation?.validationStatus ?? path.result?.status,
      evidenceRefs: schedulerWorkerPathEvidence(path),
      attempts: [],
    });
    addGraphEdge(edges, nodes.has("controlled-continuation") ? "controlled-continuation" : "main-agent", nodeId, "continues-to", "启动低冲突 worker", "solid", "worker-branch");
    if (path.reworkPlan || path.reworkStart || path.reworkResult || path.reworkValidation || path.reworkAudit) {
      const reworkNodeId = `scheduler-rework:${path.start.id}`;
      addGraphNode(nodes, {
        id: reworkNodeId,
        kind: "rework-coder",
        lane: "roles",
        label: "bounded rework",
        status: graphStatusFromRoleStatus(path.reworkAudit?.status ?? path.reworkValidation?.status ?? path.reworkResult?.status ?? path.reworkStart?.status ?? path.reworkPlan?.status),
        summary: path.reworkPlan?.reworkReason ?? "worker 输出进入 bounded rework 后重新验证/审查。",
        reason: "rework 只修复当前 worker 的候选输出，不会修改 source root 或跨 Change 合并。",
        target: {
          ...targetBase,
          schedulerRunId: path.start.schedulerRunId,
          schedulerWorkerStartId: path.start.id,
          runId: path.reworkResult?.reworkRunId,
          worktreeId: path.reworkResult?.worktreeId ?? path.reworkStart?.worktreeId,
        },
        stage: "execution",
        visualKind: "worker",
        inputSummary: path.reworkPlan?.blockingSource,
        outputSummary: path.reworkAudit?.auditStatus ?? path.reworkValidation?.validationStatus ?? path.reworkResult?.status,
        evidenceRefs: schedulerWorkerReworkEvidence(path),
        attempts: [],
      });
      addGraphEdge(edges, nodeId, reworkNodeId, "triggers-rework", "bounded rework", "loop", "rework");
      addGraphEdge(edges, reworkNodeId, nodeId, "returns", "修复结果回到 worker 证据", "loop", "return");
    }
  }
  if (workpad.schedulerIntegrationCandidate) {
    const candidate = workpad.schedulerIntegrationCandidate;
    addGraphNode(nodes, {
      id: `scheduler-candidate:${candidate.id}`,
      kind: "scheduler-integration-candidate",
      lane: "integration",
      label: "组合候选",
      status: candidate.status === "ready" ? "waiting-user" : candidate.blockedCount > 0 ? "needs-change" : "queued",
      summary: candidate.waitingReason ?? `${candidate.readyCount} 个 worker 输出已准备组合检查。`,
      reason: "同一 Change 下的 worker 输出汇合为组合候选；它仍需要人工确认 IntegrationCheck。",
      target: {
        ...targetBase,
        schedulerRunId: candidate.schedulerRunId,
        schedulerIntegrationCandidateId: candidate.id,
        candidateId: candidate.id,
      },
      stage: "integration",
      visualKind: "review",
      inputSummary: candidate.readyWorktreeIds.join(", "),
      outputSummary: `ready=${candidate.readyCount}, blocked=${candidate.blockedCount}`,
      evidenceRefs: candidate.artifact ? [{ label: "组合候选", ref: candidate.artifact, kind: "artifact" }] : [],
      attempts: [],
    });
    const candidateNodeId = `scheduler-candidate:${candidate.id}`;
    for (const workerNodeId of workerNodeIds) {
      addGraphEdge(edges, workerNodeId, candidateNodeId, "requires-evidence", "worker 输出汇合", "solid", "worker-join");
    }
  }
  if (workpad.schedulerIntegrationCheckHandoff) {
    const handoff = workpad.schedulerIntegrationCheckHandoff;
    const nodeId = `scheduler-integration-check:${handoff.integrationCheckId}`;
    addGraphNode(nodes, {
      id: nodeId,
      kind: "integration-check",
      lane: "integration",
      label: "IntegrationCheck",
      status: graphStatusFromRoleStatus(handoff.currentIntegrationCheckStatus ?? handoff.integrationCheckStatus),
      summary: `组合检查状态：${handoff.currentIntegrationCheckStatus ?? handoff.integrationCheckStatus}`,
      reason: "组合检查会在 integration worktree 中验证 worker 输出能否安全合并；apply/discard 仍是人工 gate。",
      target: {
        ...targetBase,
        schedulerRunId: handoff.schedulerRunId,
        schedulerIntegrationCandidateId: handoff.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: handoff.id,
        applyCheckId: handoff.integrationCheckId,
      },
      stage: "integration",
      visualKind: "review",
      inputSummary: handoff.readyWorktreeIds.join(", "),
      outputSummary: handoff.status,
      evidenceRefs: handoff.artifact ? [{ label: "IntegrationCheck handoff", ref: handoff.artifact, kind: "artifact" }] : [],
      attempts: [],
    });
    addGraphEdge(edges, `scheduler-candidate:${handoff.schedulerIntegrationCandidateId}`, nodeId, "continues-to", "人工确认组合检查", "solid", "primary");
  }
  if (workpad.schedulerIntegrationOutcome) {
    const outcome = workpad.schedulerIntegrationOutcome;
    const nodeId = `scheduler-integration-outcome:${outcome.id}`;
    addGraphNode(nodes, {
      id: nodeId,
      kind: "scheduler-completion",
      lane: "integration",
      label: "组合结果",
      status: outcome.status === "blocked" ? "needs-change" : "completed",
      summary: outcome.outcomeReason,
      reason: "组合结果只归并同一 Change 的 worker 输出；source root 仍只能通过人工 apply 或已授权本地 gate 修改。",
      target: {
        ...targetBase,
        schedulerRunId: outcome.schedulerRunId,
        schedulerIntegrationCandidateId: outcome.schedulerIntegrationCandidateId,
        schedulerIntegrationCheckHandoffId: outcome.schedulerIntegrationCheckHandoffId,
        schedulerIntegrationOutcomeId: outcome.id,
        applyCheckId: outcome.integrationCheckId,
      },
      stage: "integration",
      visualKind: "review",
      inputSummary: outcome.integrationCheckStatus,
      outputSummary: outcome.status,
      evidenceRefs: outcome.artifact ? [{ label: "组合结果", ref: outcome.artifact, kind: "artifact" }] : [],
      attempts: [],
    });
    addGraphEdge(edges, `scheduler-integration-check:${outcome.integrationCheckId}`, nodeId, "returns", "组合检查结果", "solid", "primary");
  }
  if (workpad.schedulerRunCompletion || workpad.schedulerRunBlockedCloseout) {
    const completion = workpad.schedulerRunCompletion;
    const blocked = workpad.schedulerRunBlockedCloseout;
    const nodeId = completion ? `scheduler-completion:${completion.id}` : `scheduler-blocked:${blocked?.id ?? "unknown"}`;
    addGraphNode(nodes, {
      id: nodeId,
      kind: "terminal-gate",
      lane: "integration",
      label: completion ? "Scheduler 完成" : "Scheduler 阻塞",
      status: completion ? "completed" : "needs-change",
      summary: completion?.outcomeReason ?? blocked?.closeoutReason ?? "低冲突任务路径停在阻塞状态。",
      reason: "这是同一 Change 内 scheduler 路径的终点或阻塞说明，不会自动进入远端、PR、合并或 Harness evolution。",
      target: {
        ...targetBase,
        schedulerRunId: completion?.schedulerRunId ?? blocked?.schedulerRunId,
        schedulerRunCompletionId: completion?.id,
        schedulerRunBlockedCloseoutId: blocked?.id,
      },
      stage: "terminal",
      visualKind: "terminal",
      inputSummary: completion?.integrationCheckStatus ?? blocked?.reason,
      outputSummary: completion?.status ?? blocked?.status,
      evidenceRefs: [
        ...(completion?.artifact ? [{ label: "scheduler completion", ref: completion.artifact, kind: "artifact" } satisfies DemandAgentRunEvidenceRef] : []),
        ...(blocked?.artifact ? [{ label: "scheduler blocker", ref: blocked.artifact, kind: "artifact" } satisfies DemandAgentRunEvidenceRef] : []),
      ],
      attempts: [],
    });
    if (completion?.schedulerIntegrationOutcomeId) {
      addGraphEdge(edges, `scheduler-integration-outcome:${completion.schedulerIntegrationOutcomeId}`, nodeId, "continues-to", "scheduler 本地收尾", "solid", "terminal");
    }
  }
}

function addConfirmationGraphNodes(
  nodes: Map<string, DemandAgentRunGraphNode>,
  edges: DemandAgentRunGraphEdge[],
  targetBase: DemandAgentRunGraphNode["target"],
  queue: WorkbenchConfirmationQueue,
): void {
  const items = [...queue.current, ...(queue.primary ? [queue.primary] : [])];
  for (const item of dedupeGraphConfirmationItems(items).filter((entry) => entry.changeId === targetBase.changeId || entry.conversationId === targetBase.conversationId)) {
    const node = confirmationNodeFromItem(targetBase, item);
    if (!node) continue;
    addGraphNode(nodes, node);
    addGraphEdge(edges, "main-agent", node.id, node.kind === "memory-closeout" ? "background-maintenance" : "continues-to", item.summary);
    if (nodes.has("result-review")) addGraphEdge(edges, "result-review", node.id, "continues-to", item.whyNeedsConfirmation);
  }
}

function confirmationNodeFromItem(targetBase: DemandAgentRunGraphNode["target"], item: WorkbenchConfirmationQueueItem): DemandAgentRunGraphNode | null {
  const map: Partial<Record<WorkbenchConfirmationQueueItemKind, DemandAgentRunGraphNodeKind>> = {
    "integration-check": "integration-check",
    "integration-apply": "integration-check",
    "landing-readiness": "merge-reviewer-agent",
    "landing-queue": "remote-landing",
    "pr-draft": "pr-draft-adapter",
    "pr-review": "pr-review-handoff",
    "remote-landing": "remote-landing",
    "post-merge": "post-merge-sync",
  };
  const kind = map[item.kind];
  if (!kind) return null;
  const lane: DemandAgentRunGraphLaneId = kind === "pr-draft-adapter" || kind === "pr-review-handoff" || kind === "remote-landing" || kind === "post-merge-sync" || kind === "merge-reviewer-agent" || kind === "integration-check"
    ? "integration"
    : "roles";
  return {
    id: `confirm:${item.id}`,
    kind,
    lane,
    label: graphNodeKindLabel(kind),
    status: item.status === "failed" ? "failed" : item.status === "passed" || item.status === "applied" ? "completed" : "waiting-user",
    summary: item.summary,
    reason: item.whyNeedsConfirmation,
    target: {
      ...targetBase,
      resultId: item.resultId,
      runId: item.runId,
      worktreeId: item.worktreeId,
      applyCheckId: item.applyCheckId,
      landingPackageId: item.landingPackageId,
    },
    inputSummary: item.riskSummary,
    outputSummary: item.confirmEffect,
    evidenceRefs: item.evidenceRefs.map((ref): DemandAgentRunEvidenceRef => ({ label: "确认证据", ref, kind: "artifact" })),
    attempts: [],
  };
}

function connectRolePath(edges: DemandAgentRunGraphEdge[], nodeIds: string[]): void {
  for (let index = 1; index < nodeIds.length; index += 1) {
    addGraphEdge(edges, nodeIds[index - 1], nodeIds[index], nodeIds[index].includes("validator") || nodeIds[index].includes("auditor") ? "requires-evidence" : "continues-to", "进入下一角色");
  }
}

function addGraphNode(nodes: Map<string, DemandAgentRunGraphNode>, node: DemandAgentRunGraphNode): void {
  const normalizedNode: DemandAgentRunGraphNode = {
    ...node,
    stage: node.stage ?? graphStageFromNodeKind(node.kind, node.lane),
    visualKind: node.visualKind ?? graphVisualKindFromNodeKind(node.kind),
  };
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, normalizedNode);
    return;
  }
  nodes.set(node.id, {
    ...existing,
    ...normalizedNode,
    evidenceRefs: dedupeEvidenceRefs([...existing.evidenceRefs, ...normalizedNode.evidenceRefs]),
    attempts: dedupeGraphAttempts([...existing.attempts, ...normalizedNode.attempts]),
  });
}

function addGraphEdge(
  edges: DemandAgentRunGraphEdge[],
  from: string,
  to: string,
  kind: DemandAgentRunGraphEdgeKind,
  label: string,
  edgeStyle?: DemandAgentRunGraphEdgeStyle,
  edgeRole?: DemandAgentRunGraphEdgeRole,
): void {
  if (from === to) return;
  edges.push({
    id: `${from}->${to}:${kind}`,
    from,
    to,
    kind,
    label,
    edgeStyle: edgeStyle ?? graphEdgeStyleFromKind(kind),
    edgeRole: edgeRole ?? graphEdgeRoleFromKind(kind),
  });
}

function dedupeGraphEdges(edges: DemandAgentRunGraphEdge[]): DemandAgentRunGraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (seen.has(edge.id)) return false;
    seen.add(edge.id);
    return true;
  });
}

function dedupeEvidenceRefs(refs: DemandAgentRunEvidenceRef[]): DemandAgentRunEvidenceRef[] {
  const seen = new Set<string>();
  return refs.filter((item) => {
    const key = `${item.kind}:${item.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeGraphAttempts(attempts: DemandAgentRunAttemptSummary[]): DemandAgentRunAttemptSummary[] {
  const seen = new Set<string>();
  return attempts.filter((attempt) => {
    if (seen.has(attempt.id)) return false;
    seen.add(attempt.id);
    return true;
  }).slice(-8);
}

function graphStatusFromLifecycle(lifecycle: WorkbenchConversationLifecycle): DemandAgentRunGraphNodeStatus {
  if (lifecycle === "running") return "running";
  if (lifecycle === "waiting-user") return "waiting-user";
  if (lifecycle === "archived-readonly") return "completed";
  if (lifecycle === "abandoned") return "skipped";
  return "idle";
}

function graphStatusFromRoleStatus(status: string | undefined): DemandAgentRunGraphNodeStatus {
  const normalized = (status ?? "").toLowerCase();
  if (["running", "created", "claimed", "in-progress"].includes(normalized)) return "running";
  if (["queued", "pending", "draft"].includes(normalized)) return "queued";
  if (["completed", "passed", "approved", "approved-with-notes", "ready", "done"].includes(normalized)) return "completed";
  if (["failed", "error", "blocked"].includes(normalized)) return normalized === "blocked" ? "needs-change" : "failed";
  if (["needs-user-input", "needs-rework", "changes-requested"].includes(normalized)) return "needs-change";
  if (["cancelled", "skipped", "stopped"].includes(normalized)) return "skipped";
  return "idle";
}

type SchedulerWorkerPath = NonNullable<WorkbenchWorkpad["schedulerWorkerPaths"]>[number];

function graphStatusFromSchedulerWorkerPath(status: SchedulerWorkerPath["status"]): DemandAgentRunGraphNodeStatus {
  if (status.includes("failed")) return "failed";
  if (status.includes("blocked")) return "needs-change";
  if (status.includes("pending")) return "running";
  if (status === "audit-approved" || status === "rework-audit-approved") return "completed";
  return "running";
}

function schedulerWorkerPathSummary(path: SchedulerWorkerPath): string {
  if (path.status === "audit-approved" || path.status === "rework-audit-approved") return "worker 输出已通过验证和审查。";
  if (path.status.includes("rework")) return "worker 输出正在 bounded rework / 复验路径中。";
  if (path.status.includes("validation")) return "worker 输出正在验证。";
  if (path.status.includes("audit")) return "worker 输出正在审查。";
  if (path.status.includes("failed")) return "worker 输出失败，需要修复或人工判断。";
  return "worker 正在独立 worktree 中执行当前低冲突任务。";
}

function schedulerWorkerPathEvidence(path: SchedulerWorkerPath): DemandAgentRunEvidenceRef[] {
  const refs: DemandAgentRunEvidenceRef[] = [];
  pushArtifactRef(refs, "worker start", path.start.artifact);
  pushArtifactRef(refs, "worker result", path.result?.artifact);
  pushArtifactRef(refs, "worker validation", path.validation?.artifact);
  pushArtifactRef(refs, "worker audit", path.audit?.artifact);
  pushRunRef(refs, "code run", path.result?.runId ?? path.start.runId);
  pushRunRef(refs, "validation run", path.validation?.validationRunId);
  pushRunRef(refs, "audit run", path.audit?.auditRunId);
  return refs;
}

function schedulerWorkerReworkEvidence(path: SchedulerWorkerPath): DemandAgentRunEvidenceRef[] {
  const refs: DemandAgentRunEvidenceRef[] = [];
  pushArtifactRef(refs, "rework plan", path.reworkPlan?.artifact);
  pushArtifactRef(refs, "rework start", path.reworkStart?.artifact);
  pushArtifactRef(refs, "rework result", path.reworkResult?.artifact);
  pushArtifactRef(refs, "rework validation", path.reworkValidation?.artifact);
  pushArtifactRef(refs, "rework audit", path.reworkAudit?.artifact);
  pushRunRef(refs, "rework run", path.reworkResult?.reworkRunId ?? path.reworkStart?.reworkRunId);
  pushRunRef(refs, "rework validation", path.reworkValidation?.validationRunId);
  pushRunRef(refs, "rework audit", path.reworkAudit?.auditRunId);
  return refs;
}

function pushArtifactRef(refs: DemandAgentRunEvidenceRef[], label: string, ref: string | undefined): void {
  if (ref) refs.push({ label, ref, kind: "artifact" });
}

function pushRunRef(refs: DemandAgentRunEvidenceRef[], label: string, ref: string | undefined): void {
  if (ref) refs.push({ label, ref, kind: "run" });
}

function readStringScope(scope: Record<string, string | string[]> | undefined, key: string): string | undefined {
  const value = scope?.[key];
  return typeof value === "string" ? value : undefined;
}

function graphStageFromNodeKind(kind: DemandAgentRunGraphNodeKind, lane: DemandAgentRunGraphLaneId): DemandAgentRunGraphNode["stage"] {
  if (lane === "maintenance") return "maintenance";
  if (kind === "main-agent" || kind === "goal-loop") return "demand";
  if (kind === "planning-agent") return "planning";
  if (kind === "coder-agent" || kind === "rework-coder" || kind === "delegate-task" || kind === "tool-policy-gate" || kind === "scheduler-worker" || kind === "automation-loop") return "execution";
  if (kind === "validator" || kind === "boundary-audit") return "validation";
  if (kind === "auditor-agent" || kind === "result-review") return "review";
  if (kind === "integration-check" || kind === "integration-fix-agent" || kind === "scheduler-integration-candidate" || kind === "scheduler-completion") return "integration";
  if (kind === "merge-reviewer-agent" || kind === "pr-draft-adapter" || kind === "pr-feedback-sweep" || kind === "pr-review-handoff" || kind === "remote-landing" || kind === "post-merge-sync" || kind === "remote-branch-cleanup") return "landing";
  if (kind === "terminal-gate") return "terminal";
  return "execution";
}

function graphVisualKindFromNodeKind(kind: DemandAgentRunGraphNodeKind): DemandAgentRunGraphNode["visualKind"] {
  if (kind === "main-agent" || kind === "planning-agent" || kind === "coder-agent" || kind === "rework-coder" || kind === "auditor-agent") return "agent";
  if (kind === "scheduler-worker") return "worker";
  if (kind === "validator" || kind === "tool-policy-gate" || kind === "boundary-audit" || kind === "automation-loop" || kind === "goal-loop") return "tool";
  if (kind === "result-review" || kind === "integration-check" || kind === "integration-fix-agent" || kind === "scheduler-integration-candidate" || kind === "scheduler-completion" || kind === "merge-reviewer-agent") return "review";
  if (kind === "terminal-gate" || kind === "memory-closeout") return "terminal";
  if (kind.includes("pr") || kind.includes("remote") || kind.includes("merge")) return "gate";
  return "default";
}

function graphEdgeStyleFromKind(kind: DemandAgentRunGraphEdgeKind): DemandAgentRunGraphEdgeStyle {
  if (kind === "triggers-rework") return "loop";
  if (kind === "returns" || kind === "background-maintenance") return "dashed";
  return "solid";
}

function graphEdgeRoleFromKind(kind: DemandAgentRunGraphEdgeKind): DemandAgentRunGraphEdgeRole {
  if (kind === "triggers-rework") return "rework";
  if (kind === "returns") return "return";
  if (kind === "background-maintenance") return "background";
  return "primary";
}

function roleKindFromRoleId(roleId: string): DemandAgentRunGraphNodeKind {
  if (roleId === "planning-agent") return "planning-agent";
  if (roleId === "rework-coder") return "rework-coder";
  if (roleId === "validator") return "validator";
  if (roleId === "auditor-agent") return "auditor-agent";
  return "coder-agent";
}

function roleLabelForGraph(roleId: string): string {
  if (roleId === "planning-agent") return "planning-agent";
  if (roleId === "coder-agent") return "coder-agent";
  if (roleId === "rework-coder") return "rework-coder";
  if (roleId === "validator") return "validator";
  if (roleId === "auditor-agent") return "auditor-agent";
  return roleId;
}

function roleReason(roleId: string): string {
  if (roleId === "planning-agent") return "主 agent 委派它把需求澄清并整理为可执行计划。";
  if (roleId === "coder-agent") return "主 agent 委派它在隔离工作区实现并自测。";
  if (roleId === "rework-coder") return "主 agent 根据失败证据或用户反馈委派它重新处理。";
  if (roleId === "validator") return "主 agent 委派它做独立机械验证。";
  if (roleId === "auditor-agent") return "主 agent 委派它做语义审查。";
  return "主 agent 委派该角色处理当前需求的一部分。";
}

function graphNodeKindLabel(kind: DemandAgentRunGraphNodeKind): string {
  const labels: Record<DemandAgentRunGraphNodeKind, string> = {
    "main-agent": "主 agent",
    "goal-loop": "目标循环",
    "automation-loop": "自动推进",
    "delegate-task": "delegateTask",
    "tool-policy-gate": "ToolPolicyGate",
    "boundary-audit": "边界审计",
    "planning-agent": "planning-agent",
    "coder-agent": "coder-agent",
    "rework-coder": "rework-coder",
    "validator": "validator",
    "auditor-agent": "auditor-agent",
    "result-review": "结果整理",
    "scheduler-worker": "低冲突 worker",
    "scheduler-integration-candidate": "组合候选",
    "scheduler-completion": "scheduler 收尾",
    "terminal-gate": "终点",
    "integration-check": "兼容性检查",
    "integration-fix-agent": "integration-fix-agent",
    "merge-reviewer-agent": "merge-reviewer-agent",
    "pr-draft-adapter": "PR 草稿",
    "pr-feedback-sweep": "PR 反馈检查",
    "pr-review-handoff": "人工评审",
    "remote-landing": "远端合并",
    "post-merge-sync": "本地同步",
    "remote-branch-cleanup": "远端分支清理",
    "memory-closeout": "记忆 closeout",
    "documentation-agent": "documentation-agent",
    "architecture-agent": "architecture-agent",
    "evolution-agent": "evolution-agent",
    "evolution-scorer": "evolution-scorer",
    "evolution-reviewer": "evolution-reviewer",
  };
  return labels[kind];
}


function dedupeGraphConfirmationItems(items: WorkbenchConfirmationQueueItem[]): WorkbenchConfirmationQueueItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
