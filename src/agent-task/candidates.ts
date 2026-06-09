import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  CandidateReview,
  CandidateScore,
  DemandMemoryCloseout,
  EvolutionCandidate,
  MaintenanceLedgerEntry,
  MaintenanceLedgerEventType,
  ResolvedMemory,
} from "../types/index.js";
import { TERMINAL_REVIEW_WINDOW } from "./constants.js";
import { checkDocBudgets } from "./doc-budget.js";
import { listMaintenanceLedgerEntries } from "./ledger.js";
import { displayMaintenancePath, maintenanceRoot } from "./paths.js";
import { candidateSchema, reviewSchema, scoreSchema } from "./schemas.js";
import { contentHash, uniqueSorted } from "./utils.js";

export async function createEvolutionCandidate(memory: ResolvedMemory, entries: MaintenanceLedgerEntry[]): Promise<EvolutionCandidate | null> {
  if (entries.length === 0) return null;
  const latest = entries.at(-1) as MaintenanceLedgerEntry;
  const subtype = candidateSubtypeForEvent(latest.eventType);
  const fingerprint = contentHash(`${subtype}:${entries.map((entry) => entry.changeId ?? entry.id).join("|")}:${latest.summary}`);
  const candidate: EvolutionCandidate = {
    version: "1.0",
    id: `candidate-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    sourceLedgerEntryIds: entries.map((entry) => entry.id),
    subtype,
    fingerprint,
    title: `Maintenance candidate from ${latest.eventType}`,
    summary: entries.map((entry) => `${entry.eventType}: ${entry.summary}`).join("\n"),
    artifactRefs: entries.flatMap((entry) => entry.artifactRefs),
    status: "candidate",
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(maintenanceRoot(memory), "candidates", `${candidate.id}.json`), candidate);
  candidateSchema.parse(candidate);
  return candidate;
}

export async function scoreEvolutionCandidate(memory: ResolvedMemory, candidate: EvolutionCandidate): Promise<CandidateScore> {
  const evidenceStrength = Math.min(30, candidate.artifactRefs.length * 5);
  const reuseValue = candidate.subtype === "reusable-lesson" || candidate.subtype === "stable-memory" ? 25 : 15;
  const repeatedOccurrence = Math.min(20, candidate.sourceLedgerEntryIds.length * 4);
  const docsCoverage = candidate.subtype === "docs-drift" || candidate.subtype === "doc-budget" ? 15 : 10;
  const staleRiskPenalty = /superseded|stale|temporary|one-off/i.test(candidate.summary) ? -15 : 0;
  const scoreValue = Math.max(0, Math.min(100, 30 + evidenceStrength + reuseValue + repeatedOccurrence + docsCoverage + staleRiskPenalty));
  const score: CandidateScore = {
    version: "1.0",
    candidateId: candidate.id,
    score: scoreValue,
    rationale: "Heuristic v1 score based on evidence strength, reuse value, recurrence, docs coverage, and stale-memory risk. This remains advisory only.",
    risks: [
      "Scoring is deterministic v1 and does not replace human review.",
      "Canonical docs, ECL rules, curated stable memory, product roadmap, and source root are not modified by this score.",
    ],
    confidence: candidate.sourceLedgerEntryIds.length >= TERMINAL_REVIEW_WINDOW || candidate.artifactRefs.length >= 3 ? "medium" : "low",
    dimensions: {
      evidenceStrength,
      reuseValue,
      repeatedOccurrence,
      docsCoverage,
      staleRiskPenalty,
    },
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(maintenanceRoot(memory), "scores", `${candidate.id}.json`), score);
  scoreSchema.parse(score);
  return score;
}

export async function reviewEvolutionCandidate(memory: ResolvedMemory, candidate: EvolutionCandidate, score: CandidateScore): Promise<CandidateReview> {
  const recommendation = score.score >= 85
    ? "needs-human-review"
    : score.score >= 70
      ? "accept"
      : score.score >= 40
        ? "defer"
        : "reject";
  const review: CandidateReview = {
    version: "1.0",
    candidateId: candidate.id,
    recommendation,
    summary: recommendation === "needs-human-review"
      ? "Candidate has strong evidence and should be shown in project maintenance, not the current demand confirmation queue."
      : recommendation === "accept"
        ? "Candidate is useful enough for a future human-gated maintenance proposal."
        : recommendation === "defer"
          ? "Candidate should remain deferred until more evidence accumulates."
          : "Candidate is too weak or too risky to promote.",
    evidenceRefs: candidate.artifactRefs,
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(maintenanceRoot(memory), "reviews", `${candidate.id}.json`), review);
  reviewSchema.parse(review);
  return review;
}

export async function runMaintenanceCandidatePipeline(memory: ResolvedMemory): Promise<{
  status: "skipped" | "reviewed";
  candidate?: EvolutionCandidate;
  score?: CandidateScore;
  review?: CandidateReview;
}> {
  const entries = await listMaintenanceLedgerEntries(memory);
  if (entries.length === 0) return { status: "skipped" };
  const candidate = await createEvolutionCandidate(memory, entries.slice(-10));
  if (!candidate) return { status: "skipped" };
  const score = await scoreEvolutionCandidate(memory, candidate);
  const review = await reviewEvolutionCandidate(memory, candidate, score);
  return { status: "reviewed", candidate, score, review };
}

export async function createMaintenanceCandidatesForWindow(memory: ResolvedMemory, closeouts: DemandMemoryCloseout[], ledgerEntries: MaintenanceLedgerEntry[]): Promise<EvolutionCandidate[]> {
  const candidates: EvolutionCandidate[] = [];
  const seen = new Set<string>();
  const ledgerIds = ledgerEntries.map((entry) => entry.id);
  const addCandidate = async (input: { subtype: EvolutionCandidate["subtype"]; fingerprint: string; title: string; summary: string; artifactRefs: string[] }) => {
    if (seen.has(input.fingerprint)) return;
    seen.add(input.fingerprint);
    const existing = await findCandidateByFingerprint(memory, input.fingerprint);
    if (existing) return;
    const candidate: EvolutionCandidate = {
      version: "1.0",
      id: `candidate-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      sourceLedgerEntryIds: ledgerIds,
      subtype: input.subtype,
      fingerprint: input.fingerprint,
      title: input.title,
      summary: input.summary,
      artifactRefs: uniqueSorted(input.artifactRefs),
      status: "candidate",
      createdAt: new Date().toISOString(),
    };
    candidateSchema.parse(candidate);
    await writeJsonFile(join(maintenanceRoot(memory), "candidates", `${candidate.id}.json`), candidate);
    candidates.push(candidate);
  };

  for (const lesson of closeouts.flatMap((closeout) => closeout.reusableLessonCandidates)) {
    if (lesson.status === "superseded") continue;
    await addCandidate({
      subtype: "reusable-lesson",
      fingerprint: lesson.fingerprint,
      title: "Reusable project lesson",
      summary: lesson.summary,
      artifactRefs: lesson.evidenceRefs,
    });
  }
  for (const drift of closeouts.flatMap((closeout) => closeout.docsDriftCandidates)) {
    if (drift.status === "superseded") continue;
    await addCandidate({
      subtype: "docs-drift",
      fingerprint: drift.fingerprint,
      title: `Documentation drift candidate for ${drift.document}`,
      summary: drift.summary,
      artifactRefs: drift.evidenceRefs,
    });
  }
  const docBudget = await checkDocBudgets(memory);
  for (const doc of docBudget.documents.filter((item) => item.status !== "ok")) {
    await addCandidate({
      subtype: "doc-budget",
      fingerprint: contentHash(`doc-budget:${doc.path}:${doc.status}`),
      title: `Document budget candidate for ${doc.path}`,
      summary: `${doc.path} is ${doc.status} (${doc.wordCount}/${doc.hardLimit} estimated words). Prepare a refinement proposal; do not rewrite canonical docs automatically.`,
      artifactRefs: [displayMaintenancePath(memory, join(maintenanceRoot(memory), "doc-budgets", `${docBudget.id}.json`))],
    });
  }
  if (candidates.length === 0) {
    await addCandidate({
      subtype: "stable-memory",
      fingerprint: contentHash(`stable-memory:${closeouts.map((closeout) => closeout.changeId).join("|")}`),
      title: "Maintenance review completed with no strong reusable lesson",
      summary: "The latest terminal changes were reviewed. No canonical docs, ECL rules, curated stable memory, or source files were modified.",
      artifactRefs: closeouts.flatMap((closeout) => closeout.evidenceRefs),
    });
  }
  return candidates;
}

async function findCandidateByFingerprint(memory: ResolvedMemory, fingerprint: string): Promise<EvolutionCandidate | null> {
  const root = join(maintenanceRoot(memory), "candidates");
  if (!existsSync(root)) return null;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const candidate = await readJsonFile(join(root, entry.name), candidateSchema, null as unknown as EvolutionCandidate).catch(() => null);
    if (candidate?.fingerprint === fingerprint) return candidate;
  }
  return null;
}

function candidateSubtypeForEvent(eventType: MaintenanceLedgerEventType): EvolutionCandidate["subtype"] {
  if (eventType === "doc-drift") return "docs-drift";
  if (eventType === "reference-drift") return "reference-drift";
  if (eventType === "harness-evolution") return "harness-evolution";
  if (eventType === "change-closeout" || eventType === "maintenance-review") return "stable-memory";
  return "reusable-lesson";
}
