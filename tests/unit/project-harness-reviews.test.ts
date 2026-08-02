import { describe, expect, it } from "vitest";
import {
  parseEvolutionCandidateJudge,
  parseFullBundleReview,
  parseIntegrationCandidateReview,
} from "../../src/project-harness/reviews.js";

const fingerprint = "a".repeat(64);
const sourceDigest = "b".repeat(64);
const commit = "c".repeat(40);
const reviewedAt = "2026-08-03T02:00:00.000Z";

describe("project Harness independent review contracts", () => {
  it("binds a full-bundle review to candidate content and source snapshot", () => {
    const input = {
      schema_version: "1.0",
      kind: "full-bundle-review",
      candidate_fingerprint: fingerprint,
      source_snapshot_digest: sourceDigest,
      author_id: "main-agent",
      reviewer_id: "independent-auditor",
      decision: "approve",
      findings: [],
      reviewed_at: reviewedAt,
    };
    expect(parseFullBundleReview(input, {
      candidateFingerprint: fingerprint,
      sourceSnapshotDigest: sourceDigest,
    }).decision).toBe("approve");
    expect(() => parseFullBundleReview({ ...input, reviewer_id: "main-agent" }, {
      candidateFingerprint: fingerprint,
      sourceSnapshotDigest: sourceDigest,
    })).toThrow(/independent reviewer/);
    expect(() => parseFullBundleReview(input, {
      candidateFingerprint: "d".repeat(64),
      sourceSnapshotDigest: sourceDigest,
    })).toThrow(/does not match/);
  });

  it("enforces the distinct weighted Evolution Judge gate", () => {
    const input = {
      schema_version: "1.0",
      kind: "evolution-candidate-judge",
      proposal_id: "proposal-1",
      candidate_fingerprint: fingerprint,
      source_snapshot_digest: sourceDigest,
      author_id: "evolution-agent",
      judge_id: "independent-judge",
      eval_mode: "live",
      dimensions: {
        evidence_grounding: 90,
        project_relevance: 90,
        mechanical_enforceability: 80,
        regression_safety: 90,
        context_cost: 80,
      },
      score: 87.5,
      hard_issues: [],
      decision: "keep",
      findings: [],
      reviewed_at: reviewedAt,
    };
    expect(parseEvolutionCandidateJudge(input, {
      candidateFingerprint: fingerprint,
      sourceSnapshotDigest: sourceDigest,
    }).decision).toBe("keep");
    expect(() => parseEvolutionCandidateJudge({ ...input, eval_mode: "dry-run" }, {
      candidateFingerprint: fingerprint,
      sourceSnapshotDigest: sourceDigest,
    })).toThrow(/cannot keep/);
    expect(() => parseEvolutionCandidateJudge({ ...input, score: 99 }, {
      candidateFingerprint: fingerprint,
      sourceSnapshotDigest: sourceDigest,
    })).toThrow(/weighted score/);
  });

  it("binds Integration review to the exact candidate commit and distinct reviewer", () => {
    const input = {
      schema_version: "1.0",
      kind: "integration-candidate-review",
      integration_id: "integration-1",
      candidate_commit: commit,
      integrator_id: "integrator",
      reviewer_id: "reviewer",
      decision: "approve",
      findings: [],
      reviewed_at: reviewedAt,
    };
    expect(parseIntegrationCandidateReview(input, {
      integrationId: "integration-1",
      candidateCommit: commit,
    }).decision).toBe("approve");
    expect(() => parseIntegrationCandidateReview({ ...input, reviewer_id: "integrator" }, {
      integrationId: "integration-1",
      candidateCommit: commit,
    })).toThrow(/independent reviewer/);
    expect(() => parseIntegrationCandidateReview({ ...input, candidate_commit: "d".repeat(40) }, {
      integrationId: "integration-1",
      candidateCommit: commit,
    })).toThrow(/does not match/);
  });
});
