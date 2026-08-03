import { join, relative } from "node:path";
import type { ProjectRunArtifactReferencePort } from "../project-runtime/execution-ports.js";

export function buildApplyPaths(directory: string): Record<"run" | "context" | "events" | "stdout" | "stderr" | "diff" | "diffStat" | "apply" | "transaction", string> {
  return {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    diff: join(directory, "diff.patch"),
    diffStat: join(directory, "diff-stat.txt"),
    apply: join(directory, "apply.json"),
    transaction: join(directory, "apply-transaction.json"),
  };
}

export function buildDiscardPaths(directory: string): Record<"run" | "context" | "events" | "stdout" | "stderr" | "discard" | "transaction", string> {
  return {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    discard: join(directory, "discard.json"),
    transaction: join(directory, "discard-transaction.json"),
  };
}

export function displayArtifactPath(runtime: ProjectRunArtifactReferencePort, absolutePath: string): string {
  return relative(runtime.runArtifactRoot, absolutePath).replace(/\\/g, "/");
}
