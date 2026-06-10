import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getChangeStatus } from "../change/status.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { buildCodexReadonlyArgv, detectCodexCapabilities } from "../codex/capabilities.js";
import { CodexCompletionTracker, codexLifecycleTiming, type CodexCompletionSnapshot } from "../codex/completion.js";
import { createCodexJsonlStreamParser, extractFinalMessageFromCodexJsonl, type CodexJsonlStreamEvent } from "../codex/jsonl.js";
import { buildRoleContextArtifact, buildRoleContextPacket, contextSourceRef } from "../context/packets.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../agent/catalog.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getWorktreeMetadataPath } from "../worktree/paths.js";
import { getLatestValidationSummary } from "../validation/repository.js";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import { runtimeContinuityPaths, type RuntimeContinuityPaths } from "../runtime-continuity/paths.js";
import { appendAgentEventEnvelope, createRuntimeContinuityArtifacts, markRuntimeContinuityStatus, type RuntimeContinuityWorkspaceDescriptor } from "../runtime-continuity/repository.js";
import type { RuntimeContinuityArtifacts } from "../runtime-continuity/types.js";
import type { AuditResult, AuditStatus, AuditSummary, ManagedProject, ResolvedMemory, RunMetadata, RunStatus } from "../types/index.js";
import { appendRunEvent } from "../run/events.js";
import { buildRunId } from "../run/run-id.js";
import { isRunStopRequested } from "../run/control.js";
import { executeProcessStreaming, type ProcessExecutionResult } from "../run/process.js";
import { collectWorktreeDiff } from "./diff.js";
import { listAuditResults, readAuditResult, summarizeAudit } from "./repository.js";
import { parseAuditMessage } from "./parser.js";
import { composeAuditPrompt } from "./prompt.js";

export interface AuditRunOptions {
  changeId?: string;
  worktreeId?: string;
  prompt?: string;
}

export interface AuditRunResult {
  run: RunMetadata;
  audit: AuditResult;
}

export interface AuditStatusResult {
  activeChangeId: string | null;
  latest: AuditSummary | null;
  audits: AuditSummary[];
}

