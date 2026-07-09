import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import { assertWorkflowArtifactScope } from "./guards.js";
import { latestDecompositionReadinessPath, planningDir } from "./paths.js";
import { renderDecompositionReadinessMarkdown } from "./rendering.js";
import { decompositionReadinessManifestSchema } from "./schemas.js";
import type { DecompositionReadinessManifest } from "./types.js";

export async function readLatestDecompositionReadinessManifest(memory: ResolvedMemory, changePath: string): Promise<DecompositionReadinessManifest> {
  const manifest = await readRequiredJsonFile(latestDecompositionReadinessPath(memory, changePath), decompositionReadinessManifestSchema);
  await assertWorkflowArtifactScope(memory, changePath, manifest, "DecompositionReadinessManifest");
  return manifest;
}

export async function writeDecompositionReadinessManifest(memory: ResolvedMemory, changePath: string, manifest: DecompositionReadinessManifest): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, manifest, "DecompositionReadinessManifest");
  const dir = planningDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, "decomposition-readiness.json"), manifest);
  await writeFile(join(dir, "decomposition-readiness.md"), renderDecompositionReadinessMarkdown(manifest), "utf8");
}
