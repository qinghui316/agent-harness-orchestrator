import type { SchedulerMode } from "../workflow-scheduler/types.js";
import type { SchedulerLoopPostureState } from "../goal-loop/scheduler-loop-snapshot.js";

export type SchedulerRuntimeStateStatus = "initialized" | "blocked";
export type SchedulerClaimIntentRuntimeStatus = "pending" | "blocked";
export type SchedulerRuntimeClaimReservationStatus = "reserved" | "blocked" | "rejected";
export type SchedulerRuntimeClaimReservationIntentStatus = "reserved" | "blocked";
export type SchedulerRuntimeSourceLockReservationStatus = "reserved" | "blocked";
export type SchedulerRuntimeWaveReservationStatus = "reserved" | "blocked";
export type SchedulerRuntimeEventType =
  | "scheduler-runtime.initialized"
  | "scheduler-runtime.reconciled"
  | "scheduler-runtime.blocked"
  | "scheduler-runtime.claim-reserved"
  | "scheduler-runtime.claim-blocked"
  | "scheduler-runtime.claim-reservation.superseded"
  | "scheduler-runtime.worker-started"
  | "scheduler-runtime.worker-start-failed"
  | "scheduler-runtime.worker-result-ready"
  | "scheduler-runtime.worker-result-failed"
  | "scheduler-runtime.worker-validation-passed"
  | "scheduler-runtime.worker-validation-failed"
  | "scheduler-runtime.worker-audit-approved"
  | "scheduler-runtime.worker-audit-blocked"
  | "scheduler-runtime.worker-audit-failed"
  | "scheduler-runtime.worker-rework-planned"
  | "scheduler-runtime.worker-rework-started"
  | "scheduler-runtime.worker-rework-start-failed"
  | "scheduler-runtime.worker-rework-result-ready"
  | "scheduler-runtime.worker-rework-result-failed"
  | "scheduler-runtime.worker-rework-validation-passed"
  | "scheduler-runtime.worker-rework-validation-failed"
  | "scheduler-runtime.worker-rework-audit-approved"
  | "scheduler-runtime.worker-rework-audit-blocked"
  | "scheduler-runtime.worker-rework-audit-failed"
  | "scheduler-runtime.integration-candidate-compiled"
  | "scheduler-runtime.integration-check-handoff-completed"
  | "scheduler-runtime.integration-outcome-recorded"
  | "scheduler-runtime.controlled-step-recorded"
  | "scheduler-runtime.run-completed"
  | "scheduler-runtime.run-closeout-recorded";
export type SchedulerReconcileSnapshotStatus = "generated" | "blocked";
export type SchedulerRuntimeWorkerStartStatus = "started" | "failed";
export type SchedulerRuntimeWorkerResultStatus = "evidence-ready" | "failed";
export type SchedulerRuntimeWorkerValidationStatus = "passed" | "failed";
export type SchedulerRuntimeWorkerAuditStatus = "approved" | "approved-with-notes" | "blocked" | "failed";
export type SchedulerRuntimeWorkerReworkPlanStatus = "planned";
export type SchedulerRuntimeWorkerReworkStartStatus = "started" | "failed";
export type SchedulerRuntimeWorkerReworkResultStatus = "evidence-ready" | "failed";
export type SchedulerRuntimeWorkerReworkValidationStatus = "passed" | "failed";
export type SchedulerRuntimeWorkerReworkAuditStatus = "approved" | "approved-with-notes" | "blocked" | "failed";
export type SchedulerRuntimeWorkerReworkBlockingSource = "validation-failed" | "audit-blocked" | "audit-failed";
export type SchedulerIntegrationCandidateStatus = "ready" | "waiting" | "blocked";
export type SchedulerIntegrationCandidateOutputKind = "worker" | "rework" | "inconsistency";
export type SchedulerIntegrationCandidateOutputStatus = "ready" | "blocked";
export type SchedulerIntegrationCheckHandoffStatus = "completed";
export type SchedulerIntegrationOutcomeStatus = "applied" | "discarded" | "blocked";
export type SchedulerRunCompletionStatus = "completed-applied" | "completed-discarded" | "completed-blocked";
export type SchedulerRunBlockedCloseoutStatus = "blocked" | "exhausted" | "stopped";
export type SchedulerRunBlockedCloseoutReason = "candidate-waiting-exhausted" | "candidate-blocked" | "candidate-inconsistent" | "user-stopped";
export type SchedulerControlledStepEvidenceStatus = "recorded" | "recorded-with-warning";

