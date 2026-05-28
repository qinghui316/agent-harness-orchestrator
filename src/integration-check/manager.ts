import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { canApplyResultFromGate, classifyApplyReadiness, previewWorktreeApply, type WorktreeGateState } from "../apply/manager.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { slugify } from "../fs/path.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitCommit, git, isGitDirty } from "../project/git.js";
import { buildRunId } from "../run/manager.js";
import { getGlobalWorktreeCheckoutRoot, listWorktreeStatuses, markWorktreeApplied } from "../worktree/manager.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";

export type IntegrationCheckStatus = "passed" | "conflict" | "validation-failed" | "audit-failed" | "stale-result" | "failed" | "applied" | "discarded";

export interface IntegrationCheckTarget {
  changeId: string;
  worktreeId: string;
  diffHash: string;
  diffStat: string;
  sourceHead: string | null;
}

export interface IntegrationCheckRecord {
  version: "1.0";
  id: string;
  projectId: string | null;
  status: IntegrationCheckStatus;
  resultTargets: IntegrationCheckTarget[];
  sourceHead: string | null;
  createdAt: string;
  finishedAt?: string;
  appliedAt?: string;
  summary: string;
  riskSummary: string;
  artifactRefs: string[];
  integrationWorktreePath?: string;
  blockingIssues: string[];
  warnings: string[];
}

export interface IntegrationCheckCandidate {
  id: string;
  targets: IntegrationCheckTarget[];
  summary: string;
  riskSummary: string;
}

export interface IntegrationCheckResult {
  check: IntegrationCheckRecord;
  artifactDirectory: string;
}

const integrationCheckSchema: z.ZodType<IntegrationCheckRecord> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  status: z.enum(["passed", "conflict", "validation-failed", "audit-failed", "stale-result", "failed", "applied", "discarded"]),
  resultTargets: z.array(z.object({
    changeId: z.string(),
    worktreeId: z.string(),
    diffHash: z.string(),
    diffStat: z.string(),
    sourceHead: z.string().nullable(),
  })),
  sourceHead: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  appliedAt: z.string().optional(),
  summary: z.string(),
  riskSummary: z.string(),
  artifactRefs: z.array(z.string()),
  integrationWorktreePath: z.string().optional(),
  blockingIssues: z.array(z.string()),
  warnings: z.array(z.string()),
});

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

export async function runIntegrationCheck(project: ManagedProject, worktreeIds?: string[]): Promise<IntegrationCheckResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Integration check");
  const sourceHead = await getGitCommit(project.path);
  const targets = await collectReadyTargets(project, memory, worktreeIds);
  if (targets.length < 2) {
    throw new Error("Integration check requires at least two ready results.");
  }

  const id = buildIntegrationCheckId(targets);
  const root = integrationCheckRoot(memory);
  const directory = join(root, id);
  const checkoutPath = join(getGlobalWorktreeCheckoutRoot(memory.projectId ?? project.id), "integration", id);
  const artifactRefs = [
    displayArtifactPath(memory, join(directory, "integration-check.json")),
    displayArtifactPath(memory, join(directory, "summary.md")),
    displayArtifactPath(memory, join(directory, "combined.patch")),
  ];
  await mkdir(directory, { recursive: true });

  const patches: string[] = [];
  let status: IntegrationCheckStatus = "passed";
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const startedAt = new Date().toISOString();
  let summary = "兼容性检查通过：这些结果可以一起应用。";
  try {
    await git(project.path, ["worktree", "prune"]).catch(() => "");
    await git(project.path, ["worktree", "add", "-b", `aho/ic/${slugify(id).slice(-24)}`, checkoutPath, "HEAD"]);
    for (const target of targets) {
      const diff = await collectWorktreeDiff(memory, target.worktreeId, target.changeId);
      const patchPath = join(directory, `${target.worktreeId}.patch`);
      await writeFile(patchPath, diff.diff, "utf8");
      patches.push(diff.diff);
      await git(checkoutPath, ["apply", "--binary", patchPath]);
      await appendIntegrationEvent(directory, id, "integration-check.target-applied", { worktreeId: target.worktreeId, changeId: target.changeId });
    }
  } catch (cause) {
    status = "conflict";
    const message = cause instanceof Error ? cause.message : String(cause);
    blockingIssues.push(message);
    summary = "兼容性检查未通过：这些结果不能直接一起应用。";
    await writeFile(join(directory, "stderr.log"), `${message}\n`, "utf8");
  }

  const combinedPatch = patches.join("\n");
  await writeFile(join(directory, "combined.patch"), combinedPatch, "utf8");
  const check: IntegrationCheckRecord = {
    version: "1.0",
    id,
    projectId: memory.projectId,
    status,
    resultTargets: targets,
    sourceHead,
    createdAt: startedAt,
    finishedAt: new Date().toISOString(),
    summary,
    riskSummary: status === "passed"
      ? "检查只验证这些结果能在当前项目状态上组合应用；最终修改源码仍需要你确认。"
      : "需要先修改其中一个结果，或放弃本次组合应用。",
    artifactRefs,
    integrationWorktreePath: checkoutPath,
    blockingIssues,
    warnings,
  };
  await writeCheckArtifacts(memory, directory, check);
  await appendIntegrationEvent(directory, id, status === "passed" ? "integration-check.passed" : "integration-check.failed", { status, blockingIssues });
  return { check, artifactDirectory: directory };
}

