import type {
  ProjectHarnessHandle,
  ProjectHarnessRuntime,
  ProjectHarnessSkillBinding,
  ProviderSkillInput,
} from "../project-harness/index.js";
import type { ProjectRuntimePaths } from "./paths.js";

export interface ProjectRuntimeResolution {
  projectRoot: string;
  harness: ProjectHarnessHandle;
  binding: ProjectHarnessSkillBinding;
  providerInput: ProviderSkillInput;
  paths: ProjectRuntimePaths;
}

export interface ProjectRuntimeContext extends ProjectRuntimeResolution {
  harnessRuntime: ProjectHarnessRuntime;
}

export function createProjectRuntimeContext(
  resolution: ProjectRuntimeResolution,
  harnessRuntime: ProjectHarnessRuntime,
): ProjectRuntimeContext {
  return { ...resolution, harnessRuntime };
}