export async function startAuditRun(project: ManagedProject, options: AuditRunOptions = {}): Promise<AuditRunResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Audit run");
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const changeStatus = target.status;
  const changeId = target.changeId;
  const role = await resolveAgentRole(memory, "auditor-agent");

  const runId = buildRunId(changeId, ["auditor", options.worktreeId ?? "no-worktree", options.prompt ?? ""]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    contextPacket: `${relativeDir}/context-packet.json`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    prompt: `${relativeDir}/prompt.md`,
    codexEvents: `${relativeDir}/codex-events.jsonl`,
    lastMessage: `${relativeDir}/last-message.md`,
    audit: `${relativeDir}/audit.json`,
    auditMarkdown: `${relativeDir}/audit.md`,
    diff: `${relativeDir}/diff.patch`,
    diffStat: `${relativeDir}/diff-stat.txt`,
  };
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    contextPacket: join(directory, "context-packet.json"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    prompt: join(directory, "prompt.md"),
    codexEvents: join(directory, "codex-events.jsonl"),
    lastMessage: join(directory, "last-message.md"),
    audit: join(directory, "audit.json"),
    auditMarkdown: join(directory, "audit.md"),
    diff: join(directory, "diff.patch"),
    diffStat: join(directory, "diff-stat.txt"),
    ...runtimeContinuityPaths(directory),
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "auditor",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
    promptStack: ["agent-role", "active-change", "diff", "validation", "human-prompt"],
    agent: buildRunAgentRecord(role),
  };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "auditor", worktreeId: options.worktreeId } });

  const diffResult = options.worktreeId ? await collectWorktreeDiff(memory, options.worktreeId, changeId) : null;
  const latestValidation = await getLatestValidationSummary(memory, changeId, diffResult
    ? { worktreeId: diffResult.worktree.worktreeId, worktreeDiffHash: diffResult.diffHash }
    : {});
  await writeFile(paths.diff, diffResult?.diff ?? "", "utf8");
  await writeFile(paths.diffStat, diffResult?.diffStat ?? "", "utf8");

  const contextArtifact = buildRoleContextArtifact(buildRoleContextPacket({
    roleId: "auditor-agent",
    changeStatus,
    goal: "Audit the current Change implementation against accepted AC, validation evidence, and diff evidence.",
    runId,
    worktree: diffResult ? {
      worktreeId: diffResult.worktree.worktreeId,
      branchName: diffResult.worktree.branchName,
      baseRef: diffResult.worktree.baseRef,
      baseCommit: diffResult.worktree.baseCommit,
      checkoutPath: diffResult.worktree.checkoutPath,
      metadataPath: getWorktreeMetadataPath(memory, diffResult.worktree.worktreeId),
    } : undefined,
    evidenceSummary: [
      latestValidation ? `Latest validation selected: ${latestValidation.status} (${latestValidation.id}).` : "No validation run recorded for this change.",
      diffResult ? `Diff hash selected: ${diffResult.diffHash}.` : "No worktree diff selected.",
      diffResult?.diffStat ? `Diff stat available in ${artifacts.diffStat}.` : "No diff stat available.",
    ],
    evidenceRefs: [
      ...(latestValidation ? [contextSourceRef("latest-validation", latestValidation.id, "inline", "Latest validation summary selected for audit.")] : []),
      ...(diffResult ? [
        contextSourceRef("worktree-diff-stat", artifacts.diffStat, "inline", "Diff stat is inlined in prompt and referenced in packet."),
        contextSourceRef("worktree-diff", artifacts.diff, "ref", "Full diff is referenced and not treated as full Harness context."),
      ] : []),
    ],
    createdAt: now,
  }), `${relativeDir}/context-packet.json`);
  run = { ...run, contextPacket: contextArtifact.ref };
  await writeJsonFile(paths.run, run);
  const context = contextArtifact.markdown;
  await writeJsonFile(paths.contextPacket, contextArtifact.packet);
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "context.prepared", runId, data: { path: artifacts.context, contextPacket: artifacts.contextPacket, contextPacketHash: contextArtifact.hash } });

  const prompt = await composeAuditPrompt({
    context,
    latestValidation: latestValidation ? JSON.stringify(latestValidation, null, 2) : "No validation run recorded for this change.",
    diff: diffResult?.diff,
    diffStat: diffResult?.diffStat,
    extraPrompt: options.prompt,
    auditorProfile: buildAgentSystemPrompt(role),
  });
  await writeFile(paths.prompt, prompt, "utf8");

  let continuity = await createRuntimeContinuityArtifacts(paths, {
    projectId: project.id,
    changeId,
    runId,
    roleId: "auditor-agent",
    adapter: "audit-codex-readonly",
    workspace: runtimeWorkspaceForAudit(project.path, diffResult?.worktree),
    permissionProfile: workerPermissionProfileForRole("auditor-agent"),
    rawArtifactRefs: [
      artifacts.events,
      artifacts.stdout,
      artifacts.stderr,
      artifacts.prompt,
      artifacts.codexEvents,
      artifacts.lastMessage,
      artifacts.audit,
      artifacts.auditMarkdown,
    ],
    sandboxPolicy: "read-only",
  });

  const capabilities = await detectCodexCapabilities();
  if (capabilities.errors.length > 0) {
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.failed", runId, data: { capabilities } });
    await appendAuditContinuityEvent(paths, continuity, "codex.capabilities.failed", {
      capabilities,
    }, "Codex auditor unavailable.");
    const message = [
      "Status: failed",
      "",
      "Finding: Codex auditor unavailable",
      "- Severity: note",
      "- Area: validation",
      `- Evidence: ${capabilities.errors.join("; ")}`,
      "- Recommendation: Install or configure Codex CLI safe read-only execution, then rerun audit.",
      "",
    ].join("\n");
    await writeFile(paths.lastMessage, message, "utf8");
    await writeFile(paths.auditMarkdown, message, "utf8");
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.codexEvents, "", "utf8");
    await writeFile(paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    const audit = await writeAudit(paths.audit, runId, changeId, "failed", message, {
      worktreeId: options.worktreeId,
      validationId: latestValidation?.id,
      worktreeDiffHash: diffResult?.diffHash,
      artifacts,
      startedAt: now,
    });
    run = await finishRun(paths.run, run, "failed", 1, null);
    continuity = await markRuntimeContinuityStatus(paths, continuity, "failed", capabilities.errors.join("; "));
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "audit.failed", runId, data: { auditStatus: audit.status } });
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.failed", runId });
    return { run, audit };
  }

  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.capabilities.detected", runId, data: { capabilities } });
  await appendAuditContinuityEvent(paths, continuity, "codex.capabilities.detected", {
    capabilities,
  }, "Codex auditor capabilities detected.");
  const cwd = diffResult?.worktree.checkoutPath ?? project.path;
  const argv = buildCodexReadonlyArgv(capabilities, {
    projectPath: cwd,
    lastMessagePath: paths.lastMessage,
    additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [],
  });
  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  continuity = await markRuntimeContinuityStatus(paths, continuity, "running");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "audit.started", runId, data: { cwd, command: run.command } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { cwd, command: run.command } });
  await appendAuditContinuityEvent(paths, continuity, "audit.started", {
    cwd,
    command: run.command,
  }, "Audit started.");
  await appendAuditContinuityEvent(paths, continuity, "codex.started", {
    cwd,
    command: run.command,
  }, "Codex readonly audit started.");

  const completion = new CodexCompletionTracker({ lastMessagePath: paths.lastMessage });
  const lifecycleTiming = codexLifecycleTiming(8 * 60 * 1000);
  const continuityWrites: Promise<void>[] = [];
  const parser = createCodexJsonlStreamParser((event) => {
    completion.handleEvent(event);
    continuityWrites.push(appendAuditContinuityEvent(paths, continuity, event.type, rawCodexEvent(event), summarizeCodexEvent(event)));
  });
  const processResult = await executeProcessStreaming({
    cwd,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    completionSignal: () => completion.isComplete(),
    stopSignal: () => isRunStopRequested(runId),
    completionGraceMs: lifecycleTiming.completionGraceMs,
    killGraceMs: lifecycleTiming.killGraceMs,
    timeoutMs: lifecycleTiming.timeoutMs,
  });
  parser.flush();
  await Promise.all(continuityWrites);
  const codexCompletion = completion.snapshot();
  const processDiagnostics = processDiagnosticsData(processResult, codexCompletion);
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "codex.exited",
    runId,
    data: { exitCode: processResult.exitCode, signal: processResult.signal, ...processDiagnostics },
  });
  await appendAuditContinuityEvent(paths, continuity, "codex.exited", {
    exitCode: processResult.exitCode,
    signal: processResult.signal,
    ...processDiagnostics,
  }, "Codex readonly audit exited.");

  const lastMessage = await ensureLastMessage(paths.lastMessage, processResult.stdoutSample, processResult.stderrSample);
  await writeFile(paths.auditMarkdown, lastMessage, "utf8");
  const processSucceeded = processResult.exitCode === 0 || (processResult.terminationReason === "completion-grace-expired" && completion.isComplete());
  const audit = await writeAudit(paths.audit, runId, changeId, processSucceeded ? null : "failed", lastMessage, {
    worktreeId: options.worktreeId,
    validationId: latestValidation?.id,
    worktreeDiffHash: diffResult?.diffHash,
    artifacts,
    startedAt: now,
  });

  const status: RunStatus = processSucceeded ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, processSucceeded ? 0 : processResult.exitCode, processResult.signal);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: audit.status === "failed" ? "audit.failed" : "audit.completed", runId, data: { auditStatus: audit.status } });
  await appendAuditContinuityEvent(paths, continuity, audit.status === "failed" ? "audit.failed" : "audit.completed", {
    auditStatus: audit.status,
  }, `Audit ${audit.status}.`);
  continuity = await markRuntimeContinuityStatus(paths, continuity, status === "completed" ? "completed" : "failed");
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });

  return { run, audit };
}

