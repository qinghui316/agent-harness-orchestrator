import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
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
  DemandMemoryCloseout,
  DocsDriftCandidate,
  DocBudgetReport,
  EvolutionCandidate,
  MaintenanceLedgerEntry,
  MaintenanceLedgerEventType,
  MaintenanceReviewRun,
  MaintenanceReviewWatermark,
  ResolvedMemory,
  ReusableLessonCandidate,
  RoleScopedContextProjection,
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
  eventType: z.enum(["archive", "apply", "failure", "user-feedback", "doc-drift", "reference-drift", "harness-evolution", "change-closeout", "maintenance-review"]),
  summary: z.string(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});
const candidateSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  sourceLedgerEntryIds: z.array(z.string()),
  subtype: z.enum(["stable-memory", "docs-drift", "harness-evolution", "reusable-lesson", "doc-budget", "reference-drift"]).optional(),
  fingerprint: z.string().optional(),
  supersededBy: z.string().optional(),
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
  dimensions: z.record(z.number()).optional(),
  createdAt: z.string(),
});
const reviewSchema = z.object({
  version: z.literal("1.0"),
  candidateId: z.string(),
  recommendation: z.enum(["accept", "defer", "reject", "needs-human-review"]),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string(),
});
const lessonCandidateSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  status: z.enum(["candidate", "superseded"]),
  supersededBy: z.string().optional(),
});
const docsDriftCandidateSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  document: z.string(),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  status: z.enum(["candidate", "superseded"]),
  supersededBy: z.string().optional(),
});
const closeoutSchema: z.ZodType<DemandMemoryCloseout> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  title: z.string(),
  terminalKind: z.enum(["archived", "applied", "remote-handoff", "merged"]),
  goal: z.string(),
  finalResult: z.string(),
  userDecision: z.string(),
  changedFiles: z.array(z.string()),
  affectedModules: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  reusableLessonCandidates: z.array(lessonCandidateSchema),
  docsDriftCandidates: z.array(docsDriftCandidateSchema),
  memoryBoundaryNotes: z.array(z.string()),
  createdAt: z.string(),
});
const watermarkSchema: z.ZodType<MaintenanceReviewWatermark> = z.object({
  version: z.literal("1.0"),
  lastReviewedChangeIds: z.array(z.string()),
  lastReviewedArchiveIndex: z.number(),
  lastReviewWindowId: z.string().nullable(),
  lastReviewedAt: z.string().nullable(),
});
const docBudgetReportSchema: z.ZodType<DocBudgetReport> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  documents: z.array(z.object({
    path: z.string(),
    wordCount: z.number(),
    softLimit: z.number(),
    hardLimit: z.number(),
    status: z.enum(["ok", "soft-exceeded", "hard-exceeded"]),
  })),
  createdAt: z.string(),
});
const maintenanceReviewRunSchema: z.ZodType<MaintenanceReviewRun> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  windowChangeIds: z.array(z.string()),
  hotCloseoutRefs: z.array(z.string()),
  warmIndexRef: z.string(),
  coldArchiveRef: z.string(),
  docBudgetReportRef: z.string(),
  candidateRefs: z.array(z.string()),
  scoreRefs: z.array(z.string()),
  reviewRefs: z.array(z.string()),
  summary: z.string(),
  createdAt: z.string(),
});

const TERMINAL_REVIEW_WINDOW = 5;
const WARM_CLOSEOUT_LIMIT = 30;
const DOC_BUDGETS: Record<string, { soft: number; hard: number }> = {
  "AGENTS.md": { soft: 7000, hard: 11000 },
  "docs/STATUS.md": { soft: 5000, hard: 8000 },
  "docs/PRODUCT.md": { soft: 7000, hard: 11000 },
  "docs/AGENT-DEVELOPMENT-OS.md": { soft: 7000, hard: 11000 },
  "docs/ARCHITECTURE.md": { soft: 9000, hard: 14000 },
  "docs/RUNTIME.md": { soft: 9000, hard: 14000 },
  "docs/WORKBENCH.md": { soft: 7000, hard: 11000 },
  "docs/AGENT-MODEL.md": { soft: 8000, hard: 12000 },
  "docs/MEMORY.md": { soft: 6000, hard: 9000 },
};

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

