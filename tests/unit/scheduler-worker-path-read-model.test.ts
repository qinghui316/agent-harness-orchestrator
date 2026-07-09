import { describe, expect, it } from "vitest";
import {
  hasApprovedSchedulerWorkerOutput,
  isTerminalSchedulerWorkerPathStatus,
  schedulerWorkerPathEvidenceRefs,
  type SchedulerWorkerPathReadModel,
} from "../../src/scheduler-runtime/worker-path-read-model.js";

function path(overrides: Partial<SchedulerWorkerPathReadModel>): SchedulerWorkerPathReadModel {
  return {
    start: {
      version: "1.0",
      id: "worker-start-1",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerReconcileSnapshotId: "snapshot-1",
      status: "started",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-1",
      nodeId: "node-1",
      unitId: "unit-1",
      stageId: "coder",
      taskRunId: "task-run-1",
      workerLeaseId: "lease-1",
      worktreeId: "worktree-1",
      runId: "run-1",
      artifact: "worker-start.json",
      markdownArtifact: "worker-start.md",
      createdAt: "2026-07-08T00:00:00.000Z",
      updatedAt: "2026-07-08T00:00:00.000Z",
    },
    result: null,
    validation: null,
    audit: null,
    reworkPlan: null,
    reworkStart: null,
    reworkResult: null,
    reworkValidation: null,
    reworkAudit: null,
    status: "result-pending",
    terminal: false,
    ...overrides,
  };
}

describe("Scheduler worker-path read model adapters", () => {
  it("exposes terminal and approved-output facts without projection logic", () => {
    expect(isTerminalSchedulerWorkerPathStatus("result-pending")).toBe(false);
    expect(isTerminalSchedulerWorkerPathStatus("audit-approved")).toBe(true);
    expect(isTerminalSchedulerWorkerPathStatus("rework-audit-blocked")).toBe(true);
    expect(hasApprovedSchedulerWorkerOutput(path({ status: "result-pending", terminal: false }))).toBe(false);
    expect(hasApprovedSchedulerWorkerOutput(path({
      audit: {
        version: "1.0",
        id: "audit-1",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "reservation-1",
        schedulerWorkerStartId: "worker-start-1",
        schedulerWorkerResultId: "result-1",
        schedulerWorkerValidationId: "validation-1",
        status: "approved-with-notes",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-1",
        nodeId: "node-1",
        unitId: "unit-1",
        stageId: "audit",
        taskRunId: "task-run-1",
        workerLeaseId: "lease-1",
        worktreeId: "worktree-1",
        codeRunId: "run-1",
        validationRunId: "validation-run-1",
        auditRunId: "audit-run-1",
        auditStatus: "approved-with-notes",
        artifact: "audit.json",
        markdownArtifact: "audit.md",
        createdAt: "2026-07-08T00:01:00.000Z",
        updatedAt: "2026-07-08T00:01:00.000Z",
      },
      status: "audit-approved",
      terminal: true,
    }))).toBe(true);
  });

  it("builds generic evidence refs for downstream runtime context", () => {
    const refs = schedulerWorkerPathEvidenceRefs(path({
      result: {
        version: "1.0",
        id: "result-1",
        changeId: "change-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "reservation-1",
        schedulerWorkerStartId: "worker-start-1",
        status: "evidence-ready",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-1",
        nodeId: "node-1",
        unitId: "unit-1",
        stageId: "coder",
        taskRunId: "task-run-1",
        workerLeaseId: "lease-1",
        taskRunStatus: "completed",
        workerLeaseStatus: "released",
        worktreeId: "worktree-1",
        runId: "run-1",
        runStatus: "completed",
        artifact: "result.json",
        markdownArtifact: "result.md",
        createdAt: "2026-07-08T00:02:00.000Z",
        updatedAt: "2026-07-08T00:02:00.000Z",
      },
      status: "validation-pending",
    }));

    expect(refs.map((ref) => ref.kind)).toEqual([
      "SchedulerRuntimeWorkerStart",
      "SchedulerRuntimeWorkerResult",
    ]);
    expect(refs[1]).toMatchObject({
      id: "result-1",
      status: "evidence-ready",
      artifact: "result.json",
    });
  });
});
