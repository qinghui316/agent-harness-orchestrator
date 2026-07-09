import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { getChangeStatus } from "../change/status.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { buildRoleContextArtifact, buildRoleContextPacket, contextSourceRef } from "../context/packets.js";
import { writeJsonFile } from "../fs/json.js";
import { slugify } from "../fs/path.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import { runtimeContinuityPaths, type RuntimeContinuityPaths } from "../runtime-continuity/paths.js";
import { appendExternalExecutionCompleted, appendExternalExecutionFailed, appendExternalExecutionRequested, appendPermissionProfileAttached } from "../runtime-continuity/events.js";
import { appendAgentEventEnvelope, createRuntimeContinuityArtifacts, markRuntimeContinuityStatus, type RuntimeContinuityWorkspaceDescriptor } from "../runtime-continuity/repository.js";
import type { RuntimeContinuityArtifacts } from "../runtime-continuity/types.js";
import { createWorktree } from "../worktree/creation.js";
import { prepareWorktreeDependencyBridge } from "../worktree/dependencies.js";
import { getWorktreeMetadataPath } from "../worktree/paths.js";
import { getWorktreeStatus } from "../worktree/status.js";
import type {
  ManagedProject,
  ResolvedMemory,
  RunMetadata,
  RunStatus,
  RunWorktreeInfo,
  ValidationCommandResult,
  ValidationResult,
  ValidationStatus,
} from "../types/index.js";
import { appendRunEvent } from "../run/events.js";
import { buildRunId } from "../run/run-id.js";
import { isRunStopRequested } from "../run/control.js";
import { executeProcessStreaming } from "../run/process.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { gitRaw, gitText } from "../project/git.js";
import { listValidationResults, readValidationResult, summarizeValidation } from "./repository.js";
import { resolveValidationProfile } from "./profiles.js";

const execFileAsync = promisify(execFile);

export interface ValidationRunOptions {
  changeId?: string;
  profile?: string;
  worktree?: boolean | string;
}

export interface ValidationRunResult {
  run: RunMetadata;
  validation: ValidationResult;
}

export interface ValidationStatusResult {
  activeChangeId: string | null;
  latest: ReturnType<typeof summarizeValidation> | null;
  validations: ReturnType<typeof summarizeValidation>[];
}

