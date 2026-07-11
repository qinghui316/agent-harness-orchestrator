import { describe, expect, it } from "vitest";
import { resolveSchedulerCurrentTransition } from "../../src/workflow-actions/scheduler-current-transition.js";
import { assertSchedulerCurrentTransitionAction } from "../../src/workflow-runtime/scheduler-current-transition-view.js";
import { resolveSchedulerReadySetWorkerStartTarget } from "../../src/workflow-runtime/scheduler-ready-set.js";
import type { ReadySetWorkflowGraphPlan } from "../../src/types/index.js";
import type { SchedulerCurrentTransitionView } from "../../src/workflow-runtime/scheduler-current-transition-view.js";

describe("Scheduler ready-set single-transition runtime owner", () => {
  it("derives an exact worker start target from the ready-set graph", () => {
    const view = currentView();

    const target = resolveSchedulerReadySetWorkerStartTarget({
      view,
      actionType: "planning.scheduler.worker.start-first",
      reservationIntentId: "reservation-a",
      claimIntentId: "claim-a",
    });

    expect(target).toMatchObject({
      graphId: "ready-set-graph-1",
      graphNodeId: "ready-node-a",
      schedulerNodeId: "scheduler-node-a",
      unitId: "unit-a",
      stageRefId: "stage-a-coder",
      taskId: "T-001",
      prompt: "Objective: implement node a.",
      reservationIntentId: "reservation-a",
      claimIntentId: "claim-a",
    });
    expect(target.sourceLocks).toEqual([expect.objectContaining({ scope: "src/a.ts", claimIntentId: "claim-a" })]);
  });

  it("rejects stale requested targets before a leaf can start", () => {
    const view = currentView();

    expect(() => resolveSchedulerReadySetWorkerStartTarget({
      view,
      actionType: "planning.scheduler.worker.start-first",
      reservationIntentId: "reservation-b",
      claimIntentId: "claim-b",
    })).toThrow("must target the current Scheduler ready-set transition");
  });

  it("rejects an already-started requested target as stale", () => {
    const view = currentView({ startedIntentIds: ["reservation-a"] });

    expect(() => resolveSchedulerReadySetWorkerStartTarget({
      view,
      actionType: "planning.scheduler.worker.start-first",
      reservationIntentId: "reservation-a",
      claimIntentId: "claim-a",
    })).toThrow("must target the current Scheduler ready-set transition");
  });

  it("rejects a graph node without exactly one planned coder stage", () => {
    const graph = readySetGraph();
    graph.nodes[0] = { ...graph.nodes[0], stageRefs: [] };
    const view = currentView({ graph });

    expect(() => resolveSchedulerReadySetWorkerStartTarget({
      view,
      actionType: "planning.scheduler.worker.start-first",
      reservationIntentId: "reservation-a",
      claimIntentId: "claim-a",
    })).toThrow("requires exactly one planned coder stage");
  });

  it("rejects integration and close actions while a current-wave worker is non-terminal", () => {
    const view = currentView({ startedIntentIds: ["reservation-a"] });

    expect(() => assertSchedulerCurrentTransitionAction(view, "planning.scheduler.integration-candidate.compile"))
      .toThrow("planning.scheduler.integration-candidate.compile is blocked by the current Scheduler ready-set transition");
    expect(() => assertSchedulerCurrentTransitionAction(view, "planning.scheduler.integration-check.run"))
      .toThrow("planning.scheduler.integration-check.run is blocked by the current Scheduler ready-set transition");
    expect(() => assertSchedulerCurrentTransitionAction(view, "planning.scheduler.run.close-blocked"))
      .toThrow("planning.scheduler.run.close-blocked is blocked by the current Scheduler ready-set transition");
  });

  it("allows integration candidate only after all ready-set workers are terminal", () => {
    const view = currentView({
      workerPaths: [
        { start: { reservationIntentId: "reservation-a" }, terminal: true },
        { start: { reservationIntentId: "reservation-b" }, terminal: true },
      ],
    });

    expect(view.transition.kind).toBe("integration-candidate");
    expect(() => assertSchedulerCurrentTransitionAction(view, "planning.scheduler.integration-candidate.compile"))
      .not.toThrow();
    expect(() => assertSchedulerCurrentTransitionAction(view, "planning.scheduler.integration-check.run"))
      .toThrow("planning.scheduler.integration-check.run is blocked by the current Scheduler ready-set transition");
  });
});

