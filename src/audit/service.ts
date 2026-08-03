import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getChangeStatus } from "../change/status.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { buildRoleContextArtifact, buildRoleContextPacket, contextSourceRef } from "../context/packets.js";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../agent/catalog.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { resolveProjectHarnessAgentInput } from "../project-harness/agent-input.js";
import { defaultProviderRegistry, type ProviderRealtimeEvent, type ProviderTurnResult } from "../provider-runtime/index.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { getWorktreeMetadataPath } from "../worktree/paths.js";
import { getLatestValidationSummary, readValidationResult, summarizeValidation } from "../validation/repository.js";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import { runtimeContinuityPaths, type RuntimeContinuityPaths } from "../runtime-continuity/paths.js";
import { appendExternalExecutionCompleted, appendExternalExecutionFailed, appendExternalExecutionRequested, appendPermissionProfileAttached } from "../runtime-continuity/events.js";
import { appendAgentEventEnvelope, createRuntimeContinuityArtifacts, markRuntimeContinuityStatus, type RuntimeContinuityWorkspaceDescriptor } from "../runtime-continuity/repository.js";
import type { RuntimeContinuityArtifacts } from "../runtime-continuity/types.js";
import type { AuditResult, AuditStatus, AuditSummary, ManagedProject, ResolvedMemory, RunMetadata, RunStatus } from "../types/index.js";
import { appendRunEvent } from "../run/events.js";
import { buildRunId } from "../run/run-id.js";
import { openWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import { bindProviderAttemptThread, finishProviderAttempt, startProviderAttempt } from "../workbench/provider-attempts.js";
import { collectWorktreeDiff } from "./diff.js";
import { listAuditResults, readAuditResult, summarizeAudit } from "./repository.js";
import { parseAuditMessage } from "./parser.js";
import { composeAuditPrompt } from "./prompt.js";

export interface AuditRunOptions {
  changeId?: string;
  worktreeId?: string;
  validationId?: string;
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
  const projectHarnessInput = await resolveProjectHarnessAgentInput(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Audit run");
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId });
  const changeStatus = target.status;
  const changeId = target.changeId;
  const role = await resolveAgentRole(memory, "auditor-agent");

  const runId = buildRunId(changeId, ["auditor", options.worktreeId ?? "no-worktree", options.validationId ?? "latest-validation", options.prompt ?? ""]);
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
    providerEvents: join(directory, "provider-events.jsonl"),
    providerSession: join(directory, "provider-session.json"),
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
    command: ["provider", "turn.start"],
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
  const latestValidation = options.validationId
    ? summarizeValidation(await readValidationResult(memory, options.validationId, { changeId }))
    : await getLatestValidationSummary(memory, changeId, diffResult
      ? { worktreeId: diffResult.worktree.worktreeId, worktreeDiffHash: diffResult.diffHash }
      : {});
  if (options.validationId && !latestValidation) {
    throw new Error(`Validation ${options.validationId} was not found for audit.`);
  }
  if (options.validationId && latestValidation?.id !== options.validationId) {
    throw new Error("Audit validationId scope mismatch.");
  }
  if (options.validationId && diffResult && latestValidation) {
    if (latestValidation.worktreeId !== diffResult.worktree.worktreeId) {
      throw new Error("Audit validationId worktree scope mismatch.");
    }
    if (latestValidation.worktreeDiffHash && latestValidation.worktreeDiffHash !== diffResult.diffHash) {
      throw new Error("Audit validationId diff hash mismatch.");
    }
  }
  await writeFile(paths.diff, diffResult?.diff ?? "", "utf8");
  await writeFile(paths.diffStat, diffResult?.diffStat ?? "", "utf8");

  const contextArtifact = buildRoleContextArtifact(buildRoleContextPacket({
    roleId: "auditor-agent",
    changeStatus,
    goal: "Audit the current Change implementation against accepted AC, validation evidence, and diff evidence.",
    runId,
    projectHarness: projectHarnessInput.identity,
    writableRoots: [],
    sandboxPolicy: "read-only",
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

  const cwd = diffResult?.worktree.checkoutPath ?? project.path;
  let continuity = await createRuntimeContinuityArtifacts(paths, {
    projectId: project.id,
    changeId,
    runId,
    roleId: "auditor-agent",
    adapter: "provider-readonly",
    workspace: runtimeWorkspaceForAudit(project.path, diffResult?.worktree),
    permissionProfile: workerPermissionProfileForRole("auditor-agent"),
    rawArtifactRefs: [
      artifacts.events,
      artifacts.stdout,
      artifacts.stderr,
      artifacts.prompt,
      `${relativeDir}/provider-events.jsonl`,
      artifacts.lastMessage,
      artifacts.audit,
      artifacts.auditMarkdown,
    ],
    sandboxPolicy: "read-only",
  });
  await appendAuditContinuityWrite(paths, continuity, appendPermissionProfileAttached(paths, continuity, { source: "audit" }));

  const providerId = await selectedProviderForAudit(memory, project, changeId);
  let provider;
  let capabilitySnapshot;
  try {
    provider = await defaultProviderRegistry.require(providerId, "auditor", project, cwd);
    capabilitySnapshot = await provider.capabilitySnapshot(project, cwd);
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "provider.exited", runId, data: { providerId, status: "failed", error: failure } });
    await appendAuditContinuityEvent(paths, continuity, "provider.exited", {
      providerId,
      status: "failed",
      error: failure,
    }, "Auditor provider unavailable.");
    await appendAuditContinuityWrite(paths, continuity, appendExternalExecutionFailed(paths, continuity, {
      requestId: `${runId}:provider-readonly`,
      status: "failed",
      error: failure,
      raw: { providerId },
      summary: "Auditor provider unavailable.",
    }));
    const message = [
      "Status: failed",
      "",
      "Finding: Auditor provider unavailable",
      "- Severity: note",
      "- Area: validation",
      `- Evidence: ${failure}`,
      "- Recommendation: Configure a provider with the auditor capability and read-only leaf execution, then rerun audit.",
      "",
    ].join("\n");
    await writeFile(paths.lastMessage, message, "utf8");
    await writeFile(paths.auditMarkdown, message, "utf8");
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.providerEvents, "", "utf8");
    await writeFile(paths.stderr, `${failure}\n`, "utf8");
    const audit = await writeAudit(paths.audit, runId, changeId, "failed", message, {
      worktreeId: options.worktreeId,
      validationId: latestValidation?.id,
      worktreeDiffHash: diffResult?.diffHash,
      artifacts,
      startedAt: now,
    });
    run = await finishRun(paths.run, run, "failed", 1, null);
    continuity = await markRuntimeContinuityStatus(paths, continuity, "failed", failure);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "audit.failed", runId, data: { auditStatus: audit.status } });
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.failed", runId });
    return { run, audit };
  }

  run = {
    ...run,
    command: ["provider", "turn.start"],
    status: "running",
    enabledSkills: [{ ...projectHarnessInput.providerSkillInput, providerId }],
  };
  await writeJsonFile(paths.run, run);
  continuity = await markRuntimeContinuityStatus(paths, continuity, "running");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "audit.started", runId, data: { cwd, command: run.command } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "provider.started", runId, data: { cwd, providerId, capabilitySnapshot } });
  await appendAuditContinuityEvent(paths, continuity, "audit.started", {
    cwd,
    command: run.command,
  }, "Audit started.");
  await appendAuditContinuityEvent(paths, continuity, "provider.started", {
    cwd,
    providerId,
    capabilitySnapshot,
  }, "Readonly provider audit started.");
  await appendAuditContinuityWrite(paths, continuity, appendExternalExecutionRequested(paths, continuity, {
    requestId: `${runId}:provider-readonly`,
    command: providerId,
    args: ["turn.start"],
    cwd,
    adapter: "provider-readonly",
  }));

  await startProviderAttempt(memory, {
    attemptId: runId,
    providerId,
    capabilitySnapshot,
    operationProfile: "auditor",
    roleId: "auditor-agent",
    handoffHash: contextArtifact.hash,
    changeId,
    worktreeId: options.worktreeId ?? null,
    model: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
  });

  const continuityWrites: Promise<void>[] = [];
  const boundThreadIds = new Set<string>();
  let providerResult: ProviderTurnResult;
  try {
    providerResult = await provider.leafExecution.runTurn({
      providerId,
      operationProfile: "auditor",
      projectId: project.id,
      changeId,
      runtimeScopeId: runId,
      roleId: "auditor-agent",
      runId,
      attemptId: runId,
      cwd,
      prompt,
      skillInputs: [projectHarnessInput.providerSkillInput],
      sandboxPolicy: "read-only",
      paths: {
        events: paths.providerEvents,
        stderr: paths.stderr,
        lastMessage: paths.lastMessage,
        session: paths.providerSession,
      },
      runtimeWorkspaceRoots: [...new Set([cwd, memory.memoryRoot])],
      writableRoots: [],
      model: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
      onRealtimeEvent: (event) => {
        if (!boundThreadIds.has(event.threadId)) {
          boundThreadIds.add(event.threadId);
          continuityWrites.push(bindProviderAttemptThread(memory, {
            attemptId: runId,
            threadId: event.threadId,
            parentThreadId: event.parentThreadId,
            parentAgentSurfaceId: event.parentThreadId ? undefined : "main-agent",
            displayName: event.displayName,
          }).then(() => undefined));
        }
        continuityWrites.push(appendAuditContinuityEvent(
          paths,
          continuity,
          event.streamEvent.type,
          providerRealtimeData(event),
          summarizeProviderRealtimeEvent(event),
        ));
      },
    });
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    providerResult = {
      providerId,
      status: "failed",
      session: null,
      turnId: null,
      lastMessage: "",
      childThreads: [],
      changedFiles: [],
      error: failure,
    };
    await writeFile(paths.stderr, `${failure}\n`, "utf8");
  }
  await Promise.all(continuityWrites);
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "provider.exited",
    runId,
    data: { providerId, status: providerResult.status, sessionId: providerResult.session?.sessionId, turnId: providerResult.turnId, error: providerResult.error },
  });
  await appendAuditContinuityEvent(paths, continuity, "provider.exited", {
    providerId,
    status: providerResult.status,
    sessionId: providerResult.session?.sessionId,
    turnId: providerResult.turnId,
    error: providerResult.error,
  }, "Readonly provider audit exited.");
  const providerSucceeded = providerResult.status === "completed";
  await finishProviderAttempt(memory, runId, providerSucceeded ? "completed" : providerResult.status === "interrupted" ? "interrupted" : "failed", providerResult.session?.sessionId ?? null);
  await appendAuditContinuityWrite(paths, continuity, (providerSucceeded
    ? appendExternalExecutionCompleted(paths, continuity, {
      requestId: `${runId}:provider-readonly`,
      status: "completed",
      raw: { providerId, sessionId: providerResult.session?.sessionId, turnId: providerResult.turnId },
    })
    : appendExternalExecutionFailed(paths, continuity, {
      requestId: `${runId}:provider-readonly`,
      status: "failed",
      error: providerResult.error ?? providerResult.status,
      raw: { providerId, sessionId: providerResult.session?.sessionId, turnId: providerResult.turnId },
    })));

  const lastMessage = await ensureProviderAuditMessage(paths.lastMessage, providerResult);
  await writeFile(paths.stdout, providerResult.lastMessage, "utf8");
  await writeFile(paths.auditMarkdown, lastMessage, "utf8");
  const audit = await writeAudit(paths.audit, runId, changeId, providerSucceeded ? null : "failed", lastMessage, {
    worktreeId: options.worktreeId,
    validationId: latestValidation?.id,
    worktreeDiffHash: diffResult?.diffHash,
    artifacts,
    startedAt: now,
  });

  const status: RunStatus = providerSucceeded ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, providerSucceeded ? 0 : 1, null);
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
  await appendAuditContinuityWrite(paths, continuity, appendAgentEventEnvelope(paths, continuity.session, continuity.eventSource, {
    eventType,
    raw,
    summary,
  }));
}

