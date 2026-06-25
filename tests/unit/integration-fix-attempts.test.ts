import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { runIntegrationFixAttempt, type IntegrationFixRepairRunner } from "../../src/integration-check/fix-attempts.js";
import { integrationCheckRoot } from "../../src/integration-check/paths.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { execFileAsync, getTempDir, git, initGitRepository, project } from "./workbench/fixtures.js";

describe("integration fix attempts", () => {
  it("records a Codex-backed repair attempt without mutating the source root", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      const memory = await resolveProjectMemory(project());
      const directory = join(integrationCheckRoot(memory), "check-codex-repair");
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
          repairMode: "codex",
          runId: "fix-run-1",
          runArtifactRefs: ["runs/fix-run-1/run.json", "runs/fix-run-1/codex-events.jsonl", "runs/fix-run-1/diff.patch"],
          summary: "Fake Codex runner repaired integration.txt.",
        };
      };

      const beforeStatus = await execFileAsync("git", ["status", "--short"], { cwd: getTempDir() });
      const result = await runIntegrationFixAttempt(project(), directory, "check-codex-repair", inputPatchPath, "aggregate validation failed", {
        changeId: "change-a",
        repairRunner,
      });
      const afterStatus = await execFileAsync("git", ["status", "--short"], { cwd: getTempDir() });

      expect(result.attempt).toMatchObject({
        status: "completed",
        repairMode: "codex",
        runId: "fix-run-1",
        runArtifactRefs: expect.arrayContaining(["runs/fix-run-1/run.json", "runs/fix-run-1/codex-events.jsonl", "runs/fix-run-1/diff.patch"]),
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
          throw new Error("Codex unavailable in test.");
        },
      });

      expect(result.artifact).toBeUndefined();
      expect(result.attempt).toMatchObject({
        status: "failed",
      });
      expect(result.attempt.summary).toContain("Codex unavailable in test.");
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });
});
