import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { listLandingPackages, type LandingReadinessPackage } from "../landing/manager.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { findPrDraftPackageForLanding } from "../pr-draft/manager.js";
import {
  latestMergedRemoteLandingResultForLanding,
  mergeRemoteLanding,
  prepareRemoteLandingReadiness,
} from "../remote-landing/manager.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  LandingQueueCandidate,
  LandingQueueDecision,
  LandingQueueResult,
  LandingQueueSnapshot,
  ManagedProject,
  RemoteLandingReadiness,
  ResolvedMemory,
} from "../types/index.js";

const candidateSchema: z.ZodType<LandingQueueCandidate> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  conversationId: z.string(),
  changeIds: z.array(z.string()),
  landingPackageId: z.string(),
  prDraftPackageId: z.string(),
  prUrl: z.string().optional(),
  status: z.enum(["ready", "ready-with-comments", "needs-attention", "merged"]),
  canMerge: z.boolean(),
  summary: z.string(),
  reason: z.string(),
  confirmEffect: z.string(),
  riskSummary: z.string(),
  readinessId: z.string().optional(),
  readinessStatus: z.enum(["ready", "ready-with-comments", "missing-pr", "provider-unavailable", "draft", "closed", "already-merged", "checks-failed", "actionable-feedback", "stale-pr", "merge-unavailable"]).optional(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const snapshotSchema: z.ZodType<LandingQueueSnapshot> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  status: z.enum(["empty", "ready", "needs-attention"]),
  summary: z.string(),
  readyCount: z.number(),
  needsAttentionCount: z.number(),
  mergedCount: z.number(),
  candidates: z.array(candidateSchema),
  snapshotArtifact: z.string(),
  summaryArtifact: z.string(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
});

const decisionSchema: z.ZodType<LandingQueueDecision> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  snapshotId: z.string(),
  selectedLandingPackageId: z.string().optional(),
  selectedCandidateId: z.string().optional(),
  action: z.enum(["merge-next", "skip", "remove-stale"]),
  status: z.enum(["completed", "failed", "skipped"]),
  reason: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

const resultSchema: z.ZodType<LandingQueueResult> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  decisionId: z.string(),
  beforeSnapshotId: z.string(),
  afterSnapshotId: z.string().optional(),
  selectedCandidateId: z.string().optional(),
  landingPackageId: z.string().optional(),
  remoteLandingResultId: z.string().optional(),
  status: z.enum(["merged", "failed", "skipped"]),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export async function prepareLandingQueue(project: ManagedProject): Promise<LandingQueueSnapshot> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "landing queue");
  const packages = await listLandingPackages(memory);
  const candidates: LandingQueueCandidate[] = [];
  for (const pkg of packages.filter((item) => item.review?.verdict === "ready")) {
    const candidate = await buildCandidate(project, memory, pkg);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort(compareCandidates);
  return writeSnapshot(memory, candidates);
}

export async function refreshLandingQueue(project: ManagedProject): Promise<LandingQueueSnapshot> {
  return prepareLandingQueue(project);
}

