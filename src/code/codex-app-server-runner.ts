import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { runCodexAppServerTurn } from "../codex/app-server.js";
import { resolveCodexEffectiveModel } from "../codex/model-settings.js";
import { writeJsonFile } from "../fs/json.js";
import { appendExternalExecutionCompleted, appendExternalExecutionFailed, appendExternalExecutionRequested, appendPermissionProfileAttached } from "../runtime-continuity/events.js";
import { appendAgentEventEnvelope, createRuntimeContinuityArtifacts, markRuntimeContinuityStatus } from "../runtime-continuity/repository.js";
import { appendRunEvent } from "../run/manager.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, RunStatus, RunWorktreeInfo } from "../types/index.js";
import { getSortedSourceStatus, renderImplementationSummary } from "./artifacts.js";
import { emitCodeLiveCallbackError, emitCodeLiveRunStarted, emitCodeLiveStatus } from "./live-events.js";
import { finishRun, type CodeRunPaths } from "./run-session.js";
import type { CodeRunLiveCallbacks, CodeRunResult } from "./types.js";

export async function runCodexAppServerCode(input: {
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
  live?: CodeRunLiveCallbacks;
}): Promise<CodeRunResult> {
  let run: RunMetadata = { ...input.run, command: ["codex", "app-server", "--listen", "stdio://"], status: "running" };
  await writeRunAndStartedEvents(input.paths, run, input.worktree, input.live);
  let continuity = await createRuntimeContinuityArtifacts(input.paths, {
    projectId: input.project.id,
    changeId: input.changeId,
    runId: run.id,
    roleId: input.roleId,
    ...(run.taskRunId ? { taskRunId: run.taskRunId } : {}),
    adapter: "codex-app-server",
    worktree: input.worktree,
    permissionProfile: workerPermissionProfileForRole(input.roleId),
    rawArtifactRefs: [
      input.run.artifacts.appServerEvents,
      input.run.artifacts.appServerStderr,
      input.run.artifacts.appServerLastMessage,
      input.run.artifacts.agentSession,
    ].filter((ref): ref is string => Boolean(ref)),
    sandboxPolicy: "workspace-write",
  });
  continuity = await markRuntimeContinuityStatus(input.paths, continuity, "running");
  const continuityWrites: Promise<void>[] = [];
  const recordContinuity = (promise: Promise<unknown>): void => {
    continuityWrites.push(promise.then(() => undefined).catch((error) => appendRuntimeContinuityFailure(input.paths, run.id, error)));
  };
  recordContinuity(appendPermissionProfileAttached(input.paths, continuity, { source: "code.app-server" }));
  recordContinuity(appendExternalExecutionRequested(input.paths, continuity, {
    requestId: `${run.id}:codex-app-server`,
    command: "codex",
    args: ["app-server", "--listen", "stdio://"],
    cwd: input.worktree.checkoutPath,
    adapter: "codex-app-server",
  }));
  const effectiveModel = await resolveCodexEffectiveModel();
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId: run.id, data: { adapter: "codex-app-server", model: effectiveModel.model, modelSource: effectiveModel.source } });
  const appServerResult = await runCodexAppServerTurn({
    projectId: input.project.id,
    changeId: input.changeId,
    roleId: input.roleId,
    runId: run.id,
    cwd: input.worktree.checkoutPath,
    prompt: input.prompt,
    sandboxPolicy: "workspace-write",
    paths: {
      events: input.paths.appServerEvents,
      stderr: input.paths.appServerStderr,
      lastMessage: input.paths.appServerLastMessage,
      session: input.paths.agentSession,
    },
    onTextDelta: (delta) => {
      recordContinuity(appendAgentEventEnvelope(input.paths, continuity.session, continuity.eventSource, {
        eventType: "text_delta",
        summary: delta.slice(0, 160),
        raw: { source: "codex-app-server", delta },
      }));
      try {
        input.live?.onCodexEvent?.({ type: "text_delta", delta, runId: run.id, raw: { source: "app-server" } });
      } catch (error) {
        emitCodeLiveCallbackError(input.live, run.id, error);
      }
    },
    onNotification: (notification) => {
      recordContinuity(appendAgentEventEnvelope(input.paths, continuity.session, continuity.eventSource, {
        eventType: notification.method,
        summary: notification.method,
        raw: notification.raw,
      }));
      try {
        input.live?.onCodexEvent?.({
          type: "readable_event",
          event: {
            kind: notification.method.includes("commandExecution") ? "command" : "status",
            phase: notification.method,
            title: notification.method.includes("commandExecution") ? "Command event" : "Codex app-server activity",
            summary: notification.method,
          },
          runId: run.id,
          raw: notification.raw,
        });
      } catch (error) {
        emitCodeLiveCallbackError(input.live, run.id, error);
      }
    },
    onError: (error) => emitCodeLiveCallbackError(input.live, run.id, error),
    model: effectiveModel.model,
  });
  recordContinuity((appServerResult.status === "completed"
    ? appendExternalExecutionCompleted(input.paths, continuity, {
      requestId: `${run.id}:codex-app-server`,
      status: appServerResult.status,
      raw: { threadId: appServerResult.threadId, turnId: appServerResult.turnId },
    })
    : appendExternalExecutionFailed(input.paths, continuity, {
      requestId: `${run.id}:codex-app-server`,
      status: appServerResult.status,
      error: appServerResult.error,
      raw: { threadId: appServerResult.threadId, turnId: appServerResult.turnId },
    })));
  await Promise.all(continuityWrites);
  continuity = await markRuntimeContinuityStatus(input.paths, continuity, appServerResult.status, appServerResult.error);
  await writeFile(input.paths.lastMessage, appServerResult.lastMessage || appServerResult.error || "# Coder App-Server Output Not Captured\n", "utf8");
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "app-server.exited", runId: run.id, data: { status: appServerResult.status, threadId: appServerResult.threadId, turnId: appServerResult.turnId, error: appServerResult.error } });

  const diffResult = await collectWorktreeDiff(input.memory, input.worktree.worktreeId, input.changeId);
  await writeFile(input.paths.diff, diffResult.diff, "utf8");
  await writeFile(input.paths.diffStat, diffResult.diffStat, "utf8");
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "diff.collected", runId: run.id, data: { bytes: Buffer.byteLength(diffResult.diff, "utf8"), stat: diffResult.diffStat } });
  const sourceAfter = await getSortedSourceStatus(input.project.path);
  const sourceChanged = JSON.stringify(input.sourceBefore) !== JSON.stringify(sourceAfter);
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "source.checked", runId: run.id, data: { before: input.sourceBefore, after: sourceAfter, changed: sourceChanged } });
  const lastMessage = appServerResult.lastMessage || appServerResult.error || "";
  const warnings = [
    ...input.createdWarnings,
    ...(diffResult.diff.trim() ? [] : ["Coder run completed without producing a worktree diff."]),
    ...(sourceChanged ? ["Source project git status changed during coder run; Codex may have modified outside the assigned worktree."] : []),
    ...(appServerResult.status === "interrupted" ? ["Coder app-server turn was interrupted by the user."] : []),
  ];
  await writeFile(input.paths.implementation, renderImplementationSummary({
    lastMessage,
    diffStat: diffResult.diffStat,
    diff: diffResult.diff,
    warnings,
    sourceBefore: input.sourceBefore,
    sourceAfter,
  }), "utf8");
  const status: RunStatus = appServerResult.status === "completed" && !sourceChanged ? "completed" : "failed";
  run = await finishRun(input.paths.run, run, status, sourceChanged ? 1 : status === "completed" ? 0 : 1, null);
  await appendRunEvent(input.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId: run.id, data: { warnings, adapter: "codex-app-server" } });
  emitCodeLiveStatus(input.live, { runId: run.id, status, label: "Coder" });
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

async function writeRunAndStartedEvents(paths: CodeRunPaths, run: RunMetadata, worktree: RunWorktreeInfo, live: CodeRunLiveCallbacks | undefined): Promise<void> {
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "coder.started", runId: run.id, data: { cwd: worktree.checkoutPath, command: run.command, adapter: "codex-app-server" } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.started", runId: run.id, data: { cwd: worktree.checkoutPath } });
  emitCodeLiveRunStarted(live, run);
  emitCodeLiveStatus(live, { runId: run.id, status: "running", label: "Coder" });
}
