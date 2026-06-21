import { describe, expect, it } from "vitest";
import { buildSchedulerControlledLoopPostStepRoutingDecision } from "../../src/scheduler-runtime/controlled-loop-post-step-routing.js";
import type {
  SchedulerControlledLoopContinuationReadiness,
  SchedulerControlledLoopCurrentTransitionChoice,
  SchedulerControlledLoopTurnRoutePosture,
  SchedulerControlledLoopTurnRouteSummary,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepHandoffSummary,
} from "../../src/scheduler-runtime/types.js";

describe("controlled scheduler post-step routing decision", () => {
  it("maps a ready next gate to scheduler-runtime prior-turn routing evidence without authority", () => {
    const decision = buildSchedulerControlledLoopPostStepRoutingDecision({
      executedActionType: "planning.scheduler.worker.start-next",
      postStepHandoff: handoff("planning.scheduler.worker.reconcile-result"),
      controlledLoopCurrentTransitionChoice: currentTransition(),
      controlledLoopTurnRouteSummary: route("awaiting-human-gate", "planning.scheduler.worker.reconcile-result"),
      controlledLoopContinuationReadiness: readiness("ready-for-human-gate", "awaiting-human-gate"),
      forbiddenAuthority,
      evidenceRefs: ["step.md"],
    });

    expect(decision).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-post-step-routing-decision",
      routeFamily: "awaiting-human-gate",
      continuationReadinessStatus: "ready-for-human-gate",
      ownerModule: "scheduler-runtime",
      executedActionType: "planning.scheduler.worker.start-next",
      selectedActionType: "planning.scheduler.worker.start-next",
      existingGateActionType: "planning.scheduler.worker.reconcile-result",
      gateTargetScopeSource: "fresh-current-gate-required",
      dispatchedTargetScope: {
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "reservation-1",
      },
      resultKind: "schedulerWorkerStart",
      resultId: "worker-start-1",
      resultStatus: "started",
      readinessEvidencePrepared: true,
      freshEvidenceRequiredBeforeContinuation: true,
      freshCurrentGateRequiredBeforeContinuation: true,
      humanGateRequired: true,
      humanConfirmationStillRequired: true,
      priorTurnEvidence: true,
      executionStarted: false,
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
    expect(decision.evidenceRefs).toEqual(["step.md", "readiness.md"]);
    expect(decision.boundary).toContain("does not execute");
  });

  it.each([
    ["planning.scheduler.worker.validate-result", "validation-audit"],
    ["planning.scheduler.integration-check.run", "integration-check"],
    ["planning.scheduler.integration-candidate.prepare", "scheduler-runtime"],
  ] as const)("maps existing action %s to owner %s", (actionType, ownerModule) => {
    const decision = buildSchedulerControlledLoopPostStepRoutingDecision({
      executedActionType: "planning.scheduler.worker.reconcile-result",
      postStepHandoff: handoff(actionType),
      controlledLoopTurnRouteSummary: route(actionType.includes("integration") ? "integration-barrier" : "quality-routing", actionType),
      controlledLoopContinuationReadiness: readiness(actionType.includes("integration") ? "integration-barrier" : "quality-routing", actionType.includes("integration") ? "integration-barrier" : "quality-routing"),
      forbiddenAuthority,
    });

    expect(decision.ownerModule).toBe(ownerModule);
    expect(decision.existingGateActionType).toBe(actionType);
    expect(decision.executionStarted).toBe(false);
    expect(decision.applyAuthorized).toBe(false);
    expect(decision.closeAuthorized).toBe(false);
    expect(decision.remoteLandingAuthorized).toBe(false);
  });

  it("keeps waiting and terminal cases conservative", () => {
    const waiting = buildSchedulerControlledLoopPostStepRoutingDecision({
      executedActionType: "planning.scheduler.worker.start-next",
      postStepHandoff: handoff(undefined),
      controlledLoopTurnRouteSummary: route("waiting", undefined),
      controlledLoopContinuationReadiness: readiness("waiting", "waiting", false),
      forbiddenAuthority,
    });
    const terminal = buildSchedulerControlledLoopPostStepRoutingDecision({
      executedActionType: "planning.scheduler.run.complete",
      postStepHandoff: handoff("planning.scheduler.run.complete"),
      controlledLoopTurnRouteSummary: route("terminal-handoff", "planning.scheduler.run.complete"),
      controlledLoopContinuationReadiness: readiness("terminal-handoff", "terminal-handoff"),
      forbiddenAuthority,
    });

    expect(waiting).toMatchObject({
      ownerModule: "goal-loop-current-gate",
      gateTargetScopeSource: "none",
      humanConfirmationStillRequired: true,
      executionStarted: false,
    });
    expect(terminal).toMatchObject({
      ownerModule: "existing-human-gate",
      gateTargetScopeSource: "fresh-current-gate-required",
      humanConfirmationStillRequired: true,
      executionStarted: false,
      closeAuthorized: false,
    });
  });

  it("suppresses forged forbidden-authority input instead of copying it", () => {
    const forgedAuthority = {
      ...forbiddenAuthority,
      loopAuthorized: true,
      applyAuthorized: true,
      closeAuthorized: true,
      remoteLandingAuthorized: true,
      harnessEvolutionAuthorized: true,
    } as unknown as SchedulerControlledStepForbiddenAuthority;
    const decision = buildSchedulerControlledLoopPostStepRoutingDecision({
      executedActionType: "planning.scheduler.worker.start-next",
      postStepHandoff: handoff("planning.scheduler.worker.reconcile-result"),
      controlledLoopTurnRouteSummary: route("awaiting-human-gate", "planning.scheduler.worker.reconcile-result"),
      controlledLoopContinuationReadiness: readiness("ready-for-human-gate", "awaiting-human-gate"),
      forbiddenAuthority: forgedAuthority,
    });

    expect(decision).toMatchObject({
      loopAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
  });
});

const forbiddenAuthority: SchedulerControlledStepForbiddenAuthority = {
  loopAuthorized: false,
  fullParallelExecutorAuthorized: false,
  wholeWaveDispatchAuthorized: false,
  slotAllocatorAuthorized: false,
  sourceMutationAuthorized: false,
  applyAuthorized: false,
  closeAuthorized: false,
  mergeAuthorized: false,
  remoteLandingAuthorized: false,
  harnessEvolutionAuthorized: false,
};

function handoff(actionType: string | undefined): SchedulerControlledStepHandoffSummary {
  return {
    status: actionType ? "next-confirmation-candidate-ready" : "needs-reevaluation",
    stopReason: actionType ? "one-confirmed-scheduler-transition-completed" : "waiting-for-fresh-evidence",
    executedActionType: "planning.scheduler.worker.start-next",
    needsReevaluation: !actionType,
    nextConfirmationCandidate: actionType
      ? {
          actionType,
          readinessEvidencePrepared: true,
          executionStarted: false,
          authorizationGranted: false,
          humanConfirmationStillRequired: true,
        }
      : undefined,
    executionStarted: false,
    loopAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
  };
}

function route(
  routePosture: SchedulerControlledLoopTurnRoutePosture,
  nextCandidateActionType: string | undefined,
): SchedulerControlledLoopTurnRouteSummary {
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-turn-route-summary",
    executedActionType: "planning.scheduler.worker.start-next",
    resultKind: "schedulerWorkerStart",
    resultId: "worker-start-1",
    resultStatus: "started",
    routePosture,
    postStepStatus: nextCandidateActionType ? "next-confirmation-candidate-ready" : "needs-reevaluation",
    nextCandidateActionType,
    humanGateRequired: Boolean(nextCandidateActionType),
    humanConfirmationStillRequired: true,
    needsReevaluation: !nextCandidateActionType,
    executionStarted: false,
    ...forbiddenAuthority,
  };
}

function readiness(
  status: SchedulerControlledLoopContinuationReadiness["status"],
  routePosture: SchedulerControlledLoopTurnRoutePosture,
  ready = true,
): SchedulerControlledLoopContinuationReadiness {
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-continuation-readiness",
    status,
    routePosture,
    executedActionType: "planning.scheduler.worker.start-next",
    nextCandidateActionType: ready ? "planning.scheduler.worker.reconcile-result" : undefined,
    resultKind: "schedulerWorkerStart",
    resultId: "worker-start-1",
    resultStatus: "started",
    reason: ready ? "Existing gate is available after the controlled step stopped." : "Fresh current evidence is required.",
    boundary: "Read-only continuation readiness evidence.",
    readinessEvidencePrepared: ready,
    needsReevaluation: !ready,
    humanGateRequired: ready,
    humanConfirmationStillRequired: true,
    evidenceRefs: ["readiness.md"],
    executionStarted: false,
    ...forbiddenAuthority,
  };
}

function currentTransition(): SchedulerControlledLoopCurrentTransitionChoice {
  return {
    version: "1.0",
    authority: "scheduler-runtime-current-transition-choice",
    status: "ready-for-dispatch",
    changeId: "change-1",
    selectedActionType: "planning.scheduler.worker.start-next",
    submittedActionType: "planning.scheduler.controlled-advance.run",
    currentGate: {
      actionType: "planning.scheduler.worker.start-next",
      scope: {
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "reservation-1",
      },
    },
    goalLoopDecisionId: "decision-1",
    goalLoopIterationId: "iteration-1",
    goalLoopContinuationBriefId: "brief-1",
    goalLoopNextStepPacketId: "packet-1",
    goalLoopControllerPolicyId: "controller-1",
    goalLoopGateReadinessPreflightId: "preflight-1",
    humanGateRequired: true,
    humanConfirmationStillRequired: true,
    executionStarted: false,
    concreteGateInvoked: false,
    toolPolicyAuthorizedConcreteGate: false,
    authorizationGranted: false,
    ...forbiddenAuthority,
  };
}
