import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  MaintenanceCanonicalPatchAppliedOperation,
  MaintenanceCanonicalPatchApplicationGateRecord,
  MaintenanceCanonicalPatchApplicationManifest,
  MaintenanceCanonicalPatchApplicationManifestOperation,
  MaintenanceCanonicalPatchApplicationResult,
  MaintenanceCanonicalPatchOperation,
  MaintenanceCanonicalPatchProposal,
  MaintenanceCanonicalPatchTargetDescriptor,
  ResolvedMemory,
} from "../types/index.js";
import { ensureMaintenanceLedgerEntryForArtifactRef } from "./ledger.js";
import {
  displayMaintenancePath,
  maintenanceCanonicalPatchApplicationGateRecordMarkdownPath,
  maintenanceCanonicalPatchApplicationGateRecordPath,
  maintenanceCanonicalPatchApplicationManifestMarkdownPath,
  maintenanceCanonicalPatchApplicationManifestPath,
  maintenanceCanonicalPatchApplicationManifestsRoot,
  maintenanceCanonicalPatchApplicationResultMarkdownPath,
  maintenanceCanonicalPatchApplicationResultPath,
  maintenanceCanonicalPatchApplicationResultsRoot,
  maintenanceCanonicalPatchProposalMarkdownPath,
  maintenanceCanonicalPatchProposalPath,
} from "./paths.js";
import {
  readMaintenanceCanonicalPatchApplicationGate,
  readMaintenanceCanonicalPatchProposal,
} from "./canonical-updates.js";
import {
  canonicalPatchContentHash,
  isValidCanonicalPatchTargetDescriptor,
  resolveRequiredCanonicalPatchApplicationTarget,
  validateCanonicalPatchTargetKindPath,
} from "./canonical-patch-target-boundary.js";
import {
  validateCanonicalPatchApplicationGateLineage,
  validateCanonicalPatchApplicationManifestLineage,
  validateCanonicalPatchApplicationManifestOperationLineage,
} from "./canonical-patch-lineage.js";
import { canonicalPatchApplicationManifestSchema, canonicalPatchApplicationResultSchema } from "./schemas.js";
import { contentHash, uniqueSorted } from "./utils.js";

export interface ApplyMaintenanceCanonicalPatchApplicationManifestOptions {
  policyAuditRefs: string[];
  confirmedBy: "workbench-human-gate";
}

interface PreparedApplicationOperation {
  manifestOperation: MaintenanceCanonicalPatchApplicationManifestOperation;
  descriptor: MaintenanceCanonicalPatchTargetDescriptor;
  targetPath: string;
  absoluteTargetPath: string;
  beforeContent: string;
  afterContent: string;
  beforeHash: string;
  afterHash: string;
}

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
  validateCanonicalPatchApplicationGateLineage(gateRecord, patchProposal);

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

export async function applyMaintenanceCanonicalPatchApplicationManifest(
  memory: ResolvedMemory,
  manifestId: string,
  options: ApplyMaintenanceCanonicalPatchApplicationManifestOptions,
): Promise<MaintenanceCanonicalPatchApplicationResult> {
  validateApplicationAuthorization(options);
  const existing = await readMaintenanceCanonicalPatchApplicationResultForManifest(memory, manifestId);
  if (existing) {
    await ensureCanonicalPatchApplicationResultLedgerEntry(memory, existing);
    return existing;
  }

  const manifest = await readMaintenanceCanonicalPatchApplicationManifest(memory, manifestId);
  if (!manifest) throw new Error(`Maintenance canonical patch application manifest not found: ${manifestId}`);
  const gateRecord = await readMaintenanceCanonicalPatchApplicationGate(memory, manifest.gateRecordId);
  if (!gateRecord) throw new Error(`Maintenance canonical patch application gate not found for manifest ${manifestId}: ${manifest.gateRecordId}`);
  const patchProposal = await readMaintenanceCanonicalPatchProposal(memory, manifest.patchProposalId);
  if (!patchProposal) throw new Error(`Maintenance canonical patch proposal not found for manifest ${manifestId}: ${manifest.patchProposalId}`);
  validateCanonicalPatchApplicationGateLineage(gateRecord, patchProposal);
  validateCanonicalPatchApplicationManifestLineage(manifest, gateRecord, patchProposal);

  const prepared = await prepareApplicationOperations(memory, manifest, patchProposal);
  for (const operation of prepared) {
    await writeFile(operation.absoluteTargetPath, operation.afterContent, "utf8");
  }

  const result = buildCanonicalPatchApplicationResult(memory, manifest, prepared, options.policyAuditRefs);
  canonicalPatchApplicationResultSchema.parse(result);
  await writeJsonFile(maintenanceCanonicalPatchApplicationResultPath(memory, result.id), result);
  await writeFile(maintenanceCanonicalPatchApplicationResultMarkdownPath(memory, result.id), renderCanonicalPatchApplicationResultMarkdown(result), "utf8");
  await ensureCanonicalPatchApplicationResultLedgerEntry(memory, result);
  return result;
}

