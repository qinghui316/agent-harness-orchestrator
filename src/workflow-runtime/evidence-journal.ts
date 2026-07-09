import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { agentTaskRoot } from "../agent-task/paths.js";
import type { WorkflowRuntimeDecision, WorkflowRuntimeRole } from "./execution-contract.js";
import { writeJsonFile } from "../fs/json.js";
import { shortHash, slugify } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";

export type WorkflowRuntimeEvidenceEntrypoint =
  | "task-run"
  | "source-refresh-rework"
  | "feedback-rework";

export type WorkflowRuntimeEvidenceRunStatus = "running" | "completed" | "stopped";

export type WorkflowRuntimeEvidenceEventType =
  | "runtime.started"
  | "observation.recorded"
  | "decision.recorded"
  | "leaf.started"
  | "leaf.completed"
  | "runtime.completed"
  | "runtime.stopped";

export interface WorkflowRuntimeEvidenceRefs {
  agentTaskIds: string[];
  runIds: string[];
  validationIds: string[];
  auditIds: string[];
  taskQueueRunIds: string[];
  taskQueueItemIds: string[];
  taskRunIds: string[];
  workflowRunIds: string[];
}

export interface WorkflowRuntimeEvidenceRun {
  version: "1.0";
  authority: "workflow-runtime-evidence";
  id: string;
  changeId: string;
  projectId: string | null;
  entrypoint: WorkflowRuntimeEvidenceEntrypoint;
  status: WorkflowRuntimeEvidenceRunStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface WorkflowRuntimeEvidenceEvent {
  version: "1.0";
  authority: "workflow-runtime-evidence";
  id: string;
  runtimeRunId: string;
  changeId: string;
  type: WorkflowRuntimeEvidenceEventType;
  timestamp: string;
  stepIndex?: number;
  entrypoint?: WorkflowRuntimeEvidenceEntrypoint;
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
  refs: WorkflowRuntimeEvidenceRefs;
}

export interface WorkflowRuntimeDecisionEvidenceRefs {
  agentTaskIds: string[];
  runIds: string[];
  validationIds: string[];
  auditIds: string[];
}

export interface WorkflowRuntimeDecisionTargetRefs {
  worktreeIds: string[];
  runIds: string[];
  validationIds: string[];
  auditIds: string[];
  applyCheckIds: string[];
  landingPackageIds: string[];
}

export interface WorkflowRuntimeDecisionObservationSummary {
  summary: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  latestRoleId: WorkflowRuntimeRole | null;
  latestStatus: "completed" | "failed" | null;
}

export interface WorkflowRuntimeDecisionEvidence {
  version: "1.0";
  authority: "workflow-runtime-decision-evidence";
  executionStarted: false;
  id: string;
  ref: string;
  runtimeRunId: string;
  changeId: string;
  projectId: string | null;
  entrypoint: WorkflowRuntimeEvidenceEntrypoint;
  stepIndex: number;
  createdAt: string;
  observation: WorkflowRuntimeDecisionObservationSummary;
  decision: {
    kind: WorkflowRuntimeDecision["kind"];
    roleId: WorkflowRuntimeRole | null;
    attemptKind: "initial" | "rework" | "follow-up" | null;
    stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
    reason: string;
    nextRecommendation: string;
  };
  gateIntent: "delegate-leaf" | "result-handoff" | "none";
  targetRefs: WorkflowRuntimeDecisionTargetRefs;
  artifactRefs: string[];
  refs: WorkflowRuntimeDecisionEvidenceRefs;
}

export interface EnsureWorkflowRuntimeEvidenceRunInput {
  runtimeRunId?: string;
  changeId: string;
  projectId: string | null;
  entrypoint: WorkflowRuntimeEvidenceEntrypoint;
}

export interface WorkflowRuntimeEvidenceEventInput {
  type: WorkflowRuntimeEvidenceEventType;
  stepIndex?: number;
  entrypoint?: WorkflowRuntimeEvidenceEntrypoint;
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
  refs?: Partial<WorkflowRuntimeEvidenceRefs>;
}

export interface RecordWorkflowRuntimeDecisionEvidenceInput {
  stepIndex: number;
  entrypoint: WorkflowRuntimeEvidenceEntrypoint;
  observation: WorkflowRuntimeDecisionObservationSummary;
  decision: WorkflowRuntimeDecision;
  targetRefs?: Partial<WorkflowRuntimeDecisionTargetRefs>;
  artifactRefs?: string[];
  refs?: Partial<WorkflowRuntimeDecisionEvidenceRefs>;
}

export function createWorkflowRuntimeEvidenceRunId(changeId: string): string {
  const now = new Date().toISOString();
  return `runtime-${slugify(changeId).slice(0, 48)}-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${changeId}:${now}:${Math.random()}`).slice(0, 8)}`;
}

export async function ensureWorkflowRuntimeEvidenceRun(
  memory: ResolvedMemory,
  input: EnsureWorkflowRuntimeEvidenceRunInput,
): Promise<{ run: WorkflowRuntimeEvidenceRun; created: boolean }> {
  const runtimeRunId = input.runtimeRunId ?? createWorkflowRuntimeEvidenceRunId(input.changeId);
  const path = workflowRuntimeEvidenceRunPath(memory, runtimeRunId);
  if (existsSync(path)) {
    try {
      const existing = JSON.parse(await readFile(path, "utf8")) as WorkflowRuntimeEvidenceRun;
      if (existing.authority === "workflow-runtime-evidence" && existing.id === runtimeRunId && existing.changeId === input.changeId) {
        return { run: existing, created: false };
      }
    } catch {
      // Non-authoritative runtime evidence can be recreated so execution can
      // continue and subsequent valid events remain inspectable.
    }
  }
  const now = new Date().toISOString();
  const run: WorkflowRuntimeEvidenceRun = {
    version: "1.0",
    authority: "workflow-runtime-evidence",
    id: runtimeRunId,
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

export async function appendWorkflowRuntimeEvidenceEvent(
  memory: ResolvedMemory,
  run: WorkflowRuntimeEvidenceRun,
  input: WorkflowRuntimeEvidenceEventInput,
): Promise<WorkflowRuntimeEvidenceEvent> {
  const now = new Date().toISOString();
  const event: WorkflowRuntimeEvidenceEvent = {
    version: "1.0",
    authority: "workflow-runtime-evidence",
    id: `runtime-event-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${input.type}:${now}:${Math.random()}`).slice(0, 8)}`,
    runtimeRunId: run.id,
    changeId: run.changeId,
    type: input.type,
    timestamp: now,
    ...definedOptionalFields(input),
    summary: truncate(input.summary),
    artifactRefs: dedupeStrings(input.artifactRefs ?? []),
    refs: normalizeEvidenceRefs(input.refs),
  };
  const path = workflowRuntimeEvidenceEventsPath(memory, run.id);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function recordWorkflowRuntimeDecisionEvidence(
  memory: ResolvedMemory,
  run: WorkflowRuntimeEvidenceRun,
  input: RecordWorkflowRuntimeDecisionEvidenceInput,
): Promise<WorkflowRuntimeDecisionEvidence> {
  const now = new Date().toISOString();
  const id = `runtime-decision-${input.stepIndex}-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${input.stepIndex}:${decisionKey(input.decision)}:${now}`).slice(0, 8)}`;
  const evidence: WorkflowRuntimeDecisionEvidence = {
    version: "1.0",
    authority: "workflow-runtime-decision-evidence",
    executionStarted: false,
    id,
    ref: workflowRuntimeDecisionEvidenceRef(run.id, id),
    runtimeRunId: run.id,
    changeId: run.changeId,
    projectId: run.projectId,
    entrypoint: input.entrypoint,
    stepIndex: input.stepIndex,
    createdAt: now,
    observation: {
      summary: truncate(input.observation.summary),
      totalSteps: input.observation.totalSteps,
      completedSteps: input.observation.completedSteps,
      failedSteps: input.observation.failedSteps,
      latestRoleId: input.observation.latestRoleId,
      latestStatus: input.observation.latestStatus,
    },
    decision: normalizeDecision(input.decision),
    gateIntent: gateIntentForDecision(input.decision),
    targetRefs: normalizeTargetRefs(input.targetRefs),
    artifactRefs: dedupeStrings(input.artifactRefs ?? []),
    refs: normalizeDecisionRefs(input.refs),
  };
  const path = workflowRuntimeDecisionEvidencePath(memory, run.id);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(evidence)}\n`, "utf8");
  return evidence;
}

