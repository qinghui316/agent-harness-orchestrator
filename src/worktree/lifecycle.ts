import { rm } from "node:fs/promises";
import { git } from "../project/git.js";
import { withProjectWriteLease } from "../project/project-write-lease.js";
import { getWorktreeMetadataPath } from "./paths.js";
import { readWorktreeMetadata, writeWorktreeMetadata } from "./repository.js";
import { getWorktreeStatus } from "./status.js";
import { writeWorktreeIndex } from "./index.js";
import type { WorktreeMetadata } from "../types/index.js";
import type { WorktreeAppliedUpdate, WorktreeRemoveResult } from "./types.js";
import type { WorktreeIndexPort } from "./paths.js";

export async function removeWorktree(memory: WorktreeIndexPort, worktreeId: string, force = false): Promise<WorktreeRemoveResult> {
  return withProjectWriteLease(memory.projectRoot, {}, async (lease) => {
    await lease.assertCurrent();
    return removeWorktreeUnderLease(memory, worktreeId, force);
  });
}

export async function removeWorktreeUnderLease(memory: WorktreeIndexPort, worktreeId: string, force: boolean): Promise<WorktreeRemoveResult> {
  const metadata = await readWorktreeMetadata(memory, worktreeId);
  const status = await getWorktreeStatus(memory, worktreeId);
  if (status.dirty && metadata.status !== "applied" && !force) {
    throw new Error(`Cannot remove dirty worktree ${worktreeId}. Use --force to discard the checkout.`);
  }

  let checkoutRemoved = false;
  if (status.exists) {
    const args = ["worktree", "remove"];
    if (force) args.push("--force");
    args.push(metadata.checkoutPath);
    await git(memory.projectRoot, args);
    checkoutRemoved = true;
  }

  await rm(getWorktreeMetadataPath(memory, worktreeId), { force: true });
  await git(memory.projectRoot, ["worktree", "prune"]).catch(() => "");
  await writeWorktreeIndex(memory);
  return { removed: metadata, checkoutRemoved };
}

export async function markWorktreeApplied(
  memory: WorktreeIndexPort,
  worktreeId: string,
  update: WorktreeAppliedUpdate,
): Promise<WorktreeMetadata> {
  const metadata = await readWorktreeMetadata(memory, worktreeId);
  const applied: WorktreeMetadata = {
    ...metadata,
    status: "applied",
    appliedAt: new Date().toISOString(),
    applyRunId: update.applyRunId,
    appliedCommit: update.appliedCommit,
    worktreeDiffHash: update.worktreeDiffHash,
  };
  await writeWorktreeMetadata(memory, applied);
  await writeWorktreeIndex(memory);
  return applied;
}