async function appendAuditContinuityWrite(
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

function providerRealtimeData(event: ProviderRealtimeEvent): Record<string, unknown> {
  return {
    providerId: event.providerId,
    method: event.method,
    sessionId: event.sessionId,
    threadId: event.threadId,
    parentThreadId: event.parentThreadId,
    turnId: event.turnId,
    itemId: event.itemId,
    streamEvent: event.streamEvent,
  };
}

function summarizeProviderRealtimeEvent(event: ProviderRealtimeEvent): string | undefined {
  const streamEvent = event.streamEvent;
  switch (streamEvent.type) {
    case "text_delta": return streamEvent.delta.slice(0, 160);
    case "status": return streamEvent.label;
    case "error": return streamEvent.message;
    case "tool_event": return streamEvent.command ?? streamEvent.name ?? streamEvent.phase;
    case "readable_event": return streamEvent.event.summary ?? streamEvent.event.title ?? streamEvent.event.kind;
    case "raw": return streamEvent.line.slice(0, 160);
    default: return streamEvent.type;
  }
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

async function ensureProviderAuditMessage(path: string, result: ProviderTurnResult): Promise<string> {
  if (result.lastMessage.trim()) return result.lastMessage;
  const fallback = [
    "Status: failed",
    "",
    "Finding: Auditor output was not captured",
    "- Severity: note",
    "- Area: validation",
    `- Evidence: The provider turn ended with status ${result.status} without a final auditor message.${result.error ? ` ${result.error}` : ""}`,
    "- Recommendation: Inspect the provider event, session, and stderr artifacts, then rerun audit.",
    "",
  ].join("\n");
  await writeFile(path, fallback, "utf8");
  return fallback;
}

async function selectedProviderForAudit(memory: ResolvedMemory, project: ManagedProject, changeId: string): Promise<string> {
  const store = await openWorkbenchDatabase(memory);
  try {
    const selected = store.conversations.findConversationForChange(project.id, changeId)?.selectedProviderId;
    if (selected) return selected;
  } finally {
    store.close();
  }
  return project.defaultProviderId ? defaultProviderRegistry.get(project.defaultProviderId).id : defaultProviderRegistry.requireOnly().id;
}
