import { createHash } from "node:crypto";
import { canApplyResultFromGate, classifyApplyReadiness, evaluateSkillNativeCandidateGate } from "../apply/gate.js";
import type { WorktreeGateState } from "../apply/manager.js";
import { resolveProjectActiveExecutionScope } from "../project-runtime/active-execution-scope.js";
import type { ProjectExecutionRuntimePort, ProjectHarnessExecutionPort } from "../project-runtime/execution-ports.js";
import { listWorktreeStatuses } from "../worktree/manager.js";
import type { ManagedProject } from "../types/index.js";
import { compactTimestamp } from "./paths.js";
import type { IntegrationCheckCandidate, IntegrationCheckTarget, SkillNativeIntegrationCheckTarget } from "./types.js";

export async function findIntegrationCheckCandidate(project: ManagedProject, changeId?: string): Promise<IntegrationCheckCandidate | null> {
  const scope = await resolveProjectActiveExecutionScope(project, changeId);
  return findSkillNativeIntegrationCheckCandidate(project, scope.runtime, scope.harness, changeId);
}

export async function findSkillNativeIntegrationCheckCandidate(
  project: ManagedProject,
  runtime: ProjectExecutionRuntimePort,
  harness: ProjectHarnessExecutionPort,
  changeId?: string,
): Promise<IntegrationCheckCandidate | null> {
  const targets = selectIntegrationCandidateTargets(
    await collectSkillNativeReadyTargets(project, runtime, harness, undefined, changeId),
    changeId,
  );
  if (targets.length < 2) return null;
  return {
    id: `candidate:${targets.map((target) => target.worktreeId).join("+")}`,
    targets,
    summary: `${targets.length} 个结果可以先做兼容性检查。`,
    riskSummary: "检查会在临时工作区里按顺序试应用这些结果，不会修改项目源码。",
  };
}

export async function collectSkillNativeReadyTargets(
  project: ManagedProject,
  runtime: ProjectExecutionRuntimePort,
  harness: ProjectHarnessExecutionPort,
  requestedWorktreeIds?: string[],
  expectedChangeId?: string,
): Promise<SkillNativeIntegrationCheckTarget[]> {
  const requested = requestedWorktreeIds?.length ? requestedWorktreeIds : null;
  if (requested) assertUniqueRequestedWorktreeIds(requested);
  const requestedSet = requested ? new Set(requested) : null;
  const statuses = await listWorktreeStatuses(runtime);
  const statusById = new Map(statuses.map((status) => [status.worktreeId, status]));
  if (requested) {
    for (const worktreeId of requested) {
      if (!statusById.has(worktreeId)) throw new Error(`Requested worktree ${worktreeId} is not known to the project.`);
    }
  }

  const targets: SkillNativeIntegrationCheckTarget[] = [];
  for (const worktree of statuses.filter((item) => item.status !== "applied")) {
    if (requestedSet && !requestedSet.has(worktree.worktreeId)) continue;
    const gate = await evaluateSkillNativeCandidateGate(project, runtime, harness, worktree.worktreeId).catch(() => null);
    if (!gate || !canApplyResultFromGate(gate) || classifyApplyReadiness(gate).kind !== "ready" || !gate.validation || !gate.audit) continue;
    targets.push({
      ...targetFromGate(gate),
      validationRunId: gate.validation.id,
      auditRunId: gate.audit.id,
    });
  }
  const sorted = targets.sort((left, right) => `${left.changeId}:${left.worktreeId}`.localeCompare(`${right.changeId}:${right.worktreeId}`));
  const scoped = expectedChangeId && !requested
    ? sorted.filter((target) => target.changeId === expectedChangeId)
    : sorted;
  assertSameChangeTargets(scoped);
  if (expectedChangeId && scoped.some((target) => target.changeId !== expectedChangeId)) {
    throw new Error("Integration check targets must belong to the requested Change.");
  }
  if (requested) {
    const readyIds = new Set(scoped.map((target) => target.worktreeId));
    for (const worktreeId of requested) {
      const status = statusById.get(worktreeId);
      if (status?.status === "applied") throw new Error(`Requested worktree ${worktreeId} has already been applied.`);
      if (!readyIds.has(worktreeId)) throw new Error(`Requested worktree ${worktreeId} is not ready for integration check.`);
    }
    if (scoped.length !== requested.length) throw new Error("Requested integration-check targets did not resolve exactly.");
  }
  return scoped;
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
