import type {
  MaintenanceCanonicalPatchApplicationManifest,
  MaintenanceCanonicalPatchApplicationReport,
  MaintenanceCanonicalPatchApplicationReportOperation,
  MaintenanceCanonicalPatchApplicationResult,
  ResolvedMemory,
} from "../types/index.js";
import { renderMaintenanceMarkdownList } from "./maintenance-markdown.js";
import {
  buildMaintenanceArtifactRefsForStore,
  findMaintenanceArtifactBy,
  listMaintenanceArtifacts,
  readMaintenanceArtifact,
  type MaintenanceArtifactStore,
} from "./maintenance-artifact-store.js";
import {
  returnExistingMaintenanceArtifactWithPolicyLedger,
  writeMaintenanceArtifactWithPolicyLedger,
} from "./maintenance-artifact-lifecycle.js";
import { buildCanonicalPatchApplicationReportArtifactRefs } from "./canonical-patch-application-artifact-refs.js";
import {
  buildReadOnlyCanonicalPatchApplicationObservationAuthority,
  renderCanonicalPatchApplicationReportAuthorityMarkdown,
} from "./canonical-patch-application-authority.js";
import {
  canonicalPatchApplicationManifestStore,
  canonicalPatchApplicationResultStore,
  readMaintenanceCanonicalPatchApplicationManifest,
  readMaintenanceCanonicalPatchApplicationResult,
} from "./canonical-patch-application.js";
import {
  maintenanceCanonicalPatchApplicationReportMarkdownPath,
  maintenanceCanonicalPatchApplicationReportPath,
  maintenanceCanonicalPatchApplicationReportsRoot,
} from "./paths.js";
import { canonicalPatchApplicationReportSchema } from "./schemas.js";
import {
  buildCanonicalPatchApplicationReportOperationFromAppliedOperation,
  validateCanonicalPatchApplicationResultLineage,
} from "./canonical-patch-lineage.js";
import { renderCanonicalPatchObservedOperationMarkdownDetails } from "./canonical-patch-operation-markdown.js";
import { contentHash } from "./utils.js";

const canonicalPatchApplicationReportStore: MaintenanceArtifactStore<MaintenanceCanonicalPatchApplicationReport> = {
  root: maintenanceCanonicalPatchApplicationReportsRoot,
  jsonPath: maintenanceCanonicalPatchApplicationReportPath,
  markdownPath: maintenanceCanonicalPatchApplicationReportMarkdownPath,
  schema: canonicalPatchApplicationReportSchema,
};

export async function generateMaintenanceCanonicalPatchApplicationReport(
  memory: ResolvedMemory,
  applicationResultId: string,
): Promise<MaintenanceCanonicalPatchApplicationReport> {
  const existing = await readMaintenanceCanonicalPatchApplicationReportForResult(memory, applicationResultId);
  if (existing) {
    return returnExistingMaintenanceArtifactWithPolicyLedger(memory, existing, {
      store: canonicalPatchApplicationReportStore,
      id: existing.id,
      eventType: "canonical-patch-application-report",
      summary: existing.summary,
    });
  }

  const result = await readMaintenanceCanonicalPatchApplicationResult(memory, applicationResultId);
  if (!result) throw new Error(`Maintenance canonical patch application result not found: ${applicationResultId}`);
  if (result.status !== "applied") {
    throw new Error(`Maintenance canonical patch application report requires an applied result: ${applicationResultId}`);
  }
  const manifest = await readMaintenanceCanonicalPatchApplicationManifest(memory, result.manifestId);
  if (!manifest) throw new Error(`Maintenance canonical patch application manifest not found for result ${applicationResultId}: ${result.manifestId}`);
  validateCanonicalPatchApplicationResultLineage(result, manifest);

  const report = buildCanonicalPatchApplicationReport(memory, result, manifest);
  return writeMaintenanceArtifactWithPolicyLedger(
    memory,
    {
      store: canonicalPatchApplicationReportStore,
      id: report.id,
      value: report,
      markdown: renderCanonicalPatchApplicationReportMarkdown(report),
      eventType: "canonical-patch-application-report",
      summary: report.summary,
    },
  );
}

export async function readMaintenanceCanonicalPatchApplicationReport(
  memory: ResolvedMemory,
  reportId: string,
): Promise<MaintenanceCanonicalPatchApplicationReport | null> {
  return readMaintenanceArtifact(memory, canonicalPatchApplicationReportStore, reportId);
}