export async function startValidationRun(project: ManagedProject, options: ValidationRunOptions = {}): Promise<ValidationRunResult> {
  const profileName = options.profile ?? "default";
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Validation run");
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const changeStatus = target.status;
  const changeId = target.changeId;

  const profile = await resolveValidationProfile(memory, profileName);
  const worktreeMode = options.worktree === true ? "new-worktree" : typeof options.worktree === "string" ? options.worktree : "direct";
  const runId = buildRunId(changeId, ["validator", profileName, worktreeMode, ...profile.commands.flatMap((item) => item.command)]);
  let cwd = project.path;
  let worktree: RunWorktreeInfo | undefined;
  let worktreeDiffHash: string | undefined;
  if (options.worktree === true) {
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
  } else if (typeof options.worktree === "string") {
    const existing = await getWorktreeStatus(memory, options.worktree);
    if (existing.changeId !== changeId) {
      throw new Error(`Cannot validate worktree ${options.worktree}: it belongs to change ${existing.changeId}, not ${changeId}.`);
    }
    if (!existing.exists) {
      throw new Error(`Cannot validate worktree ${options.worktree}: checkout does not exist at ${existing.checkoutPath}.`);
    }
    cwd = existing.checkoutPath;
    worktree = {
      worktreeId: existing.worktreeId,
      branchName: existing.branchName,
      baseRef: existing.baseRef,
      baseCommit: existing.baseCommit,
      checkoutPath: existing.checkoutPath,
      metadataPath: getWorktreeMetadataPath(memory, existing.worktreeId),
    };
  }

  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const commandsDir = join(directory, "commands");
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    contextPacket: `${relativeDir}/context-packet.json`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    validation: `${relativeDir}/validation.json`,
  };
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    contextPacket: join(directory, "context-packet.json"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    validation: join(directory, "validation.json"),
    ...runtimeContinuityPaths(directory),
  };

  await mkdir(commandsDir, { recursive: true });
  const now = new Date().toISOString();
  const contextArtifact = buildRoleContextArtifact(buildRoleContextPacket({
    roleId: "validator",
    changeStatus,
    goal: `Run validation profile ${profileName} for the current Change target.`,
    runId,
    worktree,
    evidenceSummary: [
      `Validation profile: ${profileName}.`,
      `Execution mode: ${options.worktree ? "worktree" : "direct"}.`,
      `Command count: ${profile.commands.length}.`,
    ],
    evidenceRefs: [
      contextSourceRef("validation-profile", profileName, "inline", "Selected deterministic validation profile."),
      ...(worktree ? [contextSourceRef("worktree-metadata", worktree.metadataPath, "inline", "Worktree being validated.")] : []),
    ],
    createdAt: now,
  }), `${relativeDir}/context-packet.json`);
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "validator",
    executionMode: options.worktree ? "worktree" : "direct",
    proposalOnly: false,
    command: ["validator", profileName],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    worktree,
    contextPacket: contextArtifact.ref,
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "validator", profile: profileName, executionMode: run.executionMode, worktree } });

  await writeJsonFile(paths.contextPacket, contextArtifact.packet);
  await writeFile(paths.context, contextArtifact.markdown, "utf8");
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, "", "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context, contextPacket: artifacts.contextPacket, contextPacketHash: contextArtifact.hash } });

  let continuity = await createRuntimeContinuityArtifacts(paths, {
    projectId: project.id,
    changeId,
    runId,
    roleId: "validator",
    adapter: "validation-command",
    workspace: runtimeWorkspaceForValidation(project.path, cwd, worktree),
    permissionProfile: workerPermissionProfileForRole("validator"),
    rawArtifactRefs: [
      artifacts.events,
      artifacts.stdout,
      artifacts.stderr,
      artifacts.validation,
    ],
    sandboxPolicy: "read-only",
  });

  run = { ...run, status: "running" };
  await writeJsonFile(paths.run, run);
  continuity = await markRuntimeContinuityStatus(paths, continuity, "running");
  await appendValidationContinuityWrite(paths, continuity, appendPermissionProfileAttached(paths, continuity, { source: "validation" }));

  let dependencyBridge: Record<string, unknown> | undefined;
  if (worktree) {
    try {
      dependencyBridge = bridgeData(await prepareWorktreeDependencyBridge({ sourceRoot: project.path, checkoutPath: worktree.checkoutPath }));
      await appendValidationContinuityEvent(paths, continuity, "validation.dependency_bridge.prepared", dependencyBridge, `Dependency bridge: ${String(dependencyBridge.status)}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await appendStderr(paths.stderr, `## dependency setup\n${message}\n`);
      await appendValidationContinuityEvent(paths, continuity, "validation.dependency_bridge.failed", { error: message }, "Dependency bridge failed.");
      if (worktree) {
        worktreeDiffHash = (await collectWorktreeDiff(memory, worktree.worktreeId, changeId)).diffHash;
      }
      const failed = await finishValidationWithoutCommands({
        paths,
        run,
        continuity,
        runId,
        changeId,
        profileName,
        runExecutionMode: run.executionMode ?? "direct",
        worktree,
        worktreeDiffHash,
        startedAt: now,
        errorMessage: message,
      });
      return failed;
    }
  }

  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "validation.started", runId, data: { profile: profileName, commandCount: profile.commands.length, dependencyBridge } });
  await appendValidationContinuityEvent(paths, continuity, "validation.started", {
    profile: profileName,
    commandCount: profile.commands.length,
    cwd,
  }, `Validation profile ${profileName} started.`);

  const commandResults: ValidationCommandResult[] = [];
  const candidateSnapshot = worktree ? await captureWorktreeCandidateSnapshot(worktree.checkoutPath) : null;
  for (let index = 0; index < profile.commands.length; index += 1) {
    const item = profile.commands[index];
    const commandStartedAt = new Date().toISOString();
    const prefix = `${(index + 1).toString().padStart(3, "0")}-${slugify(item.name)}`;
    const stdoutPath = join(commandsDir, `${prefix}.stdout.log`);
    const stderrPath = join(commandsDir, `${prefix}.stderr.log`);
    const stdoutArtifact = `${relativeDir}/commands/${prefix}.stdout.log`;
    const stderrArtifact = `${relativeDir}/commands/${prefix}.stderr.log`;
    await appendRunEvent(paths.events, { timestamp: commandStartedAt, type: "validation.command.started", runId, data: { name: item.name, command: item.command, cwd } });
    await appendValidationContinuityEvent(paths, continuity, "validation.command.started", {
      name: item.name,
      command: item.command,
      cwd,
    }, item.name);
    const commandRequestId = `${runId}:validation-command:${index + 1}`;
    await appendValidationContinuityWrite(paths, continuity, appendExternalExecutionRequested(paths, continuity, {
      requestId: commandRequestId,
      command: item.command[0],
      args: item.command.slice(1),
      cwd,
      adapter: "validation-command",
      raw: { name: item.name },
      summary: item.name,
    }));
    const processResult = await executeProcessStreaming({
      cwd,
      command: item.command[0],
      args: item.command.slice(1),
      stdoutPath,
      stderrPath,
      stopSignal: () => isRunStopRequested(runId),
    });
    if (processResult.stderrSample) {
      await appendStderr(paths.stderr, `## ${item.name}\n${processResult.stderrSample}\n`);
    }
    const commandFinishedAt = new Date().toISOString();
    const commandStatus: ValidationStatus = processResult.exitCode === 0 ? "passed" : "failed";
    commandResults.push({
      name: item.name,
      command: item.command,
      cwd,
      status: commandStatus,
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      startedAt: commandStartedAt,
      finishedAt: commandFinishedAt,
      stdout: stdoutArtifact,
      stderr: stderrArtifact,
    });
    await appendRunEvent(paths.events, {
      timestamp: commandFinishedAt,
      type: "validation.command.exited",
      runId,
      data: { name: item.name, exitCode: processResult.exitCode, signal: processResult.signal, status: commandStatus },
    });
    await appendValidationContinuityEvent(paths, continuity, "validation.command.exited", {
      name: item.name,
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      status: commandStatus,
    }, `${item.name}: ${commandStatus}`);
    await appendValidationContinuityWrite(paths, continuity, (commandStatus === "passed"
      ? appendExternalExecutionCompleted(paths, continuity, {
        requestId: commandRequestId,
        exitCode: processResult.exitCode,
        signal: processResult.signal,
        status: commandStatus,
        raw: { name: item.name },
        summary: `${item.name}: ${commandStatus}`,
      })
      : appendExternalExecutionFailed(paths, continuity, {
        requestId: commandRequestId,
        exitCode: processResult.exitCode,
        signal: processResult.signal,
        status: commandStatus,
        error: processResult.terminationReason ?? processResult.stderrSample,
        raw: { name: item.name },
        summary: `${item.name}: ${commandStatus}`,
      })));
  }

  const validationStatus: ValidationStatus = commandResults.every((item) => item.status === "passed") ? "passed" : "failed";
  const finishedAt = new Date().toISOString();
  if (worktree) {
    if (candidateSnapshot) {
      const restore = await restoreWorktreeCandidateSnapshot(worktree.checkoutPath, candidateSnapshot, join(directory, "pre-validation-candidate.patch"));
      await appendValidationContinuityEvent(paths, continuity, "validation.worktree_candidate_restored", restore, "Restored candidate diff after validation commands.");
    }
    worktreeDiffHash = (await collectWorktreeDiff(memory, worktree.worktreeId, changeId)).diffHash;
  }
  const validation: ValidationResult = {
    version: "1.0",
    id: runId,
    runId,
    changeId,
    profile: profileName,
    status: validationStatus,
    executionMode: run.executionMode ?? "direct",
    worktreeId: worktree?.worktreeId,
    worktreeDiffHash,
    startedAt: now,
    finishedAt,
    commands: commandResults,
  };
  await writeJsonFile(paths.validation, validation);

  const status: RunStatus = validationStatus === "passed" ? "completed" : "failed";
  run = {
    ...run,
    status,
    exitCode: validationStatus === "passed" ? 0 : 1,
    signal: null,
    finishedAt,
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: finishedAt, type: validationStatus === "passed" ? "validation.completed" : "validation.failed", runId, data: { status: validationStatus } });
  await appendValidationContinuityEvent(paths, continuity, validationStatus === "passed" ? "validation.completed" : "validation.failed", {
    status: validationStatus,
  }, `Validation ${validationStatus}.`);
  continuity = await markRuntimeContinuityStatus(paths, continuity, status === "completed" ? "completed" : "failed");
  await appendRunEvent(paths.events, { timestamp: finishedAt, type: status === "completed" ? "run.completed" : "run.failed", runId });

  return { run, validation };
}

