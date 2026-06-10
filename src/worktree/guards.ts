import { isAbsolute, relative, resolve } from "node:path";
import { getGlobalWorktreeCheckoutRoot } from "./paths.js";
import type { ResolvedMemory, WorktreeMetadata } from "../types/index.js";

export class WorktreeMetadataScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreeMetadataScopeError";
  }
}

export function assertWorktreeMetadataScope(
  memory: ResolvedMemory,
  requestedWorktreeId: string,
  metadata: WorktreeMetadata,
): void {
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
  const relativeCheckout = relative(checkoutRoot, checkoutPath);
  if (relativeCheckout === "" || relativeCheckout.startsWith("..") || isAbsolute(relativeCheckout)) {
    throw new WorktreeMetadataScopeError(
      `Worktree checkout path is outside expected root: ${metadata.checkoutPath}.`,
    );
  }
}

