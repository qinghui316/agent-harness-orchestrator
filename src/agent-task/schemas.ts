import { z } from "zod";
import type {
  DemandMemoryCloseout,
  MaintenanceCanonicalPatchProposal,
  DocBudgetReport,
  MaintenanceCanonicalUpdateDecision,
  MaintenanceCanonicalUpdateProposal,
  MaintenanceReviewRun,
  MaintenanceReviewWatermark,
} from "../types/index.js";

export const taskStatusSchema = z.enum(["queued", "claimed", "running", "completed", "failed", "needs-user-input", "cancelled"]);

export const taskSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  conversationId: z.string(),
  changeId: z.string(),
  roleId: z.string(),
  kind: z.enum(["foreground", "background"]),
  status: taskStatusSchema,
  inputArtifacts: z.array(z.string()),
  outputArtifacts: z.array(z.string()),
  parentTaskId: z.string().optional(),
  createdBy: z.enum(["main-agent-policy", "maintenance-policy", "system"]),
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export const resultSchema = z.object({
  version: z.literal("1.0"),
  taskId: z.string(),
  roleId: z.string(),
  status: taskStatusSchema,
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  policyAuditRefs: z.array(z.string()).optional(),
  boundaryAuditRefs: z.array(z.string()).optional(),
  boundaryViolations: z.array(z.object({
    kind: z.enum(["source-root-modified", "denied-path", "outside-write-root", "cross-demand-artifact", "readonly-role-write", "dirty-state"]),
    path: z.string().optional(),
    reason: z.string(),
  })).optional(),
  nextRecommendation: z.string().optional(),
  failureClassification: z.string().optional(),
  requiresUserInputReason: z.string().optional(),
  createdAt: z.string(),
});

export const ledgerSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string().optional(),
  eventType: z.enum(["archive", "apply", "remote-landing", "failure", "user-feedback", "doc-drift", "reference-drift", "harness-evolution", "change-closeout", "maintenance-review", "canonical-update-proposal", "canonical-update-decision", "canonical-patch-proposal"]),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const candidateSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  sourceLedgerEntryIds: z.array(z.string()),
  subtype: z.enum(["stable-memory", "docs-drift", "harness-evolution", "reusable-lesson", "doc-budget", "reference-drift"]).optional(),
  fingerprint: z.string().optional(),
  supersededBy: z.string().optional(),
  title: z.string(),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  status: z.literal("candidate"),
  createdAt: z.string(),
});

export const scoreSchema = z.object({
  version: z.literal("1.0"),
  candidateId: z.string(),
  score: z.number(),
  rationale: z.string(),
  risks: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  dimensions: z.record(z.number()).optional(),
  createdAt: z.string(),
});

