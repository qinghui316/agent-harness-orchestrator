import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import {
  claimAvailableDemandWorkers,
  claimNextDemandWorker,
  enqueueDemandWorker,
  listDemandWorkerAttempts,
  listDemandWorkers,
  listMainOrchestratorDecisions,
  markDemandWorkerRunning,
  reconcileDemandWorkers,
  writeDemandWorker,
} from "../../src/demand-worker/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { getTempDir, project } from "./workbench/fixtures.js";
import { startNextDemandWorkerForRuntime } from "../../src/workflow-runtime/code-workflow.js";

const runtimeControls = vi.hoisted(() => ({
  calls: [] as Array<{ changeId: string; prompt?: string }>,
}));

vi.mock("../../src/workflow-runtime/top-level-role-chain.js", () => ({
  runTopLevelRoleChainWorkflow: vi.fn(async (input: { project: ReturnType<typeof project>; changeId: string; prompt?: string }) => {
    runtimeControls.calls.push({ changeId: input.changeId, prompt: input.prompt });
    const { resolveProjectMemory } = await import("../../src/memory/resolver.js");
    const { createAgentTask } = await import("../../src/agent-task/manager.js");
    const memory = await resolveProjectMemory(input.project);
    await createAgentTask(memory, {
      conversationId: input.changeId,
      changeId: input.changeId,
      roleId: "coder-agent",
      kind: "foreground",
      summary: "Mocked runtime-created role task.",
      initialStatus: "running",
    });
    return {
      status: "completed",
      workflowRunId: "workflow-mock",
      workflowRun: { source: "default-code-change-workflow", id: "workflow-mock", status: "completed" },
      code: { run: { id: "run-mock", worktree: { worktreeId: "worktree-mock" }, artifacts: { directory: "runs/run-mock" } } },
      validation: { validation: { id: "validation-mock", status: "passed" } },
      audit: { audit: { id: "audit-mock", status: "approved" } },
    };
  }),
}));

