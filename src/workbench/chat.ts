import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { startAuditRun } from "../audit/manager.js";
import { startCodeRun } from "../code/manager.js";
import { buildCodexReadonlyArgv, buildCodexReadonlyResumeArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { extractCodexSessionIdFromJsonl, extractFinalMessageFromCodexJsonl } from "../codex/jsonl.js";
import { createChange } from "../change/manager.js";
import { acceptPlanProposal, acceptSpecProposal, startPlanProposalRun, startSpecProposalRun } from "../change/proposals.js";
import { getActiveChanges } from "../ecl/index.js";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { appendRunEvent, buildContextProjection, buildRunId } from "../run/manager.js";
import { executeProcessStreaming } from "../run/process.js";
import { getSpecTestDriftReport } from "../spec-test/drift.js";
import { startValidationRun } from "../validation/manager.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, RunStatus } from "../types/index.js";

export type TopicThreadEventType =
  | "user.message"
  | "assistant.message"
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed";

export interface TopicThreadEntry {
  id: string;
  type: TopicThreadEventType;
  timestamp: string;
  changeId: string;
  text?: string;
  actionRunId?: string;
  actionType?: string;
  status?: string;
  runId?: string;
  artifact?: string;
  error?: string;
}

export interface TopicRuntimeMetadata {
  version: "1.0";
  changeId: string;
  codexSessionId: string | null;
  updatedAt: string;
}

export interface TopicMessageResult {
  user: TopicThreadEntry;
  assistant: TopicThreadEntry | null;
  run: RunMetadata | null;
  codexSessionId: string | null;
}

export type WorkbenchWorkflowActionType =
  | "chat.ask"
  | "change.spec.propose"
  | "change.spec.accept"
  | "change.plan.propose"
  | "change.plan.accept"
  | "code.run"
  | "validate.run"
  | "audit.run"
  | "spec-test.drift";

export interface WorkbenchWorkflowActionRequest {
  actionType: WorkbenchWorkflowActionType;
  changeId?: string;
  prompt?: string;
  proposalId?: string;
  worktreeId?: string;
}

export interface WorkbenchWorkflowActionResult {
  actionRunId: string;
  actionType: WorkbenchWorkflowActionType;
  status: "completed" | "failed";
  result?: unknown;
  runId?: string;
  error?: string;
}

const runtimeMetadataSchema = z.object({
  version: z.literal("1.0"),
  changeId: z.string(),
  codexSessionId: z.string().nullable(),
  updatedAt: z.string(),
});

export async function createWorkbenchTopic(project: ManagedProject, input: { title: string; body?: string }): Promise<{ changeId: string; title: string }> {
  const result = await createChange(project, { title: input.title, body: input.body });
  await appendTopicThreadEntry(project, result.change.id, {
    type: "user.message",
    text: input.body ?? input.title,
  });
  return { changeId: result.change.id, title: result.change.title };
}

export async function listTopicMessages(project: ManagedProject, changeId: string): Promise<TopicThreadEntry[]> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  return readThreadLog(memory, changePath);
}

export async function postTopicMessage(project: ManagedProject, changeId: string, text: string): Promise<TopicMessageResult> {
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text });
  const chat = await runCodexChat(project, changeId, text);
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    text: chat.message,
    runId: chat.run.id,
    artifact: chat.run.artifacts.lastMessage,
  });
  return { user, assistant, run: chat.run, codexSessionId: chat.codexSessionId };
}

