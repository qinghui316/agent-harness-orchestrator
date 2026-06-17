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

    await expect(assertCurrentWorkflowAction({ project: null, path: "project-root" }, {
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

    await expect(assertCurrentWorkflowAction({ project: { id: "repo", name: "Repo", path: "project-root", addedAt: "2026-06-18T00:00:00.000Z", lastSeenAt: "2026-06-18T00:00:00.000Z" }, path: "project-root" }, {
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
});
