import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";
import {
  buildRoleScopedContextProjection,
  checkDocBudgets,
  claimAgentTask,
  completeAgentTask,
  createAgentTask,
  listAgentTasks,
  listDemandMemoryCloseouts,
  maybeRunMaintenanceReviewWindow,
  readAgentTaskResult,
  readMaintenanceReviewWatermark,
  recordDemandMemoryCloseout,
  runMaintenanceCandidatePipeline,
} from "../../src/agent-task/manager.js";

describe("AgentTask domain boundaries", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-agent-task-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("keeps the manager facade compatible while internal agent-task modules avoid the facade", async () => {
    expect(typeof createAgentTask).toBe("function");
    expect(typeof completeAgentTask).toBe("function");
    expect(typeof recordDemandMemoryCloseout).toBe("function");
    expect(typeof runMaintenanceCandidatePipeline).toBe("function");

    const offenders = (await listSourceFiles("src/agent-task"))
      .filter((file) => !file.endsWith("manager.ts"))
      .filter((file) => /from\s+["']\.\/manager\.js["']/.test(readFileSyncUtf8(file)));
    expect(offenders).toEqual([]);
  });

  it("preserves AgentTask lifecycle and result artifact behavior", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    const task = await createAgentTask(memory, {
      conversationId: "conversation-1",
      changeId: "change-1",
      roleId: "coder-agent",
      kind: "foreground",
      summary: "Run coder",
      inputArtifacts: ["harness/changes/active/change-1/spec.md"],
    });
    const claimed = await claimAgentTask(memory, task);
    const result = await completeAgentTask(memory, claimed, {
      status: "completed",
      summary: "Coder completed",
      artifactRefs: ["runs/code/change-1/result.md"],
    });

    expect(claimed.status).toBe("claimed");
    expect(result).toMatchObject({
      taskId: task.id,
      roleId: "coder-agent",
      status: "completed",
      artifactRefs: ["runs/code/change-1/result.md"],
    });
    await expect(readAgentTaskResult(memory, task.id)).resolves.toMatchObject({ taskId: task.id });
    await expect(listAgentTasks(memory, "change-1")).resolves.toMatchObject([
      expect.objectContaining({
        id: task.id,
        status: "completed",
        outputArtifacts: ["runs/code/change-1/result.md"],
      }),
    ]);
  });

  it("keeps maintenance review threshold and role-scoped maintenance isolation", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());

    for (let index = 1; index <= 5; index += 1) {
      await recordDemandMemoryCloseout(memory, {
        changeId: `closeout-${index}`,
        title: `Demand ${index}`,
        terminalKind: "archived",
        finalResult: `Demand ${index} completed.`,
        userDecision: "archived",
        reusableLessonCandidates: [{ summary: "Keep evidence linked." }],
      });
    }

    await expect(maybeRunMaintenanceReviewWindow(memory)).resolves.toMatchObject({ status: "skipped" });
    await expect(listDemandMemoryCloseouts(memory)).resolves.toHaveLength(5);
    await expect(readMaintenanceReviewWatermark(memory)).resolves.toMatchObject({
      lastReviewedChangeIds: [
        "closeout-1:archived",
        "closeout-2:archived",
        "closeout-3:archived",
        "closeout-4:archived",
        "closeout-5:archived",
      ],
      lastReviewWindowId: expect.stringMatching(/^maintenance-review-/),
    });

    const coderContext = buildRoleScopedContextProjection({
      roleId: "coder-agent",
      currentDemandRefs: ["change/current/summary.md"],
      stableMemoryRefs: ["project/stable/compact.md"],
      selectedHistoryRefs: ["hot/1.md", "hot/2.md", "hot/3.md", "hot/4.md"],
    });
    const maintenanceContext = buildRoleScopedContextProjection({
      roleId: "memory-maintenance-agent",
      currentDemandRefs: ["change/current/summary.md"],
      stableMemoryRefs: ["project/stable/compact.md"],
      selectedHistoryRefs: ["hot/1.md", "hot/2.md", "hot/3.md", "hot/4.md"],
    });

    expect(coderContext.includesMaintenanceWindow).toBe(false);
    expect(coderContext.excludedSources).toContain("hot/warm/cold maintenance window");
    expect(coderContext.includedSources).not.toContain("hot/4.md");
    expect(maintenanceContext.includesMaintenanceWindow).toBe(true);
    expect(maintenanceContext.allowedMemoryTier).toBe("maintenance-hot-warm-cold");
    expect(maintenanceContext.includedSources).toContain("hot/4.md");
  });

  it("keeps doc budget checks proposal-only and candidate pipeline evidence-only", async () => {
    await initHarness(project());
    const memory = await resolveProjectMemory(project());
    const original = "word ".repeat(12000);
    await writeFile(memory.agentGuidePath, original, "utf8");

    const report = await checkDocBudgets(memory);
    const tasks = await listAgentTasks(memory);
    const after = await readFile(memory.agentGuidePath, "utf8");

    expect(report.documents.find((doc) => doc.path === "AGENTS.md")).toMatchObject({ status: "hard-exceeded" });
    expect(tasks).toEqual([
      expect.objectContaining({
        conversationId: "maintenance",
        kind: "background",
        roleId: "documentation-agent",
        createdBy: "maintenance-policy",
        summary: expect.stringContaining("Do not edit canonical docs."),
      }),
    ]);
    expect(after).toBe(original);

    const result = await runMaintenanceCandidatePipeline(memory);
    expect(result.status).toBe("skipped");
    expect(await readFile(memory.agentGuidePath, "utf8")).toBe(original);
  });

  function project(): ManagedProject {
    return {
      id: "agent-task-test",
      name: "AgentTask Test",
      path: tempDir,
      addedAt: "2026-06-09T00:00:00.000Z",
      lastSeenAt: "2026-06-09T00:00:00.000Z",
    };
  }
});

async function listSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  await walk(root);
  return files;
}

function readFileSyncUtf8(path: string): string {
  return statSync(path).isFile() ? readFileSync(path, "utf8") : "";
}
