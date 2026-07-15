import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { repoLocalMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";
import type { HarnessEngineeringAssignment } from "../../src/agent-task/harness-engineering-contract.js";
import { WorkbenchStore } from "../../src/workbench/store.js";

const appServerTurn = vi.hoisted(() => vi.fn());

vi.mock("../../src/codex/app-server.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/codex/app-server.js")>();
  return {
    ...actual,
    detectCodexAppServerCapability: vi.fn(async () => ({
      available: true,
      supportsStdio: true,
      supportsRequiredLifecycle: true,
      nativeCollab: { multiAgent: "enabled", multiAgentV2: "enabled", configPath: "test", errors: [] },
      help: "codex app server --listen stdio://",
      errors: [],
    })),
    getActiveCodexAppServerTurn: vi.fn(() => null),
    listActiveCodexAppServerTurns: vi.fn(() => []),
    runCodexAppServerTurn: appServerTurn,
  };
});

vi.mock("../../src/codex/capabilities.js", () => ({
  detectCodexCapabilities: vi.fn(async () => readyCodexCapabilities()),
}));

vi.mock("../../src/skill/catalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/skill/catalog.js")>();
  return {
    ...actual,
    getRuntimeAssignedHarnessSkillContext: vi.fn(async () => ({
      records: [],
      warnings: [],
      promptSection: "task packet",
    })),
  };
});

import {
  MaintenanceVerificationError,
  runMaintenanceAssignment,
} from "../../src/agent-task/maintenance-provider-executor.js";

describe("provider adapter maintenance verification repair", () => {
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

    const result = await runMaintenanceAssignment(
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
          providerId: "codex",
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

    const error = await runMaintenanceAssignment(
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

  it("persists background Agent timeline items before publishing live events", async () => {
    const setup = await fixture();
    let durableRowsAtLiveDelivery = 0;
    appServerTurn.mockImplementation(async (options: { onRealtimeEvent?: (event: unknown) => void }) => {
      options.onRealtimeEvent?.({
        projectId: setup.project.id,
        conversationId: "maintenance:change-1",
        runId: "provider-run",
        threadId: "maintenance-thread",
        turnId: "turn-1",
        itemId: "message-1",
        roleId: "memory-maintenance-agent",
        streamEvent: { type: "text_delta", delta: "正在维护项目说明" },
      });
      return providerResult("维护完成");
    });

    await runMaintenanceAssignment(
      setup.memory,
      setup.project,
      { ...assignment(setup), requiredVerification: [] },
      undefined,
      () => {
        const database = new Database(setup.memory.workbenchDbPath, { readonly: true });
        try {
          durableRowsAtLiveDelivery = Number((database.prepare("SELECT COUNT(*) AS count FROM canonical_timeline_items WHERE conversation_id = ?").get("maintenance:change-1") as { count: number }).count);
        } finally {
          database.close();
        }
      },
      { taskId: "task-1", conversationId: "maintenance:change-1", changeId: "change-1" },
    );

    expect(durableRowsAtLiveDelivery).toBeGreaterThan(0);
    const store = await WorkbenchStore.open(setup.memory);
    try {
      const messages = store.listConversationMessages(setup.project.id, "maintenance:change-1");
      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages[0]!.rawJson)).toMatchObject({
        providerId: "codex",
        agentRoleId: "memory-maintenance-agent",
        text: "维护完成",
        status: "completed",
        blocks: [expect.objectContaining({ kind: "prose", text: "正在维护项目说明" })],
      });
    } finally {
      store.close();
    }
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

function readyCodexCapabilities() {
  return {
    available: true,
    version: "test",
    approvalFlagPlacement: "exec" as const,
    supportsJson: true,
    supportsSandbox: true,
    supportsCd: true,
    supportsAddDir: true,
    supportsColor: true,
    supportsOutputLastMessage: true,
    supportsSafeResume: true,
    supportsResumeAddDir: true,
    errors: [],
  };
}
