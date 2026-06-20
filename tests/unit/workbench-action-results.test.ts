import { describe, expect, it } from "vitest";
import { labelForAction, summarizeActionResult } from "../../src/workbench/actions/results.js";

describe("Workbench action result summaries", () => {
  it("summarizes controlled scheduler advance as evidence refresh plus one concrete gate execution", () => {
    const summary = summarizeActionResult("planning.scheduler.controlled-advance.run", {
      controlledAdvance: {
        actionType: "planning.scheduler.worker.start-next",
        goalLoopDecisionId: "goal-loop-decision-2",
        goalLoopNextStepPacketId: "goal-loop-next-step-packet-2",
        goalLoopControllerPolicyId: "goal-loop-controller-policy-2",
        goalLoopGateReadinessPreflightId: "goal-loop-gate-readiness-preflight-2",
        stoppedAfterOneSchedulerTransition: true,
        loopAuthorized: false,
        wholeWaveDispatchAuthorized: false,
        slotAllocatorAuthorized: false,
      },
      controlledStep: {
        actionType: "planning.scheduler.worker.start-next",
        stoppedAfterOneSchedulerTransition: true,
      },
      result: {
        workerStart: { id: "scheduler-worker-start-2" },
      },
    });

    expect(summary).toContain("refreshed Goal Loop evidence");
    expect(summary).toContain("visible planning.scheduler.worker.start-next gate");
    expect(summary).toContain("executed that concrete scheduler gate");
    expect(summary).toContain("stopped after one transition");
    expect(summary).toContain("No scheduler loop, whole-wave dispatch, slot allocator, apply, close, remote landing, or Harness evolution was started.");
  });

  it("summarizes degraded controlled scheduler advance payloads without throwing", () => {
    expect(summarizeActionResult("planning.scheduler.controlled-advance.run", {
      controlledAdvance: {
        actionType: "planning.scheduler.integration-check.run",
      },
    })).toContain("planning.scheduler.integration-check.run");

    expect(summarizeActionResult("planning.scheduler.controlled-advance.run", {})).toContain("the selected scheduler gate");
  });

  it("labels controlled scheduler advance as a first-class action", () => {
    expect(labelForAction("planning.scheduler.controlled-advance.run")).toBe("Controlled scheduler advance executed");
  });
});
