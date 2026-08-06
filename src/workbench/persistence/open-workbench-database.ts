import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import type { ProjectRuntimePaths } from "../../project-runtime/paths.js";
import { WorkbenchDatabase } from "./database.js";
import {
  defaultProjectWorkbenchDatabaseLeaseRegistry,
  type ProjectWorkbenchDatabaseLeaseRegistry,
} from "./database-leases.js";
import { RuntimeWorkbenchResetGuard } from "./reset-guard.js";

export async function openProjectRuntimeWorkbenchDatabase(
  paths: Pick<ProjectRuntimePaths, "projectId" | "workbenchDbPath" | "workbenchRoot" | "runsRoot">,
  options: {
    providerRegistry?: ProviderRegistry;
    databaseLeases?: ProjectWorkbenchDatabaseLeaseRegistry;
  } = {},
): Promise<WorkbenchDatabase> {
  const leases = options.databaseLeases ?? defaultProjectWorkbenchDatabaseLeaseRegistry;
  return leases.open(paths.projectId, (onClose) => WorkbenchDatabase.open(
    paths,
    new RuntimeWorkbenchResetGuard(paths, options.providerRegistry),
    onClose,
  ));
}
