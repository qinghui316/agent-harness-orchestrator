import { z } from "zod";
import type { PrReviewStateSnapshot, PrReviewReadiness, PrReviewHandoff, PrReviewReplyDraft, PrReviewReplyHandoff, PrReviewThreadResolution } from "../types/index.js";

export const stateSnapshotSchema: z.ZodType<PrReviewStateSnapshot> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  prUrl: z.string().optional(),
  state: z.string(),
  isDraft: z.boolean(),
  reviewDecision: z.string().nullable().optional(),
  feedbackClassification: z.enum(["no-action", "checks-failed", "changes-requested", "inline-comments-actionable", "comments-only", "user-pushback-requested", "provider-unavailable", "stale-pr"]).optional(),
  commentsCount: z.number(),
  failedChecksCount: z.number(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const readinessSchema: z.ZodType<PrReviewReadiness> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  status: z.enum(["ready", "ready-with-comments", "already-ready", "missing-pr", "provider-unavailable", "actionable-feedback", "checks-failed", "stale-pr"]),
  canSubmit: z.boolean(),
  summary: z.string(),
  reason: z.string(),
  confirmEffect: z.string(),
  riskSummary: z.string(),
  prUrl: z.string().optional(),
  stateSnapshotArtifact: z.string(),
  readinessArtifact: z.string(),
  summaryArtifact: z.string(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const handoffSchema: z.ZodType<PrReviewHandoff> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  readinessId: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  prUrl: z.string().optional(),
  status: z.literal("submitted"),
  artifactRefs: z.array(z.string()),
  submittedAt: z.string(),
});

export const replyDraftSchema: z.ZodType<PrReviewReplyDraft> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  snapshotId: z.string().optional(),
  targetKind: z.enum(["inline-comment", "issue-comment", "review-thread", "pr"]),
  targetId: z.string().optional(),
  threadId: z.string().optional(),
  commentId: z.string().optional(),
  body: z.string(),
  canResolveThread: z.boolean(),
  status: z.enum(["draft", "submitted", "resolved"]),
  artifactRef: z.string(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const replyHandoffSchema: z.ZodType<PrReviewReplyHandoff> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  draftId: z.string(),
  landingPackageId: z.string(),
  prDraftPackageId: z.string(),
  targetKind: z.enum(["inline-comment", "issue-comment", "review-thread", "pr"]),
  targetId: z.string().optional(),
  status: z.literal("submitted"),
  artifactRefs: z.array(z.string()),
  submittedAt: z.string(),
});

export const threadResolutionSchema: z.ZodType<PrReviewThreadResolution> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  draftId: z.string(),
  landingPackageId: z.string(),
  prDraftPackageId: z.string(),
  threadId: z.string(),
  status: z.literal("resolved"),
  artifactRefs: z.array(z.string()),
  resolvedAt: z.string(),
});
