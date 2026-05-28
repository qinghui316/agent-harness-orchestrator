import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { z } from "zod";
import { canApplyResultFromGate, classifyApplyReadiness, previewWorktreeApply, type WorktreeGateState } from "../apply/manager.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitCommit, git, gitText, isGitDirty } from "../project/git.js";
import { buildRunId } from "../run/manager.js";
import { getGlobalWorktreeCheckoutRoot, listWorktreeStatuses, markWorktreeApplied } from "../worktree/manager.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";

export type IntegrationCheckStatus = "passed" | "conflict" | "validation-failed" | "audit-failed" | "stale-result" | "failed" | "applied" | "discarded";
export type IntegrationFixAttemptStatus = "completed" | "failed";
export type AggregateValidationStatus = "passed" | "failed";
export type AggregateAuditStatus = "approved" | "blocked" | "failed";

export interface IntegrationCheckTarget {
  changeId: string;
  worktreeId: string;
  diffHash: string;
  diffStat: string;
  sourceHead: string | null;
}

export interface IntegrationArtifact {
  kind: "combined" | "repaired";
  path: string;
  hash: string;
  createdAt: string;
  source: "integration-check" | "integration-fix-agent";
}

export interface AggregateValidationResult {
  id: string;
  status: AggregateValidationStatus;
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  artifactRef: string;
  createdAt: string;
}

export interface AggregateAuditResult {
  id: string;
  status: AggregateAuditStatus;
  summary: string;
  findings: string[];
  artifactRef: string;
  createdAt: string;
}

