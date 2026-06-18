import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
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
  displayMaintenancePath,
  maintenanceCanonicalPatchProposalMarkdownPath,
  maintenanceCanonicalPatchProposalPath,
  maintenanceCanonicalPatchProposalsRoot,
  maintenanceCanonicalUpdateDecisionMarkdownPath,
  maintenanceCanonicalUpdateDecisionPath,
  maintenanceCanonicalUpdateDecisionsRoot,
  maintenanceCanonicalUpdateProposalMarkdownPath,
  maintenanceCanonicalUpdateProposalPath,
  maintenanceCanonicalUpdateProposalsRoot,
  maintenanceResolutionPath,
} from "./paths.js";
import { listMaintenanceLedgerEntries, recordMaintenanceLedgerEntry } from "./ledger.js";
import { canonicalPatchProposalSchema, canonicalUpdateDecisionSchema, canonicalUpdateProposalSchema } from "./schemas.js";
import { contentHash, uniqueSorted } from "./utils.js";

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
  canonicalUpdateProposalSchema.parse(proposal);
  await writeJsonFile(maintenanceCanonicalUpdateProposalPath(memory, proposal.id), proposal);
  await writeFile(maintenanceCanonicalUpdateProposalMarkdownPath(memory, proposal.id), renderCanonicalUpdateProposalMarkdown(proposal), "utf8");
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
  const path = maintenanceCanonicalUpdateProposalPath(memory, proposalId);
  if (!existsSync(path)) return null;
  return readJsonFile(path, canonicalUpdateProposalSchema, null as unknown as MaintenanceCanonicalUpdateProposal).catch(() => null);
}

export async function listMaintenanceCanonicalUpdateProposals(memory: ResolvedMemory): Promise<MaintenanceCanonicalUpdateProposal[]> {
  const root = maintenanceCanonicalUpdateProposalsRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const proposals: MaintenanceCanonicalUpdateProposal[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const proposal = await readJsonFile(join(root, entry.name), canonicalUpdateProposalSchema, null as unknown as MaintenanceCanonicalUpdateProposal).catch(() => null);
    if (proposal) proposals.push(proposal);
  }
  return proposals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
  canonicalUpdateDecisionSchema.parse(decision);
  await writeJsonFile(maintenanceCanonicalUpdateDecisionPath(memory, decision.id), decision);
  await writeFile(maintenanceCanonicalUpdateDecisionMarkdownPath(memory, decision.id), renderCanonicalUpdateDecisionMarkdown(decision), "utf8");
  await ensureCanonicalUpdateDecisionLedgerEntry(memory, decision);
  return decision;
}

export async function readMaintenanceCanonicalUpdateDecision(
  memory: ResolvedMemory,
  decisionId: string,
): Promise<MaintenanceCanonicalUpdateDecision | null> {
  const path = maintenanceCanonicalUpdateDecisionPath(memory, decisionId);
  if (!existsSync(path)) return null;
  return readJsonFile(path, canonicalUpdateDecisionSchema, null as unknown as MaintenanceCanonicalUpdateDecision).catch(() => null);
}

