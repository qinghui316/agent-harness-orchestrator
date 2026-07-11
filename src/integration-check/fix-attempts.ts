import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { buildCodexWorkspaceWriteArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { CodexCompletionTracker, codexLifecycleTiming } from "../codex/completion.js";
import { createCodexJsonlStreamParser } from "../codex/jsonl.js";
import { resolveCodexEffectiveModel } from "../codex/model-settings.js";
import { ensureLastMessage, getSortedSourceStatus, processDiagnosticsData, renderImplementationSummary, writeEmptyCodeArtifacts } from "../code/artifacts.js";
import { createCodeRunSession, finishRun } from "../code/run-session.js";
import { writeJsonFile } from "../fs/json.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { git, gitText } from "../project/git.js";
import { withProjectWriteLease } from "../project/project-write-lease.js";
import { appendRunEvent } from "../run/manager.js";
import { executeProcessStreaming } from "../run/process.js";
import { getGlobalWorktreeCheckoutRoot } from "../worktree/manager.js";
import { prepareWorktreeDependencyBridge } from "../worktree/dependencies.js";
import type { ManagedProject, ResolvedMemory, RunMetadata } from "../types/index.js";
import { integrationArtifact } from "./artifacts.js";
import { appendIntegrationEvent } from "./repository.js";
import { collectCheckoutPatch, prepareIntegrationFixCheckout } from "./patch-workspace.js";
import type { IntegrationArtifact, IntegrationFixAttempt, IntegrationFixAttemptStatus } from "./types.js";

export interface IntegrationFixRepairRunnerInput {
  project: ManagedProject;
  memory: ResolvedMemory;
  directory: string;
  checkId: string;
  changeId: string;
  attemptId: string;
  checkoutPath: string;
  inputPatchPath: string;
  reason: string;
}

export interface IntegrationFixRepairRunnerResult {
  repairMode?: IntegrationFixAttempt["repairMode"];
  runId?: string;
  runArtifactRefs?: string[];
  summary?: string;
}

export type IntegrationFixRepairRunner = (input: IntegrationFixRepairRunnerInput) => Promise<IntegrationFixRepairRunnerResult | void>;

export interface IntegrationFixAttemptOptions {
  repairRunner?: IntegrationFixRepairRunner;
  changeId?: string;
}

export async function runIntegrationFixAttempt(
  project: ManagedProject,
  directory: string,
  checkId: string,
  inputPatchPath: string,
  reason: string,
  options: IntegrationFixAttemptOptions = {},
): Promise<{ attempt: IntegrationFixAttempt; artifact?: IntegrationArtifact }> {
  const memory = await resolveProjectMemory(project);
  const startedAt = new Date().toISOString();
  const attemptId = `fix-${checkId}-${Math.max(1, Date.now()).toString(36)}`;
  const checkoutPath = join(getGlobalWorktreeCheckoutRoot(memory.projectId ?? project.id), "integration", shortFixCheckoutName(checkId, attemptId));
  let artifact: IntegrationArtifact | undefined;
  let status: IntegrationFixAttemptStatus = "failed";
  let summary = "自动修复未能生成可验证的组合补丁。";
  let repairMode: IntegrationFixAttempt["repairMode"] | undefined;
  let runId: string | undefined;
  let runArtifactRefs: string[] | undefined;

  try {
    await prepareIntegrationFixCheckout(project, checkoutPath, inputPatchPath);
    repairMode = options.repairRunner ? undefined : "codex";
    const repair = await (options.repairRunner ?? runCodexBackedIntegrationRepair)({
      project,
      memory,
      directory,
      checkId,
      changeId: options.changeId ?? checkId,
      attemptId,
      checkoutPath,
      inputPatchPath,
      reason,
    });
    repairMode = repair?.repairMode ?? repairMode ?? "codex";
    runId = repair?.runId;
    runArtifactRefs = repair?.runArtifactRefs;
    const repairedPatch = await collectCheckoutPatch(checkoutPath);
    if (!repairedPatch.trim()) {
      throw new Error("IntegrationFix did not produce a repaired diff.");
    }
    const repairedPatchPath = join(directory, "repaired.patch");
    await writeFile(repairedPatchPath, repairedPatch, "utf8");
    artifact = integrationArtifact(memory, repairedPatchPath, repairedPatch, "repaired", "integration-fix-agent");
    status = "completed";
    summary = repair?.summary ?? "integration-fix-agent 已生成修复后的组合补丁。";
  } catch (cause) {
    summary = cause instanceof Error ? cause.message : String(cause);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "integration-fix-stderr.log"), `${summary}\n`, { encoding: "utf8", flag: "a" });
  } finally {
    await withProjectWriteLease(project.path, {}, async () => {
      await git(project.path, ["worktree", "remove", "--force", checkoutPath]).catch(() => "");
      await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
      await git(project.path, ["worktree", "prune"]).catch(() => "");
    }).catch(() => undefined);
  }

  const attempt: IntegrationFixAttempt = {
    id: attemptId,
    roleId: "integration-fix-agent",
    status,
    repairMode,
    reason,
    inputArtifactRef: basename(inputPatchPath),
    runId,
    runArtifactRefs,
    outputArtifactRef: artifact?.path,
    outputArtifactHash: artifact?.hash,
    summary,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  await appendIntegrationEvent(directory, checkId, "integration-fix.completed", { attemptId, status, artifact: artifact?.path });
  return { attempt, artifact };
}

