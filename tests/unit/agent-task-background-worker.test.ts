import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startBackgroundWorker } from "../../src/agent-task/background-worker.js";
import { EvolutionScoreBlockedError } from "../../src/agent-task/maintenance-provider-runner.js";
import { createAgentTask, listAgentTasks, readAgentTaskResult } from "../../src/agent-task/repository.js";
import * as agentTaskRepository from "../../src/agent-task/repository.js";
import type { HarnessEngineeringAssignment } from "../../src/agent-task/harness-engineering-contract.js";
import { repoLocalMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";

describe("background AgentTask worker", () => {
  let root: string | undefined;
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  it("is disabled by default and never invokes real execution", async () => {
    const setup = await fixture();
    const runAssignment = vi.fn();
    const worker = startBackgroundWorker(setup.memory, setup.project, { assignmentFactory, runAssignment });

    expect(await worker.poll()).toBe(0);
    expect(runAssignment).not.toHaveBeenCalled();
    expect((await listAgentTasks(setup.memory))[0].status).toBe("queued");
    await worker.drain();
  });

  it("claims a bounded number, checkpoints, and completes strict assignments", async () => {
    const setup = await fixture(2);
    const runAssignment = vi.fn().mockResolvedValue({ summary: "reviewed package", artifactRefs: ["evidence/package.json"] });
    const worker = startBackgroundWorker(setup.memory, setup.project, {
      enabled: true,
      maxTasksPerPoll: 1,
      pollIntervalMs: 60_000,
      assignmentFactory,
      runAssignment,
    });

    expect(await worker.poll()).toBe(1);
    expect(runAssignment).toHaveBeenCalledTimes(1);
    const completed = (await listAgentTasks(setup.memory)).filter((task) => task.status === "completed");
    expect(completed).toHaveLength(1);
    expect(completed[0].checkpoint).toMatchObject({ summary: "reviewed package", artifactRefs: ["evidence/package.json"] });
    expect(await readAgentTaskResult(setup.memory, completed[0].id)).toMatchObject({
      status: "completed",
      artifactRefs: ["evidence/package.json"],
    });
    await worker.drain();
  });

  it("returns retryable failures to the queue and includes checkpoint evidence in the next assignment", async () => {
    const setup = await fixture();
    const failure = Object.assign(new Error("provider temporarily unavailable"), {
      artifactRefs: ["evidence/verification-failure.json"],
    });
    const assignments: HarnessEngineeringAssignment[] = [];
    let attempt = 0;
    const worker = startBackgroundWorker(setup.memory, setup.project, {
      enabled: true,
      pollIntervalMs: 60_000,
      assignmentFactory,
      runAssignment: async ({ assignment }) => {
        assignments.push(assignment);
        if (attempt++ === 0) throw failure;
        return { summary: "recovered", artifactRefs: ["evidence/recovered.json"] };
      },
    });

    expect(await worker.poll()).toBe(1);
    expect((await listAgentTasks(setup.memory))[0]).toMatchObject({
      status: "queued",
      attempt: 1,
      failureDisposition: "retryable",
    });
    expect(await worker.poll()).toBe(1);
    expect(assignments[0].evidenceRefs).toEqual(["archive:change-0"]);
    expect(assignments[1].evidenceRefs).toEqual([
      "archive:change-0",
      "evidence/verification-failure.json",
    ]);
    expect((await listAgentTasks(setup.memory))[0].status).toBe("completed");
    await worker.drain();
  });

  it("keeps blocked evolution evidence on the terminal AgentTask result", async () => {
    const setup = await fixture();
    const error = new EvolutionScoreBlockedError("score remained below 80", {
      version: "4.0",
      status: "blocked",
      taskId: "task",
      mode: "evolve-assigned-window",
      roots: { project: setup.project.path, memory: setup.memory.memoryRoot },
      producer: { role: "evolution-agent", threadId: "parent", summary: "proposal", changedFiles: [] },
      proposal: "proposal",
      scoringAttempts: [],
      application: "not-applied",
    });
    error.artifactRefs = ["evidence/blocked-evolution.json"];
    const worker = startBackgroundWorker(setup.memory, setup.project, {
      enabled: true,
      pollIntervalMs: 60_000,
      assignmentFactory,
      runAssignment: async () => { throw error; },
    });

    expect(await worker.poll()).toBe(1);
    const [task] = await listAgentTasks(setup.memory);
    expect(task.status).toBe("blocked");
    expect(await readAgentTaskResult(setup.memory, task.id)).toMatchObject({
      status: "blocked",
      artifactRefs: ["evidence/blocked-evolution.json"],
      failureClassification: "evolution-quality-blocked",
    });
    await worker.drain();
  });

  it("fails fast when execution is enabled without an injected runner", async () => {
    const setup = await fixture();
    expect(() => startBackgroundWorker(setup.memory, setup.project, {
      enabled: true,
      assignmentFactory,
    })).toThrow("runAssignment is not configured");
  });

  it("does not claim another project-memory task while one is already running", async () => {
    const setup = await fixture(2);
    const tasks = await listAgentTasks(setup.memory);
    const claimed = await agentTaskRepository.claimAgentTask(setup.memory, tasks[0], { owner: "other-worker" });
    await agentTaskRepository.startAgentTask(setup.memory, claimed, {
      claimToken: claimed.lease!.claimToken,
      fencingToken: claimed.lease!.fencingToken,
    });
    const runAssignment = vi.fn();
    const worker = startBackgroundWorker(setup.memory, setup.project, {
      enabled: true,
      pollIntervalMs: 60_000,
      assignmentFactory,
      runAssignment,
    });

    expect(await worker.poll()).toBe(0);
    expect(runAssignment).not.toHaveBeenCalled();
    expect((await listAgentTasks(setup.memory)).filter((task) => task.status === "queued")).toHaveLength(1);
    await worker.drain();
  });

  it("atomically claims only one queue head across concurrent workers", async () => {
    const setup = await fixture(2);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const runAssignment = vi.fn(async () => blocked);
    const first = startBackgroundWorker(setup.memory, setup.project, {
      enabled: true, pollIntervalMs: 60_000, owner: "worker-a", assignmentFactory, runAssignment,
    });
    const second = startBackgroundWorker(setup.memory, setup.project, {
      enabled: true, pollIntervalMs: 60_000, owner: "worker-b", assignmentFactory, runAssignment,
    });

    const polls = [first.poll(), second.poll()];
    await vi.waitFor(() => expect(runAssignment).toHaveBeenCalledTimes(1), { timeout: 5_000, interval: 20 });
    expect((await listAgentTasks(setup.memory)).filter((task) => task.status === "running")).toHaveLength(1);
    release();
    expect((await Promise.all(polls)).sort()).toEqual([0, 1]);
    await Promise.all([first.drain(), second.drain()]);
  });

  it("aborts and requeues an in-flight provider assignment during drain", async () => {
    const setup = await fixture();
    const worker = startBackgroundWorker(setup.memory, setup.project, {
      enabled: true,
      pollIntervalMs: 60_000,
      assignmentFactory,
      runAssignment: async ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    });
    const poll = worker.poll();
    await vi.waitFor(
      async () => expect((await listAgentTasks(setup.memory))[0].status).toBe("running"),
      { timeout: 5_000, interval: 20 },
    );
    await Promise.all([poll, worker.drain()]);
    expect((await listAgentTasks(setup.memory))[0]).toMatchObject({ status: "queued", failureDisposition: "retryable" });
  });

  it("interrupts the provider hook when heartbeat detects an invalid lease", async () => {
    const setup = await fixture();
    const leaseError = new Error("lease fencing token is stale");
    const heartbeat = vi.spyOn(agentTaskRepository, "heartbeatAgentTask").mockRejectedValueOnce(leaseError);
    const onLeaseInvalidated = vi.fn();
    const worker = startBackgroundWorker(setup.memory, setup.project, {
      enabled: true,
      pollIntervalMs: 60_000,
      leaseDurationMs: 3_000,
      assignmentFactory,
      onLeaseInvalidated,
      runAssignment: async ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    });

    await worker.poll();
    expect(onLeaseInvalidated).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }), leaseError);
    expect((await listAgentTasks(setup.memory))[0]).toMatchObject({ status: "queued", failureDisposition: "retryable" });
    heartbeat.mockRestore();
    await worker.drain();
  });

  async function fixture(count = 1) {
    root = await mkdtemp(join(tmpdir(), "aho-background-worker-"));
    const memory = repoLocalMemory(root, "project-1");
    const managed = project(root);
    for (let index = 0; index < count; index += 1) {
      await createAgentTask(memory, {
        conversationId: `maintenance:change-${index}`,
        changeId: `change-${index}`,
        roleId: `memory-maintenance-agent:hash-${index}`,
        kind: "background",
        createdBy: "maintenance-policy",
        summary: "maintenance",
        inputArtifacts: [`archive:change-${index}`],
      });
    }
    return { memory, project: managed };
  }
});

function project(path: string): ManagedProject {
  return { id: "project-1", name: "Project", path, addedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
}

function assignmentFactory(task: { id: string; inputArtifacts: string[] }, managed: ManagedProject): HarnessEngineeringAssignment {
  return {
    mode: "maintain-assigned-closeout",
    taskId: task.id,
    projectRoot: managed.path,
    memoryRoot: "C:/memory",
    evidenceRefs: task.inputArtifacts,
    requiredVerification: [],
  };
}
