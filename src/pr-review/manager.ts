import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import {
  detectRemoteProviderCapability,
  findLatestCreatedPrDraftPackageForChanges,
  findPrDraftPackageForLanding,
  githubCliArgs,
  githubCliCommand,
} from "../pr-draft/manager.js";
import { refreshPrFeedback } from "../pr-feedback/manager.js";
import { readLandingPackage } from "../landing/manager.js";
import type {
  ManagedProject,
  PrFeedbackClassification,
  PrReviewHandoff,
  PrReviewReadiness,
  PrReviewReadinessStatus,
  PrReviewStateSnapshot,
  ResolvedMemory,
} from "../types/index.js";

const execFileAsync = promisify(execFile);

const stateSnapshotSchema: z.ZodType<PrReviewStateSnapshot> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  prUrl: z.string().optional(),
  state: z.string(),
  isDraft: z.boolean(),
  reviewDecision: z.string().nullable().optional(),
  feedbackClassification: z.enum(["no-action", "checks-failed", "changes-requested", "comments-only", "provider-unavailable", "stale-pr"]).optional(),
  commentsCount: z.number(),
  failedChecksCount: z.number(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
});

const readinessSchema: z.ZodType<PrReviewReadiness> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  status: z.enum(["ready", "ready-with-comments", "already-ready", "missing-pr", "provider-unavailable", "actionable-feedback", "checks-failed", "stale-pr"]),
  canSubmit: z.boolean(),
  summary: z.string(),
  reason: z.string(),
  confirmEffect: z.string(),
  riskSummary: z.string(),
  prUrl: z.string().optional(),
  stateSnapshotArtifact: z.string(),
  readinessArtifact: z.string(),
  summaryArtifact: z.string(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
});

const handoffSchema: z.ZodType<PrReviewHandoff> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  readinessId: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  prUrl: z.string().optional(),
  status: z.literal("submitted"),
  artifactRefs: z.array(z.string()),
  submittedAt: z.string(),
});

export async function preparePrReviewReadiness(project: ManagedProject, landingPackageId: string): Promise<PrReviewReadiness> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "PR review readiness");
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
      canSubmit: false,
      summary: "还没有可提交人工评审的 Draft PR。",
      reason: "需要先创建 Draft PR。",
      confirmEffect: "不会执行远端操作。",
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
      canSubmit: false,
      summary: capability.reason ?? "远端 PR provider 不可用。",
      reason: capability.setupHint,
      confirmEffect: "不会提交人工评审。",
      riskSummary: "Provider ready 前不会显示提交人工评审按钮。",
      evidenceRefs: [pkg.packageArtifact, ...landing.artifactRefs],
    });
  }

  const feedback = await refreshPrFeedback(project, landingPackageId);
  const snapshot: PrReviewStateSnapshot = {
    version: "1.0",
    id: `pr-review-state-${contentHash(`${feedback.snapshot.id}:${now}`).slice(0, 12)}`,
    prDraftPackageId: feedback.snapshot.prDraftPackageId,
    landingPackageId,
    projectId: memory.projectId,
    ...(feedback.snapshot.prUrl ? { prUrl: feedback.snapshot.prUrl } : {}),
    state: feedback.snapshot.state,
    isDraft: feedback.snapshot.isDraft,
    reviewDecision: feedback.snapshot.reviewDecision,
    feedbackClassification: feedback.summary.classification,
    commentsCount: feedback.summary.commentsCount,
    failedChecksCount: feedback.summary.failedChecksCount,
    evidenceRefs: feedback.summary.evidenceRefs,
    createdAt: now,
  };
  const status = classifyReadiness(snapshot.feedbackClassification, snapshot.state, snapshot.isDraft, snapshot.failedChecksCount);
  const text = readinessText(status, snapshot.commentsCount);
  return writeReadiness(memory, {
    now,
    landingPackageId,
    prDraftPackageId: feedback.snapshot.prDraftPackageId,
    prUrl: snapshot.prUrl,
    status,
    canSubmit: status === "ready" || status === "ready-with-comments",
    summary: text.summary,
    reason: text.reason,
    confirmEffect: text.confirmEffect,
    riskSummary: text.riskSummary,
    stateSnapshot: snapshot,
    evidenceRefs: [feedback.summary.evidenceRefs[0], ...feedback.summary.evidenceRefs.slice(1), pkg.packageArtifact, ...landing.artifactRefs],
  });
}

