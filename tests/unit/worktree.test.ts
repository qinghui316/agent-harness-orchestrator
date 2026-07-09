import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeWorktreeIndex } from "../../src/worktree/index.js";
import {
  getGlobalWorktreeCheckoutRoot,
  getWorktreeMetadataPath,
  getWorktreeStatus,
  listWorktreeStatuses,
  markWorktreeApplied,
  removeWorktree,
} from "../../src/worktree/manager.js";
import { prepareWorktreeDependencyBridge } from "../../src/worktree/dependencies.js";
import { repoLocalMemory } from "../../src/memory/resolver.js";
import type { ResolvedMemory, WorktreeMetadata } from "../../src/types/index.js";

let tempDir: string;
let memory: ResolvedMemory;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-worktree-"));
  memory = repoLocalMemory(tempDir, "repo");
  await mkdir(memory.worktreeMetadataRoot, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("worktree metadata scope", () => {
  it("rejects metadata whose file id does not match JSON worktreeId", async () => {
    await writeMetadata("wt-file", validMetadata({ worktreeId: "wt-json" }));

    await expect(getWorktreeStatus(memory, "wt-file")).rejects.toThrow("Worktree metadata id mismatch");
    await expect(markWorktreeApplied(memory, "wt-file", { applyRunId: "apply-1", worktreeDiffHash: "diff" }))
      .rejects.toThrow("Worktree metadata id mismatch");
    await expect(removeWorktree(memory, "wt-file", true)).rejects.toThrow("Worktree metadata id mismatch");
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
    await writeWorktreeIndex(memory);

    expect(statuses.map((item) => item.worktreeId)).toEqual(["wt-valid"]);
    expect(statuses[0]).toMatchObject({ exists: false, dirty: null, headCommit: null });
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
