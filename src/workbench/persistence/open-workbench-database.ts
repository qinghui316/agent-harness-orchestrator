import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import type { ProjectRuntimePaths } from "../../project-runtime/paths.js";
import type { ResolvedMemory } from "../../types/index.js";
import { WorkbenchDatabase } from "./database.js";
import { RuntimeWorkbenchResetGuard } from "./reset-guard.js";

export async function openWorkbenchDatabase(
  memory: ResolvedMemory,
  options: { providerRegistry?: ProviderRegistry } = {},
): Promise<WorkbenchDatabase> {
  return WorkbenchDatabase.open(memory, new RuntimeWorkbenchResetGuard(memory, options.providerRegistry));
}

export async function openProjectRuntimeWorkbenchDatabase(
  paths: Pick<ProjectRuntimePaths, "workbenchDbPath">,
  options: { providerRegistry?: ProviderRegistry } = {},
): Promise<WorkbenchDatabase> {
  return WorkbenchDatabase.open(paths, new RuntimeWorkbenchResetGuard(undefined, options.providerRegistry));
}
