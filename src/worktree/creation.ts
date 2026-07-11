import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "../fs/path.js";
import { getGitBranch, getGitCommit, git, hasGitCommits, isGitDirty } from "../project/git.js";
import { withProjectWriteLease } from "../project/project-write-lease.js";
import { buildWorktreeId } from "./ids.js";
import { getGlobalWorktreeCheckoutRoot, getWorktreeMetadataPath } from "./paths.js";
import { writeWorktreeIndex } from "./index.js";
import { writeWorktreeMetadata } from "./repository.js";
import { getWorktreeStatus } from "./status.js";
import type { ManagedProject, ResolvedMemory, WorktreeMetadata } from "../types/index.js";
import type { WorktreeCreateOptions, WorktreeCreateResult } from "./types.js";

export async function createWorktree(
  project: ManagedProject,
  memory: ResolvedMemory,
  changeId: string,
  options: WorktreeCreateOptions = {},
): Promise<WorktreeCreateResult> {
  return withProjectWriteLease(project.path, {}, async (lease) => {
    await lease.assertCurrent();
    return createWorktreeWithLease(project, memory, changeId, options);
  });
}

async function createWorktreeWithLease(
  project: ManagedProject,
  memory: ResolvedMemory,
  changeId: string,
  options: WorktreeCreateOptions,
): Promise<WorktreeCreateResult> {
  if (!memory.projectId) {
    throw new Error("Cannot create worktree without a resolved project id.");
  }
  if (!(await hasGitCommits(project.path))) {
    throw new Error("Cannot create worktree: project Git repository has no commits. Create an initial commit first.");
  }

  const baseRef = await resolveBaseRef(project.path, options.baseRef);
  const baseCommit = await getGitCommit(project.path, baseRef);
  if (!baseCommit) {
    throw new Error(`Cannot create worktree: base ref does not resolve to a commit: ${baseRef}.`);
  }

  const sourceDirty = (await isGitDirty(project.path)) === true;
  const worktreeId = buildWorktreeId(changeId);
  const branchName = `aho/${slugify(changeId)}/${worktreeId}`;
  const checkoutPath = join(getGlobalWorktreeCheckoutRoot(memory.projectId), worktreeId);

  if (existsSync(checkoutPath)) {
    throw new Error(`Worktree checkout already exists: ${checkoutPath}.`);
  }

  await mkdir(getGlobalWorktreeCheckoutRoot(memory.projectId), { recursive: true });
  await mkdir(memory.worktreeMetadataRoot, { recursive: true });
  await git(project.path, ["worktree", "prune"]);
  await git(project.path, ["worktree", "add", "-b", branchName, checkoutPath, baseRef]);

  const metadata: WorktreeMetadata = {
    version: "1.0",
    worktreeId,
    projectId: memory.projectId,
    changeId,
    runId: options.runId,
    branchName,
    baseRef,
    baseCommit,
    createdFromDirtyProject: sourceDirty,
    createdAt: new Date().toISOString(),
    status: "active",
    checkoutPath,
  };

  const metadataPath = getWorktreeMetadataPath(memory, worktreeId);
  await writeWorktreeMetadata(memory, metadata);
  await writeWorktreeIndex(memory);
  const status = await getWorktreeStatus(memory, worktreeId);
  const warnings = sourceDirty
    ? ["Source project has uncommitted changes; they were not copied into the new worktree."]
    : [];
  return { metadata, status, metadataPath, warnings };
}

async function resolveBaseRef(projectPath: string, explicitBaseRef?: string): Promise<string> {
  if (explicitBaseRef?.trim()) return explicitBaseRef.trim();
  const branch = await getGitBranch(projectPath);
  if (!branch) {
    throw new Error("Cannot create worktree from detached HEAD without --base <ref>.");
  }
  return branch;
}

