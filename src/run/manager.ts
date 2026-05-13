import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { getChangeStatus } from "../change/manager.js";
import { writeJsonFile } from "../fs/json.js";
import { shortHash, slugify } from "../fs/path.js";
import { assertWritableMemory, resolveMemory, resolveProjectMemory } from "../memory/resolver.js";
import { executeProcessStreaming } from "./process.js";
import { createWorktree, getWorktreeMetadataPath } from "../worktree/manager.js";
import type { ChangeStatus, ManagedProject, ResolvedMemory, RunEvent, RunMetadata, RunStatus, RunWorktreeInfo } from "../types/index.js";

const runMetadataSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  changeId: z.string(),
  projectPath: z.string(),
  runtime: z.enum(["local-command", "codex-readonly", "validator", "auditor", "coder-codex"]),
  executionMode: z.enum(["direct", "worktree"]).optional(),
  proposalOnly: z.boolean().optional(),
  command: z.array(z.string()),
  status: z.enum(["created", "running", "completed", "failed"]),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  artifacts: z.object({
    base: z.enum(["project-root", "memory-root"]).default("project-root"),
    directory: z.string(),
    context: z.string(),
    events: z.string(),
    stdout: z.string(),
    stderr: z.string(),
    prompt: z.string().optional(),
  codexEvents: z.string().optional(),
  lastMessage: z.string().optional(),
  implementation: z.string().optional(),
    worktree: z.string().optional(),
    diff: z.string().optional(),
    diffStat: z.string().optional(),
    validation: z.string().optional(),
    audit: z.string().optional(),
    auditMarkdown: z.string().optional(),
    review: z.string().optional(),
  }),
  worktree: z.object({
    worktreeId: z.string(),
    branchName: z.string(),
    baseRef: z.string(),
    baseCommit: z.string(),
    checkoutPath: z.string(),
    metadataPath: z.string(),
  }).optional(),
});

export interface RunStartResult {
  run: RunMetadata;
}

export interface LocalCommandRunOptions {
  worktree?: boolean;
}

export async function startLocalCommandRun(project: ManagedProject, command: string[], options: LocalCommandRunOptions = {}): Promise<RunStartResult> {
  if (command.length === 0) {
    throw new Error("Run command is required after `--`, for example: aho run start <project> -- npm test");
  }

  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Local command run");
  const changeStatus = await getChangeStatus(project);
  assertRunnableChange(changeStatus);
  const changeId = changeStatus.change?.id ?? changeStatus.activeChanges[0]?.name;
  if (!changeId) throw new Error("Cannot start run without an active change id.");

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

export async function listRuns(project: ManagedProject | string | ResolvedMemory): Promise<RunMetadata[]> {
  const memory = await resolveRunMemory(project);
  const runsDir = memory.runsRoot;
  if (!existsSync(runsDir)) return [];
  const entries = await readdir(runsDir, { withFileTypes: true });
  const runs: RunMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    runs.push(await readRun(memory, entry.name));
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readRun(project: ManagedProject | string | ResolvedMemory, runId: string): Promise<RunMetadata> {
  const memory = await resolveRunMemory(project);
  const path = join(memory.runsRoot, runId, "run.json");
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return runMetadataSchema.parse(parsed) as RunMetadata;
}

export function assertRunnableChange(status: ChangeStatus): void {
  if (status.activeChanges.length === 0) {
    throw new Error("Cannot start run: no active change found.");
  }
  if (status.activeChanges.length > 1) {
    throw new Error(`Cannot start run: expected exactly one active change; found ${status.activeChanges.length}.`);
  }
  if (!status.change) {
    throw new Error("Cannot start run: active change is missing valid change.json.");
  }
}

export function buildRunId(changeId: string, command: string[]): string {
  const timestamp = compactLocalTimestamp();
  const commandHash = shortHash(`${Date.now()}\0${command.join("\0")}`).slice(0, 6);
  return `run-${timestamp}-${slugify(changeId)}-${commandHash}`;
}

export function buildContextProjection(status: ChangeStatus): string {
  const change = status.change;
  const acMap = status.acMap;
  return [
    "# Run Context Projection",
    "",
    "This file is generated for one run. It is not the source of truth.",
    "Read the active change files and project Harness for durable memory.",
    "",
    "## Change",
    "",
    `- ID: ${change?.id ?? "unknown"}`,
    `- Title: ${change?.title ?? "unknown"}`,
    `- Review Status: ${status.reviewStatus}`,
    `- Latest Validation: ${status.latestValidation ? `${status.latestValidation.status} (${status.latestValidation.id})` : "none"}`,
    `- Latest Audit: ${status.latestAudit ? `${status.latestAudit.status} (${status.latestAudit.id})` : "none"}`,
    `- Close Gate Ready: ${status.closeGate.ready}`,
    "",
    "## Acceptance Criteria",
    "",
    ...(acMap?.acceptanceCriteria.length
      ? acMap.acceptanceCriteria.map((criterion) => `- ${criterion.id}: ${criterion.text || "(empty)"}`)
      : ["- None parsed."]),
    "",
    "## Tasks",
    "",
    ...(acMap?.tasks.length
      ? acMap.tasks.map((task) => `- ${task.done ? "[x]" : "[ ]"} ${task.id}: ${task.text || "(empty)"}; Covers: ${task.acIds.join(", ") || "none"}`)
      : ["- None parsed."]),
    "",
    "## Close Gate",
    "",
    ...(status.closeGate.blockingIssues.length ? status.closeGate.blockingIssues.map((issue) => `- BLOCKING: ${issue}`) : ["- No blocking issues."]),
    ...(status.closeGate.warnings.length ? status.closeGate.warnings.map((warning) => `- WARNING: ${warning}`) : []),
    "",
  ].join("\n");
}

export async function appendRunEvent(path: string, event: RunEvent): Promise<void> {
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
}

function compactLocalTimestamp(date = new Date()): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

async function resolveRunMemory(project: ManagedProject | string | ResolvedMemory): Promise<ResolvedMemory> {
  if (typeof project === "string") return resolveMemory({ path: project });
  if ("runsRoot" in project) return project;
  return resolveProjectMemory(project);
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}
