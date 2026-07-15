import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { collectWorktreeDiff } from "../../audit/diff.js";
import { resolveRunnableChangeTarget } from "../../change/target.js";
import { writeJsonFile } from "../../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../../memory/resolver.js";
import type { ProviderTurnResult } from "../../provider-runtime/index.js";
import { getGitStatusShortIgnoringAhoMemory } from "../../project/git.js";
import { appendRunEvent, buildContextProjection, buildRunId } from "../../run/manager.js";
import { finishProviderAttempt, startProviderAttempt } from "../../workbench/provider-attempts.js";
import { getTemplateRoot } from "../../template-source/paths.js";
import { getLatestValidationSummary } from "../../validation/artifacts.js";
import { createWorktree, getWorktreeMetadataPath } from "../../worktree/manager.js";
import { getSpecTestStatus } from "./status.js";
import { resolveSpecTestProvider } from "./provider.js";
import type { ChangeStatus, ManagedProject, ResolvedMemory, RunMetadata, RunStatus, RunWorktreeInfo, SpecTestAcStatus } from "../../types/index.js";

export interface SpecTestGenerateOptions {
  acIds?: string[];
  missing?: boolean;
  prompt?: string;
  changeId?: string;
}

export interface SpecTestGenerateResult {
  run: RunMetadata | null;
  selectedAcs: string[];
  noOp: boolean;
  warnings: string[];
}

export interface DiffPolicyResult {
  files: string[];
  allowed: string[];
  rejected: string[];
}

