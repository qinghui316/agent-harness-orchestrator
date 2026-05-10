import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChangeIndex, ChangeIndexItem } from "../types/index.js";
import { writeJsonFile } from "../fs/json.js";

async function listChangeItems(projectPath: string, state: "active" | "parking" | "archive"): Promise<ChangeIndexItem[]> {
  const dir = join(projectPath, "harness", "changes", state);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: `harness/changes/${state}/${entry.name}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getActiveChanges(projectPath: string): Promise<ChangeIndexItem[]> {
  return listChangeItems(projectPath, "active");
}

export function hasPendingEvolution(projectPath: string): boolean {
  return existsSync(join(projectPath, "harness", "evolution", "pending.md"));
}

export async function buildChangeIndex(projectPath: string): Promise<ChangeIndex> {
  return {
    generated_at: new Date().toISOString(),
    active: await listChangeItems(projectPath, "active"),
    parking: await listChangeItems(projectPath, "parking"),
    archive: await listChangeItems(projectPath, "archive"),
  };
}

export async function writeChangeIndex(projectPath: string): Promise<ChangeIndex> {
  const index = await buildChangeIndex(projectPath);
  await writeJsonFile(join(projectPath, "harness", "changes", "INDEX.json"), index);
  return index;
}
