import {
  enqueueDemandWorkerForRuntime,
  evaluateDemandOrchestratorRuntime,
  pumpDemandWorkersForRuntime,
  reconcileDemandWorkersForRuntime,
  releaseDemandWorkerForRuntime,
  startNextDemandWorkerForRuntime,
} from "../../workflow-runtime/code-workflow.js";
import { resolveProjectHarnessChangeEvidenceRoot } from "../../project-harness/change.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../../project-runtime/coordinator.js";
import { projectExecutionRuntimePort } from "../../project-runtime/execution-ports.js";
import type { ManagedProject } from "../../types/index.js";
import type { SkillNativeDemandWorkerRuntime } from "../../workflow-runtime/demand-worker.js";
import type { WorkbenchLiveSink } from "../types.js";

export async function enqueueDemandWorkerForAction(project: ManagedProject, changeId: string): Promise<unknown> {
  return enqueueDemandWorkerForRuntime(project, changeId, await resolveDemandWorkerRuntime(project));
}

export async function startNextDemandWorkerForAction(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  return startNextDemandWorkerForRuntime(project, changeId, prompt, live, await resolveDemandWorkerRuntime(project));
}

export async function pumpDemandWorkersForAction(
  project: ManagedProject,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  liveChangeId?: string,
): Promise<unknown> {
  return pumpDemandWorkersForRuntime(
    project,
    prompt,
    live,
    liveChangeId,
    await resolveDemandWorkerRuntime(project),
  );
}

export async function evaluateDemandOrchestrator(project: ManagedProject, changeId: string): Promise<unknown> {
  return evaluateDemandOrchestratorRuntime(project, changeId, await resolveDemandWorkerRuntime(project));
}

export async function reconcileDemandWorkersForAction(project: ManagedProject): Promise<unknown> {
  return reconcileDemandWorkersForRuntime(project, await resolveDemandWorkerRuntime(project));
}

export async function releaseDemandWorkerForAction(project: ManagedProject, changeId: string, reason: string | undefined): Promise<unknown> {
  return releaseDemandWorkerForRuntime(project, changeId, reason, await resolveDemandWorkerRuntime(project));
}

async function resolveDemandWorkerRuntime(project: ManagedProject): Promise<SkillNativeDemandWorkerRuntime> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for DemandWorker execution: ${state.state}.`);
  }
  return {
    runtime: projectExecutionRuntimePort(project, state.resolution),
    changeRoot: (changeId) => resolveProjectHarnessChangeEvidenceRoot(
      state.resolution.harness.skillRoot,
      "active",
      changeId,
    ),
  };
}
