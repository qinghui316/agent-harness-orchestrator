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
    assertControlledSchedulerContinuationGuard: vi.fn(),
    assertControlledSchedulerFreshGateMatchesRequest: vi.fn(),
    compileGoalLoopEvaluation: vi.fn(),
    compileGoalLoopControllerPolicy: vi.fn(),
    compileGoalLoopGateReadinessPreflight: vi.fn(),
    readGoalLoopGateReadinessPreflight: vi.fn(),
    resolveVisibleControlledSchedulerCurrentGate: vi.fn(),
    assertWritableMemory: vi.fn(),
    resolveTopic: vi.fn(),
    assertWorkflowActionScope: vi.fn(),
    auditHighImpactWorkflowAction: vi.fn(),
    recordSchedulerControlledStepEvidence: vi.fn(),
    readLatestSchedulerControlledStepEvidenceProjection: vi.fn(),
    resolveProjectMemory: vi.fn(),
    resolveRunnableChangeTarget: vi.fn(),
    recordMainAgentWorkflowGraphObservationAndReplay: vi.fn(),
  };
});

vi.mock("../../src/workbench/actions/handlers/planning.js", () => mocks.planning);

vi.mock("../../src/workbench/actions/handlers/goal-loop.js", () => ({
  evaluateGoalLoopDecision: mocks.evaluateGoalLoopDecision,
  refreshGoalLoopControllerPolicy: mocks.refreshGoalLoopControllerPolicy,
  prepareGoalLoopGateReadinessPreflight: mocks.prepareGoalLoopGateReadinessPreflight,
}));

vi.mock("../../src/workflow-scheduler/controlled-step.js", () => ({
  assertControlledSchedulerFreshGateMatchesRequest: mocks.assertControlledSchedulerFreshGateMatchesRequest,
  assertControlledSchedulerContinuationGuard: mocks.assertControlledSchedulerContinuationGuard,
  buildControlledSchedulerAdvanceStepRequest: mocks.buildControlledSchedulerAdvanceStepRequest,
  buildControlledSchedulerStepRequest: mocks.buildControlledSchedulerStepRequest,
  isControlledSchedulerConcreteAction: (actionType: unknown) => typeof actionType === "string"
    && actionType.startsWith("planning.scheduler.")
    && actionType !== "planning.scheduler.controlled-step.run"
    && actionType !== "planning.scheduler.controlled-advance.run",
}));

vi.mock("../../src/goal-loop/manager.js", () => ({
  compileGoalLoopEvaluation: mocks.compileGoalLoopEvaluation,
  compileGoalLoopControllerPolicy: mocks.compileGoalLoopControllerPolicy,
  compileGoalLoopGateReadinessPreflight: mocks.compileGoalLoopGateReadinessPreflight,
}));

vi.mock("../../src/goal-loop/repository.js", () => ({
  readGoalLoopGateReadinessPreflight: mocks.readGoalLoopGateReadinessPreflight,
}));

vi.mock("../../src/memory/resolver.js", () => ({
  assertWritableMemory: mocks.assertWritableMemory,
  resolveProjectMemory: mocks.resolveProjectMemory,
}));

vi.mock("../../src/change/target.js", () => ({
  resolveRunnableChangeTarget: mocks.resolveRunnableChangeTarget,
}));

vi.mock("../../src/main-agent-orchestration/workflowgraph-replay-consumption.js", () => ({
  recordMainAgentWorkflowGraphObservationAndReplay: mocks.recordMainAgentWorkflowGraphObservationAndReplay,
}));

vi.mock("../../src/workbench/topic-resolver.js", () => ({
  resolveTopic: mocks.resolveTopic,
}));

vi.mock("../../src/workbench/actions/boundary.js", () => ({
  assertWorkflowActionScope: mocks.assertWorkflowActionScope,
  auditHighImpactWorkflowAction: mocks.auditHighImpactWorkflowAction,
}));

vi.mock("../../src/workbench/actions/visible-goal-loop-current-gate.js", () => ({
  resolveVisibleControlledSchedulerCurrentGate: mocks.resolveVisibleControlledSchedulerCurrentGate,
}));

vi.mock("../../src/scheduler-runtime/controlled-step-evidence.js", () => ({
  recordSchedulerControlledStepEvidence: mocks.recordSchedulerControlledStepEvidence,
}));

