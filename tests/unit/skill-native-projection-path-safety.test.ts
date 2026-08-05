import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSchedulerArtifactStore,
  schedulerPlanningRunArtifactPaths,
  skillNativeSchedulerRunArtifactPaths,
} from "../../src/scheduler-runtime/artifact-store.js";
import * as schedulerRuntimePaths from "../../src/scheduler-runtime/paths.js";
import * as schedulerPlanningPaths from "../../src/workflow-scheduler/paths.js";
import { readWorkflowGraphPlanAt } from "../../src/workflow-artifacts/workflow-graph-plan.js";

describe("Skill-native projection path safety", () => {
  it("rejects path-shaped SchedulerRun ids before resolving sidecar artifacts", () => {
    const runtimeRoot = join("runtime-sidecar", "runs", "scheduler-runs", "change-1");

    expect(() => skillNativeSchedulerRunArtifactPaths(runtimeRoot, "../escape"))
      .toThrow("SchedulerRun id is not portable");
    const runtime = skillNativeSchedulerRunArtifactPaths(runtimeRoot, "scheduler-run-1");
    expect(() => runtime.runPath("../escape")).toThrow("SchedulerRun id is not portable");
    expect(() => runtime.journalPath("C:\\escape")).toThrow("SchedulerRun id is not portable");

    const planning = schedulerPlanningRunArtifactPaths(join("project-skill", "planning"));
    expect(() => planning.runPath("../../escape")).toThrow("SchedulerRun id is not portable");
  });

  it("rejects path-shaped WorkflowGraphPlan ids before reading project Skill artifacts", async () => {
    await expect(readWorkflowGraphPlanAt("project-skill-change", "change-1", "../escape"))
      .rejects.toThrow("WorkflowGraphPlan id is not portable");
    await expect(readWorkflowGraphPlanAt("project-skill-change", "change-1", "C:\\escape"))
      .rejects.toThrow("WorkflowGraphPlan id is not portable");
  });

  it("rejects path-shaped Scheduler child artifact ids before resolving projections", () => {
    const store = createSchedulerArtifactStore({
      changeId: "change-1",
      changeEvidenceRoot: join("project-skill", "change-1"),
      artifactRoots: ["project-skill", "runtime-sidecar"],
    });
    const runtimePathResolvers: Array<(id: string) => string> = [
      (id) => schedulerRuntimePaths.schedulerReconcileSnapshotPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerReconcileSnapshotMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerClaimReservationPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerClaimReservationMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerStartPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerStartMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerResultPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerResultMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerValidationPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerValidationMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerAuditPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerAuditMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkPlanPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkPlanMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkStartPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkStartMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkResultPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkResultMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkValidationPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkValidationMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkAuditPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerWorkerReworkAuditMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerIntegrationCandidatePath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerIntegrationCandidateMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerIntegrationCheckHandoffPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerIntegrationCheckHandoffMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerIntegrationOutcomePath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerIntegrationOutcomeMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerRunCompletionPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerRunCompletionMarkdownPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerRunBlockedCloseoutPath(store, "", "scheduler-run-1", id),
      (id) => schedulerRuntimePaths.schedulerRunBlockedCloseoutMarkdownPath(store, "", "scheduler-run-1", id),
    ];
    for (const resolvePath of runtimePathResolvers) {
      expect(() => resolvePath("../escape")).toThrow(/id is not portable/);
      expect(() => resolvePath("C:\\escape")).toThrow(/id is not portable/);
    }
  });

  it("rejects path-shaped Scheduler planning artifact ids before resolving projections", () => {
    const store = createSchedulerArtifactStore({
      changeId: "change-1",
      changeEvidenceRoot: join("project-skill", "change-1"),
      artifactRoots: ["project-skill", "runtime-sidecar"],
    });
    const planningPathResolvers: Array<(id: string) => string> = [
      (id) => schedulerPlanningPaths.schedulerContractPath(store, "", id),
      (id) => schedulerPlanningPaths.schedulerDispatchDryRunPath(store, "", id),
      (id) => schedulerPlanningPaths.schedulerWorkerSessionPlanPath(store, "", id),
      (id) => schedulerPlanningPaths.schedulerClaimReconcilePlanPath(store, "", id),
      (id) => schedulerPlanningPaths.schedulerLaunchPreflightPath(store, "", id),
    ];
    for (const resolvePath of planningPathResolvers) {
      expect(() => resolvePath("../escape")).toThrow(/id is not portable/);
      expect(() => resolvePath("C:\\escape")).toThrow(/id is not portable/);
    }
  });
});
