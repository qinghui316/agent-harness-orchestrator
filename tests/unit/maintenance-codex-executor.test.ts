import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { repoLocalMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";
import type { HarnessEngineeringAssignment } from "../../src/agent-task/harness-engineering-contract.js";
import { WorkbenchStore } from "../../src/workbench/store.js";

const appServerTurn = vi.hoisted(() => vi.fn());

vi.mock("../../src/codex/app-server.js", () => ({
  getActiveCodexAppServerTurn: vi.fn(() => null),
  runCodexAppServerTurn: appServerTurn,
}));

vi.mock("../../src/skill/catalog.js", () => ({
  getRuntimeAssignedHarnessSkillContext: vi.fn(async () => ({
    records: [],
    warnings: [],
    promptSection: "task packet",
  })),
}));

import {
  MaintenanceVerificationError,
  runCodexMaintenanceAssignment,
} from "../../src/agent-task/maintenance-codex-executor.js";

describe("Codex maintenance verification repair", () => {
  let root: string | undefined;

  afterEach(async () => {
    appServerTurn.mockReset();
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("continues the same provider thread once and passes the second verification", async () => {
    const setup = await fixture();
    appServerTurn.mockImplementation(async (options: { existingThreadId?: string | null }) => {
      if (options.existingThreadId) await writeFile(setup.marker, "repaired\n", "utf8");
      return providerResult(options.existingThreadId ? "repaired" : "initial");
    });

    const result = await runCodexMaintenanceAssignment(
      setup.memory,
      setup.project,
      assignment(setup),
      undefined,
      undefined,
      { taskId: "task-1", conversationId: "maintenance:change-1", changeId: "change-1" },
    );

    expect(result.summary).toBe("repaired");
    expect(appServerTurn).toHaveBeenCalledTimes(2);
    expect(appServerTurn.mock.calls[1][0]).toMatchObject({
      existingThreadId: "maintenance-thread",
      sandboxPolicy: "workspace-write",
      conversationId: "maintenance:change-1",
      changeId: "change-1",
      agentTaskId: "task-1",
    });
    const store = await WorkbenchStore.open(setup.memory);
    try {
      expect(store.listProviderThreads(setup.project.id, "maintenance:change-1")).toEqual([
        expect.objectContaining({
          providerThreadId: "maintenance-thread",
          roleId: "memory-maintenance-agent",
          runId: expect.stringMatching(/^maintenance-/),
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("returns all verification evidence after the bounded repair still fails", async () => {
    const setup = await fixture();
    appServerTurn.mockResolvedValue(providerResult("unchanged"));

    const error = await runCodexMaintenanceAssignment(
      setup.memory,
      setup.project,
      assignment(setup),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MaintenanceVerificationError);
    const artifactRefs = (error as MaintenanceVerificationError).artifactRefs;
    expect(artifactRefs.some((ref) => ref.endsWith("task-1.json"))).toBe(true);
    expect(artifactRefs.filter((ref) => ref.endsWith("check-repair.stdout.log"))).toHaveLength(2);
    expect(artifactRefs.filter((ref) => ref.endsWith("check-repair.stderr.log"))).toHaveLength(2);
    expect(artifactRefs.some((ref) => ref.includes("attempt-1"))).toBe(true);
    expect(artifactRefs.some((ref) => ref.includes("attempt-2"))).toBe(true);
    expect(new Set(artifactRefs).size).toBe(artifactRefs.length);
    expect(appServerTurn).toHaveBeenCalledTimes(2);
  });

  async function fixture() {
    root = await mkdtemp(join(tmpdir(), "aho-maintenance-repair-"));
    const project: ManagedProject = {
      id: "project-1",
      name: "Project",
      path: root,
      addedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    return {
      project,
      memory: repoLocalMemory(root, project.id),
      marker: join(root, "repair-complete.txt"),
    };
  }
});

function assignment(setup: { project: ManagedProject; marker: string }): HarnessEngineeringAssignment {
  return {
    mode: "maintain-assigned-closeout",
    taskId: "task-1",
    projectRoot: setup.project.path,
    memoryRoot: setup.project.path,
    evidenceRefs: ["archive/change-1/summary.md"],
    requiredVerification: [{
      name: "check-repair",
      command: [process.execPath, "-e", "process.exit(require('node:fs').existsSync(process.argv[1]) ? 0 : 1)", setup.marker],
    }],
  };
}

function providerResult(message: string) {
  return {
    status: "completed",
    threadId: "maintenance-thread",
    turnId: `turn-${message}`,
    lastMessage: message,
    changedFiles: [],
    childThreads: [],
    error: null,
  };
}
