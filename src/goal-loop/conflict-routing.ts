import type { GoalLoopConflictAssessment, GoalLoopDecisionKind, GoalLoopRecommendedAction } from "./types.js";

type EvidenceStatus = string | null | undefined;

export interface GoalLoopConflictRoutingWorkerPath {
  terminal?: boolean;
  result?: { status?: EvidenceStatus } | null;
  validation?: { status?: EvidenceStatus } | null;
  audit?: { status?: EvidenceStatus } | null;
  reworkPlan?: { status?: EvidenceStatus } | null;
  reworkStart?: { status?: EvidenceStatus } | null;
  reworkResult?: { status?: EvidenceStatus } | null;
  reworkValidation?: { status?: EvidenceStatus } | null;
  reworkAudit?: { status?: EvidenceStatus } | null;
}

export interface GoalLoopConflictRoutingInput {
  planningComplete: boolean;
  decisionKind: GoalLoopDecisionKind;
  recommendedAction?: GoalLoopRecommendedAction;
  claimReservation?: { blockedCount?: number; reservedCount?: number } | null;
  currentWorkerPath?: GoalLoopConflictRoutingWorkerPath | null;
  integrationCandidate?: { status?: EvidenceStatus; readyCount?: number; blockedCount?: number } | null;
  integrationHandoff?: { status?: EvidenceStatus; integrationCheckStatus?: EvidenceStatus } | null;
  integrationOutcome?: { status?: EvidenceStatus } | null;
  runCompletion?: { status?: EvidenceStatus } | null;
  runCloseout?: { status?: EvidenceStatus } | null;
  integrationCandidateNeedsRefresh?: boolean;
}

export function assessGoalLoopConflictRouting(input: GoalLoopConflictRoutingInput): GoalLoopConflictAssessment {
  if (!input.planningComplete) {
    return unknown("Planning artifacts are incomplete.");
  }
  if (input.runCompletion) {
    return high(`SchedulerRunCompletion is ${input.runCompletion.status ?? "present"}; close readiness must use the existing human close gate.`);
  }
  if (input.runCloseout) {
    return high(`SchedulerRun blocked/exhausted closeout is ${input.runCloseout.status ?? "present"}; user direction is required before more execution.`);
  }
  if (input.integrationOutcome) {
    return high(`SchedulerIntegrationOutcome is ${input.integrationOutcome.status ?? "present"}; terminal scheduler completion is the next bounded gate.`);
  }
  if (input.integrationHandoff) {
    return high(`IntegrationCheck handoff is ${input.integrationHandoff.status ?? "present"}; wait for or reconcile existing integration evidence instead of starting parallel work.`);
  }
  if ((input.integrationCandidate?.readyCount ?? 0) >= 2 || input.integrationCandidate?.status === "ready") {
    return high("SchedulerIntegrationCandidate has enough ready targets; final combination must route through the existing IntegrationCheck gate.");
  }
  if ((input.integrationCandidate?.blockedCount ?? 0) > 0) {
    return high("SchedulerIntegrationCandidate contains blocked outputs; parallel continuation is not safe.");
  }
  if ((input.claimReservation?.blockedCount ?? 0) > 0) {
    return high("Latest scheduler claim reservation contains blocked claims.");
  }

  const workerAssessment = assessCurrentWorkerPath(input.currentWorkerPath);
  if (workerAssessment) return workerAssessment;

  const recommendedAction = input.recommendedAction;
  if (recommendedAction && isSingleWorkerStartRecommendation(recommendedAction)) {
    return low(`${recommendedAction.actionType} is the current existing scoped worker gate; parallel eligibility is limited to this single human-confirmed transition.`);
  }
  if (input.integrationCandidateNeedsRefresh) {
    return high("Approved worker output requires SchedulerIntegrationCandidate refresh before more worker starts.");
  }
  if (recommendedAction?.actionType === "planning.scheduler.plan.prepare") {
    return unknown("Scheduler plan preparation is required before conflict routing can prove low-conflict worker continuation.");
  }
  if (recommendedAction) {
    return high(`${recommendedAction.actionType} is not a worker-start gate; keep the next step sequential and human-gated.`);
  }
  if ((input.claimReservation?.reservedCount ?? 0) > 0) {
    return unknown("Reserved claims exist, but no current scoped worker-start recommendation is available.");
  }
  return unknown("No current claim reservation proves low-conflict parallel work.");
}

function assessCurrentWorkerPath(path: GoalLoopConflictRoutingWorkerPath | null | undefined): GoalLoopConflictAssessment | null {
  if (!path || path.terminal) return null;
  if (isFailure(path.result?.status)) return high("Current scheduler worker result failed; route through blocked or rework evidence.");
  if (isFailure(path.validation?.status)) return high("Current scheduler worker validation failed; bounded rework is required before parallel continuation.");
  if (isBlockingAudit(path.audit?.status)) return high("Current scheduler worker audit blocked or failed; bounded rework is required before parallel continuation.");
  if (path.reworkPlan) return high("Current scheduler worker is in bounded rework; wait for rework evidence instead of starting parallel work.");
  if (path.reworkStart) return high("Current scheduler worker rework has started; reconcile rework result before other continuation.");
  if (path.reworkResult) return high("Current scheduler worker rework result exists; validate and audit rework before other continuation.");
  if (isFailure(path.reworkValidation?.status)) return high("Current scheduler worker rework validation failed; do not continue parallel work.");
  if (path.reworkValidation) return high("Current scheduler worker rework validation exists; audit rework before other continuation.");
  if (isBlockingAudit(path.reworkAudit?.status)) return high("Current scheduler worker rework audit blocked or failed; user direction or new rework evidence is required.");
  if (!path.result) return medium("A scheduler worker is active; reconcile its result before starting more work.");
  if (!path.validation) return medium("A scheduler worker result exists; validate it before starting more work.");
  if (path.validation.status === "passed" && !path.audit) return medium("A scheduler worker validation passed; audit it before starting more work.");
  return medium("A scheduler worker path is in progress; complete the current sequential gate before parallel continuation.");
}

function isSingleWorkerStartRecommendation(action: GoalLoopRecommendedAction | undefined): boolean {
  return action?.actionType === "planning.scheduler.worker.start-first"
    || action?.actionType === "planning.scheduler.worker.start-next";
}

function isFailure(status: EvidenceStatus): boolean {
  return status === "failed";
}

function isBlockingAudit(status: EvidenceStatus): boolean {
  return status === "blocked" || status === "failed";
}

function low(reason: string): GoalLoopConflictAssessment {
  return { level: "low", parallelEligible: true, reasons: [reason] };
}

function medium(reason: string): GoalLoopConflictAssessment {
  return { level: "medium", parallelEligible: false, reasons: [reason] };
}

function high(reason: string): GoalLoopConflictAssessment {
  return { level: "high", parallelEligible: false, reasons: [reason] };
}

function unknown(reason: string): GoalLoopConflictAssessment {
  return { level: "unknown", parallelEligible: false, reasons: [reason] };
}
