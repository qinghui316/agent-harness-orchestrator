import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  AgentTask,
  AgentTaskCheckpoint,
  AgentTaskCreatedBy,
  AgentTaskFailureDisposition,
  AgentTaskKind,
  AgentTaskResult,
  AgentTaskStatus,
  ResolvedMemory,
} from "../types/index.js";
import { resultSchema, taskSchema } from "./schemas.js";
import { taskPath, taskResultPath, tasksRoot } from "./paths.js";

const DEFAULT_LEASE_MS = 30_000;
const TERMINAL_STATUSES = new Set<AgentTaskStatus>(["completed", "blocked", "failed", "needs-user-input", "cancelled"]);

export interface CreateAgentTaskInput {
  taskId?: string;
  conversationId: string;
  changeId: string;
  roleId: string;
  kind: AgentTaskKind;
  summary: string;
  inputArtifacts?: string[];
  parentTaskId?: string;
  createdBy?: AgentTaskCreatedBy;
  initialStatus?: Extract<AgentTaskStatus, "queued" | "running">;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export interface AgentTaskLeaseInput {
  owner?: string;
  leaseDurationMs?: number;
  now?: string;
}

export interface AgentTaskWriterIdentity {
  claimToken: string;
  fencingToken: number;
}

export async function claimNextMaintenanceAgentTask(
  memory: ResolvedMemory,
  input: AgentTaskLeaseInput = {},
): Promise<AgentTask | null> {
  const existing = (await listAgentTasks(memory))
    .some((task) => task.kind === "background" && task.createdBy === "maintenance-policy"
      && (task.status === "queued" || task.status === "claimed" || task.status === "running"));
  if (!existing) return null;
  return withTaskMutex(memory, "__maintenance-queue__", async () => {
    const tasks = (await listAgentTasks(memory))
      .filter((task) => task.kind === "background" && task.createdBy === "maintenance-policy");
    if (tasks.some((task) => task.status === "running" || task.status === "claimed")) return null;
    const next = tasks.find((task) => task.status === "queued");
    return next ? await claimAgentTask(memory, next, input) : null;
  });
}

export interface CompleteAgentTaskInput {
  status: AgentTaskStatus;
  summary: string;
  artifactRefs?: string[];
  policyAuditRefs?: string[];
  boundaryAuditRefs?: string[];
  boundaryViolations?: AgentTaskResult["boundaryViolations"];
  nextRecommendation?: string;
  failureClassification?: string;
  failureDisposition?: AgentTaskFailureDisposition;
  requiresUserInputReason?: string;
  writer?: AgentTaskWriterIdentity;
}

export async function createAgentTask(memory: ResolvedMemory, input: CreateAgentTaskInput): Promise<AgentTask> {
  if (input.maxAttempts !== undefined && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1)) {
    throw new Error("AgentTask maxAttempts must be a positive integer.");
  }
  if (input.idempotencyKey) return withTaskMutex(memory, "__idempotent-create__", async () => createAgentTaskUnlocked(memory, input));
  return createAgentTaskUnlocked(memory, input);
}

