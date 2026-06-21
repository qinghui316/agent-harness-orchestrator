import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createChange, createConcurrentChange, closeChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { listTaskQueueItems, listTaskQueues, pauseTaskQueue, reconcileTaskQueues, startOrResumeTaskQueue } from "../../src/task-queue/manager.js";
import { finishTaskRunFromWorkflowResult, markTaskRunStarted } from "../../src/task-run/manager.js";
import { appendWorkflowTaskEvent, listWorkflowRuns, readWorkflowRun, readWorkflowRunEvents, syncWorkflowRunFromQueue } from "../../src/workflow-run/manager.js";
import { buildTaskQueueProposalFromReadiness, compileWorkflowGraphPlan, hashArtifactRefs, hashFile, readLatestDecompositionPlan, readLatestDecompositionReadinessManifest, readLatestTaskQueueProposal, readLatestWorkflowGraphPlan, writeDecompositionReadinessManifest, writeTaskQueueProposal } from "../../src/workflow-artifacts/manager.js";
import { compileSchedulerContract } from "../../src/workflow-scheduler/manager.js";
import type { TaskQueueRun, WorkflowRun } from "../../src/types/index.js";
import {
  getTempDir,
  minimalDecompositionPlan,
  minimalReadiness,
  minimalTaskQueueProposal,
  minimalWorkflowGraphPlan,
  prepareConfirmedTaskQueueProposalWithWorkflow,
  project,
  writeAcceptedSpecAndTasks,
  writeAuditResult,
  writeCoderRun,
  writeTaskQueueItemRecord,
  writeTaskQueueRecord,
  writeTaskRunRecord,
  writeValidationResult,
  writeWorkerLeaseRecord,
} from "./workbench/fixtures.js";

let tempDir: string;

beforeEach(() => {
  tempDir = getTempDir();
});