export async function startSpecTestGenerationRun(project: ManagedProject, options: SpecTestGenerateOptions): Promise<SpecTestGenerateResult> {
  if (options.missing && options.acIds && options.acIds.length > 0) {
    throw new Error("Use either --missing or --ac, not both.");
  }
  if (!options.missing && (!options.acIds || options.acIds.length === 0)) {
    throw new Error("Use --missing or provide at least one --ac.");
  }

  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Spec-test generation run");
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const changeStatus = target.status;
  const changeId = target.changeId;

  const specTestStatus = await getSpecTestStatus(project, { changeId });
  const selectedAcs = selectAcs(specTestStatus.acceptanceCriteria, options);
  if (selectedAcs.length === 0) {
    return {
      run: null,
      selectedAcs: [],
      noOp: true,
      warnings: ["No Acceptance Criteria without linked evidence were found."],
    };
  }

  const extraPrompt = options.prompt?.trim() || undefined;
  const runId = buildRunId(changeId, ["spec-test-generator", ...selectedAcs, extraPrompt ?? ""]);
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
    providerEvents: `${relativeDir}/provider-events.jsonl`,
    providerSession: `${relativeDir}/provider-session.json`,
    lastMessage: `${relativeDir}/last-message.md`,
    diff: `${relativeDir}/diff.patch`,
    diffStat: `${relativeDir}/diff-stat.txt`,
    implementation: `${relativeDir}/implementation.md`,
  };
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    prompt: join(directory, "prompt.md"),
    providerEvents: join(directory, "provider-events.jsonl"),
    providerSession: join(directory, "provider-session.json"),
    lastMessage: join(directory, "last-message.md"),
    diff: join(directory, "diff.patch"),
    diffStat: join(directory, "diff-stat.txt"),
    implementation: join(directory, "implementation.md"),
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "spec-test-generator",
    executionMode: "worktree",
    proposalOnly: true,
    command: ["provider", "turn.start"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    worktree,
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "spec-test-generator", worktree, selectedAcs } });
  await appendRunEvent(paths.events, { timestamp: now, type: "worktree.created", runId, data: { worktreeId: worktree.worktreeId, checkoutPath: worktree.checkoutPath } });

  const context = buildContextProjection(changeStatus);
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context } });

  const latestValidation = await getLatestValidationSummary(memory, changeId);
  const prompt = await composeSpecTestGeneratorPrompt({
    context,
    changeStatus,
    selectedAcs,
    specTestStatus: JSON.stringify(specTestStatus, null, 2),
    latestValidation: latestValidation ? JSON.stringify(latestValidation, null, 2) : "No validation run recorded for this change.",
    sourceTests: await collectTestFileSummary(memory.projectRoot),
    worktree,
    sourceProjectPath: project.path,
    extraPrompt,
  });
  await writeFile(paths.prompt, prompt, "utf8");

  let provider;
  try {
    provider = await resolveSpecTestProvider(memory, project, changeId, "coder", worktree.checkoutPath);
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "provider.exited", runId, data: { status: "failed", error: failure } });
    const message = renderUnavailableMessage([failure]);
    await writeEmptyArtifacts(paths, message);
    run = await finishRun(paths.run, run, "failed", 1, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "spec-test.generation.failed", runId, data: { selectedAcs } });
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.failed", runId });
    return { run, selectedAcs, noOp: false, warnings: [failure] };
  }

  const providerId = provider.id;
  const capabilitySnapshot = await provider.capabilitySnapshot(project, worktree.checkoutPath);
  run = { ...run, command: ["provider", "turn.start"], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "spec-test.generation.started", runId, data: { cwd: worktree.checkoutPath, command: run.command, selectedAcs } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "provider.started", runId, data: { cwd: worktree.checkoutPath, providerId, capabilitySnapshot } });

  await startProviderAttempt(memory, {
    attemptId: runId,
    providerId,
    capabilitySnapshot,
    operationProfile: "coder",
    roleId: "spec-test-generator",
    handoffHash: createHash("sha256").update(prompt).digest("hex"),
    changeId,
    worktreeId: worktree.worktreeId,
    model: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
  });

  let providerResult: ProviderTurnResult;
  try {
    providerResult = await provider.leafExecution.runTurn({
      providerId,
      operationProfile: "coder",
      projectId: project.id,
      changeId,
      runtimeScopeId: runId,
      roleId: "spec-test-generator",
      runId,
      attemptId: runId,
      cwd: worktree.checkoutPath,
      prompt,
      sandboxPolicy: "workspace-write",
      paths: {
        events: paths.providerEvents,
        stderr: paths.stderr,
        lastMessage: paths.lastMessage,
        session: paths.providerSession,
      },
      runtimeWorkspaceRoots: [...new Set([worktree.checkoutPath, project.path, memory.memoryRoot])],
      writableRoots: [worktree.checkoutPath],
      model: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
    });
  } catch (error) {
    providerResult = failedProviderTurn(providerId, error);
  }
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "provider.exited", runId, data: { providerId, status: providerResult.status, sessionId: providerResult.session?.sessionId, turnId: providerResult.turnId, error: providerResult.error } });

  const lastMessage = await ensureProviderMessage(paths.lastMessage, providerResult);
  await writeFile(paths.stdout, providerResult.lastMessage, "utf8");
  const diffResult = await collectWorktreeDiff(memory, worktree.worktreeId, changeId);
  await writeFile(paths.diff, diffResult.diff, "utf8");
  await writeFile(paths.diffStat, diffResult.diffStat, "utf8");
  const diffPolicy = classifySpecTestDiff(diffResult.diff);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "diff.collected", runId, data: { bytes: Buffer.byteLength(diffResult.diff, "utf8"), stat: diffResult.diffStat, rejected: diffPolicy.rejected } });

  const sourceAfter = await getSortedSourceStatus(project.path);
  const sourceChanged = JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "source.checked", runId, data: { before: sourceBefore, after: sourceAfter, changed: sourceChanged } });

  const warnings = [
    ...created.warnings,
    ...(diffResult.diff.trim() ? [] : ["Spec-test generation completed without producing a worktree diff."]),
    ...(diffPolicy.rejected.length > 0 ? [`Spec-test generation produced non-test changes: ${diffPolicy.rejected.join(", ")}.`] : []),
    ...(sourceChanged ? ["Source project git status changed during spec-test generation; the provider may have modified outside the assigned worktree."] : []),
    ...(providerResult.status !== "completed" ? [`Spec-test provider turn ${providerResult.status}${providerResult.error ? `: ${providerResult.error}` : "."}`] : []),
  ];
  await writeFile(paths.implementation, renderGenerationSummary({
    lastMessage,
    selectedAcs,
    diffStat: diffResult.diffStat,
    diff: diffResult.diff,
    diffPolicy,
    warnings,
    sourceBefore,
    sourceAfter,
  }), "utf8");

  const status: RunStatus = providerResult.status === "completed" && !sourceChanged && diffPolicy.rejected.length === 0 ? "completed" : "failed";
  await finishProviderAttempt(memory, runId, providerResult.status === "completed" ? "completed" : providerResult.status === "interrupted" ? "interrupted" : "failed", providerResult.session?.sessionId ?? null);
  run = await finishRun(paths.run, run, status, status === "completed" ? 0 : 1, null);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "spec-test.generation.completed" : "spec-test.generation.failed", runId, data: { selectedAcs, warnings } });
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId, data: { warnings } });

  return { run, selectedAcs, noOp: false, warnings };
}

