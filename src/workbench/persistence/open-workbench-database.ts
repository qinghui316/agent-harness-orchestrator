import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import type { ProjectRuntimePaths } from "../../project-runtime/paths.js";
import { WorkbenchDatabase } from "./database.js";
import type { WorkbenchDatabaseUpgradeOptions } from "./database-upgrade.js";
import {
  defaultProjectWorkbenchDatabaseLeaseRegistry,
  type ProjectWorkbenchDatabaseLeaseRegistry,
} from "./database-leases.js";
import { RuntimeWorkbenchMigrationGuard } from "./reset-guard.js";

export async function openProjectRuntimeWorkbenchDatabase(
  paths: Pick<ProjectRuntimePaths, "projectId" | "workbenchDbPath" | "workbenchRoot" | "runsRoot">,
  options: {
    providerRegistry?: ProviderRegistry;
    databaseLeases?: ProjectWorkbenchDatabaseLeaseRegistry;
    upgradeOptions?: WorkbenchDatabaseUpgradeOptions;
  } = {},
): Promise<WorkbenchDatabase> {
  const leases = options.databaseLeases ?? defaultProjectWorkbenchDatabaseLeaseRegistry;
  return leases.open(paths.projectId, (onClose) => WorkbenchDatabase.open(
    paths,
    new RuntimeWorkbenchMigrationGuard(paths, options.providerRegistry),
    onClose,
    options.upgradeOptions,
  ));
}
