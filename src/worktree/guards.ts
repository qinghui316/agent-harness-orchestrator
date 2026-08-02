import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { getAhoHome, normalizeForCompare } from "../fs/path.js";
import { gitText } from "../project/git.js";
import { resolveWithinPhysicalRoot } from "../project-harness/path-safety.js";
import { getGlobalWorktreeCheckoutRoot } from "./paths.js";
import type { ResolvedMemory, WorktreeMetadata } from "../types/index.js";

export class WorktreeMetadataScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreeMetadataScopeError";
  }
}

export async function assertWorktreeMetadataScope(
  memory: ResolvedMemory,
  requestedWorktreeId: string,
  metadata: WorktreeMetadata,
): Promise<void> {
  if (metadata.worktreeId !== requestedWorktreeId) {
    throw new WorktreeMetadataScopeError(
      `Worktree metadata id mismatch: file ${requestedWorktreeId} contains ${metadata.worktreeId}.`,
    );
  }
  if (!memory.projectId) {
    throw new WorktreeMetadataScopeError("Cannot validate Worktree metadata without a resolved project id.");
  }
  if (metadata.projectId !== memory.projectId) {
    throw new WorktreeMetadataScopeError(
      `Worktree metadata project mismatch: expected ${memory.projectId}, found ${metadata.projectId}.`,
    );
  }
  const checkoutRoot = resolve(getGlobalWorktreeCheckoutRoot(memory.projectId));
  const checkoutPath = resolve(metadata.checkoutPath);
  const globalWorktreeRoot = resolve(getAhoHome(), "worktrees");
  if (!isStrictDescendant(globalWorktreeRoot, checkoutPath)) {
    throw new WorktreeMetadataScopeError(
      `Worktree checkout path is outside expected root: ${metadata.checkoutPath}.`,
    );
  }
  if (existsSync(globalWorktreeRoot)) {
    await resolveWithinPhysicalRoot(
      globalWorktreeRoot,
      relative(globalWorktreeRoot, checkoutPath),
      "worktree checkout",
    ).catch((error: unknown) => {
      throw new WorktreeMetadataScopeError((error as Error).message);
    });
  }
  if (isStrictDescendant(checkoutRoot, checkoutPath)) return;

  let worktreeList: string;
  try {
    worktreeList = await gitText(memory.projectRoot, ["worktree", "list", "--porcelain", "-z"]);
  } catch (error) {
    throw new WorktreeMetadataScopeError(
      `Cannot verify registered Git worktree ownership for ${metadata.checkoutPath}: ${(error as Error).message}`,
    );
  }
  const registered = worktreeList
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => normalizeForCompare(field.slice("worktree ".length)));
  if (!registered.includes(normalizeForCompare(checkoutPath))) {
    throw new WorktreeMetadataScopeError(
      `Worktree checkout path is not registered to this project: ${metadata.checkoutPath}.`,
    );
  }
}

function isStrictDescendant(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath !== ""
    && !isAbsolute(relativePath)
    && relativePath !== ".."
    && !relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
}

