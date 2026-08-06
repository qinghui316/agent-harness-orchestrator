import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { requireProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { getGitCommit } from "../project/git.js";
import type { ManagedProject } from "../types/index.js";
import { readLandingPackage, writeLandingArtifacts } from "./repository.js";
import { collectSourceDiff } from "./source-diff.js";
import { targetFromIntegrationCheck, targetFromWorktree } from "./targets.js";
import type { LandingReadinessPackage, LandingReadinessReview, LandingReadinessStatus, LandingReviewVerdict } from "./types.js";
import { buildLandingPackageId, diffContentHash, displayLandingArtifactPath, landingRoot } from "./utils.js";

interface ApplyEvidence {
  status?: string;
  committed?: boolean;
  commitHash?: string;
  sourceHeadAfter?: string | null;
}

export async function prepareLandingPackage(project: ManagedProject, input: { worktreeId?: string; applyCheckId?: string }): Promise<LandingReadinessPackage> {
  const memory = await requireProjectExecutionRuntimePort(project);
  const source = await collectSourceDiff(project.path);
  const now = new Date().toISOString();
  const target = input.applyCheckId
    ? await targetFromIntegrationCheck(memory, input.applyCheckId)
    : await targetFromWorktree(memory, input.worktreeId);
  const sourceHead = await getGitCommit(project.path);
  const committedApply = target.kind === "worktree" && source.diff.trim() === ""
    ? await readCommittedApplyEvidence(memory.runsRoot, target.applyRunId, target.expectedDiffHash, sourceHead)
    : null;
  const effectiveSource = committedApply ?? source;
  const id = buildLandingPackageId(target);
  const directory = join(landingRoot(memory), id);
  const artifactRefs = [
    displayLandingArtifactPath(memory, join(directory, "landing-package.json")),
    displayLandingArtifactPath(memory, join(directory, "landing-summary.md")),
    displayLandingArtifactPath(memory, join(directory, "source-diff.patch")),
  ];
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "source-diff.patch"), effectiveSource.diff, "utf8");
  const attributable = effectiveSource.diffHash === target.expectedDiffHash;
  const status: LandingReadinessStatus = effectiveSource.diff.trim() === ""
    ? "missing-evidence"
    : attributable
      ? "needs-review"
      : "unattributed-dirty-source";
  const committedSummary = committedApply
    ? `本地结果已应用并提交到 ${committedApply.commitHash}，落地检查包已准备好进行提交/PR 前审查。`
    : "本地结果已应用，落地检查包已准备好进行提交/PR 前审查。";
  const pkg: LandingReadinessPackage = {
    version: "1.0",
    id,
    projectId: memory.projectId,
    target,
    status,
    sourceHead,
    sourceDiffHash: effectiveSource.diffHash,
    sourceDiffStat: effectiveSource.diffStat,
    changedFiles: effectiveSource.changedFiles,
    attributable,
    unattributedFiles: attributable ? [] : effectiveSource.changedFiles,
    summary: attributable
      ? committedSummary
      : "项目里存在未归因的本地改动，不能声称当前落地包完全安全。",
    riskSummary: attributable
      ? "这是本地提交/PR 前检查；不会 push、创建 PR 或 merge。"
      : "请先处理不属于本次结果的本地改动，或刷新检查后再继续。",
    artifactRefs,
    createdAt: now,
  };
  await writeLandingArtifacts(directory, pkg);
  return pkg;
}

export async function reviewLandingPackage(project: ManagedProject, packageId: string): Promise<LandingReadinessPackage> {
  const memory = await requireProjectExecutionRuntimePort(project);
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

async function readCommittedApplyEvidence(
  runsRoot: string,
  applyRunId: string | undefined,
  expectedDiffHash: string,
  currentHead: string | null,
): Promise<null | { diff: string; diffHash: string; diffStat: string; changedFiles: string[]; commitHash: string }> {
  if (!applyRunId) return null;
  const runRoot = join(runsRoot, applyRunId);
  let apply: ApplyEvidence;
  try {
    apply = JSON.parse(await readFile(join(runRoot, "apply.json"), "utf8")) as ApplyEvidence;
  } catch {
    return null;
  }
  if (apply.status !== "applied" || apply.committed !== true || !apply.commitHash) return null;
  if (currentHead && apply.sourceHeadAfter && currentHead !== apply.sourceHeadAfter) return null;
  const diff = await readFile(join(runRoot, "diff.patch"), "utf8");
  const diffHash = diffContentHash(diff);
  if (diffHash !== expectedDiffHash) return null;
  const diffStat = await readFile(join(runRoot, "diff-stat.txt"), "utf8").catch(() => "");
  return {
    diff,
    diffHash,
    diffStat,
    changedFiles: changedFilesFromPatch(diff),
    commitHash: apply.commitHash,
  };
}

function changedFilesFromPatch(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match?.[2]) files.add(match[2]);
  }
  return [...files];
}
