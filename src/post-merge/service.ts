import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { readLandingPackage } from "../landing/manager.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { detectRemoteProviderCapability, findPrDraftPackageForLanding, githubCliArgs, githubCliCommand } from "../pr-draft/manager.js";
import { getGitBranch, getGitCommit, getGitStatusShort, gitText } from "../project/git.js";
import { readRemoteLandingResult } from "../remote-landing/manager.js";
import type {
  LocalSyncReadiness,
  LocalSyncReadinessStatus,
  LocalSyncResult,
  ManagedProject,
  PostMergeHandoff,
  PostMergeStateSnapshot,
  RemoteBranchCleanupReadiness,
  RemoteBranchCleanupReadinessStatus,
  RemoteBranchCleanupResult,
  RemoteLandingResult,
  ResolvedMemory,
} from "../types/index.js";
import type { ProjectWorkbenchArtifactPathPort } from "../project-runtime/paths.js";

import { localSyncReadinessSchema, cleanupReadinessSchema, handoffSchema, stateSnapshotSchema, localSyncResultSchema, cleanupResultSchema } from "./schemas.js";

const execFileAsync = promisify(execFile);

export async function preparePostMergeHandoff(project: ManagedProject, landingPackageId: string, remoteLandingResultId: string): Promise<PostMergeHandoff> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "post-merge handoff");
  const landing = await readLandingPackage(memory, landingPackageId);
  const remoteResult = await readRemoteLandingResult(memory, remoteLandingResultId);
  if (remoteResult.landingPackageId !== landingPackageId) {
    throw new Error(`Remote landing result ${remoteLandingResultId} does not belong to landing package ${landingPackageId}.`);
  }
  const pkg = await findPrDraftPackageForLanding(memory, landingPackageId);
  const now = new Date().toISOString();
  const id = `post-merge-${contentHash(`${remoteLandingResultId}:${landingPackageId}:${now}`).slice(0, 12)}`;
  const directory = join(postMergeRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const capability = await detectRemoteProviderCapability(project).catch(() => null);
  const remoteName = capability?.remoteName;
  const prState = remoteResult.prUrl ? await ghPrState(project.path, remoteResult.prUrl).catch(() => ({})) : {};
  const baseBranch = stringField(prState, "baseRefName") ?? pkg?.baseBranch ?? null;
  const headBranch = stringField(prState, "headRefName") ?? pkg?.branchName ?? null;
  const currentBranch = await getGitBranch(project.path).catch(() => null);
  const statusLines = await getGitStatusShort(project.path).catch(() => null);
  const workingTreeClean = statusLines ? statusLines.length === 0 : null;
  const localHead = await getGitCommit(project.path).catch(() => null);
  const fetch = remoteName && baseBranch ? await fetchRemoteBase(project.path, remoteName, baseBranch) : { ok: false, reason: "Missing remote/base branch." };
  const remoteBaseRef = remoteName && baseBranch ? `refs/remotes/${remoteName}/${baseBranch}` : null;
  const remoteBaseHead = fetch.ok && remoteBaseRef ? await getGitCommit(project.path, remoteBaseRef).catch(() => null) : null;
  const alreadyCurrent = Boolean(localHead && remoteBaseHead && localHead === remoteBaseHead);
  const canFastForward = Boolean(fetch.ok && remoteBaseRef && !alreadyCurrent && await commandOk("git", ["merge-base", "--is-ancestor", "HEAD", remoteBaseRef], project.path));
  const remoteHeadBranchExists = remoteName && headBranch ? await remoteBranchExists(project.path, remoteName, headBranch) : null;
  const stateSnapshot: PostMergeStateSnapshot = {
    version: "1.0",
    id: `post-merge-state-${contentHash(`${id}:state`).slice(0, 12)}`,
    remoteLandingResultId,
    landingPackageId,
    prDraftPackageId: remoteResult.prDraftPackageId,
    projectId: memory.projectId,
    ...(remoteResult.prUrl ? { prUrl: remoteResult.prUrl } : {}),
    prState: stringField(prState, "state") ?? (remoteResult.status === "merged" ? "MERGED" : "UNKNOWN"),
    baseBranch,
    headBranch,
    mergeCommit: nullableStringField(prState, "mergeCommit") ?? remoteResult.mergeCommit ?? null,
    mergedAt: nullableStringField(prState, "mergedAt") ?? remoteResult.mergedAt ?? null,
    currentBranch,
    workingTreeClean,
    localHead,
    ...(remoteName ? { remoteName } : {}),
    remoteBaseHead,
    remoteHeadBranchExists,
    canFastForward,
    alreadyCurrent,
    evidenceRefs: [remoteResult.artifactRefs[0], ...landing.artifactRefs].filter(Boolean),
    createdAt: now,
  };
  const localSyncReadiness = buildLocalSyncReadiness(memory, id, remoteResult, stateSnapshot, fetch.ok ? undefined : fetch.reason, now, join(directory, "local-sync-readiness.json"));
  const cleanupReadiness = buildCleanupReadiness(memory, id, remoteResult, stateSnapshot, now, join(directory, "remote-branch-cleanup-readiness.json"));
  const statePath = join(directory, "post-merge-state.json");
  const handoffPath = join(directory, "post-merge-handoff.json");
  const summaryPath = join(directory, "post-merge-summary.md");
  const handoff: PostMergeHandoff = {
    version: "1.0",
    id,
    remoteLandingResultId,
    landingPackageId,
    prDraftPackageId: remoteResult.prDraftPackageId,
    projectId: memory.projectId,
    ...(remoteResult.prUrl ? { prUrl: remoteResult.prUrl } : {}),
    status: remoteResult.status === "merged" ? "merged" : "not-merged",
    summary: remoteResult.status === "merged" ? "远端 PR 已合并。本地项目状态已刷新。" : "远端 PR 尚未成功合并，不能进行合并后同步或清理。",
    localStatusSummary: localSyncReadiness.summary,
    cleanupSummary: cleanupReadiness.summary,
    stateSnapshotArtifact: displayArtifactPath(memory, statePath),
    summaryArtifact: displayArtifactPath(memory, summaryPath),
    evidenceRefs: Array.from(new Set([remoteResult.artifactRefs[0], localSyncReadiness.readinessArtifact, cleanupReadiness.readinessArtifact, ...landing.artifactRefs].filter(Boolean))),
    localSyncReadiness,
    remoteBranchCleanupReadiness: cleanupReadiness,
    createdAt: now,
  };
  stateSnapshotSchema.parse(stateSnapshot);
  handoffSchema.parse(handoff);
  await writeJsonFile(statePath, stateSnapshot);
  await writeJsonFile(join(directory, "local-sync-readiness.json"), localSyncReadiness);
  await writeJsonFile(join(directory, "remote-branch-cleanup-readiness.json"), cleanupReadiness);
  await writeJsonFile(handoffPath, handoff);
  await writeFile(summaryPath, renderPostMergeSummary(handoff, stateSnapshot), "utf8");
  return handoff;
}

