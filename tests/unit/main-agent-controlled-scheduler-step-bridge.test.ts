import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedProject } from "../../src/types/index.js";

const mocks = vi.hoisted(() => ({
  resolveProjectMemory: vi.fn(),
  resolveRunnableChangeTarget: vi.fn(),
  recordMainAgentWorkflowGraphObservationAndReplay: vi.fn(),
  runControlledSchedulerLoopStep: vi.fn(),
}));

vi.mock("../../src/memory/resolver.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/memory/resolver.js")>()),
  resolveProjectMemory: mocks.resolveProjectMemory,
}));

vi.mock("../../src/change/target.js", () => ({
  resolveRunnableChangeTarget: mocks.resolveRunnableChangeTarget,
}));

vi.mock("../../src/main-agent-orchestration/workflowgraph-replay-consumption.js", () => ({
  recordMainAgentWorkflowGraphObservationAndReplay: mocks.recordMainAgentWorkflowGraphObservationAndReplay,
}));

vi.mock("../../src/scheduler-runtime/controlled-loop-step.js", () => ({
  runControlledSchedulerLoopStep: mocks.runControlledSchedulerLoopStep,
}));

import { runMainAgentControlledSchedulerStep } from "../../src/main-agent-orchestration/controlled-scheduler-step-bridge.js";

describe("main-agent controlled scheduler step bridge", () => {
  beforeEach(() => {
    mocks.resolveProjectMemory.mockReset();
    mocks.resolveRunnableChangeTarget.mockReset();
    mocks.recordMainAgentWorkflowGraphObservationAndReplay.mockReset();
    mocks.runControlledSchedulerLoopStep.mockReset();

    mocks.resolveProjectMemory.mockResolvedValue({ memoryRoot: "memory-root", writable: true });
    mocks.resolveRunnableChangeTarget.mockResolvedValue({
      status: {
        activeChanges: [{ name: "change-1", path: "harness/changes/active/change-1" }],
      },
    });
    mocks.recordMainAgentWorkflowGraphObservationAndReplay.mockResolvedValue({ ok: true });
    mocks.runControlledSchedulerLoopStep.mockResolvedValue({ delegated: true });
  });

  it("records pre-observation, delegates exactly once, then records post-observation", async () => {
    const calls: string[] = [];
    mocks.recordMainAgentWorkflowGraphObservationAndReplay.mockImplementation(async (_memory, _project, _changeId, options) => {
      calls.push(`observe:${options.changePath}`);
      return { ok: true };
    });
    mocks.runControlledSchedulerLoopStep.mockImplementation(async () => {
      calls.push("delegate");
      return { delegated: true };
    });

    await expect(runMainAgentControlledSchedulerStep(project(), "change-1", request(), services()))
      .resolves.toEqual({ delegated: true });

    expect(calls).toEqual([
      "observe:harness/changes/active/change-1",
      "delegate",
      "observe:harness/changes/active/change-1",
    ]);
    expect(mocks.runControlledSchedulerLoopStep).toHaveBeenCalledTimes(1);
  });

  it("fails closed before observation when the active Change path cannot be resolved", async () => {
    mocks.resolveRunnableChangeTarget.mockResolvedValue({ status: { activeChanges: [] } });

    await expect(runMainAgentControlledSchedulerStep(project(), "missing-change", request(), services()))
      .rejects.toThrow("cannot resolve active Change path");

    expect(mocks.recordMainAgentWorkflowGraphObservationAndReplay).not.toHaveBeenCalled();
    expect(mocks.runControlledSchedulerLoopStep).not.toHaveBeenCalled();
  });

  it("does not delegate when pre-observation fails", async () => {
    mocks.recordMainAgentWorkflowGraphObservationAndReplay.mockRejectedValueOnce(new Error("pre observation failed"));

    await expect(runMainAgentControlledSchedulerStep(project(), "change-1", request(), services()))
      .rejects.toThrow("pre observation failed");

    expect(mocks.recordMainAgentWorkflowGraphObservationAndReplay).toHaveBeenCalledTimes(1);
    expect(mocks.runControlledSchedulerLoopStep).not.toHaveBeenCalled();
  });

  it("rethrows delegate failures while keeping post-observation best-effort", async () => {
    mocks.runControlledSchedulerLoopStep.mockRejectedValueOnce(new Error("delegate failed"));

    await expect(runMainAgentControlledSchedulerStep(project(), "change-1", request(), services()))
      .rejects.toThrow("delegate failed");

    expect(mocks.recordMainAgentWorkflowGraphObservationAndReplay).toHaveBeenCalledTimes(2);
    expect(mocks.runControlledSchedulerLoopStep).toHaveBeenCalledTimes(1);
  });

  it("does not convert a successful delegate result into failure when post-observation fails", async () => {
    mocks.recordMainAgentWorkflowGraphObservationAndReplay
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("post observation failed"));

    await expect(runMainAgentControlledSchedulerStep(project(), "change-1", request(), services()))
      .resolves.toEqual({ delegated: true });

    expect(mocks.recordMainAgentWorkflowGraphObservationAndReplay).toHaveBeenCalledTimes(2);
    expect(mocks.runControlledSchedulerLoopStep).toHaveBeenCalledTimes(1);
  });
});

function project(): ManagedProject {
  return {
    id: "project-a",
    name: "project-a",
    path: "E:/tmp/project-a",
    addedAt: "2026-07-01T00:00:00.000Z",
    lastSeenAt: "2026-07-01T00:00:00.000Z",
  };
}

function request() {
  return {
    actionType: "planning.scheduler.controlled-advance.run",
    changeId: "change-1",
    goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
    schedulerRunId: "scheduler-1",
    schedulerClaimReservationId: "reservation-1",
    reservationIntentId: "reservation-intent-1",
    claimIntentId: "claim-intent-1",
  } as const;
}

function services() {
  return {
    evaluateGoalLoopDecision: vi.fn(),
    refreshGoalLoopControllerPolicy: vi.fn(),
    prepareGoalLoopGateReadinessPreflight: vi.fn(),
    auditHighImpactAction: vi.fn(),
    dispatchControlledStep: vi.fn(),
    resolveVisibleCurrentGate: vi.fn(),
  };
}
