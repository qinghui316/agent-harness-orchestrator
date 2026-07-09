import { readFile, writeFile } from "node:fs/promises";
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
import { renderMaintenanceMarkdownList, renderMaintenanceMarkdownSection } from "./maintenance-markdown.js";
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
import {
  maintenanceCanonicalPatchApplicationManifestMarkdownPath,
  maintenanceCanonicalPatchApplicationManifestPath,
  maintenanceCanonicalPatchApplicationManifestsRoot,
  maintenanceCanonicalPatchApplicationResultMarkdownPath,
  maintenanceCanonicalPatchApplicationResultPath,
  maintenanceCanonicalPatchApplicationResultsRoot,
} from "./paths.js";
import {
  canonicalPatchApplicationGateRecordStore,
  canonicalPatchProposalStore,
  readMaintenanceCanonicalPatchApplicationGate,
  readMaintenanceCanonicalPatchProposal,
} from "./canonical-updates.js";
import {
  buildAppliedCanonicalPatchApplicationAuthority,
  buildNonExecutingCanonicalPatchApplicationAuthority,
  renderCanonicalPatchApplicationManifestAuthorityMarkdown,
  renderCanonicalPatchApplicationResultAuthorityMarkdown,
} from "./canonical-patch-application-authority.js";
import {
  buildCanonicalPatchApplicationManifestArtifactRefs,
  buildCanonicalPatchApplicationResultArtifactRefs,
} from "./canonical-patch-application-artifact-refs.js";
import {
  canonicalPatchContentHash,
  isValidCanonicalPatchTargetDescriptor,
  resolveRequiredCanonicalPatchApplicationTarget,
  validateCanonicalPatchApplicationTargetKind,
  validateCanonicalPatchTargetKindPath,
} from "./canonical-patch-target-boundary.js";
import {
  renderCanonicalPatchAppliedOperationMarkdownDetails,
  renderCanonicalPatchManifestOperationMarkdownDetails,
} from "./canonical-patch-operation-markdown.js";
import {
  buildCanonicalPatchDerivedOperationId,
  buildCanonicalPatchAppliedOperationFromManifestOperation,
  copyCanonicalPatchProposalOperationLineage,
  mergeCanonicalPatchTargetKinds,
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

export const canonicalPatchApplicationManifestStore: MaintenanceArtifactStore<MaintenanceCanonicalPatchApplicationManifest> = {
  root: maintenanceCanonicalPatchApplicationManifestsRoot,
  jsonPath: maintenanceCanonicalPatchApplicationManifestPath,
  markdownPath: maintenanceCanonicalPatchApplicationManifestMarkdownPath,
  schema: canonicalPatchApplicationManifestSchema,
};

export const canonicalPatchApplicationResultStore: MaintenanceArtifactStore<MaintenanceCanonicalPatchApplicationResult> = {
  root: maintenanceCanonicalPatchApplicationResultsRoot,
  jsonPath: maintenanceCanonicalPatchApplicationResultPath,
  markdownPath: maintenanceCanonicalPatchApplicationResultMarkdownPath,
  schema: canonicalPatchApplicationResultSchema,
};

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
    return returnExistingMaintenanceArtifactWithPolicyLedger(memory, existing, {
      store: canonicalPatchApplicationManifestStore,
      id: existing.id,
      eventType: "canonical-patch-application-manifest",
      summary: existing.summary,
    });
  }

  const manifest = buildCanonicalPatchApplicationManifest(memory, gateRecord, patchProposal);
  return writeMaintenanceArtifactWithPolicyLedger(
    memory,
    {
      store: canonicalPatchApplicationManifestStore,
      id: manifest.id,
      value: manifest,
      markdown: renderCanonicalPatchApplicationManifestMarkdown(manifest),
      eventType: "canonical-patch-application-manifest",
      summary: manifest.summary,
    },
  );
}

export async function readMaintenanceCanonicalPatchApplicationManifest(
  memory: ResolvedMemory,
  manifestId: string,
): Promise<MaintenanceCanonicalPatchApplicationManifest | null> {
  return readMaintenanceArtifact(memory, canonicalPatchApplicationManifestStore, manifestId);
}

