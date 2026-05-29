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
  githubCliArgs,
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
  PrReviewInlineComment,
  PrReviewThreadCapability,
  PrReviewThreadFinding,
  ReviewFeedbackUserContext,
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
  inlineComments: z.array(z.object({
    id: z.string(),
    body: z.string(),
    path: z.string().nullable().optional(),
    line: z.number().nullable().optional(),
    side: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    inReplyToId: z.string().nullable().optional(),
  })).optional(),
  threadCapability: z.object({
    provider: z.literal("github-cli"),
    canReadThreads: z.boolean(),
    canResolveThreads: z.boolean(),
    reason: z.string().optional(),
    evidenceRefs: z.array(z.string()),
  }).optional(),
  threadFindings: z.array(z.object({
    id: z.string(),
    threadId: z.string().optional(),
    commentId: z.string().optional(),
    path: z.string().nullable().optional(),
    line: z.number().nullable().optional(),
    body: z.string(),
    author: z.string().nullable().optional(),
    resolved: z.boolean().optional(),
    actionable: z.boolean(),
  })).optional(),
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
  classification: z.enum(["no-action", "checks-failed", "changes-requested", "inline-comments-actionable", "comments-only", "user-pushback-requested", "provider-unavailable", "stale-pr"]),
  actionable: z.boolean(),
  summary: z.string(),
  reviewDecision: z.string().nullable().optional(),
  commentsCount: z.number(),
  inlineCommentsCount: z.number().optional(),
  actionableCommentsCount: z.number().optional(),
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
  userContextId: z.string().optional(),
  reworkContextArtifact: z.string().optional(),
  status: z.enum(["started", "completed", "failed"]),
  agentTaskId: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const userContextSchema: z.ZodType<ReviewFeedbackUserContext> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  landingPackageId: z.string(),
  prDraftPackageId: z.string().optional(),
  intent: z.enum(["rework", "reply", "pushback", "clarify"]),
  message: z.string(),
  createdAt: z.string(),
  artifactRef: z.string(),
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
  const inlineRawPath = join(directory, "gh-pr-inline-comments.json");
  const snapshotPath = join(directory, "pr-feedback-snapshot.json");
  const summaryPath = join(directory, "pr-feedback-summary.md");
  await writeFile(rawPath, `${rawText}\n`, "utf8");
  const prRef = parseGitHubPrUrl(pkg.prUrl);
  const inlineRaw = prRef ? await ghApiJson(project.path, `repos/${prRef.owner}/${prRef.repo}/pulls/${prRef.number}/comments`).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })) : { error: "PR URL is unavailable." };
  await writeFile(inlineRawPath, `${JSON.stringify(inlineRaw, null, 2)}\n`, "utf8");
  const inlineComments = parseInlineComments(inlineRaw);
  const threadInfo = await detectReviewThreadCapability(project.path, directory, memory, prRef);
  const threadCapability = threadInfo.capability;
  const threadFindings = mergeThreadFindings(parseGraphqlThreadFindings(threadInfo.raw), buildThreadFindings(inlineComments, threadCapability));
  const state = stringField(raw, "state") ?? "UNKNOWN";
  const reviewDecision = nullableStringField(raw, "reviewDecision");
  const statusCheckRollup = arrayField(raw, "statusCheckRollup");
  const reviews = arrayField(raw, "reviews");
  const comments = arrayField(raw, "comments");
  const classification = classifyPrFeedbackSnapshotData({ state, reviewDecision, reviews, comments, inlineComments, threadFindings, statusCheckRollup });
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
    inlineComments,
    threadCapability,
    threadFindings,
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
  inlineComments?: PrReviewInlineComment[];
  threadFindings?: PrReviewThreadFinding[];
  statusCheckRollup?: unknown[];
  userFeedbackIntent?: ReviewFeedbackUserContext["intent"];
}): PrFeedbackClassification {
  if (input.state && input.state !== "OPEN") return "stale-pr";
  if (input.userFeedbackIntent === "pushback") return "user-pushback-requested";
  if (input.reviewDecision === "CHANGES_REQUESTED" || (input.reviews ?? []).some((review) => stringField(review, "state") === "CHANGES_REQUESTED")) {
    return "changes-requested";
  }
  if (countFailedChecks(input.statusCheckRollup ?? []) > 0) return "checks-failed";
  if ((input.threadFindings ?? []).some((finding) => finding.actionable) || (input.inlineComments ?? []).some((comment) => isActionableCommentText(comment.body))) {
    return "inline-comments-actionable";
  }
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
  const userContext = feedbackPrompt?.trim()
    ? await recordReviewFeedbackUserContext(memory, {
      changeId,
      landingPackageId,
      prDraftPackageId: feedback.summary.prDraftPackageId,
      intent: inferUserFeedbackIntent(feedbackPrompt),
      message: feedbackPrompt.trim(),
    })
    : null;
  const reworkContextArtifact = await writeReworkContext(memory, {
    changeId,
    landingPackageId,
    feedback,
    userContext,
  });
  const attempt: PrFeedbackReworkAttempt = {
    version: "1.0",
    id: `pr-feedback-rework-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    changeId,
    prDraftPackageId: feedback.summary.prDraftPackageId,
    landingPackageId,
    snapshotId: feedback.snapshot.id,
    ...(userContext ? { userContextId: userContext.id } : {}),
    reworkContextArtifact,
    status: "started",
    artifactRefs: Array.from(new Set([...feedback.summary.evidenceRefs, reworkContextArtifact, ...(userContext ? [userContext.artifactRef] : [])])),
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
    prompt: renderPrFeedbackReworkPrompt(feedback.summary, feedbackPrompt, reworkContextArtifact),
    feedback,
  };
}

export async function recordReviewFeedbackUserContext(
  memory: ResolvedMemory,
  input: {
    changeId: string;
    landingPackageId: string;
    prDraftPackageId?: string;
    intent: ReviewFeedbackUserContext["intent"];
    message: string;
  },
): Promise<ReviewFeedbackUserContext> {
  const now = new Date().toISOString();
  const id = `pr-review-user-context-${contentHash(`${input.changeId}:${input.landingPackageId}:${input.message}:${now}`).slice(0, 12)}`;
  const directory = join(prFeedbackRoot(memory), "user-context");
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${id}.json`);
  const context: ReviewFeedbackUserContext = {
    version: "1.0",
    id,
    changeId: input.changeId,
    landingPackageId: input.landingPackageId,
    ...(input.prDraftPackageId ? { prDraftPackageId: input.prDraftPackageId } : {}),
    intent: input.intent,
    message: input.message,
    createdAt: now,
    artifactRef: displayArtifactPath(memory, file),
  };
  userContextSchema.parse(context);
  await writeJsonFile(file, context);
  return context;
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
  const actionable = classification === "changes-requested" || classification === "checks-failed" || classification === "inline-comments-actionable";
  const actionableCommentsCount = (snapshot.threadFindings ?? []).filter((finding) => finding.actionable).length
    || (snapshot.inlineComments ?? []).filter((comment) => isActionableCommentText(comment.body)).length;
  const messages: Record<PrFeedbackClassification, string> = {
    "no-action": "远端 PR 暂无需要 AHO 修改的反馈。",
    "checks-failed": `远端检查失败 ${failedChecksCount} 项，需要同一需求内重新处理。`,
    "changes-requested": "PR review 要求修改，需要同一需求内重新处理。",
    "inline-comments-actionable": `PR inline review 有 ${actionableCommentsCount} 条需要处理的反馈，需要同一需求内重新处理。`,
    "comments-only": "PR 有普通评论；需要主 agent 向用户解释，由用户决定是否修改。",
    "user-pushback-requested": "用户希望对评审反馈进行解释或反驳；需要先准备回复草稿。",
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
    inlineCommentsCount: snapshot.inlineComments?.length ?? 0,
    actionableCommentsCount,
    failedChecksCount,
    evidenceRefs: Array.from(new Set([snapshot.summaryArtifact, snapshot.snapshotArtifact, snapshot.rawArtifact, ...(snapshot.threadCapability?.evidenceRefs ?? [])])),
    recommendedAction: actionable ? "Create same-demand rework AgentTask." : classification === "user-pushback-requested" ? "Prepare a review reply draft." : "Summarize feedback in the main conversation.",
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
    inlineComments: [],
    threadFindings: [],
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
    `Inline comments: ${summary.inlineCommentsCount ?? 0}`,
    `Actionable comments: ${summary.actionableCommentsCount ?? 0}`,
    `Failed checks: ${summary.failedChecksCount}`,
    "",
    summary.summary,
    "",
    snapshot.prUrl ? `PR: ${snapshot.prUrl}` : "PR: unavailable",
    "",
  ].join("\n");
}

