import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getChangeStatus } from "../change/manager.js";
import { buildCodexWorkspaceWriteArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { createCodexJsonlStreamParser, extractFinalMessageFromCodexJsonl, type CodexJsonlStreamEvent } from "../codex/jsonl.js";
import { readPromptInput } from "../codex/prompt.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../agent/catalog.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitStatusShort } from "../project/git.js";
import { appendRunEvent, assertRunnableChange, buildContextProjection, buildRunId, listRuns, readRun } from "../run/manager.js";
import { executeProcessStreaming } from "../run/process.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, RunStatus, RunWorktreeInfo } from "../types/index.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { createWorktree, getWorktreeMetadataPath } from "../worktree/manager.js";
import { composeCoderPrompt } from "./prompt.js";

export interface CodeRunOptions {
  taskIds?: string[];
  prompt?: string;
  promptFile?: string;
  model?: string;
  profile?: string;
  live?: CodeRunLiveCallbacks;
}

export interface CodeRunResult {
  run: RunMetadata;
  warnings: string[];
}

export interface CodeRunLiveCallbacks {
  onRunStarted?: (run: RunMetadata) => void;
  onStatus?: (event: { runId: string; status: string; label?: string }) => void;
  onCodexEvent?: (event: CodexJsonlStreamEvent & { runId: string }) => void;
  onStderrChunk?: (event: { runId: string; chunk: string }) => void;
  onCallbackError?: (event: { runId: string; error: unknown }) => void;
}

function emitCodeLiveStatus(live: CodeRunLiveCallbacks | undefined, event: { runId: string; status: string; label?: string }): void {
  try {
    live?.onStatus?.(event);
  } catch (error) {
    emitCodeLiveCallbackError(live, event.runId, error);
  }
}

function emitCodeLiveRunStarted(live: CodeRunLiveCallbacks | undefined, run: RunMetadata): void {
  try {
    live?.onRunStarted?.(run);
  } catch (error) {
    emitCodeLiveCallbackError(live, run.id, error);
  }
}

function emitCodeLiveCallbackError(live: CodeRunLiveCallbacks | undefined, runId: string, error: unknown): void {
  try {
    live?.onCallbackError?.({ runId, error });
  } catch {
    // Live callbacks are best-effort and must not affect run lifecycle.
  }
}

export interface CodeStatusResult {
  activeChangeId: string | null;
  latest: RunMetadata | null;
  runs: RunMetadata[];
}

export async function startCodeRun(project: ManagedProject, options: CodeRunOptions = {}): Promise<CodeRunResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Code run");
  const changeStatus = await getChangeStatus(project);
  assertRunnableChange(changeStatus);
  const changeId = changeStatus.change?.id ?? changeStatus.activeChanges[0]?.name;
  if (!changeId) throw new Error("Cannot start code run without an active change id.");

  const selectedTasks = normalizeAndValidateTasks(changeStatus, options.taskIds ?? []);
  const role = await resolveAgentRole(memory, "coder");
  const extraPrompt = options.prompt || options.promptFile
    ? await readPromptInput({ prompt: options.prompt, promptFile: options.promptFile })
    : undefined;
  const runId = buildRunId(changeId, ["coder-codex", ...selectedTasks, extraPrompt ?? ""]);
  const sourceBefore = await getSortedSourceStatus(project.path);
  const created = await createWorktree(project, memory, changeId, { runId });
  const worktree: RunWorktreeInfo = {
    worktreeId: created.metadata.worktreeId,
    branchName: created.metadata.branchName,
    baseRef: created.metadata.baseRef,
    baseCommit: created.metadata.baseCommit,
    checkoutPath: created.metadata.checkoutPath,
    metadataPath: getWorktreeMetadataPath(memory, created.metadata.worktreeId),
  };

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
    diff: `${relativeDir}/diff.patch`,
    diffStat: `${relativeDir}/diff-stat.txt`,
    implementation: `${relativeDir}/implementation.md`,
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
    diff: join(directory, "diff.patch"),
    diffStat: join(directory, "diff-stat.txt"),
    implementation: join(directory, "implementation.md"),
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "coder-codex",
    executionMode: "worktree",
    proposalOnly: true,
    command: ["codex"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    worktree,
    promptStack: ["agent-role", "active-change", "worktree", "task-scope", "human-prompt"],
    agent: buildRunAgentRecord(role),
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "coder-codex", worktree } });
  await appendRunEvent(paths.events, { timestamp: now, type: "worktree.created", runId, data: { worktreeId: worktree.worktreeId, checkoutPath: worktree.checkoutPath } });
  emitCodeLiveStatus(options.live, { runId, status: "preparing", label: "Coder" });

  const context = buildContextProjection(changeStatus);
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });
  emitCodeLiveStatus(options.live, { runId, status: "context-prepared", label: "Coder" });
  const prompt = await composeCoderPrompt({
    context,
    changeStatus,
    worktree: created.metadata,
    sourceProjectPath: project.path,
    selectedTasks,
    extraPrompt,
    coderProfile: buildAgentSystemPrompt(role),
  });
  await writeFile(paths.prompt, prompt, "utf8");

  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId, data: { capabilities } });
    const message = [
      "# Coder Unavailable",
      "",
      "AHO could not safely start Codex in workspace-write non-interactive mode.",
      "",
      ...capabilities.errors.map((error) => `- ${error}`),
      "",
    ].join("\n");
    await writeEmptyCodeArtifacts(paths, message);
    run = await finishRun(paths.run, run, "failed", 1, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.failed", runId });
    emitCodeLiveStatus(options.live, { runId, status: "failed", label: "Coder" });
    return { run, warnings: capabilities.errors };
  }
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId, data: { capabilities } });

  const argv = buildCodexWorkspaceWriteArgv(capabilities, {
    projectPath: worktree.checkoutPath,
    lastMessagePath: paths.lastMessage,
    model: options.model,
    profile: options.profile,
  });
  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "coder.started", runId, data: { cwd: worktree.checkoutPath, command: run.command } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { cwd: worktree.checkoutPath, command: run.command } });
  emitCodeLiveRunStarted(options.live, run);
  emitCodeLiveStatus(options.live, { runId, status: "running", label: "Coder" });
  const parser = createCodexJsonlStreamParser((event) => {
    try {
      options.live?.onCodexEvent?.({ ...event, runId });
    } catch (error) {
      try {
        emitCodeLiveCallbackError(options.live, runId, error);
      } catch {
        // Live callbacks are best-effort and must not skip run finalization.
      }
    }
  });

  const processResult = await executeProcessStreaming({
    cwd: worktree.checkoutPath,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    onStderrChunk: (text) => options.live?.onStderrChunk?.({ runId, chunk: text }),
    onCallbackError: (_stream, error) => {
      try {
        emitCodeLiveCallbackError(options.live, runId, error);
      } catch {
        // Live callbacks are best-effort and must not affect child lifecycle.
      }
    },
  });
  parser.flush();
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { exitCode: processResult.exitCode, signal: processResult.signal } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "coder.exited", runId, data: { exitCode: processResult.exitCode, signal: processResult.signal } });

  const lastMessage = await ensureLastMessage(paths.lastMessage, processResult.stdoutSample, processResult.stderrSample);
  const diffResult = await collectWorktreeDiff(memory, worktree.worktreeId, changeId);
  await writeFile(paths.diff, diffResult.diff, "utf8");
  await writeFile(paths.diffStat, diffResult.diffStat, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "diff.collected", runId, data: { bytes: Buffer.byteLength(diffResult.diff, "utf8"), stat: diffResult.diffStat } });

  const sourceAfter = await getSortedSourceStatus(project.path);
  const sourceChanged = JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "source.checked", runId, data: { before: sourceBefore, after: sourceAfter, changed: sourceChanged } });

  const warnings = [
    ...created.warnings,
    ...(diffResult.diff.trim() ? [] : ["Coder run completed without producing a worktree diff."]),
    ...(sourceChanged ? ["Source project git status changed during coder run; Codex may have modified outside the assigned worktree."] : []),
  ];
  await writeFile(paths.implementation, renderImplementationSummary({
    lastMessage,
    diffStat: diffResult.diffStat,
    diff: diffResult.diff,
    warnings,
    sourceBefore,
    sourceAfter,
  }), "utf8");

  const status: RunStatus = processResult.exitCode === 0 && !sourceChanged ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, sourceChanged ? 1 : processResult.exitCode, processResult.signal);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId, data: { warnings } });
  emitCodeLiveStatus(options.live, { runId, status, label: "Coder" });

  return { run, warnings };
}

