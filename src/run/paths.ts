import { relative } from "node:path";

export function displayArtifactPath(artifactRoot: string, absolutePath: string): string {
  return relative(artifactRoot, absolutePath).replace(/\\/g, "/");
}
