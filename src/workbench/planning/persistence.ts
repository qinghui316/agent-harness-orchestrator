import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFile } from "../../fs/json.js";
import type { ResolvedMemory } from "../../types/index.js";
import type { PlanningArtifactBundle } from "../types.js";
import { renderPlanningBundleMarkdown } from "./renderers.js";

export async function writePlanningBundle(memory: ResolvedMemory, changePath: string, bundle: PlanningArtifactBundle): Promise<void> {
  const dir = join(memory.memoryRoot, changePath, "planning");
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, "latest-bundle.json"), bundle);
  await writeFile(join(dir, "latest-bundle.md"), renderPlanningBundleMarkdown(bundle), "utf8");
}
