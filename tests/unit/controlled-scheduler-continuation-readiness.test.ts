import { describe, expect, it } from "vitest";
import { buildSchedulerControlledLoopContinuationReadiness } from "../../src/scheduler-runtime/controlled-loop-continuation-readiness.js";
import { buildSchedulerControlledLoopIterationSummary } from "../../src/scheduler-runtime/controlled-loop-iteration.js";
import { buildSchedulerControlledLoopStopSummary } from "../../src/scheduler-runtime/controlled-loop-stop-summary.js";
import { alignControlledSchedulerContinuationReadiness } from "../../src/workbench/projections/read-model/workpad.js";
import type { SchedulerControlledLoopTickSummary, SchedulerControlledLoopTurnRouteSummary, SchedulerControlledStepForbiddenAuthority, SchedulerControlledStepHandoffSummary } from "../../src/scheduler-runtime/types.js";
import type { WorkbenchSchedulerControlledStepEvidenceSummary } from "../../src/workbench/workflow-projection.js";
import type { WorkpadNextAction } from "../../src/workbench/read-model-types.js";

const forbiddenAuthority: SchedulerControlledStepForbiddenAuthority = {
  loopAuthorized: false,
  wholeWaveDispatchAuthorized: false,
  slotAllocatorAuthorized: false,
  fullParallelExecutorAuthorized: false,
  sourceMutationAuthorized: false,
  applyAuthorized: false,
  closeAuthorized: false,
  mergeAuthorized: false,
  remoteLandingAuthorized: false,
  harnessEvolutionAuthorized: false,
};

