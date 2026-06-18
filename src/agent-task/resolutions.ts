import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  CandidateReview,
  CandidateScore,
  EvolutionCandidate,
  MaintenanceCandidateResolution,
  MaintenanceCandidateResolutionOutcome,
  MaintenanceCandidateSubtype,
  ResolvedMemory,
} from "../types/index.js";
import {
  displayMaintenancePath,
  maintenanceResolutionPath,
  maintenanceResolutionsRoot,
  maintenanceRoot,
} from "./paths.js";
import { resolutionSchema } from "./schemas.js";
import { uniqueSorted } from "./utils.js";

const canonicalOutcomes = new Set<MaintenanceCandidateResolutionOutcome>(["promote", "merge", "retire"]);

export async function resolveMaintenanceCandidate(
  memory: ResolvedMemory,
  candidate: EvolutionCandidate,
  score: CandidateScore,
  review: CandidateReview,
): Promise<MaintenanceCandidateResolution> {
  const outcome = decideResolutionOutcome(candidate, review);
  const resolution: MaintenanceCandidateResolution = {
    version: "1.0",
    id: `resolution-${candidate.id}`,
    candidateId: candidate.id,
    outcome,
    reviewRecommendation: review.recommendation,
    candidateSubtype: candidate.subtype,
    score: score.score,
    rationale: buildResolutionRationale(candidate, score, review, outcome),
    canonicalUpdateRequired: canonicalOutcomes.has(outcome),
    humanGateRequired: canonicalOutcomes.has(outcome),
    artifactRefs: uniqueSorted([
      displayMaintenancePath(memory, join(maintenanceRoot(memory), "candidates", `${candidate.id}.json`)),
      displayMaintenancePath(memory, join(maintenanceRoot(memory), "scores", `${candidate.id}.json`)),
      displayMaintenancePath(memory, join(maintenanceRoot(memory), "reviews", `${candidate.id}.json`)),
      ...candidate.artifactRefs,
      ...review.evidenceRefs,
    ]),
    createdAt: new Date().toISOString(),
  };
  resolutionSchema.parse(resolution);
  await writeJsonFile(maintenanceResolutionPath(memory, candidate.id), resolution);
  return resolution;
}

export async function readMaintenanceCandidateResolution(memory: ResolvedMemory, candidateId: string): Promise<MaintenanceCandidateResolution | null> {
  const path = maintenanceResolutionPath(memory, candidateId);
  if (!existsSync(path)) return null;
  return readJsonFile(path, resolutionSchema, null as unknown as MaintenanceCandidateResolution).catch(() => null);
}

export async function listMaintenanceCandidateResolutions(memory: ResolvedMemory): Promise<MaintenanceCandidateResolution[]> {
  const root = maintenanceResolutionsRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const resolutions: MaintenanceCandidateResolution[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const resolution = await readJsonFile(join(root, entry.name), resolutionSchema, null as unknown as MaintenanceCandidateResolution).catch(() => null);
    if (resolution) resolutions.push(resolution);
  }
  return resolutions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function maintenanceResolutionArtifactRef(memory: ResolvedMemory, candidateId: string): string {
  return displayMaintenancePath(memory, maintenanceResolutionPath(memory, candidateId));
}

function decideResolutionOutcome(candidate: EvolutionCandidate, review: CandidateReview): MaintenanceCandidateResolutionOutcome {
  if (review.recommendation === "reject") return "noop";
  if (review.recommendation === "defer") return "archive-only";
  if (review.recommendation === "needs-human-review") {
    return documentationLikeSubtype(candidate.subtype) ? "merge" : "promote";
  }
  if (review.recommendation === "accept") {
    if (candidate.subtype === "docs-drift" || candidate.subtype === "doc-budget") {
      return staleCandidateSummary(candidate.summary) ? "retire" : "merge";
    }
    return "promote";
  }
  return "archive-only";
}

function documentationLikeSubtype(subtype: MaintenanceCandidateSubtype | undefined): boolean {
  return subtype === "docs-drift" || subtype === "doc-budget" || subtype === "reference-drift";
}

function staleCandidateSummary(summary: string): boolean {
  return /stale|superseded|obsolete|contradict|contradicted|outdated|retire/i.test(summary);
}

function buildResolutionRationale(
  candidate: EvolutionCandidate,
  score: CandidateScore,
  review: CandidateReview,
  outcome: MaintenanceCandidateResolutionOutcome,
): string {
  const gate = canonicalOutcomes.has(outcome)
    ? "A future canonical update requires an explicit human gate."
    : "No canonical update is authorized by this resolution.";
  return [
    `Derived ${outcome} from review recommendation ${review.recommendation}, subtype ${candidate.subtype ?? "maintenance"}, and score ${score.score}.`,
    gate,
    "This artifact is maintenance evidence/proposal only; it does not apply memory, documentation, ECL, Harness, source, close, or evolution changes.",
  ].join(" ");
}
