import { describe, expect, it } from "vitest";
import {
  assertControlledSchedulerContinuationGuard,
  assertControlledSchedulerFreshGateMatchesRequest,
  buildControlledSchedulerAdvanceStepRequest,
  buildControlledSchedulerStepRequest,
} from "../../src/workflow-scheduler/controlled-step.js";

describe("controlled scheduler step contract", () => {
  it("wraps a controlled advance as one concrete scheduler step with fresh Goal Loop evidence", () => {
    const request = buildControlledSchedulerAdvanceStepRequest({
      actionType: "planning.scheduler.controlled-advance.run",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: "worker-start-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.reconcile-result",
    }, {
      goalLoopDecisionId: "decision-1",
      goalLoopIterationId: "iteration-1",
      goalLoopContinuationBriefId: "brief-1",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "policy-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
    });

    expect(request.wrapper).toMatchObject({
      actionType: "planning.scheduler.controlled-step.run",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.reconcile-result",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "policy-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
    });
    expect(buildControlledSchedulerStepRequest(request.wrapper).concrete).toMatchObject({
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: "worker-start-1",
    });
  });

  it("fails closed when a fresh gate scope no longer matches the submitted concrete scheduler gate", () => {
    const request = {
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: "worker-start-1",
    };

    expect(() => assertControlledSchedulerFreshGateMatchesRequest(
      "planning.scheduler.worker.reconcile-result",
      {
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "different-worker-start",
      },
      request,
      "Goal Loop packet",
    )).toThrow(/fresh Goal Loop packet scope no longer matches/);
  });

  it("fails closed when a fresh gate is scoped to a different Change", () => {
    const request = {
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: "worker-start-1",
    };

    expect(() => assertControlledSchedulerFreshGateMatchesRequest(
      "planning.scheduler.worker.reconcile-result",
      {
        changeId: "other-change",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "worker-start-1",
      },
      request,
      "Goal Loop controller policy",
    )).toThrow(/fresh Goal Loop controller policy scope no longer matches/);
  });

  it("allows bootstrap only when no prior controlled step evidence exists", () => {
    expect(assertControlledSchedulerContinuationGuard({
      changeId: "change-1",
      previousStep: null,
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.start-next",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
      },
    })).toBe("bootstrap");
  });

  it("matches prior continuation readiness against the prior preflight concrete gate scope", () => {
    expect(assertControlledSchedulerContinuationGuard({
      changeId: "change-1",
      previousStep: priorStep(),
      previousGateReadinessPreflight: priorPreflight(),
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "worker-start-1",
      },
    })).toBe("matched");
  });

  it("allows schedulerRun scope transition when the prior preflight points to the scoped next gate", () => {
    expect(assertControlledSchedulerContinuationGuard({
      changeId: "change-1",
      previousStep: {
        ...priorStep(),
        schedulerRunId: undefined,
      },
      previousGateReadinessPreflight: priorPreflight(),
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "worker-start-1",
      },
    })).toBe("matched");
  });

  it("fails closed when prior controlled step evidence is warning-state or lacks readiness", () => {
    expect(() => assertControlledSchedulerContinuationGuard({
      changeId: "change-1",
      previousStep: {
        ...priorStep(),
        status: "recorded-with-warning",
      },
      previousGateReadinessPreflight: priorPreflight(),
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "worker-start-1",
      },
    })).toThrow(/requires prior controlled step evidence without warnings/);

    expect(() => assertControlledSchedulerContinuationGuard({
      changeId: "change-1",
      previousStep: {
        ...priorStep(),
        controlledLoopContinuationReadiness: undefined,
      },
      previousGateReadinessPreflight: priorPreflight(),
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "worker-start-1",
      },
    })).toThrow(/requires prior continuation readiness evidence/);
  });

  it("fails closed for non-ready prior continuation states", () => {
    for (const status of ["needs-review", "waiting", "quality-routing", "integration-barrier", "terminal-handoff"]) {
      expect(() => assertControlledSchedulerContinuationGuard({
        changeId: "change-1",
        previousStep: {
          ...priorStep(),
          controlledLoopContinuationReadiness: {
            ...priorStep().controlledLoopContinuationReadiness,
            status,
          },
        },
        previousGateReadinessPreflight: priorPreflight(),
        requestedConcreteGate: {
          actionType: "planning.scheduler.worker.reconcile-result",
          changeId: "change-1",
          schedulerRunId: "scheduler-run-1",
          schedulerWorkerStartId: "worker-start-1",
        },
      }), status).toThrow(/requires ready prior continuation evidence/);
    }
  });

  it("fails closed when the submitted concrete gate no longer matches the prior preflight scope", () => {
    expect(() => assertControlledSchedulerContinuationGuard({
      changeId: "change-1",
      previousStep: priorStep(),
      previousGateReadinessPreflight: priorPreflight(),
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "different-worker-start",
      },
    })).toThrow(/submitted gate scope no longer matches/);
  });

  it("fails closed when the prior preflight current gate is scoped to another Change", () => {
    expect(() => assertControlledSchedulerContinuationGuard({
      changeId: "change-1",
      previousStep: priorStep(),
      previousGateReadinessPreflight: {
        ...priorPreflight(),
        currentGate: {
          ...priorPreflight().currentGate,
          scope: {
            ...priorPreflight().currentGate.scope,
            changeId: "other-change",
          },
        },
      },
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "worker-start-1",
      },
    })).toThrow(/prior preflight current gate is scoped to a different Change/);
  });

  it("fails closed when the submitted concrete gate is missing required target ids", () => {
    expect(() => assertControlledSchedulerContinuationGuard({
      changeId: "change-1",
      previousStep: priorStep(),
      previousGateReadinessPreflight: priorPreflight(),
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
      },
    })).toThrow(/submitted gate concrete gate target is incomplete/);
  });
});

function priorStep() {
  return {
    id: "controlled-step-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    status: "recorded",
    postStepEvidence: {
      goalLoopGateReadinessPreflightId: "preflight-post",
    },
    controlledLoopContinuationReadiness: {
      status: "ready-for-human-gate",
      nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
      readinessEvidencePrepared: true,
    },
  };
}

function priorPreflight() {
  return {
    id: "preflight-post",
    changeId: "change-1",
    currentGate: {
      actionType: "planning.scheduler.worker.reconcile-result",
      scope: {
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "worker-start-1",
      },
    },
    concreteGateInvoked: false,
    toolPolicyAuthorizedConcreteGate: false,
    executionStarted: false,
  } as const;
}
