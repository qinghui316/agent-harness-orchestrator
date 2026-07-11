import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertLatestSchedulerRuntimeClaimReservationForSnapshot } from "../../src/scheduler-runtime/guards.js";
import { assertLatestWorkbenchActionTarget, assertPreparedWorkbenchActionTarget, assertWorkbenchActionChangeScope, assertWorkbenchActionOptionalStringTarget, assertWorkbenchActionStringArrayTarget } from "../../src/workbench/actions/active-target.js";
import { selectLandingReviewArtifactRef, selectLandingSummaryArtifactRef } from "../../src/workbench/artifact-selection.js";
import { evidenceActions } from "../../src/workbench/projections/read-model/evidence-actions.js";
import { evidenceRefs } from "../../src/workbench/projections/read-model/evidence-refs.js";
import { latestByCreatedAt, latestByTimestamp, latestUnhandledByCreatedAt, projectFields, sortByTimestampDesc } from "../../src/workbench/projections/read-model/projection-summary.js";

describe("Workbench helper boundaries", () => {
  it("keeps projection summary helpers pure and owned by read-model projections", () => {
    const records = [
      { id: "older", createdAt: "2026-06-18T00:00:00.000Z", extra: "keep" },
      { id: "newer", createdAt: "2026-06-19T00:00:00.000Z", extra: "drop" },
    ];
    const originalOrder = records.map((record) => record.id);

    expect(latestByCreatedAt(records)?.id).toBe("newer");
    expect(records.map((record) => record.id)).toEqual(originalOrder);
    expect(sortByTimestampDesc(records, (record) => record.createdAt).map((record) => record.id)).toEqual(["newer", "older"]);
    expect(records.map((record) => record.id)).toEqual(originalOrder);
    expect(latestByTimestamp(records, (record) => record.createdAt)?.id).toBe("newer");
    expect(projectFields(records[1], ["id", "createdAt"] as const)).toEqual({
      id: "newer",
      createdAt: "2026-06-19T00:00:00.000Z",
    });

    const optionalTimestampRecords: Array<{ id: string; finishedAt?: string | null }> = [
      { id: "missing" },
      { id: "old", finishedAt: "2026-06-17T00:00:00.000Z" },
      { id: "new", finishedAt: "2026-06-20T00:00:00.000Z" },
      { id: "empty", finishedAt: null },
    ];
    const optionalOriginalOrder = optionalTimestampRecords.map((record) => record.id);
    expect(latestByTimestamp(optionalTimestampRecords, (record) => record.finishedAt)?.id).toBe("new");
    expect(sortByTimestampDesc(optionalTimestampRecords, (record) => record.finishedAt).map((record) => record.id)).toEqual(["new", "old", "missing", "empty"]);
    expect(optionalTimestampRecords.map((record) => record.id)).toEqual(optionalOriginalOrder);

    const unhandledRecords = [
      { id: "eligible-old", createdAt: "2026-06-17T00:00:00.000Z", status: "ready" },
      { id: "eligible-new", createdAt: "2026-06-20T00:00:00.000Z", status: "ready" },
      { id: "handled-newest", createdAt: "2026-06-21T00:00:00.000Z", status: "ready" },
      { id: "blocked-latest", createdAt: "2026-06-22T00:00:00.000Z", status: "blocked" },
    ];
    const unhandledOriginalOrder = unhandledRecords.map((record) => record.id);
    const selectedUnhandled = latestUnhandledByCreatedAt(
      unhandledRecords,
      [{ targetId: "handled-newest" }],
      (record) => record.id,
      (handled) => handled.targetId,
      (record) => record.status === "ready",
    );
    expect(selectedUnhandled?.id).toBe("eligible-new");
    expect(unhandledRecords.map((record) => record.id)).toEqual(unhandledOriginalOrder);

    const helper = readFileSync("src/workbench/projections/read-model/projection-summary.ts", "utf8");
    expect(helper).toContain("latestByTimestamp(items, (item) => item.createdAt)");
    expect(helper).toContain("latestUnhandledByCreatedAt");
    expect(helper).not.toContain("from \"../../manager");
    expect(helper).not.toContain("from \"../../../server");
    expect(helper).not.toContain("from \"../../../agent-task");

    const taskGraph = readFileSync("src/workbench/projections/read-model/task-graph.ts", "utf8");
    const workpad = readFileSync("src/workbench/projections/read-model/workpad.ts", "utf8");
    const resultReview = readFileSync("src/workbench/projections/read-model/result-review.ts", "utf8");
    const decisionInspector = readFileSync("src/workbench/projections/read-model/decision-inspector.ts", "utf8");
    expect(taskGraph).toContain('from "./projection-summary.js"');
    expect(workpad).toContain('from "./projection-summary.js"');
    expect(resultReview).toContain('from "./projection-summary.js"');
    expect(decisionInspector).toContain('from "./projection-summary.js"');
    expect(decisionInspector).toContain("function compareDecisionContexts");
  });

  it("keeps read-model evidence action helpers pure and shared across projection surfaces", () => {
    expect(evidenceActions()).toEqual([]);
    expect(evidenceActions("runs/audit.md")).toEqual([{
      id: "evidence:runs/audit.md",
      label: "查看证据",
      kind: "evidence",
      enabled: true,
      requiresConfirmation: false,
      artifact: "runs/audit.md",
    }]);
    expect(evidenceActions("runs/audit.md", { label: "查看审查证据" })[0]).toMatchObject({
      id: "evidence:runs/audit.md",
      label: "查看审查证据",
      kind: "evidence",
      enabled: true,
      requiresConfirmation: false,
      artifact: "runs/audit.md",
    });

    const helper = readFileSync("src/workbench/projections/read-model/evidence-actions.ts", "utf8");
    expect(helper).toContain("export function evidenceActions");
    expect(helper).not.toMatch(/workbench\/actions|server\/|manager|ToolPolicy|approvalAction|scopeConfirmationQueueItemActions/);

    const decisionInspector = readFileSync("src/workbench/projections/read-model/decision-inspector.ts", "utf8");
    expect(decisionInspector).toContain('from "./evidence-actions.js"');
    expect(decisionInspector).not.toContain("function evidenceActions");

    const confirmationShared = readFileSync("src/workbench/projections/read-model/confirmation/shared.ts", "utf8");
    expect(confirmationShared).not.toContain("function evidenceActions");
    expect(confirmationShared).toContain("scopeConfirmationQueueItemActions");
    expect(confirmationShared).toContain("approvalAction");

    const integrationConfirmation = readFileSync("src/workbench/projections/read-model/confirmation/integration.ts", "utf8");
    const landingConfirmation = readFileSync("src/workbench/projections/read-model/confirmation/landing.ts", "utf8");
    expect(integrationConfirmation).toContain('from "../evidence-actions.js"');
    expect(landingConfirmation).toContain('from "../evidence-actions.js"');
    expect(`${integrationConfirmation}\n${landingConfirmation}`).not.toMatch(/evidenceActions\([^)]*\)\.map/);
  });

  it("keeps read-model evidence ref helpers pure and shared across confirmation projections", () => {
    expect(evidenceRefs()).toEqual([]);
    expect(evidenceRefs(undefined, "first.md", null, "", "second.md", "first.md")).toEqual(["first.md", "second.md", "first.md"]);

    const helper = readFileSync("src/workbench/projections/read-model/evidence-refs.ts", "utf8");
    expect(helper).toContain("export function evidenceRefs");
    expect(helper).not.toMatch(/WorkbenchDecisionAction|workbench\/actions|server\/|manager|ToolPolicy|approvalAction|scopeConfirmationQueueItemActions/);

    const typedWorkflow = readFileSync("src/workbench/projections/read-model/confirmation/typed-workflow.ts", "utf8");
    const decisionContext = readFileSync("src/workbench/projections/read-model/confirmation/decision-context.ts", "utf8");
    expect(typedWorkflow).toContain('from "../evidence-refs.js"');
    expect(decisionContext).toContain('from "../evidence-refs.js"');
    expect(`${typedWorkflow}\n${decisionContext}`).not.toMatch(/evidenceRefs:\s*[^,\n]+\.artifact\s*\?\s*\[[^\]]+\.artifact\]\s*:\s*\[\]/);
    expect(`${typedWorkflow}\n${decisionContext}`).not.toMatch(/evidenceRefs:\s*\[[^\]]+\]\.filter\(\(item\): item is string => Boolean\(item\)\)/);
  });

  it("keeps landing review artifact selection shared across Workbench surfaces", () => {
    const artifactRefs = [
      "landing/landing-123/landing-package.json",
      "landing/landing-123/landing-summary.md",
      "landing/landing-123/source-diff.patch",
      "landing/landing-123/merge-review.md",
    ];
    expect(selectLandingSummaryArtifactRef(artifactRefs)).toBe("landing/landing-123/landing-summary.md");
    expect(selectLandingReviewArtifactRef(artifactRefs)).toBe("landing/landing-123/merge-review.md");
    expect(selectLandingReviewArtifactRef(artifactRefs, { fallback: "package" })).toBe("landing/landing-123/merge-review.md");
    expect(selectLandingReviewArtifactRef(artifactRefs.slice(0, 3))).toBe("landing/landing-123/landing-summary.md");
    expect(selectLandingReviewArtifactRef(artifactRefs.slice(0, 3), { fallback: "package" })).toBe("landing/landing-123/landing-package.json");

    const helper = readFileSync("src/workbench/artifact-selection.ts", "utf8");
    expect(helper).toContain("export function selectLandingReviewArtifactRef");
    expect(helper).not.toMatch(/workbench\/actions|projections\/read-model|server\/|manager|ToolPolicy|approvalAction|scopeConfirmationQueueItemActions/);

    const landingConfirmation = readFileSync("src/workbench/projections/read-model/confirmation/landing.ts", "utf8");
    const remoteHandoff = readFileSync("src/workbench/actions/handlers/remote-handoff.ts", "utf8");
    expect(landingConfirmation).toContain('from "../../../artifact-selection.js"');
    expect(remoteHandoff).toContain('from "../../artifact-selection.js"');
    expect(remoteHandoff).not.toContain("projections/read-model");
    expect(landingConfirmation).not.toContain("actions/results");
    expect(`${landingConfirmation}\n${remoteHandoff}`).not.toMatch(/artifactRefs\.find\(\(ref\) => ref\.endsWith\("merge-review\.md"\)\)/);
    expect(`${landingConfirmation}\n${remoteHandoff}`).not.toMatch(/const reviewArtifact = [^;\n]*artifactRefs\[[01]\]/);
  });

  it("keeps Workbench action target revalidation helpers pure and fail-closed", () => {
    expect(() => assertWorkbenchActionChangeScope("other-change", "current-change", "code.run"))
      .toThrow("code.run changeId scope mismatch.");
    expect(() => assertWorkbenchActionChangeScope("current-change", "current-change", "code.run"))
      .not.toThrow();
    expect(() => assertWorkbenchActionChangeScope(undefined, "current-change", "code.run"))
      .not.toThrow();

    expect(() => assertLatestWorkbenchActionTarget(
      { id: "older-run" },
      { id: "current-run" },
      "planning.scheduler.worker.start-first",
      "SchedulerRun",
    )).toThrow("planning.scheduler.worker.start-first requires the latest SchedulerRun.");
    expect(() => assertLatestWorkbenchActionTarget(
      { id: "current-run" },
      { id: "current-run" },
      "planning.scheduler.worker.start-first",
      "SchedulerRun",
    )).not.toThrow();
    expect(() => assertLatestWorkbenchActionTarget(
      { id: "older-snapshot" },
      { id: "current-snapshot" },
      "planning.scheduler.worker.start-first",
      "SchedulerReconcileSnapshot",
    )).toThrow("planning.scheduler.worker.start-first requires the latest SchedulerReconcileSnapshot.");
    expect(() => assertLatestWorkbenchActionTarget(
      { id: "older-reservation" },
      { id: "current-reservation" },
      "planning.scheduler.worker.start-first",
      "SchedulerRuntimeClaimReservation",
    )).toThrow("planning.scheduler.worker.start-first requires the latest SchedulerRuntimeClaimReservation.");
    expect(() => assertLatestSchedulerRuntimeClaimReservationForSnapshot(
      { id: "reservation-1", schedulerReconcileSnapshotId: "snapshot-1", status: "reserved" },
      { lastClaimReservationId: "reservation-1", lastClaimReservationSnapshotId: "snapshot-1", lastReconcileSnapshotId: "snapshot-1" },
      { id: "snapshot-1" },
      "planning.scheduler.worker.start-first",
      { requiredStatus: "reserved" },
    )).not.toThrow();
    expect(() => assertLatestSchedulerRuntimeClaimReservationForSnapshot(
      { id: "reservation-2", schedulerReconcileSnapshotId: "snapshot-1", status: "reserved" },
      { lastClaimReservationId: "reservation-1", lastClaimReservationSnapshotId: "snapshot-1", lastReconcileSnapshotId: "snapshot-1" },
      { id: "snapshot-1" },
      "planning.scheduler.worker.start-first",
    )).toThrow("planning.scheduler.worker.start-first requires the latest SchedulerRuntimeClaimReservation.");
    expect(() => assertLatestSchedulerRuntimeClaimReservationForSnapshot(
      { id: "reservation-1", schedulerReconcileSnapshotId: "snapshot-2", status: "reserved" },
      { lastClaimReservationId: "reservation-1", lastClaimReservationSnapshotId: "snapshot-1", lastReconcileSnapshotId: "snapshot-1" },
      { id: "snapshot-1" },
      "planning.scheduler.worker.start-first",
    )).toThrow("planning.scheduler.worker.start-first requires the latest SchedulerRuntimeClaimReservation.");
    expect(() => assertLatestSchedulerRuntimeClaimReservationForSnapshot(
      { id: "reservation-1", schedulerReconcileSnapshotId: "snapshot-1", status: "reserved" },
      { lastClaimReservationId: "reservation-1", lastClaimReservationSnapshotId: "snapshot-1", lastReconcileSnapshotId: "snapshot-2" },
      { id: "snapshot-1" },
      "planning.scheduler.worker.start-first",
    )).toThrow("planning.scheduler.worker.start-first requires the latest SchedulerRuntimeClaimReservation.");
    expect(() => assertLatestSchedulerRuntimeClaimReservationForSnapshot(
      { id: "reservation-1", schedulerReconcileSnapshotId: "snapshot-1", status: "blocked" },
      { lastClaimReservationId: "reservation-1", lastClaimReservationSnapshotId: "snapshot-1", lastReconcileSnapshotId: "snapshot-1" },
      { id: "snapshot-1" },
      "planning.scheduler.worker.start-first",
      { requiredStatus: "reserved" },
    )).toThrow("planning.scheduler.worker.start-first SchedulerRuntimeClaimReservation target is stale or not reserved.");
    expect(() => assertPreparedWorkbenchActionTarget(
      { id: "older-run", changeId: "current-change", status: "prepared" },
      "current-run",
      "current-change",
      "planning.scheduler.worker.start-first",
      "SchedulerRun",
    )).toThrow("planning.scheduler.worker.start-first SchedulerRun target is stale or not prepared.");
    expect(() => assertPreparedWorkbenchActionTarget(
      { id: "current-run", changeId: "other-change", status: "prepared" },
      "current-run",
      "current-change",
      "planning.scheduler.worker.start-first",
      "SchedulerRun",
    )).toThrow("planning.scheduler.worker.start-first SchedulerRun target is stale or not prepared.");
    expect(() => assertPreparedWorkbenchActionTarget(
      { id: "current-run", changeId: "current-change", status: "completed" },
      "current-run",
      "current-change",
      "planning.scheduler.worker.start-first",
      "SchedulerRun",
    )).toThrow("planning.scheduler.worker.start-first SchedulerRun target is stale or not prepared.");
    expect(() => assertPreparedWorkbenchActionTarget(
      { id: "current-run", changeId: "current-change", status: "prepared" },
      "current-run",
      "current-change",
      "planning.scheduler.worker.start-first",
      "SchedulerRun",
    )).not.toThrow();
    expect(() => assertWorkbenchActionStringArrayTarget(
      ["worktree-a", "worktree-b"],
      ["worktree-a", "worktree-b"],
      "planning.scheduler.integration-check.run",
      "worktreeIds",
    )).not.toThrow();
    expect(() => assertWorkbenchActionStringArrayTarget(
      ["worktree-b", "worktree-a"],
      ["worktree-a", "worktree-b"],
      "planning.scheduler.integration-check.run",
      "worktreeIds",
    )).toThrow("planning.scheduler.integration-check.run worktreeIds target scope mismatch.");
    expect(() => assertWorkbenchActionStringArrayTarget(
      ["worktree-a"],
      ["worktree-a", "worktree-b"],
      "planning.scheduler.integration-check.run",
      "worktreeIds",
    )).toThrow("planning.scheduler.integration-check.run worktreeIds target scope mismatch.");
    expect(() => assertWorkbenchActionOptionalStringTarget(
      undefined,
      "candidate-current",
      "planning.scheduler.integration-outcome.reconcile",
      "SchedulerIntegrationCandidate",
    )).not.toThrow();
    expect(() => assertWorkbenchActionOptionalStringTarget(
      "",
      "candidate-current",
      "planning.scheduler.integration-outcome.reconcile",
      "SchedulerIntegrationCandidate",
    )).not.toThrow();
    expect(() => assertWorkbenchActionOptionalStringTarget(
      "candidate-current",
      "candidate-current",
      "planning.scheduler.integration-outcome.reconcile",
      "SchedulerIntegrationCandidate",
    )).not.toThrow();
    expect(() => assertWorkbenchActionOptionalStringTarget(
      "candidate-old",
      "candidate-current",
      "planning.scheduler.integration-outcome.reconcile",
      "SchedulerIntegrationCandidate",
    )).toThrow("planning.scheduler.integration-outcome.reconcile SchedulerIntegrationCandidate target scope mismatch.");

    const helper = readFileSync("src/workbench/actions/active-target.ts", "utf8");
    expect(helper).toContain("assertWorkbenchActionChangeScope");
    expect(helper).toContain("assertLatestWorkbenchActionTarget");
    expect(helper).toContain("assertPreparedWorkbenchActionTarget");
    expect(helper).toContain("assertWorkbenchActionStringArrayTarget");
    expect(helper).toContain("assertWorkbenchActionOptionalStringTarget");
    expect(helper).not.toMatch(/scheduler-runtime|ToolPolicy|server\/|web\/src|repository/);
  });
});
