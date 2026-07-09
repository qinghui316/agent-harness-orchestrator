import type { DemandWorkerReconcileResult, ResolvedMemory } from "../types/index.js";
import { listMainOrchestratorDecisions } from "./decisions.js";
import { listAllDemandWorkerAttempts, listDemandWorkers } from "./repository.js";

export async function reconcileDemandWorkers(memory: ResolvedMemory): Promise<DemandWorkerReconcileResult> {
  return {
    workers: await listDemandWorkers(memory),
    attempts: await listAllDemandWorkerAttempts(memory),
    decisions: await listMainOrchestratorDecisions(memory),
  };
}