export interface RecordDemandMemoryCloseoutInput {
  changeId: string;
  title: string;
  terminalKind: DemandMemoryCloseout["terminalKind"];
  goal?: string;
  finalResult?: string;
  userDecision?: string;
  changedFiles?: string[];
  affectedModules?: string[];
  evidenceRefs?: string[];
  reusableLessonCandidates?: Array<{ summary: string; evidenceRefs?: string[] }>;
  docsDriftCandidates?: Array<{ document: string; summary: string; evidenceRefs?: string[] }>;
  memoryBoundaryNotes?: string[];
}

export async function recordDemandMemoryCloseout(memory: ResolvedMemory, input: RecordDemandMemoryCloseoutInput): Promise<{
  closeout: DemandMemoryCloseout;
  ledger?: MaintenanceLedgerEntry;
  review?: MaintenanceReviewRun;
}> {
  const existingCloseout = (await listDemandMemoryCloseouts(memory)).find((closeout) => closeout.changeId === input.changeId);
  if (existingCloseout) {
    return { closeout: existingCloseout };
  }
  const now = new Date().toISOString();
  const id = `closeout-${safeSegment(input.changeId)}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const closeoutDir = closeoutsRoot(memory);
  const closeoutPath = join(closeoutDir, `${id}.json`);
  const closeout: DemandMemoryCloseout = {
    version: "1.0",
    id,
    changeId: input.changeId,
    title: input.title,
    terminalKind: input.terminalKind,
    goal: input.goal ?? input.title,
    finalResult: input.finalResult ?? "Terminal demand state was recorded for background maintenance.",
    userDecision: input.userDecision ?? input.terminalKind,
    changedFiles: uniqueSorted(input.changedFiles ?? []),
    affectedModules: uniqueSorted(input.affectedModules ?? inferAffectedModules(input.changedFiles ?? [])),
    evidenceRefs: uniqueSorted(input.evidenceRefs ?? []),
    reusableLessonCandidates: normalizeLessonCandidates(input.changeId, input.reusableLessonCandidates ?? [], input.evidenceRefs ?? []),
    docsDriftCandidates: normalizeDocsDriftCandidates(input.changeId, input.docsDriftCandidates ?? [], input.evidenceRefs ?? []),
    memoryBoundaryNotes: input.memoryBoundaryNotes ?? [
      "Closeout, ledger, candidates, scores, reviews, generated indexes, and generated caches may be written automatically.",
      "Canonical docs, ECL rules, product roadmap, curated project/stable memory, and source root remain human-gated.",
    ],
    createdAt: now,
  };
  closeoutSchema.parse(closeout);
  await writeJsonFile(closeoutPath, closeout);
  await refreshMaintenanceIndexes(memory);
  const ledger = await recordMaintenanceLedgerEntry(memory, {
    eventType: "change-closeout",
    changeId: input.changeId,
    summary: `${input.terminalKind} closeout recorded: ${input.title}`,
    artifactRefs: [displayMaintenancePath(memory, closeoutPath), ...closeout.evidenceRefs],
  });
  const maybeReview = await maybeRunMaintenanceReviewWindow(memory);
  return { closeout, ledger, ...(maybeReview.status === "reviewed" ? { review: maybeReview.review } : {}) };
}

export async function listMaintenanceLedgerEntries(memory: ResolvedMemory): Promise<MaintenanceLedgerEntry[]> {
  const path = join(maintenanceRoot(memory), "ledger.jsonl");
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => ledgerSchema.parse(JSON.parse(line)));
}

export async function listDemandMemoryCloseouts(memory: ResolvedMemory): Promise<DemandMemoryCloseout[]> {
  const root = closeoutsRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const closeouts: DemandMemoryCloseout[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const closeout = await readJsonFile(join(root, entry.name), closeoutSchema, null as unknown as DemandMemoryCloseout).catch(() => null);
    if (closeout) closeouts.push(closeout);
  }
  return closeouts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readMaintenanceReviewWatermark(memory: ResolvedMemory): Promise<MaintenanceReviewWatermark> {
  return readJsonFile(watermarkPath(memory), watermarkSchema, {
    version: "1.0",
    lastReviewedChangeIds: [],
    lastReviewedArchiveIndex: 0,
    lastReviewWindowId: null,
    lastReviewedAt: null,
  });
}

export async function maybeRunMaintenanceReviewWindow(memory: ResolvedMemory): Promise<{ status: "skipped"; reason: string } | { status: "reviewed"; review: MaintenanceReviewRun }> {
  const closeouts = await listDemandMemoryCloseouts(memory);
  const watermark = await readMaintenanceReviewWatermark(memory);
  const reviewed = new Set(watermark.lastReviewedChangeIds);
  const unreviewed = closeouts.filter((closeout) => !reviewed.has(closeout.changeId));
  if (unreviewed.length < TERMINAL_REVIEW_WINDOW) {
    return { status: "skipped", reason: `Need ${TERMINAL_REVIEW_WINDOW} unreviewed terminal changes; found ${unreviewed.length}.` };
  }
  return { status: "reviewed", review: await runMaintenanceReviewWindow(memory, unreviewed.slice(0, TERMINAL_REVIEW_WINDOW)) };
}

export async function runMaintenanceReviewWindow(memory: ResolvedMemory, windowCloseouts?: DemandMemoryCloseout[]): Promise<MaintenanceReviewRun> {
  const closeouts = windowCloseouts ?? (await listDemandMemoryCloseouts(memory)).slice(-TERMINAL_REVIEW_WINDOW);
  if (closeouts.length === 0) throw new Error("Maintenance review requires at least one closeout.");
  const now = new Date().toISOString();
  const windowHash = contentHash(closeouts.map((closeout) => closeout.id).join("|")).slice(0, 12);
  const id = `maintenance-review-${windowHash}`;
  const root = join(maintenanceRoot(memory), "reviews", id);
  const closeoutRefs = closeouts.map((closeout) => displayMaintenancePath(memory, join(closeoutsRoot(memory), `${closeout.id}.json`)));
  await refreshMaintenanceIndexes(memory);
  const docBudget = await checkDocBudgets(memory);
  const ledgerEntries = await listMaintenanceLedgerEntries(memory);
  const windowLedgerEntries = ledgerEntries.filter((entry) => entry.changeId && closeouts.some((closeout) => closeout.changeId === entry.changeId));
  const candidates = await createMaintenanceCandidatesForWindow(memory, closeouts, windowLedgerEntries);
  const scores: CandidateScore[] = [];
  const reviews: CandidateReview[] = [];
  for (const candidate of candidates) {
    const score = await scoreEvolutionCandidate(memory, candidate);
    const review = await reviewEvolutionCandidate(memory, candidate, score);
    scores.push(score);
    reviews.push(review);
  }
  const candidateRefs = candidates.map((candidate) => displayMaintenancePath(memory, join(maintenanceRoot(memory), "candidates", `${candidate.id}.json`)));
  const scoreRefs = scores.map((score) => displayMaintenancePath(memory, join(maintenanceRoot(memory), "scores", `${score.candidateId}.json`)));
  const reviewRefs = reviews.map((review) => displayMaintenancePath(memory, join(maintenanceRoot(memory), "reviews", `${review.candidateId}.json`)));
  const reviewRun: MaintenanceReviewRun = {
    version: "1.0",
    id,
    windowChangeIds: closeouts.map((closeout) => closeout.changeId),
    hotCloseoutRefs: closeoutRefs,
    warmIndexRef: displayMaintenancePath(memory, warmIndexPath(memory)),
    coldArchiveRef: displayMaintenancePath(memory, coldArchiveIndexPath(memory)),
    docBudgetReportRef: displayMaintenancePath(memory, join(maintenanceRoot(memory), "doc-budgets", `${docBudget.id}.json`)),
    candidateRefs,
    scoreRefs,
    reviewRefs,
    summary: `Reviewed ${closeouts.length} terminal changes for reusable lessons and documentation drift. Canonical docs, ECL, stable memory, and source root were not modified.`,
    createdAt: now,
  };
  maintenanceReviewRunSchema.parse(reviewRun);
  await writeJsonFile(join(root, "maintenance-review.json"), reviewRun);
  await writeFile(join(root, "maintenance-review.md"), renderMaintenanceReviewMarkdown(reviewRun, closeouts, candidates, scores, reviews, docBudget), "utf8");
  const previous = await readMaintenanceReviewWatermark(memory);
  const reviewedIds = uniqueSorted([...previous.lastReviewedChangeIds, ...closeouts.map((closeout) => closeout.changeId)]);
  await writeJsonFile(watermarkPath(memory), {
    version: "1.0",
    lastReviewedChangeIds: reviewedIds,
    lastReviewedArchiveIndex: reviewedIds.length,
    lastReviewWindowId: reviewRun.id,
    lastReviewedAt: now,
  } satisfies MaintenanceReviewWatermark);
  await recordMaintenanceLedgerEntry(memory, {
    eventType: "maintenance-review",
    summary: reviewRun.summary,
    artifactRefs: [displayMaintenancePath(memory, join(root, "maintenance-review.md")), ...candidateRefs, ...reviewRefs],
  });
  return reviewRun;
}

export async function checkDocBudgets(memory: ResolvedMemory): Promise<DocBudgetReport> {
  const now = new Date().toISOString();
  const docs = [];
  for (const [docPath, limits] of Object.entries(DOC_BUDGETS)) {
    const absolute = docPath === "AGENTS.md" ? memory.agentGuidePath : join(memory.docsRoot, docPath.replace(/^docs[\\/]/, ""));
    if (!existsSync(absolute)) continue;
    const text = await readFile(absolute, "utf8").catch(() => "");
    const wordCount = estimateWordCount(text);
    docs.push({
      path: docPath,
      wordCount,
      softLimit: limits.soft,
      hardLimit: limits.hard,
      status: wordCount > limits.hard ? "hard-exceeded" as const : wordCount > limits.soft ? "soft-exceeded" as const : "ok" as const,
    });
  }
  const report: DocBudgetReport = {
    version: "1.0",
    id: `doc-budget-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    documents: docs,
    createdAt: now,
  };
  docBudgetReportSchema.parse(report);
  await writeJsonFile(join(maintenanceRoot(memory), "doc-budgets", `${report.id}.json`), report);
  const hardExceeded = docs.filter((doc) => doc.status === "hard-exceeded");
  if (hardExceeded.length > 0) {
    await createAgentTask(memory, {
      conversationId: "maintenance",
      changeId: `maintenance-${report.id}`,
      roleId: "documentation-agent",
      kind: "background",
      summary: `Prepare doc-refinement proposal for ${hardExceeded.map((doc) => doc.path).join(", ")}. Do not edit canonical docs.`,
      inputArtifacts: [displayMaintenancePath(memory, join(maintenanceRoot(memory), "doc-budgets", `${report.id}.json`))],
      createdBy: "maintenance-policy",
    });
  }
  return report;
}

