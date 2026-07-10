import { describe, expect, it } from "vitest";
import { resolveSchedulerCurrentTransition, schedulerTransitionMatchesStartRequest, type SchedulerCurrentTransitionWorkerPath } from "../../src/workflow-actions/scheduler-current-transition.js";
import type { ReadySetWorkflowGraphPlan } from "../../src/types/index.js";

const reservation = {
  reservationIntents: [
    { reservationIntentId: "wave-0-a", claimIntentId: "claim-0-a", status: "reserved", waveIndex: 0, sourceScopes: ["src/a.ts"] },
    { reservationIntentId: "wave-0-b", claimIntentId: "claim-0-b", status: "reserved", waveIndex: 0, sourceScopes: ["src/b.ts"] },
    { reservationIntentId: "wave-1-a", claimIntentId: "claim-1-a", status: "reserved", waveIndex: 1, sourceScopes: ["src/c.ts"] },
  ],
};

describe("Scheduler current transition", () => {
  it("returns exact start-first before any worker has started", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [],
    });

    expect(transition).toMatchObject({
      kind: "start-first-worker",
      actionType: "planning.scheduler.worker.start-first",
      reservationIntent: { reservationIntentId: "wave-0-a", claimIntentId: "claim-0-a" },
    });
    expect(schedulerTransitionMatchesStartRequest({
      transition,
      actionType: "planning.scheduler.worker.start-first",
      reservationIntentId: "wave-0-a",
      claimIntentId: "claim-0-a",
    })).toBe(true);
    expect(schedulerTransitionMatchesStartRequest({
      transition,
      actionType: "planning.scheduler.worker.start-first",
      reservationIntentId: "wave-0-b",
      claimIntentId: "claim-0-b",
    })).toBe(false);
  });

  it("uses ready-set graph order as the start target contract", () => {
    const transition = resolveSchedulerCurrentTransition({
      graph: readySetGraph(["claim-0-b", "claim-0-a", "claim-1-a"]),
      reservation,
      workerPaths: [],
    });

    expect(transition).toMatchObject({
      kind: "start-first-worker",
      actionType: "planning.scheduler.worker.start-first",
      reservationIntent: { reservationIntentId: "wave-0-b", claimIntentId: "claim-0-b" },
    });
  });

  it("treats legacy projections without reservation intents as non-runnable instead of throwing", () => {
    expect(resolveSchedulerCurrentTransition({
      reservation: {} as Parameters<typeof resolveSchedulerCurrentTransition>[0]["reservation"],
      workerPaths: [],
    })).toMatchObject({
      kind: "none",
      reason: "Scheduler first worker has no runnable reservation intent.",
    });
  });

  it("returns same-wave start-next before integration while a sibling is running", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: false },
      ],
    });

    expect(transition).toMatchObject({
      kind: "start-same-wave-worker",
      actionType: "planning.scheduler.worker.start-next",
      reservationIntent: { reservationIntentId: "wave-0-b", claimIntentId: "claim-0-b" },
    });
  });

  it("keeps the current worker step behind the wave barrier", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: true },
        workerPath("result-pending", "wave-0-b"),
      ],
      integrationCandidate: { status: "waiting", readyCount: 2, blockedCount: 0 },
      integrationCandidateNeedsRefresh: false,
    });

    expect(transition).toMatchObject({
      kind: "worker-step",
      actionType: "planning.scheduler.worker.reconcile-result",
      worker: { schedulerWorkerStartId: "start-wave-0-b" },
    });
  });

  it.each([
    ["result-pending", "planning.scheduler.worker.reconcile-result", "schedulerWorkerStartId", "start-wave-0-a"],
    ["validation-pending", "planning.scheduler.worker.validate-first", "schedulerWorkerResultId", "result-wave-0-a"],
    ["audit-pending", "planning.scheduler.worker.audit-first", "schedulerWorkerValidationId", "validation-wave-0-a"],
    ["rework-plan-pending", "planning.scheduler.worker.rework-plan.compile", "schedulerWorkerValidationId", "validation-wave-0-a"],
    ["rework-start-pending", "planning.scheduler.worker.rework-start-first", "schedulerWorkerReworkPlanId", "rework-plan-wave-0-a"],
    ["rework-result-pending", "planning.scheduler.worker.rework-reconcile-result", "schedulerWorkerReworkStartId", "rework-start-wave-0-a"],
    ["rework-validation-pending", "planning.scheduler.worker.rework-validate-first", "schedulerWorkerReworkResultId", "rework-result-wave-0-a"],
    ["rework-audit-pending", "planning.scheduler.worker.rework-audit-first", "schedulerWorkerReworkValidationId", "rework-validation-wave-0-a"],
  ] as const)("maps canonical worker status %s to %s", (status, actionType, targetKey, targetId) => {
    const transition = resolveSchedulerCurrentTransition({
      reservation: { reservationIntents: [reservation.reservationIntents[0]] },
      workerPaths: [workerPath(status, "wave-0-a")],
    });

    expect(transition).toMatchObject({
      kind: "worker-step",
      actionType,
      worker: { [targetKey]: targetId },
    });
  });

  it("fails closed when canonical status lacks its exact evidence target", () => {
    const path = workerPath("validation-pending", "wave-0-a");
    path.result = null;

    expect(resolveSchedulerCurrentTransition({
      reservation: { reservationIntents: [reservation.reservationIntents[0]] },
      workerPaths: [path],
    })).toMatchObject({
      kind: "blocked",
      reason: "Canonical Scheduler worker path is missing schedulerWorkerResultId.",
    });
  });

  it("returns next-wave start-next after the current wave is terminal", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: true },
        { start: { reservationIntentId: "wave-0-b" }, terminal: true },
      ],
      integrationCandidate: { status: "waiting", readyCount: 2, blockedCount: 0 },
      integrationCandidateNeedsRefresh: false,
    });

    expect(transition).toMatchObject({
      kind: "start-next-wave-worker",
      actionType: "planning.scheduler.worker.start-next",
      reservationIntent: { reservationIntentId: "wave-1-a", claimIntentId: "claim-1-a" },
    });
  });

  it("returns integration-ready only after all waves are terminal", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: true },
        { start: { reservationIntentId: "wave-0-b" }, terminal: true },
        { start: { reservationIntentId: "wave-1-a" }, terminal: true },
      ],
      integrationCandidate: { status: "waiting", readyCount: 2, blockedCount: 0 },
      integrationCandidateNeedsRefresh: false,
    });

    expect(transition).toMatchObject({
      kind: "integration-check",
      actionType: "planning.scheduler.integration-check.run",
    });
  });

  it("returns integration candidate only after all waves are terminal and no worker remains", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: true },
        { start: { reservationIntentId: "wave-0-b" }, terminal: true },
        { start: { reservationIntentId: "wave-1-a" }, terminal: true },
      ],
    });

    expect(transition).toMatchObject({
      kind: "integration-candidate",
      actionType: "planning.scheduler.integration-candidate.compile",
    });
  });

  it("blocks a wave with conflicting source scopes before selecting a worker", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation: {
        reservationIntents: [
          { reservationIntentId: "wave-0-a", claimIntentId: "claim-0-a", status: "reserved", waveIndex: 0, sourceScopes: ["src/shared.ts"] },
          { reservationIntentId: "wave-0-b", claimIntentId: "claim-0-b", status: "reserved", waveIndex: 0, sourceScopes: ["src/shared.ts"] },
        ],
      },
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: false },
      ],
    });

    expect(transition).toMatchObject({
      kind: "blocked",
      reason: "Scheduler wave 0 has conflicting source scopes.",
    });
  });

  it.each([
    [{ integrationCheckHandoff: { id: "handoff-1", currentIntegrationCheckStatus: "conflict" } }, "integration-outcome", "planning.scheduler.integration-outcome.reconcile"],
    [{ integrationOutcomeExists: true, integrationOutcomeId: "outcome-1" }, "run-complete", "planning.scheduler.run.complete"],
    [{ integrationCandidate: { id: "candidate-1", readyCount: 1, blockedCount: 1 }, integrationCandidateNeedsRefresh: false }, "close-blocked", "planning.scheduler.run.close-blocked"],
  ] as const)("covers terminal chain transition %s", (extra, kind, actionType) => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: reservation.reservationIntents.map((intent) => ({ start: { reservationIntentId: intent.reservationIntentId }, terminal: true })),
      integrationCandidate: { id: "candidate-1", readyCount: 2, blockedCount: 0 },
      integrationCandidateNeedsRefresh: false,
      ...extra,
    });

    expect(transition).toMatchObject({ kind, actionType });
  });
});

