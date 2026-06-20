import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedProject } from "../../src/types/index.js";

const mocks = vi.hoisted(() => ({
  getWorkbenchWorkpadProjection: vi.fn(),
}));

vi.mock("../../src/workbench/projections/read-model/implementation.js", () => ({
  getWorkbenchWorkpadProjection: mocks.getWorkbenchWorkpadProjection,
}));

import { currentGateSnapshotFromRequest, resolveVisibleControlledSchedulerCurrentGate } from "../../src/workbench/actions/visible-goal-loop-current-gate.js";

const project: ManagedProject = {
  id: "repo",
  name: "Repo",
  path: "project-root",
  addedAt: "2026-06-20T00:00:00.000Z",
  lastSeenAt: "2026-06-20T00:00:00.000Z",
};

const recommendedActionScope = {
  changeId: "change-1",
  schedulerRunId: "scheduler-run-1",
  schedulerWorkerStartId: "scheduler-worker-start-1",
};

describe("visible Goal Loop current gate proof", () => {
  beforeEach(() => {
    mocks.getWorkbenchWorkpadProjection.mockReset();
  });

  it("returns a current gate only when the current Workbench nextAction matches the visible Goal Loop packet", async () => {
    mocks.getWorkbenchWorkpadProjection.mockResolvedValue({
      goalLoop: {
        changeId: "change-1",
        goalLoopNextStepPacketId: "goal-loop-packet-post",
        recommendationState: "ready-for-existing-gate",
        continuationState: "ready-for-existing-gate",
        recommendedActionType: "planning.scheduler.worker.reconcile-result",
        recommendedActionScope,
        executionStarted: false,
      },
      nextAction: {
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.scheduler.worker.reconcile-result",
        ...recommendedActionScope,
      },
    });

    const result = await resolveVisibleControlledSchedulerCurrentGate(project, "change-1", "goal-loop-packet-post");

    expect(result).toMatchObject({
      currentGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        scope: recommendedActionScope,
      },
      goalLoopNextStepPacketId: "goal-loop-packet-post",
    });
  });

  it("returns a warning when the visible Workbench gate is scope-mismatched", async () => {
    mocks.getWorkbenchWorkpadProjection.mockResolvedValue({
      goalLoop: {
        changeId: "change-1",
        goalLoopNextStepPacketId: "goal-loop-packet-post",
        recommendationState: "ready-for-existing-gate",
        continuationState: "ready-for-existing-gate",
        recommendedActionType: "planning.scheduler.worker.reconcile-result",
        recommendedActionScope,
        executionStarted: false,
      },
      nextAction: {
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "other-worker-start",
      },
    });

    const result = await resolveVisibleControlledSchedulerCurrentGate(project, "change-1", "goal-loop-packet-post");

    expect(result).toMatchObject({
      warning: expect.stringContaining("target-mismatch"),
    });
  });

  it("returns a warning when the visible packet is stale", async () => {
    mocks.getWorkbenchWorkpadProjection.mockResolvedValue({
      goalLoop: {
        changeId: "change-1",
        goalLoopNextStepPacketId: "old-packet",
        recommendationState: "ready-for-existing-gate",
        continuationState: "ready-for-existing-gate",
        recommendedActionType: "planning.scheduler.worker.reconcile-result",
        recommendedActionScope,
        executionStarted: false,
      },
      nextAction: {
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.scheduler.worker.reconcile-result",
        ...recommendedActionScope,
      },
    });

    const result = await resolveVisibleControlledSchedulerCurrentGate(project, "change-1", "goal-loop-packet-post");

    expect(result).toMatchObject({
      warning: expect.stringContaining("visible Goal Loop packet no longer matches"),
    });
  });

  it("returns a warning when the visible Workbench gate does not carry the selected Change scope", async () => {
    mocks.getWorkbenchWorkpadProjection.mockResolvedValue({
      goalLoop: {
        changeId: "change-1",
        goalLoopNextStepPacketId: "goal-loop-packet-post",
        recommendationState: "ready-for-existing-gate",
        continuationState: "ready-for-existing-gate",
        recommendedActionType: "planning.scheduler.worker.reconcile-result",
        recommendedActionScope,
        executionStarted: false,
      },
      nextAction: {
        kind: "workflow-action",
        enabled: true,
        requiresConfirmation: true,
        actionType: "planning.scheduler.worker.reconcile-result",
        schedulerRunId: "scheduler-run-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
      },
    });

    const result = await resolveVisibleControlledSchedulerCurrentGate(project, "change-1", "goal-loop-packet-post");

    expect(result).toMatchObject({
      warning: expect.stringContaining("selected Change scope"),
    });
  });

  it("uses the shared scope-key extraction for request current gates", () => {
    expect(currentGateSnapshotFromRequest({
      actionType: "planning.goal-loop.controller.refresh",
      changeId: "change-1",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      goalLoopNextStepPacketId: "goal-loop-packet-1",
    })).toEqual({
      actionType: "planning.scheduler.worker.start-next",
      scope: {
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "claim-reservation-1",
      },
    });
  });
});
