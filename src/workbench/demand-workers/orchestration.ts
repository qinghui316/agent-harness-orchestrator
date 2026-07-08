import {
  enqueueDemandWorkerForRuntime,
  evaluateDemandOrchestratorRuntime,
  pumpDemandWorkersForRuntime,
  reconcileDemandWorkersForRuntime,
  releaseDemandWorkerForRuntime,
  startNextDemandWorkerForRuntime,
} from "../../workflow-runtime/code-workflow.js";
import type { ManagedProject } from "../../types/index.js";
import type { WorkbenchLiveSink } from "../types.js";

export async function enqueueDemandWorkerForAction(project: ManagedProject, changeId: string): Promise<unknown> {
  return enqueueDemandWorkerForRuntime(project, changeId);
}

export async function startNextDemandWorkerForAction(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
): Promise<unknown> {
  return startNextDemandWorkerForRuntime(project, changeId, prompt, live);
}

export async function pumpDemandWorkersForAction(
  project: ManagedProject,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  liveChangeId?: string,
): Promise<unknown> {
  return pumpDemandWorkersForRuntime(project, prompt, live, liveChangeId);
}

export async function evaluateDemandOrchestrator(project: ManagedProject, changeId: string): Promise<unknown> {
  return evaluateDemandOrchestratorRuntime(project, changeId);
}

export async function reconcileDemandWorkersForAction(project: ManagedProject): Promise<unknown> {
  return reconcileDemandWorkersForRuntime(project);
}

export async function releaseDemandWorkerForAction(project: ManagedProject, changeId: string, reason: string | undefined): Promise<unknown> {
  return releaseDemandWorkerForRuntime(project, changeId, reason);
}
