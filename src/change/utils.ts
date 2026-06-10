import { relative } from "node:path";
import { resolveMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";

export async function resolveChangeMemory(project: ManagedProject | string | ResolvedMemory): Promise<ResolvedMemory> {
  if (typeof project === "string") return resolveMemory({ path: project });
  if ("harnessRoot" in project) return project;
  return resolveProjectMemory(project);
}

export function displayPath(memory: ResolvedMemory, absolutePath: string): string {
  return relative(memory.memoryRoot, absolutePath).replace(/\\/g, "/");
}
