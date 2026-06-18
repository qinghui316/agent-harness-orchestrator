import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  MaintenanceCanonicalPatchApplicationGateRecord,
  MaintenanceCanonicalPatchApplicationManifest,
  MaintenanceCanonicalPatchApplicationManifestOperation,
  MaintenanceCanonicalPatchOperation,
  MaintenanceCanonicalPatchProposal,
  MaintenanceCanonicalPatchTargetDescriptor,
  ResolvedMemory,
} from "../types/index.js";
import { listMaintenanceLedgerEntries, recordMaintenanceLedgerEntry } from "./ledger.js";
import {
  displayMaintenancePath,
  maintenanceCanonicalPatchApplicationGateRecordMarkdownPath,
  maintenanceCanonicalPatchApplicationGateRecordPath,
  maintenanceCanonicalPatchApplicationManifestMarkdownPath,
  maintenanceCanonicalPatchApplicationManifestPath,
  maintenanceCanonicalPatchApplicationManifestsRoot,
  maintenanceCanonicalPatchProposalMarkdownPath,
  maintenanceCanonicalPatchProposalPath,
} from "./paths.js";
import {
  readMaintenanceCanonicalPatchApplicationGate,
  readMaintenanceCanonicalPatchProposal,
} from "./canonical-updates.js";
import { canonicalPatchApplicationManifestSchema } from "./schemas.js";
import { contentHash, uniqueSorted } from "./utils.js";

export async function generateMaintenanceCanonicalPatchApplicationManifest(
  memory: ResolvedMemory,
  gateRecordId: string,
): Promise<MaintenanceCanonicalPatchApplicationManifest> {
  const gateRecord = await readMaintenanceCanonicalPatchApplicationGate(memory, gateRecordId);
  if (!gateRecord) throw new Error(`Maintenance canonical patch application gate not found: ${gateRecordId}`);

  const patchProposal = await readMaintenanceCanonicalPatchProposal(memory, gateRecord.patchProposalId);
  if (!patchProposal) {
    throw new Error(`Maintenance canonical patch proposal not found for gate ${gateRecordId}: ${gateRecord.patchProposalId}`);
  }
  validateManifestLineage(gateRecord, patchProposal);

  const existing = await readMaintenanceCanonicalPatchApplicationManifestForGate(memory, gateRecordId);
  if (existing) {
    await ensureCanonicalPatchApplicationManifestLedgerEntry(memory, existing);
    return existing;
  }

  const manifest = buildCanonicalPatchApplicationManifest(memory, gateRecord, patchProposal);
  canonicalPatchApplicationManifestSchema.parse(manifest);
  await writeJsonFile(maintenanceCanonicalPatchApplicationManifestPath(memory, manifest.id), manifest);
  await writeFile(maintenanceCanonicalPatchApplicationManifestMarkdownPath(memory, manifest.id), renderCanonicalPatchApplicationManifestMarkdown(manifest), "utf8");
  await ensureCanonicalPatchApplicationManifestLedgerEntry(memory, manifest);
  return manifest;
}

export async function readMaintenanceCanonicalPatchApplicationManifest(
  memory: ResolvedMemory,
  manifestId: string,
): Promise<MaintenanceCanonicalPatchApplicationManifest | null> {
  const path = maintenanceCanonicalPatchApplicationManifestPath(memory, manifestId);
  if (!existsSync(path)) return null;
  return readJsonFile(path, canonicalPatchApplicationManifestSchema, null as unknown as MaintenanceCanonicalPatchApplicationManifest).catch(() => null);
}

export async function listMaintenanceCanonicalPatchApplicationManifests(memory: ResolvedMemory): Promise<MaintenanceCanonicalPatchApplicationManifest[]> {
  const root = maintenanceCanonicalPatchApplicationManifestsRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const manifests: MaintenanceCanonicalPatchApplicationManifest[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const manifest = await readJsonFile(join(root, entry.name), canonicalPatchApplicationManifestSchema, null as unknown as MaintenanceCanonicalPatchApplicationManifest).catch(() => null);
    if (manifest) manifests.push(manifest);
  }
  return manifests.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readMaintenanceCanonicalPatchApplicationManifestForGate(
  memory: ResolvedMemory,
  gateRecordId: string,
): Promise<MaintenanceCanonicalPatchApplicationManifest | null> {
  const manifests = await listMaintenanceCanonicalPatchApplicationManifests(memory);
  return manifests.find((manifest) => manifest.gateRecordId === gateRecordId) ?? null;
}

export function maintenanceCanonicalPatchApplicationManifestArtifactRef(memory: ResolvedMemory, manifestId: string): string {
  return displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationManifestPath(memory, manifestId));
}

