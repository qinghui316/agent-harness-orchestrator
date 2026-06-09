import { join, relative } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function integrationCheckRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "integration-checks");
}

export function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  return memory.artifactBase === "memory-root" ? relative(memory.memoryRoot, absolutePath).replace(/\\/g, "/") : relative(memory.projectRoot, absolutePath).replace(/\\/g, "/");
}

export function compactTimestamp(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}
