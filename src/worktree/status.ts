import { existsSync } from "node:fs";
import { getGitBranch, getGitCommit, getGitStatusShort } from "../project/git.js";
import { listWorktreeMetadata, readWorktreeMetadata } from "./repository.js";
import type { WorktreeMetadataPort } from "./paths.js";
import type { WorktreeMetadata, WorktreeStatus } from "../types/index.js";

export async function listWorktreeStatuses(memory: WorktreeMetadataPort): Promise<WorktreeStatus[]> {
  const metadata = await listWorktreeMetadata(memory);
  const statuses = await Promise.all(metadata.map((item) => statusFromMetadata(item)));
  return statuses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getWorktreeStatus(memory: WorktreeMetadataPort, worktreeId: string): Promise<WorktreeStatus> {
  return statusFromMetadata(await readWorktreeMetadata(memory, worktreeId));
}

export async function listWorktreesForChange(memory: WorktreeMetadataPort, changeId: string): Promise<WorktreeStatus[]> {
  const metadata = (await listWorktreeMetadata(memory)).filter((item) => item.changeId === changeId);
  const statuses = await Promise.all(metadata.map((item) => statusFromMetadata(item)));
  return statuses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function statusFromMetadata(metadata: WorktreeMetadata): Promise<WorktreeStatus> {
  const exists = existsSync(metadata.checkoutPath);
  if (!exists) {
    return { ...metadata, exists: false, branch: null, headCommit: null, dirty: null, diffSummary: [] };
  }
  const [branch, headCommit, diffSummary] = await Promise.all([
    getGitBranch(metadata.checkoutPath),
    getGitCommit(metadata.checkoutPath),
    getGitStatusShort(metadata.checkoutPath).catch(() => []),
  ]);
  return {
    ...metadata,
    exists: true,
    branch,
    headCommit,
    dirty: diffSummary.length > 0,
    diffSummary,
  };
}