export function buildRoleScopedContextProjection(input: {
  roleId: string;
  currentDemandRefs?: string[];
  stableMemoryRefs?: string[];
  roleEvidenceRefs?: string[];
  selectedHistoryRefs?: string[];
}): RoleScopedContextProjection {
  const maintenanceRole = /documentation|architecture|evolution|memory-maintenance|maintenance/i.test(input.roleId);
  const included = uniqueSorted([
    ...(input.currentDemandRefs ?? []),
    ...(input.stableMemoryRefs ?? []),
    ...(input.roleEvidenceRefs ?? []),
    ...(maintenanceRole ? (input.selectedHistoryRefs ?? []) : (input.selectedHistoryRefs ?? []).slice(0, 3)),
  ]);
  return {
    version: "1.0",
    roleId: input.roleId,
    allowedMemoryTier: maintenanceRole ? "maintenance-hot-warm-cold" : "compact-stable",
    includesMaintenanceWindow: maintenanceRole,
    includedSources: included,
    excludedSources: maintenanceRole
      ? ["canonical docs mutation", "source root mutation"]
      : ["hot/warm/cold maintenance window", "raw stdout/stderr/jsonl", "all archive history"],
    createdAt: new Date().toISOString(),
  };
}

export async function createEvolutionCandidate(memory: ResolvedMemory, entries: MaintenanceLedgerEntry[]): Promise<EvolutionCandidate | null> {
  if (entries.length === 0) return null;
  const latest = entries.at(-1) as MaintenanceLedgerEntry;
  const subtype = candidateSubtypeForEvent(latest.eventType);
  const fingerprint = contentHash(`${subtype}:${entries.map((entry) => entry.changeId ?? entry.id).join("|")}:${latest.summary}`);
  const candidate: EvolutionCandidate = {
    version: "1.0",
    id: `candidate-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    sourceLedgerEntryIds: entries.map((entry) => entry.id),
    subtype,
    fingerprint,
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
  const evidenceStrength = Math.min(30, candidate.artifactRefs.length * 5);
  const reuseValue = candidate.subtype === "reusable-lesson" || candidate.subtype === "stable-memory" ? 25 : 15;
  const repeatedOccurrence = Math.min(20, candidate.sourceLedgerEntryIds.length * 4);
  const docsCoverage = candidate.subtype === "docs-drift" || candidate.subtype === "doc-budget" ? 15 : 10;
  const staleRiskPenalty = /superseded|stale|temporary|one-off/i.test(candidate.summary) ? -15 : 0;
  const scoreValue = Math.max(0, Math.min(100, 30 + evidenceStrength + reuseValue + repeatedOccurrence + docsCoverage + staleRiskPenalty));
  const score: CandidateScore = {
    version: "1.0",
    candidateId: candidate.id,
    score: scoreValue,
    rationale: "Heuristic v1 score based on evidence strength, reuse value, recurrence, docs coverage, and stale-memory risk. This remains advisory only.",
    risks: [
      "Scoring is deterministic v1 and does not replace human review.",
      "Canonical docs, ECL rules, curated stable memory, product roadmap, and source root are not modified by this score.",
    ],
    confidence: candidate.sourceLedgerEntryIds.length >= TERMINAL_REVIEW_WINDOW || candidate.artifactRefs.length >= 3 ? "medium" : "low",
    dimensions: {
      evidenceStrength,
      reuseValue,
      repeatedOccurrence,
      docsCoverage,
      staleRiskPenalty,
    },
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(maintenanceRoot(memory), "scores", `${candidate.id}.json`), score);
  scoreSchema.parse(score);
  return score;
}

export async function reviewEvolutionCandidate(memory: ResolvedMemory, candidate: EvolutionCandidate, score: CandidateScore): Promise<CandidateReview> {
  const recommendation = score.score >= 85
    ? "needs-human-review"
    : score.score >= 70
      ? "accept"
      : score.score >= 40
        ? "defer"
        : "reject";
  const review: CandidateReview = {
    version: "1.0",
    candidateId: candidate.id,
    recommendation,
    summary: recommendation === "needs-human-review"
      ? "Candidate has strong evidence and should be shown in project maintenance, not the current demand confirmation queue."
      : recommendation === "accept"
        ? "Candidate is useful enough for a future human-gated maintenance proposal."
        : recommendation === "defer"
          ? "Candidate should remain deferred until more evidence accumulates."
          : "Candidate is too weak or too risky to promote.",
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

async function refreshMaintenanceIndexes(memory: ResolvedMemory): Promise<void> {
  const closeouts = await listDemandMemoryCloseouts(memory).catch(() => []);
  const sorted = [...closeouts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const warm = sorted.slice(0, WARM_CLOSEOUT_LIMIT).map(closeoutIndexEntry);
  const cold = sorted.slice(WARM_CLOSEOUT_LIMIT).map(closeoutIndexEntry);
  await writeJsonFile(warmIndexPath(memory), {
    version: "1.0",
    kind: "warm-closeout-index",
    limit: WARM_CLOSEOUT_LIMIT,
    items: warm,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonFile(coldArchiveIndexPath(memory), {
    version: "1.0",
    kind: "cold-archive-refs",
    items: cold,
    note: "Cold archive entries are traceable by summary and artifact refs; raw evidence is not part of role-scoped runtime context.",
    updatedAt: new Date().toISOString(),
  });
}

async function createMaintenanceCandidatesForWindow(memory: ResolvedMemory, closeouts: DemandMemoryCloseout[], ledgerEntries: MaintenanceLedgerEntry[]): Promise<EvolutionCandidate[]> {
  const candidates: EvolutionCandidate[] = [];
  const seen = new Set<string>();
  const ledgerIds = ledgerEntries.map((entry) => entry.id);
  const addCandidate = async (input: { subtype: EvolutionCandidate["subtype"]; fingerprint: string; title: string; summary: string; artifactRefs: string[] }) => {
    if (seen.has(input.fingerprint)) return;
    seen.add(input.fingerprint);
    const existing = await findCandidateByFingerprint(memory, input.fingerprint);
    if (existing) return;
    const candidate: EvolutionCandidate = {
      version: "1.0",
      id: `candidate-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      sourceLedgerEntryIds: ledgerIds,
      subtype: input.subtype,
      fingerprint: input.fingerprint,
      title: input.title,
      summary: input.summary,
      artifactRefs: uniqueSorted(input.artifactRefs),
      status: "candidate",
      createdAt: new Date().toISOString(),
    };
    candidateSchema.parse(candidate);
    await writeJsonFile(join(maintenanceRoot(memory), "candidates", `${candidate.id}.json`), candidate);
    candidates.push(candidate);
  };

  for (const lesson of closeouts.flatMap((closeout) => closeout.reusableLessonCandidates)) {
    if (lesson.status === "superseded") continue;
    await addCandidate({
      subtype: "reusable-lesson",
      fingerprint: lesson.fingerprint,
      title: "Reusable project lesson",
      summary: lesson.summary,
      artifactRefs: lesson.evidenceRefs,
    });
  }
  for (const drift of closeouts.flatMap((closeout) => closeout.docsDriftCandidates)) {
    if (drift.status === "superseded") continue;
    await addCandidate({
      subtype: "docs-drift",
      fingerprint: drift.fingerprint,
      title: `Documentation drift candidate for ${drift.document}`,
      summary: drift.summary,
      artifactRefs: drift.evidenceRefs,
    });
  }
  const docBudget = await checkDocBudgets(memory);
  for (const doc of docBudget.documents.filter((item) => item.status !== "ok")) {
    await addCandidate({
      subtype: "doc-budget",
      fingerprint: contentHash(`doc-budget:${doc.path}:${doc.status}`),
      title: `Document budget candidate for ${doc.path}`,
      summary: `${doc.path} is ${doc.status} (${doc.wordCount}/${doc.hardLimit} estimated words). Prepare a refinement proposal; do not rewrite canonical docs automatically.`,
      artifactRefs: [displayMaintenancePath(memory, join(maintenanceRoot(memory), "doc-budgets", `${docBudget.id}.json`))],
    });
  }
  if (candidates.length === 0) {
    await addCandidate({
      subtype: "stable-memory",
      fingerprint: contentHash(`stable-memory:${closeouts.map((closeout) => closeout.changeId).join("|")}`),
      title: "Maintenance review completed with no strong reusable lesson",
      summary: "The latest terminal changes were reviewed. No canonical docs, ECL rules, curated stable memory, or source files were modified.",
      artifactRefs: closeouts.flatMap((closeout) => closeout.evidenceRefs),
    });
  }
  return candidates;
}