export async function readMaintenanceCanonicalPatchApplicationResult(
  memory: ResolvedMemory,
  resultId: string,
): Promise<MaintenanceCanonicalPatchApplicationResult | null> {
  const path = maintenanceCanonicalPatchApplicationResultPath(memory, resultId);
  if (!existsSync(path)) return null;
  return readJsonFile(path, canonicalPatchApplicationResultSchema, null as unknown as MaintenanceCanonicalPatchApplicationResult).catch(() => null);
}

export async function listMaintenanceCanonicalPatchApplicationResults(memory: ResolvedMemory): Promise<MaintenanceCanonicalPatchApplicationResult[]> {
  const root = maintenanceCanonicalPatchApplicationResultsRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const results: MaintenanceCanonicalPatchApplicationResult[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const result = await readJsonFile(join(root, entry.name), canonicalPatchApplicationResultSchema, null as unknown as MaintenanceCanonicalPatchApplicationResult).catch(() => null);
    if (result) results.push(result);
  }
  return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readMaintenanceCanonicalPatchApplicationResultForManifest(
  memory: ResolvedMemory,
  manifestId: string,
): Promise<MaintenanceCanonicalPatchApplicationResult | null> {
  const results = await listMaintenanceCanonicalPatchApplicationResults(memory);
  return results.find((result) => result.manifestId === manifestId) ?? null;
}

export function maintenanceCanonicalPatchApplicationResultArtifactRef(memory: ResolvedMemory, resultId: string): string {
  return displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationResultPath(memory, resultId));
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
  const targetDescriptor = isValidCanonicalPatchTargetDescriptor(operation.targetDescriptor, operation.targetKind) ? operation.targetDescriptor : null;
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

function validateApplicationAuthorization(options: ApplyMaintenanceCanonicalPatchApplicationManifestOptions): void {
  if (options.confirmedBy !== "workbench-human-gate") {
    throw new Error("Maintenance canonical patch application requires Workbench human-gate confirmation.");
  }
  if (!Array.isArray(options.policyAuditRefs) || options.policyAuditRefs.length === 0 || options.policyAuditRefs.some((ref) => !ref.trim())) {
    throw new Error("Maintenance canonical patch application requires ToolPolicyGate audit evidence.");
  }
}

async function prepareApplicationOperations(
  memory: ResolvedMemory,
  manifest: MaintenanceCanonicalPatchApplicationManifest,
  patchProposal: MaintenanceCanonicalPatchProposal,
): Promise<PreparedApplicationOperation[]> {
  if (manifest.applicationStatus !== "ready-for-application") {
    throw new Error(`Maintenance canonical patch application manifest is not ready: ${manifest.id}`);
  }
  if (manifest.blockedReasons.length > 0) {
    throw new Error(`Maintenance canonical patch application manifest has blocked reasons: ${manifest.id}`);
  }

  const operationIds = new Set<string>();
  const patchOperationIds = new Set<string>();
  const targetPaths = new Set<string>();
  const proposalOperations = new Map(patchProposal.operations.map((operation) => [operation.id, operation]));
  const prepared: PreparedApplicationOperation[] = [];

  for (const operation of manifest.operations) {
    if (operationIds.has(operation.id)) throw new Error(`Duplicate canonical patch application operation id: ${operation.id}`);
    operationIds.add(operation.id);
    if (patchOperationIds.has(operation.patchOperationId)) throw new Error(`Duplicate canonical patch application patch operation id: ${operation.patchOperationId}`);
    patchOperationIds.add(operation.patchOperationId);
    if (operation.readiness !== "ready" || operation.blockedReasons.length > 0 || !operation.targetDescriptor) {
      throw new Error(`Canonical patch application operation is not ready: ${operation.id}`);
    }
    const proposalOperation = proposalOperations.get(operation.patchOperationId);
    if (!proposalOperation) throw new Error(`Canonical patch application operation has no matching patch proposal operation: ${operation.id}`);
    validateCanonicalPatchApplicationManifestOperationLineage(operation, proposalOperation);
    validateSupportedApplicationTarget(operation.targetKind, operation.id);
    validateCanonicalPatchTargetKindPath(operation.targetKind, operation.targetDescriptor.targetPath, operation.id);

    const target = await resolveRequiredCanonicalPatchApplicationTarget(memory.memoryRoot, operation.targetDescriptor.targetPath);
    const targetKey = target.relativeTargetPath.toLowerCase();
    if (targetPaths.has(targetKey)) throw new Error(`Duplicate canonical patch application target path: ${target.relativeTargetPath}`);
    targetPaths.add(targetKey);

    const beforeContent = await readFile(target.realTargetPath, "utf8");
    const beforeHash = canonicalPatchContentHash(beforeContent);
    if (beforeHash !== operation.targetDescriptor.expectedContentHash) {
      throw new Error(`Canonical patch application target hash is stale for ${target.relativeTargetPath}`);
    }
    const afterContent = applyDescriptorToContent(beforeContent, operation.targetDescriptor, operation.id);
    const afterHash = canonicalPatchContentHash(afterContent);
    if (afterHash === beforeHash) throw new Error(`Canonical patch application operation produced no content change: ${operation.id}`);

    prepared.push({
      manifestOperation: operation,
      descriptor: operation.targetDescriptor,
      targetPath: target.relativeTargetPath,
      absoluteTargetPath: target.realTargetPath,
      beforeContent,
      afterContent,
      beforeHash,
      afterHash,
    });
  }

  if (prepared.length !== manifest.operationCount) {
    throw new Error(`Prepared operation count mismatch for canonical patch application manifest: ${manifest.id}`);
  }
  return prepared;
}

function validateSupportedApplicationTarget(targetKind: string, operationId: string): void {
  if (targetKind !== "canonical-docs" && targetKind !== "stable-memory") {
    throw new Error(`Unsupported canonical patch application target kind for ${operationId}: ${targetKind}`);
  }
}

function applyDescriptorToContent(content: string, descriptor: MaintenanceCanonicalPatchTargetDescriptor, operationId: string): string {
  if (descriptor.patchKind === "replacement") {
    if (descriptor.replacement === content) throw new Error(`Canonical patch replacement is a no-op: ${operationId}`);
    return descriptor.replacement;
  }
  let result = content;
  for (const hunk of descriptor.hunks) {
    if (hunk.oldText.trim().length === 0 || hunk.newText.trim().length === 0) {
      throw new Error(`Canonical patch hunk is missing concrete text: ${operationId}`);
    }
    if (hunk.oldText === hunk.newText) throw new Error(`Canonical patch hunk is a no-op: ${operationId}`);
    const matches = findStringMatches(result, hunk.oldText);
    if (hunk.occurrence !== undefined) {
      if (hunk.occurrence < 1 || hunk.occurrence > matches.length) {
        throw new Error(`Canonical patch hunk occurrence is unavailable for ${operationId}`);
      }
      const start = matches[hunk.occurrence - 1];
      result = `${result.slice(0, start)}${hunk.newText}${result.slice(start + hunk.oldText.length)}`;
      continue;
    }
    if (matches.length === 0) throw new Error(`Canonical patch hunk did not match target content for ${operationId}`);
    if (matches.length > 1) throw new Error(`Canonical patch hunk matched target content ambiguously for ${operationId}`);
    const start = matches[0];
    result = `${result.slice(0, start)}${hunk.newText}${result.slice(start + hunk.oldText.length)}`;
  }
  return result;
}

function findStringMatches(content: string, needle: string): number[] {
  const matches: number[] = [];
  let offset = content.indexOf(needle);
  while (offset !== -1) {
    matches.push(offset);
    offset = content.indexOf(needle, offset + needle.length);
  }
  return matches;
}

function buildCanonicalPatchApplicationResult(
  memory: ResolvedMemory,
  manifest: MaintenanceCanonicalPatchApplicationManifest,
  preparedOperations: PreparedApplicationOperation[],
  policyAuditRefs: string[],
): MaintenanceCanonicalPatchApplicationResult {
  const id = `canonical-patch-application-result-${contentHash(manifest.id).slice(0, 12)}`;
  const resultRef = displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationResultPath(memory, id));
  const markdownRef = displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationResultMarkdownPath(memory, id));
  const appliedOperations: MaintenanceCanonicalPatchAppliedOperation[] = preparedOperations.map((operation, index) => ({
    id: `${id}-operation-${String(index + 1).padStart(3, "0")}`,
    manifestOperationId: operation.manifestOperation.id,
    patchOperationId: operation.manifestOperation.patchOperationId,
    targetKind: operation.manifestOperation.targetKind,
    operation: operation.manifestOperation.operation,
    targetPath: operation.targetPath,
    patchKind: operation.descriptor.patchKind,
    beforeHash: operation.beforeHash,
    afterHash: operation.afterHash,
    status: "applied",
    summary: `Applied ${operation.descriptor.patchKind} canonical patch to ${operation.targetPath}.`,
    artifactRefs: operation.manifestOperation.artifactRefs,
  }));
  return {
    version: "1.0",
    id,
    status: "applied",
    manifestId: manifest.id,
    patchProposalId: manifest.patchProposalId,
    gateRecordId: manifest.gateRecordId,
    proposalId: manifest.proposalId,
    decisionId: manifest.decisionId,
    targetKinds: manifest.targetKinds,
    operationCount: appliedOperations.length,
    appliedOperations,
    applicationAuthorized: true,
    sourceMutationAuthorized: true,
    canonicalUpdateApplied: true,
    canonicalPatchApplied: true,
    executionStarted: true,
    policyAuditRefs,
    summary: `Applied canonical patch application manifest ${manifest.id} to ${appliedOperations.length} target(s).`,
    artifactRefs: uniqueSorted([
      resultRef,
      markdownRef,
      maintenanceCanonicalPatchApplicationManifestArtifactRef(memory, manifest.id),
      displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationManifestMarkdownPath(memory, manifest.id)),
      ...manifest.artifactRefs,
      ...appliedOperations.flatMap((operation) => operation.artifactRefs),
      ...policyAuditRefs,
    ]),
    createdAt: new Date().toISOString(),
  };
}

