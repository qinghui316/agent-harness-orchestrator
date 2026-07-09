import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { agentTaskRoot } from "../agent-task/paths.js";
import { readRequiredJsonFile } from "../fs/json.js";
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

