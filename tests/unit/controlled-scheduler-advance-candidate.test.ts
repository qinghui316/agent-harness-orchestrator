import { describe, expect, it } from "vitest";
import {
  buildControlledSchedulerAdvanceCandidate,
  buildControlledSchedulerCurrentGateCarrier,
  buildControlledSchedulerCurrentGateSnapshot,
  controlledSchedulerAdvanceTargetKey,
  controlledSchedulerSourceGateActionType,
  isControlledSchedulerAdvanceSourceGate,
} from "../../src/workflow-scheduler/controlled-advance-candidate.js";

describe("controlled scheduler advance candidate owner", () => {
  it("builds a controlled advance carrier from a concrete scheduler gate with whitelisted scope only", () => {
    const candidate = buildControlledSchedulerAdvanceCandidate({
      actionType: "planning.scheduler.worker.start-next",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-2",
      claimIntentId: "claim-2",
      goalLoopDecisionId: "stale-decision",
      goalLoopNextStepPacketId: "stale-packet",
      artifact: "stale-artifact",
    } as object as Parameters<typeof buildControlledSchedulerAdvanceCandidate>[0]);

    expect(candidate).toMatchObject({
      currentGateActionType: "planning.scheduler.worker.start-next",
      currentGate: {
        actionType: "planning.scheduler.worker.start-next",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
        reservationIntentId: "reservation-2",
        claimIntentId: "claim-2",
      },
      controlledAdvance: {
        actionType: "planning.scheduler.controlled-advance.run",
        changeId: "change-1",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
        reservationIntentId: "reservation-2",
        claimIntentId: "claim-2",
      },
      targetKey: "claim-reservation-1",
      validationIssues: [],
    });
    expect(candidate?.controlledAdvance).not.toHaveProperty("goalLoopDecisionId");
    expect(candidate?.controlledAdvance).not.toHaveProperty("goalLoopNextStepPacketId");
    expect(candidate?.controlledAdvance).not.toHaveProperty("artifact");
  });

  it("unwraps controlled-step source gates and keeps the concrete scheduler target", () => {
    const source = {
      actionType: "planning.scheduler.controlled-step.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.reconcile-result",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "controller-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: "worker-start-1",
    };

    expect(controlledSchedulerSourceGateActionType(source)).toBe("planning.scheduler.worker.reconcile-result");
    const candidate = buildControlledSchedulerAdvanceCandidate(source);

    expect(candidate).toMatchObject({
      currentGateActionType: "planning.scheduler.worker.reconcile-result",
      currentGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "worker-start-1",
      },
      controlledAdvance: {
        actionType: "planning.scheduler.controlled-advance.run",
        goalLoopCurrentGateActionType: "planning.scheduler.worker.reconcile-result",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "worker-start-1",
      },
      targetKey: "worker-start-1",
      validationIssues: [],
    });
  });

  it("rejects excluded, recursive, and non-scheduler source actions", () => {
    expect(isControlledSchedulerAdvanceSourceGate({
      actionType: "planning.scheduler.controlled-advance.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
    })).toBe(false);
    expect(isControlledSchedulerAdvanceSourceGate({
      actionType: "planning.scheduler.plan.prepare",
      changeId: "change-1",
    })).toBe(false);
    expect(isControlledSchedulerAdvanceSourceGate({
      actionType: "planning.goal-loop.evaluate",
      changeId: "change-1",
    })).toBe(false);
    expect(isControlledSchedulerAdvanceSourceGate({
      actionType: "chat.ask",
      changeId: "change-1",
    })).toBe(false);
  });

  it("returns validation issues for incomplete concrete scheduler targets", () => {
    const candidate = buildControlledSchedulerAdvanceCandidate({
      actionType: "planning.scheduler.worker.start-next",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
    });

    expect(candidate).toMatchObject({
      currentGateActionType: "planning.scheduler.worker.start-next",
      validationIssues: expect.arrayContaining([
        expect.objectContaining({ label: "schedulerClaimReservationId" }),
        expect.objectContaining({ label: "reservationIntentId" }),
        expect.objectContaining({ label: "claimIntentId" }),
      ]),
    });
  });

  it("builds current gate snapshots from the same whitelist carrier logic", () => {
    const carrier = buildControlledSchedulerCurrentGateCarrier({
      actionType: "planning.scheduler.integration-check.run",
      changeId: "change-1",
      schedulerIntegrationCandidateId: "candidate-1",
      worktreeIds: ["wt-1", "wt-2"],
      goalLoopGateReadinessPreflightId: "stale-preflight",
      label: "ignore-me",
    }, "planning.scheduler.integration-check.run");

    expect(carrier).toEqual({
      actionType: "planning.scheduler.integration-check.run",
      changeId: "change-1",
      schedulerIntegrationCandidateId: "candidate-1",
      worktreeIds: ["wt-1", "wt-2"],
    });
    expect(buildControlledSchedulerCurrentGateSnapshot(carrier)).toEqual({
      actionType: "planning.scheduler.integration-check.run",
      scope: {
        changeId: "change-1",
        schedulerIntegrationCandidateId: "candidate-1",
        worktreeIds: ["wt-1", "wt-2"],
      },
    });
  });

  it("uses the same target key priority as the controlled advance confirmation surface", () => {
    expect(controlledSchedulerAdvanceTargetKey({
      actionType: "planning.scheduler.worker.validate-first",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      schedulerWorkerStartId: "worker-start-1",
      schedulerWorkerResultId: "worker-result-1",
    })).toBe("worker-result-1");
    expect(controlledSchedulerAdvanceTargetKey({
      actionType: "planning.scheduler.runtime.initialize",
      schedulerRunId: "scheduler-run-1",
    })).toBe("scheduler-run-1");
    expect(controlledSchedulerAdvanceTargetKey({
      actionType: "planning.scheduler.contract.compile",
    })).toBe("current");
  });
});
