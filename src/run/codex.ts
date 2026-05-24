import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getChangeStatus } from "../change/manager.js";
import { buildCodexReadonlyArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { CodexCompletionTracker, codexLifecycleTiming, type CodexCompletionSnapshot } from "../codex/completion.js";
import { createCodexJsonlStreamParser, extractFinalMessageFromCodexJsonl } from "../codex/jsonl.js";
import { composeCodexPrompt } from "../codex/prompt.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getEnabledSkillContext } from "../skill/catalog.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, RunStatus } from "../types/index.js";
import { appendRunEvent, assertRunnableChange, buildContextProjection, buildRunId } from "./manager.js";
import { executeProcessStreaming, type ProcessExecutionResult } from "./process.js";

export interface CodexReadonlyRunOptions {
  prompt: string;
  model?: string;
  profile?: string;
}

export interface CodexReadonlyRunResult {
  run: RunMetadata;
}

export async function startCodexReadonlyRun(project: ManagedProject, options: CodexReadonlyRunOptions): Promise<CodexReadonlyRunResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Codex read-only run");
  const changeStatus = await getChangeStatus(project);
  assertRunnableChange(changeStatus);
  const changeId = changeStatus.change?.id ?? changeStatus.activeChanges[0]?.name;
  if (!changeId) throw new Error("Cannot start Codex run without an active change id.");
  const skillContext = await getEnabledSkillContext(project, changeId);

  const runId = buildRunId(changeId, ["codex-readonly", options.prompt]);
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
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "codex-readonly",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    promptStack: ["active-change", "aho-skills", "user-prompt"],
    enabledSkills: skillContext.records,
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "codex-readonly" } });

  const context = buildContextProjection(changeStatus);
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });

  const prompt = composeCodexPrompt({ context: `${context}${skillContext.promptSection ? `\n\n${skillContext.promptSection}` : ""}`, userPrompt: options.prompt });
  await writeFile(paths.prompt, prompt, "utf8");

  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId, data: { capabilities } });
    const message = [
      "# Codex Proposal Unavailable",
      "",
      "AHO could not safely start Codex in read-only non-interactive mode.",
      "",
      ...capabilities.errors.map((error) => `- ${error}`),
      "",
    ].join("\n");
    await writeFile(paths.lastMessage, message, "utf8");
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.codexEvents, "", "utf8");
    await writeFile(paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    run = await finishRun(paths.run, run, "failed", 1, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.failed", runId });
    return { run };
  }
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId, data: { capabilities } });

  const argv = buildCodexReadonlyArgv(capabilities, {
    projectPath: project.path,
    lastMessagePath: paths.lastMessage,
    model: options.model,
    profile: options.profile,
  });
  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { cwd: project.path, command: run.command, skillWarnings: skillContext.warnings } });

  const completion = new CodexCompletionTracker({ lastMessagePath: paths.lastMessage });
  const lifecycleTiming = codexLifecycleTiming(8 * 60 * 1000);
  const parser = createCodexJsonlStreamParser((event) => completion.handleEvent(event));
  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    completionSignal: () => completion.isComplete(),
    completionGraceMs: lifecycleTiming.completionGraceMs,
    killGraceMs: lifecycleTiming.killGraceMs,
    timeoutMs: lifecycleTiming.timeoutMs,
  });
  parser.flush();
  const codexCompletion = completion.snapshot();
  const processDiagnostics = processDiagnosticsData(processResult, codexCompletion);
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "codex.exited",
    runId,
    data: { exitCode: processResult.exitCode, signal: processResult.signal, ...processDiagnostics },
  });

  await ensureLastMessage(paths.lastMessage, processResult.stdoutSample, processResult.stderrSample);

  const processSucceeded = processResult.exitCode === 0 || (processResult.terminationReason === "completion-grace-expired" && completion.isComplete());
  const status: RunStatus = processSucceeded ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, processSucceeded ? 0 : processResult.exitCode, processResult.signal);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });

  return { run };
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

function processDiagnosticsData(processResult: ProcessExecutionResult, completion: CodexCompletionSnapshot): Record<string, unknown> {
  return {
    timedOut: processResult.timedOut,
    terminated: processResult.terminated,
    terminationReason: processResult.terminationReason,
    codexCompletion: completion,
  };
}

async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const finished = {
    ...run,
    status,
    exitCode,
    signal,
    finishedAt: new Date().toISOString(),
  };
  await writeJsonFile(path, finished);
  return finished;
}

async function ensureLastMessage(path: string, stdout: string, stderr: string): Promise<void> {
  if (existsSync(path)) {
    const existing = await readFile(path, "utf8");
    if (existing.trim()) return;
  }

  const parsed = extractFinalMessageFromCodexJsonl(stdout);
  if (parsed) {
    await writeFile(path, parsed, "utf8");
    return;
  }

  await writeFile(path, [
    "# Codex Proposal Not Captured",
    "",
    "AHO did not find a final Codex message in `--output-last-message` output or JSONL stdout.",
    "",
    "Inspect `stdout.log`, `codex-events.jsonl`, and `stderr.log` for diagnostics.",
    "",
    stderr.trim() ? "## stderr sample" : "",
    stderr.trim(),
    "",
  ].join("\n"), "utf8");
}
