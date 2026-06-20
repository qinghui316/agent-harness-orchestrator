import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedProject } from "../../src/types/index.js";

const mocks = vi.hoisted(() => ({
  resolveProjectMemory: vi.fn(),
  resolveRunnableChangeTarget: vi.fn(),
  readLatestSchedulerControlledStepEvidenceProjection: vi.fn(),
  readGoalLoopGateReadinessPreflight: vi.fn(),
  assertControlledSchedulerContinuationGuard: vi.fn(),
}));

vi.mock("../../src/memory/resolver.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/memory/resolver.js")>()),
  resolveProjectMemory: mocks.resolveProjectMemory,
}));

vi.mock("../../src/change/target.js", () => ({
  resolveRunnableChangeTarget: mocks.resolveRunnableChangeTarget,
}));

vi.mock("../../src/scheduler-runtime/repository.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/scheduler-runtime/repository.js")>()),
  readLatestSchedulerControlledStepEvidenceProjection: mocks.readLatestSchedulerControlledStepEvidenceProjection,
}));

vi.mock("../../src/goal-loop/repository.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/goal-loop/repository.js")>()),
  readGoalLoopGateReadinessPreflight: mocks.readGoalLoopGateReadinessPreflight,
}));

vi.mock("../../src/workflow-scheduler/controlled-step.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/workflow-scheduler/controlled-step.js")>()),
  assertControlledSchedulerContinuationGuard: mocks.assertControlledSchedulerContinuationGuard,
}));

import { runControlledSchedulerLoopStep } from "../../src/scheduler-runtime/controlled-loop-step.js";

const project: ManagedProject = {
  id: "repo",
  name: "Repo",
  path: "project-root",
  addedAt: "2026-06-21T00:00:00.000Z",
  lastSeenAt: "2026-06-21T00:00:00.000Z",
};

describe("controlled scheduler loop step owner", () => {
  beforeEach(() => {
    mocks.resolveProjectMemory.mockReset();
    mocks.resolveRunnableChangeTarget.mockReset();
    mocks.readLatestSchedulerControlledStepEvidenceProjection.mockReset();
    mocks.readGoalLoopGateReadinessPreflight.mockReset();
    mocks.assertControlledSchedulerContinuationGuard.mockReset();

    mocks.resolveProjectMemory.mockResolvedValue({ memoryRoot: "memory-root", writable: true });
    mocks.resolveRunnableChangeTarget.mockResolvedValue({
      status: {
        activeChanges: [{ name: "change-1", path: "harness/changes/active/change-1" }],
      },
    });
    mocks.readLatestSchedulerControlledStepEvidenceProjection.mockResolvedValue(null);
  });

  it("fails closed before concrete dispatch when the fresh packet no longer recommends the submitted gate", async () => {
    const services = {
      evaluateGoalLoopDecision: vi.fn().mockResolvedValue({
        goalLoopDecision: { id: "decision-pre" },
        goalLoopIteration: { id: "iteration-pre" },
        goalLoopContinuationBrief: { id: "brief-pre" },
        goalLoopNextStepPacket: {
          id: "packet-pre",
          recommendedAction: {
            actionType: "planning.scheduler.worker.reconcile-result",
            scope: { changeId: "change-1", schedulerRunId: "scheduler-run-1" },
          },
        },
        executionStarted: false,
      }),
      refreshGoalLoopControllerPolicy: vi.fn(),
      prepareGoalLoopGateReadinessPreflight: vi.fn(),
      auditHighImpactAction: vi.fn(),
      dispatchControlledStep: vi.fn(),
      resolveVisibleCurrentGate: vi.fn(),
    };

    await expect(runControlledSchedulerLoopStep(project, "change-1", {
      actionType: "planning.scheduler.controlled-advance.run",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
    }, services)).rejects.toThrow(/fresh Goal Loop packet no longer recommends/);

    expect(mocks.assertControlledSchedulerContinuationGuard).toHaveBeenCalledTimes(1);
    expect(services.evaluateGoalLoopDecision).toHaveBeenCalledTimes(1);
    expect(services.auditHighImpactAction).not.toHaveBeenCalled();
    expect(services.refreshGoalLoopControllerPolicy).not.toHaveBeenCalled();
    expect(services.prepareGoalLoopGateReadinessPreflight).not.toHaveBeenCalled();
    expect(services.dispatchControlledStep).not.toHaveBeenCalled();
  });
});
