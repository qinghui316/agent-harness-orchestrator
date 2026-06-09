import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { collectWorktreeDiff } from "../audit/diff.js";
import { buildCodexWorkspaceWriteArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { CodexCompletionTracker, codexLifecycleTiming } from "../codex/completion.js";
import { createCodexJsonlStreamParser } from "../codex/jsonl.js";
import { writeJsonFile } from "../fs/json.js";
import { appendRunEvent } from "../run/manager.js";
import { isRunStopRequested } from "../run/control.js";
import { executeProcessStreaming } from "../run/process.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, RunStatus, RunWorktreeInfo } from "../types/index.js";
import { ensureLastMessage, getSortedSourceStatus, processDiagnosticsData, renderImplementationSummary, writeEmptyCodeArtifacts } from "./artifacts.js";
import { emitCodeLiveCallbackError, emitCodeLiveRunStarted, emitCodeLiveStatus } from "./live-events.js";
import { finishRun, type CodeRunPaths } from "./run-session.js";
import type { CodeRunOptions, CodeRunResult } from "./types.js";

export async function runCodexExecCode(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  run: RunMetadata;
  paths: CodeRunPaths;
  changeId: string;
  worktree: RunWorktreeInfo;
  prompt: string;
  sourceBefore: string[];
  createdWarnings: string[];
  options: CodeRunOptions;
}): Promise<CodeRunResult> {
  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId: input.run.id, data: { capabilities } });
    const message = [
      "# Coder Unavailable",
      "",
      "AHO could not safely start Codex in workspace-write non-interactive mode.",
      "",
      ...capabilities.errors.map((error) => `- ${error}`),
      "",
    ].join("\n");
    await writeEmptyCodeArtifacts(input.paths, message);
    const failedRun = await finishRun(input.paths.run, input.run, "failed", 1, null);
    await appendRunEvent(input.paths.events, { timestamp: failedRun.finishedAt ?? new Date().toISOString(), type: "run.failed", runId: input.run.id });
    emitCodeLiveStatus(input.options.live, { runId: input.run.id, status: "failed", label: "Coder" });
    return { run: failedRun, warnings: capabilities.errors };
  }
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId: input.run.id, data: { capabilities } });

  const argv = buildCodexWorkspaceWriteArgv(capabilities, {
    projectPath: input.worktree.checkoutPath,
    lastMessagePath: input.paths.lastMessage,
    model: input.options.model,
    profile: input.options.profile,
  });
  let run: RunMetadata = { ...input.run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(input.paths.run, run);
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "coder.started", runId: run.id, data: { cwd: input.worktree.checkoutPath, command: run.command } });
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId: run.id, data: { cwd: input.worktree.checkoutPath, command: run.command } });
  emitCodeLiveRunStarted(input.options.live, run);
  emitCodeLiveStatus(input.options.live, { runId: run.id, status: "running", label: "Coder" });

  const completion = new CodexCompletionTracker({ lastMessagePath: input.paths.lastMessage });
  const lifecycleTiming = codexLifecycleTiming(15 * 60 * 1000);
  const parser = createCodexJsonlStreamParser((event) => {
    completion.handleEvent(event);
    try {
      input.options.live?.onCodexEvent?.({ ...event, runId: run.id });
    } catch (error) {
      emitCodeLiveCallbackError(input.options.live, run.id, error);
    }
  });

  const processResult = await executeProcessStreaming({
    cwd: input.worktree.checkoutPath,
    command: argv.command,
    args: argv.args,
    stdin: input.prompt,
    stdoutPath: input.paths.stdout,
    stderrPath: input.paths.stderr,
    mirrorStdoutPath: input.paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    onStderrChunk: (text) => input.options.live?.onStderrChunk?.({ runId: run.id, chunk: text }),
    onCallbackError: (_stream, error) => {
      emitCodeLiveCallbackError(input.options.live, run.id, error);
    },
    completionSignal: () => completion.isComplete(),
    stopSignal: () => isRunStopRequested(run.id),
    completionGraceMs: lifecycleTiming.completionGraceMs,
    killGraceMs: lifecycleTiming.killGraceMs,
    timeoutMs: lifecycleTiming.timeoutMs,
  });
  parser.flush();
  const codexCompletion = completion.snapshot();
  const processDiagnostics = processDiagnosticsData(processResult, codexCompletion);
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId: run.id, data: { exitCode: processResult.exitCode, signal: processResult.signal, ...processDiagnostics } });
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "coder.exited", runId: run.id, data: { exitCode: processResult.exitCode, signal: processResult.signal, ...processDiagnostics } });

  const lastMessage = await ensureLastMessage(input.paths.lastMessage, processResult.stdoutSample, processResult.stderrSample);
  const diffResult = await collectWorktreeDiff(input.memory, input.worktree.worktreeId, input.changeId);
  await writeFile(input.paths.diff, diffResult.diff, "utf8");
  await writeFile(input.paths.diffStat, diffResult.diffStat, "utf8");
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "diff.collected", runId: run.id, data: { bytes: Buffer.byteLength(diffResult.diff, "utf8"), stat: diffResult.diffStat } });

  const sourceAfter = await getSortedSourceStatus(input.project.path);
  const sourceChanged = JSON.stringify(input.sourceBefore) !== JSON.stringify(sourceAfter);
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "source.checked", runId: run.id, data: { before: input.sourceBefore, after: sourceAfter, changed: sourceChanged } });

  const warnings = [
    ...input.createdWarnings,
    ...(diffResult.diff.trim() ? [] : ["Coder run completed without producing a worktree diff."]),
    ...(sourceChanged ? ["Source project git status changed during coder run; Codex may have modified outside the assigned worktree."] : []),
  ];
  await writeFile(input.paths.implementation, renderImplementationSummary({
    lastMessage,
    diffStat: diffResult.diffStat,
    diff: diffResult.diff,
    warnings,
    sourceBefore: input.sourceBefore,
    sourceAfter,
  }), "utf8");

  const processSucceeded = processResult.exitCode === 0 || (processResult.terminationReason === "completion-grace-expired" && completion.isComplete());
  const status: RunStatus = processSucceeded && !sourceChanged ? "completed" : "failed";
  run = await finishRun(input.paths.run, run, status, sourceChanged ? 1 : processSucceeded ? 0 : processResult.exitCode, processResult.signal);
  await appendRunEvent(input.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId: run.id, data: { warnings } });
  emitCodeLiveStatus(input.options.live, { runId: run.id, status, label: "Coder" });

  return { run, warnings };
}
