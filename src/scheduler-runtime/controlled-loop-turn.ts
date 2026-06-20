import type { SchedulerLoopPostureState } from "../goal-loop/scheduler-loop-snapshot.js";
import type {
  SchedulerControlledLoopTurnRouteSummary,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepHandoffSummary,
  SchedulerControlledStepPostStepEvidence,
  SchedulerControlledStepResultSummary,
  SchedulerControlledStepResultSummaryValue,
} from "./types.js";

const CONTROLLED_STEP_RESULT_KEYS: Array<{ key: string; idField: string; statusField?: string }> = [
  { key: "schedulerRuntime", idField: "schedulerRuntimeStateId", statusField: "schedulerRuntimeStatus" },
  { key: "schedulerReconcileSnapshot", idField: "schedulerReconcileSnapshotId", statusField: "schedulerReconcileSnapshotStatus" },
  { key: "schedulerClaimReservation", idField: "schedulerClaimReservationId", statusField: "schedulerClaimReservationStatus" },
  { key: "schedulerWorkerStart", idField: "schedulerWorkerStartId", statusField: "schedulerWorkerStartStatus" },
  { key: "schedulerWorkerResult", idField: "schedulerWorkerResultId", statusField: "schedulerWorkerResultStatus" },
  { key: "schedulerWorkerValidation", idField: "schedulerWorkerValidationId", statusField: "schedulerWorkerValidationStatus" },
  { key: "schedulerWorkerAudit", idField: "schedulerWorkerAuditId", statusField: "schedulerWorkerAuditStatus" },
  { key: "schedulerWorkerReworkPlan", idField: "schedulerWorkerReworkPlanId", statusField: "schedulerWorkerReworkPlanStatus" },
  { key: "schedulerWorkerReworkStart", idField: "schedulerWorkerReworkStartId", statusField: "schedulerWorkerReworkStartStatus" },
  { key: "schedulerWorkerReworkResult", idField: "schedulerWorkerReworkResultId", statusField: "schedulerWorkerReworkResultStatus" },
  { key: "schedulerWorkerReworkValidation", idField: "schedulerWorkerReworkValidationId", statusField: "schedulerWorkerReworkValidationStatus" },
  { key: "schedulerWorkerReworkAudit", idField: "schedulerWorkerReworkAuditId", statusField: "schedulerWorkerReworkAuditStatus" },
  { key: "schedulerIntegrationCandidate", idField: "schedulerIntegrationCandidateId", statusField: "schedulerIntegrationCandidateStatus" },
  { key: "schedulerIntegrationCheckHandoff", idField: "schedulerIntegrationCheckHandoffId", statusField: "schedulerIntegrationCheckHandoffStatus" },
  { key: "schedulerIntegrationOutcome", idField: "schedulerIntegrationOutcomeId", statusField: "schedulerIntegrationOutcomeStatus" },
  { key: "schedulerRunCompletion", idField: "schedulerRunCompletionId", statusField: "schedulerRunCompletionStatus" },
  { key: "schedulerRunBlockedCloseout", idField: "schedulerRunBlockedCloseoutId", statusField: "schedulerRunBlockedCloseoutStatus" },
];

export interface BuildSchedulerControlledLoopTurnRouteSummaryInput {
  executedActionType: string;
  postStepEvidence: SchedulerControlledStepPostStepEvidence;
  postStepHandoff: SchedulerControlledStepHandoffSummary;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
  forbiddenAuthority: SchedulerControlledStepForbiddenAuthority;
}

