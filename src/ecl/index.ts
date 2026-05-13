import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveMemory } from "../memory/resolver.js";
import type { ChangeIndex, ChangeIndexItem, ResolvedMemory } from "../types/index.js";
import { writeJsonFile } from "../fs/json.js";

type EclMemoryInput = string | ResolvedMemory;

function toMemory(input: EclMemoryInput): ResolvedMemory {
  return typeof input === "string" ? resolveMemory({ path: input }) : input;
}

function displayPath(memory: ResolvedMemory, absolutePath: string): string {
  return relative(memory.memoryRoot, absolutePath).replace(/\\/g, "/");
}

async function listChangeItems(input: EclMemoryInput, state: "active" | "parking" | "archive"): Promise<ChangeIndexItem[]> {
  const memory = toMemory(input);
  const dir = join(memory.changesRoot, state);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: displayPath(memory, join(dir, entry.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getActiveChanges(input: EclMemoryInput): Promise<ChangeIndexItem[]> {
  return listChangeItems(input, "active");
}

export function hasPendingEvolution(input: EclMemoryInput): boolean {
  const memory = toMemory(input);
  return existsSync(join(memory.evolutionRoot, "pending.md"));
}

export async function buildChangeIndex(input: EclMemoryInput): Promise<ChangeIndex> {
  const memory = toMemory(input);
  return {
    generated_at: new Date().toISOString(),
    active: await listChangeItems(memory, "active"),
    parking: await listChangeItems(memory, "parking"),
    archive: await listChangeItems(memory, "archive"),
  };
}

export async function writeChangeIndex(input: EclMemoryInput): Promise<ChangeIndex> {
  const memory = toMemory(input);
  const index = await buildChangeIndex(memory);
  await writeJsonFile(join(memory.changesRoot, "INDEX.json"), index);
  return index;
}
