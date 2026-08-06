import { requireProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { listIntegrationChecks } from "../integration-check/repository.js";
import { listWorktreeStatuses } from "../worktree/manager.js";
import type { ManagedProject } from "../types/index.js";
import { listLandingPackages } from "./repository.js";
import type { LandingCandidate } from "./types.js";
import { targetKey } from "./utils.js";

export async function findLandingCandidate(project: ManagedProject): Promise<LandingCandidate | null> {
  const memory = await requireProjectExecutionRuntimePort(project);
  const packages = await listLandingPackages(memory).catch(() => []);
  const packagedKeys = new Set(packages.map((item) => targetKey(item.target)));
  const checks = await listIntegrationChecks(memory).catch(() => []);
  const appliedCheck = checks.find((check) => check.status === "applied" && !packagedKeys.has(`integration-check:${check.id}`));
  if (appliedCheck) {
    return {
      kind: "integration-check",
      applyCheckId: appliedCheck.id,
      changeIds: appliedCheck.resultTargets.map((target) => target.changeId),
      summary: "已应用的组合结果可以做提交/PR 前检查。",
      riskSummary: "检查只生成本地落地证据包，不会 commit、push、创建 PR 或 merge。",
    };
  }
  const appliedWorktree = (await listWorktreeStatuses(memory)).find((worktree) => {
    if (worktree.status !== "applied" || !worktree.applyRunId) return false;
    if (checks.some((check) => check.status === "applied" && check.resultTargets.some((target) => target.worktreeId === worktree.worktreeId))) return false;
    return !packagedKeys.has(`worktree:${worktree.worktreeId}:${worktree.applyRunId}`);
  });
  if (!appliedWorktree) return null;
  return {
    kind: "worktree",
    worktreeId: appliedWorktree.worktreeId,
    changeIds: [appliedWorktree.changeId],
    summary: "已应用的单个结果可以做提交/PR 前检查。",
    riskSummary: "检查只生成本地落地证据包，不会 commit、push、创建 PR 或 merge。",
  };
}
