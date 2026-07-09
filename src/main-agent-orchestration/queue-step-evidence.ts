import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { mainAgentLoopRunRoot, type MainAgentLoopRun } from "./loop-evidence.js";

export type MainAgentQueueDecisionAuthority = "non-executing-main-agent-queue-step-evidence";
export type MainAgentQueueDecisionKind = "run-next-item" | "pause" | "complete" | "block" | "fail";

export interface MainAgentQueueDecisionRefs {
  taskQueueRunIds: string[];
  taskQueueItemIds: string[];
  taskRunIds: string[];
  workflowRunIds: string[];
  runIds: string[];
  validationIds: string[];
  auditIds: string[];
}

export interface MainAgentQueueObservationSummary {
  queueRunId: string;
  workflowRunId: string | null;
  taskQueueProposalId: string | null;
  workflowGraphPlanId: string | null;
  readinessManifestId: string | null;
  decompositionPlanId: string | null;
  queueStatus: string;
  workflowStatus: string | null;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  blockedCount: number;
  currentTaskId: string | null;
  nextItemId: string | null;
  nextTaskId: string | null;
}

export interface MainAgentQueueDecisionEvidence {
  version: "1.0";
  authority: MainAgentQueueDecisionAuthority;
  executionStarted: false;
  id: string;
  ref: string;
  loopRunId: string;
  changeId: string;
  projectId: string | null;
  queueStepIndex: number;
  createdAt: string;
  observation: MainAgentQueueObservationSummary;
  decision: {
    kind: MainAgentQueueDecisionKind;
    reason: string;
    selectedItemId: string | null;
    taskId: string | null;
    expectedQueueStatus: string;
  };
  artifactRefs: string[];
  refs: MainAgentQueueDecisionRefs;
}

export interface RecordMainAgentQueueDecisionEvidenceInput {
  queueStepIndex: number;
  observation: MainAgentQueueObservationSummary;
  decision: {
    kind: MainAgentQueueDecisionKind;
    reason: string;
    selectedItemId?: string | null;
    taskId?: string | null;
    expectedQueueStatus: string;
  };
  artifactRefs?: string[];
  refs?: Partial<MainAgentQueueDecisionRefs>;
}

const refsSchema = z.object({
  taskQueueRunIds: z.array(z.string()),
  taskQueueItemIds: z.array(z.string()),
  taskRunIds: z.array(z.string()),
  workflowRunIds: z.array(z.string()),
  runIds: z.array(z.string()),
  validationIds: z.array(z.string()),
  auditIds: z.array(z.string()),
});

const observationSchema = z.object({
  queueRunId: z.string(),
  workflowRunId: z.string().nullable(),
  taskQueueProposalId: z.string().nullable(),
  workflowGraphPlanId: z.string().nullable(),
  readinessManifestId: z.string().nullable(),
  decompositionPlanId: z.string().nullable(),
  queueStatus: z.string(),
  workflowStatus: z.string().nullable(),
  totalCount: z.number(),
  completedCount: z.number(),
  failedCount: z.number(),
  blockedCount: z.number(),
  currentTaskId: z.string().nullable(),
  nextItemId: z.string().nullable(),
  nextTaskId: z.string().nullable(),
});

const mainAgentQueueDecisionEvidenceSchema = z.object({
  version: z.literal("1.0"),
  authority: z.literal("non-executing-main-agent-queue-step-evidence"),
  executionStarted: z.literal(false),
  id: z.string(),
  ref: z.string(),
  loopRunId: z.string(),
  changeId: z.string(),
  projectId: z.string().nullable(),
  queueStepIndex: z.number(),
  createdAt: z.string(),
  observation: observationSchema,
  decision: z.object({
    kind: z.enum(["run-next-item", "pause", "complete", "block", "fail"]),
    reason: z.string(),
    selectedItemId: z.string().nullable(),
    taskId: z.string().nullable(),
    expectedQueueStatus: z.string(),
  }),
  artifactRefs: z.array(z.string()),
  refs: refsSchema,
});

export function mainAgentQueueDecisionsPath(memory: ResolvedMemory, loopRunId: string): string {
  return join(mainAgentLoopRunRoot(memory, loopRunId), "queue-decisions.jsonl");
}

export function mainAgentQueueDecisionEvidenceRef(loopRunId: string, evidenceId: string): string {
  return `agent-tasks/main-agent-loop-runs/${loopRunId}/queue-decisions.jsonl#${evidenceId}`;
}

export async function recordMainAgentQueueDecisionEvidence(
  memory: ResolvedMemory,
  run: MainAgentLoopRun,
  input: RecordMainAgentQueueDecisionEvidenceInput,
): Promise<MainAgentQueueDecisionEvidence> {
  const now = new Date().toISOString();
  const id = `queue-step-${input.queueStepIndex}-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${input.queueStepIndex}:${input.decision.kind}:${now}`).slice(0, 8)}`;
  const evidence: MainAgentQueueDecisionEvidence = {
    version: "1.0",
    authority: "non-executing-main-agent-queue-step-evidence",
    executionStarted: false,
    id,
    ref: mainAgentQueueDecisionEvidenceRef(run.id, id),
    loopRunId: run.id,
    changeId: run.changeId,
    projectId: run.projectId,
    queueStepIndex: input.queueStepIndex,
    createdAt: now,
    observation: input.observation,
    decision: {
      kind: input.decision.kind,
      reason: truncate(input.decision.reason),
      selectedItemId: input.decision.selectedItemId ?? null,
      taskId: input.decision.taskId ?? null,
      expectedQueueStatus: input.decision.expectedQueueStatus,
    },
    artifactRefs: dedupeStrings(input.artifactRefs ?? []),
    refs: normalizeRefs(input.refs),
  };
  const path = mainAgentQueueDecisionsPath(memory, run.id);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(evidence)}\n`, "utf8");
  return evidence;
}

export async function readMainAgentQueueDecisionEvidence(
  memory: ResolvedMemory,
  loopRunId: string,
): Promise<MainAgentQueueDecisionEvidence[]> {
  const path = mainAgentQueueDecisionsPath(memory, loopRunId);
  try {
    if (!existsSync(path)) return [];
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    const decisions: MainAgentQueueDecisionEvidence[] = [];
    for (const line of lines) {
      const parsed = mainAgentQueueDecisionEvidenceSchema.safeParse(JSON.parse(line));
      if (!parsed.success) return [];
      decisions.push(parsed.data);
    }
    return decisions;
  } catch {
    return [];
  }
}

function normalizeRefs(refs: Partial<MainAgentQueueDecisionRefs> | undefined): MainAgentQueueDecisionRefs {
  return {
    taskQueueRunIds: dedupeStrings(refs?.taskQueueRunIds ?? []),
    taskQueueItemIds: dedupeStrings(refs?.taskQueueItemIds ?? []),
    taskRunIds: dedupeStrings(refs?.taskRunIds ?? []),
    workflowRunIds: dedupeStrings(refs?.workflowRunIds ?? []),
    runIds: dedupeStrings(refs?.runIds ?? []),
    validationIds: dedupeStrings(refs?.validationIds ?? []),
    auditIds: dedupeStrings(refs?.auditIds ?? []),
  };
}

function truncate(value: string): string {
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
