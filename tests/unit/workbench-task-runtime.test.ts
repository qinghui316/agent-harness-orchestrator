import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createConcurrentChange, closeChange } from "../../src/change/manager.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import { initHarness } from "../../src/harness/init.js";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { getWorkbenchSnapshot } from "../../src/workbench/projections/read-model/implementation.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import {
  mainAgentLoopRunsRoot,
} from "../../src/main-agent-orchestration/index.js";
import { listTaskQueueItems, listTaskQueues, pauseTaskQueue, reconcileTaskQueues, startOrResumeTaskQueue } from "../../src/task-queue/manager.js";
import { finishTaskRunFromWorkflowResult, markTaskRunStarted, resumeInterruptedTaskRun } from "../../src/task-run/manager.js";
import { appendWorkflowTaskEvent, listWorkflowRuns, readWorkflowRun, readWorkflowRunEvents, syncWorkflowRunFromQueue } from "../../src/workflow-run/manager.js";
import { hashArtifactRefs, hashFile, readLatestWorkflowGraphPlan } from "../../src/workflow-artifacts/manager.js";
import type { TaskQueueRun, WorkflowRun } from "../../src/types/index.js";
import { findTaskRunStageResumeCandidate, runResumedTaskRunStage } from "../../src/workflow-runtime/code-workflow.js";
import { runTaskQueueSequentialWorkflow } from "../../src/workflow-runtime/taskqueue.js";
import { selectNextSequentialGraphQueueItem } from "../../src/workflow-runtime/workflowgraph-sequential.js";
import {
  getTempDir,
  prepareAcceptedSequentialWorkflowGraph,
  project,
  writeAcceptedSpecAndTasks,
  writeAuditResult,
  writeCoderRun,
  writeTaskQueueItemRecord,
  writeTaskQueueRecord,
  writeTaskRunRecord,
  writeValidationResult,
  writeValidationResultWithHash,
  writeWorkerLeaseRecord,
} from "./workbench/fixtures.js";

let tempDir: string;

beforeEach(() => {
  tempDir = getTempDir();
});

async function pauseTaskQueueWithWorkflow(memory: Awaited<ReturnType<typeof resolveProjectMemory>>, queue: TaskQueueRun, reason: string): Promise<TaskQueueRun> {
  const paused = await pauseTaskQueue(memory, queue, reason);
  if (paused.workflowRunId) {
    const workflow = await readWorkflowRun(memory, paused.changeId, paused.workflowRunId);
    const items = await listTaskQueueItems(memory, paused.changeId, paused.id);
    await syncWorkflowRunFromQueue(memory, workflow, paused, items, "workflow.paused", reason);
  }
  return paused;
}

