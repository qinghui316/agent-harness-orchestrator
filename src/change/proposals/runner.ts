import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRunAgentRecord, resolveAgentRole } from "../../agent/catalog.js";
import { buildCodexReadonlyArgv, detectCodexCapabilities } from "../../codex/capabilities.js";
import { extractFinalMessageFromCodexJsonl } from "../../codex/jsonl.js";
import { readRequiredJsonFile, writeJsonFile } from "../../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../../memory/resolver.js";
import { appendRunEvent, buildContextProjection, buildRunId } from "../../run/manager.js";
import { executeProcessStreaming } from "../../run/process.js";
import type { ManagedProject, RunMetadata, RunRuntime, RunStatus, RunArtifactPaths } from "../../types/index.js";
import { resolveRunnableChangeTarget } from "../target.js";
import { readTargetHashes } from "./hashes.js";
import { displayArtifactPath, proposalJsonFile, proposalMarkdownFile } from "./paths.js";
import { renderUnavailableProposalMessage } from "./parser-renderer.js";
import { runMetadataSchema } from "./schemas.js";
import type { ChangeProposalRunOptions, CommonProposalRun, ProposalKind, ProposalRunPaths } from "./types.js";

export async function prepareProposalRun(project: ManagedProject, kind: ProposalKind, options: ChangeProposalRunOptions = {}): Promise<CommonProposalRun> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, `${kind} proposal run`);
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const changeStatus = target.status;
  const changeId = target.changeId;
  const active = changeStatus.activeChanges.find((item) => item.name === changeId);
  if (!active) throw new Error(`Cannot resolve proposal Change path for ${changeId}.`);
  const changePath = join(memory.memoryRoot, active.path);

  const runId = buildRunId(changeId, [kind === "spec" ? "spec-agent" : "planner", options.prompt ?? ""]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const artifacts: RunArtifactPaths = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    prompt: `${relativeDir}/prompt.md`,
    codexEvents: `${relativeDir}/codex-events.jsonl`,
    lastMessage: `${relativeDir}/last-message.md`,
    ...(kind === "spec"
      ? { specProposal: `${relativeDir}/spec-proposal.json`, specProposalMarkdown: `${relativeDir}/spec-proposal.md` }
      : { planProposal: `${relativeDir}/plan-proposal.json`, planProposalMarkdown: `${relativeDir}/plan-proposal.md` }),
  };
  const paths: ProposalRunPaths = {
    directory,
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    prompt: join(directory, "prompt.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    codexEvents: join(directory, "codex-events.jsonl"),
    lastMessage: join(directory, "last-message.md"),
    proposal: join(directory, proposalJsonFile(kind)),
    proposalMarkdown: join(directory, proposalMarkdownFile(kind)),
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  const context = buildContextProjection(changeStatus);
  await writeFile(paths.context, context, "utf8");
  const targetHashes = await readTargetHashes(changePath);
  const role = await resolveAgentRole(memory, kind === "spec" ? "spec-agent" : "planner");
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: kind === "spec" ? "spec-agent" : "planner",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    agent: buildRunAgentRecord(role),
    promptStack: ["agent-role", "active-change", "bounded-docs", "output-contract"],
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: run.runtime } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });
  return { memory, changeStatus, changeId, changePath, runId, paths, artifacts, context, targetHashes, startedAt: now, role };
}

export async function executeCodexProposal(
  project: ManagedProject,
  prepared: CommonProposalRun,
  runtime: RunRuntime,
  eventPrefix: "change.spec.proposal" | "change.plan.proposal",
  prompt: string,
): Promise<{ run: RunMetadata; exitCode: number | null; signal: NodeJS.Signals | null; stdoutSample: string; stderrSample: string }> {
  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(prepared.paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId: prepared.runId, data: { capabilities } });
    const message = renderUnavailableProposalMessage(prepared.artifacts.specProposal !== undefined ? "spec" : "plan", capabilities.errors);
    await writeFile(prepared.paths.lastMessage, message, "utf8");
    await writeFile(prepared.paths.stdout, "", "utf8");
    await writeFile(prepared.paths.codexEvents, "", "utf8");
    await writeFile(prepared.paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    const run = await finishRun(prepared.paths.run, await readRunMetadata(prepared.paths.run), "failed", 1, null);
    return { run, exitCode: 1, signal: null, stdoutSample: "", stderrSample: capabilities.errors.join("\n") };
  }

  await appendRunEvent(prepared.paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId: prepared.runId, data: { capabilities } });
  const argv = buildCodexReadonlyArgv(capabilities, {
    projectPath: project.path,
    lastMessagePath: prepared.paths.lastMessage,
    additionalReadDirs: prepared.memory.mode === "external-local" ? [prepared.memory.memoryRoot] : [],
  });
  let run = await readRunMetadata(prepared.paths.run);
  run = { ...run, command: [argv.command, ...argv.args], status: "running", runtime };
  await writeJsonFile(prepared.paths.run, run);
  await appendRunEvent(prepared.paths.events, { timestamp: new Date().toISOString(), type: `${eventPrefix}.started`, runId: prepared.runId, data: { cwd: project.path, command: run.command } });
  await appendRunEvent(prepared.paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId: prepared.runId, data: { cwd: project.path, command: run.command } });

  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: prepared.paths.stdout,
    stderrPath: prepared.paths.stderr,
    mirrorStdoutPath: prepared.paths.codexEvents,
  });
  await appendRunEvent(prepared.paths.events, {
    timestamp: new Date().toISOString(),
    type: "codex.exited",
    runId: prepared.runId,
    data: { exitCode: processResult.exitCode, signal: processResult.signal },
  });
  return { run, exitCode: processResult.exitCode, signal: processResult.signal, stdoutSample: processResult.stdoutSample, stderrSample: processResult.stderrSample };
}

export async function ensureLastMessage(path: string, stdout: string, stderr: string): Promise<string> {
  if (existsSync(path)) {
    const existing = await readFile(path, "utf8");
    if (existing.trim()) return existing;
  }
  const parsed = extractFinalMessageFromCodexJsonl(stdout);
  const message = parsed ?? [
    "Status: failed",
    "",
    "AHO did not find a final Codex message in output-last-message or JSONL stdout.",
    "",
    stderr.trim() ? "## stderr sample" : "",
    stderr.trim(),
    "",
    "```json",
    JSON.stringify({ status: "failed", openQuestions: [], assumptions: [], warnings: ["Codex final message was not captured."] }, null, 2),
    "```",
    "",
  ].join("\n");
  await writeFile(path, message, "utf8");
  return message;
}

export async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const finished = { ...run, status, exitCode, signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(path, finished);
  return finished;
}

async function readRunMetadata(path: string): Promise<RunMetadata> {
  return await readRequiredJsonFile(path, runMetadataSchema) as unknown as RunMetadata;
}
