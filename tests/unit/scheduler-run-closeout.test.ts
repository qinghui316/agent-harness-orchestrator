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
    artifact: "runtime.json",
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
    sourceArtifactHashes: { "spec.md": "hash-spec" },
  };
  const reservation = {
    id: "reservation-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerRuntimeStateId: "scheduler-runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    sourceArtifactHashes: { "spec.md": "hash-spec" },
    reservationIntents: [
      { reservationIntentId: "reservation-intent-1", claimIntentId: "claim-1", status: "reserved", waveIndex: 0 },
    ],
  };
  const candidate = {
    version: "1.0",
    id: "candidate-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1",
    status: "waiting",
    schedulerRuntimeStateId: "scheduler-runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerClaimReservationId: "reservation-1",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    outputs: [
      {
        outputId: "output-1",
        kind: "worker-audit",
        status: "ready",
        blockingReasons: [],
        claimIntentId: "claim-1",
        reservationIntentId: "reservation-intent-1",
        worktreeId: "wt-a",
        artifactRefs: [],
      },
    ],
    readyTargets: [
      { worktreeId: "wt-a", worktreeDiffHash: "diff-a", diffStat: "1 file", sourceHead: "head-1", validationRunId: "validation-1", auditRunId: "audit-1" },
    ],
    readyWorktreeIds: ["wt-a"],
    readyCount: 1,
    blockedCount: 0,
    waitingReason: "Waiting for another ready target.",
    sourceArtifactHashes: { "spec.md": "hash-spec" },
    artifactRefs: ["candidate.json"],
    artifact: "candidate.json",
    markdownArtifact: "candidate.md",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };
  const start = {
    id: "start-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerClaimReservationId: "reservation-1",
    reservationIntentId: "reservation-intent-1",
    status: "failed",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };
  return {
    runtimeState,
    run,
    reservation,
    candidate,
    start,
    appendSchedulerRuntimeEvent: vi.fn(),
    completeSchedulerRun: vi.fn(),
    findSchedulerRunBlockedCloseoutForCandidateStrict: vi.fn(),
    listSchedulerRuntimeWorkerStarts: vi.fn(),
    readLatestSchedulerIntegrationCandidateStrict: vi.fn(),
    readLatestSchedulerIntegrationCheckHandoffStrict: vi.fn(),
    readLatestSchedulerIntegrationOutcomeStrict: vi.fn(),
    readLatestSchedulerRunBlockedCloseoutStrict: vi.fn(),
    readLatestSchedulerRunCompletionStrict: vi.fn(),
    readSchedulerRun: vi.fn(),
    readSchedulerRuntimeClaimReservation: vi.fn(),
    readSchedulerRuntimeState: vi.fn(),
    writeSchedulerRunBlockedCloseout: vi.fn(),
  };
});

vi.mock("../../src/workflow-scheduler/repository.js", () => ({
  readSchedulerRun: mocks.readSchedulerRun,
}));

vi.mock("../../src/workflow-scheduler/scheduler-run.js", () => ({
  completeSchedulerRun: mocks.completeSchedulerRun,
}));

vi.mock("../../src/scheduler-runtime/guards.js", () => ({
  assertLatestSchedulerRuntimeClaimReservation: vi.fn((
    reservation: { id: string; schedulerReconcileSnapshotId: string },
    runtimeState: { lastClaimReservationId?: string; lastClaimReservationSnapshotId?: string },
    context: string,
  ) => {
    if (reservation.id !== runtimeState.lastClaimReservationId || reservation.schedulerReconcileSnapshotId !== runtimeState.lastClaimReservationSnapshotId) {
      throw new Error(`${context} requires the latest SchedulerRuntimeClaimReservation.`);
    }
  }),
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
  findSchedulerRunBlockedCloseoutForCandidateStrict: mocks.findSchedulerRunBlockedCloseoutForCandidateStrict,
  findSchedulerRuntimeWorkerAuditForValidation: vi.fn(async () => null),
  findSchedulerRuntimeWorkerResultForStart: vi.fn(async () => null),
  findSchedulerRuntimeWorkerReworkAuditForValidation: vi.fn(async () => null),
  findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence: vi.fn(async () => null),
  findSchedulerRuntimeWorkerReworkResultForStart: vi.fn(async () => null),
  findSchedulerRuntimeWorkerReworkStartForPlan: vi.fn(async () => null),
  findSchedulerRuntimeWorkerReworkValidationForResult: vi.fn(async () => null),
  findSchedulerRuntimeWorkerValidationForResult: vi.fn(async () => null),
  listSchedulerRuntimeWorkerStarts: mocks.listSchedulerRuntimeWorkerStarts,
  readLatestSchedulerIntegrationCandidateStrict: mocks.readLatestSchedulerIntegrationCandidateStrict,
  readLatestSchedulerIntegrationCheckHandoffStrict: mocks.readLatestSchedulerIntegrationCheckHandoffStrict,
  readLatestSchedulerIntegrationOutcomeStrict: mocks.readLatestSchedulerIntegrationOutcomeStrict,
  readLatestSchedulerRunBlockedCloseoutStrict: mocks.readLatestSchedulerRunBlockedCloseoutStrict,
  readLatestSchedulerRunCompletionStrict: mocks.readLatestSchedulerRunCompletionStrict,
  readSchedulerRuntimeClaimReservation: mocks.readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState: mocks.readSchedulerRuntimeState,
  schedulerRunBlockedCloseoutArtifactRefs: vi.fn((_memory, _changePath, _runId, closeoutId) => ({
    artifact: `${closeoutId}.json`,
    markdownArtifact: `${closeoutId}.md`,
  })),
  writeSchedulerRunBlockedCloseout: mocks.writeSchedulerRunBlockedCloseout,
}));

