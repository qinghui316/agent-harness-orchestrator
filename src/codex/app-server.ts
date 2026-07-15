import spawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { finished } from "node:stream/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { codexRuntimeConfigArgs } from "./capabilities.js";
import { resolveCodexExecutable } from "./executable.js";
import { executeProcessStreaming } from "../run/process.js";
import type { MemoryMode } from "../types/index.js";
import { normalizeCodexAppServerNotification, type CodexAppServerRealtimeEvent } from "./app-server-realtime.js";
import { readCodexNativeCollabConfigStatus, type CodexNativeCollabConfigStatus } from "./trust.js";
import { agentRoleDisplayName, composeAgentDisplayLabel } from "../agent-display-label.js";

export interface CodexAppServerCapabilities {
  available: boolean;
  supportsStdio: boolean;
  supportsRequiredLifecycle: boolean;
  nativeCollab: CodexNativeCollabConfigStatus;
  help: string | null;
  errors: string[];
}

export interface CodexAppServerArtifactPaths {
  events: string;
  stderr: string;
  lastMessage: string;
  session: string;
}

export interface CodexAppServerSessionRecord {
  version: "1.0";
  adapter: "codex-app-server";
  projectId: string;
  changeId?: string;
  runtimeScopeId: string;
  roleId: string;
  runId: string;
  threadId: string;
  activeTurnId: string | null;
  cwd: string;
  sandboxPolicy: "read-only" | "workspace-write";
  status: "started" | "running" | "completed" | "interrupted" | "failed";
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export type CodexAppServerNotificationHandler = (notification: CodexAppServerNotification) => void;

export interface CodexAppServerNotification {
  method: string;
  params: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface CodexAppServerCollabToolCall {
  itemId?: string;
  tool: string;
  status?: string;
  senderThreadId?: string;
  receiverThreadIds: string[];
  prompt?: string;
  model?: string;
  reasoningEffort?: string;
  agentsStates?: Record<string, unknown>;
}

export interface CodexAppServerUserInputOption {
  label: string;
  description?: string;
}

export interface CodexAppServerUserInputQuestion {
  id: string;
  header?: string;
  question: string;
  isOther?: boolean;
  isSecret?: boolean;
  options?: CodexAppServerUserInputOption[];
}

export interface CodexAppServerUserInputRequest {
  requestId: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  runId: string;
  changeId?: string;
  runtimeScopeId: string;
  roleId: string;
  questions: CodexAppServerUserInputQuestion[];
}

export interface CodexAppServerUserInputResponse {
  answers: Record<string, string | string[]>;
}

export interface CodexAppServerChildThreadResult {
  itemId?: string;
  tool: "spawn_agent";
  parentThreadId: string;
  threadId: string;
  status?: string;
  prompt?: string;
  model?: string;
  reasoningEffort?: string;
  displayName?: string;
  finalText: string;
  changedFiles: string[];
  snapshot: Record<string, unknown>;
}

export interface CodexAppServerDynamicToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CodexAppServerDynamicToolCall {
  requestId: string;
  threadId: string;
  turnId: string;
  callId: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface CodexAppServerDynamicToolResult {
  contentItems: Array<{ type: "inputText"; text: string }>;
  success: boolean;
  yieldAfterResponse?: boolean;
}

export interface CodexAppServerThreadGoal {
  threadId: string;
  objective: string;
  status: CodexAppServerThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export type CodexAppServerThreadGoalStatus = "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete";

export type CodexAppServerUserInputRequestHandler = (request: CodexAppServerUserInputRequest) => void;

export interface CodexAppServerTurnOptions {
  projectId: string;
  conversationId?: string;
  changeId?: string;
  runtimeScopeId?: string;
  roleId: string;
  agentTaskId?: string;
  runId: string;
  cwd: string;
  prompt: string;
  sandboxPolicy: "read-only" | "workspace-write";
  paths: CodexAppServerArtifactPaths;
  existingThreadId?: string | null;
  timeoutMs?: number;
  onNotification?: CodexAppServerNotificationHandler;
  onRealtimeEvent?: (event: CodexAppServerRealtimeEvent) => void;
  onChildThreadResult?: (result: CodexAppServerChildThreadResult) => void;
  onUserInputRequest?: CodexAppServerUserInputRequestHandler;
  dynamicTools?: CodexAppServerDynamicToolSpec[];
  onDynamicToolCall?: (call: CodexAppServerDynamicToolCall) => Promise<CodexAppServerDynamicToolResult>;
  onGoalUpdate?: (goal: CodexAppServerThreadGoal) => void;
  goalSession?: boolean;
  goalResume?: { deliveryKey: string; contextText: string };
  onTextDelta?: (text: string) => void;
  onPlanDelta?: (text: string) => void;
  onPlanUpdate?: (text: string, params: Record<string, unknown>) => void;
  onError?: (error: unknown) => void;
  model?: string | null;
  imageInputs?: Array<{ path: string; mediaType?: string; fileName?: string }>;
  skillInputs?: Array<{ name: string; path: string }>;
  nativeSkillRoots?: string[];
  requiredNativeSkills?: string[];
  runtimeWorkspaceRoots?: string[];
  additionalContext?: Record<string, { kind: "untrusted" | "application"; value: string }>;
  writableRoots?: string[];
  developerInstructions?: string;
  outputSchema?: Record<string, unknown>;
}

export interface CodexAppServerTurnResult {
  status: "completed" | "interrupted" | "failed";
  threadId: string | null;
  turnId: string | null;
  lastMessage: string;
  planText?: string;
  goal?: CodexAppServerThreadGoal | null;
  childThreads: CodexAppServerChildThreadResult[];
  changedFiles: string[];
  error?: string;
}

export interface ActiveCodexAppServerTurn {
  changeId?: string;
  runtimeScopeId: string;
  roleId: string;
  runId: string;
  threadId: string;
  turnId: string;
  startedAt: string;
  steer(input: string): Promise<void>;
  interrupt(reason?: string): Promise<void>;
  respondToUserInput(
    requestId: string,
    response: CodexAppServerUserInputResponse,
    expected?: { runId: string; threadId?: string; turnId?: string },
  ): Promise<void>;
}

const activeTurns = new Map<string, ActiveCodexAppServerTurn>();
const activeSessionScopes = new Set<string>();

export function evaluateCodexAppServerCapabilities(help: string | null, spawnError?: string, nativeCollab: CodexNativeCollabConfigStatus = defaultNativeCollabStatus()): CodexAppServerCapabilities {
  const errors: string[] = [];
  if (spawnError) errors.push(spawnError);
  const supportsStdio = Boolean(help?.includes("stdio://") && help.includes("--listen"));
  const supportsRequiredLifecycle = Boolean(help && help.includes("app server"));
  if (!help) errors.push("Codex app-server help is unavailable.");
  if (!supportsStdio) errors.push("Codex app-server does not advertise stdio transport.");
  return {
    available: errors.length === 0,
    supportsStdio,
    supportsRequiredLifecycle,
    nativeCollab,
    help,
    errors,
  };
}

export function shouldUseCodexAppServerForMemory(memoryMode: MemoryMode): boolean {
  return memoryMode !== "external-local";
}

export function shouldUseCodexAppServerForReadOnlyTurn(_memoryMode: MemoryMode): boolean {
  return true;
}

export function extractCodexAppServerPlanText(method: string, params: Record<string, unknown>): string {
  if (method === "item/plan/delta" && typeof params.delta === "string") return params.delta;
  if (method === "item/completed" && isPlanItem(params)) return extractCompletedText(params);
  return "";
}

export function extractCodexAppServerCollabToolCall(method: string, params: Record<string, unknown>): CodexAppServerCollabToolCall | null {
  if (!method.startsWith("item/") && !method.startsWith("turn/")) return null;
  const item = isRecord(params.item) ? params.item : params;
  const type = stringValue(item.type ?? item.kind ?? item.itemType);
  if (type !== "collabToolCall" && type !== "collabAgentToolCall") return null;
  const tool = stringValue(item.tool ?? item.name);
  if (!tool) return null;
  const receiverThreadIds = [
    ...stringList(item.receiverThreadId ?? item.receiver_thread_id),
    ...stringList(item.receiverThreadIds ?? item.receiver_thread_ids),
    ...stringList(item.newThreadId ?? item.new_thread_id),
  ];
  return {
    itemId: stringValue(item.id),
    tool,
    status: stringValue(item.status),
    senderThreadId: stringValue(item.senderThreadId ?? item.sender_thread_id),
    receiverThreadIds: [...new Set(receiverThreadIds)],
    prompt: stringValue(item.prompt),
    model: stringValue(item.model),
    reasoningEffort: stringValue(item.reasoningEffort ?? item.reasoning_effort),
    agentsStates: isRecord(item.agentsStates) ? item.agentsStates : isRecord(item.agents_states) ? item.agents_states : undefined,
  };
}

export async function detectCodexAppServerCapability(): Promise<CodexAppServerCapabilities> {
  let help: string | null = null;
  let spawnError: string | undefined;
  const nativeCollab = await readCodexNativeCollabConfigStatus();
  try {
    help = await captureCodexAppServerHelp();
    const startupError = await captureCodexAppServerStartupError();
    if (startupError) spawnError = startupError;
  } catch (error) {
    spawnError = `Failed to inspect Codex app-server: ${(error as Error).message}`;
  }
  return evaluateCodexAppServerCapabilities(help, spawnError, nativeCollab);
}

export function getActiveCodexAppServerTurn(scopeId: string): ActiveCodexAppServerTurn | null {
  return activeTurns.get(scopeId) ?? null;
}

export function listActiveCodexAppServerTurns(): ActiveCodexAppServerTurn[] {
  return [...new Map([...activeTurns.values()].map((turn) => [`${turn.runtimeScopeId}:${turn.runId}:${turn.turnId}`, turn])).values()];
}

export async function respondToCodexAppServerUserInput(
  scopeId: string,
  requestId: string,
  response: CodexAppServerUserInputResponse,
  expected?: { runId: string; threadId?: string; turnId?: string },
): Promise<void> {
  const turn = getActiveCodexAppServerTurn(scopeId);
  if (!turn) throw new Error("No active Codex app-server turn is waiting for user input.");
  if (expected && turn.runId !== expected.runId) {
    throw new Error("The active Codex app-server turn does not match the persisted user input request.");
  }
  await turn.respondToUserInput(requestId, response, expected);
}

export async function runCodexAppServerTurn(options: CodexAppServerTurnOptions): Promise<CodexAppServerTurnResult> {
  const runtimeScopeId = options.runtimeScopeId ?? options.changeId;
  if (!runtimeScopeId) throw new Error("Codex app-server turn requires a runtimeScopeId or changeId.");
  const activeScopeId: string = runtimeScopeId;
  const activeSessionKey = options.existingThreadId ? `thread:${options.existingThreadId}` : `scope:${activeScopeId}`;
  if (activeSessionScopes.has(activeSessionKey)) throw new Error(`Codex app-server session is already active for ${activeSessionKey}.`);
  activeSessionScopes.add(activeSessionKey);
  try {
    await Promise.all([
      prepareLogFile(options.paths.events),
      prepareLogFile(options.paths.stderr),
      prepareLogFile(options.paths.lastMessage),
      prepareLogFile(options.paths.session),
    ]);
  } catch (error) {
    activeSessionScopes.delete(activeSessionKey);
    throw error;
  }

  const eventStream = createWriteStream(options.paths.events, { flags: "a", encoding: "utf8" });
  const stderrStream = createWriteStream(options.paths.stderr, { flags: "a", encoding: "utf8" });
  let child: ChildProcess | null = null;
  let lineBuffer = "";
  let requestId = 1;
  let threadId: string | null = options.existingThreadId ?? null;
  let turnId: string | null = null;
  let lastMessage = "";
  let planText = "";
  let goal: CodexAppServerThreadGoal | null = null;
  let pendingYieldCallId: string | null = null;
  let goalPauseRequested = false;
  let goalPausePromise: Promise<void> | null = null;
  let waitingGoalAttachPending = false;
  let activeTurnRunning = false;
  let acceptingTurnEvents = false;
  const childThreads: CodexAppServerChildThreadResult[] = [];
  const childThreadDisplayNames = new Map<string, string>();
  const changedFiles = new Set<string>();
  const childThreadParents = new Map<string, string>();
  const childThreadRoles = new Map<string, string>();
  const subAgentThreadItems = new Map<string, string>();
  const pendingChildReads = new Set<Promise<void>>();
  const readChildThreadIds = new Set<string>();
  let terminalStatus: CodexAppServerTurnResult["status"] | null = null;
  let terminalError: string | undefined;
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  const pendingServerRequests = new Map<string, {
    id: number;
    method: string;
    runId: string;
    threadId?: string;
    turnId?: string;
  }>();

  const writeSession = async (status: CodexAppServerSessionRecord["status"], error?: string): Promise<void> => {
    if (!threadId) return;
    const record: CodexAppServerSessionRecord = {
      version: "1.0",
      adapter: "codex-app-server",
      projectId: options.projectId,
      ...(options.changeId ? { changeId: options.changeId } : {}),
      runtimeScopeId: activeScopeId,
      roleId: options.roleId,
      runId: options.runId,
      threadId,
      activeTurnId: turnId,
      cwd: options.cwd,
      sandboxPolicy: options.sandboxPolicy,
      status,
      startedAt,
      updatedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    };
    await writeFile(options.paths.session, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  };

  const startedAt = new Date().toISOString();
  try {
    child = spawn(resolveCodexExecutable(), [...codexRuntimeConfigArgs(), "app-server", "--listen", "stdio://"], {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrStream.write(chunk.toString("utf8"));
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      lineBuffer += chunk.toString("utf8");
      drainLines();
    });
    child.on("error", (error: Error) => {
      terminalError = error.message;
      rejectAll(error);
    });
    child.on("close", (code: number | null) => {
      if (code !== 0 && terminalStatus !== "completed" && terminalStatus !== "interrupted") {
        terminalError = terminalError ?? `Codex app-server exited with ${code}.`;
      }
      rejectAll(new Error(terminalError ?? "Codex app-server closed."));
    });

    await sendRequest("initialize", {
      capabilities: { experimentalApi: true },
      clientInfo: { name: "agent-harness-orchestrator", title: "Agent Harness Orchestrator", version: "0.1.0" },
    });
    sendNotification("initialized", {});
    if (options.nativeSkillRoots?.length) await configureNativeSkills();
    if (options.goalResume && !threadId) throw new Error("Goal resume requires an existing provider thread id.");
    const goalBeforeSession = options.goalSession && threadId
      ? parseThreadGoalResponse(await sendRequest("thread/goal/get", { threadId }))
      : null;
    const activeGoalAlreadyRunning = Boolean(options.goalResume && goalBeforeSession?.status === "active");
    waitingGoalAttachPending = goalBeforeSession ? isResumableGoalStatus(goalBeforeSession.status) : false;
    if (options.goalResume && !goalBeforeSession) throw new Error("Goal resume requires an existing native Goal.");
    if (goalBeforeSession && isFinalGoalStatus(goalBeforeSession.status)) {
      goal = goalBeforeSession;
      terminalStatus = "completed";
    }
    if (goalBeforeSession?.status === "active") acceptingTurnEvents = true;
    const threadResponse = terminalStatus
      ? null
      : threadId
        ? await sendRequest("thread/resume", {
          threadId,
          cwd: options.cwd,
          sandbox: options.sandboxPolicy,
          approvalPolicy: "never",
          ...(options.runtimeWorkspaceRoots?.length ? { runtimeWorkspaceRoots: options.runtimeWorkspaceRoots } : {}),
        })
        : await sendRequest("thread/start", {
          cwd: options.cwd,
          sandbox: options.sandboxPolicy,
          approvalPolicy: "never",
          ...(options.runtimeWorkspaceRoots?.length ? { runtimeWorkspaceRoots: options.runtimeWorkspaceRoots } : {}),
          ...(options.developerInstructions?.trim() ? { developerInstructions: options.developerInstructions.trim() } : {}),
          ...(options.dynamicTools?.length ? { dynamicTools: options.dynamicTools } : {}),
        });
    threadId = threadResponse ? extractThreadId(threadResponse) ?? threadId : threadId;
    if (!threadId) throw new Error("Codex app-server did not return a thread id.");
    if (activeGoalAlreadyRunning && goalBeforeSession) {
      goal = goalBeforeSession;
      terminalStatus = "completed";
    }
    await writeSession("started");

    const installActiveTurn = (): void => {
      if (!threadId || !turnId) throw new Error("Cannot expose a Codex turn before thread and turn ids are known.");
      const activeThreadId = threadId;
      const activeTurnId = turnId;
      activeTurns.set(activeScopeId, {
        ...(options.changeId ? { changeId: options.changeId } : {}),
        runtimeScopeId: activeScopeId,
        roleId: options.roleId,
        runId: options.runId,
        threadId: activeThreadId,
        turnId: activeTurnId,
        startedAt,
        steer: async (input: string) => {
          await sendRequest("turn/steer", { threadId: activeThreadId, expectedTurnId: activeTurnId, input: [userTextInput(input)] });
        },
        interrupt: async (reason?: string) => {
          void reason;
          if (options.goalSession) {
            await requestNativeGoalPause(activeThreadId, activeTurnId);
          } else {
            await sendRequest("turn/interrupt", { threadId: activeThreadId, turnId: activeTurnId });
          }
        },
        respondToUserInput: async (requestId: string, response: CodexAppServerUserInputResponse, expected) => {
          await sendServerRequestResult(requestId, normalizeUserInputResponse(response), expected);
        },
      });
    };

    const waitingGoalContinuation = goalBeforeSession && isResumableGoalStatus(goalBeforeSession.status) ? options.goalResume ?? null : null;
    if (waitingGoalContinuation && goalBeforeSession && !terminalStatus) {
      const deliveryKey = createHash("sha256")
        .update([threadId, goalBeforeSession.createdAt, goalBeforeSession.objective, waitingGoalContinuation.deliveryKey].join("\n"))
        .digest("hex");
      const threadSnapshot = await sendRequest("thread/read", { threadId, includeTurns: true });
      if (!JSON.stringify(threadSnapshot).includes(deliveryKey)) {
        await sendRequest("thread/inject_items", {
          threadId,
          items: [{
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: `[AHO resume ${deliveryKey}]\n${waitingGoalContinuation.contextText}` }],
          }],
        });
      }
      acceptingTurnEvents = true;
      const activation = parseThreadGoalResponse(await sendRequest("thread/goal/set", { threadId, status: "active" }));
      if (activation) goal = activation;
      waitingGoalAttachPending = false;
    } else if ((!goalBeforeSession || isResumableGoalStatus(goalBeforeSession.status)) && !terminalStatus) {
      const turnModel = options.model?.trim() || null;
      acceptingTurnEvents = true;
      const turnResponse = await sendRequest("turn/start", {
        threadId,
        input: [userTextInput(options.prompt), ...skillInputs(options.skillInputs), ...imageInputs(options.imageInputs)],
        cwd: options.cwd,
        sandboxPolicy: sandboxPolicyFor(options.sandboxPolicy, options.cwd, options.writableRoots),
        approvalPolicy: "never",
        ...(options.runtimeWorkspaceRoots?.length ? { runtimeWorkspaceRoots: options.runtimeWorkspaceRoots } : {}),
        ...(options.additionalContext ? { additionalContext: options.additionalContext } : {}),
        ...(turnModel ? { model: turnModel } : {}),
        ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
      });
      turnId = extractTurnId(turnResponse);
      if (!turnId) throw new Error("Codex app-server did not return a turn id.");
      waitingGoalAttachPending = false;
      activeTurnRunning = true;
      installActiveTurn();
      await writeSession("running");
    }

    if (!terminalStatus) await waitForTerminal(options.timeoutMs ?? 15 * 60 * 1000);
    if (pendingChildReads.size > 0) await Promise.all([...pendingChildReads]);
    if (options.goalSession && threadId && !goal) {
      goal = parseThreadGoalResponse(await sendRequest("thread/goal/get", { threadId }));
    }
    await writeFile(options.paths.lastMessage, lastMessage, "utf8");
    const finalStatus = terminalStatus ?? "failed";
    await writeSession(finalStatus);
    return { status: finalStatus, threadId, turnId, lastMessage, planText, goal, childThreads, changedFiles: [...changedFiles] };
  } catch (error) {
    terminalStatus = "failed";
    terminalError = error instanceof Error ? error.message : String(error);
    options.onError?.(error);
    await writeFile(options.paths.lastMessage, lastMessage || terminalError, "utf8");
    await writeSession("failed", terminalError).catch(() => undefined);
    return { status: "failed", threadId, turnId, lastMessage, planText, goal, childThreads, changedFiles: [...changedFiles], error: terminalError };
  } finally {
    activeTurns.delete(activeScopeId);
    activeSessionScopes.delete(activeSessionKey);
    for (const [, item] of pending) item.reject(new Error("Codex app-server turn finished."));
    pending.clear();
    try {
      child?.kill();
    } catch {
      // Best-effort cleanup.
    }
    eventStream.end();
    stderrStream.end();
    await Promise.all([finished(eventStream), finished(stderrStream)]).catch(() => undefined);
  }