describe("workbench demand worker domain", () => {
  afterEach(() => {
    runtimeControls.calls = [];
  });

  it("claims one demand at a time when configured for sequential execution", async () => {
    await initHarness(project());
    const first = await createConversationChangeFixture(project(), { title: "First Demand", body: "A" });
    const second = await createConversationChangeFixture(project(), { title: "Second Demand", body: "B" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: first.changeId });
    await enqueueDemandWorker(memory, { changeId: second.changeId });

    const claimed = await claimNextDemandWorker(memory, { maxConcurrentDemands: 1 });
    if (!claimed) throw new Error("Expected first queued demand to be claimed.");
    await markDemandWorkerRunning(memory, claimed.worker, claimed.attempt);
    const blockedBySlot = await claimNextDemandWorker(memory, { maxConcurrentDemands: 1 });

    expect(blockedBySlot).toBeNull();
    const attempts = await listDemandWorkerAttempts(memory, first.changeId);
    expect(attempts).toHaveLength(1);
    const workers = await listDemandWorkers(memory);
    expect(workers).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeId: first.changeId, status: "running" }),
      expect.objectContaining({ changeId: second.changeId, status: "queued" }),
    ]));
  });

  it("resumes existing demand workers instead of creating duplicates", async () => {
    await initHarness(project());
    const topic = await createConversationChangeFixture(project(), { title: "Duplicate Demand", body: "A" });
    const memory = await resolveProjectMemory(project());

    const first = await enqueueDemandWorker(memory, { changeId: topic.changeId });
    const second = await enqueueDemandWorker(memory, { changeId: topic.changeId, waitingReason: "Still queued." });

    expect(second.resumed).toBe(true);
    expect(second.worker.id).toBe(first.worker.id);
    expect(await listDemandWorkers(memory)).toHaveLength(1);
  });

  it("scoped demand worker claims do not claim other queued demands", async () => {
    await initHarness(project());
    const first = await createConversationChangeFixture(project(), { title: "First Demand", body: "A" });
    const second = await createConversationChangeFixture(project(), { title: "Second Demand", body: "B" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: first.changeId });
    await enqueueDemandWorker(memory, { changeId: second.changeId });

    const claimed = await claimNextDemandWorker(memory, { changeId: second.changeId });
    expect(claimed?.worker.changeId).toBe(second.changeId);

    const workers = await listDemandWorkers(memory);
    expect(workers).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeId: first.changeId, status: "queued" }),
      expect.objectContaining({ changeId: second.changeId, status: "claimed" }),
    ]));
  });

  it("fails closed when a queued worker already has an active attempt", async () => {
    await initHarness(project());
    const topic = await createConversationChangeFixture(project(), { title: "Guard Demand", body: "A" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: topic.changeId });
    const claimed = await claimNextDemandWorker(memory, { changeId: topic.changeId });
    if (!claimed) throw new Error("Expected worker to be claimed.");

    await writeDemandWorker(memory, { ...claimed.worker, status: "queued" });

    await expect(claimNextDemandWorker(memory, { changeId: topic.changeId })).rejects.toThrow("Demand worker already has an active attempt");
  });

  it("claims available demand workers up to the default bounded worker slots", async () => {
    await initHarness(project());
    const first = await createConversationChangeFixture(project(), { title: "First Demand", body: "A" });
    const second = await createConversationChangeFixture(project(), { title: "Second Demand", body: "B" });
    const third = await createConversationChangeFixture(project(), { title: "Third Demand", body: "C" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: first.changeId });
    await enqueueDemandWorker(memory, { changeId: second.changeId });
    await enqueueDemandWorker(memory, { changeId: third.changeId });

    const claimed = await claimAvailableDemandWorkers(memory);
    for (const claim of claimed) {
      await markDemandWorkerRunning(memory, claim.worker, claim.attempt);
    }

    expect(claimed.map((claim) => claim.worker.changeId)).toEqual([first.changeId, second.changeId]);
    const workers = await listDemandWorkers(memory);
    expect(workers).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeId: first.changeId, status: "running" }),
      expect.objectContaining({ changeId: second.changeId, status: "running" }),
      expect.objectContaining({ changeId: third.changeId, status: "queued" }),
    ]));
  });

  it("projects demand worker state into conversation summaries without task-level queue coupling", async () => {
    await initHarness(project());
    const running = await createConversationChangeFixture(project(), { title: "Running Demand", body: "A" });
    const queued = await createConversationChangeFixture(project(), { title: "Queued Demand", body: "B" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: running.changeId });
    const claimed = await claimNextDemandWorker(memory, { changeId: running.changeId });
    if (!claimed) throw new Error("Expected worker to be claimed.");
    await markDemandWorkerRunning(memory, claimed.worker, claimed.attempt);
    await enqueueDemandWorker(memory, { changeId: queued.changeId, waitingReason: "等待本地处理槽位。" });

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: running.changeId });

    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: running.conversationId, userStatusLabel: "处理中" }),
      expect.objectContaining({ id: queued.conversationId, userStatusLabel: "稍后处理" }),
    ]));
    expect(snapshot.center.workpad.background).toMatchObject({ queuedCount: 1 });
    expect(snapshot.center.workpad.background.items[0]).toMatchObject({ id: queued.conversationId, userStatusLabel: "稍后处理" });
  });

  it("records MainOrchestrator decisions for demand enqueue and claim", async () => {
    await initHarness(project());
    const topic = await createConversationChangeFixture(project(), { title: "Decision Demand", body: "A" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: topic.changeId });
    const claimed = await claimNextDemandWorker(memory, { changeId: topic.changeId });
    expect(claimed).toBeTruthy();

    const decisions = await listMainOrchestratorDecisions(memory);
    expect(decisions.map((decision) => decision.action)).toEqual(expect.arrayContaining(["enqueue", "coding"]));
    expect(decisions.every((decision) => decision.changeId === topic.changeId)).toBe(true);
  });

  it("reconciles demand worker evidence without changing worker state", async () => {
    await initHarness(project());
    const topic = await createConversationChangeFixture(project(), { title: "Reconcile Demand", body: "A" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: topic.changeId });
    const claimed = await claimNextDemandWorker(memory, { changeId: topic.changeId });
    if (!claimed) throw new Error("Expected worker to be claimed.");

    const result = await reconcileDemandWorkers(memory);

    expect(result.workers).toEqual(expect.arrayContaining([expect.objectContaining({ changeId: topic.changeId, status: "claimed" })]));
    expect(result.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ id: claimed.attempt.id, status: "claimed" })]));
    expect(result.decisions.map((decision) => decision.action)).toEqual(expect.arrayContaining(["enqueue", "coding"]));
    expect(await listDemandWorkers(memory)).toEqual(expect.arrayContaining([expect.objectContaining({ changeId: topic.changeId, status: "claimed" })]));
  });

  it("fails closed before Workflow Runtime when confirmed planning artifacts are missing", async () => {
    await initHarness(project());
    const topic = await createConversationChangeFixture(project(), { title: "Missing Plan Demand", body: "A" });
    const memory = await resolveProjectMemory(project());
    await enqueueDemandWorker(memory, { changeId: topic.changeId });

    const result = await startNextDemandWorkerForRuntime(project(), topic.changeId, "run it", undefined);

    expect(runtimeControls.calls).toHaveLength(0);
    expect(result).toMatchObject({ status: "needs-user-input" });
    expect(await listDemandWorkers(memory)).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeId: topic.changeId, status: "needs-user-input" }),
    ]));
    expect(await listDemandWorkerAttempts(memory, topic.changeId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "needs-user-input", resultStatus: "needs-user-input" }),
    ]));
  });

  it("runs claimed DemandWorker execution through Workflow Runtime and preserves new AgentTask ids", async () => {
    await initHarness(project());
    const topic = await createConversationChangeFixture(project(), { title: "Runtime Demand", body: "A" });
    const memory = await resolveProjectMemory(project());
    await writeConfirmedPlanningArtifacts(memory, topic.changeId);
    await enqueueDemandWorker(memory, { changeId: topic.changeId });

    const result = await startNextDemandWorkerForRuntime(project(), topic.changeId, "implement it", undefined);

    expect(runtimeControls.calls).toEqual([{ changeId: topic.changeId, prompt: "implement it" }]);
    expect(result).toMatchObject({
      status: "result-ready",
      orchestrationResult: {
        status: "completed",
        workflowRun: { source: "default-code-change-workflow" },
      },
    });
    const attempts = await listDemandWorkerAttempts(memory, topic.changeId);
    expect(attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "completed",
        resultStatus: "completed",
        agentTaskIds: expect.arrayContaining([expect.stringContaining("coder-agent")]),
      }),
    ]));
  });
});

async function writeConfirmedPlanningArtifacts(memory: Awaited<ReturnType<typeof resolveProjectMemory>>, changeId: string): Promise<void> {
  const changeDir = join(memory.changesRoot, "active", changeId);
  await writeFile(join(changeDir, "spec.md"), "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Do the work.\n", "utf8");
  await writeFile(join(changeDir, "plan.md"), "# Plan\n\nImplement the accepted work.\n", "utf8");
  await writeFile(join(changeDir, "tasks.md"), "# Tasks\n\n- [ ] T-001: Implement.\n  - Covers: AC-001\n", "utf8");
  await writeFile(join(changeDir, "ac-map.json"), "{\"version\":\"1.0\",\"changeId\":\"test\",\"criteria\":[],\"tasks\":[],\"links\":[],\"warnings\":[],\"blockingIssues\":[]}\n", "utf8");
}
