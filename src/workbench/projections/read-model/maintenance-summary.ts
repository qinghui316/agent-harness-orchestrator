import { listDemandMemoryCloseouts, listMaintenanceCandidateResolutions, listMaintenanceCanonicalPatchApplicationManifests, listMaintenanceCanonicalPatchProposals, listMaintenanceCanonicalUpdateProposals, listMaintenanceLedgerEntries, readMaintenanceReviewWatermark } from "../../../agent-task/manager.js";
import type { DemandMemoryCloseout, MaintenanceCandidateResolution, MaintenanceCanonicalPatchApplicationManifest, MaintenanceCanonicalPatchProposal, MaintenanceCanonicalUpdateProposal, MaintenanceLedgerEntry, ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchMaintenanceSummary } from "../../read-model-types.js";

export async function buildMaintenanceSummary(memory: ResolvedMemory): Promise<WorkbenchMaintenanceSummary> {
  const entries = await listMaintenanceLedgerEntries(memory).catch(() => []);
  const closeouts = await listDemandMemoryCloseouts(memory).catch(() => []);
  const resolutions = await listMaintenanceCandidateResolutions(memory).catch(() => []);
  const proposals = await listMaintenanceCanonicalUpdateProposals(memory).catch(() => []);
  const patchProposals = await listMaintenanceCanonicalPatchProposals(memory).catch(() => []);
  const applicationManifests = await listMaintenanceCanonicalPatchApplicationManifests(memory).catch(() => []);
  const watermark = await readMaintenanceReviewWatermark(memory).catch(() => null);
  const latest = latestMaintenanceEntry(entries);
  const reviewed = new Set(watermark?.lastReviewedChangeIds ?? []);
  const unreviewed = closeouts.filter((closeout) => !reviewed.has(`${closeout.changeId}:${closeout.terminalKind}`)).length;
  const latestCloseout = latestCloseoutEntry(closeouts);
  const latestResolution = latestResolutionEntry(resolutions);
  const latestProposal = latestCanonicalUpdateProposal(proposals);
  const latestPatchProposal = latestCanonicalPatchProposal(patchProposals);
  const latestApplicationManifest = latestCanonicalPatchApplicationManifest(applicationManifests);
  const status: WorkbenchMaintenanceSummary["status"] = unreviewed >= 5
    ? "review-ready"
    : watermark?.lastReviewWindowId
      ? "reviewed"
      : entries.length > 0 || closeouts.length > 0
        ? "collecting"
        : "idle";
  return {
    ledgerCount: entries.length,
    closeoutCount: closeouts.length,
    resolutionCount: resolutions.length,
    proposalCount: proposals.length,
    patchProposalCount: patchProposals.length,
    applicationManifestCount: applicationManifests.length,
    latestReviewWindowId: watermark?.lastReviewWindowId ?? undefined,
    unreviewedTerminalCount: unreviewed,
    latestPatchProposal: latestPatchProposal ? {
      id: latestPatchProposal.id,
      status: latestPatchProposal.status,
      proposalId: latestPatchProposal.proposalId,
      decisionId: latestPatchProposal.decisionId,
      targetKinds: latestPatchProposal.targetKinds,
      operationCount: latestPatchProposal.operationCount,
      applicationAuthorized: latestPatchProposal.applicationAuthorized,
      canonicalUpdateAuthorized: latestPatchProposal.canonicalUpdateAuthorized,
      summary: latestPatchProposal.summary,
      createdAt: latestPatchProposal.createdAt,
    } : undefined,
    latestApplicationManifest: latestApplicationManifest ? {
      id: latestApplicationManifest.id,
      status: latestApplicationManifest.status,
      applicationStatus: latestApplicationManifest.applicationStatus,
      patchProposalId: latestApplicationManifest.patchProposalId,
      gateRecordId: latestApplicationManifest.gateRecordId,
      targetKinds: latestApplicationManifest.targetKinds,
      operationCount: latestApplicationManifest.operationCount,
      blockedReasons: latestApplicationManifest.blockedReasons,
      canonicalPatchApplied: latestApplicationManifest.canonicalPatchApplied,
      summary: latestApplicationManifest.summary,
      createdAt: latestApplicationManifest.createdAt,
    } : undefined,
    latestProposal: latestProposal ? {
      id: latestProposal.id,
      status: latestProposal.status,
      targetKinds: latestProposal.targetKinds,
      resolutionCount: latestProposal.resolutionIds.length,
      humanGateRequired: latestProposal.humanGateRequired,
      canonicalUpdateAuthorized: latestProposal.canonicalUpdateAuthorized,
      summary: latestProposal.summary,
      createdAt: latestProposal.createdAt,
    } : undefined,
    latestResolution: latestResolution ? {
      candidateId: latestResolution.candidateId,
      outcome: latestResolution.outcome,
      candidateSubtype: latestResolution.candidateSubtype,
      reviewRecommendation: latestResolution.reviewRecommendation,
      canonicalUpdateRequired: latestResolution.canonicalUpdateRequired,
      humanGateRequired: latestResolution.humanGateRequired,
      rationale: latestResolution.rationale,
      createdAt: latestResolution.createdAt,
    } : undefined,
    latest: latest ? {
      id: latest.id,
      eventType: latest.eventType,
      changeId: latest.changeId,
      summary: latest.summary,
      severity: "info",
      createdAt: latest.createdAt,
    } : latestCloseout ? {
      id: latestCloseout.id,
      eventType: "change-closeout",
      changeId: latestCloseout.changeId,
      summary: latestCloseout.finalResult,
      severity: "info",
      createdAt: latestCloseout.createdAt,
    } : undefined,
    status,
    note: status === "reviewed"
      ? "后台维护已生成独立审查和候选生命周期决议。维护结果只在项目维护中查看，不进入当前需求确认队列。"
      : unreviewed >= 5
        ? "后台维护已有 5 个终态需求可审查。系统会生成候选、评分和审查，不会静默改写项目文档或稳定记忆。"
        : closeouts.length > 0 || entries.length > 0
          ? "后台会自动整理需求记忆、候选和索引；维护项不进入当前需求确认队列。"
          : "尚无后台维护证据。归档、应用、失败和用户反馈会自动进入维护证据账本。",
  };
}

export function latestMaintenanceEntry(entries: MaintenanceLedgerEntry[]): MaintenanceLedgerEntry | undefined {
  return entries.filter((entry) => entry.eventType !== "canonical-update-proposal").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function latestCloseoutEntry(closeouts: DemandMemoryCloseout[]): DemandMemoryCloseout | undefined {
  return [...closeouts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function latestResolutionEntry(resolutions: MaintenanceCandidateResolution[]): MaintenanceCandidateResolution | undefined {
  return [...resolutions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function latestCanonicalUpdateProposal(proposals: MaintenanceCanonicalUpdateProposal[]): MaintenanceCanonicalUpdateProposal | undefined {
  return [...proposals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function latestCanonicalPatchProposal(patchProposals: MaintenanceCanonicalPatchProposal[]): MaintenanceCanonicalPatchProposal | undefined {
  return [...patchProposals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function latestCanonicalPatchApplicationManifest(
  manifests: MaintenanceCanonicalPatchApplicationManifest[],
): MaintenanceCanonicalPatchApplicationManifest | undefined {
  return [...manifests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
