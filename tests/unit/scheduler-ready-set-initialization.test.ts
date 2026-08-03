import { describe, expect, it } from "vitest";
import type { SchedulerRuntimeClaimReservation } from "../../src/scheduler-runtime/types.js";
import { compileWorkflowGraphPlan, type WorkflowAuthoringPlan } from "../../src/workflow-artifacts/manager.js";
import { resolveSchedulerCurrentTransition } from "../../src/workflow-actions/scheduler-current-transition.js";
import { compileSchedulerReadySetPlanningBundle } from "../../src/workflow-scheduler/planning-bundle.js";

describe("authored ready-set Scheduler initialization", () => {
  it("compiles the accepted Scheduler lineage and selects start-first without execution records", () => {
    const changeId = "ready-set-change";
    const changeRoot = `state/changes/active/${changeId}`;
    const planRef = `${changeRoot}/plan.md`;
    const plan: WorkflowAuthoringPlan = {
      version: "1.0",
      mode: "ready-set-v1",
      nodes: [{
        id: "implementation",
        title: "Implement accepted task",
        taskIds: ["T-001"],
        acIds: ["AC-001"],
        prompt: "Objective: Implement T-001. Required behavior: Complete the accepted task. Constraints: Stay within the accepted scope. Expected evidence: Return verification results.",
        dependsOn: [],
        sourceScopes: ["src/feature.ts"],
      }],
    };
    const graphId = "authored-ready-set-graph";
    const graphBase = `${changeRoot}/planning/workflow-graphs/${graphId}`;
    const graph = compileWorkflowGraphPlan(plan, {
      id: graphId,
      changeId,
      planArtifactRef: planRef,
      taskIds: ["T-001"],
      acIds: ["AC-001"],
      sourceArtifactHashes: { [planRef]: "a".repeat(64) },
      artifactRefs: [planRef],
      artifact: `${graphBase}.json`,
      markdownArtifact: `${graphBase}.md`,
      createdAt: "2026-07-10T00:00:00.000Z",
    });
    if (graph.graphMode !== "ready-set-v1") throw new Error("Expected ready-set graph fixture.");

    const bundle = compileSchedulerReadySetPlanningBundle(
      graph,
      changeRoot,
      "2026-07-10T00:00:01.000Z",
    );
    expect(bundle).toMatchObject({
      contract: { id: graph.schedulerContractId },
      dryRun: { id: graph.schedulerDispatchDryRunId, schedulerContractId: graph.schedulerContractId },
      workerPlan: { id: graph.schedulerWorkerPlanId, schedulerDispatchDryRunId: graph.schedulerDispatchDryRunId },
      claimReconcilePlan: { id: graph.schedulerClaimReconcilePlanId, schedulerWorkerPlanId: graph.schedulerWorkerPlanId },
      launchPreflight: { status: "checked", workflowGraphPlanId: graph.id },
    });
    expect(bundle.workerPlan.plannedStages.map((stage) => ({
      stage: stage.stage,
      adapterFamily: stage.adapterFamily,
      expectedEventTypes: stage.eventSourceExpectation.expectedEventTypes,
    }))).toEqual([
      {
        stage: "coder",
        adapterFamily: "provider-code",
        expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "provider.started", "provider.exited", "external-execution.completed"],
      },
      {
        stage: "validation",
        adapterFamily: "validation-command",
        expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "validation.command.started", "validation.command.exited", "external-execution.completed"],
      },
      {
        stage: "audit",
        adapterFamily: "provider-readonly",
        expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "audit.started", "provider.started", "provider.exited", "external-execution.completed"],
      },
      {
        stage: "bounded-rework",
        adapterFamily: "provider-code",
        expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "provider.started", "provider.exited", "external-execution.completed"],
      },
    ]);

    const claim = bundle.claimReconcilePlan.claimIntents[0];
    const reservation: SchedulerRuntimeClaimReservation = {
      version: "1.0",
      id: "reservation-1",
      changeId,
      schedulerRunId: "scheduler-run-1",
      schedulerMode: "parallel-readiness-v1",
      status: "reserved",
      schedulerRuntimeStateId: "runtime-state-1",
      schedulerReconcileSnapshotId: "snapshot-1",
      schedulerContractId: bundle.contract.id,
      schedulerDispatchDryRunId: bundle.dryRun.id,
      schedulerWorkerPlanId: bundle.workerPlan.id,
      schedulerClaimReconcilePlanId: bundle.claimReconcilePlan.id,
      schedulerLaunchPreflightId: bundle.launchPreflight.id,
      reservationIntents: [{
        reservationIntentId: "reservation-intent-1",
        claimIntentId: claim.claimIntentId,
        plannedWorkerKey: claim.plannedWorkerKey,
        nodeId: claim.nodeId,
        unitId: claim.unitId,
        waveIndex: claim.waveIndex,
        status: "reserved",
        plannedSlotDemand: claim.plannedSlotDemand,
        sourceScopes: claim.sourceScopes,
        blockedReasons: [],
      }],
      waves: [{
        waveIndex: 0,
        reservationIntentIds: ["reservation-intent-1"],
        reservedCount: 1,
        blockedCount: 0,
        plannedSlotDemand: 1,
        status: "reserved",
        blockedReasons: [],
      }],
      sourceLocks: [],
      reservedCount: 1,
      blockedCount: 0,
      sourceLockCount: 0,
      sourceArtifactHashes: graph.sourceArtifactHashes,
      artifactRefs: [],
      artifact: "runs/scheduler-runs/ready-set-change/scheduler-run-1/reservation.json",
      markdownArtifact: "runs/scheduler-runs/ready-set-change/scheduler-run-1/reservation.md",
      createdAt: "2026-07-10T00:00:02.000Z",
    };
    expect(resolveSchedulerCurrentTransition({
      graph,
      reservation,
      workerPaths: [],
    })).toMatchObject({
      kind: "start-first-worker",
      actionType: "planning.scheduler.worker.start-first",
      reservationIntent: { claimIntentId: claim.claimIntentId },
    });
  });
});