export async function listMaintenanceCanonicalUpdateDecisions(memory: ResolvedMemory): Promise<MaintenanceCanonicalUpdateDecision[]> {
  const root = maintenanceCanonicalUpdateDecisionsRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const decisions: MaintenanceCanonicalUpdateDecision[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const decision = await readJsonFile(join(root, entry.name), canonicalUpdateDecisionSchema, null as unknown as MaintenanceCanonicalUpdateDecision).catch(() => null);
    if (decision) decisions.push(decision);
  }
  return decisions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readMaintenanceCanonicalUpdateDecisionForProposal(
  memory: ResolvedMemory,
  proposalId: string,
): Promise<MaintenanceCanonicalUpdateDecision | null> {
  const decisions = await listMaintenanceCanonicalUpdateDecisions(memory);
  return decisions.find((decision) => decision.proposalId === proposalId) ?? null;
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
  const patchProposal = buildCanonicalPatchProposal(memory, proposal, decision);
  const existing = await readMaintenanceCanonicalPatchProposal(memory, patchProposal.id);
  if (existing) {
    await ensureCanonicalPatchProposalLedgerEntry(memory, existing);
    return existing;
  }
  canonicalPatchProposalSchema.parse(patchProposal);
  await writeJsonFile(maintenanceCanonicalPatchProposalPath(memory, patchProposal.id), patchProposal);
  await writeFile(maintenanceCanonicalPatchProposalMarkdownPath(memory, patchProposal.id), renderCanonicalPatchProposalMarkdown(patchProposal), "utf8");
  await ensureCanonicalPatchProposalLedgerEntry(memory, patchProposal);
  return patchProposal;
}

export async function readMaintenanceCanonicalPatchProposal(
  memory: ResolvedMemory,
  patchProposalId: string,
): Promise<MaintenanceCanonicalPatchProposal | null> {
  const path = maintenanceCanonicalPatchProposalPath(memory, patchProposalId);
  if (!existsSync(path)) return null;
  return readJsonFile(path, canonicalPatchProposalSchema, null as unknown as MaintenanceCanonicalPatchProposal).catch(() => null);
}

export async function listMaintenanceCanonicalPatchProposals(memory: ResolvedMemory): Promise<MaintenanceCanonicalPatchProposal[]> {
  const root = maintenanceCanonicalPatchProposalsRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const patchProposals: MaintenanceCanonicalPatchProposal[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const patchProposal = await readJsonFile(join(root, entry.name), canonicalPatchProposalSchema, null as unknown as MaintenanceCanonicalPatchProposal).catch(() => null);
    if (patchProposal) patchProposals.push(patchProposal);
  }
  return patchProposals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readMaintenanceCanonicalPatchProposalForDecision(
  memory: ResolvedMemory,
  decisionId: string,
): Promise<MaintenanceCanonicalPatchProposal | null> {
  const patchProposals = await listMaintenanceCanonicalPatchProposals(memory);
  return patchProposals.find((proposal) => proposal.decisionId === decisionId) ?? null;
}

export function maintenanceCanonicalUpdateProposalArtifactRef(memory: ResolvedMemory, proposalId: string): string {
  return displayMaintenancePath(memory, maintenanceCanonicalUpdateProposalPath(memory, proposalId));
}

export function maintenanceCanonicalUpdateDecisionArtifactRef(memory: ResolvedMemory, decisionId: string): string {
  return displayMaintenancePath(memory, maintenanceCanonicalUpdateDecisionPath(memory, decisionId));
}

export function maintenanceCanonicalPatchProposalArtifactRef(memory: ResolvedMemory, patchProposalId: string): string {
  return displayMaintenancePath(memory, maintenanceCanonicalPatchProposalPath(memory, patchProposalId));
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
    humanGateRequired: true,
    canonicalUpdateAuthorized: false,
    summary: `Prepare a human-gated canonical update proposal for ${resolutions.length} maintenance lifecycle resolution(s): ${targetKinds.join(", ")}.`,
    resolutionSummaries: resolutions.map((resolution) => ({
      resolutionId: resolution.id,
      candidateId: resolution.candidateId,
      outcome: resolution.outcome,
      candidateSubtype: resolution.candidateSubtype,
      reviewRecommendation: resolution.reviewRecommendation,
      rationale: resolution.rationale,
      artifactRefs: resolution.artifactRefs,
    })),
    artifactRefs,
    createdAt: new Date().toISOString(),
  };
}

function buildCanonicalUpdateDecision(memory: ResolvedMemory, proposal: MaintenanceCanonicalUpdateProposal): MaintenanceCanonicalUpdateDecision {
  const id = `canonical-update-decision-${contentHash(proposal.id).slice(0, 12)}`;
  const proposalRefs = [
    maintenanceCanonicalUpdateProposalArtifactRef(memory, proposal.id),
    displayMaintenancePath(memory, maintenanceCanonicalUpdateProposalMarkdownPath(memory, proposal.id)),
  ];
  return {
    version: "1.0",
    id,
    proposalId: proposal.id,
    decisionStatus: "accepted-for-follow-up",
    targetKinds: proposal.targetKinds,
    sourceMutationAuthorized: false,
    canonicalUpdateAuthorized: false,
    executionStarted: false,
    summary: `Human-gated maintenance decision recorded for proposal ${proposal.id}. This decision accepts the proposal as follow-up input only and does not authorize canonical rewrites.`,
    artifactRefs: uniqueSorted([...proposalRefs, ...proposal.artifactRefs]),
    createdAt: new Date().toISOString(),
  };
}

function buildCanonicalPatchProposal(
  memory: ResolvedMemory,
  proposal: MaintenanceCanonicalUpdateProposal,
  decision: MaintenanceCanonicalUpdateDecision,
): MaintenanceCanonicalPatchProposal {
  const id = `canonical-patch-proposal-${contentHash(`${proposal.id}|${decision.id}`).slice(0, 12)}`;
  const proposalRefs = [
    maintenanceCanonicalUpdateProposalArtifactRef(memory, proposal.id),
    displayMaintenancePath(memory, maintenanceCanonicalUpdateProposalMarkdownPath(memory, proposal.id)),
    maintenanceCanonicalUpdateDecisionArtifactRef(memory, decision.id),
    displayMaintenancePath(memory, maintenanceCanonicalUpdateDecisionMarkdownPath(memory, decision.id)),
  ];
  const operations = proposal.resolutionSummaries.map((resolution, index): MaintenanceCanonicalPatchOperation => {
    const targetKind = targetKindForSubtype(resolution.candidateSubtype);
    return {
      id: `${id}-operation-${String(index + 1).padStart(3, "0")}`,
      targetKind,
      operation: resolution.outcome,
      sourceResolutionId: resolution.resolutionId,
      sourceCandidateId: resolution.candidateId,
      summary: `Prepare ${resolution.outcome} update candidate for ${targetKind} from maintenance resolution ${resolution.resolutionId}.`,
      rationale: resolution.rationale,
      artifactRefs: resolution.artifactRefs,
    };
  });
  const artifactRefs = uniqueSorted([
    ...proposalRefs,
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
    targetKinds: uniqueSorted([...proposal.targetKinds, ...operations.map((operation) => operation.targetKind)]) as MaintenanceCanonicalUpdateTargetKind[],
    operationCount: operations.length,
    operations,
    sourceMutationAuthorized: false,
    canonicalUpdateAuthorized: false,
    applicationAuthorized: false,
    executionStarted: false,
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

async function ensureCanonicalUpdateProposalLedgerEntry(
  memory: ResolvedMemory,
  proposal: MaintenanceCanonicalUpdateProposal,
): Promise<void> {
  const proposalRef = maintenanceCanonicalUpdateProposalArtifactRef(memory, proposal.id);
  const entries = await listMaintenanceLedgerEntries(memory);
  if (entries.some((entry) => entry.eventType === "canonical-update-proposal" && entry.artifactRefs.includes(proposalRef))) {
    return;
  }
  await recordMaintenanceLedgerEntry(memory, {
    eventType: "canonical-update-proposal",
    summary: `${proposal.summary} This ledger entry is evidence only and does not authorize canonical rewrites.`,
    artifactRefs: [
      proposalRef,
      displayMaintenancePath(memory, maintenanceCanonicalUpdateProposalMarkdownPath(memory, proposal.id)),
    ],
  });
}

async function ensureCanonicalUpdateDecisionLedgerEntry(
  memory: ResolvedMemory,
  decision: MaintenanceCanonicalUpdateDecision,
): Promise<void> {
  const decisionRef = maintenanceCanonicalUpdateDecisionArtifactRef(memory, decision.id);
  const entries = await listMaintenanceLedgerEntries(memory);
  if (entries.some((entry) => entry.eventType === "canonical-update-decision" && entry.artifactRefs.includes(decisionRef))) {
    return;
  }
  await recordMaintenanceLedgerEntry(memory, {
    eventType: "canonical-update-decision",
    summary: `${decision.summary} This ledger entry is evidence only and does not authorize canonical rewrites.`,
    artifactRefs: [
      decisionRef,
      displayMaintenancePath(memory, maintenanceCanonicalUpdateDecisionMarkdownPath(memory, decision.id)),
    ],
  });
}

async function ensureCanonicalPatchProposalLedgerEntry(
  memory: ResolvedMemory,
  patchProposal: MaintenanceCanonicalPatchProposal,
): Promise<void> {
  const patchProposalRef = maintenanceCanonicalPatchProposalArtifactRef(memory, patchProposal.id);
  const entries = await listMaintenanceLedgerEntries(memory);
  if (entries.some((entry) => entry.eventType === "canonical-patch-proposal" && entry.artifactRefs.includes(patchProposalRef))) {
    return;
  }
  await recordMaintenanceLedgerEntry(memory, {
    eventType: "canonical-patch-proposal",
    summary: `${patchProposal.summary} This ledger entry is evidence only and does not authorize canonical application.`,
    artifactRefs: [
      patchProposalRef,
      displayMaintenancePath(memory, maintenanceCanonicalPatchProposalMarkdownPath(memory, patchProposal.id)),
    ],
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
    ...proposal.targetKinds.map((kind) => `- ${kind}`),
    "",
    "## Resolutions",
    "",
    ...proposal.resolutionSummaries.map((resolution) => [
      `- ${resolution.resolutionId} (${resolution.outcome})`,
      `  candidate: ${resolution.candidateId}`,
      `  subtype: ${resolution.candidateSubtype ?? "maintenance"}`,
      `  review: ${resolution.reviewRecommendation}`,
      `  rationale: ${resolution.rationale.replace(/\r?\n/g, " ")}`,
    ].join("\n")),
    "",
    "## Evidence",
    "",
    ...proposal.artifactRefs.map((ref) => `- ${ref}`),
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
    ...decision.targetKinds.map((kind) => `- ${kind}`),
    "",
    "## Evidence",
    "",
    ...decision.artifactRefs.map((ref) => `- ${ref}`),
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
    ...patchProposal.targetKinds.map((kind) => `- ${kind}`),
    "",
    "## Proposed Operations",
    "",
    ...patchProposal.operations.map((operation) => [
      `- ${operation.id}: ${operation.operation} ${operation.targetKind}`,
      `  resolution: ${operation.sourceResolutionId}`,
      `  candidate: ${operation.sourceCandidateId}`,
      `  summary: ${operation.summary}`,
      `  rationale: ${operation.rationale.replace(/\r?\n/g, " ")}`,
    ].join("\n")),
    "",
    "## Risks",
    "",
    ...patchProposal.risks.map((risk) => `- ${risk}`),
    "",
    "## Evidence",
    "",
    ...patchProposal.artifactRefs.map((ref) => `- ${ref}`),
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
