import { describe, expect, it } from "vitest";
import { assertControlledSchedulerBoundaryContinuation } from "../../src/scheduler-runtime/controlled-loop-boundary-continuation.js";
import type { SchedulerControlledStepEvidence } from "../../src/scheduler-runtime/types.js";
import type { WorkflowActionScopeCarrier } from "../../src/workflow-actions/registry.js";
import type { ControlledSchedulerContinuationPreflightEvidence } from "../../src/workflow-scheduler/controlled-step.js";

const requestedGate: WorkflowActionScopeCarrier = {
  actionType: "planning.scheduler.worker.reconcile-result",
  changeId: "change-1",
  schedulerRunId: "scheduler-run-1",
  schedulerWorkerStartId: "worker-start-1",
};

const preflight: ControlledSchedulerContinuationPreflightEvidence = {
  id: "preflight-post",
  changeId: "change-1",
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
  executionStarted: false,
};

describe("controlled scheduler boundary continuation guard", () => {
  it("allows bootstrap when no prior controlled step exists", () => {
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: requestedGate,
      previousStep: null,
      previousGateReadinessPreflight: null,
    })).not.toThrow();
  });

  it("accepts warning-free boundary evidence while ignoring prior selected gate scope as next scope", () => {
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: requestedGate,
      previousStep: step(),
      previousGateReadinessPreflight: preflight,
    })).not.toThrow();
  });

  it("accepts integration-barrier boundary evidence when it still names a concrete fresh human gate", () => {
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: requestedGate,
      previousStep: step({
        boundaryPatch: {
          boundaryPosture: "integration-barrier",
          continuationReadinessStatus: "integration-barrier",
        },
      }),
      previousGateReadinessPreflight: preflight,
    })).not.toThrow();
  });

  it("accepts recoverable post-step readiness warnings after fresh matching preflight evidence is available", () => {
    const warning = "Post-step readiness evidence was not prepared: current Workbench gate is not a controlled scheduler concrete action.";
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: requestedGate,
      previousStep: step({
        boundaryPatch: {
          status: "recorded-with-warning",
          continuationReadinessStatus: "needs-review",
          readinessEvidencePrepared: false,
          needsReevaluation: true,
          warning,
        },
        runtimePatch: {
          status: "recorded-with-warning",
          continuationReadinessStatus: "needs-review",
          readinessEvidencePrepared: false,
          needsReevaluation: true,
          warning,
        },
      }),
      previousGateReadinessPreflight: preflight,
    })).not.toThrow();
  });

  it("accepts recoverable post-step readiness warnings even when the prior step was waiting on a non-scheduler gate", () => {
    const warning = "Post-step readiness evidence was not prepared: current Workbench gate is not a controlled scheduler concrete action.";
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: requestedGate,
      previousStep: step({
        boundaryPatch: {
          status: "recorded-with-warning",
          continuationReadinessStatus: "waiting",
          nextGateActionType: undefined,
          nextGateTargetScopeSource: undefined,
          readinessEvidencePrepared: false,
          needsReevaluation: true,
          warning,
        },
        runtimePatch: {
          status: "recorded-with-warning",
          continuationReadinessStatus: "waiting",
          nextGateActionType: undefined,
          nextGateTargetScopeSource: "none",
          readinessEvidencePrepared: false,
          needsReevaluation: true,
          warning,
        },
      }),
      previousGateReadinessPreflight: preflight,
    })).not.toThrow();
  });

  it("fails closed when prior boundary evidence is missing", () => {
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: requestedGate,
      previousStep: step({ controlledLoopBoundaryResult: undefined }),
      previousGateReadinessPreflight: preflight,
    })).toThrow(/requires prior controlled loop boundary result/);
  });

  it("fails closed when prior runtime-boundary evidence is missing", () => {
    const previousStep = step();
    previousStep.controlledLoopRuntimeBoundary = undefined;
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: requestedGate,
      previousStep,
      previousGateReadinessPreflight: preflight,
    })).toThrow(/runtime-boundary evidence/);
  });

  it.each([
    ["warning status", { status: "recorded-with-warning" }],
    ["warning text", { warning: "post-step warning" }],
    ["fresh evidence not required", { futureContinuationRequiresFreshEvidence: false }],
    ["fresh current gate not required", { futureContinuationRequiresFreshCurrentGate: false }],
    ["human confirmation not required", { humanConfirmationStillRequired: false }],
    ["wrong target scope source", { nextGateTargetScopeSource: undefined }],
    ["not ready", { continuationReadinessStatus: "needs-review" }],
    ["forbidden loop authority", { loopAuthorized: true }],
  ])("fails closed for %s", (_label, boundaryPatch) => {
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: requestedGate,
      previousStep: step({ boundaryPatch }),
      previousGateReadinessPreflight: preflight,
    })).toThrow(/boundary continuation guard/);
  });

  it("fails closed for cross-change prior evidence", () => {
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: requestedGate,
      previousStep: step({ changeId: "other-change" }),
      previousGateReadinessPreflight: preflight,
    })).toThrow(/different Change/);
  });

  it("fails closed when the submitted gate no longer matches the boundary next gate", () => {
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: {
        ...requestedGate,
        actionType: "planning.scheduler.integration-check.run",
        schedulerIntegrationCheckHandoffId: "handoff-1",
      },
      previousStep: step(),
      previousGateReadinessPreflight: preflight,
    })).toThrow(/submitted gate no longer matches/);
  });

  it("fails closed when the submitted target scope no longer matches the prior preflight", () => {
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: {
        ...requestedGate,
        schedulerWorkerStartId: "worker-start-stale",
      },
      previousStep: step(),
      previousGateReadinessPreflight: preflight,
    })).toThrow(/scope no longer matches/);
  });

  it("fails closed when required submitted target ids are missing", () => {
    expect(() => assertControlledSchedulerBoundaryContinuation({
      changeId: "change-1",
      requestedConcreteGate: {
        actionType: "planning.scheduler.worker.reconcile-result",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
      },
      previousStep: step(),
      previousGateReadinessPreflight: preflight,
    })).toThrow(/target is incomplete/);
  });
});

