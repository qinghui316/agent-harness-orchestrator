import { createHash } from "node:crypto";
import { canApplyResultFromGate, classifyApplyReadiness, previewWorktreeApply, type WorktreeGateState } from "../apply/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { listWorktreeStatuses } from "../worktree/manager.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { compactTimestamp } from "./paths.js";
import type { IntegrationCheckCandidate, IntegrationCheckTarget } from "./types.js";

export async function findIntegrationCheckCandidate(project: ManagedProject): Promise<IntegrationCheckCandidate | null> {
  const memory = await resolveProjectMemory(project);
  if (!memory.supported || !memory.writable) return null;
  const targets = await collectReadyTargets(project, memory);
  if (targets.length < 2) return null;
  return {
    id: `candidate:${targets.map((target) => target.worktreeId).join("+")}`,
    targets,
    summary: `${targets.length} 个结果可以先做兼容性检查。`,
    riskSummary: "检查会在临时工作区里按顺序试应用这些结果，不会修改项目源码。",
  };
}

export async function collectReadyTargets(project: ManagedProject, memory: ResolvedMemory, requestedWorktreeIds?: string[]): Promise<IntegrationCheckTarget[]> {
  const requested = requestedWorktreeIds?.length ? requestedWorktreeIds : null;
  if (requested) assertUniqueRequestedWorktreeIds(requested);
  const requestedSet = requested ? new Set(requested) : null;
  const statuses = await listWorktreeStatuses(memory);
  const statusById = new Map(statuses.map((status) => [status.worktreeId, status]));
  if (requested) {
    for (const worktreeId of requested) {
      if (!statusById.has(worktreeId)) {
        throw new Error(`Requested worktree ${worktreeId} is not known to the project.`);
      }
    }
  }

  const targets: IntegrationCheckTarget[] = [];
  for (const worktree of statuses.filter((item) => item.status !== "applied")) {
    if (requestedSet && !requestedSet.has(worktree.worktreeId)) continue;
    const preview = await previewWorktreeApply(project, worktree.worktreeId).catch(() => null);
    if (!preview || !canApplyResultFromGate(preview.gate)) continue;
    if (classifyApplyReadiness(preview.gate).kind !== "ready") continue;
    targets.push(targetFromGate(preview.gate));
  }
  const sorted = targets.sort((a, b) => `${a.changeId}:${a.worktreeId}`.localeCompare(`${b.changeId}:${b.worktreeId}`));
  if (requested) {
    const readyIds = new Set(sorted.map((target) => target.worktreeId));
    for (const worktreeId of requested) {
      const status = statusById.get(worktreeId);
      if (status?.status === "applied") {
        throw new Error(`Requested worktree ${worktreeId} has already been applied.`);
      }
      if (!readyIds.has(worktreeId)) {
        throw new Error(`Requested worktree ${worktreeId} is not ready for integration check.`);
      }
    }
    if (sorted.length !== requested.length) {
      throw new Error("Requested integration-check targets did not resolve exactly.");
    }
  }
  return sorted;
}

export function targetFromGate(gate: WorktreeGateState): IntegrationCheckTarget {
  return {
    changeId: gate.changeId,
    worktreeId: gate.worktree.worktreeId,
    diffHash: gate.diffHash,
    diffStat: gate.diffStat,
    sourceHead: gate.sourceHead,
  };
}

export function buildIntegrationCheckId(targets: IntegrationCheckTarget[]): string {
  const hash = createHash("sha256").update(targets.map((target) => `${target.changeId}:${target.worktreeId}:${target.diffHash}`).join("|")).digest("hex").slice(0, 8);
  return `apply-check-${compactTimestamp()}-${hash}`;
}

function assertUniqueRequestedWorktreeIds(worktreeIds: string[]): void {
  const seen = new Set<string>();
  for (const worktreeId of worktreeIds) {
    if (seen.has(worktreeId)) throw new Error(`Duplicate requested worktree ${worktreeId}.`);
    seen.add(worktreeId);
  }
}
