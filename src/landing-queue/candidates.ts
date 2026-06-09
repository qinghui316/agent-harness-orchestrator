import { listLandingPackages } from "../landing/repository.js";
import type { LandingReadinessPackage } from "../landing/types.js";
import { findPrDraftPackageForLanding } from "../pr-draft/repository.js";
import { latestMergedRemoteLandingResultForLanding } from "../remote-landing/repository.js";
import { prepareRemoteLandingReadiness } from "../remote-landing/readiness.js";
import type {
  LandingQueueCandidate,
  ManagedProject,
  RemoteLandingReadiness,
  ResolvedMemory,
} from "../types/index.js";
import { contentHash } from "./paths.js";

export async function collectLandingQueueCandidates(project: ManagedProject, memory: ResolvedMemory): Promise<LandingQueueCandidate[]> {
  const packages = await listLandingPackages(memory);
  const candidates: LandingQueueCandidate[] = [];
  for (const pkg of packages.filter((item) => item.review?.verdict === "ready")) {
    const candidate = await buildCandidate(project, memory, pkg);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort(compareCandidates);
}

export async function buildCandidate(project: ManagedProject, memory: ResolvedMemory, pkg: LandingReadinessPackage): Promise<LandingQueueCandidate | null> {
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

export function candidateFromReadiness(memory: ResolvedMemory, pkg: LandingReadinessPackage, readiness: RemoteLandingReadiness): LandingQueueCandidate {
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

export function compareCandidates(a: LandingQueueCandidate, b: LandingQueueCandidate): number {
  const rank = (candidate: LandingQueueCandidate): number => candidate.canMerge ? 0 : candidate.status === "needs-attention" ? 1 : 2;
  const rankDelta = rank(a) - rank(b);
  if (rankDelta !== 0) return rankDelta;
  return a.createdAt.localeCompare(b.createdAt) || a.landingPackageId.localeCompare(b.landingPackageId);
}
