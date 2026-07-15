import { existsSync } from "node:fs";
import type { ManagedProject, ProjectStatus } from "../types/index.js";
import { auditHarness } from "../harness/audit.js";
import { getMemoryStatus } from "../memory/status.js";
import { getGitBranch, isGitDirty, isGitRepo } from "./git.js";
import { readProjectMarker } from "./marker.js";

export async function getProjectStatus(project: ManagedProject | null, path: string): Promise<ProjectStatus> {
  const pathExists = existsSync(path);
  const gitRepo = pathExists ? await isGitRepo(path) : false;
  const marker = pathExists ? await readProjectMarker(path) : null;
  const memory = pathExists
    ? await getMemoryStatus(project, path)
    : missingMemoryStatus(project, path);
  return {
    project,
    path,
    pathExists,
    isGitRepo: gitRepo,
    branch: pathExists ? await getGitBranch(path) : null,
    dirty: pathExists ? await isGitDirty(path) : null,
    managed: marker !== null,
    memory,
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

function missingMemoryStatus(project: ManagedProject | null, path: string): Awaited<ReturnType<typeof getMemoryStatus>> {
  return {
    registered: project !== null,
    managed: false,
    memoryMode: "repo-local",
    memoryAvailable: false,
    harnessReady: false,
    markerPath: `${path}\\.agent-harness\\project.json`,
    roots: {
      projectRoot: path,
      memoryRoot: path,
      docsRoot: `${path}\\docs`,
      harnessRoot: path,
      changesRoot: `${path}\\harness\\changes`,
      evolutionRoot: `${path}\\harness\\evolution`,
      templatesRoot: `${path}\\harness\\templates\\change`,
      scriptsRoot: `${path}\\scripts`,
      runsRoot: `${path}\\.agent-harness\\runs`,
      workbenchRoot: `${path}\\.agent-harness\\workbench`,
      workbenchDbPath: `${path}\\.agent-harness\\workbench\\workbench.sqlite`,
      agentsRoot: `${path}\\.agent-harness\\agents`,
      commandsRoot: `${path}\\.agent-harness\\commands`,
      agentCatalogPath: `${path}\\.agent-harness\\agent-catalog.json`,
      skillsRoot: `${path}\\.agent-harness\\skills`,
      worktreeMetadataRoot: `${path}\\.agent-harness\\worktrees\\metadata`,
      worktreeIndexPath: `${path}\\.agent-harness\\worktrees\\index.json`,
    },
    artifactBase: "project-root",
    unsupportedReason: "Project path does not exist.",
  };
}
