import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { shortHash } from "../fs/path.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  DemandWorker,
  DemandWorkerAttempt,
  DemandWorkerQueue,
  DemandWorkerReconcileResult,
  DemandWorkerSlot,
  DemandWorkerStatus,
  MainOrchestratorDecision,
  MainOrchestratorDecisionAction,
  ResolvedMemory,
} from "../types/index.js";

export const DEFAULT_MAX_CONCURRENT_DEMANDS = 2;
export const MIN_MAX_CONCURRENT_DEMANDS = 1;

const demandWorkerStatusSchema = z.enum(["queued", "claimed", "running", "result-ready", "needs-user-input", "failed", "completed", "released"]);
const demandWorkerAttemptStatusSchema = z.enum(["claimed", "running", "completed", "needs-user-input", "failed", "cancelled"]);
const mainOrchestratorDecisionActionSchema = z.enum(["planning", "enqueue", "coding", "validation", "audit", "bounded-rework", "result-review", "needs-user-input", "done"]);

const demandWorkerSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  status: demandWorkerStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  activeAttemptId: z.string().optional(),
  resultSummary: z.string().optional(),
  failureReason: z.string().optional(),
  waitingReason: z.string().optional(),
});

const demandWorkerAttemptSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  workerId: z.string(),
  attempt: z.number(),
  status: demandWorkerAttemptStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  agentTaskIds: z.array(z.string()),
  resultStatus: z.string().optional(),
  resultSummary: z.string().optional(),
  failureReason: z.string().optional(),
});

const decisionSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string(),
  workerId: z.string().optional(),
  attemptId: z.string().optional(),
  action: mainOrchestratorDecisionActionSchema,
  summary: z.string(),
  reason: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

export interface EnqueueDemandWorkerInput {
  changeId: string;
  waitingReason?: string;
}

export interface EnqueueDemandWorkerResult {
  worker: DemandWorker;
  resumed: boolean;
}

export interface ClaimDemandWorkerOptions {
  maxConcurrentDemands?: number;
  changeId?: string;
}

export interface ClaimDemandWorkerResult {
  worker: DemandWorker;
  attempt: DemandWorkerAttempt;
  slot: DemandWorkerSlot;
}

export type ClaimAvailableDemandWorkerOptions = ClaimDemandWorkerOptions;

export interface CompleteDemandWorkerInput {
  status: "result-ready" | "needs-user-input" | "failed" | "completed" | "released";
  resultStatus?: string;
  summary: string;
  failureReason?: string;
  agentTaskIds?: string[];
}