function currentView(options: {
  graph?: ReadySetWorkflowGraphPlan;
  startedIntentIds?: string[];
  workerPaths?: Array<{ start: { reservationIntentId: string }; terminal: boolean }>;
} = {}): SchedulerCurrentTransitionView {
  const graph = options.graph ?? readySetGraph();
  const reservation = {
    version: "1.0",
    id: "reservation-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerRuntimeStateId: "runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    status: "reserved",
    reservedCount: 2,
    reservationIntents: [
      {
        reservationIntentId: "reservation-a",
        claimIntentId: "claim-a",
        status: "reserved",
        plannedWorkerKey: "worker-a",
        nodeId: "scheduler-node-a",
        unitId: "unit-a",
        waveIndex: 0,
        sourceScopes: ["src/a.ts"],
      },
      {
        reservationIntentId: "reservation-b",
        claimIntentId: "claim-b",
        status: "reserved",
        plannedWorkerKey: "worker-b",
        nodeId: "scheduler-node-b",
        unitId: "unit-b",
        waveIndex: 0,
        sourceScopes: ["src/b.ts"],
      },
    ],
  };
  const workerPaths = options.workerPaths ?? (options.startedIntentIds ?? []).map((reservationIntentId) => ({
    start: { reservationIntentId },
    terminal: false,
  }));
  return {
    run: { id: "scheduler-run-1", changeId: "change-1" },
    runtimeState: { id: "runtime-state-1", schedulerRunId: "scheduler-run-1", changeId: "change-1" },
    reservation,
    graph,
    workerPaths,
    integrationCandidate: null,
    integrationCandidateNeedsRefresh: true,
    integrationCheckHandoffExists: false,
    integrationOutcomeExists: false,
    runCompletionExists: false,
    runBlockedCloseoutExists: false,
    transition: resolveSchedulerCurrentTransition({ graph, reservation, workerPaths }),
  } as unknown as SchedulerCurrentTransitionView;
}

function readySetGraph(): ReadySetWorkflowGraphPlan {
  const now = "2026-07-09T00:00:00.000Z";
  return {
    version: "1.0",
    id: "ready-set-graph-1",
    changeId: "change-1",
    status: "compiled",
    graphMode: "ready-set-v1",
    schedulerMode: "parallel-readiness-v1",
    authoringContractVersion: "1.0",
    planArtifactRef: "harness/changes/active/change-1/plan.md",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    nodes: [
      readyNode("a", "claim-a", "scheduler-node-a", "unit-a", "T-001", "src/a.ts"),
      readyNode("b", "claim-b", "scheduler-node-b", "unit-b", "T-002", "src/b.ts"),
    ],
    edges: [],
    waves: [{
      index: 0,
      nodeIds: ["ready-node-a", "ready-node-b"],
      claimIntentIds: ["claim-a", "claim-b"],
      candidateCount: 2,
      blockedCount: 0,
      plannedSlotDemand: 2,
      blockedReasons: [],
    }],
    plannedSlotDemand: 2,
    maxPlannedWaveWidth: 2,
    recoveryKeyCoverage: "complete",
    sourceArtifactHashes: {},
    artifactRefs: [],
    artifact: "graph.json",
    markdownArtifact: "graph.md",
    createdAt: now,
    updatedAt: now,
  };
}

function readyNode(
  suffix: string,
  claimIntentId: string,
  schedulerNodeId: string,
  unitId: string,
  taskId: string,
  scope: string,
): ReadySetWorkflowGraphPlan["nodes"][number] {
  return {
    id: `ready-node-${suffix}`,
    schedulerNodeId,
    unitId,
    taskIds: [taskId],
    title: `Node ${suffix}`,
    prompt: `Objective: implement node ${suffix}.`,
    waveIndex: 0,
    stages: ["coder", "validation", "audit"],
    stageRefs: [{
      id: `stage-${suffix}-coder`,
      stage: "coder",
      roleId: "coder",
      adapterFamily: "codex-code",
      status: "planned",
      sourceScopes: [scope],
      recoveryKeyInputs: [{ key: "scope", value: scope }],
      blockedReasons: [],
    }],
    acIds: ["AC-001"],
    sourceScopes: [scope],
    claimIntentId,
    plannedWorkerKey: `worker-${suffix}`,
    roleIds: ["coder-agent"],
    plannedSlotDemand: 1,
    sourceLocks: [{
      scope,
      nodeId: schedulerNodeId,
      unitId,
      waveIndex: 0,
      claimIntentId,
      stageIds: [`stage-${suffix}-coder`],
    }],
    recoveryKeyInputs: [{ key: "node", value: schedulerNodeId }],
    status: "planned",
    blockedReasons: [],
  };
}