async function createAgentTaskUnlocked(memory: ResolvedMemory, input: CreateAgentTaskInput): Promise<AgentTask> {
  if (input.idempotencyKey) {
    const existing = (await listAgentTasks(memory)).find((task) => task.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
  }
  const now = new Date().toISOString();
  const initialStatus = input.initialStatus ?? "queued";
  const task: AgentTask = {
    version: "1.0",
    id: input.taskId ? assertTaskId(input.taskId) : buildTaskId(input.changeId, input.roleId),
    projectId: memory.projectId,
    conversationId: input.conversationId,
    changeId: input.changeId,
    roleId: input.roleId,
    kind: input.kind,
    status: initialStatus,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    attempt: initialStatus === "running" ? 1 : 0,
    maxAttempts: input.maxAttempts ?? 3,
    lease: null,
    checkpoint: null,
    inputArtifacts: input.inputArtifacts ?? [],
    outputArtifacts: [],
    ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
    createdBy: input.createdBy ?? (input.kind === "background" ? "maintenance-policy" : "main-agent-policy"),
    summary: input.summary,
    createdAt: now,
    updatedAt: now,
    startedAt: initialStatus === "running" ? now : null,
    finishedAt: null,
  };
  await writeTask(memory, task);
  return task;
}

export async function claimAgentTask(memory: ResolvedMemory, task: AgentTask, input: AgentTaskLeaseInput = {}): Promise<AgentTask> {
  return withTaskMutex(memory, task.id, async () => {
    let current = await readCurrentTask(memory, task.id);
    const committedResult = await readAgentTaskResult(memory, task.id);
    if (committedResult) {
      current = await convergeCommittedResult(memory, current, committedResult);
      throw new Error(`AgentTask ${task.id} already has a terminal result and cannot be claimed.`);
    }
    if (TERMINAL_STATUSES.has(current.status)) throw new Error(`AgentTask ${task.id} is terminal and cannot be claimed.`);
    const now = input.now ?? new Date().toISOString();
    const claimPath = taskClaimPath(memory, task.id);
    const existingClaim = await readClaimFile(claimPath);
    if (existingClaim && Date.parse(existingClaim.expiresAt) > Date.parse(now)) {
      throw new Error(`AgentTask ${task.id} is already claimed by ${existingClaim.owner}.`);
    }
    if (existingClaim) await unlink(claimPath).catch(ignoreMissing);
    const attempt = current.attempt ?? 0;
    const maxAttempts = current.maxAttempts ?? 3;
    if (attempt >= maxAttempts) throw new Error(`AgentTask ${task.id} exhausted ${maxAttempts} attempts.`);
    const fencingToken = await nextFencingToken(memory, task.id);
    const lease = {
      owner: input.owner?.trim() || `process-${process.pid}`,
      claimToken: randomUUID(),
      fencingToken,
      heartbeatAt: now,
      expiresAt: new Date(Date.parse(now) + normalizeLeaseMs(input.leaseDurationMs)).toISOString(),
    };
    const handle = await open(claimPath, "wx");
    try { await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, "utf8"); } finally { await handle.close(); }
    const claimed: AgentTask = { ...current, status: "claimed", attempt: attempt + 1, maxAttempts, lease, updatedAt: now, finishedAt: null };
    await writeTask(memory, claimed);
    return claimed;
  });
}

export async function startAgentTask(memory: ResolvedMemory, task: AgentTask, writer?: AgentTaskWriterIdentity): Promise<AgentTask> {
  return withTaskMutex(memory, task.id, async () => {
    const current = await assertCurrentWriter(memory, task, writer);
    const now = new Date().toISOString();
    const running: AgentTask = { ...current, status: "running", updatedAt: now, startedAt: current.startedAt ?? now };
    await writeTask(memory, running);
    return running;
  });
}

export async function heartbeatAgentTask(memory: ResolvedMemory, task: AgentTask, writer: AgentTaskWriterIdentity, leaseDurationMs = DEFAULT_LEASE_MS, now = new Date().toISOString()): Promise<AgentTask> {
  return withTaskMutex(memory, task.id, async () => {
    const current = await assertCurrentWriter(memory, task, writer, now);
    const lease = { ...current.lease!, heartbeatAt: now, expiresAt: new Date(Date.parse(now) + normalizeLeaseMs(leaseDurationMs)).toISOString() };
    await writeJsonFile(taskClaimPath(memory, task.id), lease);
    const updated = { ...current, lease, updatedAt: now };
    await writeTask(memory, updated);
    return updated;
  });
}

export async function checkpointAgentTask(memory: ResolvedMemory, task: AgentTask, writer: AgentTaskWriterIdentity, input: Omit<AgentTaskCheckpoint, "sequence" | "createdAt"> & { createdAt?: string }): Promise<AgentTask> {
  return withTaskMutex(memory, task.id, async () => {
    const current = await assertCurrentWriter(memory, task, writer);
    const createdAt = input.createdAt ?? new Date().toISOString();
    const checkpoint: AgentTaskCheckpoint = { sequence: (current.checkpoint?.sequence ?? 0) + 1, summary: input.summary, artifactRefs: input.artifactRefs, createdAt };
    const updated = { ...current, checkpoint, updatedAt: createdAt };
    await writeTask(memory, updated);
    return updated;
  });
}

export async function failAgentTask(memory: ResolvedMemory, task: AgentTask, input: Omit<CompleteAgentTaskInput, "status"> & { retryable: boolean }): Promise<AgentTask | AgentTaskResult> {
  return withTaskMutex(memory, task.id, async () => {
    const current = await assertCurrentWriter(memory, task, input.writer);
    const now = new Date().toISOString();
    if (!input.retryable || (current.attempt ?? 0) >= (current.maxAttempts ?? 3)) {
      return writeTerminalResult(memory, current, { ...input, status: "failed", failureDisposition: "terminal" }, now);
    }
    await releaseClaim(memory, current.id);
    const queued: AgentTask = { ...current, status: "queued", lease: null, failureDisposition: "retryable", summary: input.summary, updatedAt: now, finishedAt: null };
    await writeTask(memory, queued);
    return queued;
  });
}