export async function getCodeStatus(project: ManagedProject): Promise<CodeStatusResult> {
  const changeStatus = await getChangeStatus(project);
  const changeId = changeStatus.change?.id ?? null;
  const runs = (await listRuns(project)).filter((run) => run.runtime === "coder-codex" && (!changeId || run.changeId === changeId));
  return { activeChangeId: changeId, latest: runs[0] ?? null, runs };
}

export async function listCodeRuns(project: ManagedProject): Promise<RunMetadata[]> {
  return (await listRuns(project)).filter((run) => run.runtime === "coder-codex");
}

export async function showCodeRun(project: ManagedProject, runId: string): Promise<RunMetadata> {
  const run = await readRun(project, runId);
  if (run.runtime !== "coder-codex") throw new Error(`Run ${runId} is not a coder run.`);
  return run;
}

function normalizeAndValidateTasks(changeStatus: { acMap: { tasks: Array<{ id: string }> } | null }, taskIds: string[]): string[] {
  const normalized = taskIds.map((item) => item.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) return [];
  const known = new Set((changeStatus.acMap?.tasks ?? []).map((task) => task.id.toUpperCase()));
  const unknown = normalized.filter((task) => !known.has(task));
  if (unknown.length > 0) {
    throw new Error(`Unknown task id(s): ${unknown.join(", ")}.`);
  }
  return Array.from(new Set(normalized));
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

async function getSortedSourceStatus(projectPath: string): Promise<string[]> {
  return (await getGitStatusShort(projectPath)).slice().sort();
}

async function writeEmptyCodeArtifacts(paths: { stdout: string; stderr: string; codexEvents: string; lastMessage: string; diff: string; diffStat: string; implementation: string }, message: string): Promise<void> {
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, message, "utf8");
  await writeFile(paths.codexEvents, "", "utf8");
  await writeFile(paths.lastMessage, message, "utf8");
  await writeFile(paths.diff, "", "utf8");
  await writeFile(paths.diffStat, "", "utf8");
  await writeFile(paths.implementation, message, "utf8");
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
    "Blockers / Follow-up:",
    "- AHO did not find a final Codex message in output-last-message or JSONL stdout.",
    stderr.trim() ? `- stderr sample: ${stderr.trim()}` : "- stderr sample: none",
    "",
  ].join("\n");
  await writeFile(path, fallback, "utf8");
  return fallback;
}

function renderImplementationSummary(input: { lastMessage: string; diffStat: string; diff: string; warnings: string[]; sourceBefore: string[]; sourceAfter: string[] }): string {
  const modifiedFiles = extractModifiedFilesFromDiff(input.diff);
  return [
    "# Implementation Summary",
    "",
    "## Coder Final Message",
    "",
    input.lastMessage.trim() || "(empty)",
    "",
    "## Modified Files",
    "",
    ...(modifiedFiles.length ? modifiedFiles.map((file) => `- ${file}`) : ["- None detected."]),
    "",
    "## Diff Stat",
    "",
    input.diffStat.trim() || "No diff stat.",
    "",
    "## Warnings",
    "",
    ...(input.warnings.length ? input.warnings.map((warning) => `- ${warning}`) : ["- None."]),
    "",
    "## Source Repo Status Check",
    "",
    `Before: ${input.sourceBefore.join(" | ") || "(clean)"}`,
    `After: ${input.sourceAfter.join(" | ") || "(clean)"}`,
    "",
  ].join("\n");
}

function extractModifiedFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match) files.add(match[2]);
  }
  return Array.from(files).sort();
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
