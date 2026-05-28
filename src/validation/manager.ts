import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getChangeStatus, getChangeStatusForChange } from "../change/manager.js";
import { writeJsonFile } from "../fs/json.js";
import { slugify } from "../fs/path.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { createWorktree, getWorktreeMetadataPath, getWorktreeStatus } from "../worktree/manager.js";
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
import { appendRunEvent, assertRunnableChange, buildContextProjection, buildRunId } from "../run/manager.js";
import { isRunStopRequested } from "../run/control.js";
import { executeProcessStreaming } from "../run/process.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { listValidationResults, readValidationResult, summarizeValidation } from "./artifacts.js";
import { resolveValidationProfile } from "./profiles.js";

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
  const changeStatus = options.changeId ? await getChangeStatusForChange(project, options.changeId) : await getChangeStatus(project);
  assertRunnableChange(changeStatus);
  const changeId = changeStatus.change?.id ?? changeStatus.activeChanges[0]?.name;
  if (!changeId) throw new Error("Cannot start validation without an active change id.");

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
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    validation: `${relativeDir}/validation.json`,
  };
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    validation: join(directory, "validation.json"),
  };

  await mkdir(commandsDir, { recursive: true });
  const now = new Date().toISOString();
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
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "validator", profile: profileName, executionMode: run.executionMode, worktree } });

  await writeFile(paths.context, buildContextProjection(changeStatus), "utf8");
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, "", "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });

  run = { ...run, status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "validation.started", runId, data: { profile: profileName, commandCount: profile.commands.length } });

  const commandResults: ValidationCommandResult[] = [];
  for (let index = 0; index < profile.commands.length; index += 1) {
    const item = profile.commands[index];
    const commandStartedAt = new Date().toISOString();
    const prefix = `${(index + 1).toString().padStart(3, "0")}-${slugify(item.name)}`;
    const stdoutPath = join(commandsDir, `${prefix}.stdout.log`);
    const stderrPath = join(commandsDir, `${prefix}.stderr.log`);
    const stdoutArtifact = `${relativeDir}/commands/${prefix}.stdout.log`;
    const stderrArtifact = `${relativeDir}/commands/${prefix}.stderr.log`;
    await appendRunEvent(paths.events, { timestamp: commandStartedAt, type: "validation.command.started", runId, data: { name: item.name, command: item.command, cwd } });
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
  }

  const validationStatus: ValidationStatus = commandResults.every((item) => item.status === "passed") ? "passed" : "failed";
  const finishedAt = new Date().toISOString();
  if (worktree) {
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
