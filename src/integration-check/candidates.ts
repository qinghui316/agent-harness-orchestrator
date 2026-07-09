import { createHash } from "node:crypto";
import { canApplyResultFromGate, classifyApplyReadiness, previewWorktreeApply, type WorktreeGateState } from "../apply/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { listWorktreeStatuses } from "../worktree/manager.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { compactTimestamp } from "./paths.js";
import type { IntegrationCheckCandidate, IntegrationCheckTarget } from "./types.js";

export async function findIntegrationCheckCandidate(project: ManagedProject, changeId?: string): Promise<IntegrationCheckCandidate | null> {
  const memory = await resolveProjectMemory(project);
  if (!memory.supported || !memory.writable) return null;
  const targets = selectIntegrationCandidateTargets(await collectReadyTargetCandidates(project, memory), changeId);
  if (targets.length < 2) return null;
  return {
    id: `candidate:${targets.map((target) => target.worktreeId).join("+")}`,
    targets,
    summary: `${targets.length} 个结果可以先做兼容性检查。`,
    riskSummary: "检查会在临时工作区里按顺序试应用这些结果，不会修改项目源码。",
  };
}

export async function collectReadyTargets(project: ManagedProject, memory: ResolvedMemory, requestedWorktreeIds?: string[], expectedChangeId?: string): Promise<IntegrationCheckTarget[]> {
  const requested = requestedWorktreeIds?.length ? requestedWorktreeIds : null;
  if (requested) assertUniqueRequestedWorktreeIds(requested);
  const sorted = await collectReadyTargetCandidates(project, memory, requestedWorktreeIds);
  assertSameChangeTargets(sorted);
  if (expectedChangeId && sorted.some((target) => target.changeId !== expectedChangeId)) {
    throw new Error("Integration check targets must belong to the requested Change.");
  }
  return sorted;
}

async function collectReadyTargetCandidates(project: ManagedProject, memory: ResolvedMemory, requestedWorktreeIds?: string[]): Promise<IntegrationCheckTarget[]> {
  const requested = requestedWorktreeIds?.length ? requestedWorktreeIds : null;
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

function selectIntegrationCandidateTargets(targets: IntegrationCheckTarget[], changeId: string | undefined): IntegrationCheckTarget[] {
  const groups = new Map<string, IntegrationCheckTarget[]>();
  for (const target of targets) {
    const group = groups.get(target.changeId) ?? [];
    group.push(target);
    groups.set(target.changeId, group);
  }
  if (changeId) return groups.get(changeId) ?? [];
  return [...groups.values()].find((group) => group.length >= 2) ?? [];
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

function assertSameChangeTargets(targets: IntegrationCheckTarget[]): void {
  const changeIds = new Set(targets.map((target) => target.changeId));
  if (changeIds.size > 1) {
    throw new Error("Integration check targets must belong to the same Change.");
  }
}
