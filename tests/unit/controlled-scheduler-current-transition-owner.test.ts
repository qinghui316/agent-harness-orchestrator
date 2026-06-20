import { describe, expect, it, vi } from "vitest";
import {
  chooseControlledSchedulerCurrentTransition,
  type ControlledSchedulerCurrentTransitionServices,
} from "../../src/scheduler-runtime/controlled-loop-current-transition.js";
import type { WorkflowActionScopeCarrier, WorkflowActionType } from "../../src/workflow-actions/registry.js";

const changeId = "change-1";
const gateScope = {
  changeId,
  schedulerRunId: "scheduler-run-1",
  schedulerClaimReservationId: "claim-reservation-1",
  reservationIntentId: "reservation-intent-1",
  claimIntentId: "claim-intent-1",
};
const request: WorkflowActionScopeCarrier = {
  actionType: "planning.scheduler.controlled-advance.run",
  goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
  ...gateScope,
};
const requestedConcreteGate = {
  ...request,
  actionType: "planning.scheduler.worker.start-next" as WorkflowActionType,
};

describe("controlled scheduler current transition owner", () => {
  it("chooses one non-executing current transition after fresh packet, visible gate, controller, and preflight match", async () => {
    const services = buildServices();

    const result = await chooseControlledSchedulerCurrentTransition({
      changeId,
      request,
      requestedConcreteGate,
      services,
    });

    expect(services.evaluateGoalLoopDecision).toHaveBeenCalledTimes(1);
    expect(services.resolveVisibleCurrentGate).toHaveBeenCalledWith("goal-loop-packet-pre");
    expect(services.auditHighImpactAction).toHaveBeenCalledTimes(2);
    expect(services.refreshGoalLoopControllerPolicy).toHaveBeenCalledTimes(1);
    expect(services.prepareGoalLoopGateReadinessPreflight).toHaveBeenCalledTimes(1);
    expect(result.controlledLoopCurrentTransitionChoice).toMatchObject({
      authority: "scheduler-runtime-current-transition-choice",
      status: "ready-for-dispatch",
      selectedActionType: "planning.scheduler.worker.start-next",
      submittedActionType: "planning.scheduler.controlled-advance.run",
      goalLoopNextStepPacketId: "goal-loop-packet-pre",
      goalLoopControllerPolicyId: "goal-loop-controller-pre",
      goalLoopGateReadinessPreflightId: "goal-loop-preflight-pre",
      executionStarted: false,
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
      authorizationGranted: false,
      loopAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      mergeAuthorized: false,
      remoteLandingAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
  });

  it("fails closed before Goal Loop evaluation when the submitted concrete gate lacks required targets", async () => {
    const services = buildServices();

    await expect(chooseControlledSchedulerCurrentTransition({
      changeId,
      request,
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.start-next",
        changeId,
        schedulerRunId: "scheduler-run-1",
      },
      services,
    })).rejects.toThrow(/concrete gate target is incomplete/);

    expect(services.evaluateGoalLoopDecision).not.toHaveBeenCalled();
    expect(services.auditHighImpactAction).not.toHaveBeenCalled();
  });

  it("fails closed before controller refresh when the fresh packet recommends a different scheduler gate", async () => {
    const services = buildServices({
      packetActionType: "planning.scheduler.worker.reconcile-result",
      packetScope: { changeId, schedulerRunId: "scheduler-run-1", schedulerWorkerStartId: "worker-start-1" },
    });

    await expect(chooseControlledSchedulerCurrentTransition({
      changeId,
      request,
      requestedConcreteGate,
      services,
    })).rejects.toThrow(/fresh Goal Loop packet no longer recommends/);

    expect(services.auditHighImpactAction).not.toHaveBeenCalled();
    expect(services.refreshGoalLoopControllerPolicy).not.toHaveBeenCalled();
  });

  it("fails closed before controller refresh when the visible current gate no longer proves the submitted gate", async () => {
    const services = buildServices({
      visibleGate: {
        warning: "current Workbench gate is stale",
      },
    });

    await expect(chooseControlledSchedulerCurrentTransition({
      changeId,
      request,
      requestedConcreteGate,
      services,
    })).rejects.toThrow(/visible current gate no longer proves/);

    expect(services.auditHighImpactAction).not.toHaveBeenCalled();
    expect(services.refreshGoalLoopControllerPolicy).not.toHaveBeenCalled();
  });

  it("fails closed before preflight when the controller no longer matches the submitted gate", async () => {
    const services = buildServices({
      controllerPolicy: {
        id: "goal-loop-controller-pre",
        verdict: "wait",
        gateStatus: "target-mismatch",
        currentGate: {
          actionType: "planning.scheduler.worker.reconcile-result",
          scope: { changeId, schedulerRunId: "scheduler-run-1", schedulerWorkerStartId: "worker-start-1" },
        },
      },
    });

    await expect(chooseControlledSchedulerCurrentTransition({
      changeId,
      request,
      requestedConcreteGate,
      services,
    })).rejects.toThrow(/fresh controller policy no longer matches/);

    expect(services.auditHighImpactAction).toHaveBeenCalledTimes(1);
    expect(services.prepareGoalLoopGateReadinessPreflight).not.toHaveBeenCalled();
  });

  it("fails closed before dispatch when the preflight is not a non-executing current-gate match", async () => {
    const services = buildServices({
      preflight: {
        id: "goal-loop-preflight-pre",
        concreteGateInvoked: true,
        toolPolicyAuthorizedConcreteGate: false,
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: gateScope,
        },
      },
    });

    await expect(chooseControlledSchedulerCurrentTransition({
      changeId,
      request,
      requestedConcreteGate,
      services,
    })).rejects.toThrow(/fresh preflight is not a non-executing match/);

    expect(services.auditHighImpactAction).toHaveBeenCalledTimes(2);
  });
});

