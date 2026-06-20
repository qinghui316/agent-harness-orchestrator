import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedProject } from "../../src/types/index.js";

const mocks = vi.hoisted(() => {
  const planning = {
    preparePlanningSchedulerPlan: vi.fn(),
    compilePlanningSchedulerContract: vi.fn(),
    generateSchedulerDispatchDryRun: vi.fn(),
    compilePlanningSchedulerWorkerSessionPlan: vi.fn(),
    compilePlanningSchedulerClaimReconcilePlan: vi.fn(),
    checkPlanningSchedulerLaunchPreflight: vi.fn(),
    preparePlanningSchedulerRun: vi.fn(),
    initializePlanningSchedulerRuntime: vi.fn(),
    reconcilePlanningSchedulerRuntime: vi.fn(),
    reservePlanningSchedulerRuntimeClaims: vi.fn(),
    startPlanningSchedulerFirstWorker: vi.fn(),
    startPlanningSchedulerNextWorker: vi.fn(),
    reconcilePlanningSchedulerFirstWorkerResult: vi.fn(),
    validatePlanningSchedulerFirstWorker: vi.fn(),
    auditPlanningSchedulerFirstWorker: vi.fn(),
    compilePlanningSchedulerFirstWorkerReworkPlan: vi.fn(),
    startPlanningSchedulerFirstWorkerRework: vi.fn(),
    reconcilePlanningSchedulerFirstWorkerReworkResult: vi.fn(),
    validatePlanningSchedulerFirstWorkerRework: vi.fn(),
    auditPlanningSchedulerFirstWorkerRework: vi.fn(),
    compilePlanningSchedulerIntegrationCandidate: vi.fn(),
    runPlanningSchedulerIntegrationCheckHandoff: vi.fn(),
    reconcilePlanningSchedulerIntegrationOutcome: vi.fn(),
    completePlanningSchedulerRun: vi.fn(),
    closeBlockedPlanningSchedulerRun: vi.fn(),
  };
  return {
    planning,
    evaluateGoalLoopDecision: vi.fn(),
    refreshGoalLoopControllerPolicy: vi.fn(),
    prepareGoalLoopGateReadinessPreflight: vi.fn(),
    buildControlledSchedulerAdvanceStepRequest: vi.fn((request, evidence) => {
      const wrapper = {
        ...request,
        actionType: "planning.scheduler.controlled-step.run",
        goalLoopDecisionId: evidence.goalLoopDecisionId,
        goalLoopIterationId: evidence.goalLoopIterationId,
        goalLoopContinuationBriefId: evidence.goalLoopContinuationBriefId,
        goalLoopNextStepPacketId: evidence.goalLoopNextStepPacketId,
        goalLoopControllerPolicyId: evidence.goalLoopControllerPolicyId,
        goalLoopGateReadinessPreflightId: evidence.goalLoopGateReadinessPreflightId,
      };
      return {
        wrapper,
        concrete: {
          ...wrapper,
          actionType: request.goalLoopCurrentGateActionType,
        },
      };
    }),
    buildControlledSchedulerStepRequest: vi.fn((request) => ({
      wrapper: request,
      concrete: {
        ...request,
        actionType: request.goalLoopCurrentGateActionType,
      },
    })),
    compileGoalLoopEvaluation: vi.fn(),
    assertWritableMemory: vi.fn(),
    resolveTopic: vi.fn(),
    assertWorkflowActionScope: vi.fn(),
    auditHighImpactWorkflowAction: vi.fn(),
  };
});

vi.mock("../../src/workbench/actions/handlers/planning.js", () => mocks.planning);

vi.mock("../../src/workbench/actions/handlers/goal-loop.js", () => ({
  evaluateGoalLoopDecision: mocks.evaluateGoalLoopDecision,
  refreshGoalLoopControllerPolicy: mocks.refreshGoalLoopControllerPolicy,
  prepareGoalLoopGateReadinessPreflight: mocks.prepareGoalLoopGateReadinessPreflight,
}));

vi.mock("../../src/workflow-scheduler/controlled-step.js", () => ({
  buildControlledSchedulerAdvanceStepRequest: mocks.buildControlledSchedulerAdvanceStepRequest,
  buildControlledSchedulerStepRequest: mocks.buildControlledSchedulerStepRequest,
}));

vi.mock("../../src/goal-loop/manager.js", () => ({
  compileGoalLoopEvaluation: mocks.compileGoalLoopEvaluation,
}));

vi.mock("../../src/memory/resolver.js", () => ({
  assertWritableMemory: mocks.assertWritableMemory,
}));

vi.mock("../../src/workbench/topic-resolver.js", () => ({
  resolveTopic: mocks.resolveTopic,
}));

vi.mock("../../src/workbench/actions/boundary.js", () => ({
  assertWorkflowActionScope: mocks.assertWorkflowActionScope,
  auditHighImpactWorkflowAction: mocks.auditHighImpactWorkflowAction,
}));

import { buildSchedulerActionHandlers } from "../../src/workbench/actions/handlers/scheduler.js";

const project: ManagedProject = {
  id: "repo",
  name: "Repo",
  path: "project-root",
  addedAt: "2026-06-20T00:00:00.000Z",
  lastSeenAt: "2026-06-20T00:00:00.000Z",
};

const gateScope = {
  changeId: "change-1",
  schedulerRunId: "scheduler-run-1",
  schedulerClaimReservationId: "claim-reservation-1",
  reservationIntentId: "reservation-intent-2",
  claimIntentId: "claim-intent-2",
};

const request = {
  actionType: "planning.scheduler.controlled-advance.run",
  goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
  ...gateScope,
};