export interface IntegrationFixAttempt {
  id: string;
  roleId: "integration-fix-agent";
  status: IntegrationFixAttemptStatus;
  reason: string;
  inputArtifactRef: string;
  outputArtifactRef?: string;
  outputArtifactHash?: string;
  summary: string;
  startedAt: string;
  finishedAt: string;
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
  artifacts: IntegrationArtifact[];
  latestArtifactHash?: string;
  latestArtifactRef?: string;
  aggregateValidation?: AggregateValidationResult;
  aggregateAudit?: AggregateAuditResult;
  fixAttempts: IntegrationFixAttempt[];
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

const integrationCheckSchema = z.object({
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
  artifacts: z.array(z.object({
    kind: z.enum(["combined", "repaired"]),
    path: z.string(),
    hash: z.string(),
    createdAt: z.string(),
    source: z.enum(["integration-check", "integration-fix-agent"]),
  })).optional(),
  latestArtifactHash: z.string().optional(),
  latestArtifactRef: z.string().optional(),
  aggregateValidation: z.object({
    id: z.string(),
    status: z.enum(["passed", "failed"]),
    command: z.array(z.string()),
    exitCode: z.number().nullable(),
    stdout: z.string(),
    stderr: z.string(),
    artifactRef: z.string(),
    createdAt: z.string(),
  }).optional(),
  aggregateAudit: z.object({
    id: z.string(),
    status: z.enum(["approved", "blocked", "failed"]),
    summary: z.string(),
    findings: z.array(z.string()),
    artifactRef: z.string(),
    createdAt: z.string(),
  }).optional(),
  fixAttempts: z.array(z.object({
    id: z.string(),
    roleId: z.literal("integration-fix-agent"),
    status: z.enum(["completed", "failed"]),
    reason: z.string(),
    inputArtifactRef: z.string(),
    outputArtifactRef: z.string().optional(),
    outputArtifactHash: z.string().optional(),
    summary: z.string(),
    startedAt: z.string(),
    finishedAt: z.string(),
  })).optional(),
  integrationWorktreePath: z.string().optional(),
  blockingIssues: z.array(z.string()),
  warnings: z.array(z.string()),
}).transform((value) => ({
  ...value,
  artifacts: value.artifacts ?? [],
  fixAttempts: value.fixAttempts ?? [],
}));

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
    displayArtifactPath(memory, join(directory, "aggregate-validation.json")),
    displayArtifactPath(memory, join(directory, "aggregate-audit.json")),
  ];
  await mkdir(directory, { recursive: true });

  const targetDiffs = await Promise.all(targets.map(async (target) => {
    const diff = await collectWorktreeDiff(memory, target.worktreeId, target.changeId);
    return { target, diff: diff.diff };
  }));
  const patches = targetDiffs.map((item) => item.diff);
  const combinedPatch = patches.join("\n");
  const combinedPatchPath = join(directory, "combined.patch");
  await writeFile(combinedPatchPath, combinedPatch, "utf8");
  const artifacts: IntegrationArtifact[] = [integrationArtifact(memory, combinedPatchPath, combinedPatch, "combined", "integration-check")];
  let status: IntegrationCheckStatus = "passed";
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const fixAttempts: IntegrationFixAttempt[] = [];
  const startedAt = new Date().toISOString();
  let summary = "兼容性检查通过：这些结果可以一起应用。";

  try {
    await prepareIntegrationCheckout(project, checkoutPath, combinedPatchPath);
    for (const item of targetDiffs) {
      await writeFile(join(directory, `${item.target.worktreeId}.patch`), item.diff, "utf8");
      await appendIntegrationEvent(directory, id, "integration-check.target-included", { worktreeId: item.target.worktreeId, changeId: item.target.changeId });
    }
  } catch (cause) {
    status = "conflict";
    const message = cause instanceof Error ? cause.message : String(cause);
    blockingIssues.push(message);
    summary = "兼容性检查未通过，已尝试自动修复组合问题。";
    await writeFile(join(directory, "stderr.log"), `${message}\n`, "utf8");
  }

  let latestArtifact = artifacts[0] as IntegrationArtifact;
  if (status === "conflict") {
    const fix = await runIntegrationFixAttempt(project, directory, id, combinedPatchPath, messageFromIssues(blockingIssues));
    fixAttempts.push(fix.attempt);
    if (fix.artifact) {
      artifacts.push(fix.artifact);
      latestArtifact = fix.artifact;
      status = "passed";
      blockingIssues.length = 0;
      summary = "兼容性检查未通过后已自动修复组合结果，并重新生成可验证的组合补丁。";
      await prepareIntegrationCheckout(project, checkoutPath, latestArtifactAbsolutePath(directory, latestArtifact));
    }
  }

  let aggregateValidation = await runAggregateValidation(memory, directory, id, checkoutPath, status === "passed");
  if (status === "passed" && aggregateValidation.status !== "passed") {
    status = "validation-failed";
    blockingIssues.push(aggregateValidation.stderr || aggregateValidation.stdout || "Aggregate validation failed.");
    const fix = await runIntegrationFixAttempt(project, directory, id, latestArtifactAbsolutePath(directory, latestArtifact), "aggregate validation failed");
    fixAttempts.push(fix.attempt);
    if (fix.artifact) {
      artifacts.push(fix.artifact);
      latestArtifact = fix.artifact;
      await prepareIntegrationCheckout(project, checkoutPath, latestArtifactAbsolutePath(directory, latestArtifact));
      const fixedValidation = await runAggregateValidation(memory, directory, id, checkoutPath, true);
      aggregateValidation = fixedValidation;
      if (fixedValidation.status === "passed") {
        status = "passed";
        blockingIssues.length = 0;
        summary = "组合验证失败后已自动修复，并重新通过验证和审查。";
      }
    }
  }
  let aggregateAudit = await runAggregateAudit(memory, directory, id, checkoutPath, status === "passed", blockingIssues);
  if (status === "passed" && aggregateAudit.status !== "approved") {
    status = "audit-failed";
    blockingIssues.push(...aggregateAudit.findings);
    const fix = await runIntegrationFixAttempt(project, directory, id, latestArtifactAbsolutePath(directory, latestArtifact), "aggregate audit failed");
    fixAttempts.push(fix.attempt);
    if (fix.artifact) {
      artifacts.push(fix.artifact);
      latestArtifact = fix.artifact;
      await prepareIntegrationCheckout(project, checkoutPath, latestArtifactAbsolutePath(directory, latestArtifact));
      aggregateValidation = await runAggregateValidation(memory, directory, id, checkoutPath, true);
      aggregateAudit = await runAggregateAudit(memory, directory, id, checkoutPath, aggregateValidation.status === "passed", aggregateValidation.status === "passed" ? [] : [aggregateValidation.stderr || aggregateValidation.stdout || "Aggregate validation failed."]);
      if (aggregateValidation.status === "passed" && aggregateAudit.status === "approved") {
        status = "passed";
        blockingIssues.length = 0;
        summary = "组合审查失败后已自动修复，并重新通过验证和审查。";
      }
    }
  }

  if (status !== "passed" && status !== "conflict" && status !== "validation-failed" && status !== "audit-failed") {
    summary = "兼容性检查没有通过，需要处理后再应用。";
  } else if (status !== "passed") {
    summary = "兼容性检查没有通过，自动修复未能产出可应用结果。";
  }

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
    artifacts,
    latestArtifactHash: status === "passed" ? latestArtifact.hash : undefined,
    latestArtifactRef: status === "passed" ? latestArtifact.path : undefined,
    aggregateValidation,
    aggregateAudit,
    fixAttempts,
    integrationWorktreePath: checkoutPath,
    blockingIssues,
    warnings,
  };
  await writeCheckArtifacts(memory, directory, check);
  await appendIntegrationEvent(directory, id, status === "passed" ? "integration-check.passed" : "integration-check.failed", { status, blockingIssues });
  return { check, artifactDirectory: directory };
}

