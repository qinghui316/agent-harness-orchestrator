import { relative } from "node:path";
import type { ResolvedMemory } from "../../types/index.js";

export function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

export function proposalJsonFile(kind: "spec" | "plan"): string {
  return kind === "spec" ? "spec-proposal.json" : "plan-proposal.json";
}

export function proposalMarkdownFile(kind: "spec" | "plan"): string {
  return kind === "spec" ? "spec-proposal.md" : "plan-proposal.md";
}