describe("controlled scheduler advance post-step evaluation", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks.planning)) fn.mockReset();
    mocks.evaluateGoalLoopDecision.mockReset();
    mocks.refreshGoalLoopControllerPolicy.mockReset();
    mocks.prepareGoalLoopGateReadinessPreflight.mockReset();
    mocks.buildControlledSchedulerAdvanceStepRequest.mockClear();
    mocks.buildControlledSchedulerStepRequest.mockClear();
    mocks.compileGoalLoopEvaluation.mockReset();
    mocks.assertWritableMemory.mockReset();
    mocks.resolveTopic.mockReset();
    mocks.assertWorkflowActionScope.mockReset();
    mocks.auditHighImpactWorkflowAction.mockReset();

    mocks.evaluateGoalLoopDecision.mockResolvedValue({
      goalLoopDecision: { id: "goal-loop-decision-pre" },
      goalLoopIteration: { id: "goal-loop-iteration-pre" },
      goalLoopContinuationBrief: { id: "goal-loop-brief-pre" },
      goalLoopNextStepPacket: {
        id: "goal-loop-packet-pre",
        recommendedAction: {
          actionType: "planning.scheduler.worker.start-next",
          scope: gateScope,
        },
      },
    });
    mocks.refreshGoalLoopControllerPolicy.mockResolvedValue({
      goalLoopControllerPolicy: {
        id: "goal-loop-controller-pre",
        verdict: "recommend-existing-gate",
        gateStatus: "matches-current-gate",
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: gateScope,
        },
      },
    });
    mocks.prepareGoalLoopGateReadinessPreflight.mockResolvedValue({
      goalLoopGateReadinessPreflight: {
        id: "goal-loop-preflight-pre",
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: gateScope,
        },
      },
    });
    mocks.planning.startPlanningSchedulerNextWorker.mockResolvedValue({
      schedulerWorkerStart: { id: "scheduler-worker-start-1" },
    });
    mocks.resolveTopic.mockResolvedValue({
      memory: { memoryRoot: "memory-root", writable: true },
      changePath: "harness/changes/active/change-1",
    });
    mocks.compileGoalLoopEvaluation.mockResolvedValue({
      goalLoopDecision: { id: "goal-loop-decision-post" },
      goalLoopIteration: {
        id: "goal-loop-iteration-post",
        continuationState: "ready-for-existing-gate",
      },
      goalLoopContinuationBrief: { id: "goal-loop-brief-post" },
      goalLoopNextStepPacket: {
        id: "goal-loop-packet-post",
        recommendedAction: {
          actionType: "planning.scheduler.worker.reconcile-result",
          scope: { changeId: "change-1", schedulerRunId: "scheduler-run-1", schedulerWorkerStartId: "scheduler-worker-start-1" },
        },
      },
    });
  });

  it("executes one concrete scheduler transition and then records non-executing post-step evidence", async () => {
    const handlers = buildSchedulerActionHandlers();
    const result = await handlers["planning.scheduler.controlled-advance.run"](project, "change-1", request, undefined) as Record<string, unknown>;

    expect(mocks.evaluateGoalLoopDecision).toHaveBeenCalledTimes(1);
    expect(mocks.refreshGoalLoopControllerPolicy).toHaveBeenCalledTimes(1);
    expect(mocks.prepareGoalLoopGateReadinessPreflight).toHaveBeenCalledTimes(1);
    expect(mocks.buildControlledSchedulerAdvanceStepRequest).toHaveBeenCalledTimes(1);
    expect(mocks.buildControlledSchedulerStepRequest).toHaveBeenCalledTimes(1);
    expect(mocks.planning.startPlanningSchedulerNextWorker).toHaveBeenCalledTimes(1);
    expect(mocks.planning.reconcilePlanningSchedulerFirstWorkerResult).not.toHaveBeenCalled();
    expect(mocks.compileGoalLoopEvaluation).toHaveBeenCalledTimes(1);
    expect(mocks.auditHighImpactWorkflowAction).toHaveBeenCalledTimes(3);
    expect(mocks.planning.startPlanningSchedulerNextWorker.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.compileGoalLoopEvaluation.mock.invocationCallOrder[0],
    );
    expect(result.postStepGoalLoopEvaluation).toMatchObject({
      goalLoopDecisionId: "goal-loop-decision-post",
      goalLoopIterationId: "goal-loop-iteration-post",
      goalLoopContinuationBriefId: "goal-loop-brief-post",
      goalLoopNextStepPacketId: "goal-loop-packet-post",
      recommendedActionType: "planning.scheduler.worker.reconcile-result",
      continuationState: "ready-for-existing-gate",
      executionStarted: false,
    });
  });

  it("keeps concrete transition success when post-step evidence refresh fails", async () => {
    mocks.compileGoalLoopEvaluation.mockRejectedValueOnce(new Error("projection drift"));
    const handlers = buildSchedulerActionHandlers();
    const result = await handlers["planning.scheduler.controlled-advance.run"](project, "change-1", request, undefined) as Record<string, unknown>;

    expect(mocks.planning.startPlanningSchedulerNextWorker).toHaveBeenCalledTimes(1);
    expect(mocks.buildControlledSchedulerAdvanceStepRequest).toHaveBeenCalledTimes(1);
    expect(mocks.buildControlledSchedulerStepRequest).toHaveBeenCalledTimes(1);
    expect(mocks.auditHighImpactWorkflowAction).toHaveBeenCalledTimes(3);
    expect(result.controlledAdvance).toMatchObject({
      actionType: "planning.scheduler.worker.start-next",
      executionStarted: true,
      stoppedAfterOneSchedulerTransition: true,
    });
    expect(result.result).toMatchObject({
      schedulerWorkerStart: { id: "scheduler-worker-start-1" },
    });
    expect(result.postStepGoalLoopEvaluationWarning).toContain("projection drift");
  });
});