async function runCodexBackedIntegrationRepair(input: IntegrationFixRepairRunnerInput): Promise<IntegrationFixRepairRunnerResult> {
  const runId = `${input.attemptId}-codex`;
  const session = await createCodeRunSession(input.memory, runId);
  const sourceBefore = await getSortedSourceStatus(input.project.path);
  const prompt = await buildIntegrationFixPrompt(input);
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId: input.changeId,
    projectPath: input.project.path,
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
    promptStack: ["integration-check", "integration-fix", "codex-repair"],
  };
  await writeJsonFile(session.paths.run, run);
  await writeFile(session.paths.context, buildIntegrationFixContext(input), "utf8");
  await writeFile(session.paths.prompt, prompt, "utf8");
  await appendRunEvent(session.paths.events, { timestamp: now, type: "run.created", runId, data: { checkId: input.checkId, attemptId: input.attemptId, runtime: "coder-codex", executionMode: "worktree" } });
  await appendRunEvent(session.paths.events, { timestamp: now, type: "context.prepared", runId, data: { path: session.artifacts.context } });

  try {
    const dependencyBridge = await prepareWorktreeDependencyBridge({ sourceRoot: input.project.path, checkoutPath: input.checkoutPath });
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
      "# IntegrationFix Unavailable",
      "",
      "AHO could not prepare local project dependencies for the integration fix checkout.",
      "",
      message,
      "",
    ].join("\n"));
    await finishRun(session.paths.run, run, "failed", 1, null);
    throw new Error(message);
  }

  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId, data: { capabilities } });
    const message = [
      "# IntegrationFix Unavailable",
      "",
      "AHO could not safely start Codex in workspace-write non-interactive mode.",
      "",
      ...capabilities.errors.map((error) => `- ${error}`),
      "",
    ].join("\n");
    await writeEmptyCodeArtifacts(session.paths, message);
    await finishRun(session.paths.run, run, "failed", 1, null);
    throw new Error(capabilities.errors.join("\n"));
  }
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId, data: { capabilities } });

  const effectiveModel = await resolveCodexEffectiveModel();
  const argv = buildCodexWorkspaceWriteArgv(capabilities, {
    projectPath: input.checkoutPath,
    lastMessagePath: session.paths.lastMessage,
    model: effectiveModel.model ?? undefined,
    additionalReadDirs: input.memory.mode === "external-local" ? [input.memory.memoryRoot] : [],
  });
  let running: RunMetadata = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(session.paths.run, running);
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "coder.started", runId, data: { cwd: input.checkoutPath, command: running.command } });
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { cwd: input.checkoutPath, command: running.command, model: effectiveModel.model, modelSource: effectiveModel.source } });

  const completion = new CodexCompletionTracker({ lastMessagePath: session.paths.lastMessage });
  const lifecycleTiming = codexLifecycleTiming(15 * 60 * 1000);
  const parser = createCodexJsonlStreamParser((event) => completion.handleEvent(event));
  const processResult = await executeProcessStreaming({
    cwd: input.checkoutPath,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: session.paths.stdout,
    stderrPath: session.paths.stderr,
    mirrorStdoutPath: session.paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    completionSignal: () => completion.isComplete(),
    completionGraceMs: lifecycleTiming.completionGraceMs,
    killGraceMs: lifecycleTiming.killGraceMs,
    timeoutMs: lifecycleTiming.timeoutMs,
  });
  parser.flush();
  const diagnostics = processDiagnosticsData(processResult, completion.snapshot());
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { exitCode: processResult.exitCode, signal: processResult.signal, ...diagnostics } });
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "coder.exited", runId, data: { exitCode: processResult.exitCode, signal: processResult.signal, ...diagnostics } });

  const lastMessage = await ensureLastMessage(session.paths.lastMessage, processResult.stdoutSample, processResult.stderrSample);
  const repairedPatch = await collectCheckoutPatch(input.checkoutPath);
  const diffStat = await gitText(input.checkoutPath, ["diff", "--stat", "HEAD"]);
  await writeFile(session.paths.diff, repairedPatch, "utf8");
  await writeFile(session.paths.diffStat, diffStat, "utf8");
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "diff.collected", runId, data: { bytes: Buffer.byteLength(repairedPatch, "utf8"), stat: diffStat } });

  const sourceAfter = await getSortedSourceStatus(input.project.path);
  const sourceChanged = JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter);
  await appendRunEvent(session.paths.events, { timestamp: new Date().toISOString(), type: "source.checked", runId, data: { before: sourceBefore, after: sourceAfter, changed: sourceChanged } });

  const processSucceeded = processResult.exitCode === 0 || (processResult.terminationReason === "completion-grace-expired" && completion.isComplete());
  const warnings = [
    ...(repairedPatch.trim() ? [] : ["IntegrationFix Codex run completed without producing a repaired diff."]),
    ...(sourceChanged ? ["Source project git status changed during IntegrationFix; Codex may have modified outside the integration checkout."] : []),
    ...(processSucceeded ? [] : [`Codex IntegrationFix process failed: ${processResult.terminationReason ?? processResult.stderrSample ?? processResult.exitCode}`]),
  ];
  await writeFile(session.paths.implementation, renderImplementationSummary({
    lastMessage,
    diffStat,
    diff: repairedPatch,
    warnings,
    sourceBefore,
    sourceAfter,
  }), "utf8");

  const completed = processSucceeded && !sourceChanged && repairedPatch.trim().length > 0;
  running = await finishRun(session.paths.run, running, completed ? "completed" : "failed", completed ? 0 : 1, processResult.signal);
  await appendRunEvent(session.paths.events, { timestamp: running.finishedAt ?? new Date().toISOString(), type: completed ? "run.completed" : "run.failed", runId, data: { warnings } });
  if (!completed) {
    throw new Error(warnings[0] ?? "IntegrationFix Codex repair failed.");
  }

  return {
    repairMode: "codex",
    runId,
    runArtifactRefs: [
      `${session.relativeDir}/run.json`,
      session.artifacts.codexEvents,
      session.artifacts.lastMessage,
      session.artifacts.diff,
      session.artifacts.diffStat,
      session.artifacts.implementation,
    ].filter((ref): ref is string => Boolean(ref)),
    summary: "Codex 在 integration fix checkout 中生成了修复后的组合补丁。",
  };
}