describe("workbench task runtime domain", () => {
  it("disables task run actions for archived topics without losing TaskGraph facts", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Archived TaskGraph" });
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
    await createConversationChangeFixture(project(), { title: "Unknown Task" });
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
    await createConversationChangeFixture(project(), { title: "Missing Task Scope" });
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
    await createConversationChangeFixture(project(), { title: "Code Scope" });
    await writeAcceptedSpecAndTasks("code-scope");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "code.run",
      changeId: "code-scope",
      taskIds: ["T-999"],
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("projects latest TaskRun and WorkerLease state on the matching TaskGraph node", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "TaskRun State" });
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
    await createConversationChangeFixture(project(), { title: "TaskRun Reconcile" });
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
    await createConversationChangeFixture(project(), { title: "TaskRun Scoped Reconcile" });
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

  it("keeps workflow artifact hash normalization stable", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Workflow Artifact Hash" });
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
    await createConversationChangeFixture(project(), { title: "Task Queue" });
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

    const prepared = await prepareAcceptedSequentialWorkflowGraph("task-queue", ["T-001", "T-002"]);
    const result = await startOrResumeTaskQueue(project(), {
      changeId: "task-queue",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
    const memory = await resolveProjectMemory(project());
    const runPaths = { runsRoot: memory.runsRoot };
    const items = await listTaskQueueItems(runPaths, "task-queue", result.queue.id);

    expect(result.queue).toMatchObject({ status: "queued", totalCount: 1, completedCount: 0 });
    expect(items).toEqual([
      expect.objectContaining({ taskId: "T-001", status: "skipped", order: 1, workflowGraphPlanId: prepared.workflowGraphPlanId, workflowRunId: result.queue.workflowRunId }),
      expect.objectContaining({ taskId: "T-002", status: "queued", order: 2, workflowGraphPlanId: prepared.workflowGraphPlanId, workflowRunId: result.queue.workflowRunId }),
    ]);
    await expect(readWorkflowRun(runPaths, "task-queue", result.queue.workflowRunId!)).resolves.toMatchObject({
      id: result.queue.workflowRunId,
      status: "running",
      queueRunId: result.queue.id,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
  });

  it("selects the next TaskQueue item from WorkflowGraph sequential order", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "WorkflowGraph Sequential Order" });
    await writeAcceptedSpecAndTasks("workflowgraph-sequential-order");
    await writeFile(join(tempDir, "harness", "changes", "active", "workflowgraph-sequential-order", "tasks.md"), [
      "# Tasks",
      "",
      "- [ ] T-001: Implement first task.",
      "  - Covers: AC-001",
      "- [ ] T-002: Implement second task.",
      "  - Covers: AC-001",
      "",
    ].join("\n"), "utf8");
    const prepared = await prepareAcceptedSequentialWorkflowGraph("workflowgraph-sequential-order", ["T-001", "T-002"]);
    const result = await startOrResumeTaskQueue(project(), {
      changeId: "workflowgraph-sequential-order",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
    const memory = await resolveProjectMemory(project());
    const graph = await readLatestWorkflowGraphPlan(memory, join("harness", "changes", "active", "workflowgraph-sequential-order"));
    const reversedNodes = graph.nodes.slice().reverse().map((node, index) => ({ ...node, order: index + 1 }));
    const reversedGraph = {
      ...graph,
      nodes: reversedNodes,
      edges: [{ from: reversedNodes[0]?.id ?? "", to: reversedNodes[1]?.id ?? "", kind: "task-order" as const }],
    };

    await expect(selectNextSequentialGraphQueueItem(memory, reversedGraph, result.queue))
      .resolves.toEqual(expect.objectContaining({ taskId: "T-002" }));
  });

  it("guards WorkflowRun read, list, and event journal scope", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Workflow Scope A" });
    await createConcurrentChange(project(), { title: "Workflow Scope B" });
    await writeAcceptedSpecAndTasks("workflow-scope-a");
    await writeAcceptedSpecAndTasks("workflow-scope-b");
    const prepared = await prepareAcceptedSequentialWorkflowGraph("workflow-scope-a", ["T-001"]);
    const started = await startOrResumeTaskQueue(project(), { changeId: "workflow-scope-a", workflowGraphPlanId: prepared.workflowGraphPlanId });
    const memory = await resolveProjectMemory(project());
    const run = await readWorkflowRun(memory, "workflow-scope-a", started.queue.workflowRunId!);

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
    await createConversationChangeFixture(project(), { title: "Workflow Event Scope" });
    await writeAcceptedSpecAndTasks("workflow-event-scope");
    const prepared = await prepareAcceptedSequentialWorkflowGraph("workflow-event-scope", ["T-001"]);
    const result = await startOrResumeTaskQueue(project(), {
      changeId: "workflow-event-scope",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
    const workflowRunId = result.queue.workflowRunId!;
    const memory = await resolveProjectMemory(project());

    await appendWorkflowTaskEvent(memory, workflowRunId, "workflow-event-scope", "task.started", {
      workflowRunId: "workflow-forged",
      changeId: "workflow-forged-change",
      taskId: "T-001",
      taskRunId: "taskrun-1",
    } as never);

    const events = await readWorkflowRunEvents(memory, "workflow-event-scope", workflowRunId);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "task.started",
        workflowRunId,
        changeId: "workflow-event-scope",
        taskId: "T-001",
        taskRunId: "taskrun-1",
      }),
    ]));

    const run = await readWorkflowRun(memory, "workflow-event-scope", workflowRunId);
    const items = await listTaskQueueItems(memory, "workflow-event-scope", result.queue.id);
    await expect(syncWorkflowRunFromQueue(memory, run, { ...result.queue, id: "queue-forged" } as TaskQueueRun, items))
      .rejects.toThrow("already bound to a different queueRunId");
    await expect(syncWorkflowRunFromQueue(memory, { ...run, changeId: "workflow-other-change" } as WorkflowRun, result.queue, items))
      .rejects.toThrow("must belong to the same Change");
  });

  it("rejects direct TaskQueue start without an accepted WorkflowGraphPlan", async () => {
    await initHarness(project());
    const change = await createConversationChangeFixture(project(), { title: "Task Queue Direct Start" });
    await writeAcceptedSpecAndTasks(change.changeId);

    await expect(startOrResumeTaskQueue(project(), { changeId: change.changeId })).rejects.toThrow("TaskQueue start requires an accepted authored sequential WorkflowGraphPlan");
  });

  it("resumes a paused TaskQueue from existing completed task evidence without starting a new coder run", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Workflow Resume Evidence" });
    await writeAcceptedSpecAndTasks("workflow-resume-evidence");
    const prepared = await prepareAcceptedSequentialWorkflowGraph("workflow-resume-evidence", ["T-001"]);
    const startedQueue = await startOrResumeTaskQueue(project(), {
      changeId: "workflow-resume-evidence",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
    const workflowRunId = startedQueue.queue.workflowRunId!;
    const memory = await resolveProjectMemory(project());
    await pauseTaskQueueWithWorkflow(memory, startedQueue.queue, "test pause");
    await writeTaskRunRecord("workflow-resume-evidence", "taskrun-resume-1", "T-001", "evidence-ready", 1, {
      runId: "run-resume-coder",
      worktreeId: "wt-resume-1",
    });
    await writeCoderRun("workflow-resume-evidence", "run-resume-coder", ["T-001"], "wt-resume-1", "completed", "taskrun-resume-1");
    await writeValidationResult("workflow-resume-evidence", "run-resume-validation", "wt-resume-1", "passed");
    await writeAuditResult("workflow-resume-evidence", "run-resume-audit", "wt-resume-1", "approved");
    const [resumeItem] = await listTaskQueueItems(memory, "workflow-resume-evidence", startedQueue.queue.id);
    if (!resumeItem) throw new Error("Expected resume queue item.");
    const candidate = await findTaskRunStageResumeCandidate(memory, "workflow-resume-evidence", resumeItem);
    if (!candidate) throw new Error("Expected completed resume candidate.");
    const resumed = await runResumedTaskRunStage({
      project: project(),
      memory,
      taskRun: candidate.taskRun,
      verdict: candidate.verdict,
    });
    expect(resumed.workflow).toMatchObject({
      stoppedAt: null,
      validation: { validation: { status: "passed" } },
      audit: { audit: { status: "approved" } },
    });

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "task.queue.start",
      changeId: "workflow-resume-evidence",
      workflowRunId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      queueRunId: startedQueue.queue.id,
      confirm: true,
    });

    expect(result.result).toMatchObject({
      status: "completed",
      result: {
        queue: expect.objectContaining({ status: "completed", workflowRunId }),
      },
    });
    const items = await listTaskQueueItems(memory, "workflow-resume-evidence", startedQueue.queue.id);
    expect(items).toEqual([expect.objectContaining({ status: "completed", taskRunId: "taskrun-resume-1" })]);
    const coderRuns = (await listRuns(memory)).filter((run) => run.runtime === "provider-code" && run.changeId === "workflow-resume-evidence");
    expect(coderRuns.map((run) => run.id)).toEqual(["run-resume-coder"]);
    const workflow = await readWorkflowRun(memory, "workflow-resume-evidence", workflowRunId);
    expect(workflow).toMatchObject({ status: "completed", queueRunId: startedQueue.queue.id });
    await expect(readWorkflowRunEvents(memory, "workflow-resume-evidence", workflowRunId)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "task.completed", taskId: "T-001" })]),
    );
    await expect(readdir(mainAgentLoopRunsRoot(memory))).rejects.toThrow();
  });

  it("does not reuse validation evidence captured for an older worktree diff", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Stale Validation Resume" });
    await writeAcceptedSpecAndTasks("stale-validation-resume");
    const memory = await resolveProjectMemory(project());
    await writeTaskQueueRecord("stale-validation-resume", "queue-stale-validation", "paused", { totalCount: 1 });
    await writeTaskQueueItemRecord("stale-validation-resume", "queue-stale-validation", "item-stale-validation", "T-001", 1, "queued", { taskRunId: "taskrun-stale-validation" });
    await writeTaskRunRecord("stale-validation-resume", "taskrun-stale-validation", "T-001", "evidence-ready", 1, {
      runId: "run-stale-validation-coder",
      worktreeId: "wt-stale-validation",
    });
    await writeCoderRun("stale-validation-resume", "run-stale-validation-coder", ["T-001"], "wt-stale-validation", "completed", "taskrun-stale-validation");
    await writeValidationResultWithHash("stale-validation-resume", "run-stale-validation", "wt-stale-validation", "older-diff", "passed");
    const [item] = await listTaskQueueItems(memory, "stale-validation-resume", "queue-stale-validation");
    if (!item) throw new Error("Expected stale validation queue item.");

    await expect(findTaskRunStageResumeCandidate(memory, "stale-validation-resume", item)).resolves.toMatchObject({
      taskRun: { id: "taskrun-stale-validation" },
      verdict: { kind: "continue-validation", runId: "run-stale-validation-coder" },
    });
  });

  it("reclaims an interrupted TaskRun without changing its attempt or worktree", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Workflow Interrupted Resume" });
    await writeAcceptedSpecAndTasks("workflow-interrupted-resume");
    const prepared = await prepareAcceptedSequentialWorkflowGraph("workflow-interrupted-resume", ["T-001"]);
    const startedQueue = await startOrResumeTaskQueue(project(), {
      changeId: "workflow-interrupted-resume",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
    const memory = await resolveProjectMemory(project());
    await pauseTaskQueueWithWorkflow(memory, startedQueue.queue, "provider switch");
    const [item] = await listTaskQueueItems(memory, "workflow-interrupted-resume", startedQueue.queue.id);
    if (!item) throw new Error("Expected interrupted queue item.");
    await writeTaskRunRecord("workflow-interrupted-resume", "taskrun-interrupted-1", "T-001", "interrupted", 1, {
      runId: "run-interrupted-1",
      worktreeId: "wt-interrupted-1",
    });
    await writeCoderRun("workflow-interrupted-resume", "run-interrupted-1", ["T-001"], "wt-interrupted-1", "interrupted", "taskrun-interrupted-1");
    await writeTaskQueueItemRecord("workflow-interrupted-resume", startedQueue.queue.id, item.id, item.taskId, item.order, "queued", {
      taskRunId: "taskrun-interrupted-1",
      workflowRunId: startedQueue.queue.workflowRunId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });

    const refreshedItem = (await listTaskQueueItems(memory, "workflow-interrupted-resume", startedQueue.queue.id))[0]!;
    await expect(findTaskRunStageResumeCandidate(memory, "workflow-interrupted-resume", refreshedItem)).resolves.toMatchObject({
      taskRun: { id: "taskrun-interrupted-1", attempt: 1, worktreeId: "wt-interrupted-1" },
      verdict: { kind: "continue-coder", worktreeId: "wt-interrupted-1" },
    });
    const reclaimed = await resumeInterruptedTaskRun(project(), { changeId: "workflow-interrupted-resume", taskRunId: "taskrun-interrupted-1" });
    expect(reclaimed.taskRun).toMatchObject({ id: "taskrun-interrupted-1", attempt: 1, worktreeId: "wt-interrupted-1", status: "claimed" });
    expect(reclaimed.lease.taskRunId).toBe("taskrun-interrupted-1");
  });

  it("does not resume a queue item from TaskRun evidence bound to another queue", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Workflow Resume Queue Scope" });
    await writeAcceptedSpecAndTasks("workflow-resume-queue-scope");
    const memory = await resolveProjectMemory(project());
    await writeTaskQueueRecord("workflow-resume-queue-scope", "queue-old", "completed", { totalCount: 1, completedCount: 1 });
    await writeTaskQueueItemRecord("workflow-resume-queue-scope", "queue-old", "queue-old-item-001", "T-001", 1, "completed", { taskRunId: "taskrun-old" });
    await writeTaskRunRecord("workflow-resume-queue-scope", "taskrun-old", "T-001", "evidence-ready", 1, {
      runId: "run-old-coder",
      worktreeId: "wt-old",
    });
    await writeCoderRun("workflow-resume-queue-scope", "run-old-coder", ["T-001"], "wt-old", "completed", "taskrun-old");
    await writeValidationResult("workflow-resume-queue-scope", "validation-old", "wt-old", "passed");
    await writeAuditResult("workflow-resume-queue-scope", "audit-old", "wt-old", "approved");
    await writeTaskQueueRecord("workflow-resume-queue-scope", "queue-new", "queued", { totalCount: 1 });
    await writeTaskQueueItemRecord("workflow-resume-queue-scope", "queue-new", "queue-new-item-001", "T-001", 1, "queued");

    const [currentItem] = await listTaskQueueItems(memory, "workflow-resume-queue-scope", "queue-new");
    if (!currentItem) throw new Error("Expected current queue item.");

    await expect(findTaskRunStageResumeCandidate(memory, "workflow-resume-queue-scope", currentItem))
      .resolves.toBeNull();
  });

  it("records a queue pause decision without starting a child TaskRun when live sink is closed", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Workflow Queue Pause" });
    await writeAcceptedSpecAndTasks("workflow-queue-pause");
    const prepared = await prepareAcceptedSequentialWorkflowGraph("workflow-queue-pause", ["T-001"]);
    const memory = await resolveProjectMemory(project());

    const result = await runTaskQueueSequentialWorkflow({
      project: project(),
      changeId: "workflow-queue-pause",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      live: {
      emit: () => undefined,
      isClosed: () => true,
      },
    });
    const queueResult = result as { queue: TaskQueueRun };

    expect(result).toMatchObject({
      queue: expect.objectContaining({ status: "paused", pausedReason: "队列已暂停，等待继续。" }),
    });
    await expect(readdir(mainAgentLoopRunsRoot(memory))).rejects.toThrow();
    await expect(readWorkflowRunEvents(memory, "workflow-queue-pause", result.workflowRun!.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "workflow.paused", queueRunId: queueResult.queue.id })]),
    );
    const items = await listTaskQueueItems(memory, "workflow-queue-pause", queueResult.queue.id);
    expect(items).toEqual([expect.objectContaining({ status: "queued" })]);
    expect(items[0]?.taskRunId).toBeUndefined();
  });

  it("fails closed when a TaskQueue item loses WorkflowGraph scope", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Workflow Item Scope Missing" });
    await writeAcceptedSpecAndTasks("workflow-item-scope-missing");
    const prepared = await prepareAcceptedSequentialWorkflowGraph("workflow-item-scope-missing", ["T-001"]);
    const startedQueue = await startOrResumeTaskQueue(project(), {
      changeId: "workflow-item-scope-missing",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
    const workflowRunId = startedQueue.queue.workflowRunId!;
    const memory = await resolveProjectMemory(project());
    await pauseTaskQueueWithWorkflow(memory, startedQueue.queue, "test pause");
    const [item] = await listTaskQueueItems(memory, "workflow-item-scope-missing", startedQueue.queue.id);
    if (!item) throw new Error("Expected queued item.");
    await writeTaskQueueItemRecord("workflow-item-scope-missing", startedQueue.queue.id, item.id, item.taskId, item.order, "queued", {
      workflowRunId,
    });

    const result = await runTaskQueueSequentialWorkflow({
      project: project(),
      changeId: "workflow-item-scope-missing",
      workflowRunId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      queueRunId: startedQueue.queue.id,
    });

    expect(result).toMatchObject({
      queue: expect.objectContaining({ status: "failed" }),
    });
    const items = await listTaskQueueItems(memory, "workflow-item-scope-missing", startedQueue.queue.id);
    expect(items).toEqual([expect.objectContaining({
      id: item.id,
      status: "failed",
      failureReason: expect.stringContaining("TaskQueue item graph scope is stale"),
    })]);
  });

  it("rejects explicit forged typed scope when resuming a paused TaskQueue", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Workflow Resume Forged Scope" });
    await writeAcceptedSpecAndTasks("workflow-resume-forged-scope");
    const prepared = await prepareAcceptedSequentialWorkflowGraph("workflow-resume-forged-scope", ["T-001"]);
    const startedQueue = await startOrResumeTaskQueue(project(), {
      changeId: "workflow-resume-forged-scope",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
    const workflowRunId = startedQueue.queue.workflowRunId!;
    const memory = await resolveProjectMemory(project());
    await pauseTaskQueueWithWorkflow(memory, startedQueue.queue, "test pause");

    await expect(startOrResumeTaskQueue(project(), {
      changeId: "workflow-resume-forged-scope",
      workflowRunId,
      queueRunId: startedQueue.queue.id,
      workflowGraphPlanId: "workflow-graph-forged",
    })).rejects.toThrow("TaskQueue resume scope is stale or incomplete");
  });

  it("projects TaskQueue status into Workpad and disables single-task actions while queued", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Queued Workpad" });
    await writeAcceptedSpecAndTasks("queued-workpad");
    const prepared = await prepareAcceptedSequentialWorkflowGraph("queued-workpad", ["T-001"]);
    const result = await startOrResumeTaskQueue(project(), {
      changeId: "queued-workpad",
      workflowGraphPlanId: prepared.workflowGraphPlanId,
    });
    const workflowRunId = result.queue.workflowRunId!;

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "queued-workpad" });
    const node = snapshot.center.workpad.taskGraph.nodes.find((item) => item.taskId === "T-001");

    expect(snapshot.center.workpad.taskQueue).toMatchObject({
      id: result.queue.id,
      status: "queued",
      totalCount: 1,
      workflowRunId,
      workflowGraphPlanId: prepared.workflowGraphPlanId,
      nextAction: expect.objectContaining({
        actionType: "task.queue.reconcile",
        label: "刷新执行状态",
        queueRunId: result.queue.id,
        workflowRunId,
        workflowGraphPlanId: prepared.workflowGraphPlanId,
      }),
    });
    expect(node?.nextAction).toMatchObject({ enabled: false, disabledReason: "本地顺序执行正在运行或等待恢复。" });
  });

  it("projects blocked queue as the primary decision and moves stale audit approvals to history", async () => {
    await initHarness(project());
    await createConversationChangeFixture(project(), { title: "Queue Blocked Decision" });
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
      title: "任务暂停",
      resultSummary: "本地顺序执行暂停在当前任务，详细原因可在诊断工具中查看。",
      userStatus: "needs-rework",
    });
    expect(snapshot.right.decisionInspector.primary?.title).not.toContain("T-001");
    expect(snapshot.right.decisionInspector.primary?.resultSummary).not.toContain("Audit blocked");
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
    await createConversationChangeFixture(project(), { title: "Queue Reconcile" });
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