export async function appendTopicThreadEntry(project: ManagedProject, changeId: string, input: Omit<TopicThreadEntry, "id" | "timestamp" | "changeId">): Promise<TopicThreadEntry> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Topic thread update");
  const entry: TopicThreadEntry = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    changeId,
    ...input,
  };
  await appendFile(join(memory.memoryRoot, changePath, "thread.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export async function runWorkbenchWorkflowAction(project: ManagedProject, request: WorkbenchWorkflowActionRequest): Promise<WorkbenchWorkflowActionResult> {
  const actionRunId = `action-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const changeId = request.changeId ?? await getSingleActiveChangeId(project);
  await appendTopicThreadEntry(project, changeId, { type: "workflow.started", actionRunId, actionType: request.actionType, status: "running" });
  try {
    const result = await executeWorkflowAction(project, changeId, request);
    const runId = extractRunId(result);
    await appendTopicThreadEntry(project, changeId, { type: "workflow.completed", actionRunId, actionType: request.actionType, status: "completed", runId });
    return { actionRunId, actionType: request.actionType, status: "completed", result, runId };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await appendTopicThreadEntry(project, changeId, { type: "workflow.failed", actionRunId, actionType: request.actionType, status: "failed", error });
    return { actionRunId, actionType: request.actionType, status: "failed", error };
  }
}

export async function getWorkbenchActionEvents(project: ManagedProject, actionRunId: string): Promise<TopicThreadEntry[]> {
  const memory = await resolveProjectMemory(project);
  if (!existsSync(join(memory.changesRoot, "active"))) return [];
  const entries = await collectAllThreadEntries(memory);
  return entries.filter((entry) => entry.actionRunId === actionRunId);
}

async function executeWorkflowAction(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest): Promise<unknown> {
  switch (request.actionType) {
    case "chat.ask":
      if (!request.prompt) throw new Error("chat.ask requires prompt.");
      return postTopicMessage(project, changeId, request.prompt);
    case "change.spec.propose":
      return startSpecProposalRun(project, { prompt: request.prompt });
    case "change.spec.accept":
      if (!request.proposalId) throw new Error("change.spec.accept requires proposalId.");
      return acceptSpecProposal(project, request.proposalId);
    case "change.plan.propose":
      return startPlanProposalRun(project, { prompt: request.prompt });
    case "change.plan.accept":
      if (!request.proposalId) throw new Error("change.plan.accept requires proposalId.");
      return acceptPlanProposal(project, request.proposalId);
    case "code.run":
      return startCodeRun(project, { prompt: request.prompt });
    case "validate.run":
      return startValidationRun(project, { worktree: request.worktreeId });
    case "audit.run":
      return startAuditRun(project, { worktreeId: request.worktreeId, prompt: request.prompt });
    case "spec-test.drift":
      return getSpecTestDriftReport(project, { worktreeId: request.worktreeId });
    default:
      return assertNever(request.actionType);
  }
}

async function runCodexChat(project: ManagedProject, changeId: string, userMessage: string): Promise<{ run: RunMetadata; message: string; codexSessionId: string | null }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Topic chat");
  const { changePath } = await resolveTopic(project, changeId);
  const runtime = await readTopicRuntime(memory, changePath, changeId);
  const runId = buildRunId(changeId, ["codex", "chat"]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    prompt: join(directory, "prompt.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
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
    command: ["codex", runtime.codexSessionId ? "exec resume" : "exec"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts: {
      base: memory.artifactBase,
      directory: relativeDir,
      context: `${relativeDir}/context.md`,
      prompt: `${relativeDir}/prompt.md`,
      events: `${relativeDir}/events.jsonl`,
      stdout: `${relativeDir}/stdout.log`,
      stderr: `${relativeDir}/stderr.log`,
      codexEvents: `${relativeDir}/codex-events.jsonl`,
      lastMessage: `${relativeDir}/last-message.md`,
    },
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "codex-chat", resumed: Boolean(runtime.codexSessionId) } });
  const context = await buildChatContext(project, memory, changeId, userMessage);
  await writeFile(paths.context, context, "utf8");
  const prompt = `${context}\n\n## User Message\n\n${userMessage}\n`;
  await writeFile(paths.prompt, prompt, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: run.artifacts.context } });

  const capabilities = await detectCodexCapabilities();
  const argv = runtime.codexSessionId
    ? buildCodexReadonlyResumeArgv(capabilities, { projectPath: project.path, lastMessagePath: paths.lastMessage, sessionId: runtime.codexSessionId })
    : buildCodexReadonlyArgv(capabilities, { projectPath: project.path, lastMessagePath: paths.lastMessage, additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [] });

  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { phase: "chat", resumed: Boolean(runtime.codexSessionId) } });
  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
  });
  const stdout = processResult.stdoutSample;
  const lastMessage = existsSync(paths.lastMessage)
    ? await readFile(paths.lastMessage, "utf8")
    : extractFinalMessageFromCodexJsonl(stdout) ?? "";
  if (!existsSync(paths.lastMessage)) await writeFile(paths.lastMessage, lastMessage || "# Codex Chat Not Captured\n", "utf8");
  const nextSessionId = extractCodexSessionIdFromJsonl(stdout) ?? runtime.codexSessionId;
  await writeTopicRuntime(memory, changePath, { version: "1.0", changeId, codexSessionId: nextSessionId, updatedAt: new Date().toISOString() });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { phase: "chat", exitCode: processResult.exitCode, signal: processResult.signal, sessionLinked: Boolean(nextSessionId) } });
  const status: RunStatus = processResult.exitCode === 0 ? "completed" : "failed";
  run = { ...run, status, exitCode: processResult.exitCode, signal: processResult.signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  return { run, message: lastMessage.trim() || processResult.stderrSample || "Codex did not return a final message.", codexSessionId: nextSessionId };
}