export async function getAuditStatus(project: ManagedProject): Promise<AuditStatusResult> {
  const memory = await resolveProjectMemory(project);
  const changeStatus = await getChangeStatus(project);
  const changeId = changeStatus.change?.id ?? null;
  const audits = (await listAuditResults(memory, changeId ?? undefined)).map(summarizeAudit);
  return { activeChangeId: changeId, latest: audits[0] ?? null, audits };
}

export async function listAuditSummaries(project: ManagedProject): Promise<AuditSummary[]> {
  const memory = await resolveProjectMemory(project);
  return (await listAuditResults(memory)).map(summarizeAudit);
}

export async function showAudit(project: ManagedProject, auditId: string): Promise<AuditResult> {
  const memory = await resolveProjectMemory(project);
  return await readAuditResult(memory, auditId);
}

async function writeAudit(
  path: string,
  runId: string,
  changeId: string,
  forcedStatus: AuditStatus | null,
  message: string,
  options: {
    worktreeId?: string;
    validationId?: string;
    worktreeDiffHash?: string;
    artifacts: RunMetadata["artifacts"];
    startedAt: string;
  },
): Promise<AuditResult> {
  const parsed = parseAuditMessage(message);
  const status = forcedStatus ?? parsed.status;
  const audit: AuditResult = {
    version: "1.0",
    id: runId,
    runId,
    changeId,
    status,
    worktreeId: options.worktreeId,
    validationId: options.validationId,
    worktreeDiffHash: options.worktreeDiffHash,
    startedAt: options.startedAt,
    finishedAt: new Date().toISOString(),
    findings: parsed.findings,
    artifacts: {
      audit: options.artifacts.audit ?? "",
      auditMarkdown: options.artifacts.auditMarkdown ?? "",
      lastMessage: options.artifacts.lastMessage ?? "",
      diff: options.artifacts.diff,
      diffStat: options.artifacts.diffStat,
    },
  };
  await writeJsonFile(path, audit);
  return audit;
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  const base = memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  return relative(base, absolutePath).replace(/\\/g, "/");
}

