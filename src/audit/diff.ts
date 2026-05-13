import { git } from "../project/git.js";
import { getWorktreeStatus } from "../worktree/manager.js";
import type { ResolvedMemory, WorktreeStatus } from "../types/index.js";

export interface WorktreeDiffResult {
  worktree: WorktreeStatus;
  diff: string;
  diffStat: string;
}

export async function collectWorktreeDiff(memory: ResolvedMemory, worktreeId: string, expectedChangeId: string): Promise<WorktreeDiffResult> {
  const worktree = await getWorktreeStatus(memory, worktreeId);
  if (worktree.changeId !== expectedChangeId) {
    throw new Error(`Worktree ${worktreeId} belongs to change ${worktree.changeId}, not ${expectedChangeId}.`);
  }
  if (!worktree.exists) {
    throw new Error(`Worktree checkout does not exist: ${worktree.checkoutPath}.`);
  }
  const [diff, diffStat] = await Promise.all([
    git(worktree.checkoutPath, ["diff", "--no-ext-diff", "--binary"]),
    git(worktree.checkoutPath, ["diff", "--stat"]),
  ]);
  return { worktree, diff, diffStat };
}