function buildCanonicalPatchApplicationManifest(
  memory: ResolvedMemory,
  gateRecord: MaintenanceCanonicalPatchApplicationGateRecord,
  patchProposal: MaintenanceCanonicalPatchProposal,
): MaintenanceCanonicalPatchApplicationManifest {
  const id = `canonical-patch-application-manifest-${contentHash(`${gateRecord.id}|${patchProposal.id}`).slice(0, 12)}`;
  const operations = patchProposal.operations.map((operation, index) => buildManifestOperation(id, operation, index));
  const blockedReasons = uniqueSorted(operations.flatMap((operation) => operation.blockedReasons));
  const applicationStatus = blockedReasons.length > 0 ? "blocked-needs-concrete-targets" : "ready-for-application";
  const artifactRefs = uniqueSorted([
    displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationGateRecordPath(memory, gateRecord.id)),
    displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationGateRecordMarkdownPath(memory, gateRecord.id)),
    maintenanceCanonicalPatchApplicationGateProposalArtifactRef(memory, patchProposal.id),
    displayMaintenancePath(memory, maintenanceCanonicalPatchProposalMarkdownPath(memory, patchProposal.id)),
    ...gateRecord.artifactRefs,
    ...patchProposal.artifactRefs,
    ...operations.flatMap((operation) => operation.artifactRefs),
  ]);
  return {
    version: "1.0",
    id,
    status: "application-manifest",
    patchProposalId: patchProposal.id,
    gateRecordId: gateRecord.id,
    proposalId: gateRecord.proposalId,
    decisionId: gateRecord.decisionId,
    targetKinds: uniqueSorted([...gateRecord.targetKinds, ...patchProposal.targetKinds]) as MaintenanceCanonicalPatchApplicationManifest["targetKinds"],
    operationCount: patchProposal.operationCount,
    applicationStatus,
    operations,
    blockedReasons,
    sourceMutationAuthorized: false,
    canonicalUpdateApplied: false,
    canonicalPatchApplied: false,
    executionStarted: false,
    summary: applicationStatus === "ready-for-application"
      ? `Canonical patch application manifest is ready for a future deterministic writer for gate ${gateRecord.id}. This manifest does not execute writes.`
      : `Canonical patch application manifest is blocked for gate ${gateRecord.id}: concrete target descriptors are required before any future deterministic writer can run.`,
    artifactRefs,
    createdAt: new Date().toISOString(),
  };
}

function buildManifestOperation(
  manifestId: string,
  operation: MaintenanceCanonicalPatchOperation,
  index: number,
): MaintenanceCanonicalPatchApplicationManifestOperation {
  const targetDescriptor = validTargetDescriptorForOperation(operation);
  const blockedReasons = targetDescriptor
    ? []
    : ["Patch proposal operation lacks a deterministic target descriptor with target path, expected content hash, and patch payload."];
  return {
    id: `${manifestId}-operation-${String(index + 1).padStart(3, "0")}`,
    patchOperationId: operation.id,
    targetKind: operation.targetKind,
    operation: operation.operation,
    sourceResolutionId: operation.sourceResolutionId,
    sourceCandidateId: operation.sourceCandidateId,
    targetDescriptor,
    readiness: blockedReasons.length > 0 ? "blocked-needs-concrete-target" : "ready",
    blockedReasons,
    summary: operation.summary,
    rationale: operation.rationale,
    artifactRefs: operation.artifactRefs,
  };
}

function validTargetDescriptorForOperation(operation: MaintenanceCanonicalPatchOperation): MaintenanceCanonicalPatchTargetDescriptor | null {
  const descriptor = operation.targetDescriptor;
  if (!descriptor) return null;
  if (descriptor.targetKind !== operation.targetKind) return null;
  if (descriptor.targetPath.trim().length === 0 || descriptor.expectedContentHash.trim().length === 0) return null;
  if (descriptor.patchKind === "replacement") {
    return descriptor.replacement.length > 0 ? descriptor : null;
  }
  return descriptor.hunks.length > 0 ? descriptor : null;
}

