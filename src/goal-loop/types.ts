import type { WorkflowActionType } from "../workflow-actions/registry.js";

export type GoalLoopDecisionAuthority = "non-executing-planning-evidence";
export type GoalLoopIterationAuthority = "non-executing-continuation-evidence";
export type GoalLoopContinuationBriefAuthority = "non-executing-continuation-brief-evidence";
export type GoalLoopNextStepPacketAuthority = "non-executing-main-agent-next-step-packet";

export type GoalLoopDecisionKind =
  | "planning-needed"
  | "sequential-loop"
  | "parallel-plan-needed"
  | "scheduler-next-step"
  | "integration-needed"
  | "human-gate"
  | "wait-for-evidence"
  | "blocked"
  | "completed-ready-for-human-close-gate";

export type GoalLoopConflictLevel = "low" | "medium" | "high" | "unknown";

export interface GoalLoopSourceEvidenceRef {
  kind: string;
  id?: string;
  status?: string;
  artifact?: string;
  summary: string;
}

export interface GoalLoopConflictAssessment {
  level: GoalLoopConflictLevel;
  parallelEligible: boolean;
  reasons: string[];
}

export interface GoalLoopCompletionAudit {
  status: "incomplete" | "ready-for-human-close-gate" | "blocked";
  evidence: string[];
  missing: string[];
}

export interface GoalLoopRecommendedAction {
  actionType: WorkflowActionType;
  scope: Record<string, string | string[]>;
  reason: string;
}

export interface GoalLoopForbiddenAction {
  actionType: string;
  reason: string;
}

export interface GoalLoopDecision {
  version: "1.0";
  id: string;
  changeId: string;
  authority: GoalLoopDecisionAuthority;
  decisionKind: GoalLoopDecisionKind;
  summary: string;
  recommendedAction?: GoalLoopRecommendedAction;
  humanGateRequired: boolean;
  forbiddenActions: GoalLoopForbiddenAction[];
  conflictAssessment: GoalLoopConflictAssessment;
  completionAudit: GoalLoopCompletionAudit;
  sourceEvidenceRefs: GoalLoopSourceEvidenceRef[];
  executionStarted: false;
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalLoopIterationTrigger = "user-confirmed-evaluate";
export type GoalLoopIterationStatus = "recorded";
export type GoalLoopContinuationVerdict =
  | "wait"
  | "recommend-existing-gate"
  | "blocked"
  | "ready-for-human-close-gate";

export type GoalLoopContinuationState =
  | "waiting-for-evidence"
  | "ready-for-existing-gate"
  | "blocked"
  | "budget-limited"
  | "ready-for-human-close-gate";

export interface GoalLoopControlPolicy {
  authority: "evidence-only-control-constraints";
  canAutoContinue: false;
  canAutoExecuteRecommendedAction: false;
  requiresHumanGate: boolean;
  recommendedActionType?: WorkflowActionType;
  reason: string;
}

export interface GoalLoopBudgetSignal {
  status: "unknown" | "declared" | "budget-limited";
  summary: string;
  tokensUsed?: number;
  tokenBudget?: number;
  remainingTokens?: number;
}

export interface GoalLoopResumePrecondition {
  kind: string;
  id?: string;
  satisfied: boolean;
  summary: string;
}

export interface GoalLoopSuppressionReason {
  reason:
    | "waiting-for-evidence"
    | "blocked"
    | "ready-for-human-close-gate"
    | "budget-limited"
    | "specific-gate-required";
  summary: string;
}

export interface GoalLoopIteration {
  version: "1.0";
  id: string;
  changeId: string;
  ordinal: number;
  authority: GoalLoopIterationAuthority;
  trigger: GoalLoopIterationTrigger;
  iterationStatus: GoalLoopIterationStatus;
  continuationVerdict: GoalLoopContinuationVerdict;
  continuationState: GoalLoopContinuationState;
  controlPolicy: GoalLoopControlPolicy;
  budgetSignal: GoalLoopBudgetSignal;
  resumePreconditions: GoalLoopResumePrecondition[];
  suppressedBecause?: GoalLoopSuppressionReason;
  previousGoalLoopDecisionId?: string;
  previousGoalLoopIterationId?: string;
  goalLoopDecisionId: string;
  decisionKind: GoalLoopDecisionKind;
  summary: string;
  recommendedAction?: GoalLoopRecommendedAction;
  humanGateRequired: boolean;
  conflictAssessment: GoalLoopConflictAssessment;
  completionAudit: GoalLoopCompletionAudit;
  sourceEvidenceRefs: GoalLoopSourceEvidenceRef[];
  executionStarted: false;
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalLoopContinuationBrief {
  version: "1.0";
  id: string;
  changeId: string;
  authority: GoalLoopContinuationBriefAuthority;
  sourceGoalLoopDecisionId: string;
  sourceGoalLoopIterationId: string;
  iterationOrdinal: number;
  decisionKind: GoalLoopDecisionKind;
  continuationVerdict: GoalLoopContinuationVerdict;
  continuationState: GoalLoopContinuationState;
  summary: string;
  recommendedAction?: GoalLoopRecommendedAction;
  humanGateRequired: boolean;
  controlPolicy: GoalLoopControlPolicy;
  budgetSignal: GoalLoopBudgetSignal;
  resumePreconditions: GoalLoopResumePrecondition[];
  suppressedBecause?: GoalLoopSuppressionReason;
  conflictAssessment: GoalLoopConflictAssessment;
  completionAudit: GoalLoopCompletionAudit;
  sourceEvidenceRefs: GoalLoopSourceEvidenceRef[];
  forbiddenActions: GoalLoopForbiddenAction[];
  stalenessInstruction: string;
  mainAgentInstructions: string[];
  forbiddenExecutionStatements: string[];
  executionStarted: false;
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalLoopNextStepRecommendationState =
  | "separate-gate-required"
  | "waiting-for-evidence"
  | "blocked"
  | "ready-for-human-close-gate";

export interface GoalLoopNextStepPacket {
  version: "1.0";
  id: string;
  changeId: string;
  authority: GoalLoopNextStepPacketAuthority;
  sourceGoalLoopDecisionId: string;
  sourceGoalLoopIterationId: string;
  sourceGoalLoopContinuationBriefId: string;
  iterationOrdinal: number;
  decisionKind: GoalLoopDecisionKind;
  continuationVerdict: GoalLoopContinuationVerdict;
  continuationState: GoalLoopContinuationState;
  recommendationState: GoalLoopNextStepRecommendationState;
  summary: string;
  recommendedAction?: GoalLoopRecommendedAction;
  separateGateRequired: boolean;
  humanGateRequired: boolean;
  revalidationChecklist: string[];
  mainAgentInstructions: string[];
  forbiddenExecutionStatements: string[];
  stalenessInstruction: string;
  conflictAssessment: GoalLoopConflictAssessment;
  completionAudit: GoalLoopCompletionAudit;
  sourceEvidenceRefs: GoalLoopSourceEvidenceRef[];
  executionStarted: false;
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}
