import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readAgentCatalog } from "../agent/catalog.js";
import { assertWritableMemory } from "../memory/resolver.js";
import { defaultProviderRegistry, type ProviderOperationProfile } from "../provider-runtime/index.js";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import { ensureProjectRuntime } from "../harness/init.js";
import type { ManagedProject } from "../types/index.js";
import { CanonicalTimelineDelivery } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import { createAssistantTranscriptCapture } from "./live-transcript.js";
import { openWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { buildCanonicalCaptureWrites } from "./provider-capture-persistence.js";
import { forwardProviderRealtimeEvent } from "./provider-live-events.js";
import { publishAgentSurfacesInvalidated } from "./project-live-events.js";
import { resolveRegisteredAgentExecutionProfile } from "./agent-execution-profile-resolver.js";
import type { ProviderChildLifecycleEvent } from "../provider-runtime/index.js";
import type { TopicMessageResult, TopicThreadEntry, WorkbenchLiveSink } from "./types.js";

const OPERATION_PROFILES = new Set<ProviderOperationProfile>([
  "main", "planning", "coder", "auditor", "evolution", "evolution-scorer",
]);

interface ExactChildTarget {
  providerId: string;
  threadId: string;
  parentThreadId: string;
  roleId: string;
  displayName?: string;
  graphScopeId: string;
  changeId: string | null;
  operationProfile: ProviderOperationProfile;
  previousAttemptId: string;
  previousHandoffHash: string;
  deliveredThroughCompletedTurn: number;
  model: import("../provider-runtime/index.js").ProviderModelRef | null;
}

export interface ClosableChildAgent {
  agentSurfaceId: string;
  roleId: string;
  displayName?: string;
}

export async function listClosableChildAgents(input: {
  project: ManagedProject;
  conversationId: string;
  graphScopeId: string;
  parentThreadId: string;
}): Promise<ClosableChildAgent[]> {
  const memory = await ensureProjectRuntime(input.project);
  if (!memory.projectId) return [];
  const catalog = await readAgentCatalog(memory);
  const store = await openWorkbenchDatabase(memory);
  try {
    return store.providerAttempts.listProviderThreads(memory.projectId, input.conversationId)
      .filter((link) => link.graphScopeId === input.graphScopeId
        && link.parentThreadId === input.parentThreadId
        && link.roleId !== "main-agent"
        && resolveRegisteredAgentExecutionProfile(catalog, link.roleId) !== null)
      .flatMap((link) => {
        const attempt = store.providerAttempts.readProviderAttempt(memory.projectId!, link.attemptId);
        if (!attempt || attempt.status === "terminated") return [];
        return [{
          agentSurfaceId: agentThreadSurfaceId(link.providerId, link.providerThreadId),
          roleId: link.roleId,
          ...(link.displayName ? { displayName: link.displayName } : {}),
        }];
      });
  } finally {
    store.close();
  }
}

export async function runExactChildAgentClose(input: {
  project: ManagedProject;
  conversationId: string;
  graphScopeId: string;
  parentThreadId: string;
  agentSurfaceId: string;
  onLifecycleEvent(event: ProviderChildLifecycleEvent): void;
}): Promise<{ runId: string; roleId: string; displayName?: string }> {
  const memory = await ensureProjectRuntime(input.project);
  assertWritableMemory(memory, "Child Agent close");
  if (!memory.projectId) throw new Error("Project id is required to close a Child Agent.");
  const target = await resolveExactChildTarget({
    memory,
    conversationId: input.conversationId,
    graphScopeId: input.graphScopeId,
    agentSurfaceId: input.agentSurfaceId,
    parentThreadId: input.parentThreadId,
    requireIdle: false,
  });
  const childState = await defaultProviderRegistry.get(target.providerId).conversation.inspectChild({
    providerId: target.providerId,
    cwd: input.project.path,
    parentSession: { providerId: target.providerId, sessionId: target.parentThreadId },
    targetSession: { providerId: target.providerId, sessionId: target.threadId },
  });
  if (childState === "stale") {
    throw conflict("The selected Child Agent belongs to a stale Provider Host generation and cannot be closed.");
  }
  const resolvedProvider = await defaultProviderRegistry.requireProfiles(
    target.providerId,
    [target.operationProfile],
    input.project,
    input.project.path,
  );
  const runId = `agent-close-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const directory = join(memory.workbenchRoot, "conversations", input.conversationId, "runs", runId);
  await mkdir(directory, { recursive: true });
  const result = await resolvedProvider.descriptor.conversation.closeChild({
    providerId: target.providerId,
    projectId: input.project.id,
    conversationId: input.conversationId,
    graphScopeId: target.graphScopeId,
    changeId: target.changeId ?? undefined,
    runtimeScopeId: `${input.conversationId}:${input.agentSurfaceId}:${runId}`,
    roleId: target.roleId,
    runId,
    attemptId: target.previousAttemptId,
    cwd: input.project.path,
    parentSession: { providerId: target.providerId, sessionId: target.parentThreadId },
    targetSession: { providerId: target.providerId, sessionId: target.threadId },
    targetDisplayName: target.displayName,
    paths: {
      events: join(directory, "provider-events.jsonl"),
      stderr: join(directory, "app-server-stderr.log"),
      lastMessage: join(directory, "last-message.md"),
      session: join(directory, "provider-session.json"),
    },
    onChildLifecycleEvent: input.onLifecycleEvent,
  });
  if (result.status !== "completed") {
    throw new Error(result.error || "Provider did not close the selected Child Agent.");
  }
  return {
    runId,
    roleId: target.roleId,
    ...(target.displayName ? { displayName: target.displayName } : {}),
  };
}

export async function runExactChildAgentTurn(input: {
  project: ManagedProject;
  conversationId: string;
  agentSurfaceId: string;
  message: string;
  live?: WorkbenchLiveSink;
}): Promise<TopicMessageResult> {
  const memory = await ensureProjectRuntime(input.project);
  assertWritableMemory(memory, "Child Agent feedback");
  if (!memory.projectId) throw new Error("Project id is required to send Child Agent feedback.");
  if (input.agentSurfaceId === "main-agent") throw badRequest("Child Agent feedback cannot target Main Agent.");

  const target = await resolveExactChildTarget({
    memory,
    conversationId: input.conversationId,
    agentSurfaceId: input.agentSurfaceId,
    requireIdle: true,
  });

  const childState = await defaultProviderRegistry.get(target.providerId).conversation.inspectChild({
    providerId: target.providerId,
    cwd: input.project.path,
    parentSession: { providerId: target.providerId, sessionId: target.parentThreadId },
    targetSession: { providerId: target.providerId, sessionId: target.threadId },
  });
  if (childState === "stale") {
    throw conflict("The selected Child Agent belongs to a stale Provider Host generation and cannot receive more feedback.");
  }
  const resolvedProvider = await defaultProviderRegistry.requireProfiles(
    target.providerId,
    [target.operationProfile],
    input.project,
    input.project.path,
  );
  const runId = `agent-feedback-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const attemptId = `attempt-${randomUUID()}`;
  const directory = join(memory.workbenchRoot, "conversations", input.conversationId, "runs", runId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "prompt.md"), input.message, "utf8");
  const now = new Date().toISOString();
  const model = target.model ?? (resolvedProvider.snapshot.effectiveModel
    ? { providerId: target.providerId, modelId: resolvedProvider.snapshot.effectiveModel }
    : null);
  const store = await openWorkbenchDatabase(memory);
  const delivery = new CanonicalTimelineDelivery(store, input.live);
  const user: TopicThreadEntry = {
    id: `user:${input.conversationId}:${target.providerId}:${runId}`,
    type: "user.message",
    timestamp: now,
    conversationId: input.conversationId,
    graphScopeId: target.graphScopeId,
    changeId: target.changeId ?? "",
    text: input.message,
    runId,
    providerId: target.providerId,
    sessionId: target.threadId,
    attemptId,
    threadId: target.threadId,
    parentThreadId: target.parentThreadId ?? undefined,
    agentRoleId: target.roleId,
    agentSurfaceId: input.agentSurfaceId,
  };
  const capture = createAssistantTranscriptCapture(input.live, (snapshot) => {
    try {
      for (const write of buildCanonicalCaptureWrites({
        projectId: memory.projectId!,
        conversationId: input.conversationId,
        graphScopeId: target.graphScopeId,
        runId,
        providerId: target.providerId,
        attemptId,
        mainTimelineId: `assistant:${input.conversationId}:${target.providerId}:${runId}:unused-main`,
        mainSessionId: null,
        snapshot,
      })) delivery.upsert(write);
      return true;
    } catch {
      return false;
    }
  });

  try {
    store.providerAttempts.createProviderAttempt({
      projectId: memory.projectId,
      conversationId: input.conversationId,
      attemptId,
      graphScopeId: target.graphScopeId,
      changeId: target.changeId,
      agentTaskId: null,
      roleId: target.roleId,
      operationProfile: target.operationProfile,
      providerId: target.providerId,
      nativeSessionId: target.threadId,
      model,
      capabilitySnapshot: resolvedProvider.snapshot,
      handoffHash: createHash("sha256").update(JSON.stringify({
        previousAttemptId: target.previousAttemptId,
        previousHandoffHash: target.previousHandoffHash,
        message: input.message,
      })).digest("hex"),
      deliveredThroughCompletedTurn: target.deliveredThroughCompletedTurn,
      worktreeId: null,
      status: "running",
      createdAt: now,
      updatedAt: now,
    });
    store.providerAttempts.bindProviderAttemptThread(memory.projectId, {
      attemptId,
      threadId: target.threadId,
      parentThreadId: target.parentThreadId,
    }, now);
    delivery.append(toCanonicalTimelineMessage(memory.projectId, input.conversationId, user));
    publishAgentSurfacesInvalidated(memory.projectId, { conversationId: input.conversationId, graphScopeId: target.graphScopeId, reason: "attempt-updated" });
    capture.sink.emit({ event: "run.started", data: {
      runId,
      conversationId: input.conversationId,
      graphScopeId: target.graphScopeId,
      providerId: target.providerId,
      attemptId,
      threadId: target.threadId,
      parentThreadId: target.parentThreadId ?? undefined,
      agentRoleId: target.roleId,
      agentSurfaceId: input.agentSurfaceId,
      actionType: "agent.feedback",
    } });

    const result = await resolvedProvider.descriptor.conversation.continueChild({
      providerId: target.providerId,
      operationProfile: target.operationProfile,
      attemptId,
      projectId: input.project.id,
      conversationId: input.conversationId,
      graphScopeId: target.graphScopeId,
      changeId: target.changeId ?? undefined,
      runtimeScopeId: `${input.conversationId}:${input.agentSurfaceId}:${runId}`,
      roleId: target.roleId,
      runId,
      cwd: input.project.path,
      prompt: input.message,
      sandboxPolicy: "read-only",
      paths: {
        events: join(directory, "provider-events.jsonl"),
        stderr: join(directory, "app-server-stderr.log"),
        lastMessage: join(directory, "last-message.md"),
        session: join(directory, "provider-session.json"),
      },
      targetSession: { providerId: target.providerId, sessionId: target.threadId },
      parentSession: { providerId: target.providerId, sessionId: target.parentThreadId },
      onRealtimeEvent: (event) => {
        if (event.threadId !== target.threadId) return;
        forwardProviderRealtimeEvent({ ...event, roleId: target.roleId }, capture.sink, { graphScopeId: target.graphScopeId });
      },
      onError: (error) => capture.sink.emit({ event: "error", data: {
        runId,
        conversationId: input.conversationId,
        graphScopeId: target.graphScopeId,
        providerId: target.providerId,
        attemptId,
        threadId: target.threadId,
        agentRoleId: target.roleId,
        agentSurfaceId: input.agentSurfaceId,
        message: error instanceof Error ? error.message : String(error),
      } }),
      model,
      additionalContext: {
        "aho.project": { kind: "application", value: JSON.stringify({ projectRoot: input.project.path, memoryRoot: memory.memoryRoot, memoryMode: memory.mode }) },
      },
    });

    let assistant: TopicThreadEntry | null = null;
    const writes = buildCanonicalCaptureWrites({
      projectId: memory.projectId,
      conversationId: input.conversationId,
      graphScopeId: target.graphScopeId,
      runId,
      providerId: target.providerId,
      attemptId,
      mainTimelineId: `assistant:${input.conversationId}:${target.providerId}:${runId}:unused-main`,
      mainSessionId: null,
      snapshot: capture,
    });
    for (const write of writes) {
      delivery.upsert(write);
      assistant = importStoredEntry(write);
    }
    if (!assistant && (result.lastMessage || result.error)) {
      assistant = {
        id: `assistant:${input.conversationId}:${target.providerId}:${runId}:feedback`,
        type: "assistant.message",
        timestamp: new Date().toISOString(),
        conversationId: input.conversationId,
        graphScopeId: target.graphScopeId,
        changeId: target.changeId ?? "",
        text: result.lastMessage || result.error,
        status: result.status,
        runId,
        providerId: target.providerId,
        sessionId: target.threadId,
        attemptId,
        threadId: target.threadId,
        parentThreadId: target.parentThreadId ?? undefined,
        turnId: result.turnId ?? undefined,
        itemId: result.lastMessageItemId ?? undefined,
        agentRoleId: target.roleId,
        agentSurfaceId: input.agentSurfaceId,
      };
      delivery.append(toCanonicalTimelineMessage(memory.projectId, input.conversationId, assistant));
    }
    store.providerAttempts.completeProviderAttempt(memory.projectId, attemptId, result.status, target.threadId, new Date().toISOString());
    publishAgentSurfacesInvalidated(memory.projectId, { conversationId: input.conversationId, graphScopeId: target.graphScopeId, reason: "attempt-updated" });
    return {
      user,
      assistant,
      run: null,
      providerSessionId: target.threadId,
      mode: "chat",
      assistantMessage: result.lastMessage || assistant?.text || "",
    };
  } catch (error) {
    const attempt = store.providerAttempts.readProviderAttempt(memory.projectId, attemptId);
    if (attempt?.status === "running" || attempt?.status === "queued") {
      store.providerAttempts.completeProviderAttempt(memory.projectId, attemptId, "failed", target.threadId, new Date().toISOString());
      publishAgentSurfacesInvalidated(memory.projectId, { conversationId: input.conversationId, graphScopeId: target.graphScopeId, reason: "attempt-updated" });
    }
    throw error;
  } finally {
    store.close();
  }
}

