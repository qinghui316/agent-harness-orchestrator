import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  CandidateReview,
  CandidateScore,
  DemandMemoryCloseout,
  DocBudgetReport,
  EvolutionCandidate,
  MaintenanceReviewRun,
  MaintenanceReviewWatermark,
  ResolvedMemory,
} from "../types/index.js";
import { TERMINAL_REVIEW_WINDOW } from "./constants.js";
import { createMaintenanceCandidatesForWindow, reviewEvolutionCandidate, scoreEvolutionCandidate } from "./candidates.js";
import { checkDocBudgets } from "./doc-budget.js";
import { listMaintenanceLedgerEntries, recordMaintenanceLedgerEntry } from "./ledger.js";
import {
  closeoutsRoot,
  coldArchiveIndexPath,
  displayMaintenancePath,
  maintenanceRoot,
  warmIndexPath,
  watermarkPath,
} from "./paths.js";
import { maintenanceReviewRunSchema, watermarkSchema } from "./schemas.js";
import { listDemandMemoryCloseouts, refreshMaintenanceIndexes } from "./closeout-store.js";
import { closeoutReviewKey, contentHash, uniqueSorted } from "./utils.js";

export async function readMaintenanceReviewWatermark(memory: ResolvedMemory): Promise<MaintenanceReviewWatermark> {
  return readJsonFile(watermarkPath(memory), watermarkSchema, {
    version: "1.0",
    lastReviewedChangeIds: [],
    lastReviewedArchiveIndex: 0,
    lastReviewWindowId: null,
    lastReviewedAt: null,
  });
}

export async function maybeRunMaintenanceReviewWindow(memory: ResolvedMemory): Promise<{ status: "skipped"; reason: string } | { status: "reviewed"; review: MaintenanceReviewRun }> {
  const closeouts = await listDemandMemoryCloseouts(memory);
  const watermark = await readMaintenanceReviewWatermark(memory);
  const reviewed = new Set(watermark.lastReviewedChangeIds);
  const unreviewed = closeouts.filter((closeout) => !reviewed.has(closeoutReviewKey(closeout)));
  if (unreviewed.length < TERMINAL_REVIEW_WINDOW) {
    return { status: "skipped", reason: `Need ${TERMINAL_REVIEW_WINDOW} unreviewed terminal changes; found ${unreviewed.length}.` };
  }
  return { status: "reviewed", review: await runMaintenanceReviewWindow(memory, unreviewed.slice(0, TERMINAL_REVIEW_WINDOW)) };
}

