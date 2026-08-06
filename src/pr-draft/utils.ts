import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import type { ProjectRunArtifactReferencePort } from "../project-runtime/execution-ports.js";
import type { ProjectWorkbenchArtifactPathPort } from "../project-runtime/paths.js";

export function prDraftRoot(memory: ProjectWorkbenchArtifactPathPort): string {
  return join(memory.workbenchRoot, "pr-drafts");
}

export function displayPrDraftArtifactPath(memory: ProjectRunArtifactReferencePort, absolutePath: string): string {
  return `runtime-sidecar://${relative(memory.runArtifactRoot, absolutePath).replace(/\\/g, "/")}`;
}

export function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}
