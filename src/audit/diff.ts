import { createHash, randomUUID } from "node:crypto";
import { mkdir, rmdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { gitTextWithEnv, gitRawWithEnv } from "../project/git.js";
import { getWorktreeStatus } from "../worktree/status.js";
import type { ResolvedMemory, WorktreeStatus } from "../types/index.js";

export interface WorktreeDiffResult {
  worktree: WorktreeStatus;
  diff: string;
  diffHash: string;
  diffStat: string;
  changedPaths: string[];
  expectedTree: string;
}

export async function collectWorktreeDiff(memory: ResolvedMemory, worktreeId: string, expectedChangeId: string): Promise<WorktreeDiffResult> {
  const worktree = await getWorktreeStatus(memory, worktreeId);
  if (worktree.changeId !== expectedChangeId) {
    throw new Error(`Worktree ${worktreeId} belongs to change ${worktree.changeId}, not ${expectedChangeId}.`);
  }
  if (!worktree.exists) {
    throw new Error(`Worktree checkout does not exist: ${worktree.checkoutPath}.`);
  }
  const indexRoot = join(memory.runsRoot, ".git-indexes");
  const indexPath = join(indexRoot, `${randomUUID()}.index`);
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    await mkdir(indexRoot, { recursive: true });
    await gitTextWithEnv(worktree.checkoutPath, ["read-tree", "HEAD"], env);
    await gitTextWithEnv(worktree.checkoutPath, ["add", "--all", "--", "."], env);
    const [diffBytes, diffStat, nameStatus, expectedTree] = await Promise.all([
      gitRawWithEnv(worktree.checkoutPath, ["diff", "--cached", "--no-ext-diff", "--binary", "--full-index", "HEAD"], env),
      gitTextWithEnv(worktree.checkoutPath, ["diff", "--cached", "--stat", "HEAD"], env),
      gitTextWithEnv(worktree.checkoutPath, ["diff", "--cached", "--name-status", "-z", "--find-renames", "HEAD"], env),
      gitTextWithEnv(worktree.checkoutPath, ["write-tree"], env),
    ]);
    return {
      worktree,
      diff: diffBytes.toString("utf8"),
      diffHash: createHash("sha256").update(diffBytes).digest("hex"),
      diffStat,
      changedPaths: parseNameStatusPaths(nameStatus),
      expectedTree: expectedTree.trim(),
    };
  } finally {
    await rm(indexPath, { force: true }).catch(() => undefined);
    await rmdir(indexRoot).catch(() => undefined);
  }
}

export function parseNameStatusPaths(output: string): string[] {
  const records = output.split("\0");
  const paths = new Set<string>();
  for (let index = 0; index < records.length;) {
    const status = records[index++];
    if (!status) continue;
    const firstPath = records[index++];
    if (!firstPath) throw new Error("Invalid Git name-status record while deriving apply manifest.");
    paths.add(normalizeManifestPath(firstPath));
    if (status.startsWith("R") || status.startsWith("C")) {
      const secondPath = records[index++];
      if (!secondPath) throw new Error("Invalid Git rename record while deriving apply manifest.");
      paths.add(normalizeManifestPath(secondPath));
    }
  }
  return [...paths].sort();
}

function normalizeManifestPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized.includes("/../")
    || normalized.startsWith("/")
    || normalized === "node_modules"
    || normalized.startsWith("node_modules/")) {
    throw new Error(`Unsafe apply manifest path: ${path}.`);
  }
  return normalized;
}