export async function enqueueDemandWorker(memory: ResolvedMemory, input: EnqueueDemandWorkerInput): Promise<EnqueueDemandWorkerResult> {
  const existing = await getDemandWorkerForChange(memory, input.changeId);
  if (existing && !isDemandWorkerTerminal(existing.status)) {
    return { worker: existing, resumed: true };
  }
  const now = new Date().toISOString();
  const id = `demand-worker-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${input.changeId}:${now}`)}`;
  const worker: DemandWorker = {
    version: "1.0",
    id,
    projectId: memory.projectId,
    changeId: input.changeId,
    status: "queued",
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

export async function claimNextDemandWorker(memory: ResolvedMemory, options: ClaimDemandWorkerOptions = {}): Promise<ClaimDemandWorkerResult | null> {
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
  const worker: DemandWorker = await writeDemandWorker(memory, {
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

export async function claimAvailableDemandWorkers(memory: ResolvedMemory, options: ClaimAvailableDemandWorkerOptions = {}): Promise<ClaimDemandWorkerResult[]> {
  const claimed: ClaimDemandWorkerResult[] = [];
  const maxConcurrentDemands = normalizeMaxConcurrentDemands(options.maxConcurrentDemands);
  while (true) {
    const next = await claimNextDemandWorker(memory, { ...options, maxConcurrentDemands });
    if (!next) break;
    claimed.push(next);
  }
  return claimed;
}

export async function markDemandWorkerRunning(memory: ResolvedMemory, worker: DemandWorker, attempt: DemandWorkerAttempt): Promise<{ worker: DemandWorker; attempt: DemandWorkerAttempt }> {
  const now = new Date().toISOString();
  const runningWorker = await writeDemandWorker(memory, {
    ...worker,
    status: "running",
    updatedAt: now,
    startedAt: worker.startedAt ?? now,
  });
  const runningAttempt = await writeDemandWorkerAttempt(memory, {
    ...attempt,
    status: "running",
    updatedAt: now,
    startedAt: attempt.startedAt ?? now,
  });
  return { worker: runningWorker, attempt: runningAttempt };
}

export async function completeDemandWorkerAttempt(
  memory: ResolvedMemory,
  worker: DemandWorker,
  attempt: DemandWorkerAttempt,
  input: CompleteDemandWorkerInput,
): Promise<{ worker: DemandWorker; attempt: DemandWorkerAttempt; decision: MainOrchestratorDecision }> {
  const now = new Date().toISOString();
  const attemptStatus = demandWorkerStatusToAttemptStatus(input.status);
  const completedAttempt = await writeDemandWorkerAttempt(memory, {
    ...attempt,
    status: attemptStatus,
    updatedAt: now,
    finishedAt: now,
    agentTaskIds: input.agentTaskIds ?? attempt.agentTaskIds,
    ...(input.resultStatus ? { resultStatus: input.resultStatus } : {}),
    resultSummary: input.summary,
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
  });
  const completedWorker = await writeDemandWorker(memory, {
    ...worker,
    status: input.status,
    activeAttemptId: undefined,
    updatedAt: now,
    finishedAt: now,
    resultSummary: input.summary,
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
  });
  const decision = await recordMainOrchestratorDecision(memory, {
    changeId: worker.changeId,
    workerId: worker.id,
    attemptId: attempt.id,
    action: decisionActionFromWorkerStatus(input.status),
    summary: input.summary,
    reason: input.failureReason ?? resultReasonFromWorkerStatus(input.status),
    artifactRefs: [],
  });
  return { worker: completedWorker, attempt: completedAttempt, decision };
}

export async function releaseDemandWorker(memory: ResolvedMemory, changeId: string, reason: string): Promise<DemandWorker | null> {
  const existing = await getDemandWorkerForChange(memory, changeId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const worker = await writeDemandWorker(memory, {
    ...existing,
    status: "released",
    updatedAt: now,
    finishedAt: now,
    activeAttemptId: undefined,
    resultSummary: reason,
  });
  await recordMainOrchestratorDecision(memory, {
    changeId,
    workerId: worker.id,
    action: "done",
    summary: reason,
    reason: "Demand worker was released by local orchestrator policy.",
    artifactRefs: [],
  });
  return worker;
}

export async function reconcileDemandWorkers(memory: ResolvedMemory): Promise<DemandWorkerReconcileResult> {
  return {
    workers: await listDemandWorkers(memory),
    attempts: await listAllDemandWorkerAttempts(memory),
    decisions: await listMainOrchestratorDecisions(memory),
  };
}

export async function getDemandWorkerForChange(memory: ResolvedMemory, changeId: string): Promise<DemandWorker | null> {
  const path = demandWorkerPath(memory, changeId);
  if (!existsSync(path)) return null;
  return readRequiredJsonFile(path, demandWorkerSchema);
}

export async function listDemandWorkers(memory: ResolvedMemory): Promise<DemandWorker[]> {
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

export async function listDemandWorkerAttempts(memory: ResolvedMemory, changeId: string): Promise<DemandWorkerAttempt[]> {
  const root = demandWorkerAttemptsRoot(memory, changeId);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const attempts = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(root, entry.name), demandWorkerAttemptSchema)));
  return attempts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listAllDemandWorkerAttempts(memory: ResolvedMemory): Promise<DemandWorkerAttempt[]> {
  const workers = await listDemandWorkers(memory);
  const nested = await Promise.all(workers.map((worker) => listDemandWorkerAttempts(memory, worker.changeId)));
  return nested.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getDemandWorkerSlot(memory: ResolvedMemory, maxConcurrentDemands = DEFAULT_MAX_CONCURRENT_DEMANDS): Promise<DemandWorkerSlot> {
  const normalizedMax = normalizeMaxConcurrentDemands(maxConcurrentDemands);
  const runningCount = (await listDemandWorkers(memory)).filter((worker) => isDemandWorkerRunningStatus(worker.status)).length;
  return {
    maxConcurrentDemands: normalizedMax,
    runningCount,
    available: runningCount < normalizedMax,
  };
}

export async function recordMainOrchestratorDecision(memory: ResolvedMemory, input: {
  changeId: string;
  workerId?: string;
  attemptId?: string;
  action: MainOrchestratorDecisionAction;
  summary: string;
  reason: string;
  artifactRefs?: string[];
}): Promise<MainOrchestratorDecision> {
  const decision: MainOrchestratorDecision = {
    version: "1.0",
    id: `orchestrator-decision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    projectId: memory.projectId,
    changeId: input.changeId,
    ...(input.workerId ? { workerId: input.workerId } : {}),
    ...(input.attemptId ? { attemptId: input.attemptId } : {}),
    action: input.action,
    summary: input.summary,
    reason: input.reason,
    artifactRefs: input.artifactRefs ?? [],
    createdAt: new Date().toISOString(),
  };
  decisionSchema.parse(decision);
  await mkdir(demandWorkersRoot(memory), { recursive: true });
  await appendFile(mainOrchestratorDecisionLogPath(memory), `${JSON.stringify(decision)}\n`, "utf8");
  return decision;
}

