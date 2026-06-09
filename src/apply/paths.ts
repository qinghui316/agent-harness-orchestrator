import { join, relative } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export function buildApplyPaths(directory: string): Record<"run" | "context" | "events" | "stdout" | "stderr" | "diff" | "diffStat" | "apply", string> {
  return {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    diff: join(directory, "diff.patch"),
    diffStat: join(directory, "diff-stat.txt"),
    apply: join(directory, "apply.json"),
  };
}

export function buildDiscardPaths(directory: string): Record<"run" | "context" | "events" | "stdout" | "stderr" | "discard", string> {
  return {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    discard: join(directory, "discard.json"),
  };
}

export function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}
