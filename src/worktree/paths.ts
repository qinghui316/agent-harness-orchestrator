import { join } from "node:path";
import { getAhoHome } from "../fs/path.js";
import type {
  ProjectWorktreeIndexPathPort,
  ProjectWorktreeMetadataPathPort,
} from "../project-runtime/paths.js";

export type WorktreeMetadataPort = ProjectWorktreeMetadataPathPort & {
  projectId: string | null;
  projectRoot: string;
};

export type WorktreeIndexPort = WorktreeMetadataPort & ProjectWorktreeIndexPathPort;

export type WorktreeCreationPort = WorktreeIndexPort & {
  projectWriteLeasePath: string;
};

export function getGlobalWorktreeCheckoutRoot(projectId: string): string {
  return join(getAhoHome(), "worktrees", projectId, "checkouts");
}

export function getWorktreeMetadataPath(memory: ProjectWorktreeMetadataPathPort, worktreeId: string): string {
  return join(memory.worktreeMetadataRoot, `${worktreeId}.json`);
}

