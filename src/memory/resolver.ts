import { join } from "node:path";
import { getAhoHome } from "../fs/path.js";
import { markerPath } from "../project/marker.js";
import type { ManagedProject, MemoryMode, ProjectMarker, ResolvedMemory } from "../types/index.js";

export type MemoryProjectInput =
  | ManagedProject
  | {
    path: string;
    marker?: ProjectMarker | null;
    id?: string | null;
    name?: string | null;
  };

export function resolveMemory(project: MemoryProjectInput): ResolvedMemory {
  const projectRoot = project.path;
  const marker = "marker" in project ? project.marker ?? null : null;
  const projectId = "id" in project && typeof project.id === "string"
    ? project.id
    : marker?.id ?? null;
  const mode: MemoryMode = marker?.memoryMode ?? "repo-local";

  if (mode === "external-local") {
    return externalLocalMemory(projectRoot, projectId);
  }
  if (mode === "remote") {
    return remoteMemory(projectRoot, projectId);
  }
  return repoLocalMemory(projectRoot, projectId);
}

export function assertWritableMemory(memory: ResolvedMemory, action: string): void {
  if (!memory.supported || !memory.writable) {
    throw new Error(`${action} is not supported for ${memory.mode} memory in this phase.${memory.reason ? ` ${memory.reason}` : ""}`);
  }
}

export function repoLocalMemory(projectRoot: string, projectId: string | null): ResolvedMemory {
  return {
    mode: "repo-local",
    supported: true,
    writable: true,
    projectId,
    projectRoot,
    markerPath: markerPath(projectRoot),
    harnessRoot: projectRoot,
    changesRoot: join(projectRoot, "harness", "changes"),
    evolutionRoot: join(projectRoot, "harness", "evolution"),
    templatesRoot: join(projectRoot, "harness", "templates", "change"),
    runsRoot: join(projectRoot, ".agent-harness", "runs"),
  };
}

function externalLocalMemory(projectRoot: string, projectId: string | null): ResolvedMemory {
  const id = projectId ?? "unknown-project";
  const memoryRoot = join(getAhoHome(), "projects", id);
  return {
    mode: "external-local",
    supported: false,
    writable: false,
    projectId,
    projectRoot,
    markerPath: markerPath(projectRoot),
    harnessRoot: memoryRoot,
    changesRoot: join(memoryRoot, "harness", "changes"),
    evolutionRoot: join(memoryRoot, "harness", "evolution"),
    templatesRoot: join(memoryRoot, "harness", "templates", "change"),
    runsRoot: join(memoryRoot, "runs"),
    reason: "external-local memory is planned but not operational in Phase 2D.",
  };
}

function remoteMemory(projectRoot: string, projectId: string | null): ResolvedMemory {
  const id = projectId ?? "unknown-project";
  const cacheRoot = join(getAhoHome(), "cache", "remote", id);
  return {
    mode: "remote",
    supported: false,
    writable: false,
    projectId,
    projectRoot,
    markerPath: markerPath(projectRoot),
    harnessRoot: cacheRoot,
    changesRoot: join(cacheRoot, "harness", "changes"),
    evolutionRoot: join(cacheRoot, "harness", "evolution"),
    templatesRoot: join(cacheRoot, "harness", "templates", "change"),
    runsRoot: join(cacheRoot, "runs"),
    reason: "remote memory is future work and is not operational in Phase 2D.",
  };
}
