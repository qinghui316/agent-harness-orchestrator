import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ManagedProject, MemoryMode, ProjectMarker } from "../types/index.js";
import { parseJsonText, writeJsonFile } from "../fs/json.js";

const MarkerSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  name: z.string(),
  managedBy: z.literal("agent-harness-orchestrator"),
  memoryMode: z.enum(["repo-local", "external-local", "remote"]).default("repo-local"),
  createdAt: z.string(),
});

export function markerPath(projectPath: string): string {
  return join(projectPath, ".agent-harness", "project.json");
}

export async function readProjectMarker(projectPath: string): Promise<ProjectMarker | null> {
  try {
    const raw = await readFile(markerPath(projectPath), "utf8");
    return MarkerSchema.parse(parseJsonText(raw, markerPath(projectPath)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Invalid project marker in ${projectPath}: ${(error as Error).message}`);
  }
}

export async function writeProjectMarker(project: ManagedProject, memoryMode: MemoryMode = "repo-local"): Promise<ProjectMarker> {
  const marker: ProjectMarker = {
    version: "1.0",
    id: project.id,
    name: project.name,
    managedBy: "agent-harness-orchestrator",
    memoryMode,
    createdAt: new Date().toISOString(),
  };
  await mkdir(join(project.path, ".agent-harness"), { recursive: true });
  await writeJsonFile(markerPath(project.path), marker);
  return marker;
}
