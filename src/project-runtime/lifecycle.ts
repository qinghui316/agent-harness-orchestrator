import { mkdir } from "node:fs/promises";
import type { ProviderRegistry } from "../provider-runtime/registry.js";
import { openProjectRuntimeWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import { assertProjectRuntimePathSafety, type ProjectRuntimePaths } from "./paths.js";

export async function initializeProjectRuntimeSidecar(
  paths: ProjectRuntimePaths,
  options: { providerRegistry?: ProviderRegistry } = {},
): Promise<void> {
  await assertProjectRuntimePathSafety(paths);
  await Promise.all([
    mkdir(paths.workbenchRoot, { recursive: true }),
    mkdir(paths.runsRoot, { recursive: true }),
    mkdir(paths.logsRoot, { recursive: true }),
    mkdir(paths.transcriptsRoot, { recursive: true }),
    mkdir(paths.worktreeMetadataRoot, { recursive: true }),
    mkdir(paths.cacheRoot, { recursive: true }),
    mkdir(paths.transactionStagingRoot, { recursive: true }),
  ]);
  await assertProjectRuntimePathSafety(paths);
  const database = await openProjectRuntimeWorkbenchDatabase(paths, options);
  database.close();
}