export async function applyIntegrationCheck(project: ManagedProject, applyCheckId: string): Promise<IntegrationCheckResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Integration check apply");
  const directory = join(integrationCheckRoot(memory), applyCheckId);
  const check = await readIntegrationCheck(memory, applyCheckId);
  if (check.status !== "passed") {
    throw new Error(`Cannot apply integration check ${applyCheckId}: status is ${check.status}.`);
  }
  if ((await isGitDirty(project.path)) === true) {
    throw new Error("Cannot apply integration check: project has uncommitted local changes.");
  }
  const currentHead = await getGitCommit(project.path);
  if (currentHead !== check.sourceHead) {
    throw new Error("Cannot apply integration check: project changed after the check. Re-run compatibility check first.");
  }
  const patchPath = join(directory, "combined.patch");
  if (!existsSync(patchPath)) throw new Error(`Missing integration patch: ${patchPath}`);

  const runId = buildRunId(check.resultTargets[0]?.changeId ?? "integration-check", ["integration-apply", applyCheckId]);
  await appendIntegrationEvent(directory, applyCheckId, "integration-check.apply.started", { runId });
  await git(project.path, ["apply", "--binary", patchPath]);
  const after = await getGitCommit(project.path);
  for (const target of check.resultTargets) {
    await markWorktreeApplied(memory, target.worktreeId, {
      applyRunId: runId,
      worktreeDiffHash: target.diffHash,
      appliedCommit: after ?? undefined,
    });
  }
  const applied: IntegrationCheckRecord = {
    ...check,
    status: "applied",
    appliedAt: new Date().toISOString(),
    summary: "已将通过兼容性检查的结果应用到项目。",
  };
  await writeCheckArtifacts(memory, directory, applied);
  await appendIntegrationEvent(directory, applyCheckId, "integration-check.apply.completed", { runId });
  return { check: applied, artifactDirectory: directory };
}

export async function discardIntegrationCheck(project: ManagedProject, applyCheckId: string): Promise<IntegrationCheckResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Integration check discard");
  const directory = join(integrationCheckRoot(memory), applyCheckId);
  const check = await readIntegrationCheck(memory, applyCheckId);
  const discarded: IntegrationCheckRecord = {
    ...check,
    status: "discarded",
    finishedAt: new Date().toISOString(),
    summary: "已放弃这次组合应用检查结果，项目源码未修改。",
  };
  await writeCheckArtifacts(memory, directory, discarded);
  await appendIntegrationEvent(directory, applyCheckId, "integration-check.discarded", {});
  return { check: discarded, artifactDirectory: directory };
}

