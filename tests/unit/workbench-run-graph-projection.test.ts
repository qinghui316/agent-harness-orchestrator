import { describe, expect, it } from "vitest";
import { buildDemandAgentRunGraph } from "../../src/workbench/projections/read-model/run-graph.js";
import type { WorkbenchConfirmationQueue, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../src/workbench/read-model-types.js";
import type { ManagedProject } from "../../src/types/index.js";

describe("Workbench run graph projection", () => {
  it("adds visual metadata for Scheduler worker branches and integration joins", () => {
    const graph = buildDemandAgentRunGraph({
      project: { id: "repo" } as ManagedProject,
      selectedTopic: { id: "change-1", title: "Two file task", updatedAt: "2026-06-26T00:00:00.000Z" } as WorkbenchTopicDetail,
      confirmationQueue: { current: [], otherDemands: [], maintenance: [], history: [] } as unknown as WorkbenchConfirmationQueue,
      workpad: workpadWithTwoWorkers(),
    });

    const workerNodes = graph.nodes.filter((node) => node.kind === "scheduler-worker");
    const candidate = graph.nodes.find((node) => node.kind === "scheduler-integration-candidate");

    expect(workerNodes).toHaveLength(2);
    expect(workerNodes.every((node) => node.stage === "execution" && node.visualKind === "worker")).toBe(true);
    expect(candidate).toMatchObject({ stage: "integration", visualKind: "review" });
    expect(graph.edges.filter((edge) => edge.edgeRole === "worker-join")).toHaveLength(2);
    expect(graph.edges.every((edge) => graph.nodes.some((node) => node.id === edge.from) && graph.nodes.some((node) => node.id === edge.to))).toBe(true);
  });
});

function workpadWithTwoWorkers(): WorkbenchWorkpad {
  const workerPath = (suffix: string) => ({
    start: {
      id: `start-${suffix}`,
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerReconcileSnapshotId: "snapshot-1",
      status: "started",
      reservationIntentId: `reservation-${suffix}`,
      claimIntentId: `claim-${suffix}`,
      nodeId: `node-${suffix}`,
      unitId: `unit-${suffix}`,
      stageId: `stage-${suffix}`,
      stage: "coder",
      taskRunId: `task-run-${suffix}`,
      workerLeaseId: `lease-${suffix}`,
      worktreeId: `wt-${suffix}`,
      runId: `run-${suffix}`,
      artifact: `worker-${suffix}.json`,
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
    result: {
      id: `result-${suffix}`,
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerWorkerStartId: `start-${suffix}`,
      status: "evidence-ready",
      reservationIntentId: `reservation-${suffix}`,
      claimIntentId: `claim-${suffix}`,
      nodeId: `node-${suffix}`,
      unitId: `unit-${suffix}`,
      stageId: `stage-${suffix}`,
      stage: "coder",
      taskRunId: `task-run-${suffix}`,
      workerLeaseId: `lease-${suffix}`,
      taskRunStatus: "completed",
      workerLeaseStatus: "released",
      worktreeId: `wt-${suffix}`,
      runId: `run-${suffix}`,
      artifact: `result-${suffix}.json`,
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
    validation: {
      id: `validation-${suffix}`,
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerWorkerStartId: `start-${suffix}`,
      schedulerWorkerResultId: `result-${suffix}`,
      status: "passed",
      reservationIntentId: `reservation-${suffix}`,
      claimIntentId: `claim-${suffix}`,
      nodeId: `node-${suffix}`,
      unitId: `unit-${suffix}`,
      stageId: `stage-${suffix}`,
      stage: "validation",
      taskRunId: `task-run-${suffix}`,
      workerLeaseId: `lease-${suffix}`,
      taskRunStatus: "completed",
      worktreeId: `wt-${suffix}`,
      codeRunId: `run-${suffix}`,
      validationRunId: `validation-run-${suffix}`,
      validationStatus: "passed",
      artifact: `validation-${suffix}.json`,
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
    audit: {
      id: `audit-${suffix}`,
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerWorkerStartId: `start-${suffix}`,
      schedulerWorkerResultId: `result-${suffix}`,
      schedulerWorkerValidationId: `validation-${suffix}`,
      status: "approved",
      reservationIntentId: `reservation-${suffix}`,
      claimIntentId: `claim-${suffix}`,
      nodeId: `node-${suffix}`,
      unitId: `unit-${suffix}`,
      stageId: `stage-${suffix}`,
      stage: "audit",
      taskRunId: `task-run-${suffix}`,
      workerLeaseId: `lease-${suffix}`,
      taskRunStatus: "completed",
      worktreeId: `wt-${suffix}`,
      codeRunId: `run-${suffix}`,
      validationRunId: `validation-run-${suffix}`,
      validationStatus: "passed",
      auditRunId: `audit-run-${suffix}`,
      auditStatus: "approved",
      artifact: `audit-${suffix}.json`,
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
    status: "audit-approved",
    terminal: true,
  });

  return {
    conversationLifecycle: "waiting-user",
    intake: { goal: "Edit two files", currentUnderstanding: "Two independent files" },
    schedulerWorkerPaths: [workerPath("a"), workerPath("b")],
    schedulerIntegrationCandidate: {
      id: "candidate-1",
      changeId: "change-1",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "reservation-1",
      schedulerReconcileSnapshotId: "snapshot-1",
      status: "ready",
      readyCount: 2,
      blockedCount: 0,
      readyWorktreeIds: ["wt-a", "wt-b"],
      outputClaimIntentIds: ["claim-a", "claim-b"],
      artifact: "candidate.json",
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
  } as unknown as WorkbenchWorkpad;
}