export async function getValidationStatus(project: ManagedProject): Promise<ValidationStatusResult> {
  const memory = await resolveProjectMemory(project);
  const changeStatus = await getChangeStatus(project);
  const changeId = changeStatus.change?.id ?? null;
  if (!changeId) return { activeChangeId: null, latest: null, validations: [] };
  const validations = await listValidationResults(memory, changeId);
  return {
    activeChangeId: changeId,
    latest: validations[0] ? summarizeValidation(validations[0]) : null,
    validations: validations.map(summarizeValidation),
  };
}

export async function listValidationSummaries(project: ManagedProject): Promise<ReturnType<typeof summarizeValidation>[]> {
  const memory = await resolveProjectMemory(project);
  const validations = await listValidationResults(memory);
  return validations.map(summarizeValidation);
}

export async function showValidation(project: ManagedProject, validationId: string): Promise<ValidationResult> {
  const memory = await resolveProjectMemory(project);
  return await readValidationResult(memory, validationId);
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

async function appendStderr(path: string, content: string): Promise<void> {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, content, "utf8");
}

interface CandidateSnapshot {
  trackedPatch: Buffer;
  untrackedFiles: Map<string, Buffer>;
}

async function captureWorktreeCandidateSnapshot(cwd: string): Promise<CandidateSnapshot> {
  const [trackedPatch, untracked] = await Promise.all([
    gitRaw(cwd, ["diff", "--no-ext-diff", "--binary", "HEAD"]),
    listCandidateUntrackedFiles(cwd),
  ]);
  const untrackedFiles = new Map<string, Buffer>();
  for (const file of untracked) {
    untrackedFiles.set(file, await readFile(join(cwd, file)));
  }
  return { trackedPatch, untrackedFiles };
}