export async function mergeNextLandingQueueCandidate(
  project: ManagedProject,
  selectedLandingPackageId?: string,
): Promise<{ before: LandingQueueSnapshot; decision: LandingQueueDecision; result: LandingQueueResult; after?: LandingQueueSnapshot }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "landing queue merge");
  const before = await prepareLandingQueue(project);
  const selected = selectCandidate(before, selectedLandingPackageId);
  const now = new Date().toISOString();
  const decisionId = `landing-queue-decision-${contentHash(`${before.id}:${selectedLandingPackageId ?? "next"}:${now}`).slice(0, 12)}`;
  const directory = join(landingQueueRoot(memory), decisionId);
  await mkdir(directory, { recursive: true });

  if (!selected) {
    const decision: LandingQueueDecision = {
      version: "1.0",
      id: decisionId,
      snapshotId: before.id,
      ...(selectedLandingPackageId ? { selectedLandingPackageId } : {}),
      action: "merge-next",
      status: "skipped",
      reason: "没有可合并的 PR。请先刷新 PR 状态或处理反馈/checks。",
      artifactRefs: [before.summaryArtifact, before.snapshotArtifact],
      createdAt: now,
    };
    const result = await writeDecisionResult(memory, directory, decision, {
      version: "1.0",
      id: `landing-queue-result-${contentHash(`${decision.id}:skipped`).slice(0, 12)}`,
      decisionId: decision.id,
      beforeSnapshotId: before.id,
      status: "skipped",
      summary: decision.reason ?? "No mergeable PR found.",
      artifactRefs: decision.artifactRefs,
      createdAt: now,
    });
    return { before, decision, result };
  }

  const refreshed = await prepareRemoteLandingReadiness(project, selected.landingPackageId);
  if (!refreshed.canMerge) {
    const decision: LandingQueueDecision = {
      version: "1.0",
      id: decisionId,
      snapshotId: before.id,
      selectedLandingPackageId: selected.landingPackageId,
      selectedCandidateId: selected.id,
      action: "merge-next",
      status: "failed",
      reason: refreshed.reason,
      artifactRefs: [before.summaryArtifact, before.snapshotArtifact, refreshed.summaryArtifact],
      createdAt: now,
    };
    const result = await writeDecisionResult(memory, directory, decision, {
      version: "1.0",
      id: `landing-queue-result-${contentHash(`${decision.id}:stale`).slice(0, 12)}`,
      decisionId: decision.id,
      beforeSnapshotId: before.id,
      selectedCandidateId: selected.id,
      landingPackageId: selected.landingPackageId,
      status: "failed",
      summary: `合并前刷新发现 PR 不再可合并：${refreshed.reason}`,
      artifactRefs: decision.artifactRefs,
      createdAt: now,
    });
    return { before, decision, result };
  }

  const merged = await mergeRemoteLanding(project, selected.landingPackageId);
  const after = await prepareLandingQueue(project);
  const finishedAt = new Date().toISOString();
  const status = merged.result.status === "merged" ? "completed" : "failed";
  const decision: LandingQueueDecision = {
    version: "1.0",
    id: decisionId,
    snapshotId: before.id,
    selectedLandingPackageId: selected.landingPackageId,
    selectedCandidateId: selected.id,
    action: "merge-next",
    status,
    reason: merged.result.status === "merged" ? "已合并一个 PR，并刷新剩余队列。" : merged.result.failureReason,
    artifactRefs: [before.summaryArtifact, before.snapshotArtifact, refreshed.summaryArtifact, ...merged.result.artifactRefs, after.summaryArtifact, after.snapshotArtifact],
    createdAt: finishedAt,
  };
  const result = await writeDecisionResult(memory, directory, decision, {
    version: "1.0",
    id: `landing-queue-result-${contentHash(`${decision.id}:${merged.result.status}`).slice(0, 12)}`,
    decisionId: decision.id,
    beforeSnapshotId: before.id,
    afterSnapshotId: after.id,
    selectedCandidateId: selected.id,
    landingPackageId: selected.landingPackageId,
    remoteLandingResultId: merged.result.id,
    status: merged.result.status,
    summary: merged.result.status === "merged"
      ? "已按用户确认合并一个 PR。剩余 PR 已重新刷新，下一次合并仍需用户确认。"
      : `PR 合并失败：${merged.result.failureReason ?? "unknown error"}`,
    artifactRefs: decision.artifactRefs,
    createdAt: finishedAt,
  });
  return { before, decision, result, after };
}

export async function latestLandingQueueSnapshot(memory: ResolvedMemory): Promise<LandingQueueSnapshot | null> {
  const snapshots = await listLandingQueueSnapshots(memory);
  return snapshots[0] ?? null;
}

