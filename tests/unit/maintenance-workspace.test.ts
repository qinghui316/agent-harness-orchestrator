import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMaintenanceDiffManifest } from "../../src/agent-task/maintenance-diff.js";
import { createMaintenanceWorkspace, removeMaintenanceWorkspace } from "../../src/agent-task/maintenance-workspace.js";
import { gitText } from "../../src/project/git.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("maintenance workspace", () => {
  it("materializes an external-local Markdown snapshot and builds a deterministic manifest", async () => {
    const root = await temporaryRoot();
    const memoryRoot = join(root, "memory");
    const maintenanceRoot = join(root, "maintenance");
    const workspaceRoot = join(maintenanceRoot, "workspaces", "assignment-1");
    await mkdir(join(memoryRoot, "docs", "nested"), { recursive: true });
    await writeFile(join(memoryRoot, "docs", "keep.md"), "before\n", "utf8");
    await writeFile(join(memoryRoot, "docs", "rename.md"), "same\n", "utf8");
    await writeFile(join(memoryRoot, "docs", "ignored.json"), "{}", "utf8");
    const workspace = await createMaintenanceWorkspace({
      assignmentId: "assignment-1", memoryMode: "external-local", memoryRoot, maintenanceRoot, namespaces: ["docs"],
    });

    await writeFile(join(workspaceRoot, "docs", "keep.md"), "after\n", "utf8");
    await rename(join(workspaceRoot, "docs", "rename.md"), join(workspaceRoot, "docs", "renamed.md"));
    await writeFile(join(workspaceRoot, "docs", "added.md"), "new\n", "utf8");
    const first = await createMaintenanceDiffManifest(workspace);
    const second = await createMaintenanceDiffManifest(workspace);

    expect(second).toEqual(first);
    expect(first.modified.map((file) => file.path)).toEqual(["docs/keep.md"]);
    expect(first.added.map((file) => file.path)).toEqual(["docs/added.md"]);
    expect(first.renamed).toEqual([{ from: "docs/rename.md", to: "docs/renamed.md", hash: expect.stringMatching(/^[a-f0-9]{64}$/) }]);
    expect(first.unifiedDiff).toContain("--- a/docs/keep.md");
    expect(await readFile(join(memoryRoot, "docs", "keep.md"), "utf8")).toBe("before\n");
    const resumed = await createMaintenanceWorkspace({
      assignmentId: "assignment-1", memoryMode: "external-local", memoryRoot, maintenanceRoot, namespaces: ["docs"],
    });
    expect(resumed).toEqual(workspace);
    expect(await readFile(join(workspaceRoot, "docs", "keep.md"), "utf8")).toBe("after\n");
    await removeMaintenanceWorkspace(maintenanceRoot, workspace);
  });

  it("uses a detached sparse Git worktree for repo-local memory", async () => {
    const root = await temporaryRoot();
    const repo = join(root, "repo");
    await mkdir(join(repo, "docs"), { recursive: true });
    await writeFile(join(repo, "docs", "guide.md"), "base\n", "utf8");
    await writeFile(join(repo, "package.json"), "{}", "utf8");
    await gitText(repo, ["init"]);
    await gitText(repo, ["add", "."]);
    await gitText(repo, ["-c", "user.name=AHO", "-c", "user.email=aho@example.local", "commit", "-m", "base"]);
    await writeFile(join(repo, "docs", "guide.md"), "just-closed uncommitted evidence\n", "utf8");
    const workspace = await createMaintenanceWorkspace({
      assignmentId: "assignment-git", memoryMode: "repo-local", memoryRoot: repo,
      maintenanceRoot: join(root, "maintenance"), namespaces: ["docs"],
    });
    expect(workspace.mode).toBe("git-worktree");
    expect(await readFile(join(workspace.workspaceRoot, "docs", "guide.md"), "utf8")).toBe("just-closed uncommitted evidence\n");
    await writeFile(join(workspace.workspaceRoot, "docs", "guide.md"), "changed\n", "utf8");
    expect((await createMaintenanceDiffManifest(workspace)).modified).toHaveLength(1);
    expect(await readFile(join(repo, "docs", "guide.md"), "utf8")).toBe("just-closed uncommitted evidence\n");
    await removeMaintenanceWorkspace(join(root, "maintenance"), workspace);
  });

  it("rejects unsafe namespaces and workspace entries", async () => {
    const root = await temporaryRoot();
    const memoryRoot = join(root, "memory");
    await mkdir(join(memoryRoot, "docs"), { recursive: true });
    await writeFile(join(memoryRoot, "docs", "guide.md"), "base\n", "utf8");
    await expect(createMaintenanceWorkspace({
      assignmentId: "bad", memoryMode: "external-local", memoryRoot,
      maintenanceRoot: join(root, "maintenance"), namespaces: ["../docs"],
    })).rejects.toThrow(/Invalid maintenance namespace/);
    const workspace = await createMaintenanceWorkspace({
      assignmentId: "safe", memoryMode: "external-local", memoryRoot,
      maintenanceRoot: join(root, "maintenance"), namespaces: ["docs"],
    });
    await writeFile(join(workspace.workspaceRoot, "docs", "bad.txt"), "no", "utf8");
    await expect(createMaintenanceDiffManifest(workspace)).rejects.toThrow(/Markdown files only/);
    await rm(join(workspace.workspaceRoot, "docs", "bad.txt"));
    await writeFile(join(workspace.workspaceRoot, "outside.md"), "no", "utf8");
    await expect(createMaintenanceDiffManifest(workspace)).rejects.toThrow(/outside allowed namespaces/);
    await rm(join(workspace.workspaceRoot, "outside.md"));
    const linked = await symlink(join(memoryRoot, "docs", "guide.md"), join(workspace.workspaceRoot, "docs", "linked.md")).then(() => true).catch(() => false);
    if (linked) await expect(createMaintenanceDiffManifest(workspace)).rejects.toThrow(/symbolic links/);
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aho-maintenance-workspace-"));
  roots.push(root);
  return root;
}
