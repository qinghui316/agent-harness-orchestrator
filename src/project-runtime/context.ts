import type { ProjectHarnessHandle, ProjectHarnessRuntime } from "../project-harness/index.js";
import type { ProjectRuntimePaths } from "./paths.js";

export interface ProjectRuntimeContext {
  projectRoot: string;
  harness: ProjectHarnessHandle;
  paths: ProjectRuntimePaths;
  harnessRuntime: ProjectHarnessRuntime;
}
