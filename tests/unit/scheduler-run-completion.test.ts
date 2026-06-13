import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const runtimeState = {
    id: "scheduler-runtime-state-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1",
    status: "initialized",
    lastReconcileSnapshotId: "snapshot-1",
    lastClaimReservationId: "reservation-1",
    lastClaimReservationSnapshotId: "snapshot-1",
    sourceArtifactHashes: { "spec.md": "hash-spec" },
  };
  const run = {
    id: "scheduler-run-1",
    changeId: "change-1",
    status: "prepared",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
  };
  const outcome = {
    version: "1.0",
    id: "outcome-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1",
    status: "applied",
    schedulerRuntimeStateId: "scheduler-runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerClaimReservationId: "reservation-1",
    schedulerIntegrationCandidateId: "candidate-1",
    schedulerIntegrationCheckHandoffId: "handoff-1",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    integrationCheckId: "check-1",
    integrationCheckStatus: "applied",
    outcomeReason: "IntegrationCheck applied.",
    readyWorktreeIds: ["wt-a", "wt-b"],
    resultTargetWorktreeIds: ["wt-a", "wt-b"],
    sourceArtifactHashes: { "spec.md": "hash-spec" },
    targets: [
      { worktreeId: "wt-a", changeId: "change-1", diffHash: "diff-a", diffStat: "1 file", sourceHead: "head-1", applied: true },
      { worktreeId: "wt-b", changeId: "change-1", diffHash: "diff-b", diffStat: "2 files", sourceHead: "head-1", applied: true },
    ],
    artifact: "outcome.json",
    markdownArtifact: "outcome.md",
    artifactRefs: ["outcome.json"],
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };
  const handoff = {
    id: "handoff-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerRuntimeStateId: "scheduler-runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerClaimReservationId: "reservation-1",
    schedulerIntegrationCandidateId: "candidate-1",
    integrationCheckId: "check-1",
    readyWorktreeIds: ["wt-a", "wt-b"],
    resultTargetWorktreeIds: ["wt-a", "wt-b"],
    sourceArtifactHashes: { "spec.md": "hash-spec" },
  };
  const candidate = {
    id: "candidate-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerRuntimeStateId: "scheduler-runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerClaimReservationId: "reservation-1",
    readyWorktreeIds: ["wt-a", "wt-b"],
    sourceArtifactHashes: { "spec.md": "hash-spec" },
  };
  const check = {
    id: "check-1",
    changeId: "change-1",
    status: "applied",
    resultTargets: [
      { worktreeId: "wt-a", changeId: "change-1", diffHash: "diff-a", diffStat: "1 file", sourceHead: "head-1" },
      { worktreeId: "wt-b", changeId: "change-1", diffHash: "diff-b", diffStat: "2 files", sourceHead: "head-1" },
    ],
  };
  return {
    runtimeState,
    run,
    outcome,
    handoff,
    candidate,
    check,
    appendSchedulerRuntimeEvent: vi.fn(),
    completeSchedulerRun: vi.fn(),
    findSchedulerRunCompletionForOutcome: vi.fn(),
    readIntegrationCheck: vi.fn(),
    readLatestSchedulerIntegrationCandidateProjection: vi.fn(),
    readLatestSchedulerIntegrationCheckHandoffProjection: vi.fn(),
    readLatestSchedulerIntegrationOutcomeProjection: vi.fn(),
    readSchedulerIntegrationOutcome: vi.fn(),
    readSchedulerRun: vi.fn(),
    readSchedulerRuntimeState: vi.fn(),
    writeSchedulerRunCompletion: vi.fn(),
  };
});

vi.mock("../../src/memory/resolver.js", () => ({
  resolveProjectMemory: vi.fn(async () => ({ projectId: "project-1", root: "memory-root", supported: true })),
}));

vi.mock("../../src/change/target.js", () => ({
  resolveRunnableChangeTarget: vi.fn(async () => ({
    status: { activeChanges: [{ name: "change-1", path: "change-path" }] },
  })),
}));

vi.mock("../../src/workflow-scheduler/repository.js", () => ({
  readSchedulerRun: mocks.readSchedulerRun,
}));

vi.mock("../../src/workflow-scheduler/scheduler-run.js", () => ({
  completeSchedulerRun: mocks.completeSchedulerRun,
}));

vi.mock("../../src/scheduler-runtime/guards.js", () => ({
  readSchedulerRuntimeLineage: vi.fn(async () => ({
    run: mocks.run,
    launchPreflight: {},
    claimPlan: {},
    workerPlan: {},
    dryRun: {},
    contract: {},
  })),
}));