export async function prepareLocalSync(project: ManagedProject, landingPackageId: string, remoteLandingResultId: string): Promise<LocalSyncReadiness> {
  return (await preparePostMergeHandoff(project, landingPackageId, remoteLandingResultId)).localSyncReadiness;
}

export async function syncLocalAfterMerge(project: ManagedProject, landingPackageId: string, remoteLandingResultId: string): Promise<{ readiness: LocalSyncReadiness; result: LocalSyncResult }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "post-merge local sync");
  const handoff = await preparePostMergeHandoff(project, landingPackageId, remoteLandingResultId);
  const readiness = handoff.localSyncReadiness;
  const now = new Date().toISOString();
  const directory = join(postMergeRoot(memory), handoff.id);
  const beforeHead = await getGitCommit(project.path).catch(() => null);
  if (!readiness.canSync || !handoff.remoteBranchCleanupReadiness.remoteName) {
    const result = await writeLocalSyncResult(memory, directory, readiness, handoff, "skipped", beforeHead, beforeHead, readiness.reason, now);
    return { readiness, result };
  }
  const baseBranch = handoff.remoteBranchCleanupReadiness.remoteName && handoff.localSyncReadiness.status === "ready"
    ? (await readRequiredJsonFile(join(directory, "post-merge-state.json"), stateSnapshotSchema)).baseBranch
    : null;
  const remoteName = handoff.remoteBranchCleanupReadiness.remoteName;
  if (!baseBranch) {
    const result = await writeLocalSyncResult(memory, directory, readiness, handoff, "failed", beforeHead, beforeHead, "Missing base branch.", now);
    return { readiness, result };
  }
  try {
    await gitText(project.path, ["merge", "--ff-only", `refs/remotes/${remoteName}/${baseBranch}`]);
    const afterHead = await getGitCommit(project.path).catch(() => null);
    const result = await writeLocalSyncResult(memory, directory, readiness, handoff, "synced", beforeHead, afterHead, undefined, now);
    await preparePostMergeHandoff(project, landingPackageId, remoteLandingResultId);
    return { readiness, result };
  } catch (cause) {
    const afterHead = await getGitCommit(project.path).catch(() => null);
    const result = await writeLocalSyncResult(memory, directory, readiness, handoff, "failed", beforeHead, afterHead, cause instanceof Error ? cause.message : String(cause), now);
    return { readiness, result };
  }
}

