import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getChangeStatus } from "../change/manager.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { buildCodexWorkspaceWriteArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { detectCodexAppServerCapability, runCodexAppServerTurn } from "../codex/app-server.js";
import { CodexCompletionTracker, codexLifecycleTiming, type CodexCompletionSnapshot } from "../codex/completion.js";
import { createCodexJsonlStreamParser, extractFinalMessageFromCodexJsonl, type CodexJsonlStreamEvent } from "../codex/jsonl.js";
import { readPromptInput } from "../codex/prompt.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../agent/catalog.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitStatusShort } from "../project/git.js";
import { appendRunEvent, buildContextProjection, buildRunId, listRuns, readRun } from "../run/manager.js";
import { isRunStopRequested } from "../run/control.js";
import { executeProcessStreaming, type ProcessExecutionResult } from "../run/process.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, RunStatus, RunWorktreeInfo } from "../types/index.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { createWorktree, getWorktreeMetadataPath } from "../worktree/manager.js";
import { composeCoderPrompt } from "./prompt.js";

export interface CodeRunOptions {
  changeId?: string;
  taskIds?: string[];
  taskRunId?: string;
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
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const changeStatus = target.status;
  const changeId = target.changeId;

  const selectedTasks = normalizeAndValidateTasks(changeStatus, options.taskIds ?? []);
  const role = await resolveAgentRole(memory, "coder-agent");
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
    appServerEvents: `${relativeDir}/app-server-events.jsonl`,
    appServerStderr: `${relativeDir}/app-server-stderr.log`,
    appServerLastMessage: `${relativeDir}/app-server-last-message.md`,
    agentSession: `${relativeDir}/agent-session.json`,
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
    appServerEvents: join(directory, "app-server-events.jsonl"),
    appServerStderr: join(directory, "app-server-stderr.log"),
    appServerLastMessage: join(directory, "app-server-last-message.md"),
    agentSession: join(directory, "agent-session.json"),
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
    ...(selectedTasks.length > 0 ? { taskIds: selectedTasks } : {}),
    ...(options.taskRunId ? { taskRunId: options.taskRunId } : {}),
    promptStack: ["agent-role", "active-change", "worktree", "task-scope", "human-prompt"],
    agent: buildRunAgentRecord(role),
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "coder-codex", worktree, taskIds: selectedTasks, taskRunId: options.taskRunId } });
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

  const appServerCapabilities = await detectCodexAppServerCapability();
  if (appServerCapabilities.available) {
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.capabilities.detected", runId, data: { supportsStdio: appServerCapabilities.supportsStdio } });
    run = { ...run, command: ["codex", "app-server", "--listen", "stdio://"], status: "running" };
    await writeJsonFile(paths.run, run);
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "coder.started", runId, data: { cwd: worktree.checkoutPath, command: run.command, adapter: "codex-app-server" } });
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.started", runId, data: { cwd: worktree.checkoutPath } });
    emitCodeLiveRunStarted(options.live, run);
    emitCodeLiveStatus(options.live, { runId, status: "running", label: "Coder" });
    const appServerResult = await runCodexAppServerTurn({
      projectId: project.id,
      changeId,
      roleId: "coder-agent",
      runId,
      cwd: worktree.checkoutPath,
      prompt,
      sandboxPolicy: "workspace-write",
      paths: {
        events: paths.appServerEvents,
        stderr: paths.appServerStderr,
        lastMessage: paths.appServerLastMessage,
        session: paths.agentSession,
      },
      onTextDelta: (delta) => {
        try {
          options.live?.onCodexEvent?.({ type: "text_delta", delta, runId, raw: { source: "app-server" } });
        } catch (error) {
          emitCodeLiveCallbackError(options.live, runId, error);
        }
      },
      onNotification: (notification) => {
        try {
          options.live?.onCodexEvent?.({
            type: "readable_event",
            event: {
              kind: notification.method.includes("commandExecution") ? "command" : "status",
              phase: notification.method,
              title: notification.method.includes("commandExecution") ? "Command event" : "Codex app-server activity",
              summary: notification.method,
            },
            runId,
            raw: notification.raw,
          });
        } catch (error) {
          emitCodeLiveCallbackError(options.live, runId, error);
        }
      },
      onError: (error) => emitCodeLiveCallbackError(options.live, runId, error),
    });
    await writeFile(paths.lastMessage, appServerResult.lastMessage || appServerResult.error || "# Coder App-Server Output Not Captured\n", "utf8");
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.exited", runId, data: { status: appServerResult.status, threadId: appServerResult.threadId, turnId: appServerResult.turnId, error: appServerResult.error } });

    const diffResult = await collectWorktreeDiff(memory, worktree.worktreeId, changeId);
    await writeFile(paths.diff, diffResult.diff, "utf8");
    await writeFile(paths.diffStat, diffResult.diffStat, "utf8");
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "diff.collected", runId, data: { bytes: Buffer.byteLength(diffResult.diff, "utf8"), stat: diffResult.diffStat } });
    const sourceAfter = await getSortedSourceStatus(project.path);
    const sourceChanged = JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter);
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "source.checked", runId, data: { before: sourceBefore, after: sourceAfter, changed: sourceChanged } });
    const lastMessage = appServerResult.lastMessage || appServerResult.error || "";
    const warnings = [
      ...created.warnings,
      ...(diffResult.diff.trim() ? [] : ["Coder run completed without producing a worktree diff."]),
      ...(sourceChanged ? ["Source project git status changed during coder run; Codex may have modified outside the assigned worktree."] : []),
      ...(appServerResult.status === "interrupted" ? ["Coder app-server turn was interrupted by the user."] : []),
    ];
    await writeFile(paths.implementation, renderImplementationSummary({
      lastMessage,
      diffStat: diffResult.diffStat,
      diff: diffResult.diff,
      warnings,
      sourceBefore,
      sourceAfter,
    }), "utf8");
    const status: RunStatus = appServerResult.status === "completed" && !sourceChanged ? "completed" : "failed";
    run = await finishRun(paths.run, run, status, sourceChanged ? 1 : status === "completed" ? 0 : 1, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId, data: { warnings, adapter: "codex-app-server" } });
    emitCodeLiveStatus(options.live, { runId, status, label: "Coder" });
    return { run, warnings };
  }
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.unavailable", runId, data: { errors: appServerCapabilities.errors } });
  emitCodeLiveStatus(options.live, { runId, status: "fallback-next-turn", label: "实时引导不可用" });

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
  const completion = new CodexCompletionTracker({ lastMessagePath: paths.lastMessage });
  const lifecycleTiming = codexLifecycleTiming(15 * 60 * 1000);
  const parser = createCodexJsonlStreamParser((event) => {
    completion.handleEvent(event);
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
    completionSignal: () => completion.isComplete(),
    stopSignal: () => isRunStopRequested(runId),
    completionGraceMs: lifecycleTiming.completionGraceMs,
    killGraceMs: lifecycleTiming.killGraceMs,
    timeoutMs: lifecycleTiming.timeoutMs,
  });
  parser.flush();
  const codexCompletion = completion.snapshot();
  const processDiagnostics = processDiagnosticsData(processResult, codexCompletion);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { exitCode: processResult.exitCode, signal: processResult.signal, ...processDiagnostics } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "coder.exited", runId, data: { exitCode: processResult.exitCode, signal: processResult.signal, ...processDiagnostics } });

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

  const processSucceeded = processResult.exitCode === 0 || (processResult.terminationReason === "completion-grace-expired" && completion.isComplete());
  const status: RunStatus = processSucceeded && !sourceChanged ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, sourceChanged ? 1 : processSucceeded ? 0 : processResult.exitCode, processResult.signal);
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
