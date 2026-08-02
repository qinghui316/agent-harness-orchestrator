import { join, resolve } from "node:path";
import { getAhoHome } from "../fs/path.js";

export interface ProjectRuntimePaths {
  projectId: string;
  sidecarRoot: string;
  workbenchRoot: string;
  workbenchDbPath: string;
  runsRoot: string;
  logsRoot: string;
  transcriptsRoot: string;
  worktreeMetadataRoot: string;
  cacheRoot: string;
  transactionStagingRoot: string;
}

export function resolveProjectRuntimePaths(projectId: string, ahoHome = getAhoHome()): ProjectRuntimePaths {
  assertProjectId(projectId);
  const sidecarRoot = join(resolve(ahoHome), "projects", projectId);
  return {
    projectId,
    sidecarRoot,
    workbenchRoot: join(sidecarRoot, "workbench"),
    workbenchDbPath: join(sidecarRoot, "workbench", "workbench.sqlite"),
    runsRoot: join(sidecarRoot, "runs"),
    logsRoot: join(sidecarRoot, "logs"),
    transcriptsRoot: join(sidecarRoot, "transcripts"),
    worktreeMetadataRoot: join(sidecarRoot, "worktrees", "metadata"),
    cacheRoot: join(sidecarRoot, "cache"),
    transactionStagingRoot: join(sidecarRoot, "transactions"),
  };
}

function assertProjectId(projectId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(projectId)) {
    throw new Error(`Project id is not a portable sidecar key: ${projectId}`);
  }
}
