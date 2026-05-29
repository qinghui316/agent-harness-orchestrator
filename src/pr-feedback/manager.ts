import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { createAgentTask } from "../agent-task/manager.js";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { readLandingPackage } from "../landing/manager.js";
import {
  detectRemoteProviderCapability,
  findPrDraftPackageForLanding,
  findLatestCreatedPrDraftPackageForChanges,
  githubCliCommand,
  updateDraftPrFromLanding,
  type PrDraftPackage,
} from "../pr-draft/manager.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type {
  AgentTask,
  ManagedProject,
  PrDraftRevision,
  PrFeedbackClassification,
  PrFeedbackReworkAttempt,
  PrFeedbackSnapshot,
  PrFeedbackSummary,
  ResolvedMemory,
} from "../types/index.js";

const execFileAsync = promisify(execFile);

const snapshotSchema: z.ZodType<PrFeedbackSnapshot> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  prUrl: z.string().optional(),
  state: z.string(),
  isDraft: z.boolean(),
  reviewDecision: z.string().nullable().optional(),
  headRefName: z.string().nullable().optional(),
  baseRefName: z.string().nullable().optional(),
  headRefOid: z.string().nullable().optional(),
  baseRefOid: z.string().nullable().optional(),
  reviews: z.array(z.unknown()),
  comments: z.array(z.unknown()),
  statusCheckRollup: z.array(z.unknown()),
  rawArtifact: z.string(),
  snapshotArtifact: z.string(),
  summaryArtifact: z.string(),
  createdAt: z.string(),
});

const summarySchema: z.ZodType<PrFeedbackSummary> = z.object({
  version: z.literal("1.0"),
  snapshotId: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  classification: z.enum(["no-action", "checks-failed", "changes-requested", "comments-only", "provider-unavailable", "stale-pr"]),
  actionable: z.boolean(),
  summary: z.string(),
  reviewDecision: z.string().nullable().optional(),
  commentsCount: z.number(),
  failedChecksCount: z.number(),
  evidenceRefs: z.array(z.string()),
  recommendedAction: z.string(),
  createdAt: z.string(),
});

const reworkSchema: z.ZodType<PrFeedbackReworkAttempt> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  prDraftPackageId: z.string(),
  landingPackageId: z.string(),
  snapshotId: z.string(),
  status: z.enum(["started", "completed", "failed"]),
  agentTaskId: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export async function refreshPrFeedback(project: ManagedProject, landingPackageId: string): Promise<{ snapshot: PrFeedbackSnapshot; summary: PrFeedbackSummary }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "PR feedback refresh");
  const landing = await readLandingPackage(memory, landingPackageId);
  const pkg = await findPrDraftPackageForLanding(memory, landingPackageId)
    ?? await findLatestCreatedPrDraftPackageForChanges(memory, landing.target.changeIds);
  if (!pkg || pkg.status !== "created" || !pkg.prUrl) {
    return writeProviderUnavailableFeedback(memory, landingPackageId, pkg);
  }
  const capability = await detectRemoteProviderCapability(project);
  if (!capability.ready) return writeProviderUnavailableFeedback(memory, landingPackageId, pkg, capability.reason ?? capability.setupHint);
  const raw = await ghPrView(project.path, pkg.prUrl);
  const rawText = JSON.stringify(raw, null, 2);
  const now = new Date().toISOString();
  const id = `pr-feedback-${contentHash(`${pkg.id}:${now}:${rawText}`).slice(0, 12)}`;
  const directory = join(prFeedbackRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const rawPath = join(directory, "gh-pr-view.json");
  const snapshotPath = join(directory, "pr-feedback-snapshot.json");
  const summaryPath = join(directory, "pr-feedback-summary.md");
  await writeFile(rawPath, `${rawText}\n`, "utf8");
  const state = stringField(raw, "state") ?? "UNKNOWN";
  const reviewDecision = nullableStringField(raw, "reviewDecision");
  const statusCheckRollup = arrayField(raw, "statusCheckRollup");
  const reviews = arrayField(raw, "reviews");
  const comments = arrayField(raw, "comments");
  const classification = classifyPrFeedbackSnapshotData({ state, reviewDecision, reviews, comments, statusCheckRollup });
  const failedChecksCount = countFailedChecks(statusCheckRollup);
  const snapshot: PrFeedbackSnapshot = {
    version: "1.0",
    id,
    prDraftPackageId: pkg.id,
    landingPackageId,
    projectId: memory.projectId,
    prUrl: stringField(raw, "url") ?? pkg.prUrl,
    state,
    isDraft: Boolean((raw as { isDraft?: unknown }).isDraft),
    reviewDecision,
    headRefName: nullableStringField(raw, "headRefName"),
    baseRefName: nullableStringField(raw, "baseRefName"),
    headRefOid: nullableStringField(raw, "headRefOid"),
    baseRefOid: nullableStringField(raw, "baseRefOid"),
    reviews,
    comments,
    statusCheckRollup,
    rawArtifact: displayArtifactPath(memory, rawPath),
    snapshotArtifact: displayArtifactPath(memory, snapshotPath),
    summaryArtifact: displayArtifactPath(memory, summaryPath),
    createdAt: now,
  };
  const summary = buildSummary(snapshot, classification, failedChecksCount);
  await writeJsonFile(snapshotPath, snapshot);
  await writeJsonFile(join(directory, "summary.json"), summary);
  await writeFile(summaryPath, renderFeedbackSummary(summary, snapshot), "utf8");
  snapshotSchema.parse(snapshot);
  summarySchema.parse(summary);
  return { snapshot, summary };
}