vi.mock("../../src/scheduler-runtime/repository.js", () => ({
  readLatestSchedulerControlledStepEvidenceProjection: mocks.readLatestSchedulerControlledStepEvidenceProjection,
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
    mocks.assertControlledSchedulerContinuationGuard.mockReset();
    mocks.assertControlledSchedulerFreshGateMatchesRequest.mockClear();
    mocks.compileGoalLoopEvaluation.mockReset();
    mocks.compileGoalLoopControllerPolicy.mockReset();
    mocks.compileGoalLoopGateReadinessPreflight.mockReset();
    mocks.readGoalLoopGateReadinessPreflight.mockReset();
    mocks.resolveVisibleControlledSchedulerCurrentGate.mockReset();
    mocks.assertWritableMemory.mockReset();
    mocks.resolveTopic.mockReset();
    mocks.assertWorkflowActionScope.mockReset();
    mocks.auditHighImpactWorkflowAction.mockReset();
    mocks.recordSchedulerControlledStepEvidence.mockReset();
    mocks.readLatestSchedulerControlledStepEvidenceProjection.mockReset();
    mocks.resolveProjectMemory.mockReset();
    mocks.resolveRunnableChangeTarget.mockReset();
    mocks.recordMainAgentWorkflowGraphObservationAndReplay.mockReset();

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
      schedulerWorkerStart: {
        id: "scheduler-worker-start-1",
        status: "started",
        artifact: "harness/changes/active/change-1/planning/scheduler-runs/scheduler-run-1/scheduler-worker-starts/scheduler-worker-start-1.json",
        internalResult: { shouldNotPersist: true },
        sourceArtifactHashes: { spec: "hash-1" },
      },
    });
    mocks.resolveTopic.mockResolvedValue({
      memory: { memoryRoot: "memory-root", writable: true },
      changePath: "harness/changes/active/change-1",
    });
    mocks.resolveProjectMemory.mockResolvedValue({ memoryRoot: "memory-root", writable: true });
    mocks.resolveRunnableChangeTarget.mockResolvedValue({
      status: {
        activeChanges: [{ name: "change-1", path: "harness/changes/active/change-1" }],
      },
    });
    mocks.recordMainAgentWorkflowGraphObservationAndReplay.mockResolvedValue({
      observationEvidence: { id: "workflowgraph-observation-1" },
      replaySummary: { id: "workflowgraph-replay-1" },
      recoverySummary: { id: "workflowgraph-recovery-1" },
      schedulerCandidateAssessment: { id: "scheduler-candidate-1" },
      controlledSchedulerRoute: { kind: "use-existing-controlled-scheduler-path" },
    });
    mocks.readLatestSchedulerControlledStepEvidenceProjection.mockResolvedValue(null);
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
    mocks.resolveVisibleControlledSchedulerCurrentGate.mockImplementation(async (_project: unknown, _changeId: string, goalLoopNextStepPacketId: string) => {
      if (goalLoopNextStepPacketId === "goal-loop-packet-pre") {
        return {
          currentGate: {
            actionType: "planning.scheduler.worker.start-next",
            scope: gateScope,
          },
          goalLoopNextStepPacketId: "goal-loop-packet-pre",
        };
      }
      return {
        currentGate: {
          actionType: "planning.scheduler.worker.reconcile-result",
          scope: { changeId: "change-1", schedulerRunId: "scheduler-run-1", schedulerWorkerStartId: "scheduler-worker-start-1" },
        },
        goalLoopNextStepPacketId: "goal-loop-packet-post",
      };
    });
    mocks.compileGoalLoopControllerPolicy.mockResolvedValue({
      id: "goal-loop-controller-post",
    });
    mocks.compileGoalLoopGateReadinessPreflight.mockResolvedValue({
      id: "goal-loop-preflight-post",
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
      currentGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
      },
    });
    mocks.recordSchedulerControlledStepEvidence.mockResolvedValue({
      schedulerControlledStepEvidence: {
        id: "scheduler-controlled-step-1",
        status: "recorded",
        executedActionType: "planning.scheduler.worker.start-next",
        humanConfirmationStillRequired: true,
        controlledLoopTick: {
          version: "1.0",
          authority: "scheduler-runtime-controlled-loop-tick-contract-summary",
          observe: {
            status: "recorded",
            goalLoopDecisionId: "goal-loop-decision-pre",
            goalLoopIterationId: "goal-loop-iteration-pre",
            goalLoopContinuationBriefId: "goal-loop-brief-pre",
            goalLoopNextStepPacketId: "goal-loop-packet-pre",
            submittedActionType: "planning.scheduler.worker.start-next",
          },
          chooseCheck: {
            status: "recorded",
            goalLoopControllerPolicyId: "goal-loop-controller-pre",
            goalLoopGateReadinessPreflightId: "goal-loop-preflight-pre",
            targetScopeMatched: true,
            concreteGatePreflightNonExecuting: true,
          },
          dispatch: {
            status: "completed",
            executedActionType: "planning.scheduler.worker.start-next",
            executionStarted: true,
            stoppedAfterOneSchedulerTransition: true,
            approvedScopeOnly: true,
          },
          reconcile: {
            status: "recorded",
            goalLoopNextStepPacketId: "goal-loop-packet-post",
            executionStarted: false,
          },
          routeStop: {
            status: "next-confirmation-candidate-ready",
            stopReason: "one-confirmed-scheduler-transition-completed",
            routePosture: "awaiting-human-gate",
            nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
            humanGateRequired: true,
            humanConfirmationStillRequired: true,
            needsReevaluation: false,
          },
          executionStarted: false,
          loopAuthorized: false,
          fullParallelExecutorAuthorized: false,
          wholeWaveDispatchAuthorized: false,
          slotAllocatorAuthorized: false,
          sourceMutationAuthorized: false,
          applyAuthorized: false,
          closeAuthorized: false,
          mergeAuthorized: false,
          remoteLandingAuthorized: false,
          harnessEvolutionAuthorized: false,
        },
        controlledLoopIteration: {
          version: "1.0",
          authority: "scheduler-runtime-controlled-loop-iteration-summary",
          status: "completed",
          executedActionType: "planning.scheduler.worker.start-next",
          observeStatus: "recorded",
          chooseCheckStatus: "recorded",
          dispatchStatus: "completed",
          reconcileStatus: "recorded",
          routePosture: "awaiting-human-gate",
          routeStopReason: "one-confirmed-scheduler-transition-completed",
          continuationReadinessStatus: "ready-for-human-gate",
          nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
          resultKind: "schedulerWorkerStart",
          resultId: "scheduler-worker-start-1",
          resultStatus: "started",
          readinessEvidencePrepared: true,
          needsReevaluation: false,
          humanGateRequired: true,
          humanConfirmationStillRequired: true,
          stoppedAfterOneSchedulerTransition: true,
          approvedScopeOnly: true,
          boundary: "Scheduler-runtime summary of one human-confirmed controlled Scheduler transition; any next transition still requires the existing scoped human gate and ToolPolicy path.",
          evidenceRefs: [],
          executionStarted: false,
          loopAuthorized: false,
          fullParallelExecutorAuthorized: false,
          wholeWaveDispatchAuthorized: false,
          slotAllocatorAuthorized: false,
          sourceMutationAuthorized: false,
          applyAuthorized: false,
          closeAuthorized: false,
          mergeAuthorized: false,
          remoteLandingAuthorized: false,
          harnessEvolutionAuthorized: false,
        },
        controlledLoopCurrentTransitionChoice: {
          version: "1.0",
          authority: "scheduler-runtime-current-transition-choice",
          status: "ready-for-dispatch",
          changeId: "change-1",
          selectedActionType: "planning.scheduler.worker.start-next",
          submittedActionType: "planning.scheduler.controlled-advance.run",
          currentGate: {
            actionType: "planning.scheduler.worker.start-next",
            scope: gateScope,
          },
          goalLoopDecisionId: "goal-loop-decision-pre",
          goalLoopIterationId: "goal-loop-iteration-pre",
          goalLoopContinuationBriefId: "goal-loop-brief-pre",
          goalLoopNextStepPacketId: "goal-loop-packet-pre",
          goalLoopControllerPolicyId: "goal-loop-controller-pre",
          goalLoopGateReadinessPreflightId: "goal-loop-preflight-pre",
          humanGateRequired: true,
          humanConfirmationStillRequired: true,
          executionStarted: false,
          concreteGateInvoked: false,
          toolPolicyAuthorizedConcreteGate: false,
          authorizationGranted: false,
          loopAuthorized: false,
          fullParallelExecutorAuthorized: false,
          wholeWaveDispatchAuthorized: false,
          slotAllocatorAuthorized: false,
          sourceMutationAuthorized: false,
          applyAuthorized: false,
          closeAuthorized: false,
          mergeAuthorized: false,
          remoteLandingAuthorized: false,
          harnessEvolutionAuthorized: false,
        },
        artifact: "harness/changes/active/change-1/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.json",
        markdownArtifact: "harness/changes/active/change-1/planning/scheduler-runs/scheduler-run-1/scheduler-controlled-steps/scheduler-controlled-step-1.md",
      },
    });
  });

  it("executes one concrete scheduler transition and then records non-executing post-step readiness evidence", async () => {
    const handlers = buildSchedulerActionHandlers();
    const result = await handlers["planning.scheduler.controlled-advance.run"](project, "change-1", request, undefined) as Record<string, unknown>;

    expect(mocks.evaluateGoalLoopDecision).toHaveBeenCalledTimes(1);
    expect(mocks.assertControlledSchedulerContinuationGuard).toHaveBeenCalledWith(expect.objectContaining({
      changeId: "change-1",
      previousStep: null,
      previousGateReadinessPreflight: null,
      requestedConcreteGate: expect.objectContaining({
        actionType: "planning.scheduler.worker.start-next",
        schedulerRunId: "scheduler-run-1",
      }),
    }));
    expect(mocks.refreshGoalLoopControllerPolicy).toHaveBeenCalledTimes(1);
    expect(mocks.prepareGoalLoopGateReadinessPreflight).toHaveBeenCalledTimes(1);
    expect(mocks.buildControlledSchedulerAdvanceStepRequest).toHaveBeenCalledTimes(1);
    expect(mocks.buildControlledSchedulerStepRequest).toHaveBeenCalledTimes(1);
    expect(mocks.planning.startPlanningSchedulerNextWorker).toHaveBeenCalledTimes(1);
    expect(mocks.planning.reconcilePlanningSchedulerFirstWorkerResult).not.toHaveBeenCalled();
    expect(mocks.compileGoalLoopEvaluation).toHaveBeenCalledTimes(1);
    expect(mocks.resolveVisibleControlledSchedulerCurrentGate).toHaveBeenCalledWith(project, "change-1", "goal-loop-packet-pre");
    expect(mocks.resolveVisibleControlledSchedulerCurrentGate).toHaveBeenCalledWith(project, "change-1", "goal-loop-packet-post");
    expect(mocks.compileGoalLoopControllerPolicy).toHaveBeenCalledTimes(1);
    expect(mocks.compileGoalLoopGateReadinessPreflight).toHaveBeenCalledTimes(1);
    expect(mocks.prepareGoalLoopGateReadinessPreflight).toHaveBeenCalledWith(project, "change-1", expect.objectContaining({
      actionType: "planning.goal-loop.gate-readiness.prepare",
      goalLoopNextStepPacketId: "goal-loop-packet-pre",
      goalLoopControllerPolicyId: "goal-loop-controller-pre",
    }), undefined, undefined);
    expect(mocks.auditHighImpactWorkflowAction).toHaveBeenCalledTimes(3);
    expect(mocks.assertControlledSchedulerFreshGateMatchesRequest).toHaveBeenCalledTimes(4);
    expect(mocks.recordSchedulerControlledStepEvidence).toHaveBeenCalledTimes(1);
    expect(mocks.recordSchedulerControlledStepEvidence).toHaveBeenCalledWith(project, expect.objectContaining({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      executedActionType: "planning.scheduler.worker.start-next",
      preStepEvidence: expect.objectContaining({
        goalLoopDecisionId: "goal-loop-decision-pre",
        goalLoopNextStepPacketId: "goal-loop-packet-pre",
        goalLoopControllerPolicyId: "goal-loop-controller-pre",
        goalLoopGateReadinessPreflightId: "goal-loop-preflight-pre",
      }),
      postStepGoalLoopEvaluation: expect.objectContaining({
        goalLoopNextStepPacketId: "goal-loop-packet-post",
      }),
      postStepGoalLoopReadiness: expect.objectContaining({
        goalLoopGateReadinessPreflightId: "goal-loop-preflight-post",
      }),
      postStepHandoff: expect.objectContaining({
        executedActionType: "planning.scheduler.worker.start-next",
        executionStarted: false,
        loopAuthorized: false,
        wholeWaveDispatchAuthorized: false,
        slotAllocatorAuthorized: false,
      }),
      controlledStepResultSummary: expect.objectContaining({
        resultKind: "schedulerWorkerStart",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerStartStatus: "started",
      }),
      controlledLoopCurrentTransitionChoice: expect.objectContaining({
        authority: "scheduler-runtime-current-transition-choice",
        selectedActionType: "planning.scheduler.worker.start-next",
        executionStarted: false,
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
        authorizationGranted: false,
      }),
    }));
    const controlledStepEvidenceInput = mocks.recordSchedulerControlledStepEvidence.mock.calls[0]?.[1] as {
      controlledStepResultSummary?: Record<string, unknown>;
    };
    expect(controlledStepEvidenceInput.controlledStepResultSummary).toEqual({
      resultKind: "schedulerWorkerStart",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerStartStatus: "started",
      resultArtifact: "harness/changes/active/change-1/planning/scheduler-runs/scheduler-run-1/scheduler-worker-starts/scheduler-worker-start-1.json",
    });
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
    expect(result.controlledLoopCurrentTransitionChoice).toMatchObject({
      authority: "scheduler-runtime-current-transition-choice",
      status: "ready-for-dispatch",
      selectedActionType: "planning.scheduler.worker.start-next",
      goalLoopNextStepPacketId: "goal-loop-packet-pre",
      goalLoopControllerPolicyId: "goal-loop-controller-pre",
      goalLoopGateReadinessPreflightId: "goal-loop-preflight-pre",
      executionStarted: false,
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
      authorizationGranted: false,
      loopAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
    expect(result.postStepGoalLoopReadiness).toMatchObject({
      goalLoopControllerPolicyId: "goal-loop-controller-post",
      goalLoopGateReadinessPreflightId: "goal-loop-preflight-post",
      currentGateActionType: "planning.scheduler.worker.reconcile-result",
      executionStarted: false,
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
    });
    expect(result.postStepHandoff).toMatchObject({
      authority: "derived-non-executing-workbench-handoff",
      status: "next-confirmation-candidate-ready",
      stopReason: "one-confirmed-scheduler-transition-completed",
      executedActionType: "planning.scheduler.worker.start-next",
      needsReevaluation: false,
      executionStarted: false,
      loopAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      nextConfirmationCandidate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        goalLoopNextStepPacketId: "goal-loop-packet-post",
        goalLoopControllerPolicyId: "goal-loop-controller-post",
        goalLoopGateReadinessPreflightId: "goal-loop-preflight-post",
        readinessEvidencePrepared: true,
        executionStarted: false,
        authorizationGranted: false,
        humanConfirmationStillRequired: true,
      },
    });
    expect(result.schedulerControlledStepEvidence).toMatchObject({
      id: "scheduler-controlled-step-1",
      status: "recorded",
      executedActionType: "planning.scheduler.worker.start-next",
      humanConfirmationStillRequired: true,
      controlledLoopTick: {
        authority: "scheduler-runtime-controlled-loop-tick-contract-summary",
        dispatch: {
          status: "completed",
          stoppedAfterOneSchedulerTransition: true,
        },
        routeStop: {
          routePosture: "awaiting-human-gate",
          humanConfirmationStillRequired: true,
        },
        loopAuthorized: false,
        sourceMutationAuthorized: false,
        applyAuthorized: false,
        closeAuthorized: false,
        harnessEvolutionAuthorized: false,
      },
      controlledLoopIteration: {
        authority: "scheduler-runtime-controlled-loop-iteration-summary",
        status: "completed",
        routePosture: "awaiting-human-gate",
        continuationReadinessStatus: "ready-for-human-gate",
        humanConfirmationStillRequired: true,
        loopAuthorized: false,
        sourceMutationAuthorized: false,
        applyAuthorized: false,
        closeAuthorized: false,
        harnessEvolutionAuthorized: false,
      },
      controlledLoopCurrentTransitionChoice: {
        authority: "scheduler-runtime-current-transition-choice",
        selectedActionType: "planning.scheduler.worker.start-next",
        authorizationGranted: false,
      },
    });
  });

  it("consumes prior post-step routing support when the user confirms the next controlled scheduler gate", async () => {
    const continuationScope = {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
    };
    const continuationGate = {
      actionType: "planning.scheduler.worker.reconcile-result",
      scope: continuationScope,
    };
    mocks.readLatestSchedulerControlledStepEvidenceProjection.mockResolvedValueOnce(buildPriorControlledStepForReconcile());
    mocks.readGoalLoopGateReadinessPreflight.mockResolvedValueOnce({
      id: "goal-loop-preflight-post",
      changeId: "change-1",
      currentGate: continuationGate,
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
      executionStarted: false,
      artifact: "goal-loop-preflight-post.json",
      markdownArtifact: "goal-loop-preflight-post.md",
    });
    mocks.evaluateGoalLoopDecision.mockResolvedValueOnce({
      goalLoopDecision: { id: "goal-loop-decision-continuation" },
      goalLoopIteration: { id: "goal-loop-iteration-continuation" },
      goalLoopContinuationBrief: { id: "goal-loop-brief-continuation" },
      goalLoopNextStepPacket: {
        id: "goal-loop-packet-continuation",
        recommendedAction: continuationGate,
      },
    });
    mocks.refreshGoalLoopControllerPolicy.mockResolvedValueOnce({
      goalLoopControllerPolicy: {
        id: "goal-loop-controller-continuation",
        verdict: "recommend-existing-gate",
        gateStatus: "matches-current-gate",
        currentGate: continuationGate,
      },
    });
    mocks.prepareGoalLoopGateReadinessPreflight.mockResolvedValueOnce({
      goalLoopGateReadinessPreflight: {
        id: "goal-loop-preflight-continuation",
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
        currentGate: continuationGate,
      },
    });
    mocks.resolveVisibleControlledSchedulerCurrentGate.mockResolvedValueOnce({
      currentGate: continuationGate,
      goalLoopNextStepPacketId: "goal-loop-packet-continuation",
    });
    mocks.planning.reconcilePlanningSchedulerFirstWorkerResult.mockResolvedValueOnce({
      schedulerWorkerResult: {
        id: "scheduler-worker-result-1",
        status: "evidence-ready",
        artifact: "scheduler-worker-result-1.json",
      },
    });

    const handlers = buildSchedulerActionHandlers();
    await handlers["planning.scheduler.controlled-advance.run"](project, "change-1", {
      actionType: "planning.scheduler.controlled-advance.run",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.reconcile-result",
      ...continuationScope,
    }, undefined);

    expect(mocks.prepareGoalLoopGateReadinessPreflight).toHaveBeenCalledWith(project, "change-1", expect.objectContaining({
      actionType: "planning.goal-loop.gate-readiness.prepare",
      goalLoopNextStepPacketId: "goal-loop-packet-continuation",
      goalLoopControllerPolicyId: "goal-loop-controller-continuation",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.reconcile-result",
    }), undefined, expect.objectContaining({
      sourceGoalLoopGateReadinessPreflightId: "goal-loop-preflight-post",
      controlledSchedulerPostStepRoutingSupport: expect.objectContaining({
        authority: "non-executing-controlled-scheduler-post-step-routing-preflight-support",
        sourceSchedulerControlledStepEvidenceId: "scheduler-controlled-step-previous",
        sourceSchedulerControlledStepArtifact: "scheduler-controlled-step-previous.json",
        sourceSchedulerControlledStepMarkdownArtifact: "scheduler-controlled-step-previous.md",
        sourceGoalLoopNextStepPacketId: "goal-loop-packet-continuation",
        sourceGoalLoopControllerPolicyId: "goal-loop-controller-continuation",
        sourceGoalLoopGateReadinessPreflightId: "goal-loop-preflight-post",
        existingGateActionType: "planning.scheduler.worker.reconcile-result",
        continuationDecisionStatus: "ready-for-human-gate",
        routingReadinessStatus: "ready-for-human-gate",
        needsReevaluation: false,
        currentGateScope: continuationScope,
        loopAuthorized: false,
        sourceMutationAuthorized: false,
        applyAuthorized: false,
        closeAuthorized: false,
        executionStarted: false,
      }),
    }));
    expect(mocks.planning.reconcilePlanningSchedulerFirstWorkerResult).toHaveBeenCalledTimes(1);
    expect(mocks.planning.startPlanningSchedulerNextWorker).not.toHaveBeenCalled();
    expect(mocks.recordSchedulerControlledStepEvidence).toHaveBeenCalledWith(project, expect.objectContaining({
      executedActionType: "planning.scheduler.worker.reconcile-result",
      controlledLoopPreDispatchDecision: expect.objectContaining({
        status: "ready-for-human-gate",
        nextGateActionType: "planning.scheduler.worker.reconcile-result",
        executionStarted: false,
        loopAuthorized: false,
        applyAuthorized: false,
        closeAuthorized: false,
      }),
    }));
  });

  it("fails before refreshing Goal Loop evidence or executing a scheduler gate when the continuation guard rejects the request", async () => {
    mocks.readLatestSchedulerControlledStepEvidenceProjection.mockResolvedValueOnce({
      id: "scheduler-controlled-step-previous",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      status: "recorded",
      postStepEvidence: {
        goalLoopGateReadinessPreflightId: "preflight-post",
      },
      controlledLoopContinuationReadiness: {
        status: "ready-for-human-gate",
        nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
        readinessEvidencePrepared: true,
      },
      createdAt: "2026-06-21T00:00:00.000Z",
    });
    mocks.readGoalLoopGateReadinessPreflight.mockResolvedValueOnce({
      id: "preflight-post",
      changeId: "change-1",
      currentGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        scope: {
          changeId: "change-1",
          schedulerRunId: "scheduler-run-1",
          schedulerWorkerStartId: "scheduler-worker-start-1",
        },
      },
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
      executionStarted: false,
    });
    mocks.assertControlledSchedulerContinuationGuard.mockImplementationOnce(() => {
      throw new Error("planning.scheduler.controlled-advance.run continuation guard submitted gate scope no longer matches prior post-step preflight.");
    });

    const handlers = buildSchedulerActionHandlers();
    await expect(handlers["planning.scheduler.controlled-advance.run"](project, "change-1", request, undefined)).rejects.toThrow(/continuation guard/);

    expect(mocks.readGoalLoopGateReadinessPreflight).toHaveBeenCalledWith(
      { memoryRoot: "memory-root", writable: true },
      "harness/changes/active/change-1",
      "preflight-post",
    );
    expect(mocks.evaluateGoalLoopDecision).not.toHaveBeenCalled();
    expect(mocks.refreshGoalLoopControllerPolicy).not.toHaveBeenCalled();
    expect(mocks.prepareGoalLoopGateReadinessPreflight).not.toHaveBeenCalled();
    expect(mocks.buildControlledSchedulerAdvanceStepRequest).not.toHaveBeenCalled();
    expect(mocks.buildControlledSchedulerStepRequest).not.toHaveBeenCalled();
    expect(mocks.planning.startPlanningSchedulerNextWorker).not.toHaveBeenCalled();
    expect(mocks.recordSchedulerControlledStepEvidence).not.toHaveBeenCalled();
  });

  it("fails closed before dispatch when accepted prior routing support cannot be derived", async () => {
    const priorStep = buildPriorControlledStepForReconcile({
      controlledLoopPostStepRoutingDecision: undefined,
    });
    mocks.readLatestSchedulerControlledStepEvidenceProjection.mockResolvedValueOnce(priorStep);
    mocks.readGoalLoopGateReadinessPreflight.mockResolvedValueOnce({
      id: "goal-loop-preflight-post",
      changeId: "change-1",
      currentGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        scope: {
          changeId: "change-1",
          schedulerRunId: "scheduler-run-1",
          schedulerWorkerStartId: "scheduler-worker-start-1",
        },
      },
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
      executionStarted: false,
      artifact: "goal-loop-preflight-post.json",
      markdownArtifact: "goal-loop-preflight-post.md",
    });
    const continuationScope = {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
    };
    const continuationGate = {
      actionType: "planning.scheduler.worker.reconcile-result",
      scope: continuationScope,
    };
    mocks.evaluateGoalLoopDecision.mockResolvedValueOnce({
      goalLoopDecision: { id: "goal-loop-decision-continuation" },
      goalLoopIteration: { id: "goal-loop-iteration-continuation" },
      goalLoopContinuationBrief: { id: "goal-loop-brief-continuation" },
      goalLoopNextStepPacket: {
        id: "goal-loop-packet-continuation",
        recommendedAction: continuationGate,
      },
    });
    mocks.refreshGoalLoopControllerPolicy.mockResolvedValueOnce({
      goalLoopControllerPolicy: {
        id: "goal-loop-controller-continuation",
        verdict: "recommend-existing-gate",
        gateStatus: "matches-current-gate",
        currentGate: continuationGate,
      },
    });
    mocks.resolveVisibleControlledSchedulerCurrentGate.mockResolvedValueOnce({
      currentGate: continuationGate,
      goalLoopNextStepPacketId: "goal-loop-packet-continuation",
    });

    const handlers = buildSchedulerActionHandlers();
    await expect(handlers["planning.scheduler.controlled-advance.run"](project, "change-1", {
      actionType: "planning.scheduler.controlled-advance.run",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.reconcile-result",
      ...continuationScope,
    }, undefined)).rejects.toThrow(/requires prior post-step routing evidence/);

    expect(mocks.prepareGoalLoopGateReadinessPreflight).not.toHaveBeenCalled();
    expect(mocks.planning.reconcilePlanningSchedulerFirstWorkerResult).not.toHaveBeenCalled();
    expect(mocks.recordSchedulerControlledStepEvidence).not.toHaveBeenCalled();
  });

  it("keeps concrete transition success when post-step evidence refresh fails", async () => {
    mocks.compileGoalLoopEvaluation.mockRejectedValueOnce(new Error("projection drift"));
    const handlers = buildSchedulerActionHandlers();
    const result = await handlers["planning.scheduler.controlled-advance.run"](project, "change-1", request, undefined) as Record<string, unknown>;

    expect(mocks.planning.startPlanningSchedulerNextWorker).toHaveBeenCalledTimes(1);
    expect(mocks.buildControlledSchedulerAdvanceStepRequest).toHaveBeenCalledTimes(1);
    expect(mocks.buildControlledSchedulerStepRequest).toHaveBeenCalledTimes(1);
    expect(mocks.auditHighImpactWorkflowAction).toHaveBeenCalledTimes(3);
    expect(mocks.recordSchedulerControlledStepEvidence).toHaveBeenCalledTimes(1);
    expect(mocks.recordSchedulerControlledStepEvidence).toHaveBeenCalledWith(project, expect.objectContaining({
      postStepGoalLoopEvaluationWarning: expect.stringContaining("projection drift"),
      postStepHandoff: expect.objectContaining({
        status: "next-step-evaluation-failed",
        executedActionType: "planning.scheduler.worker.start-next",
      }),
    }));
    expect(mocks.resolveVisibleControlledSchedulerCurrentGate).toHaveBeenCalledWith(project, "change-1", "goal-loop-packet-pre");
    expect(mocks.compileGoalLoopControllerPolicy).not.toHaveBeenCalled();
    expect(mocks.compileGoalLoopGateReadinessPreflight).not.toHaveBeenCalled();
    expect(result.controlledAdvance).toMatchObject({
      actionType: "planning.scheduler.worker.start-next",
      executionStarted: true,
      stoppedAfterOneSchedulerTransition: true,
    });
    expect(result.result).toMatchObject({
      schedulerWorkerStart: { id: "scheduler-worker-start-1" },
    });
    expect(result.postStepGoalLoopEvaluationWarning).toContain("projection drift");
    expect(result.postStepHandoff).toMatchObject({
      status: "next-step-evaluation-failed",
      executedActionType: "planning.scheduler.worker.start-next",
      needsReevaluation: true,
      executionStarted: false,
      loopAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
    });
    expect(result.postStepHandoff).not.toHaveProperty("nextConfirmationCandidate");
  });

  it("keeps concrete transition success when runtime step evidence recording fails", async () => {
    mocks.recordSchedulerControlledStepEvidence.mockRejectedValueOnce(new Error("artifact store unavailable"));
    const handlers = buildSchedulerActionHandlers();
    const result = await handlers["planning.scheduler.controlled-advance.run"](project, "change-1", request, undefined) as Record<string, unknown>;

    expect(mocks.planning.startPlanningSchedulerNextWorker).toHaveBeenCalledTimes(1);
    expect(mocks.recordSchedulerControlledStepEvidence).toHaveBeenCalledTimes(1);
    expect(result.result).toMatchObject({
      schedulerWorkerStart: { id: "scheduler-worker-start-1" },
    });
    expect(result.schedulerControlledStepEvidenceWarning).toContain("artifact store unavailable");
    expect(result.postStepHandoff).toMatchObject({
      status: "next-confirmation-candidate-ready",
      executedActionType: "planning.scheduler.worker.start-next",
      executionStarted: false,
    });
  });

  it("keeps post-step evaluation when visible readiness proof does not match current Workbench gate", async () => {
    mocks.resolveVisibleControlledSchedulerCurrentGate
      .mockResolvedValueOnce({
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: gateScope,
        },
        goalLoopNextStepPacketId: "goal-loop-packet-pre",
      })
      .mockResolvedValueOnce({
      warning: "Post-step readiness evidence was not prepared: visible Workbench gate does not match post-step evidence (target-mismatch).",
    });
    const handlers = buildSchedulerActionHandlers();
    const result = await handlers["planning.scheduler.controlled-advance.run"](project, "change-1", request, undefined) as Record<string, unknown>;

    expect(mocks.planning.startPlanningSchedulerNextWorker).toHaveBeenCalledTimes(1);
    expect(mocks.compileGoalLoopEvaluation).toHaveBeenCalledTimes(1);
    expect(mocks.resolveVisibleControlledSchedulerCurrentGate).toHaveBeenCalledWith(project, "change-1", "goal-loop-packet-post");
    expect(mocks.compileGoalLoopControllerPolicy).not.toHaveBeenCalled();
    expect(mocks.compileGoalLoopGateReadinessPreflight).not.toHaveBeenCalled();
    expect(mocks.auditHighImpactWorkflowAction).toHaveBeenCalledTimes(3);
    expect(result.postStepGoalLoopEvaluation).toMatchObject({
      goalLoopNextStepPacketId: "goal-loop-packet-post",
      executionStarted: false,
    });
    expect(result.postStepGoalLoopReadiness).toBeUndefined();
    expect(result.postStepGoalLoopReadinessWarning).toContain("target-mismatch");
    expect(result.postStepHandoff).toMatchObject({
      status: "next-confirmation-candidate-needs-review",
      executedActionType: "planning.scheduler.worker.start-next",
      needsReevaluation: true,
      executionStarted: false,
      nextConfirmationCandidate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        goalLoopNextStepPacketId: "goal-loop-packet-post",
        readinessEvidencePrepared: false,
        authorizationGranted: false,
        humanConfirmationStillRequired: true,
      },
    });
  });

  it("keeps concrete transition success when post-step readiness compile fails", async () => {
    mocks.compileGoalLoopControllerPolicy.mockRejectedValueOnce(new Error("policy stale"));
    const handlers = buildSchedulerActionHandlers();
    const result = await handlers["planning.scheduler.controlled-advance.run"](project, "change-1", request, undefined) as Record<string, unknown>;

    expect(mocks.planning.startPlanningSchedulerNextWorker).toHaveBeenCalledTimes(1);
    expect(mocks.compileGoalLoopEvaluation).toHaveBeenCalledTimes(1);
    expect(mocks.resolveVisibleControlledSchedulerCurrentGate).toHaveBeenCalledTimes(2);
    expect(mocks.compileGoalLoopGateReadinessPreflight).not.toHaveBeenCalled();
    expect(result.postStepGoalLoopEvaluation).toMatchObject({
      goalLoopNextStepPacketId: "goal-loop-packet-post",
      executionStarted: false,
    });
    expect(result.postStepGoalLoopReadinessWarning).toContain("policy stale");
    expect(result.result).toMatchObject({
      schedulerWorkerStart: { id: "scheduler-worker-start-1" },
    });
    expect(result.postStepHandoff).toMatchObject({
      status: "next-confirmation-candidate-needs-review",
      warning: expect.stringContaining("policy stale"),
      nextConfirmationCandidate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        readinessEvidencePrepared: false,
        authorizationGranted: false,
        humanConfirmationStillRequired: true,
      },
    });
  });
});