export function summarizeSchedulerControlledStepResult(result: unknown): SchedulerControlledStepResultSummary | undefined {
  if (!isRecord(result)) return undefined;
  const summary: SchedulerControlledStepResultSummary = {};
  for (const spec of CONTROLLED_STEP_RESULT_KEYS) {
    const candidate = result[spec.key];
    if (!isRecord(candidate)) continue;
    const id = candidate.id;
    if (typeof id !== "string" || !id) continue;
    summary.resultKind = spec.key;
    summary[spec.idField] = id;
    if (spec.statusField && typeof candidate.status === "string" && candidate.status) {
      summary[spec.statusField] = candidate.status;
    }
    const artifact = candidate.artifact;
    if (typeof artifact === "string" && artifact) summary.resultArtifact = artifact;
    break;
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
}

export function buildSchedulerControlledLoopTurnRouteSummary(input: BuildSchedulerControlledLoopTurnRouteSummaryInput): SchedulerControlledLoopTurnRouteSummary {
  const result = extractRouteResult(input.controlledStepResultSummary);
  const warning = input.postStepEvidence.evaluationWarning
    ?? input.postStepEvidence.readinessWarning
    ?? input.postStepHandoff.warning;
  const nextCandidateActionType = input.postStepHandoff.nextConfirmationCandidate?.actionType;
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-turn-route-summary",
    executedActionType: input.executedActionType,
    resultKind: result.resultKind,
    resultId: result.resultId,
    resultStatus: result.resultStatus,
    resultArtifact: result.resultArtifact,
    routePosture: routePostureFor(input.postStepHandoff, input.postStepEvidence),
    postStepStatus: input.postStepHandoff.status,
    nextCandidateActionType,
    humanGateRequired: Boolean(nextCandidateActionType),
    humanConfirmationStillRequired: true,
    needsReevaluation: input.postStepHandoff.needsReevaluation,
    warning,
    executionStarted: false,
    loopAuthorized: input.forbiddenAuthority.loopAuthorized,
    fullParallelExecutorAuthorized: input.forbiddenAuthority.fullParallelExecutorAuthorized,
    wholeWaveDispatchAuthorized: input.forbiddenAuthority.wholeWaveDispatchAuthorized,
    slotAllocatorAuthorized: input.forbiddenAuthority.slotAllocatorAuthorized,
    sourceMutationAuthorized: input.forbiddenAuthority.sourceMutationAuthorized,
    applyAuthorized: input.forbiddenAuthority.applyAuthorized,
    closeAuthorized: input.forbiddenAuthority.closeAuthorized,
    mergeAuthorized: input.forbiddenAuthority.mergeAuthorized,
    remoteLandingAuthorized: input.forbiddenAuthority.remoteLandingAuthorized,
    harnessEvolutionAuthorized: input.forbiddenAuthority.harnessEvolutionAuthorized,
  };
}

function routePostureFor(
  handoff: SchedulerControlledStepHandoffSummary,
  postStepEvidence: SchedulerControlledStepPostStepEvidence,
): SchedulerLoopPostureState {
  const actionType = handoff.nextConfirmationCandidate?.actionType ?? postStepEvidence.recommendedActionType;
  if (!actionType) return "waiting";
  if (actionType === "planning.scheduler.run.complete" || actionType === "planning.scheduler.run.close-blocked") {
    return "terminal-handoff";
  }
  if (actionType.includes("integration-candidate") || actionType.includes("integration-check") || actionType.includes("integration-outcome")) {
    return "integration-barrier";
  }
  if (actionType.includes(".rework") || postStepEvidence.continuationState === "blocked") {
    return "quality-routing";
  }
  if (handoff.nextConfirmationCandidate?.readinessEvidencePrepared) return "awaiting-human-gate";
  return handoff.nextConfirmationCandidate ? "recommending-gate" : "waiting";
}

function extractRouteResult(summary: SchedulerControlledStepResultSummary | undefined): {
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  resultArtifact?: string;
} {
  if (!summary) return {};
  return {
    resultKind: readString(summary.resultKind),
    resultId: firstStringValue(summary, (key) => key !== "resultKind" && key !== "resultArtifact" && key.endsWith("Id")),
    resultStatus: firstStringValue(summary, (key) => key.endsWith("Status")),
    resultArtifact: readString(summary.resultArtifact),
  };
}

function firstStringValue(summary: SchedulerControlledStepResultSummary, predicate: (key: string) => boolean): string | undefined {
  for (const [key, value] of Object.entries(summary)) {
    if (predicate(key) && typeof value === "string" && value) return value;
  }
  return undefined;
}

function readString(value: SchedulerControlledStepResultSummaryValue | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
