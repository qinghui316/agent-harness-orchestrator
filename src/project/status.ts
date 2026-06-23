import { existsSync } from "node:fs";
import type { ManagedProject, ProjectStatus } from "../types/index.js";
import { readCodexProjectTrust } from "../codex/trust.js";
import { auditHarness } from "../harness/audit.js";
import { getGitBranch, isGitDirty, isGitRepo } from "./git.js";
import { readProjectMarker } from "./marker.js";

export async function getProjectStatus(project: ManagedProject | null, path: string): Promise<ProjectStatus> {
  const pathExists = existsSync(path);
  const gitRepo = pathExists ? await isGitRepo(path) : false;
  const marker = pathExists ? await readProjectMarker(path) : null;
  return {
    project,
    path,
    pathExists,
    isGitRepo: gitRepo,
    branch: pathExists ? await getGitBranch(path) : null,
    dirty: pathExists ? await isGitDirty(path) : null,
    managed: marker !== null,
    codexTrust: await readCodexProjectTrust(path),
    harness: pathExists
      ? await auditHarness(path)
      : {
          projectPath: path,
          managed: false,
          readiness: "missing",
          activeChanges: [],
          pendingEvolution: false,
          components: [],
        },
  };
}
