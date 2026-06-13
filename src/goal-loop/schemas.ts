import { z } from "zod";
import { WORKFLOW_ACTION_TYPES } from "../workflow-actions/registry.js";
import type { GoalLoopDecision } from "./types.js";

const sourceEvidenceRefSchema = z.object({
  kind: z.string(),
  id: z.string().optional(),
  status: z.string().optional(),
  artifact: z.string().optional(),
  summary: z.string(),
});

const conflictAssessmentSchema = z.object({
  level: z.enum(["low", "medium", "high", "unknown"]),
  parallelEligible: z.boolean(),
  reasons: z.array(z.string()),
});

const completionAuditSchema = z.object({
  status: z.enum(["incomplete", "ready-for-human-close-gate", "blocked"]),
  evidence: z.array(z.string()),
  missing: z.array(z.string()),
});

const recommendedActionSchema = z.object({
  actionType: z.enum(WORKFLOW_ACTION_TYPES),
  scope: z.record(z.union([z.string(), z.array(z.string())])),
  reason: z.string(),
});

const forbiddenActionSchema = z.object({
  actionType: z.string(),
  reason: z.string(),
});

const decisionKindSchema = z.enum([
  "planning-needed",
  "sequential-loop",
  "parallel-plan-needed",
  "scheduler-next-step",
  "integration-needed",
  "human-gate",
  "wait-for-evidence",
  "blocked",
  "completed-ready-for-human-close-gate",
]);

const continuationStateSchema = z.enum([
  "waiting-for-evidence",
  "ready-for-existing-gate",
  "blocked",
  "budget-limited",
  "ready-for-human-close-gate",
]);

const controlPolicySchema = z.object({
  authority: z.literal("evidence-only-control-constraints"),
  canAutoContinue: z.literal(false),
  canAutoExecuteRecommendedAction: z.literal(false),
  requiresHumanGate: z.boolean(),
  recommendedActionType: z.enum(WORKFLOW_ACTION_TYPES).optional(),
  reason: z.string(),
});

const budgetSignalSchema = z.object({
  status: z.enum(["unknown", "declared", "budget-limited"]),
  summary: z.string(),
  tokensUsed: z.number().int().nonnegative().optional(),
  tokenBudget: z.number().int().positive().optional(),
  remainingTokens: z.number().int().nonnegative().optional(),
});

const resumePreconditionSchema = z.object({
  kind: z.string(),
  id: z.string().optional(),
  satisfied: z.boolean(),
  summary: z.string(),
});

const suppressionReasonSchema = z.object({
  reason: z.enum(["waiting-for-evidence", "blocked", "ready-for-human-close-gate", "budget-limited", "specific-gate-required"]),
  summary: z.string(),
});

export const goalLoopDecisionSchema: z.ZodType<GoalLoopDecision> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  authority: z.literal("non-executing-planning-evidence"),
  decisionKind: decisionKindSchema,
  summary: z.string(),
  recommendedAction: recommendedActionSchema.optional(),
  humanGateRequired: z.boolean(),
  forbiddenActions: z.array(forbiddenActionSchema),
  conflictAssessment: conflictAssessmentSchema,
  completionAudit: completionAuditSchema,
  sourceEvidenceRefs: z.array(sourceEvidenceRefSchema),
  executionStarted: z.literal(false),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const goalLoopIterationSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  ordinal: z.number().int().positive(),
  authority: z.literal("non-executing-continuation-evidence"),
  trigger: z.literal("user-confirmed-evaluate"),
  iterationStatus: z.literal("recorded"),
  continuationVerdict: z.enum(["wait", "recommend-existing-gate", "blocked", "ready-for-human-close-gate"]),
  continuationState: continuationStateSchema.default("waiting-for-evidence"),
  controlPolicy: controlPolicySchema.default({
    authority: "evidence-only-control-constraints",
    canAutoContinue: false,
    canAutoExecuteRecommendedAction: false,
    requiresHumanGate: true,
    reason: "Legacy GoalLoopIteration has no continuation control policy; treat as evidence-only.",
  }),
  budgetSignal: budgetSignalSchema.default({
    status: "unknown",
    summary: "Legacy GoalLoopIteration has no budget/accounting signal.",
  }),
  resumePreconditions: z.array(resumePreconditionSchema).default([]),
  suppressedBecause: suppressionReasonSchema.optional(),
  previousGoalLoopDecisionId: z.string().optional(),
  previousGoalLoopIterationId: z.string().optional(),
  goalLoopDecisionId: z.string(),
  decisionKind: decisionKindSchema,
  summary: z.string(),
  recommendedAction: recommendedActionSchema.optional(),
  humanGateRequired: z.boolean(),
  conflictAssessment: conflictAssessmentSchema,
  completionAudit: completionAuditSchema,
  sourceEvidenceRefs: z.array(sourceEvidenceRefSchema),
  executionStarted: z.literal(false),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
