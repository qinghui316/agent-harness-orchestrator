import { describe, expect, it } from "vitest";
import { buildTypedWorkflowNextAction } from "../../src/workbench/workflow-projection.js";

type BuildTypedWorkflowNextActionInput = Parameters<typeof buildTypedWorkflowNextAction>[0];

function workflowFixture<K extends keyof BuildTypedWorkflowNextActionInput>(
  value: Partial<NonNullable<BuildTypedWorkflowNextActionInput[K]>>,
): NonNullable<BuildTypedWorkflowNextActionInput[K]> {
  return value as NonNullable<BuildTypedWorkflowNextActionInput[K]>;
}

describe("workbench scheduler runtime surface", () => {
  it("shows the scheduler first worker rework audit gate after passed rework validation", () => {
    const action = buildTypedWorkflowNextAction({
      topic: workflowFixture<"topic">({ id: "change-1", name: "change-1", title: "Change 1", state: "active", path: "harness/changes/active/change-1", runs: [] }),
      readiness: { specReady: true, planReady: true, tasksReady: true },
      decompositionPlan: workflowFixture<"decompositionPlan">({ id: "decomposition-1", status: "confirmed" }),
      decompositionReadiness: workflowFixture<"decompositionReadiness">({ id: "readiness-1", decompositionPlanId: "decomposition-1", status: "ready-for-scheduler-contract", nextAllowedAction: "scheduler.contract" }),
      schedulerRun: workflowFixture<"schedulerRun">({
        id: "scheduler-run-1",
        status: "prepared",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
        schedulerClaimReconcilePlanId: "scheduler-claim-plan-1",
        schedulerLaunchPreflightId: "scheduler-preflight-1",
      }),
      schedulerRuntime: workflowFixture<"schedulerRuntime">({
        schedulerRunId: "scheduler-run-1",
        lastReconcileSnapshotId: "scheduler-snapshot-1",
        lastClaimReservationId: "scheduler-reservation-1",
        lastClaimReservationSnapshotId: "scheduler-snapshot-1",
      }),
      schedulerReconcileSnapshot: workflowFixture<"schedulerReconcileSnapshot">({ id: "scheduler-snapshot-1" }),
      schedulerClaimReservation: workflowFixture<"schedulerClaimReservation">({
        id: "scheduler-reservation-1",
        schedulerRunId: "scheduler-run-1",
        schedulerReconcileSnapshotId: "scheduler-snapshot-1",
        launchConfirmed: true,
      }),
      schedulerWorkerStart: workflowFixture<"schedulerWorkerStart">({
        id: "scheduler-worker-start-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-reservation-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        taskRunId: "task-run-1",
        workerLeaseId: "worker-lease-1",
        worktreeId: "worktree-1",
        runId: "run-1",
      }),
      schedulerWorkerResult: workflowFixture<"schedulerWorkerResult">({
        id: "scheduler-worker-result-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        status: "evidence-ready",
        taskRunId: "task-run-1",
        workerLeaseId: "worker-lease-1",
        worktreeId: "worktree-1",
        runId: "run-1",
      }),
      schedulerWorkerValidation: workflowFixture<"schedulerWorkerValidation">({
        id: "scheduler-worker-validation-1",
        status: "failed",
        taskRunId: "task-run-1",
        workerLeaseId: "worker-lease-1",
        worktreeId: "worktree-1",
        codeRunId: "run-1",
        validationRunId: "validation-1",
      }),
      schedulerWorkerReworkPlan: workflowFixture<"schedulerWorkerReworkPlan">({
        id: "scheduler-worker-rework-plan-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
      }),
      schedulerWorkerReworkStart: workflowFixture<"schedulerWorkerReworkStart">({
        id: "scheduler-worker-rework-start-1",
        schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
      }),
      schedulerWorkerReworkResult: workflowFixture<"schedulerWorkerReworkResult">({
        id: "scheduler-worker-rework-result-1",
        schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
        status: "evidence-ready",
      }),
      schedulerWorkerReworkValidation: workflowFixture<"schedulerWorkerReworkValidation">({
        id: "scheduler-worker-rework-validation-1",
        status: "passed",
        schedulerClaimReservationId: "scheduler-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerResultId: "scheduler-worker-result-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
        schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
        schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
        schedulerWorkerReworkResultId: "scheduler-worker-rework-result-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        reworkTaskRunId: "task-run-rework-1",
        reworkWorkerLeaseId: "worker-lease-rework-1",
        worktreeId: "worktree-1",
        reworkRunId: "run-rework-1",
        validationRunId: "validation-rework-1",
      }),
    });

    expect(action).toMatchObject({
      actionType: "planning.scheduler.worker.rework-audit-first",
      label: "审计当前 worker rework 结果",
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerReworkValidationId: "scheduler-worker-rework-validation-1",
      taskRunId: "task-run-rework-1",
      workerLeaseId: "worker-lease-rework-1",
      worktreeId: "worktree-1",
      runId: "run-rework-1",
      reworkValidationRunId: "validation-rework-1",
    });
  });

  it("refreshes scheduler integration candidate when a later approved worker path is not covered", () => {
    const base = {
      topic: workflowFixture<"topic">({ id: "change-1", name: "change-1", title: "Change 1", state: "active", path: "harness/changes/active/change-1", runs: [] }),
      readiness: { specReady: true, planReady: true, tasksReady: true },
      decompositionPlan: workflowFixture<"decompositionPlan">({ id: "decomposition-1", status: "confirmed" }),
      decompositionReadiness: workflowFixture<"decompositionReadiness">({ id: "readiness-1", decompositionPlanId: "decomposition-1", status: "ready-for-scheduler-contract", nextAllowedAction: "scheduler.contract" }),
      schedulerRun: workflowFixture<"schedulerRun">({
        id: "scheduler-run-1",
        status: "prepared",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
        schedulerClaimReconcilePlanId: "scheduler-claim-plan-1",
        schedulerLaunchPreflightId: "scheduler-preflight-1",
      }),
      schedulerRuntime: workflowFixture<"schedulerRuntime">({
        schedulerRunId: "scheduler-run-1",
        lastReconcileSnapshotId: "scheduler-snapshot-1",
        lastClaimReservationId: "scheduler-reservation-1",
        lastClaimReservationSnapshotId: "scheduler-snapshot-1",
      }),
      schedulerReconcileSnapshot: workflowFixture<"schedulerReconcileSnapshot">({ id: "scheduler-snapshot-1" }),
      schedulerClaimReservation: workflowFixture<"schedulerClaimReservation">({
        id: "scheduler-reservation-1",
        schedulerRunId: "scheduler-run-1",
        schedulerReconcileSnapshotId: "scheduler-snapshot-1",
        launchConfirmed: true,
        reservationIntents: [
          { reservationIntentId: "reservation-intent-1", claimIntentId: "claim-intent-1", status: "reserved", waveIndex: 0 },
          { reservationIntentId: "reservation-intent-2", claimIntentId: "claim-intent-2", status: "reserved", waveIndex: 0 },
        ],
      }),
      schedulerWorkerStart: workflowFixture<"schedulerWorkerStart">({
        id: "scheduler-worker-start-2",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-reservation-1",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-intent-2",
        taskRunId: "task-run-2",
        workerLeaseId: "worker-lease-2",
        worktreeId: "worktree-2",
        runId: "run-2",
      }),
      schedulerWorkerResult: workflowFixture<"schedulerWorkerResult">({
        id: "scheduler-worker-result-2",
        schedulerWorkerStartId: "scheduler-worker-start-2",
        status: "evidence-ready",
        taskRunId: "task-run-2",
        workerLeaseId: "worker-lease-2",
        worktreeId: "worktree-2",
        runId: "run-2",
      }),
      schedulerWorkerValidation: workflowFixture<"schedulerWorkerValidation">({
        id: "scheduler-worker-validation-2",
        schedulerWorkerResultId: "scheduler-worker-result-2",
        status: "passed",
        taskRunId: "task-run-2",
        workerLeaseId: "worker-lease-2",
        worktreeId: "worktree-2",
        codeRunId: "run-2",
        validationRunId: "validation-2",
      }),
      schedulerWorkerAudit: workflowFixture<"schedulerWorkerAudit">({
        id: "scheduler-worker-audit-2",
        schedulerWorkerValidationId: "scheduler-worker-validation-2",
        status: "approved",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-intent-2",
        taskRunId: "task-run-2",
        workerLeaseId: "worker-lease-2",
        worktreeId: "worktree-2",
        codeRunId: "run-2",
        validationRunId: "validation-2",
        auditRunId: "audit-2",
      }),
      schedulerWorkerPaths: [
        workflowFixture<"schedulerWorkerPaths">({
          start: { reservationIntentId: "reservation-intent-1" },
          audit: { status: "approved", claimIntentId: "claim-intent-1" },
          status: "audit-approved",
          terminal: true,
        }),
        workflowFixture<"schedulerWorkerPaths">({
          start: { reservationIntentId: "reservation-intent-2" },
          audit: { status: "approved", claimIntentId: "claim-intent-2" },
          status: "audit-approved",
          terminal: true,
        }),
      ],
      schedulerIntegrationCandidate: workflowFixture<"schedulerIntegrationCandidate">({
        id: "scheduler-integration-candidate-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-reservation-1",
        status: "waiting",
        readyCount: 1,
        blockedCount: 0,
        readyWorktreeIds: ["worktree-1"],
        outputClaimIntentIds: ["claim-intent-1"],
      }),
      schedulerIntegrationCandidateNeedsRefresh: true,
      schedulerTransition: {
        kind: "integration-candidate",
        actionType: "planning.scheduler.integration-candidate.compile",
      },
    } satisfies BuildTypedWorkflowNextActionInput;

    expect(buildTypedWorkflowNextAction(base)).toMatchObject({
      actionType: "planning.scheduler.integration-candidate.compile",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-reservation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-2",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
    });
  });

});
