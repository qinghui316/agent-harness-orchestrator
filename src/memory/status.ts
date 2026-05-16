import { existsSync } from "node:fs";
import type { ManagedProject, MemoryStatus } from "../types/index.js";
import { auditHarness } from "../harness/audit.js";
import { readProjectMarker } from "../project/marker.js";
import { resolveMemory } from "./resolver.js";

export async function getMemoryStatus(project: ManagedProject | null, path: string): Promise<MemoryStatus> {
  const marker = await readProjectMarker(path);
  const memory = resolveMemory(project ? { ...project, marker } : { path, marker });
  const audit = await auditHarness(path);

  return {
    registered: project !== null,
    managed: marker !== null,
    memoryMode: memory.mode,
    memoryAvailable: marker !== null && memory.supported && existsSync(memory.memoryRoot),
    harnessReady: audit.readiness === "ready",
    markerPath: memory.markerPath,
    roots: {
      projectRoot: memory.projectRoot,
      memoryRoot: memory.memoryRoot,
      docsRoot: memory.docsRoot,
      harnessRoot: memory.harnessRoot,
      changesRoot: memory.changesRoot,
      evolutionRoot: memory.evolutionRoot,
      templatesRoot: memory.templatesRoot,
      scriptsRoot: memory.scriptsRoot,
      runsRoot: memory.runsRoot,
      workbenchRoot: memory.workbenchRoot,
      workbenchDbPath: memory.workbenchDbPath,
      agentsRoot: memory.agentsRoot,
      commandsRoot: memory.commandsRoot,
      agentCatalogPath: memory.agentCatalogPath,
      skillsRoot: memory.skillsRoot,
      worktreeMetadataRoot: memory.worktreeMetadataRoot,
      worktreeIndexPath: memory.worktreeIndexPath,
    },
    artifactBase: memory.artifactBase,
    unsupportedReason: memory.reason,
  };
}