function runtimeWorkspaceForAudit(projectPath: string, worktree: { checkoutPath: string; worktreeId: string } | undefined): RuntimeContinuityWorkspaceDescriptor {
  if (worktree) {
    return {
      workspaceKind: "local-worktree",
      cwd: worktree.checkoutPath,
      checkoutPath: worktree.checkoutPath,
      worktreeId: worktree.worktreeId,
    };
  }
  return {
    workspaceKind: "source-root",
    cwd: projectPath,
  };
}

async function appendAuditContinuityEvent(
  paths: RuntimeContinuityPaths & { events: string },
  continuity: RuntimeContinuityArtifacts,
  eventType: string,
  raw: Record<string, unknown>,
  summary?: string,
): Promise<void> {
  await appendAgentEventEnvelope(paths, continuity.session, continuity.eventSource, {
    eventType,
    raw,
    summary,
  }).catch((error) => appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "runtime_continuity.append_failed",
    runId: continuity.session.runId,
    data: { error: error instanceof Error ? error.message : String(error) },
  }).catch(() => undefined));
}

function rawCodexEvent(event: CodexJsonlStreamEvent): Record<string, unknown> {
  if ("raw" in event && event.raw && typeof event.raw === "object" && !Array.isArray(event.raw)) {
    return event.raw as Record<string, unknown>;
  }
  return { event };
}

function summarizeCodexEvent(event: CodexJsonlStreamEvent): string | undefined {
  switch (event.type) {
    case "text_delta": return event.delta.slice(0, 160);
    case "status": return event.label;
    case "error": return event.message;
    case "tool_event": return event.command ?? event.name ?? event.phase;
    case "readable_event": return event.event.summary ?? event.event.title ?? event.event.kind;
    case "raw": return event.line.slice(0, 160);
    default: return event.type;
  }
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

async function ensureLastMessage(path: string, stdout: string, stderr: string): Promise<string> {
  if (existsSync(path)) {
    const existing = await readFile(path, "utf8");
    if (existing.trim()) return existing;
  }

  const parsed = extractFinalMessageFromCodexJsonl(stdout);
  if (parsed) {
    await writeFile(path, parsed, "utf8");
    return parsed;
  }

  const fallback = [
    "Status: failed",
    "",
    "Finding: Auditor output was not captured",
    "- Severity: note",
    "- Area: validation",
    "- Evidence: AHO did not find a final Codex message in output-last-message or JSONL stdout.",
    "- Recommendation: Inspect stdout.log, codex-events.jsonl, and stderr.log for diagnostics.",
    "",
    stderr.trim() ? "## stderr sample" : "",
    stderr.trim(),
    "",
  ].join("\n");
  await writeFile(path, fallback, "utf8");
  return fallback;
}
