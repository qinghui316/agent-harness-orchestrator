import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git, isGitDirtyIgnoringAhoMemory } from "../../src/project/git.js";

describe("project git status helpers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-project-git-"));
    await git(tempDir, ["init"]);
    await writeFile(join(tempDir, "package.json"), "{}\n", "utf8");
    await mkdir(join(tempDir, "harness", "changes"), { recursive: true });
    await writeFile(join(tempDir, "harness", "changes", "INDEX.json"), "{}\n", "utf8");
    await git(tempDir, ["add", "."]);
    await git(tempDir, ["commit", "-m", "baseline"]);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("ignores AHO-owned repo-local memory changes for source dirty checks", async () => {
    await mkdir(join(tempDir, "harness", "changes", "active", "change-1"), { recursive: true });
    await writeFile(join(tempDir, "harness", "changes", "active", "change-1", "summary.md"), "# Summary\n", "utf8");
    await writeFile(join(tempDir, "harness", "changes", "INDEX.json"), "{\"changes\":[]}\n", "utf8");
    await mkdir(join(tempDir, ".agent-harness", "runs", "run-1"), { recursive: true });
    await writeFile(join(tempDir, ".agent-harness", "runs", "run-1", "run.json"), "{}\n", "utf8");

    await expect(isGitDirtyIgnoringAhoMemory(tempDir)).resolves.toBe(false);
  });

  it("still reports product source changes as dirty", async () => {
    await mkdir(join(tempDir, "harness", "changes", "active", "change-1"), { recursive: true });
    await writeFile(join(tempDir, "harness", "changes", "active", "change-1", "summary.md"), "# Summary\n", "utf8");
    await writeFile(join(tempDir, "harness", "changes", "INDEX.json"), "{\"changes\":[]}\n", "utf8");
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src", "feature.ts"), "export const value = 1;\n", "utf8");

    await expect(isGitDirtyIgnoringAhoMemory(tempDir)).resolves.toBe(true);
  });
});
