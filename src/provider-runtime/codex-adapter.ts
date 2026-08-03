import { getActiveCodexAppServerTurn, isCodexAppServerChildAvailable, listActiveCodexAppServerTurns, runCodexAppServerChildClose, runCodexAppServerChildTurn, runCodexAppServerTurn, type ActiveCodexAppServerTurn, type CodexAppServerThreadGoalStatus } from "../codex/app-server.js";
import type { CodexAppServerRealtimeEvent } from "../codex/app-server-realtime.js";
import { getCodexProviderCapabilitySnapshot, getCodexProviderRuntimeSummary } from "./codex.js";
import { executeCodexProjectAction, getCodexDiagnostics, listCodexProjectActions } from "./codex-diagnostics.js";
import { codexModelSettings, selectCodexModel } from "./codex-models.js";
import { listCodexNativeSkills, setCodexNativeSkillEnabled } from "../codex/native-skills.js";
import { defaultCodexAppServerHostRegistry } from "../codex/app-server-host.js";
import { defaultProjectRemovalFence } from "../project-runtime/removal.js";
import type { ActiveProviderTurn, ProviderChildCloseRequest, ProviderChildLifecycleEvent, ProviderChildSessionRequest, ProviderChildThreadResult, ProviderChildTurnRequest, ProviderDescriptor, ProviderObjectiveState, ProviderRealtimeEvent, ProviderTurnRequest, ProviderTurnResult, ProviderUserInputRequest } from "./contracts.js";
import { agentThreadSurfaceId } from "./agent-surface-id.js";

export const CODEX_PROVIDER_ID = "codex" as const;
const activeAttemptByScope = new Map<string, string>();

export const codexProviderDescriptor: ProviderDescriptor = {
  id: CODEX_PROVIDER_ID,
  displayName: "Codex",
  runtime: {
    shutdown: (reason) => defaultCodexAppServerHostRegistry.disposeAll(reason),
    shutdownProject: (project, reason) => defaultCodexAppServerHostRegistry.disposeProject(project.projectId, reason),
  },
  capabilitySnapshot: getCodexProviderCapabilitySnapshot,
  runtimeSummary: getCodexProviderRuntimeSummary,
  models: { read: codexModelSettings, select: selectCodexModel },
  diagnostics: getCodexDiagnostics,
  projectActions: { list: listCodexProjectActions, execute: executeCodexProjectAction },
  skills: {
    list: listCodexNativeSkills,
    setEnabled: setCodexNativeSkillEnabled,
  },
  conversation: { runTurn: runCodexTurn, inspectChild: inspectCodexChild, continueChild: runCodexChildTurn, closeChild: closeCodexChild, getActiveTurn: activeCodexTurn, listActiveTurns: activeCodexTurns },
  leafExecution: { runTurn: runCodexTurn },
};

