import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { collectWorktreeDiff } from "../audit/diff.js";
import { latestArtifactAbsolutePath, latestArtifactForApply } from "../integration-check/artifacts.js";
import { integrationCheckRoot } from "../integration-check/paths.js";
import { readIntegrationCheck } from "../integration-check/repository.js";
import type { ProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { getWorktreeStatus } from "../worktree/manager.js";
import type { LandingReadinessTarget } from "./types.js";
import { diffContentHash, displayLandingArtifactPath, unique } from "./utils.js";

export async function targetFromWorktree(memory: ProjectExecutionRuntimePort, worktreeId: string | undefined): Promise<LandingReadinessTarget> {
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
    expectedDiffHash: diffContentHash(diff.diff),
    evidenceRefs: [displayLandingArtifactPath(memory, join(memory.runsRoot, worktree.applyRunId, "apply.json"))],
  };
}

export async function targetFromIntegrationCheck(memory: ProjectExecutionRuntimePort, applyCheckId: string): Promise<LandingReadinessTarget> {
  const check = await readIntegrationCheck(memory, applyCheckId);
  if (check.status !== "applied") {
    throw new Error(`Cannot prepare landing package: integration check ${applyCheckId} has not been applied.`);
  }
  if (!check.latestArtifactHash) {
    throw new Error(`Cannot prepare landing package: integration check ${applyCheckId} has no latest artifact hash.`);
  }
  const latestArtifact = latestArtifactForApply(check);
  if (!latestArtifact) {
    throw new Error(`Cannot prepare landing package: integration check ${applyCheckId} has no latest artifact.`);
  }
  const artifactPath = latestArtifactAbsolutePath(join(integrationCheckRoot(memory), applyCheckId), latestArtifact);
  const artifactDiff = await readFile(artifactPath, "utf8");
  return {
    kind: "integration-check",
    changeIds: unique(check.resultTargets.map((target) => target.changeId)),
    worktreeIds: unique(check.resultTargets.map((target) => target.worktreeId)),
    applyCheckId,
    expectedDiffHash: sourceComparableIntegrationDiffHash(artifactDiff),
    evidenceRefs: check.artifactRefs,
  };
}

function sourceComparableIntegrationDiffHash(diff: string): string {
  return diffContentHash(diff.replace(/\n{2,}(?=diff --git a\/)/g, "\n"));
}
