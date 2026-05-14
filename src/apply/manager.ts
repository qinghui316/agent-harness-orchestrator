import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getChangeStatus } from "../change/manager.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { listAuditResults } from "../audit/artifacts.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitCommit, git, isGitDirty } from "../project/git.js";
import { appendRunEvent, assertRunnableChange, buildRunId } from "../run/manager.js";
import { listValidationResults } from "../validation/artifacts.js";
import { getWorktreeStatus, markWorktreeApplied, removeWorktree } from "../worktree/manager.js";
import type { AuditResult, ManagedProject, ResolvedMemory, RunMetadata, RunStatus, ValidationResult, WorktreeStatus } from "../types/index.js";

export interface WorktreeGateState {
  ready: boolean;
  warnings: string[];
  blockingIssues: string[];
  changeId: string;
  worktree: WorktreeStatus;
  diffHash: string;
  diffStat: string;
  validation: ValidationResult | null;
  audit: AuditResult | null;
  reviewAuditId: string | null;
  sourceHead: string | null;
}

export interface WorktreePreviewResult {
  gate: WorktreeGateState;
}

export interface WorktreeApplyOptions {
  commit?: boolean;
  message?: string;
}

export interface WorktreeApplyResult {
  run: RunMetadata;
  apply: {
    version: "1.0";
    changeId: string;
    worktreeId: string;
    worktreeDiffHash: string;
    validationId: string;
    auditId: string;
    reviewAuditId: string;
    sourceHeadBefore: string | null;
    sourceHeadAfter: string | null;
    committed: boolean;
    commitHash?: string;
    status: "applied" | "failed";
  };
}

export interface WorktreeDiscardResult {
  run: RunMetadata;
  discard: {
    version: "1.0";
    changeId: string;
    worktreeId: string;
    status: "discarded" | "failed";
  };
}

export async function previewWorktreeApply(project: ManagedProject, worktreeId: string): Promise<WorktreePreviewResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Worktree preview");
  return { gate: await evaluateApplyGate(project, memory, worktreeId) };
}

