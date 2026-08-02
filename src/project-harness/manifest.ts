import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { parseJsonText } from "../fs/json.js";

const ProjectHarnessManifestSchema = z.object({
  schema_version: z.literal("2.0"),
  project_id: z.string().min(1),
  project_name: z.string().min(1),
  skill_name: z.string().min(1),
  skill_revision: z.number().int().nonnegative(),
  analysis_status: z.string().min(1),
}).passthrough();

export type ProjectHarnessManifest = z.infer<typeof ProjectHarnessManifestSchema>;

export async function readProjectHarnessManifest(skillRoot: string): Promise<ProjectHarnessManifest> {
  const path = join(skillRoot, "state", "manifest.json");
  const raw = await readFile(path, "utf8");
  try {
    return ProjectHarnessManifestSchema.parse(parseJsonText(raw, path));
  } catch (error) {
    throw new Error(`Invalid project Harness manifest ${path}: ${(error as Error).message}`);
  }
}