async function findCandidateByFingerprint(memory: ResolvedMemory, fingerprint: string): Promise<EvolutionCandidate | null> {
  const root = join(maintenanceRoot(memory), "candidates");
  if (!existsSync(root)) return null;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const candidate = await readJsonFile(join(root, entry.name), candidateSchema, null as unknown as EvolutionCandidate).catch(() => null);
    if (candidate?.fingerprint === fingerprint) return candidate;
  }
  return null;
}

function closeoutIndexEntry(closeout: DemandMemoryCloseout): object {
  return {
    id: closeout.id,
    changeId: closeout.changeId,
    title: closeout.title,
    terminalKind: closeout.terminalKind,
    createdAt: closeout.createdAt,
    finalResult: closeout.finalResult,
    evidenceRefs: closeout.evidenceRefs,
    reusableLessonCount: closeout.reusableLessonCandidates.length,
    docsDriftCount: closeout.docsDriftCandidates.length,
  };
}

function normalizeLessonCandidates(changeId: string, candidates: Array<{ summary: string; evidenceRefs?: string[] }>, fallbackRefs: string[]): ReusableLessonCandidate[] {
  return candidates
    .filter((candidate) => candidate.summary.trim().length > 0)
    .map((candidate, index) => {
      const fingerprint = contentHash(`lesson:${normalizeCandidateText(candidate.summary)}`);
      return {
        id: `lesson-${safeSegment(changeId)}-${index + 1}-${fingerprint.slice(0, 8)}`,
        fingerprint,
        summary: candidate.summary.trim(),
        evidenceRefs: uniqueSorted(candidate.evidenceRefs?.length ? candidate.evidenceRefs : fallbackRefs),
        status: "candidate",
      };
    });
}

