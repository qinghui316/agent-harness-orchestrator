import type {
  MaintenanceCanonicalPatchApplicationGateRecord,
  MaintenanceCanonicalPatchOperation,
  MaintenanceCanonicalPatchProposal,
  MaintenanceCanonicalUpdateDecision,
  MaintenanceCanonicalUpdateProposal,
  MaintenanceCanonicalUpdateTargetKind,
  MaintenanceCandidateResolution,
  MaintenanceCandidateSubtype,
  ResolvedMemory,
} from "../types/index.js";
import {
  buildMaintenanceArtifactRefListForStores,
  buildMaintenanceArtifactRefsForStore,
  findMaintenanceArtifactBy,
  listMaintenanceArtifacts,
  readMaintenanceArtifact,
  writeMaintenanceJsonMarkdownArtifact,
  type MaintenanceArtifactStore,
} from "./maintenance-artifact-store.js";
import {
  displayMaintenancePath,
  maintenanceCanonicalPatchProposalMarkdownPath,
  maintenanceCanonicalPatchProposalPath,
  maintenanceCanonicalPatchProposalsRoot,
  maintenanceCanonicalPatchApplicationGateRecordMarkdownPath,
  maintenanceCanonicalPatchApplicationGateRecordPath,
  maintenanceCanonicalPatchApplicationGateRecordsRoot,
  maintenanceCanonicalUpdateDecisionMarkdownPath,
  maintenanceCanonicalUpdateDecisionPath,
  maintenanceCanonicalUpdateDecisionsRoot,
  maintenanceCanonicalUpdateProposalMarkdownPath,
  maintenanceCanonicalUpdateProposalPath,
  maintenanceCanonicalUpdateProposalsRoot,
  maintenanceResolutionPath,
} from "./paths.js";
import { ensureMaintenancePolicyLedgerEntryForStoreArtifact } from "./ledger.js";
import { renderMaintenanceMarkdownDetailItem, renderMaintenanceMarkdownList } from "./maintenance-markdown.js";
import { buildCanonicalPatchTargetDescriptor } from "./canonical-patch-targets.js";
import { renderCanonicalPatchProposalOperationMarkdownDetails } from "./canonical-patch-operation-markdown.js";
import {
  buildNonExecutingCanonicalPatchApplicationAuthority,
  buildNonExecutingCanonicalPatchProposalAuthority,
  buildNonExecutingCanonicalUpdateDecisionAuthority,
  buildNonExecutingCanonicalUpdateProposalAuthority,
} from "./canonical-patch-application-authority.js";
import { buildCanonicalPatchDerivedOperationId, mergeCanonicalPatchTargetKinds } from "./canonical-patch-lineage.js";
import { canonicalPatchApplicationGateRecordSchema, canonicalPatchProposalSchema, canonicalUpdateDecisionSchema, canonicalUpdateProposalSchema } from "./schemas.js";
import { contentHash, uniqueSorted } from "./utils.js";

const canonicalUpdateProposalStore: MaintenanceArtifactStore<MaintenanceCanonicalUpdateProposal> = {
  root: maintenanceCanonicalUpdateProposalsRoot,
  jsonPath: maintenanceCanonicalUpdateProposalPath,
  markdownPath: maintenanceCanonicalUpdateProposalMarkdownPath,
  schema: canonicalUpdateProposalSchema,
};

const canonicalUpdateDecisionStore: MaintenanceArtifactStore<MaintenanceCanonicalUpdateDecision> = {
  root: maintenanceCanonicalUpdateDecisionsRoot,
  jsonPath: maintenanceCanonicalUpdateDecisionPath,
  markdownPath: maintenanceCanonicalUpdateDecisionMarkdownPath,
  schema: canonicalUpdateDecisionSchema,
};

