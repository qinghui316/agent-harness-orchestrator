import { z } from "zod";
import { WORKFLOW_ACTION_TYPES } from "../workflow-actions/registry.js";
import { legacySchedulerExecutionModeAssessment } from "../workflow-scheduler/execution-mode.js";
import { schedulerExecutionModeAssessmentSchema } from "../workflow-scheduler/schemas.js";
import { legacySchedulerLoopEvidenceSnapshot } from "./scheduler-loop-snapshot.js";
import type { GoalLoopContinuationBrief, GoalLoopControllerPolicy, GoalLoopDecision, GoalLoopFeedback, GoalLoopGateReadinessPreflight, GoalLoopNextStepPacket } from "./types.js";

const sourceEvidenceRefSchema = z.object({
  kind: z.string(),
  id: z.string().optional(),
  status: z.string().optional(),
  artifact: z.string().optional(),
  hash: z.string().optional(),
  summary: z.string(),
});

const conflictAssessmentSchema = z.object({
  level: z.enum(["low", "medium", "high", "unknown"]),
  parallelEligible: z.boolean(),
  routingPosture: z.enum([
    "single-worker-gate",
    "sequential-current-worker",
    "candidate-refresh-required",
    "integration-check-required",
    "blocked-or-rework",
    "close-gate-required",
    "wait-for-evidence",
  ]).default("wait-for-evidence"),
  routingLabel: z.string().default("Wait for evidence"),
  reasons: z.array(z.string()),
});

const completionAuditSchema = z.object({
  status: z.enum(["incomplete", "ready-for-human-close-gate", "blocked"]),
  evidence: z.array(z.string()),
  missing: z.array(z.string()),
});

const schedulerExecutionModeSchema = schedulerExecutionModeAssessmentSchema.default(legacySchedulerExecutionModeAssessment());