export async function listMaintenanceCanonicalPatchApplicationManifests(memory: ResolvedMemory): Promise<MaintenanceCanonicalPatchApplicationManifest[]> {
  return listMaintenanceArtifacts(memory, canonicalPatchApplicationManifestStore);
}

export async function readMaintenanceCanonicalPatchApplicationManifestForGate(
  memory: ResolvedMemory,
  gateRecordId: string,
): Promise<MaintenanceCanonicalPatchApplicationManifest | null> {
  return findMaintenanceArtifactBy(memory, canonicalPatchApplicationManifestStore, (manifest) => manifest.gateRecordId === gateRecordId);
}

export function maintenanceCanonicalPatchApplicationManifestArtifactRef(memory: ResolvedMemory, manifestId: string): string {
  return buildMaintenanceArtifactRefsForStore(memory, canonicalPatchApplicationManifestStore, manifestId).artifactRef;
}

export async function applyMaintenanceCanonicalPatchApplicationManifest(
  memory: ResolvedMemory,
  manifestId: string,
  options: ApplyMaintenanceCanonicalPatchApplicationManifestOptions,
): Promise<MaintenanceCanonicalPatchApplicationResult> {
  validateApplicationAuthorization(options);
  const existing = await readMaintenanceCanonicalPatchApplicationResultForManifest(memory, manifestId);
  if (existing) {
    return returnExistingMaintenanceArtifactWithPolicyLedger(memory, existing, {
      store: canonicalPatchApplicationResultStore,
      id: existing.id,
      eventType: "canonical-patch-application-result",
      summary: existing.summary,
    });
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
  return writeMaintenanceArtifactWithPolicyLedger(
    memory,
    {
      store: canonicalPatchApplicationResultStore,
      id: result.id,
      value: result,
      markdown: renderCanonicalPatchApplicationResultMarkdown(result),
      eventType: "canonical-patch-application-result",
      summary: result.summary,
    },
  );
}

export async function readMaintenanceCanonicalPatchApplicationResult(
  memory: ResolvedMemory,
  resultId: string,
): Promise<MaintenanceCanonicalPatchApplicationResult | null> {
  return readMaintenanceArtifact(memory, canonicalPatchApplicationResultStore, resultId);
}

export async function listMaintenanceCanonicalPatchApplicationResults(memory: ResolvedMemory): Promise<MaintenanceCanonicalPatchApplicationResult[]> {
  return listMaintenanceArtifacts(memory, canonicalPatchApplicationResultStore);
}

export async function readMaintenanceCanonicalPatchApplicationResultForManifest(
  memory: ResolvedMemory,
  manifestId: string,
): Promise<MaintenanceCanonicalPatchApplicationResult | null> {
  return findMaintenanceArtifactBy(memory, canonicalPatchApplicationResultStore, (result) => result.manifestId === manifestId);
}

export function maintenanceCanonicalPatchApplicationResultArtifactRef(memory: ResolvedMemory, resultId: string): string {
  return buildMaintenanceArtifactRefsForStore(memory, canonicalPatchApplicationResultStore, resultId).artifactRef;
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
  const artifactRefs = buildCanonicalPatchApplicationManifestArtifactRefs(memory, {
    gateRecord: { store: canonicalPatchApplicationGateRecordStore, id: gateRecord.id },
    patchProposal: { store: canonicalPatchProposalStore, id: patchProposal.id },
    upstreamRefs: [
    ...gateRecord.artifactRefs,
    ...patchProposal.artifactRefs,
    ...operations.flatMap((operation) => operation.artifactRefs),
    ],
  });
  return {
    version: "1.0",
    id,
    status: "application-manifest",
    patchProposalId: patchProposal.id,
    gateRecordId: gateRecord.id,
    proposalId: gateRecord.proposalId,
    decisionId: gateRecord.decisionId,
    targetKinds: mergeCanonicalPatchTargetKinds(gateRecord.targetKinds, patchProposal.targetKinds),
    operationCount: patchProposal.operationCount,
    applicationStatus,
    operations,
    blockedReasons,
    ...buildNonExecutingCanonicalPatchApplicationAuthority(),
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
  const lineage = copyCanonicalPatchProposalOperationLineage(operation);
  return {
    id: buildCanonicalPatchDerivedOperationId(manifestId, index),
    patchOperationId: lineage.patchOperationId,
    targetKind: lineage.targetKind,
    operation: lineage.operation,
    sourceResolutionId: lineage.sourceResolutionId,
    sourceCandidateId: lineage.sourceCandidateId,
    targetDescriptor,
    readiness: blockedReasons.length > 0 ? "blocked-needs-concrete-target" : "ready",
    blockedReasons,
    summary: lineage.summary,
    rationale: lineage.rationale,
    artifactRefs: lineage.artifactRefs,
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
    validateCanonicalPatchApplicationTargetKind(operation.targetKind, operation.id);
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
  const appliedOperations: MaintenanceCanonicalPatchAppliedOperation[] = preparedOperations.map((operation, index) => buildCanonicalPatchAppliedOperationFromManifestOperation({
    resultId: id,
    index,
    manifestOperation: operation.manifestOperation,
    targetPath: operation.targetPath,
    patchKind: operation.descriptor.patchKind,
    beforeHash: operation.beforeHash,
    afterHash: operation.afterHash,
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
    ...buildAppliedCanonicalPatchApplicationAuthority(),
    policyAuditRefs,
    summary: `Applied canonical patch application manifest ${manifest.id} to ${appliedOperations.length} target(s).`,
    artifactRefs: buildCanonicalPatchApplicationResultArtifactRefs(memory, {
      result: { store: canonicalPatchApplicationResultStore, id },
      manifest: { store: canonicalPatchApplicationManifestStore, id: manifest.id },
      upstreamRefs: [
        ...manifest.artifactRefs,
        ...appliedOperations.flatMap((operation) => operation.artifactRefs),
      ],
      policyAuditRefs,
    }),
    createdAt: new Date().toISOString(),
  };
}

function renderCanonicalPatchApplicationManifestMarkdown(manifest: MaintenanceCanonicalPatchApplicationManifest): string {
  return [
    `# ${manifest.id}`,
    "",
    manifest.summary,
    "",
    ...renderCanonicalPatchApplicationManifestAuthorityMarkdown(),
    "",
    ...renderMaintenanceMarkdownSection("Status", [
      `- Application status: ${manifest.applicationStatus}`,
      `- Operation count: ${manifest.operationCount}`,
    ]),
    "",
    ...renderMaintenanceMarkdownSection("Sources", [
      `- Patch proposal: ${manifest.patchProposalId}`,
      `- Gate record: ${manifest.gateRecordId}`,
      `- Proposal: ${manifest.proposalId}`,
      `- Decision: ${manifest.decisionId}`,
    ]),
    "",
    ...renderMaintenanceMarkdownSection("Blocked Reasons", renderMaintenanceMarkdownList(manifest.blockedReasons, { emptyLabel: "none" })),
    "",
    ...renderMaintenanceMarkdownSection("Operations", manifest.operations.flatMap(renderCanonicalPatchManifestOperationMarkdownDetails)),
    "",
    ...renderMaintenanceMarkdownSection("Evidence", renderMaintenanceMarkdownList(manifest.artifactRefs)),
    "",
  ].join("\n");
}

function renderCanonicalPatchApplicationResultMarkdown(result: MaintenanceCanonicalPatchApplicationResult): string {
  return [
    `# ${result.id}`,
    "",
    result.summary,
    "",
    ...renderCanonicalPatchApplicationResultAuthorityMarkdown(),
    "",
    ...renderMaintenanceMarkdownSection("Sources", [
      `- Manifest: ${result.manifestId}`,
      `- Patch proposal: ${result.patchProposalId}`,
      `- Gate record: ${result.gateRecordId}`,
      `- Proposal: ${result.proposalId}`,
      `- Decision: ${result.decisionId}`,
    ]),
    "",
    ...renderMaintenanceMarkdownSection("Applied Operations", result.appliedOperations.flatMap(renderCanonicalPatchAppliedOperationMarkdownDetails)),
    "",
    ...renderMaintenanceMarkdownSection("Policy Audit", renderMaintenanceMarkdownList(result.policyAuditRefs, { emptyLabel: "none" })),
    "",
    ...renderMaintenanceMarkdownSection("Evidence", renderMaintenanceMarkdownList(result.artifactRefs)),
    "",
  ].join("\n");
}