function validateManifestLineage(
  gateRecord: MaintenanceCanonicalPatchApplicationGateRecord,
  patchProposal: MaintenanceCanonicalPatchProposal,
): void {
  if (gateRecord.patchProposalId !== patchProposal.id) {
    throw new Error(`Maintenance canonical patch application gate lineage mismatch: gate ${gateRecord.id} points to ${gateRecord.patchProposalId}, loaded ${patchProposal.id}`);
  }
  if (gateRecord.proposalId !== patchProposal.proposalId) {
    throw new Error(`Maintenance canonical patch application gate proposal lineage mismatch: gate ${gateRecord.id}`);
  }
  if (gateRecord.decisionId !== patchProposal.decisionId) {
    throw new Error(`Maintenance canonical patch application gate decision lineage mismatch: gate ${gateRecord.id}`);
  }
  if (gateRecord.operationCount !== patchProposal.operationCount || gateRecord.operationCount !== patchProposal.operations.length) {
    throw new Error(`Maintenance canonical patch application gate operation count mismatch: gate ${gateRecord.id}`);
  }
}

async function ensureCanonicalPatchApplicationManifestLedgerEntry(
  memory: ResolvedMemory,
  manifest: MaintenanceCanonicalPatchApplicationManifest,
): Promise<void> {
  const manifestRef = maintenanceCanonicalPatchApplicationManifestArtifactRef(memory, manifest.id);
  const entries = await listMaintenanceLedgerEntries(memory);
  if (entries.some((entry) => entry.eventType === "canonical-patch-application-manifest" && entry.artifactRefs.includes(manifestRef))) {
    return;
  }
  await recordMaintenanceLedgerEntry(memory, {
    eventType: "canonical-patch-application-manifest",
    summary: `${manifest.summary} This ledger entry is evidence only and does not authorize canonical mutation.`,
    artifactRefs: [
      manifestRef,
      displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationManifestMarkdownPath(memory, manifest.id)),
    ],
  });
}

function maintenanceCanonicalPatchApplicationGateProposalArtifactRef(memory: ResolvedMemory, patchProposalId: string): string {
  return displayMaintenancePath(memory, maintenanceCanonicalPatchProposalPath(memory, patchProposalId));
}

function renderCanonicalPatchApplicationManifestMarkdown(manifest: MaintenanceCanonicalPatchApplicationManifest): string {
  return [
    `# ${manifest.id}`,
    "",
    manifest.summary,
    "",
    "## Authority",
    "",
    "- Classification: non-executing canonical patch application readiness evidence.",
    "- Source mutation authorized: false.",
    "- Canonical update applied: false.",
    "- Canonical patch applied: false.",
    "- Execution started: false.",
    "- This manifest does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, remote state, or Harness evolution state.",
    "",
    "## Status",
    "",
    `- Application status: ${manifest.applicationStatus}`,
    `- Operation count: ${manifest.operationCount}`,
    "",
    "## Sources",
    "",
    `- Patch proposal: ${manifest.patchProposalId}`,
    `- Gate record: ${manifest.gateRecordId}`,
    `- Proposal: ${manifest.proposalId}`,
    `- Decision: ${manifest.decisionId}`,
    "",
    "## Blocked Reasons",
    "",
    ...(manifest.blockedReasons.length > 0 ? manifest.blockedReasons.map((reason) => `- ${reason}`) : ["- none"]),
    "",
    "## Operations",
    "",
    ...manifest.operations.map((operation) => [
      `- ${operation.id}: ${operation.readiness}`,
      `  patchOperation: ${operation.patchOperationId}`,
      `  targetKind: ${operation.targetKind}`,
      `  operation: ${operation.operation}`,
      `  targetDescriptor: ${operation.targetDescriptor ? operation.targetDescriptor.patchKind : "missing"}`,
      `  blockedReasons: ${operation.blockedReasons.length > 0 ? operation.blockedReasons.join("; ") : "none"}`,
    ].join("\n")),
    "",
    "## Evidence",
    "",
    ...manifest.artifactRefs.map((ref) => `- ${ref}`),
    "",
  ].join("\n");
}