  function sendRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!child?.stdin?.writable) return Promise.reject(new Error("Codex app-server stdin is not writable."));
    const id = requestId++;
    const payload = { id, method, params };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }

  function sendNotification(method: string, params: Record<string, unknown>): void {
    if (!child?.stdin?.writable) return;
    child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  async function sendServerRequestResult(
    requestId: string,
    result: Record<string, unknown>,
    expected?: { runId: string; threadId?: string; turnId?: string },
  ): Promise<void> {
    const request = pendingServerRequests.get(requestId);
    if (!request) throw new Error("Codex app-server user input request is no longer pending.");
    if (expected && (
      request.runId !== expected.runId
      || (expected.threadId && request.threadId !== expected.threadId)
      || (expected.turnId && request.turnId !== expected.turnId)
    )) {
      throw new Error("The pending Codex app-server user input request does not match the persisted request identity.");
    }
    const stdin = child?.stdin;
    if (!stdin?.writable) throw new Error("Codex app-server stdin is not writable.");
    await new Promise<void>((resolve, reject) => {
      stdin.write(`${JSON.stringify({ id: request.id, result })}\n`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    pendingServerRequests.delete(requestId);
  }

  function drainLines(): void {
    for (;;) {
      const index = lineBuffer.indexOf("\n");
      if (index < 0) return;
      const line = lineBuffer.slice(0, index).trim();
      lineBuffer = lineBuffer.slice(index + 1);
      if (line) handleLine(line);
    }
  }

  function handleLine(line: string): void {
    eventStream.write(`${line}\n`);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof payload.id === "number" && pending.has(payload.id)) {
      const handler = pending.get(payload.id);
      pending.delete(payload.id);
      if (isRecord(payload.error)) handler?.reject(new Error(JSON.stringify(payload.error)));
      else handler?.resolve(isRecord(payload.result) ? payload.result : payload);
      return;
    }
    if (typeof payload.id === "number" && typeof payload.method === "string") {
      if (handleServerRequest(payload.id, payload.method, isRecord(payload.params) ? payload.params : {}, payload)) return;
    }
    if (typeof payload.method === "string") handleNotification(payload.method, isRecord(payload.params) ? payload.params : {}, payload);
  }

  function handleServerRequest(id: number, method: string, params: Record<string, unknown>, raw: Record<string, unknown>): boolean {
    if (method === "item/tool/call") {
      options.onNotification?.({ method, params, raw });
      emitRealtime(method, params);
      const requestId = String(id);
      const call = parseDynamicToolCall(requestId, params, threadId, turnId);
      if (!call || !options.onDynamicToolCall) {
        sendRawServerRequestResult(id, {
          contentItems: [{ type: "inputText", text: "Unsupported AHO dynamic tool call." }],
          success: false,
        });
        return true;
      }
      void options.onDynamicToolCall(call).then((result) => {
        if (result.yieldAfterResponse) pendingYieldCallId = call.callId;
        sendRawServerRequestResult(id, { contentItems: result.contentItems, success: result.success });
      }).catch((error: unknown) => {
        sendRawServerRequestResult(id, {
          contentItems: [{ type: "inputText", text: error instanceof Error ? error.message : String(error) }],
          success: false,
        });
      });
      return true;
    }
    if (method !== "item/tool/requestUserInput") {
      handleNotification(method, params, raw);
      return true;
    }
    options.onNotification?.({ method, params, raw });
    emitRealtime(method, params);
    if (params.completed === true) return true;
    const requestId = String(id);
    const requestThreadId = typeof params.threadId === "string" ? params.threadId : typeof params.thread_id === "string" ? params.thread_id : threadId ?? undefined;
    const requestTurnId = typeof params.turnId === "string" ? params.turnId : typeof params.turn_id === "string" ? params.turn_id : turnId ?? undefined;
    pendingServerRequests.set(requestId, { id, method, runId: options.runId, threadId: requestThreadId, turnId: requestTurnId });
    const questions = parseUserInputQuestions(params.questions);
    const requestRoleId = requestThreadId && requestThreadId !== threadId
      ? childThreadRoles.get(requestThreadId) ?? "child-agent"
      : options.roleId;
    const request: CodexAppServerUserInputRequest = {
      requestId,
      threadId: requestThreadId,
      turnId: requestTurnId,
      itemId: typeof params.itemId === "string" ? params.itemId : typeof params.item_id === "string" ? params.item_id : undefined,
      runId: options.runId,
      ...(options.changeId ? { changeId: options.changeId } : {}),
      runtimeScopeId: activeScopeId,
      roleId: requestRoleId,
      questions,
    };
    options.onUserInputRequest?.(request);
    return true;
  }

  function handleNotification(method: string, params: Record<string, unknown>, raw: Record<string, unknown>): void {
    const notification = { method, params, raw };
    const notificationThreadId = stringValue(params.threadId ?? params.thread_id);
    const isParentNotification = !notificationThreadId || !threadId || notificationThreadId === threadId;
    if (isParentNotification) options.onNotification?.(notification);
    if (!acceptsCurrentTurnNotification(method, params, notificationThreadId)) return;
    if (isParentNotification) for (const path of extractFileChangePaths(params)) changedFiles.add(path);
    const collab = extractCodexAppServerCollabToolCall(method, params);
    if (collab?.tool === "spawn_agent") {
      for (const childThreadId of collab.receiverThreadIds) {
        childThreadParents.set(childThreadId, collab.senderThreadId ?? notificationThreadId ?? threadId ?? "");
        childThreadRoles.set(childThreadId, "child-agent");
        if (isTerminalCollabStatus(collab.status)) queueChildThreadRead(collab, childThreadId);
      }
    }
    emitRealtime(method, params);
    const subAgent = extractSubAgentActivity(method, params);
    if (subAgent) {
      subAgentThreadItems.set(subAgent.threadId, subAgent.itemId);
      childThreadParents.set(subAgent.threadId, notificationThreadId ?? threadId ?? "");
      childThreadRoles.set(subAgent.threadId, "child-agent");
    }
    if (method === "turn/completed" && notificationThreadId && subAgentThreadItems.has(notificationThreadId)) {
      queueChildThreadRead({
        itemId: subAgentThreadItems.get(notificationThreadId),
        tool: "spawn_agent",
        status: completionStatus(params) ?? undefined,
        senderThreadId: threadId ?? undefined,
        receiverThreadIds: [notificationThreadId],
      }, notificationThreadId);
      return;
    }
    const text = isParentNotification ? extractTextDelta(method, params) : "";
    if (text) {
      lastMessage += text;
      options.onTextDelta?.(text);
    }
    const planEventText = extractCodexAppServerPlanText(method, params);
    if (isParentNotification && method === "item/plan/delta" && planEventText) {
      planText += planEventText;
      options.onPlanDelta?.(planEventText);
    }
    if (isParentNotification && method === "turn/plan/updated" && planEventText) {
      planText = planEventText;
      options.onPlanUpdate?.(planEventText, params);
    }
    if (isParentNotification && method === "turn/started") {
      const nextTurnId = stringValue((isRecord(params.turn) ? params.turn.id : undefined) ?? params.turnId);
      if (nextTurnId) {
        turnId = nextTurnId;
        activeTurnRunning = true;
        activeTurns.set(activeScopeId, {
          ...(options.changeId ? { changeId: options.changeId } : {}),
          runtimeScopeId: activeScopeId,
          roleId: options.roleId,
          runId: options.runId,
          threadId: threadId ?? "",
          turnId,
          startedAt,
          steer: async (input: string) => sendRequest("turn/steer", { threadId, expectedTurnId: turnId, input: [userTextInput(input)] }).then(() => undefined),
          interrupt: async () => {
            if (options.goalSession) {
              await requestNativeGoalPause(threadId ?? "", turnId ?? "");
            } else {
              await sendRequest("turn/interrupt", { threadId, turnId });
            }
          },
          respondToUserInput: async (requestId: string, response: CodexAppServerUserInputResponse, expected) => sendServerRequestResult(requestId, normalizeUserInputResponse(response), expected),
        });
        void writeSession("running");
        if (goalPauseRequested && threadId) {
          void sendRequest("turn/interrupt", { threadId, turnId: nextTurnId }).catch(() => undefined);
        }
      }
    }
    if (isParentNotification && method === "thread/goal/updated") {
      let parsed: CodexAppServerThreadGoal | null = null;
      try {
        parsed = parseThreadGoal(isRecord(params.goal) ? params.goal : params);
      } catch (error) {
        terminalError = error instanceof Error ? error.message : String(error);
        options.onError?.(error);
      }
      if (parsed) {
        goal = parsed;
        options.onGoalUpdate?.(parsed);
        if (parsed.status === "paused" && !waitingGoalAttachPending && (!goalPauseRequested || !activeTurnRunning)) terminalStatus = "interrupted";
        if (parsed.status === "blocked" && !waitingGoalAttachPending && !activeTurnRunning) terminalStatus = "completed";
        if (isFinalGoalStatus(parsed.status)) terminalStatus = "completed";
      }
    }
    if (isParentNotification && method === "turn/completed") {
      activeTurnRunning = false;
      const interrupted = completionStatus(params) === "interrupted";
      const waitingForGoalPause = goalPauseRequested && goal?.status !== "paused";
      if (!waitingForGoalPause && (!options.goalSession || interrupted || !goal || isTurnTerminalGoalStatus(goal.status))) {
        terminalStatus = interrupted ? "interrupted" : "completed";
      }
    } else if (isParentNotification && method === "turn/failed") {
      activeTurnRunning = false;
      terminalStatus = "failed";
      terminalError = JSON.stringify(params);
    } else if (isParentNotification && method === "item/completed") {
      if (pendingYieldCallId && dynamicToolItemMatches(params, pendingYieldCallId) && !goalPauseRequested) {
        const activeTurnId = turnId;
        if (threadId && activeTurnId) {
          const activeThreadId = threadId;
          void requestNativeGoalPause(activeThreadId, activeTurnId).catch((error: unknown) => {
            terminalError = error instanceof Error ? error.message : String(error);
          });
        }
      }
      const finalText = extractCompletedText(params);
      if (isAssistantMessageItem(params) && finalText && !lastMessage.includes(finalText)) lastMessage += finalText;
      if (isPlanItem(params) && finalText) {
        planText = finalText;
        options.onPlanUpdate?.(finalText, params);
      }
    }
  }

  async function waitForTerminal(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (!terminalStatus && !terminalError) {
      if (Date.now() - start > timeoutMs) throw new Error("Codex app-server turn timed out.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (terminalError) throw new Error(terminalError);
  }

  function rejectAll(error: Error): void {
    for (const [, item] of pending) item.reject(error);
    pending.clear();
  }

  function acceptsCurrentTurnNotification(
    method: string,
    params: Record<string, unknown>,
    notificationThreadId: string | undefined,
  ): boolean {
    if (method === "thread/goal/updated") return true;
    if (!acceptingTurnEvents) return false;
    const isParentNotification = !notificationThreadId || !threadId || notificationThreadId === threadId;
    if (!isParentNotification) return true;
    const notificationTurnId = stringValue(params.turnId ?? params.turn_id)
      ?? stringValue(isRecord(params.turn) ? params.turn.id : undefined);
    if (method === "turn/started") return !turnId || !notificationTurnId || notificationTurnId === turnId;
    if (turnId && notificationTurnId && notificationTurnId !== turnId) return false;
    return Boolean(turnId || notificationTurnId);
  }

  function emitRealtime(method: string, params: Record<string, unknown>): void {
    if (!options.onRealtimeEvent) return;
    const eventThreadId = stringValue(params.threadId ?? params.thread_id) ?? threadId ?? `run:${options.runId}`;
    const eventTurnId = stringValue(params.turnId ?? params.turn_id)
      ?? stringValue((isRecord(params.turn) ? params.turn.id : undefined))
      ?? (eventThreadId === threadId ? turnId ?? undefined : undefined);
    const eventItem = isRecord(params.item) ? params.item : params;
    const eventItemId = stringValue(eventItem.id ?? params.itemId ?? params.item_id);
    const isMainThread = !threadId || eventThreadId === threadId;
    const roleId = isMainThread ? options.roleId : childThreadRoles.get(eventThreadId) ?? "child-agent";
    const providerDisplayName = stringValue(params.agentNickname ?? params.agent_nickname ?? params.agentDisplayName ?? params.agent_display_name)
      ?? stringValue((isRecord(params.thread)
        ? params.thread.agentNickname ?? params.thread.agent_nickname ?? params.thread.displayName ?? params.thread.display_name
        : undefined));
    if (!isMainThread && providerDisplayName) childThreadDisplayNames.set(eventThreadId, providerDisplayName);
    const parentThreadId = isMainThread
      ? undefined
      : stringValue(params.parentThreadId ?? params.parent_thread_id) ?? childThreadParents.get(eventThreadId) ?? threadId ?? undefined;
    const receiverThreadId = firstString(eventItem.receiverThreadIds ?? eventItem.receiver_thread_ids ?? eventItem.agentThreadId ?? eventItem.agent_thread_id);
    const targetRoleId = receiverThreadId ? childThreadRoles.get(receiverThreadId) : undefined;
    for (const realtimeEvent of normalizeCodexAppServerNotification(method, params, {
      projectId: options.projectId,
      ...(options.conversationId ? { conversationId: options.conversationId } : {}),
      ...(options.changeId ? { changeId: options.changeId } : {}),
      runId: options.runId,
      threadId: eventThreadId,
      ...(parentThreadId ? { parentThreadId } : {}),
      ...(eventTurnId ? { turnId: eventTurnId } : {}),
      ...(eventItemId ? { itemId: eventItemId } : {}),
      roleId,
      ...(options.agentTaskId ? { agentTaskId: options.agentTaskId } : {}),
      displayName: providerDisplayName ?? childThreadDisplayNames.get(eventThreadId) ?? agentRoleDisplayName(roleId),
      ...(receiverThreadId ? {
        targetThreadId: receiverThreadId,
        targetAgentDisplayName: composeAgentDisplayLabel(targetRoleId ?? "child-agent", childThreadDisplayNames.get(receiverThreadId)),
      } : {}),
    })) options.onRealtimeEvent(realtimeEvent);
  }

  async function configureNativeSkills(): Promise<void> {
    const roots = [...new Set((options.nativeSkillRoots ?? []).map((root) => root.trim()).filter(Boolean))];
    if (roots.length === 0) return;
    const required = [...new Set([
      ...(options.requiredNativeSkills ?? []),
      ...(options.skillInputs ?? []).map((skill) => skill.name),
    ].map((name) => name.trim()).filter(Boolean))];
    try {
      await sendRequest("skills/extraRoots/set", { extraRoots: roots });
      const listed = await sendRequest("skills/list", { cwds: [options.cwd], forceReload: true });
      const discovered = new Set<string>();
      const entries = Array.isArray(listed.data) ? listed.data : [];
      for (const entry of entries) {
        if (!isRecord(entry) || !Array.isArray(entry.skills)) continue;
        for (const skill of entry.skills) {
          if (isRecord(skill) && typeof skill.name === "string" && skill.name.trim()) discovered.add(skill.name.trim());
        }
      }
      const missing = required.filter((name) => !discovered.has(name));
      if (missing.length > 0) throw new Error(`未发现需要的 Skill：${missing.join("、")}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Codex 原生 Skill 不可用：${detail}`);
    }
  }

  function queueChildThreadRead(call: CodexAppServerCollabToolCall, childThreadId: string): void {
    if (!threadId || readChildThreadIds.has(childThreadId)) return;
    readChildThreadIds.add(childThreadId);
    const parentThreadId = threadId;
    const read = sendRequest("thread/read", { threadId: childThreadId, includeTurns: true }).then((snapshot) => {
      const result: CodexAppServerChildThreadResult = {
        ...(call.itemId ? { itemId: call.itemId } : {}),
        tool: "spawn_agent",
        parentThreadId,
        threadId: childThreadId,
        ...(call.status ? { status: call.status } : {}),
        ...((call.prompt || extractCodexAppServerThreadInitialPrompt(snapshot))
          ? { prompt: call.prompt || extractCodexAppServerThreadInitialPrompt(snapshot) }
          : {}),
        ...(call.model ? { model: call.model } : {}),
        ...(call.reasoningEffort ? { reasoningEffort: call.reasoningEffort } : {}),
        displayName: extractCodexAppServerThreadDisplayName(snapshot)
          ?? childThreadDisplayNames.get(childThreadId)
          ?? agentRoleDisplayName(childThreadRoles.get(childThreadId) ?? "child-agent"),
        finalText: extractCodexAppServerThreadFinalText(snapshot),
        changedFiles: extractFileChangePaths(snapshot),
        snapshot,
      };
      childThreads.push(result);
      options.onChildThreadResult?.(result);
    }).finally(() => pendingChildReads.delete(read));
    pendingChildReads.add(read);
  }

  function requestNativeGoalPause(activeThreadId: string, activeTurnId: string): Promise<void> {
    if (!activeThreadId || !activeTurnId) return Promise.reject(new Error("Codex native Goal pause requires an active provider turn."));
    if (goalPausePromise) return goalPausePromise;
    goalPauseRequested = true;
    goalPausePromise = (async () => {
      const beforeInterrupt = parseThreadGoalResponse(await sendRequest("thread/goal/get", { threadId: activeThreadId }));
      if (!beforeInterrupt) {
        goalPauseRequested = false;
        throw new Error("Codex native Goal yield requires an existing Goal on the provider thread.");
      }
      goal = beforeInterrupt;
      try {
        await sendRequest("turn/interrupt", { threadId: activeThreadId, turnId: activeTurnId });
      } catch {
        // A turn that already ended still requires a confirmed Goal pause.
      }
      await waitForGoalTurnTerminal();
      const current = parseThreadGoalResponse(await sendRequest("thread/goal/get", { threadId: activeThreadId }));
      if (current?.status === "paused") {
        goal = current;
        terminalStatus = "interrupted";
        return;
      }
      const paused = parseThreadGoalResponse(await sendRequest("thread/goal/set", { threadId: activeThreadId, status: "paused" }));
      if (!paused || paused.status !== "paused") throw new Error("Codex native Goal did not confirm paused after interrupt.");
      goal = paused;
      terminalStatus = "interrupted";
    })();
    return goalPausePromise;
  }

  async function waitForGoalTurnTerminal(): Promise<void> {
    const deadline = Date.now() + 10_000;
    let stableSince: number | null = null;
    while (Date.now() < deadline) {
      if (!activeTurnRunning) {
        stableSince ??= Date.now();
        if (Date.now() - stableSince >= 100) return;
      } else {
        stableSince = null;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("Codex native Goal interrupt did not reach a terminal turn before pause.");
  }

  function sendRawServerRequestResult(id: number, result: Record<string, unknown>): void {
    if (!child?.stdin?.writable) throw new Error("Codex app-server stdin is not writable.");
    child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }
}

function extractFileChangePaths(value: unknown): string[] {
  const paths = new Set<string>();
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { for (const child of item) visit(child); return; }
    if (!isRecord(item)) return;
    if (item.type === "file_change" && Array.isArray(item.changes)) {
      for (const change of item.changes) {
        if (isRecord(change) && typeof change.path === "string" && change.path.trim()) paths.add(change.path.trim());
      }
    }
    for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return [...paths];
}

export function extractCodexAppServerThreadFinalText(snapshot: Record<string, unknown>): string {
  const thread = isRecord(snapshot.thread) ? snapshot.thread : snapshot;
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    if (!isRecord(turn)) continue;
    const items = Array.isArray(turn.items) ? turn.items : Array.isArray(turn.output) ? turn.output : [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex];
      if (!isRecord(item)) continue;
      const role = stringValue(item.role);
      const type = stringValue(item.type ?? item.kind);
      if (role && role !== "assistant") continue;
      if (type && !/agentMessage|assistant|message|output/i.test(type)) continue;
      const text = textFromThreadItem(item);
      if (text) return text;
    }
    const text = textFromThreadItem(turn);
    if (text) return text;
  }
  return "";
}

export function extractCodexAppServerThreadInitialPrompt(snapshot: Record<string, unknown>): string {
  const thread = isRecord(snapshot.thread) ? snapshot.thread : snapshot;
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  for (const turn of turns) {
    if (!isRecord(turn)) continue;
    const items = Array.isArray(turn.items) ? turn.items : Array.isArray(turn.output) ? turn.output : [];
    for (const item of items) {
      if (!isRecord(item)) continue;
      const role = stringValue(item.role);
      const type = stringValue(item.type ?? item.kind);
      if (role && role !== "user") continue;
      if (type && !/userMessage|user|message|input/i.test(type)) continue;
      const text = textFromThreadItem(item);
      if (text) return text;
    }
  }
  return "";
}

export function extractCodexAppServerThreadDisplayName(snapshot: Record<string, unknown>): string | undefined {
  const thread = isRecord(snapshot.thread) ? snapshot.thread : snapshot;
  return stringValue(thread.agentNickname ?? thread.agent_nickname ?? thread.displayName ?? thread.display_name);
}

function extractSubAgentActivity(method: string, params: Record<string, unknown>): { itemId: string; threadId: string; agentPath?: string } | null {
  if (method !== "item/started" && method !== "item/completed") return null;
  const item = isRecord(params.item) ? params.item : params;
  if (stringValue(item.type ?? item.kind) !== "subAgentActivity") return null;
  if (stringValue(item.kind) !== "started") return null;
  const itemId = stringValue(item.id);
  const threadId = stringValue(item.agentThreadId ?? item.agent_thread_id);
  const agentPath = stringValue(item.agentPath ?? item.agent_path);
  return itemId && threadId ? { itemId, threadId, ...(agentPath ? { agentPath } : {}) } : null;
}

function textFromThreadItem(value: Record<string, unknown>): string {
  for (const candidate of [value.text, value.markdown, value.outputText, value.output_text]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  const content = value.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (!Array.isArray(content)) return "";
  return content.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!isRecord(item)) return [];
    const text = item.text ?? item.outputText ?? item.output_text;
    return typeof text === "string" ? [text] : [];
  }).join("").trim();
}

function isTerminalCollabStatus(status: string | undefined): boolean {
  return status === "completed" || status === "succeeded" || status === "failed" || status === "errored" || status === "cancelled";
}

function parseDynamicToolCall(requestId: string, params: Record<string, unknown>, fallbackThreadId: string | null, fallbackTurnId: string | null): CodexAppServerDynamicToolCall | null {
  const tool = stringValue(params.tool);
  const callId = stringValue(params.callId ?? params.call_id);
  const threadId = stringValue(params.threadId ?? params.thread_id) || fallbackThreadId || "";
  const turnId = stringValue(params.turnId ?? params.turn_id) || fallbackTurnId || "";
  if (!tool || !callId || !threadId || !turnId) return null;
  return { requestId, threadId, turnId, callId, tool, arguments: isRecord(params.arguments) ? params.arguments : {} };
}

function dynamicToolItemMatches(params: Record<string, unknown>, callId: string): boolean {
  const item = isRecord(params.item) ? params.item : params;
  const type = stringValue(item.type ?? item.kind);
  return type === "dynamicToolCall" && stringValue(item.callId ?? item.call_id ?? item.id) === callId;
}

function parseThreadGoalResponse(response: Record<string, unknown>): CodexAppServerThreadGoal | null {
  return parseThreadGoal(isRecord(response.goal) ? response.goal : response);
}

function parseThreadGoal(value: Record<string, unknown>): CodexAppServerThreadGoal | null {
  const threadId = stringValue(value.threadId ?? value.thread_id);
  const objective = stringValue(value.objective);
  const rawStatus = stringValue(value.status);
  if (!threadId || !objective || !rawStatus) return null;
  if (!isGoalStatus(rawStatus)) throw new Error(`Unsupported Codex native Goal status: ${rawStatus}.`);
  return {
    threadId,
    objective,
    status: rawStatus,
    tokenBudget: typeof value.tokenBudget === "number" ? value.tokenBudget : null,
    tokensUsed: numberValue(value.tokensUsed),
    timeUsedSeconds: numberValue(value.timeUsedSeconds),
    createdAt: numberValue(value.createdAt),
    updatedAt: numberValue(value.updatedAt),
  };
}

function isGoalStatus(status: string): status is CodexAppServerThreadGoalStatus {
  return status === "active"
    || status === "paused"
    || status === "blocked"
    || status === "usageLimited"
    || status === "budgetLimited"
    || status === "complete";
}

function isResumableGoalStatus(status: CodexAppServerThreadGoalStatus): boolean {
  return status === "paused" || status === "blocked";
}

function isFinalGoalStatus(status: CodexAppServerThreadGoalStatus): boolean {
  return status === "usageLimited" || status === "budgetLimited" || status === "complete";
}

function isTurnTerminalGoalStatus(status: CodexAppServerThreadGoalStatus): boolean {
  return status === "paused" || status === "blocked" || isFinalGoalStatus(status);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function userTextInput(text: string): Record<string, unknown> {
  return { type: "text", text, text_elements: [] };
}

function imageInputs(images: CodexAppServerTurnOptions["imageInputs"]): Record<string, unknown>[] {
  if (!images?.length) return [];
  return images
    .map((image) => image.path.trim())
    .filter(Boolean)
    .map((path) => path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")
      ? { type: "image", url: path }
      : { type: "localImage", path });
}

function skillInputs(skills: CodexAppServerTurnOptions["skillInputs"]): Record<string, unknown>[] {
  if (!skills?.length) return [];
  return skills
    .map((skill) => ({ name: skill.name.trim(), path: skill.path.trim() }))
    .filter((skill) => skill.name && skill.path)
    .map((skill) => ({ type: "skill", ...skill }));
}

function sandboxPolicyFor(policy: "read-only" | "workspace-write", cwd: string, writableRoots?: string[]): Record<string, unknown> {
  if (policy === "workspace-write") {
    return {
      type: "workspaceWrite",
      writableRoots: writableRoots?.length ? writableRoots : [cwd],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    };
  }
  return { type: "readOnly", networkAccess: false };
}

async function captureCodexAppServerHelp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aho-codex-app-server-help-"));
  try {
    const stdoutPath = join(dir, "stdout.log");
    const stderrPath = join(dir, "stderr.log");
    const result = await executeProcessStreaming({
      cwd: dir,
      command: resolveCodexExecutable(),
      args: ["app-server", "--help"],
      stdoutPath,
      stderrPath,
    });
    if (result.exitCode !== 0) throw new Error(result.stderrSample || `codex app-server --help exited with ${result.exitCode}`);
    return result.stdoutSample;
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function captureCodexAppServerStartupError(): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "aho-codex-app-server-startup-"));
  try {
    const initializeRequest = `${JSON.stringify({
      id: 1,
      method: "initialize",
      params: {
        capabilities: { experimentalApi: true },
        clientInfo: { name: "agent-harness-orchestrator", title: "Agent Harness Orchestrator", version: "0.1.0" },
      },
    })}\n`;
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      let child: ChildProcess | null = null;
      let requestedResult: string | null | undefined;
      const resolveOnce = (result: string | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const requestStop = (result: string | null): void => {
        if (requestedResult !== undefined) return;
        requestedResult = result;
        try {
          child?.kill();
        } catch {
          // Best-effort cleanup for the short-lived startup probe.
        }
      };
      const evaluateStartup = (): string | null => {
        if (stderr.includes("failed to load configuration") || stderr.includes("Invalid configuration")) {
          return stderr.trim();
        }
        if (stdout.includes('"id"') && stdout.includes('"result"')) return null;
        return stderr.trim() || "Codex app-server did not respond to initialize during startup check.";
      };
      const timer = setTimeout(() => requestStop(evaluateStartup()), 3000);
      child = spawn(resolveCodexExecutable(), [...codexRuntimeConfigArgs(), "app-server", "--listen", "stdio://"], { cwd: dir });
      child.stdout?.on("data", (chunk) => {
        stdout += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        if (stdout.includes('"id"') && stdout.includes('"result"')) requestStop(null);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      });
      child.on("error", (error) => resolveOnce(`Failed to start Codex app-server: ${(error as Error).message}`));
      child.on("close", (code) => {
        if (settled) return;
        if (requestedResult !== undefined) resolveOnce(requestedResult);
        else if (code !== 0 && code !== null) resolveOnce(stderr.trim() || `codex app-server startup exited with ${code}`);
        else resolveOnce(evaluateStartup());
      });
      child.stdin?.write(initializeRequest);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function prepareLogFile(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "", "utf8");
}

function extractThreadId(response: Record<string, unknown>): string | null {
  if (isRecord(response.thread) && typeof response.thread.id === "string") return response.thread.id;
  if (typeof response.threadId === "string") return response.threadId;
  return null;
}

function extractTurnId(response: Record<string, unknown>): string | null {
  if (isRecord(response.turn) && typeof response.turn.id === "string") return response.turn.id;
  if (typeof response.turnId === "string") return response.turnId;
  return null;
}

function extractTextDelta(method: string, params: Record<string, unknown>): string {
  if (!method.includes("agentMessage") && !method.includes("message")) return "";
  if (typeof params.delta === "string") return params.delta;
  if (typeof params.text === "string") return params.text;
  if (isRecord(params.item) && typeof params.item.text === "string") return params.item.text;
  return "";
}

function extractCompletedText(params: Record<string, unknown>): string {
  const item = isRecord(params.item) ? params.item : params;
  if (typeof item.text === "string") return item.text;
  if (typeof item.markdown === "string") return item.markdown;
  if (typeof item.output === "string") return item.output;
  if (Array.isArray(item.content)) {
    return item.content.map((entry) => isRecord(entry) && typeof entry.text === "string" ? entry.text : "").filter(Boolean).join("\n");
  }
  return "";
}

function isPlanItem(params: Record<string, unknown>): boolean {
  const item = isRecord(params.item) ? params.item : params;
  return item.type === "plan"
    || item.kind === "plan"
    || item.itemType === "plan"
    || item.type === "proposed-plan"
    || item.kind === "proposed-plan"
    || item.type === "plan-implementation"
    || item.kind === "plan-implementation";
}

function isAssistantMessageItem(params: Record<string, unknown>): boolean {
  const item = isRecord(params.item) ? params.item : params;
  return item.type === "agentMessage"
    || item.kind === "agentMessage"
    || item.type === "assistantMessage"
    || item.kind === "assistantMessage"
    || item.type === "agent_message"
    || item.kind === "agent_message"
    || item.type === "assistant_message"
    || item.kind === "assistant_message";
}

function parseUserInputQuestions(value: unknown): CodexAppServerUserInputQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): CodexAppServerUserInputQuestion | null => {
      if (!isRecord(item)) return null;
      const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `q${index + 1}`;
      const question = typeof item.question === "string" ? item.question : "";
      if (!question.trim()) return null;
      const options = Array.isArray(item.options)
        ? item.options
            .map((option): CodexAppServerUserInputOption | null => {
              if (!isRecord(option) || typeof option.label !== "string" || !option.label.trim()) return null;
              return {
                label: option.label,
                ...(typeof option.description === "string" && option.description.trim() ? { description: option.description } : {}),
              };
            })
            .filter((option): option is CodexAppServerUserInputOption => Boolean(option))
        : undefined;
      return {
        id,
        ...(typeof item.header === "string" && item.header.trim() ? { header: item.header } : {}),
        question,
        ...(typeof item.is_other === "boolean" ? { isOther: item.is_other } : {}),
        ...(typeof item.isOther === "boolean" ? { isOther: item.isOther } : {}),
        ...(typeof item.is_secret === "boolean" ? { isSecret: item.is_secret } : {}),
        ...(typeof item.isSecret === "boolean" ? { isSecret: item.isSecret } : {}),
        ...(options && options.length > 0 ? { options } : {}),
      };
    })
    .filter((question): question is CodexAppServerUserInputQuestion => Boolean(question));
}

  function normalizeUserInputResponse(response: CodexAppServerUserInputResponse): Record<string, unknown> {
  const answers: Record<string, { answers: string[] }> = {};
  for (const [questionId, value] of Object.entries(response.answers)) {
    const answerList = Array.isArray(value) ? value : [value];
    const normalized = answerList.map((item) => item.trim()).filter(Boolean);
    if (normalized.length > 0) answers[questionId] = { answers: normalized };
  }
  return { answers };
}

function completionStatus(params: Record<string, unknown>): string | null {
  if (typeof params.status === "string") return params.status;
  if (isRecord(params.turn) && typeof params.turn.status === "string") return params.turn.status;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultNativeCollabStatus(): CodexNativeCollabConfigStatus {
  return {
    configPath: "",
    configExists: false,
    multiAgent: "default-enabled",
    multiAgentV2: "default-disabled",
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return stringValue(value);
  if (!Array.isArray(value)) return undefined;
  return value.find((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringValue).filter((item): item is string => Boolean(item));
  const single = stringValue(value);
  return single ? [single] : [];
}

export async function readAgentSession(path: string): Promise<CodexAppServerSessionRecord | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as CodexAppServerSessionRecord;
  } catch {
    return null;
  }
}
