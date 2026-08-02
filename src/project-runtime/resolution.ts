import type { ManagedProject } from "../types/index.js";
import type { ProjectHarnessDiscoveryPolicy } from "../project-harness/contracts.js";
import {
  assertRequiredProjectHarnessBindings,
  discoverProjectHarness,
} from "../project-harness/discovery.js";
import { assertPhysicalDirectory } from "../project-harness/path-safety.js";
import type { ProjectRuntimeResolution } from "./context.js";
import { assertProjectRuntimePathSafety, resolveProjectRuntimePaths } from "./paths.js";

export interface ResolveProjectRuntimeOptions {
  ahoHome?: string;
  discoveryPolicy: ProjectHarnessDiscoveryPolicy;
}

export async function resolveProjectRuntime(
  project: ManagedProject,
  options: ResolveProjectRuntimeOptions,
): Promise<ProjectRuntimeResolution> {
  const projectRoot = await assertPhysicalDirectory(project.path, "project source");
  const discovered = await discoverProjectHarness(projectRoot, options.discoveryPolicy);
  if (!discovered) {
    throw new Error("Project Harness discovery is missing; project onboarding must create or bind one physical Skill.");
  }
  assertRequiredProjectHarnessBindings(discovered, options.discoveryPolicy);
  if (discovered.handle.projectId !== project.id) {
    throw new Error(
      `Registered project id ${project.id} does not match canonical Harness project_id ${discovered.handle.projectId}; controlled identity migration is required.`,
    );
  }
  const paths = resolveProjectRuntimePaths(discovered.handle.projectId, options.ahoHome);
  await assertProjectRuntimePathSafety(paths);
  return {
    projectRoot,
    harness: discovered.handle,
    binding: discovered.binding,
    providerInput: discovered.providerInput,
    paths,
  };
}