function renderPrFeedbackReworkPrompt(summary: PrFeedbackSummary, feedbackPrompt?: string, reworkContextArtifact?: string): string {
  return [
    "The Draft PR has remote feedback that requires a same-demand rework attempt.",
    "Re-read the accepted demand artifacts, current source tree, previous landing evidence, and PR feedback summary.",
    "Create a fresh fix in the same demand context. Do not merge, land, mark ready for review, or resolve PR threads.",
    "",
    `Feedback classification: ${summary.classification}`,
    summary.summary,
    "",
    `Feedback evidence:\n${summary.evidenceRefs.map((ref) => `- ${ref}`).join("\n")}`,
    reworkContextArtifact ? `\nReview rework context artifact:\n- ${reworkContextArtifact}` : "",
    feedbackPrompt?.trim() ? `\nAdditional user feedback:\n${feedbackPrompt.trim()}` : "",
  ].filter(Boolean).join("\n");
}

async function ghPrView(cwd: string, pr: string): Promise<Record<string, unknown>> {
  const fields = ["url", "state", "isDraft", "reviewDecision", "reviews", "comments", "headRefName", "baseRefName", "headRefOid", "baseRefOid", "statusCheckRollup"];
  const stdout = await commandText(githubCliCommand(), [...githubCliArgs(), "pr", "view", pr, "--json", fields.join(",")], cwd);
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function commandText(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

async function ghApiJson(cwd: string, path: string): Promise<unknown> {
  const stdout = await commandText(githubCliCommand(), [...githubCliArgs(), "api", path], cwd);
  return JSON.parse(stdout) as unknown;
}

async function detectReviewThreadCapability(
  cwd: string,
  directory: string,
  memory: ResolvedMemory,
  prRef: GitHubPrRef | null,
): Promise<{ capability: PrReviewThreadCapability; raw: unknown }> {
  const rawPath = join(directory, "gh-review-threads.json");
  if (!prRef) {
    await writeFile(rawPath, `${JSON.stringify({ reason: "PR URL is unavailable." }, null, 2)}\n`, "utf8");
    return { capability: {
      provider: "github-cli",
      canReadThreads: false,
      canResolveThreads: false,
      reason: "PR URL is unavailable.",
      evidenceRefs: [displayArtifactPath(memory, rawPath)],
    }, raw: null };
  }
  const query = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:50){nodes{id isResolved comments(first:20){nodes{id databaseId body path line author{login} createdAt}}}}}}}`;
  try {
    const stdout = await commandText(githubCliCommand(), [
      ...githubCliArgs(),
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-f",
      `owner=${prRef.owner}`,
      "-f",
      `repo=${prRef.repo}`,
      "-F",
      `number=${prRef.number}`,
    ], cwd);
    await writeFile(rawPath, `${stdout.trim()}\n`, "utf8");
    return { capability: {
      provider: "github-cli",
      canReadThreads: true,
      canResolveThreads: true,
      evidenceRefs: [displayArtifactPath(memory, rawPath)],
    }, raw: JSON.parse(stdout) as unknown };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    await writeFile(rawPath, `${JSON.stringify({ reason }, null, 2)}\n`, "utf8");
    return { capability: {
      provider: "github-cli",
      canReadThreads: false,
      canResolveThreads: false,
      reason,
      evidenceRefs: [displayArtifactPath(memory, rawPath)],
    }, raw: null };
  }
}

interface GitHubPrRef {
  owner: string;
  repo: string;
  number: number;
}

function parseGitHubPrUrl(url?: string): GitHubPrRef | null {
  if (!url) return null;
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (!match?.[1] || !match?.[2] || !match?.[3]) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

function parseInlineComments(raw: unknown): PrReviewInlineComment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const author = item && typeof item === "object" ? (item as Record<string, unknown>).user : null;
    return {
      id: String(stringField(item, "id") ?? numberField(item, "id") ?? `inline-${index}`),
      body: stringField(item, "body") ?? "",
      path: nullableStringField(item, "path"),
      line: numberField(item, "line"),
      side: nullableStringField(item, "side"),
      author: author && typeof author === "object" ? stringField(author, "login") ?? null : null,
      createdAt: nullableStringField(item, "created_at") ?? nullableStringField(item, "createdAt"),
      url: nullableStringField(item, "html_url") ?? nullableStringField(item, "url"),
      inReplyToId: stringField(item, "in_reply_to_id") ?? (numberField(item, "in_reply_to_id") !== null ? String(numberField(item, "in_reply_to_id")) : null),
    };
  }).filter((comment) => comment.body.trim().length > 0);
}

function buildThreadFindings(inlineComments: PrReviewInlineComment[], capability: PrReviewThreadCapability): PrReviewThreadFinding[] {
  return inlineComments.map((comment) => ({
    id: `finding:${comment.id}`,
    commentId: comment.id,
    path: comment.path,
    line: comment.line,
    body: comment.body,
    author: comment.author,
    resolved: capability.canReadThreads ? false : undefined,
    actionable: isActionableCommentText(comment.body),
  }));
}

function parseGraphqlThreadFindings(raw: unknown): PrReviewThreadFinding[] {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>).data : null;
  const repository = data && typeof data === "object" ? (data as Record<string, unknown>).repository : null;
  const pullRequest = repository && typeof repository === "object" ? (repository as Record<string, unknown>).pullRequest : null;
  const reviewThreads = pullRequest && typeof pullRequest === "object" ? (pullRequest as Record<string, unknown>).reviewThreads : null;
  const nodes = reviewThreads && typeof reviewThreads === "object" ? (reviewThreads as Record<string, unknown>).nodes : null;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node, index) => {
    const threadId = stringField(node, "id") ?? `thread-${index + 1}`;
    const resolved = Boolean((node as Record<string, unknown>).isResolved);
    const commentsContainer = node && typeof node === "object" ? (node as Record<string, unknown>).comments : null;
    const commentNodes = commentsContainer && typeof commentsContainer === "object" ? (commentsContainer as Record<string, unknown>).nodes : null;
    const comments = Array.isArray(commentNodes) ? commentNodes : [];
    return comments.map((comment, commentIndex) => {
      const author = comment && typeof comment === "object" ? (comment as Record<string, unknown>).author : null;
      const body = stringField(comment, "body") ?? "";
      return {
        id: `finding:${threadId}:${commentIndex}`,
        threadId,
        commentId: numberField(comment, "databaseId") != null ? String(numberField(comment, "databaseId")) : stringField(comment, "id"),
        path: nullableStringField(comment, "path"),
        line: numberField(comment, "line"),
        body,
        author: author && typeof author === "object" ? stringField(author, "login") ?? null : null,
        resolved,
        actionable: !resolved && isActionableCommentText(body),
      };
    });
  }).filter((finding) => finding.body.trim().length > 0);
}

function mergeThreadFindings(primary: PrReviewThreadFinding[], fallback: PrReviewThreadFinding[]): PrReviewThreadFinding[] {
  if (primary.length === 0) return fallback;
  const seen = new Set(primary.flatMap((finding) => [finding.commentId, finding.threadId].filter(Boolean) as string[]));
  const missing = fallback.filter((finding) => !finding.commentId || !seen.has(finding.commentId));
  return [...primary, ...missing];
}

function isActionableCommentText(text: string): boolean {
  const normalized = text.toLowerCase();
  return /please|must|should|change|fix|fail|broken|missing|required|建议|需要|必须|修改|修复|失败|缺少|不通过/.test(normalized);
}

function inferUserFeedbackIntent(text: string): ReviewFeedbackUserContext["intent"] {
  if (/反驳|解释|不同意|pushback|reply/i.test(text)) return "pushback";
  if (/回复|comment|评论/i.test(text)) return "reply";
  if (/按.*改|修改|修复|change|fix/i.test(text)) return "rework";
  return "clarify";
}

async function writeReworkContext(memory: ResolvedMemory, input: {
  changeId: string;
  landingPackageId: string;
  feedback: { snapshot: PrFeedbackSnapshot; summary: PrFeedbackSummary };
  userContext: ReviewFeedbackUserContext | null;
}): Promise<string> {
  const directory = join(prFeedbackRoot(memory), "rework-context");
  await mkdir(directory, { recursive: true });
  const file = join(directory, `pr-review-rework-context-${contentHash(`${input.changeId}:${input.feedback.snapshot.id}:${Date.now()}`).slice(0, 12)}.json`);
  await writeJsonFile(file, {
    version: "1.0",
    changeId: input.changeId,
    landingPackageId: input.landingPackageId,
    snapshotId: input.feedback.snapshot.id,
    feedbackSummary: input.feedback.summary.summary,
    classification: input.feedback.summary.classification,
    userContext: input.userContext,
    evidenceRefs: input.feedback.summary.evidenceRefs,
    createdAt: new Date().toISOString(),
  });
  return displayArtifactPath(memory, file);
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

function numberField(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" ? field : null;
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
