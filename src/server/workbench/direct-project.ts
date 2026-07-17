import { defaultProjectName, normalizeForCompare } from "../../fs/path.js";
import { getProjectStatus } from "../../project/status.js";
import { readProjectMarker } from "../../project/marker.js";
import type { ProjectRegistryStore } from "../../registry/store.js";
import type { ManagedProject, ProjectStatus } from "../../types/index.js";
import type { WorkbenchProjectInput } from "../../workbench/read-model-types.js";

export async function restoreDirectProjectInput(input: WorkbenchProjectInput | null, store: ProjectRegistryStore): Promise<WorkbenchProjectInput | null> {
  if (!input || input.project) return input;
  const marker = await readProjectMarker(input.path);
  if (!marker) return input;

  const byPath = await store.resolveProject(input.path);
  if (byPath) return { project: byPath, path: byPath.path };

  const byId = await store.resolveProject(marker.id);
  if (byId && normalizeForCompare(byId.path) !== normalizeForCompare(input.path)) {
    const error = new Error(`Project marker id is already registered for a different path: ${marker.id}`);
    error.name = "Conflict";
    throw error;
  }
  if (byId) return { project: byId, path: byId.path };

  const now = new Date().toISOString();
  const project: ManagedProject = {
    id: marker.id,
    name: defaultProjectName(input.path) || marker.name,
    path: input.path,
    addedAt: now,
    lastSeenAt: now,
  };
  return { project, path: input.path };
}

export async function listProjectStatusesWithDirect(store: ProjectRegistryStore, directInput: WorkbenchProjectInput | null): Promise<unknown[]> {
  const projects = await store.listProjects();
  const statuses = await Promise.all(projects.map(async (project) => getProjectStatus(project, project.path)));
  const directProject = directInput?.project;
  if (!directProject) return statuses;
  const known = projects.some((project) =>
    project.id === directProject.id || normalizeForCompare(project.path) === normalizeForCompare(directProject.path)
  );
  if (known) return statuses;
  const status = await getProjectStatus(directProject, directProject.path) as ProjectStatus;
  return [...statuses, { ...status, memory: { ...status.memory, registered: false } }];
}

export async function resolveProjectInputWithDirect(store: ProjectRegistryStore, directInput: WorkbenchProjectInput | null, projectId: string): Promise<WorkbenchProjectInput> {
  if (directInput?.project?.id === projectId) return directInput;
  const project = await store.resolveProject(projectId);
  if (!project) {
    const error = new Error(`Project not found: ${projectId}`);
    error.name = "NotFound";
    throw error;
  }
  return { project, path: project.path };
}
