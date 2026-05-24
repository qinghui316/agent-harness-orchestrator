import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getChangeStatus } from "../change/manager.js";
import { buildCodexReadonlyArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { CodexCompletionTracker, codexLifecycleTiming, type CodexCompletionSnapshot } from "../codex/completion.js";
import { createCodexJsonlStreamParser, extractFinalMessageFromCodexJsonl } from "../codex/jsonl.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../agent/catalog.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getLatestValidationSummary } from "../validation/artifacts.js";
import type { AuditResult, AuditStatus, AuditSummary, ManagedProject, ResolvedMemory, RunMetadata, RunStatus } from "../types/index.js";
import { appendRunEvent, assertRunnableChange, buildContextProjection, buildRunId } from "../run/manager.js";
import { executeProcessStreaming, type ProcessExecutionResult } from "../run/process.js";
import { collectWorktreeDiff } from "./diff.js";
import { listAuditResults, readAuditResult, summarizeAudit } from "./artifacts.js";
import { parseAuditMessage } from "./parser.js";
import { composeAuditPrompt } from "./prompt.js";

export interface AuditRunOptions {
  worktreeId?: string;
  prompt?: string;
}

export interface AuditRunResult {
  run: RunMetadata;
  audit: AuditResult;
}

export interface AuditStatusResult {
  activeChangeId: string | null;
  latest: AuditSummary | null;
  audits: AuditSummary[];
}

export async function startAuditRun(project: ManagedProject, options: AuditRunOptions = {}): Promise<AuditRunResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Audit run");
  const changeStatus = await getChangeStatus(project);
  assertRunnableChange(changeStatus);
  const changeId = changeStatus.change?.id ?? changeStatus.activeChanges[0]?.name;
  if (!changeId) throw new Error("Cannot start audit without an active change id.");
  const role = await resolveAgentRole(memory, "auditor");

  const runId = buildRunId(changeId, ["auditor", options.worktreeId ?? "no-worktree", options.prompt ?? ""]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    prompt: `${relativeDir}/prompt.md`,
    codexEvents: `${relativeDir}/codex-events.jsonl`,
    lastMessage: `${relativeDir}/last-message.md`,
    audit: `${relativeDir}/audit.json`,
    auditMarkdown: `${relativeDir}/audit.md`,
    diff: `${relativeDir}/diff.patch`,
    diffStat: `${relativeDir}/diff-stat.txt`,
  };
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    prompt: join(directory, "prompt.md"),
    codexEvents: join(directory, "codex-events.jsonl"),
    lastMessage: join(directory, "last-message.md"),
    audit: join(directory, "audit.json"),
    auditMarkdown: join(directory, "audit.md"),
    diff: join(directory, "diff.patch"),
    diffStat: join(directory, "diff-stat.txt"),
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "auditor",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    promptStack: ["agent-role", "active-change", "diff", "validation", "human-prompt"],
    agent: buildRunAgentRecord(role),
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "auditor", worktreeId: options.worktreeId } });

  const context = buildContextProjection(changeStatus);
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });

  const diffResult = options.worktreeId ? await collectWorktreeDiff(memory, options.worktreeId, changeId) : null;
  const latestValidation = await getLatestValidationSummary(memory, changeId, diffResult
    ? { worktreeId: diffResult.worktree.worktreeId, worktreeDiffHash: diffResult.diffHash }
    : {});
  await writeFile(paths.diff, diffResult?.diff ?? "", "utf8");
  await writeFile(paths.diffStat, diffResult?.diffStat ?? "", "utf8");

  const prompt = await composeAuditPrompt({
    context,
    latestValidation: latestValidation ? JSON.stringify(latestValidation, null, 2) : "No validation run recorded for this change.",
    diff: diffResult?.diff,
    diffStat: diffResult?.diffStat,
    extraPrompt: options.prompt,
    auditorProfile: buildAgentSystemPrompt(role),
  });
  await writeFile(paths.prompt, prompt, "utf8");

  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId, data: { capabilities } });
    const message = [
      "Status: failed",
      "",
      "Finding: Codex auditor unavailable",
      "- Severity: note",
      "- Area: validation",
      `- Evidence: ${capabilities.errors.join("; ")}`,
      "- Recommendation: Install or configure Codex CLI safe read-only execution, then rerun audit.",
      "",
    ].join("\n");
    await writeFile(paths.lastMessage, message, "utf8");
    await writeFile(paths.auditMarkdown, message, "utf8");
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.codexEvents, "", "utf8");
    await writeFile(paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    const audit = await writeAudit(paths.audit, runId, changeId, "failed", message, {
      worktreeId: options.worktreeId,
      validationId: latestValidation?.id,
      worktreeDiffHash: diffResult?.diffHash,
      artifacts,
      startedAt: now,
    });
    run = await finishRun(paths.run, run, "failed", 1, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "audit.failed", runId, data: { auditStatus: audit.status } });
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.failed", runId });
    return { run, audit };
  }

  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId, data: { capabilities } });
  const cwd = diffResult?.worktree.checkoutPath ?? project.path;
  const argv = buildCodexReadonlyArgv(capabilities, {
    projectPath: cwd,
    lastMessagePath: paths.lastMessage,
    additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [],
  });
  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "audit.started", runId, data: { cwd, command: run.command } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { cwd, command: run.command } });

  const completion = new CodexCompletionTracker({ lastMessagePath: paths.lastMessage });
  const lifecycleTiming = codexLifecycleTiming(8 * 60 * 1000);
  const parser = createCodexJsonlStreamParser((event) => completion.handleEvent(event));
  const processResult = await executeProcessStreaming({
    cwd,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    completionSignal: () => completion.isComplete(),
    completionGraceMs: lifecycleTiming.completionGraceMs,
    killGraceMs: lifecycleTiming.killGraceMs,
    timeoutMs: lifecycleTiming.timeoutMs,
  });
  parser.flush();
  const codexCompletion = completion.snapshot();
  const processDiagnostics = processDiagnosticsData(processResult, codexCompletion);
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "codex.exited",
    runId,
    data: { exitCode: processResult.exitCode, signal: processResult.signal, ...processDiagnostics },
  });

  const lastMessage = await ensureLastMessage(paths.lastMessage, processResult.stdoutSample, processResult.stderrSample);
  await writeFile(paths.auditMarkdown, lastMessage, "utf8");
  const processSucceeded = processResult.exitCode === 0 || (processResult.terminationReason === "completion-grace-expired" && completion.isComplete());
  const audit = await writeAudit(paths.audit, runId, changeId, processSucceeded ? null : "failed", lastMessage, {
    worktreeId: options.worktreeId,
    validationId: latestValidation?.id,
    worktreeDiffHash: diffResult?.diffHash,
    artifacts,
    startedAt: now,
  });

  const status: RunStatus = processSucceeded ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, processSucceeded ? 0 : processResult.exitCode, processResult.signal);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: audit.status === "failed" ? "audit.failed" : "audit.completed", runId, data: { auditStatus: audit.status } });
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });

  return { run, audit };
}