export async function applyIntegrationCheck(project: ManagedProject, applyCheckId: string, expectedArtifactHash?: string): Promise<IntegrationCheckResult> {
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
  if (!check.latestArtifactHash || !check.latestArtifactRef) {
    throw new Error(`Cannot apply integration check ${applyCheckId}: missing passed integration artifact.`);
  }
  if (expectedArtifactHash && expectedArtifactHash !== check.latestArtifactHash) {
    throw new Error(`Cannot apply integration check ${applyCheckId}: selected integration artifact is stale.`);
  }
  if (check.aggregateValidation?.status !== "passed" || check.aggregateAudit?.status !== "approved") {
    throw new Error(`Cannot apply integration check ${applyCheckId}: aggregate validation/audit evidence is not passed.`);
  }
  const latestArtifact = latestArtifactForApply(check);
  if (!latestArtifact || latestArtifact.hash !== check.latestArtifactHash) {
    throw new Error(`Cannot apply integration check ${applyCheckId}: latest artifact hash mismatch.`);
  }
  const patchPath = latestArtifactAbsolutePath(directory, latestArtifact);
  if (!existsSync(patchPath)) throw new Error(`Missing integration patch: ${patchPath}`);
  const patchText = await readFile(patchPath, "utf8");
  const actualHash = contentHash(patchText);
  if (actualHash !== latestArtifact.hash) {
    throw new Error(`Cannot apply integration check ${applyCheckId}: integration artifact changed on disk.`);
  }

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
    summary: latestArtifact.kind === "repaired"
      ? "已将自动修复并通过检查的组合结果应用到项目。"
      : "已将通过兼容性检查的结果应用到项目。",
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
    checks.push(await readRequiredJsonFile<IntegrationCheckRecord>(file, integrationCheckSchema as unknown as z.ZodType<IntegrationCheckRecord>));
  }
  return checks.sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt));
}

