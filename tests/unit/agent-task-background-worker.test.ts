import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startBackgroundWorker } from "../../src/agent-task/background-worker.js";
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

  it("returns retryable execution failures to the durable queue", async () => {
    const setup = await fixture();
    const worker = startBackgroundWorker(setup.memory, setup.project, {
      enabled: true,
      pollIntervalMs: 60_000,
      assignmentFactory,
      runAssignment: async () => { throw new Error("provider temporarily unavailable"); },
    });

    expect(await worker.poll()).toBe(1);
    expect((await listAgentTasks(setup.memory))[0]).toMatchObject({
      status: "queued",
      attempt: 1,
      failureDisposition: "retryable",
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
    await vi.waitFor(async () => expect((await listAgentTasks(setup.memory))[0].status).toBe("running"));
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
      leaseDurationMs: 300,
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
    projectId: managed.id,
    assignmentId: task.id,
    inputCheckpoint: "checkpoint",
    policyVersion: "policy-v1",
    sourceWindowHash: "window",
    evidenceRefs: task.inputArtifacts,
    currentDocumentRefs: [],
    currentStableMemoryRefs: [],
    canonicalTarget: {
      version: "1.0", assignmentId: task.id, mode: "canonical-direct", memoryMode: "external-local",
      baseRoot: "C:/memory", namespaces: ["docs"],
    },
    namespaceClasses: ["content"],
    requiredVerification: [],
  };
}
