import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ZodType } from "zod";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";

export interface MaintenanceArtifactStore<T extends { createdAt: string }> {
  root(memory: ResolvedMemory): string;
  jsonPath(memory: ResolvedMemory, id: string): string;
  markdownPath(memory: ResolvedMemory, id: string): string;
  schema: ZodType<T>;
}

export async function readMaintenanceArtifact<T extends { createdAt: string }>(
  memory: ResolvedMemory,
  store: MaintenanceArtifactStore<T>,
  id: string,
): Promise<T | null> {
  const path = store.jsonPath(memory, id);
  if (!existsSync(path)) return null;
  return readJsonFile(path, store.schema, null as unknown as T).catch(() => null);
}

export async function listMaintenanceArtifacts<T extends { createdAt: string }>(
  memory: ResolvedMemory,
  store: MaintenanceArtifactStore<T>,
): Promise<T[]> {
  const root = store.root(memory);
  if (!existsSync(root)) return [];

  const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const artifacts: T[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const artifact = await readJsonFile(join(root, entry.name), store.schema, null as unknown as T).catch(() => null);
    if (artifact) artifacts.push(artifact);
  }
  return artifacts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function writeMaintenanceJsonMarkdownArtifact<T extends { createdAt: string }>(
  memory: ResolvedMemory,
  store: MaintenanceArtifactStore<T>,
  id: string,
  value: T,
  markdown: string,
): Promise<void> {
  await writeJsonFile(store.jsonPath(memory, id), value);
  await writeFile(store.markdownPath(memory, id), markdown, "utf8");
}
