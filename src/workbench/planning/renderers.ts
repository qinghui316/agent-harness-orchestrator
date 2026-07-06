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