async function ensureCanonicalPatchApplicationResultLedgerEntry(
  memory: ResolvedMemory,
  result: MaintenanceCanonicalPatchApplicationResult,
): Promise<void> {
  const resultRef = maintenanceCanonicalPatchApplicationResultArtifactRef(memory, result.id);
  await ensureMaintenanceLedgerEntryForArtifactRef(memory, {
    eventType: "canonical-patch-application-result",
    artifactRef: resultRef,
    summary: `${result.summary} This ledger entry records a human-gated canonical patch application result and must not feed new maintenance candidates.`,
    artifactRefs: [
      displayMaintenancePath(memory, maintenanceCanonicalPatchApplicationResultMarkdownPath(memory, result.id)),
    ],
  });
}

async function ensureCanonicalPatchApplicationManifestLedgerEntry(
  memory: ResolvedMemory,
  manifest: MaintenanceCanonicalPatchApplicationManifest,
): Promise<void> {
  const manifestRef = maintenanceCanonicalPatchApplicationManifestArtifactRef(memory, manifest.id);
  await ensureMaintenanceLedgerEntryForArtifactRef(memory, {
    eventType: "canonical-patch-application-manifest",
    artifactRef: manifestRef,
    summary: `${manifest.summary} This ledger entry is evidence only and does not authorize canonical mutation.`,
    artifactRefs: [
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
      `  targetDescriptor: ${renderTargetDescriptor(operation.targetDescriptor)}`,
      `  blockedReasons: ${operation.blockedReasons.length > 0 ? operation.blockedReasons.join("; ") : "none"}`,
    ].join("\n")),
    "",
    "## Evidence",
    "",
    ...manifest.artifactRefs.map((ref) => `- ${ref}`),
    "",
  ].join("\n");
}