function buildServices(options: {
  packetActionType?: string;
  packetScope?: Record<string, string | string[]>;
  visibleGate?: Awaited<ReturnType<ControlledSchedulerCurrentTransitionServices["resolveVisibleCurrentGate"]>>;
  controllerPolicy?: Record<string, unknown>;
  preflight?: Record<string, unknown>;
} = {}): ControlledSchedulerCurrentTransitionServices {
  const packetActionType = options.packetActionType ?? "planning.scheduler.worker.start-next";
  const packetScope = options.packetScope ?? gateScope;
  return {
    evaluateGoalLoopDecision: vi.fn(async () => ({
      goalLoopDecision: { id: "goal-loop-decision-pre" },
      goalLoopIteration: { id: "goal-loop-iteration-pre" },
      goalLoopContinuationBrief: { id: "goal-loop-brief-pre" },
      goalLoopNextStepPacket: {
        id: "goal-loop-packet-pre",
        recommendedAction: {
          actionType: packetActionType,
          scope: packetScope,
        },
      },
      executionStarted: false,
    } as unknown as Awaited<ReturnType<ControlledSchedulerCurrentTransitionServices["evaluateGoalLoopDecision"]>>)),
    refreshGoalLoopControllerPolicy: vi.fn(async () => ({
      goalLoopControllerPolicy: options.controllerPolicy ?? {
        id: "goal-loop-controller-pre",
        verdict: "recommend-existing-gate",
        gateStatus: "matches-current-gate",
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: gateScope,
        },
      },
      executionStarted: false,
    } as unknown as Awaited<ReturnType<ControlledSchedulerCurrentTransitionServices["refreshGoalLoopControllerPolicy"]>>)),
    prepareGoalLoopGateReadinessPreflight: vi.fn(async () => ({
      goalLoopGateReadinessPreflight: options.preflight ?? {
        id: "goal-loop-preflight-pre",
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: gateScope,
        },
      },
      executionStarted: false,
    } as unknown as Awaited<ReturnType<ControlledSchedulerCurrentTransitionServices["prepareGoalLoopGateReadinessPreflight"]>>)),
    auditHighImpactAction: vi.fn(async () => undefined),
    resolveVisibleCurrentGate: vi.fn(async () => options.visibleGate ?? {
      currentGate: {
        actionType: "planning.scheduler.worker.start-next",
        scope: gateScope,
      },
      goalLoopNextStepPacketId: "goal-loop-packet-pre",
    }),
  };
}
