import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git, isGitDirty } from "../../src/project/git.js";

describe("project git status helpers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-project-git-"));
    await git(tempDir, ["init"]);
    await writeFile(join(tempDir, "package.json"), "{}\n", "utf8");
    await git(tempDir, ["add", "."]);
    await git(tempDir, ["commit", "-m", "baseline"]);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("treats a legacy repo-local Harness directory as product source", async () => {
    await mkdir(join(tempDir, ".agent-harness", "runs", "run-1"), { recursive: true });
    await writeFile(join(tempDir, ".agent-harness", "runs", "run-1", "run.json"), "{}\n", "utf8");

    await expect(isGitDirty(tempDir)).resolves.toBe(true);
  });

  it("still reports product source changes as dirty", async () => {
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src", "feature.ts"), "export const value = 1;\n", "utf8");

    await expect(isGitDirty(tempDir)).resolves.toBe(true);
  });
});
