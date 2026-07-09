import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { buildCodexReadonlyArgv, buildCodexWorkspaceWriteArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { extractFinalMessageFromCodexJsonl } from "../codex/jsonl.js";
import { resolveCodexEffectiveModel } from "../codex/model-settings.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { displayArtifactPath, appendRunEvent, buildContextProjection, buildRunId } from "../run/manager.js";
import { executeProcessStreaming } from "../run/process.js";
import { getEnabledSkillContext } from "../skill/catalog.js";
import type { ManagedProject, RunMetadata, RunStatus, RunWorktreeInfo } from "../types/index.js";
import { getWorktreeMetadataPath, getWorktreeStatus } from "../worktree/manager.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "./catalog.js";

export interface AgentRunOptions {
  prompt: string;
  worktreeId?: string;
  model?: string;
  profile?: string;
}

export interface AgentRunResult {
  run: RunMetadata;
  warnings: string[];
}

export async function startAgentRun(project: ManagedProject, roleId: string, options: AgentRunOptions): Promise<AgentRunResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Agent run");
  const target = await resolveRunnableChangeTarget(project);
  const changeStatus = target.status;
  const changeId = target.changeId;

  const role = await resolveAgentRole(memory, roleId);
  if (role.runtime !== "codex") throw new Error(`Agent role ${role.roleId} does not use the Codex runtime.`);
  if (role.writeCapability === "deterministic-writer") {
    throw new Error(`Agent role ${role.roleId} is deterministic and cannot be executed through Codex.`);
  }
  if (role.writeCapability === "worktree-write" && !options.worktreeId) {
    throw new Error(`Agent role ${role.roleId} requires --worktree <id>.`);
  }
  if (role.writeCapability === "read-only" && options.worktreeId) {
    throw new Error(`Agent role ${role.roleId} is read-only and does not accept --worktree.`);
  }

  let cwd = project.path;
  let worktree: RunWorktreeInfo | undefined;
  if (options.worktreeId) {
    const status = await getWorktreeStatus(memory, options.worktreeId);
    if (status.projectId !== project.id || status.changeId !== changeId) {
      throw new Error(`Worktree ${options.worktreeId} does not belong to current project/change.`);
    }
    if (!status.exists) throw new Error(`Worktree ${options.worktreeId} checkout is missing.`);
    cwd = status.checkoutPath;
    worktree = {
      worktreeId: status.worktreeId,
      branchName: status.branchName,
      baseRef: status.baseRef,
      baseCommit: status.baseCommit,
      checkoutPath: status.checkoutPath,
      metadataPath: getWorktreeMetadataPath(memory, status.worktreeId),
    };
  }

  const skillContext = await getEnabledSkillContext(project, changeId);
  const runId = buildRunId(changeId, ["agent-codex", role.roleId, options.prompt, options.worktreeId ?? ""]);
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
    lastMessage: `${relativeDir}/last-message.md`,
  };
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    prompt: join(directory, "prompt.md"),
    codexEvents: join(directory, "codex-events.jsonl"),
    lastMessage: join(directory, "last-message.md"),
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  const context = buildContextProjection(changeStatus);
  const prompt = buildAgentPrompt({
    roleMarkdown: buildAgentSystemPrompt(role),
    context,
    skillIndex: skillContext.promptSection,
    taskPrompt: options.prompt,
    worktreeCheckout: worktree?.checkoutPath,
  });

  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "agent-codex",
    executionMode: worktree ? "worktree" : "direct",
    proposalOnly: true,
    command: ["codex"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    worktree,
    promptStack: ["agent-role", "active-change", "aho-skill-index", "task-prompt"],
    enabledSkills: skillContext.records,
    agent: buildRunAgentRecord(role),
  };

  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "agent-codex", roleId: role.roleId } });
  await writeFile(paths.context, context, "utf8");
  await writeFile(paths.prompt, prompt, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });

  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId, data: { capabilities } });
    const message = [`# Agent Run Failed`, "", `Role: ${role.roleId}`, "", ...capabilities.errors.map((error) => `- ${error}`), ""].join("\n");
    await writeFile(paths.lastMessage, message, "utf8");
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.codexEvents, "", "utf8");
    await writeFile(paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    run = await finishRun(paths.run, run, "failed", 1, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.failed", runId });
    return { run, warnings: capabilities.errors };
  }

  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId, data: { capabilities } });
  const effectiveModel = await resolveCodexEffectiveModel(options.model);
  const argv = role.writeCapability === "worktree-write"
    ? buildCodexWorkspaceWriteArgv(capabilities, { projectPath: cwd, lastMessagePath: paths.lastMessage, model: effectiveModel.model ?? undefined, profile: options.profile })
    : buildCodexReadonlyArgv(capabilities, {
      projectPath: cwd,
      lastMessagePath: paths.lastMessage,
      model: effectiveModel.model ?? undefined,
      profile: options.profile,
      additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [],
    });

  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { cwd, command: run.command, roleId: role.roleId, model: effectiveModel.model, modelSource: effectiveModel.source, skillWarnings: skillContext.warnings } });
  const result = await executeProcessStreaming({
    cwd,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
  });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { exitCode: result.exitCode, signal: result.signal } });
  const lastMessage = await ensureLastMessage(paths.lastMessage, result.stdoutSample, result.stderrSample);
  await writeFile(paths.lastMessage, lastMessage, "utf8");
  const status: RunStatus = result.exitCode === 0 ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, result.exitCode, result.signal);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId, data: { roleId: role.roleId } });
  return { run, warnings: skillContext.warnings };
}

function buildAgentPrompt(input: { roleMarkdown: string; context: string; skillIndex: string; taskPrompt: string; worktreeCheckout?: string }): string {
  return [
    "# AHO Agent Runtime Bridge",
    "",
    input.roleMarkdown,
    "",
    "## Runtime Rules",
    "",
    "- ECL files and accepted Harness artifacts are the source of truth.",
    "- Agent output is a proposal unless a deterministic AHO command accepts or applies it.",
    "- Do not treat Codex hidden session memory or global skills as AHO project truth.",
    "- AHO-managed skills may be discoverable through the Codex bridge; load them only when relevant.",
    "",
    input.worktreeCheckout ? `## Assigned Worktree\n\n${input.worktreeCheckout}\n` : "",
    "## Run Context Projection",
    "",
    input.context.trim(),
    "",
    input.skillIndex ? "## Available AHO Skill Index" : "",
    input.skillIndex,
    "",
    "## Task",
    "",
    input.taskPrompt.trim(),
    "",
  ].join("\n");
}

async function ensureLastMessage(path: string, stdout: string, stderr: string): Promise<string> {
  try {
    const text = await readFile(path, "utf8");
    if (text.trim()) return text;
  } catch {
    // fall through
  }
  return extractFinalMessageFromCodexJsonl(stdout) ?? (stderr.trim() || "Codex did not return a final message.");
}

async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const finishedAt = new Date().toISOString();
  const next = { ...run, status, exitCode, signal, finishedAt };
  await writeJsonFile(path, next);
  return next;
}
