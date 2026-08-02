import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";
import { completeAgentTask, createAgentTask, readAgentTaskResult, startAgentTask } from "../../src/agent-task/manager.js";

describe("agent task durable boundaries", () => {
  let tempDir: string | undefined;
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("preserves AgentTask lifecycle and result artifacts", async () => {
    const memory = await setup();
    const task = await createAgentTask(memory, { conversationId: "conversation-1", changeId: "change-1", roleId: "coder", kind: "foreground", summary: "Implement.", initialStatus: "running" });
    const result = await completeAgentTask(memory, await startAgentTask(memory, task), { status: "completed", summary: "Completed.", artifactRefs: ["artifact.md"] });
    expect(result.artifactRefs).toEqual(["artifact.md"]);
    await expect(readAgentTaskResult(memory, task.id)).resolves.toMatchObject({ status: "completed" });
  });

  async function setup() {
    tempDir = await mkdtemp(join(tmpdir(), "aho-agent-task-"));
    const project: ManagedProject = { id: "agent-task-test", name: "AgentTask Test", path: tempDir, addedAt: "2026-06-09T00:00:00.000Z", lastSeenAt: "2026-06-09T00:00:00.000Z" };
    await initHarness(project);
    return resolveProjectMemory(project);
  }
});
