import type { PlanningArtifactBundle } from "../types.js";
import type {
  DecompositionPlan,
  DecompositionReadinessManifest,
  DecompositionRecommendation,
} from "../../workflow-artifacts/manager.js";

export function decompositionRecommendationLabel(recommendation: DecompositionRecommendation): string {
  switch (recommendation) {
    case "needs-clarification": return "需要先澄清";
    case "multi-change-candidate": return "可考虑拆成多个 Change";
    case "taskgraph-parallel-candidate": return "可考虑 TaskGraph 并行候选";
    case "taskgraph-sequential": return "建议 TaskGraph 顺序执行";
    case "single-change": return "建议保持单 Change";
  }
}

export function renderDecompositionPlanSummary(plan: DecompositionPlan): string {
  return [
    `拆分建议：${decompositionRecommendationLabel(plan.recommendation)}`,
    "",
    plan.rationale,
    "",
    `执行单元：${plan.units.map((unit) => `${unit.id} ${unit.title}`).join("；") || "无需拆分"}`,
    "",
    "确认这个拆分方向只会记录 proposal 接受，不会启动执行。",
  ].join("\n");
}

export function renderDecompositionReadinessSummary(manifest: DecompositionReadinessManifest): string {
  return [
    `执行边界检查：${manifest.status}`,
    "",
    `建议：${decompositionRecommendationLabel(manifest.recommendation)}`,
    `下一步允许动作：${manifest.nextAllowedAction}`,
    "",
    `调度资格：${readinessSchedulerLabel(manifest)}`,
    "本检查不会启动执行、创建子 Change、TaskRun、AgentTask、worktree 或恢复重放。",
  ].join("\n");
}

function readinessSchedulerLabel(manifest: DecompositionReadinessManifest): string {
  if (!manifest.schedulerEligible) return "不可直接调度";
  if (manifest.nextAllowedAction === "scheduler.contract") return "可编译 Scheduler Contract（不启动调度器）";
  if (manifest.nextAllowedAction === "taskqueue.proposal") return "可进入后续 TaskQueue proposal";
  return "可进入后续执行边界检查";
}

export function renderPlanningBundleSummary(bundle: PlanningArtifactBundle): string {
  return [
    `我准备了计划：${bundle.goal}`,
    "",
    `验收标准：${bundle.acceptanceCriteria.join("；")}`,
    `实现方案：${bundle.design}`,
    `任务：${bundle.tasks.map((task) => `${task.id} ${task.title}`).join("；")}`,
    `范围：${bundle.sourceScopeConstraints?.length ? `保持在 ${bundle.sourceScopeConstraints.join("、")}` : "未明确限定具体文件范围"}`,
    bundle.openQuestions.length > 0 ? `待确认：${bundle.openQuestions.join("；")}` : "如果认可，可以确认执行；如果不认可，可以直接在主对话里要求修改。",
  ].join("\n");
}

export function renderPlanningBundleMarkdown(bundle: PlanningArtifactBundle): string {
  return [
    `# Planning Draft ${bundle.id}`,
    "",
    `Status: ${bundle.status}`,
    "",
    "## Goal",
    "",
    bundle.goal,
    "",
    "## Constraints",
    "",
    ...(bundle.constraints.length > 0 ? bundle.constraints.map((item) => `- ${item}`) : ["- None confirmed."]),
    "",
    "## Source Scope Constraints",
    "",
    ...(bundle.sourceScopeConstraints?.length ? bundle.sourceScopeConstraints.map((item) => `- ${item}`) : ["- None explicitly limited."]),
    "",
    "## Acceptance Criteria",
    "",
    ...bundle.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "## Design",
    "",
    bundle.design,
    "",
    "## Tasks",
    "",
    ...bundle.tasks.map((task) => `- ${task.id}: ${task.title} (${task.acIds.join(", ")})`),
    "",
    "## Risks",
    "",
    ...bundle.risks.map((item) => `- ${item}`),
    "",
    "## Open Questions",
    "",
    ...(bundle.openQuestions.length > 0 ? bundle.openQuestions.map((item) => `- ${item}`) : ["- None."]),
    "",
  ].join("\n");
}