export async function runCodexTurn(request: ProviderTurnRequest): Promise<ProviderTurnResult> {
  if (request.providerId !== CODEX_PROVIDER_ID) throw new Error(`Codex adapter cannot run provider ${request.providerId}`);
  const projectGeneration = defaultProjectRemovalFence.capture(request.projectId);
  const runtimeScopeId = request.runtimeScopeId ?? request.changeId ?? request.runId;
  activeAttemptByScope.set(runtimeScopeId, request.attemptId);
  let result: Awaited<ReturnType<typeof runCodexAppServerTurn>>;
  try {
    result = await runCodexAppServerTurn({
    projectId: request.projectId,
    conversationId: request.conversationId,
    changeId: request.changeId,
    runtimeScopeId: request.runtimeScopeId,
    roleId: request.roleId,
    agentTaskId: request.agentTaskId,
    runId: request.runId,
    cwd: request.cwd,
    prompt: request.prompt,
    sandboxPolicy: request.sandboxPolicy,
    paths: request.paths,
    existingThreadId: request.existingSession?.sessionId,
    goalSession: request.objectiveSession,
    goalResume: request.objectiveResume,
    timeoutMs: request.timeoutMs,
    onRealtimeEvent: request.onRealtimeEvent ? (event) => {
      if (!isProjectGenerationCurrent(request.projectId, projectGeneration)) return;
      const mapped = mapRealtime(request, event);
      if (mapped) request.onRealtimeEvent?.(mapped);
    } : undefined,
    onChildLifecycleEvent: request.onChildLifecycleEvent
      ? (event) => {
        if (isProjectGenerationCurrent(request.projectId, projectGeneration)) {
          request.onChildLifecycleEvent?.(mapChildLifecycle(event));
        }
      }
      : undefined,
    onChildThreadResult: guardedProjectNotification(request.projectId, projectGeneration, request.onChildThreadResult
      ? (child) => request.onChildThreadResult?.(mapChild(child))
      : undefined),
    onUserInputRequest: guardedProjectNotification(request.projectId, projectGeneration, request.onUserInputRequest
      ? (input) => request.onUserInputRequest?.(mapUserInput(request, input))
      : undefined),
    onUserInputResolved: guardedProjectNotification(request.projectId, projectGeneration, request.onUserInputResolved ? (input) => request.onUserInputResolved?.({
      providerId: CODEX_PROVIDER_ID,
      requestId: input.requestId,
      runtimeScopeId,
      runId: request.runId,
      attemptId: request.attemptId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }) : undefined),
    dynamicTools: request.tools,
    onDynamicToolCall: request.onToolCall ? async (call) => {
      defaultProjectRemovalFence.assertCurrent(request.projectId, projectGeneration);
      return request.onToolCall?.({ ...call, providerId: CODEX_PROVIDER_ID }) as Promise<import("./contracts.js").ProviderToolResult>;
    } : undefined,
    onGoalUpdate: guardedProjectNotification(request.projectId, projectGeneration, request.onObjectiveUpdate
      ? (goal) => request.onObjectiveUpdate?.(mapObjective(goal))
      : undefined),
    onTextDelta: guardedProjectNotification(request.projectId, projectGeneration, request.onTextDelta),
    onPlanDelta: guardedProjectNotification(request.projectId, projectGeneration, request.onPlanDelta),
    onPlanUpdate: guardedProjectNotification(request.projectId, projectGeneration, request.onPlanUpdate),
    onError: guardedProjectNotification(request.projectId, projectGeneration, request.onError),
    model: request.model?.modelId,
    imageInputs: request.imageInputs,
    skillInputs: request.skillInputs?.map((skill) => ({ name: skill.id, path: skill.path })),
    nativeSkillRoots: request.nativeSkillRoots,
    requiredNativeSkills: request.requiredNativeSkills,
    runtimeWorkspaceRoots: request.runtimeWorkspaceRoots,
    additionalContext: request.additionalContext,
    writableRoots: request.writableRoots,
    developerInstructions: request.developerInstructions,
    enableDefaultModeUserInput: request.operationProfile === "main" || request.operationProfile === "planning",
    outputSchema: request.outputSchema,
    });
  } finally {
    activeAttemptByScope.delete(runtimeScopeId);
  }
  return {
    providerId: CODEX_PROVIDER_ID,
    status: result.status,
    session: result.threadId ? { providerId: CODEX_PROVIDER_ID, sessionId: result.threadId } : null,
    turnId: result.turnId,
    lastMessageItemId: result.lastMessageItemId,
    lastMessage: result.lastMessage,
    planText: result.planText,
    objective: result.goal ? mapObjective(result.goal) : result.goal,
    childThreads: result.childThreads.map(mapChild),
    changedFiles: result.changedFiles,
    ...(result.host ? { runtimeHost: result.host } : {}),
    error: result.error,
  };
}