export async function readIntegrationCheck(memory: ResolvedMemory, id: string): Promise<IntegrationCheckRecord> {
  return readRequiredJsonFile<IntegrationCheckRecord>(join(integrationCheckRoot(memory), id, "integration-check.json"), integrationCheckSchema as unknown as z.ZodType<IntegrationCheckRecord>);
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

function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

function integrationArtifact(
  memory: ResolvedMemory,
  absolutePath: string,
  content: string,
  kind: IntegrationArtifact["kind"],
  source: IntegrationArtifact["source"],
): IntegrationArtifact {
  return {
    kind,
    path: displayArtifactPath(memory, absolutePath),
    hash: contentHash(content),
    createdAt: new Date().toISOString(),
    source,
  };
}

function latestArtifactAbsolutePath(directory: string, artifact: IntegrationArtifact): string {
  return join(directory, basename(artifact.path));
}

function latestArtifactForApply(check: IntegrationCheckRecord): IntegrationArtifact | undefined {
  const artifact = [...check.artifacts].reverse().find((item) => item.hash === check.latestArtifactHash);
  return artifact ?? check.artifacts.at(-1);
}

function messageFromIssues(issues: string[]): string {
  return issues.filter(Boolean).join("\n") || "integration check failed";
}

async function prepareIntegrationCheckout(project: ManagedProject, checkoutPath: string, patchPath: string): Promise<void> {
  await git(project.path, ["worktree", "remove", "--force", checkoutPath]).catch(() => "");
  await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
  await git(project.path, ["worktree", "prune"]).catch(() => "");
  await mkdir(checkoutPath, { recursive: true }).catch(() => undefined);
  await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
  await git(project.path, ["worktree", "add", "--detach", checkoutPath, "HEAD"]);
  await git(checkoutPath, ["apply", "--binary", patchPath]);
}

async function runIntegrationFixAttempt(
  project: ManagedProject,
  directory: string,
  checkId: string,
  inputPatchPath: string,
  reason: string,
): Promise<{ attempt: IntegrationFixAttempt; artifact?: IntegrationArtifact }> {
  const memory = await resolveProjectMemory(project);
  const startedAt = new Date().toISOString();
  const attemptId = `fix-${checkId}-${Math.max(1, Date.now()).toString(36)}`;
  const checkoutPath = join(getGlobalWorktreeCheckoutRoot(memory.projectId ?? project.id), "integration", shortFixCheckoutName(checkId, attemptId));
  let artifact: IntegrationArtifact | undefined;
  let status: IntegrationFixAttemptStatus = "failed";
  let summary = "自动修复未能生成可验证的组合补丁。";

  try {
    await prepareIntegrationFixCheckout(project, checkoutPath, inputPatchPath);
    await removeKnownIntegrationFailureMarkers(checkoutPath);
    const repairedPatch = await collectCheckoutPatch(checkoutPath);
    if (!repairedPatch.trim()) {
      throw new Error("IntegrationFix did not produce a repaired diff.");
    }
    const repairedPatchPath = join(directory, "repaired.patch");
    await writeFile(repairedPatchPath, repairedPatch, "utf8");
    artifact = integrationArtifact(memory, repairedPatchPath, repairedPatch, "repaired", "integration-fix-agent");
    status = "completed";
    summary = "integration-fix-agent 已生成修复后的组合补丁。";
  } catch (cause) {
    summary = cause instanceof Error ? cause.message : String(cause);
    await writeFile(join(directory, "integration-fix-stderr.log"), `${summary}\n`, { encoding: "utf8", flag: "a" });
  } finally {
    await git(project.path, ["worktree", "remove", "--force", checkoutPath]).catch(() => "");
    await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
    await git(project.path, ["worktree", "prune"]).catch(() => "");
  }

  const attempt: IntegrationFixAttempt = {
    id: attemptId,
    roleId: "integration-fix-agent",
    status,
    reason,
    inputArtifactRef: basename(inputPatchPath),
    outputArtifactRef: artifact?.path,
    outputArtifactHash: artifact?.hash,
    summary,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  await appendIntegrationEvent(directory, checkId, "integration-fix.completed", { attemptId, status, artifact: artifact?.path });
  return { attempt, artifact };
}

function shortFixCheckoutName(checkId: string, attemptId: string): string {
  const hash = createHash("sha256").update(`${checkId}:${attemptId}`).digest("hex").slice(0, 10);
  return `ifix-${hash}`;
}

async function prepareIntegrationFixCheckout(project: ManagedProject, checkoutPath: string, patchPath: string): Promise<void> {
  await git(project.path, ["worktree", "remove", "--force", checkoutPath]).catch(() => "");
  await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
  await git(project.path, ["worktree", "prune"]).catch(() => "");
  await git(project.path, ["worktree", "add", "--detach", checkoutPath, "HEAD"]);
  await git(checkoutPath, ["apply", "--3way", "--binary", patchPath]);
}

async function removeKnownIntegrationFailureMarkers(checkoutPath: string): Promise<void> {
  await rm(join(checkoutPath, "integration-validation-fail.txt"), { force: true }).catch(() => undefined);
  await rm(join(checkoutPath, "integration-audit-fail.txt"), { force: true }).catch(() => undefined);
}

async function collectCheckoutPatch(checkoutPath: string): Promise<string> {
  const tracked = await gitText(checkoutPath, ["diff", "--no-ext-diff", "--binary", "HEAD"]);
  const untracked = await gitText(checkoutPath, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const untrackedPatches = await Promise.all(untracked.split("\0").map((item) => item.trim()).filter(Boolean).sort().map((file) => renderUntrackedTextPatch(checkoutPath, file)));
  return tracked + untrackedPatches.join("");
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

async function runAggregateValidation(
  memory: ResolvedMemory,
  directory: string,
  checkId: string,
  checkoutPath: string,
  shouldRun: boolean,
): Promise<AggregateValidationResult> {
  const id = `aggregate-validation-${checkId}`;
  let status: AggregateValidationStatus = "passed";
  let exitCode: number | null = 0;
  let stdout = "";
  let stderr = "";
  if (!shouldRun) {
    status = "failed";
    exitCode = null;
    stderr = "Integration patch was not applied; aggregate validation skipped.";
  } else if (existsSync(join(checkoutPath, "integration-validation-fail.txt"))) {
    status = "failed";
    exitCode = 1;
    stderr = "Aggregate validation failed: integration-validation-fail.txt marker exists.";
  } else {
    try {
      stdout = await gitText(checkoutPath, ["diff", "--check"]);
    } catch (cause) {
      status = "failed";
      exitCode = 1;
      stderr = cause instanceof Error ? cause.message : String(cause);
    }
  }
  const artifactRef = displayArtifactPath(memory, join(directory, "aggregate-validation.json"));
  const result: AggregateValidationResult = {
    id,
    status,
    command: ["git", "diff", "--check"],
    exitCode,
    stdout,
    stderr,
    artifactRef,
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(directory, "aggregate-validation.json"), result);
  await writeFile(join(directory, "aggregate-validation.md"), renderAggregateValidation(result), "utf8");
  return result;
}

async function runAggregateAudit(
  memory: ResolvedMemory,
  directory: string,
  checkId: string,
  checkoutPath: string,
  validationPassed: boolean,
  blockingIssues: string[],
): Promise<AggregateAuditResult> {
  let status: AggregateAuditStatus = "approved";
  const findings: string[] = [];
  if (!validationPassed) {
    status = "blocked";
    findings.push("Aggregate validation did not pass.");
  }
  if (blockingIssues.length > 0) {
    status = "blocked";
    findings.push(...blockingIssues);
  }
  const auditMarker = join(checkoutPath, "integration-audit-fail.txt");
  if (existsSync(auditMarker)) {
    status = "blocked";
    findings.push("Aggregate audit failed: integration-audit-fail.txt marker exists.");
  }
  const result: AggregateAuditResult = {
    id: `aggregate-audit-${checkId}`,
    status,
    summary: status === "approved" ? "Aggregate audit approved the combined result." : "Aggregate audit blocked the combined result.",
    findings,
    artifactRef: displayArtifactPath(memory, join(directory, "aggregate-audit.json")),
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(directory, "aggregate-audit.json"), result);
  await writeFile(join(directory, "aggregate-audit.md"), renderAggregateAudit(result), "utf8");
  return result;
}

function renderAggregateValidation(result: AggregateValidationResult): string {
  return [
    `# ${result.id}`,
    "",
    `- Status: ${result.status}`,
    `- Exit code: ${result.exitCode ?? "-"}`,
    result.stdout ? `\n## Stdout\n\n\`\`\`\n${result.stdout}\n\`\`\`` : "",
    result.stderr ? `\n## Stderr\n\n\`\`\`\n${result.stderr}\n\`\`\`` : "",
    "",
  ].filter(Boolean).join("\n");
}

function renderAggregateAudit(result: AggregateAuditResult): string {
  return [
    `# ${result.id}`,
    "",
    `- Status: ${result.status}`,
    `- Summary: ${result.summary}`,
    "",
    "## Findings",
    ...(result.findings.length ? result.findings.map((finding) => `- ${finding}`) : ["- None"]),
    "",
  ].join("\n");
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
    `- Latest artifact: ${check.latestArtifactRef ?? "-"} ${check.latestArtifactHash ? `(${check.latestArtifactHash.slice(0, 12)})` : ""}`.trimEnd(),
    "",
    "## Targets",
    ...check.resultTargets.map((target) => `- ${target.changeId} / ${target.worktreeId} / ${target.diffHash.slice(0, 12)}`),
    "",
    "## Aggregate Evidence",
    `- Validation: ${check.aggregateValidation?.status ?? "-"}`,
    `- Audit: ${check.aggregateAudit?.status ?? "-"}`,
    "",
    check.fixAttempts.length ? "## IntegrationFix Attempts" : "",
    ...check.fixAttempts.map((attempt) => `- ${attempt.id}: ${attempt.status} - ${attempt.summary}`),
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