export function selectAcsForGeneration(items: SpecTestAcStatus[], options: SpecTestGenerateOptions): string[] {
  return selectAcs(items, options);
}

export function classifySpecTestDiff(diff: string): DiffPolicyResult {
  const files = extractModifiedFilesFromDiff(diff);
  const allowed: string[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (isAllowedSpecTestPath(file)) allowed.push(file);
    else rejected.push(file);
  }
  return { files, allowed: allowed.sort(), rejected: rejected.sort() };
}

export async function composeSpecTestGeneratorPrompt(input: {
  context: string;
  changeStatus: ChangeStatus;
  selectedAcs: string[];
  specTestStatus: string;
  latestValidation: string;
  sourceTests: string;
  worktree: RunWorktreeInfo;
  sourceProjectPath: string;
  extraPrompt?: string;
  generatorProfile?: string;
}): Promise<string> {
  const profile = input.generatorProfile ?? await readBundledGeneratorProfile();
  const selected = new Set(input.selectedAcs.map((item) => item.toUpperCase()));
  const selectedDetails = (input.changeStatus.acMap?.acceptanceCriteria ?? [])
    .filter((criterion) => selected.has(criterion.id.toUpperCase()))
    .map((criterion) => `- ${criterion.id}: ${criterion.text}`)
    .join("\n") || input.selectedAcs.map((ac) => `- ${ac}`).join("\n");

  return [
    "# AHO Spec-Test Generation Worktree Run",
    "",
    "You are running as the Spec-Test Generator Agent for Agent Harness Orchestrator.",
    "",
    profile.trim(),
    "",
    "## Command Boundary",
    "",
    "- Modify files only inside the assigned worktree checkout.",
    "- Generate or update test files only.",
    "- Do not modify production code, package manifests, lockfiles, docs, Harness files, or `.agent-harness`.",
    "- Do not edit `spec-tests.json`; AHO writes accepted mappings later through explicit commands.",
    "- Your output is a proposal; validation, audit, human apply, and spec-test proposal accept are still required.",
    "",
    "## Assigned Worktree",
    "",
    `- Worktree ID: ${input.worktree.worktreeId}`,
    `- Checkout path: ${input.worktree.checkoutPath}`,
    `- Branch: ${input.worktree.branchName}`,
    `- Base ref: ${input.worktree.baseRef}`,
    `- Base commit: ${input.worktree.baseCommit}`,
    "",
    "## Source Project",
    "",
    `- Source project path: ${input.sourceProjectPath}`,
    "- Source project is read/context only. Do not edit it directly.",
    "",
    "## Selected Acceptance Criteria",
    "",
    selectedDetails,
    "",
    "## Run Context Projection",
    "",
    input.context.trim(),
    "",
    "## Current Spec-Test Status",
    "",
    input.specTestStatus.trim(),
    "",
    "## Latest Validation",
    "",
    input.latestValidation.trim(),
    "",
    "## Source-Root Test Files",
    "",
    input.sourceTests.trim() || "No source-root test files discovered by AHO.",
    "",
    input.extraPrompt?.trim() ? "## Additional Human Prompt" : "",
    input.extraPrompt?.trim() ?? "",
    "",
  ].join("\n");
}

function selectAcs(items: SpecTestAcStatus[], options: SpecTestGenerateOptions): string[] {
  if (options.missing) {
    return items.filter((item) => item.linkedEvidence === false).map((item) => item.acId).sort();
  }
  const requested = Array.from(new Set((options.acIds ?? []).map((item) => item.trim().toUpperCase()).filter(Boolean)));
  const known = new Set(items.map((item) => item.acId.toUpperCase()));
  const unknown = requested.filter((item) => !known.has(item));
  if (unknown.length > 0) throw new Error(`Unknown Acceptance Criterion id(s): ${unknown.join(", ")}.`);
  return requested;
}

async function readBundledGeneratorProfile(): Promise<string> {
  return await readFile(join(getTemplateRoot(), "..", "agent-profiles", "spec-test-generator.md"), "utf8");
}

function isAllowedSpecTestPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const name = basename(normalized);
  return normalized.startsWith("test/") ||
    normalized.startsWith("tests/") ||
    normalized.startsWith("__tests__/") ||
    normalized.includes("/__tests__/") ||
    normalized.includes("/fixtures/") ||
    normalized.startsWith("fixtures/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(name) ||
    /^test_.*\.py$/i.test(name) ||
    /_test\.(go|py)$/i.test(name) ||
    /^vitest\.config\.[cm]?[jt]s$/i.test(name) ||
    /^jest\.config\.[cm]?[jt]s$/i.test(name);
}

