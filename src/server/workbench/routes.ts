import { ProjectRegistryStore } from "../../registry/store.js";
import type { WorkbenchProjectInput } from "../../workbench/read-model-types.js";

export function matchProjectWorkbenchRoute(pathname: string): { projectId: string; rest: string } | null {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/workbench(?:\/(.*))?$/);
  if (!match?.[1]) return null;
  return { projectId: decodeURIComponent(match[1]), rest: match[2] ?? "snapshot" };
}

export async function resolveProjectInput(store: ProjectRegistryStore, projectId: string): Promise<WorkbenchProjectInput> {
  const project = await store.resolveProject(projectId);
  if (!project) {
    const error = new Error(`Project not found: ${projectId}`);
    error.name = "NotFound";
    throw error;
  }
  return { project, path: project.path };
}
