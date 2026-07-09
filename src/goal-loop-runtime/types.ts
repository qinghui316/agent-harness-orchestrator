import type { WorkflowActionScopeCarrier } from "../workflow-actions/registry.js";

export type GoalLoopRuntimeAuthorizationAuthority = "human-confirmed-bounded-continuation-authorization";
export type GoalLoopRuntimeRunAuthority = "goal-loop-runtime-bounded-continuation-run";
export type GoalLoopRuntimeIterationAuthority = "goal-loop-runtime-controlled-scheduler-iteration";

export type GoalLoopRuntimeStopReason =
  | "max-steps"
  | "no-current-gate"
  | "unsupported-gate"
  | "stale-target"
  | "source-safety"
  | "in-flight-action"
  | "blocked"
  | "high-impact-terminal-gate"
  | "handler-failed";

export interface GoalLoopRuntimeAuthorization {
  version: "1.0";
  id: string;
  changeId: string;
  authority: GoalLoopRuntimeAuthorizationAuthority;
  actionType: "planning.goal-loop.controlled-continue.run";
  maxSteps: number;
  hardMaxSteps: number;
  requestedGate: WorkflowActionScopeCarrier;
  sourceGoalLoopNextStepPacketId: string;
  sourceGoalLoopControllerPolicyId: string;
  sourceGoalLoopGateReadinessPreflightId: string;
  humanConfirmed: true;
  allowedChildActionType: "planning.scheduler.controlled-advance.run";
  fullAutoAuthorized: false;
  parallelExecutorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
}

export interface GoalLoopRuntimeIteration {
  version: "1.0";
  id: string;
  changeId: string;
  authority: GoalLoopRuntimeIterationAuthority;
  goalLoopRuntimeAuthorizationId: string;
  goalLoopRuntimeRunId: string;
  ordinal: number;
  submittedActionType: "planning.scheduler.controlled-advance.run";
  currentGateActionType?: string;
  currentGateScope?: Record<string, unknown>;
  status: "completed" | "failed" | "stopped";
  stopReason?: GoalLoopRuntimeStopReason;
  resultSummary?: string;
  error?: string;
  childAuditScope: {
    coveredByGoalLoopRuntimeAuthorizationId: string;
    goalLoopRuntimeRunId: string;
  };
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  completedAt: string;
}

export interface GoalLoopRuntimeRun {
  version: "1.0";
  id: string;
  changeId: string;
  authority: GoalLoopRuntimeRunAuthority;
  goalLoopRuntimeAuthorizationId: string;
  status: "running" | "completed" | "stopped" | "failed";
  maxSteps: number;
  completedSteps: number;
  stopReason?: GoalLoopRuntimeStopReason;
  stopSummary?: string;
  iterations: string[];
  artifact: string;
  markdownArtifact: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}