export const canonicalPatchProposalStore: MaintenanceArtifactStore<MaintenanceCanonicalPatchProposal> = {
  root: maintenanceCanonicalPatchProposalsRoot,
  jsonPath: maintenanceCanonicalPatchProposalPath,
  markdownPath: maintenanceCanonicalPatchProposalMarkdownPath,
  schema: canonicalPatchProposalSchema,
};

export const canonicalPatchApplicationGateRecordStore: MaintenanceArtifactStore<MaintenanceCanonicalPatchApplicationGateRecord> = {
  root: maintenanceCanonicalPatchApplicationGateRecordsRoot,
  jsonPath: maintenanceCanonicalPatchApplicationGateRecordPath,
  markdownPath: maintenanceCanonicalPatchApplicationGateRecordMarkdownPath,
  schema: canonicalPatchApplicationGateRecordSchema,
};

export async function proposeMaintenanceCanonicalUpdate(
  memory: ResolvedMemory,
  resolutions: MaintenanceCandidateResolution[],
): Promise<MaintenanceCanonicalUpdateProposal | null> {
  const eligible = eligibleCanonicalUpdateResolutions(resolutions);
  if (eligible.length === 0) return null;
  const proposal = buildCanonicalUpdateProposal(memory, eligible);
  const existing = await readMaintenanceCanonicalUpdateProposal(memory, proposal.id);
  if (existing) {
    await ensureCanonicalUpdateProposalLedgerEntry(memory, existing);
    return existing;
  }
  await writeMaintenanceJsonMarkdownArtifact(
    memory,
    canonicalUpdateProposalStore,
    proposal.id,
    proposal,
    renderCanonicalUpdateProposalMarkdown(proposal),
  );
  await ensureCanonicalUpdateProposalLedgerEntry(memory, proposal);
  return proposal;
}

