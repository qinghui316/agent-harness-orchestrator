import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const gitCommit = z.string().regex(/^[a-f0-9]{40,64}$/);
const identity = z.string().trim().min(1);
const finding = z.object({
  severity: z.enum(["blocking", "note"]),
  area: z.string().trim().min(1),
  evidence: z.string().trim().min(1),
  recommendation: z.string().trim().min(1),
  text: z.string().trim().min(1),
}).strict();

const FullBundleReviewSchema = z.object({
  schema_version: z.literal("1.0"),
  kind: z.literal("full-bundle-review"),
  candidate_fingerprint: sha256,
  source_snapshot_digest: sha256,
  author_id: identity,
  reviewer_id: identity,
  decision: z.enum(["approve", "block"]),
  findings: z.array(finding),
  reviewed_at: z.string().datetime({ offset: true }),
}).strict();

const EvolutionJudgeSchema = z.object({
  schema_version: z.literal("1.0"),
  kind: z.literal("evolution-candidate-judge"),
  proposal_id: identity,
  candidate_fingerprint: sha256,
  source_snapshot_digest: sha256,
  author_id: identity,
  judge_id: identity,
  eval_mode: z.enum(["live", "dry-run"]),
  dimensions: z.object({
    evidence_grounding: z.number().min(0).max(100),
    project_relevance: z.number().min(0).max(100),
    mechanical_enforceability: z.number().min(0).max(100),
    regression_safety: z.number().min(0).max(100),
    context_cost: z.number().min(0).max(100),
  }).strict(),
  score: z.number().min(0).max(100),
  hard_issues: z.array(z.string().trim().min(1)),
  decision: z.enum(["keep", "reject"]),
  findings: z.array(finding),
  reviewed_at: z.string().datetime({ offset: true }),
}).strict();

const IntegrationReviewSchema = z.object({
  schema_version: z.literal("1.0"),
  kind: z.literal("integration-candidate-review"),
  integration_id: identity,
  candidate_commit: gitCommit,
  integrator_id: identity,
  reviewer_id: identity,
  decision: z.enum(["approve", "block"]),
  findings: z.array(finding),
  reviewed_at: z.string().datetime({ offset: true }),
}).strict();

export type FullBundleReview = z.infer<typeof FullBundleReviewSchema>;
export type EvolutionCandidateJudge = z.infer<typeof EvolutionJudgeSchema>;
export type IntegrationCandidateReview = z.infer<typeof IntegrationReviewSchema>;

export function parseFullBundleReview(
  input: unknown,
  expected: { candidateFingerprint: string; sourceSnapshotDigest: string },
): FullBundleReview {
  const review = FullBundleReviewSchema.parse(input);
  assertIndependent(review.author_id, review.reviewer_id, "Full bundle review");
  assertBinding(review.candidate_fingerprint, expected.candidateFingerprint, "Full bundle candidate fingerprint");
  assertBinding(review.source_snapshot_digest, expected.sourceSnapshotDigest, "Full bundle source snapshot digest");
  assertDecisionMatchesFindings(review.decision, review.findings, "Full bundle review");
  return review;
}

export function parseEvolutionCandidateJudge(
  input: unknown,
  expected: { candidateFingerprint: string; sourceSnapshotDigest: string },
): EvolutionCandidateJudge {
  const review = EvolutionJudgeSchema.parse(input);
  assertIndependent(review.author_id, review.judge_id, "Evolution Judge");
  assertBinding(review.candidate_fingerprint, expected.candidateFingerprint, "Evolution candidate fingerprint");
  assertBinding(review.source_snapshot_digest, expected.sourceSnapshotDigest, "Evolution source snapshot digest");
  const weighted = review.dimensions.evidence_grounding * 0.30
    + review.dimensions.project_relevance * 0.25
    + review.dimensions.mechanical_enforceability * 0.15
    + review.dimensions.regression_safety * 0.20
    + review.dimensions.context_cost * 0.10;
  if (Math.abs(review.score - weighted) > 0.05) {
    throw new Error(`Evolution Judge score must equal the weighted score ${weighted.toFixed(2)}.`);
  }
  const blockingFinding = review.findings.some((item) => item.severity === "blocking");
  if (review.decision === "keep"
    && (review.eval_mode !== "live" || review.score < 80 || review.hard_issues.length > 0 || blockingFinding)) {
    throw new Error("Evolution Judge cannot keep a dry-run, sub-80, hard-issue, or blocking-finding candidate.");
  }
  return review;
}

export function parseIntegrationCandidateReview(
  input: unknown,
  expected: { integrationId: string; candidateCommit: string },
): IntegrationCandidateReview {
  const review = IntegrationReviewSchema.parse(input);
  assertIndependent(review.integrator_id, review.reviewer_id, "Integration review");
  assertBinding(review.integration_id, expected.integrationId, "Integration id");
  assertBinding(review.candidate_commit, expected.candidateCommit, "Integration candidate commit");
  assertDecisionMatchesFindings(review.decision, review.findings, "Integration review");
  return review;
}

function assertIndependent(author: string, reviewer: string, label: string): void {
  if (author === reviewer) throw new Error(`${label} requires an independent reviewer identity.`);
}

function assertBinding(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label} does not match the current candidate.`);
}

function assertDecisionMatchesFindings(
  decision: "approve" | "block",
  findings: Array<{ severity: "blocking" | "note" }>,
  label: string,
): void {
  if (decision === "approve" && findings.some((item) => item.severity === "blocking")) {
    throw new Error(`${label} cannot approve with a blocking finding.`);
  }
}
