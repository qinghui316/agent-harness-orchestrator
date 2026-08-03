import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createChange, createConcurrentChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { runIntegrationFixAttempt, type IntegrationFixRepairRunner } from "../../src/integration-check/fix-attempts.js";
import { integrationCheckRoot } from "../../src/integration-check/paths.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import type { ProviderTurnRequest } from "../../src/provider-runtime/index.js";
import { execFileAsync, getTempDir, git, initGitRepository, project } from "./workbench/fixtures.js";

const providerRequire = vi.hoisted(() => vi.fn());
const projectHarnessAgentInput = vi.hoisted(() => ({
  identity: { projectId: "repo", skillName: "repo-harness", skillRevision: 27, contentFingerprint: "a".repeat(64) },
  providerSkillInput: { id: "repo-harness", path: "C:/skills/repo-harness/SKILL.md", contentHash: "b".repeat(64), source: "project-harness" as const, required: true },
}));

vi.mock("../../src/project-harness/agent-input.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/project-harness/agent-input.js")>(),
  resolveProjectHarnessAgentInput: vi.fn(async () => projectHarnessAgentInput),
}));

vi.mock("../../src/provider-runtime/index.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/provider-runtime/index.js")>(),
  defaultProviderRegistry: {
    requireOnly: () => ({ id: "test-provider" }),
    require: providerRequire,
  },
}));