export async function recoverExpiredAgentTasks(memory: ResolvedMemory, now = new Date().toISOString()): Promise<AgentTask[]> {
  const recovered: AgentTask[] = [];
  for (const task of await listAgentTasks(memory)) {
    if (!task.lease || Date.parse(task.lease.expiresAt) > Date.parse(now) || TERMINAL_STATUSES.has(task.status)) continue;
    const updated = await withTaskMutex(memory, task.id, async () => {
      const current = await readCurrentTask(memory, task.id);
      if (!current.lease || Date.parse(current.lease.expiresAt) > Date.parse(now) || TERMINAL_STATUSES.has(current.status)) return null;
      await releaseClaim(memory, current.id);
      const exhausted = (current.attempt ?? 0) >= (current.maxAttempts ?? 3);
      const next: AgentTask = { ...current, status: exhausted ? "failed" : "queued", lease: null, failureDisposition: exhausted ? "terminal" : "retryable", updatedAt: now, finishedAt: exhausted ? now : null };
      if (exhausted) {
        await writeTerminalResult(memory, next, { status: "failed", summary: "AgentTask lease expired after the final attempt.", failureDisposition: "terminal" }, now);
      } else await writeTask(memory, next);
      return next;
    });
    if (updated) recovered.push(updated);
  }
  return recovered;
}

export async function completeAgentTask(memory: ResolvedMemory, task: AgentTask, input: CompleteAgentTaskInput): Promise<AgentTaskResult> {
  if (!TERMINAL_STATUSES.has(input.status)) throw new Error(`AgentTask terminal result cannot use status ${input.status}.`);
  return withTaskMutex(memory, task.id, async () => {
    const existing = await readAgentTaskResult(memory, task.id);
    if (existing) return existing;
    const current = await assertCurrentWriter(memory, task, input.writer);
    return writeTerminalResult(memory, current, input, new Date().toISOString());
  });
}

