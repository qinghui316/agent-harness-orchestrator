import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { buildCodexWorkspaceWriteArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import type { CodexJsonlStreamEvent } from "../codex/jsonl.js";
import { resolveCodexEffectiveModel } from "../codex/model-settings.js";
import { CodexCompletionTracker, codexLifecycleTiming } from "../codex/completion.js";
import { createCodexJsonlStreamParser } from "../codex/jsonl.js";
import { writeJsonFile } from "../fs/json.js";
import { codexProviderRunMetadata } from "../provider-runtime/index.js";
import { appendExternalExecutionCompleted, appendExternalExecutionFailed, appendExternalExecutionRequested, appendPermissionProfileAttached } from "../runtime-continuity/events.js";
import { appendAgentEventEnvelope, createRuntimeContinuityArtifacts, markRuntimeContinuityStatus } from "../runtime-continuity/repository.js";
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
  roleId: string;
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

  const effectiveModel = await resolveCodexEffectiveModel(input.options.model);
  const argv = buildCodexWorkspaceWriteArgv(capabilities, {
    projectPath: input.worktree.checkoutPath,
    lastMessagePath: input.paths.lastMessage,
    model: effectiveModel.model ?? undefined,
    profile: input.options.profile,
    additionalReadDirs: input.memory.mode === "external-local" ? [input.memory.memoryRoot] : [],
  });
  let run: RunMetadata = { ...input.run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(input.paths.run, run);
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "coder.started", runId: run.id, data: { cwd: input.worktree.checkoutPath, command: run.command } });
  await appendRunEvent(input.paths.events, {
    timestamp: new Date().toISOString(),
    type: "codex.started",
    runId: run.id,
    data: {
      cwd: input.worktree.checkoutPath,
      command: run.command,
      model: effectiveModel.model,
      modelSource: effectiveModel.source,
      ...codexProviderRunMetadata({ model: effectiveModel.model, modelSource: effectiveModel.source, capabilities }),
    },
  });
  emitCodeLiveRunStarted(input.options.live, run);
  emitCodeLiveStatus(input.options.live, { runId: run.id, status: "running", label: "Coder" });
  let continuity = await createRuntimeContinuityArtifacts(input.paths, {
    projectId: input.project.id,
    changeId: input.changeId,
    runId: run.id,
    roleId: input.roleId,
    ...(run.taskRunId ? { taskRunId: run.taskRunId } : {}),
    adapter: "codex-exec",
    worktree: input.worktree,
    permissionProfile: workerPermissionProfileForRole(input.roleId),
    rawArtifactRefs: [
      input.run.artifacts.codexEvents,
      input.run.artifacts.stdout,
      input.run.artifacts.stderr,
      input.run.artifacts.lastMessage,
    ].filter((ref): ref is string => Boolean(ref)),
    sandboxPolicy: "workspace-write",
  });
  continuity = await markRuntimeContinuityStatus(input.paths, continuity, "running");
  const continuityWrites: Promise<void>[] = [];
  const recordContinuityWrite = (promise: Promise<unknown>): void => {
    continuityWrites.push(promise.then(() => undefined).catch((error) => appendRuntimeContinuityFailure(input.paths, run.id, error)));
  };
  const recordContinuity = (event: CodexJsonlStreamEvent): void => {
    recordContinuityWrite(appendAgentEventEnvelope(input.paths, continuity.session, continuity.eventSource, {
      eventType: event.type,
      summary: summarizeCodexEvent(event),
      raw: rawRecord(event),
    }));
  };
  recordContinuityWrite(appendPermissionProfileAttached(input.paths, continuity, { source: "code.codex-exec" }));
  recordContinuityWrite(appendExternalExecutionRequested(input.paths, continuity, {
    requestId: `${run.id}:codex-exec`,
    command: argv.command,
    args: argv.args,
    cwd: input.worktree.checkoutPath,
    adapter: "codex-exec",
  }));

  const completion = new CodexCompletionTracker({ lastMessagePath: input.paths.lastMessage });
  const lifecycleTiming = codexLifecycleTiming(15 * 60 * 1000);
  const parser = createCodexJsonlStreamParser((event) => {
    completion.handleEvent(event);
    recordContinuity(event);
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
  const processSucceeded = processResult.exitCode === 0 || (processResult.terminationReason === "completion-grace-expired" && completion.isComplete());
  recordContinuityWrite((processSucceeded
    ? appendExternalExecutionCompleted(input.paths, continuity, {
      requestId: `${run.id}:codex-exec`,
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      status: "completed",
      raw: processDiagnostics,
    })
    : appendExternalExecutionFailed(input.paths, continuity, {
      requestId: `${run.id}:codex-exec`,
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      status: "failed",
      error: processResult.terminationReason ?? processResult.stderrSample,
      raw: processDiagnostics,
    })));
  await Promise.all(continuityWrites);
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

  const status: RunStatus = processSucceeded && !sourceChanged ? "completed" : "failed";
  run = await finishRun(input.paths.run, run, status, sourceChanged ? 1 : processSucceeded ? 0 : processResult.exitCode, processResult.signal);
  continuity = await markRuntimeContinuityStatus(input.paths, continuity, status === "completed" ? "completed" : "failed");
  await appendRunEvent(input.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId: run.id, data: { warnings } });
  emitCodeLiveStatus(input.options.live, { runId: run.id, status, label: "Coder" });

  return { run, warnings };
}

async function appendRuntimeContinuityFailure(paths: CodeRunPaths, runId: string, error: unknown): Promise<void> {
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "runtime_continuity.append_failed",
    runId,
    data: { error: error instanceof Error ? error.message : String(error) },
  }).catch(() => undefined);
}

function rawRecord(event: CodexJsonlStreamEvent): Record<string, unknown> {
  if ("raw" in event && event.raw && typeof event.raw === "object" && !Array.isArray(event.raw)) {
    return event.raw as Record<string, unknown>;
  }
  return { event };
}

function summarizeCodexEvent(event: CodexJsonlStreamEvent): string | undefined {
  switch (event.type) {
    case "text_delta": return event.delta.slice(0, 160);
    case "status": return event.label;
    case "error": return event.message;
    case "tool_event": return event.command ?? event.name ?? event.phase;
    case "readable_event": return event.event.summary ?? event.event.title ?? event.event.kind;
    case "raw": return event.line.slice(0, 160);
    default: return event.type;
  }
}
