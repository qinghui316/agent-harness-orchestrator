import { listProjectHarnessChanges } from "../project-harness/change.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import { projectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { isGitDirty } from "../project/git.js";
import { getSpecTestContextForChange, getSpecTestStatus } from "../spec-test/manager.js";
import { getLatestAuditSummary } from "../audit/artifacts.js";
import { getLatestValidationSummary } from "../validation/artifacts.js";
import { listWorktreesForChange } from "../worktree/manager.js";
import type { ChangeStatus, ManagedProject } from "../types/index.js";
import { evaluateActiveCount, uniqueSorted } from "./close-gate.js";

export async function getChangeStatus(project: ManagedProject): Promise<ChangeStatus> {
  return getSkillNativeChangeStatus(project);
}

export async function getChangeStatusForChange(
  project: ManagedProject,
  changeId: string,
): Promise<ChangeStatus> {
  return getSkillNativeChangeStatus(project, changeId);
}

async function getSkillNativeChangeStatus(
  project: ManagedProject,
  explicitChangeId?: string,
): Promise<ChangeStatus> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    return unavailableStatus(project, `Project Harness is not ready: ${state.state}.`);
  }
  const active = (await listProjectHarnessChanges(state.resolution.harness.skillRoot))
    .filter((change) => change.status === "active");
  const activeChanges = active.map((change) => ({
    name: change.change_id,
    path: `state/changes/active/${change.change_id}`,
  }));
  const selected = explicitChangeId
    ? active.find((change) => change.change_id === explicitChangeId)
    : active.length === 1 ? active[0] : undefined;
  if (!selected) {
    const closeGate = explicitChangeId
      ? {
        ready: false,
        warnings: [],
        blockingIssues: [`Active demand conversation not found for scoped run: ${explicitChangeId}.`],
      }
      : evaluateActiveCount(activeChanges);
    return {
      projectPath: project.path,
      activeChanges,
      change: null,
      reviewStatus: "missing",
      acMap: null,
      specTest: null,
      latestValidation: null,
      latestAudit: null,
      closeGate,
    };
  }
  const context = await getSpecTestContextForChange(project, selected.change_id);
  const specTest = await getSpecTestStatus(project, { changeId: selected.change_id });
  const runtime = projectExecutionRuntimePort(project, state.resolution);
  const [latestValidation, latestAudit, worktrees] = await Promise.all([
    getLatestValidationSummary(runtime, selected.change_id),
    getLatestAuditSummary(runtime, selected.change_id),
    listWorktreesForChange(runtime, selected.change_id),
  ]);
  const warnings = [...context.changeStatus.closeGate.warnings, ...specTest.warnings];
  const blockingIssues = [...context.changeStatus.closeGate.blockingIssues, ...specTest.blockingIssues];
  if (!latestValidation) warnings.push("No validation run recorded for this change.");
  else if (latestValidation.status === "failed") blockingIssues.push(`Latest validation failed: ${latestValidation.id}.`);
  if (!latestAudit) warnings.push("No audit run recorded for this change.");
  else if (latestAudit.status === "blocked") blockingIssues.push(`Latest audit blocked close: ${latestAudit.id}.`);
  else if (latestAudit.status === "failed") warnings.push(`Latest audit failed or could not be parsed: ${latestAudit.id}.`);
  const hasAppliedWorktree = worktrees.some((worktree) => worktree.status === "applied");
  if (hasAppliedWorktree && (await isGitDirty(project.path)) === true) {
    blockingIssues.push("Source repo has uncommitted changes after apply; commit or clean the source repo before closing the change.");
  }
  for (const worktree of worktrees) {
    if (worktree.status === "applied") warnings.push(`Applied worktree remains available for cleanup: ${worktree.worktreeId}.`);
    else if (worktree.dirty && hasAppliedWorktree) warnings.push(`Superseded dirty worktree remains available for cleanup: ${worktree.worktreeId} (${worktree.checkoutPath}).`);
    else if (worktree.dirty) blockingIssues.push(`Dirty worktree blocks close: ${worktree.worktreeId} (${worktree.checkoutPath}).`);
    else warnings.push(`Active change has AHO-managed worktree: ${worktree.worktreeId}.`);
  }
  return {
    ...context.changeStatus,
    activeChanges,
    specTest,
    latestValidation,
    latestAudit,
    closeGate: {
      ready: blockingIssues.length === 0,
      warnings: uniqueSorted(warnings),
      blockingIssues: uniqueSorted(blockingIssues),
    },
  };
}

function unavailableStatus(project: ManagedProject, reason: string): ChangeStatus {
  return {
    projectPath: project.path,
    activeChanges: [],
    change: null,
    reviewStatus: "missing",
    acMap: null,
    specTest: null,
    latestValidation: null,
    latestAudit: null,
    closeGate: { ready: false, warnings: [], blockingIssues: [reason] },
  };
}

export { evaluateActiveCount };