async function restoreWorktreeCandidateSnapshot(cwd: string, snapshot: CandidateSnapshot, patchPath: string): Promise<{ trackedPatchBytes: number; untrackedRestored: number; validationSideEffectsRemoved: string[] }> {
  const currentUntracked = await listCandidateUntrackedFiles(cwd);
  const validationSideEffectsRemoved: string[] = [];
  for (const file of currentUntracked) {
    await rm(join(cwd, file), { force: true });
    if (!snapshot.untrackedFiles.has(file)) validationSideEffectsRemoved.push(file);
  }
  await execFileAsync("git", ["checkout", "--", "."], { cwd, maxBuffer: 50 * 1024 * 1024 });
  if (snapshot.trackedPatch.length > 0) {
    await writeFile(patchPath, snapshot.trackedPatch);
    await execFileAsync("git", ["apply", "--binary", "--whitespace=nowarn", patchPath], { cwd, maxBuffer: 50 * 1024 * 1024 });
  }
  for (const [file, content] of snapshot.untrackedFiles.entries()) {
    await mkdir(dirname(join(cwd, file)), { recursive: true });
    await writeFile(join(cwd, file), content);
  }
  return {
    trackedPatchBytes: snapshot.trackedPatch.length,
    untrackedRestored: snapshot.untrackedFiles.size,
    validationSideEffectsRemoved: validationSideEffectsRemoved.sort(),
  };
}

