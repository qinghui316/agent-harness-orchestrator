import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { collectWorktreeDiff } from "../audit/diff.js";
import { runCodexAppServerTurn } from "../codex/app-server.js";
import { writeJsonFile } from "../fs/json.js";
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
      try {
        input.live?.onCodexEvent?.({ type: "text_delta", delta, runId: run.id, raw: { source: "app-server" } });
      } catch (error) {
        emitCodeLiveCallbackError(input.live, run.id, error);
      }
    },
    onNotification: (notification) => {
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
  });
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

async function writeRunAndStartedEvents(paths: CodeRunPaths, run: RunMetadata, worktree: RunWorktreeInfo, live: CodeRunLiveCallbacks | undefined): Promise<void> {
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "coder.started", runId: run.id, data: { cwd: worktree.checkoutPath, command: run.command, adapter: "codex-app-server" } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.started", runId: run.id, data: { cwd: worktree.checkoutPath } });
  emitCodeLiveRunStarted(live, run);
  emitCodeLiveStatus(live, { runId: run.id, status: "running", label: "Coder" });
}
