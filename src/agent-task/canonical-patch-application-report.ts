import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  MaintenanceCanonicalPatchApplicationManifest,
  MaintenanceCanonicalPatchApplicationReport,
  MaintenanceCanonicalPatchApplicationReportOperation,
  MaintenanceCanonicalPatchApplicationResult,
  ResolvedMemory,
} from "../types/index.js";
import { listMaintenanceLedgerEntries, recordMaintenanceLedgerEntry } from "./ledger.js";
import {
  maintenanceCanonicalPatchApplicationManifestArtifactRef,
  readMaintenanceCanonicalPatchApplicationManifest,
  readMaintenanceCanonicalPatchApplicationResult,
} from "./canonical-patch-application.js";
import {
  displayMaintenancePath,
  maintenanceCanonicalPatchApplicationReportMarkdownPath,
  maintenanceCanonicalPatchApplicationReportPath,
  maintenanceCanonicalPatchApplicationReportsRoot,
  maintenanceCanonicalPatchApplicationResultMarkdownPath,
  maintenanceCanonicalPatchApplicationResultPath,
} from "./paths.js";
import { canonicalPatchApplicationReportSchema } from "./schemas.js";
import { contentHash, uniqueSorted } from "./utils.js";

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
  validateReportLineage(result, manifest);

  const report = buildCanonicalPatchApplicationReport(memory, result, manifest);
  canonicalPatchApplicationReportSchema.parse(report);
  await writeJsonFile(maintenanceCanonicalPatchApplicationReportPath(memory, report.id), report);
  await writeFile(maintenanceCanonicalPatchApplicationReportMarkdownPath(memory, report.id), renderCanonicalPatchApplicationReportMarkdown(report), "utf8");
  await ensureCanonicalPatchApplicationReportLedgerEntry(memory, report);
  return report;
}

export async function readMaintenanceCanonicalPatchApplicationReport(
  memory: ResolvedMemory,
  reportId: string,
): Promise<MaintenanceCanonicalPatchApplicationReport | null> {
  const path = maintenanceCanonicalPatchApplicationReportPath(memory, reportId);
  if (!existsSync(path)) return null;
  return readJsonFile(path, canonicalPatchApplicationReportSchema, null as unknown as MaintenanceCanonicalPatchApplicationReport).catch(() => null);
}

export async function listMaintenanceCanonicalPatchApplicationReports(memory: ResolvedMemory): Promise<MaintenanceCanonicalPatchApplicationReport[]> {
  const root = maintenanceCanonicalPatchApplicationReportsRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const reports: MaintenanceCanonicalPatchApplicationReport[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const report = await readJsonFile(join(root, entry.name), canonicalPatchApplicationReportSchema, null as unknown as MaintenanceCanonicalPatchApplicationReport).catch(() => null);
    if (report) reports.push(report);
  }
  return reports.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readMaintenanceCanonicalPatchApplicationReportForResult(
  memory: ResolvedMemory,
  applicationResultId: string,
): Promise<MaintenanceCanonicalPatchApplicationReport | null> {
  const reports = await listMaintenanceCanonicalPatchApplicationReports(memory);
  return reports.find((report) => report.resultId === applicationResultId) ?? null;
}

export function maintenanceCanonicalPatchApplicationReportArtifactRef(memory: ResolvedMemory, reportId: string): string {
  return displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationReportPath(memory, reportId));
}