export async function applyWorktree(project: ManagedProject, worktreeId: string, options: WorktreeApplyOptions = {}): Promise<WorktreeApplyResult> {
  if (options.message && !options.commit) {
    throw new Error("Cannot use --message without --commit.");
  }
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Worktree apply");
  const gate = await evaluateApplyGate(project, memory, worktreeId);
  if (!gate.ready) {
    throw new Error(`Cannot apply worktree:\n${gate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  if (!gate.validation || !gate.audit || !gate.reviewAuditId) {
    throw new Error("Cannot apply worktree: missing gate evidence.");
  }

  const runId = buildRunId(gate.changeId, ["worktree-apply", worktreeId, gate.diffHash, options.commit ? "commit" : "no-commit"]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = buildApplyPaths(directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    diff: `${relativeDir}/diff.patch`,
    diffStat: `${relativeDir}/diff-stat.txt`,
    apply: `${relativeDir}/apply.json`,
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId: gate.changeId,
    projectPath: project.path,
    runtime: "worktree-apply",
    executionMode: "direct",
    proposalOnly: false,
    command: ["git", "apply", "--binary", artifacts.diff],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
  };
  await writeJsonFile(paths.run, run);
  await writeFile(paths.context, "Worktree apply gate run. Source of truth is apply.json and diff.patch.\n", "utf8");
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, "", "utf8");
  await writeFile(paths.diff, (await collectWorktreeDiff(memory, worktreeId, gate.changeId)).diff, "utf8");
  await writeFile(paths.diffStat, gate.diffStat, "utf8");
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { runtime: "worktree-apply", worktreeId } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.apply.started", runId, data: { worktreeId, diffHash: gate.diffHash } });

  let applyStatus: "applied" | "failed" = "failed";
  let commitHash: string | undefined;
  let sourceHeadAfter: string | null = null;
  try {
    run = { ...run, status: "running" };
    await writeJsonFile(paths.run, run);
    await git(project.path, ["apply", "--binary", paths.diff]);
    if (options.commit) {
      await git(project.path, ["add", "-A"]);
      const message = options.message?.trim() || `Apply ${gate.changeId} from ${worktreeId}`;
      await git(project.path, ["commit", "-m", message]);
      commitHash = await getGitCommit(project.path) ?? undefined;
    }
    sourceHeadAfter = await getGitCommit(project.path);
    await markWorktreeApplied(memory, worktreeId, {
      applyRunId: runId,
      worktreeDiffHash: gate.diffHash,
      appliedCommit: commitHash,
    });
    applyStatus = "applied";
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.apply.completed", runId, data: { committed: options.commit === true, commitHash } });
  } catch (error) {
    await writeFile(paths.stderr, error instanceof Error ? `${error.message}\n` : `${String(error)}\n`, "utf8");
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.apply.failed", runId, data: { error: error instanceof Error ? error.message : String(error) } });
  }

  const apply = {
    version: "1.0" as const,
    changeId: gate.changeId,
    worktreeId,
    worktreeDiffHash: gate.diffHash,
    validationId: gate.validation.id,
    auditId: gate.audit.id,
    reviewAuditId: gate.reviewAuditId,
    sourceHeadBefore: gate.sourceHead,
    sourceHeadAfter,
    committed: options.commit === true && applyStatus === "applied",
    ...(commitHash ? { commitHash } : {}),
    status: applyStatus,
  };
  await writeJsonFile(paths.apply, apply);
  const status: RunStatus = applyStatus === "applied" ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, status === "completed" ? 0 : 1);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  return { run, apply };
}

export async function discardWorktree(project: ManagedProject, worktreeId: string): Promise<WorktreeDiscardResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Worktree discard");
  const status = await getChangeStatus(project);
  assertRunnableChange(status);
  const changeId = status.change?.id ?? status.activeChanges[0]?.name;
  if (!changeId) throw new Error("Cannot discard worktree without an active change id.");
  const worktree = await getWorktreeStatus(memory, worktreeId);
  if (worktree.changeId !== changeId) {
    throw new Error(`Cannot discard worktree ${worktreeId}: it belongs to change ${worktree.changeId}, not ${changeId}.`);
  }
  if (worktree.status === "applied") {
    throw new Error(`Cannot discard applied worktree ${worktreeId}. Use worktree remove for cleanup.`);
  }

  const runId = buildRunId(changeId, ["worktree-discard", worktreeId]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = buildDiscardPaths(directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    discard: `${relativeDir}/discard.json`,
  };
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "worktree-discard",
    executionMode: "direct",
    proposalOnly: false,
    command: ["worktree", "discard", worktreeId],
    status: "running",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
  };
  await writeJsonFile(paths.run, run);
  await writeFile(paths.context, "Worktree discard gate run. Discard removes an unapplied proposal checkout only.\n", "utf8");
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, "", "utf8");
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { runtime: "worktree-discard", worktreeId } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.started", runId, data: { worktreeId } });
  let discardStatus: "discarded" | "failed" = "failed";
  try {
    await removeWorktree(memory, worktreeId, true);
    discardStatus = "discarded";
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.completed", runId, data: { worktreeId } });
  } catch (error) {
    await writeFile(paths.stderr, error instanceof Error ? `${error.message}\n` : `${String(error)}\n`, "utf8");
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.failed", runId, data: { error: error instanceof Error ? error.message : String(error) } });
  }
  const discard = { version: "1.0" as const, changeId, worktreeId, status: discardStatus };
  await writeJsonFile(paths.discard, discard);
  const runStatus: RunStatus = discardStatus === "discarded" ? "completed" : "failed";
  run = await finishRun(paths.run, run, runStatus, runStatus === "completed" ? 0 : 1);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: runStatus === "completed" ? "run.completed" : "run.failed", runId });
  return { run, discard };
}

async function evaluateApplyGate(project: ManagedProject, memory: ResolvedMemory, worktreeId: string): Promise<WorktreeGateState> {
  const status = await getChangeStatus(project);
  assertRunnableChange(status);
  const changeId = status.change?.id ?? status.activeChanges[0]?.name;
  if (!changeId) throw new Error("Cannot evaluate apply gate without an active change id.");
  const diff = await collectWorktreeDiff(memory, worktreeId, changeId);
  const sourceHead = await getGitCommit(project.path);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  if (diff.worktree.status === "applied") blockingIssues.push(`Worktree is already applied: ${worktreeId}.`);
  if (!diff.diff.trim()) blockingIssues.push("Worktree has no diff to apply.");
  if ((await isGitDirty(project.path)) === true) blockingIssues.push("Source repo has uncommitted changes; apply requires a clean source repo.");
  if (sourceHead !== diff.worktree.baseCommit) {
    blockingIssues.push(`Source HEAD drifted from worktree base commit. Expected ${diff.worktree.baseCommit}; found ${sourceHead ?? "unknown"}.`);
  }

  const validation = await findLatestValidation(memory, changeId, worktreeId, diff.diffHash);
  if (!validation) {
    blockingIssues.push("No passed validation found for the current worktree diff hash.");
  } else if (validation.status !== "passed") {
    blockingIssues.push(`Latest matching validation failed: ${validation.id}.`);
  }

  const audit = await findLatestAudit(memory, changeId, worktreeId, diff.diffHash);
  if (!audit) {
    blockingIssues.push("No approved audit found for the current worktree diff hash.");
  } else if (audit.status !== "approved" && audit.status !== "approved-with-notes") {
    blockingIssues.push(`Latest matching audit is not approved: ${audit.id} (${audit.status}).`);
  }

  const reviewAuditId = await readAcceptedReviewAuditId(memory, status.activeChanges[0]?.path);
  if (!reviewAuditId) {
    blockingIssues.push("reviews/review.md does not reference an accepted Audit ID.");
  } else if (audit && reviewAuditId !== audit.id) {
    blockingIssues.push(`reviews/review.md accepts audit ${reviewAuditId}, not latest matching audit ${audit.id}.`);
  }

  return {
    ready: blockingIssues.length === 0,
    warnings,
    blockingIssues,
    changeId,
    worktree: diff.worktree,
    diffHash: diff.diffHash,
    diffStat: diff.diffStat,
    validation,
    audit,
    reviewAuditId,
    sourceHead,
  };
}

async function findLatestValidation(memory: ResolvedMemory, changeId: string, worktreeId: string, diffHash: string): Promise<ValidationResult | null> {
  return (await listValidationResults(memory, changeId)).find((item) => item.worktreeId === worktreeId && item.worktreeDiffHash === diffHash) ?? null;
}

async function findLatestAudit(memory: ResolvedMemory, changeId: string, worktreeId: string, diffHash: string): Promise<AuditResult | null> {
  return (await listAuditResults(memory, changeId)).find((item) => item.worktreeId === worktreeId && item.worktreeDiffHash === diffHash) ?? null;
}

async function readAcceptedReviewAuditId(memory: ResolvedMemory, activeChangePath: string | undefined): Promise<string | null> {
  if (!activeChangePath) return null;
  const reviewPath = join(memory.memoryRoot, activeChangePath, "reviews", "review.md");
  if (!existsSync(reviewPath)) return null;
  const content = await readFile(reviewPath, "utf8");
  const match = /^\s*-?\s*Audit ID:\s*(\S+)\s*$/im.exec(content);
  return match?.[1] ?? null;
}

function buildApplyPaths(directory: string): Record<"run" | "context" | "events" | "stdout" | "stderr" | "diff" | "diffStat" | "apply", string> {
  return {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    diff: join(directory, "diff.patch"),
    diffStat: join(directory, "diff-stat.txt"),
    apply: join(directory, "apply.json"),
  };
}

function buildDiscardPaths(directory: string): Record<"run" | "context" | "events" | "stdout" | "stderr" | "discard", string> {
  return {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    discard: join(directory, "discard.json"),
  };
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number): Promise<RunMetadata> {
  const finished = {
    ...run,
    status,
    exitCode,
    signal: null,
    finishedAt: new Date().toISOString(),
  };
  await writeJsonFile(path, finished);
  return finished;
}
