import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { executeProcessStreaming } from "../run/process.js";
import { getSystemSkillsRoot } from "../template-source/paths.js";
import { defaultProviderRegistry, type ProviderRealtimeEvent, type ProviderTurnResult } from "../provider-runtime/index.js";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import { getRuntimeAssignedHarnessSkillContext } from "../skill/catalog.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { openWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import type { WorkbenchDatabase } from "../workbench/persistence/database.js";
import { bindProviderAttemptThread, finishProviderAttempt, startProviderAttempt } from "../workbench/provider-attempts.js";
import { createAssistantTranscriptCapture, type AssistantTranscriptCapture, type ChildTranscriptCapture } from "../workbench/live-transcript.js";
import { forwardProviderRealtimeEvent } from "../workbench/provider-live-events.js";
import { CanonicalTimelineDelivery, type CanonicalTimelinePublisher } from "../workbench/canonical-timeline-delivery.js";
import type { AssistantTurnBlock, TopicThreadEntry } from "../workbench/types.js";
import type { HarnessEngineeringAssignment } from "./harness-engineering-contract.js";
import {
  EvolutionScoreBlockedError,
  runMaintenanceProviderAssignment,
  type MaintenanceProviderExecutionRequest,
  type MaintenanceProviderExecutionResult,
  type MaintenanceProviderExecutor,
  type MaintenanceTaskLineage,
} from "./maintenance-provider-runner.js";

export function createMaintenanceProviderExecutor(memory: ResolvedMemory): MaintenanceProviderExecutor {
  return async (request) => executeMaintenanceRequest(memory, request);
}

export async function runMaintenanceAssignment(
  memory: ResolvedMemory,
  project: ManagedProject,
  assignment: HarnessEngineeringAssignment,
  signal?: AbortSignal,
  onRealtimeEvent?: (event: ProviderRealtimeEvent) => void,
  taskLineage?: MaintenanceTaskLineage,
  timelinePublisher?: CanonicalTimelinePublisher,
): Promise<{ summary: string; artifactRefs: string[] }> {
  const evidencePath = join(memory.workbenchRoot, "maintenance", "evidence", `${assignment.taskId}.json`);
  let evidence;
  try {
    evidence = await runMaintenanceProviderAssignment({
      project,
      assignment,
      executor: createMaintenanceProviderExecutor(memory),
      signal,
      onRealtimeEvent,
      timelinePublisher,
      taskLineage,
    });
  } catch (error) {
    if (error instanceof EvolutionScoreBlockedError) {
      await writeJsonFile(evidencePath, error.evidence);
      error.artifactRefs = [evidencePath];
    }
    throw error;
  }
  for (let verificationAttempt = 1; verificationAttempt <= 2; verificationAttempt += 1) {
    evidence.verification = await runRequiredVerification(memory, assignment, verificationAttempt, signal);
    evidence.verificationAttempts = [...(evidence.verificationAttempts ?? []), evidence.verification];
    await writeJsonFile(evidencePath, evidence);
    const failed = evidence.verification.find((item) => !item.passed);
    if (!failed) {
      return { summary: evidence.producer.summary, artifactRefs: [evidencePath] };
    }
    if (verificationAttempt === 1) {
      const repair = await continueAfterVerificationFailure(memory, project, assignment, evidence, signal, onRealtimeEvent, taskLineage, timelinePublisher);
      evidence.producer = {
        ...evidence.producer,
        summary: repair.finalText.trim() || evidence.producer.summary,
        changedFiles: [...new Set([...evidence.producer.changedFiles, ...repair.changedFiles])],
      };
      continue;
    }
    throw new MaintenanceVerificationError(
      `Required maintenance verification failed after one repair continuation: ${failed.name}.`,
      [
        evidencePath,
        ...(evidence.verificationAttempts ?? []).flatMap((attempt) =>
          attempt.flatMap((item) => [item.stdoutPath, item.stderrPath])),
      ],
    );
  }
  throw new Error("Maintenance verification loop exited unexpectedly.");
}

