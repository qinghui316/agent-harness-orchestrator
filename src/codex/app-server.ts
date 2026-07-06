import spawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { finished } from "node:stream/promises";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { codexRuntimeConfigArgs } from "./capabilities.js";
import { executeProcessStreaming } from "../run/process.js";
import type { MemoryMode } from "../types/index.js";
import { readCodexNativeCollabConfigStatus, type CodexNativeCollabConfigStatus } from "./trust.js";

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

export type CodexAppServerUserInputRequestHandler = (request: CodexAppServerUserInputRequest) => void;

export interface CodexAppServerTurnOptions {
  projectId: string;
  changeId?: string;
  runtimeScopeId?: string;
  roleId: string;
  runId: string;
  cwd: string;
  prompt: string;
  sandboxPolicy: "read-only" | "workspace-write";
  paths: CodexAppServerArtifactPaths;
  existingThreadId?: string | null;
  timeoutMs?: number;
  onNotification?: CodexAppServerNotificationHandler;
  onUserInputRequest?: CodexAppServerUserInputRequestHandler;
  onTextDelta?: (text: string) => void;
  onPlanDelta?: (text: string) => void;
  onPlanUpdate?: (text: string, params: Record<string, unknown>) => void;
  onError?: (error: unknown) => void;
  collaborationMode?: "plan";
  model?: string | null;
  imageInputs?: Array<{ path: string; mediaType?: string; fileName?: string }>;
}

export interface CodexAppServerTurnResult {
  status: "completed" | "interrupted" | "failed";
  threadId: string | null;
  turnId: string | null;
  lastMessage: string;
  planText?: string;
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
  respondToUserInput(requestId: string, response: CodexAppServerUserInputResponse): Promise<void>;
}

const activeTurns = new Map<string, ActiveCodexAppServerTurn>();

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
  if (method === "turn/plan/updated") return extractTurnPlanText(params);
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