describe("controlled scheduler continuation readiness", () => {
  it("keeps matching visible human gates ready in the Workbench read model", () => {
    const aligned = alignControlledSchedulerContinuationReadiness(baseStep(), baseNextAction());

    expect(aligned?.controlledLoopContinuationReadiness).toMatchObject({
      status: "ready-for-human-gate",
      readinessEvidencePrepared: true,
      humanConfirmationStillRequired: true,
      executionStarted: false,
      loopAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
    expect(aligned?.controlledLoopContinuationDecision).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-continuation-decision",
      status: "ready-for-human-gate",
      executionStarted: false,
      loopAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
  });

  it("fails closed for missing, disabled, cross-change, action-mismatched, and run-mismatched gates", () => {
    const cases: Array<[string, WorkpadNextAction, "waiting" | "needs-review"]> = [
      ["missing gate", { ...baseNextAction(), kind: "none", enabled: false, requiresConfirmation: false, actionType: undefined }, "waiting"],
      ["disabled gate", { ...baseNextAction(), enabled: false }, "needs-review"],
      ["cross-change gate", { ...baseNextAction(), changeId: "other-change" }, "needs-review"],
      ["action-mismatched gate", { ...baseNextAction(), actionType: "planning.scheduler.worker.start-next" }, "needs-review"],
      ["missing scheduler run", { ...baseNextAction(), schedulerRunId: undefined }, "needs-review"],
      ["run-mismatched gate", { ...baseNextAction(), schedulerRunId: "scheduler-run-other" }, "needs-review"],
      ["missing worker result target", { ...baseNextAction(), schedulerWorkerStartId: undefined }, "needs-review"],
      ["worker result target mismatch", { ...baseNextAction(), schedulerWorkerStartId: "scheduler-worker-start-other" }, "needs-review"],
    ];

    for (const [label, nextAction, expectedStatus] of cases) {
      const aligned = alignControlledSchedulerContinuationReadiness(baseStep(), nextAction);

      expect(aligned?.controlledLoopContinuationReadiness?.status, label).toBe(expectedStatus);
      expect(aligned?.controlledLoopContinuationDecision?.status, label).toBe(expectedStatus);
      expect(aligned?.controlledLoopContinuationDecision?.authority, label).toBe("scheduler-runtime-controlled-loop-continuation-decision");
      expect(aligned?.controlledLoopContinuationReadiness?.readinessEvidencePrepared, label).toBe(false);
      expect(aligned?.controlledLoopContinuationReadiness?.executionStarted, label).toBe(false);
      expect(aligned?.controlledLoopContinuationReadiness?.humanConfirmationStillRequired, label).toBe(true);
      expect(aligned?.controlledLoopStopSummary?.continuationReadinessStatus, label).toBe(expectedStatus);
      expect(aligned?.controlledLoopStopSummary?.readinessEvidencePrepared, label).toBe(false);
      expect(aligned?.controlledLoopStopSummary?.executionStarted, label).toBe(false);
      expect(aligned?.controlledLoopStopSummary?.humanConfirmationStillRequired, label).toBe(true);
    }
  });
});

function baseStep(): WorkbenchSchedulerControlledStepEvidenceSummary {
  const route = baseRoute();
  const tick = baseTick(route);
  const handoff = baseHandoff(false);
  const readiness = buildSchedulerControlledLoopContinuationReadiness({
    executedActionType: "planning.scheduler.worker.start-next",
    postStepHandoff: handoff,
    controlledLoopTurnRouteSummary: route,
    controlledLoopTick: tick,
    forbiddenAuthority,
  });
  const iteration = buildSchedulerControlledLoopIterationSummary({
    executedActionType: "planning.scheduler.worker.start-next",
    postStepHandoff: handoff,
    controlledLoopTurnRouteSummary: route,
    controlledLoopTick: tick,
    controlledLoopContinuationReadiness: readiness,
    forbiddenAuthority,
  });
  const stopSummary = buildSchedulerControlledLoopStopSummary({
    executedActionType: "planning.scheduler.worker.start-next",
    postStepHandoff: handoff,
    controlledLoopTurnRouteSummary: route,
    controlledLoopTick: tick,
    controlledLoopContinuationReadiness: readiness,
    controlledLoopIteration: iteration,
    forbiddenAuthority,
  });
  return {
    id: "scheduler-controlled-step-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    status: "recorded",
    executedActionType: "planning.scheduler.worker.start-next",
    postStepStatus: "next-confirmation-candidate-ready",
    nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
    needsReevaluation: false,
    humanConfirmationStillRequired: true,
    sourceMutated: false,
    loopAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    mergeAuthorized: false,
    harnessEvolutionAuthorized: false,
    controlledStepResultSummary: {
      resultKind: "schedulerWorkerStart",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerStartStatus: "started",
    },
    controlledLoopTurnRouteSummary: route,
    controlledLoopTick: tick,
    controlledLoopContinuationReadiness: readiness,
    controlledLoopIteration: iteration,
    controlledLoopStopSummary: stopSummary,
    controlledLoopBoundaryResult: {
      version: "1.0",
      authority: "scheduler-runtime-controlled-loop-boundary-result",
      status: "recorded",
      selectedActionType: "planning.scheduler.worker.start-next",
      submittedActionType: "planning.scheduler.controlled-advance.run",
      dispatchedActionType: "planning.scheduler.worker.start-next",
      selectedGateScope: {
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
      },
      observeStatus: tick.observe.status,
      chooseCheckStatus: tick.chooseCheck.status,
      dispatchStatus: "completed",
      reconcileStatus: tick.reconcile.status,
      boundaryPosture: route.routePosture,
      continuationReadinessStatus: readiness.status,
      stopReason: stopSummary.stopReason,
      nextGateActionType: "planning.scheduler.worker.reconcile-result",
      nextGateTargetScopeSource: "fresh-current-gate-required",
      readinessEvidencePrepared: readiness.readinessEvidencePrepared,
      needsReevaluation: readiness.needsReevaluation,
      humanGateRequired: readiness.humanGateRequired,
      humanConfirmationStillRequired: true,
      futureContinuationRequiresFreshEvidence: true,
      futureContinuationRequiresFreshCurrentGate: true,
      stoppedAfterOneSchedulerTransition: true,
      approvedScopeOnly: true,
      boundary: "prior-turn evidence",
      evidenceRefs: ["scheduler-controlled-step.md"],
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
    },
    controlledLoopRuntimeBoundary: {
      version: "1.0",
      authority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence",
      status: "recorded",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      submittedActionType: "planning.scheduler.controlled-advance.run",
      selectedActionType: "planning.scheduler.worker.start-next",
      dispatchedActionType: "planning.scheduler.worker.start-next",
      observeStatus: tick.observe.status,
      chooseStatus: tick.chooseCheck.status,
      humanGateStatus: "confirmed-current-step",
      dispatchStatus: "completed",
      reconcileStatus: tick.reconcile.status,
      stopStatus: tick.routeStop.status,
      stopPosture: stopSummary.routePosture,
      stopReason: stopSummary.stopReason,
      continuationReadinessStatus: stopSummary.continuationReadinessStatus,
      nextGateActionType: stopSummary.nextGateActionType,
      nextGateTargetScopeSource: "fresh-current-gate-required",
      observedGoalLoopNextStepPacketId: tick.observe.goalLoopNextStepPacketId,
      selectedGoalLoopGateReadinessPreflightId: tick.chooseCheck.goalLoopGateReadinessPreflightId,
      reconciledGoalLoopNextStepPacketId: tick.reconcile.goalLoopNextStepPacketId,
      readinessEvidencePrepared: stopSummary.readinessEvidencePrepared,
      needsReevaluation: stopSummary.needsReevaluation,
      humanConfirmationStillRequired: true,
      stoppedAfterOneSchedulerTransition: true,
      approvedScopeOnly: true,
      priorTurnEvidence: true,
      freshEvidenceRequiredBeforeContinuation: true,
      freshCurrentGateRequiredBeforeContinuation: true,
      boundary: "runtime-boundary evidence",
      evidenceRefs: ["scheduler-controlled-step.md"],
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
    },
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
}

function baseNextAction(): WorkpadNextAction {
  return {
    id: "next",
    label: "Check result",
    description: "Check the current result.",
    kind: "workflow-action",
    enabled: true,
    requiresConfirmation: true,
    actionType: "planning.scheduler.worker.reconcile-result",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerWorkerStartId: "scheduler-worker-start-1",
  };
}

function baseRoute(): SchedulerControlledLoopTurnRouteSummary {
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-turn-route-summary",
    executedActionType: "planning.scheduler.worker.start-next",
    routePosture: "awaiting-human-gate",
    postStepStatus: "next-confirmation-candidate-ready",
    nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
    humanGateRequired: true,
    humanConfirmationStillRequired: true,
    needsReevaluation: false,
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
  };
}

function baseTick(route: SchedulerControlledLoopTurnRouteSummary): SchedulerControlledLoopTickSummary {
  return {
    version: "1.0",
    authority: "scheduler-runtime-controlled-loop-tick-contract-summary",
    observe: {
      status: "recorded",
      goalLoopDecisionId: "decision-pre",
      goalLoopIterationId: "iteration-pre",
      goalLoopContinuationBriefId: "brief-pre",
      goalLoopNextStepPacketId: "packet-pre",
      submittedActionType: "planning.scheduler.worker.start-next",
    },
    chooseCheck: {
      status: "recorded",
      goalLoopControllerPolicyId: "controller-pre",
      goalLoopGateReadinessPreflightId: "preflight-pre",
      targetScopeMatched: true,
      concreteGatePreflightNonExecuting: true,
    },
    dispatch: {
      status: "completed",
      executedActionType: "planning.scheduler.worker.start-next",
      executionStarted: true,
      stoppedAfterOneSchedulerTransition: true,
      approvedScopeOnly: true,
    },
    reconcile: {
      status: "recorded",
      goalLoopDecisionId: "decision-post",
      goalLoopIterationId: "iteration-post",
      goalLoopContinuationBriefId: "brief-post",
      goalLoopNextStepPacketId: "packet-post",
      goalLoopControllerPolicyId: "controller-post",
      goalLoopGateReadinessPreflightId: "preflight-post",
      executionStarted: false,
    },
    routeStop: {
      status: "next-confirmation-candidate-ready",
      stopReason: "one-confirmed-scheduler-transition-completed",
      routePosture: route.routePosture,
      nextCandidateActionType: route.nextCandidateActionType,
      humanGateRequired: route.humanGateRequired,
      humanConfirmationStillRequired: true,
      needsReevaluation: false,
    },
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
  };
}

function baseHandoff(needsReevaluation: boolean): SchedulerControlledStepHandoffSummary {
  return {
    status: "next-confirmation-candidate-ready",
    stopReason: "one-confirmed-scheduler-transition-completed",
    executedActionType: "planning.scheduler.worker.start-next",
    needsReevaluation,
    nextConfirmationCandidate: {
      actionType: "planning.scheduler.worker.reconcile-result",
      goalLoopNextStepPacketId: "packet-post",
      goalLoopControllerPolicyId: "controller-post",
      goalLoopGateReadinessPreflightId: "preflight-post",
      readinessEvidencePrepared: true,
      executionStarted: false,
      authorizationGranted: false,
      humanConfirmationStillRequired: true,
    },
    executionStarted: false,
    loopAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
  };
}