function normalizeDocsDriftCandidates(changeId: string, candidates: Array<{ document: string; summary: string; evidenceRefs?: string[] }>, fallbackRefs: string[]): DocsDriftCandidate[] {
  return candidates
    .filter((candidate) => candidate.document.trim().length > 0 && candidate.summary.trim().length > 0)
    .map((candidate, index) => {
      const document = candidate.document.trim().replace(/\\/g, "/");
      const fingerprint = contentHash(`docs-drift:${document}:${normalizeCandidateText(candidate.summary)}`);
      return {
        id: `docs-drift-${safeSegment(changeId)}-${index + 1}-${fingerprint.slice(0, 8)}`,
        fingerprint,
        document,
        summary: candidate.summary.trim(),
        evidenceRefs: uniqueSorted(candidate.evidenceRefs?.length ? candidate.evidenceRefs : fallbackRefs),
        status: "candidate",
      };
    });
}

function renderMaintenanceReviewMarkdown(
  review: MaintenanceReviewRun,
  closeouts: DemandMemoryCloseout[],
  candidates: EvolutionCandidate[],
  scores: CandidateScore[],
  reviews: CandidateReview[],
  docBudget: DocBudgetReport,
): string {
  const scoreByCandidate = new Map(scores.map((score) => [score.candidateId, score]));
  const reviewByCandidate = new Map(reviews.map((item) => [item.candidateId, item]));
  return [
    `# ${review.id}`,
    "",
    review.summary,
    "",
    "## Window",
    "",
    ...closeouts.map((closeout) => `- ${closeout.changeId}: ${closeout.title} (${closeout.terminalKind})`),
    "",
    "## Candidates",
    "",
    ...(candidates.length ? candidates.map((candidate) => {
      const score = scoreByCandidate.get(candidate.id);
      const itemReview = reviewByCandidate.get(candidate.id);
      return `- ${candidate.title} [${candidate.subtype ?? "maintenance"}] score=${score?.score ?? "n/a"} recommendation=${itemReview?.recommendation ?? "n/a"}\n  ${candidate.summary.replace(/\r?\n/g, " ")}`;
    }) : ["- No candidates generated."]),
    "",
    "## Document Budget",
    "",
    ...docBudget.documents.map((doc) => `- ${doc.path}: ${doc.status} (${doc.wordCount}/${doc.hardLimit})`),
    "",
    "## Boundary",
    "",
    "This review wrote evidence, candidates, scores, reviews, indexes, and generated cache only. It did not modify canonical docs, ECL rules, curated project/stable memory, product roadmap, Harness templates, source root, or the current demand confirmation queue.",
    "",
  ].join("\n");
}