export async function listLandingQueueSnapshots(memory: ResolvedMemory): Promise<LandingQueueSnapshot[]> {
  const root = landingQueueRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const snapshots: LandingQueueSnapshot[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "landing-queue-snapshot.json");
    if (!existsSync(file)) continue;
    snapshots.push(await readRequiredJsonFile(file, snapshotSchema));
  }
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function buildCandidate(project: ManagedProject, memory: ResolvedMemory, pkg: LandingReadinessPackage): Promise<LandingQueueCandidate | null> {
  const draft = await findPrDraftPackageForLanding(memory, pkg.id);
  if (!draft || draft.status !== "created" || !draft.prUrl) return null;
  const merged = await latestMergedRemoteLandingResultForLanding(memory, pkg.id).catch(() => null);
  if (merged) {
    return {
      version: "1.0",
      id: `landing-queue-candidate-${contentHash(`${pkg.id}:${draft.id}:merged`).slice(0, 12)}`,
      projectId: memory.projectId,
      conversationId: pkg.target.changeIds[0] ?? pkg.id,
      changeIds: pkg.target.changeIds,
      landingPackageId: pkg.id,
      prDraftPackageId: draft.id,
      prUrl: draft.prUrl,
      status: "merged",
      canMerge: false,
      summary: "PR 已合并。",
      reason: "该 PR 已有 merged 远端落地证据。",
      confirmEffect: "不会重复合并。",
      riskSummary: "可以进入合并后同步或分支清理路径。",
      evidenceRefs: merged.artifactRefs,
      createdAt: pkg.reviewedAt ?? pkg.createdAt,
      updatedAt: merged.createdAt,
    };
  }

  const readiness = await prepareRemoteLandingReadiness(project, pkg.id);
  return candidateFromReadiness(memory, pkg, readiness);
}

function candidateFromReadiness(memory: ResolvedMemory, pkg: LandingReadinessPackage, readiness: RemoteLandingReadiness): LandingQueueCandidate {
  const status = readiness.canMerge
    ? readiness.status === "ready-with-comments" ? "ready-with-comments" : "ready"
    : "needs-attention";
  return {
    version: "1.0",
    id: `landing-queue-candidate-${contentHash(`${pkg.id}:${readiness.id}`).slice(0, 12)}`,
    projectId: memory.projectId,
    conversationId: pkg.target.changeIds[0] ?? pkg.id,
    changeIds: pkg.target.changeIds,
    landingPackageId: pkg.id,
    prDraftPackageId: readiness.prDraftPackageId,
    ...(readiness.prUrl ? { prUrl: readiness.prUrl } : {}),
    status,
    canMerge: readiness.canMerge,
    summary: readiness.summary,
    reason: readiness.reason,
    confirmEffect: readiness.confirmEffect,
    riskSummary: readiness.riskSummary,
    readinessId: readiness.id,
    readinessStatus: readiness.status,
    evidenceRefs: readiness.evidenceRefs,
    createdAt: pkg.reviewedAt ?? pkg.createdAt,
    updatedAt: readiness.createdAt,
  };
}

function selectCandidate(snapshot: LandingQueueSnapshot, landingPackageId: string | undefined): LandingQueueCandidate | undefined {
  if (landingPackageId) return snapshot.candidates.find((candidate) => candidate.landingPackageId === landingPackageId && candidate.canMerge);
  return snapshot.candidates.find((candidate) => candidate.canMerge);
}