function buildPriorControlledStepForReconcile(overrides: Record<string, unknown> = {}) {
  const continuationScope = {
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerWorkerStartId: "scheduler-worker-start-1",
  };
  return {
    id: "scheduler-controlled-step-previous",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    status: "recorded",
    postStepEvidence: {
      goalLoopGateReadinessPreflightId: "goal-loop-preflight-post",
      currentGateActionType: "planning.scheduler.worker.reconcile-result",
      executionStarted: false,
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
    },
    controlledStepResultSummary: {
      resultKind: "schedulerWorkerStart",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerStartStatus: "started",
    },
    controlledLoopBoundaryResult: {
      authority: "scheduler-runtime-controlled-loop-boundary-result",
      status: "recorded",
      continuationReadinessStatus: "ready-for-human-gate",
      nextGateActionType: "planning.scheduler.worker.reconcile-result",
      nextGateTargetScopeSource: "fresh-current-gate-required",
      futureContinuationRequiresFreshEvidence: true,
      futureContinuationRequiresFreshCurrentGate: true,
      humanConfirmationStillRequired: true,
      stoppedAfterOneSchedulerTransition: true,
      approvedScopeOnly: true,
      evidenceRefs: ["scheduler-controlled-step-previous.md"],
      executionStarted: false,
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    },
    controlledLoopRuntimeBoundary: {
      authority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence",
      status: "recorded",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      continuationReadinessStatus: "ready-for-human-gate",
      nextGateActionType: "planning.scheduler.worker.reconcile-result",
      nextGateTargetScopeSource: "fresh-current-gate-required",
      priorTurnEvidence: true,
      freshEvidenceRequiredBeforeContinuation: true,
      freshCurrentGateRequiredBeforeContinuation: true,
      humanConfirmationStillRequired: true,
      stoppedAfterOneSchedulerTransition: true,
      approvedScopeOnly: true,
      evidenceRefs: ["scheduler-controlled-step-previous.md"],
      executionStarted: false,
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    },
    controlledLoopPostStepRoutingDecision: {
      authority: "scheduler-runtime-controlled-loop-post-step-routing-decision",
      routeFamily: "awaiting-human-gate",
      continuationReadinessStatus: "ready-for-human-gate",
      ownerModule: "scheduler-runtime",
      executedActionType: "planning.scheduler.worker.start-next",
      existingGateActionType: "planning.scheduler.worker.reconcile-result",
      gateTargetScopeSource: "fresh-current-gate-required",
      reason: "Prior step stopped with reconcile-result as the next human gate.",
      boundary: "Non-executing prior routing evidence.",
      readinessEvidencePrepared: true,
      needsReevaluation: false,
      freshEvidenceRequiredBeforeContinuation: true,
      freshCurrentGateRequiredBeforeContinuation: true,
      humanGateRequired: true,
      humanConfirmationStillRequired: true,
      priorTurnEvidence: true,
      evidenceRefs: ["scheduler-controlled-step-previous.md"],
      executionStarted: false,
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    },
    targetScope: continuationScope,
    artifact: "scheduler-controlled-step-previous.json",
    markdownArtifact: "scheduler-controlled-step-previous.md",
    createdAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}
