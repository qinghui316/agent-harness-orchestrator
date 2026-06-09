import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "./paths.js";
import type { IntegrationArtifact, IntegrationCheckRecord } from "./types.js";

export function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

export function integrationArtifact(
  memory: ResolvedMemory,
  absolutePath: string,
  content: string,
  kind: IntegrationArtifact["kind"],
  source: IntegrationArtifact["source"],
): IntegrationArtifact {
  return {
    kind,
    path: displayArtifactPath(memory, absolutePath),
    hash: contentHash(content),
    createdAt: new Date().toISOString(),
    source,
  };
}

export function latestArtifactAbsolutePath(directory: string, artifact: IntegrationArtifact): string {
  return join(directory, basename(artifact.path));
}

export function latestArtifactForApply(check: IntegrationCheckRecord): IntegrationArtifact | undefined {
  const artifact = [...check.artifacts].reverse().find((item) => item.hash === check.latestArtifactHash);
  return artifact ?? check.artifacts.at(-1);
}

export function messageFromIssues(issues: string[]): string {
  return issues.filter(Boolean).join("\n") || "integration check failed";
}