export async function getAuditStatus(project: ManagedProject): Promise<AuditStatusResult> {
  const memory = await resolveProjectMemory(project);
  const changeStatus = await getChangeStatus(project);
  const changeId = changeStatus.change?.id ?? null;
  const audits = (await listAuditResults(memory, changeId ?? undefined)).map(summarizeAudit);
  return { activeChangeId: changeId, latest: audits[0] ?? null, audits };
}

export async function listAuditSummaries(project: ManagedProject): Promise<AuditSummary[]> {
  const memory = await resolveProjectMemory(project);
  return (await listAuditResults(memory)).map(summarizeAudit);
}

export async function showAudit(project: ManagedProject, auditId: string): Promise<AuditResult> {
  const memory = await resolveProjectMemory(project);
  return await readAuditResult(memory, auditId);
}

export async function acceptAudit(project: ManagedProject, auditId: string): Promise<{ audit: AuditResult; reviewPath: string }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Audit accept");
  const status = await getChangeStatus(project);
  assertRunnableChange(status);
  if (!status.change || status.activeChanges.length !== 1) throw new Error("Cannot accept audit without exactly one active change.");
  const audit = await readAuditResult(memory, auditId);
  if (audit.changeId !== status.change.id) {
    throw new Error(`Cannot accept audit for change ${audit.changeId}; current active change is ${status.change.id}.`);
  }
  if (audit.status !== "approved" && audit.status !== "approved-with-notes") {
    throw new Error(`Cannot accept audit with status ${audit.status}. Only approved and approved-with-notes can be accepted.`);
  }
  const reviewPath = join(memory.memoryRoot, status.activeChanges[0].path, "reviews", "review.md");
  const auditMarkdownPath = join(memory.runsRoot, audit.runId, "audit.md");
  const auditMarkdown = existsSync(auditMarkdownPath) ? await readFile(auditMarkdownPath, "utf8") : "";
  await writeFile(reviewPath, renderAcceptedReview(audit, auditMarkdown), "utf8");
  return { audit, reviewPath: displayArtifactPath(memory, reviewPath) };
}