const executionPort = {
  artifacts: {
    changeEvidenceRoot: "skill-root/state/changes/active/change-1",
    planningRoot: "skill-root/state/changes/active/change-1/planning",
    runtimeRoot: "sidecar-root/scheduler-runs/change-1",
    artifactRoots: ["skill-root", "sidecar-root"],
  },
  runtime: { projectId: "project-1" },
  harness: {
    planning: { change: { change_id: "change-1" } },
    changeStatus: {
      change: { id: "change-1" },
      activeChanges: [{ name: "change-1", path: "state/changes/active/change-1" }],
    },
  },
} as never;

describe("SchedulerRun blocked closeout", () => {
  beforeEach(() => {
    mocks.appendSchedulerRuntimeEvent.mockReset();
    mocks.completeSchedulerRun.mockReset();
    mocks.findSchedulerRunBlockedCloseoutForCandidateStrict.mockReset();
    mocks.listSchedulerRuntimeWorkerStarts.mockReset();
    mocks.readLatestSchedulerIntegrationCandidateStrict.mockReset();
    mocks.readLatestSchedulerIntegrationCheckHandoffStrict.mockReset();
    mocks.readLatestSchedulerIntegrationOutcomeStrict.mockReset();
    mocks.readLatestSchedulerRunBlockedCloseoutStrict.mockReset();
    mocks.readLatestSchedulerRunCompletionStrict.mockReset();
    mocks.readSchedulerRun.mockReset();
    mocks.readSchedulerRuntimeClaimReservation.mockReset();
    mocks.readSchedulerRuntimeState.mockReset();
    mocks.writeSchedulerRunBlockedCloseout.mockReset();
    mocks.completeSchedulerRun.mockResolvedValue({ ...mocks.run, status: "completed" });
    mocks.findSchedulerRunBlockedCloseoutForCandidateStrict.mockResolvedValue(null);
    mocks.listSchedulerRuntimeWorkerStarts.mockResolvedValue([{ ...mocks.start }]);
    mocks.readLatestSchedulerIntegrationCandidateStrict.mockResolvedValue({ ...mocks.candidate });
    mocks.readLatestSchedulerIntegrationCheckHandoffStrict.mockResolvedValue(null);
    mocks.readLatestSchedulerIntegrationOutcomeStrict.mockResolvedValue(null);
    mocks.readLatestSchedulerRunBlockedCloseoutStrict.mockResolvedValue(null);
    mocks.readLatestSchedulerRunCompletionStrict.mockResolvedValue(null);
    mocks.readSchedulerRun.mockResolvedValue({ ...mocks.run });
    mocks.readSchedulerRuntimeClaimReservation.mockResolvedValue({ ...mocks.reservation });
    mocks.readSchedulerRuntimeState.mockResolvedValue({ ...mocks.runtimeState });
  });

  it("records closeout only when candidate cannot reach IntegrationCheck and no next worker remains", async () => {
    const { closeSchedulerRunBlockedOrExhausted } = await import("../../src/scheduler-runtime/run-closeout.js");

    const result = await closeSchedulerRunBlockedOrExhausted({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerIntegrationCandidateId: "candidate-1",
    }, executionPort);

    expect(result.schedulerRunStatus).toBe("completed");
    expect(result.sourceMutated).toBe(false);
    expect(result.executionStarted).toBe(false);
    expect(result.closeout.schedulerIntegrationCandidateId).toBe("candidate-1");
    expect(mocks.writeSchedulerRunBlockedCloseout).toHaveBeenCalledTimes(1);
    expect(mocks.completeSchedulerRun).toHaveBeenCalledTimes(1);
    expect(mocks.appendSchedulerRuntimeEvent).toHaveBeenCalledWith(
      executionPort.artifacts,
      "state/changes/active/change-1",
      expect.objectContaining({ id: "scheduler-run-1", status: "completed" }),
      "scheduler-runtime.run-closeout-recorded",
      expect.objectContaining({
        summary: "SchedulerRun closeout recorded as exhausted.",
      }),
    );
  });

  it("rejects when IntegrationCheck can run", async () => {
    mocks.readLatestSchedulerIntegrationCandidateStrict.mockResolvedValue({
      ...mocks.candidate,
      readyCount: 2,
      readyWorktreeIds: ["wt-a", "wt-b"],
      readyTargets: [
        ...mocks.candidate.readyTargets,
        { worktreeId: "wt-b", worktreeDiffHash: "diff-b", diffStat: "1 file", sourceHead: "head-1", validationRunId: "validation-2", auditRunId: "audit-2" },
      ],
    });
    const { closeSchedulerRunBlockedOrExhausted } = await import("../../src/scheduler-runtime/run-closeout.js");

    await expect(closeSchedulerRunBlockedOrExhausted({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerIntegrationCandidateId: "candidate-1",
    }, executionPort)).rejects.toThrow(/enough ready targets/);
    expect(mocks.writeSchedulerRunBlockedCloseout).not.toHaveBeenCalled();
    expect(mocks.completeSchedulerRun).not.toHaveBeenCalled();
  });

  it("rejects when an unstarted reserved intent can still start a worker", async () => {
    mocks.listSchedulerRuntimeWorkerStarts.mockResolvedValue([]);
    const { closeSchedulerRunBlockedOrExhausted } = await import("../../src/scheduler-runtime/run-closeout.js");

    await expect(closeSchedulerRunBlockedOrExhausted({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerIntegrationCandidateId: "candidate-1",
    }, executionPort)).rejects.toThrow(/legal next scheduler worker/);
    expect(mocks.writeSchedulerRunBlockedCloseout).not.toHaveBeenCalled();
  });

  it("fails closed when strict terminal evidence read fails", async () => {
    mocks.readLatestSchedulerIntegrationCheckHandoffStrict.mockRejectedValue(new Error("malformed handoff"));
    const { closeSchedulerRunBlockedOrExhausted } = await import("../../src/scheduler-runtime/run-closeout.js");

    await expect(closeSchedulerRunBlockedOrExhausted({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerIntegrationCandidateId: "candidate-1",
    }, executionPort)).rejects.toThrow(/malformed handoff/);
    expect(mocks.writeSchedulerRunBlockedCloseout).not.toHaveBeenCalled();
  });

  it("fails closed on inconsistent candidate counts", async () => {
    mocks.readLatestSchedulerIntegrationCandidateStrict.mockResolvedValue({ ...mocks.candidate, readyCount: 0 });
    const { closeSchedulerRunBlockedOrExhausted } = await import("../../src/scheduler-runtime/run-closeout.js");

    await expect(closeSchedulerRunBlockedOrExhausted({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerIntegrationCandidateId: "candidate-1",
    }, executionPort)).rejects.toThrow(/ready target count mismatch/);
    expect(mocks.writeSchedulerRunBlockedCloseout).not.toHaveBeenCalled();
  });

  it("returns existing completed closeout idempotently without completing again", async () => {
    const existingCloseout = {
      ...mocks.candidate,
      id: "closeout-1",
      schedulerIntegrationCandidateId: "candidate-1",
      status: "exhausted",
      reason: "candidate-waiting-exhausted",
      closeoutReason: "Already closed.",
      artifactRefs: ["closeout-1.json"],
      readyCount: 1,
      blockedCount: 0,
      blockedReasons: [],
      unstartedReservedIntentIds: [],
    };
    mocks.readSchedulerRun.mockResolvedValue({ ...mocks.run, status: "completed" });
    mocks.findSchedulerRunBlockedCloseoutForCandidateStrict.mockResolvedValue(existingCloseout);
    const { closeSchedulerRunBlockedOrExhausted } = await import("../../src/scheduler-runtime/run-closeout.js");

    const result = await closeSchedulerRunBlockedOrExhausted({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerIntegrationCandidateId: "candidate-1",
    }, executionPort);

    expect(result.closeout).toBe(existingCloseout);
    expect(mocks.writeSchedulerRunBlockedCloseout).not.toHaveBeenCalled();
    expect(mocks.completeSchedulerRun).not.toHaveBeenCalled();
    expect(mocks.appendSchedulerRuntimeEvent).not.toHaveBeenCalled();
  });
});
