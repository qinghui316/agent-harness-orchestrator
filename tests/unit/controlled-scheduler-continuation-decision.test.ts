import { describe, expect, it } from "vitest";
import { evaluateControlledSchedulerBoundaryContinuation } from "../../src/scheduler-runtime/controlled-loop-continuation-decision.js";
import type { SchedulerControlledStepEvidence } from "../../src/scheduler-runtime/types.js";

const freshGate = {
  actionType: "planning.scheduler.worker.reconcile-result",
  changeId: "change-1",
  enabled: true,
  requiresConfirmation: true,
  scope: {
    actionType: "planning.scheduler.worker.reconcile-result",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerWorkerStartId: "worker-start-1",
  },
};

describe("controlled scheduler continuation decision", () => {
  it("reports ready only when prior runtime-boundary and fresh human gate evidence align", () => {
    const result = evaluateControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      previousStep: step(),
      freshGate,
    });

    expect(result).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-continuation-decision",
      status: "ready-for-human-gate",
      nextGateActionType: "planning.scheduler.worker.reconcile-result",
      executionStarted: false,
      loopAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
  });

  it("requires prior runtime-boundary evidence", () => {
    const prior = step();
    prior.controlledLoopRuntimeBoundary = undefined;

    expect(evaluateControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      previousStep: prior,
      freshGate,
    })).toMatchObject({
      status: "needs-review",
      reason: expect.stringContaining("runtime-boundary"),
    });
  });

  it("fails closed for warning-bearing runtime-boundary evidence", () => {
    const prior = step();
    prior.controlledLoopRuntimeBoundary = {
      ...prior.controlledLoopRuntimeBoundary,
      status: "recorded-with-warning",
      warning: "post-step warning",
    } as NonNullable<SchedulerControlledStepEvidence["controlledLoopRuntimeBoundary"]>;

    expect(evaluateControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      previousStep: prior,
      freshGate,
    })).toMatchObject({
      status: "needs-review",
      reason: expect.stringContaining("warnings"),
    });
  });

  it("does not report ready when the fresh human gate is disabled", () => {
    expect(evaluateControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      previousStep: step(),
      freshGate: { ...freshGate, enabled: false },
    })).toMatchObject({
      status: "needs-review",
      reason: expect.stringContaining("disabled"),
    });
  });
});

function step(): SchedulerControlledStepEvidence {
  const boundary: SchedulerControlledStepEvidence["controlledLoopBoundaryResult"] = {
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
    observeStatus: "recorded",
    chooseCheckStatus: "recorded",
    dispatchStatus: "completed",
    reconcileStatus: "recorded",
    boundaryPosture: "awaiting-human-gate",
    continuationReadinessStatus: "ready-for-human-gate",
    stopReason: "one-confirmed-scheduler-transition-completed",
    nextGateActionType: "planning.scheduler.worker.reconcile-result",
    nextGateTargetScopeSource: "fresh-current-gate-required",
    readinessEvidencePrepared: true,
    needsReevaluation: false,
    humanGateRequired: true,
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
  };
  return {
    id: "scheduler-controlled-step-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    status: "recorded",
    executedActionType: "planning.scheduler.worker.start-next",
    targetScope: {
      actionType: "planning.scheduler.worker.start-next",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
    },
    postStepEvidence: {
      goalLoopGateReadinessPreflightId: "preflight-post",
      executionStarted: false,
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
    },
    controlledStepResultSummary: {
      resultKind: "schedulerWorkerStart",
      schedulerWorkerStartId: "worker-start-1",
      schedulerWorkerStartStatus: "started",
    },
    controlledLoopBoundaryResult: boundary,
    controlledLoopRuntimeBoundary: {
      version: "1.0",
      authority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence",
      status: "recorded",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      submittedActionType: "planning.scheduler.controlled-advance.run",
      selectedActionType: "planning.scheduler.worker.start-next",
      dispatchedActionType: "planning.scheduler.worker.start-next",
      observeStatus: "recorded",
      chooseStatus: "recorded",
      humanGateStatus: "confirmed-current-step",
      dispatchStatus: "completed",
      reconcileStatus: "recorded",
      stopStatus: "next-confirmation-candidate-ready",
      stopPosture: "awaiting-human-gate",
      stopReason: "one-confirmed-scheduler-transition-completed",
      continuationReadinessStatus: "ready-for-human-gate",
      nextGateActionType: "planning.scheduler.worker.reconcile-result",
      nextGateTargetScopeSource: "fresh-current-gate-required",
      observedGoalLoopNextStepPacketId: "packet-pre",
      selectedGoalLoopGateReadinessPreflightId: "preflight-pre",
      reconciledGoalLoopNextStepPacketId: "packet-post",
      readinessEvidencePrepared: true,
      needsReevaluation: false,
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
    executionStarted: true,
    stoppedAfterOneSchedulerTransition: true,
    humanConfirmationStillRequired: true,
    sourceMutated: false,
    forbiddenAuthority: {
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
    artifactRefs: [],
    artifact: "scheduler-controlled-step.json",
    markdownArtifact: "scheduler-controlled-step.md",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  } as SchedulerControlledStepEvidence;
}
