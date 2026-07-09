import type { GoalLoopConflictAssessment, GoalLoopDecisionKind, GoalLoopRecommendedAction, GoalLoopRoutingPosture } from "./types.js";

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
    return waitForEvidence("Planning artifacts are incomplete.");
  }
  if (input.runCompletion) {
    return closeGate(`SchedulerRunCompletion is ${input.runCompletion.status ?? "present"}; close readiness must use the existing human close gate.`);
  }
  if (input.runCloseout) {
    return blockedOrRework(`SchedulerRun blocked/exhausted closeout is ${input.runCloseout.status ?? "present"}; user direction is required before more execution.`);
  }
  if (input.integrationOutcome) {
    return integrationCheckRequired(`SchedulerIntegrationOutcome is ${input.integrationOutcome.status ?? "present"}; terminal scheduler completion is the next bounded gate.`);
  }
  if (input.integrationHandoff) {
    return integrationCheckRequired(`IntegrationCheck handoff is ${input.integrationHandoff.status ?? "present"}; wait for or reconcile existing integration evidence instead of starting parallel work.`);
  }
  if ((input.integrationCandidate?.readyCount ?? 0) >= 2 || input.integrationCandidate?.status === "ready") {
    return integrationCheckRequired("SchedulerIntegrationCandidate has enough ready targets; final combination must route through the existing IntegrationCheck gate.");
  }
  if ((input.integrationCandidate?.blockedCount ?? 0) > 0) {
    return blockedOrRework("SchedulerIntegrationCandidate contains blocked outputs; parallel continuation is not safe.");
  }
  if ((input.claimReservation?.blockedCount ?? 0) > 0) {
    return blockedOrRework("Latest scheduler claim reservation contains blocked claims.");
  }

  const workerAssessment = assessCurrentWorkerPath(input.currentWorkerPath);
  if (workerAssessment) return workerAssessment;

  const recommendedAction = input.recommendedAction;
  if (recommendedAction && isSingleWorkerStartRecommendation(recommendedAction)) {
    return singleWorkerGate(`${recommendedAction.actionType} is the current existing scoped worker gate; parallel eligibility is limited to this single human-confirmed transition.`);
  }
  if (input.integrationCandidateNeedsRefresh) {
    return candidateRefresh("Approved worker output requires SchedulerIntegrationCandidate refresh before more worker starts.");
  }
  if (recommendedAction?.actionType === "planning.scheduler.run.close-blocked") {
    return blockedOrRework(`${recommendedAction.actionType} is not a worker-start gate; it records a blocked scheduler closeout and requires user direction before more execution.`);
  }
  if (recommendedAction?.actionType === "planning.scheduler.plan.prepare") {
    return waitForEvidence("Scheduler plan preparation is required before conflict routing can prove low-conflict worker continuation.");
  }
  if (recommendedAction) {
    return sequentialCurrentWorker(`${recommendedAction.actionType} is not a worker-start gate; keep the next step sequential and human-gated.`);
  }
  if ((input.claimReservation?.reservedCount ?? 0) > 0) {
    return waitForEvidence("Reserved claims exist, but no current scoped worker-start recommendation is available.");
  }
  return waitForEvidence("No current claim reservation proves low-conflict parallel work.");
}

function assessCurrentWorkerPath(path: GoalLoopConflictRoutingWorkerPath | null | undefined): GoalLoopConflictAssessment | null {
  if (!path || path.terminal) return null;
  if (isFailure(path.result?.status)) return blockedOrRework("Current scheduler worker result failed; route through blocked or rework evidence.");
  if (isFailure(path.validation?.status)) return blockedOrRework("Current scheduler worker validation failed; bounded rework is required before parallel continuation.");
  if (isBlockingAudit(path.audit?.status)) return blockedOrRework("Current scheduler worker audit blocked or failed; bounded rework is required before parallel continuation.");
  if (path.reworkPlan) return blockedOrRework("Current scheduler worker is in bounded rework; wait for rework evidence instead of starting parallel work.");
  if (path.reworkStart) return blockedOrRework("Current scheduler worker rework has started; reconcile rework result before other continuation.");
  if (path.reworkResult) return blockedOrRework("Current scheduler worker rework result exists; validate and audit rework before other continuation.");
  if (isFailure(path.reworkValidation?.status)) return blockedOrRework("Current scheduler worker rework validation failed; do not continue parallel work.");
  if (path.reworkValidation) return blockedOrRework("Current scheduler worker rework validation exists; audit rework before other continuation.");
  if (isBlockingAudit(path.reworkAudit?.status)) return blockedOrRework("Current scheduler worker rework audit blocked or failed; user direction or new rework evidence is required.");
  if (!path.result) return sequentialCurrentWorker("A scheduler worker is active; reconcile its result before starting more work.");
  if (!path.validation) return sequentialCurrentWorker("A scheduler worker result exists; validate it before starting more work.");
  if (path.validation.status === "passed" && !path.audit) return sequentialCurrentWorker("A scheduler worker validation passed; audit it before starting more work.");
  return sequentialCurrentWorker("A scheduler worker path is in progress; complete the current sequential gate before parallel continuation.");
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

function singleWorkerGate(reason: string): GoalLoopConflictAssessment {
  return assessment("low", true, "single-worker-gate", "Single scoped worker gate", reason);
}

function sequentialCurrentWorker(reason: string): GoalLoopConflictAssessment {
  return assessment("medium", false, "sequential-current-worker", "Sequential current-worker gate", reason);
}

function candidateRefresh(reason: string): GoalLoopConflictAssessment {
  return assessment("high", false, "candidate-refresh-required", "Scheduler candidate refresh required", reason);
}

function integrationCheckRequired(reason: string): GoalLoopConflictAssessment {
  return assessment("high", false, "integration-check-required", "IntegrationCheck path required", reason);
}

function blockedOrRework(reason: string): GoalLoopConflictAssessment {
  return assessment("high", false, "blocked-or-rework", "Blocked or bounded rework", reason);
}

function closeGate(reason: string): GoalLoopConflictAssessment {
  return assessment("high", false, "close-gate-required", "Human close gate required", reason);
}

function waitForEvidence(reason: string): GoalLoopConflictAssessment {
  return assessment("unknown", false, "wait-for-evidence", "Wait for more evidence", reason);
}

function assessment(
  level: GoalLoopConflictAssessment["level"],
  parallelEligible: boolean,
  routingPosture: GoalLoopRoutingPosture,
  routingLabel: string,
  reason: string,
): GoalLoopConflictAssessment {
  return { level, parallelEligible, routingPosture, routingLabel, reasons: [reason] };
}
