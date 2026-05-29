import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { collectWorktreeDiff } from "../audit/diff.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { resolveProjectMemory, assertWritableMemory } from "../memory/resolver.js";
import { gitText, getGitCommit } from "../project/git.js";
import { listIntegrationChecks, readIntegrationCheck } from "../integration-check/manager.js";
import { getWorktreeStatus, listWorktreeStatuses } from "../worktree/manager.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";

export type LandingTargetKind = "worktree" | "integration-check";
export type LandingReadinessStatus = "ready" | "needs-review" | "unattributed-dirty-source" | "missing-evidence";
export type LandingReviewVerdict = "ready" | "needs-user-review" | "needs-rework";

export interface LandingReadinessTarget {
  kind: LandingTargetKind;
  changeIds: string[];
  worktreeIds: string[];
  applyRunId?: string;
  applyCheckId?: string;
  expectedDiffHash: string;
  evidenceRefs: string[];
}

export interface LandingReadinessPackage {
  version: "1.0";
  id: string;
  projectId: string | null;
  target: LandingReadinessTarget;
  status: LandingReadinessStatus;
  sourceHead: string | null;
  sourceDiffHash: string;
  sourceDiffStat: string;
  changedFiles: string[];
  attributable: boolean;
  unattributedFiles: string[];
  summary: string;
  riskSummary: string;
  artifactRefs: string[];
  createdAt: string;
  reviewedAt?: string;
  review?: LandingReadinessReview;
}

export interface LandingReadinessReview {
  version: "1.0";
  packageId: string;
  roleId: "merge-reviewer-agent";
  verdict: LandingReviewVerdict;
  summary: string;
  riskSummary: string;
  evidenceRefs: string[];
  missingChecks: string[];
  suggestedNextAction: string;
  createdAt: string;
}

export interface LandingCandidate {
  kind: LandingTargetKind;
  worktreeId?: string;
  applyCheckId?: string;
  changeIds: string[];
  summary: string;
  riskSummary: string;
}

const landingPackageSchema: z.ZodType<LandingReadinessPackage> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  target: z.object({
    kind: z.enum(["worktree", "integration-check"]),
    changeIds: z.array(z.string()),
    worktreeIds: z.array(z.string()),
    applyRunId: z.string().optional(),
    applyCheckId: z.string().optional(),
    expectedDiffHash: z.string(),
    evidenceRefs: z.array(z.string()),
  }),
  status: z.enum(["ready", "needs-review", "unattributed-dirty-source", "missing-evidence"]),
  sourceHead: z.string().nullable(),
  sourceDiffHash: z.string(),
  sourceDiffStat: z.string(),
  changedFiles: z.array(z.string()),
  attributable: z.boolean(),
  unattributedFiles: z.array(z.string()),
  summary: z.string(),
  riskSummary: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
  reviewedAt: z.string().optional(),
  review: z.object({
    version: z.literal("1.0"),
    packageId: z.string(),
    roleId: z.literal("merge-reviewer-agent"),
    verdict: z.enum(["ready", "needs-user-review", "needs-rework"]),
    summary: z.string(),
    riskSummary: z.string(),
    evidenceRefs: z.array(z.string()),
    missingChecks: z.array(z.string()),
    suggestedNextAction: z.string(),
    createdAt: z.string(),
  }).optional(),
});

export async function findLandingCandidate(project: ManagedProject): Promise<LandingCandidate | null> {
  const memory = await resolveProjectMemory(project);
  if (!memory.supported || !memory.writable) return null;
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
    displayArtifactPath(memory, join(directory, "landing-package.json")),
    displayArtifactPath(memory, join(directory, "landing-summary.md")),
    displayArtifactPath(memory, join(directory, "source-diff.patch")),
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
    artifactRefs: [...pkg.artifactRefs, displayArtifactPath(memory, join(directory, "merge-review.md"))],
  };
  await writeLandingArtifacts(directory, reviewed);
  return reviewed;
}

export async function listLandingPackages(memory: ResolvedMemory): Promise<LandingReadinessPackage[]> {
  const root = landingRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const packages: LandingReadinessPackage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "landing-package.json");
    if (!existsSync(file)) continue;
    packages.push(await readRequiredJsonFile(file, landingPackageSchema));
  }
  return packages.sort((a, b) => (b.reviewedAt ?? b.createdAt).localeCompare(a.reviewedAt ?? a.createdAt));
}

export async function readLandingPackage(memory: ResolvedMemory, packageId: string): Promise<LandingReadinessPackage> {
  return readRequiredJsonFile(join(landingRoot(memory), packageId, "landing-package.json"), landingPackageSchema);
}

async function targetFromWorktree(memory: ResolvedMemory, worktreeId: string | undefined): Promise<LandingReadinessTarget> {
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
    evidenceRefs: [displayArtifactPath(memory, join(memory.runsRoot, worktree.applyRunId, "apply.json"))],
  };
}

