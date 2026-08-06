import { join } from "node:path";
import { z } from "zod";
import type { ManagedProject, RegistryFile } from "../types/index.js";
import { defaultProjectName, getAhoHome, normalizeForCompare, shortHash, slugify } from "../fs/path.js";
import { readJsonFile, writeJsonFile } from "../fs/json.js";

const ManagedProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  addedAt: z.string(),
  lastSeenAt: z.string(),
  defaultProviderId: z.string().optional(),
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

  async registerProject(input: {
    path: string;
    name?: string;
    projectId?: string;
  }): Promise<{ project: ManagedProject; created: boolean }> {
    const registry = await this.load();
    const comparable = normalizeForCompare(input.path);
    const existing = registry.projects.find((project) => normalizeForCompare(project.path) === comparable);
    if (existing) {
      if (input.projectId && existing.id !== input.projectId) {
        const error = new Error(
          `Registered project id ${existing.id} does not match canonical Harness project_id ${input.projectId}; controlled identity migration is required.`,
        );
        error.name = "Conflict";
        throw error;
      }
      existing.lastSeenAt = new Date().toISOString();
      await this.save(registry);
      return { project: existing, created: false };
    }

    const displayName = input.name?.trim() || defaultProjectName(input.path) || "project";
    const requestedId = input.projectId?.trim() || slugify(displayName);
    const ids = new Set(registry.projects.map((project) => project.id));
    const id = input.projectId
      ? requestedId
      : ids.has(requestedId) ? `${requestedId}-${shortHash(input.path)}` : requestedId;
    if (ids.has(id)) {
      const error = new Error(`Project id is already registered for a different path: ${id}`);
      error.name = "Conflict";
      throw error;
    }
    const now = new Date().toISOString();
    const project: ManagedProject = {
      id,
      name: displayName,
      path: input.path,
      addedAt: now,
      lastSeenAt: now,
    };
    registry.projects.push(project);
    await this.save(registry);
    return { project, created: true };
  }

  async listProjects(): Promise<ManagedProject[]> {
    return (await this.load()).projects;
  }

  async setDefaultProvider(projectId: string, providerId: string | null): Promise<ManagedProject> {
    const registry = await this.load();
    const project = registry.projects.find((item) => item.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    if (providerId) project.defaultProviderId = providerId;
    else delete project.defaultProviderId;
    project.lastSeenAt = new Date().toISOString();
    await this.save(registry);
    return project;
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

  async restoreProject(project: ManagedProject): Promise<void> {
    const registry = await this.load();
    const comparable = normalizeForCompare(project.path);
    const conflict = registry.projects.find((candidate) => (
      candidate.id === project.id || normalizeForCompare(candidate.path) === comparable
    ));
    if (conflict) {
      throw new Error(`Cannot restore project registration because its id or path is occupied: ${project.id}`);
    }
    registry.projects.push(ManagedProjectSchema.parse(project));
    await this.save(registry);
  }

  async resolveProject(query: string): Promise<ManagedProject | null> {
    const registry = await this.load();
    const byIdOrName = registry.projects.find((project) => project.id === query || project.name === query);
    if (byIdOrName) return byIdOrName;
    const comparable = normalizeForCompare(query);
    return registry.projects.find((project) => normalizeForCompare(project.path) === comparable) ?? null;
  }
}