export async function finishWorkflowRuntimeEvidenceRun(
  memory: ResolvedMemory,
  run: WorkflowRuntimeEvidenceRun,
  input: {
    status: Exclude<WorkflowRuntimeEvidenceRunStatus, "running">;
    summary: string;
    stoppedAt?: "boundary" | "code" | "validation" | "audit" | null;
    artifactRefs?: string[];
    refs?: Partial<WorkflowRuntimeEvidenceRefs>;
  },
): Promise<WorkflowRuntimeEvidenceRun> {
  const existing = await readWorkflowRuntimeEvidenceRun(memory, run.id);
  if (existing && existing.status !== "running") return existing;
  const now = new Date().toISOString();
  const finished: WorkflowRuntimeEvidenceRun = {
    ...(existing ?? run),
    status: input.status,
    updatedAt: now,
    finishedAt: now,
  };
  await writeJsonFile(workflowRuntimeEvidenceRunPath(memory, run.id), finished);
  await appendWorkflowRuntimeEvidenceEvent(memory, finished, {
    type: input.status === "completed" ? "runtime.completed" : "runtime.stopped",
    status: input.status,
    stoppedAt: input.stoppedAt,
    summary: input.summary,
    artifactRefs: input.artifactRefs,
    refs: input.refs,
  });
  return finished;
}

