import type { DemandWorkerAttempt, DemandWorkerSlot, DemandWorkerStatus } from "../types/index.js";
import type { DemandWorkerStorePort } from "./paths.js";
import { listDemandWorkers } from "./repository.js";

export const DEFAULT_MAX_CONCURRENT_DEMANDS = 2;
export const MIN_MAX_CONCURRENT_DEMANDS = 1;

export async function getDemandWorkerSlot(memory: DemandWorkerStorePort, maxConcurrentDemands = DEFAULT_MAX_CONCURRENT_DEMANDS): Promise<DemandWorkerSlot> {
  const normalizedMax = normalizeMaxConcurrentDemands(maxConcurrentDemands);
  const runningCount = (await listDemandWorkers(memory)).filter((worker) => isDemandWorkerRunningStatus(worker.status)).length;
  return {
    maxConcurrentDemands: normalizedMax,
    runningCount,
    available: runningCount < normalizedMax,
  };
}

export function isActiveDemandWorkerStatus(status: DemandWorkerStatus): boolean {
  return ["queued", "claimed", "running"].includes(status);
}

export function isDemandWorkerRunningStatus(status: DemandWorkerStatus): boolean {
  return status === "claimed" || status === "running";
}

export function isDemandWorkerTerminal(status: DemandWorkerStatus): boolean {
  return ["failed", "completed", "released"].includes(status);
}

export function isActiveDemandWorkerAttemptStatus(status: DemandWorkerAttempt["status"]): boolean {
  return status === "claimed" || status === "running";
}

export function normalizeMaxConcurrentDemands(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_CONCURRENT_DEMANDS;
  return Math.max(MIN_MAX_CONCURRENT_DEMANDS, Math.floor(value ?? DEFAULT_MAX_CONCURRENT_DEMANDS));
}
