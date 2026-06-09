import { writeFile } from "node:fs/promises";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { detectCodexAppServerCapability } from "../codex/app-server.js";
import { readPromptInput } from "../codex/prompt.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../agent/catalog.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { appendRunEvent, buildRunId } from "../run/manager.js";
import type { ManagedProject, RunMetadata, RunWorktreeInfo } from "../types/index.js";
import { createWorktree, getWorktreeMetadataPath } from "../worktree/manager.js";
import { composeCoderPrompt } from "./prompt.js";
import { getSortedSourceStatus } from "./artifacts.js";
import { runCodexAppServerCode } from "./codex-app-server-runner.js";
import { runCodexExecCode } from "./codex-exec-runner.js";
import { buildCodeRoleContextArtifact } from "./context.js";
import { assertCodeExecutionGate } from "./execution-gate.js";
import { emitCodeLiveStatus } from "./live-events.js";
import { createCodeRunSession } from "./run-session.js";
import { normalizeAndValidateTasks } from "./runtime-guards.js";
import { getCodeStatus, listCodeRuns, showCodeRun } from "./status.js";
import type { CodeRunOptions, CodeRunResult } from "./types.js";

export type {
  CodeExecutionGateMode,
  CodeExecutionGateOptions,
  CodeExecutionGateVerdict,
  CodeRunLiveCallbacks,
  CodeRunOptions,
  CodeRunResult,
  CodeStatusResult,
} from "./types.js";
export { getCodeStatus, listCodeRuns, showCodeRun };

export async function startCodeRun(project: ManagedProject, options: CodeRunOptions = {}): Promise<CodeRunResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Code run");
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const changeStatus = target.status;
  const changeId = target.changeId;

  const selectedTasks = normalizeAndValidateTasks(changeStatus, options.taskIds ?? []);
  const roleId = options.roleId ?? "coder-agent";
  const executionGate = await assertCodeExecutionGate(memory, changeStatus, changeId, options, roleId);
  const role = await resolveAgentRole(memory, roleId);
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

  const session = await createCodeRunSession(memory, runId);
  const now = new Date().toISOString();
  const contextArtifact = buildCodeRoleContextArtifact({
    roleId,
    changeStatus,
    runId,
    taskIds: selectedTasks,
    worktree,
    taskRunId: options.taskRunId,
    extraPrompt,
    contextPacketRef: `${session.relativeDir}/context-packet.json`,
    createdAt: now,
  });
  const run: RunMetadata = {
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
    artifacts: session.artifacts,
    worktree,
    contextPacket: contextArtifact.ref,
    executionGate,
    ...(selectedTasks.length > 0 ? { taskIds: selectedTasks } : {}),
    ...(options.taskRunId ? { taskRunId: options.taskRunId } : {}),
    promptStack: ["agent-role", "active-change", "worktree", "task-scope", "human-prompt"],
    agent: buildRunAgentRecord(role),
  };
  await writeJsonFile(session.paths.run, run);
  await appendRunEvent(session.paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "coder-codex", worktree, taskIds: selectedTasks, taskRunId: options.taskRunId, executionGate: { ...executionGate } } });
  await appendRunEvent(session.paths.events, { timestamp: now, type: "code.execution_gate.allowed", runId, data: { ...executionGate } });
  await appendRunEvent(session.paths.events, { timestamp: now, type: "worktree.created", runId, data: { worktreeId: worktree.worktreeId, checkoutPath: worktree.checkoutPath } });
  emitCodeLiveStatus(options.live, { runId, status: "preparing", label: "Coder" });

  const context = contextArtifact.markdown;
  await writeJsonFile(session.paths.contextPacket, contextArtifact.packet);
  await writeFile(session.paths.context, context, "utf8");
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: session.artifacts.context, contextPacket: session.artifacts.contextPacket, contextPacketHash: contextArtifact.hash } });
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
  await writeFile(session.paths.prompt, prompt, "utf8");

  const appServerCapabilities = await detectCodexAppServerCapability();
  if (appServerCapabilities.available) {
    await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "app-server.capabilities.detected", runId, data: { supportsStdio: appServerCapabilities.supportsStdio } });
    return runCodexAppServerCode({
      project,
      memory,
      run,
      paths: session.paths,
      changeId,
      roleId,
      worktree,
      prompt,
      sourceBefore,
      createdWarnings: created.warnings,
      live: options.live,
    });
  }
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "app-server.unavailable", runId, data: { errors: appServerCapabilities.errors } });
  emitCodeLiveStatus(options.live, { runId, status: "fallback-next-turn", label: "实时引导不可用" });

  return runCodexExecCode({
    project,
    memory,
    run,
    paths: session.paths,
    changeId,
    worktree,
    prompt,
    sourceBefore,
    createdWarnings: created.warnings,
    options,
  });
}
