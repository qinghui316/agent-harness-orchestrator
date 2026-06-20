import { describe, expect, it } from "vitest";
import {
  buildSchedulerControlledLoopTurnRouteSummary,
  summarizeSchedulerControlledStepResult,
} from "../../src/scheduler-runtime/controlled-loop-turn.js";
import { buildSchedulerControlledLoopContinuationReadiness } from "../../src/scheduler-runtime/controlled-loop-continuation-readiness.js";
import { buildSchedulerControlledLoopTickSummary } from "../../src/scheduler-runtime/controlled-loop-tick.js";
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

  it("classifies continuation readiness without granting loop authority", () => {
    const route = buildSchedulerControlledLoopTurnRouteSummary({
      executedActionType: "planning.scheduler.worker.start-next",
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
    const tick = buildSchedulerControlledLoopTickSummary({
      executedActionType: "planning.scheduler.worker.start-next",
      preStepEvidence: {
        goalLoopDecisionId: "decision-pre",
        goalLoopIterationId: "iteration-pre",
        goalLoopContinuationBriefId: "brief-pre",
        goalLoopNextStepPacketId: "packet-pre",
        goalLoopControllerPolicyId: "controller-pre",
        goalLoopGateReadinessPreflightId: "preflight-pre",
      },
      postStepEvidence: {
        goalLoopDecisionId: "decision-post",
        goalLoopIterationId: "iteration-post",
        goalLoopContinuationBriefId: "brief-post",
        goalLoopNextStepPacketId: "packet-post",
        goalLoopControllerPolicyId: "controller-post",
        goalLoopGateReadinessPreflightId: "preflight-post",
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
      controlledLoopTurnRouteSummary: route,
      forbiddenAuthority,
    });

    const readiness = buildSchedulerControlledLoopContinuationReadiness({
      executedActionType: "planning.scheduler.worker.start-next",
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
      controlledLoopTurnRouteSummary: route,
      controlledLoopTick: tick,
      forbiddenAuthority,
      evidenceRefs: ["step.md"],
    });

    expect(readiness).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-continuation-readiness",
      status: "ready-for-human-gate",
      routePosture: "awaiting-human-gate",
      nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
      readinessEvidencePrepared: true,
      humanConfirmationStillRequired: true,
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
    });
  });

  it("keeps non-ready continuation postures fail-closed", () => {
    for (const [posture, expected] of [
      ["waiting", "waiting"],
      ["quality-routing", "quality-routing"],
      ["integration-barrier", "integration-barrier"],
      ["terminal-handoff", "terminal-handoff"],
      ["awaiting-human-gate", "needs-review"],
    ] as const) {
      const route = {
        version: "1.0",
        authority: "scheduler-runtime-controlled-loop-turn-route-summary",
        executedActionType: "planning.scheduler.worker.start-next",
        routePosture: posture,
        postStepStatus: "next-confirmation-candidate-needs-review",
        nextCandidateActionType: posture === "waiting" ? undefined : "planning.scheduler.worker.reconcile-result",
        humanGateRequired: posture !== "waiting",
        humanConfirmationStillRequired: true,
        needsReevaluation: expected === "needs-review",
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
      } as const;
      const tick = {
        version: "1.0",
        authority: "scheduler-runtime-controlled-loop-tick-contract-summary",
        observe: {
          status: "recorded",
          goalLoopDecisionId: "decision-pre",
          goalLoopIterationId: "iteration-pre",
          goalLoopContinuationBriefId: "brief-pre",
          goalLoopNextStepPacketId: "packet-pre",
          submittedActionType: "planning.scheduler.worker.start-next",
        },
        chooseCheck: {
          status: "recorded",
          goalLoopControllerPolicyId: "controller-pre",
          goalLoopGateReadinessPreflightId: "preflight-pre",
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
          executionStarted: false,
        },
        routeStop: {
          status: "next-confirmation-candidate-needs-review",
          stopReason: "one-confirmed-scheduler-transition-completed",
          routePosture: posture,
          nextCandidateActionType: route.nextCandidateActionType,
          humanGateRequired: route.humanGateRequired,
          humanConfirmationStillRequired: true,
          needsReevaluation: route.needsReevaluation,
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
      } as const;

      const readiness = buildSchedulerControlledLoopContinuationReadiness({
        executedActionType: "planning.scheduler.worker.start-next",
        postStepHandoff: {
          status: "next-confirmation-candidate-needs-review",
          stopReason: "one-confirmed-scheduler-transition-completed",
          executedActionType: "planning.scheduler.worker.start-next",
          needsReevaluation: route.needsReevaluation,
          nextConfirmationCandidate: route.nextCandidateActionType ? {
            actionType: route.nextCandidateActionType,
            readinessEvidencePrepared: false,
            executionStarted: false,
            authorizationGranted: false,
            humanConfirmationStillRequired: true,
          } : undefined,
          executionStarted: false,
          loopAuthorized: false,
          wholeWaveDispatchAuthorized: false,
          slotAllocatorAuthorized: false,
        },
        controlledLoopTurnRouteSummary: route,
        controlledLoopTick: tick,
        forbiddenAuthority,
      });

      expect(readiness.status).toBe(expected);
      expect(readiness.readinessEvidencePrepared).toBe(false);
      expect(readiness.executionStarted).toBe(false);
      expect(readiness.humanConfirmationStillRequired).toBe(true);
    }
  });
});