function renderAcceptedReview(audit: AuditResult, auditMarkdown: string): string {
  return [
    `Status: ${audit.status}`,
    "",
    "## Accepted Audit",
    "",
    `- Audit ID: ${audit.id}`,
    `- Run ID: ${audit.runId}`,
    `- Change ID: ${audit.changeId}`,
    audit.validationId ? `- Validation ID: ${audit.validationId}` : "- Validation ID: none",
    audit.worktreeId ? `- Worktree ID: ${audit.worktreeId}` : "- Worktree ID: none",
    audit.worktreeDiffHash ? `- Worktree Diff Hash: ${audit.worktreeDiffHash}` : "- Worktree Diff Hash: none",
    `- Findings: ${audit.findings.length}`,
    "",
    "## Auditor Proposal",
    "",
    auditMarkdown.trim() || "No audit markdown captured.",
    "",
  ].join("\n");
}

async function writeAudit(
  path: string,
  runId: string,
  changeId: string,
  forcedStatus: AuditStatus | null,
  message: string,
  options: {
    worktreeId?: string;
    validationId?: string;
    worktreeDiffHash?: string;
    artifacts: RunMetadata["artifacts"];
    startedAt: string;
  },
): Promise<AuditResult> {
  const parsed = parseAuditMessage(message);
  const status = forcedStatus ?? parsed.status;
  const audit: AuditResult = {
    version: "1.0",
    id: runId,
    runId,
    changeId,
    status,
    worktreeId: options.worktreeId,
    validationId: options.validationId,
    worktreeDiffHash: options.worktreeDiffHash,
    startedAt: options.startedAt,
    finishedAt: new Date().toISOString(),
    findings: parsed.findings,
    artifacts: {
      audit: options.artifacts.audit ?? "",
      auditMarkdown: options.artifacts.auditMarkdown ?? "",
      lastMessage: options.artifacts.lastMessage ?? "",
      diff: options.artifacts.diff,
      diffStat: options.artifacts.diffStat,
    },
  };
  await writeJsonFile(path, audit);
  return audit;
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

function processDiagnosticsData(processResult: ProcessExecutionResult, completion: CodexCompletionSnapshot): Record<string, unknown> {
  return {
    timedOut: processResult.timedOut,
    terminated: processResult.terminated,
    terminationReason: processResult.terminationReason,
    codexCompletion: completion,
  };
}

async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const finished = {
    ...run,
    status,
    exitCode,
    signal,
    finishedAt: new Date().toISOString(),
  };
  await writeJsonFile(path, finished);
  return finished;
}

async function ensureLastMessage(path: string, stdout: string, stderr: string): Promise<string> {
  if (existsSync(path)) {
    const existing = await readFile(path, "utf8");
    if (existing.trim()) return existing;
  }

  const parsed = extractFinalMessageFromCodexJsonl(stdout);
  if (parsed) {
    await writeFile(path, parsed, "utf8");
    return parsed;
  }

  const fallback = [
    "Status: failed",
    "",
    "Finding: Auditor output was not captured",
    "- Severity: note",
    "- Area: validation",
    "- Evidence: AHO did not find a final Codex message in output-last-message or JSONL stdout.",
    "- Recommendation: Inspect stdout.log, codex-events.jsonl, and stderr.log for diagnostics.",
    "",
    stderr.trim() ? "## stderr sample" : "",
    stderr.trim(),
    "",
  ].join("\n");
  await writeFile(path, fallback, "utf8");
  return fallback;
}
