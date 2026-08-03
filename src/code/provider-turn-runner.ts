import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import { collectWorktreeDiff } from "../audit/diff.js";
import { writeJsonFile } from "../fs/json.js";
import { defaultProviderRegistry } from "../provider-runtime/index.js";
import type { ProviderSkillInput } from "../project-harness/contracts.js";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import { appendExternalExecutionCompleted, appendExternalExecutionFailed, appendExternalExecutionRequested, appendPermissionProfileAttached } from "../runtime-continuity/events.js";
import { appendAgentEventEnvelope, createRuntimeContinuityArtifacts, markRuntimeContinuityStatus } from "../runtime-continuity/repository.js";
import { appendRunEvent } from "../run/manager.js";
import type { ManagedProject, ResolvedMemory, RunMetadata, RunStatus, RunWorktreeInfo } from "../types/index.js";
import { getSortedSourceStatus, renderImplementationSummary } from "./artifacts.js";
import { emitCodeLiveCallbackError, emitCodeLiveRunStarted, emitCodeLiveStatus } from "./live-events.js";
import { finishRun, type CodeRunPaths } from "./run-session.js";
import type { CodeRunLiveCallbacks, CodeRunResult } from "./types.js";
import { openWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import { type StoredConversation } from "../workbench/persistence/contracts.js";
import { assembleSharedConversationContext } from "../workbench/shared-conversation-context.js";
import { bindProviderAttemptThread, finishProviderAttempt } from "../workbench/provider-attempts.js";
import { defaultProjectRuntimeActivityRegistry } from "../project-runtime/activity.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";

export function runProviderCodeTurn(
  input: Parameters<typeof runProviderCodeTurnActivity>[0],
): ReturnType<typeof runProviderCodeTurnActivity> {
  return defaultProjectRuntimeActivityRegistry.run(input.project.id, () => runProviderCodeTurnActivity(input));
}

async function runProviderCodeTurnActivity(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  run: RunMetadata;
  paths: CodeRunPaths;
  changeId: string;
  roleId: string;
  worktree: RunWorktreeInfo;
  prompt: string;
  sourceBefore: string[];
  projectHarnessSkillInput: ProviderSkillInput;
  createdWarnings: string[];
  live?: CodeRunLiveCallbacks;
}): Promise<CodeRunResult> {
  const runtimeState = await resolveProjectRuntimeState(input.project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (runtimeState.state !== "ready") {
    throw new Error(`Project Harness is not ready for Coder execution: ${runtimeState.state}.`);
  }
  const conversation = await conversationForChange(input.memory, input.changeId);
  const providerId = conversation.selectedProviderId;
  const provider = await defaultProviderRegistry.require(providerId, "coder", input.project, input.project.path);
  const capabilitySnapshot = await provider.capabilitySnapshot(input.project, input.project.path);
  const model = capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null;
  const handoff = await assembleSharedConversationContext({
    resolution: runtimeState.resolution,
    conversationId: conversation.conversationId,
    providerId,
    currentUserMessage: input.prompt,
  });
  const attemptStore = await openWorkbenchDatabase(input.memory);
  try {
    attemptStore.providerAttempts.createProviderAttempt({
      projectId: input.project.id,
      conversationId: conversation.conversationId,
      attemptId: input.run.id,
      graphScopeId: conversation.currentGraphScopeId ?? `change:${input.changeId}`,
      changeId: input.changeId,
      agentTaskId: null,
      roleId: input.roleId,
      operationProfile: "coder",
      providerId,
      nativeSessionId: null,
      model,
      capabilitySnapshot,
      handoffHash: handoff.hash,
      deliveredThroughCompletedTurn: handoff.snapshot.deliveredThroughCompletedTurn,
      worktreeId: input.worktree.worktreeId,
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } finally {
    attemptStore.close();
  }
  let run: RunMetadata = {
    ...input.run,
    command: ["provider", "turn.start"],
    status: "running",
    enabledSkills: [{ ...input.projectHarnessSkillInput, providerId }],
  };
  await writeRunAndStartedEvents(input.paths, run, input.worktree, input.live);
  let continuity = await createRuntimeContinuityArtifacts(input.paths, {
    projectId: input.project.id,
    changeId: input.changeId,
    runId: run.id,
    roleId: input.roleId,
    ...(run.taskRunId ? { taskRunId: run.taskRunId } : {}),
    adapter: "provider-turn",
    worktree: input.worktree,
    permissionProfile: workerPermissionProfileForRole(input.roleId),
    rawArtifactRefs: [
      input.run.artifacts.providerEvents,
      input.run.artifacts.providerStderr,
      input.run.artifacts.providerLastMessage,
      input.run.artifacts.providerSession,
    ].filter((ref): ref is string => Boolean(ref)),
    sandboxPolicy: "workspace-write",
  });
  continuity = await markRuntimeContinuityStatus(input.paths, continuity, "running");
  const continuityWrites: Promise<void>[] = [];
  const boundThreadIds = new Set<string>();
  const recordContinuity = (promise: Promise<unknown>): void => {
    continuityWrites.push(promise.then(() => undefined).catch((error) => appendRuntimeContinuityFailure(input.paths, run.id, error)));
  };
  recordContinuity(appendPermissionProfileAttached(input.paths, continuity, { source: "code.app-server" }));
  recordContinuity(appendExternalExecutionRequested(input.paths, continuity, {
    requestId: `${run.id}:provider-turn`,
    command: providerId,
    args: ["turn.start"],
    cwd: input.worktree.checkoutPath,
    adapter: "provider-turn",
  }));
  await appendRunEvent(input.paths.events, {
    timestamp: new Date().toISOString(),
    type: "provider.started",
    runId: run.id,
    data: {
      providerId,
      model: model?.modelId ?? null,
      capabilitySnapshot,
    },
  });
  let providerResult;
  try {
    providerResult = await provider.leafExecution.runTurn({
    providerId,
    operationProfile: "coder",
    attemptId: run.id,
    projectId: input.project.id,
    changeId: input.changeId,
    roleId: input.roleId,
    runId: run.id,
    cwd: input.worktree.checkoutPath,
    prompt: input.prompt,
    skillInputs: [input.projectHarnessSkillInput],
    sandboxPolicy: "workspace-write",
    paths: {
      events: input.paths.providerEvents,
      stderr: input.paths.providerStderr,
      lastMessage: input.paths.providerLastMessage,
      session: input.paths.providerSession,
    },
    onRealtimeEvent: (realtime) => {
      if (!boundThreadIds.has(realtime.threadId)) {
        boundThreadIds.add(realtime.threadId);
        recordContinuity(bindProviderAttemptThread(input.memory, {
          attemptId: run.id,
          threadId: realtime.threadId,
          parentThreadId: realtime.parentThreadId,
          parentAgentSurfaceId: realtime.parentThreadId ? undefined : "main-agent",
          displayName: realtime.displayName,
        }));
      }
      const event = realtime.streamEvent;
      recordContinuity(appendAgentEventEnvelope(input.paths, continuity.session, continuity.eventSource, {
        eventType: event.type,
        summary: event.type === "text_delta" ? event.delta.slice(0, 160) : realtime.method,
        raw: { source: "provider", providerId, method: realtime.method, threadId: realtime.threadId },
      }));
      try {
        input.live?.onProviderEvent?.({
          ...event,
          runId: run.id,
          threadId: realtime.threadId,
          parentThreadId: realtime.parentThreadId,
          turnId: realtime.turnId,
          agentRoleId: realtime.roleId,
          agentSurfaceId: agentThreadSurfaceId(providerId, realtime.threadId),
          agentDisplayName: realtime.displayName,
        });
      } catch (error) {
        emitCodeLiveCallbackError(input.live, run.id, error);
      }
    },
    onError: (error) => emitCodeLiveCallbackError(input.live, run.id, error),
    model,
    additionalContext: handoff.context,
    });
  } catch (error) {
    await finishProviderAttempt(input.memory, input.run.id, "failed", null);
    throw error;
  }
  await Promise.all(continuityWrites);
  await finishProviderAttempt(
    input.memory,
    input.run.id,
    providerResult.status,
    providerResult.session?.sessionId ?? null,
  );
  recordContinuity((providerResult.status === "completed"
    ? appendExternalExecutionCompleted(input.paths, continuity, {
      requestId: `${run.id}:provider-turn`,
      status: providerResult.status,
      raw: { providerId, sessionId: providerResult.session?.sessionId, turnId: providerResult.turnId },
    })
    : appendExternalExecutionFailed(input.paths, continuity, {
      requestId: `${run.id}:provider-turn`,
      status: providerResult.status,
      error: providerResult.error,
      raw: { providerId, sessionId: providerResult.session?.sessionId, turnId: providerResult.turnId },
    })));
  await Promise.all(continuityWrites);
  continuity = await markRuntimeContinuityStatus(input.paths, continuity, providerResult.status, providerResult.error);
  await writeFile(input.paths.lastMessage, providerResult.lastMessage || providerResult.error || "# Provider output not captured\n", "utf8");
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "provider.exited", runId: run.id, data: { providerId, status: providerResult.status, sessionId: providerResult.session?.sessionId, turnId: providerResult.turnId, error: providerResult.error } });

  const diffResult = await collectWorktreeDiff(input.memory, input.worktree.worktreeId, input.changeId);
  await writeFile(input.paths.diff, diffResult.diff, "utf8");
  await writeFile(input.paths.diffStat, diffResult.diffStat, "utf8");
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "diff.collected", runId: run.id, data: { bytes: Buffer.byteLength(diffResult.diff, "utf8"), stat: diffResult.diffStat } });
  const sourceAfter = await getSortedSourceStatus(input.project.path);
  const sourceChanged = JSON.stringify(input.sourceBefore) !== JSON.stringify(sourceAfter);
  await appendRunEvent(input.paths.events, { timestamp: new Date().toISOString(), type: "source.checked", runId: run.id, data: { before: input.sourceBefore, after: sourceAfter, changed: sourceChanged } });
  const lastMessage = providerResult.lastMessage || providerResult.error || "";
  const warnings = [
    ...input.createdWarnings,
    ...(diffResult.diff.trim() ? [] : ["Coder run completed without producing a worktree diff."]),
    ...(sourceChanged ? ["Source project git status changed during the provider turn; the Agent may have modified outside the assigned worktree."] : []),
    ...(providerResult.status === "interrupted" ? ["Coder provider turn was interrupted by the user."] : []),
  ];
  await writeFile(input.paths.implementation, renderImplementationSummary({
    lastMessage,
    diffStat: diffResult.diffStat,
    diff: diffResult.diff,
    warnings,
    sourceBefore: input.sourceBefore,
    sourceAfter,
  }), "utf8");
  const status: RunStatus = sourceChanged
    ? "failed"
    : providerResult.status === "completed"
      ? "completed"
      : providerResult.status === "interrupted"
        ? "interrupted"
        : "failed";
  run = await finishRun(input.paths.run, { ...run, worktreeDiffHash: diffResult.diffHash }, status, sourceChanged ? 1 : status === "completed" ? 0 : 1, null);
  await appendRunEvent(input.paths.events, {
    timestamp: run.finishedAt ?? new Date().toISOString(),
    type: status === "completed" ? "run.completed" : status === "interrupted" ? "run.interrupted" : "run.failed",
    runId: run.id,
    data: { warnings, providerId },
  });
  emitCodeLiveStatus(input.live, { runId: run.id, status, label: "Coder" });
  return { run, warnings };
}

