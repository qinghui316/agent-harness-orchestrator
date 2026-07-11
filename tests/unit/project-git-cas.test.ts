import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitTreeAndUpdateHead, getGitCommit, git } from "../../src/project/git.js";

const execFileAsync = promisify(execFile);

describe("project Git CAS commit", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "aho-project-git-cas-"));
    await execFileAsync("git", ["init"], { cwd: root });
    await execFileAsync("git", ["config", "user.name", "AHO Test"], { cwd: root });
    await execFileAsync("git", ["config", "user.email", "aho@example.test"], { cwd: root });
    await writeFile(join(root, "tracked.txt"), "base\n", "utf8");
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: root });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: root });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("updates HEAD only when the expected parent still matches", async () => {
    const parent = await getGitCommit(root);
    if (!parent) throw new Error("Expected base commit.");
    await writeFile(join(root, "tracked.txt"), "authorized\n", "utf8");
    await git(root, ["add", "--", "tracked.txt"]);
    const tree = await git(root, ["write-tree"]);

    const committed = await commitTreeAndUpdateHead(root, { tree, parent, message: "authorized" });
    expect(await getGitCommit(root)).toBe(committed);
    expect(await git(root, ["show", "-s", "--format=%P", committed])).toBe(parent);
  });

  it("does not move HEAD when source HEAD drifted before the CAS update", async () => {
    const authorizedParent = await getGitCommit(root);
    if (!authorizedParent) throw new Error("Expected base commit.");
    const tree = await git(root, ["write-tree"]);
    await writeFile(join(root, "external.txt"), "external\n", "utf8");
    await execFileAsync("git", ["add", "external.txt"], { cwd: root });
    await execFileAsync("git", ["commit", "-m", "external"], { cwd: root });
    const driftedHead = await getGitCommit(root);

    await expect(commitTreeAndUpdateHead(root, {
      tree,
      parent: authorizedParent,
      message: "must not land",
    })).rejects.toThrow();
    expect(await getGitCommit(root)).toBe(driftedHead);
  });
});