export interface SchedulerRuntimeClaimIntentState {
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  status: SchedulerClaimIntentRuntimeStatus;
  plannedSlotDemand: number;
  sourceScopes: string[];
  blockedReasons: string[];
}

export interface SchedulerRuntimeWaveState {
  waveIndex: number;
  claimIntentIds: string[];
  candidateCount: number;
  blockedCount: number;
  plannedSlotDemand: number;
  status: SchedulerClaimIntentRuntimeStatus;
  blockedReasons: string[];
}

export interface SchedulerRuntimeState {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeStateStatus;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  decompositionPlanId: string;
  readinessManifestId: string;
  claimIntents: SchedulerRuntimeClaimIntentState[];
  waves: SchedulerRuntimeWaveState[];
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  lastReconcileSnapshotId?: string;
  lastClaimReservationId?: string;
  lastClaimReservationSnapshotId?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  eventsArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeEvent {
  version: "1.0";
  id: string;
  schedulerRunId: string;
  changeId: string;
  type: SchedulerRuntimeEventType;
  timestamp: string;
  status?: SchedulerRuntimeStateStatus;
  summary?: string;
  artifactRefs?: string[];
  payload?: Record<string, unknown>;
}

export interface SchedulerControlledStepForbiddenAuthority {
  loopAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  fullParallelExecutorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export type SchedulerControlledStepResultSummaryValue = string | number | boolean | string[] | null;
export type SchedulerControlledStepResultSummary = Record<string, SchedulerControlledStepResultSummaryValue>;
export type SchedulerControlledLoopTurnRoutePosture = SchedulerLoopPostureState;
export type SchedulerControlledLoopPostStepRoutingOwner =
  | "scheduler-runtime"
  | "integration-check"
  | "validation-audit"
  | "goal-loop-current-gate"
  | "existing-human-gate";
export type SchedulerControlledLoopPostStepRoutingTargetScopeSource =
  | "dispatched-current-gate"
  | "fresh-current-gate-required"
  | "none";

export interface SchedulerControlledLoopTurnRouteSummary {
  version: "1.0";
  authority: "scheduler-runtime-controlled-loop-turn-route-summary";
  executedActionType: string;
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  resultArtifact?: string;
  routePosture: SchedulerControlledLoopTurnRoutePosture;
  postStepStatus: string;
  nextCandidateActionType?: string;
  humanGateRequired: boolean;
  humanConfirmationStillRequired: true;
  needsReevaluation: boolean;
  warning?: string;
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface SchedulerControlledLoopPostStepRoutingDecision {
  version: "1.0";
  authority: "scheduler-runtime-controlled-loop-post-step-routing-decision";
  routeFamily: SchedulerControlledLoopTurnRoutePosture;
  continuationReadinessStatus: SchedulerControlledLoopContinuationReadinessStatus;
  ownerModule: SchedulerControlledLoopPostStepRoutingOwner;
  executedActionType: string;
  selectedActionType?: string;
  dispatchedActionType?: string;
  existingGateActionType?: string;
  gateTargetScopeSource: SchedulerControlledLoopPostStepRoutingTargetScopeSource;
  dispatchedTargetScope?: Record<string, string | string[]>;
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  reason: string;
  boundary: string;
  readinessEvidencePrepared: boolean;
  needsReevaluation: boolean;
  freshEvidenceRequiredBeforeContinuation: true;
  freshCurrentGateRequiredBeforeContinuation: true;
  humanGateRequired: boolean;
  humanConfirmationStillRequired: true;
  priorTurnEvidence: true;
  evidenceRefs: string[];
  warning?: string;
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export type SchedulerControlledLoopTickPhaseStatus = "recorded" | "completed" | "warning";

export interface SchedulerControlledLoopTickSummary {
  version: "1.0";
  authority: "scheduler-runtime-controlled-loop-tick-contract-summary";
  observe: {
    status: SchedulerControlledLoopTickPhaseStatus;
    goalLoopDecisionId: string;
    goalLoopIterationId: string;
    goalLoopContinuationBriefId: string;
    goalLoopNextStepPacketId: string;
    submittedActionType: string;
  };
  chooseCheck: {
    status: SchedulerControlledLoopTickPhaseStatus;
    goalLoopControllerPolicyId: string;
    goalLoopGateReadinessPreflightId: string;
    targetScopeMatched: true;
    concreteGatePreflightNonExecuting: true;
  };
  dispatch: {
    status: "completed";
    executedActionType: string;
    executionStarted: true;
    stoppedAfterOneSchedulerTransition: true;
    approvedScopeOnly: true;
  };
  reconcile: {
    status: SchedulerControlledLoopTickPhaseStatus;
    goalLoopDecisionId?: string;
    goalLoopIterationId?: string;
    goalLoopContinuationBriefId?: string;
    goalLoopNextStepPacketId?: string;
    goalLoopControllerPolicyId?: string;
    goalLoopGateReadinessPreflightId?: string;
    warning?: string;
    executionStarted: false;
  };
  routeStop: {
    status: string;
    stopReason: string;
    routePosture: SchedulerControlledLoopTurnRoutePosture;
    nextCandidateActionType?: string;
    humanGateRequired: boolean;
    humanConfirmationStillRequired: true;
    needsReevaluation: boolean;
    warning?: string;
  };
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  resultArtifact?: string;
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export type SchedulerControlledLoopContinuationReadinessStatus =
  | "ready-for-human-gate"
  | "needs-review"
  | "waiting"
  | "quality-routing"
  | "integration-barrier"
  | "terminal-handoff";

export interface ControlledSchedulerContinuationDecision {
  version: "1.0";
  authority: "scheduler-runtime-controlled-loop-continuation-decision";
  status: SchedulerControlledLoopContinuationReadinessStatus;
  changeId: string;
  nextGateActionType?: string;
  reason: string;
  boundary: string;
  evidenceRefs: string[];
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface SchedulerControlledLoopContinuationReadiness {
  version: "1.0";
  authority: "scheduler-runtime-controlled-loop-continuation-readiness";
  status: SchedulerControlledLoopContinuationReadinessStatus;
  routePosture: SchedulerControlledLoopTurnRoutePosture;
  executedActionType: string;
  nextCandidateActionType?: string;
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  reason: string;
  boundary: string;
  readinessEvidencePrepared: boolean;
  needsReevaluation: boolean;
  humanGateRequired: boolean;
  humanConfirmationStillRequired: true;
  evidenceRefs: string[];
  warning?: string;
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export type SchedulerControlledLoopIterationStatus = "completed" | "completed-with-warning";

export interface SchedulerControlledLoopIterationSummary {
  version: "1.0";
  authority: "scheduler-runtime-controlled-loop-iteration-summary";
  status: SchedulerControlledLoopIterationStatus;
  executedActionType: string;
  observeStatus: SchedulerControlledLoopTickPhaseStatus;
  chooseCheckStatus: SchedulerControlledLoopTickPhaseStatus;
  dispatchStatus: "completed";
  reconcileStatus: SchedulerControlledLoopTickPhaseStatus;
  routePosture: SchedulerControlledLoopTurnRoutePosture;
  routeStopReason: string;
  continuationReadinessStatus: SchedulerControlledLoopContinuationReadinessStatus;
  nextCandidateActionType?: string;
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  resultArtifact?: string;
  readinessEvidencePrepared: boolean;
  needsReevaluation: boolean;
  humanGateRequired: boolean;
  humanConfirmationStillRequired: true;
  stoppedAfterOneSchedulerTransition: true;
  approvedScopeOnly: true;
  boundary: string;
  evidenceRefs: string[];
  warning?: string;
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface SchedulerControlledLoopStopSummary {
  version: "1.0";
  authority: "scheduler-runtime-controlled-loop-stop-summary";
  executedActionType: string;
  stopReason: string;
  routePosture: SchedulerControlledLoopTurnRoutePosture;
  continuationReadinessStatus: SchedulerControlledLoopContinuationReadinessStatus;
  nextGateActionType?: string;
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  humanGateRequired: boolean;
  readinessEvidencePrepared: boolean;
  needsReevaluation: boolean;
  humanConfirmationStillRequired: true;
  userFacingReason: string;
  boundary: string;
  evidenceRefs: string[];
  warning?: string;
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export type SchedulerControlledLoopBoundaryResultStatus = "recorded" | "recorded-with-warning";
export type SchedulerControlledLoopBoundaryResultNextGateTargetScopeSource = "fresh-current-gate-required";

export interface SchedulerControlledLoopBoundaryResult {
  version: "1.0";
  authority: "scheduler-runtime-controlled-loop-boundary-result";
  status: SchedulerControlledLoopBoundaryResultStatus;
  selectedActionType: string;
  submittedActionType: string;
  dispatchedActionType: string;
  selectedGateScope: Record<string, string | string[]>;
  observeStatus: SchedulerControlledLoopTickPhaseStatus;
  chooseCheckStatus: SchedulerControlledLoopTickPhaseStatus;
  dispatchStatus: "completed";
  reconcileStatus: SchedulerControlledLoopTickPhaseStatus;
  boundaryPosture: SchedulerControlledLoopTurnRoutePosture;
  continuationReadinessStatus: SchedulerControlledLoopContinuationReadinessStatus;
  stopReason: string;
  nextGateActionType?: string;
  nextGateTargetScopeSource?: SchedulerControlledLoopBoundaryResultNextGateTargetScopeSource;
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  readinessEvidencePrepared: boolean;
  needsReevaluation: boolean;
  humanGateRequired: boolean;
  humanConfirmationStillRequired: true;
  futureContinuationRequiresFreshEvidence: true;
  futureContinuationRequiresFreshCurrentGate: true;
  stoppedAfterOneSchedulerTransition: true;
  approvedScopeOnly: true;
  boundary: string;
  evidenceRefs: string[];
  warning?: string;
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export type SchedulerControlledLoopRuntimeBoundaryStatus = "recorded" | "recorded-with-warning";
export type SchedulerControlledLoopRuntimeBoundaryStopTargetScopeSource = "fresh-current-gate-required" | "none";

export interface SchedulerControlledLoopRuntimeBoundary {
  version: "1.0";
  authority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence";
  status: SchedulerControlledLoopRuntimeBoundaryStatus;
  changeId: string;
  schedulerRunId?: string;
  submittedActionType: string;
  selectedActionType: string;
  dispatchedActionType: string;
  observeStatus: SchedulerControlledLoopTickPhaseStatus;
  chooseStatus: SchedulerControlledLoopTickPhaseStatus;
  humanGateStatus: "confirmed-current-step";
  dispatchStatus: "completed";
  reconcileStatus: SchedulerControlledLoopTickPhaseStatus;
  stopStatus: string;
  stopPosture: SchedulerControlledLoopTurnRoutePosture;
  stopReason: string;
  continuationReadinessStatus: SchedulerControlledLoopContinuationReadinessStatus;
  nextGateActionType?: string;
  nextGateTargetScopeSource: SchedulerControlledLoopRuntimeBoundaryStopTargetScopeSource;
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  observedGoalLoopNextStepPacketId: string;
  selectedGoalLoopGateReadinessPreflightId: string;
  reconciledGoalLoopNextStepPacketId?: string;
  readinessEvidencePrepared: boolean;
  needsReevaluation: boolean;
  humanConfirmationStillRequired: true;
  stoppedAfterOneSchedulerTransition: true;
  approvedScopeOnly: true;
  priorTurnEvidence: true;
  freshEvidenceRequiredBeforeContinuation: true;
  freshCurrentGateRequiredBeforeContinuation: true;
  boundary: string;
  evidenceRefs: string[];
  warning?: string;
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface SchedulerControlledStepPreStepEvidence {
  goalLoopDecisionId: string;
  goalLoopIterationId: string;
  goalLoopContinuationBriefId: string;
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId: string;
  goalLoopGateReadinessPreflightId: string;
}

export interface SchedulerControlledStepPostStepEvidence {
  goalLoopDecisionId?: string;
  goalLoopIterationId?: string;
  goalLoopContinuationBriefId?: string;
  goalLoopNextStepPacketId?: string;
  recommendedActionType?: string;
  continuationState?: string;
  goalLoopControllerPolicyId?: string;
  goalLoopGateReadinessPreflightId?: string;
  currentGateActionType?: string;
  evaluationWarning?: string;
  readinessWarning?: string;
  executionStarted: false;
  concreteGateInvoked: false;
  toolPolicyAuthorizedConcreteGate: false;
}

export interface SchedulerControlledLoopCurrentTransitionChoice {
  version: "1.0";
  authority: "scheduler-runtime-current-transition-choice";
  status: "ready-for-dispatch";
  changeId: string;
  selectedActionType: string;
  submittedActionType: string;
  currentGate: {
    actionType: string;
    scope: Record<string, string | string[]>;
  };
  goalLoopDecisionId: string;
  goalLoopIterationId: string;
  goalLoopContinuationBriefId: string;
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId: string;
  goalLoopGateReadinessPreflightId: string;
  humanGateRequired: true;
  humanConfirmationStillRequired: true;
  executionStarted: false;
  concreteGateInvoked: false;
  toolPolicyAuthorizedConcreteGate: false;
  authorizationGranted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface SchedulerControlledStepNextCandidate {
  actionType: string;
  goalLoopNextStepPacketId?: string;
  goalLoopControllerPolicyId?: string;
  goalLoopGateReadinessPreflightId?: string;
  readinessEvidencePrepared: boolean;
  executionStarted: false;
  authorizationGranted: false;
  humanConfirmationStillRequired: true;
}

export interface SchedulerControlledStepHandoffSummary {
  status: string;
  stopReason: string;
  executedActionType: string;
  needsReevaluation: boolean;
  warning?: string;
  nextConfirmationCandidate?: SchedulerControlledStepNextCandidate;
  executionStarted: false;
  loopAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
}

export interface SchedulerControlledStepEvidence {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId?: string;
  status: SchedulerControlledStepEvidenceStatus;
  executedActionType: string;
  targetScope: Record<string, string | string[]>;
  preStepEvidence: SchedulerControlledStepPreStepEvidence;
  postStepEvidence: SchedulerControlledStepPostStepEvidence;
  postStepHandoff: SchedulerControlledStepHandoffSummary;
  controlledLoopPreDispatchDecision?: ControlledSchedulerContinuationDecision;
  controlledLoopCurrentTransitionChoice?: SchedulerControlledLoopCurrentTransitionChoice;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
  controlledLoopTurnRouteSummary?: SchedulerControlledLoopTurnRouteSummary;
  controlledLoopTick?: SchedulerControlledLoopTickSummary;
  controlledLoopContinuationReadiness?: SchedulerControlledLoopContinuationReadiness;
  controlledLoopIteration?: SchedulerControlledLoopIterationSummary;
  controlledLoopStopSummary?: SchedulerControlledLoopStopSummary;
  controlledLoopBoundaryResult?: SchedulerControlledLoopBoundaryResult;
  controlledLoopRuntimeBoundary?: SchedulerControlledLoopRuntimeBoundary;
  controlledLoopPostStepRoutingDecision?: SchedulerControlledLoopPostStepRoutingDecision;
  executionStarted: true;
  stoppedAfterOneSchedulerTransition: true;
  humanConfirmationStillRequired: true;
  sourceMutated: false;
  forbiddenAuthority: SchedulerControlledStepForbiddenAuthority;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerReconcileSnapshot {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerReconcileSnapshotStatus;
  schedulerRuntimeStateId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  claimIntents: SchedulerRuntimeClaimIntentState[];
  waves: SchedulerRuntimeWaveState[];
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  warningCount: number;
  warnings: string[];
  recoveryCheckpoint: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
}

export interface SchedulerRuntimeClaimReservationIntent {
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  status: SchedulerRuntimeClaimReservationIntentStatus;
  plannedSlotDemand: number;
  sourceScopes: string[];
  blockedReasons: string[];
}

export interface SchedulerRuntimeSourceLockReservation {
  scope: string;
  waveIndex: number;
  reservationIntentIds: string[];
  status: SchedulerRuntimeSourceLockReservationStatus;
  blockedReasons: string[];
}

export interface SchedulerRuntimeWaveReservation {
  waveIndex: number;
  reservationIntentIds: string[];
  reservedCount: number;
  blockedCount: number;
  plannedSlotDemand: number;
  status: SchedulerRuntimeWaveReservationStatus;
  blockedReasons: string[];
}

export interface SchedulerRuntimeClaimReservation {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeClaimReservationStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntents: SchedulerRuntimeClaimReservationIntent[];
  waves: SchedulerRuntimeWaveReservation[];
  sourceLocks: SchedulerRuntimeSourceLockReservation[];
  reservedCount: number;
  blockedCount: number;
  sourceLockCount: number;
  launchConfirmed?: boolean;
  launchConfirmedAt?: string;
  supersedesReservationId?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
}

export interface SchedulerRuntimeWorkerStart {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerStartStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "coder";
  taskId: string;
  taskRunId: string;
  workerLeaseId: string;
  taskRunRoleId: string;
  agentRoleId: string;
  worktreeId?: string;
  runId?: string;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerResult {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerResultStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "coder";
  taskId: string;
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  workerLeaseStatus: string;
  agentRoleId: string;
  worktreeId?: string;
  runId?: string;
  runStatus?: string;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerValidation {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerValidationStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "validation";
  taskId: string;
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  codeRunId: string;
  validationRunId: string;
  validationStatus: string;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerAudit {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerAuditStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "audit";
  taskId: string;
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  codeRunId: string;
  validationRunId: string;
  validationStatus: string;
  auditRunId: string;
  auditStatus: SchedulerRuntimeWorkerAuditStatus;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerReworkPlan {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerReworkPlanStatus;
  blockingSource: SchedulerRuntimeWorkerReworkBlockingSource;
  reworkReason: string;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "bounded-rework";
  taskId: string;
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  targetWorktreeId: string;
  targetCodeRunId: string;
  validationRunId: string;
  validationStatus: string;
  auditRunId?: string;
  auditStatus?: SchedulerRuntimeWorkerAuditStatus;
  futureCodeGateMode: "scheduler-claim-rework";
  recoveryKeyInputs: string[];
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerReworkStart {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerReworkStartStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "bounded-rework";
  taskId: string;
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  taskRunRoleId: string;
  agentRoleId: string;
  worktreeId: string;
  originalCodeRunId: string;
  reworkRunId?: string;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerReworkResult {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerReworkResultStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  schedulerWorkerReworkStartId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "bounded-rework";
  taskId: string;
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  originalCodeRunId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  taskRunStatus: string;
  workerLeaseStatus: string;
  agentRoleId: string;
  worktreeId: string;
  reworkRunId?: string;
  reworkRunStatus?: string;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerReworkValidation {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerReworkValidationStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  schedulerWorkerReworkStartId: string;
  schedulerWorkerReworkResultId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "validation";
  taskId: string;
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  originalCodeRunId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  reworkRunId: string;
  validationRunId: string;
  validationStatus: SchedulerRuntimeWorkerReworkValidationStatus;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRuntimeWorkerReworkAudit {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRuntimeWorkerReworkAuditStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  schedulerWorkerReworkStartId: string;
  schedulerWorkerReworkResultId: string;
  schedulerWorkerReworkValidationId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  reservationIntentId: string;
  claimIntentId: string;
  plannedWorkerKey: string;
  nodeId: string;
  unitId: string;
  waveIndex: number;
  stageId: string;
  stage: "audit";
  taskId: string;
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  originalCodeRunId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  reworkRunId: string;
  validationRunId: string;
  validationStatus: SchedulerRuntimeWorkerReworkValidationStatus;
  auditRunId: string;
  auditStatus: SchedulerRuntimeWorkerReworkAuditStatus;
  failureReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerIntegrationCandidateReadyTarget {
  worktreeId: string;
  worktreeDiffHash: string;
  diffStat: string;
  sourceHead: string | null;
  validationRunId: string;
  auditRunId: string;
}

export interface SchedulerIntegrationCandidateOutput {
  outputId: string;
  kind: SchedulerIntegrationCandidateOutputKind;
  status: SchedulerIntegrationCandidateOutputStatus;
  blockingReasons: string[];
  readinessKind?: string;
  readinessMessage?: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkAuditId?: string;
  schedulerWorkerStartId?: string;
  schedulerWorkerResultId?: string;
  schedulerWorkerValidationId?: string;
  schedulerWorkerReworkPlanId?: string;
  schedulerWorkerReworkStartId?: string;
  schedulerWorkerReworkResultId?: string;
  schedulerWorkerReworkValidationId?: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  plannedWorkerKey?: string;
  nodeId?: string;
  unitId?: string;
  waveIndex?: number;
  taskId?: string;
  taskRunId?: string;
  workerLeaseId?: string;
  worktreeId?: string;
  codeRunId?: string;
  validationRunId?: string;
  auditRunId?: string;
  worktreeDiffHash?: string;
  diffStat?: string;
  sourceHead?: string | null;
  artifactRefs: string[];
}

export interface SchedulerIntegrationCandidate {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerIntegrationCandidateStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  outputs: SchedulerIntegrationCandidateOutput[];
  readyTargets: SchedulerIntegrationCandidateReadyTarget[];
  readyWorktreeIds: string[];
  readyCount: number;
  blockedCount: number;
  waitingReason?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerIntegrationCheckHandoffTarget {
  worktreeId: string;
  worktreeDiffHash: string;
  diffStat: string;
  sourceHead: string | null;
  validationRunId: string;
  auditRunId: string;
}

export interface SchedulerIntegrationCheckHandoff {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerIntegrationCheckHandoffStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerIntegrationCandidateId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  readyTargets: SchedulerIntegrationCheckHandoffTarget[];
  readyWorktreeIds: string[];
  integrationCheckId: string;
  integrationCheckStatus: string;
  resultTargetWorktreeIds: string[];
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerIntegrationOutcomeTarget {
  worktreeId: string;
  changeId: string;
  diffHash: string;
  sourceHead: string | null;
  applied: boolean;
  appliedAt?: string;
  appliedCommit?: string;
}

export interface SchedulerIntegrationOutcome {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerIntegrationOutcomeStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerIntegrationCandidateId: string;
  schedulerIntegrationCheckHandoffId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  integrationCheckId: string;
  integrationCheckStatus: string;
  outcomeReason: string;
  readyWorktreeIds: string[];
  resultTargetWorktreeIds: string[];
  targets: SchedulerIntegrationOutcomeTarget[];
  appliedAt?: string;
  sourceHead: string | null;
  latestArtifactHash?: string;
  latestArtifactRef?: string;
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRunCompletion {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRunCompletionStatus;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerIntegrationCandidateId: string;
  schedulerIntegrationCheckHandoffId: string;
  schedulerIntegrationOutcomeId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  integrationCheckId: string;
  integrationCheckStatus: string;
  outcomeStatus: SchedulerIntegrationOutcomeStatus;
  outcomeReason: string;
  readyWorktreeIds: string[];
  resultTargetWorktreeIds: string[];
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerRunBlockedCloseout {
  version: "1.0";
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerMode: SchedulerMode;
  status: SchedulerRunBlockedCloseoutStatus;
  reason: SchedulerRunBlockedCloseoutReason;
  closeoutReason: string;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerIntegrationCandidateId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  readyWorktreeIds: string[];
  readyCount: number;
  blockedCount: number;
  blockedReasons: string[];
  unstartedReservedIntentIds: string[];
  sourceArtifactHashes: Record<string, string>;
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}
