import { join } from "node:path";
import type {
  ProjectCodeExecutionRuntimePort,
  ProjectHarnessExecutionPort,
} from "../project-runtime/execution-ports.js";
import type { ChangeStatus, ManagedProject } from "../types/index.js";
import type { SchedulerArtifactStore } from "./artifact-store.js";
import { skillNativeSchedulerRunArtifactPaths } from "./artifact-store.js";

export interface SchedulerReadySetExecutionPort {
  artifacts: SchedulerArtifactStore;
  runtime: ProjectCodeExecutionRuntimePort;
  harness: ProjectHarnessExecutionPort;
}

export interface SchedulerReadySetExecutionScope {
  artifacts: SchedulerArtifactStore;
  runtime: ProjectCodeExecutionRuntimePort;
  changeStatus: ChangeStatus;
  changePath: string;
  skillNative: SchedulerReadySetExecutionPort;
}

export function skillNativeSchedulerExecutionPort(input: {
  runtime: ProjectCodeExecutionRuntimePort;
  harness: ProjectHarnessExecutionPort;
  skillRoot: string;
  sidecarRoot: string;
  schedulerRunId: string;
}): SchedulerReadySetExecutionPort {
  const changeId = input.harness.planning.change.change_id;
  return {
    runtime: input.runtime,
    harness: input.harness,
    artifacts: {
      changeId,
      changeEvidenceRoot: input.harness.evidenceRoot,
      planningRoot: join(input.harness.evidenceRoot, "planning"),
      runtimeRoot: join(input.runtime.runsRoot, "scheduler-runs", changeId),
      artifactRoots: [input.skillRoot, input.sidecarRoot],
      runArtifacts: skillNativeSchedulerRunArtifactPaths(
        join(input.runtime.runsRoot, "scheduler-runs", changeId),
        input.schedulerRunId,
      ),
    },
  };
}

export async function resolveSchedulerReadySetExecutionScope(
  project: ManagedProject,
  changeId: string,
  actionLabel: string,
  port: SchedulerReadySetExecutionPort,
): Promise<SchedulerReadySetExecutionScope> {
  if (project.id !== port.runtime.projectId
    || port.harness.planning.change.change_id !== changeId
    || port.harness.changeStatus.change?.id !== changeId) {
    throw new Error(`${actionLabel} Skill-native execution scope mismatch.`);
  }
  const changePath = port.harness.changeStatus.activeChanges.find((item) => item.name === changeId)?.path;
  if (!changePath) throw new Error(`${actionLabel} cannot resolve active Project Harness Change path.`);
  return {
    artifacts: port.artifacts,
    runtime: port.runtime,
    changeStatus: port.harness.changeStatus,
    changePath,
    skillNative: port,
  };
}
