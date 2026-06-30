import { describe, expect, it } from "vitest";

import { buildMainAgentLoopProjection, type MainAgentLoopProjectionGoalLoopEvidence } from "../../src/goal-loop/main-agent-loop-projection.js";

const baseGoalLoop: MainAgentLoopProjectionGoalLoopEvidence = {
  changeId: "change-1",
  summary: "Continue through the existing scheduler gate.",
  decisionKind: "recommend-existing-gate",
  recommendedAction: {
    actionType: "planning.scheduler.worker.start-first",
    scope: {
      changeId: "change-1",
      schedulerWorkerPlanId: "worker-plan-1",
    },
    reason: "The next worker gate matches the current visible gate.",
  },
  goalLoopDecisionId: "decision-1",
  goalLoopIterationId: "iteration-1",
  goalLoopNextStepPacketId: "packet-1",
  controllerPolicy: {
    id: "controller-1",
    verdict: "recommend-existing-gate",
    gateStatus: "matches-current-gate",
    summary: "The current gate matches.",
    executionStarted: false,
  },
  gateReadinessPreflight: {
    id: "preflight-1",
    executionStarted: false,
    concreteGateInvoked: false,
  },
  evidenceRefs: ["goal-loop/packet.md"],
  executionStarted: false,
};

describe("main agent loop projection", () => {
  it("recommends only a matching current gate without starting execution", () => {
    const projection = buildMainAgentLoopProjection({
      changeId: "change-1",
      goalLoop: baseGoalLoop,
      currentGate: {
        actionType: "planning.scheduler.worker.start-first",
        changeId: "change-1",
        scope: {
          changeId: "change-1",
          schedulerWorkerPlanId: "worker-plan-1",
        },
        enabled: true,
        requiresConfirmation: true,
      },
    });

    expect(projection.status).toBe("recommend-existing-gate");
    expect(projection.authority).toBe("non-executing-main-agent-loop-projection");
    expect(projection.executionStarted).toBe(false);
    expect(projection.forbiddenAuthority).toEqual({
      workflowTruth: false,
      actionExecution: false,
      sourceMutation: false,
      schedulerDispatch: false,
      applyOrClose: false,
      remoteOrMerge: false,
      harnessEvolution: false,
    });
  });

  it("suppresses recommendations when the action type mismatches", () => {
    const projection = buildMainAgentLoopProjection({
      changeId: "change-1",
      goalLoop: baseGoalLoop,
      currentGate: {
        actionType: "planning.scheduler.worker.validate-first",
        changeId: "change-1",
        scope: {
          changeId: "change-1",
          schedulerWorkerPlanId: "worker-plan-1",
        },
        enabled: true,
        requiresConfirmation: true,
      },
    });

    expect(projection.status).toBe("wait");
    expect(projection.executionStarted).toBe(false);
  });

  it("suppresses recommendations when target scope mismatches", () => {
    const projection = buildMainAgentLoopProjection({
      changeId: "change-1",
      goalLoop: baseGoalLoop,
      currentGate: {
        actionType: "planning.scheduler.worker.start-first",
        changeId: "change-1",
        scope: {
          changeId: "change-1",
          schedulerWorkerPlanId: "other-plan",
        },
        enabled: true,
        requiresConfirmation: true,
      },
    });

    expect(projection.status).toBe("wait");
  });

  it("returns unavailable without Goal Loop evidence", () => {
    const projection = buildMainAgentLoopProjection({
      changeId: "change-1",
      goalLoop: null,
      currentGate: null,
    });

    expect(projection.status).toBe("unavailable");
    expect(projection.executionStarted).toBe(false);
  });

  it("returns blocked for blocked Goal Loop evidence", () => {
    const projection = buildMainAgentLoopProjection({
      goalLoop: {
        ...baseGoalLoop,
        decisionKind: "blocked",
      },
      currentGate: null,
    });

    expect(projection.status).toBe("blocked");
    expect(projection.executionStarted).toBe(false);
  });

  it("returns close-ready without executing close", () => {
    const projection = buildMainAgentLoopProjection({
      goalLoop: {
        ...baseGoalLoop,
        decisionKind: "completed-ready-for-human-close-gate",
        recommendedAction: undefined,
      },
      currentGate: {
        enabled: true,
        requiresConfirmation: true,
        changeId: "change-1",
      },
    });

    expect(projection.status).toBe("close-ready");
    expect(projection.reason).toContain("does not close");
    expect(projection.executionStarted).toBe(false);
  });

  it("waits when controller evidence is missing", () => {
    const projection = buildMainAgentLoopProjection({
      goalLoop: {
        ...baseGoalLoop,
        controllerPolicy: undefined,
      },
      currentGate: {
        actionType: "planning.scheduler.worker.start-first",
        changeId: "change-1",
        scope: {
          changeId: "change-1",
          schedulerWorkerPlanId: "worker-plan-1",
        },
        enabled: true,
        requiresConfirmation: true,
      },
    });

    expect(projection.status).toBe("wait");
  });
});