export async function prepareRemoteBranchCleanup(project: ManagedProject, landingPackageId: string, remoteLandingResultId: string): Promise<RemoteBranchCleanupReadiness> {
  return (await preparePostMergeHandoff(project, landingPackageId, remoteLandingResultId)).remoteBranchCleanupReadiness;
}

export async function cleanupRemoteBranchAfterMerge(project: ManagedProject, landingPackageId: string, remoteLandingResultId: string): Promise<{ readiness: RemoteBranchCleanupReadiness; result: RemoteBranchCleanupResult }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "post-merge remote branch cleanup");
  const handoff = await preparePostMergeHandoff(project, landingPackageId, remoteLandingResultId);
  const readiness = handoff.remoteBranchCleanupReadiness;
  const now = new Date().toISOString();
  const directory = join(postMergeRoot(memory), handoff.id);
  if (!readiness.canCleanup || !readiness.remoteName || !readiness.headBranch) {
    const result = await writeCleanupResult(memory, directory, readiness, handoff, "skipped", readiness.reason, now);
    return { readiness, result };
  }
  try {
    await gitText(project.path, ["push", readiness.remoteName, "--delete", readiness.headBranch]);
    const result = await writeCleanupResult(memory, directory, readiness, handoff, "deleted", undefined, now);
    await preparePostMergeHandoff(project, landingPackageId, remoteLandingResultId);
    return { readiness, result };
  } catch (cause) {
    const result = await writeCleanupResult(memory, directory, readiness, handoff, "failed", cause instanceof Error ? cause.message : String(cause), now);
    return { readiness, result };
  }
}

export async function latestPostMergeHandoffForLanding(memory: ProjectWorkbenchArtifactPathPort, landingPackageId: string): Promise<PostMergeHandoff | null> {
  return (await listPostMergeHandoffs(memory)).find((item) => item.landingPackageId === landingPackageId) ?? null;
}

