import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedProject } from "../../src/types/index.js";

const mocks = vi.hoisted(() => ({
  resolveProjectMemory: vi.fn(),
  resolveRunnableChangeTarget: vi.fn(),
  readLatestSchedulerControlledStepEvidenceProjection: vi.fn(),
  readGoalLoopGateReadinessPreflight: vi.fn(),
  assertControlledSchedulerContinuationGuard: vi.fn(),
  compileGoalLoopEvaluation: vi.fn(),
  compileGoalLoopControllerPolicy: vi.fn(),
  compileGoalLoopGateReadinessPreflight: vi.fn(),
  recordSchedulerControlledStepEvidence: vi.fn(),
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

vi.mock("../../src/goal-loop/manager.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/goal-loop/manager.js")>()),
  compileGoalLoopEvaluation: mocks.compileGoalLoopEvaluation,
  compileGoalLoopControllerPolicy: mocks.compileGoalLoopControllerPolicy,
  compileGoalLoopGateReadinessPreflight: mocks.compileGoalLoopGateReadinessPreflight,
}));

vi.mock("../../src/workflow-scheduler/controlled-step.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/workflow-scheduler/controlled-step.js")>()),
  assertControlledSchedulerContinuationGuard: mocks.assertControlledSchedulerContinuationGuard,
}));