export function classifyPrFeedbackSnapshotData(input: {
  state: string;
  reviewDecision?: string | null;
  reviews?: unknown[];
  comments?: unknown[];
  statusCheckRollup?: unknown[];
}): PrFeedbackClassification {
  if (input.state && input.state !== "OPEN") return "stale-pr";
  if (input.reviewDecision === "CHANGES_REQUESTED" || (input.reviews ?? []).some((review) => stringField(review, "state") === "CHANGES_REQUESTED")) {
    return "changes-requested";
  }
  if (countFailedChecks(input.statusCheckRollup ?? []) > 0) return "checks-failed";
  if ((input.comments ?? []).length > 0) return "comments-only";
  return "no-action";
}

export async function listPrFeedbackSummaries(memory: ResolvedMemory): Promise<PrFeedbackSummary[]> {
  const root = prFeedbackRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const summaries: PrFeedbackSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "summary.json");
    if (!existsSync(file)) continue;
    summaries.push(await readRequiredJsonFile(file, summarySchema));
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function latestPrFeedbackSummaryForDraft(memory: ResolvedMemory, prDraftPackageId: string): Promise<PrFeedbackSummary | null> {
  return (await listPrFeedbackSummaries(memory)).find((summary) => summary.prDraftPackageId === prDraftPackageId) ?? null;
}