export function buildCodexAppServerCollaborationModePayload(mode: CodexAppServerTurnOptions["collaborationMode"], model: string | null): Record<string, unknown> | undefined {
  if (mode !== "plan") return undefined;
  return {
    mode: "plan",
    settings: {
      model,
      developer_instructions: null,
      reasoning_effort: null,
    },
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

export async function respondToCodexAppServerUserInput(scopeId: string, requestId: string, response: CodexAppServerUserInputResponse): Promise<void> {
  const turn = getActiveCodexAppServerTurn(scopeId);
  if (!turn) throw new Error("No active Codex app-server turn is waiting for user input.");
  await turn.respondToUserInput(requestId, response);
}

export async function runCodexAppServerTurn(options: CodexAppServerTurnOptions): Promise<CodexAppServerTurnResult> {
  const runtimeScopeId = options.runtimeScopeId ?? options.changeId;
  if (!runtimeScopeId) throw new Error("Codex app-server turn requires a runtimeScopeId or changeId.");
  const activeScopeId: string = runtimeScopeId;
  await Promise.all([
    prepareLogFile(options.paths.events),
    prepareLogFile(options.paths.stderr),
    prepareLogFile(options.paths.lastMessage),
    prepareLogFile(options.paths.session),
  ]);

  const eventStream = createWriteStream(options.paths.events, { flags: "a", encoding: "utf8" });
  const stderrStream = createWriteStream(options.paths.stderr, { flags: "a", encoding: "utf8" });
  let child: ChildProcess | null = null;
  let lineBuffer = "";
  let requestId = 1;
  let threadId: string | null = options.existingThreadId ?? null;
  let turnId: string | null = null;
  let lastMessage = "";
  let planText = "";
  let terminalStatus: CodexAppServerTurnResult["status"] | null = null;
  let terminalError: string | undefined;
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  const pendingServerRequests = new Map<string, { id: number; method: string }>();

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
    child = spawn("codex", [...codexRuntimeConfigArgs(), "app-server", "--listen", "stdio://"], {
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
    const threadResponse = threadId
      ? await sendRequest("thread/resume", { threadId, cwd: options.cwd, sandbox: options.sandboxPolicy, approvalPolicy: "never" })
      : await sendRequest("thread/start", { cwd: options.cwd, sandbox: options.sandboxPolicy, approvalPolicy: "never" });
    threadId = extractThreadId(threadResponse) ?? threadId;
    if (!threadId) throw new Error("Codex app-server did not return a thread id.");
    await writeSession("started");

    const turnModel = options.model?.trim() || null;
    const collaborationMode = buildCodexAppServerCollaborationModePayload(options.collaborationMode, turnModel);
    const turnRequest = {
      threadId,
      input: [userTextInput(options.prompt), ...imageInputs(options.imageInputs)],
      cwd: options.cwd,
      sandboxPolicy: sandboxPolicyFor(options.sandboxPolicy, options.cwd),
      approvalPolicy: "never",
      ...(turnModel ? { model: turnModel } : {}),
      ...(collaborationMode ? { collaborationMode } : {}),
    };
    const turnResponse = await sendRequest("turn/start", turnRequest);
    turnId = extractTurnId(turnResponse);
    if (!turnId) throw new Error("Codex app-server did not return a turn id.");
    await writeSession("running");
    activeTurns.set(activeScopeId, {
      ...(options.changeId ? { changeId: options.changeId } : {}),
      runtimeScopeId: activeScopeId,
      roleId: options.roleId,
      runId: options.runId,
      threadId,
      turnId,
      startedAt,
      steer: async (input: string) => {
        await sendRequest("turn/steer", { threadId, expectedTurnId: turnId, input: [userTextInput(input)] });
      },
      interrupt: async (reason?: string) => {
        void reason;
        await sendRequest("turn/interrupt", { threadId, turnId });
      },
      respondToUserInput: async (requestId: string, response: CodexAppServerUserInputResponse) => {
        sendServerRequestResult(requestId, normalizeUserInputResponse(response));
      },
    });

    await waitForTerminal(options.timeoutMs ?? 15 * 60 * 1000);
    await writeFile(options.paths.lastMessage, lastMessage, "utf8");
    const finalStatus = terminalStatus ?? "failed";
    await writeSession(finalStatus);
    return { status: finalStatus, threadId, turnId, lastMessage, planText };
  } catch (error) {
    terminalStatus = "failed";
    terminalError = error instanceof Error ? error.message : String(error);
    options.onError?.(error);
    await writeFile(options.paths.lastMessage, lastMessage || terminalError, "utf8");
    await writeSession("failed", terminalError).catch(() => undefined);
    return { status: "failed", threadId, turnId, lastMessage, planText, error: terminalError };
  } finally {
    activeTurns.delete(activeScopeId);
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

  function sendServerRequestResult(requestId: string, result: Record<string, unknown>): void {
    const request = pendingServerRequests.get(requestId);
    if (!request) throw new Error("Codex app-server user input request is no longer pending.");
    pendingServerRequests.delete(requestId);
    if (!child?.stdin?.writable) throw new Error("Codex app-server stdin is not writable.");
    child.stdin.write(`${JSON.stringify({ id: request.id, result })}\n`);
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
    if (method !== "item/tool/requestUserInput") {
      handleNotification(method, params, raw);
      return true;
    }
    options.onNotification?.({ method, params, raw });
    if (params.completed === true) return true;
    const requestId = String(id);
    pendingServerRequests.set(requestId, { id, method });
    const questions = parseUserInputQuestions(params.questions);
    const request: CodexAppServerUserInputRequest = {
      requestId,
      threadId: typeof params.threadId === "string" ? params.threadId : typeof params.thread_id === "string" ? params.thread_id : threadId ?? undefined,
      turnId: typeof params.turnId === "string" ? params.turnId : typeof params.turn_id === "string" ? params.turn_id : turnId ?? undefined,
      itemId: typeof params.itemId === "string" ? params.itemId : typeof params.item_id === "string" ? params.item_id : undefined,
      runId: options.runId,
      ...(options.changeId ? { changeId: options.changeId } : {}),
      runtimeScopeId: activeScopeId,
      roleId: options.roleId,
      questions,
    };
    options.onUserInputRequest?.(request);
    return true;
  }

  function handleNotification(method: string, params: Record<string, unknown>, raw: Record<string, unknown>): void {
    const notification = { method, params, raw };
    options.onNotification?.(notification);
    const text = extractTextDelta(method, params);
    if (text) {
      lastMessage += text;
      options.onTextDelta?.(text);
    }
    const planEventText = extractCodexAppServerPlanText(method, params);
    if (method === "item/plan/delta" && planEventText) {
      planText += planEventText;
      options.onPlanDelta?.(planEventText);
    }
    if (method === "turn/plan/updated" && planEventText) {
      planText = planEventText;
      options.onPlanUpdate?.(planEventText, params);
    }
    if (method === "turn/completed") {
      terminalStatus = completionStatus(params) === "interrupted" ? "interrupted" : "completed";
    } else if (method === "turn/failed") {
      terminalStatus = "failed";
      terminalError = JSON.stringify(params);
    } else if (method === "item/completed") {
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

function sandboxPolicyFor(policy: "read-only" | "workspace-write", cwd: string): Record<string, unknown> {
  if (policy === "workspace-write") {
    return {
      type: "workspaceWrite",
      writableRoots: [cwd],
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
      command: "codex",
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
      child = spawn("codex", [...codexRuntimeConfigArgs(), "app-server", "--listen", "stdio://"], { cwd: dir });
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

function extractTurnPlanText(params: Record<string, unknown>): string {
  const plan = params.plan;
  if (typeof plan === "string") return plan.trim();
  if (Array.isArray(plan)) {
    const text = extractPlanStepsText(plan, typeof params.explanation === "string" ? params.explanation : "");
    if (text) return text;
  }
  if (isRecord(plan)) {
    const text = extractPlanObjectText(plan);
    if (text) return text;
  }
  const item = isRecord(params.item) ? params.item : null;
  if (item) {
    const text = extractPlanObjectText(item);
    if (text) return text;
  }
  const explanation = typeof params.explanation === "string" ? params.explanation.trim() : "";
  return explanation;
}

function extractPlanStepsText(steps: unknown[], explanation: string): string {
  const renderedSteps = steps
    .map((step, index) => renderPlanStep(step, index))
    .filter(Boolean);
  const intro = explanation.trim();
  return [
    intro,
    renderedSteps.length > 0 ? renderedSteps.join("\n") : "",
  ].filter(Boolean).join("\n\n");
}

function extractPlanObjectText(plan: Record<string, unknown>): string {
  const direct = [
    plan.markdown,
    plan.text,
    plan.content,
    plan.body,
    plan.summary,
    plan.explanation,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (direct) return direct.trim();
  if (Array.isArray(plan.steps)) {
    const steps = plan.steps
      .map((step, index) => {
        if (typeof step === "string") return `${index + 1}. ${step}`;
        if (isRecord(step)) {
          const title = typeof step.title === "string" ? step.title : typeof step.label === "string" ? step.label : `Step ${index + 1}`;
          const detail = typeof step.description === "string" ? step.description : typeof step.detail === "string" ? step.detail : "";
          return detail ? `${index + 1}. ${title}: ${detail}` : `${index + 1}. ${title}`;
        }
        return "";
      })
      .filter(Boolean);
    if (steps.length > 0) return steps.join("\n");
  }
  return "";
}

function renderPlanStep(step: unknown, index: number): string {
  if (typeof step === "string") return `${index + 1}. ${step}`;
  if (!isRecord(step)) return "";
  const text = stringValue(step.step)
    ?? stringValue(step.title)
    ?? stringValue(step.label)
    ?? stringValue(step.description)
    ?? stringValue(step.detail);
  if (!text) return "";
  const status = stringValue(step.status);
  return status ? `${index + 1}. [${status}] ${text}` : `${index + 1}. ${text}`;
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
