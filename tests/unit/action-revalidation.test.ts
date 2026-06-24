import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkbenchSnapshot: vi.fn(),
  assertGoalLoopAssistedConcreteGateConfirmation: vi.fn(),
}));

vi.mock("../../src/workbench/manager.js", () => ({
  getWorkbenchSnapshot: mocks.getWorkbenchSnapshot,
}));

vi.mock("../../src/memory/resolver.js", () => ({
  resolveProjectMemory: vi.fn(async () => ({ memoryRoot: "memory-root" })),
}));

vi.mock("../../src/ecl/index.js", () => ({
  getActiveChanges: vi.fn(async () => [{ name: "change-1", path: "harness/changes/active/change-1" }]),
}));

vi.mock("../../src/workbench/actions/goal-loop-gate-confirmation.js", () => ({
  assertGoalLoopAssistedConcreteGateConfirmation: mocks.assertGoalLoopAssistedConcreteGateConfirmation,
}));

import { assertCurrentWorkflowAction } from "../../src/server/workbench/action-revalidation.js";

function assertCurrent(input: Parameters<typeof assertCurrentWorkflowAction>[0], body: Parameters<typeof assertCurrentWorkflowAction>[1]): ReturnType<typeof assertCurrentWorkflowAction> {
  return assertCurrentWorkflowAction(input, body, { getWorkbenchSnapshot: mocks.getWorkbenchSnapshot });
}

describe("Workbench action revalidation", () => {
  beforeEach(() => {
    mocks.getWorkbenchSnapshot.mockReset();
    mocks.assertGoalLoopAssistedConcreteGateConfirmation.mockReset();
  });

  it("rejects Goal Loop-assisted concrete gate payloads when the matched visible gate is disabled", async () => {
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-first",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [{
            actions: [{
              kind: "workflow-action",
              actionType: "planning.scheduler.worker.start-first",
              changeId: "change-1",
              schedulerRunId: "scheduler-run-1",
              schedulerClaimReservationId: "claim-reservation-1",
              goalLoopGateReadinessPreflightId: "preflight-1",
              enabled: false,
            }],
          }],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: null, path: "project-root" }, {
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
    })).rejects.toThrow("stale or no longer available");
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).not.toHaveBeenCalled();
  });

  it("passes enabled Goal Loop-assisted concrete gate payloads to the assisted confirmation guard", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-first",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [{ actions: [visibleAction] }],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
    })).resolves.toBeUndefined();
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).toHaveBeenCalledWith(
      { memoryRoot: "memory-root" },
      "harness/changes/active/change-1",
      "change-1",
      expect.objectContaining({ goalLoopGateReadinessPreflightId: "preflight-1" }),
      { visibleGate: visibleAction },
    );
  });

  it("passes controlled scheduler step payloads to the assisted confirmation guard as the concrete scheduler gate", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.scheduler.controlled-step.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "controller-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-first",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [{ actions: [visibleAction] }],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.scheduler.controlled-step.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-first",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "controller-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
    })).resolves.toBeUndefined();
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).toHaveBeenCalledWith(
      { memoryRoot: "memory-root" },
      "harness/changes/active/change-1",
      "change-1",
      expect.objectContaining({
        actionType: "planning.scheduler.worker.start-first",
        goalLoopGateReadinessPreflightId: "preflight-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      }),
      {},
    );
  });

  it("passes controlled scheduler advance payloads only when the current visible gate scope matches", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.scheduler.controlled-advance.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-next",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
            reservationIntentId: "reservation-intent-2",
            claimIntentId: "claim-intent-2",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [{ actions: [visibleAction] }],
          otherDemands: [],
        },
      },
    });

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.scheduler.controlled-advance.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
    })).resolves.toBeUndefined();
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).not.toHaveBeenCalled();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      actionType: "planning.scheduler.controlled-advance.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-other",
      claimIntentId: "claim-intent-2",
    })).rejects.toThrow("stale or no longer available");
  });

  it("passes controlled continuation payloads only when Goal Loop evidence and current scheduler gate match", async () => {
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: {
        workpad: {
          goalLoop: {
            changeId: "change-1",
            goalLoopNextStepPacketId: "packet-1",
            controllerPolicyId: "policy-1",
            gateReadinessPreflightId: "preflight-1",
            controllerVerdict: "recommend-existing-gate",
            controllerGateStatus: "matches-current-gate",
            recommendedActionType: "planning.scheduler.worker.start-next",
            recommendedActionScope: {
              changeId: "change-1",
              schedulerRunId: "scheduler-run-1",
              schedulerClaimReservationId: "claim-reservation-1",
              reservationIntentId: "reservation-intent-2",
              claimIntentId: "claim-intent-2",
            },
          },
          nextAction: {
            kind: "workflow-action",
            actionType: "planning.scheduler.worker.start-next",
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "claim-reservation-1",
            reservationIntentId: "reservation-intent-2",
            claimIntentId: "claim-intent-2",
          },
        },
      },
      right: {
        confirmationQueue: {
          primary: null,
          current: [],
          otherDemands: [],
        },
      },
    });

    const request = {
      actionType: "planning.goal-loop.controlled-continue.run",
      changeId: "change-1",
      goalLoopNextStepPacketId: "packet-1",
      goalLoopControllerPolicyId: "policy-1",
      goalLoopGateReadinessPreflightId: "preflight-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
      maxSteps: 5,
    } as const;

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, request)).resolves.toBeUndefined();
    expect(mocks.assertGoalLoopAssistedConcreteGateConfirmation).not.toHaveBeenCalled();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      goalLoopGateReadinessPreflightId: "preflight-old",
    })).rejects.toThrow("stale or no longer available");

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      claimIntentId: "claim-intent-other",
    })).rejects.toThrow("stale or no longer available");
  });

  it("passes scoped automation only when the current primary gate scope matches", async () => {
    const visibleAction = {
      kind: "workflow-action",
      actionType: "planning.decomposition.confirm",
      changeId: "change-1",
      decompositionPlanId: "decomp-1",
      enabled: true,
    };
    mocks.getWorkbenchSnapshot.mockResolvedValue({
      center: { workpad: { nextAction: { kind: "none" } } },
      right: {
        confirmationQueue: {
          primary: { actions: [visibleAction], changeId: "change-1" },
          current: [],
          otherDemands: [],
        },
      },
    });

    const request = {
      actionType: "planning.automation.scoped-auto.run",
      changeId: "change-1",
      automationMode: "full-access",
      automationCurrentGateActionType: "planning.decomposition.confirm",
      decompositionPlanId: "decomp-1",
      maxSteps: 5,
    } as const;

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, request)).resolves.toBeUndefined();

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      decompositionPlanId: "decomp-old",
    })).rejects.toThrow("stale or no longer available");

    await expect(assertCurrent({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
      ...request,
      changeId: "change-2",
    })).rejects.toThrow("stale or no longer available");
  });
});

