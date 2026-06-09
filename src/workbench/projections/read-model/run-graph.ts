import type {
  DemandAgentRunAttemptSummary,
  DemandAgentRunEvidenceRef,
  DemandAgentRunGraph,
  DemandAgentRunGraphEdge,
  DemandAgentRunGraphEdgeKind,
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
    reason: "负责理解需求、解释进展、委派角色，并把结果回到主对话。",
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
        reason: "主 agent 用它把需求沉淀为可执行方案。",
        target: { ...targetBase, roleId: "planning-agent" },
        inputSummary: workpad.intake.currentUnderstanding,
        outputSummary: bundle.design,
        evidenceRefs: bundle.artifact ? [{ label: "方案证据", ref: bundle.artifact, kind: "artifact" }] : [],
        attempts: [],
      });
      addGraphEdge(edges, "main-agent", "role:planning-agent", "delegates", "整理方案");
      addGraphEdge(edges, "role:planning-agent", "main-agent", "returns", "方案回到主对话");
    }
  }

  const roleNodeIds = addRolePipelineGraphNodes(nodes, edges, targetBase, workpad.rolePipeline);
  connectRolePath(edges, roleNodeIds);
  addResultReviewGraphNode(nodes, edges, targetBase, workpad.resultReview, roleNodeIds.at(-1));
  addConfirmationGraphNodes(nodes, edges, targetBase, confirmationQueue);

  return {
    conversationId: selectedTopic.id,
    changeId: selectedTopic.id,
    title: selectedTopic.title,
    summary: `${nodes.size} 个 agent/tool 节点；项目维护不进入默认选中需求运行图。`,
    lanes: demandAgentRunGraphLanes(),
    nodes: [...nodes.values()],
    edges: dedupeGraphEdges(edges),
    updatedAt: selectedTopic.updatedAt,
  };
}

function parentAgentGraphSummary(workpad: WorkbenchWorkpad): string {
  if (workpad.resultReview) return "已汇总实现结果、验证、审查和下一步决定。";
  if (workpad.rolePipeline?.status === "running") return "正在调度角色 agent 执行当前需求。";
  if (workpad.rolePipeline) return "已建立角色执行链路并收集结果。";
  if (workpad.planningArtifactBundle) return "已整理方案，等待确认或后续边界检查。";
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
    addGraphEdge(edges, nodeId, "main-agent", "returns", "结果回到主对话");
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
    addGraphEdge(edges, boundaryNodeId, "main-agent", "returns", failed ? "边界问题回到主对话" : "审计结果回到主对话");
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
  addGraphEdge(edges, "result-review", "main-agent", "returns", "结果回到主对话");
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
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return;
  }
  nodes.set(node.id, {
    ...existing,
    ...node,
    evidenceRefs: dedupeEvidenceRefs([...existing.evidenceRefs, ...node.evidenceRefs]),
    attempts: dedupeGraphAttempts([...existing.attempts, ...node.attempts]),
  });
}

function addGraphEdge(edges: DemandAgentRunGraphEdge[], from: string, to: string, kind: DemandAgentRunGraphEdgeKind, label: string): void {
  if (from === to) return;
  edges.push({ id: `${from}->${to}:${kind}`, from, to, kind, label });
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
  if (roleId === "planning-agent") return "主 agent 委派它把需求澄清和方案沉淀为可执行草案。";
  if (roleId === "coder-agent") return "主 agent 委派它在隔离工作区实现并自测。";
  if (roleId === "rework-coder") return "主 agent 根据失败证据或用户反馈委派它重新处理。";
  if (roleId === "validator") return "主 agent 委派它做独立机械验证。";
  if (roleId === "auditor-agent") return "主 agent 委派它做语义审查。";
  return "主 agent 委派该角色处理当前需求的一部分。";
}

function graphNodeKindLabel(kind: DemandAgentRunGraphNodeKind): string {
  const labels: Record<DemandAgentRunGraphNodeKind, string> = {
    "main-agent": "主 agent",
    "delegate-task": "delegateTask",
    "tool-policy-gate": "ToolPolicyGate",
    "boundary-audit": "边界审计",
    "planning-agent": "planning-agent",
    "coder-agent": "coder-agent",
    "rework-coder": "rework-coder",
    "validator": "validator",
    "auditor-agent": "auditor-agent",
    "result-review": "结果整理",
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
