import { describe, expect, it } from "vitest";
import {
  buildSchedulerControlledLoopTurnRouteSummary,
  summarizeSchedulerControlledStepResult,
} from "../../src/scheduler-runtime/controlled-loop-turn.js";
import type { SchedulerControlledStepForbiddenAuthority } from "../../src/scheduler-runtime/types.js";

const forbiddenAuthority: SchedulerControlledStepForbiddenAuthority = {
  loopAuthorized: false,
  wholeWaveDispatchAuthorized: false,
  slotAllocatorAuthorized: false,
  fullParallelExecutorAuthorized: false,
  sourceMutationAuthorized: false,
  applyAuthorized: false,
  closeAuthorized: false,
  mergeAuthorized: false,
  remoteLandingAuthorized: false,
  harnessEvolutionAuthorized: false,
};

describe("scheduler controlled loop turn route summary", () => {
  it("summarizes concrete scheduler results in scheduler-runtime ownership", () => {
    expect(summarizeSchedulerControlledStepResult({
      schedulerWorkerStart: {
        id: "scheduler-worker-start-1",
        status: "started",
        artifact: "worker-start.json",
        ignoredNested: { unsafe: true },
      },
    })).toEqual({
      resultKind: "schedulerWorkerStart",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerStartStatus: "started",
      resultArtifact: "worker-start.json",
    });
  });

  it("maps a refreshed next gate to the existing awaiting-human-gate posture", () => {
    const route = buildSchedulerControlledLoopTurnRouteSummary({
      executedActionType: "planning.scheduler.worker.start-next",
      controlledStepResultSummary: {
        resultKind: "schedulerWorkerStart",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerStartStatus: "started",
      },
      postStepEvidence: {
        goalLoopNextStepPacketId: "packet-post",
        recommendedActionType: "planning.scheduler.worker.reconcile-result",
        continuationState: "ready-for-existing-gate",
        goalLoopControllerPolicyId: "controller-post",
        goalLoopGateReadinessPreflightId: "preflight-post",
        currentGateActionType: "planning.scheduler.worker.reconcile-result",
        executionStarted: false,
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
      },
      postStepHandoff: {
        status: "next-confirmation-candidate-ready",
        stopReason: "one-confirmed-scheduler-transition-completed",
        executedActionType: "planning.scheduler.worker.start-next",
        needsReevaluation: false,
        nextConfirmationCandidate: {
          actionType: "planning.scheduler.worker.reconcile-result",
          goalLoopNextStepPacketId: "packet-post",
          goalLoopControllerPolicyId: "controller-post",
          goalLoopGateReadinessPreflightId: "preflight-post",
          readinessEvidencePrepared: true,
          executionStarted: false,
          authorizationGranted: false,
          humanConfirmationStillRequired: true,
        },
        executionStarted: false,
        loopAuthorized: false,
        wholeWaveDispatchAuthorized: false,
        slotAllocatorAuthorized: false,
      },
      forbiddenAuthority,
    });

    expect(route).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-turn-route-summary",
      routePosture: "awaiting-human-gate",
      resultKind: "schedulerWorkerStart",
      resultId: "scheduler-worker-start-1",
      resultStatus: "started",
      nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
      humanGateRequired: true,
      executionStarted: false,
      loopAuthorized: false,
      fullParallelExecutorAuthorized: false,
      sourceMutationAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
  });

  it("uses existing integration and quality postures without treating warnings as posture", () => {
    const integration = buildSchedulerControlledLoopTurnRouteSummary({
      executedActionType: "planning.scheduler.integration-candidate.compile",
      postStepEvidence: {
        recommendedActionType: "planning.scheduler.integration-check.run",
        continuationState: "ready-for-existing-gate",
        readinessWarning: "current Workbench gate needs review",
        executionStarted: false,
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
      },
      postStepHandoff: {
        status: "next-confirmation-candidate-needs-review",
        stopReason: "one-confirmed-scheduler-transition-completed",
        executedActionType: "planning.scheduler.integration-candidate.compile",
        needsReevaluation: true,
        warning: "current Workbench gate needs review",
        nextConfirmationCandidate: {
          actionType: "planning.scheduler.integration-check.run",
          readinessEvidencePrepared: false,
          executionStarted: false,
          authorizationGranted: false,
          humanConfirmationStillRequired: true,
        },
        executionStarted: false,
        loopAuthorized: false,
        wholeWaveDispatchAuthorized: false,
        slotAllocatorAuthorized: false,
      },
      forbiddenAuthority,
    });

    expect(integration.routePosture).toBe("integration-barrier");
    expect(integration.warning).toBe("current Workbench gate needs review");

    const quality = buildSchedulerControlledLoopTurnRouteSummary({
      executedActionType: "planning.scheduler.worker.validate-first",
      postStepEvidence: {
        recommendedActionType: "planning.scheduler.worker.rework-plan.compile",
        continuationState: "ready-for-existing-gate",
        executionStarted: false,
        concreteGateInvoked: false,
        toolPolicyAuthorizedConcreteGate: false,
      },
      postStepHandoff: {
        status: "next-step-evaluation-refreshed",
        stopReason: "one-confirmed-scheduler-transition-completed",
        executedActionType: "planning.scheduler.worker.validate-first",
        needsReevaluation: false,
        nextConfirmationCandidate: {
          actionType: "planning.scheduler.worker.rework-plan.compile",
          readinessEvidencePrepared: false,
          executionStarted: false,
          authorizationGranted: false,
          humanConfirmationStillRequired: true,
        },
        executionStarted: false,
        loopAuthorized: false,
        wholeWaveDispatchAuthorized: false,
        slotAllocatorAuthorized: false,
      },
      forbiddenAuthority,
    });

    expect(quality.routePosture).toBe("quality-routing");
  });
});
