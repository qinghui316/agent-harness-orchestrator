import { lstat } from "node:fs/promises";
import { join, parse, relative, resolve, sep } from "node:path";
import { getAhoHome } from "../fs/path.js";
import { assertPortableProjectId } from "../project-harness/project-id.js";

export interface ProjectRuntimePaths {
  projectId: string;
  sidecarRoot: string;
  workbenchRoot: string;
  workbenchDbPath: string;
  runsRoot: string;
  logsRoot: string;
  transcriptsRoot: string;
  worktreeMetadataRoot: string;
  worktreeIndexPath: string;
  cacheRoot: string;
  transactionStagingRoot: string;
}

export function resolveProjectRuntimePaths(projectId: string, ahoHome = getAhoHome()): ProjectRuntimePaths {
  assertPortableProjectId(projectId);
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
    worktreeIndexPath: join(sidecarRoot, "worktrees", "index.json"),
    cacheRoot: join(sidecarRoot, "cache"),
    transactionStagingRoot: join(sidecarRoot, "transactions"),
  };
}

export async function assertProjectRuntimePathSafety(paths: ProjectRuntimePaths): Promise<void> {
  const target = resolve(paths.sidecarRoot);
  const root = parse(target).root;
  let current = root;
  for (const segment of relative(root, target).split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Runtime sidecar path traverses a link, Junction, or non-directory: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}