function step(input: {
  changeId?: string;
  controlledLoopBoundaryResult?: SchedulerControlledStepEvidence["controlledLoopBoundaryResult"];
  boundaryPatch?: Record<string, unknown>;
  runtimePatch?: Record<string, unknown>;
} = {}): SchedulerControlledStepEvidence {
  const changeId = input.changeId ?? "change-1";
  const controlledLoopBoundaryResult = input.controlledLoopBoundaryResult === undefined && !("controlledLoopBoundaryResult" in input)
    ? {
        version: "1.0",
        authority: "scheduler-runtime-controlled-loop-boundary-result",
        status: "recorded",
        selectedActionType: "planning.scheduler.worker.start-next",
        submittedActionType: "planning.scheduler.controlled-advance.run",
        dispatchedActionType: "planning.scheduler.worker.start-next",
        selectedGateScope: {
          changeId,
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "prior-reservation",
        },
        observeStatus: "recorded",
        chooseCheckStatus: "recorded",
        dispatchStatus: "completed",
        reconcileStatus: "recorded",
        boundaryPosture: "awaiting-human-gate",
        continuationReadinessStatus: "ready-for-human-gate",
        stopReason: "one-confirmed-scheduler-transition-completed",
        nextGateActionType: "planning.scheduler.worker.reconcile-result",
        nextGateTargetScopeSource: "fresh-current-gate-required",
        readinessEvidencePrepared: true,
        needsReevaluation: false,
        humanGateRequired: true,
        humanConfirmationStillRequired: true,
        futureContinuationRequiresFreshEvidence: true,
        futureContinuationRequiresFreshCurrentGate: true,
        stoppedAfterOneSchedulerTransition: true,
        approvedScopeOnly: true,
        boundary: "prior-turn evidence",
        evidenceRefs: ["scheduler-controlled-step.md"],
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
        ...(input.boundaryPatch ?? {}),
      } as SchedulerControlledStepEvidence["controlledLoopBoundaryResult"]
    : input.controlledLoopBoundaryResult;
  const controlledLoopRuntimeBoundary: SchedulerControlledStepEvidence["controlledLoopRuntimeBoundary"] = controlledLoopBoundaryResult
    ? {
        version: "1.0",
        authority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence",
        status: "recorded",
        changeId,
        schedulerRunId: "scheduler-run-1",
        submittedActionType: "planning.scheduler.controlled-advance.run",
        selectedActionType: "planning.scheduler.worker.start-next",
        dispatchedActionType: "planning.scheduler.worker.start-next",
        observeStatus: "recorded",
        chooseStatus: "recorded",
        humanGateStatus: "confirmed-current-step",
        dispatchStatus: "completed",
        reconcileStatus: "recorded",
        stopStatus: "next-confirmation-candidate-ready",
        stopPosture: "awaiting-human-gate",
        stopReason: "one-confirmed-scheduler-transition-completed",
        continuationReadinessStatus: "ready-for-human-gate",
        nextGateActionType: "planning.scheduler.worker.reconcile-result",
        nextGateTargetScopeSource: "fresh-current-gate-required",
        observedGoalLoopNextStepPacketId: "packet-pre",
        selectedGoalLoopGateReadinessPreflightId: "preflight-pre",
        reconciledGoalLoopNextStepPacketId: "packet-post",
        readinessEvidencePrepared: true,
        needsReevaluation: false,
        humanConfirmationStillRequired: true,
        stoppedAfterOneSchedulerTransition: true,
        approvedScopeOnly: true,
        priorTurnEvidence: true,
        freshEvidenceRequiredBeforeContinuation: true,
        freshCurrentGateRequiredBeforeContinuation: true,
        boundary: "runtime-boundary evidence",
        evidenceRefs: ["scheduler-controlled-step.md"],
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
        ...(input.runtimePatch ?? {}),
      }
    : undefined;

  return {
    id: "scheduler-controlled-step-1",
    changeId,
    schedulerRunId: "scheduler-run-1",
    status: "recorded",
    executedActionType: "planning.scheduler.worker.start-next",
    targetScope: {
      actionType: "planning.scheduler.worker.start-next",
      changeId,
      schedulerRunId: "scheduler-run-1",
    },
    postStepEvidence: {
      goalLoopGateReadinessPreflightId: "preflight-post",
      executionStarted: false,
      concreteGateInvoked: false,
      toolPolicyAuthorizedConcreteGate: false,
    },
    controlledLoopBoundaryResult,
    controlledLoopRuntimeBoundary,
    executionStarted: true,
    stoppedAfterOneSchedulerTransition: true,
    humanConfirmationStillRequired: true,
    sourceMutated: false,
    forbiddenAuthority: {
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
    artifactRefs: [],
    artifact: "scheduler-controlled-step.json",
    markdownArtifact: "scheduler-controlled-step.md",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  } as SchedulerControlledStepEvidence;
}
