import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  AgentTask,
  AgentTaskCreatedBy,
  AgentTaskKind,
  AgentTaskResult,
  AgentTaskStatus,
  CandidateReview,
  CandidateScore,
  EvolutionCandidate,
  MaintenanceLedgerEntry,
  MaintenanceLedgerEventType,
  ResolvedMemory,
} from "../types/index.js";

const taskStatusSchema = z.enum(["queued", "running", "completed", "failed", "needs-user-input", "cancelled"]);
const taskSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  conversationId: z.string(),
  changeId: z.string(),
  roleId: z.string(),
  kind: z.enum(["foreground", "background"]),
  status: taskStatusSchema,
  inputArtifacts: z.array(z.string()),
  outputArtifacts: z.array(z.string()),
  parentTaskId: z.string().optional(),
  createdBy: z.enum(["main-agent-policy", "maintenance-policy", "system"]),
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
const resultSchema = z.object({
  version: z.literal("1.0"),
  taskId: z.string(),
  roleId: z.string(),
  status: taskStatusSchema,
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  nextRecommendation: z.string().optional(),
  failureClassification: z.string().optional(),
  requiresUserInputReason: z.string().optional(),
  createdAt: z.string(),
});
const ledgerSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  projectId: z.string().nullable(),
  changeId: z.string().optional(),
  eventType: z.enum(["archive", "apply", "failure", "user-feedback", "doc-drift", "reference-drift", "harness-evolution"]),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});
const candidateSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  sourceLedgerEntryIds: z.array(z.string()),
  title: z.string(),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  status: z.literal("candidate"),
  createdAt: z.string(),
});
const scoreSchema = z.object({
  version: z.literal("1.0"),
  candidateId: z.string(),
  score: z.number(),
  rationale: z.string(),
  risks: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  createdAt: z.string(),
});
const reviewSchema = z.object({
  version: z.literal("1.0"),
  candidateId: z.string(),
  recommendation: z.enum(["accept", "defer", "reject"]),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
});

export interface CreateAgentTaskInput {
  conversationId: string;
  changeId: string;
  roleId: string;
  kind: AgentTaskKind;
  summary: string;
  inputArtifacts?: string[];
  parentTaskId?: string;
  createdBy?: AgentTaskCreatedBy;
}

export interface CompleteAgentTaskInput {
  status: AgentTaskStatus;
  summary: string;
  artifactRefs?: string[];
  nextRecommendation?: string;
  failureClassification?: string;
  requiresUserInputReason?: string;
}

export interface MainAgentDecision {
  version: "1.0";
  id: string;
  changeId: string;
  recommendedAction: string;
  userMessage: string;
  requiresUserDecision: boolean;
  createTask?: {
    roleId: string;
    kind: AgentTaskKind;
    summary: string;
    inputArtifacts: string[];
    parentTaskId?: string;
  };
  reason: string;
  createdAt: string;
}

export async function createAgentTask(memory: ResolvedMemory, input: CreateAgentTaskInput): Promise<AgentTask> {
  const now = new Date().toISOString();
  const id = buildTaskId(input.changeId, input.roleId);
  const task: AgentTask = {
    version: "1.0",
    id,
    projectId: memory.projectId,
    conversationId: input.conversationId,
    changeId: input.changeId,
    roleId: input.roleId,
    kind: input.kind,
    status: "running",
    inputArtifacts: input.inputArtifacts ?? [],
    outputArtifacts: [],
    ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
    createdBy: input.createdBy ?? (input.kind === "background" ? "maintenance-policy" : "main-agent-policy"),
    summary: input.summary,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: null,
  };
  await writeTask(memory, task);
  return task;
}

export async function completeAgentTask(memory: ResolvedMemory, task: AgentTask, input: CompleteAgentTaskInput): Promise<AgentTaskResult> {
  const now = new Date().toISOString();
  const result: AgentTaskResult = {
    version: "1.0",
    taskId: task.id,
    roleId: task.roleId,
    status: input.status,
    summary: input.summary,
    artifactRefs: input.artifactRefs ?? [],
    ...(input.nextRecommendation ? { nextRecommendation: input.nextRecommendation } : {}),
    ...(input.failureClassification ? { failureClassification: input.failureClassification } : {}),
    ...(input.requiresUserInputReason ? { requiresUserInputReason: input.requiresUserInputReason } : {}),
    createdAt: now,
  };
  const completed: AgentTask = {
    ...task,
    status: input.status,
    outputArtifacts: result.artifactRefs,
    summary: input.summary,
    updatedAt: now,
    finishedAt: now,
  };
  await writeTask(memory, completed);
  await writeJsonFile(taskResultPath(memory, task.id), result);
  return result;
}