export async function listMaintenanceCanonicalPatchApplicationReports(memory: ResolvedMemory): Promise<MaintenanceCanonicalPatchApplicationReport[]> {
  return listMaintenanceArtifacts(memory, canonicalPatchApplicationReportStore);
}

export async function readMaintenanceCanonicalPatchApplicationReportForResult(
  memory: ResolvedMemory,
  applicationResultId: string,
): Promise<MaintenanceCanonicalPatchApplicationReport | null> {
  return findMaintenanceArtifactBy(memory, canonicalPatchApplicationReportStore, (report) => report.resultId === applicationResultId);
}

export function maintenanceCanonicalPatchApplicationReportArtifactRef(memory: ResolvedMemory, reportId: string): string {
  return buildMaintenanceArtifactRefsForStore(memory, canonicalPatchApplicationReportStore, reportId).artifactRef;
}

function buildCanonicalPatchApplicationReport(
  memory: ResolvedMemory,
  result: MaintenanceCanonicalPatchApplicationResult,
  manifest: MaintenanceCanonicalPatchApplicationManifest,
): MaintenanceCanonicalPatchApplicationReport {
  const id = `canonical-patch-application-report-${contentHash(result.id).slice(0, 12)}`;
  const observedOperations: MaintenanceCanonicalPatchApplicationReportOperation[] = result.appliedOperations.map((operation, index) => buildCanonicalPatchApplicationReportOperationFromAppliedOperation({
    reportId: id,
    index,
    appliedOperation: operation,
  }));
  return {
    version: "1.0",
    id,
    status: "observed",
    resultId: result.id,
    manifestId: result.manifestId,
    patchProposalId: result.patchProposalId,
    gateRecordId: result.gateRecordId,
    proposalId: result.proposalId,
    decisionId: result.decisionId,
    targetKinds: result.targetKinds,
    operationCount: observedOperations.length,
    observedOperations,
    ...buildReadOnlyCanonicalPatchApplicationObservationAuthority(),
    policyAuditRefs: result.policyAuditRefs,
    guardrailNotes: [
      "Observation report generation is read-only for canonical docs and stable memory.",
      "This report does not authorize or trigger another rewrite, review gate, candidate extraction, apply, close, remote, Validation, Audit, IntegrationCheck, or Harness evolution transition.",
      "The observed application result remains the human-gated mutation evidence; this report is a compact post-application summary.",
    ],
    summary: `Observed canonical patch application result ${result.id} for ${observedOperations.length} applied target(s).`,
    artifactRefs: buildCanonicalPatchApplicationReportArtifactRefs(memory, {
      report: { store: canonicalPatchApplicationReportStore, id },
      result: { store: canonicalPatchApplicationResultStore, id: result.id },
      manifest: { store: canonicalPatchApplicationManifestStore, id: manifest.id },
      upstreamRefs: [
        ...result.artifactRefs,
        ...manifest.artifactRefs,
        ...observedOperations.flatMap((operation) => operation.artifactRefs),
      ],
      policyAuditRefs: result.policyAuditRefs,
    }),
    createdAt: new Date().toISOString(),
  };
}

function renderCanonicalPatchApplicationReportMarkdown(report: MaintenanceCanonicalPatchApplicationReport): string {
  return [
    `# ${report.id}`,
    "",
    report.summary,
    "",
    ...renderCanonicalPatchApplicationReportAuthorityMarkdown(),
    "",
    "## Sources",
    "",
    `- Application result: ${report.resultId}`,
    `- Manifest: ${report.manifestId}`,
    `- Patch proposal: ${report.patchProposalId}`,
    `- Gate record: ${report.gateRecordId}`,
    `- Proposal: ${report.proposalId}`,
    `- Decision: ${report.decisionId}`,
    "",
    "## Observed Operations",
    "",
    ...report.observedOperations.flatMap(renderCanonicalPatchObservedOperationMarkdownDetails),
    "",
    "## Guardrails",
    "",
    ...renderMaintenanceMarkdownList(report.guardrailNotes),
    "",
    "## Policy Audit",
    "",
    ...renderMaintenanceMarkdownList(report.policyAuditRefs, { emptyLabel: "none" }),
    "",
    "## Evidence",
    "",
    ...renderMaintenanceMarkdownList(report.artifactRefs),
    "",
  ].join("\n");
}
