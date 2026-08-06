import { readFile, writeFile } from "node:fs/promises";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveBundledAgentRole, type AgentRole } from "../agent/catalog.js";
import { writeJsonFile } from "../fs/json.js";
import { resolveProjectHarnessAgentInput } from "../project-harness/agent-input.js";
import {
  type ProjectCodeExecutionRuntimePort,
  type ProjectHarnessExecutionPort,
} from "../project-runtime/execution-ports.js";
import { resolveProjectActiveExecutionScope } from "../project-runtime/active-execution-scope.js";
import type { SchedulerArtifactStore } from "../scheduler-runtime/artifact-store.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { appendRunEvent, buildRunId } from "../run/manager.js";
import type { ChangeStatus, ManagedProject, RunMetadata, RunWorktreeInfo } from "../types/index.js";
import { createWorktreeWithRuntimePort, getWorktreeMetadataPath } from "../worktree/manager.js";
import { prepareWorktreeDependencyBridge } from "../worktree/dependencies.js";
import { readWorktreeMetadata } from "../worktree/repository.js";
import { composeCoderPrompt } from "./prompt.js";
import { getSortedSourceStatus, writeEmptyCodeArtifacts } from "./artifacts.js";
import { runProviderCodeTurn } from "./provider-turn-runner.js";
import { buildCodeRoleContextArtifact } from "./context.js";
import { assertSkillNativeCodeExecutionGate } from "./execution-gate.js";
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
  const projectHarnessInput = await resolveProjectHarnessAgentInput(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
  const scope = await resolveProjectActiveExecutionScope(project, options.changeId);
  const changeStatus = scope.harness.changeStatus;
  const changeId = scope.harness.planning.change.change_id;
  const selectedTasks = normalizeAndValidateTasks(changeStatus, options.taskIds ?? []);
  const roleId = options.roleId ?? "coder-agent";
  const executionGate = await assertSkillNativeCodeExecutionGate(
    scope.runtime,
    changeStatus,
    scope.harness.planning.graph,
    changeId,
    options,
    roleId,
  );
  const role = await resolveBundledAgentRole(roleId);
  return startPreparedCodeRun(project, scope.runtime, changeStatus, changeId, selectedTasks, roleId, role, executionGate, projectHarnessInput.identity, projectHarnessInput.providerSkillInput, true, options);
}