export async function runCodexChildTurn(request: ProviderChildTurnRequest): Promise<ProviderTurnResult> {
  if (request.providerId !== CODEX_PROVIDER_ID || request.parentSession.providerId !== CODEX_PROVIDER_ID || request.targetSession.providerId !== CODEX_PROVIDER_ID) {
    throw new Error("Codex Child continuation requires Codex parent and Child sessions.");
  }
  const projectGeneration = defaultProjectRemovalFence.capture(request.projectId);
  const result = await runCodexAppServerChildTurn({
    projectId: request.projectId,
    conversationId: request.conversationId,
    changeId: request.changeId,
    runtimeScopeId: request.runtimeScopeId,
    roleId: request.roleId,
    agentTaskId: request.agentTaskId,
    runId: request.runId,
    cwd: request.cwd,
    prompt: request.prompt,
    sandboxPolicy: request.sandboxPolicy,
    paths: request.paths,
    parentThreadId: request.parentSession.sessionId,
    targetThreadId: request.targetSession.sessionId,
    targetDisplayName: request.targetDisplayName,
    timeoutMs: request.timeoutMs,
    onRealtimeEvent: request.onRealtimeEvent ? (event) => {
      if (!isProjectGenerationCurrent(request.projectId, projectGeneration)) return;
      const mapped = mapRealtime(request, event);
      if (mapped) request.onRealtimeEvent?.(mapped);
    } : undefined,
    onChildLifecycleEvent: request.onChildLifecycleEvent
      ? (event) => {
        if (isProjectGenerationCurrent(request.projectId, projectGeneration)) {
          request.onChildLifecycleEvent?.(mapChildLifecycle(event));
        }
      }
      : undefined,
    onChildThreadResult: guardedProjectNotification(request.projectId, projectGeneration, request.onChildThreadResult
      ? (child) => request.onChildThreadResult?.(mapChild(child))
      : undefined),
    onError: guardedProjectNotification(request.projectId, projectGeneration, request.onError),
    model: request.model?.modelId,
    skillInputs: request.skillInputs?.map((skill) => ({ name: skill.id, path: skill.path })),
    requiredNativeSkills: request.skillInputs?.filter((skill) => skill.required).map((skill) => skill.id),
    runtimeWorkspaceRoots: request.runtimeWorkspaceRoots,
    additionalContext: request.additionalContext,
    writableRoots: request.writableRoots,
  });
  const child = [...result.childThreads].reverse()
    .find((candidate) => candidate.threadId === request.targetSession.sessionId && candidate.finalText.trim());
  return {
    providerId: CODEX_PROVIDER_ID,
    status: child ? child.status === "failed" ? "failed" : child.status === "interrupted" ? "interrupted" : "completed" : "failed",
    session: request.targetSession,
    turnId: child ? latestThreadTurnId(child.snapshot) : null,
    lastMessage: child?.finalText ?? "",
    childThreads: result.childThreads.map(mapChild),
    changedFiles: child?.changedFiles ?? [],
    ...(result.host ? { runtimeHost: result.host } : {}),
    ...(!child ? { error: result.error ?? "Codex did not complete the selected native Child follow-up." } : {}),
  };
}

async function inspectCodexChild(request: ProviderChildSessionRequest): Promise<"available" | "stale"> {
  if (request.providerId !== CODEX_PROVIDER_ID || request.parentSession.providerId !== CODEX_PROVIDER_ID || request.targetSession.providerId !== CODEX_PROVIDER_ID) {
    return "stale";
  }
  return isCodexAppServerChildAvailable(request.projectId, request.cwd, request.parentSession.sessionId, request.targetSession.sessionId)
    ? "available"
    : "stale";
}

