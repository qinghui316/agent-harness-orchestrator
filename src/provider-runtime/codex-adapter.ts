import { getActiveCodexAppServerTurn, listActiveCodexAppServerTurns, runCodexAppServerTurn, type ActiveCodexAppServerTurn, type CodexAppServerThreadGoalStatus } from "../codex/app-server.js";
import type { CodexAppServerRealtimeEvent } from "../codex/app-server-realtime.js";
import { getCodexProviderCapabilitySnapshot, getCodexProviderRuntimeSummary } from "./codex.js";
import { executeCodexProjectAction, getCodexDiagnostics, listCodexProjectActions } from "./codex-diagnostics.js";
import { codexModelSettings, selectCodexModel } from "./codex-models.js";
import { bindCodexSkillCatalog, getCodexBridgeStatus, installCodexBridge, syncCodexBridge } from "../codex/bridge.js";
import type { ActiveProviderTurn, ProviderChildThreadResult, ProviderDescriptor, ProviderObjectiveState, ProviderRealtimeEvent, ProviderTurnRequest, ProviderTurnResult, ProviderUserInputRequest } from "./contracts.js";
import { agentThreadSurfaceId } from "./agent-surface-id.js";

export const CODEX_PROVIDER_ID = "codex" as const;
const activeAttemptByScope = new Map<string, string>();

export const codexProviderDescriptor: ProviderDescriptor = {
  id: CODEX_PROVIDER_ID,
  displayName: "Codex",
  capabilitySnapshot: getCodexProviderCapabilitySnapshot,
  runtimeSummary: getCodexProviderRuntimeSummary,
  models: { read: codexModelSettings, select: selectCodexModel },
  diagnostics: getCodexDiagnostics,
  projectActions: { list: listCodexProjectActions, execute: executeCodexProjectAction },
  skillRoleBinding: {
    status: getCodexBridgeStatus,
    install: installCodexBridge,
    sync: syncCodexBridge,
    bindCatalog: bindCodexSkillCatalog,
  },
  conversation: { runTurn: runCodexTurn, getActiveTurn: activeCodexTurn, listActiveTurns: activeCodexTurns },
  leafExecution: { runTurn: runCodexTurn },
};

export async function runCodexTurn(request: ProviderTurnRequest): Promise<ProviderTurnResult> {
  if (request.providerId !== CODEX_PROVIDER_ID) throw new Error(`Codex adapter cannot run provider ${request.providerId}`);
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
    timeoutMs: request.timeoutMs,
    onRealtimeEvent: request.onRealtimeEvent ? (event) => {
      const mapped = mapRealtime(request, event);
      if (mapped) request.onRealtimeEvent?.(mapped);
    } : undefined,
    onChildThreadResult: request.onChildThreadResult ? (child) => request.onChildThreadResult?.(mapChild(child)) : undefined,
    onUserInputRequest: request.onUserInputRequest ? (input) => request.onUserInputRequest?.(mapUserInput(request, input)) : undefined,
    onUserInputResolved: request.onUserInputResolved ? (input) => request.onUserInputResolved?.({
      providerId: CODEX_PROVIDER_ID,
      requestId: input.requestId,
      runtimeScopeId,
      runId: request.runId,
      attemptId: request.attemptId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }) : undefined,
    dynamicTools: request.tools,
    onDynamicToolCall: request.onToolCall ? async (call) => request.onToolCall?.({ ...call, providerId: CODEX_PROVIDER_ID }) as Promise<import("./contracts.js").ProviderToolResult> : undefined,
    onGoalUpdate: request.onObjectiveUpdate ? (goal) => request.onObjectiveUpdate?.(mapObjective(goal)) : undefined,
    goalSession: request.objectiveSession,
    goalResume: request.objectiveResume,
    onTextDelta: request.onTextDelta,
    onPlanDelta: request.onPlanDelta,
    onPlanUpdate: request.onPlanUpdate,
    onError: request.onError,
    model: request.model?.modelId,
    imageInputs: request.imageInputs,
    skillInputs: request.skillInputs,
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
    lastMessage: result.lastMessage,
    planText: result.planText,
    objective: result.goal ? mapObjective(result.goal) : result.goal,
    childThreads: result.childThreads.map(mapChild),
    changedFiles: result.changedFiles,
    error: result.error,
  };
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

function mapRealtime(request: ProviderTurnRequest, event: CodexAppServerRealtimeEvent): ProviderRealtimeEvent | null {
  if (isCodexProtocolNoise(event)) return null;
  const targetThreadId = event.targetThreadId ?? null;
  return {
    ...event,
    providerId: CODEX_PROVIDER_ID,
    attemptId: request.attemptId,
    sessionId: event.threadId,
    graphScopeId: request.graphScopeId,
    targetAgentSurfaceId: targetThreadId ? agentThreadSurfaceId(CODEX_PROVIDER_ID, targetThreadId) : undefined,
    streamEvent: event.streamEvent,
  };
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
  return { ...child, providerId: CODEX_PROVIDER_ID };
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