function workerPath(status: string, reservationIntentId: string): SchedulerCurrentTransitionWorkerPath {
  return {
    start: { id: `start-${reservationIntentId}`, reservationIntentId, claimIntentId: `claim-${reservationIntentId}` },
    result: { id: `result-${reservationIntentId}` },
    validation: { id: `validation-${reservationIntentId}` },
    audit: null,
    reworkPlan: { id: `rework-plan-${reservationIntentId}` },
    reworkStart: { id: `rework-start-${reservationIntentId}` },
    reworkResult: { id: `rework-result-${reservationIntentId}` },
    reworkValidation: { id: `rework-validation-${reservationIntentId}` },
    reworkAudit: null,
    status,
    terminal: false,
  };
}

function readySetGraph(claimIntentIds: string[]): ReadySetWorkflowGraphPlan {
  return {
    version: "1.0",
    id: "graph-ready-set",
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
    nodes: claimIntentIds.map((claimIntentId) => ({
      id: `node-${claimIntentId}`,
      schedulerNodeId: `scheduler-node-${claimIntentId}`,
      unitId: `unit-${claimIntentId}`,
      taskIds: [`task-${claimIntentId}`],
      title: claimIntentId,
      waveIndex: claimIntentId === "claim-1-a" ? 1 : 0,
      stages: ["coder", "validation", "audit"],
      stageRefs: [],
      acIds: [],
      sourceScopes: [`src/${claimIntentId}.ts`],
      claimIntentId,
      plannedWorkerKey: `worker-${claimIntentId}`,
      roleIds: ["coder-agent"],
      plannedSlotDemand: 1,
      sourceLocks: [{
        scope: `src/${claimIntentId}.ts`,
        nodeId: `node-${claimIntentId}`,
        unitId: `unit-${claimIntentId}`,
        waveIndex: claimIntentId === "claim-1-a" ? 1 : 0,
        claimIntentId,
        stageIds: [],
      }],
      recoveryKeyInputs: [],
      status: "planned",
      blockedReasons: [],
    })),
    edges: [],
    waves: [
      {
        index: 0,
        nodeIds: claimIntentIds.filter((id) => id !== "claim-1-a").map((id) => `node-${id}`),
        claimIntentIds: claimIntentIds.filter((id) => id !== "claim-1-a"),
        candidateCount: claimIntentIds.filter((id) => id !== "claim-1-a").length,
        blockedCount: 0,
        plannedSlotDemand: claimIntentIds.filter((id) => id !== "claim-1-a").length,
        blockedReasons: [],
      },
      {
        index: 1,
        nodeIds: claimIntentIds.filter((id) => id === "claim-1-a").map((id) => `node-${id}`),
        claimIntentIds: claimIntentIds.filter((id) => id === "claim-1-a"),
        candidateCount: claimIntentIds.filter((id) => id === "claim-1-a").length,
        blockedCount: 0,
        plannedSlotDemand: claimIntentIds.filter((id) => id === "claim-1-a").length,
        blockedReasons: [],
      },
    ],
    plannedSlotDemand: claimIntentIds.length,
    maxPlannedWaveWidth: 2,
    recoveryKeyCoverage: "complete",
    sourceArtifactHashes: {},
    artifactRefs: [],
    artifact: "graph.json",
    markdownArtifact: "graph.md",
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}
