import type {
  MaintenanceCanonicalPatchApplicationManifest,
  MaintenanceCanonicalPatchApplicationReport,
  MaintenanceCanonicalPatchApplicationReportOperation,
  MaintenanceCanonicalPatchApplicationResult,
  ResolvedMemory,
} from "../types/index.js";
import { ensureMaintenanceLedgerEntryForStoreArtifact } from "./ledger.js";
import { renderMaintenanceMarkdownList } from "./maintenance-markdown.js";
import {
  buildMaintenanceArtifactRefListForStores,
  buildMaintenanceArtifactRefsForStore,
  findMaintenanceArtifactBy,
  listMaintenanceArtifacts,
  readMaintenanceArtifact,
  writeMaintenanceJsonMarkdownArtifact,
  type MaintenanceArtifactStore,
} from "./maintenance-artifact-store.js";
import { buildReadOnlyCanonicalPatchApplicationObservationAuthority } from "./canonical-patch-application-authority.js";
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
  buildCanonicalPatchDerivedOperationId,
  copyCanonicalPatchAppliedOperationLineage,
  validateCanonicalPatchApplicationResultLineage,
} from "./canonical-patch-lineage.js";
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
    await ensureCanonicalPatchApplicationReportLedgerEntry(memory, existing);
    return existing;
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
  canonicalPatchApplicationReportSchema.parse(report);
  await writeMaintenanceJsonMarkdownArtifact(
    memory,
    canonicalPatchApplicationReportStore,
    report.id,
    report,
    renderCanonicalPatchApplicationReportMarkdown(report),
  );
  await ensureCanonicalPatchApplicationReportLedgerEntry(memory, report);
  return report;
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
  const observedOperations: MaintenanceCanonicalPatchApplicationReportOperation[] = result.appliedOperations.map((operation, index) => {
    const lineage = copyCanonicalPatchAppliedOperationLineage(operation);
    return {
      id: buildCanonicalPatchDerivedOperationId(id, index),
      resultOperationId: lineage.resultOperationId,
      manifestOperationId: lineage.manifestOperationId,
      patchOperationId: lineage.patchOperationId,
      targetKind: lineage.targetKind,
      operation: lineage.operation,
      targetPath: lineage.targetPath,
      patchKind: lineage.patchKind,
      beforeHash: lineage.beforeHash,
      afterHash: lineage.afterHash,
      status: "observed",
      summary: `Observed applied ${lineage.patchKind} canonical patch on ${lineage.targetPath}.`,
      artifactRefs: lineage.artifactRefs,
    };
  });
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
    artifactRefs: buildMaintenanceArtifactRefListForStores(memory, [
      { store: canonicalPatchApplicationReportStore, id },
      {
        store: canonicalPatchApplicationResultStore,
        id: result.id,
      },
      {
        store: canonicalPatchApplicationManifestStore,
        id: manifest.id,
        includeMarkdown: false,
      },
    ], [
      ...result.artifactRefs,
      ...manifest.artifactRefs,
      ...observedOperations.flatMap((operation) => operation.artifactRefs),
      ...result.policyAuditRefs,
    ]),
    createdAt: new Date().toISOString(),
  };
}

async function ensureCanonicalPatchApplicationReportLedgerEntry(
  memory: ResolvedMemory,
  report: MaintenanceCanonicalPatchApplicationReport,
): Promise<void> {
  await ensureMaintenanceLedgerEntryForStoreArtifact(memory, {
    store: canonicalPatchApplicationReportStore,
    id: report.id,
    eventType: "canonical-patch-application-report",
    summary: `${report.summary} This ledger entry records read-only observation evidence and must not feed new maintenance candidates or rewrite triggers.`,
  });
}

function renderCanonicalPatchApplicationReportMarkdown(report: MaintenanceCanonicalPatchApplicationReport): string {
  return [
    `# ${report.id}`,
    "",
    report.summary,
    "",
    "## Authority",
    "",
    "- Classification: read-only canonical patch application observation report evidence.",
    "- Application authorized: true.",
    "- Source mutation authorized by this report: false.",
    "- Canonical update applied by this report: false.",
    "- Canonical patch applied by this report: false.",
    "- Execution started by this report: false.",
    "- This report does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, remote state, Validation, Audit, IntegrationCheck, or Harness evolution state.",
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
    ...report.observedOperations.map((operation) => [
      `- ${operation.id}: ${operation.status}`,
      `  resultOperation: ${operation.resultOperationId}`,
      `  manifestOperation: ${operation.manifestOperationId}`,
      `  patchOperation: ${operation.patchOperationId}`,
      `  targetKind: ${operation.targetKind}`,
      `  targetPath: ${operation.targetPath}`,
      `  patchKind: ${operation.patchKind}`,
      `  beforeHash: ${operation.beforeHash}`,
      `  afterHash: ${operation.afterHash}`,
    ].join("\n")),
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