async function conversationForChange(memory: ResolvedMemory, changeId: string): Promise<StoredConversation> {
  if (!memory.projectId) throw new Error("Project id is required to resolve the Coder provider.");
  const store = await openWorkbenchDatabase(memory);
  try {
    const conversation = store.conversations.findConversationForChange(memory.projectId, changeId);
    if (!conversation) throw new Error(`Change ${changeId} is not bound to a Shared Conversation.`);
    return conversation;
  } finally {
    store.close();
  }
}

async function appendRuntimeContinuityFailure(paths: CodeRunPaths, runId: string, error: unknown): Promise<void> {
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "runtime_continuity.append_failed",
    runId,
    data: { error: error instanceof Error ? error.message : String(error) },
  }).catch(() => undefined);
}

async function writeRunAndStartedEvents(paths: CodeRunPaths, run: RunMetadata, worktree: RunWorktreeInfo, live: CodeRunLiveCallbacks | undefined): Promise<void> {
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "coder.started", runId: run.id, data: { cwd: worktree.checkoutPath, command: run.command, adapter: "provider-turn" } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "provider.started", runId: run.id, data: { cwd: worktree.checkoutPath } });
  emitCodeLiveRunStarted(live, run);
  emitCodeLiveStatus(live, { runId: run.id, status: "running", label: "Coder" });
}

