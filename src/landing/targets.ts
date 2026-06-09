import { join } from "node:path";
import { collectWorktreeDiff } from "../audit/diff.js";
import { readIntegrationCheck } from "../integration-check/repository.js";
import { getWorktreeStatus } from "../worktree/manager.js";
import type { ResolvedMemory } from "../types/index.js";
import type { LandingReadinessTarget } from "./types.js";
import { displayLandingArtifactPath, unique } from "./utils.js";

export async function targetFromWorktree(memory: ResolvedMemory, worktreeId: string | undefined): Promise<LandingReadinessTarget> {
  if (!worktreeId) throw new Error("landing.prepare requires worktreeId or applyCheckId.");
  const worktree = await getWorktreeStatus(memory, worktreeId);
  if (worktree.status !== "applied" || !worktree.applyRunId) {
    throw new Error(`Cannot prepare landing package: worktree ${worktreeId} has not been applied.`);
  }
  const diff = await collectWorktreeDiff(memory, worktreeId, worktree.changeId);
  return {
    kind: "worktree",
    changeIds: [worktree.changeId],
    worktreeIds: [worktree.worktreeId],
    applyRunId: worktree.applyRunId,
    expectedDiffHash: worktree.worktreeDiffHash ?? diff.diffHash,
    evidenceRefs: [displayLandingArtifactPath(memory, join(memory.runsRoot, worktree.applyRunId, "apply.json"))],
  };
}

export async function targetFromIntegrationCheck(memory: ResolvedMemory, applyCheckId: string): Promise<LandingReadinessTarget> {
  const check = await readIntegrationCheck(memory, applyCheckId);
  if (check.status !== "applied") {
    throw new Error(`Cannot prepare landing package: integration check ${applyCheckId} has not been applied.`);
  }
  if (!check.latestArtifactHash) {
    throw new Error(`Cannot prepare landing package: integration check ${applyCheckId} has no latest artifact hash.`);
  }
  return {
    kind: "integration-check",
    changeIds: unique(check.resultTargets.map((target) => target.changeId)),
    worktreeIds: unique(check.resultTargets.map((target) => target.worktreeId)),
    applyCheckId,
    expectedDiffHash: check.latestArtifactHash,
    evidenceRefs: check.artifactRefs,
  };
}
