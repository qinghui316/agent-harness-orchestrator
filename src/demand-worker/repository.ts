import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { DemandWorker, DemandWorkerAttempt } from "../types/index.js";
import { demandWorkerAttemptSchema, demandWorkerSchema } from "./schemas.js";
import { demandWorkerAttemptsRoot, demandWorkerPath, demandWorkersRoot, type DemandWorkerStorePort } from "./paths.js";
import { writeDemandWorkerQueueProjection } from "./queue-projection.js";

export async function getDemandWorkerForChange(memory: DemandWorkerStorePort, changeId: string): Promise<DemandWorker | null> {
  const path = demandWorkerPath(memory, changeId);
  if (!existsSync(path)) return null;
  return readRequiredJsonFile(path, demandWorkerSchema);
}

export async function listDemandWorkers(memory: DemandWorkerStorePort): Promise<DemandWorker[]> {
  const root = demandWorkersRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const workers: DemandWorker[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, "worker.json");
    if (!existsSync(path)) continue;
    workers.push(await readRequiredJsonFile(path, demandWorkerSchema));
  }
  return workers.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listDemandWorkerAttempts(memory: DemandWorkerStorePort, changeId: string): Promise<DemandWorkerAttempt[]> {
  const root = demandWorkerAttemptsRoot(memory, changeId);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const attempts = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(root, entry.name), demandWorkerAttemptSchema)));
  return attempts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listAllDemandWorkerAttempts(memory: DemandWorkerStorePort): Promise<DemandWorkerAttempt[]> {
  const workers = await listDemandWorkers(memory);
  const nested = await Promise.all(workers.map((worker) => listDemandWorkerAttempts(memory, worker.changeId)));
  return nested.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function writeDemandWorker(memory: DemandWorkerStorePort, worker: DemandWorker): Promise<DemandWorker> {
  demandWorkerSchema.parse(worker);
  await writeJsonFile(demandWorkerPath(memory, worker.changeId), worker);
  await writeDemandWorkerQueueProjection(memory, await listDemandWorkers(memory).catch(() => []));
  return worker;
}

export async function writeDemandWorkerAttempt(memory: DemandWorkerStorePort, attempt: DemandWorkerAttempt): Promise<DemandWorkerAttempt> {
  demandWorkerAttemptSchema.parse(attempt);
  await writeJsonFile(join(demandWorkerAttemptsRoot(memory, attempt.changeId), `${attempt.id}.json`), attempt);
  return attempt;
}