function renderTargetDescriptor(descriptor: MaintenanceCanonicalPatchTargetDescriptor | null): string {
  if (!descriptor) return "missing";
  return `${descriptor.patchKind} ${descriptor.targetPath} sha256=${descriptor.expectedContentHash}`;
}

function renderCanonicalPatchApplicationResultMarkdown(result: MaintenanceCanonicalPatchApplicationResult): string {
  return [
    `# ${result.id}`,
    "",
    result.summary,
    "",
    "## Authority",
    "",
    "- Classification: human-gated canonical patch application result evidence.",
    "- Application authorized: true.",
    "- Source mutation authorized: true.",
    "- Canonical update applied: true.",
    "- Canonical patch applied: true.",
    "- Execution started: true.",
    "- This result records a completed canonical docs/stable-memory patch application. It does not modify apply state, close state, remote state, IntegrationCheck, Validation, Audit, or Harness evolution state.",
    "",
    "## Sources",
    "",
    `- Manifest: ${result.manifestId}`,
    `- Patch proposal: ${result.patchProposalId}`,
    `- Gate record: ${result.gateRecordId}`,
    `- Proposal: ${result.proposalId}`,
    `- Decision: ${result.decisionId}`,
    "",
    "## Applied Operations",
    "",
    ...result.appliedOperations.map((operation) => [
      `- ${operation.id}: ${operation.status}`,
      `  manifestOperation: ${operation.manifestOperationId}`,
      `  patchOperation: ${operation.patchOperationId}`,
      `  targetKind: ${operation.targetKind}`,
      `  targetPath: ${operation.targetPath}`,
      `  patchKind: ${operation.patchKind}`,
      `  beforeHash: ${operation.beforeHash}`,
      `  afterHash: ${operation.afterHash}`,
    ].join("\n")),
    "",
    "## Policy Audit",
    "",
    ...(result.policyAuditRefs.length > 0 ? result.policyAuditRefs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Evidence",
    "",
    ...result.artifactRefs.map((ref) => `- ${ref}`),
    "",
  ].join("\n");
}
