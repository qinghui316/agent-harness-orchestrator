import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function prDraftRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "pr-drafts");
}

export function displayPrDraftArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  return `${memory.artifactBase === "memory-root" ? "memory://" : "project://"}${relative(memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot, absolutePath).replace(/\\/g, "/")}`;
}

export function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}