describe("workbench task runtime domain", () => {
  it("disables task run actions for archived topics without losing TaskGraph facts", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Archived TaskGraph" });
    await writeAcceptedSpecAndTasks("archived-taskgraph");
    await writeFile(join(tempDir, "harness", "changes", "active", "archived-taskgraph", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(tempDir);

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "archived-taskgraph" });

    expect(snapshot.center.workpad.state).toBe("readonly");
    expect(snapshot.center.workpad.taskGraph.nodes).toEqual([
      expect.objectContaining({
        taskId: "T-001",
        nextAction: expect.objectContaining({ enabled: false, disabledReason: "需求对话不是可执行状态。" }),
      }),
    ]);
  });

  it("rejects unknown task ids before starting a Workbench task run", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Unknown Task" });
    await writeAcceptedSpecAndTasks("unknown-task");

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.run.start",
      changeId: "unknown-task",
      taskIds: ["T-999"],
      confirm: true,
    });

    expect(result.result).toMatchObject({ status: "failed", error: expect.stringContaining("target taskIds are stale") });
  });

  it("fails closed when task-scoped Workbench actions miss required targets", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Missing Task Scope" });
    await writeAcceptedSpecAndTasks("missing-task-scope");

    const missingStart = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.run.start",
      changeId: "missing-task-scope",
      confirm: true,
    });
    expect(missingStart.result).toMatchObject({ status: "failed", error: expect.stringContaining("requires a single taskIds[0]") });

    const wrongStartTarget = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.run.start",
      changeId: "missing-task-scope",
      taskRunId: "taskrun-existing",
      confirm: true,
    });
    expect(wrongStartTarget.result).toMatchObject({ status: "failed", error: expect.stringContaining("requires a single taskIds[0]") });

    const missingRetry = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.run.retry",
      changeId: "missing-task-scope",
      confirm: true,
    });
    expect(missingRetry.result).toMatchObject({ status: "failed", error: expect.stringContaining("requires taskRunId") });

    const wrongRetryTarget = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.run.retry",
      changeId: "missing-task-scope",
      taskIds: ["T-001"],
      confirm: true,
    });
    expect(wrongRetryTarget.result).toMatchObject({ status: "failed", error: expect.stringContaining("requires taskRunId") });
  });

  it("rejects forged task ids on change-level code.run when task scope is explicit", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Code Scope" });
    await writeAcceptedSpecAndTasks("code-scope");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "code.run",
      changeId: "code-scope",
      taskIds: ["T-999"],
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("rejects code.run before single-change readiness authorizes execution", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Ungated Code Run" });
    await writeAcceptedSpecAndTasks("ungated-code-run");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "code.run",
      changeId: "ungated-code-run",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("rejects stale readiness ids on change-level code.run", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Stale Code Readiness" });
    await writeAcceptedSpecAndTasks("stale-code-readiness");
    const planningDir = join(tempDir, "harness", "changes", "active", "stale-code-readiness", "planning");
    await mkdir(planningDir, { recursive: true });
    const plan = {
      ...minimalDecompositionPlan("stale-code-readiness"),
      recommendation: "single-change" as const,
      status: "confirmed" as const,
    };
    const readiness = {
      ...minimalReadiness("stale-code-readiness", ["T-001"]),
      status: "ready-for-single-change" as const,
      recommendation: "single-change" as const,
      schedulerEligible: false,
      nextAllowedAction: "code.run" as const,
      decompositionPlanId: plan.id,
    };
    await writeFile(join(planningDir, "decomposition-plan.json"), JSON.stringify(plan, null, 2), "utf8");
    await writeFile(join(planningDir, "decomposition-plan.md"), "# Decomposition\n", "utf8");
    await writeFile(join(planningDir, "decomposition-readiness.json"), JSON.stringify(readiness, null, 2), "utf8");
    await writeFile(join(planningDir, "decomposition-readiness.md"), "# Readiness\n", "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "stale-code-readiness" });
    expect(snapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionType: "code.run",
        changeId: "stale-code-readiness",
        readinessManifestId: readiness.id,
      }),
    ]));

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "code.run",
      changeId: "stale-code-readiness",
      readinessManifestId: "readiness-forged",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("projects latest TaskRun and WorkerLease state on the matching TaskGraph node", async () => {
    await initHarness(project());
    await createChange(project(), { title: "TaskRun State" });
    await writeAcceptedSpecAndTasks("taskrun-state");
    await writeTaskRunRecord("taskrun-state", "taskrun-1", "T-001", "blocked", 1, {
      runId: "run-taskrun-1",
      worktreeId: "wt-taskrun-1",
      blockedReason: "Audit failed.",
      leaseId: "lease-1",
    });
    await writeWorkerLeaseRecord("taskrun-state", "lease-1", "taskrun-1", "T-001", "released");
    await writeCoderRun("taskrun-state", "run-taskrun-1", ["T-001"], "wt-taskrun-1", "completed", "taskrun-1");
    await writeAuditResult("taskrun-state", "audit-taskrun-1", "wt-taskrun-1", "failed");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "taskrun-state" });
    const node = snapshot.center.workpad.taskGraph.nodes.find((item) => item.taskId === "T-001");

    expect(node).toMatchObject({
      status: "blocked",
      taskRun: expect.objectContaining({ id: "taskrun-1", status: "blocked", attempt: 1, runId: "run-taskrun-1", worktreeId: "wt-taskrun-1" }),
      workerLease: expect.objectContaining({ id: "lease-1", status: "released", workerId: expect.stringContaining("local") }),
      nextAction: expect.objectContaining({ actionType: "task.run.retry", taskRunId: "taskrun-1", enabled: false, label: "正在自动修改" }),
      autoRework: expect.objectContaining({ available: true, attempt: 0, budget: 1 }),
      blockers: expect.arrayContaining(["Audit failed."]),
    });
  });

  it("reconciles a claimed TaskRun from run, validation, and audit artifacts", async () => {
    await initHarness(project());
    await createChange(project(), { title: "TaskRun Reconcile" });
    await writeAcceptedSpecAndTasks("taskrun-reconcile");
    await writeTaskRunRecord("taskrun-reconcile", "taskrun-reconcile-1", "T-001", "claimed", 1, {
      leaseId: "lease-reconcile-1",
    });
    await writeWorkerLeaseRecord("taskrun-reconcile", "lease-reconcile-1", "taskrun-reconcile-1", "T-001", "claimed");
    await writeCoderRun("taskrun-reconcile", "run-reconcile-1", ["T-001"], "wt-reconcile-1", "completed", "taskrun-reconcile-1");
    await writeValidationResult("taskrun-reconcile", "validation-reconcile-1", "wt-reconcile-1", "passed");
    await writeAuditResult("taskrun-reconcile", "audit-reconcile-1", "wt-reconcile-1", "approved-with-notes");

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.run.reconcile",
      changeId: "taskrun-reconcile",
      taskRunId: "taskrun-reconcile-1",
      confirm: true,
    });
    expect(result.result).toMatchObject({
      status: "completed",
      result: {
        taskRuns: [expect.objectContaining({ id: "taskrun-reconcile-1", status: "completed", runId: "run-reconcile-1", worktreeId: "wt-reconcile-1" })],
        workerLeases: [expect.objectContaining({ id: "lease-reconcile-1", status: "released" })],
      },
    });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "taskrun-reconcile" });
    const node = snapshot.center.workpad.taskGraph.nodes.find((item) => item.taskId === "T-001");
    expect(node).toMatchObject({
      status: "evidence-ready",
      taskRun: expect.objectContaining({ id: "taskrun-reconcile-1", status: "completed" }),
      workerLease: expect.objectContaining({ id: "lease-reconcile-1", status: "released" }),
    });
  });

  it("does not reconcile a TaskRun from cross-change coder Run evidence", async () => {
    await initHarness(project());
    await createChange(project(), { title: "TaskRun Scoped Reconcile" });
    await writeAcceptedSpecAndTasks("taskrun-scoped-reconcile");
    await writeTaskRunRecord("taskrun-scoped-reconcile", "taskrun-scoped-1", "T-001", "claimed", 1, {
      leaseId: "lease-scoped-1",
    });
    await writeWorkerLeaseRecord("taskrun-scoped-reconcile", "lease-scoped-1", "taskrun-scoped-1", "T-001", "claimed");
    await writeCoderRun("other-change", "run-cross-change-1", ["T-001"], "wt-cross-change-1", "completed", "taskrun-scoped-1");
    await writeValidationResult("taskrun-scoped-reconcile", "validation-scoped-1", "wt-cross-change-1", "passed");
    await writeAuditResult("taskrun-scoped-reconcile", "audit-scoped-1", "wt-cross-change-1", "approved");

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.run.reconcile",
      changeId: "taskrun-scoped-reconcile",
      taskRunId: "taskrun-scoped-1",
      confirm: true,
    });

    expect(result.result).toMatchObject({
      status: "completed",
      result: {
        taskRuns: [expect.objectContaining({ id: "taskrun-scoped-1", status: "claimed" })],
        workerLeases: [expect.objectContaining({ id: "lease-scoped-1", status: "claimed" })],
      },
    });
    const taskRun = result.result.status === "completed" && Array.isArray(result.result.result?.taskRuns)
      ? result.result.result.taskRuns[0]
      : null;
    expect(taskRun).not.toHaveProperty("runId");
    expect(taskRun).not.toHaveProperty("worktreeId");
  });

  it("rejects scoped TaskRun started/completion updates for the wrong Change", async () => {
    await initHarness(project());
    await writeTaskRunRecord("taskrun-finish-scope", "taskrun-finish-1", "T-001", "claimed", 1, {
      leaseId: "lease-finish-1",
    });
    await writeWorkerLeaseRecord("taskrun-finish-scope", "lease-finish-1", "taskrun-finish-1", "T-001", "claimed");
    const memory = await resolveProjectMemory(project());

    await expect(markTaskRunStarted(memory, "taskrun-finish-1", { changeId: "wrong-change", taskId: "T-001" }))
      .rejects.toThrow();
    await expect(finishTaskRunFromWorkflowResult(memory, "taskrun-finish-1", {
      stoppedAt: null,
      code: {
        run: {
          id: "run-wrong-change",
          changeId: "wrong-change",
          taskRunId: "taskrun-finish-1",
          taskIds: ["T-001"],
          worktree: { worktreeId: "wt-wrong-change" },
        },
      },
      audit: { audit: { status: "approved" } },
    }, { changeId: "taskrun-finish-scope", taskId: "T-001" })).rejects.toThrow("belongs to Change wrong-change");
  });

  it("rejects workflow artifacts whose changeId does not match the Change path", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workflow Artifact A" });
    await createConcurrentChange(project(), { title: "Workflow Artifact B" });
    await writeAcceptedSpecAndTasks("workflow-artifact-a");
    await writeAcceptedSpecAndTasks("workflow-artifact-b");
    const memory = await resolveProjectMemory(project());
    const pathA = join("harness", "changes", "active", "workflow-artifact-a");
    const planningA = join(tempDir, pathA, "planning");
    await mkdir(planningA, { recursive: true });
    const planB = minimalDecompositionPlan("workflow-artifact-b");
    const readinessB = minimalReadiness("workflow-artifact-b", ["T-001"]);
    const proposalB = minimalTaskQueueProposal("workflow-artifact-b", readinessB);
    const graphB = minimalWorkflowGraphPlan("workflow-artifact-b", proposalB, readinessB);

    await expect(writeDecompositionReadinessManifest(memory, pathA, readinessB)).rejects.toThrow("not scoped to the selected Change");
    await expect(writeTaskQueueProposal(memory, pathA, proposalB)).rejects.toThrow("not scoped to the selected Change");

    await writeFile(join(planningA, "decomposition-plan.json"), JSON.stringify(planB, null, 2), "utf8");
    await writeFile(join(planningA, "decomposition-readiness.json"), JSON.stringify(readinessB, null, 2), "utf8");
    await writeFile(join(planningA, "taskqueue-proposal.json"), JSON.stringify(proposalB, null, 2), "utf8");
    await writeFile(join(planningA, "workflow-graph-plan.json"), JSON.stringify(graphB, null, 2), "utf8");

    await expect(readLatestDecompositionPlan(memory, pathA)).rejects.toThrow("not scoped to the selected Change");
    await expect(readLatestDecompositionReadinessManifest(memory, pathA)).rejects.toThrow("not scoped to the selected Change");
    await expect(readLatestTaskQueueProposal(memory, pathA)).rejects.toThrow("not scoped to the selected Change");
    await expect(readLatestWorkflowGraphPlan(memory, pathA)).rejects.toThrow("not scoped to the selected Change");
  });

  it("guards TaskQueueProposal build and WorkflowGraphPlan compile against cross-change artifacts", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workflow Artifact Build A" });
    await createConcurrentChange(project(), { title: "Workflow Artifact Build B" });
    await writeAcceptedSpecAndTasks("workflow-artifact-build-a");
    await writeAcceptedSpecAndTasks("workflow-artifact-build-b");
    const memory = await resolveProjectMemory(project());
    const pathA = join("harness", "changes", "active", "workflow-artifact-build-a");
    const pathB = join("harness", "changes", "active", "workflow-artifact-build-b");
    const readinessB = minimalReadiness("workflow-artifact-build-b", ["T-001"]);
    const proposalB = minimalTaskQueueProposal("workflow-artifact-build-b", readinessB, "confirmed");

    await expect(buildTaskQueueProposalFromReadiness(memory, pathA, "workflow-artifact-build-a", readinessB))
      .rejects.toThrow("not scoped to the selected Change");
    await expect(compileWorkflowGraphPlan(memory, pathA, proposalB, readinessB))
      .rejects.toThrow("not scoped to the selected Change");

    await writeDecompositionReadinessManifest(memory, pathB, readinessB);
    const proposal = await buildTaskQueueProposalFromReadiness(memory, pathB, "workflow-artifact-build-b", readinessB);
    const confirmed = { ...proposal, status: "confirmed" as const };
    await writeTaskQueueProposal(memory, pathB, confirmed);
    const graph = await compileWorkflowGraphPlan(memory, pathB, confirmed, readinessB);
    const latest = await readLatestWorkflowGraphPlan(memory, pathB);

    expect(latest).toMatchObject({
      id: graph.id,
      changeId: "workflow-artifact-build-b",
      taskQueueProposalId: confirmed.id,
      readinessManifestId: readinessB.id,
      graphMode: "sequential-v1",
    });
    expect(graph.nodes.map((node) => node.stages.join(" -> "))).toEqual(["coder -> validation -> audit -> bounded-rework"]);
  });

  it("compiles SchedulerContract waves and rejects unsafe parallel graphs", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Scheduler Contract Kernel" });
    await writeAcceptedSpecAndTasks("scheduler-contract-kernel");
    const memory = await resolveProjectMemory(project());
    const changePath = join("harness", "changes", "active", "scheduler-contract-kernel");
    const planningDir = join(tempDir, changePath, "planning");
    await mkdir(planningDir, { recursive: true });
    const plan = minimalDecompositionPlan("scheduler-contract-kernel");
    plan.recommendation = "taskgraph-parallel-candidate";
    plan.units = [
      { ...plan.units[0], id: "DU-001", title: "Module A", taskIds: ["T-001"], scopeHints: ["src/module-a.ts"], dependsOn: [] },
      { ...plan.units[0], id: "DU-002", title: "Module B", taskIds: ["T-002"], scopeHints: ["src/module-b.ts"], dependsOn: [] },
      { ...plan.units[0], id: "DU-003", title: "Synthesis", taskIds: ["T-003"], scopeHints: ["src/synthesis.ts"], dependsOn: ["DU-001", "DU-002"] },
    ];
    plan.dependencies = [
      { from: "DU-001", to: "DU-003", kind: "blocks" },
      { from: "DU-002", to: "DU-003", kind: "blocks" },
    ];
    plan.conflictScopes = ["src/module-a.ts", "src/module-b.ts", "src/synthesis.ts"];
    plan.artifactRefs = [`harness/changes/active/scheduler-contract-kernel/spec.md`];
    plan.recoveryKeyInputs.acceptedArtifactRefs = plan.artifactRefs;
    const readiness = minimalReadiness("scheduler-contract-kernel", ["T-001", "T-002", "T-003"]);
    readiness.status = "ready-for-scheduler-contract";
    readiness.recommendation = "taskgraph-parallel-candidate";
    readiness.nextAllowedAction = "scheduler.contract";
    readiness.decompositionPlanId = plan.id;
    readiness.units = plan.units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      taskIds: unit.taskIds,
      acIds: unit.acIds,
      dependsOn: unit.dependsOn,
      guardrailStatus: "passed",
      sourceScopes: unit.scopeHints,
    }));
    readiness.dependencies = plan.dependencies;
    readiness.conflictScopes = plan.conflictScopes;
    readiness.artifactRefs = plan.artifactRefs;
    readiness.recoveryKeyMaterial.decompositionPlanId = plan.id;
    readiness.recoveryKeyMaterial.acceptedArtifactRefs = plan.artifactRefs;
    await writeFile(join(planningDir, "decomposition-plan.json"), JSON.stringify(plan, null, 2), "utf8");
    await writeFile(join(planningDir, "decomposition-plan.md"), `# ${plan.id}\n`, "utf8");
    await writeFile(join(planningDir, "decomposition-readiness.json"), JSON.stringify(readiness, null, 2), "utf8");
    await writeFile(join(planningDir, "decomposition-readiness.md"), `# ${readiness.id}\n`, "utf8");

    const contract = await compileSchedulerContract(memory, changePath, plan, readiness);
    expect(contract.waves).toEqual([
      { index: 0, nodeIds: ["scheduler-node-001", "scheduler-node-002"] },
      { index: 1, nodeIds: ["scheduler-node-003"] },
    ]);
    expect(contract.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "scheduler-node-001", to: "scheduler-node-003", kind: "dependency" }),
      expect.objectContaining({ from: "scheduler-node-002", to: "scheduler-node-003", kind: "dependency" }),
    ]));

    await expect(compileSchedulerContract(memory, changePath, {
      ...plan,
      dependencies: [{ from: "DU-001", to: "DU-002", kind: "conflicts" }],
    }, { ...readiness, dependencies: [{ from: "DU-001", to: "DU-002", kind: "conflicts" }] })).rejects.toThrow("requires explicit ordering for conflict edge");

    await expect(compileSchedulerContract(memory, changePath, {
      ...plan,
      dependencies: [
        { from: "DU-001", to: "DU-002", kind: "blocks" },
        { from: "DU-002", to: "DU-001", kind: "blocks" },
      ],
    }, {
      ...readiness,
      dependencies: [
        { from: "DU-001", to: "DU-002", kind: "blocks" },
        { from: "DU-002", to: "DU-001", kind: "blocks" },
      ],
    })).rejects.toThrow("contains a cycle");
  });

  it("keeps workflow artifact hash normalization stable", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workflow Artifact Hash" });
    const memory = await resolveProjectMemory(project());
    const acMapPath = join(tempDir, "harness", "changes", "active", "workflow-artifact-hash", "ac-map.json");
    await writeFile(acMapPath, JSON.stringify({ version: "1.0", generatedAt: "one", acceptance: [] }), "utf8");
    const first = await hashFile(acMapPath);
    await writeFile(acMapPath, JSON.stringify({ version: "1.0", generatedAt: "two", acceptance: [] }), "utf8");

    await expect(hashFile(acMapPath)).resolves.toBe(first);
    await expect(hashArtifactRefs(memory, ["harness/changes/active/workflow-artifact-hash/ac-map.json"]))
      .resolves.toEqual({ "harness/changes/active/workflow-artifact-hash/ac-map.json": first });
  });

  it("creates a TaskQueue from accepted tasks and skips checked tasks", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Task Queue" });
    await writeAcceptedSpecAndTasks("task-queue");
    await writeFile(join(tempDir, "harness", "changes", "active", "task-queue", "tasks.md"), [
      "# Tasks",
      "",
      "- [x] T-001: Completed task.",
      "  - Covers: AC-001",
      "- [ ] T-002: Runnable task.",
      "  - Covers: AC-001",
      "",
    ].join("\n"), "utf8");

    const prepared = await prepareConfirmedTaskQueueProposalWithWorkflow("task-queue", ["T-001", "T-002"]);
    const result = await startOrResumeTaskQueue(project(), {
      changeId: "task-queue",
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      decompositionPlanId: prepared.decompositionPlanId,
      workflowRunId: prepared.workflowRunId,
    });
    const memory = await resolveProjectMemory(project());
    const items = await listTaskQueueItems(memory, "task-queue", result.queue.id);

    expect(result.queue).toMatchObject({ status: "queued", totalCount: 1, completedCount: 0 });
    expect(items).toEqual([
      expect.objectContaining({ taskId: "T-001", status: "skipped", order: 1, taskQueueProposalId: prepared.proposalId, workflowGraphPlanId: prepared.workflowGraphPlanId, workflowRunId: prepared.workflowRunId }),
      expect.objectContaining({ taskId: "T-002", status: "queued", order: 2, taskQueueProposalId: prepared.proposalId, workflowGraphPlanId: prepared.workflowGraphPlanId, workflowRunId: prepared.workflowRunId }),
    ]);
    await expect(readWorkflowRun(memory, "task-queue", prepared.workflowRunId)).resolves.toMatchObject({
      id: prepared.workflowRunId,
      status: "running",
      queueRunId: result.queue.id,
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
  });

  it("guards WorkflowRun read, list, and event journal scope", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workflow Scope A" });
    await createConcurrentChange(project(), { title: "Workflow Scope B" });
    await writeAcceptedSpecAndTasks("workflow-scope-a");
    await writeAcceptedSpecAndTasks("workflow-scope-b");
    const prepared = await prepareConfirmedTaskQueueProposalWithWorkflow("workflow-scope-a", ["T-001"]);
    const memory = await resolveProjectMemory(project());
    const run = await readWorkflowRun(memory, "workflow-scope-a", prepared.workflowRunId);

    const misplacedDir = join(tempDir, ".agent-harness", "runs", "workflows", "workflow-scope-b");
    await mkdir(misplacedDir, { recursive: true });
    await writeFile(join(misplacedDir, `${run.id}.json`), JSON.stringify(run, null, 2), "utf8");

    await expect(readWorkflowRun(memory, "workflow-scope-b", run.id)).rejects.toThrow("not scoped to Change workflow-scope-b");
    expect(await listWorkflowRuns(memory, "workflow-scope-b")).toEqual([]);

    const eventDir = join(tempDir, ".agent-harness", "runs", "workflow-events", "workflow-scope-a");
    await mkdir(eventDir, { recursive: true });
    await writeFile(join(eventDir, `${run.id}.jsonl`), `${JSON.stringify({
      version: "1.0",
      id: "workflow-event-forged",
      workflowRunId: run.id,
      changeId: "workflow-scope-b",
      type: "workflow.reconciled",
      timestamp: new Date().toISOString(),
    })}\n`, "utf8");

    await expect(readWorkflowRunEvents(memory, "workflow-scope-a", run.id)).rejects.toThrow("not scoped to WorkflowRun");
  });

  it("keeps WorkflowRun event append canonical and rejects cross-queue lifecycle sync", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workflow Event Scope" });
    await writeAcceptedSpecAndTasks("workflow-event-scope");
    const prepared = await prepareConfirmedTaskQueueProposalWithWorkflow("workflow-event-scope", ["T-001"]);
    const result = await startOrResumeTaskQueue(project(), {
      changeId: "workflow-event-scope",
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      decompositionPlanId: prepared.decompositionPlanId,
      workflowRunId: prepared.workflowRunId,
    });
    const memory = await resolveProjectMemory(project());

    await appendWorkflowTaskEvent(memory, prepared.workflowRunId, "workflow-event-scope", "task.started", {
      workflowRunId: "workflow-forged",
      changeId: "workflow-forged-change",
      taskId: "T-001",
      taskRunId: "taskrun-1",
    } as never);

    const events = await readWorkflowRunEvents(memory, "workflow-event-scope", prepared.workflowRunId);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "task.started",
        workflowRunId: prepared.workflowRunId,
        changeId: "workflow-event-scope",
        taskId: "T-001",
        taskRunId: "taskrun-1",
      }),
    ]));

    const run = await readWorkflowRun(memory, "workflow-event-scope", prepared.workflowRunId);
    const items = await listTaskQueueItems(memory, "workflow-event-scope", result.queue.id);
    await expect(syncWorkflowRunFromQueue(memory, run, { ...result.queue, id: "queue-forged" } as TaskQueueRun, items))
      .rejects.toThrow("already bound to a different queueRunId");
    await expect(syncWorkflowRunFromQueue(memory, { ...run, changeId: "workflow-other-change" } as WorkflowRun, result.queue, items))
      .rejects.toThrow("must belong to the same Change");
  });

  it("rejects direct TaskQueue start without a TaskQueueProposal", async () => {
    await initHarness(project());
    const change = await createChange(project(), { title: "Task Queue Direct Start" });
    await writeAcceptedSpecAndTasks(change.change.id);

    await expect(startOrResumeTaskQueue(project(), { changeId: change.change.id })).rejects.toThrow("TaskQueue start requires a confirmed TaskQueueProposal");
  });

  it("rejects direct TaskQueue start without full readiness and decomposition scope", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Missing TaskQueue Scope" });
    await writeAcceptedSpecAndTasks("missing-taskqueue-scope");
    const prepared = await prepareConfirmedTaskQueueProposalWithWorkflow("missing-taskqueue-scope", ["T-001"]);

    await expect(startOrResumeTaskQueue(project(), {
      changeId: "missing-taskqueue-scope",
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      decompositionPlanId: prepared.decompositionPlanId,
      workflowRunId: prepared.workflowRunId,
    })).rejects.toThrow("TaskQueue start requires readinessManifestId");

    await expect(startOrResumeTaskQueue(project(), {
      changeId: "missing-taskqueue-scope",
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      workflowRunId: prepared.workflowRunId,
    })).rejects.toThrow("TaskQueue start requires decompositionPlanId");
  });

  it("rejects forged WorkflowRun ids for TaskQueue start without creating a queue", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Forged WorkflowRun" });
    await writeAcceptedSpecAndTasks("forged-workflowrun");
    const prepared = await prepareConfirmedTaskQueueProposalWithWorkflow("forged-workflowrun", ["T-001"]);

    await expect(startOrResumeTaskQueue(project(), {
      changeId: "forged-workflowrun",
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      decompositionPlanId: prepared.decompositionPlanId,
      workflowRunId: "workflow-forged",
    })).rejects.toThrow("TaskQueue start requires a matching unstarted WorkflowRun");

    const memory = await resolveProjectMemory(project());
    expect(await listTaskQueues(memory, "forged-workflowrun")).toHaveLength(0);
  });

  it("resumes a paused TaskQueue from existing completed task evidence without starting a new coder run", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workflow Resume Evidence" });
    await writeAcceptedSpecAndTasks("workflow-resume-evidence");
    const prepared = await prepareConfirmedTaskQueueProposalWithWorkflow("workflow-resume-evidence", ["T-001"]);
    const startedQueue = await startOrResumeTaskQueue(project(), {
      changeId: "workflow-resume-evidence",
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      decompositionPlanId: prepared.decompositionPlanId,
      workflowRunId: prepared.workflowRunId,
    });
    const memory = await resolveProjectMemory(project());
    await pauseTaskQueue(memory, startedQueue.queue, "test pause");
    await writeTaskRunRecord("workflow-resume-evidence", "taskrun-resume-1", "T-001", "evidence-ready", 1, {
      runId: "run-resume-coder",
      worktreeId: "wt-resume-1",
    });
    await writeCoderRun("workflow-resume-evidence", "run-resume-coder", ["T-001"], "wt-resume-1", "completed", "taskrun-resume-1");
    await writeValidationResult("workflow-resume-evidence", "run-resume-validation", "wt-resume-1", "passed");
    await writeAuditResult("workflow-resume-evidence", "run-resume-audit", "wt-resume-1", "approved");

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.queue.start",
      changeId: "workflow-resume-evidence",
      workflowRunId: prepared.workflowRunId,
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      decompositionPlanId: prepared.decompositionPlanId,
      queueRunId: startedQueue.queue.id,
      confirm: true,
    });

    expect(result.result).toMatchObject({
      status: "completed",
      result: {
        queue: expect.objectContaining({ status: "completed", workflowRunId: prepared.workflowRunId }),
      },
    });
    const items = await listTaskQueueItems(memory, "workflow-resume-evidence", startedQueue.queue.id);
    expect(items).toEqual([expect.objectContaining({ status: "completed", taskRunId: "taskrun-resume-1" })]);
    const coderRuns = (await listRuns(memory)).filter((run) => run.runtime === "coder-codex" && run.changeId === "workflow-resume-evidence");
    expect(coderRuns.map((run) => run.id)).toEqual(["run-resume-coder"]);
    const workflow = await readWorkflowRun(memory, "workflow-resume-evidence", prepared.workflowRunId);
    expect(workflow).toMatchObject({ status: "completed", queueRunId: startedQueue.queue.id });
    await expect(readWorkflowRunEvents(memory, "workflow-resume-evidence", prepared.workflowRunId)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "task.completed", taskId: "T-001" })]),
    );
  });

  it("rejects explicit forged typed scope when resuming a paused TaskQueue", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Workflow Resume Forged Scope" });
    await writeAcceptedSpecAndTasks("workflow-resume-forged-scope");
    const prepared = await prepareConfirmedTaskQueueProposalWithWorkflow("workflow-resume-forged-scope", ["T-001"]);
    const startedQueue = await startOrResumeTaskQueue(project(), {
      changeId: "workflow-resume-forged-scope",
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      decompositionPlanId: prepared.decompositionPlanId,
      workflowRunId: prepared.workflowRunId,
    });
    const memory = await resolveProjectMemory(project());
    await pauseTaskQueue(memory, startedQueue.queue, "test pause");

    await expect(startOrResumeTaskQueue(project(), {
      changeId: "workflow-resume-forged-scope",
      workflowRunId: prepared.workflowRunId,
      queueRunId: startedQueue.queue.id,
      taskQueueProposalId: "proposal-forged",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      decompositionPlanId: prepared.decompositionPlanId,
    })).rejects.toThrow("TaskQueue resume scope is stale or incomplete");
  });

  it("projects TaskQueue status into Workpad and disables single-task actions while queued", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Queued Workpad" });
    await writeAcceptedSpecAndTasks("queued-workpad");
    const prepared = await prepareConfirmedTaskQueueProposalWithWorkflow("queued-workpad", ["T-001"]);
    const result = await startOrResumeTaskQueue(project(), {
      changeId: "queued-workpad",
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      decompositionPlanId: prepared.decompositionPlanId,
      workflowRunId: prepared.workflowRunId,
    });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "queued-workpad" });
    const node = snapshot.center.workpad.taskGraph.nodes.find((item) => item.taskId === "T-001");

    expect(snapshot.center.workpad.taskQueue).toMatchObject({
      id: result.queue.id,
      status: "queued",
      totalCount: 1,
      workflowRunId: prepared.workflowRunId,
      taskQueueProposalId: prepared.proposalId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      readinessManifestId: prepared.readinessManifestId,
      decompositionPlanId: prepared.decompositionPlanId,
      nextAction: expect.objectContaining({
        actionType: "task.queue.reconcile",
        label: "刷新执行状态",
        queueRunId: result.queue.id,
        workflowRunId: prepared.workflowRunId,
        taskQueueProposalId: prepared.proposalId,
        workflowGraphPlanId: prepared.workflowGraphPlanId,
        readinessManifestId: prepared.readinessManifestId,
        decompositionPlanId: prepared.decompositionPlanId,
      }),
    });
    expect(node?.nextAction).toMatchObject({ enabled: false, disabledReason: "本地顺序执行正在运行或等待恢复。" });
  });

  it("projects blocked queue as the primary decision and moves stale audit approvals to history", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Queue Blocked Decision" });
    await writeAcceptedSpecAndTasks("queue-blocked-decision");
    await writeTaskQueueRecord("queue-blocked-decision", "queue-blocked-1", "blocked", { currentTaskId: "T-001", totalCount: 1, blockedReason: "T-001: Audit blocked." });
    await writeTaskQueueItemRecord("queue-blocked-decision", "queue-blocked-1", "queue-blocked-1-item-001", "T-001", 1, "blocked", { taskRunId: "taskrun-blocked-1", blockedReason: "Audit blocked." });
    await writeTaskRunRecord("queue-blocked-decision", "taskrun-blocked-1", "T-001", "blocked", 2, {
      runId: "run-blocked-1",
      worktreeId: "wt-blocked-1",
      blockedReason: "Audit blocked.",
    });
    await writeCoderRun("queue-blocked-decision", "run-blocked-1", ["T-001"], "wt-blocked-1", "completed", "taskrun-blocked-1");
    await writeAuditResult("queue-blocked-decision", "audit-old-approved", "wt-blocked-1", "approved-with-notes");
    await writeAuditResult("queue-blocked-decision", "audit-latest-blocked", "wt-blocked-1", "blocked");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "queue-blocked-decision" });

    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "task.run.retry",
      taskRunId: "taskrun-blocked-1",
      label: "要求修改",
    });
    expect(snapshot.right.decisionInspector.primary).toMatchObject({
      kind: "queue-blocker",
      queueRunId: "queue-blocked-1",
      taskId: "T-001",
      taskRunId: "taskrun-blocked-1",
      title: "任务暂停：T-001",
      userStatus: "needs-rework",
    });
    expect(snapshot.right.decisionInspector.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "feedback", label: "要求修改" }),
      expect.objectContaining({ kind: "evidence", label: "查看证据" }),
    ]));
    expect(snapshot.right.decisionInspector.primary?.actions.filter((action) => action.kind === "evidence")).toHaveLength(1);
    expect(snapshot.right.decisionInspector.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: expect.stringContaining("audit-old-approved") }),
    ]));
  });

  it("reconciles a running TaskQueue item from completed TaskRun evidence", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Queue Reconcile" });
    await writeAcceptedSpecAndTasks("queue-reconcile");
    await writeTaskQueueRecord("queue-reconcile", "queue-1", "running", { currentTaskId: "T-001", totalCount: 1 });
    await writeTaskQueueItemRecord("queue-reconcile", "queue-1", "queue-1-item-001", "T-001", 1, "running", { taskRunId: "taskrun-queue-1" });
    await writeTaskRunRecord("queue-reconcile", "taskrun-queue-1", "T-001", "completed", 1, {
      runId: "run-queue-1",
      worktreeId: "wt-queue-1",
      leaseId: "lease-queue-1",
    });
    await writeWorkerLeaseRecord("queue-reconcile", "lease-queue-1", "taskrun-queue-1", "T-001", "claimed");
    await writeCoderRun("queue-reconcile", "run-queue-1", ["T-001"], "wt-queue-1", "completed", "taskrun-queue-1");
    await writeValidationResult("queue-reconcile", "validation-queue-1", "wt-queue-1", "passed");
    await writeAuditResult("queue-reconcile", "audit-queue-1", "wt-queue-1", "approved-with-notes");

    const result = await reconcileTaskQueues(project(), { changeId: "queue-reconcile", queueRunId: "queue-1" });

    expect(result.queues).toEqual([expect.objectContaining({ id: "queue-1", status: "completed", completedCount: 1 })]);
    expect(result.items).toEqual([expect.objectContaining({ id: "queue-1-item-001", status: "completed", taskRunId: "taskrun-queue-1" })]);
    const memory = await resolveProjectMemory(project());
    const leases = await listTaskQueues(memory, "queue-reconcile");
    expect(leases[0]).toMatchObject({ status: "completed" });
  });

});
