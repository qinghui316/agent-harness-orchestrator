import { describe, expect, it } from "vitest";
import { assessGoalLoopConflictRouting } from "../../src/goal-loop/conflict-routing.js";
import {
  assertSchedulerLoopEvidenceSnapshotNonExecuting,
  classifySchedulerLoopEvidenceSnapshot,
  type SchedulerLoopEvidenceSnapshot,
} from "../../src/goal-loop/scheduler-loop-snapshot.js";
import type { GoalLoopCompletionAudit, GoalLoopDecisionKind, GoalLoopRecommendedAction } from "../../src/goal-loop/types.js";
import { assessSchedulerExecutionMode } from "../../src/workflow-scheduler/execution-mode.js";

describe("scheduler loop evidence snapshot", () => {
  it("classifies a reserved first worker gate as human-gated evidence without loop authority", () => {
    const action = recommendedAction("planning.scheduler.worker.start-first", "Start exactly one first scheduler worker.");
    const snapshot = classify(action, "scheduler-next-step");

    expect(snapshot).toMatchObject({
      authority: "non-executing-scheduler-loop-evidence-snapshot",
      posture: "awaiting-human-gate",
      currentLegalAction: {
        actionType: "planning.scheduler.worker.start-first",
        separateHumanGateRequired: true,
      },
      separateHumanGateRequired: true,
      humanGateRequired: true,
      forbiddenAuthority: nonExecutingAuthority(),
      schedulerExecutionMode: {
        mode: "single-gate-staged",
        currentGate: {
          actionType: "planning.scheduler.worker.start-first",
          separateHumanGateRequired: true,
        },
      },
    });
    expect(snapshot.conflictAssessment.routingPosture).toBe("single-worker-gate");
    assertNonExecuting(snapshot);
  });

  it("suppresses the current action when scheduler evidence is unsafe", () => {
    const action = recommendedAction("planning.scheduler.worker.start-first", "Start exactly one first scheduler worker.");
    const snapshot = classify(action, "scheduler-next-step", {
      unsafeEvidence: [{
        kind: "cross-change",
        artifactId: "scheduler-claim-reservation-forged",
        summary: "Scheduler claim reservation belongs to a different Change.",
      }],
    });

    expect(snapshot.posture).toBe("waiting");
    expect(snapshot.currentLegalAction).toBeUndefined();
    expect(snapshot.unsafeEvidence).toHaveLength(1);
    expect(snapshot.reasons.join("\n")).toContain("cross-change");
    assertNonExecuting(snapshot);
  });

  it("classifies IntegrationCheck recommendations as an integration barrier", () => {
    const action = recommendedAction("planning.scheduler.integration-check.run", "Run the existing IntegrationCheck handoff.");
    const snapshot = classify(action, "integration-needed", {
      routingInput: {
        integrationCandidate: {
          status: "ready",
          readyCount: 2,
          blockedCount: 0,
        },
      },
    });

    expect(snapshot.posture).toBe("integration-barrier");
    expect(snapshot.conflictAssessment.routingPosture).toBe("integration-check-required");
    expect(snapshot.schedulerExecutionMode.mode).toBe("single-gate-staged");
    expect(snapshot.forbiddenAuthority.applyAuthorized).toBe(false);
    assertNonExecuting(snapshot);
  });

  it("classifies failed validation rework as quality routing, not dispatch authority", () => {
    const action = recommendedAction("planning.scheduler.worker.rework-plan.compile", "Compile bounded rework evidence.");
    const snapshot = classify(action, "scheduler-next-step", {
      routingInput: {
        currentWorkerPath: {
          validation: { status: "failed" },
          terminal: false,
        },
      },
    });

    expect(snapshot.posture).toBe("quality-routing");
    expect(snapshot.conflictAssessment.routingPosture).toBe("blocked-or-rework");
    expect(snapshot.schedulerExecutionMode.mode).toBe("single-gate-staged");
    expect(snapshot.forbiddenAuthority.wholeWaveDispatchAuthorized).toBe(false);
    assertNonExecuting(snapshot);
  });

  it("classifies SchedulerRun completion as terminal handoff through the close gate only", () => {
    const snapshot = classify(undefined, "completed-ready-for-human-close-gate", {
      completionAudit: {
        status: "ready-for-human-close-gate",
        evidence: ["scheduler-run-completion"],
        missing: [],
      },
      routingInput: {
        runCompletion: { status: "completed" },
      },
    });

    expect(snapshot.posture).toBe("terminal-handoff");
    expect(snapshot.currentLegalAction).toBeUndefined();
    expect(snapshot.conflictAssessment.routingPosture).toBe("close-gate-required");
    expect(snapshot.schedulerExecutionMode.mode).toBe("terminal-human-close-gate");
    expect(snapshot.forbiddenAuthority.closeAuthorized).toBe(false);
    assertNonExecuting(snapshot);
  });
});

function classify(
  recommendedAction: GoalLoopRecommendedAction | undefined,
  decisionKind: GoalLoopDecisionKind,
  options: {
    completionAudit?: GoalLoopCompletionAudit;
    routingInput?: Partial<Parameters<typeof assessGoalLoopConflictRouting>[0]>;
    unsafeEvidence?: Parameters<typeof classifySchedulerLoopEvidenceSnapshot>[0]["unsafeEvidence"];
  } = {},
): SchedulerLoopEvidenceSnapshot {
  const completionAudit = options.completionAudit ?? incompleteCompletionAudit();
  const conflictAssessment = assessGoalLoopConflictRouting({
    planningComplete: true,
    decisionKind,
    recommendedAction,
    claimReservation: { reservedCount: recommendedAction ? 1 : 0, blockedCount: 0 },
    ...options.routingInput,
  });
  const schedulerExecutionMode = assessSchedulerExecutionMode({
    planningComplete: true,
    decisionKind,
    recommendedActionType: recommendedAction?.actionType,
    completionStatus: completionAudit.status,
    routingPosture: conflictAssessment.routingPosture,
  });

  return classifySchedulerLoopEvidenceSnapshot({
    changeId: "phase-scheduler-loop",
    planningComplete: true,
    decisionKind,
    recommendedAction,
    conflictAssessment,
    completionAudit,
    schedulerExecutionMode,
    unsafeEvidence: options.unsafeEvidence,
  });
}

function recommendedAction(actionType: GoalLoopRecommendedAction["actionType"], reason: string): GoalLoopRecommendedAction {
  return {
    actionType,
    scope: {
      changeId: "phase-scheduler-loop",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
    },
    reason,
  };
}

function incompleteCompletionAudit(): GoalLoopCompletionAudit {
  return {
    status: "incomplete",
    evidence: [],
    missing: ["SchedulerRunCompletion"],
  };
}

function nonExecutingAuthority(): SchedulerLoopEvidenceSnapshot["forbiddenAuthority"] {
  return {
    loopAuthorized: false,
    fullParallelExecutorAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    executionStarted: false,
    sourceMutationAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    harnessEvolutionAuthorized: false,
  };
}

function assertNonExecuting(snapshot: SchedulerLoopEvidenceSnapshot): void {
  expect(() => assertSchedulerLoopEvidenceSnapshotNonExecuting(snapshot)).not.toThrow();
  expect(snapshot.schedulerExecutionMode.loopAuthorized).toBe(false);
  expect(snapshot.schedulerExecutionMode.fullParallelExecutorAuthorized).toBe(false);
  expect(snapshot.schedulerExecutionMode.wholeWaveDispatchAuthorized).toBe(false);
  expect(snapshot.schedulerExecutionMode.slotAllocatorAuthorized).toBe(false);
}