async function targetFromIntegrationCheck(memory: ResolvedMemory, applyCheckId: string): Promise<LandingReadinessTarget> {
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

async function collectSourceDiff(cwd: string): Promise<{ diff: string; diffHash: string; diffStat: string; changedFiles: string[] }> {
  const [trackedDiff, trackedStat, trackedNames, untrackedFiles] = await Promise.all([
    gitText(cwd, ["diff", "--no-ext-diff", "--binary", "HEAD"]),
    gitText(cwd, ["diff", "--stat", "HEAD"]),
    gitText(cwd, ["diff", "--name-only", "HEAD"]),
    listUntrackedFiles(cwd),
  ]);
  const untrackedDiff = (await Promise.all(untrackedFiles.map((file) => renderUntrackedTextPatch(cwd, file)))).join("");
  const diff = trackedDiff + untrackedDiff;
  const diffHash = contentHash(diff);
  const changedFiles = unique([...trackedNames.split(/\r?\n/).filter(Boolean), ...untrackedFiles.map((file) => file.replace(/\\/g, "/"))]).sort();
  const untrackedStat = untrackedFiles.map((file) => ` ${file.replace(/\\/g, "/")} | new file`).join("\n");
  return {
    diff,
    diffHash,
    diffStat: [trackedStat.trimEnd(), untrackedStat].filter(Boolean).join("\n"),
    changedFiles,
  };
}

async function listUntrackedFiles(cwd: string): Promise<string[]> {
  const output = await gitText(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return output.split("\0").map((item) => item.trim()).filter(Boolean).sort();
}

async function renderUntrackedTextPatch(cwd: string, file: string): Promise<string> {
  const normalized = file.replace(/\\/g, "/");
  const content = await readFile(join(cwd, file), "utf8");
  const lines = content.endsWith("\n") ? content.slice(0, -1).split(/\r?\n/) : content.split(/\r?\n/);
  const lineCount = Math.max(lines.length, 1);
  return [
    `diff --git a/${normalized} b/${normalized}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${normalized}`,
    `@@ -0,0 +1,${lineCount} @@`,
    ...lines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

function missingChecksForPackage(pkg: LandingReadinessPackage): string[] {
  const missing: string[] = [];
  if (pkg.sourceDiffHash !== pkg.target.expectedDiffHash) missing.push("本地 diff 与选中结果不完全一致。");
  if (pkg.target.evidenceRefs.length === 0) missing.push("缺少 apply / validation / audit evidence refs。");
  if (pkg.changedFiles.length === 0) missing.push("没有可审查的本地 diff。");
  return missing;
}

async function writeLandingArtifacts(directory: string, pkg: LandingReadinessPackage): Promise<void> {
  await writeJsonFile(join(directory, "landing-package.json"), pkg);
  await writeFile(join(directory, "landing-summary.md"), renderLandingSummary(pkg), "utf8");
  if (pkg.review) await writeFile(join(directory, "merge-review.md"), renderMergeReview(pkg.review), "utf8");
}

function renderLandingSummary(pkg: LandingReadinessPackage): string {
  return [
    "# Landing Readiness Package",
    "",
    `- Package: ${pkg.id}`,
    `- Target: ${pkg.target.kind}`,
    `- Changes: ${pkg.target.changeIds.join(", ")}`,
    `- Worktrees: ${pkg.target.worktreeIds.join(", ")}`,
    `- Status: ${pkg.status}`,
    `- Source head: ${pkg.sourceHead ?? "unknown"}`,
    `- Diff hash: ${pkg.sourceDiffHash}`,
    "",
    "## Summary",
    "",
    pkg.summary,
    "",
    "## Changed Files",
    "",
    ...(pkg.changedFiles.length ? pkg.changedFiles.map((file) => `- ${file}`) : ["- None"]),
    "",
    "## Evidence",
    "",
    ...(pkg.target.evidenceRefs.length ? pkg.target.evidenceRefs.map((ref) => `- ${ref}`) : ["- None"]),
    "",
    "## Boundary",
    "",
    "This package is local landing readiness evidence only. It does not commit, push, create a PR, or merge.",
    "",
  ].join("\n");
}

function renderMergeReview(review: LandingReadinessReview): string {
  return [
    "# Merge Reviewer",
    "",
    `- Verdict: ${review.verdict}`,
    `- Created: ${review.createdAt}`,
    "",
    "## Summary",
    "",
    review.summary,
    "",
    "## Risks",
    "",
    review.riskSummary,
    "",
    "## Missing Checks",
    "",
    ...(review.missingChecks.length ? review.missingChecks.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Evidence",
    "",
    ...(review.evidenceRefs.length ? review.evidenceRefs.map((ref) => `- ${ref}`) : ["- None"]),
    "",
    "## Suggested Next Action",
    "",
    review.suggestedNextAction,
    "",
  ].join("\n");
}

function buildLandingPackageId(target: LandingReadinessTarget): string {
  return `landing-${target.kind}-${contentHash(targetKey(target)).slice(0, 12)}`;
}

function targetKey(target: LandingReadinessTarget): string {
  if (target.kind === "integration-check") return `integration-check:${target.applyCheckId ?? ""}`;
  return `worktree:${target.worktreeIds[0] ?? ""}:${target.applyRunId ?? ""}`;
}

function landingRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "landing");
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  return `${memory.artifactBase === "memory-root" ? "memory://" : "project://"}${relative(memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot, absolutePath).replace(/\\/g, "/")}`;
}

function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