async function closeCodexChild(request: ProviderChildCloseRequest): Promise<ProviderTurnResult> {
  if (request.providerId !== CODEX_PROVIDER_ID || request.parentSession.providerId !== CODEX_PROVIDER_ID || request.targetSession.providerId !== CODEX_PROVIDER_ID) {
    throw new Error("Codex Child close requires Codex parent and Child sessions.");
  }
  const projectGeneration = defaultProjectRemovalFence.capture(request.projectId);
  const result = await runCodexAppServerChildClose({
    projectId: request.projectId,
    conversationId: request.conversationId,
    changeId: request.changeId,
    runtimeScopeId: request.runtimeScopeId,
    roleId: request.roleId,
    runId: request.runId,
    cwd: request.cwd,
    sandboxPolicy: "read-only",
    paths: request.paths,
    parentThreadId: request.parentSession.sessionId,
    targetThreadId: request.targetSession.sessionId,
    targetDisplayName: request.targetDisplayName,
    timeoutMs: request.timeoutMs,
    onRealtimeEvent: request.onRealtimeEvent ? (event) => {
      if (!isProjectGenerationCurrent(request.projectId, projectGeneration)) return;
      const mapped = mapRealtime(request, event);
      if (mapped) request.onRealtimeEvent?.(mapped);
    } : undefined,
    onChildLifecycleEvent: request.onChildLifecycleEvent
      ? (event) => {
        if (isProjectGenerationCurrent(request.projectId, projectGeneration)) {
          request.onChildLifecycleEvent?.(mapChildLifecycle(event));
        }
      }
      : undefined,
    onError: guardedProjectNotification(request.projectId, projectGeneration, request.onError),
  });
  return {
    providerId: CODEX_PROVIDER_ID,
    status: result.status,
    session: request.targetSession,
    turnId: result.turnId,
    lastMessage: "",
    childThreads: [],
    changedFiles: [],
    ...(result.host ? { runtimeHost: result.host } : {}),
    error: result.error,
  };
}

function guardedProjectNotification<TArgs extends unknown[]>(
  projectId: string,
  generation: number,
  callback: ((...args: TArgs) => void) | undefined,
): ((...args: TArgs) => void) | undefined {
  if (!callback) return undefined;
  return (...args) => {
    if (!isProjectGenerationCurrent(projectId, generation)) return;
    callback(...args);
  };
}

function isProjectGenerationCurrent(projectId: string, generation: number): boolean {
  try {
    defaultProjectRemovalFence.assertCurrent(projectId, generation);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "Conflict") return false;
    throw error;
  }
}

function latestThreadTurnId(snapshot: Record<string, unknown>): string | null {
  const thread = snapshot.thread;
  if (!thread || typeof thread !== "object") return null;
  const turns = (thread as { turns?: unknown }).turns;
  if (!Array.isArray(turns)) return null;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn && typeof turn === "object" && typeof (turn as { id?: unknown }).id === "string") return (turn as { id: string }).id;
  }
  return null;
}

function activeCodexTurn(runtimeScopeId: string): ActiveProviderTurn | null {
  const active = getActiveCodexAppServerTurn(runtimeScopeId);
  if (!active) return null;
  return mapActiveCodexTurn(active);
}

function activeCodexTurns(): ActiveProviderTurn[] {
  return listActiveCodexAppServerTurns().map(mapActiveCodexTurn);
}

function mapActiveCodexTurn(active: ActiveCodexAppServerTurn): ActiveProviderTurn {
  return {
    providerId: CODEX_PROVIDER_ID,
    attemptId: activeAttemptByScope.get(active.runtimeScopeId) ?? active.runId,
    changeId: active.changeId,
    runtimeScopeId: active.runtimeScopeId,
    roleId: active.roleId,
    runId: active.runId,
    session: { providerId: CODEX_PROVIDER_ID, sessionId: active.threadId },
    turnId: active.turnId,
    startedAt: active.startedAt,
    steer: active.steer,
    interrupt: active.interrupt,
    respondToUserInput: (requestId, response, expected) => active.respondToUserInput(requestId, { answers: response.answers }, { runId: expected?.runId ?? active.runId, threadId: expected?.sessionId, turnId: expected?.turnId }),
  };
}

function mapRealtime(request: Pick<ProviderTurnRequest, "attemptId" | "graphScopeId">, event: CodexAppServerRealtimeEvent): ProviderRealtimeEvent | null {
  if (isCodexProtocolNoise(event)) return null;
  if (!event.threadId || !event.turnId) return null;
  const itemId = canonicalItemId(event);
  if (requiresCanonicalItem(event.streamEvent) && !itemId) return null;
  const targetThreadId = event.targetThreadId ?? null;
  return {
    ...event,
    providerId: CODEX_PROVIDER_ID,
    attemptId: request.attemptId,
    sessionId: event.threadId,
    turnId: event.turnId,
    ...(itemId ? { itemId } : {}),
    graphScopeId: request.graphScopeId,
    targetAgentSurfaceId: targetThreadId ? agentThreadSurfaceId(CODEX_PROVIDER_ID, targetThreadId) : undefined,
    streamEvent: canonicalStreamEvent(event.streamEvent, itemId),
  };
}