function candidateSubtypeForEvent(eventType: MaintenanceLedgerEventType): EvolutionCandidate["subtype"] {
  if (eventType === "doc-drift") return "docs-drift";
  if (eventType === "reference-drift") return "reference-drift";
  if (eventType === "harness-evolution") return "harness-evolution";
  if (eventType === "change-closeout" || eventType === "maintenance-review") return "stable-memory";
  return "reusable-lesson";
}

function inferAffectedModules(files: string[]): string[] {
  return uniqueSorted(files.map((file) => file.replace(/\\/g, "/").split("/")[0]).filter(Boolean));
}

function normalizeCandidateText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function estimateWordCount(text: string): number {
  const latinWords = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9FFF]/g)?.length ?? 0;
  return latinWords + Math.ceil(cjkChars / 2);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "item";
}

function contentHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function displayMaintenancePath(memory: ResolvedMemory, path: string): string {
  return relative(memory.memoryRoot, path).replace(/\\/g, "/");
}

function closeoutsRoot(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "closeouts");
}

function warmIndexPath(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "generated", "warm-closeout-index.json");
}

function coldArchiveIndexPath(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "generated", "cold-archive-refs.json");
}

function watermarkPath(memory: ResolvedMemory): string {
  return join(maintenanceRoot(memory), "review-watermark.json");
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