export async function listIntegrationChecks(memory: ResolvedMemory): Promise<IntegrationCheckRecord[]> {
  const root = integrationCheckRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const checks: IntegrationCheckRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "integration-check.json");
    if (!existsSync(file)) continue;
    checks.push(await readRequiredJsonFile(file, integrationCheckSchema));
  }
  return checks.sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt));
}

export async function readIntegrationCheck(memory: ResolvedMemory, id: string): Promise<IntegrationCheckRecord> {
  return readRequiredJsonFile(join(integrationCheckRoot(memory), id, "integration-check.json"), integrationCheckSchema);
}

async function collectReadyTargets(project: ManagedProject, memory: ResolvedMemory, requestedWorktreeIds?: string[]): Promise<IntegrationCheckTarget[]> {
  const requested = requestedWorktreeIds?.length ? new Set(requestedWorktreeIds) : null;
  const statuses = await listWorktreeStatuses(memory);
  const targets: IntegrationCheckTarget[] = [];
  for (const worktree of statuses.filter((item) => item.status !== "applied")) {
    if (requested && !requested.has(worktree.worktreeId)) continue;
    const preview = await previewWorktreeApply(project, worktree.worktreeId).catch(() => null);
    if (!preview || !canApplyResultFromGate(preview.gate)) continue;
    if (classifyApplyReadiness(preview.gate).kind !== "ready") continue;
    targets.push(targetFromGate(preview.gate));
  }
  return targets.sort((a, b) => `${a.changeId}:${a.worktreeId}`.localeCompare(`${b.changeId}:${b.worktreeId}`));
}

function targetFromGate(gate: WorktreeGateState): IntegrationCheckTarget {
  return {
    changeId: gate.changeId,
    worktreeId: gate.worktree.worktreeId,
    diffHash: gate.diffHash,
    diffStat: gate.diffStat,
    sourceHead: gate.sourceHead,
  };
}

function buildIntegrationCheckId(targets: IntegrationCheckTarget[]): string {
  const hash = createHash("sha256").update(targets.map((target) => `${target.changeId}:${target.worktreeId}:${target.diffHash}`).join("|")).digest("hex").slice(0, 8);
  return `apply-check-${compactTimestamp()}-${hash}`;
}

function integrationCheckRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "integration-checks");
}

async function writeCheckArtifacts(memory: ResolvedMemory, directory: string, check: IntegrationCheckRecord): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeJsonFile(join(directory, "integration-check.json"), check);
  await writeFile(join(directory, "summary.md"), renderCheckSummary(check), "utf8");
}

function renderCheckSummary(check: IntegrationCheckRecord): string {
  return [
    `# Integration Check ${check.id}`,
    "",
    `- Status: ${check.status}`,
    `- Summary: ${check.summary}`,
    `- Risk: ${check.riskSummary}`,
    `- Source HEAD: ${check.sourceHead ?? "-"}`,
    "",
    "## Targets",
    ...check.resultTargets.map((target) => `- ${target.changeId} / ${target.worktreeId} / ${target.diffHash.slice(0, 12)}`),
    "",
    check.blockingIssues.length ? "## Blocking Issues" : "",
    ...check.blockingIssues.map((issue) => `- ${issue}`),
    "",
  ].filter((line, index, list) => line !== "" || list[index - 1] !== "").join("\n");
}

async function appendIntegrationEvent(directory: string, checkId: string, type: string, data: Record<string, unknown>): Promise<void> {
  await mkdir(directory, { recursive: true });
  const line = JSON.stringify({ timestamp: new Date().toISOString(), type, checkId, data });
  await writeFile(join(directory, "events.jsonl"), `${line}\n`, { encoding: "utf8", flag: "a" });
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  return memory.artifactBase === "memory-root" ? relative(memory.memoryRoot, absolutePath).replace(/\\/g, "/") : relative(memory.projectRoot, absolutePath).replace(/\\/g, "/");
}

function compactTimestamp(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}
