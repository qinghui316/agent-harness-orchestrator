import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject, RunMetadata, RunStatus, RunWorktreeInfo } from "../types/index.js";
import { createWorktree, getWorktreeMetadataPath } from "../worktree/manager.js";
import { buildContextProjection } from "./context-projection.js";
import { appendRunEvent } from "./events.js";
import { displayArtifactPath } from "./paths.js";
import { executeProcessStreaming } from "./process.js";
import { buildRunId } from "./run-id.js";
import type { LocalCommandRunOptions, RunStartResult } from "./types.js";

export async function startLocalCommandRun(project: ManagedProject, command: string[], options: LocalCommandRunOptions = {}): Promise<RunStartResult> {
  if (command.length === 0) {
    throw new Error("Run command is required after `--`, for example: aho run start <project> -- npm test");
  }

  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Local command run");
  const target = await resolveRunnableChangeTarget(project);
  const changeStatus = target.status;
  const changeId = target.changeId;

  const runId = buildRunId(changeId, command);
  let cwd = project.path;
  let worktree: RunWorktreeInfo | undefined;
  if (options.worktree) {
    const created = await createWorktree(project, memory, changeId, { runId });
    cwd = created.metadata.checkoutPath;
    worktree = {
      worktreeId: created.metadata.worktreeId,
      branchName: created.metadata.branchName,
      baseRef: created.metadata.baseRef,
      baseCommit: created.metadata.baseCommit,
      checkoutPath: created.metadata.checkoutPath,
      metadataPath: getWorktreeMetadataPath(memory, created.metadata.worktreeId),
    };
  }
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
  };
  const paths = {
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    run: join(directory, "run.json"),
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "local-command",
    executionMode: options.worktree ? "worktree" : "direct",
    proposalOnly: false,
    command,
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    worktree,
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, command, executionMode: run.executionMode, worktree } });

  await writeFile(paths.context, buildContextProjection(changeStatus), "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });

  run = { ...run, status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "process.started", runId, data: { cwd, command } });

  const processResult = await executeProcessStreaming({
    cwd,
    command: command[0],
    args: command.slice(1),
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
  });
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "process.exited",
    runId,
    data: { exitCode: processResult.exitCode, signal: processResult.signal },
  });

  const status: RunStatus = processResult.exitCode === 0 ? "completed" : "failed";
  const finishedAt = new Date().toISOString();
  run = {
    ...run,
    status,
    exitCode: processResult.exitCode,
    signal: processResult.signal,
    finishedAt,
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: finishedAt, type: status === "completed" ? "run.completed" : "run.failed", runId });

  return { run };
}
