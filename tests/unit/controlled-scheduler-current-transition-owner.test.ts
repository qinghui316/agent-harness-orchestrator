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

  it("passes prior post-step routing support into the current preflight when continuation evidence is available", async () => {
    const services = buildServices();

    await chooseControlledSchedulerCurrentTransition({
      changeId,
      request,
      requestedConcreteGate,
      services,
      postStepRoutingSupportSource: buildPostStepRoutingSupportSource(),
    });

    expect(services.prepareGoalLoopGateReadinessPreflight).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "planning.goal-loop.gate-readiness.prepare",
      goalLoopNextStepPacketId: "goal-loop-packet-pre",
      goalLoopControllerPolicyId: "goal-loop-controller-pre",
      goalLoopCurrentGateActionType: "planning.scheduler.worker.start-next",
    }), expect.objectContaining({
      sourceGoalLoopGateReadinessPreflightId: "previous-post-preflight",
      controlledSchedulerPostStepRoutingSupport: expect.objectContaining({
        authority: "non-executing-controlled-scheduler-post-step-routing-preflight-support",
        sourceSchedulerControlledStepEvidenceId: "previous-controlled-step",
        sourceSchedulerControlledStepArtifact: "previous-controlled-step.json",
        sourceSchedulerControlledStepMarkdownArtifact: "previous-controlled-step.md",
        sourceGoalLoopNextStepPacketId: "goal-loop-packet-pre",
        sourceGoalLoopControllerPolicyId: "goal-loop-controller-pre",
        sourceGoalLoopGateReadinessPreflightId: "previous-post-preflight",
        existingGateActionType: "planning.scheduler.worker.start-next",
        continuationDecisionStatus: "ready-for-human-gate",
        routingReadinessStatus: "ready-for-human-gate",
        needsReevaluation: false,
        currentGateScope: gateScope,
        loopAuthorized: false,
        sourceMutationAuthorized: false,
        applyAuthorized: false,
        closeAuthorized: false,
        executionStarted: false,
      }),
    }));
  });

  it("accepts prior post-step routing support when the fresh current gate adds compatible optional targets", async () => {
    const extendedGateScope = {
      ...gateScope,
      worktreeId: "worktree-1",
    };
    const extendedRequest = {
      ...request,
      ...extendedGateScope,
    };
    const services = buildServices({
      packetScope: extendedGateScope,
      visibleGate: {
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: extendedGateScope,
        },
        goalLoopNextStepPacketId: "goal-loop-packet-pre",
      },
      controllerPolicy: {
        id: "goal-loop-controller-pre",
        verdict: "recommend-existing-gate",
        gateStatus: "matches-current-gate",
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: extendedGateScope,
        },
      },
      preflight: {
        id: "goal-loop-preflight-pre",
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: extendedGateScope,
        },
      },
    });

    await chooseControlledSchedulerCurrentTransition({
      changeId,
      request: extendedRequest,
      requestedConcreteGate: {
        ...extendedRequest,
        actionType: "planning.scheduler.worker.start-next",
      },
      services,
      postStepRoutingSupportSource: buildPostStepRoutingSupportSource(),
    });

    expect(services.prepareGoalLoopGateReadinessPreflight).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      controlledSchedulerPostStepRoutingSupport: expect.objectContaining({
        existingGateActionType: "planning.scheduler.worker.start-next",
        currentGateScope: extendedGateScope,
        executionStarted: false,
        loopAuthorized: false,
        sourceMutationAuthorized: false,
      }),
    }));
  });

  it("fails closed before preflight dispatch when guarded prior routing needs reevaluation", async () => {
    const services = buildServices();

    await expect(chooseControlledSchedulerCurrentTransition({
      changeId,
      request,
      requestedConcreteGate,
      services,
      postStepRoutingSupportSource: buildPostStepRoutingSupportSource({
        routing: {
          needsReevaluation: true,
        },
      }),
    })).rejects.toThrow(/requires fresh routing evidence/);

    expect(services.prepareGoalLoopGateReadinessPreflight).not.toHaveBeenCalled();
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

function buildPostStepRoutingSupportSource(overrides: {
  routing?: Record<string, unknown>;
  previousStep?: Record<string, unknown>;
} = {}) {
  return {
    previousStep: {
      id: "previous-controlled-step",
      changeId,
      schedulerRunId: "scheduler-run-1",
      status: "recorded",
      postStepEvidence: {
        goalLoopGateReadinessPreflightId: "previous-post-preflight",
        currentGateActionType: "planning.scheduler.worker.start-next",
        executionStarted: false,
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
      },
      controlledLoopPostStepRoutingDecision: {
        authority: "scheduler-runtime-controlled-loop-post-step-routing-decision",
        routeFamily: "awaiting-human-gate",
        continuationReadinessStatus: "ready-for-human-gate",
        ownerModule: "scheduler-runtime",
        executedActionType: "planning.scheduler.worker.start-first",
        existingGateActionType: "planning.scheduler.worker.start-next",
        gateTargetScopeSource: "fresh-current-gate-required",
        reason: "Prior step stopped with a ready next human gate.",
        boundary: "Non-executing prior routing evidence.",
        readinessEvidencePrepared: true,
        needsReevaluation: false,
        freshEvidenceRequiredBeforeContinuation: true,
        freshCurrentGateRequiredBeforeContinuation: true,
        humanGateRequired: true,
        humanConfirmationStillRequired: true,
        priorTurnEvidence: true,
        evidenceRefs: ["previous-controlled-step.md"],
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
        ...overrides.routing,
      },
      artifact: "previous-controlled-step.json",
      markdownArtifact: "previous-controlled-step.md",
      createdAt: "2026-06-21T00:00:00.000Z",
      ...overrides.previousStep,
    },
    previousGateReadinessPreflight: {
      id: "previous-post-preflight",
      changeId,
      currentGate: {
        actionType: "planning.scheduler.worker.start-next",
        scope: gateScope,
      },
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
      executionStarted: false,
      artifact: "previous-post-preflight.json",
      markdownArtifact: "previous-post-preflight.md",
    },
    continuationDecision: {
      authority: "scheduler-runtime-controlled-loop-continuation-decision",
      status: "ready-for-human-gate",
      changeId,
      nextGateActionType: "planning.scheduler.worker.start-next",
      reason: "Fresh current gate matches prior routing.",
      boundary: "Continuation remains human-gated.",
      evidenceRefs: ["previous-controlled-step.md"],
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
  } as never;
}