export async function listPostMergeHandoffs(memory: ProjectWorkbenchArtifactPathPort): Promise<PostMergeHandoff[]> {
  const root = postMergeRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const items: PostMergeHandoff[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "post-merge-handoff.json");
    if (!existsSync(file)) continue;
    items.push(await readRequiredJsonFile(file, handoffSchema));
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function buildLocalSyncReadiness(
  memory: ResolvedMemory,
  handoffId: string,
  result: RemoteLandingResult,
  snapshot: PostMergeStateSnapshot,
  fetchFailure: string | undefined,
  now: string,
  readinessPath: string,
): LocalSyncReadiness {
  const status = classifyLocalSync(result, snapshot, fetchFailure);
  const text = localSyncText(status, snapshot);
  const readiness: LocalSyncReadiness = {
    version: "1.0",
    id: `local-sync-${contentHash(`${handoffId}:${status}`).slice(0, 12)}`,
    postMergeHandoffId: handoffId,
    remoteLandingResultId: result.id,
    landingPackageId: result.landingPackageId,
    projectId: memory.projectId,
    status,
    canSync: status === "ready",
    ...text,
    readinessArtifact: displayArtifactPath(memory, readinessPath),
    evidenceRefs: snapshot.evidenceRefs,
    createdAt: now,
  };
  localSyncReadinessSchema.parse(readiness);
  return readiness;
}

function classifyLocalSync(result: RemoteLandingResult, snapshot: PostMergeStateSnapshot, fetchFailure: string | undefined): LocalSyncReadinessStatus {
  if (result.status !== "merged") return "not-merged";
  if (!snapshot.remoteName) return "provider-unavailable";
  if (snapshot.workingTreeClean === false) return "dirty-source";
  if (!snapshot.baseBranch || !snapshot.currentBranch) return "missing-base";
  if (snapshot.currentBranch !== snapshot.baseBranch) return "wrong-branch";
  if (fetchFailure) return "fetch-failed";
  if (snapshot.alreadyCurrent) return "already-current";
  if (snapshot.canFastForward) return "ready";
  return "not-fast-forward";
}

function buildCleanupReadiness(
  memory: ResolvedMemory,
  handoffId: string,
  result: RemoteLandingResult,
  snapshot: PostMergeStateSnapshot,
  now: string,
  readinessPath: string,
): RemoteBranchCleanupReadiness {
  const status = classifyCleanup(result, snapshot);
  const text = cleanupText(status, snapshot);
  const readiness: RemoteBranchCleanupReadiness = {
    version: "1.0",
    id: `remote-branch-cleanup-${contentHash(`${handoffId}:${status}`).slice(0, 12)}`,
    postMergeHandoffId: handoffId,
    remoteLandingResultId: result.id,
    landingPackageId: result.landingPackageId,
    projectId: memory.projectId,
    status,
    canCleanup: status === "ready",
    headBranch: snapshot.headBranch,
    ...(snapshot.remoteName ? { remoteName: snapshot.remoteName } : {}),
    ...text,
    readinessArtifact: displayArtifactPath(memory, readinessPath),
    evidenceRefs: snapshot.evidenceRefs,
    createdAt: now,
  };
  cleanupReadinessSchema.parse(readiness);
  return readiness;
}

function classifyCleanup(result: RemoteLandingResult, snapshot: PostMergeStateSnapshot): RemoteBranchCleanupReadinessStatus {
  if (result.status !== "merged") return "not-merged";
  if (!snapshot.remoteName) return "provider-unavailable";
  if (!snapshot.headBranch) return "missing-head";
  if (snapshot.baseBranch && snapshot.headBranch === snapshot.baseBranch) return "unsafe-head";
  if (snapshot.remoteHeadBranchExists === false) return "already-deleted";
  if (snapshot.remoteHeadBranchExists === true) return "ready";
  return "delete-unavailable";
}

function localSyncText(status: LocalSyncReadinessStatus, snapshot: PostMergeStateSnapshot): Pick<LocalSyncReadiness, "summary" | "reason" | "confirmEffect" | "riskSummary"> {
  switch (status) {
    case "ready": return {
      summary: `本地项目可以安全同步到远端 ${snapshot.baseBranch ?? "base"} 最新状态。`,
      reason: "当前在 PR base branch，工作区干净，并且只需要 fast-forward。",
      confirmEffect: "会执行一次 fast-forward 同步；不会 checkout、stash、reset、rebase 或创建 merge commit。",
      riskSummary: "同步后本地 base branch 会前进到远端合并后的提交。",
    };
    case "already-current": return { summary: "本地项目已经同步到远端最新状态。", reason: "本地 HEAD 与远端 base 一致。", confirmEffect: "无需同步。", riskSummary: "不会执行本地 git 修改。" };
    case "not-merged": return { summary: "PR 尚未成功合并，不能同步本地项目。", reason: "缺少 merged remote landing evidence。", confirmEffect: "不会执行本地 git 修改。", riskSummary: "先完成远端合并。" };
    case "provider-unavailable": return { summary: "无法确认远端 provider，不能一键同步。", reason: "缺少可用 remote/provider 信息。", confirmEffect: "不会执行本地 git 修改。", riskSummary: "请先配置 GitHub CLI 和 Git remote。" };
    case "dirty-source": return { summary: "本地项目有未处理改动，不能一键同步。", reason: "AHO 不会自动 stash、reset 或覆盖你的本地修改。", confirmEffect: "不会执行本地 git 修改。", riskSummary: "请先手动处理本地改动。" };
    case "wrong-branch": return { summary: "当前不在 PR base branch，不能一键同步。", reason: `当前分支是 ${snapshot.currentBranch ?? "unknown"}，base branch 是 ${snapshot.baseBranch ?? "unknown"}。`, confirmEffect: "不会自动 checkout 或切换分支。", riskSummary: "请手动切到正确分支后再刷新。" };
    case "missing-base": return { summary: "缺少 base branch 信息，不能一键同步。", reason: "无法可靠判断当前分支与 PR base。", confirmEffect: "不会执行本地 git 修改。", riskSummary: "请刷新 PR/remote 状态。" };
    case "fetch-failed": return { summary: "无法 fetch 远端 base，不能一键同步。", reason: "远端不可达或权限不足。", confirmEffect: "不会执行本地 git 修改。", riskSummary: "请检查网络、remote 和权限。" };
    case "not-fast-forward": return { summary: "本地分支不能 fast-forward，不能一键同步。", reason: "本地提交历史与远端 base 不满足 fast-forward 条件。", confirmEffect: "不会执行 merge、rebase 或 reset。", riskSummary: "需要人工处理本地分支状态。" };
  }
}

function cleanupText(status: RemoteBranchCleanupReadinessStatus, snapshot: PostMergeStateSnapshot): Pick<RemoteBranchCleanupReadiness, "summary" | "reason" | "confirmEffect" | "riskSummary"> {
  switch (status) {
    case "ready": return {
      summary: `远端 PR 分支 ${snapshot.headBranch ?? ""} 可以清理。`,
      reason: "PR 已合并，远端 head branch 仍存在，且不是 base branch。",
      confirmEffect: "会删除远端 PR head branch；不会删除本地 branch。",
      riskSummary: "删除后该远端分支不再可用于继续 push；PR 记录仍保留。",
    };
    case "not-merged": return { summary: "PR 尚未成功合并，不能清理远端分支。", reason: "缺少 merged remote landing evidence。", confirmEffect: "不会删除远端分支。", riskSummary: "先完成远端合并。" };
    case "provider-unavailable": return { summary: "无法确认远端 provider，不能清理分支。", reason: "缺少可用 remote/provider 信息。", confirmEffect: "不会删除远端分支。", riskSummary: "请先配置 GitHub CLI 和 Git remote。" };
    case "missing-head": return { summary: "缺少 PR head branch 信息。", reason: "无法确认要清理的远端分支。", confirmEffect: "不会删除远端分支。", riskSummary: "请刷新 PR 状态。" };
    case "already-deleted": return { summary: "远端 PR 分支已经不存在。", reason: "没有需要清理的远端分支。", confirmEffect: "不会删除任何分支。", riskSummary: "这是安全的终态。" };
    case "unsafe-head": return { summary: "不会清理 base branch。", reason: "PR head branch 与 base branch 相同或不可安全区分。", confirmEffect: "不会删除远端分支。", riskSummary: "AHO 不会删除可能承载主线的分支。" };
    case "delete-unavailable": return { summary: "不能确认远端 PR 分支是否可删除。", reason: "远端分支检测失败。", confirmEffect: "不会删除远端分支。", riskSummary: "请检查 remote 权限或手动处理。" };
  }
}

async function writeLocalSyncResult(
  memory: ResolvedMemory,
  directory: string,
  readiness: LocalSyncReadiness,
  handoff: PostMergeHandoff,
  status: LocalSyncResult["status"],
  beforeHead: string | null,
  afterHead: string | null,
  failureReason: string | undefined,
  now: string,
): Promise<LocalSyncResult> {
  const resultPath = join(directory, "local-sync-result.json");
  const result: LocalSyncResult = {
    version: "1.0",
    id: `local-sync-result-${contentHash(`${readiness.id}:${status}:${now}`).slice(0, 12)}`,
    readinessId: readiness.id,
    postMergeHandoffId: handoff.id,
    remoteLandingResultId: handoff.remoteLandingResultId,
    landingPackageId: handoff.landingPackageId,
    projectId: memory.projectId,
    status,
    beforeHead,
    afterHead,
    ...(failureReason ? { failureReason } : {}),
    artifactRefs: [readiness.readinessArtifact, handoff.summaryArtifact, displayArtifactPath(memory, resultPath)],
    createdAt: now,
  };
  localSyncResultSchema.parse(result);
  await writeJsonFile(resultPath, result);
  return result;
}

async function writeCleanupResult(
  memory: ResolvedMemory,
  directory: string,
  readiness: RemoteBranchCleanupReadiness,
  handoff: PostMergeHandoff,
  status: RemoteBranchCleanupResult["status"],
  failureReason: string | undefined,
  now: string,
): Promise<RemoteBranchCleanupResult> {
  const resultPath = join(directory, "remote-branch-cleanup-result.json");
  const result: RemoteBranchCleanupResult = {
    version: "1.0",
    id: `remote-branch-cleanup-result-${contentHash(`${readiness.id}:${status}:${now}`).slice(0, 12)}`,
    readinessId: readiness.id,
    postMergeHandoffId: handoff.id,
    remoteLandingResultId: handoff.remoteLandingResultId,
    landingPackageId: handoff.landingPackageId,
    projectId: memory.projectId,
    status,
    headBranch: readiness.headBranch,
    ...(readiness.remoteName ? { remoteName: readiness.remoteName } : {}),
    ...(failureReason ? { failureReason } : {}),
    artifactRefs: [readiness.readinessArtifact, handoff.summaryArtifact, displayArtifactPath(memory, resultPath)],
    createdAt: now,
  };
  cleanupResultSchema.parse(result);
  await writeJsonFile(resultPath, result);
  return result;
}

function renderPostMergeSummary(handoff: PostMergeHandoff, snapshot: PostMergeStateSnapshot): string {
  return [
    "# Post-Merge Handoff",
    "",
    handoff.summary,
    "",
    `PR: ${handoff.prUrl ?? "unavailable"}`,
    `Base branch: ${snapshot.baseBranch ?? "unknown"}`,
    `Head branch: ${snapshot.headBranch ?? "unknown"}`,
    `Current local branch: ${snapshot.currentBranch ?? "unknown"}`,
    "",
    "## Local Sync",
    "",
    handoff.localSyncReadiness.summary,
    "",
    `Reason: ${handoff.localSyncReadiness.reason}`,
    "",
    "## Remote Branch Cleanup",
    "",
    handoff.remoteBranchCleanupReadiness.summary,
    "",
    `Reason: ${handoff.remoteBranchCleanupReadiness.reason}`,
    "",
  ].join("\n");
}

async function fetchRemoteBase(cwd: string, remoteName: string, baseBranch: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await gitText(cwd, ["fetch", remoteName, baseBranch]);
    return { ok: true };
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

async function remoteBranchExists(cwd: string, remoteName: string, branch: string): Promise<boolean | null> {
  try {
    const output = await gitText(cwd, ["ls-remote", "--heads", remoteName, branch]);
    return output.trim().length > 0;
  } catch {
    return null;
  }
}

async function ghPrState(cwd: string, pr: string): Promise<Record<string, unknown>> {
  const fields = ["url", "state", "isDraft", "headRefName", "baseRefName", "mergedAt", "mergeCommit"];
  const stdout = await commandText(githubCliCommand(), [...githubCliArgs(), "pr", "view", pr, "--json", fields.join(",")], cwd);
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function commandOk(command: string, args: string[], cwd: string): Promise<boolean> {
  try {
    await commandText(command, args, cwd);
    return true;
  } catch {
    return false;
  }
}

async function commandText(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

function nullableStringField(value: unknown, key: string): string | null {
  return stringField(value, key) ?? null;
}

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  if (typeof field === "string") return field;
  if (field && typeof field === "object" && key === "mergeCommit") return stringField(field, "oid");
  return undefined;
}

function postMergeRoot(memory: ProjectWorkbenchArtifactPathPort): string {
  return join(memory.workbenchRoot, "post-merge");
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  return `${memory.artifactBase === "memory-root" ? "memory://" : "project://"}${relative(memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot, absolutePath).replace(/\\/g, "/")}`;
}

function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}
