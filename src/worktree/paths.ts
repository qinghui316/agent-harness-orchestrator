import { join } from "node:path";
import { getAhoHome } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";

export function getGlobalWorktreeCheckoutRoot(projectId: string): string {
  return join(getAhoHome(), "worktrees", projectId, "checkouts");
}

export function getWorktreeMetadataPath(memory: ResolvedMemory, worktreeId: string): string {
  return join(memory.worktreeMetadataRoot, `${worktreeId}.json`);
}

