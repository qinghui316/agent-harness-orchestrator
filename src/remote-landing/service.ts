import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { recordDemandMemoryCloseout, recordMaintenanceLedgerEntry } from "../agent-task/manager.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { readLandingPackage } from "../landing/manager.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import {
  detectRemoteProviderCapability,
  findLatestCreatedPrDraftPackageForChanges,
  findPrDraftPackageForLanding,
  githubCliArgs,
  githubCliCommand,
} from "../pr-draft/manager.js";
import { refreshPrFeedback } from "../pr-feedback/manager.js";
import type {
  ManagedProject,
  RemoteLandingAttempt,
  RemoteLandingReadiness,
  RemoteLandingReadinessStatus,
  RemoteLandingResult,
  RemoteLandingStateSnapshot,
  ResolvedMemory,
} from "../types/index.js";

import { stateSnapshotSchema, readinessSchema, attemptSchema, resultSchema } from "./schemas.js";

const execFileAsync = promisify(execFile);

export async function prepareRemoteLandingReadiness(project: ManagedProject, landingPackageId: string): Promise<RemoteLandingReadiness> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "remote landing readiness");
  const landing = await readLandingPackage(memory, landingPackageId);
  const pkg = await findPrDraftPackageForLanding(memory, landingPackageId)
    ?? await findLatestCreatedPrDraftPackageForChanges(memory, landing.target.changeIds);
  const now = new Date().toISOString();

  if (!pkg || pkg.status !== "created" || !pkg.prUrl) {
    return writeReadiness(memory, {
      now,
      landingPackageId,
      prDraftPackageId: pkg?.id ?? "unavailable",
      status: "missing-pr",
      canMerge: false,
      summary: "还没有可合并的 PR。",
      reason: "需要先创建并提交 PR 草稿。",
      confirmEffect: "不会执行远端合并。",
      riskSummary: "AHO 不会伪造 PR 状态。",
      evidenceRefs: landing.artifactRefs,
    });
  }

  const capability = await detectRemoteProviderCapability(project);
  if (!capability.ready) {
    return writeReadiness(memory, {
      now,
      landingPackageId,
      prDraftPackageId: pkg.id,
      prUrl: pkg.prUrl,
      status: "provider-unavailable",
      canMerge: false,
      summary: capability.reason ?? "远端 provider 不可用。",
      reason: capability.setupHint,
      confirmEffect: "不会执行远端合并。",
      riskSummary: "Provider ready 前不会显示合并按钮。",
      evidenceRefs: [pkg.packageArtifact, ...landing.artifactRefs],
    });
  }

  const feedback = await refreshPrFeedback(project, landingPackageId);
  const rawState = await ghPrMergeState(project.path, pkg.prUrl).catch(() => ({}));
  const snapshot: RemoteLandingStateSnapshot = {
    version: "1.0",
    id: `remote-landing-state-${contentHash(`${feedback.snapshot.id}:${now}`).slice(0, 12)}`,
    prDraftPackageId: feedback.snapshot.prDraftPackageId,
    landingPackageId,
    projectId: memory.projectId,
    prUrl: feedback.snapshot.prUrl ?? pkg.prUrl,
    state: stringField(rawState, "state") ?? feedback.snapshot.state,
    isDraft: typeof (rawState as { isDraft?: unknown }).isDraft === "boolean" ? Boolean((rawState as { isDraft?: unknown }).isDraft) : feedback.snapshot.isDraft,
    reviewDecision: nullableStringField(rawState, "reviewDecision") ?? feedback.snapshot.reviewDecision,
    feedbackClassification: feedback.summary.classification,
    failedChecksCount: feedback.summary.failedChecksCount,
    commentsCount: feedback.summary.commentsCount,
    mergeable: nullableStringField(rawState, "mergeable"),
    mergeStateStatus: nullableStringField(rawState, "mergeStateStatus"),
    headRefName: nullableStringField(rawState, "headRefName") ?? feedback.snapshot.headRefName,
    baseRefName: nullableStringField(rawState, "baseRefName") ?? feedback.snapshot.baseRefName,
    headRefOid: nullableStringField(rawState, "headRefOid") ?? feedback.snapshot.headRefOid,
    baseRefOid: nullableStringField(rawState, "baseRefOid") ?? feedback.snapshot.baseRefOid,
    evidenceRefs: feedback.summary.evidenceRefs,
    createdAt: now,
  };
  const status = classifyRemoteLandingReadiness(snapshot);
  const text = readinessText(status, snapshot.commentsCount);
  return writeReadiness(memory, {
    now,
    landingPackageId,
    prDraftPackageId: feedback.snapshot.prDraftPackageId,
    prUrl: snapshot.prUrl,
    status,
    canMerge: status === "ready" || status === "ready-with-comments",
    summary: text.summary,
    reason: text.reason,
    confirmEffect: text.confirmEffect,
    riskSummary: text.riskSummary,
    stateSnapshot: snapshot,
    evidenceRefs: [pkg.packageArtifact, ...landing.artifactRefs, ...feedback.summary.evidenceRefs],
  });
}