vi.mock("../../src/scheduler-runtime/repository.js", () => ({
  appendSchedulerRuntimeEvent: mocks.appendSchedulerRuntimeEvent,
  findSchedulerRunCompletionForOutcome: mocks.findSchedulerRunCompletionForOutcome,
  readLatestSchedulerIntegrationCandidateProjection: mocks.readLatestSchedulerIntegrationCandidateProjection,
  readLatestSchedulerIntegrationCheckHandoffProjection: mocks.readLatestSchedulerIntegrationCheckHandoffProjection,
  readLatestSchedulerIntegrationOutcomeProjection: mocks.readLatestSchedulerIntegrationOutcomeProjection,
  readSchedulerIntegrationOutcome: mocks.readSchedulerIntegrationOutcome,
  readSchedulerRuntimeState: mocks.readSchedulerRuntimeState,
  schedulerRunCompletionArtifactRefs: vi.fn((_memory, _changePath, _runId, completionId) => ({
    artifact: `${completionId}.json`,
    markdownArtifact: `${completionId}.md`,
  })),
  writeSchedulerRunCompletion: mocks.writeSchedulerRunCompletion,
}));

vi.mock("../../src/integration-check/repository.js", () => ({
  readIntegrationCheck: mocks.readIntegrationCheck,
}));