export async function submitPrForHumanReview(project: ManagedProject, landingPackageId: string): Promise<{ readiness: PrReviewReadiness; handoff: PrReviewHandoff }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "PR review handoff");
  const submitReadiness = await preparePrReviewReadiness(project, landingPackageId);
  if (!submitReadiness.canSubmit || !submitReadiness.prUrl) {
    throw new Error(`Cannot submit PR for review: ${submitReadiness.reason}`);
  }
  await commandText(githubCliCommand(), [...githubCliArgs(), "pr", "ready", submitReadiness.prUrl], project.path);
  const readiness = await preparePrReviewReadiness(project, landingPackageId).catch(() => submitReadiness);
  const now = new Date().toISOString();
  const id = `pr-review-handoff-${contentHash(`${submitReadiness.id}:${now}`).slice(0, 12)}`;
  const directory = join(prReviewRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const handoff: PrReviewHandoff = {
    version: "1.0",
    id,
    readinessId: submitReadiness.id,
    prDraftPackageId: submitReadiness.prDraftPackageId,
    landingPackageId,
    projectId: memory.projectId,
    prUrl: submitReadiness.prUrl,
    status: "submitted",
    artifactRefs: Array.from(new Set([
      submitReadiness.summaryArtifact,
      submitReadiness.readinessArtifact,
      submitReadiness.stateSnapshotArtifact,
      readiness.summaryArtifact,
      readiness.readinessArtifact,
      readiness.stateSnapshotArtifact,
    ])),
    submittedAt: now,
  };
  handoffSchema.parse(handoff);
  await writeJsonFile(join(directory, "pr-review-handoff.json"), handoff);
  return { readiness, handoff };
}

export async function refreshPrReviewState(project: ManagedProject, landingPackageId: string): Promise<PrReviewReadiness> {
  return preparePrReviewReadiness(project, landingPackageId);
}

export async function latestPrReviewReadinessForDraft(memory: ResolvedMemory, prDraftPackageId: string): Promise<PrReviewReadiness | null> {
  return (await listPrReviewReadiness(memory)).find((item) => item.prDraftPackageId === prDraftPackageId) ?? null;
}