export async function refreshRemoteLanding(project: ManagedProject, landingPackageId: string): Promise<RemoteLandingReadiness> {
  return prepareRemoteLandingReadiness(project, landingPackageId);
}

export async function mergeRemoteLanding(project: ManagedProject, landingPackageId: string): Promise<{ readiness: RemoteLandingReadiness; attempt: RemoteLandingAttempt; result: RemoteLandingResult }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "remote landing merge");
  const landing = await readLandingPackage(memory, landingPackageId);
  const readiness = await prepareRemoteLandingReadiness(project, landingPackageId);
  if (!readiness.canMerge || !readiness.prUrl) {
    throw new Error(`Cannot merge PR: ${readiness.reason}`);
  }
  const now = new Date().toISOString();
  const attemptId = `remote-landing-attempt-${contentHash(`${readiness.id}:${now}`).slice(0, 12)}`;
  const directory = join(remoteLandingRoot(memory), attemptId);
  await mkdir(directory, { recursive: true });
  const attempt: RemoteLandingAttempt = {
    version: "1.0",
    id: attemptId,
    readinessId: readiness.id,
    prDraftPackageId: readiness.prDraftPackageId,
    landingPackageId,
    projectId: memory.projectId,
    prUrl: readiness.prUrl,
    mergeMethod: "squash",
    status: "started",
    artifactRefs: [readiness.summaryArtifact, readiness.readinessArtifact, readiness.stateSnapshotArtifact],
    startedAt: now,
  };
  attemptSchema.parse(attempt);
  await writeJsonFile(join(directory, "remote-landing-attempt.json"), attempt);

  try {
    await commandText(githubCliCommand(), [...githubCliArgs(), "pr", "merge", readiness.prUrl, "--squash"], project.path);
    const mergedState = await ghPrMergeState(project.path, readiness.prUrl).catch(() => ({}));
    const finishedAt = new Date().toISOString();
    const result: RemoteLandingResult = {
      version: "1.0",
      id: `remote-landing-result-${contentHash(`${attempt.id}:${finishedAt}:merged`).slice(0, 12)}`,
      attemptId: attempt.id,
      readinessId: readiness.id,
      prDraftPackageId: readiness.prDraftPackageId,
      landingPackageId,
      projectId: memory.projectId,
      prUrl: readiness.prUrl,
      status: "merged",
      mergeMethod: "squash",
      mergeCommit: nullableStringField(mergedState, "mergeCommit") ?? null,
      mergedAt: nullableStringField(mergedState, "mergedAt") ?? finishedAt,
      artifactRefs: [readiness.summaryArtifact, readiness.readinessArtifact, readiness.stateSnapshotArtifact, ...landing.artifactRefs],
      createdAt: finishedAt,
    };
    const completedAttempt: RemoteLandingAttempt = { ...attempt, status: "merged", finishedAt, artifactRefs: [...attempt.artifactRefs, ...result.artifactRefs] };
    await writeResultArtifacts(memory, directory, completedAttempt, result, "远端 PR 已合并。本地项目不会自动同步；如需本地更新，请手动 pull 或在后续阶段处理同步。");
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "remote-landing",
      changeId: landing.target.changeIds[0],
      summary: `Remote PR merged: ${readiness.prUrl}`,
      artifactRefs: [displayArtifactPath(memory, join(directory, "remote-landing-result.json")), ...result.artifactRefs],
    });
    for (const changeId of landing.target.changeIds) {
      await recordDemandMemoryCloseout(memory, {
        changeId,
        title: `Remote merge completed for ${changeId}`,
        terminalKind: "merged",
        goal: `Remote PR landing for ${changeId}`,
        finalResult: `Remote PR merged with squash. Local source was not automatically synchronized.`,
        userDecision: "merged",
        changedFiles: landing.changedFiles,
        evidenceRefs: [displayArtifactPath(memory, join(directory, "remote-landing-result.json")), readiness.summaryArtifact, ...landing.artifactRefs],
        memoryBoundaryNotes: [
          "Remote merge success is the stable remote-code boundary.",
          "Closeout, ledger, candidates, generated indexes, and generated cache may be written automatically.",
          "Approved project Markdown changes are reviewed by a background Reviewer Agent and applied automatically by Runtime; local source synchronization remains a separate operation.",
        ],
      });
    }
    return { readiness, attempt: completedAttempt, result };
  } catch (cause) {
    const finishedAt = new Date().toISOString();
    const failureReason = cause instanceof Error ? cause.message : String(cause);
    const result: RemoteLandingResult = {
      version: "1.0",
      id: `remote-landing-result-${contentHash(`${attempt.id}:${finishedAt}:failed`).slice(0, 12)}`,
      attemptId: attempt.id,
      readinessId: readiness.id,
      prDraftPackageId: readiness.prDraftPackageId,
      landingPackageId,
      projectId: memory.projectId,
      prUrl: readiness.prUrl,
      status: "failed",
      mergeMethod: "squash",
      failureReason,
      artifactRefs: [readiness.summaryArtifact, readiness.readinessArtifact, readiness.stateSnapshotArtifact],
      createdAt: finishedAt,
    };
    const failedAttempt: RemoteLandingAttempt = { ...attempt, status: "failed", finishedAt, artifactRefs: [...attempt.artifactRefs, ...result.artifactRefs] };
    await writeResultArtifacts(memory, directory, failedAttempt, result, `远端合并失败：${failureReason}`);
    await recordMaintenanceLedgerEntry(memory, {
      eventType: "failure",
      changeId: landing.target.changeIds[0],
      summary: `Remote PR merge failed: ${failureReason}`,
      artifactRefs: [displayArtifactPath(memory, join(directory, "remote-landing-result.json")), ...result.artifactRefs],
    });
    return { readiness, attempt: failedAttempt, result };
  }
}