export async function readWorkflowRuntimeEvidenceRun(memory: ResolvedMemory, runtimeRunId: string): Promise<WorkflowRuntimeEvidenceRun | null> {
  const path = workflowRuntimeEvidenceRunPath(memory, runtimeRunId);
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(await readFile(path, "utf8")) as WorkflowRuntimeEvidenceRun;
    return parsed.authority === "workflow-runtime-evidence" && parsed.id === runtimeRunId ? parsed : null;
  } catch {
    return null;
  }
}

export async function readWorkflowRuntimeEvidenceEvents(memory: ResolvedMemory, runtimeRunId: string): Promise<WorkflowRuntimeEvidenceEvent[]> {
  const path = workflowRuntimeEvidenceEventsPath(memory, runtimeRunId);
  try {
    if (!existsSync(path)) return [];
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    const events: WorkflowRuntimeEvidenceEvent[] = [];
    for (const line of lines) {
      const parsed = JSON.parse(line) as WorkflowRuntimeEvidenceEvent;
      if (parsed.authority !== "workflow-runtime-evidence" || parsed.runtimeRunId !== runtimeRunId) return [];
      events.push(parsed);
    }
    return events;
  } catch {
    return [];
  }
}

export async function readWorkflowRuntimeDecisionEvidence(memory: ResolvedMemory, runtimeRunId: string): Promise<WorkflowRuntimeDecisionEvidence[]> {
  const path = workflowRuntimeDecisionEvidencePath(memory, runtimeRunId);
  try {
    if (!existsSync(path)) return [];
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    const decisions: WorkflowRuntimeDecisionEvidence[] = [];
    for (const line of lines) {
      const parsed = JSON.parse(line) as WorkflowRuntimeDecisionEvidence;
      if (parsed.authority !== "workflow-runtime-decision-evidence" || parsed.runtimeRunId !== runtimeRunId) return [];
      decisions.push(parsed);
    }
    return decisions;
  } catch {
    return [];
  }
}

function workflowRuntimeEvidenceRoot(memory: ResolvedMemory): string {
  return join(agentTaskRoot(memory), "workflow-runtime-runs");
}

function workflowRuntimeEvidenceRunRoot(memory: ResolvedMemory, runtimeRunId: string): string {
  return join(workflowRuntimeEvidenceRoot(memory), runtimeRunId);
}

export function workflowRuntimeEvidenceRunPath(memory: ResolvedMemory, runtimeRunId: string): string {
  return join(workflowRuntimeEvidenceRunRoot(memory, runtimeRunId), "runtime.json");
}

export function workflowRuntimeEvidenceEventsPath(memory: ResolvedMemory, runtimeRunId: string): string {
  return join(workflowRuntimeEvidenceRunRoot(memory, runtimeRunId), "events.jsonl");
}

export function workflowRuntimeDecisionEvidencePath(memory: ResolvedMemory, runtimeRunId: string): string {
  return join(workflowRuntimeEvidenceRunRoot(memory, runtimeRunId), "decisions.jsonl");
}

function workflowRuntimeDecisionEvidenceRef(runtimeRunId: string, evidenceId: string): string {
  return `agent-tasks/workflow-runtime-runs/${runtimeRunId}/decisions.jsonl#${evidenceId}`;
}