export const reviewSchema = z.object({
  version: z.literal("1.0"),
  candidateId: z.string(),
  recommendation: z.enum(["accept", "defer", "reject", "needs-human-review"]),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const resolutionOutcomeSchema = z.enum(["promote", "merge", "retire", "archive-only", "noop"]);

export const resolutionSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  candidateId: z.string(),
  outcome: resolutionOutcomeSchema,
  reviewRecommendation: z.enum(["accept", "defer", "reject", "needs-human-review"]),
  candidateSubtype: z.enum(["stable-memory", "docs-drift", "harness-evolution", "reusable-lesson", "doc-budget", "reference-drift"]).optional(),
  score: z.number(),
  rationale: z.string(),
  canonicalUpdateRequired: z.boolean(),
  humanGateRequired: z.boolean(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const canonicalUpdateProposalSchema: z.ZodType<MaintenanceCanonicalUpdateProposal> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  status: z.literal("proposed"),
  resolutionIds: z.array(z.string()),
  candidateIds: z.array(z.string()),
  targetKinds: z.array(z.enum(["stable-memory", "canonical-docs", "harness-evolution", "reference", "maintenance"])),
  humanGateRequired: z.literal(true),
  canonicalUpdateAuthorized: z.literal(false),
  summary: z.string(),
  resolutionSummaries: z.array(z.object({
    resolutionId: z.string(),
    candidateId: z.string(),
    outcome: resolutionOutcomeSchema,
    candidateSubtype: z.enum(["stable-memory", "docs-drift", "harness-evolution", "reusable-lesson", "doc-budget", "reference-drift"]).optional(),
    reviewRecommendation: z.enum(["accept", "defer", "reject", "needs-human-review"]),
    rationale: z.string(),
    artifactRefs: z.array(z.string()),
  })),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const canonicalUpdateDecisionSchema: z.ZodType<MaintenanceCanonicalUpdateDecision> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  proposalId: z.string(),
  decisionStatus: z.literal("accepted-for-follow-up"),
  targetKinds: z.array(z.enum(["stable-memory", "canonical-docs", "harness-evolution", "reference", "maintenance"])),
  sourceMutationAuthorized: z.literal(false),
  canonicalUpdateAuthorized: z.literal(false),
  executionStarted: z.literal(false),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const canonicalPatchProposalSchema: z.ZodType<MaintenanceCanonicalPatchProposal> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  status: z.literal("patch-proposed"),
  proposalId: z.string(),
  decisionId: z.string(),
  targetKinds: z.array(z.enum(["stable-memory", "canonical-docs", "harness-evolution", "reference", "maintenance"])),
  operationCount: z.number(),
  operations: z.array(z.object({
    id: z.string(),
    targetKind: z.enum(["stable-memory", "canonical-docs", "harness-evolution", "reference", "maintenance"]),
    operation: resolutionOutcomeSchema,
    sourceResolutionId: z.string(),
    sourceCandidateId: z.string(),
    summary: z.string(),
    rationale: z.string(),
    artifactRefs: z.array(z.string()),
  })),
  sourceMutationAuthorized: z.literal(false),
  canonicalUpdateAuthorized: z.literal(false),
  applicationAuthorized: z.literal(false),
  executionStarted: z.literal(false),
  humanApplicationGateRequired: z.literal(true),
  summary: z.string(),
  risks: z.array(z.string()),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export const lessonCandidateSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  status: z.enum(["candidate", "superseded"]),
  supersededBy: z.string().optional(),
});

export const docsDriftCandidateSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  document: z.string(),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  status: z.enum(["candidate", "superseded"]),
  supersededBy: z.string().optional(),
});

export const closeoutSchema: z.ZodType<DemandMemoryCloseout> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  title: z.string(),
  terminalKind: z.enum(["archived", "applied", "remote-handoff", "merged"]),
  goal: z.string(),
  finalResult: z.string(),
  userDecision: z.string(),
  changedFiles: z.array(z.string()),
  affectedModules: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  reusableLessonCandidates: z.array(lessonCandidateSchema),
  docsDriftCandidates: z.array(docsDriftCandidateSchema),
  memoryBoundaryNotes: z.array(z.string()),
  createdAt: z.string(),
});

export const watermarkSchema: z.ZodType<MaintenanceReviewWatermark> = z.object({
  version: z.literal("1.0"),
  lastReviewedChangeIds: z.array(z.string()),
  lastReviewedArchiveIndex: z.number(),
  lastReviewWindowId: z.string().nullable(),
  lastReviewedAt: z.string().nullable(),
});

export const docBudgetReportSchema: z.ZodType<DocBudgetReport> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  documents: z.array(z.object({
    path: z.string(),
    wordCount: z.number(),
    softLimit: z.number(),
    hardLimit: z.number(),
    status: z.enum(["ok", "soft-exceeded", "hard-exceeded"]),
  })),
  createdAt: z.string(),
});

export const maintenanceReviewRunSchema: z.ZodType<MaintenanceReviewRun> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  windowChangeIds: z.array(z.string()),
  hotCloseoutRefs: z.array(z.string()),
  warmIndexRef: z.string(),
  coldArchiveRef: z.string(),
  docBudgetReportRef: z.string(),
  candidateRefs: z.array(z.string()),
  scoreRefs: z.array(z.string()),
  reviewRefs: z.array(z.string()),
  resolutionRefs: z.array(z.string()),
  proposalRefs: z.array(z.string()),
  summary: z.string(),
  createdAt: z.string(),
});
