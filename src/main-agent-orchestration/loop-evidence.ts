import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { agentTaskRoot } from "../agent-task/paths.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { shortHash, slugify } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";

export type MainAgentLoopEntrypoint = "top-level" | "task-run" | "task-queue" | "source-refresh-rework" | "feedback-rework";

export type MainAgentLoopRunStatus = "running" | "completed" | "stopped";

export type MainAgentLoopEventType =
  | "loop.started"
  | "observation.recorded"
  | "decision.recorded"
  | "leaf.started"
  | "leaf.completed"
  | "loop.completed"
  | "loop.stopped";

export interface MainAgentLoopRun {
  version: "1.0";
  id: string;
  changeId: string;
  projectId: string | null;
  entrypoint: MainAgentLoopEntrypoint;
  status: MainAgentLoopRunStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface MainAgentLoopEvent {
  version: "1.0";
  id: string;
  loopRunId: string;
  changeId: string;
  type: MainAgentLoopEventType;
  timestamp: string;
  stepIndex?: number;
  entrypoint?: MainAgentLoopEntrypoint;
  roleId?: string;
  attemptKind?: "initial" | "rework" | "follow-up";
  decisionKind?: string;
  decisionEvidenceId?: string;
  decisionEvidenceRef?: string;
  status?: string;
  stoppedAt?: "boundary" | "code" | "validation" | "audit" | null;
  reason?: string;
  summary: string;
  artifactRefs: string[];
  refs: {
    agentTaskIds: string[];
    runIds: string[];
    validationIds: string[];
    auditIds: string[];
    taskQueueRunIds: string[];
    taskQueueItemIds: string[];
    taskRunIds: string[];
    workflowRunIds: string[];
  };
}

export interface EnsureMainAgentLoopRunInput {
  loopRunId?: string;
  changeId: string;
  projectId: string | null;
  entrypoint: MainAgentLoopEntrypoint;
}

export interface MainAgentLoopEventInput {
  type: MainAgentLoopEventType;
  stepIndex?: number;
  entrypoint?: MainAgentLoopEntrypoint;
  roleId?: string;
  attemptKind?: "initial" | "rework" | "follow-up";
  decisionKind?: string;
  decisionEvidenceId?: string;
  decisionEvidenceRef?: string;
  status?: string;
  stoppedAt?: "boundary" | "code" | "validation" | "audit" | null;
  reason?: string;
  summary: string;
  artifactRefs?: string[];
  refs?: Partial<MainAgentLoopEvent["refs"]>;
}

const mainAgentLoopEntrypointSchema = z.enum(["top-level", "task-run", "task-queue", "source-refresh-rework", "feedback-rework"]);

const mainAgentLoopRunSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  projectId: z.string().nullable(),
  entrypoint: mainAgentLoopEntrypointSchema,
  status: z.enum(["running", "completed", "stopped"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});

const refsSchema = z.object({
  agentTaskIds: z.array(z.string()),
  runIds: z.array(z.string()),
  validationIds: z.array(z.string()),
  auditIds: z.array(z.string()),
  taskQueueRunIds: z.array(z.string()).optional().default([]),
  taskQueueItemIds: z.array(z.string()).optional().default([]),
  taskRunIds: z.array(z.string()).optional().default([]),
  workflowRunIds: z.array(z.string()).optional().default([]),
});

const mainAgentLoopEventSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  loopRunId: z.string(),
  changeId: z.string(),
  type: z.enum([
    "loop.started",
    "observation.recorded",
    "decision.recorded",
    "leaf.started",
    "leaf.completed",
    "loop.completed",
    "loop.stopped",
  ]),
  timestamp: z.string(),
  stepIndex: z.number().optional(),
  entrypoint: mainAgentLoopEntrypointSchema.optional(),
  roleId: z.string().optional(),
  attemptKind: z.enum(["initial", "rework", "follow-up"]).optional(),
  decisionKind: z.string().optional(),
  decisionEvidenceId: z.string().optional(),
  decisionEvidenceRef: z.string().optional(),
  status: z.string().optional(),
  stoppedAt: z.enum(["boundary", "code", "validation", "audit"]).nullable().optional(),
  reason: z.string().optional(),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  refs: refsSchema,
});

