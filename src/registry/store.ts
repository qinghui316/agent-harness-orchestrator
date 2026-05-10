import { join } from "node:path";
import { z } from "zod";
import type { ManagedProject, RegistryFile } from "../types/index.js";
import { getAhoHome, normalizeForCompare, shortHash, slugify } from "../fs/path.js";
import { readJsonFile, writeJsonFile } from "../fs/json.js";

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

    const displayName = name?.trim() || path.split(/[\\/]/).filter(Boolean).at(-1) || "project";
    const baseId = slugify(displayName);
    const ids = new Set(registry.projects.map((project) => project.id));
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

  async resolveProject(query: string): Promise<ManagedProject | null> {
    const registry = await this.load();
    const byIdOrName = registry.projects.find((project) => project.id === query || project.name === query);
    if (byIdOrName) return byIdOrName;
    const comparable = normalizeForCompare(query);
    return registry.projects.find((project) => normalizeForCompare(project.path) === comparable) ?? null;
  }
}