export async function startSkillNativeCodeRun(
  project: ManagedProject,
  runtime: ProjectCodeExecutionRuntimePort,
  harness: ProjectHarnessExecutionPort,
  options: CodeRunOptions = {},
  schedulerArtifacts: SchedulerArtifactStore | null = null,
): Promise<CodeRunResult> {
  const changeId = options.changeId?.trim();
  if (!changeId || changeId !== harness.changeStatus.change?.id) {
    throw new Error("Skill-native Code run requires the exact accepted Change id.");
  }
  const projectHarnessInput = await resolveProjectHarnessAgentInput(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
  const selectedTasks = normalizeAndValidateTasks(harness.changeStatus, options.taskIds ?? []);
  const roleId = options.roleId ?? "coder-agent";
  const executionGate = await assertSkillNativeCodeExecutionGate(
    runtime,
    harness.changeStatus,
    harness.planning.graph,
    changeId,
    options,
    roleId,
    schedulerArtifacts,
  );
  const role = await resolveBundledAgentRole(roleId);
  return startPreparedCodeRun(project, runtime, harness.changeStatus, changeId, selectedTasks, roleId, role, executionGate, projectHarnessInput.identity, projectHarnessInput.providerSkillInput, true, options);
}

async function startPreparedCodeRun(
  project: ManagedProject,
  memory: ProjectCodeExecutionRuntimePort,
  changeStatus: ChangeStatus,
  changeId: string,
  selectedTasks: string[],
  roleId: string,
  role: AgentRole,
  executionGate: import("./types.js").CodeExecutionGateVerdict,
  projectHarnessIdentity: Awaited<ReturnType<typeof resolveProjectHarnessAgentInput>>["identity"],
  projectHarnessSkillInput: Awaited<ReturnType<typeof resolveProjectHarnessAgentInput>>["providerSkillInput"],
  requireMainAgentLineage: boolean,
  options: CodeRunOptions,
): Promise<CodeRunResult> {
  const extraPrompt = options.prompt || options.promptFile
    ? await readPromptInput({ prompt: options.prompt, promptFile: options.promptFile })
    : undefined;
  const runId = buildRunId(changeId, ["provider-code", ...selectedTasks, extraPrompt ?? ""]);
  const sourceBefore = await getSortedSourceStatus(project.path);
  const existingWorktree = options.existingWorktreeId ? await readWorktreeMetadata(memory, options.existingWorktreeId) : null;
  if (existingWorktree && existingWorktree.changeId !== changeId) {
    throw new Error("Code run existing worktree is not scoped to the selected Change.");
  }
  if (existingWorktree && existingWorktree.status !== "active") {
    throw new Error(`Code run existing worktree is not active: ${existingWorktree.status}.`);
  }
  const created = existingWorktree ? null : await createWorktreeWithRuntimePort(project, memory, changeId, { runId });
  const worktreeMetadata = existingWorktree ?? created?.metadata;
  if (!worktreeMetadata) throw new Error("Code run could not resolve worktree metadata.");
  const worktree: RunWorktreeInfo = {
    worktreeId: worktreeMetadata.worktreeId,
    branchName: worktreeMetadata.branchName,
    baseRef: worktreeMetadata.baseRef,
    baseCommit: worktreeMetadata.baseCommit,
    checkoutPath: worktreeMetadata.checkoutPath,
    metadataPath: getWorktreeMetadataPath(memory, worktreeMetadata.worktreeId),
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
    projectHarness: projectHarnessIdentity,
  });
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "provider-code",
    executionMode: "worktree",
    proposalOnly: true,
    command: ["provider", "turn.start"],
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
  await appendRunEvent(session.paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "provider-code", worktree, taskIds: selectedTasks, taskRunId: options.taskRunId, executionGate: { ...executionGate } } });
  await appendRunEvent(session.paths.events, { timestamp: now, type: "code.execution_gate.allowed", runId, data: { ...executionGate } });
  await appendRunEvent(session.paths.events, { timestamp: now, type: created ? "worktree.created" : "worktree.reused", runId, data: { worktreeId: worktree.worktreeId, checkoutPath: worktree.checkoutPath } });
  emitCodeLiveStatus(options.live, { runId, status: "preparing", label: "Coder" });

  const context = contextArtifact.markdown;
  await writeJsonFile(session.paths.contextPacket, contextArtifact.packet);
  await writeFile(session.paths.context, context, "utf8");
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: session.artifacts.context, contextPacket: session.artifacts.contextPacket, contextPacketHash: contextArtifact.hash } });
  emitCodeLiveStatus(options.live, { runId, status: "context-prepared", label: "Coder" });
  const prompt = await composeCoderPrompt({
    context,
    changeStatus,
    worktree: worktreeMetadata,
    sourceProjectPath: project.path,
    selectedTasks,
    extraPrompt,
    coderProfile: buildAgentSystemPrompt(role),
  });
  await writeFile(session.paths.prompt, prompt, "utf8");

  try {
    const dependencyBridge = await prepareWorktreeDependencyBridge({ sourceRoot: project.path, checkoutPath: worktree.checkoutPath });
    await appendRunEvent(session.paths.events, {
      timestamp: new Date().toISOString(),
      type: "code.dependency_bridge.prepared",
      runId,
      data: bridgeData(dependencyBridge),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(session.paths.stderr, `## dependency setup\n${message}\n`, "utf8");
    await appendRunEvent(session.paths.events, {
      timestamp: new Date().toISOString(),
      type: "code.dependency_bridge.failed",
      runId,
      data: { error: message },
    });
    await writeEmptyCodeArtifacts(session.paths, [
      "# Coder Unavailable",
      "",
      "AHO could not prepare local project dependencies for the assigned coder worktree.",
      "",
      message,
      "",
    ].join("\n"));
    const failedRun = {
      ...run,
      status: "failed" as const,
      exitCode: 1,
      signal: null,
      finishedAt: new Date().toISOString(),
    };
    await writeJsonFile(session.paths.run, failedRun);
    await appendRunEvent(session.paths.events, { timestamp: failedRun.finishedAt, type: "run.failed", runId, data: { reason: message } });
    emitCodeLiveStatus(options.live, { runId, status: "failed", label: "Coder" });
    return { run: failedRun, warnings: [message] };
  }

  return runProviderCodeTurn({
      project,
      memory,
      run,
      paths: session.paths,
      changeId,
      roleId,
      worktree,
      prompt,
      sourceBefore,
      projectHarnessSkillInput,
      requireMainAgentLineage,
      createdWarnings: created?.warnings ?? [],
      live: options.live,
  });
}


async function readPromptInput(input: { prompt?: string; promptFile?: string }): Promise<string> {
  if (input.prompt?.trim()) return input.prompt.trim();
  if (input.promptFile) return (await readFile(input.promptFile, "utf8")).trim();
  return "";
}

function bridgeData(input: {
  status: string;
  checkoutDependencyPath: string;
  sourceDependencyPath?: string;
  reason?: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    checkoutDependencyPath: input.checkoutDependencyPath,
    sourceDependencyPath: input.sourceDependencyPath,
    reason: input.reason,
  };
}