export function createMainAgentLoopRunId(changeId: string): string {
  const now = new Date().toISOString();
  return `loop-${slugify(changeId).slice(0, 48)}-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${changeId}:${now}:${Math.random()}`).slice(0, 8)}`;
}

export function mainAgentLoopRunsRoot(memory: ResolvedMemory): string {
  return join(agentTaskRoot(memory), "main-agent-loop-runs");
}

export function mainAgentLoopRunRoot(memory: ResolvedMemory, loopRunId: string): string {
  return join(mainAgentLoopRunsRoot(memory), loopRunId);
}

export function mainAgentLoopRunPath(memory: ResolvedMemory, loopRunId: string): string {
  return join(mainAgentLoopRunRoot(memory, loopRunId), "loop.json");
}

export function mainAgentLoopEventsPath(memory: ResolvedMemory, loopRunId: string): string {
  return join(mainAgentLoopRunRoot(memory, loopRunId), "events.jsonl");
}

export async function ensureMainAgentLoopRun(
  memory: ResolvedMemory,
  input: EnsureMainAgentLoopRunInput,
): Promise<{ run: MainAgentLoopRun; created: boolean }> {
  const loopRunId = input.loopRunId ?? createMainAgentLoopRunId(input.changeId);
  const path = mainAgentLoopRunPath(memory, loopRunId);
  if (existsSync(path)) {
    try {
      const existing = await readRequiredJsonFile(path, mainAgentLoopRunSchema);
      return { run: existing, created: false };
    } catch {
      // Malformed loop metadata is non-authoritative evidence. Recreate the
      // run envelope so orchestration can continue and future recovery can
      // inspect subsequent valid events.
    }
  }

  const now = new Date().toISOString();
  const run: MainAgentLoopRun = {
    version: "1.0",
    id: loopRunId,
    changeId: input.changeId,
    projectId: input.projectId,
    entrypoint: input.entrypoint,
    status: "running",
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  await writeJsonFile(path, run);
  return { run, created: true };
}

export async function appendMainAgentLoopEvent(
  memory: ResolvedMemory,
  run: MainAgentLoopRun,
  input: MainAgentLoopEventInput,
): Promise<MainAgentLoopEvent> {
  const now = new Date().toISOString();
  const event: MainAgentLoopEvent = {
    version: "1.0",
    id: `loop-event-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${input.type}:${now}:${Math.random()}`).slice(0, 8)}`,
    loopRunId: run.id,
    changeId: run.changeId,
    type: input.type,
    timestamp: now,
    ...definedOptionalFields(input),
    summary: truncateSummary(input.summary),
    artifactRefs: dedupeStrings(input.artifactRefs ?? []),
    refs: {
      agentTaskIds: dedupeStrings(input.refs?.agentTaskIds ?? []),
      runIds: dedupeStrings(input.refs?.runIds ?? []),
      validationIds: dedupeStrings(input.refs?.validationIds ?? []),
      auditIds: dedupeStrings(input.refs?.auditIds ?? []),
      taskQueueRunIds: dedupeStrings(input.refs?.taskQueueRunIds ?? []),
      taskQueueItemIds: dedupeStrings(input.refs?.taskQueueItemIds ?? []),
      taskRunIds: dedupeStrings(input.refs?.taskRunIds ?? []),
      workflowRunIds: dedupeStrings(input.refs?.workflowRunIds ?? []),
    },
  };
  const path = mainAgentLoopEventsPath(memory, run.id);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function finishMainAgentLoopRun(
  memory: ResolvedMemory,
  loopRunId: string,
  input: {
    status: Exclude<MainAgentLoopRunStatus, "running">;
    summary: string;
    stoppedAt?: "boundary" | "code" | "validation" | "audit" | null;
    artifactRefs?: string[];
    refs?: Partial<MainAgentLoopEvent["refs"]>;
  },
): Promise<void> {
  const existing = await readMainAgentLoopRun(memory, loopRunId);
  if (!existing || existing.status !== "running") return;

  const now = new Date().toISOString();
  const finished: MainAgentLoopRun = {
    ...existing,
    status: input.status,
    updatedAt: now,
    finishedAt: now,
  };
  await writeJsonFile(mainAgentLoopRunPath(memory, loopRunId), finished);
  await appendMainAgentLoopEvent(memory, finished, {
    type: input.status === "completed" ? "loop.completed" : "loop.stopped",
    status: input.status,
    stoppedAt: input.stoppedAt,
    summary: input.summary,
    artifactRefs: input.artifactRefs,
    refs: input.refs,
  });
}

export async function readMainAgentLoopRun(memory: ResolvedMemory, loopRunId: string): Promise<MainAgentLoopRun | null> {
  const path = mainAgentLoopRunPath(memory, loopRunId);
  try {
    if (!existsSync(path)) return null;
    return await readRequiredJsonFile(path, mainAgentLoopRunSchema);
  } catch {
    return null;
  }
}

export async function readMainAgentLoopEvents(memory: ResolvedMemory, loopRunId: string): Promise<MainAgentLoopEvent[]> {
  const path = mainAgentLoopEventsPath(memory, loopRunId);
  try {
    if (!existsSync(path)) return [];
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    const events: MainAgentLoopEvent[] = [];
    for (const line of lines) {
      const parsed = mainAgentLoopEventSchema.safeParse(JSON.parse(line));
      if (!parsed.success) return [];
      events.push(parsed.data);
    }
    return events;
  } catch {
    return [];
  }
}

function definedOptionalFields(input: MainAgentLoopEventInput): Partial<MainAgentLoopEvent> {
  const value: Partial<MainAgentLoopEvent> = {};
  if (input.stepIndex !== undefined) value.stepIndex = input.stepIndex;
  if (input.entrypoint !== undefined) value.entrypoint = input.entrypoint;
  if (input.roleId !== undefined) value.roleId = input.roleId;
  if (input.attemptKind !== undefined) value.attemptKind = input.attemptKind;
  if (input.decisionKind !== undefined) value.decisionKind = input.decisionKind;
  if (input.decisionEvidenceId !== undefined) value.decisionEvidenceId = input.decisionEvidenceId;
  if (input.decisionEvidenceRef !== undefined) value.decisionEvidenceRef = input.decisionEvidenceRef;
  if (input.status !== undefined) value.status = input.status;
  if (input.stoppedAt !== undefined) value.stoppedAt = input.stoppedAt;
  if (input.reason !== undefined) value.reason = truncateSummary(input.reason);
  return value;
}

function truncateSummary(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 500 ? `${normalized.slice(0, 497)}...` : normalized;
}

function dedupeStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = `${value}`.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
