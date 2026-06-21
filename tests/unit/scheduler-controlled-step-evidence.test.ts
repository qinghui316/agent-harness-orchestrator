import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordSchedulerControlledStepEvidence } from "../../src/scheduler-runtime/controlled-step-evidence.js";
import {
  readSchedulerRuntimeEvents,
  listSchedulerControlledStepEvidence,
  readLatestSchedulerControlledStepEvidenceProjection,
  readSchedulerControlledStepEvidence,
  readSchedulerControlledStepEvidenceProjection,
  schedulerControlledStepArtifactRefs,
  schedulerRuntimeArtifactRefs,
  writeSchedulerControlledStepEvidence,
  writeSchedulerRuntimeState,
} from "../../src/scheduler-runtime/repository.js";
import { schedulerRunArtifactRefs, writeSchedulerRun } from "../../src/workflow-scheduler/repository.js";
import { readLatestSchedulerControlledStepEvidenceSummary } from "../../src/workbench/workflow-projection.js";
import type { SchedulerControlledStepEvidence, SchedulerRuntimeState } from "../../src/scheduler-runtime/types.js";
import type { SchedulerRun } from "../../src/workflow-scheduler/types.js";
import type { ManagedProject, ResolvedMemory } from "../../src/types/index.js";

describe("Scheduler controlled step evidence", () => {
  let tempDir: string;
  let memory: ResolvedMemory;
  const changePath = "harness/changes/active/change-1";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-scheduler-controlled-step-"));
    memory = {
      memoryRoot: tempDir,
      artifactBase: "memory-root",
      supported: true,
      writable: true,
      projectId: "project-1",
    } as ResolvedMemory;
    await mkdir(join(tempDir, changePath), { recursive: true });
    await mkdir(join(tempDir, changePath, "reviews"), { recursive: true });
    await writeFile(join(tempDir, changePath, "change.json"), JSON.stringify({
      version: "1.0",
      id: "change-1",
      title: "Change 1",
      state: "active",
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
      closedAt: null,
      archivePath: null,
    }), "utf8");
    await writeFile(join(tempDir, changePath, "summary.md"), "# Change 1\n\n## Current Status\n\nActive.\n", "utf8");
    await writeFile(join(tempDir, changePath, "spec.md"), "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Test.\n", "utf8");
    await writeFile(join(tempDir, changePath, "plan.md"), "# Plan\n\nTest.\n", "utf8");
    await writeFile(join(tempDir, changePath, "tasks.md"), "# Tasks\n\n- [ ] T-001: Test.\n  - Covers: AC-001\n", "utf8");
    await writeFile(join(tempDir, changePath, "reviews", "review.md"), "Status: pending.\n", "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes, reads, renders, and lists scheduler-controlled step evidence scoped to a SchedulerRun", async () => {
    const refs = schedulerControlledStepArtifactRefs(memory, changePath, "step-1", "scheduler-run-1");
    const step = buildStep(refs.artifact, refs.markdownArtifact);

    await writeSchedulerControlledStepEvidence(memory, changePath, step);

    const read = await readSchedulerControlledStepEvidence(memory, changePath, "step-1", "scheduler-run-1");
    expect(read.executedActionType).toBe("planning.scheduler.worker.start-next");
    expect(read.forbiddenAuthority.loopAuthorized).toBe(false);
    expect(read.forbiddenAuthority.applyAuthorized).toBe(false);
    expect(read.humanConfirmationStillRequired).toBe(true);

    const markdown = await readFile(join(tempDir, changePath, "planning", "scheduler-runs", "scheduler-run-1", "scheduler-controlled-steps", "step-1.md"), "utf8");
    expect(markdown).toContain("One human-confirmed concrete scheduler transition completed.");
    expect(markdown).toContain("schedulerWorkerStartId: scheduler-worker-start-1");
    expect(markdown).toContain("Scheduler loop: not authorized.");

    await expect(readSchedulerControlledStepEvidence(memory, changePath, "step-1", "wrong-run")).rejects.toThrow();
    await expect(readSchedulerControlledStepEvidenceProjection(memory, changePath, "step-1", "wrong-run")).resolves.toBeNull();
    await expect(readLatestSchedulerControlledStepEvidenceProjection(memory, changePath, "scheduler-run-1")).resolves.toMatchObject({ id: "step-1" });
    await expect(readLatestSchedulerControlledStepEvidenceSummary(memory, changePath, "scheduler-run-1")).resolves.toMatchObject({
      id: "step-1",
      executedActionType: "planning.scheduler.worker.start-next",
      postStepStatus: "next-confirmation-candidate-ready",
      humanConfirmationStillRequired: true,
      loopAuthorized: false,
      wholeWaveDispatchAuthorized: false,
      slotAllocatorAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      controlledStepResultSummary: expect.objectContaining({
        schedulerWorkerStartId: "scheduler-worker-start-1",
      }),
    });
    await expect(listSchedulerControlledStepEvidence(memory, changePath, "scheduler-run-1")).resolves.toHaveLength(1);
  });

  it("records and reads a SchedulerRun-scoped controlled-step runtime event", async () => {
    await writeSchedulerRun(memory, changePath, buildSchedulerRun(memory, changePath));
    await writeSchedulerRuntimeState(memory, changePath, buildRuntimeState(memory, changePath));

    const recorded = await recordSchedulerControlledStepEvidence(project(tempDir), {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      executedActionType: "planning.scheduler.worker.start-next",
      targetScope: {
        actionType: "planning.scheduler.worker.start-next",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "reservation-1",
      },
      preStepEvidence: {
        goalLoopDecisionId: "decision-pre",
        goalLoopIterationId: "iteration-pre",
        goalLoopContinuationBriefId: "brief-pre",
        goalLoopNextStepPacketId: "packet-pre",
        goalLoopControllerPolicyId: "controller-pre",
        goalLoopGateReadinessPreflightId: "preflight-pre",
      },
      postStepGoalLoopEvaluation: {
        goalLoopDecisionId: "decision-post",
        goalLoopIterationId: "iteration-post",
        goalLoopContinuationBriefId: "brief-post",
        goalLoopNextStepPacketId: "packet-post",
        recommendedActionType: "planning.scheduler.worker.reconcile-result",
        continuationState: "ready-for-existing-gate",
        executionStarted: false,
      },
      postStepGoalLoopReadiness: {
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
      controlledLoopCurrentTransitionChoice: {
        version: "1.0",
        authority: "scheduler-runtime-current-transition-choice",
        status: "ready-for-dispatch",
        changeId: "change-1",
        selectedActionType: "planning.scheduler.worker.start-next",
        submittedActionType: "planning.scheduler.controlled-advance.run",
        currentGate: {
          actionType: "planning.scheduler.worker.start-next",
          scope: {
            changeId: "change-1",
            schedulerRunId: "scheduler-run-1",
            schedulerClaimReservationId: "reservation-1",
          },
        },
        goalLoopDecisionId: "decision-pre",
        goalLoopIterationId: "iteration-pre",
        goalLoopContinuationBriefId: "brief-pre",
        goalLoopNextStepPacketId: "packet-pre",
        goalLoopControllerPolicyId: "controller-pre",
        goalLoopGateReadinessPreflightId: "preflight-pre",
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
      controlledStepResultSummary: {
        resultKind: "schedulerWorkerStart",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerStartStatus: "started",
      },
    });

    const events = await readSchedulerRuntimeEvents(memory, changePath, "scheduler-run-1");
    expect(recorded.schedulerControlledStepEvidence.controlledStepResultSummary).toMatchObject({
      schedulerWorkerStartId: "scheduler-worker-start-1",
    });
    expect(recorded.schedulerControlledStepEvidence.controlledLoopTurnRouteSummary).toMatchObject({
      routePosture: "awaiting-human-gate",
      resultKind: "schedulerWorkerStart",
      resultId: "scheduler-worker-start-1",
      resultStatus: "started",
      nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
      humanConfirmationStillRequired: true,
      executionStarted: false,
      loopAuthorized: false,
      applyAuthorized: false,
      closeAuthorized: false,
      harnessEvolutionAuthorized: false,
    });
    expect(recorded.schedulerControlledStepEvidence.controlledLoopTick).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-tick-contract-summary",
      observe: {
        status: "recorded",
        goalLoopNextStepPacketId: "packet-pre",
        submittedActionType: "planning.scheduler.worker.start-next",
      },
      chooseCheck: {
        status: "recorded",
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
        goalLoopNextStepPacketId: "packet-post",
        executionStarted: false,
      },
      routeStop: {
        routePosture: "awaiting-human-gate",
        stopReason: "one-confirmed-scheduler-transition-completed",
        humanConfirmationStillRequired: true,
      },
      resultKind: "schedulerWorkerStart",
      resultId: "scheduler-worker-start-1",
      resultStatus: "started",
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
    expect(recorded.schedulerControlledStepEvidence.controlledLoopContinuationReadiness).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-continuation-readiness",
      status: "ready-for-human-gate",
      routePosture: "awaiting-human-gate",
      executedActionType: "planning.scheduler.worker.start-next",
      nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
      resultKind: "schedulerWorkerStart",
      resultId: "scheduler-worker-start-1",
      resultStatus: "started",
      readinessEvidencePrepared: true,
      needsReevaluation: false,
      humanGateRequired: true,
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
    expect(recorded.schedulerControlledStepEvidence.controlledLoopIteration).toMatchObject({
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
      humanConfirmationStillRequired: true,
      stoppedAfterOneSchedulerTransition: true,
      approvedScopeOnly: true,
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
    expect(recorded.schedulerControlledStepEvidence.controlledLoopStopSummary).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-stop-summary",
      executedActionType: "planning.scheduler.worker.start-next",
      stopReason: "one-confirmed-scheduler-transition-completed",
      routePosture: "awaiting-human-gate",
      continuationReadinessStatus: "ready-for-human-gate",
      nextGateActionType: "planning.scheduler.worker.reconcile-result",
      resultKind: "schedulerWorkerStart",
      resultId: "scheduler-worker-start-1",
      resultStatus: "started",
      humanGateRequired: true,
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
    expect(recorded.schedulerControlledStepEvidence.controlledLoopBoundaryResult).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-boundary-result",
      status: "recorded",
      selectedActionType: "planning.scheduler.worker.start-next",
      submittedActionType: "planning.scheduler.controlled-advance.run",
      dispatchedActionType: "planning.scheduler.worker.start-next",
      selectedGateScope: {
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "reservation-1",
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
      resultKind: "schedulerWorkerStart",
      resultId: "scheduler-worker-start-1",
      resultStatus: "started",
      readinessEvidencePrepared: true,
      needsReevaluation: false,
      humanGateRequired: true,
      humanConfirmationStillRequired: true,
      futureContinuationRequiresFreshEvidence: true,
      futureContinuationRequiresFreshCurrentGate: true,
      stoppedAfterOneSchedulerTransition: true,
      approvedScopeOnly: true,
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
    expect(recorded.schedulerControlledStepEvidence.controlledLoopRuntimeBoundary).toMatchObject({
      authority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence",
      status: "recorded",
      changeId: "change-1",
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
      resultKind: "schedulerWorkerStart",
      resultId: "scheduler-worker-start-1",
      resultStatus: "started",
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
    const recordedMarkdown = await readFile(
      join(tempDir, changePath, "planning", "scheduler-runs", "scheduler-run-1", "scheduler-controlled-steps", `${recorded.schedulerControlledStepEvidence.id}.md`),
      "utf8",
    );
    expect(recordedMarkdown).toContain("## Controlled Loop Iteration");
    expect(recordedMarkdown).toContain("- Authority: scheduler-runtime-controlled-loop-iteration-summary");
    expect(recordedMarkdown).toContain("- Execution from iteration summary: not authorized.");
    expect(recordedMarkdown).toContain("## Controlled Loop Stop Summary");
    expect(recordedMarkdown).toContain("- Authority: scheduler-runtime-controlled-loop-stop-summary");
    expect(recordedMarkdown).toContain("- Execution from stop summary: not authorized.");
    expect(recordedMarkdown).toContain("## Controlled Loop Boundary Result");
    expect(recordedMarkdown).toContain("- Authority: scheduler-runtime-controlled-loop-boundary-result");
    expect(recordedMarkdown).toContain("- Fresh evidence required before continuation: yes");
    expect(recordedMarkdown).toContain("- Execution from boundary result: not authorized.");
    expect(recordedMarkdown).toContain("## Controlled Loop Runtime Boundary Evidence");
    expect(recordedMarkdown).toContain("- Authority: scheduler-runtime-controlled-loop-runtime-boundary-evidence");
    expect(recordedMarkdown).toContain("- Prior-turn evidence: yes");
    expect(recordedMarkdown).toContain("- Execution from runtime-boundary evidence: not authorized.");
    await expect(readLatestSchedulerControlledStepEvidenceSummary(memory, changePath, "scheduler-run-1")).resolves.toMatchObject({
      controlledLoopTurnRouteSummary: {
        routePosture: "awaiting-human-gate",
        resultId: "scheduler-worker-start-1",
        resultStatus: "started",
      },
      controlledLoopTick: {
        authority: "scheduler-runtime-controlled-loop-tick-contract-summary",
        routeStop: {
          routePosture: "awaiting-human-gate",
        },
      },
      controlledLoopContinuationReadiness: {
        authority: "scheduler-runtime-controlled-loop-continuation-readiness",
        status: "ready-for-human-gate",
        nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
        humanConfirmationStillRequired: true,
      },
      controlledLoopIteration: {
        authority: "scheduler-runtime-controlled-loop-iteration-summary",
        status: "completed",
        routePosture: "awaiting-human-gate",
        continuationReadinessStatus: "ready-for-human-gate",
        nextCandidateActionType: "planning.scheduler.worker.reconcile-result",
        humanConfirmationStillRequired: true,
      },
      controlledLoopStopSummary: {
        authority: "scheduler-runtime-controlled-loop-stop-summary",
        routePosture: "awaiting-human-gate",
        continuationReadinessStatus: "ready-for-human-gate",
        nextGateActionType: "planning.scheduler.worker.reconcile-result",
        humanConfirmationStillRequired: true,
      },
      controlledLoopBoundaryResult: {
        authority: "scheduler-runtime-controlled-loop-boundary-result",
        boundaryPosture: "awaiting-human-gate",
        continuationReadinessStatus: "ready-for-human-gate",
        nextGateActionType: "planning.scheduler.worker.reconcile-result",
        nextGateTargetScopeSource: "fresh-current-gate-required",
        futureContinuationRequiresFreshEvidence: true,
        humanConfirmationStillRequired: true,
      },
      controlledLoopRuntimeBoundary: {
        authority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence",
        stopPosture: "awaiting-human-gate",
        continuationReadinessStatus: "ready-for-human-gate",
        nextGateActionType: "planning.scheduler.worker.reconcile-result",
        nextGateTargetScopeSource: "fresh-current-gate-required",
        priorTurnEvidence: true,
        freshEvidenceRequiredBeforeContinuation: true,
        loopAuthorized: false,
        sourceMutationAuthorized: false,
        applyAuthorized: false,
        closeAuthorized: false,
        harnessEvolutionAuthorized: false,
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "scheduler-runtime.controlled-step-recorded",
      schedulerRunId: "scheduler-run-1",
      changeId: "change-1",
      payload: {
        schedulerControlledStepEvidenceId: recorded.schedulerControlledStepEvidence.id,
        postStepStatus: "next-confirmation-candidate-ready",
        controlledLoopTickAuthority: "scheduler-runtime-controlled-loop-tick-contract-summary",
        controlledLoopTickRoutePosture: "awaiting-human-gate",
        controlledLoopTickStopReason: "one-confirmed-scheduler-transition-completed",
        controlledLoopIterationAuthority: "scheduler-runtime-controlled-loop-iteration-summary",
        controlledLoopIterationStatus: "completed",
        controlledLoopIterationRoutePosture: "awaiting-human-gate",
        controlledLoopIterationContinuationReadinessStatus: "ready-for-human-gate",
        controlledLoopStopSummaryAuthority: "scheduler-runtime-controlled-loop-stop-summary",
        controlledLoopStopSummaryRoutePosture: "awaiting-human-gate",
        controlledLoopStopSummaryContinuationReadinessStatus: "ready-for-human-gate",
        controlledLoopStopSummaryNextGateActionType: "planning.scheduler.worker.reconcile-result",
        controlledLoopBoundaryResultAuthority: "scheduler-runtime-controlled-loop-boundary-result",
        controlledLoopBoundaryResultStatus: "recorded",
        controlledLoopBoundaryResultPosture: "awaiting-human-gate",
        controlledLoopBoundaryResultNextGateActionType: "planning.scheduler.worker.reconcile-result",
        controlledLoopRuntimeBoundaryAuthority: "scheduler-runtime-controlled-loop-runtime-boundary-evidence",
        controlledLoopRuntimeBoundaryStatus: "recorded",
        controlledLoopRuntimeBoundaryStopPosture: "awaiting-human-gate",
        controlledLoopRuntimeBoundaryNextGateActionType: "planning.scheduler.worker.reconcile-result",
        futureContinuationRequiresFreshEvidence: true,
        humanConfirmationStillRequired: true,
      },
    });
  });

  it("fails closed when the evidence change scope does not match the selected Change", async () => {
    const refs = schedulerControlledStepArtifactRefs(memory, changePath, "step-2", "scheduler-run-1");
    const step = { ...buildStep(refs.artifact, refs.markdownArtifact), id: "step-2", changeId: "other-change", targetScope: { actionType: "planning.scheduler.worker.start-next", changeId: "other-change", schedulerRunId: "scheduler-run-1" } };

    await expect(writeSchedulerControlledStepEvidence(memory, changePath, step)).rejects.toThrow(/not scoped/);
  });

  it("does not project unscoped controlled-step evidence as the latest scoped SchedulerRun evidence", async () => {
    const refs = schedulerControlledStepArtifactRefs(memory, changePath, "step-unscoped");
    const step = {
      ...buildStep(refs.artifact, refs.markdownArtifact),
      id: "step-unscoped",
      schedulerRunId: undefined,
      targetScope: {
        actionType: "planning.scheduler.worker.start-next",
        changeId: "change-1",
      },
      artifactRefs: [refs.artifact, refs.markdownArtifact],
      artifact: refs.artifact,
      markdownArtifact: refs.markdownArtifact,
    };

    await writeSchedulerControlledStepEvidence(memory, changePath, step);

    await expect(readLatestSchedulerControlledStepEvidenceSummary(memory, changePath, "scheduler-run-1")).resolves.toBeNull();
    await expect(readLatestSchedulerControlledStepEvidenceSummary(memory, changePath)).resolves.toMatchObject({ id: "step-unscoped" });
  });

  it("fails before writing evidence when the requested SchedulerRun is missing", async () => {
    await expect(recordSchedulerControlledStepEvidence(project(tempDir), {
      changeId: "change-1",
      schedulerRunId: "missing-scheduler-run",
      executedActionType: "planning.scheduler.worker.start-next",
      targetScope: {
        actionType: "planning.scheduler.worker.start-next",
        changeId: "change-1",
        schedulerRunId: "missing-scheduler-run",
      },
      preStepEvidence: {
        goalLoopDecisionId: "decision-pre",
        goalLoopIterationId: "iteration-pre",
        goalLoopContinuationBriefId: "brief-pre",
        goalLoopNextStepPacketId: "packet-pre",
        goalLoopControllerPolicyId: "controller-pre",
        goalLoopGateReadinessPreflightId: "preflight-pre",
      },
      postStepHandoff: {
        status: "needs-reevaluation",
        stopReason: "post-step-refresh-warning",
        executedActionType: "planning.scheduler.worker.start-next",
        needsReevaluation: true,
        warning: "missing run should fail before writing",
        executionStarted: false,
        loopAuthorized: false,
        wholeWaveDispatchAuthorized: false,
        slotAllocatorAuthorized: false,
      },
    })).rejects.toThrow();

    expect(existsSync(join(tempDir, changePath, "planning", "scheduler-runs", "missing-scheduler-run", "scheduler-controlled-steps"))).toBe(false);
  });
});

function project(path: string): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

function buildStep(artifact: string, markdownArtifact: string): SchedulerControlledStepEvidence {
  return {
    version: "1.0",
    id: "step-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    status: "recorded",
    executedActionType: "planning.scheduler.worker.start-next",
    targetScope: {
      actionType: "planning.scheduler.worker.start-next",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
    },
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
    controlledStepResultSummary: {
      resultKind: "schedulerWorkerStart",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerStartStatus: "started",
    },
    executionStarted: true,
    stoppedAfterOneSchedulerTransition: true,
    humanConfirmationStillRequired: true,
    sourceMutated: false,
    forbiddenAuthority: {
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
    },
    artifactRefs: [artifact, markdownArtifact],
    artifact,
    markdownArtifact,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
}

function buildSchedulerRun(memory: ResolvedMemory, changePath: string): SchedulerRun {
  const refs = schedulerRunArtifactRefs(memory, changePath, "scheduler-run-1");
  return {
    version: "1.0",
    id: "scheduler-run-1",
    changeId: "change-1",
    status: "prepared",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId: "scheduler-contract-1",
    schedulerDispatchDryRunId: "scheduler-dispatch-dry-run-1",
    schedulerWorkerPlanId: "scheduler-worker-plan-1",
    schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-plan-1",
    schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    decompositionPlanId: "decomposition-plan-1",
    readinessManifestId: "readiness-manifest-1",
    claimIntentCount: 1,
    plannedSlotDemand: 1,
    maxPlannedWaveWidth: 1,
    blockedCount: 0,
    humanConfirmed: true,
    futureToolPolicyGateRequired: true,
    futureHumanGateRequired: true,
    sourceArtifactHashes: {},
    artifactRefs: [refs.artifact, refs.markdownArtifact, refs.journalArtifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    journalArtifact: refs.journalArtifact,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
}

function buildRuntimeState(memory: ResolvedMemory, changePath: string): SchedulerRuntimeState {
  const refs = schedulerRuntimeArtifactRefs(memory, changePath, "scheduler-run-1");
  return {
    version: "1.0",
    id: "scheduler-runtime-state-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1",
    status: "initialized",
    schedulerContractId: "scheduler-contract-1",
    schedulerDispatchDryRunId: "scheduler-dispatch-dry-run-1",
    schedulerWorkerPlanId: "scheduler-worker-plan-1",
    schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-plan-1",
    schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    decompositionPlanId: "decomposition-plan-1",
    readinessManifestId: "readiness-manifest-1",
    claimIntents: [],
    waves: [],
    plannedSlotDemand: 1,
    maxPlannedWaveWidth: 1,
    blockedCount: 0,
    sourceArtifactHashes: {},
    artifactRefs: [refs.artifact, refs.eventsArtifact],
    artifact: refs.artifact,
    eventsArtifact: refs.eventsArtifact,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
}
