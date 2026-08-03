import { join } from "node:path";
import {
  listProjectHarnessChanges,
  readProjectHarnessChangeContext,
  type ProjectHarnessChangeRecord,
} from "../project-harness/change.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ProjectRuntimeResolution } from "../project-runtime/context.js";
import type { ManagedProject } from "../types/index.js";

export interface ProjectHarnessTopic {
  projectId: string;
  change: ProjectHarnessChangeRecord;
  evidenceState: "active" | "parking" | "archive";
  evidencePath: string;
  evidenceRoot: string;
}

export async function resolveProjectHarnessTopic(
  resolution: ProjectRuntimeResolution,
  changeId: string,
): Promise<ProjectHarnessTopic> {
  const context = await readProjectHarnessChangeContext(resolution.harness.skillRoot, changeId, false)
    .catch(() => null);
  if (!context) throw new Error(`Topic not found: ${changeId}.`);
  return {
    projectId: resolution.harness.projectId,
    change: context.change,
    evidenceState: context.evidence_state,
    evidencePath: context.evidence_path,
    evidenceRoot: join(resolution.harness.skillRoot, ...context.evidence_path.split("/")),
  };
}

export async function resolveTopic(project: ManagedProject, changeId: string): Promise<ProjectHarnessTopic> {
  return resolveProjectHarnessTopic(await requireReadyProjectRuntime(project), changeId);
}

export async function getSingleActiveChangeId(project: ManagedProject): Promise<string> {
  const resolution = await requireReadyProjectRuntime(project);
  const active = (await listProjectHarnessChanges(resolution.harness.skillRoot))
    .filter((change) => change.status === "planning" || change.status === "active");
  if (active.length !== 1) throw new Error(`Expected exactly one active Topic; found ${active.length}.`);
  return active[0]!.change_id;
}

async function requireReadyProjectRuntime(project: ManagedProject): Promise<ProjectRuntimeResolution> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for Topic resolution: ${state.state}.`);
  }
  return state.resolution;
}
