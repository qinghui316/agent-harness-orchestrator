import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { finished } from "node:stream/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { MemoryMode } from "../types/index.js";
import { normalizeCodexAppServerNotification, type CodexAppServerRealtimeEvent } from "./app-server-realtime.js";
import { readCodexNativeCollabConfigStatus, type CodexNativeCollabConfigStatus } from "./trust.js";
import { agentRoleDisplayName, composeAgentDisplayLabel } from "../agent-display-label.js";
import { defaultCodexAppServerHostRegistry, type CodexAppServerChildControl, type CodexAppServerHostIdentity, type CodexAppServerHostLease } from "./app-server-host.js";
import { CodexCollaborationNormalizer, type CodexChildLifecycleEvent } from "./collaboration-normalizer.js";

const UNREGISTERED_CHILD_ROLE_ID = "unregistered-provider-child";

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
  host?: CodexAppServerHostIdentity;
  error?: string;
}

export type CodexAppServerNotificationHandler = (notification: CodexAppServerNotification) => void;

export interface CodexAppServerNotification {
  method: string;
  params: Record<string, unknown>;
  raw: Record<string, unknown>;
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

export interface CodexAppServerUserInputResolution {
  requestId: string;
  threadId?: string;
}

export interface CodexAppServerChildThreadResult {
  itemId?: string;
  parentThreadId: string;
  threadId: string;
  roleHint?: string;
  status?: string;
  prompt?: string;
  initialUserItem?: {
    turnId: string;
    itemId: string;
    text: string;
  };
  model?: string;
  reasoningEffort?: string;
  displayName?: string;
  finalText: string;
  changedFiles: string[];
  snapshot: Record<string, unknown>;
}

interface ChildThreadReadContext {
  itemId?: string;
  status?: string;
  prompt?: string;
  model?: string;
  reasoningEffort?: string;
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
  onChildLifecycleEvent?: (event: CodexChildLifecycleEvent) => void;
  onChildThreadResult?: (result: CodexAppServerChildThreadResult) => void;
  onUserInputRequest?: CodexAppServerUserInputRequestHandler;
  onUserInputResolved?: (resolution: CodexAppServerUserInputResolution) => void;
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
  enableDefaultModeUserInput?: boolean;
  outputSchema?: Record<string, unknown>;
}

export interface CodexAppServerTurnResult {
  status: "completed" | "interrupted" | "failed";
  threadId: string | null;
  turnId: string | null;
  lastMessageItemId: string | null;
  lastMessage: string;
  planText?: string;
  goal?: CodexAppServerThreadGoal | null;
  childThreads: CodexAppServerChildThreadResult[];
  changedFiles: string[];
  host?: CodexAppServerHostIdentity;
  error?: string;
}

export interface CodexAppServerChildTurnOptions extends Omit<CodexAppServerTurnOptions, "existingThreadId" | "goalSession" | "goalResume"> {
  parentThreadId: string;
  targetThreadId: string;
  targetDisplayName?: string;
}

export interface CodexAppServerChildCloseOptions extends Omit<CodexAppServerTurnOptions, "existingThreadId" | "goalSession" | "goalResume" | "prompt"> {
  parentThreadId: string;
  targetThreadId: string;
  targetDisplayName?: string;
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

export async function detectCodexAppServerCapability(): Promise<CodexAppServerCapabilities> {
  let help: string | null = null;
  let spawnError: string | undefined;
  const nativeCollab = await readCodexNativeCollabConfigStatus();
  try {
    const startupError = await captureCodexAppServerStartupError();
    if (startupError) spawnError = startupError;
    else help = "codex app-server --listen stdio://";
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

export function runCodexAppServerTurn(options: CodexAppServerTurnOptions): Promise<CodexAppServerTurnResult> {
  return runCodexAppServerOperation(options, null);
}

export function runCodexAppServerChildTurn(options: CodexAppServerChildTurnOptions): Promise<CodexAppServerTurnResult> {
  const host = defaultCodexAppServerHostRegistry.hostForProject(options.projectId, options.cwd);
  if (host.snapshot().state === "busy") return runActiveCodexAppServerChildTurn(options);
  return runCodexAppServerOperation({
    ...options,
    existingThreadId: options.parentThreadId,
    prompt: childFollowupPrompt(options.targetThreadId, options.targetDisplayName, options.prompt),
    goalSession: false,
  }, { action: "followup", parentThreadId: options.parentThreadId, targetThreadId: options.targetThreadId });
}

export function isCodexAppServerChildAvailable(projectId: string, cwd: string, parentThreadId: string, childThreadId: string): boolean {
  return defaultCodexAppServerHostRegistry.hostForProject(projectId, cwd).hasLiveChild(parentThreadId, childThreadId);
}

async function runActiveCodexAppServerChildTurn(options: CodexAppServerChildTurnOptions): Promise<CodexAppServerTurnResult> {
  await Promise.all([
    prepareLogFile(options.paths.events), prepareLogFile(options.paths.stderr),
    prepareLogFile(options.paths.lastMessage), prepareLogFile(options.paths.session),
  ]);
  const eventStream = createWriteStream(options.paths.events, { flags: "a", encoding: "utf8" });
  const stderrStream = createWriteStream(options.paths.stderr, { flags: "a", encoding: "utf8" });
  const host = defaultCodexAppServerHostRegistry.hostForProject(options.projectId, options.cwd);
  const collaborationNormalizer = new CodexCollaborationNormalizer();
  let observed = false;
  let childCompleted = false;
  let childTurnId: string | null = null;
  let resolveTerminal!: () => void;
  let rejectTerminal!: (error: Error) => void;
  const terminal = new Promise<void>((resolve, reject) => { resolveTerminal = resolve; rejectTerminal = reject; });
  const control = host.acquireActiveChildControl(options.parentThreadId, options.targetThreadId, {
    onStderr: (text) => stderrStream.write(text),
    onExit: rejectTerminal,
    onLine: (line) => {
      eventStream.write(`${line}\n`);
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }
      const method = stringValue(payload.method);
      const params = isRecord(payload.params) ? payload.params : {};
      if (!method) return;
      const collaboration = collaborationNormalizer.normalize(method, params);
      if ((collaboration.toolCall?.tool === "sendInput" || collaboration.toolCall?.tool === "resumeAgent")
        && collaboration.toolCall.receiverThreadIds.includes(options.targetThreadId)) observed = true;
      if (collaboration.subAgentActivity?.kind === "interacted"
        && collaboration.subAgentActivity.threadId === options.targetThreadId) observed = true;
      for (const event of collaboration.lifecycleEvents) options.onChildLifecycleEvent?.(event);
      const eventThreadId = stringValue(params.threadId ?? params.thread_id);
      if (eventThreadId === options.parentThreadId) {
        if (method === "turn/completed" && observed && childCompleted) resolveTerminal();
        if (method === "turn/failed") rejectTerminal(new Error(JSON.stringify(params)));
        return;
      }
      if (eventThreadId !== options.targetThreadId) return;
      const eventTurnId = stringValue(params.turnId ?? params.turn_id)
        ?? stringValue(isRecord(params.turn) ? params.turn.id : undefined)
        ?? childTurnId ?? undefined;
      if (eventTurnId) childTurnId = eventTurnId;
      const item = isRecord(params.item) ? params.item : params;
      const itemId = stringValue(item.id ?? params.itemId ?? params.item_id);
      if (eventTurnId && options.onRealtimeEvent) {
        for (const event of normalizeCodexAppServerNotification(method, params, {
          projectId: options.projectId,
          ...(options.conversationId ? { conversationId: options.conversationId } : {}),
          ...(options.changeId ? { changeId: options.changeId } : {}),
          runId: options.runId,
          threadId: options.targetThreadId,
          parentThreadId: options.parentThreadId,
          turnId: eventTurnId,
          ...(itemId ? { itemId } : {}),
          roleId: options.roleId,
          displayName: options.targetDisplayName ?? agentRoleDisplayName(options.roleId),
        })) options.onRealtimeEvent(event);
      }
      if (method === "turn/completed") childCompleted = true;
      if (method === "turn/failed") rejectTerminal(new Error(JSON.stringify(params)));
    },
  });
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  try {
    await control.request("turn/steer", {
      threadId: options.parentThreadId,
      expectedTurnId: control.parentTurnId,
      input: [userTextInput(childFollowupPrompt(options.targetThreadId, options.targetDisplayName, options.prompt))],
    });
    await Promise.race([
      terminal,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Codex active Child follow-up timed out.")), timeoutMs)),
    ]);
    if (!observed) throw new Error("Codex active parent Turn did not dispatch input to the exact native Child.");
    const snapshot = await control.request("thread/read", { threadId: options.targetThreadId, includeTurns: true });
    const finalText = extractCodexAppServerThreadFinalText(snapshot);
    if (!finalText) throw new Error("Codex active Child follow-up completed without a final response.");
    const child: CodexAppServerChildThreadResult = {
      parentThreadId: options.parentThreadId,
      threadId: options.targetThreadId,
      roleHint: options.roleId,
      status: "completed",
      displayName: extractCodexAppServerThreadDisplayName(snapshot) ?? options.targetDisplayName ?? agentRoleDisplayName(options.roleId),
      finalText,
      changedFiles: extractFileChangePaths(snapshot),
      snapshot,
    };
    options.onChildThreadResult?.(child);
    await writeFile(options.paths.lastMessage, finalText, "utf8");
    await writeFile(options.paths.session, `${JSON.stringify({
      version: "1.0", adapter: "codex-app-server", projectId: options.projectId,
      runtimeScopeId: options.runtimeScopeId ?? options.changeId ?? options.runId,
      roleId: options.roleId, runId: options.runId, threadId: options.targetThreadId,
      activeTurnId: childTurnId, cwd: options.cwd, sandboxPolicy: options.sandboxPolicy,
      status: "completed", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      host: { hostId: control.hostId, generation: control.generation, pid: control.pid },
    }, null, 2)}\n`, "utf8");
    return {
      status: "completed", threadId: options.parentThreadId, turnId: childTurnId,
      lastMessageItemId: null, lastMessage: "", childThreads: [child], changedFiles: child.changedFiles,
      host: hostControlIdentity(control),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.onError?.(error);
    await writeFile(options.paths.lastMessage, message, "utf8");
    return {
      status: "failed", threadId: options.parentThreadId, turnId: childTurnId,
      lastMessageItemId: null, lastMessage: "", childThreads: [], changedFiles: [],
      host: hostControlIdentity(control), error: message,
    };
  } finally {
    control.release();
    eventStream.end();
    stderrStream.end();
    await Promise.all([finished(eventStream), finished(stderrStream)]).catch(() => undefined);
  }
}

export function runCodexAppServerChildClose(options: CodexAppServerChildCloseOptions): Promise<CodexAppServerTurnResult> {
  return runNativeCodexAppServerChildClose(options);
}

async function runNativeCodexAppServerChildClose(options: CodexAppServerChildCloseOptions): Promise<CodexAppServerTurnResult> {
  await Promise.all([
    prepareLogFile(options.paths.events), prepareLogFile(options.paths.stderr),
    prepareLogFile(options.paths.lastMessage), prepareLogFile(options.paths.session),
  ]);
  const eventStream = createWriteStream(options.paths.events, { flags: "a", encoding: "utf8" });
  const stderrStream = createWriteStream(options.paths.stderr, { flags: "a", encoding: "utf8" });
  const host = defaultCodexAppServerHostRegistry.hostForProject(options.projectId, options.cwd);
  if (host.hasClosedChild(options.parentThreadId, options.targetThreadId)) {
    const snapshot = host.snapshot();
    const hostIdentity: CodexAppServerHostIdentity = {
      hostId: snapshot.hostId,
      generation: snapshot.generation,
      pid: snapshot.pid,
      cwd: snapshot.cwd,
    };
    options.onChildLifecycleEvent?.({
      kind: "closed",
      activityId: `native-close:${options.runId}:${options.targetThreadId}`,
      parentThreadId: options.parentThreadId,
      childThreadId: options.targetThreadId,
      roleHint: options.roleId,
    });
    await writeFile(options.paths.lastMessage, "", "utf8");
    await writeFile(options.paths.session, `${JSON.stringify({
      version: "1.0", adapter: "codex-app-server", projectId: options.projectId,
      runtimeScopeId: options.runtimeScopeId ?? options.changeId ?? options.runId,
      roleId: options.roleId, runId: options.runId, threadId: options.targetThreadId,
      activeTurnId: null, cwd: options.cwd, sandboxPolicy: options.sandboxPolicy,
      status: "completed", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      host: hostIdentity,
    }, null, 2)}\n`, "utf8");
    eventStream.end();
    stderrStream.end();
    await Promise.all([finished(eventStream), finished(stderrStream)]).catch(() => undefined);
    return {
      status: "completed", threadId: options.parentThreadId, turnId: null,
      lastMessageItemId: null, lastMessage: "", childThreads: [], changedFiles: [], host: hostIdentity,
    };
  }
  let observed = false;
  let control: {
    host: CodexAppServerHostIdentity;
    turnId: string | null;
    request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
    closeChild(): void;
    release(): void;
  } | null = null;
  let resolveClosed!: () => void;
  let rejectClosed!: (error: Error) => void;
  const closed = new Promise<void>((resolve, reject) => { resolveClosed = resolve; rejectClosed = reject; });
  const handlers = {
    onStderr: (text: string) => stderrStream.write(text),
    onExit: rejectClosed,
    onLine: (line: string) => {
      eventStream.write(`${line}\n`);
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }
      const method = stringValue(payload.method);
      const params = isRecord(payload.params) ? payload.params : {};
      if (method !== "thread/archived") return;
      const threadId = stringValue(params.threadId ?? params.thread_id);
      if (threadId !== options.targetThreadId) return;
      observed = true;
      resolveClosed();
    },
  };
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  try {
    if (host.snapshot().state === "busy") {
      const active = host.acquireActiveChildControl(options.parentThreadId, options.targetThreadId, handlers);
      control = {
        host: hostControlIdentity(active), turnId: active.parentTurnId,
        request: active.request, closeChild: active.closeChild, release: active.release,
      };
    } else {
      const lease = await host.acquire(handlers);
      control = {
        host: hostLeaseIdentity(lease), turnId: null, request: lease.request,
        closeChild: () => lease.closeChild(options.parentThreadId, options.targetThreadId),
        release: lease.release,
      };
      lease.assertChild(options.parentThreadId, options.targetThreadId);
    }
    await control.request("thread/archive", { threadId: options.targetThreadId });
    await Promise.race([
      closed,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Codex native Child close timed out.")), timeoutMs)),
    ]);
    if (!observed) throw new Error("Codex did not emit thread/archived for the exact native Child.");
    control.closeChild();
    options.onChildLifecycleEvent?.({
      kind: "closed",
      activityId: `native-close:${options.runId}:${options.targetThreadId}`,
      parentThreadId: options.parentThreadId,
      childThreadId: options.targetThreadId,
      roleHint: options.roleId,
    });
    await writeFile(options.paths.lastMessage, "", "utf8");
    await writeFile(options.paths.session, `${JSON.stringify({
      version: "1.0", adapter: "codex-app-server", projectId: options.projectId,
      runtimeScopeId: options.runtimeScopeId ?? options.changeId ?? options.runId,
      roleId: options.roleId, runId: options.runId, threadId: options.targetThreadId,
      activeTurnId: control.turnId, cwd: options.cwd, sandboxPolicy: options.sandboxPolicy,
      status: "completed", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      host: control.host,
    }, null, 2)}\n`, "utf8");
    return {
      status: "completed", threadId: options.parentThreadId, turnId: control.turnId,
      lastMessageItemId: null, lastMessage: "", childThreads: [], changedFiles: [],
      host: control.host,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.onError?.(error);
    await writeFile(options.paths.lastMessage, message, "utf8");
    return {
      status: "failed", threadId: options.parentThreadId, turnId: control?.turnId ?? null,
      lastMessageItemId: null, lastMessage: "", childThreads: [], changedFiles: [],
      ...(control ? { host: control.host } : {}), error: message,
    };
  } finally {
    control?.release();
    eventStream.end();
    stderrStream.end();
    await Promise.all([finished(eventStream), finished(stderrStream)]).catch(() => undefined);
  }
}

async function runCodexAppServerOperation(
  options: CodexAppServerTurnOptions,
  childTarget: { action: "followup"; parentThreadId: string; targetThreadId: string } | null,
): Promise<CodexAppServerTurnResult> {
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
  let hostLease: CodexAppServerHostLease | null = null;
  let threadId: string | null = options.existingThreadId ?? null;
  let turnId: string | null = null;
  let lastMessage = "";
  let lastMessageItemId: string | null = null;
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
  const childThreadRoleHints = new Map<string, string>();
  const subAgentThreadItems = new Map<string, string>();
  const collaborationNormalizer = new CodexCollaborationNormalizer();
  const pendingChildReads = new Set<Promise<void>>();
  const readChildThreadIds = new Set<string>();
  const pendingInitialChildReads = new Set<string>();
  const deliveredInitialChildReads = new Set<string>();
  let terminalStatus: CodexAppServerTurnResult["status"] | null = null;
  let terminalError: string | undefined;
  let targetFollowupObserved = false;
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
      ...(hostLease ? { host: hostLeaseIdentity(hostLease) } : {}),
      ...(error ? { error } : {}),
    };
    await writeFile(options.paths.session, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  };

  const startedAt = new Date().toISOString();
  try {
    hostLease = await defaultCodexAppServerHostRegistry.hostForProject(options.projectId, options.cwd).acquire({
      onLine: handleLine,
      onStderr: (text) => stderrStream.write(text),
      onExit: (error) => {
        terminalError = error.message;
        options.onError?.(error);
      },
    });
    if (childTarget) hostLease.assertChild(childTarget.parentThreadId, childTarget.targetThreadId);
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
          ...(options.enableDefaultModeUserInput ? { config: { "features.default_mode_request_user_input": true } } : {}),
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
      hostLease?.setActiveTurn(activeThreadId, activeTurnId);
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
    if (childTarget?.action === "followup") {
      const selected = [...childThreads].reverse().find((candidate) => candidate.threadId === childTarget.targetThreadId && candidate.finalText.trim());
      if (!targetFollowupObserved || !selected) {
        throw new Error("Codex did not complete the exact native Child follow-up in the owning Host generation.");
      }
    }
    if (options.goalSession && threadId && !goal) {
      goal = parseThreadGoalResponse(await sendRequest("thread/goal/get", { threadId }));
    }
    await writeFile(options.paths.lastMessage, lastMessage, "utf8");
    const finalStatus = terminalStatus ?? "failed";
    await writeSession(finalStatus);
    return { status: finalStatus, threadId, turnId, lastMessageItemId, lastMessage, planText, goal, childThreads, changedFiles: [...changedFiles], host: hostLeaseIdentity(hostLease) };
  } catch (error) {
    terminalStatus = "failed";
    terminalError = error instanceof Error ? error.message : String(error);
    options.onError?.(error);
    await writeFile(options.paths.lastMessage, lastMessage || terminalError, "utf8");
    await writeSession("failed", terminalError).catch(() => undefined);
    return { status: "failed", threadId, turnId, lastMessageItemId, lastMessage, planText, goal, childThreads, changedFiles: [...changedFiles], ...(hostLease ? { host: hostLeaseIdentity(hostLease) } : {}), error: terminalError };
  } finally {
    activeTurns.delete(activeScopeId);
    activeSessionScopes.delete(activeSessionKey);
    hostLease?.release();
    eventStream.end();
    stderrStream.end();
    await Promise.all([finished(eventStream), finished(stderrStream)]).catch(() => undefined);
  }

  function sendRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return hostLease?.request(method, params) ?? Promise.reject(new Error("Codex app-server Host lease is unavailable."));
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
    if (!hostLease) throw new Error("Codex app-server Host lease is unavailable.");
    hostLease.respond(request.id, result);
    pendingServerRequests.delete(requestId);
  }

  function handleLine(line: string): void {
    eventStream.write(`${line}\n`);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(line) as Record<string, unknown>;
    } catch {
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
      ? childThreadRoleHints.get(requestThreadId) ?? UNREGISTERED_CHILD_ROLE_ID
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
    if (method === "serverRequest/resolved") {
      const resolvedRequestId = params.requestId ?? params.request_id;
      if (typeof resolvedRequestId === "string" || typeof resolvedRequestId === "number") {
        const requestId = String(resolvedRequestId);
        pendingServerRequests.delete(requestId);
        options.onUserInputResolved?.({ requestId, ...(notificationThreadId ? { threadId: notificationThreadId } : {}) });
      }
    }
    const isParentNotification = !notificationThreadId || !threadId || notificationThreadId === threadId;
    if (isParentNotification) options.onNotification?.(notification);
    if (!acceptsCurrentTurnNotification(method, params, notificationThreadId)) return;
    if (isParentNotification) for (const path of extractFileChangePaths(params)) changedFiles.add(path);
    const collaboration = collaborationNormalizer.normalize(method, params);
    const collab = collaboration.toolCall;
    for (const event of collaboration.lifecycleEvents) {
      childThreadParents.set(event.childThreadId, event.parentThreadId);
      if (event.roleHint) childThreadRoleHints.set(event.childThreadId, event.roleHint);
      if (event.kind === "closed"
        && defaultCodexAppServerHostRegistry.hostForProject(options.projectId, options.cwd).hasLiveChild(event.parentThreadId, event.childThreadId)) {
        hostLease?.closeChild(event.parentThreadId, event.childThreadId);
      }
      options.onChildLifecycleEvent?.(event);
    }
    if (childTarget?.action === "followup"
      && (collab?.tool === "sendInput" || collab?.tool === "resumeAgent")
      && collab.receiverThreadIds.includes(childTarget.targetThreadId)) {
      targetFollowupObserved = true;
      subAgentThreadItems.set(childTarget.targetThreadId, collab.itemId);
      childThreadParents.set(childTarget.targetThreadId, childTarget.parentThreadId);
      childThreadRoleHints.set(childTarget.targetThreadId, options.roleId);
    }
    if (collab?.tool === "spawnAgent") {
      for (const childThreadId of collab.receiverThreadIds) {
        const parentThreadId = collab.senderThreadId;
        childThreadParents.set(childThreadId, parentThreadId);
        if (parentThreadId) hostLease?.bindChild(parentThreadId, childThreadId);
        queueChildInitialThreadRead(collab, childThreadId);
        if (isTerminalCollabStatus(collab.status)) queueChildThreadRead(collab, childThreadId);
      }
    }
    emitRealtime(method, params);
    const subAgent = collaboration.subAgentActivity;
    if (subAgent) {
      if (childTarget?.action === "followup" && subAgent.kind === "interacted" && subAgent.threadId === childTarget.targetThreadId) {
        targetFollowupObserved = true;
        subAgentThreadItems.set(subAgent.threadId, subAgent.itemId);
        childThreadParents.set(subAgent.threadId, childTarget.parentThreadId);
        childThreadRoleHints.set(subAgent.threadId, options.roleId);
      }
      if (subAgent.kind === "started") {
        subAgentThreadItems.set(subAgent.threadId, subAgent.itemId);
        const parentThreadId = notificationThreadId ?? threadId ?? "";
        childThreadParents.set(subAgent.threadId, parentThreadId);
        if (parentThreadId) hostLease?.bindChild(parentThreadId, subAgent.threadId);
        const roleHint = collaborationNormalizer.roleHintForChild(subAgent.threadId);
        if (roleHint) childThreadRoleHints.set(subAgent.threadId, roleHint);
        queueChildInitialThreadRead({ itemId: subAgent.itemId }, subAgent.threadId);
      }
    }
    const completedExactFollowup = childTarget?.action === "followup"
      && targetFollowupObserved
      && notificationThreadId === childTarget.targetThreadId;
    if (method === "turn/completed" && notificationThreadId && (subAgentThreadItems.has(notificationThreadId) || completedExactFollowup)) {
      queueChildThreadRead({
        itemId: subAgentThreadItems.get(notificationThreadId),
        status: completionStatus(params) ?? undefined,
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
        if (threadId) hostLease?.setActiveTurn(threadId, nextTurnId);
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
      const completedTurnId = stringValue((isRecord(params.turn) ? params.turn.id : undefined) ?? params.turnId);
      if (threadId && completedTurnId) hostLease?.clearActiveTurn(threadId, completedTurnId);
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
      if (isAssistantMessageItem(params) && finalText) {
        lastMessageItemId = stringValue(isRecord(params.item) ? params.item.id : params.itemId ?? params.item_id) ?? lastMessageItemId;
        if (!lastMessage.includes(finalText)) lastMessage += finalText;
      }
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
    const eventThreadId = stringValue(params.threadId ?? params.thread_id) ?? threadId;
    const eventTurnId = stringValue(params.turnId ?? params.turn_id)
      ?? stringValue((isRecord(params.turn) ? params.turn.id : undefined))
      ?? (eventThreadId === threadId ? turnId ?? undefined : undefined);
    if (!eventThreadId || !eventTurnId) return;
    const eventItem = isRecord(params.item) ? params.item : params;
    const eventItemId = stringValue(eventItem.id ?? params.itemId ?? params.item_id);
    const isMainThread = !threadId || eventThreadId === threadId;
    const roleId = isMainThread ? options.roleId : childThreadRoleHints.get(eventThreadId) ?? UNREGISTERED_CHILD_ROLE_ID;
    const providerDisplayName = stringValue(params.agentNickname ?? params.agent_nickname ?? params.agentDisplayName ?? params.agent_display_name)
      ?? stringValue((isRecord(params.thread)
        ? params.thread.agentNickname ?? params.thread.agent_nickname ?? params.thread.displayName ?? params.thread.display_name
        : undefined));
    if (!isMainThread && providerDisplayName) childThreadDisplayNames.set(eventThreadId, providerDisplayName);
    const parentThreadId = isMainThread
      ? undefined
      : stringValue(params.parentThreadId ?? params.parent_thread_id) ?? childThreadParents.get(eventThreadId) ?? threadId ?? undefined;
    const receiverThreadId = firstString(eventItem.receiverThreadIds ?? eventItem.receiver_thread_ids ?? eventItem.agentThreadId ?? eventItem.agent_thread_id);
    const targetRoleId = receiverThreadId ? childThreadRoleHints.get(receiverThreadId) : undefined;
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
        targetAgentDisplayName: targetRoleId
          ? composeAgentDisplayLabel(targetRoleId, childThreadDisplayNames.get(receiverThreadId))
          : childThreadDisplayNames.get(receiverThreadId) ?? "Unregistered Provider Child",
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

  function queueChildThreadRead(call: ChildThreadReadContext, childThreadId: string): void {
    if (!threadId || readChildThreadIds.has(childThreadId)) return;
    readChildThreadIds.add(childThreadId);
    const parentThreadId = threadId;
    const read = sendRequest("thread/read", { threadId: childThreadId, includeTurns: true }).then((snapshot) => {
      const initialUserItem = extractCodexAppServerThreadInitialUserItem(snapshot);
      if (initialUserItem) deliveredInitialChildReads.add(childThreadId);
      const result: CodexAppServerChildThreadResult = {
        ...(call.itemId ? { itemId: call.itemId } : {}),
        parentThreadId,
        threadId: childThreadId,
        ...(childThreadRoleHints.get(childThreadId) ? { roleHint: childThreadRoleHints.get(childThreadId) } : {}),
        ...(call.status ? { status: call.status } : {}),
        ...((call.prompt || extractCodexAppServerThreadInitialPrompt(snapshot))
          ? { prompt: call.prompt || extractCodexAppServerThreadInitialPrompt(snapshot) }
          : {}),
        ...(initialUserItem ? { initialUserItem } : {}),
        ...(call.model ? { model: call.model } : {}),
        ...(call.reasoningEffort ? { reasoningEffort: call.reasoningEffort } : {}),
        displayName: extractCodexAppServerThreadDisplayName(snapshot)
          ?? childThreadDisplayNames.get(childThreadId)
          ?? (childThreadRoleHints.get(childThreadId)
            ? agentRoleDisplayName(childThreadRoleHints.get(childThreadId)!)
            : "Unregistered Provider Child"),
        finalText: extractCodexAppServerThreadFinalText(snapshot),
        changedFiles: extractFileChangePaths(snapshot),
        snapshot,
      };
      childThreads.push(result);
      options.onChildThreadResult?.(result);
    }).finally(() => pendingChildReads.delete(read));
    pendingChildReads.add(read);
  }

  function queueChildInitialThreadRead(call: ChildThreadReadContext, childThreadId: string): void {
    if (!threadId || deliveredInitialChildReads.has(childThreadId) || pendingInitialChildReads.has(childThreadId)) return;
    pendingInitialChildReads.add(childThreadId);
    const parentThreadId = threadId;
    const read = (async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (deliveredInitialChildReads.has(childThreadId)) return;
        const snapshot = await sendRequest("thread/read", { threadId: childThreadId, includeTurns: true }).catch(() => null);
        const initialUserItem = snapshot ? extractCodexAppServerThreadInitialUserItem(snapshot) : undefined;
        if (snapshot && initialUserItem) {
          if (deliveredInitialChildReads.has(childThreadId)) return;
          deliveredInitialChildReads.add(childThreadId);
          options.onChildThreadResult?.({
            ...(call.itemId ? { itemId: call.itemId } : {}),
            parentThreadId,
            threadId: childThreadId,
            ...(childThreadRoleHints.get(childThreadId) ? { roleHint: childThreadRoleHints.get(childThreadId) } : {}),
            status: "running",
            prompt: initialUserItem.text,
            initialUserItem,
            ...(call.model ? { model: call.model } : {}),
            ...(call.reasoningEffort ? { reasoningEffort: call.reasoningEffort } : {}),
            displayName: extractCodexAppServerThreadDisplayName(snapshot)
              ?? childThreadDisplayNames.get(childThreadId)
              ?? (childThreadRoleHints.get(childThreadId)
                ? agentRoleDisplayName(childThreadRoleHints.get(childThreadId)!)
                : "Unregistered Provider Child"),
            finalText: "",
            changedFiles: [],
            snapshot,
          });
          return;
        }
        if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 100));
      }
    })().finally(() => {
      pendingInitialChildReads.delete(childThreadId);
      pendingChildReads.delete(read);
    });
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
    if (!hostLease) throw new Error("Codex app-server Host lease is unavailable.");
    hostLease.respond(id, result);
  }
}

function childFollowupPrompt(targetThreadId: string, targetDisplayName: string | undefined, message: string): string {
  return [
    "AHO provider runtime is continuing one native Child Agent in this live collaboration Host.",
    `Use the current native Child-input capability exactly once for ${targetThreadId}${targetDisplayName ? ` (${targetDisplayName})` : ""}.`,
    "Pass the enclosed feedback verbatim. Do not perform, answer, summarize, or modify the task yourself.",
    "Wait for that exact Child to finish. Do not create, close, or message any other Agent.",
    "After the Child finishes, reply only with AHO_CHILD_FOLLOWUP_COMPLETE.",
    "<aho-child-feedback>",
    message,
    "</aho-child-feedback>",
  ].join("\n");
}

function hostLeaseIdentity(lease: CodexAppServerHostLease): CodexAppServerHostIdentity {
  return { hostId: lease.hostId, generation: lease.generation, pid: lease.pid, cwd: lease.cwd };
}

function hostControlIdentity(control: CodexAppServerChildControl): CodexAppServerHostIdentity {
  return { hostId: control.hostId, generation: control.generation, pid: control.pid, cwd: control.cwd };
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
      const type = stringValue(item.type ?? item.kind);
      if (type !== "userMessage") continue;
      const text = textFromThreadItem(item);
      if (text) return text;
    }
  }
  return "";
}

