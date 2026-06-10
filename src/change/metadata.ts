import { existsSync } from "node:fs";
import { join } from "node:path";
import { readRequiredJsonFile } from "../fs/json.js";
import type { ChangeIndexItem, ChangeMetadata, ResolvedMemory } from "../types/index.js";
import { changeMetadataSchema } from "./schemas.js";
import { displayPath, finalPathSegment } from "./paths.js";
import type { ChangeDirectoryState } from "./types.js";

export interface ScopedChangeMetadata {
  metadata: ChangeMetadata | null;
  blockingIssues: string[];
}

export async function readChangeMetadataFile(changePath: string): Promise<ChangeMetadata | null> {
  const path = join(changePath, "change.json");
  if (!existsSync(path)) return null;
  try {
    return await readRequiredJsonFile(path, changeMetadataSchema);
  } catch {
    return null;
  }
}

export async function readScopedChangeMetadata(
  memory: ResolvedMemory,
  item: ChangeIndexItem,
  state: ChangeDirectoryState,
): Promise<ScopedChangeMetadata> {
  const changePath = join(memory.memoryRoot, item.path);
  const metadata = await readChangeMetadataFile(changePath);
  const issues = validateChangeMetadataScope(memory, item, state, metadata);
  return { metadata: issues.length === 0 ? metadata : null, blockingIssues: issues };
}

export async function readScopedChangeMetadataAt(
  memory: ResolvedMemory,
  relativePath: string,
  state: ChangeDirectoryState,
): Promise<ScopedChangeMetadata> {
  const item = { name: finalPathSegment(relativePath), path: relativePath };
  return readScopedChangeMetadata(memory, item, state);
}

export function validateChangeMetadataScope(
  memory: ResolvedMemory,
  item: ChangeIndexItem,
  state: ChangeDirectoryState,
  metadata: ChangeMetadata | null,
): string[] {
  if (!metadata) return ["Missing or invalid change.json."];
  const issues: string[] = [];
  const actualRelativePath = normalizePath(item.path);
  const directoryName = finalPathSegment(item.path);

  if (state === "active" || state === "parking") {
    if (metadata.id !== item.name || metadata.id !== directoryName) {
      issues.push(`Change metadata id mismatch: directory ${item.name} contains ${metadata.id}.`);
    }
    if (metadata.state !== "active") {
      issues.push(`Change metadata state mismatch: ${item.name} is in ${state} but change.json state is ${metadata.state}.`);
    }
    if (metadata.archivePath !== null) {
      issues.push(`Change metadata archivePath must be null for ${state} Change ${item.name}.`);
    }
  } else {
    if (metadata.state !== "archived") {
      issues.push(`Change metadata state mismatch: archived item ${item.name} has state ${metadata.state}.`);
    }
    if (metadata.archivePath && normalizePath(metadata.archivePath) !== actualRelativePath) {
      issues.push(`Change metadata archivePath mismatch: ${metadata.archivePath} does not match ${actualRelativePath}.`);
    }
  }

  const absolutePath = join(memory.memoryRoot, item.path);
  if (displayPath(memory, absolutePath) !== actualRelativePath) {
    issues.push(`Change metadata path mismatch for ${item.name}.`);
  }
  return issues;
}

export function canonicalThreadChangeIdForPath(memory: ResolvedMemory, relativePath: string, metadata: ChangeMetadata | null): string {
  const state = relativePath.includes("/archive/") || relativePath.includes("\\archive\\") ? "archive" : "active";
  const item = { name: finalPathSegment(relativePath), path: relativePath };
  const issues = validateChangeMetadataScope(memory, item, state, metadata);
  if (issues.length === 0 && metadata) return metadata.id;
  return item.name;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
