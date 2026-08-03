import type { DemandWorkerReconcileResult } from "../types/index.js";
import type { DemandWorkerStorePort } from "./paths.js";
import { listMainOrchestratorDecisions } from "./decisions.js";
import { listAllDemandWorkerAttempts, listDemandWorkers } from "./repository.js";

export async function reconcileDemandWorkers(memory: DemandWorkerStorePort): Promise<DemandWorkerReconcileResult> {
  return {
    workers: await listDemandWorkers(memory),
    attempts: await listAllDemandWorkerAttempts(memory),
    decisions: await listMainOrchestratorDecisions(memory),
  };
}
