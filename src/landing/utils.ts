import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import type { ProjectRunArtifactReferencePort } from "../project-runtime/execution-ports.js";
import type { ProjectWorkbenchArtifactPathPort } from "../project-runtime/paths.js";
import type { LandingReadinessTarget } from "./types.js";

export function landingRoot(memory: ProjectWorkbenchArtifactPathPort): string {
  return join(memory.workbenchRoot, "landing");
}

export function displayLandingArtifactPath(memory: ProjectRunArtifactReferencePort, absolutePath: string): string {
  return `runtime-sidecar://${relative(memory.runArtifactRoot, absolutePath).replace(/\\/g, "/")}`;
}

export function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

export function diffContentHash(diff: string): string {
  const normalized = `${diff.replace(/\r\n/g, "\n").trimEnd()}\n`;
  return contentHash(normalized);
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildLandingPackageId(target: LandingReadinessTarget): string {
  return `landing-${target.kind}-${contentHash(targetKey(target)).slice(0, 12)}`;
}

export function targetKey(target: LandingReadinessTarget): string {
  if (target.kind === "integration-check") return `integration-check:${target.applyCheckId ?? ""}`;
  return `worktree:${target.worktreeIds[0] ?? ""}:${target.applyRunId ?? ""}`;
}