export async function listPrReviewReadiness(memory: ResolvedMemory): Promise<PrReviewReadiness[]> {
  const root = prReviewRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const items: PrReviewReadiness[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "pr-review-readiness.json");
    if (!existsSync(file)) continue;
    items.push(await readRequiredJsonFile(file, readinessSchema));
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function classifyReadiness(
  classification: PrFeedbackClassification | undefined,
  state: string,
  isDraft: boolean,
  failedChecksCount: number,
): PrReviewReadinessStatus {
  if (state !== "OPEN") return "stale-pr";
  if (!isDraft) return "already-ready";
  if (failedChecksCount > 0 || classification === "checks-failed") return "checks-failed";
  if (classification === "changes-requested") return "actionable-feedback";
  if (classification === "stale-pr" || classification === "provider-unavailable") return classification;
  if (classification === "comments-only") return "ready-with-comments";
  return "ready";
}

function readinessText(status: PrReviewReadinessStatus, commentsCount: number): Pick<PrReviewReadiness, "summary" | "reason" | "confirmEffect" | "riskSummary"> {
  switch (status) {
    case "ready":
      return {
        summary: "Draft PR 已准备好提交人工评审。",
        reason: "远端检查和反馈没有发现必须先修改的问题。",
        confirmEffect: "会将 Draft PR 标记为 Ready for Review；不会 merge、land 或启用自动合并。",
        riskSummary: "提交后进入人工评审，后续反馈仍回到当前需求对话处理。",
      };
    case "ready-with-comments":
      return {
        summary: "Draft PR 有普通评论，但没有必须自动修改的反馈。",
        reason: `检测到 ${commentsCount} 条普通评论；需要你确认是否仍提交人工评审。`,
        confirmEffect: "会将 Draft PR 标记为 Ready for Review；不会回复或解决评论。",
        riskSummary: "普通评论可能仍需要人工判断；后续反馈可通过检查 PR 反馈处理。",
      };
    case "already-ready":
      return {
        summary: "PR 已经提交人工评审。",
        reason: "远端 PR 当前不是 Draft 状态。",
        confirmEffect: "无需重复提交；可以继续检查 PR 反馈。",
        riskSummary: "这不是 merge 或 land。",
      };
    case "checks-failed":
      return {
        summary: "远端检查失败，需要先修改。",
        reason: "不能把明显失败的 Draft PR 提交人工评审。",
        confirmEffect: "请先根据 PR 反馈修改。",
        riskSummary: "提交人工评审按钮会被隐藏。",
      };
    case "actionable-feedback":
      return {
        summary: "PR review 要求修改。",
        reason: "存在 actionable feedback，需要先在同一需求中重新处理。",
        confirmEffect: "请先根据 PR 反馈修改。",
        riskSummary: "提交人工评审按钮会被隐藏。",
      };
    case "provider-unavailable":
      return {
        summary: "远端 PR provider 不可用。",
        reason: "无法确认 PR 状态。",
        confirmEffect: "不会执行远端操作。",
        riskSummary: "请先配置 GitHub CLI / remote / auth。",
      };
    case "missing-pr":
      return {
        summary: "还没有 Draft PR。",
        reason: "需要先创建 Draft PR。",
        confirmEffect: "不会执行远端操作。",
        riskSummary: "AHO 不会伪造 PR 状态。",
      };
    case "stale-pr":
      return {
        summary: "PR 当前状态不适合提交人工评审。",
        reason: "PR 可能已关闭、合并或远端状态已变化。",
        confirmEffect: "请刷新 PR 状态或回到当前需求处理。",
        riskSummary: "不会执行 ready-for-review。",
      };
  }
}

async function writeReadiness(
  memory: ResolvedMemory,
  input: {
    now: string;
    landingPackageId: string;
    prDraftPackageId: string;
    status: PrReviewReadinessStatus;
    canSubmit: boolean;
    summary: string;
    reason: string;
    confirmEffect: string;
    riskSummary: string;
    prUrl?: string;
    stateSnapshot?: PrReviewStateSnapshot;
    evidenceRefs: string[];
  },
): Promise<PrReviewReadiness> {
  const id = `pr-review-${contentHash(`${input.prDraftPackageId}:${input.landingPackageId}:${input.status}:${input.now}`).slice(0, 12)}`;
  const directory = join(prReviewRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const stateSnapshot = input.stateSnapshot ?? {
    version: "1.0" as const,
    id: `pr-review-state-${id.replace(/^pr-review-/, "")}`,
    prDraftPackageId: input.prDraftPackageId,
    landingPackageId: input.landingPackageId,
    projectId: memory.projectId,
    ...(input.prUrl ? { prUrl: input.prUrl } : {}),
    state: "UNAVAILABLE",
    isDraft: false,
    commentsCount: 0,
    failedChecksCount: 0,
    evidenceRefs: input.evidenceRefs,
    createdAt: input.now,
  };
  const stateSnapshotPath = join(directory, "pr-review-state.json");
  const readinessPath = join(directory, "pr-review-readiness.json");
  const summaryPath = join(directory, "pr-review-summary.md");
  const readiness: PrReviewReadiness = {
    version: "1.0",
    id,
    prDraftPackageId: input.prDraftPackageId,
    landingPackageId: input.landingPackageId,
    projectId: memory.projectId,
    status: input.status,
    canSubmit: input.canSubmit,
    summary: input.summary,
    reason: input.reason,
    confirmEffect: input.confirmEffect,
    riskSummary: input.riskSummary,
    ...(input.prUrl ? { prUrl: input.prUrl } : {}),
    stateSnapshotArtifact: displayArtifactPath(memory, stateSnapshotPath),
    readinessArtifact: displayArtifactPath(memory, readinessPath),
    summaryArtifact: displayArtifactPath(memory, summaryPath),
    evidenceRefs: Array.from(new Set([...input.evidenceRefs, displayArtifactPath(memory, stateSnapshotPath)])),
    createdAt: input.now,
  };
  stateSnapshotSchema.parse(stateSnapshot);
  readinessSchema.parse(readiness);
  await writeJsonFile(stateSnapshotPath, stateSnapshot);
  await writeJsonFile(readinessPath, readiness);
  await writeFile(summaryPath, renderReadinessSummary(readiness), "utf8");
  return readiness;
}

function renderReadinessSummary(readiness: PrReviewReadiness): string {
  return [
    "# PR Review Readiness",
    "",
    `Status: ${readiness.status}`,
    `Can submit: ${readiness.canSubmit ? "yes" : "no"}`,
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

async function commandText(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

function prReviewRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "pr-review");
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  return `${memory.artifactBase === "memory-root" ? "memory://" : "project://"}${relative(memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot, absolutePath).replace(/\\/g, "/")}`;
}

function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}