const recommendedActionSchema = z.object({
  actionType: z.enum(WORKFLOW_ACTION_TYPES),
  scope: z.record(z.union([z.string(), z.array(z.string())])),
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

const schedulerLoopUnsafeEvidenceSchema = z.object({
  kind: z.enum(["malformed", "stale", "superseded", "cross-change", "ambiguous", "missing"]),
  summary: z.string(),
  artifactId: z.string().optional(),
});

const schedulerLoopForbiddenAuthoritySchema = z.object({
  loopAuthorized: z.literal(false),
  fullParallelExecutorAuthorized: z.literal(false),
  wholeWaveDispatchAuthorized: z.literal(false),
  slotAllocatorAuthorized: z.literal(false),
  executionStarted: z.literal(false),
  sourceMutationAuthorized: z.literal(false),
  applyAuthorized: z.literal(false),
  closeAuthorized: z.literal(false),
  harnessEvolutionAuthorized: z.literal(false),
});

const schedulerLoopCurrentLegalActionSchema = z.object({
  actionType: z.enum(WORKFLOW_ACTION_TYPES),
  scope: z.record(z.union([z.string(), z.array(z.string())])),
  separateHumanGateRequired: z.literal(true),
  reason: z.string(),
});

const schedulerLoopEvidenceSnapshotSchema = z.object({
  version: z.literal("1.0"),
  authority: z.literal("non-executing-scheduler-loop-evidence-snapshot"),
  changeId: z.string(),
  planningComplete: z.boolean(),
  decisionKind: decisionKindSchema,
  posture: z.enum(["waiting", "recommending-gate", "awaiting-human-gate", "quality-routing", "integration-barrier", "terminal-handoff"]),
  reasons: z.array(z.string()),
  currentLegalAction: schedulerLoopCurrentLegalActionSchema.optional(),
  separateHumanGateRequired: z.boolean(),
  humanGateRequired: z.boolean(),
  unsafeEvidence: z.array(schedulerLoopUnsafeEvidenceSchema),
  conflictAssessment: conflictAssessmentSchema,
  completionAudit: completionAuditSchema,
  schedulerExecutionMode: schedulerExecutionModeSchema,
  forbiddenAuthority: schedulerLoopForbiddenAuthoritySchema,
});

const forbiddenActionSchema = z.object({
  actionType: z.string(),
  reason: z.string(),
});

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

const goalLoopDecisionObjectSchema = z.object({
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
  schedulerExecutionMode: schedulerExecutionModeSchema,
  schedulerLoopEvidenceSnapshot: schedulerLoopEvidenceSnapshotSchema.optional(),
  completionAudit: completionAuditSchema,
  sourceEvidenceRefs: z.array(sourceEvidenceRefSchema),
  executionStarted: z.literal(false),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const goalLoopDecisionSchema = goalLoopDecisionObjectSchema
  .transform((decision) => ({
    ...decision,
    schedulerLoopEvidenceSnapshot: decision.schedulerLoopEvidenceSnapshot ?? legacySchedulerLoopEvidenceSnapshot(decision.changeId),
  })) as unknown as z.ZodType<GoalLoopDecision>;

export const goalLoopIterationSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  ordinal: z.number().int().positive(),
  authority: z.literal("non-executing-continuation-evidence"),
  trigger: z.enum(["user-confirmed-evaluate", "user-feedback-evaluate"]),
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
  schedulerExecutionMode: schedulerExecutionModeSchema,
  completionAudit: completionAuditSchema,
  sourceEvidenceRefs: z.array(sourceEvidenceRefSchema),
  executionStarted: z.literal(false),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const goalLoopContinuationBriefSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  authority: z.literal("non-executing-continuation-brief-evidence"),
  sourceGoalLoopDecisionId: z.string(),
  sourceGoalLoopIterationId: z.string(),
  iterationOrdinal: z.number().int().positive(),
  decisionKind: decisionKindSchema,
  continuationVerdict: z.enum(["wait", "recommend-existing-gate", "blocked", "ready-for-human-close-gate"]),
  continuationState: continuationStateSchema,
  summary: z.string(),
  recommendedAction: recommendedActionSchema.optional(),
  humanGateRequired: z.boolean(),
  controlPolicy: controlPolicySchema,
  budgetSignal: budgetSignalSchema,
  resumePreconditions: z.array(resumePreconditionSchema),
  suppressedBecause: suppressionReasonSchema.optional(),
  conflictAssessment: conflictAssessmentSchema,
  schedulerExecutionMode: schedulerExecutionModeSchema,
  completionAudit: completionAuditSchema,
  sourceEvidenceRefs: z.array(sourceEvidenceRefSchema),
  forbiddenActions: z.array(forbiddenActionSchema),
  stalenessInstruction: z.string(),
  mainAgentInstructions: z.array(z.string()),
  forbiddenExecutionStatements: z.array(z.string()),
  executionStarted: z.literal(false),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) as z.ZodType<GoalLoopContinuationBrief>;

export const goalLoopNextStepPacketSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  authority: z.literal("non-executing-main-agent-next-step-packet"),
  sourceGoalLoopDecisionId: z.string(),
  sourceGoalLoopIterationId: z.string(),
  sourceGoalLoopContinuationBriefId: z.string(),
  iterationOrdinal: z.number().int().positive(),
  decisionKind: decisionKindSchema,
  continuationVerdict: z.enum(["wait", "recommend-existing-gate", "blocked", "ready-for-human-close-gate"]),
  continuationState: continuationStateSchema,
  recommendationState: z.enum(["separate-gate-required", "waiting-for-evidence", "blocked", "ready-for-human-close-gate"]),
  summary: z.string(),
  recommendedAction: recommendedActionSchema.optional(),
  separateGateRequired: z.boolean(),
  humanGateRequired: z.boolean(),
  revalidationChecklist: z.array(z.string()),
  mainAgentInstructions: z.array(z.string()),
  forbiddenExecutionStatements: z.array(z.string()),
  stalenessInstruction: z.string(),
  conflictAssessment: conflictAssessmentSchema,
  schedulerExecutionMode: schedulerExecutionModeSchema,
  completionAudit: completionAuditSchema,
  sourceEvidenceRefs: z.array(sourceEvidenceRefSchema),
  executionStarted: z.literal(false),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) as z.ZodType<GoalLoopNextStepPacket>;

export const goalLoopFeedbackSchema: z.ZodType<GoalLoopFeedback> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  authority: z.literal("non-executing-user-feedback-evidence"),
  sourceGoalLoopDecisionId: z.string(),
  sourceGoalLoopIterationId: z.string(),
  sourceGoalLoopContinuationBriefId: z.string(),
  sourceGoalLoopNextStepPacketId: z.string(),
  recommendedAction: recommendedActionSchema.optional(),
  currentGate: z.object({
    actionType: z.enum(WORKFLOW_ACTION_TYPES),
    scope: z.record(z.union([z.string(), z.array(z.string())])),
  }),
  feedbackText: z.string(),
  feedbackTextHash: z.string(),
  executionStarted: z.literal(false),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const goalLoopControllerPolicySchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  authority: z.literal("non-executing-controller-policy-evidence"),
  sourceGoalLoopDecisionId: z.string(),
  sourceGoalLoopIterationId: z.string(),
  sourceGoalLoopContinuationBriefId: z.string(),
  sourceGoalLoopNextStepPacketId: z.string(),
  iterationOrdinal: z.number().int().positive(),
  verdict: z.enum(["recommend-existing-gate", "suppress-stale-guidance", "wait-for-evidence", "blocked", "ready-for-human-close-gate"]),
  gateStatus: z.enum(["matches-current-gate", "no-current-gate", "no-recommended-action", "packet-stale", "not-a-human-gate", "action-type-mismatch", "change-id-mismatch", "target-mismatch"]),
  summary: z.string(),
  recommendedAction: recommendedActionSchema.optional(),
  currentGate: z.object({
    actionType: z.enum(WORKFLOW_ACTION_TYPES),
    scope: z.record(z.union([z.string(), z.array(z.string())])),
  }).optional(),
  schedulerExecutionMode: schedulerExecutionModeSchema,
  suppressesRecommendedAction: z.boolean(),
  humanGateRequired: z.boolean(),
  revalidationChecklist: z.array(z.string()),
  forbiddenExecutionStatements: z.array(z.string()),
  executionStarted: z.literal(false),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) as z.ZodType<GoalLoopControllerPolicy>;

export const goalLoopGateReadinessPreflightSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  authority: z.literal("non-executing-concrete-gate-readiness-preflight-evidence"),
  status: z.literal("ready"),
  sourceGoalLoopDecisionId: z.string(),
  sourceGoalLoopIterationId: z.string(),
  sourceGoalLoopContinuationBriefId: z.string(),
  sourceGoalLoopNextStepPacketId: z.string(),
  sourceGoalLoopControllerPolicyId: z.string(),
  iterationOrdinal: z.number().int().positive(),
  recommendedAction: recommendedActionSchema,
  currentGate: z.object({
    actionType: z.enum(WORKFLOW_ACTION_TYPES),
    scope: z.record(z.union([z.string(), z.array(z.string())])),
  }),
  schedulerExecutionMode: schedulerExecutionModeSchema,
  summary: z.string(),
  requiredTargetLabels: z.array(z.string()),
  revalidationChecklist: z.array(z.string()),
  forbiddenExecutionStatements: z.array(z.string()),
  humanGateRequired: z.literal(true),
  toolPolicyGateRequiredForConcreteGate: z.literal(true),
  concreteGateRequiresSeparateConfirmation: z.literal(true),
  concreteGateInvoked: z.literal(false),
  toolPolicyAuthorizedConcreteGate: z.literal(false),
  executionStarted: z.literal(false),
  artifact: z.string(),
  markdownArtifact: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) as z.ZodType<GoalLoopGateReadinessPreflight>;