async function buildIntegrationFixPrompt(input: IntegrationFixRepairRunnerInput): Promise<string> {
  const patch = await readFile(input.inputPatchPath, "utf8").catch(() => "");
  return [
    "# AHO IntegrationFix Repair",
    "",
    "You are repairing the current integration checkout for Agent Harness Orchestrator.",
    "",
    "## Hard Boundaries",
    "",
    "- Edit only the current integration fix checkout.",
    "- Do not edit the original source root, AHO memory, Harness docs, remote branches, or external services.",
    "- Produce a real repaired diff; do not claim success without changing the integration checkout.",
    "- Keep the repair bounded to the aggregate validation/audit/conflict reason.",
    "",
    "## Failure Reason",
    "",
    input.reason.trim() || "IntegrationCheck failed.",
    "",
    "## Input Patch",
    "",
    `Patch file: ${input.inputPatchPath}`,
    "",
    "```diff",
    truncateForPrompt(patch, 120_000),
    "```",
    "",
    "## Expected Result",
    "",
    "Update files in this checkout so the combined integration result can pass aggregate validation and audit.",
    "Leave a concise final message describing the repair and any remaining blocker.",
    "",
  ].join("\n");
}

function buildIntegrationFixContext(input: IntegrationFixRepairRunnerInput): string {
  return [
    "# IntegrationFix Context",
    "",
`- Check id: ${input.checkId}`,
    `- Change id: ${input.changeId}`,
    `- Attempt id: ${input.attemptId}`,
    `- Checkout: ${input.checkoutPath}`,
    `- Input patch: ${input.inputPatchPath}`,
    `- Reason: ${input.reason}`,
    "",
    "This is a bounded integration-layer repair. Source root mutation is not allowed.",
    "",
  ].join("\n");
}

function truncateForPrompt(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[truncated ${value.length - maxChars} chars]`;
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

function shortFixCheckoutName(checkId: string, attemptId: string): string {
  const hash = createHash("sha256").update(`${checkId}:${attemptId}`).digest("hex").slice(0, 10);
  return `ifix-${hash}`;
}