async function continueAfterVerificationFailure(
  memory: ResolvedMemory,
  project: ManagedProject,
  assignment: HarnessEngineeringAssignment,
  evidence: Awaited<ReturnType<typeof runMaintenanceProviderAssignment>>,
  signal?: AbortSignal,
  onRealtimeEvent?: (event: ProviderRealtimeEvent) => void,
  taskLineage?: MaintenanceTaskLineage,
  timelinePublisher?: CanonicalTimelinePublisher,
): Promise<MaintenanceProviderExecutionResult> {
  const failures = (evidence.verification ?? []).filter((item) => !item.passed);
  const prompt = [
    "Runtime mechanical verification failed after your direct edits.",
    "Read the current files and the verification logs below, repair the evidence-backed problem, and return a concise result.",
    "Do not widen the assigned Change or Evolution window.",
    ...failures.flatMap((item) => [
      `Verification: ${item.name}`,
      `Command: ${item.command.join(" ")}`,
      `Exit code: ${item.exitCode ?? "none"}`,
      `Stdout: ${item.stdoutPath}`,
      `Stderr: ${item.stderrPath}`,
    ]),
  ].join("\n");
  return executeMaintenanceRequest(memory, {
    project,
    role: assignment.mode === "evolve-assigned-window" ? "evolution-agent" : "maintenance-agent",
    prompt,
    skillContext: await getRuntimeAssignedHarnessSkillContext(project, assignment),
    parentThreadId: null,
    cwd: assignment.memoryRoot,
    runtimeWorkspaceRoots: [assignment.projectRoot, assignment.memoryRoot],
    writable: true,
    writableRoots: [...new Set([assignment.projectRoot, assignment.memoryRoot])],
    existingThreadId: evidence.producer.threadId,
    signal,
    onRealtimeEvent,
    timelinePublisher,
    taskLineage,
  });
}

async function runRequiredVerification(
  memory: ResolvedMemory,
  assignment: HarnessEngineeringAssignment,
  attempt: number,
  signal?: AbortSignal,
) {
  const directory = join(memory.workbenchRoot, "maintenance", "verification", assignment.taskId, `attempt-${attempt}`);
  const results = [];
  for (const [index, item] of assignment.requiredVerification.entries()) {
    const safeName = item.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const stdoutPath = join(directory, `${String(index + 1).padStart(2, "0")}-${safeName}.stdout.log`);
    const stderrPath = join(directory, `${String(index + 1).padStart(2, "0")}-${safeName}.stderr.log`);
    const result = await executeProcessStreaming({
      cwd: assignment.projectRoot,
      command: item.command[0]!,
      args: item.command.slice(1),
      stdoutPath,
      stderrPath,
      timeoutMs: 10 * 60_000,
      stopSignal: () => signal?.aborted ?? false,
    });
    results.push({
      name: item.name,
      command: item.command,
      exitCode: result.exitCode,
      passed: result.exitCode === 0 && !result.timedOut,
      stdoutPath,
      stderrPath,
    });
    if (result.exitCode !== 0 || result.timedOut) break;
  }
  return results;
}

export class MaintenanceVerificationError extends Error {
  constructor(message: string, readonly artifactRefs: string[]) {
    super(message);
  }
}

