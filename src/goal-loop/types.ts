import type { WorkflowActionType } from "../workflow-actions/registry.js";

export type GoalLoopDecisionAuthority = "non-executing-planning-evidence";

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