export async function listMainOrchestratorDecisions(memory: ResolvedMemory): Promise<MainOrchestratorDecision[]> {
  const path = mainOrchestratorDecisionLogPath(memory);
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => decisionSchema.parse(JSON.parse(line)));
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

function isActiveDemandWorkerAttemptStatus(status: DemandWorkerAttempt["status"]): boolean {
  return status === "claimed" || status === "running";
}

async function writeDemandWorker(memory: ResolvedMemory, worker: DemandWorker): Promise<DemandWorker> {
  demandWorkerSchema.parse(worker);
  await writeJsonFile(demandWorkerPath(memory, worker.changeId), worker);
  await writeQueueProjection(memory);
  return worker;
}

async function writeDemandWorkerAttempt(memory: ResolvedMemory, attempt: DemandWorkerAttempt): Promise<DemandWorkerAttempt> {
  demandWorkerAttemptSchema.parse(attempt);
  await writeJsonFile(join(demandWorkerAttemptsRoot(memory, attempt.changeId), `${attempt.id}.json`), attempt);
  return attempt;
}

async function writeQueueProjection(memory: ResolvedMemory): Promise<void> {
  const workers = await listDemandWorkers(memory).catch(() => []);
  const queue: DemandWorkerQueue = {
    version: "1.0",
    projectId: memory.projectId,
    maxConcurrentDemands: DEFAULT_MAX_CONCURRENT_DEMANDS,
    workers,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(join(demandWorkersRoot(memory), "queue.json"), queue);
}

function demandWorkerStatusToAttemptStatus(status: CompleteDemandWorkerInput["status"]): DemandWorkerAttempt["status"] {
  if (status === "result-ready" || status === "completed" || status === "released") return "completed";
  if (status === "needs-user-input") return "needs-user-input";
  return "failed";
}

function decisionActionFromWorkerStatus(status: CompleteDemandWorkerInput["status"]): MainOrchestratorDecisionAction {
  if (status === "result-ready") return "result-review";
  if (status === "needs-user-input" || status === "failed") return "needs-user-input";
  return "done";
}

function resultReasonFromWorkerStatus(status: CompleteDemandWorkerInput["status"]): string {
  if (status === "result-ready") return "Role pipeline produced evidence for user result review.";
  if (status === "needs-user-input") return "Role pipeline needs user input before continuing.";
  if (status === "failed") return "Role pipeline failed before result review.";
  return "Demand worker reached a terminal state.";
}

function normalizeMaxConcurrentDemands(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_CONCURRENT_DEMANDS;
  return Math.max(MIN_MAX_CONCURRENT_DEMANDS, Math.floor(value ?? DEFAULT_MAX_CONCURRENT_DEMANDS));
}

function demandWorkersRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "demand-workers");
}

function demandWorkerDir(memory: ResolvedMemory, changeId: string): string {
  return join(demandWorkersRoot(memory), changeId);
}

function demandWorkerPath(memory: ResolvedMemory, changeId: string): string {
  return join(demandWorkerDir(memory, changeId), "worker.json");
}

function demandWorkerAttemptsRoot(memory: ResolvedMemory, changeId: string): string {
  return join(demandWorkerDir(memory, changeId), "attempts");
}

function mainOrchestratorDecisionLogPath(memory: ResolvedMemory): string {
  return join(demandWorkersRoot(memory), "main-orchestrator-decisions.jsonl");
}
