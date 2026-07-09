import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

export function resolveArtifactRef(memory: ResolvedMemory, ref: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(ref) || ref.startsWith("/")) return ref;
  const memoryPath = join(memory.memoryRoot, ref);
  if (existsSync(memoryPath)) return memoryPath;
  const projectPath = join(memory.projectRoot, ref);
  if (existsSync(projectPath)) return projectPath;
  return resolve(memory.memoryRoot, ref);
}
