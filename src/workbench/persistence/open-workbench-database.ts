import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import type { ProjectRuntimePaths } from "../../project-runtime/paths.js";
import type { ResolvedMemory } from "../../types/index.js";
import { WorkbenchDatabase } from "./database.js";
import {
  defaultProjectWorkbenchDatabaseLeaseRegistry,
  type ProjectWorkbenchDatabaseLeaseRegistry,
} from "./database-leases.js";
import { RuntimeWorkbenchResetGuard } from "./reset-guard.js";

export async function openWorkbenchDatabase(
  memory: ResolvedMemory,
  options: {
    providerRegistry?: ProviderRegistry;
    databaseLeases?: ProjectWorkbenchDatabaseLeaseRegistry;
  } = {},
): Promise<WorkbenchDatabase> {
  if (!memory.projectId) {
    return WorkbenchDatabase.open(memory, new RuntimeWorkbenchResetGuard(memory, options.providerRegistry));
  }
  const leases = options.databaseLeases ?? defaultProjectWorkbenchDatabaseLeaseRegistry;
  return leases.open(memory.projectId, (onClose) => WorkbenchDatabase.open(
    memory,
    new RuntimeWorkbenchResetGuard(memory, options.providerRegistry),
    onClose,
  ));
}

export async function openProjectRuntimeWorkbenchDatabase(
  paths: Pick<ProjectRuntimePaths, "projectId" | "workbenchDbPath">,
  options: {
    providerRegistry?: ProviderRegistry;
    databaseLeases?: ProjectWorkbenchDatabaseLeaseRegistry;
  } = {},
): Promise<WorkbenchDatabase> {
  const leases = options.databaseLeases ?? defaultProjectWorkbenchDatabaseLeaseRegistry;
  return leases.open(paths.projectId, (onClose) => WorkbenchDatabase.open(
    paths,
    new RuntimeWorkbenchResetGuard(undefined, options.providerRegistry),
    onClose,
  ));
}