export async function listAgentTasks(memory: ResolvedMemory, changeId?: string): Promise<AgentTask[]> {
  const root = tasksRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const tasks: AgentTask[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let task = await readJsonFile(taskPath(memory, entry.name), taskSchema, null as unknown as AgentTask).catch(() => null);
    const result = await readAgentTaskResult(memory, entry.name);
    if (task && result && !TERMINAL_STATUSES.has(task.status)) task = await convergeCommittedResult(memory, task, result);
    if (task && (!changeId || task.changeId === changeId)) tasks.push(task);
  }
  return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readAgentTaskResult(memory: ResolvedMemory, taskId: string): Promise<AgentTaskResult | null> {
  if (!existsSync(taskResultPath(memory, taskId))) return null;
  return readJsonFile(taskResultPath(memory, taskId), resultSchema, null as unknown as AgentTaskResult).catch(() => null);
}

export function writeTask(memory: ResolvedMemory, task: AgentTask): Promise<void> {
  taskSchema.parse(task);
  return writeJsonFile(taskPath(memory, task.id), task);
}

async function writeTerminalResult(memory: ResolvedMemory, task: AgentTask, input: CompleteAgentTaskInput, now: string): Promise<AgentTaskResult> {
  const result: AgentTaskResult = {
    version: "1.0", taskId: task.id, roleId: task.roleId, status: input.status, summary: input.summary,
    artifactRefs: input.artifactRefs ?? [], attempt: task.attempt ?? 1,
    ...(task.lease ? { claimToken: task.lease.claimToken, fencingToken: task.lease.fencingToken } : {}),
    ...(input.failureDisposition ? { failureDisposition: input.failureDisposition } : {}),
    ...(input.policyAuditRefs?.length ? { policyAuditRefs: input.policyAuditRefs } : {}),
    ...(input.boundaryAuditRefs?.length ? { boundaryAuditRefs: input.boundaryAuditRefs } : {}),
    ...(input.boundaryViolations?.length ? { boundaryViolations: input.boundaryViolations } : {}),
    ...(input.nextRecommendation ? { nextRecommendation: input.nextRecommendation } : {}),
    ...(input.failureClassification ? { failureClassification: input.failureClassification } : {}),
    ...(input.requiresUserInputReason ? { requiresUserInputReason: input.requiresUserInputReason } : {}), createdAt: now,
  };
  resultSchema.parse(result);
  await writeJsonFile(taskResultPath(memory, task.id), result);
  await releaseClaim(memory, task.id);
  await writeTask(memory, { ...task, status: input.status, outputArtifacts: result.artifactRefs, summary: input.summary, lease: null, failureDisposition: input.failureDisposition, updatedAt: now, finishedAt: now });
  return result;
}

async function convergeCommittedResult(memory: ResolvedMemory, task: AgentTask, result: AgentTaskResult): Promise<AgentTask> {
  const completed: AgentTask = {
    ...task,
    status: result.status,
    outputArtifacts: result.artifactRefs,
    summary: result.summary,
    lease: null,
    failureDisposition: result.failureDisposition,
    updatedAt: result.createdAt,
    finishedAt: result.createdAt,
  };
  await releaseClaim(memory, task.id);
  await writeTask(memory, completed);
  return completed;
}

async function assertCurrentWriter(memory: ResolvedMemory, task: AgentTask, writer?: AgentTaskWriterIdentity, now = new Date().toISOString()): Promise<AgentTask> {
  const current = await readCurrentTask(memory, task.id);
  if (TERMINAL_STATUSES.has(current.status)) throw new Error(`AgentTask ${task.id} is terminal; stale writer rejected.`);
  if (!current.lease) {
    if (writer) throw new Error(`AgentTask ${task.id} has no active lease; stale writer rejected.`);
    return current;
  }
  const identity = writer ?? task.lease;
  if (!identity || identity.claimToken !== current.lease.claimToken || identity.fencingToken !== current.lease.fencingToken) {
    throw new Error(`AgentTask ${task.id} fencing mismatch; stale writer rejected.`);
  }
  if (Date.parse(current.lease.expiresAt) <= Date.parse(now)) throw new Error(`AgentTask ${task.id} lease expired; stale writer rejected.`);
  return current;
}

async function readCurrentTask(memory: ResolvedMemory, taskId: string): Promise<AgentTask> {
  const task = await readJsonFile(taskPath(memory, taskId), taskSchema, null as unknown as AgentTask);
  if (!task) throw new Error(`AgentTask ${taskId} does not exist.`);
  return task;
}

async function withTaskMutex<T>(memory: ResolvedMemory, taskId: string, action: () => Promise<T>): Promise<T> {
  const lockPath = join(dirname(taskPath(memory, taskId)), "lifecycle.lock");
  await mkdir(dirname(lockPath), { recursive: true });
  let handle;
  for (let attempt = 0; ; attempt += 1) {
    try { handle = await open(lockPath, "wx"); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 100) throw error;
      const ageMs = Date.now() - await stat(lockPath).then((value) => value.mtimeMs).catch(() => Date.now());
      if (ageMs > 5_000) await unlink(lockPath).catch(ignoreMissing);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  try { return await action(); } finally { await handle.close(); await unlink(lockPath).catch(ignoreMissing); }
}

async function nextFencingToken(memory: ResolvedMemory, taskId: string): Promise<number> {
  const path = join(dirname(taskPath(memory, taskId)), "fencing-counter");
  const previous = Number.parseInt(await readFile(path, "utf8").catch(() => "0"), 10) || 0;
  const next = previous + 1;
  await writeFile(path, `${next}\n`, "utf8");
  return next;
}

async function readClaimFile(path: string): Promise<AgentTask["lease"]> {
  try { return JSON.parse(await readFile(path, "utf8")) as NonNullable<AgentTask["lease"]>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

async function releaseClaim(memory: ResolvedMemory, taskId: string): Promise<void> {
  await unlink(taskClaimPath(memory, taskId)).catch(ignoreMissing);
}

function taskClaimPath(memory: ResolvedMemory, taskId: string): string { return join(dirname(taskPath(memory, taskId)), "claim.json"); }
function normalizeLeaseMs(value?: number): number { return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : DEFAULT_LEASE_MS; }
function ignoreMissing(error: unknown): void { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

function buildTaskId(changeId: string, roleId: string): string {
  const safeChange = changeId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48);
  const safeRole = roleId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `agtask-${Date.now()}-${safeRole}-${safeChange}-${Math.random().toString(16).slice(2, 8)}`;
}

function assertTaskId(value: string): string {
  if (!/^agtask-[a-zA-Z0-9._-]{8,180}$/.test(value)) throw new Error("AgentTask taskId is invalid.");
  return value;
}
