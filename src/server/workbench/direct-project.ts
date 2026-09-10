import { normalizeForCompare } from "../../fs/path.js";
import { getProjectStatus } from "../../project/status.js";
import type { ProjectRegistryStore } from "../../registry/store.js";
import type { WorkbenchProjectInput } from "../../workbench/read-model-types.js";
import type { ProjectRuntimeCoordinatorPort } from "../../project-runtime/coordinator.js";

export async function restoreDirectProjectInput(input: WorkbenchProjectInput | null, store: ProjectRegistryStore): Promise<WorkbenchProjectInput | null> {
  if (!input) return input;
  if (input.project) {
    const registered = await store.resolveProject(input.project.path);
    return registered ? { project: registered, path: registered.path } : input;
  }
  const byPath = await store.resolveProject(input.path);
  if (byPath) return { project: byPath, path: byPath.path };
  return { project: null, path: input.path };
}

export async function listProjectStatusesWithDirect(
  store: ProjectRegistryStore,
  directInput: WorkbenchProjectInput | null,
  projectRuntimeCoordinator?: Pick<ProjectRuntimeCoordinatorPort, "startupState">,
): Promise<unknown[]> {
  const projects = await store.listProjects();
  const resolver = projectRuntimeCoordinator
    ? (project: NonNullable<WorkbenchProjectInput["project"]>) => projectRuntimeCoordinator.startupState(project)
    : undefined;
  const statuses = await Promise.all(projects.map(async (project) => getProjectStatus(project, project.path, resolver)));
  const directProject = directInput?.project;
  if (!directProject || projects.some((project) =>
    project.id === directProject.id || normalizeForCompare(project.path) === normalizeForCompare(directProject.path)
  )) return statuses;
  return [...statuses, await getProjectStatus(directProject, directProject.path, resolver)];
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