export function eligibleCanonicalUpdateResolutions(resolutions: MaintenanceCandidateResolution[]): MaintenanceCandidateResolution[] {
  return resolutions
    .filter((resolution) => resolution.canonicalUpdateRequired && resolution.humanGateRequired)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function readMaintenanceCanonicalUpdateProposal(
  memory: ResolvedMemory,
  proposalId: string,
): Promise<MaintenanceCanonicalUpdateProposal | null> {
  return readMaintenanceArtifact(memory, canonicalUpdateProposalStore, proposalId);
}

export async function listMaintenanceCanonicalUpdateProposals(memory: ResolvedMemory): Promise<MaintenanceCanonicalUpdateProposal[]> {
  return listMaintenanceArtifacts(memory, canonicalUpdateProposalStore);
}

export async function recordMaintenanceCanonicalUpdateDecision(
  memory: ResolvedMemory,
  proposalId: string,
): Promise<MaintenanceCanonicalUpdateDecision> {
  const proposal = await readMaintenanceCanonicalUpdateProposal(memory, proposalId);
  if (!proposal) throw new Error(`Maintenance canonical update proposal not found: ${proposalId}`);
  if (!proposal.humanGateRequired) throw new Error(`Maintenance canonical update proposal is not human-gated: ${proposalId}`);
  const existing = await readMaintenanceCanonicalUpdateDecisionForProposal(memory, proposalId);
  if (existing) {
    await ensureCanonicalUpdateDecisionLedgerEntry(memory, existing);
    return existing;
  }
  const decision = buildCanonicalUpdateDecision(memory, proposal);
  await writeMaintenanceJsonMarkdownArtifact(
    memory,
    canonicalUpdateDecisionStore,
    decision.id,
    decision,
    renderCanonicalUpdateDecisionMarkdown(decision),
  );
  await ensureCanonicalUpdateDecisionLedgerEntry(memory, decision);
  return decision;
}

export async function readMaintenanceCanonicalUpdateDecision(
  memory: ResolvedMemory,
  decisionId: string,
): Promise<MaintenanceCanonicalUpdateDecision | null> {
  return readMaintenanceArtifact(memory, canonicalUpdateDecisionStore, decisionId);
}

export async function listMaintenanceCanonicalUpdateDecisions(memory: ResolvedMemory): Promise<MaintenanceCanonicalUpdateDecision[]> {
  return listMaintenanceArtifacts(memory, canonicalUpdateDecisionStore);
}

export async function readMaintenanceCanonicalUpdateDecisionForProposal(
  memory: ResolvedMemory,
  proposalId: string,
): Promise<MaintenanceCanonicalUpdateDecision | null> {
  return findMaintenanceArtifactBy(memory, canonicalUpdateDecisionStore, (decision) => decision.proposalId === proposalId);
}

export async function proposeMaintenanceCanonicalPatch(
  memory: ResolvedMemory,
  decisionId: string,
): Promise<MaintenanceCanonicalPatchProposal> {
  const decision = await readMaintenanceCanonicalUpdateDecision(memory, decisionId);
  if (!decision) throw new Error(`Maintenance canonical update decision not found: ${decisionId}`);
  if (decision.decisionStatus !== "accepted-for-follow-up") {
    throw new Error(`Maintenance canonical update decision is not accepted for follow-up: ${decisionId}`);
  }
  const proposal = await readMaintenanceCanonicalUpdateProposal(memory, decision.proposalId);
  if (!proposal) throw new Error(`Maintenance canonical update proposal not found for decision ${decisionId}: ${decision.proposalId}`);
  const patchProposal = await buildCanonicalPatchProposal(memory, proposal, decision);
  const existing = await readMaintenanceCanonicalPatchProposal(memory, patchProposal.id);
  if (existing) {
    await ensureCanonicalPatchProposalLedgerEntry(memory, existing);
    return existing;
  }
  await writeMaintenanceJsonMarkdownArtifact(
    memory,
    canonicalPatchProposalStore,
    patchProposal.id,
    patchProposal,
    renderCanonicalPatchProposalMarkdown(patchProposal),
  );
  await ensureCanonicalPatchProposalLedgerEntry(memory, patchProposal);
  return patchProposal;
}

export async function readMaintenanceCanonicalPatchProposal(
  memory: ResolvedMemory,
  patchProposalId: string,
): Promise<MaintenanceCanonicalPatchProposal | null> {
  return readMaintenanceArtifact(memory, canonicalPatchProposalStore, patchProposalId);
}

export async function listMaintenanceCanonicalPatchProposals(memory: ResolvedMemory): Promise<MaintenanceCanonicalPatchProposal[]> {
  return listMaintenanceArtifacts(memory, canonicalPatchProposalStore);
}

export async function readMaintenanceCanonicalPatchProposalForDecision(
  memory: ResolvedMemory,
  decisionId: string,
): Promise<MaintenanceCanonicalPatchProposal | null> {
  return findMaintenanceArtifactBy(memory, canonicalPatchProposalStore, (proposal) => proposal.decisionId === decisionId);
}

export async function recordMaintenanceCanonicalPatchApplicationGate(
  memory: ResolvedMemory,
  patchProposalId: string,
): Promise<MaintenanceCanonicalPatchApplicationGateRecord> {
  const patchProposal = await readMaintenanceCanonicalPatchProposal(memory, patchProposalId);
  if (!patchProposal) throw new Error(`Maintenance canonical patch proposal not found: ${patchProposalId}`);
  if (!patchProposal.humanApplicationGateRequired) {
    throw new Error(`Maintenance canonical patch proposal is not human-gated: ${patchProposalId}`);
  }
  const existing = await readMaintenanceCanonicalPatchApplicationGateForPatchProposal(memory, patchProposalId);
  if (existing) {
    await ensureCanonicalPatchApplicationGateLedgerEntry(memory, existing);
    return existing;
  }
  const gateRecord = buildCanonicalPatchApplicationGateRecord(memory, patchProposal);
  await writeMaintenanceJsonMarkdownArtifact(
    memory,
    canonicalPatchApplicationGateRecordStore,
    gateRecord.id,
    gateRecord,
    renderCanonicalPatchApplicationGateMarkdown(gateRecord),
  );
  await ensureCanonicalPatchApplicationGateLedgerEntry(memory, gateRecord);
  return gateRecord;
}

export async function readMaintenanceCanonicalPatchApplicationGate(
  memory: ResolvedMemory,
  gateRecordId: string,
): Promise<MaintenanceCanonicalPatchApplicationGateRecord | null> {
  return readMaintenanceArtifact(memory, canonicalPatchApplicationGateRecordStore, gateRecordId);
}

export async function listMaintenanceCanonicalPatchApplicationGateRecords(memory: ResolvedMemory): Promise<MaintenanceCanonicalPatchApplicationGateRecord[]> {
  return listMaintenanceArtifacts(memory, canonicalPatchApplicationGateRecordStore);
}

export async function readMaintenanceCanonicalPatchApplicationGateForPatchProposal(
  memory: ResolvedMemory,
  patchProposalId: string,
): Promise<MaintenanceCanonicalPatchApplicationGateRecord | null> {
  return findMaintenanceArtifactBy(memory, canonicalPatchApplicationGateRecordStore, (record) => record.patchProposalId === patchProposalId);
}

export function maintenanceCanonicalUpdateProposalArtifactRef(memory: ResolvedMemory, proposalId: string): string {
  return buildMaintenanceArtifactRefsForStore(memory, canonicalUpdateProposalStore, proposalId).artifactRef;
}

export function maintenanceCanonicalUpdateDecisionArtifactRef(memory: ResolvedMemory, decisionId: string): string {
  return buildMaintenanceArtifactRefsForStore(memory, canonicalUpdateDecisionStore, decisionId).artifactRef;
}

export function maintenanceCanonicalPatchProposalArtifactRef(memory: ResolvedMemory, patchProposalId: string): string {
  return buildMaintenanceArtifactRefsForStore(memory, canonicalPatchProposalStore, patchProposalId).artifactRef;
}

export function maintenanceCanonicalPatchApplicationGateArtifactRef(memory: ResolvedMemory, gateRecordId: string): string {
  return buildMaintenanceArtifactRefsForStore(memory, canonicalPatchApplicationGateRecordStore, gateRecordId).artifactRef;
}

function buildCanonicalUpdateProposal(memory: ResolvedMemory, resolutions: MaintenanceCandidateResolution[]): MaintenanceCanonicalUpdateProposal {
  const resolutionIds = uniqueSorted(resolutions.map((resolution) => resolution.id));
  const id = `canonical-update-proposal-${contentHash(resolutionIds.join("|")).slice(0, 12)}`;
  const targetKinds = uniqueSorted(resolutions.map((resolution) => targetKindForSubtype(resolution.candidateSubtype))) as MaintenanceCanonicalUpdateTargetKind[];
  const artifactRefs = uniqueSorted([
    ...resolutions.map((resolution) => displayMaintenancePath(memory, maintenanceResolutionPath(memory, resolution.candidateId))),
    ...resolutions.flatMap((resolution) => resolution.artifactRefs),
  ]);
  return {
    version: "1.0",
    id,
    status: "proposed",
    resolutionIds,
    candidateIds: uniqueSorted(resolutions.map((resolution) => resolution.candidateId)),
    targetKinds,
    ...buildNonExecutingCanonicalUpdateProposalAuthority(),
    summary: `Prepare a human-gated canonical update proposal for ${resolutions.length} maintenance lifecycle resolution(s): ${targetKinds.join(", ")}.`,
    resolutionSummaries: resolutions.map((resolution) => ({
      resolutionId: resolution.id,
      candidateId: resolution.candidateId,
      outcome: resolution.outcome,
      candidateSubtype: resolution.candidateSubtype,
      reviewRecommendation: resolution.reviewRecommendation,
      rationale: resolution.rationale,
      ...(resolution.targetHints?.length ? { targetHints: resolution.targetHints } : {}),
      artifactRefs: resolution.artifactRefs,
    })),
    artifactRefs,
    createdAt: new Date().toISOString(),
  };
}

function buildCanonicalUpdateDecision(memory: ResolvedMemory, proposal: MaintenanceCanonicalUpdateProposal): MaintenanceCanonicalUpdateDecision {
  const id = `canonical-update-decision-${contentHash(proposal.id).slice(0, 12)}`;
  return {
    version: "1.0",
    id,
    proposalId: proposal.id,
    decisionStatus: "accepted-for-follow-up",
    targetKinds: proposal.targetKinds,
    ...buildNonExecutingCanonicalUpdateDecisionAuthority(),
    summary: `Human-gated maintenance decision recorded for proposal ${proposal.id}. This decision accepts the proposal as follow-up input only and does not authorize canonical rewrites.`,
    artifactRefs: buildMaintenanceArtifactRefListForStores(memory, [
      { store: canonicalUpdateProposalStore, id: proposal.id },
    ], proposal.artifactRefs),
    createdAt: new Date().toISOString(),
  };
}

async function buildCanonicalPatchProposal(
  memory: ResolvedMemory,
  proposal: MaintenanceCanonicalUpdateProposal,
  decision: MaintenanceCanonicalUpdateDecision,
): Promise<MaintenanceCanonicalPatchProposal> {
  const id = `canonical-patch-proposal-${contentHash(`${proposal.id}|${decision.id}`).slice(0, 12)}`;
  const operations = await Promise.all(proposal.resolutionSummaries.map(async (resolution, index): Promise<MaintenanceCanonicalPatchOperation> => {
    const targetKind = targetKindForSubtype(resolution.candidateSubtype);
    const targetDescriptor = await buildCanonicalPatchTargetDescriptor(memory, targetKind, resolution.targetHints);
    return {
      id: buildCanonicalPatchDerivedOperationId(id, index),
      targetKind,
      operation: resolution.outcome,
      sourceResolutionId: resolution.resolutionId,
      sourceCandidateId: resolution.candidateId,
      ...(targetDescriptor ? { targetDescriptor } : {}),
      summary: `Prepare ${resolution.outcome} update candidate for ${targetKind} from maintenance resolution ${resolution.resolutionId}.`,
      rationale: resolution.rationale,
      artifactRefs: resolution.artifactRefs,
    };
  }));
  const artifactRefs = buildMaintenanceArtifactRefListForStores(memory, [
    { store: canonicalUpdateProposalStore, id: proposal.id },
    { store: canonicalUpdateDecisionStore, id: decision.id },
  ], [
    ...proposal.artifactRefs,
    ...decision.artifactRefs,
    ...operations.flatMap((operation) => operation.artifactRefs),
  ]);
  return {
    version: "1.0",
    id,
    status: "patch-proposed",
    proposalId: proposal.id,
    decisionId: decision.id,
    targetKinds: mergeCanonicalPatchTargetKinds(proposal.targetKinds, operations.map((operation) => operation.targetKind)),
    operationCount: operations.length,
    operations,
    ...buildNonExecutingCanonicalPatchProposalAuthority(),
    humanApplicationGateRequired: true,
    summary: `Prepare non-executing canonical patch proposal for decision ${decision.id} and proposal ${proposal.id}.`,
    risks: [
      "Patch proposal evidence can be mistaken for canonical application unless authority flags remain false.",
      "A later application gate must revalidate targets, ToolPolicyGate, and human confirmation before any canonical mutation.",
    ],
    artifactRefs,
    createdAt: new Date().toISOString(),
  };
}

function buildCanonicalPatchApplicationGateRecord(
  memory: ResolvedMemory,
  patchProposal: MaintenanceCanonicalPatchProposal,
): MaintenanceCanonicalPatchApplicationGateRecord {
  const id = `canonical-patch-application-gate-${contentHash(patchProposal.id).slice(0, 12)}`;
  return {
    version: "1.0",
    id,
    patchProposalId: patchProposal.id,
    proposalId: patchProposal.proposalId,
    decisionId: patchProposal.decisionId,
    decisionStatus: "accepted-for-application-follow-up",
    targetKinds: patchProposal.targetKinds,
    operationCount: patchProposal.operationCount,
    ...buildNonExecutingCanonicalPatchApplicationAuthority(),
    summary: `Human-gated canonical patch application follow-up recorded for patch proposal ${patchProposal.id}. This gate record does not apply canonical changes.`,
    risks: [
      "Gate evidence can be mistaken for canonical application unless applied and mutation flags remain false.",
      "A later deterministic canonical application implementation must revalidate this gate, ToolPolicyGate, and human confirmation before any write.",
    ],
    artifactRefs: buildMaintenanceArtifactRefListForStores(memory, [
      { store: canonicalPatchProposalStore, id: patchProposal.id },
    ], patchProposal.artifactRefs),
    createdAt: new Date().toISOString(),
  };
}

async function ensureCanonicalUpdateProposalLedgerEntry(
  memory: ResolvedMemory,
  proposal: MaintenanceCanonicalUpdateProposal,
): Promise<void> {
  await ensureMaintenancePolicyLedgerEntryForStoreArtifact(memory, {
    store: canonicalUpdateProposalStore,
    id: proposal.id,
    eventType: "canonical-update-proposal",
    summary: proposal.summary,
  });
}

async function ensureCanonicalUpdateDecisionLedgerEntry(
  memory: ResolvedMemory,
  decision: MaintenanceCanonicalUpdateDecision,
): Promise<void> {
  await ensureMaintenancePolicyLedgerEntryForStoreArtifact(memory, {
    store: canonicalUpdateDecisionStore,
    id: decision.id,
    eventType: "canonical-update-decision",
    summary: decision.summary,
  });
}

async function ensureCanonicalPatchProposalLedgerEntry(
  memory: ResolvedMemory,
  patchProposal: MaintenanceCanonicalPatchProposal,
): Promise<void> {
  await ensureMaintenancePolicyLedgerEntryForStoreArtifact(memory, {
    store: canonicalPatchProposalStore,
    id: patchProposal.id,
    eventType: "canonical-patch-proposal",
    summary: patchProposal.summary,
  });
}

async function ensureCanonicalPatchApplicationGateLedgerEntry(
  memory: ResolvedMemory,
  gateRecord: MaintenanceCanonicalPatchApplicationGateRecord,
): Promise<void> {
  await ensureMaintenancePolicyLedgerEntryForStoreArtifact(memory, {
    store: canonicalPatchApplicationGateRecordStore,
    id: gateRecord.id,
    eventType: "canonical-patch-application-gate",
    summary: gateRecord.summary,
  });
}

function renderCanonicalUpdateProposalMarkdown(proposal: MaintenanceCanonicalUpdateProposal): string {
  return [
    `# ${proposal.id}`,
    "",
    proposal.summary,
    "",
    "## Authority",
    "",
    "- Classification: non-executing maintenance proposal evidence.",
    "- Human gate required: true.",
    "- Canonical update authorized: false.",
    "- This proposal does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, or Harness evolution state.",
    "",
    "## Target Kinds",
    "",
    ...renderMaintenanceMarkdownList(proposal.targetKinds),
    "",
    "## Resolutions",
    "",
    ...proposal.resolutionSummaries.flatMap((resolution) => renderMaintenanceMarkdownDetailItem(
      `${resolution.resolutionId} (${resolution.outcome})`,
      [
        `candidate: ${resolution.candidateId}`,
        `subtype: ${resolution.candidateSubtype ?? "maintenance"}`,
        `review: ${resolution.reviewRecommendation}`,
        `rationale: ${resolution.rationale.replace(/\r?\n/g, " ")}`,
      ],
    )),
    "",
    "## Evidence",
    "",
    ...renderMaintenanceMarkdownList(proposal.artifactRefs),
    "",
  ].join("\n");
}

function renderCanonicalUpdateDecisionMarkdown(decision: MaintenanceCanonicalUpdateDecision): string {
  return [
    `# ${decision.id}`,
    "",
    decision.summary,
    "",
    "## Authority",
    "",
    "- Classification: human-gated maintenance decision evidence.",
    "- Decision status: accepted-for-follow-up.",
    "- Source mutation authorized: false.",
    "- Canonical update authorized: false.",
    "- Execution started: false.",
    "- This decision does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, or Harness evolution state.",
    "",
    "## Proposal",
    "",
    `- ${decision.proposalId}`,
    "",
    "## Target Kinds",
    "",
    ...renderMaintenanceMarkdownList(decision.targetKinds),
    "",
    "## Evidence",
    "",
    ...renderMaintenanceMarkdownList(decision.artifactRefs),
    "",
  ].join("\n");
}

function renderCanonicalPatchProposalMarkdown(patchProposal: MaintenanceCanonicalPatchProposal): string {
  return [
    `# ${patchProposal.id}`,
    "",
    patchProposal.summary,
    "",
    "## Authority",
    "",
    "- Classification: non-executing canonical patch proposal evidence.",
    "- Source mutation authorized: false.",
    "- Canonical update authorized: false.",
    "- Application authorized: false.",
    "- Execution started: false.",
    "- Human application gate required: true.",
    "- This patch proposal does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, remote state, or Harness evolution state.",
    "",
    "## Sources",
    "",
    `- Proposal: ${patchProposal.proposalId}`,
    `- Decision: ${patchProposal.decisionId}`,
    "",
    "## Target Kinds",
    "",
    ...renderMaintenanceMarkdownList(patchProposal.targetKinds),
    "",
    "## Proposed Operations",
    "",
    ...patchProposal.operations.flatMap(renderCanonicalPatchProposalOperationMarkdownDetails),
    "",
    "## Risks",
    "",
    ...renderMaintenanceMarkdownList(patchProposal.risks),
    "",
    "## Evidence",
    "",
    ...renderMaintenanceMarkdownList(patchProposal.artifactRefs),
    "",
  ].join("\n");
}

function renderCanonicalPatchApplicationGateMarkdown(gateRecord: MaintenanceCanonicalPatchApplicationGateRecord): string {
  return [
    `# ${gateRecord.id}`,
    "",
    gateRecord.summary,
    "",
    "## Authority",
    "",
    "- Classification: human-gated canonical patch application follow-up evidence.",
    "- Decision status: accepted-for-application-follow-up.",
    "- Source mutation authorized: false.",
    "- Canonical update applied: false.",
    "- Canonical patch applied: false.",
    "- Execution started: false.",
    "- This gate record does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, remote state, or Harness evolution state.",
    "",
    "## Sources",
    "",
    `- Patch proposal: ${gateRecord.patchProposalId}`,
    `- Proposal: ${gateRecord.proposalId}`,
    `- Decision: ${gateRecord.decisionId}`,
    "",
    "## Target Kinds",
    "",
    ...renderMaintenanceMarkdownList(gateRecord.targetKinds),
    "",
    "## Risks",
    "",
    ...renderMaintenanceMarkdownList(gateRecord.risks),
    "",
    "## Evidence",
    "",
    ...renderMaintenanceMarkdownList(gateRecord.artifactRefs),
    "",
  ].join("\n");
}

function targetKindForSubtype(subtype: MaintenanceCandidateSubtype | undefined): MaintenanceCanonicalUpdateTargetKind {
  if (subtype === "docs-drift" || subtype === "doc-budget") return "canonical-docs";
  if (subtype === "harness-evolution") return "harness-evolution";
  if (subtype === "reference-drift") return "reference";
  if (subtype === "stable-memory" || subtype === "reusable-lesson") return "stable-memory";
  return "maintenance";
}