describe("SchedulerRun completion", () => {
  beforeEach(() => {
    mocks.appendSchedulerRuntimeEvent.mockReset();
    mocks.completeSchedulerRun.mockReset();
    mocks.findSchedulerRunCompletionForOutcome.mockReset();
    mocks.readIntegrationCheck.mockReset();
    mocks.readLatestSchedulerIntegrationCandidateProjection.mockReset();
    mocks.readLatestSchedulerIntegrationCheckHandoffProjection.mockReset();
    mocks.readLatestSchedulerIntegrationOutcomeProjection.mockReset();
    mocks.readSchedulerIntegrationOutcome.mockReset();
    mocks.readSchedulerRun.mockReset();
    mocks.readSchedulerRuntimeState.mockReset();
    mocks.writeSchedulerRunCompletion.mockReset();
    mocks.completeSchedulerRun.mockResolvedValue({ ...mocks.run, status: "completed" });
    mocks.findSchedulerRunCompletionForOutcome.mockResolvedValue(null);
    mocks.readIntegrationCheck.mockResolvedValue({ ...mocks.check });
    mocks.readLatestSchedulerIntegrationCandidateProjection.mockResolvedValue({ ...mocks.candidate });
    mocks.readLatestSchedulerIntegrationCheckHandoffProjection.mockResolvedValue({ ...mocks.handoff });
    mocks.readLatestSchedulerIntegrationOutcomeProjection.mockResolvedValue({ ...mocks.outcome });
    mocks.readSchedulerIntegrationOutcome.mockResolvedValue({ ...mocks.outcome });
    mocks.readSchedulerRun.mockResolvedValue({ ...mocks.run });
    mocks.readSchedulerRuntimeState.mockResolvedValue({ ...mocks.runtimeState });
  });

  it("records completion for a terminal scheduler integration outcome and marks SchedulerRun completed", async () => {
    const { completeSchedulerRunFromIntegrationOutcome } = await import("../../src/scheduler-runtime/run-completion.js");

    const result = await completeSchedulerRunFromIntegrationOutcome({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerIntegrationOutcomeId: "outcome-1",
    });

    expect(result.schedulerRunStatus).toBe("completed");
    expect(result.sourceMutated).toBe(false);
    expect(result.completion.status).toBe("completed-applied");
    expect(result.completion.schedulerIntegrationOutcomeId).toBe("outcome-1");
    expect(mocks.writeSchedulerRunCompletion).toHaveBeenCalledTimes(1);
    expect(mocks.completeSchedulerRun).toHaveBeenCalledWith(
      { projectId: "project-1", root: "memory-root", supported: true },
      "change-path",
      mocks.run,
      expect.objectContaining({
        summary: "SchedulerRun completed from scheduler integration outcome applied.",
      }),
    );
    expect(mocks.appendSchedulerRuntimeEvent).toHaveBeenCalledWith(
      { projectId: "project-1", root: "memory-root", supported: true },
      "change-path",
      expect.objectContaining({ id: "scheduler-run-1", status: "completed" }),
      "scheduler-runtime.run-completed",
      expect.objectContaining({
        summary: "SchedulerRun completed as completed-applied.",
      }),
    );
  });

  it("rejects passed IntegrationCheck because apply/discard remains the existing gate", async () => {
    mocks.readIntegrationCheck.mockResolvedValue({ ...mocks.check, status: "passed" });
    mocks.readSchedulerIntegrationOutcome.mockResolvedValue({ ...mocks.outcome, integrationCheckStatus: "passed", status: "blocked" });
    mocks.readLatestSchedulerIntegrationOutcomeProjection.mockResolvedValue({ ...mocks.outcome, integrationCheckStatus: "passed", status: "blocked" });
    const { completeSchedulerRunFromIntegrationOutcome } = await import("../../src/scheduler-runtime/run-completion.js");

    await expect(completeSchedulerRunFromIntegrationOutcome({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerIntegrationOutcomeId: "outcome-1",
    })).rejects.toThrow(/waiting for apply\/discard/);
    expect(mocks.writeSchedulerRunCompletion).not.toHaveBeenCalled();
    expect(mocks.completeSchedulerRun).not.toHaveBeenCalled();
  });

  it("records completed-discarded for a discarded scheduler integration outcome without source mutation", async () => {
    mocks.readIntegrationCheck.mockResolvedValue({ ...mocks.check, status: "discarded" });
    mocks.readSchedulerIntegrationOutcome.mockResolvedValue({ ...mocks.outcome, integrationCheckStatus: "discarded", status: "discarded" });
    mocks.readLatestSchedulerIntegrationOutcomeProjection.mockResolvedValue({ ...mocks.outcome, integrationCheckStatus: "discarded", status: "discarded" });
    const { completeSchedulerRunFromIntegrationOutcome } = await import("../../src/scheduler-runtime/run-completion.js");

    const result = await completeSchedulerRunFromIntegrationOutcome({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerIntegrationOutcomeId: "outcome-1",
    });

    expect(result.schedulerRunStatus).toBe("completed");
    expect(result.sourceMutated).toBe(false);
    expect(result.completion.status).toBe("completed-discarded");
    expect(result.completion.integrationCheckStatus).toBe("discarded");
    expect(result.completion.outcomeStatus).toBe("discarded");
    expect(mocks.writeSchedulerRunCompletion).toHaveBeenCalledTimes(1);
    expect(mocks.completeSchedulerRun).toHaveBeenCalledWith(
      { projectId: "project-1", root: "memory-root", supported: true },
      "change-path",
      mocks.run,
      expect.objectContaining({
        summary: "SchedulerRun completed from scheduler integration outcome discarded.",
      }),
    );
    expect(mocks.appendSchedulerRuntimeEvent).toHaveBeenCalledWith(
      { projectId: "project-1", root: "memory-root", supported: true },
      "change-path",
      expect.objectContaining({ id: "scheduler-run-1", status: "completed" }),
      "scheduler-runtime.run-completed",
      expect.objectContaining({
        summary: "SchedulerRun completed as completed-discarded.",
      }),
    );
  });

  it("returns existing completion idempotently without writing another artifact", async () => {
    const existingCompletion = {
      id: "completion-existing",
      schedulerIntegrationOutcomeId: "outcome-1",
      artifactRefs: ["completion-existing.json"],
      status: "completed-applied",
      integrationCheckStatus: "applied",
      outcomeStatus: "applied",
      readyWorktreeIds: ["wt-a", "wt-b"],
      resultTargetWorktreeIds: ["wt-a", "wt-b"],
      schedulerIntegrationCheckHandoffId: "handoff-1",
      schedulerIntegrationCandidateId: "candidate-1",
      schedulerClaimReservationId: "reservation-1",
      integrationCheckId: "check-1",
    };
    mocks.findSchedulerRunCompletionForOutcome.mockResolvedValue(existingCompletion);
    const { completeSchedulerRunFromIntegrationOutcome } = await import("../../src/scheduler-runtime/run-completion.js");

    const result = await completeSchedulerRunFromIntegrationOutcome({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerIntegrationOutcomeId: "outcome-1",
    });

    expect(result.completion).toBe(existingCompletion);
    expect(mocks.writeSchedulerRunCompletion).not.toHaveBeenCalled();
    expect(mocks.completeSchedulerRun).toHaveBeenCalledTimes(1);
    expect(mocks.appendSchedulerRuntimeEvent).not.toHaveBeenCalled();
  });
});
