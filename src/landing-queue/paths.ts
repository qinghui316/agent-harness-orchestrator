import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function landingQueueRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "landing-queue");
}

export function displayLandingQueueArtifactPath(memory: ResolvedMemory, file: string): string {
  return `project://${relative(memory.memoryRoot, file).replace(/\\/g, "/")}`;
}

export function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
