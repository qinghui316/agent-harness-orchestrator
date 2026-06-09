import { join } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import type { DemandWorker, DemandWorkerQueue, ResolvedMemory } from "../types/index.js";
import { demandWorkersRoot } from "./paths.js";
import { DEFAULT_MAX_CONCURRENT_DEMANDS } from "./slot-policy.js";

export async function writeDemandWorkerQueueProjection(memory: ResolvedMemory, workers: DemandWorker[]): Promise<void> {
  const queue: DemandWorkerQueue = {
    version: "1.0",
    projectId: memory.projectId,
    maxConcurrentDemands: DEFAULT_MAX_CONCURRENT_DEMANDS,
    workers,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(join(demandWorkersRoot(memory), "queue.json"), queue);
}
