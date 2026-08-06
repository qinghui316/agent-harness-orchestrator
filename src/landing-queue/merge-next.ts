import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { requireProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { mergeRemoteLanding } from "../remote-landing/merge.js";
import { prepareRemoteLandingReadiness } from "../remote-landing/readiness.js";
import type {
  LandingQueueCandidate,
  LandingQueueDecision,
  LandingQueueResult,
  LandingQueueSnapshot,
  ManagedProject,
} from "../types/index.js";
import { contentHash, landingQueueRoot } from "./paths.js";
import { writeDecisionResult } from "./repository.js";
import { prepareLandingQueue } from "./service.js";

export async function mergeNextLandingQueueCandidate(
  project: ManagedProject,
  selectedLandingPackageId?: string,
): Promise<{ before: LandingQueueSnapshot; decision: LandingQueueDecision; result: LandingQueueResult; after?: LandingQueueSnapshot }> {
  const memory = await requireProjectExecutionRuntimePort(project);
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

function selectCandidate(snapshot: LandingQueueSnapshot, landingPackageId: string | undefined): LandingQueueCandidate | undefined {
  if (landingPackageId) return snapshot.candidates.find((candidate) => candidate.landingPackageId === landingPackageId && candidate.canMerge);
  return snapshot.candidates.find((candidate) => candidate.canMerge);
}