async function listCandidateUntrackedFiles(cwd: string): Promise<string[]> {
  const output = await gitText(cwd, ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ":!node_modules", ":!node_modules/**"]);
  return output.split("\0").map((item) => item.trim()).filter(Boolean).sort();
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

async function finishValidationWithoutCommands(input: {
  paths: RuntimeContinuityPaths & { run: string; events: string; validation: string };
  run: RunMetadata;
  continuity: RuntimeContinuityArtifacts;
  runId: string;
  changeId: string;
  profileName: string;
  runExecutionMode: NonNullable<RunMetadata["executionMode"]>;
  worktree: RunWorktreeInfo | undefined;
  worktreeDiffHash: string | undefined;
  startedAt: string;
  errorMessage: string;
}): Promise<ValidationRunResult> {
  const finishedAt = new Date().toISOString();
  const validation: ValidationResult = {
    version: "1.0",
    id: input.runId,
    runId: input.runId,
    changeId: input.changeId,
    profile: input.profileName,
    status: "failed",
    executionMode: input.runExecutionMode,
    worktreeId: input.worktree?.worktreeId,
    worktreeDiffHash: input.worktreeDiffHash,
    startedAt: input.startedAt,
    finishedAt,
    commands: [],
  };
  await writeJsonFile(input.paths.validation, validation);
  const run: RunMetadata = {
    ...input.run,
    status: "failed",
    exitCode: 1,
    signal: null,
    finishedAt,
  };
  await writeJsonFile(input.paths.run, run);
  await appendRunEvent(input.paths.events, { timestamp: finishedAt, type: "validation.failed", runId: input.runId, data: { status: "failed", reason: input.errorMessage } });
  await appendValidationContinuityEvent(input.paths, input.continuity, "validation.failed", {
    status: "failed",
    reason: input.errorMessage,
  }, "Validation failed before commands.");
  await markRuntimeContinuityStatus(input.paths, input.continuity, "failed");
  await appendRunEvent(input.paths.events, { timestamp: finishedAt, type: "run.failed", runId: input.runId });
  return { run, validation };
}

function runtimeWorkspaceForValidation(projectPath: string, cwd: string, worktree: RunWorktreeInfo | undefined): RuntimeContinuityWorkspaceDescriptor {
  if (worktree) {
    return {
      workspaceKind: "local-worktree",
      cwd,
      checkoutPath: worktree.checkoutPath,
      worktreeId: worktree.worktreeId,
    };
  }
  return {
    workspaceKind: "source-root",
    cwd: projectPath,
  };
}

async function appendValidationContinuityEvent(
  paths: RuntimeContinuityPaths & { events: string },
  continuity: RuntimeContinuityArtifacts,
  eventType: string,
  raw: Record<string, unknown>,
  summary?: string,
): Promise<void> {
  await appendValidationContinuityWrite(paths, continuity, appendAgentEventEnvelope(paths, continuity.session, continuity.eventSource, {
    eventType,
    raw,
    summary,
  }));
}

async function appendValidationContinuityWrite(
  paths: RuntimeContinuityPaths & { events: string },
  continuity: RuntimeContinuityArtifacts,
  write: Promise<unknown>,
): Promise<void> {
  await write.catch((error) => appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "runtime_continuity.append_failed",
    runId: continuity.session.runId,
    data: { error: error instanceof Error ? error.message : String(error) },
  }).catch(() => undefined));
}