export async function latestRemoteLandingReadinessForDraft(memory: ResolvedMemory, prDraftPackageId: string): Promise<RemoteLandingReadiness | null> {
  return (await listRemoteLandingReadiness(memory)).find((item) => item.prDraftPackageId === prDraftPackageId) ?? null;
}

export async function listRemoteLandingReadiness(memory: ResolvedMemory): Promise<RemoteLandingReadiness[]> {
  const root = remoteLandingRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const items: RemoteLandingReadiness[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "remote-landing-readiness.json");
    if (!existsSync(file)) continue;
    items.push(await readRequiredJsonFile(file, readinessSchema));
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listRemoteLandingResults(memory: ResolvedMemory): Promise<RemoteLandingResult[]> {
  const root = remoteLandingRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const items: RemoteLandingResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "remote-landing-result.json");
    if (!existsSync(file)) continue;
    items.push(await readRequiredJsonFile(file, resultSchema));
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readRemoteLandingResult(memory: ResolvedMemory, remoteLandingResultId: string): Promise<RemoteLandingResult> {
  const result = (await listRemoteLandingResults(memory)).find((item) => item.id === remoteLandingResultId);
  if (!result) throw new Error(`Remote landing result not found: ${remoteLandingResultId}`);
  return result;
}

export async function latestMergedRemoteLandingResultForLanding(memory: ResolvedMemory, landingPackageId: string): Promise<RemoteLandingResult | null> {
  return (await listRemoteLandingResults(memory)).find((item) => item.landingPackageId === landingPackageId && item.status === "merged") ?? null;
}

function classifyRemoteLandingReadiness(snapshot: RemoteLandingStateSnapshot): RemoteLandingReadinessStatus {
  const state = snapshot.state.toUpperCase();
  if (state === "MERGED") return "already-merged";
  if (state !== "OPEN") return "closed";
  if (snapshot.isDraft) return "draft";
  if (snapshot.failedChecksCount > 0 || snapshot.feedbackClassification === "checks-failed") return "checks-failed";
  if (snapshot.feedbackClassification === "changes-requested" || snapshot.feedbackClassification === "inline-comments-actionable" || snapshot.feedbackClassification === "user-pushback-requested") return "actionable-feedback";
  if (snapshot.feedbackClassification === "stale-pr" || snapshot.feedbackClassification === "provider-unavailable") return snapshot.feedbackClassification;
  const mergeable = (snapshot.mergeable ?? "").toUpperCase();
  const mergeState = (snapshot.mergeStateStatus ?? "").toUpperCase();
  if (mergeable === "CONFLICTING" || ["DIRTY", "BLOCKED", "BEHIND"].includes(mergeState)) return "merge-unavailable";
  if (snapshot.feedbackClassification === "comments-only") return "ready-with-comments";
  return "ready";
}

function readinessText(status: RemoteLandingReadinessStatus, commentsCount: number): Pick<RemoteLandingReadiness, "summary" | "reason" | "confirmEffect" | "riskSummary"> {
  switch (status) {
    case "ready":
      return {
        summary: "PR 已满足远端合并条件。",
        reason: "PR 已提交评审，远端检查没有失败，也没有必须先处理的反馈。",
        confirmEffect: "会执行 GitHub squash merge；不会 push main、启用 auto-merge、删除远端分支或同步本地源码。",
        riskSummary: "合并后远端代码成为稳定边界，本地工作区仍需后续手动同步。",
      };
    case "ready-with-comments":
      return {
        summary: "PR 有普通评论，但没有必须阻止合并的反馈。",
        reason: `检测到 ${commentsCount} 条普通评论；请确认是否仍然合并。`,
        confirmEffect: "会执行 GitHub squash merge；不会自动回复评论或解决 thread。",
        riskSummary: "普通评论可能仍有人工判断价值；合并前请确认摘要和证据。",
      };
    case "missing-pr":
      return { summary: "还没有可合并的 PR。", reason: "需要先创建 PR。", confirmEffect: "不会执行远端操作。", riskSummary: "AHO 不会伪造合并能力。" };
    case "provider-unavailable":
      return { summary: "远端 provider 不可用。", reason: "无法确认 PR 状态。", confirmEffect: "不会执行远端合并。", riskSummary: "请先配置 GitHub CLI / remote / auth。" };
    case "draft":
      return { summary: "PR 仍是草稿。", reason: "需要先提交人工评审。", confirmEffect: "不会执行远端合并。", riskSummary: "Draft PR 不能作为合并入口。" };
    case "already-merged":
      return { summary: "PR 已经合并。", reason: "远端 PR 已处于 merged 状态。", confirmEffect: "无需重复合并。", riskSummary: "可以刷新状态或查看历史证据。" };
    case "closed":
      return { summary: "PR 不处于 open 状态。", reason: "PR 可能已关闭或远端状态已变化。", confirmEffect: "不会执行远端合并。", riskSummary: "请刷新 PR 状态或重新处理。" };
    case "checks-failed":
      return { summary: "远端检查失败，需要先处理。", reason: "存在 failed checks。", confirmEffect: "请回到 PR feedback/rework 路径。", riskSummary: "不会显示合并按钮。" };
    case "actionable-feedback":
      return { summary: "PR 有需要处理的反馈。", reason: "review 或 inline feedback 需要先修改。", confirmEffect: "请回到同一需求的 PR feedback/rework 路径。", riskSummary: "不会显示合并按钮。" };
    case "stale-pr":
      return { summary: "PR 状态不适合合并。", reason: "PR 远端状态已过期或不可继续。", confirmEffect: "请刷新状态或重新处理。", riskSummary: "不会执行远端合并。" };
    case "merge-unavailable":
      return { summary: "PR 当前不能合并。", reason: "远端报告存在冲突、保护规则或 base drift。", confirmEffect: "不会自动修复或合并。", riskSummary: "后续阶段再处理 landing rework；当前只记录证据。" };
  }
}

async function writeReadiness(
  memory: ResolvedMemory,
  input: {
    now: string;
    landingPackageId: string;
    prDraftPackageId: string;
    status: RemoteLandingReadinessStatus;
    canMerge: boolean;
    summary: string;
    reason: string;
    confirmEffect: string;
    riskSummary: string;
    prUrl?: string;
    stateSnapshot?: RemoteLandingStateSnapshot;
    evidenceRefs: string[];
  },
): Promise<RemoteLandingReadiness> {
  const id = `remote-landing-${contentHash(`${input.prDraftPackageId}:${input.landingPackageId}:${input.status}:${input.now}`).slice(0, 12)}`;
  const directory = join(remoteLandingRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const stateSnapshot = input.stateSnapshot ?? {
    version: "1.0" as const,
    id: `remote-landing-state-${id.replace(/^remote-landing-/, "")}`,
    prDraftPackageId: input.prDraftPackageId,
    landingPackageId: input.landingPackageId,
    projectId: memory.projectId,
    ...(input.prUrl ? { prUrl: input.prUrl } : {}),
    state: "UNAVAILABLE",
    isDraft: false,
    failedChecksCount: 0,
    commentsCount: 0,
    evidenceRefs: input.evidenceRefs,
    createdAt: input.now,
  };
  const statePath = join(directory, "remote-landing-state.json");
  const readinessPath = join(directory, "remote-landing-readiness.json");
  const summaryPath = join(directory, "remote-landing-summary.md");
  const readiness: RemoteLandingReadiness = {
    version: "1.0",
    id,
    prDraftPackageId: input.prDraftPackageId,
    landingPackageId: input.landingPackageId,
    projectId: memory.projectId,
    status: input.status,
    canMerge: input.canMerge,
    mergeMethod: "squash",
    summary: input.summary,
    reason: input.reason,
    confirmEffect: input.confirmEffect,
    riskSummary: input.riskSummary,
    ...(input.prUrl ? { prUrl: input.prUrl } : {}),
    stateSnapshotArtifact: displayArtifactPath(memory, statePath),
    readinessArtifact: displayArtifactPath(memory, readinessPath),
    summaryArtifact: displayArtifactPath(memory, summaryPath),
    evidenceRefs: Array.from(new Set([...input.evidenceRefs, displayArtifactPath(memory, statePath)])),
    createdAt: input.now,
  };
  stateSnapshotSchema.parse(stateSnapshot);
  readinessSchema.parse(readiness);
  await writeJsonFile(statePath, stateSnapshot);
  await writeJsonFile(readinessPath, readiness);
  await writeFile(summaryPath, renderReadinessSummary(readiness), "utf8");
  return readiness;
}

async function writeResultArtifacts(
  memory: ResolvedMemory,
  directory: string,
  attempt: RemoteLandingAttempt,
  result: RemoteLandingResult,
  summaryText: string,
): Promise<void> {
  attemptSchema.parse(attempt);
  resultSchema.parse(result);
  await writeJsonFile(join(directory, "remote-landing-attempt.json"), attempt);
  await writeJsonFile(join(directory, "remote-landing-result.json"), result);
  await writeFile(join(directory, "remote-landing-result.md"), [
    "# Remote Landing Result",
    "",
    `Status: ${result.status}`,
    result.prUrl ? `PR: ${result.prUrl}` : "PR: unavailable",
    `Method: ${result.mergeMethod}`,
    result.mergeCommit ? `Merge commit: ${result.mergeCommit}` : "",
    "",
    summaryText,
    "",
  ].filter(Boolean).join("\n"), "utf8");
}

function renderReadinessSummary(readiness: RemoteLandingReadiness): string {
  return [
    "# Remote Landing Readiness",
    "",
    `Status: ${readiness.status}`,
    `Can merge: ${readiness.canMerge ? "yes" : "no"}`,
    `Method: ${readiness.mergeMethod}`,
    readiness.prUrl ? `PR: ${readiness.prUrl}` : "PR: unavailable",
    "",
    readiness.summary,
    "",
    `Reason: ${readiness.reason}`,
    `Effect: ${readiness.confirmEffect}`,
    `Risk: ${readiness.riskSummary}`,
    "",
  ].join("\n");
}

async function ghPrMergeState(cwd: string, pr: string): Promise<Record<string, unknown>> {
  const fields = ["url", "state", "isDraft", "reviewDecision", "mergeable", "mergeStateStatus", "headRefName", "baseRefName", "headRefOid", "baseRefOid", "mergedAt", "mergeCommit"];
  const stdout = await commandText(githubCliCommand(), [...githubCliArgs(), "pr", "view", pr, "--json", fields.join(",")], cwd);
  return JSON.parse(stdout) as Record<string, unknown>;
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

function remoteLandingRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "remote-landing");
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  return `${memory.artifactBase === "memory-root" ? "memory://" : "project://"}${relative(memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot, absolutePath).replace(/\\/g, "/")}`;
}

function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}
