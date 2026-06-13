import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const runtimeState = {
    id: "scheduler-runtime-state-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1",
    lastReconcileSnapshotId: "snapshot-1",
    lastClaimReservationId: "reservation-1",
    lastClaimReservationSnapshotId: "snapshot-1",
    sourceArtifactHashes: { "spec.md": "hash-spec" },
  };
  const handoff = {
    id: "handoff-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1",
    status: "completed",
    schedulerRuntimeStateId: "scheduler-runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerClaimReservationId: "reservation-1",
    schedulerIntegrationCandidateId: "candidate-1",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    integrationCheckId: "check-1",
    integrationCheckStatus: "passed",
    readyWorktreeIds: ["wt-a", "wt-b"],
    resultTargetWorktreeIds: ["wt-a", "wt-b"],
    readyTargets: [
      { worktreeId: "wt-a", worktreeDiffHash: "diff-a", diffStat: "1 file", sourceHead: "head-1", validationId: "val-a", auditId: "aud-a" },
      { worktreeId: "wt-b", worktreeDiffHash: "diff-b", diffStat: "2 files", sourceHead: "head-1", validationId: "val-b", auditId: "aud-b" },
    ],
    sourceArtifactHashes: { "spec.md": "hash-spec" },
    artifact: "handoff.json",
    markdownArtifact: "handoff.md",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };
  const check = {
    id: "check-1",
    changeId: "change-1",
    status: "passed",
    sourceHead: "head-1",
    resultTargets: [
      { worktreeId: "wt-a", changeId: "change-1", diffHash: "diff-a", diffStat: "1 file", sourceHead: "head-1" },
      { worktreeId: "wt-b", changeId: "change-1", diffHash: "diff-b", diffStat: "2 files", sourceHead: "head-1" },
    ],
    artifactRefs: ["check.json"],
  };
  return {
    runtimeState,
    handoff,
    check,
    writeSchedulerIntegrationOutcome: vi.fn(),
    findSchedulerIntegrationOutcomeForHandoff: vi.fn(),
    getWorktreeStatus: vi.fn(),
    readIntegrationCheck: vi.fn(),
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

vi.mock("../../src/scheduler-runtime/guards.js", () => ({
  readSchedulerRuntimeLineage: vi.fn(async () => ({
    run: { id: "scheduler-run-1", changeId: "change-1" },
    launchPreflight: {},
    claimPlan: {},
    workerPlan: {},
    dryRun: {},
    contract: {},
  })),
}));

vi.mock("../../src/scheduler-runtime/repository.js", () => ({
  findSchedulerIntegrationOutcomeForHandoff: mocks.findSchedulerIntegrationOutcomeForHandoff,
  readLatestSchedulerIntegrationCheckHandoffProjection: vi.fn(async () => mocks.handoff),
  readSchedulerIntegrationCheckHandoff: vi.fn(async () => mocks.handoff),
  readSchedulerRuntimeState: vi.fn(async () => mocks.runtimeState),
  schedulerIntegrationOutcomeArtifactRefs: vi.fn(() => ({
    artifact: "outcome.json",
    markdownArtifact: "outcome.md",
  })),
  writeSchedulerIntegrationOutcome: mocks.writeSchedulerIntegrationOutcome,
}));

vi.mock("../../src/integration-check/repository.js", () => ({
  readIntegrationCheck: mocks.readIntegrationCheck,
}));

vi.mock("../../src/worktree/manager.js", () => ({
  getWorktreeStatus: mocks.getWorktreeStatus,
}));

describe("Scheduler integration outcome reconciliation", () => {
  beforeEach(() => {
    mocks.writeSchedulerIntegrationOutcome.mockReset();
    mocks.findSchedulerIntegrationOutcomeForHandoff.mockReset();
    mocks.getWorktreeStatus.mockReset();
    mocks.readIntegrationCheck.mockReset();
    mocks.readIntegrationCheck.mockResolvedValue({ ...mocks.check });
    mocks.getWorktreeStatus.mockImplementation(async (_memory, worktreeId: string) => ({
      id: worktreeId,
      worktreeId,
      changeId: "change-1",
      status: "active",
      worktreeDiffHash: worktreeId === "wt-a" ? "diff-a" : "diff-b",
    }));
  });

  it("keeps passed IntegrationCheck waiting for the existing apply/discard gate", async () => {
    const { reconcileSchedulerIntegrationOutcome } = await import("../../src/scheduler-runtime/integration-outcome.js");

    const result = await reconcileSchedulerIntegrationOutcome({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerIntegrationCheckHandoffId: "handoff-1",
    });

    expect(result.status).toBe("waiting-for-apply");
    expect(result.outcome).toBeNull();
    expect(result.sourceMutated).toBe(false);
    expect(mocks.writeSchedulerIntegrationOutcome).not.toHaveBeenCalled();
  });

  it("records applied outcome only when each target has applied worktree evidence", async () => {
    mocks.readIntegrationCheck.mockResolvedValue({ ...mocks.check, status: "applied", appliedAt: "2026-06-13T01:00:00.000Z" });
    mocks.getWorktreeStatus.mockImplementation(async (_memory, worktreeId: string) => ({
      id: worktreeId,
      worktreeId,
      changeId: "change-1",
      status: "applied",
      appliedAt: "2026-06-13T01:00:00.000Z",
      appliedCommit: "commit-1",
      worktreeDiffHash: worktreeId === "wt-a" ? "diff-a" : "diff-b",
    }));
    const { reconcileSchedulerIntegrationOutcome } = await import("../../src/scheduler-runtime/integration-outcome.js");

    const result = await reconcileSchedulerIntegrationOutcome({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerIntegrationCheckHandoffId: "handoff-1",
    });

    expect(result.status).toBe("reconciled");
    expect(result.outcome?.status).toBe("applied");
    expect(mocks.writeSchedulerIntegrationOutcome).toHaveBeenCalledTimes(1);
  });

  it("rejects discarded IntegrationCheck when target worktree has applied evidence", async () => {
    mocks.readIntegrationCheck.mockResolvedValue({ ...mocks.check, status: "discarded" });
    mocks.getWorktreeStatus.mockImplementation(async (_memory, worktreeId: string) => ({
      id: worktreeId,
      worktreeId,
      changeId: "change-1",
      status: worktreeId === "wt-a" ? "applied" : "active",
      appliedAt: worktreeId === "wt-a" ? "2026-06-13T01:00:00.000Z" : undefined,
      worktreeDiffHash: worktreeId === "wt-a" ? "diff-a" : "diff-b",
    }));
    const { reconcileSchedulerIntegrationOutcome } = await import("../../src/scheduler-runtime/integration-outcome.js");

    await expect(reconcileSchedulerIntegrationOutcome({ id: "project-1", root: "project-root" } as never, {
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerIntegrationCheckHandoffId: "handoff-1",
    })).rejects.toThrow(/discarded target already has applied evidence/);
    expect(mocks.writeSchedulerIntegrationOutcome).not.toHaveBeenCalled();
  });
});
