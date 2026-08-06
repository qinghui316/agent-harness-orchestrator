import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git } from "../../src/project/git.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { writeWorktreeIndex } from "../../src/worktree/index.js";
import {
  getGlobalWorktreeCheckoutRoot,
  getWorktreeMetadataPath,
  getWorktreeStatus,
  listWorktreeStatuses,
  markWorktreeApplied,
  removeWorktreeWithRuntimePort,
} from "../../src/worktree/manager.js";
import { prepareWorktreeDependencyBridge } from "../../src/worktree/dependencies.js";
import type { WorktreeCreationPort } from "../../src/worktree/paths.js";
import type { WorktreeMetadata } from "../../src/types/index.js";

let tempDir: string;
let memory: WorktreeCreationPort;
let previousAhoHome: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-worktree-"));
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(tempDir, "aho-home");
  const projectRoot = join(tempDir, "project");
  await mkdir(projectRoot, { recursive: true });
  const paths = resolveProjectRuntimePaths("repo", process.env.AHO_HOME);
  memory = {
    projectId: "repo",
    projectRoot,
    worktreeMetadataRoot: paths.worktreeMetadataRoot,
    worktreeIndexPath: paths.worktreeIndexPath,
    projectWriteLeasePath: join(paths.sidecarRoot, "project-write-lease.sqlite"),
  };
  await mkdir(memory.worktreeMetadataRoot, { recursive: true });
});

afterEach(async () => {
  if (previousAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = previousAhoHome;
  await rm(tempDir, { recursive: true, force: true });
});

describe("worktree metadata scope", () => {
  it("rejects metadata whose file id does not match JSON worktreeId", async () => {
    await writeMetadata("wt-file", validMetadata({ worktreeId: "wt-json" }));

    await expect(getWorktreeStatus(memory, "wt-file")).rejects.toThrow("Worktree metadata id mismatch");
    await expect(markWorktreeApplied(memory, "wt-file", { applyRunId: "apply-1", worktreeDiffHash: "diff" }))
      .rejects.toThrow("Worktree metadata id mismatch");
    await expect(removeWorktreeWithRuntimePort(memory, "wt-file", true)).rejects.toThrow("Worktree metadata id mismatch");
    await expect(listWorktreeStatuses(memory)).resolves.toEqual([]);
  });

  it("rejects cross-project worktree metadata", async () => {
    await writeMetadata("wt-cross-project", validMetadata({ worktreeId: "wt-cross-project", projectId: "other-repo" }));

    await expect(getWorktreeStatus(memory, "wt-cross-project")).rejects.toThrow("Worktree metadata project mismatch");
    await expect(listWorktreeStatuses(memory)).resolves.toEqual([]);
  });

  it("rejects checkout paths outside the expected AHO checkout root", async () => {
    await writeMetadata("wt-outside", validMetadata({ worktreeId: "wt-outside", checkoutPath: join(tempDir, "outside") }));

    await expect(getWorktreeStatus(memory, "wt-outside")).rejects.toThrow("outside expected root");
    await expect(listWorktreeStatuses(memory)).resolves.toEqual([]);
  });

  it("lists valid metadata and writes only guarded metadata to the index", async () => {
    await writeMetadata("wt-valid", validMetadata({ worktreeId: "wt-valid" }));
    await writeMetadata("wt-invalid", validMetadata({ worktreeId: "wt-invalid", projectId: "other-repo" }));

    const statuses = await listWorktreeStatuses(memory);
    await writeWorktreeIndex({
      projectId: memory.projectId,
      projectRoot: memory.projectRoot,
      worktreeMetadataRoot: memory.worktreeMetadataRoot,
      worktreeIndexPath: memory.worktreeIndexPath,
    });

    expect(statuses.map((item) => item.worktreeId)).toEqual(["wt-valid"]);
    expect(statuses[0]).toMatchObject({ exists: false, dirty: null, headCommit: null });
  });

  it("preserves a pre-migration checkout when Git still registers it to the canonical project", async () => {
    await git(memory.projectRoot, ["init"]);
    await git(memory.projectRoot, ["config", "user.email", "aho-tests@example.invalid"]);
    await git(memory.projectRoot, ["config", "user.name", "AHO Tests"]);
    await writeFile(join(memory.projectRoot, "README.md"), "project\n", "utf8");
    await git(memory.projectRoot, ["add", "README.md"]);
    await git(memory.projectRoot, ["commit", "-m", "initial"]);
    const checkoutPath = join(process.env.AHO_HOME!, "worktrees", "legacy-project-id", "checkouts", "wt-migrated");
    await mkdir(join(checkoutPath, ".."), { recursive: true });
    await git(memory.projectRoot, ["worktree", "add", "-b", "aho/migrated", checkoutPath, "HEAD"]);
    await writeMetadata("wt-migrated", validMetadata({ worktreeId: "wt-migrated", checkoutPath }));

    await expect(getWorktreeStatus(memory, "wt-migrated")).resolves.toMatchObject({
      worktreeId: "wt-migrated",
      projectId: "repo",
      exists: true,
    });
  });

  it("rejects a checkout path that traverses a link or Junction under the AHO worktree root", async () => {
    const outside = join(tempDir, "outside-worktrees");
    const linkedRoot = join(process.env.AHO_HOME!, "worktrees", "legacy-project-id");
    await mkdir(outside, { recursive: true });
    await mkdir(join(linkedRoot, ".."), { recursive: true });
    await symlink(outside, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    const checkoutPath = join(linkedRoot, "checkouts", "wt-linked");
    await writeMetadata("wt-linked", validMetadata({ worktreeId: "wt-linked", checkoutPath }));

    await expect(getWorktreeStatus(memory, "wt-linked")).rejects.toThrow(/link or Junction/);
  });
});

describe("worktree dependency bridge", () => {
  it("does not treat a BOM package.json with no dependencies as a missing dependency setup blocker", async () => {
    const sourceRoot = join(tempDir, "source");
    const checkoutPath = join(tempDir, "checkout");
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(checkoutPath, { recursive: true });
    await writeFile(join(sourceRoot, "package.json"), `\uFEFF${JSON.stringify({
      scripts: { build: "node -e \"process.exit(0)\"" },
    }, null, 2)}`, "utf8");

    await expect(prepareWorktreeDependencyBridge({ sourceRoot, checkoutPath })).resolves.toMatchObject({
      status: "skipped",
      reason: "source package declares no dependencies",
    });
  });
});

async function writeMetadata(worktreeId: string, metadata: WorktreeMetadata): Promise<void> {
  await writeFile(getWorktreeMetadataPath(memory, worktreeId), JSON.stringify(metadata, null, 2), "utf8");
}

function validMetadata(overrides: Partial<WorktreeMetadata> = {}): WorktreeMetadata {
  const worktreeId = overrides.worktreeId ?? "wt-valid";
  return {
    version: "1.0",
    worktreeId,
    projectId: "repo",
    changeId: "change-a",
    branchName: `aho/change-a/${worktreeId}`,
    baseRef: "main",
    baseCommit: "abc123",
    createdFromDirtyProject: false,
    createdAt: "2026-06-10T00:00:00.000Z",
    status: "active",
    checkoutPath: join(getGlobalWorktreeCheckoutRoot("repo"), worktreeId),
    ...overrides,
  };
}