async function collectTestFileSummary(root: string): Promise<string> {
  const files = await collectTestFiles(root);
  const lines: string[] = [];
  for (const file of files.slice(0, 40)) {
    const path = join(root, file);
    let snippet = "";
    try {
      snippet = (await readFile(path, "utf8")).split(/\r?\n/).slice(0, 80).join("\n");
    } catch {
      snippet = "(unreadable)";
    }
    lines.push(`### ${file}`, "", "```", snippet.slice(0, 4000), "```", "");
  }
  if (files.length > 40) lines.push(`Additional test-like files omitted: ${files.length - 40}`);
  return lines.join("\n");
}

async function collectTestFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const queue = [root];
  const excluded = new Set([".git", "node_modules", ".agent-harness", "dist", "coverage", ".tmp"]);
  while (queue.length > 0 && result.length < 120) {
    const current = queue.shift()!;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!excluded.has(entry.name)) queue.push(join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const absolute = join(current, entry.name);
      const rel = relative(root, absolute).replace(/\\/g, "/");
      if (isAllowedSpecTestPath(rel)) result.push(rel);
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}

async function ensureProviderMessage(path: string, result: ProviderTurnResult): Promise<string> {
  if (result.lastMessage.trim()) {
    if (!existsSync(path)) await writeFile(path, result.lastMessage, "utf8");
    return result.lastMessage;
  }
  const message = [
    "Status: failed",
    "",
    `The provider turn ended with status ${result.status} without a final generator message.${result.error ? ` ${result.error}` : ""}`,
    "",
  ].join("\n");
  await writeFile(path, message, "utf8");
  return message;
}

async function writeEmptyArtifacts(paths: { stdout: string; stderr: string; providerEvents: string; lastMessage: string; diff: string; diffStat: string; implementation: string }, message: string): Promise<void> {
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, message, "utf8");
  await writeFile(paths.providerEvents, "", "utf8");
  await writeFile(paths.lastMessage, message, "utf8");
  await writeFile(paths.diff, "", "utf8");
  await writeFile(paths.diffStat, "", "utf8");
  await writeFile(paths.implementation, message, "utf8");
}

function renderGenerationSummary(input: {
  lastMessage: string;
  selectedAcs: string[];
  diffStat: string;
  diff: string;
  diffPolicy: DiffPolicyResult;
  warnings: string[];
  sourceBefore: string[];
  sourceAfter: string[];
}): string {
  return [
    "# Spec-Test Generation Summary",
    "",
    "## Selected Acceptance Criteria",
    "",
    ...input.selectedAcs.map((ac) => `- ${ac}`),
    "",
    "## Generator Final Message",
    "",
    input.lastMessage.trim() || "(empty)",
    "",
    "## Modified Files",
    "",
    ...(input.diffPolicy.files.length ? input.diffPolicy.files.map((file) => `- ${file}`) : ["- None detected."]),
    "",
    "## Diff Policy",
    "",
    `Allowed files: ${input.diffPolicy.allowed.join(", ") || "(none)"}`,
    `Rejected files: ${input.diffPolicy.rejected.join(", ") || "(none)"}`,
    "",
    "## Diff Stat",
    "",
    input.diffStat.trim() || "No diff stat.",
    "",
    "## Warnings",
    "",
    ...(input.warnings.length ? input.warnings.map((warning) => `- ${warning}`) : ["- None."]),
    "",
    "## Source Repo Status Check",
    "",
    `Before: ${input.sourceBefore.join(" | ") || "(clean)"}`,
    `After: ${input.sourceAfter.join(" | ") || "(clean)"}`,
    "",
  ].join("\n");
}

function extractModifiedFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match) files.add(match[2]);
  }
  return Array.from(files).sort();
}

async function getSortedSourceStatus(projectPath: string): Promise<string[]> {
  return (await getGitStatusShortIgnoringAhoMemory(projectPath)).slice().sort();
}

function renderUnavailableMessage(errors: string[]): string {
  return [
    "Status: failed",
    "",
    "# Spec-Test Generation Unavailable",
    "",
    "AHO could not start a provider with the required workspace-write capability.",
    "",
    ...errors.map((error) => `- ${error}`),
    "",
  ].join("\n");
}

function failedProviderTurn(providerId: string, error: unknown): ProviderTurnResult {
  return {
    providerId,
    status: "failed",
    session: null,
    turnId: null,
    lastMessage: "",
    childThreads: [],
    changedFiles: [],
    error: error instanceof Error ? error.message : String(error),
  };
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
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

