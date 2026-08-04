import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readBundledAgentCatalog } from "../agent/catalog.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "../project-harness/path-safety.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ProjectRuntimeResolution } from "../project-runtime/context.js";
import type { ProjectWorkbenchPathPort } from "../project-runtime/paths.js";
import { defaultProviderRegistry, type ProviderOperationProfile } from "../provider-runtime/index.js";
import type { ProviderSkillInput } from "../project-harness/contracts.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import type { ManagedProject } from "../types/index.js";
import { hashNativeSkillPackageContent } from "../skill/content-hash.js";
import { getSystemSkillsRoot } from "../template-source/paths.js";
import { getWorktreeStatus } from "../worktree/status.js";
import { CanonicalTimelineDelivery } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import { createAssistantTranscriptCapture } from "./live-transcript.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { defaultProjectRuntimeActivityRegistry } from "../project-runtime/activity.js";
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
  sourceRunId: string | null;
  worktreeId: string | null;
  model: import("../provider-runtime/index.js").ProviderModelRef | null;
}

interface ChildContinuationExecution {
  cwd: string;
  sandboxPolicy: "read-only" | "workspace-write";
  writableRoots: string[];
  runtimeWorkspaceRoots: string[];
  skillInputs: ProviderSkillInput[];
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
  const runtime = await requireReadyProjectRuntime(input.project);
  const catalog = readBundledAgentCatalog();
  const store = await openProjectRuntimeWorkbenchDatabase(runtime.paths);
  try {
    return store.providerAttempts.listProviderThreads(runtime.harness.projectId, input.conversationId)
      .filter((link) => link.graphScopeId === input.graphScopeId
        && link.parentThreadId === input.parentThreadId
        && link.roleId !== "main-agent"
        && resolveRegisteredAgentExecutionProfile(catalog, link.roleId) !== null)
      .flatMap((link) => {
        const attempt = store.providerAttempts.readProviderAttempt(runtime.harness.projectId, link.attemptId);
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

export function runExactChildAgentClose(
  input: Parameters<typeof runExactChildAgentCloseActivity>[0],
): ReturnType<typeof runExactChildAgentCloseActivity> {
  return defaultProjectRuntimeActivityRegistry.run(input.project.id, () => runExactChildAgentCloseActivity(input));
}

async function runExactChildAgentCloseActivity(input: {
  project: ManagedProject;
  conversationId: string;
  graphScopeId: string;
  parentThreadId: string;
  agentSurfaceId: string;
  onLifecycleEvent(event: ProviderChildLifecycleEvent): void;
}): Promise<{ runId: string; roleId: string; displayName?: string }> {
  const runtime = await requireReadyProjectRuntime(input.project);
  const target = await resolveExactChildTarget({
    runtime: runtime.paths,
    conversationId: input.conversationId,
    graphScopeId: input.graphScopeId,
    agentSurfaceId: input.agentSurfaceId,
    parentThreadId: input.parentThreadId,
    requireIdle: false,
  });
  const childState = await defaultProviderRegistry.get(target.providerId).conversation.inspectChild({
    providerId: target.providerId,
    projectId: input.project.id,
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
  const directory = join(runtime.paths.workbenchRoot, "conversations", input.conversationId, "runs", runId);
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

export function runExactChildAgentTurn(
  input: Parameters<typeof runExactChildAgentTurnActivity>[0],
): ReturnType<typeof runExactChildAgentTurnActivity> {
  return defaultProjectRuntimeActivityRegistry.run(input.project.id, () => runExactChildAgentTurnActivity(input));
}

async function runExactChildAgentTurnActivity(input: {
  project: ManagedProject;
  conversationId: string;
  agentSurfaceId: string;
  message: string;
  live?: WorkbenchLiveSink;
}): Promise<TopicMessageResult> {
  const runtime = await requireReadyProjectRuntime(input.project);
  if (input.agentSurfaceId === "main-agent") throw badRequest("Child Agent feedback cannot target Main Agent.");

  const target = await resolveExactChildTarget({
    runtime: runtime.paths,
    conversationId: input.conversationId,
    agentSurfaceId: input.agentSurfaceId,
    requireIdle: true,
  });

  const childState = await defaultProviderRegistry.get(target.providerId).conversation.inspectChild({
    providerId: target.providerId,
    projectId: input.project.id,
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
  const execution = await resolveChildContinuationExecution({
    runtime,
    conversationId: input.conversationId,
    target,
    projectHarnessSkillInput: runtime.providerInput,
  });
  const runId = `agent-feedback-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const attemptId = `attempt-${randomUUID()}`;
  const directory = join(runtime.paths.workbenchRoot, "conversations", input.conversationId, "runs", runId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "prompt.md"), input.message, "utf8");
  const now = new Date().toISOString();
  const model = target.model ?? (resolvedProvider.snapshot.effectiveModel
    ? { providerId: target.providerId, modelId: resolvedProvider.snapshot.effectiveModel }
    : null);
  const store = await openProjectRuntimeWorkbenchDatabase(runtime.paths);
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
      const writes = buildCanonicalCaptureWrites({
        projectId: runtime.harness.projectId,
        conversationId: input.conversationId,
        graphScopeId: target.graphScopeId,
        runId,
        providerId: target.providerId,
        attemptId,
        mainTimelineId: `assistant:${input.conversationId}:${target.providerId}:${runId}:unused-main`,
        mainSessionId: null,
        snapshot,
      });
      const rows = store.unitOfWork.commitProviderCallback({
        projectId: runtime.harness.projectId,
        conversationId: input.conversationId,
        attemptId,
        expectedGraphScopeId: target.graphScopeId,
        updatedAt: new Date().toISOString(),
        timelineMessages: writes,
      });
      delivery.publishCommittedMany(rows);
      return true;
    } catch {
      return false;
    }
  });

  try {
    store.providerAttempts.createProviderAttempt({
      projectId: runtime.harness.projectId,
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
      worktreeId: target.worktreeId,
      status: "running",
      createdAt: now,
      updatedAt: now,
    });
    store.providerAttempts.bindProviderAttemptThread(runtime.harness.projectId, {
      attemptId,
      threadId: target.threadId,
      parentThreadId: target.parentThreadId,
      runId: target.sourceRunId,
    }, now);
    delivery.append(toCanonicalTimelineMessage(runtime.harness.projectId, input.conversationId, user));
    publishAgentSurfacesInvalidated(runtime.harness.projectId, { conversationId: input.conversationId, graphScopeId: target.graphScopeId, reason: "attempt-updated" });
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
      cwd: execution.cwd,
      prompt: input.message,
      skillInputs: execution.skillInputs,
      sandboxPolicy: execution.sandboxPolicy,
      writableRoots: execution.writableRoots,
      runtimeWorkspaceRoots: execution.runtimeWorkspaceRoots,
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
        "aho.project": { kind: "application", value: JSON.stringify({
          projectRoot: runtime.projectRoot,
          projectId: runtime.harness.projectId,
          projectHarnessSkill: runtime.harness.skillName,
        }) },
      },
    });

    let assistant: TopicThreadEntry | null = null;
    const writes = buildCanonicalCaptureWrites({
      projectId: runtime.harness.projectId,
      conversationId: input.conversationId,
      graphScopeId: target.graphScopeId,
      runId,
      providerId: target.providerId,
      attemptId,
      mainTimelineId: `assistant:${input.conversationId}:${target.providerId}:${runId}:unused-main`,
      mainSessionId: null,
      snapshot: capture,
    });
    for (const write of writes) assistant = importStoredEntry(write);
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
      writes.push(toCanonicalTimelineMessage(runtime.harness.projectId, input.conversationId, assistant));
    }
    const terminalRows = store.unitOfWork.commitProviderCallback({
      projectId: runtime.harness.projectId,
      conversationId: input.conversationId,
      attemptId,
      expectedGraphScopeId: target.graphScopeId,
      updatedAt: new Date().toISOString(),
      terminal: { status: result.status, nativeSessionId: target.threadId },
      timelineMessages: writes,
    });
    delivery.publishCommittedMany(terminalRows);
    publishAgentSurfacesInvalidated(runtime.harness.projectId, { conversationId: input.conversationId, graphScopeId: target.graphScopeId, reason: "attempt-updated" });
    return {
      user,
      assistant,
      run: null,
      providerSessionId: target.threadId,
      mode: "chat",
      assistantMessage: result.lastMessage || assistant?.text || "",
    };
  } catch (error) {
    const attempt = store.providerAttempts.readProviderAttempt(runtime.harness.projectId, attemptId);
    if (attempt?.status === "running" || attempt?.status === "queued") {
      store.unitOfWork.commitProviderCallback({
        projectId: runtime.harness.projectId,
        conversationId: input.conversationId,
        attemptId,
        expectedGraphScopeId: target.graphScopeId,
        updatedAt: new Date().toISOString(),
        terminal: { status: "failed", nativeSessionId: target.threadId },
      });
      publishAgentSurfacesInvalidated(runtime.harness.projectId, { conversationId: input.conversationId, graphScopeId: target.graphScopeId, reason: "attempt-updated" });
    }
    throw error;
  } finally {
    store.close();
  }
}

async function resolveExactChildTarget(input: {
  runtime: ProjectWorkbenchPathPort;
  conversationId: string;
  graphScopeId?: string;
  agentSurfaceId: string;
  parentThreadId?: string;
  requireIdle: boolean;
}): Promise<ExactChildTarget> {
  const store = await openProjectRuntimeWorkbenchDatabase(input.runtime);
  try {
    const conversation = store.conversations.readConversation(input.runtime.projectId, input.conversationId);
    if (!conversation) throw notFound("Child Agent conversation was not found.");
    if (!conversation.currentGraphScopeId
      || store.conversations.isConversationGraphScopeTerminal(input.runtime.projectId, conversation.currentGraphScopeId)) {
      throw conflict("Child Agent control requires the current active conversation scope.");
    }
    if (input.graphScopeId && conversation.currentGraphScopeId !== input.graphScopeId) {
      throw conflict("The selected Child Agent graph scope is stale.");
    }
    const link = store.providerAttempts.listProviderThreads(input.runtime.projectId, input.conversationId)
      .find((candidate) => candidate.graphScopeId === conversation.currentGraphScopeId
        && candidate.roleId !== "main-agent"
        && agentThreadSurfaceId(candidate.providerId, candidate.providerThreadId) === input.agentSurfaceId);
    if (!link) throw notFound("The selected Child Agent is stale or does not belong to this conversation.");
    if (!link.parentThreadId) throw conflict("The selected Child Agent has no parent collaboration lineage.");
    if (input.parentThreadId && link.parentThreadId !== input.parentThreadId) {
      throw conflict("The selected Child Agent does not belong to the active Main Agent thread.");
    }
    const attempt = store.providerAttempts.readProviderAttempt(input.runtime.projectId, link.attemptId);
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
      sourceRunId: link.runId ?? null,
      worktreeId: attempt.worktreeId,
      model: attempt.model,
    };
  } finally {
    store.close();
  }
}

async function resolveChildContinuationExecution(input: {
  runtime: ProjectRuntimeResolution;
  conversationId: string;
  target: ExactChildTarget;
  projectHarnessSkillInput: ProviderSkillInput;
}): Promise<ChildContinuationExecution> {
  if (input.target.operationProfile === "planning") {
    if (!input.target.sourceRunId) throw conflict("The Planning Agent proposal workspace is no longer identifiable.");
    const proposalRoot = await resolveWithinPhysicalRoot(
      input.runtime.paths.workbenchRoot,
      join("conversations", input.conversationId, "runs", input.target.sourceRunId, "planner-proposal"),
      "Planning Agent proposal workspace",
    );
    await assertPhysicalDirectory(proposalRoot, "Planning Agent proposal workspace");
    const workflowSkillPath = join(getSystemSkillsRoot(), "aho-workflow-authoring", "SKILL.md");
    if (!existsSync(workflowSkillPath)) throw conflict("Workflow Authoring Skill is unavailable for Planning Agent feedback.");
    return {
      cwd: input.runtime.projectRoot,
      sandboxPolicy: "workspace-write",
      writableRoots: [proposalRoot],
      runtimeWorkspaceRoots: [input.runtime.projectRoot, proposalRoot],
      skillInputs: [
        input.projectHarnessSkillInput,
        {
          id: "aho-workflow-authoring",
          path: workflowSkillPath,
          contentHash: await hashNativeSkillPackageContent(dirname(workflowSkillPath)),
          source: "aho-system",
          required: true,
        },
      ],
    };
  }
  if (input.target.operationProfile === "coder") {
    if (!input.target.worktreeId) throw conflict("The selected Child Agent has no assigned worktree for writable feedback.");
    const worktree = await getWorktreeStatus({
      projectId: input.runtime.harness.projectId,
      projectRoot: input.runtime.projectRoot,
      worktreeMetadataRoot: input.runtime.paths.worktreeMetadataRoot,
    }, input.target.worktreeId);
    if (!worktree.exists) throw conflict("The selected Child Agent worktree no longer exists.");
    if (input.target.changeId && worktree.changeId !== input.target.changeId) {
      throw conflict("The selected Child Agent worktree no longer belongs to the active Change.");
    }
    return {
      cwd: worktree.checkoutPath,
      sandboxPolicy: "workspace-write",
      writableRoots: [worktree.checkoutPath],
      runtimeWorkspaceRoots: [worktree.checkoutPath],
      skillInputs: [input.projectHarnessSkillInput],
    };
  }
  if (input.target.operationProfile === "auditor" || input.target.operationProfile === "evolution-scorer") {
    return {
      cwd: input.runtime.projectRoot,
      sandboxPolicy: "read-only",
      writableRoots: [],
      runtimeWorkspaceRoots: [input.runtime.projectRoot],
      skillInputs: [input.projectHarnessSkillInput],
    };
  }
  throw conflict(`The selected Child Agent execution workspace cannot be safely resumed: ${input.target.operationProfile}.`);
}

async function requireReadyProjectRuntime(project: ManagedProject): Promise<ProjectRuntimeResolution> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for Child Agent control: ${state.state}.`);
  }
  return state.resolution;
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
