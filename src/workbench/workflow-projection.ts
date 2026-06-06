import type { ResolvedMemory, WorkflowRunSummary } from "../types/index.js";
import {
  readLatestDecompositionPlan,
  readLatestDecompositionReadinessManifest,
  readLatestTaskQueueProposal,
  readLatestWorkflowGraphPlan,
  readWorkflowGraphPlan,
  type DecompositionPlan,
  type DecompositionReadinessManifest,
  type DecompositionRecommendation,
  type TaskQueueProposal,
  type WorkflowGraphPlan,
} from "../workflow-artifacts/manager.js";

export interface WorkbenchDecompositionPlanSummary {
  id: string;
  changeId: string;
  status: DecompositionPlan["status"];
  recommendation: DecompositionRecommendation;
  rationale: string;
  unitCount: number;
  dependencyCount: number;
  conflictScopeCount: number;
  riskSummary: string;
  openQuestionCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchDecompositionReadinessSummary {
  id: string;
  changeId: string;
  decompositionPlanId: string;
  status: DecompositionReadinessManifest["status"];
  recommendation: DecompositionRecommendation;
  schedulerEligible: boolean;
  nextAllowedAction: DecompositionReadinessManifest["nextAllowedAction"];
  guardrailStatus: "passed" | "blocked" | "failed";
  unitCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchTaskQueueProposalSummary {
  id: string;
  changeId: string;
  decompositionPlanId: string;
  readinessManifestId: string;
  status: TaskQueueProposal["status"];
  queueMode: TaskQueueProposal["queueMode"];
  itemCount: number;
  dependencyCount: number;
  conflictScopeCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchWorkflowGraphPlanSummary {
  id: string;
  changeId: string;
  status: WorkflowGraphPlan["status"];
  graphMode: WorkflowGraphPlan["graphMode"];
  taskQueueProposalId: string;
  readinessManifestId: string;
  nodeCount: number;
  edgeCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

type WorkflowProjectionActionType =
  | "intake.scan"
  | "intake.reanalyze"
  | "planning.generate"
  | "planning.confirm-execution"
  | "planning.decompose"
  | "planning.decomposition.confirm"
  | "planning.decomposition.assess-readiness"
  | "planning.taskqueue.propose"
  | "planning.workflowgraph.compile"
  | "planning.taskqueue.confirm-start"
  | "code.run";

export interface WorkbenchTypedWorkflowNextAction {
  id: string;
  label: string;
  description: string;
  kind: "workflow-action";
  enabled: boolean;
  requiresConfirmation: boolean;
  actionType: WorkflowProjectionActionType;
  planningBundleId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  disabledReason?: string;
}

export interface TypedWorkflowProjectionTopic {
  runs: Array<{ runtime?: string }>;
}

export interface TypedWorkflowProjectionReadiness {
  specReady: boolean;
  planReady: boolean;
  tasksReady: boolean;
}

export interface TypedWorkflowProjectionIntake {
  pendingClarifications: unknown[];
  openQuestions: unknown[];
}

export interface TypedWorkflowPlanningBundle {
  id: string;
  status: "draft" | "confirmed";
}

export async function readLatestDecompositionPlanSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchDecompositionPlanSummary | null> {
  const plan = await readLatestDecompositionPlan(memory, changePath).catch(() => null);
  if (!plan) return null;
  return {
    id: plan.id,
    changeId: plan.changeId,
    status: plan.status,
    recommendation: plan.recommendation,
    rationale: plan.rationale,
    unitCount: plan.units.length,
    dependencyCount: plan.dependencies.length,
    conflictScopeCount: plan.conflictScopes.length,
    riskSummary: plan.riskSummary,
    openQuestionCount: plan.openQuestions.length,
    artifact: plan.artifact,
    markdownArtifact: plan.markdownArtifact,
    updatedAt: plan.updatedAt,
  };
}

export async function readLatestDecompositionReadinessSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchDecompositionReadinessSummary | null> {
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath).catch(() => null);
  if (!manifest) return null;
  const guardrailStatus = manifest.guardrails.some((item) => item.status === "failed")
    ? "failed"
    : manifest.guardrails.some((item) => item.status === "blocked")
      ? "blocked"
      : "passed";
  return {
    id: manifest.id,
    changeId: manifest.changeId,
    decompositionPlanId: manifest.decompositionPlanId,
    status: manifest.status,
    recommendation: manifest.recommendation,
    schedulerEligible: manifest.schedulerEligible,
    nextAllowedAction: manifest.nextAllowedAction,
    guardrailStatus,
    unitCount: manifest.units.length,
    artifact: manifest.artifact,
    markdownArtifact: manifest.markdownArtifact,
    updatedAt: manifest.updatedAt,
  };
}

export async function readLatestTaskQueueProposalSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchTaskQueueProposalSummary | null> {
  const proposal = await readLatestTaskQueueProposal(memory, changePath).catch(() => null);
  if (!proposal) return null;
  return {
    id: proposal.id,
    changeId: proposal.changeId,
    decompositionPlanId: proposal.decompositionPlanId,
    readinessManifestId: proposal.readinessManifestId,
    status: proposal.status,
    queueMode: proposal.queueMode,
    itemCount: proposal.items.length,
    dependencyCount: proposal.dependencies.length,
    conflictScopeCount: proposal.conflictScopes.length,
    artifact: proposal.artifact,
    markdownArtifact: proposal.markdownArtifact,
    updatedAt: proposal.updatedAt,
  };
}

export async function readLatestWorkflowGraphPlanSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchWorkflowGraphPlanSummary | null> {
  const graph = await readLatestWorkflowGraphPlan(memory, changePath).catch(() => null);
  if (!graph) return null;
  return {
    id: graph.id,
    changeId: graph.changeId,
    status: graph.status,
    graphMode: graph.graphMode,
    taskQueueProposalId: graph.taskQueueProposalId,
    readinessManifestId: graph.readinessManifestId,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    artifact: graph.artifact,
    markdownArtifact: graph.markdownArtifact,
    updatedAt: graph.updatedAt,
  };
}

export function readDecompositionPlanProjection(memory: ResolvedMemory, changePath: string): Promise<DecompositionPlan | null> {
  return readLatestDecompositionPlan(memory, changePath).catch(() => null);
}

export function readDecompositionReadinessProjection(memory: ResolvedMemory, changePath: string): Promise<DecompositionReadinessManifest | null> {
  return readLatestDecompositionReadinessManifest(memory, changePath).catch(() => null);
}

export function readTaskQueueProposalProjection(memory: ResolvedMemory, changePath: string): Promise<TaskQueueProposal | null> {
  return readLatestTaskQueueProposal(memory, changePath).catch(() => null);
}

export function readWorkflowGraphPlanProjection(memory: ResolvedMemory, changePath: string, workflowGraphPlanId?: string): Promise<WorkflowGraphPlan | null> {
  return workflowGraphPlanId
    ? readWorkflowGraphPlan(memory, changePath, workflowGraphPlanId).catch(() => null)
    : readLatestWorkflowGraphPlan(memory, changePath).catch(() => null);
}

export function buildTypedWorkflowNextAction(input: {
  topic: TypedWorkflowProjectionTopic;
  readiness: TypedWorkflowProjectionReadiness;
  intake?: TypedWorkflowProjectionIntake;
  planningBundle?: TypedWorkflowPlanningBundle | null;
  decompositionPlan?: WorkbenchDecompositionPlanSummary | null;
  decompositionReadiness?: WorkbenchDecompositionReadinessSummary | null;
  taskQueueProposal?: WorkbenchTaskQueueProposalSummary | null;
  workflowGraphPlan?: WorkbenchWorkflowGraphPlanSummary | null;
  workflowRun?: WorkflowRunSummary | null;
}): WorkbenchTypedWorkflowNextAction {
  const { topic, readiness, intake, planningBundle, decompositionPlan, decompositionReadiness, taskQueueProposal, workflowGraphPlan, workflowRun } = input;
  if (!readiness.specReady && !topic.runs.some((run) => run.runtime === "intake-scan")) {
    return workflowNextAction("intake.scan", "分析需求", "先只读扫描项目，整理当前理解、相关文件和待确认问题。", false);
  }
  if (!readiness.specReady && (intake?.pendingClarifications.length || intake?.openQuestions.length)) {
    return workflowNextAction("intake.reanalyze", "继续澄清需求", "回答需要确认的问题，AHO 会更新当前理解。", false);
  }
  if (planningBundle?.status === "draft") {
    const next = workflowNextAction("planning.confirm-execution", "确认规划", "确认当前方案并写入内部 spec/plan/tasks/ac-map；不会启动执行。");
    return { ...next, planningBundleId: planningBundle.id };
  }
  if (!readiness.specReady || !readiness.planReady || !readiness.tasksReady) {
    return workflowNextAction("planning.generate", "生成方案草案", "在主对话里生成 proposal/spec/design/tasks 草案；确认执行后才写入内部 artifacts。");
  }
  if (!decompositionPlan) {
    return workflowNextAction("planning.decompose", "生成拆分提案", "根据已确认方案生成 DecompositionPlan；不会启动执行。");
  }
  if (decompositionPlan.status === "draft") {
    return { ...workflowNextAction("planning.decomposition.confirm", "确认拆分方向", "确认这个 DecompositionPlan；不会启动执行。"), decompositionPlanId: decompositionPlan.id };
  }
  if (decompositionPlan.status === "confirmed" && decompositionReadiness?.decompositionPlanId !== decompositionPlan.id) {
    return { ...workflowNextAction("planning.decomposition.assess-readiness", "检查执行边界", "生成 DecompositionReadinessManifest；不会启动执行。"), decompositionPlanId: decompositionPlan.id };
  }
  if (decompositionReadiness?.nextAllowedAction === "code.run") {
    return { ...workflowNextAction("code.run", "运行 Code", "readiness 已授权单 Change code.run。"), readinessManifestId: decompositionReadiness.id };
  }
  if (decompositionReadiness?.nextAllowedAction === "taskqueue.proposal") {
    if (!taskQueueProposal || taskQueueProposal.readinessManifestId !== decompositionReadiness.id || ["superseded", "rejected"].includes(taskQueueProposal.status)) {
      return { ...workflowNextAction("planning.taskqueue.propose", "生成 TaskQueue 提案", "生成顺序 TaskQueueProposal；不会启动执行。"), readinessManifestId: decompositionReadiness.id };
    }
    if (!workflowGraphPlan || workflowGraphPlan.taskQueueProposalId !== taskQueueProposal.id || workflowGraphPlan.readinessManifestId !== decompositionReadiness.id) {
      return { ...workflowNextAction("planning.workflowgraph.compile", "编译执行图", "生成 versioned WorkflowGraphPlan；不会启动执行。"), taskQueueProposalId: taskQueueProposal.id, readinessManifestId: decompositionReadiness.id };
    }
    if (!workflowRun || workflowRun.workflowGraphPlanId !== workflowGraphPlan.id) {
      return { ...workflowNextAction("planning.taskqueue.confirm-start", "确认启动 TaskQueue", "重新校验 graph/proposal/readiness 后创建 TaskQueue/TaskRun 并开始顺序执行。"), taskQueueProposalId: taskQueueProposal.id, workflowGraphPlanId: workflowGraphPlan.id };
    }
  }
  return {
    ...workflowNextAction("planning.decomposition.assess-readiness", "等待执行边界", "当前 readiness 不允许直接执行。"),
    enabled: false,
    disabledReason: "当前 DecompositionReadinessManifest 未授权 code.run 或 TaskQueueProposal。",
  };
}

function workflowNextAction(actionType: WorkflowProjectionActionType, label: string, description: string, requiresConfirmation = true): WorkbenchTypedWorkflowNextAction {
  return {
    id: `workflow:${actionType}`,
    label,
    description,
    kind: "workflow-action",
    actionType,
    enabled: true,
    requiresConfirmation,
  };
}