vi.mock("../../src/scheduler-runtime/controlled-step-evidence.js", () => ({
  recordSchedulerControlledStepEvidence: mocks.recordSchedulerControlledStepEvidence,
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
    mocks.compileGoalLoopEvaluation.mockReset();
    mocks.compileGoalLoopControllerPolicy.mockReset();
    mocks.compileGoalLoopGateReadinessPreflight.mockReset();
    mocks.recordSchedulerControlledStepEvidence.mockReset();

    mocks.resolveProjectMemory.mockResolvedValue({ memoryRoot: "memory-root", writable: true });
    mocks.resolveRunnableChangeTarget.mockResolvedValue({
      status: {
        activeChanges: [{ name: "change-1", path: "harness/changes/active/change-1" }],
      },
    });
    mocks.readLatestSchedulerControlledStepEvidenceProjection.mockResolvedValue(null);
    mocks.compileGoalLoopEvaluation.mockResolvedValue({
      goalLoopDecision: { id: "decision-post" },
      goalLoopIteration: { id: "iteration-post", continuationState: "ready-for-existing-gate" },
      goalLoopContinuationBrief: { id: "brief-post" },
      goalLoopNextStepPacket: {
        id: "packet-post",
        recommendedAction: {
          actionType: "planning.scheduler.worker.reconcile-result",
          scope: {
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerWorkerStartId: "worker-start-1",
          },
        },
      },
    });
    mocks.compileGoalLoopControllerPolicy.mockResolvedValue({
      id: "controller-post",
      verdict: "recommend-existing-gate",
      gateStatus: "matches-current-gate",
      currentGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        scope: {
          changeId: "change-1",
          schedulerRunId: "scheduler-run-1",
          schedulerWorkerStartId: "worker-start-1",
        },
      },
    });
    mocks.compileGoalLoopGateReadinessPreflight.mockResolvedValue({
      id: "preflight-post",
      currentGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        scope: {
          changeId: "change-1",
          schedulerRunId: "scheduler-run-1",
          schedulerWorkerStartId: "worker-start-1",
        },
      },
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
    });
    mocks.recordSchedulerControlledStepEvidence.mockResolvedValue({
      schedulerControlledStepEvidence: {
        id: "scheduler-controlled-step-1",
        artifact: "scheduler-controlled-step-1.json",
        markdownArtifact: "scheduler-controlled-step-1.md",
        status: "recorded",
        executedActionType: "planning.scheduler.worker.start-next",
        humanConfirmationStillRequired: true,
        controlledLoopTick: { authority: "scheduler-runtime-controlled-loop-tick-contract-summary" },
        controlledLoopIteration: { authority: "scheduler-runtime-controlled-loop-iteration-summary" },
        controlledLoopStopSummary: { authority: "scheduler-runtime-controlled-loop-stop-summary" },
        controlledLoopBoundaryResult: {
          authority: "scheduler-runtime-controlled-loop-boundary-result",
          futureContinuationRequiresFreshEvidence: true,
        },
        controlledLoopCurrentTransitionChoice: { authority: "scheduler-runtime-current-transition-choice" },
      },
    });
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

  it("dispatches one approved scheduler gate, records boundary evidence, and stops", async () => {
    const submittedScope = {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
    };
    const currentGate = {
      actionType: "planning.scheduler.worker.start-next" as const,
      scope: submittedScope,
    };
    const services = {
      evaluateGoalLoopDecision: vi.fn().mockResolvedValue({
        goalLoopDecision: { id: "decision-pre" },
        goalLoopIteration: { id: "iteration-pre" },
        goalLoopContinuationBrief: { id: "brief-pre" },
        goalLoopNextStepPacket: {
          id: "packet-pre",
          recommendedAction: {
            actionType: "planning.scheduler.worker.start-next",
            scope: submittedScope,
          },
        },
        executionStarted: false,
      }),
      refreshGoalLoopControllerPolicy: vi.fn().mockResolvedValue({
        goalLoopControllerPolicy: {
          id: "controller-pre",
          verdict: "recommend-existing-gate",
          gateStatus: "matches-current-gate",
          currentGate,
        },
        executionStarted: false,
      }),
      prepareGoalLoopGateReadinessPreflight: vi.fn().mockResolvedValue({
        goalLoopGateReadinessPreflight: {
          id: "preflight-pre",
          currentGate,
          concreteGateInvoked: false,
          toolPolicyAuthorizedConcreteGate: false,
        },
        executionStarted: false,
      }),
      auditHighImpactAction: vi.fn(),
      dispatchControlledStep: vi.fn().mockResolvedValue({
        controlledStep: { id: "controlled-step-wrapper-1" },
        result: {
          resultKind: "schedulerWorkerStart",
          schedulerWorkerStartId: "worker-start-1",
          schedulerWorkerStartStatus: "started",
        },
      }),
      resolveVisibleCurrentGate: vi.fn().mockImplementation(async (goalLoopNextStepPacketId: string) => {
        if (goalLoopNextStepPacketId === "packet-pre") {
          return { currentGate, goalLoopNextStepPacketId };
        }
        return {
          currentGate: {
            actionType: "planning.scheduler.worker.reconcile-result",
            scope: {
              changeId: "change-1",
              schedulerRunId: "scheduler-run-1",
              schedulerWorkerStartId: "worker-start-1",
            },
          },
          goalLoopNextStepPacketId,
        };
      }),
    };

    const result = await runControlledSchedulerLoopStep(project, "change-1", {
      actionType: "planning.scheduler.controlled-advance.run",
      ...submittedScope,
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
    }, services);

    expect(services.dispatchControlledStep).toHaveBeenCalledTimes(1);
    expect(services.dispatchControlledStep).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "planning.scheduler.controlled-step.run",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "claim-reservation-1",
    }));
    expect(mocks.recordSchedulerControlledStepEvidence).toHaveBeenCalledTimes(1);
    expect(mocks.recordSchedulerControlledStepEvidence).toHaveBeenCalledWith(project, expect.objectContaining({
      executedActionType: "planning.scheduler.worker.start-next",
      controlledLoopCurrentTransitionChoice: expect.objectContaining({
        authority: "scheduler-runtime-current-transition-choice",
        selectedActionType: "planning.scheduler.worker.start-next",
        submittedActionType: "planning.scheduler.controlled-advance.run",
      }),
    }));
    expect(result).toMatchObject({
      schedulerControlledStepEvidence: {
        controlledLoopBoundaryResult: {
          authority: "scheduler-runtime-controlled-loop-boundary-result",
          futureContinuationRequiresFreshEvidence: true,
        },
      },
    });
  });
});
