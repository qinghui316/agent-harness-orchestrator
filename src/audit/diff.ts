import { createHash } from "node:crypto";
import { gitRaw, gitText } from "../project/git.js";
import { getWorktreeStatus } from "../worktree/manager.js";
import type { ResolvedMemory, WorktreeStatus } from "../types/index.js";

export interface WorktreeDiffResult {
  worktree: WorktreeStatus;
  diff: string;
  diffHash: string;
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
  const [diffBytes, diffStat] = await Promise.all([
    gitRaw(worktree.checkoutPath, ["diff", "--no-ext-diff", "--binary", "HEAD"]),
    gitText(worktree.checkoutPath, ["diff", "--stat", "HEAD"]),
  ]);
  return {
    worktree,
    diff: diffBytes.toString("utf8"),
    diffHash: createHash("sha256").update(diffBytes).digest("hex"),
    diffStat,
  };
}
