import { shortHash } from "../fs/path.js";
import type { DemandWorkerAttempt } from "../types/index.js";
import type { DemandWorkerStorePort } from "./paths.js";
import type { ClaimAvailableDemandWorkerOptions, ClaimDemandWorkerOptions, EnqueueDemandWorkerInput, EnqueueDemandWorkerResult } from "./types.js";
import { recordMainOrchestratorDecision } from "./decisions.js";
import { getDemandWorkerForChange, listDemandWorkerAttempts, listDemandWorkers, writeDemandWorker, writeDemandWorkerAttempt } from "./repository.js";
import { getDemandWorkerSlot, isActiveDemandWorkerAttemptStatus, isDemandWorkerTerminal, normalizeMaxConcurrentDemands } from "./slot-policy.js";

export interface ClaimDemandWorkerResult {
  worker: Awaited<ReturnType<typeof writeDemandWorker>>;
  attempt: DemandWorkerAttempt;
  slot: Awaited<ReturnType<typeof getDemandWorkerSlot>>;
}

export async function enqueueDemandWorker(memory: DemandWorkerStorePort, input: EnqueueDemandWorkerInput): Promise<EnqueueDemandWorkerResult> {
  const existing = await getDemandWorkerForChange(memory, input.changeId);
  if (existing && !isDemandWorkerTerminal(existing.status)) {
    return { worker: existing, resumed: true };
  }
  const now = new Date().toISOString();
  const id = `demand-worker-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${input.changeId}:${now}`)}`;
  const worker = {
    version: "1.0" as const,
    id,
    projectId: memory.projectId,
    changeId: input.changeId,
    status: "queued" as const,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    ...(input.waitingReason ? { waitingReason: input.waitingReason } : {}),
  };
  await writeDemandWorker(memory, worker);
  await recordMainOrchestratorDecision(memory, {
    changeId: input.changeId,
    workerId: worker.id,
    action: "enqueue",
    summary: "Demand conversation enqueued for local role execution.",
    reason: "The user confirmed execution; AHO must delegate work through the demand worker queue before running role agents.",
    artifactRefs: [],
  });
  return { worker, resumed: false };
}

export async function claimNextDemandWorker(memory: DemandWorkerStorePort, options: ClaimDemandWorkerOptions = {}): Promise<ClaimDemandWorkerResult | null> {
  const maxConcurrentDemands = normalizeMaxConcurrentDemands(options.maxConcurrentDemands);
  const slot = await getDemandWorkerSlot(memory, maxConcurrentDemands);
  if (!slot.available) return null;
  const queued = (await listDemandWorkers(memory))
    .filter((worker) => worker.status === "queued" && (!options.changeId || worker.changeId === options.changeId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!queued) return null;
  const attempts = await listDemandWorkerAttempts(memory, queued.changeId);
  if (attempts.some((attempt) => attempt.workerId === queued.id && isActiveDemandWorkerAttemptStatus(attempt.status))) {
    throw new Error(`Demand worker already has an active attempt: ${queued.id}.`);
  }
  const now = new Date().toISOString();
  const attemptNumber = attempts.filter((attempt) => attempt.workerId === queued.id).length + 1;
  const attempt: DemandWorkerAttempt = {
    version: "1.0",
    id: `${queued.id}-attempt-${String(attemptNumber).padStart(3, "0")}`,
    projectId: memory.projectId,
    changeId: queued.changeId,
    workerId: queued.id,
    attempt: attemptNumber,
    status: "claimed",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    agentTaskIds: [],
  };
  const worker = await writeDemandWorker(memory, {
    ...queued,
    status: "claimed",
    activeAttemptId: attempt.id,
    updatedAt: now,
    startedAt: queued.startedAt ?? now,
    finishedAt: null,
  });
  await writeDemandWorkerAttempt(memory, attempt);
  await recordMainOrchestratorDecision(memory, {
    changeId: worker.changeId,
    workerId: worker.id,
    attemptId: attempt.id,
    action: "coding",
    summary: "MainOrchestrator claimed a demand worker slot.",
    reason: `Running demand slots: ${slot.runningCount}/${slot.maxConcurrentDemands}.`,
    artifactRefs: [],
  });
  return { worker, attempt, slot };
}

export async function claimAvailableDemandWorkers(memory: DemandWorkerStorePort, options: ClaimAvailableDemandWorkerOptions = {}): Promise<ClaimDemandWorkerResult[]> {
  const claimed: ClaimDemandWorkerResult[] = [];
  const maxConcurrentDemands = normalizeMaxConcurrentDemands(options.maxConcurrentDemands);
  while (true) {
    const next = await claimNextDemandWorker(memory, { ...options, maxConcurrentDemands });
    if (!next) break;
    claimed.push(next);
  }
  return claimed;
}
