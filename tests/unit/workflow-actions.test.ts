import { describe, expect, it } from "vitest";
import { highImpactActions } from "../../src/agent-task/tool-policy.js";
import {
  HIGH_IMPACT_WORKFLOW_ACTION_TYPES,
  LIVE_WORKFLOW_ACTION_TYPES,
  REVALIDATED_WORKFLOW_ACTION_TYPES,
  WORKBENCH_THREAD_ACTION_TYPES,
  WORKFLOW_ACTION_TYPES,
  validateWorkflowActionRequiredTargets,
  workflowActionScopePayload,
  workflowActionScopesMatch,
  workflowActionScopesMatchCompatible,
  workflowActionScopesMatchStrict,
  workflowActionTargetId,
} from "../../src/workflow-actions/registry.js";

describe("workflow action registry", () => {
  it("keeps live, high-impact, and revalidated action sets inside the canonical action registry", () => {
    const all = new Set<string>(WORKFLOW_ACTION_TYPES);

    for (const actionType of LIVE_WORKFLOW_ACTION_TYPES) expect(all.has(actionType)).toBe(true);
    for (const actionType of HIGH_IMPACT_WORKFLOW_ACTION_TYPES.filter((item) => item.startsWith("planning.") || item.startsWith("task.") || item === "code.run")) {
      expect(all.has(actionType)).toBe(true);
    }
    for (const actionType of REVALIDATED_WORKFLOW_ACTION_TYPES) expect(all.has(actionType)).toBe(true);
    for (const actionType of WORKFLOW_ACTION_TYPES) expect(WORKBENCH_THREAD_ACTION_TYPES).toContain(actionType);

    expect(highImpactActions()).toEqual([...HIGH_IMPACT_WORKFLOW_ACTION_TYPES].sort());
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.workflowgraph.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.workflowgraph.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.workflowgraph.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.contract.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.contract.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.contract.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.dispatch.dry-run");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.dispatch.dry-run");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.dispatch.dry-run");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker-plan.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker-plan.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker-plan.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.claim-reconcile.compile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.claim-reconcile.compile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.claim-reconcile.compile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.launch-preflight.check");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.launch-preflight.check");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.launch-preflight.check");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.prepare");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.prepare");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.run.prepare");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.initialize");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.initialize");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.initialize");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reconcile");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reconcile");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reconcile");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reserve-claims");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reserve-claims");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.runtime.reserve-claims");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-first");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-first");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.start-first");
    expect(LIVE_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.reconcile-result");
    expect(HIGH_IMPACT_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.reconcile-result");
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("planning.scheduler.worker.reconcile-result");
  });

  it("keeps SchedulerContract ids in target and audit scope matching", () => {
    const request = {
      changeId: "change-1",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
      schedulerContractId: "scheduler-contract-1",
    };

    expect(workflowActionTargetId(request, request.changeId)).toBe("scheduler-contract-1");
    expect(workflowActionScopePayload(request, request.changeId, { contract: { id: "scheduler-contract-1" } })).toMatchObject({
      changeId: "change-1",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
      schedulerContractId: "scheduler-contract-1",
    });
    expect(workflowActionScopesMatchStrict(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request, schedulerContractId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(request, { ...request, schedulerContractId: undefined })).toBe(true);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.contract.compile",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.contract.compile",
      readinessManifestId: "readiness-1",
    }).map((item) => item.label)).toEqual(["decompositionPlanId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.dispatch.dry-run",
      schedulerContractId: "scheduler-contract-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.dispatch.dry-run",
    }).map((item) => item.label)).toEqual(["schedulerContractId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker-plan.compile",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker-plan.compile",
      schedulerContractId: "scheduler-contract-1",
    }).map((item) => item.label)).toEqual(["schedulerDispatchDryRunId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.claim-reconcile.compile",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.claim-reconcile.compile",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerPlanId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.launch-preflight.check",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.launch-preflight.check",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
    }).map((item) => item.label)).toEqual(["schedulerClaimReconcilePlanId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.run.prepare",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.run.prepare",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    }).map((item) => item.label)).toEqual(["schedulerLaunchPreflightId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.initialize",
      schedulerRunId: "scheduler-run-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.initialize",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    }).map((item) => item.label)).toEqual(["schedulerRunId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.reconcile",
      schedulerRunId: "scheduler-run-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.reconcile",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    }).map((item) => item.label)).toEqual(["schedulerRunId"]);
    const workerPlanRequest = {
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
    };
    expect(workflowActionTargetId(workerPlanRequest, workerPlanRequest.changeId)).toBe("scheduler-dry-run-1");
    expect(workflowActionScopePayload(workerPlanRequest, workerPlanRequest.changeId, {
      workerPlan: {
        id: "scheduler-worker-plan-1",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
    });
    expect(workflowActionScopesMatchStrict(workerPlanRequest, { ...workerPlanRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerPlanRequest, { ...workerPlanRequest, schedulerDispatchDryRunId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerPlanRequest, { ...workerPlanRequest, schedulerDispatchDryRunId: undefined })).toBe(true);
    const claimReconcileRequest = {
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
    };
    expect(workflowActionTargetId(claimReconcileRequest, claimReconcileRequest.changeId)).toBe("scheduler-worker-plan-1");
    expect(workflowActionScopePayload(claimReconcileRequest, claimReconcileRequest.changeId, {
      claimReconcilePlan: {
        id: "scheduler-claim-reconcile-1",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    });
    expect(workflowActionScopesMatchStrict(claimReconcileRequest, { ...claimReconcileRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(claimReconcileRequest, { ...claimReconcileRequest, schedulerWorkerPlanId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(claimReconcileRequest, { ...claimReconcileRequest, schedulerWorkerPlanId: undefined })).toBe(true);
    const launchPreflightRequest = {
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
    };
    expect(workflowActionTargetId(launchPreflightRequest, launchPreflightRequest.changeId)).toBe("scheduler-claim-reconcile-1");
    expect(workflowActionScopePayload(launchPreflightRequest, launchPreflightRequest.changeId, {
      launchPreflight: {
        id: "scheduler-launch-preflight-1",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
        schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    });
    expect(workflowActionScopesMatchStrict(launchPreflightRequest, { ...launchPreflightRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(launchPreflightRequest, { ...launchPreflightRequest, schedulerClaimReconcilePlanId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(launchPreflightRequest, { ...launchPreflightRequest, schedulerClaimReconcilePlanId: undefined })).toBe(true);
    const schedulerRunRequest = {
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
    };
    expect(workflowActionTargetId(schedulerRunRequest, schedulerRunRequest.changeId)).toBe("scheduler-launch-preflight-1");
    expect(workflowActionScopePayload(schedulerRunRequest, schedulerRunRequest.changeId, {
      schedulerRun: {
        id: "scheduler-run-1",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
        schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
        schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
      schedulerRunId: "scheduler-run-1",
    });
    expect(workflowActionScopesMatchStrict(schedulerRunRequest, { ...schedulerRunRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(schedulerRunRequest, { ...schedulerRunRequest, schedulerLaunchPreflightId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(schedulerRunRequest, { ...schedulerRunRequest, schedulerLaunchPreflightId: undefined })).toBe(true);
    const runtimeRequest = {
      ...schedulerRunRequest,
      schedulerRunId: "scheduler-run-1",
    };
    expect(workflowActionTargetId(runtimeRequest, runtimeRequest.changeId)).toBe("scheduler-run-1");
    expect(workflowActionScopePayload(runtimeRequest, runtimeRequest.changeId, {
      runtimeState: {
        id: "scheduler-runtime-1",
        schedulerRunId: "scheduler-run-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerContractId: "scheduler-contract-1",
      schedulerDispatchDryRunId: "scheduler-dry-run-1",
      schedulerWorkerPlanId: "scheduler-worker-plan-1",
      schedulerClaimReconcilePlanId: "scheduler-claim-reconcile-1",
      schedulerLaunchPreflightId: "scheduler-launch-preflight-1",
      schedulerRunId: "scheduler-run-1",
    });
    const reconcileRequest = {
      ...runtimeRequest,
      schedulerReconcileSnapshotId: "scheduler-reconcile-snapshot-1",
    };
    expect(workflowActionScopePayload(reconcileRequest, reconcileRequest.changeId, {
      reconcileSnapshot: {
        id: "scheduler-reconcile-snapshot-1",
        schedulerRunId: "scheduler-run-1",
      },
    })).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-snapshot-1",
    });
    expect(workflowActionScopesMatchStrict(reconcileRequest, { ...reconcileRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(reconcileRequest, { ...reconcileRequest, schedulerReconcileSnapshotId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(reconcileRequest, { ...reconcileRequest, schedulerReconcileSnapshotId: undefined })).toBe(true);
  });

  it("keeps Scheduler claim reservation scope in target, payload, and required-target validation", () => {
    const request = {
      actionType: "planning.scheduler.runtime.reserve-claims",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
    };

    const result = {
      claimReservation: {
        id: "scheduler-claim-reservation-1",
        schedulerRunId: "scheduler-run-1",
        schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(request)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.runtime.reserve-claims",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerReconcileSnapshotId"]);
    expect(workflowActionTargetId(request, request.changeId, result)).toBe("scheduler-claim-reservation-1");
    expect(workflowActionScopePayload(request, request.changeId, result)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerReconcileSnapshotId: "scheduler-reconcile-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
    });
    expect(workflowActionScopesMatchStrict(
      { ...request, schedulerClaimReservationId: "scheduler-claim-reservation-1" },
      { ...request, schedulerClaimReservationId: "scheduler-claim-reservation-1" },
    )).toBe(true);
    expect(workflowActionScopesMatch(
      { ...request, schedulerClaimReservationId: "scheduler-claim-reservation-1" },
      { ...request, schedulerClaimReservationId: "other" },
    )).toBe(false);

    const workerStartRequest = {
      actionType: "planning.scheduler.worker.start-first",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
    };
    const workerStartResult = {
      workerStart: {
        id: "scheduler-worker-start-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerStartRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.start-first",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerClaimReservationId"]);
    expect(workflowActionTargetId(workerStartRequest, workerStartRequest.changeId, workerStartResult)).toBe("scheduler-claim-reservation-1");
    expect(workflowActionScopePayload(workerStartRequest, workerStartRequest.changeId, workerStartResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
    });
    expect(workflowActionScopesMatchStrict(workerStartRequest, { ...workerStartRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerStartRequest, { ...workerStartRequest, reservationIntentId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerStartRequest, { ...workerStartRequest, reservationIntentId: undefined })).toBe(true);

    const workerResultRequest = {
      actionType: "planning.scheduler.worker.reconcile-result",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      runId: "run-1",
    };
    const workerResult = {
      result: {
        id: "scheduler-worker-result-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-claim-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        taskRunId: "task-run-1",
        workerLeaseId: "worker-lease-1",
        runId: "run-1",
      },
    };
    expect(validateWorkflowActionRequiredTargets(workerResultRequest)).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.scheduler.worker.reconcile-result",
      schedulerRunId: "scheduler-run-1",
    }).map((item) => item.label)).toEqual(["schedulerWorkerStartId"]);
    expect(workflowActionTargetId(workerResultRequest, workerResultRequest.changeId, workerResult)).toBe("scheduler-worker-result-1");
    expect(workflowActionScopePayload(workerResultRequest, workerResultRequest.changeId, workerResult)).toMatchObject({
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-claim-reservation-1",
      schedulerWorkerStartId: "scheduler-worker-start-1",
      schedulerWorkerResultId: "scheduler-worker-result-1",
      reservationIntentId: "reservation-intent-1",
      claimIntentId: "claim-intent-1",
      taskRunId: "task-run-1",
      workerLeaseId: "worker-lease-1",
      runId: "run-1",
    });
    expect(workflowActionScopesMatchStrict(workerResultRequest, { ...workerResultRequest })).toBe(true);
    expect(workflowActionScopesMatchStrict(workerResultRequest, { ...workerResultRequest, schedulerWorkerStartId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(workerResultRequest, { ...workerResultRequest, schedulerWorkerStartId: undefined })).toBe(true);
  });

  it("keeps graph ids in target and audit scope matching", () => {
    const request = {
      changeId: "change-1",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
    };

    expect(workflowActionTargetId(request, request.changeId)).toBe("workflow-1");
    expect(workflowActionScopePayload(request, request.changeId, { graph: { id: "graph-1" } })).toMatchObject({
      changeId: "change-1",
      decompositionPlanId: "decomposition-1",
      readinessManifestId: "readiness-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
    });
    expect(workflowActionScopesMatch(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatchStrict(request, { ...request })).toBe(true);
    expect(workflowActionScopesMatch(request, { ...request, workflowGraphPlanId: "graph-2" })).toBe(false);
    expect(workflowActionScopesMatchStrict(request, { ...request, readinessManifestId: undefined })).toBe(false);
    expect(workflowActionScopesMatchCompatible(request, { ...request, readinessManifestId: undefined })).toBe(true);
  });

  it("requires exact targets for task and taskqueue workflow actions", () => {
    expect(validateWorkflowActionRequiredTargets({ actionType: "task.run.start", taskRunId: "taskrun-1" }).map((item) => item.label)).toEqual(["single taskIds[0]"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "task.run.retry", taskIds: ["T-001"] }).map((item) => item.label)).toEqual(["taskRunId"]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "task.queue.start",
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
      readinessManifestId: "readiness-1",
      decompositionPlanId: "decomposition-1",
    })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({
      actionType: "planning.taskqueue.confirm-start",
      taskQueueProposalId: "proposal-1",
      workflowGraphPlanId: "graph-1",
    }).map((item) => item.label)).toEqual(["readinessManifestId", "decompositionPlanId"]);
  });

  it("keeps landing and PR draft target rules aligned with execution scopes", () => {
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.review", worktreeId: "worktree-1" }).map((item) => item.label)).toEqual(["landingPackageId"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.review", landingPackageId: "landing-1" })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.prepare", worktreeIds: ["worktree-1"] }).map((item) => item.label)).toEqual(["applyCheckId or worktreeId"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.refresh", worktreeIds: ["worktree-1"] }).map((item) => item.label)).toEqual(["applyCheckId or worktreeId"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.prepare", worktreeId: "worktree-1" })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing.refresh", applyCheckId: "apply-1" })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing-queue.refresh" })).toEqual([]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing-queue.merge-next" }).map((item) => item.label)).toEqual(["landingPackageId"]);
    expect(validateWorkflowActionRequiredTargets({ actionType: "landing-queue.merge-next", landingPackageId: "landing-1" })).toEqual([]);
    expect(REVALIDATED_WORKFLOW_ACTION_TYPES).toContain("pr-draft.create");
  });
});
