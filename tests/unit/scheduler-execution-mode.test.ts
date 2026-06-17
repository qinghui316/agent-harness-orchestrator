import { describe, expect, it } from "vitest";
import { assessSchedulerExecutionMode, legacySchedulerExecutionModeAssessment } from "../../src/workflow-scheduler/execution-mode.js";

describe("scheduler execution mode assessment", () => {
  it("classifies scheduler recommendations as single-gate staged evidence", () => {
    const assessment = assessSchedulerExecutionMode({
      planningComplete: true,
      recommendedActionType: "planning.scheduler.worker.start-next",
      decisionKind: "scheduler-next-step",
      routingPosture: "single-worker-gate",
    });

    expect(assessment).toMatchObject({
      authority: "non-executing-scheduler-execution-mode-evidence",
      mode: "single-gate-staged",
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      currentGate: {
        actionType: "planning.scheduler.worker.start-next",
        separateHumanGateRequired: true,
      },
      humanGateRequired: true,
    });
    expect(assessment.futureLoopRequirements).toEqual(expect.arrayContaining([
      "SchedulerIntegrationCandidate before combined result handling",
      "IntegrationCheck before any source apply path",
      "human apply and close gates for high-impact transitions",
    ]));
  });

  it("classifies terminal completion as close-gate only", () => {
    const assessment = assessSchedulerExecutionMode({
      planningComplete: true,
      decisionKind: "completed-ready-for-human-close-gate",
      completionStatus: "ready-for-human-close-gate",
      routingPosture: "close-gate-required",
    });

    expect(assessment).toMatchObject({
      mode: "terminal-human-close-gate",
      loopAuthorized: false,
      humanGateRequired: true,
    });
    expect(assessment.currentGate).toBeUndefined();
    expect(assessment.summary).toContain("existing human close gate");
  });

  it("uses conservative waiting evidence when scheduler evidence is unavailable", () => {
    const assessment = assessSchedulerExecutionMode({
      planningComplete: false,
      decisionKind: "planning-needed",
      routingPosture: "wait-for-evidence",
    });
    const legacy = legacySchedulerExecutionModeAssessment();

    expect(assessment).toMatchObject({
      mode: "waiting-for-evidence",
      loopAuthorized: false,
      humanGateRequired: false,
    });
    expect(legacy).toMatchObject({
      mode: "waiting-for-evidence",
      loopAuthorized: false,
    });
  });
});
