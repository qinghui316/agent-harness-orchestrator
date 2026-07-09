import { join } from "node:path";
import { z } from "zod";
import type { ManagedProject, RegistryFile } from "../types/index.js";
import { defaultProjectName, getAhoHome, normalizeForCompare, shortHash, slugify } from "../fs/path.js";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import { readProjectMarker } from "../project/marker.js";

const ManagedProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  addedAt: z.string(),
  lastSeenAt: z.string(),
});

const RegistrySchema = z.object({
  version: z.literal("1.0"),
  projects: z.array(ManagedProjectSchema),
});

function emptyRegistry(): RegistryFile {
  return { version: "1.0", projects: [] };
}

export class ProjectRegistryStore {
  readonly registryPath: string;

  constructor(private readonly ahoHome = getAhoHome()) {
    this.registryPath = join(this.ahoHome, "registry.json");
  }

  async load(): Promise<RegistryFile> {
    return readJsonFile(this.registryPath, RegistrySchema, emptyRegistry());
  }

  async save(registry: RegistryFile): Promise<void> {
    await writeJsonFile(this.registryPath, registry);
  }

  async addProject(path: string, name?: string): Promise<ManagedProject> {
    const registry = await this.load();
    const comparable = normalizeForCompare(path);
    const existing = registry.projects.find((project) => normalizeForCompare(project.path) === comparable);
    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
      await this.save(registry);
      return existing;
    }

    const marker = await readProjectMarker(path);
    const displayName = name?.trim() || defaultProjectName(path) || "project";
    const baseId = marker?.id ?? slugify(displayName);
    const ids = new Set(registry.projects.map((project) => project.id));
    if (marker && ids.has(marker.id)) {
      const error = new Error(`Project marker id is already registered for a different path: ${marker.id}`);
      error.name = "Conflict";
      throw error;
    }
    const id = ids.has(baseId) ? `${baseId}-${shortHash(path)}` : baseId;
    const now = new Date().toISOString();
    const project: ManagedProject = {
      id,
      name: displayName,
      path,
      addedAt: now,
      lastSeenAt: now,
    };
    registry.projects.push(project);
    await this.save(registry);
    return project;
  }

  async listProjects(): Promise<ManagedProject[]> {
    return (await this.load()).projects;
  }

  async removeProject(query: string): Promise<ManagedProject | null> {
    const registry = await this.load();
    const comparable = normalizeForCompare(query);
    const index = registry.projects.findIndex((project) =>
      project.id === query || normalizeForCompare(project.path) === comparable
    );
    if (index === -1) return null;
    const [removed] = registry.projects.splice(index, 1);
    await this.save(registry);
    return removed ?? null;
  }

  async resolveProject(query: string): Promise<ManagedProject | null> {
    const registry = await this.load();
    const byIdOrName = registry.projects.find((project) => project.id === query || project.name === query);
    if (byIdOrName) return byIdOrName;
    const comparable = normalizeForCompare(query);
    return registry.projects.find((project) => normalizeForCompare(project.path) === comparable) ?? null;
  }
}
