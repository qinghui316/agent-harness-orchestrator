import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { AgentTask, ResolvedMemory } from "../types/index.js";
import { createAgentTask } from "./repository.js";

const WINDOW_SIZE = 5;

interface ChangeClosedOutboxEvent {
  version: "1.0";
  id: string;
  type: "change.closed";
  projectId: string | null;
  changeId: string;
  archivePath: string;
  receiptPath: string;
  occurredAt: string;
  closeSequence: number;
  advancesMaintenanceSequence?: boolean;
}

export interface CloseOutboxDispatchResult {
  closeSequence: number;
  closeoutTask?: AgentTask;
  evolutionTask?: AgentTask;
}

export async function dispatchChangeCloseOutbox(memory: ResolvedMemory): Promise<CloseOutboxDispatchResult[]> {
  const root = join(memory.harnessRoot, "outbox", "change-close");
  if (!existsSync(root)) return [];
  const events = await Promise.all((await readdir(root)).filter((name) => name.endsWith(".json"))
    .map(async (name) => ({ path: join(root, name), event: parseEvent(JSON.parse(await readFile(join(root, name), "utf8"))) })));
  events.sort((left, right) => left.event.closeSequence - right.event.closeSequence || left.event.id.localeCompare(right.event.id));
  const eligible = new Map<number, { path: string; event: ChangeClosedOutboxEvent }>();
  for (const item of events) {
    if (item.event.advancesMaintenanceSequence === false) continue;
    if (eligible.has(item.event.closeSequence)) throw new Error(`Duplicate Change close sequence ${item.event.closeSequence}.`);
    eligible.set(item.event.closeSequence, item);
  }
  const results: CloseOutboxDispatchResult[] = [];
  for (const item of events) {
    if (item.event.advancesMaintenanceSequence === false) continue;
    results.push(await dispatchEvent(memory, item.path, item.event, eligible));
  }
  return results;
}

async function dispatchEvent(memory: ResolvedMemory, outboxPath: string, event: ChangeClosedOutboxEvent, eligible: ReadonlyMap<number, { path: string; event: ChangeClosedOutboxEvent }>): Promise<CloseOutboxDispatchResult> {
  const eventRef = displayPath(memory, outboxPath);
  const identityHash = hashJson({ type: event.type, projectId: event.projectId, changeId: event.changeId, closeSequence: event.closeSequence });
  if (event.closeSequence % WINDOW_SIZE === 0) {
    return dispatchEvolutionEvent(memory, event, eligible);
  }
  const closeoutTask = await ensureTask(memory, {
    id: `agtask-closeout-${identityHash}`,
    conversationId: `maintenance:${event.changeId}`,
    changeId: event.changeId,
    roleId: `memory-maintenance-agent:${identityHash}`,
    summary: `Background maintenance assignment for Change ${event.changeId} at close sequence ${event.closeSequence}. The Maintenance Agent inspects and edits the current project Harness directly.`,
    inputArtifacts: [eventRef, event.archivePath, event.receiptPath, `close-identity-sha256:${identityHash}`],
    occurredAt: event.occurredAt,
  });
  return { closeSequence: event.closeSequence, closeoutTask };
}

async function dispatchEvolutionEvent(
  memory: ResolvedMemory,
  event: ChangeClosedOutboxEvent,
  eligible: ReadonlyMap<number, { path: string; event: ChangeClosedOutboxEvent }>,
): Promise<CloseOutboxDispatchResult> {
  const windowStart = event.closeSequence - WINDOW_SIZE + 1;
  const window = Array.from({ length: WINDOW_SIZE }, (_, index) => eligible.get(windowStart + index));
  const missing = window.map((item, index) => item ? null : windowStart + index).filter((sequence): sequence is number => sequence !== null);
  if (missing.length > 0) return { closeSequence: event.closeSequence };
  const windowItems = window as Array<{ path: string; event: ChangeClosedOutboxEvent }>;
  const windowHash = hashJson(windowItems.map((item) => ({
    id: item.event.id,
    changeId: item.event.changeId,
    closeSequence: item.event.closeSequence,
    archivePath: item.event.archivePath,
    receiptPath: item.event.receiptPath,
  })));
  const evolutionTask = await ensureTask(memory, {
    id: `agtask-evolution-${windowHash}`,
    conversationId: `evolution:${windowStart}-${event.closeSequence}`,
    changeId: `evolution-window-${windowStart}-${event.closeSequence}`,
    roleId: `harness-evolution-agent:${windowHash}`,
    summary: `Harness evolution assignment for fixed five-close sequence window ${windowStart}-${event.closeSequence}. Evolution covers the fifth closeout, proposes first, and edits the current project Harness only after native scoring succeeds.`,
    inputArtifacts: [
      ...windowItems.flatMap((item) => [displayPath(memory, item.path), item.event.archivePath, item.event.receiptPath]),
      `close-window:${windowStart}-${event.closeSequence}`,
      `window-sha256:${windowHash}`,
    ],
    occurredAt: event.occurredAt,
  });
  return { closeSequence: event.closeSequence, evolutionTask };
}

async function ensureTask(memory: ResolvedMemory, input: {
  id: string; conversationId: string; changeId: string; roleId: string; summary: string; inputArtifacts: string[]; occurredAt: string;
}): Promise<AgentTask> {
  return createAgentTask(memory, {
    taskId: input.id,
    conversationId: input.conversationId,
    changeId: input.changeId,
    roleId: input.roleId,
    kind: "background",
    summary: input.summary,
    inputArtifacts: input.inputArtifacts,
    createdBy: "maintenance-policy",
    idempotencyKey: input.id,
    maxAttempts: 3,
  });
}

function parseEvent(value: unknown): ChangeClosedOutboxEvent {
  const event = value as Partial<ChangeClosedOutboxEvent>;
  if (event.version !== "1.0" || event.type !== "change.closed" || typeof event.id !== "string"
    || typeof event.changeId !== "string" || typeof event.archivePath !== "string" || typeof event.receiptPath !== "string"
    || typeof event.occurredAt !== "string" || !Number.isSafeInteger(event.closeSequence)
    || (event.advancesMaintenanceSequence === false ? event.closeSequence !== 0 : (event.closeSequence ?? 0) < 1)) {
    throw new Error("Invalid Change close outbox event.");
  }
  return event as ChangeClosedOutboxEvent;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function displayPath(memory: ResolvedMemory, path: string): string {
  return relative(memory.memoryRoot, path).replace(/\\/g, "/");
}