describe("integration fix attempts", () => {
  it("runs provider repair with the project Harness Skill and v2 scoped authority", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      const change = await createChange(project(), { title: "Integration Fix Skill Input" });
      await createConcurrentChange(project(), { title: "Unrelated Concurrent Change" });
      const memory = await resolveProjectMemory(project());
      const directory = join(integrationCheckRoot(memory), "check-provider-skill-input");
      await mkdir(directory, { recursive: true });
      const inputPatchPath = join(directory, "combined.patch");
      await writeFile(inputPatchPath, [
        "diff --git a/integration.txt b/integration.txt",
        "new file mode 100644",
        "index 0000000..0000000",
        "--- /dev/null",
        "+++ b/integration.txt",
        "@@ -0,0 +1 @@",
        "+broken",
        "",
      ].join("\n"), "utf8");
      const runTurn = vi.fn(async (request: ProviderTurnRequest) => {
        await writeFile(join(request.cwd, "integration.txt"), "fixed\n", "utf8");
        return {
          providerId: "test-provider",
          status: "completed" as const,
          session: { providerId: "test-provider", sessionId: "integration-fix-session" },
          turnId: "integration-fix-turn",
          lastMessage: "Repair complete.",
          childThreads: [],
          changedFiles: ["integration.txt"],
        };
      });
      providerRequire.mockResolvedValueOnce({
        id: "test-provider",
        displayName: "Test Provider",
        capabilitySnapshot: vi.fn(async () => ({
          providerId: "test-provider",
          displayName: "Test Provider",
          productMode: "harness" as const,
          status: "ready" as const,
          runnable: true,
          checkedAt: "2026-08-03T00:00:00.000Z",
          snapshotHash: "integration-fix-snapshot",
          snapshotVersion: 1,
          effectiveModel: null,
          effectiveModelSource: "provider-default" as const,
          degradedReasons: [],
          capabilities: [],
        })),
        leafExecution: { runTurn },
      });

      const result = await runIntegrationFixAttempt(
        project(),
        directory,
        "check-provider-skill-input",
        inputPatchPath,
        "aggregate validation failed",
        { changeId: change.change.id },
      );

      expect(result.attempt).toMatchObject({ status: "completed", repairMode: "provider", runId: expect.any(String) });
      expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({
        roleId: "integration-fix-agent",
        skillInputs: [projectHarnessAgentInput.providerSkillInput],
        sandboxPolicy: "workspace-write",
        writableRoots: [expect.stringContaining("integration")],
        additionalContext: {
          "aho.role-context": { kind: "application", value: expect.stringContaining("# Role Context Packet") },
        },
      }));
      const runId = result.attempt.runId!;
      const run = JSON.parse(await readFile(join(memory.runsRoot, runId, "run.json"), "utf8")) as {
        enabledSkills: Array<Record<string, unknown>>;
        contextPacket: { ref: string };
      };
      expect(run.enabledSkills).toEqual([{ ...projectHarnessAgentInput.providerSkillInput, providerId: "test-provider" }]);
      expect(JSON.parse(await readFile(join(memory.memoryRoot, run.contextPacket.ref), "utf8"))).toMatchObject({
        version: "2.0",
        kind: "role-context-packet",
        roleId: "integration-fix-agent",
        projectHarness: projectHarnessAgentInput.identity,
        permissions: {
          sandboxPolicy: "workspace-write",
          writableRoots: [expect.stringContaining("integration")],
        },
      });
    } finally {
      providerRequire.mockReset();
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("records a provider-backed repair attempt without mutating the source root", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      const memory = await resolveProjectMemory(project());
      const directory = join(integrationCheckRoot(memory), "check-provider-repair");
      await mkdir(directory, { recursive: true });
      const inputPatchPath = join(directory, "combined.patch");
      await writeFile(inputPatchPath, [
        "diff --git a/integration.txt b/integration.txt",
        "new file mode 100644",
        "index 0000000..0000000",
        "--- /dev/null",
        "+++ b/integration.txt",
        "@@ -0,0 +1 @@",
        "+broken",
        "",
      ].join("\n"), "utf8");

      const repairRunner: IntegrationFixRepairRunner = async ({ checkoutPath }) => {
        await writeFile(join(checkoutPath, "integration.txt"), "fixed\n", "utf8");
        return {
          repairMode: "provider",
          runId: "fix-run-1",
          runArtifactRefs: ["runs/fix-run-1/run.json", "runs/fix-run-1/provider-events.jsonl", "runs/fix-run-1/diff.patch"],
          summary: "Fake provider runner repaired integration.txt.",
        };
      };

      const beforeStatus = await execFileAsync("git", ["status", "--short"], { cwd: getTempDir() });
      const result = await runIntegrationFixAttempt(project(), directory, "check-provider-repair", inputPatchPath, "aggregate validation failed", {
        changeId: "change-a",
        repairRunner,
      });
      const afterStatus = await execFileAsync("git", ["status", "--short"], { cwd: getTempDir() });

      expect(result.attempt).toMatchObject({
        status: "completed",
        repairMode: "provider",
        runId: "fix-run-1",
        runArtifactRefs: expect.arrayContaining(["runs/fix-run-1/run.json", "runs/fix-run-1/provider-events.jsonl", "runs/fix-run-1/diff.patch"]),
        outputArtifactRef: expect.stringContaining("repaired.patch"),
      });
      expect(result.artifact).toMatchObject({ kind: "repaired", source: "integration-fix-agent" });
      expect(await readFile(join(directory, "repaired.patch"), "utf8")).toContain("+fixed");
      expect(afterStatus.stdout.trim()).toBe(beforeStatus.stdout.trim());
      expect(existsSync(join(getTempDir(), "integration.txt"))).toBe(false);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("records a failed attempt when the repair runner cannot produce a diff", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await git(getTempDir(), ["commit", "--allow-empty", "-m", "initial"]);
      await initHarness(project());
      const memory = await resolveProjectMemory(project());
      const directory = join(integrationCheckRoot(memory), "check-empty-repair");
      await mkdir(directory, { recursive: true });
      const inputPatchPath = join(directory, "combined.patch");
      await writeFile(inputPatchPath, [
        "diff --git a/repair.txt b/repair.txt",
        "new file mode 100644",
        "index 0000000..0000000",
        "--- /dev/null",
        "+++ b/repair.txt",
        "@@ -0,0 +1 @@",
        "+broken",
        "",
      ].join("\n"), "utf8");

      const result = await runIntegrationFixAttempt(project(), directory, "check-empty-repair", inputPatchPath, "aggregate audit failed", {
        changeId: "change-a",
        repairRunner: async () => {
          throw new Error("Provider unavailable in test.");
        },
      });

      expect(result.artifact).toBeUndefined();
      expect(result.attempt).toMatchObject({
        status: "failed",
      });
      expect(result.attempt.summary).toContain("Provider unavailable in test.");
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });
});
