import { join, relative } from "node:path";
import type { ProjectRunArtifactReferencePort } from "../project-runtime/execution-ports.js";

export interface IntegrationCheckStorePort {
  workbenchRoot: string;
}

export function integrationCheckRoot(memory: IntegrationCheckStorePort): string {
  return join(memory.workbenchRoot, "integration-checks");
}

export function displaySkillNativeArtifactPath(runtime: ProjectRunArtifactReferencePort, absolutePath: string): string {
  return relative(runtime.runArtifactRoot, absolutePath).replace(/\\/g, "/");
}

export function compactTimestamp(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}
