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

export const goalLoopDecisionSchema: z.ZodType<GoalLoopDecision> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  authority: z.literal("non-executing-planning-evidence"),
  decisionKind: z.enum([
    "planning-needed",
    "sequential-loop",
    "parallel-plan-needed",
    "scheduler-next-step",
    "integration-needed",
    "human-gate",
    "wait-for-evidence",
    "blocked",
    "completed-ready-for-human-close-gate",
  ]),
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
