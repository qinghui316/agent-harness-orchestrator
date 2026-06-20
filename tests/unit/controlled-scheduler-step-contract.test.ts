import { describe, expect, it } from "vitest";
import {
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
});
