import { z } from "zod";
import type {
  LandingQueueCandidate,
  LandingQueueDecision,
  LandingQueueResult,
  LandingQueueSnapshot,
} from "../types/index.js";

export const candidateSchema: z.ZodType<LandingQueueCandidate> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  conversationId: z.string(),
  changeIds: z.array(z.string()),
  landingPackageId: z.string(),
  prDraftPackageId: z.string(),
  prUrl: z.string().optional(),
  status: z.enum(["ready", "ready-with-comments", "needs-attention", "merged"]),
  canMerge: z.boolean(),
  summary: z.string(),
  reason: z.string(),
  confirmEffect: z.string(),
  riskSummary: z.string(),
  readinessId: z.string().optional(),
  readinessStatus: z.enum(["ready", "ready-with-comments", "missing-pr", "provider-unavailable", "draft", "closed", "already-merged", "checks-failed", "actionable-feedback", "stale-pr", "merge-unavailable"]).optional(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const snapshotSchema: z.ZodType<LandingQueueSnapshot> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  status: z.enum(["empty", "ready", "needs-attention"]),
  summary: z.string(),
  readyCount: z.number(),
  needsAttentionCount: z.number(),
  mergedCount: z.number(),
  candidates: z.array(candidateSchema),
  snapshotArtifact: z.string(),
  summaryArtifact: z.string(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const decisionSchema: z.ZodType<LandingQueueDecision> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  snapshotId: z.string(),
  selectedLandingPackageId: z.string().optional(),
  selectedCandidateId: z.string().optional(),
  action: z.enum(["merge-next", "skip", "remove-stale"]),
  status: z.enum(["completed", "failed", "skipped"]),
  reason: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const resultSchema: z.ZodType<LandingQueueResult> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  decisionId: z.string(),
  beforeSnapshotId: z.string(),
  afterSnapshotId: z.string().optional(),
  selectedCandidateId: z.string().optional(),
  landingPackageId: z.string().optional(),
  remoteLandingResultId: z.string().optional(),
  status: z.enum(["merged", "failed", "skipped"]),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});