function buildCanonicalPatchApplicationReport(
  memory: ResolvedMemory,
  result: MaintenanceCanonicalPatchApplicationResult,
  manifest: MaintenanceCanonicalPatchApplicationManifest,
): MaintenanceCanonicalPatchApplicationReport {
  const id = `canonical-patch-application-report-${contentHash(result.id).slice(0, 12)}`;
  const reportRef = displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationReportPath(memory, id));
  const markdownRef = displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationReportMarkdownPath(memory, id));
  const observedOperations: MaintenanceCanonicalPatchApplicationReportOperation[] = result.appliedOperations.map((operation, index) => ({
    id: `${id}-operation-${String(index + 1).padStart(3, "0")}`,
    resultOperationId: operation.id,
    manifestOperationId: operation.manifestOperationId,
    patchOperationId: operation.patchOperationId,
    targetKind: operation.targetKind,
    operation: operation.operation,
    targetPath: operation.targetPath,
    patchKind: operation.patchKind,
    beforeHash: operation.beforeHash,
    afterHash: operation.afterHash,
    status: "observed",
    summary: `Observed applied ${operation.patchKind} canonical patch on ${operation.targetPath}.`,
    artifactRefs: operation.artifactRefs,
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
    applicationAuthorized: true,
    sourceMutationAuthorized: false,
    canonicalUpdateApplied: false,
    canonicalPatchApplied: false,
    executionStarted: false,
    policyAuditRefs: result.policyAuditRefs,
    guardrailNotes: [
      "Observation report generation is read-only for canonical docs and stable memory.",
      "This report does not authorize or trigger another rewrite, review gate, candidate extraction, apply, close, remote, Validation, Audit, IntegrationCheck, or Harness evolution transition.",
      "The observed application result remains the human-gated mutation evidence; this report is a compact post-application summary.",
    ],
    summary: `Observed canonical patch application result ${result.id} for ${observedOperations.length} applied target(s).`,
    artifactRefs: uniqueSorted([
      reportRef,
      markdownRef,
      displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationResultPath(memory, result.id)),
      displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationResultMarkdownPath(memory, result.id)),
      maintenanceCanonicalPatchApplicationManifestArtifactRef(memory, manifest.id),
      ...result.artifactRefs,
      ...manifest.artifactRefs,
      ...observedOperations.flatMap((operation) => operation.artifactRefs),
      ...result.policyAuditRefs,
    ]),
    createdAt: new Date().toISOString(),
  };
}

function validateReportLineage(
  result: MaintenanceCanonicalPatchApplicationResult,
  manifest: MaintenanceCanonicalPatchApplicationManifest,
): void {
  if (result.manifestId !== manifest.id) {
    throw new Error(`Maintenance canonical patch application report lineage mismatch: result ${result.id} points to manifest ${result.manifestId}, loaded ${manifest.id}`);
  }
  if (
    result.patchProposalId !== manifest.patchProposalId
    || result.gateRecordId !== manifest.gateRecordId
    || result.proposalId !== manifest.proposalId
    || result.decisionId !== manifest.decisionId
  ) {
    throw new Error(`Maintenance canonical patch application report lineage mismatch: result ${result.id}`);
  }
  if (
    result.operationCount !== result.appliedOperations.length
    || result.operationCount !== manifest.operationCount
    || result.operationCount !== manifest.operations.length
  ) {
    throw new Error(`Maintenance canonical patch application report operation count mismatch: result ${result.id}`);
  }

  const manifestOperations = new Map(manifest.operations.map((operation) => [operation.id, operation]));
  for (const operation of result.appliedOperations) {
    const manifestOperation = manifestOperations.get(operation.manifestOperationId);
    if (!manifestOperation) {
      throw new Error(`Maintenance canonical patch application report missing manifest operation for result operation: ${operation.id}`);
    }
    if (
      operation.patchOperationId !== manifestOperation.patchOperationId
      || operation.targetKind !== manifestOperation.targetKind
      || operation.operation !== manifestOperation.operation
    ) {
      throw new Error(`Maintenance canonical patch application report operation lineage mismatch: ${operation.id}`);
    }
  }
}

async function ensureCanonicalPatchApplicationReportLedgerEntry(
  memory: ResolvedMemory,
  report: MaintenanceCanonicalPatchApplicationReport,
): Promise<void> {
  const reportRef = maintenanceCanonicalPatchApplicationReportArtifactRef(memory, report.id);
  const entries = await listMaintenanceLedgerEntries(memory);
  if (entries.some((entry) => entry.eventType === "canonical-patch-application-report" && entry.artifactRefs.includes(reportRef))) {
    return;
  }
  await recordMaintenanceLedgerEntry(memory, {
    eventType: "canonical-patch-application-report",
    summary: `${report.summary} This ledger entry records read-only observation evidence and must not feed new maintenance candidates or rewrite triggers.`,
    artifactRefs: [
      reportRef,
      displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationReportMarkdownPath(memory, report.id)),
    ],
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
    ...report.guardrailNotes.map((note) => `- ${note}`),
    "",
    "## Policy Audit",
    "",
    ...(report.policyAuditRefs.length > 0 ? report.policyAuditRefs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Evidence",
    "",
    ...report.artifactRefs.map((ref) => `- ${ref}`),
    "",
  ].join("\n");
}