async function buildChatContext(project: ManagedProject, memory: ResolvedMemory, changeId: string, userMessage: string): Promise<string> {
  const status = await import("../change/manager.js").then((module) => module.getChangeStatus(project));
  const { changePath } = await resolveTopic(project, changeId);
  const recentMessages = (await readThreadLog(memory, changePath)).slice(-12);
  return [
    "# AHO Topic Chat",
    "",
    "You are answering inside the AHO Workbench Topic chat.",
    "This is ordinary read-only conversation. Do not edit files, create worktrees, apply changes, close changes, or claim approval.",
    "Use AHO artifacts as source of truth. Codex session memory is only runtime continuity.",
    "",
    buildContextProjection(status),
    "## Recent Topic Messages",
    "",
    ...recentMessages.map((entry) => `- ${entry.type}: ${entry.text ?? entry.actionType ?? entry.status ?? ""}`),
    "",
    "## Current User Message",
    "",
    userMessage,
  ].join("\n");
}

async function resolveTopic(project: ManagedProject, changeId: string): Promise<{ memory: ResolvedMemory; changePath: string }> {
  const memory = await resolveProjectMemory(project);
  const active = await getActiveChanges(memory);
  const match = active.find((item) => item.name === changeId);
  if (!match) throw new Error(`Topic not found or not active: ${changeId}.`);
  return { memory, changePath: match.path };
}

async function getSingleActiveChangeId(project: ManagedProject): Promise<string> {
  const memory = await resolveProjectMemory(project);
  const active = await getActiveChanges(memory);
  if (active.length !== 1) throw new Error(`Expected exactly one active Topic; found ${active.length}.`);
  return active[0].name;
}

async function readThreadLog(memory: ResolvedMemory, changePath: string): Promise<TopicThreadEntry[]> {
  const path = join(memory.memoryRoot, changePath, "thread.jsonl");
  if (!existsSync(path)) return [];
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TopicThreadEntry);
}

async function readTopicRuntime(memory: ResolvedMemory, changePath: string, changeId: string): Promise<TopicRuntimeMetadata> {
  return readJsonFile(join(memory.memoryRoot, changePath, "topic-runtime.json"), runtimeMetadataSchema, {
    version: "1.0",
    changeId,
    codexSessionId: null,
    updatedAt: new Date(0).toISOString(),
  });
}

async function writeTopicRuntime(memory: ResolvedMemory, changePath: string, metadata: TopicRuntimeMetadata): Promise<void> {
  await writeJsonFile(join(memory.memoryRoot, changePath, "topic-runtime.json"), metadata);
}

async function collectAllThreadEntries(memory: ResolvedMemory): Promise<TopicThreadEntry[]> {
  const roots = [join(memory.changesRoot, "active"), join(memory.changesRoot, "parking"), join(memory.changesRoot, "archive")];
  const entries: TopicThreadEntry[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const changePath = relative(memory.memoryRoot, join(root, entry.name)).replace(/\\/g, "/");
      entries.push(...await readThreadLog(memory, changePath));
    }
  }
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function extractRunId(result: unknown): string | undefined {
  if (isRecord(result) && isRecord(result.run) && typeof result.run.id === "string") return result.run.id;
  if (isRecord(result) && isRecord(result.result) && isRecord(result.result.run) && typeof result.result.run.id === "string") return result.result.run.id;
  return undefined;
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow action: ${value}`);
}