function canonicalStreamEvent(
  event: CodexAppServerRealtimeEvent["streamEvent"],
  itemId: string | undefined,
): ProviderRealtimeEvent["streamEvent"] {
  if (event.type === "tool_event") return { ...event, id: itemId! };
  if (event.type === "readable_event") return { ...event, event: { ...event.event, itemId: itemId! } };
  return event;
}

function requiresCanonicalItem(event: CodexAppServerRealtimeEvent["streamEvent"]): boolean {
  return event.type === "text_delta" || event.type === "tool_event" || event.type === "readable_event";
}

function canonicalItemId(event: CodexAppServerRealtimeEvent): string | undefined {
  if (event.streamEvent.type === "tool_event") return event.streamEvent.id ?? event.itemId;
  if (event.streamEvent.type === "readable_event") return event.streamEvent.event.itemId ?? event.itemId;
  return event.itemId;
}

function isCodexProtocolNoise(event: CodexAppServerRealtimeEvent): boolean {
  if (event.streamEvent.type !== "status") return false;
  const label = event.streamEvent.label.toLowerCase();
  return label.includes("codex thread started")
    || label.includes("codex initialized the thread")
    || label.includes("codex turn running")
    || label.includes("codex started processing the turn")
    || label.includes("codex turn completed")
    || label.includes("codex completed the turn");
}

function mapChild(child: import("../codex/app-server.js").CodexAppServerChildThreadResult): ProviderChildThreadResult {
  return {
    providerId: CODEX_PROVIDER_ID,
    ...(child.itemId ? { activityId: child.itemId } : {}),
    parentThreadId: child.parentThreadId,
    threadId: child.threadId,
    roleHint: child.roleHint,
    status: child.status,
    initialInput: child.initialUserItem,
    model: child.model,
    reasoningEffort: child.reasoningEffort,
    displayName: child.displayName,
    finalText: child.finalText,
    changedFiles: child.changedFiles,
  };
}

function mapChildLifecycle(event: import("../codex/collaboration-normalizer.js").CodexChildLifecycleEvent): ProviderChildLifecycleEvent {
  return {
    providerId: CODEX_PROVIDER_ID,
    kind: event.kind,
    activityId: event.activityId,
    parentSession: { providerId: CODEX_PROVIDER_ID, sessionId: event.parentThreadId },
    childSession: { providerId: CODEX_PROVIDER_ID, sessionId: event.childThreadId },
    turnId: event.turnId,
    roleHint: event.roleHint,
  };
}

function mapUserInput(request: ProviderTurnRequest, input: import("../codex/app-server.js").CodexAppServerUserInputRequest): ProviderUserInputRequest {
  return {
    ...input,
    providerId: CODEX_PROVIDER_ID,
    attemptId: request.attemptId,
    sessionId: input.threadId,
    questions: input.questions.map((question) => ({
      id: question.id,
      header: question.header,
      question: question.question,
      inputMode: question.isSecret ? "secret" : question.options?.length ? "single" : "text",
      allowCustom: question.isOther !== false,
      options: question.options?.map((option) => ({ value: option.label, label: option.label, description: option.description })),
    })),
  };
}

function mapObjective(goal: import("../codex/app-server.js").CodexAppServerThreadGoal): ProviderObjectiveState {
  return {
    providerId: CODEX_PROVIDER_ID,
    sessionId: goal.threadId,
    objective: goal.objective,
    status: objectiveStatus(goal.status),
    tokenBudget: goal.tokenBudget,
    tokensUsed: goal.tokensUsed,
    timeUsedSeconds: goal.timeUsedSeconds,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function objectiveStatus(status: CodexAppServerThreadGoalStatus): ProviderObjectiveState["status"] {
  if (status === "usageLimited") return "usage-limited";
  if (status === "budgetLimited") return "budget-limited";
  return status;
}
