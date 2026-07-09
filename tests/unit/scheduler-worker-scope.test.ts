import { describe, expect, it } from "vitest";
import {
  buildSchedulerWorkerScopeContext,
  composeSchedulerWorkerAuditScopePrompt,
  composeSchedulerWorkerReworkScopePrompt,
  findSiblingSourceScopeWrites,
  parseDiffChangedPaths,
} from "../../src/scheduler-runtime/worker-scope.js";
import type { ChangeStatus } from "../../src/types/index.js";
import type { SchedulerRuntimeClaimReservation } from "../../src/scheduler-runtime/types.js";

describe("scheduler worker task scope", () => {
  it("tells worker audit to ignore unimplemented sibling task scopes", () => {
    const context = buildSchedulerWorkerScopeContext(changeStatus(), reservation(), reservation().reservationIntents[0], "T-001");

    const prompt = composeSchedulerWorkerAuditScopePrompt(context);

    expect(prompt).toContain("audit only task T-001");
    expect(prompt).toContain("Current worker source scopes: src/alpha.ts.");
    expect(prompt).toContain("Sibling scheduler source scopes not assigned to this worker: src/beta.ts.");
    expect(prompt).toContain("Do not block this worker only because those sibling tasks are not implemented yet.");
    expect(prompt).toContain("later scheduler workers and IntegrationCheck handle sibling outputs");
  });

  it("keeps rework inside the assigned worker and flags sibling source writes", () => {
    const context = buildSchedulerWorkerScopeContext(changeStatus(), reservation(), reservation().reservationIntents[0], "T-001");
    const prompt = composeSchedulerWorkerReworkScopePrompt(context, "audit-blocked", "Missing betaLabel export");

    expect(prompt).toContain("Rework the scheduler worker result for task T-001.");
    expect(prompt).toContain("Do not modify sibling scheduler source scopes: src/beta.ts.");
    expect(prompt).toContain("If the blocker only concerns a sibling task, report blocked instead of editing that sibling scope.");

    const diff = [
      "diff --git a/src/alpha.ts b/src/alpha.ts",
      "index 1111111..2222222 100644",
      "--- a/src/alpha.ts",
      "+++ b/src/alpha.ts",
      "diff --git a/tests/alpha-label.test.ts b/tests/alpha-label.test.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/tests/alpha-label.test.ts",
      "diff --git a/src/beta.ts b/src/beta.ts",
      "index 3333333..4444444 100644",
      "--- a/src/beta.ts",
      "+++ b/src/beta.ts",
    ].join("\n");

    expect(parseDiffChangedPaths(diff)).toEqual(["src/alpha.ts", "src/beta.ts", "tests/alpha-label.test.ts"]);
    expect(findSiblingSourceScopeWrites(diff, context)).toEqual(["src/beta.ts"]);
  });
});

function changeStatus(): ChangeStatus {
  return {
    root: "harness/changes",
    activeChanges: [{ name: "change-1", path: "harness/changes/active/change-1" }],
    parkingChanges: [],
    archivedChanges: [],
    change: null,
    spec: null,
    plan: null,
    tasks: null,
    acMap: {
      tasks: [
        { id: "T-001", text: "Add alphaLabel in src/alpha.ts.", acIds: ["AC-001"] },
        { id: "T-002", text: "Add betaLabel in src/beta.ts.", acIds: ["AC-001"] },
      ],
    },
    latestValidation: null,
    latestAudit: null,
    latestSpecTest: null,
    worktrees: [],
  };
}

function reservation(): SchedulerRuntimeClaimReservation {
  return {
    version: "1.0",
    id: "reservation-1",
    changeId: "change-1",
    schedulerRunId: "scheduler-run-1",
    schedulerMode: "parallel-readiness-v1",
    status: "reserved",
    schedulerRuntimeStateId: "runtime-state-1",
    schedulerReconcileSnapshotId: "snapshot-1",
    schedulerContractId: "contract-1",
    schedulerDispatchDryRunId: "dry-run-1",
    schedulerWorkerPlanId: "worker-plan-1",
    schedulerClaimReconcilePlanId: "claim-plan-1",
    schedulerLaunchPreflightId: "preflight-1",
    reservationIntents: [
      {
        reservationIntentId: "reservation-intent-alpha",
        claimIntentId: "claim-alpha",
        plannedWorkerKey: "worker-alpha",
        nodeId: "scheduler-node-001",
        unitId: "DU-001",
        waveIndex: 0,
        status: "reserved",
        plannedSlotDemand: 1,
        sourceScopes: ["src/alpha.ts"],
        blockedReasons: [],
      },
      {
        reservationIntentId: "reservation-intent-beta",
        claimIntentId: "claim-beta",
        plannedWorkerKey: "worker-beta",
        nodeId: "scheduler-node-002",
        unitId: "DU-002",
        waveIndex: 0,
        status: "reserved",
        plannedSlotDemand: 1,
        sourceScopes: ["src/beta.ts"],
        blockedReasons: [],
      },
    ],
    waves: [{
      waveIndex: 0,
      reservationIntentIds: ["reservation-intent-alpha", "reservation-intent-beta"],
      reservedCount: 2,
      blockedCount: 0,
      plannedSlotDemand: 2,
      status: "reserved",
      blockedReasons: [],
    }],
    sourceLocks: [],
    reservedCount: 2,
    blockedCount: 0,
    sourceLockCount: 0,
    sourceArtifactHashes: {},
    artifactRefs: [],
    artifact: "reservation-1.json",
    markdownArtifact: "reservation-1.md",
    createdAt: "2026-06-25T00:00:00.000Z",
  };
}