export async function runMaintenanceReviewWindow(memory: ResolvedMemory, windowCloseouts?: DemandMemoryCloseout[]): Promise<MaintenanceReviewRun> {
  const closeouts = windowCloseouts ?? (await listDemandMemoryCloseouts(memory)).slice(-TERMINAL_REVIEW_WINDOW);
  if (closeouts.length === 0) throw new Error("Maintenance review requires at least one closeout.");
  const now = new Date().toISOString();
  const windowHash = contentHash(closeouts.map((closeout) => closeout.id).join("|")).slice(0, 12);
  const id = `maintenance-review-${windowHash}`;
  const root = join(maintenanceRoot(memory), "reviews", id);
  const closeoutRefs = closeouts.map((closeout) => displayMaintenancePath(memory, join(closeoutsRoot(memory), `${closeout.id}.json`)));
  await refreshMaintenanceIndexes(memory);
  const docBudget = await checkDocBudgets(memory);
  const ledgerEntries = await listMaintenanceLedgerEntries(memory);
  const windowLedgerEntries = ledgerEntries.filter((entry) => entry.changeId && closeouts.some((closeout) => closeout.changeId === entry.changeId));
  const candidates = await createMaintenanceCandidatesForWindow(memory, closeouts, windowLedgerEntries);
  const scores: CandidateScore[] = [];
  const reviews: CandidateReview[] = [];
  for (const candidate of candidates) {
    const score = await scoreEvolutionCandidate(memory, candidate);
    const review = await reviewEvolutionCandidate(memory, candidate, score);
    scores.push(score);
    reviews.push(review);
  }
  const candidateRefs = candidates.map((candidate) => displayMaintenancePath(memory, join(maintenanceRoot(memory), "candidates", `${candidate.id}.json`)));
  const scoreRefs = scores.map((score) => displayMaintenancePath(memory, join(maintenanceRoot(memory), "scores", `${score.candidateId}.json`)));
  const reviewRefs = reviews.map((review) => displayMaintenancePath(memory, join(maintenanceRoot(memory), "reviews", `${review.candidateId}.json`)));
  const reviewRun: MaintenanceReviewRun = {
    version: "1.0",
    id,
    windowChangeIds: closeouts.map(closeoutReviewKey),
    hotCloseoutRefs: closeoutRefs,
    warmIndexRef: displayMaintenancePath(memory, warmIndexPath(memory)),
    coldArchiveRef: displayMaintenancePath(memory, coldArchiveIndexPath(memory)),
    docBudgetReportRef: displayMaintenancePath(memory, join(maintenanceRoot(memory), "doc-budgets", `${docBudget.id}.json`)),
    candidateRefs,
    scoreRefs,
    reviewRefs,
    summary: `Reviewed ${closeouts.length} terminal changes for reusable lessons and documentation drift. Canonical docs, ECL, stable memory, and source root were not modified.`,
    createdAt: now,
  };
  maintenanceReviewRunSchema.parse(reviewRun);
  await writeJsonFile(join(root, "maintenance-review.json"), reviewRun);
  await writeFile(join(root, "maintenance-review.md"), renderMaintenanceReviewMarkdown(reviewRun, closeouts, candidates, scores, reviews, docBudget), "utf8");
  const previous = await readMaintenanceReviewWatermark(memory);
  const reviewedIds = uniqueSorted([...previous.lastReviewedChangeIds, ...closeouts.map(closeoutReviewKey)]);
  await writeJsonFile(watermarkPath(memory), {
    version: "1.0",
    lastReviewedChangeIds: reviewedIds,
    lastReviewedArchiveIndex: reviewedIds.length,
    lastReviewWindowId: reviewRun.id,
    lastReviewedAt: now,
  } satisfies MaintenanceReviewWatermark);
  await recordMaintenanceLedgerEntry(memory, {
    eventType: "maintenance-review",
    summary: reviewRun.summary,
    artifactRefs: [displayMaintenancePath(memory, join(root, "maintenance-review.md")), ...candidateRefs, ...reviewRefs],
  });
  return reviewRun;
}

function renderMaintenanceReviewMarkdown(
  review: MaintenanceReviewRun,
  closeouts: DemandMemoryCloseout[],
  candidates: EvolutionCandidate[],
  scores: CandidateScore[],
  reviews: CandidateReview[],
  docBudget: DocBudgetReport,
): string {
  const scoreByCandidate = new Map(scores.map((score) => [score.candidateId, score]));
  const reviewByCandidate = new Map(reviews.map((item) => [item.candidateId, item]));
  return [
    `# ${review.id}`,
    "",
    review.summary,
    "",
    "## Window",
    "",
    ...closeouts.map((closeout) => `- ${closeout.changeId}: ${closeout.title} (${closeout.terminalKind})`),
    "",
    "## Candidates",
    "",
    ...(candidates.length ? candidates.map((candidate) => {
      const score = scoreByCandidate.get(candidate.id);
      const itemReview = reviewByCandidate.get(candidate.id);
      return `- ${candidate.title} [${candidate.subtype ?? "maintenance"}] score=${score?.score ?? "n/a"} recommendation=${itemReview?.recommendation ?? "n/a"}\n  ${candidate.summary.replace(/\r?\n/g, " ")}`;
    }) : ["- No candidates generated."]),
    "",
    "## Document Budget",
    "",
    ...docBudget.documents.map((doc) => `- ${doc.path}: ${doc.status} (${doc.wordCount}/${doc.hardLimit})`),
    "",
    "## Boundary",
    "",
    "This review wrote evidence, candidates, scores, reviews, indexes, and generated cache only. It did not modify canonical docs, ECL rules, curated project/stable memory, product roadmap, Harness templates, source root, or the current demand confirmation queue.",
    "",
  ].join("\n");
}