async function writeSnapshot(memory: ResolvedMemory, candidates: LandingQueueCandidate[]): Promise<LandingQueueSnapshot> {
  const now = new Date().toISOString();
  const readyCount = candidates.filter((candidate) => candidate.canMerge).length;
  const needsAttentionCount = candidates.filter((candidate) => candidate.status === "needs-attention").length;
  const mergedCount = candidates.filter((candidate) => candidate.status === "merged").length;
  const status = readyCount > 0 ? "ready" : needsAttentionCount > 0 ? "needs-attention" : "empty";
  const id = `landing-queue-${contentHash(`${now}:${candidates.map((candidate) => `${candidate.id}:${candidate.updatedAt}`).join("|")}`).slice(0, 12)}`;
  const directory = join(landingQueueRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const snapshotPath = join(directory, "landing-queue-snapshot.json");
  const summaryPath = join(directory, "landing-queue-summary.md");
  const snapshot: LandingQueueSnapshot = {
    version: "1.0",
    id,
    projectId: memory.projectId,
    status,
    summary: summaryForQueue(readyCount, needsAttentionCount, mergedCount),
    readyCount,
    needsAttentionCount,
    mergedCount,
    candidates,
    snapshotArtifact: displayArtifactPath(memory, snapshotPath),
    summaryArtifact: displayArtifactPath(memory, summaryPath),
    evidenceRefs: Array.from(new Set(candidates.flatMap((candidate) => candidate.evidenceRefs))),
    createdAt: now,
  };
  snapshotSchema.parse(snapshot);
  await writeJsonFile(snapshotPath, snapshot);
  await writeFile(summaryPath, renderSnapshotSummary(snapshot), "utf8");
  return snapshot;
}

async function writeDecisionResult(
  memory: ResolvedMemory,
  directory: string,
  decision: LandingQueueDecision,
  result: LandingQueueResult,
): Promise<LandingQueueResult> {
  decisionSchema.parse(decision);
  resultSchema.parse(result);
  await writeJsonFile(join(directory, "landing-queue-decision.json"), decision);
  await writeJsonFile(join(directory, "landing-queue-result.json"), result);
  await writeFile(join(directory, "landing-queue-result.md"), [
    "# Landing Queue Result",
    "",
    `Status: ${result.status}`,
    result.landingPackageId ? `Landing package: ${result.landingPackageId}` : "",
    result.remoteLandingResultId ? `Remote landing result: ${result.remoteLandingResultId}` : "",
    "",
    result.summary,
    "",
  ].filter(Boolean).join("\n"), "utf8");
  return result;
}

function compareCandidates(a: LandingQueueCandidate, b: LandingQueueCandidate): number {
  const rank = (candidate: LandingQueueCandidate): number => candidate.canMerge ? 0 : candidate.status === "needs-attention" ? 1 : 2;
  const rankDelta = rank(a) - rank(b);
  if (rankDelta !== 0) return rankDelta;
  return a.createdAt.localeCompare(b.createdAt) || a.landingPackageId.localeCompare(b.landingPackageId);
}

function summaryForQueue(readyCount: number, needsAttentionCount: number, mergedCount: number): string {
  if (readyCount > 0) return `${readyCount} 个 PR 可以逐个确认合并，${needsAttentionCount} 个需要先处理。`;
  if (needsAttentionCount > 0) return `${needsAttentionCount} 个 PR 需要先处理反馈、checks 或 provider 状态。`;
  if (mergedCount > 0) return "当前 PR 都已有合并结果，可继续合并后收尾。";
  return "当前没有可进入远端合并队列的 PR。";
}

function renderSnapshotSummary(snapshot: LandingQueueSnapshot): string {
  return [
    "# Landing Queue Snapshot",
    "",
    `Status: ${snapshot.status}`,
    `Ready: ${snapshot.readyCount}`,
    `Needs attention: ${snapshot.needsAttentionCount}`,
    `Merged: ${snapshot.mergedCount}`,
    "",
    snapshot.summary,
    "",
    "## Candidates",
    "",
    ...snapshot.candidates.map((candidate) => [
      `- ${candidate.landingPackageId}`,
      `  - status: ${candidate.status}`,
      `  - PR: ${candidate.prUrl ?? "unavailable"}`,
      `  - reason: ${candidate.reason}`,
    ].join("\n")),
    "",
  ].join("\n");
}

function landingQueueRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "landing-queue");
}

function displayArtifactPath(memory: ResolvedMemory, file: string): string {
  return `project://${relative(memory.memoryRoot, file).replace(/\\/g, "/")}`;
}

function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