export function extractCodexAppServerThreadInitialUserItem(snapshot: Record<string, unknown>): { turnId: string; itemId: string; text: string } | undefined {
  const thread = isRecord(snapshot.thread) ? snapshot.thread : snapshot;
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  for (const turn of turns) {
    if (!isRecord(turn)) continue;
    const turnId = stringValue(turn.id ?? turn.turnId ?? turn.turn_id);
    if (!turnId) continue;
    const items = Array.isArray(turn.items) ? turn.items : Array.isArray(turn.output) ? turn.output : [];
    for (const item of items) {
      if (!isRecord(item)) continue;
      const role = stringValue(item.role);
      const type = stringValue(item.type ?? item.kind);
      if (role && role !== "user") continue;
      if (type && !/userMessage|user|message|input/i.test(type)) continue;
      const itemId = stringValue(item.id ?? item.itemId ?? item.item_id);
      const text = textFromThreadItem(item);
      if (itemId && text) return { turnId, itemId, text };
    }
  }
  return undefined;
}

export function extractCodexAppServerThreadDisplayName(snapshot: Record<string, unknown>): string | undefined {
  const thread = isRecord(snapshot.thread) ? snapshot.thread : snapshot;
  return stringValue(thread.agentNickname ?? thread.agent_nickname ?? thread.displayName ?? thread.display_name);
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
  return status === "completed" || status === "failed";
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

async function captureCodexAppServerStartupError(): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "aho-codex-app-server-startup-"));
  let lease: CodexAppServerHostLease | null = null;
  try {
    lease = await defaultCodexAppServerHostRegistry.hostFor(dir).acquire({
      onLine: () => undefined,
      onStderr: () => undefined,
      onExit: () => undefined,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    lease?.release();
    defaultCodexAppServerHostRegistry.dispose(dir, "Codex app-server startup capability check completed.");
    await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
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

export async function readAgentSession(path: string): Promise<CodexAppServerSessionRecord | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as CodexAppServerSessionRecord;
  } catch {
    return null;
  }
}