export async function listAgentTasks(memory: ResolvedMemory, changeId?: string): Promise<AgentTask[]> {
  const root = tasksRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const tasks: AgentTask[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const task = await readJsonFile(join(root, entry.name, "task.json"), taskSchema, null as unknown as AgentTask).catch(() => null);
    if (task && (!changeId || task.changeId === changeId)) tasks.push(task);
  }
  return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readAgentTaskResult(memory: ResolvedMemory, taskId: string): Promise<AgentTaskResult | null> {
  if (!existsSync(taskResultPath(memory, taskId))) return null;
  return readJsonFile(taskResultPath(memory, taskId), resultSchema, null as unknown as AgentTaskResult).catch(() => null);
}

export async function recordMainAgentDecision(memory: ResolvedMemory, input: Omit<MainAgentDecision, "version" | "id" | "createdAt">): Promise<MainAgentDecision> {
  const decision: MainAgentDecision = {
    version: "1.0",
    id: `decision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  await mkdir(agentTaskRoot(memory), { recursive: true });
  await appendFile(join(agentTaskRoot(memory), "main-agent-decisions.jsonl"), `${JSON.stringify(decision)}\n`, "utf8");
  return decision;
}

export async function recordMaintenanceLedgerEntry(memory: ResolvedMemory, input: {
  eventType: MaintenanceLedgerEventType;
  summary: string;
  changeId?: string;
  artifactRefs?: string[];
}): Promise<MaintenanceLedgerEntry> {
  const entry: MaintenanceLedgerEntry = {
    version: "1.0",
    id: `ledger-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    projectId: memory.projectId,
    ...(input.changeId ? { changeId: input.changeId } : {}),
    eventType: input.eventType,
    summary: input.summary,
    artifactRefs: input.artifactRefs ?? [],
    createdAt: new Date().toISOString(),
  };
  await mkdir(maintenanceRoot(memory), { recursive: true });
  await appendFile(join(maintenanceRoot(memory), "ledger.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export async function listMaintenanceLedgerEntries(memory: ResolvedMemory): Promise<MaintenanceLedgerEntry[]> {
  const path = join(maintenanceRoot(memory), "ledger.jsonl");
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => ledgerSchema.parse(JSON.parse(line)));
}

export async function createEvolutionCandidate(memory: ResolvedMemory, entries: MaintenanceLedgerEntry[]): Promise<EvolutionCandidate | null> {
  if (entries.length === 0) return null;
  const latest = entries.at(-1) as MaintenanceLedgerEntry;
  const candidate: EvolutionCandidate = {
    version: "1.0",
    id: `candidate-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    sourceLedgerEntryIds: entries.map((entry) => entry.id),
    title: `Maintenance candidate from ${latest.eventType}`,
    summary: entries.map((entry) => `${entry.eventType}: ${entry.summary}`).join("\n"),
    artifactRefs: entries.flatMap((entry) => entry.artifactRefs),
    status: "candidate",
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(maintenanceRoot(memory), "candidates", `${candidate.id}.json`), candidate);
  candidateSchema.parse(candidate);
  return candidate;
}

export async function scoreEvolutionCandidate(memory: ResolvedMemory, candidate: EvolutionCandidate): Promise<CandidateScore> {
  const score: CandidateScore = {
    version: "1.0",
    candidateId: candidate.id,
    score: Math.min(100, 50 + candidate.sourceLedgerEntryIds.length * 10),
    rationale: "Heuristic v1 score based on evidence count. This is advisory only.",
    risks: ["Scoring is deterministic v1 and does not replace human review."],
    confidence: candidate.sourceLedgerEntryIds.length >= 3 ? "medium" : "low",
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(maintenanceRoot(memory), "scores", `${candidate.id}.json`), score);
  scoreSchema.parse(score);
  return score;
}

export async function reviewEvolutionCandidate(memory: ResolvedMemory, candidate: EvolutionCandidate, score: CandidateScore): Promise<CandidateReview> {
  const review: CandidateReview = {
    version: "1.0",
    candidateId: candidate.id,
    recommendation: score.score >= 80 ? "accept" : "defer",
    summary: score.score >= 80
      ? "Candidate has enough evidence to present as a human-gated maintenance suggestion."
      : "Candidate should remain deferred until more evidence accumulates.",
    evidenceRefs: candidate.artifactRefs,
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(maintenanceRoot(memory), "reviews", `${candidate.id}.json`), review);
  reviewSchema.parse(review);
  return review;
}

export async function runMaintenanceCandidatePipeline(memory: ResolvedMemory): Promise<{
  status: "skipped" | "reviewed";
  candidate?: EvolutionCandidate;
  score?: CandidateScore;
  review?: CandidateReview;
}> {
  const entries = await listMaintenanceLedgerEntries(memory);
  if (entries.length === 0) return { status: "skipped" };
  const candidate = await createEvolutionCandidate(memory, entries.slice(-10));
  if (!candidate) return { status: "skipped" };
  const score = await scoreEvolutionCandidate(memory, candidate);
  const review = await reviewEvolutionCandidate(memory, candidate, score);
  return { status: "reviewed", candidate, score, review };
}

function writeTask(memory: ResolvedMemory, task: AgentTask): Promise<void> {
  taskSchema.parse(task);
  return writeJsonFile(taskPath(memory, task.id), task);
}

function buildTaskId(changeId: string, roleId: string): string {
  const safeChange = changeId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48);
  const safeRole = roleId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `agtask-${Date.now()}-${safeRole}-${safeChange}-${Math.random().toString(16).slice(2, 8)}`;
}

function agentTaskRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "agent-tasks");
}

function tasksRoot(memory: ResolvedMemory): string {
  return join(agentTaskRoot(memory), "tasks");
}

function taskPath(memory: ResolvedMemory, taskId: string): string {
  return join(tasksRoot(memory), taskId, "task.json");
}

function taskResultPath(memory: ResolvedMemory, taskId: string): string {
  return join(tasksRoot(memory), taskId, "result.json");
}

function maintenanceRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "maintenance");
}