async function executeMaintenanceRequest(
  memory: ResolvedMemory,
  request: MaintenanceProviderExecutionRequest,
): Promise<MaintenanceProviderExecutionResult> {
  const runId = `maintenance-${randomUUID()}`;
  const directory = join(memory.workbenchRoot, "maintenance", "provider-runs", runId);
  const isScorer = request.role === "evolution-scorer";
  const providerId = await selectedProviderForMaintenance(memory, request);
  const profile = request.role === "evolution-scorer" || request.role === "evolution-agent" ? "evolution" : "maintenance";
  const provider = await defaultProviderRegistry.require(providerId, profile, request.project, request.project.path);
  if (isScorer) await defaultProviderRegistry.require(providerId, "evolution-scorer", request.project, request.project.path);
  const capabilitySnapshot = await provider.capabilitySnapshot(request.project, request.project.path);
  let abortPoll: NodeJS.Timeout | null = null;
  const interrupt = (): void => {
    const active = provider.conversation.getActiveTurn(runId);
    if (active) void active.interrupt("Background AgentTask lease ended.").catch(() => undefined);
  };
  const onAbort = (): void => { interrupt(); abortPoll ??= setInterval(interrupt, 50); };
  request.signal?.addEventListener("abort", onAbort, { once: true });
  if (request.signal?.aborted) onAbort();
  let result: ProviderTurnResult;
  const profileId = request.role === "maintenance-agent"
    ? "memory-maintenance-agent"
    : request.role === "evolution-agent"
      ? "harness-evolution-agent"
      : request.role === "evolution-scorer"
        ? "harness-evolution-agent"
        : null;
  const attemptRoleId = isScorer ? "harness-evolution-agent" : profileId ?? request.role;
  const attemptModel = capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null;
  const handoffHash = createHash("sha256").update(JSON.stringify({
    prompt: request.prompt,
    role: request.role,
    taskLineage: request.taskLineage ?? null,
    cwd: request.cwd,
    roots: request.runtimeWorkspaceRoots ?? [],
  })).digest("hex");
  const timeline = await openBackgroundTimeline(memory, request, providerId);
  const capture = createAssistantTranscriptCapture(undefined, (snapshot) => {
    persistBackgroundCapture(timeline, request, runId, providerId, snapshot);
    return true;
  });
  const liveScorerAttempts = new Map<string, Promise<unknown>>();
  let liveMainBinding: Promise<unknown> | null = null;
  const finishLiveScorerAttempts = async (
    completedThreadId: string | null,
    otherStatus: "interrupted" | "failed",
    suppressErrors = false,
  ): Promise<void> => {
    let firstError: unknown;
    for (const [threadId, started] of liveScorerAttempts) {
      try {
        await started;
        await finishProviderAttempt(
          memory,
          `${runId}:child:${threadId}`,
          threadId === completedThreadId ? "completed" : otherStatus,
          threadId,
        );
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError && !suppressErrors) throw firstError;
  };
  const onRealtimeEvent = (event: ProviderRealtimeEvent): void => {
    if (!event.parentThreadId && event.roleId === attemptRoleId && !liveMainBinding) {
      if (timeline) {
        timeline.primaryThreadId = event.threadId;
        timeline.primaryAgentSurfaceId = agentThreadSurfaceId(providerId, event.threadId);
      }
      liveMainBinding = bindProviderAttemptThread(memory, {
        attemptId: runId,
        threadId: event.threadId,
        parentAgentSurfaceId: "main-agent",
        displayName: event.displayName ?? profileId ?? request.role,
      });
    }
    if (isScorer && event.parentThreadId && event.threadId && !liveScorerAttempts.has(event.threadId)) {
      const scorerAttemptId = `${runId}:child:${event.threadId}`;
      liveScorerAttempts.set(event.threadId, startProviderAttempt(memory, {
          attemptId: scorerAttemptId,
          providerId,
          capabilitySnapshot,
          operationProfile: "evolution-scorer",
          roleId: "evolution-scorer",
          handoffHash: createHash("sha256").update(JSON.stringify({ parentHandoffHash: handoffHash, childThreadId: event.threadId })).digest("hex"),
          conversationId: request.taskLineage?.conversationId ?? null,
          changeId: request.taskLineage?.changeId ?? null,
          agentTaskId: request.taskLineage?.taskId ?? null,
          model: attemptModel,
        }).then(() => bindProviderAttemptThread(memory, {
          attemptId: scorerAttemptId,
          threadId: event.threadId,
          parentThreadId: event.parentThreadId,
          parentAgentSurfaceId: undefined,
          displayName: event.displayName,
        })));
    }
    forwardProviderRealtimeEvent(event, capture.sink, {
      conversationId: request.taskLineage?.conversationId,
      changeId: request.taskLineage?.changeId,
      agentTaskId: request.taskLineage?.taskId,
    });
    request.onRealtimeEvent?.(event);
  };
  try {
    await startProviderAttempt(memory, {
      attemptId: runId,
      providerId,
      capabilitySnapshot,
      operationProfile: profile,
      roleId: attemptRoleId,
      handoffHash,
      conversationId: request.taskLineage?.conversationId ?? null,
      changeId: request.taskLineage?.changeId ?? null,
      agentTaskId: request.taskLineage?.taskId ?? null,
      model: attemptModel,
    });
  } catch (error) {
    timeline?.store.close();
    throw error;
  }
  try {
    const developerInstructions = profileId
      ? await readFile(join(getSystemSkillsRoot(), "..", "agent-profiles", `${profileId}.md`), "utf8")
      : undefined;
    result = await provider.conversation.runTurn({
      providerId,
      operationProfile: profile,
      attemptId: runId,
      projectId: request.project.id,
      conversationId: request.taskLineage?.conversationId,
      changeId: request.taskLineage?.changeId,
      agentTaskId: request.taskLineage?.taskId,
      runtimeScopeId: runId, roleId: attemptRoleId, runId,
      cwd: request.cwd, prompt: request.prompt, sandboxPolicy: request.writable ? "workspace-write" : "read-only",
      existingSession: (request.existingThreadId ?? (isScorer ? request.parentThreadId : null))
        ? { providerId, sessionId: request.existingThreadId ?? request.parentThreadId! }
        : null,
      writableRoots: request.writableRoots,
      runtimeWorkspaceRoots: request.runtimeWorkspaceRoots,
      nativeSkillRoots: [getSystemSkillsRoot()],
      requiredNativeSkills: isScorer ? [] : ["aho-harness-engineering"],
      skillInputs: isScorer ? undefined : [{ name: "aho-harness-engineering", path: join(getSystemSkillsRoot(), "aho-harness-engineering", "SKILL.md") }],
      additionalContext: {
        "aho.background-task": {
          kind: "application",
          value: JSON.stringify({ role: request.role, cwd: request.cwd, runtimeWorkspaceRoots: request.runtimeWorkspaceRoots ?? [] }),
        },
      },
      developerInstructions,
      paths: { events: join(directory, "events.jsonl"), stderr: join(directory, "stderr.log"), lastMessage: join(directory, "last-message.md"), session: join(directory, "session.json") },
      onRealtimeEvent,
      model: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
    });
  } catch (error) {
    await finishLiveScorerAttempts(null, "failed", true);
    await finishProviderAttempt(memory, runId, "failed", null);
    try {
      persistBackgroundCapture(timeline, request, runId, providerId, capture, "failed");
    } finally {
      timeline?.store.close();
    }
    throw error;
  } finally {
    request.signal?.removeEventListener("abort", onAbort);
    if (abortPoll) clearInterval(abortPoll);
  }
  if (liveMainBinding) await liveMainBinding;
  if (timeline && result.session?.sessionId) {
    timeline.primaryThreadId = result.session.sessionId;
    timeline.primaryAgentSurfaceId = agentThreadSurfaceId(providerId, result.session.sessionId);
  }
  await finishProviderAttempt(
    memory,
    runId,
    result.status === "completed" ? "completed" : result.status === "interrupted" ? "interrupted" : "failed",
    result.session?.sessionId ?? null,
    { parentAgentSurfaceId: "main-agent", displayName: profileId ?? request.role },
  );
  try {
    persistBackgroundCapture(
      timeline,
      request,
      runId,
      providerId,
      capture,
      result.status === "completed" ? "completed" : "failed",
      result.lastMessage,
      result.turnId ?? undefined,
      result.lastMessageItemId ?? undefined,
    );
  } catch (error) {
    await finishLiveScorerAttempts(null, "failed", true);
    throw error;
  } finally {
    timeline?.store.close();
  }
  if (result.status !== "completed" || !result.session) {
    await finishLiveScorerAttempts(null, result.status === "interrupted" ? "interrupted" : "failed");
    throw new Error(result.error ?? `Provider maintenance ${request.role} did not complete.`);
  }
  if (!isScorer) {
    return { threadId: result.session.sessionId, parentThreadId: null, finalText: result.lastMessage, changedFiles: result.changedFiles };
  }
  const children = result.childThreads.filter((child) => child.parentThreadId === result.session!.sessionId);
  if (children.length !== 1 || !children[0]?.threadId || !children[0].finalText) {
    await finishLiveScorerAttempts(null, "failed");
    throw new Error("Evolution scoring must produce exactly one completed native child thread.");
  }
  const scorerAttemptId = `${runId}:child:${children[0].threadId}`;
  const liveScorerAttempt = liveScorerAttempts.get(children[0].threadId);
  if (liveScorerAttempt) {
    await finishLiveScorerAttempts(children[0].threadId, "failed");
  } else {
    await startProviderAttempt(memory, {
      attemptId: scorerAttemptId,
      providerId,
      capabilitySnapshot,
      operationProfile: "evolution-scorer",
      roleId: "evolution-scorer",
      handoffHash: createHash("sha256").update(JSON.stringify({ parentHandoffHash: handoffHash, childThreadId: children[0].threadId })).digest("hex"),
      conversationId: request.taskLineage?.conversationId ?? null,
      changeId: request.taskLineage?.changeId ?? null,
      agentTaskId: request.taskLineage?.taskId ?? null,
      model: attemptModel,
    });
  }
  if (!liveScorerAttempt) await finishProviderAttempt(memory, scorerAttemptId, "completed", children[0].threadId, {
    parentThreadId: children[0].parentThreadId,
    displayName: children[0].displayName,
  });
  return { threadId: children[0].threadId, parentThreadId: children[0].parentThreadId, finalText: children[0].finalText, changedFiles: children[0].changedFiles };
}

interface BackgroundTimeline {
  store: WorkbenchDatabase;
  delivery: CanonicalTimelineDelivery;
  projectId: string;
  conversationId: string;
  graphScopeId?: string;
  surfaceKind: "user" | "runtime";
  primaryThreadId?: string;
  primaryAgentSurfaceId?: string;
}

async function openBackgroundTimeline(
  memory: ResolvedMemory,
  request: MaintenanceProviderExecutionRequest,
  providerId: string,
): Promise<BackgroundTimeline | null> {
  if (!memory.projectId || !request.taskLineage?.conversationId) return null;
  const store = await openWorkbenchDatabase(memory);
  let conversation = store.conversations.readConversation(memory.projectId, request.taskLineage.conversationId);
  if (!conversation) {
    const now = new Date().toISOString();
    store.conversations.createConversation({
      projectId: memory.projectId,
      conversationId: request.taskLineage.conversationId,
      title: `Runtime ${request.role}`,
      state: "active",
      surfaceKind: "runtime",
      boundChangeId: request.taskLineage.changeId ?? null,
      currentGraphScopeId: null,
      selectedProviderId: providerId,
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    conversation = store.conversations.readConversation(memory.projectId, request.taskLineage.conversationId);
  }
  if (!conversation) {
    store.close();
    throw new Error(`Runtime Conversation could not be created: ${request.taskLineage.conversationId}.`);
  }
  const conversationId = conversation.conversationId;
  return {
    store,
    delivery: new CanonicalTimelineDelivery(store, request.timelinePublisher),
    projectId: memory.projectId,
    conversationId,
    graphScopeId: conversation?.currentGraphScopeId ?? undefined,
    surfaceKind: conversation.surfaceKind ?? "user",
  };
}

function persistBackgroundCapture(
  timeline: BackgroundTimeline | null,
  request: MaintenanceProviderExecutionRequest,
  runId: string,
  providerId: string,
  capture: AssistantTranscriptCapture,
  terminalStatus?: "completed" | "failed",
  finalText?: string,
  terminalTurnId?: string,
  terminalItemId?: string,
): void {
  if (!timeline) return;
  const fallbackRoleId = request.role === "maintenance-agent"
    ? "memory-maintenance-agent"
    : request.role === "evolution-agent"
      ? "harness-evolution-agent"
      : request.role;
  if (capture.childCaptures.size === 0
    && (timeline.surfaceKind === "runtime" || timeline.primaryAgentSurfaceId)
    && (capture.blocks.length > 0 || capture.activity.length > 0 || finalText?.trim())) {
    const mainLineage = [...capture.blocks].reverse().find((block) => block.kind !== "usage" && block.threadId && block.turnId);
    const threadId = mainLineage?.threadId ?? timeline.primaryThreadId;
    const turnId = mainLineage?.turnId ?? terminalTurnId;
    if (!threadId || !turnId) return;
    const blocks: AssistantTurnBlock[] = capture.blocks.length === 0 && finalText?.trim() && terminalItemId
      ? [{
          id: `provider-final:${providerId}:${threadId}:${turnId}:${terminalItemId}`,
          providerId,
          attemptId: runId,
          runId,
          threadId,
          turnId,
          itemId: terminalItemId,
          sequence: 1,
          kind: "prose",
          timestamp: new Date().toISOString(),
          source: "provider",
          status: terminalStatus ?? "completed",
          text: finalText.trim(),
        }]
      : capture.blocks;
    if (blocks.length === 0 && capture.activity.length === 0) return;
    persistBackgroundEntry(timeline, {
      id: `assistant:${runId}:background`,
      type: "assistant.message",
      timestamp: capture.blocks[0]?.timestamp ?? capture.activity[0]?.timestamp ?? new Date().toISOString(),
      conversationId: timeline.conversationId,
      graphScopeId: timeline.graphScopeId,
      changeId: request.taskLineage?.changeId ?? "",
      status: terminalStatus ?? captureStatus(capture.activity),
      text: finalText?.trim() || capture.text.trim() || undefined,
      runId,
      providerId,
      attemptId: runId,
      threadId,
      turnId,
      itemId: capture.blocks.length === 0 ? terminalItemId : undefined,
      agentSurfaceId: timeline.primaryAgentSurfaceId,
      agentRoleId: fallbackRoleId,
      activity: capture.activity,
      blocks,
    });
  }
  for (const child of capture.childCaptures.values()) {
    if (child.blocks.length === 0 && child.activity.length === 0) continue;
    if (!child.canonicalId || !child.providerId || !child.threadId || !child.turnId) continue;
    persistBackgroundEntry(timeline, backgroundChildEntry(timeline, request, runId, providerId, child, terminalStatus, finalText));
  }
}

function backgroundChildEntry(
  timeline: BackgroundTimeline,
  request: MaintenanceProviderExecutionRequest,
  runId: string,
  providerId: string,
  child: ChildTranscriptCapture,
  terminalStatus?: "completed" | "failed",
  finalText?: string,
): TopicThreadEntry {
  return {
    id: `assistant:${runId}:${child.canonicalId}:process`,
    type: "assistant.message",
    timestamp: child.blocks[0]?.timestamp ?? child.activity[0]?.timestamp ?? new Date().toISOString(),
    conversationId: timeline.conversationId,
    graphScopeId: timeline.graphScopeId,
    changeId: request.taskLineage?.changeId ?? "",
    status: terminalStatus ?? captureStatus(child.activity),
    text: (!request.role.includes("scorer") || child.parentThreadId) ? finalText?.trim() || undefined : undefined,
    runId: child.runId ?? runId,
    providerId,
    agentSurfaceId: agentThreadSurfaceId(child.providerId, child.threadId),
    sessionId: child.threadId,
    attemptId: request.role === "evolution-scorer" && child.parentThreadId
      ? `${runId}:child:${child.threadId}`
      : runId,
    threadId: child.threadId,
    parentThreadId: child.parentThreadId,
    turnId: child.turnId,
    agentRoleId: child.roleId,
    activity: child.activity,
    blocks: child.blocks,
  };
}

function captureStatus(activity: AssistantTranscriptCapture["activity"]): string {
  const terminal = [...activity].reverse().find((item) => item.kind === "status");
  if (terminal?.kind !== "status") return "running";
  if (terminal.label === "completed" || terminal.label === "failed" || terminal.label === "blocked") return terminal.label;
  return "running";
}

function persistBackgroundEntry(timeline: BackgroundTimeline, entry: TopicThreadEntry): void {
  if (!entry.agentSurfaceId) throw new Error(`Background Timeline entry ${entry.id} requires agentSurfaceId.`);
  const message = {
    id: entry.id,
    projectId: timeline.projectId,
    conversationId: timeline.conversationId,
    changeId: entry.changeId,
    type: entry.type,
    timestamp: entry.timestamp,
    text: entry.text ?? null,
    actionRunId: entry.actionRunId ?? null,
    actionType: entry.actionType ?? null,
    status: entry.status ?? null,
    runId: entry.runId ?? null,
    agentSurfaceId: entry.agentSurfaceId,
    providerId: entry.providerId ?? null,
    threadId: entry.threadId ?? null,
    turnId: entry.turnId ?? null,
    itemId: entry.itemId ?? null,
    artifact: entry.artifact ?? null,
    error: entry.error ?? null,
    rawJson: JSON.stringify(entry),
  };
  timeline.delivery.upsert(message);
}

async function selectedProviderForMaintenance(memory: ResolvedMemory, request: MaintenanceProviderExecutionRequest): Promise<string> {
  if (!memory.projectId) throw new Error("Project id is required to resolve the maintenance provider.");
  const store = await openWorkbenchDatabase(memory);
  try {
    if (request.taskLineage?.conversationId) {
      const conversation = store.conversations.readConversation(memory.projectId, request.taskLineage.conversationId);
      if (conversation) return conversation.selectedProviderId;
    }
    if (request.project.defaultProviderId) return defaultProviderRegistry.get(request.project.defaultProviderId).id;
    const only = defaultProviderRegistry.list();
    if (only.length !== 1) throw new Error("Background task provider must be selected explicitly when multiple providers are available.");
    return only[0]!.id;
  } finally {
    store.close();
  }
}
