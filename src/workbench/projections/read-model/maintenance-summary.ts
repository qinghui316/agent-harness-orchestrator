import { listDemandMemoryCloseouts, listMaintenanceCandidateResolutions, listMaintenanceCanonicalPatchApplicationManifests, listMaintenanceCanonicalPatchApplicationReports, listMaintenanceCanonicalPatchApplicationResults, listMaintenanceCanonicalPatchProposals, listMaintenanceCanonicalUpdateProposals, listMaintenanceLedgerEntries, readMaintenanceReviewWatermark } from "../../../agent-task/manager.js";
import { closeoutReviewKey } from "../../../agent-task/closeout-review-identity.js";
import type { DemandMemoryCloseout, MaintenanceCandidateResolution, MaintenanceCanonicalPatchApplicationManifest, MaintenanceCanonicalPatchApplicationReport, MaintenanceCanonicalPatchApplicationResult, MaintenanceCanonicalPatchProposal, MaintenanceCanonicalUpdateProposal, MaintenanceLedgerEntry, ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchMaintenanceSummary } from "../../read-model-types.js";
import { latestByCreatedAt, projectFields } from "./projection-summary.js";

const PATCH_PROPOSAL_SUMMARY_FIELDS = [
  "id",
  "status",
  "proposalId",
  "decisionId",
  "targetKinds",
  "operationCount",
  "applicationAuthorized",
  "canonicalUpdateAuthorized",
  "summary",
  "createdAt",
] as const;

const APPLICATION_MANIFEST_SUMMARY_FIELDS = [
  "id",
  "status",
  "applicationStatus",
  "patchProposalId",
  "gateRecordId",
  "targetKinds",
  "operationCount",
  "blockedReasons",
  "canonicalPatchApplied",
  "summary",
  "createdAt",
] as const;

const APPLICATION_RESULT_SUMMARY_FIELDS = [
  "id",
  "status",
  "manifestId",
  "patchProposalId",
  "gateRecordId",
  "targetKinds",
  "operationCount",
  "canonicalPatchApplied",
  "summary",
  "createdAt",
] as const;

const APPLICATION_REPORT_SUMMARY_FIELDS = [
  "id",
  "status",
  "resultId",
  "manifestId",
  "patchProposalId",
  "gateRecordId",
  "targetKinds",
  "operationCount",
  "canonicalPatchApplied",
  "summary",
  "createdAt",
] as const;

export async function buildMaintenanceSummary(memory: ResolvedMemory): Promise<WorkbenchMaintenanceSummary> {
  const entries = await listMaintenanceLedgerEntries(memory).catch(() => []);
  const closeouts = await listDemandMemoryCloseouts(memory).catch(() => []);
  const resolutions = await listMaintenanceCandidateResolutions(memory).catch(() => []);
  const proposals = await listMaintenanceCanonicalUpdateProposals(memory).catch(() => []);
  const patchProposals = await listMaintenanceCanonicalPatchProposals(memory).catch(() => []);
  const applicationManifests = await listMaintenanceCanonicalPatchApplicationManifests(memory).catch(() => []);
  const applicationResults = await listMaintenanceCanonicalPatchApplicationResults(memory).catch(() => []);
  const applicationReports = await listMaintenanceCanonicalPatchApplicationReports(memory).catch(() => []);
  const watermark = await readMaintenanceReviewWatermark(memory).catch(() => null);
  const latest = latestMaintenanceEntry(entries);
  const reviewed = new Set(watermark?.lastReviewedChangeIds ?? []);
  const unreviewed = closeouts.filter((closeout) => !reviewed.has(closeoutReviewKey(closeout))).length;
  const latestCloseout = latestCloseoutEntry(closeouts);
  const latestResolution = latestResolutionEntry(resolutions);
  const latestProposal = latestCanonicalUpdateProposal(proposals);
  const latestPatchProposal = latestCanonicalPatchProposal(patchProposals);
  const latestApplicationManifest = latestCanonicalPatchApplicationManifest(applicationManifests);
  const latestApplicationResult = latestCanonicalPatchApplicationResult(applicationResults);
  const latestApplicationReport = latestCanonicalPatchApplicationReport(applicationReports);
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
    applicationResultCount: applicationResults.length,
    applicationReportCount: applicationReports.length,
    latestReviewWindowId: watermark?.lastReviewWindowId ?? undefined,
    unreviewedTerminalCount: unreviewed,
    latestPatchProposal: projectFields(latestPatchProposal, PATCH_PROPOSAL_SUMMARY_FIELDS),
    latestApplicationManifest: projectFields(latestApplicationManifest, APPLICATION_MANIFEST_SUMMARY_FIELDS),
    latestApplicationResult: projectFields(latestApplicationResult, APPLICATION_RESULT_SUMMARY_FIELDS),
    latestApplicationReport: projectFields(latestApplicationReport, APPLICATION_REPORT_SUMMARY_FIELDS),
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
  return latestByCreatedAt(entries.filter((entry) => entry.eventType !== "canonical-update-proposal"));
}

export function latestCloseoutEntry(closeouts: DemandMemoryCloseout[]): DemandMemoryCloseout | undefined {
  return latestByCreatedAt(closeouts);
}

export function latestResolutionEntry(resolutions: MaintenanceCandidateResolution[]): MaintenanceCandidateResolution | undefined {
  return latestByCreatedAt(resolutions);
}

export function latestCanonicalUpdateProposal(proposals: MaintenanceCanonicalUpdateProposal[]): MaintenanceCanonicalUpdateProposal | undefined {
  return latestByCreatedAt(proposals);
}

export function latestCanonicalPatchProposal(patchProposals: MaintenanceCanonicalPatchProposal[]): MaintenanceCanonicalPatchProposal | undefined {
  return latestByCreatedAt(patchProposals);
}

export function latestCanonicalPatchApplicationManifest(
  manifests: MaintenanceCanonicalPatchApplicationManifest[],
): MaintenanceCanonicalPatchApplicationManifest | undefined {
  return latestByCreatedAt(manifests);
}

export function latestCanonicalPatchApplicationResult(
  results: MaintenanceCanonicalPatchApplicationResult[],
): MaintenanceCanonicalPatchApplicationResult | undefined {
  return latestByCreatedAt(results);
}

export function latestCanonicalPatchApplicationReport(
  reports: MaintenanceCanonicalPatchApplicationReport[],
): MaintenanceCanonicalPatchApplicationReport | undefined {
  return latestByCreatedAt(reports);
}
