import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { worktreeMetadataSchema } from "./schemas.js";
import { assertWorktreeMetadataScope, WorktreeMetadataScopeError } from "./guards.js";
import { getWorktreeMetadataPath } from "./paths.js";
import type { ResolvedMemory, WorktreeMetadata } from "../types/index.js";

export async function readWorktreeMetadata(memory: ResolvedMemory, worktreeId: string): Promise<WorktreeMetadata> {
  const metadata = await readRequiredJsonFile(getWorktreeMetadataPath(memory, worktreeId), worktreeMetadataSchema);
  assertWorktreeMetadataScope(memory, worktreeId, metadata);
  return metadata;
}

export async function tryReadWorktreeMetadata(memory: ResolvedMemory, worktreeId: string): Promise<WorktreeMetadata | null> {
  try {
    return await readWorktreeMetadata(memory, worktreeId);
  } catch (error) {
    if (error instanceof WorktreeMetadataScopeError) return null;
    return null;
  }
}

export async function listWorktreeMetadata(memory: ResolvedMemory): Promise<WorktreeMetadata[]> {
  if (!existsSync(memory.worktreeMetadataRoot)) return [];
  const entries = await readdir(memory.worktreeMetadataRoot, { withFileTypes: true });
  const metadata: WorktreeMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const item = await tryReadWorktreeMetadata(memory, entry.name.replace(/\.json$/, ""));
    if (item) metadata.push(item);
  }
  return metadata;
}

export async function writeWorktreeMetadata(memory: ResolvedMemory, metadata: WorktreeMetadata): Promise<void> {
  assertWorktreeMetadataScope(memory, metadata.worktreeId, metadata);
  await writeJsonFile(getWorktreeMetadataPath(memory, metadata.worktreeId), metadata);
}