function definedOptionalFields(input: WorkflowRuntimeEvidenceEventInput): Partial<WorkflowRuntimeEvidenceEvent> {
  const value: Partial<WorkflowRuntimeEvidenceEvent> = {};
  if (input.stepIndex !== undefined) value.stepIndex = input.stepIndex;
  if (input.entrypoint !== undefined) value.entrypoint = input.entrypoint;
  if (input.roleId !== undefined) value.roleId = input.roleId;
  if (input.attemptKind !== undefined) value.attemptKind = input.attemptKind;
  if (input.decisionKind !== undefined) value.decisionKind = input.decisionKind;
  if (input.decisionEvidenceId !== undefined) value.decisionEvidenceId = input.decisionEvidenceId;
  if (input.decisionEvidenceRef !== undefined) value.decisionEvidenceRef = input.decisionEvidenceRef;
  if (input.status !== undefined) value.status = input.status;
  if (input.stoppedAt !== undefined) value.stoppedAt = input.stoppedAt;
  if (input.reason !== undefined) value.reason = truncate(input.reason);
  return value;
}

function normalizeDecision(decision: WorkflowRuntimeDecision): WorkflowRuntimeDecisionEvidence["decision"] {
  if (decision.kind === "delegate-role") {
    return {
      kind: decision.kind,
      roleId: decision.roleId,
      attemptKind: decision.attemptKind,
      stoppedAt: null,
      reason: truncate(decision.reason),
      nextRecommendation: truncate(decision.nextRecommendation),
    };
  }
  if (decision.kind === "completed") {
    return {
      kind: decision.kind,
      roleId: null,
      attemptKind: null,
      stoppedAt: null,
      reason: truncate(decision.reason),
      nextRecommendation: truncate(decision.nextRecommendation),
    };
  }
  return {
    kind: decision.kind,
    roleId: null,
    attemptKind: null,
    stoppedAt: decision.stoppedAt,
    reason: truncate(decision.reason),
    nextRecommendation: truncate(decision.nextRecommendation),
  };
}

function gateIntentForDecision(decision: WorkflowRuntimeDecision): WorkflowRuntimeDecisionEvidence["gateIntent"] {
  if (decision.kind === "delegate-role") return "delegate-leaf";
  if (decision.kind === "completed") return "result-handoff";
  return "none";
}

function decisionKey(decision: WorkflowRuntimeDecision): string {
  if (decision.kind === "delegate-role") return `${decision.kind}:${decision.roleId}:${decision.attemptKind}`;
  return `${decision.kind}:${"stoppedAt" in decision ? decision.stoppedAt : "complete"}`;
}

function normalizeEvidenceRefs(refs: Partial<WorkflowRuntimeEvidenceRefs> | undefined): WorkflowRuntimeEvidenceRefs {
  return {
    agentTaskIds: dedupeStrings(refs?.agentTaskIds ?? []),
    runIds: dedupeStrings(refs?.runIds ?? []),
    validationIds: dedupeStrings(refs?.validationIds ?? []),
    auditIds: dedupeStrings(refs?.auditIds ?? []),
    taskQueueRunIds: dedupeStrings(refs?.taskQueueRunIds ?? []),
    taskQueueItemIds: dedupeStrings(refs?.taskQueueItemIds ?? []),
    taskRunIds: dedupeStrings(refs?.taskRunIds ?? []),
    workflowRunIds: dedupeStrings(refs?.workflowRunIds ?? []),
  };
}

function normalizeDecisionRefs(refs: Partial<WorkflowRuntimeDecisionEvidenceRefs> | undefined): WorkflowRuntimeDecisionEvidenceRefs {
  return {
    agentTaskIds: dedupeStrings(refs?.agentTaskIds ?? []),
    runIds: dedupeStrings(refs?.runIds ?? []),
    validationIds: dedupeStrings(refs?.validationIds ?? []),
    auditIds: dedupeStrings(refs?.auditIds ?? []),
  };
}

function normalizeTargetRefs(refs: Partial<WorkflowRuntimeDecisionTargetRefs> | undefined): WorkflowRuntimeDecisionTargetRefs {
  return {
    worktreeIds: dedupeStrings(refs?.worktreeIds ?? []),
    runIds: dedupeStrings(refs?.runIds ?? []),
    validationIds: dedupeStrings(refs?.validationIds ?? []),
    auditIds: dedupeStrings(refs?.auditIds ?? []),
    applyCheckIds: dedupeStrings(refs?.applyCheckIds ?? []),
    landingPackageIds: dedupeStrings(refs?.landingPackageIds ?? []),
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
