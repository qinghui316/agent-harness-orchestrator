import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import type { ProjectRunArtifactReferencePort } from "../project-runtime/execution-ports.js";
import type { ProjectWorkbenchArtifactPathPort } from "../project-runtime/paths.js";

export function landingQueueRoot(memory: ProjectWorkbenchArtifactPathPort): string {
  return join(memory.workbenchRoot, "landing-queue");
}

export function displayLandingQueueArtifactPath(memory: ProjectRunArtifactReferencePort, file: string): string {
  return `runtime-sidecar://${relative(memory.runArtifactRoot, file).replace(/\\/g, "/")}`;
}

export function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