export async function startPrFeedbackReworkAttempt(
  project: ManagedProject,
  landingPackageId: string,
  feedbackPrompt?: string,
): Promise<{ attempt: PrFeedbackReworkAttempt; task: AgentTask; prompt: string; feedback: { snapshot: PrFeedbackSnapshot; summary: PrFeedbackSummary } }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "PR feedback rework");
  const landing = await readLandingPackage(memory, landingPackageId);
  const feedback = await refreshPrFeedback(project, landingPackageId);
  if (!feedback.summary.actionable) {
    throw new Error("PR feedback does not require automatic rework.");
  }
  const changeId = landing.target.changeIds[0];
  if (!changeId) throw new Error("PR feedback rework requires a landing package changeId.");
  const now = new Date().toISOString();
  const attempt: PrFeedbackReworkAttempt = {
    version: "1.0",
    id: `pr-feedback-rework-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    changeId,
    prDraftPackageId: feedback.summary.prDraftPackageId,
    landingPackageId,
    snapshotId: feedback.snapshot.id,
    status: "started",
    artifactRefs: feedback.summary.evidenceRefs,
    createdAt: now,
    updatedAt: now,
  };
  const task = await createAgentTask(memory, {
    conversationId: changeId,
    changeId,
    roleId: "rework-coder",
    kind: "foreground",
    summary: "Revise the demand result from remote Draft PR feedback.",
    inputArtifacts: feedback.summary.evidenceRefs,
  });
  const withTask: PrFeedbackReworkAttempt = { ...attempt, agentTaskId: task.id };
  reworkSchema.parse(withTask);
  await writeJsonFile(prFeedbackReworkPath(memory, withTask.id), withTask);
  return {
    attempt: withTask,
    task,
    prompt: renderPrFeedbackReworkPrompt(feedback.summary, feedbackPrompt),
    feedback,
  };
}

export async function completePrFeedbackReworkAttempt(memory: ResolvedMemory, attempt: PrFeedbackReworkAttempt, status: "completed" | "failed", artifactRefs: string[]): Promise<PrFeedbackReworkAttempt> {
  const completed: PrFeedbackReworkAttempt = {
    ...attempt,
    status,
    artifactRefs: Array.from(new Set([...attempt.artifactRefs, ...artifactRefs])),
    updatedAt: new Date().toISOString(),
  };
  reworkSchema.parse(completed);
  await writeJsonFile(prFeedbackReworkPath(memory, completed.id), completed);
  return completed;
}

export async function updatePrDraftFromFeedback(project: ManagedProject, landingPackageId: string): Promise<{ package: PrDraftPackage; revision: PrDraftRevision }> {
  return updateDraftPrFromLanding(project, landingPackageId);
}

function buildSummary(snapshot: PrFeedbackSnapshot, classification: PrFeedbackClassification, failedChecksCount: number): PrFeedbackSummary {
  const actionable = classification === "changes-requested" || classification === "checks-failed";
  const messages: Record<PrFeedbackClassification, string> = {
    "no-action": "远端 PR 暂无需要 AHO 修改的反馈。",
    "checks-failed": `远端检查失败 ${failedChecksCount} 项，需要同一需求内重新处理。`,
    "changes-requested": "PR review 要求修改，需要同一需求内重新处理。",
    "comments-only": "PR 有普通评论；需要主 agent 向用户解释，由用户决定是否修改。",
    "provider-unavailable": "远端 PR provider 不可用，无法读取反馈。",
    "stale-pr": "PR 当前状态不适合继续自动更新。",
  };
  return {
    version: "1.0",
    snapshotId: snapshot.id,
    prDraftPackageId: snapshot.prDraftPackageId,
    landingPackageId: snapshot.landingPackageId,
    classification,
    actionable,
    summary: messages[classification],
    reviewDecision: snapshot.reviewDecision,
    commentsCount: snapshot.comments.length,
    failedChecksCount,
    evidenceRefs: [snapshot.summaryArtifact, snapshot.snapshotArtifact, snapshot.rawArtifact],
    recommendedAction: actionable ? "Create same-demand rework AgentTask." : "Summarize feedback in the main conversation.",
    createdAt: snapshot.createdAt,
  };
}

async function writeProviderUnavailableFeedback(memory: ResolvedMemory, landingPackageId: string, pkg?: PrDraftPackage | null, reason = "Draft PR package or URL is unavailable."): Promise<{ snapshot: PrFeedbackSnapshot; summary: PrFeedbackSummary }> {
  const now = new Date().toISOString();
  const id = `pr-feedback-${contentHash(`${landingPackageId}:${now}:provider-unavailable`).slice(0, 12)}`;
  const directory = join(prFeedbackRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const rawPath = join(directory, "gh-pr-view.json");
  const snapshotPath = join(directory, "pr-feedback-snapshot.json");
  const summaryPath = join(directory, "pr-feedback-summary.md");
  await writeFile(rawPath, `${JSON.stringify({ reason }, null, 2)}\n`, "utf8");
  const snapshot: PrFeedbackSnapshot = {
    version: "1.0",
    id,
    prDraftPackageId: pkg?.id ?? "unavailable",
    landingPackageId,
    projectId: memory.projectId,
    ...(pkg?.prUrl ? { prUrl: pkg.prUrl } : {}),
    state: "UNAVAILABLE",
    isDraft: false,
    reviewDecision: null,
    reviews: [],
    comments: [],
    statusCheckRollup: [],
    rawArtifact: displayArtifactPath(memory, rawPath),
    snapshotArtifact: displayArtifactPath(memory, snapshotPath),
    summaryArtifact: displayArtifactPath(memory, summaryPath),
    createdAt: now,
  };
  const summary = buildSummary(snapshot, "provider-unavailable", 0);
  await writeJsonFile(snapshotPath, snapshot);
  await writeJsonFile(join(directory, "summary.json"), summary);
  await writeFile(summaryPath, renderFeedbackSummary(summary, snapshot), "utf8");
  return { snapshot, summary };
}

function renderFeedbackSummary(summary: PrFeedbackSummary, snapshot: PrFeedbackSnapshot): string {
  return [
    "# PR Feedback Summary",
    "",
    `Classification: ${summary.classification}`,
    `Actionable: ${summary.actionable ? "yes" : "no"}`,
    `Review decision: ${summary.reviewDecision ?? "none"}`,
    `Comments: ${summary.commentsCount}`,
    `Failed checks: ${summary.failedChecksCount}`,
    "",
    summary.summary,
    "",
    snapshot.prUrl ? `PR: ${snapshot.prUrl}` : "PR: unavailable",
    "",
  ].join("\n");
}

function renderPrFeedbackReworkPrompt(summary: PrFeedbackSummary, feedbackPrompt?: string): string {
  return [
    "The Draft PR has remote feedback that requires a same-demand rework attempt.",
    "Re-read the accepted demand artifacts, current source tree, previous landing evidence, and PR feedback summary.",
    "Create a fresh fix in the same demand context. Do not merge, land, mark ready for review, or resolve PR threads.",
    "",
    `Feedback classification: ${summary.classification}`,
    summary.summary,
    "",
    `Feedback evidence:\n${summary.evidenceRefs.map((ref) => `- ${ref}`).join("\n")}`,
    feedbackPrompt?.trim() ? `\nAdditional user feedback:\n${feedbackPrompt.trim()}` : "",
  ].filter(Boolean).join("\n");
}

async function ghPrView(cwd: string, pr: string): Promise<Record<string, unknown>> {
  const fields = ["url", "state", "isDraft", "reviewDecision", "reviews", "comments", "headRefName", "baseRefName", "headRefOid", "baseRefOid", "statusCheckRollup"];
  const stdout = await commandText(githubCliCommand(), ["pr", "view", pr, "--json", fields.join(",")], cwd);
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function commandText(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

function countFailedChecks(checks: unknown[]): number {
  return checks.filter((check) => {
    const conclusion = stringField(check, "conclusion");
    const state = stringField(check, "state") ?? stringField(check, "status");
    return ["FAILURE", "FAILED", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes((conclusion ?? state ?? "").toUpperCase());
  }).length;
}

function arrayField(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== "object") return [];
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field) ? field : [];
}

function nullableStringField(value: unknown, key: string): string | null {
  return stringField(value, key) ?? null;
}

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function prFeedbackRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "pr-feedback");
}

function prFeedbackReworkPath(memory: ResolvedMemory, attemptId: string): string {
  return join(prFeedbackRoot(memory), "rework", `${attemptId}.json`);
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  return `${memory.artifactBase === "memory-root" ? "memory://" : "project://"}${relative(memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot, absolutePath).replace(/\\/g, "/")}`;
}

function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}