async function resolveExactChildTarget(input: {
  memory: Awaited<ReturnType<typeof ensureProjectRuntime>>;
  conversationId: string;
  graphScopeId?: string;
  agentSurfaceId: string;
  parentThreadId?: string;
  requireIdle: boolean;
}): Promise<ExactChildTarget> {
  if (!input.memory.projectId) throw new Error("Project id is required to resolve a Child Agent.");
  const store = await openWorkbenchDatabase(input.memory);
  try {
    const conversation = store.conversations.readConversation(input.memory.projectId, input.conversationId);
    if (!conversation) throw notFound("Child Agent conversation was not found.");
    if (!conversation.currentGraphScopeId
      || store.conversations.isConversationGraphScopeTerminal(input.memory.projectId, conversation.currentGraphScopeId)) {
      throw conflict("Child Agent control requires the current active conversation scope.");
    }
    if (input.graphScopeId && conversation.currentGraphScopeId !== input.graphScopeId) {
      throw conflict("The selected Child Agent graph scope is stale.");
    }
    const link = store.providerAttempts.listProviderThreads(input.memory.projectId, input.conversationId)
      .find((candidate) => candidate.graphScopeId === conversation.currentGraphScopeId
        && candidate.roleId !== "main-agent"
        && agentThreadSurfaceId(candidate.providerId, candidate.providerThreadId) === input.agentSurfaceId);
    if (!link) throw notFound("The selected Child Agent is stale or does not belong to this conversation.");
    if (!link.parentThreadId) throw conflict("The selected Child Agent has no parent collaboration lineage.");
    if (input.parentThreadId && link.parentThreadId !== input.parentThreadId) {
      throw conflict("The selected Child Agent does not belong to the active Main Agent thread.");
    }
    const attempt = store.providerAttempts.readProviderAttempt(input.memory.projectId, link.attemptId);
    if (!attempt
      || attempt.conversationId !== input.conversationId
      || attempt.graphScopeId !== conversation.currentGraphScopeId
      || attempt.providerId !== link.providerId
      || attempt.nativeSessionId !== link.providerThreadId) {
      throw conflict("The selected Child Agent lineage is no longer current.");
    }
    if (input.requireIdle && (attempt.status === "queued" || attempt.status === "running")) {
      throw conflict("The selected Child Agent is still running and cannot start a feedback turn yet.");
    }
    if (attempt.status === "terminated") {
      throw conflict("The selected Child Agent has been terminated.");
    }
    if (!OPERATION_PROFILES.has(attempt.operationProfile as ProviderOperationProfile)) {
      throw conflict(`Unsupported Child Agent operation profile: ${attempt.operationProfile}`);
    }
    return {
      providerId: link.providerId,
      threadId: link.providerThreadId,
      parentThreadId: link.parentThreadId,
      roleId: link.roleId,
      ...(link.displayName ? { displayName: link.displayName } : {}),
      graphScopeId: conversation.currentGraphScopeId,
      changeId: conversation.boundChangeId,
      operationProfile: attempt.operationProfile as ProviderOperationProfile,
      previousAttemptId: attempt.attemptId,
      previousHandoffHash: attempt.handoffHash,
      deliveredThroughCompletedTurn: conversation.completedTurnSequence,
      model: attempt.model,
    };
  } finally {
    store.close();
  }
}

function importStoredEntry(write: ReturnType<typeof toCanonicalTimelineMessage>): TopicThreadEntry {
  return JSON.parse(write.rawJson) as TopicThreadEntry;
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequest";
  return error;
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFound";
  return error;
}
