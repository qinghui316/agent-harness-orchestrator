import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitCommit } from "../project/git.js";
import type { ManagedProject } from "../types/index.js";
import { readLandingPackage, writeLandingArtifacts } from "./repository.js";
import { collectSourceDiff } from "./source-diff.js";
import { targetFromIntegrationCheck, targetFromWorktree } from "./targets.js";
import type { LandingReadinessPackage, LandingReadinessReview, LandingReadinessStatus, LandingReviewVerdict } from "./types.js";
import { buildLandingPackageId, displayLandingArtifactPath, landingRoot } from "./utils.js";

export async function prepareLandingPackage(project: ManagedProject, input: { worktreeId?: string; applyCheckId?: string }): Promise<LandingReadinessPackage> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Landing readiness");
  const source = await collectSourceDiff(project.path);
  const now = new Date().toISOString();
  const target = input.applyCheckId
    ? await targetFromIntegrationCheck(memory, input.applyCheckId)
    : await targetFromWorktree(memory, input.worktreeId);
  const id = buildLandingPackageId(target);
  const directory = join(landingRoot(memory), id);
  const artifactRefs = [
    displayLandingArtifactPath(memory, join(directory, "landing-package.json")),
    displayLandingArtifactPath(memory, join(directory, "landing-summary.md")),
    displayLandingArtifactPath(memory, join(directory, "source-diff.patch")),
  ];
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "source-diff.patch"), source.diff, "utf8");
  const attributable = source.diffHash === target.expectedDiffHash;
  const status: LandingReadinessStatus = source.diff.trim() === ""
    ? "missing-evidence"
    : attributable
      ? "needs-review"
      : "unattributed-dirty-source";
  const pkg: LandingReadinessPackage = {
    version: "1.0",
    id,
    projectId: memory.projectId,
    target,
    status,
    sourceHead: await getGitCommit(project.path),
    sourceDiffHash: source.diffHash,
    sourceDiffStat: source.diffStat,
    changedFiles: source.changedFiles,
    attributable,
    unattributedFiles: attributable ? [] : source.changedFiles,
    summary: attributable
      ? "本地结果已应用，落地检查包已准备好进行提交/PR 前审查。"
      : "项目里存在未归因的本地改动，不能声称当前落地包完全安全。",
    riskSummary: attributable
      ? "这是本地提交/PR 前检查；不会 commit、push、创建 PR 或 merge。"
      : "请先处理不属于本次结果的本地改动，或刷新检查后再继续。",
    artifactRefs,
    createdAt: now,
  };
  await writeLandingArtifacts(directory, pkg);
  return pkg;
}

export async function reviewLandingPackage(project: ManagedProject, packageId: string): Promise<LandingReadinessPackage> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Landing review");
  const directory = join(landingRoot(memory), packageId);
  const pkg = await readLandingPackage(memory, packageId);
  const missingChecks = missingChecksForPackage(pkg);
  const verdict: LandingReviewVerdict = pkg.status === "unattributed-dirty-source"
    ? "needs-user-review"
    : missingChecks.length > 0
      ? "needs-rework"
      : "ready";
  const review: LandingReadinessReview = {
    version: "1.0",
    packageId,
    roleId: "merge-reviewer-agent",
    verdict,
    summary: verdict === "ready"
      ? "提交/PR 前检查通过：当前本地结果有可追溯证据，适合作为后续提交或 PR 准备输入。"
      : verdict === "needs-user-review"
        ? "提交/PR 前检查需要人工处理：项目存在未归因本地改动。"
        : "提交/PR 前检查未通过：证据不完整，需要先补齐或重新处理。",
    riskSummary: pkg.riskSummary,
    evidenceRefs: pkg.artifactRefs,
    missingChecks,
    suggestedNextAction: verdict === "ready"
      ? "后续阶段可以基于此包进入 commit/PR adapter；当前版本只提供证据包。"
      : "处理本地改动或补齐证据后重新运行落地检查。",
    createdAt: new Date().toISOString(),
  };
  const reviewed: LandingReadinessPackage = {
    ...pkg,
    status: verdict === "ready" ? "ready" : pkg.status,
    reviewedAt: review.createdAt,
    review,
    artifactRefs: [...pkg.artifactRefs, displayLandingArtifactPath(memory, join(directory, "merge-review.md"))],
  };
  await writeLandingArtifacts(directory, reviewed);
  return reviewed;
}

function missingChecksForPackage(pkg: LandingReadinessPackage): string[] {
  const missing: string[] = [];
  if (pkg.sourceDiffHash !== pkg.target.expectedDiffHash) missing.push("本地 diff 与选中结果不完全一致。");
  if (pkg.target.evidenceRefs.length === 0) missing.push("缺少 apply / validation / audit evidence refs。");
  if (pkg.changedFiles.length === 0) missing.push("没有可审查的本地 diff。");
  return missing;
}
