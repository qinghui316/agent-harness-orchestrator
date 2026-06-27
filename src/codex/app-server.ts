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

export interface CodexAppServerCapabilities {
  available: boolean;
  supportsStdio: boolean;
  supportsRequiredLifecycle: boolean;
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
  changeId: string;
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

export interface CodexAppServerTurnOptions {
  projectId: string;
  changeId: string;
  roleId: string;
  runId: string;
  cwd: string;
  prompt: string;
  sandboxPolicy: "read-only" | "workspace-write";
  paths: CodexAppServerArtifactPaths;
  existingThreadId?: string | null;
  timeoutMs?: number;
  onNotification?: CodexAppServerNotificationHandler;
  onTextDelta?: (text: string) => void;
  onPlanDelta?: (text: string) => void;
  onError?: (error: unknown) => void;
  collaborationMode?: "plan";
  model?: string | null;
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
  changeId: string;
  roleId: string;
  runId: string;
  threadId: string;
  turnId: string;
  startedAt: string;
  steer(input: string): Promise<void>;
  interrupt(reason?: string): Promise<void>;
}

const activeTurns = new Map<string, ActiveCodexAppServerTurn>();

export function evaluateCodexAppServerCapabilities(help: string | null, spawnError?: string): CodexAppServerCapabilities {
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
    help,
    errors,
  };
}

export function shouldUseCodexAppServerForMemory(memoryMode: MemoryMode): boolean {
  return memoryMode !== "external-local";
}

export async function detectCodexAppServerCapability(): Promise<CodexAppServerCapabilities> {
  let help: string | null = null;
  let spawnError: string | undefined;
  try {
    help = await captureCodexAppServerHelp();
    const startupError = await captureCodexAppServerStartupError();
    if (startupError) spawnError = startupError;
  } catch (error) {
    spawnError = `Failed to inspect Codex app-server: ${(error as Error).message}`;
  }
  return evaluateCodexAppServerCapabilities(help, spawnError);
}

export function getActiveCodexAppServerTurn(changeId: string): ActiveCodexAppServerTurn | null {
  return activeTurns.get(changeId) ?? null;
}

export async function runCodexAppServerTurn(options: CodexAppServerTurnOptions): Promise<CodexAppServerTurnResult> {
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

  const writeSession = async (status: CodexAppServerSessionRecord["status"], error?: string): Promise<void> => {
    if (!threadId) return;
    const record: CodexAppServerSessionRecord = {
      version: "1.0",
      adapter: "codex-app-server",
      projectId: options.projectId,
      changeId: options.changeId,
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
    const turnRequest = {
      threadId,
      input: [userTextInput(options.prompt)],
      cwd: options.cwd,
      sandboxPolicy: sandboxPolicyFor(options.sandboxPolicy, options.cwd),
      approvalPolicy: "never",
      ...(turnModel ? { model: turnModel } : {}),
      ...(options.collaborationMode === "plan" && turnModel ? {
        collaborationMode: {
          mode: "plan",
          settings: {
            model: turnModel,
            developer_instructions: null,
            reasoning_effort: null,
          },
        },
      } : {}),
    };
    const turnResponse = await sendRequest("turn/start", turnRequest);
    turnId = extractTurnId(turnResponse);
    if (!turnId) throw new Error("Codex app-server did not return a turn id.");
    await writeSession("running");
    activeTurns.set(options.changeId, {
      changeId: options.changeId,
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
    activeTurns.delete(options.changeId);
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
    if (typeof payload.method === "string") handleNotification(payload.method, isRecord(payload.params) ? payload.params : {}, payload);
  }

  function handleNotification(method: string, params: Record<string, unknown>, raw: Record<string, unknown>): void {
    const notification = { method, params, raw };
    options.onNotification?.(notification);
    const text = extractTextDelta(method, params);
    if (text) {
      lastMessage += text;
      options.onTextDelta?.(text);
    }
    if (method === "item/plan/delta" && typeof params.delta === "string") {
      planText += params.delta;
      options.onPlanDelta?.(params.delta);
    }
    if (method === "turn/completed") {
      terminalStatus = completionStatus(params) === "interrupted" ? "interrupted" : "completed";
    } else if (method === "turn/failed") {
      terminalStatus = "failed";
      terminalError = JSON.stringify(params);
    } else if (method === "item/completed") {
      const finalText = extractCompletedText(params);
      if (finalText && !lastMessage.includes(finalText)) lastMessage += finalText;
      if (isPlanItem(params) && finalText) planText = finalText;
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
      cwd: process.cwd(),
      command: "codex",
      args: ["app-server", "--help"],
      stdoutPath,
      stderrPath,
    });
    if (result.exitCode !== 0) throw new Error(result.stderrSample || `codex app-server --help exited with ${result.exitCode}`);
    return result.stdoutSample;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function captureCodexAppServerStartupError(): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "aho-codex-app-server-startup-"));
  try {
    const stdoutPath = join(dir, "stdout.log");
    const stderrPath = join(dir, "stderr.log");
    const initializeRequest = `${JSON.stringify({
      id: 1,
      method: "initialize",
      params: {
        capabilities: { experimentalApi: true },
        clientInfo: { name: "agent-harness-orchestrator", title: "Agent Harness Orchestrator", version: "0.1.0" },
      },
    })}\n`;
    const result = await executeProcessStreaming({
      cwd: process.cwd(),
      command: "codex",
      args: [...codexRuntimeConfigArgs(), "app-server", "--listen", "stdio://"],
      stdin: initializeRequest,
      stdoutPath,
      stderrPath,
      timeoutMs: 2000,
      completionSignal: () => false,
    });
    if (result.exitCode !== 0 && result.exitCode !== null) {
      return result.stderrSample || `codex app-server startup exited with ${result.exitCode}`;
    }
    if (result.stderrSample.includes("failed to load configuration") || result.stderrSample.includes("Invalid configuration")) {
      return result.stderrSample.trim();
    }
    if (!result.stdoutSample.includes('"id"') && !result.stdoutSample.includes('"result"')) {
      return result.stderrSample || "Codex app-server did not respond to initialize during startup check.";
    }
    return null;
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
  if (Array.isArray(item.content)) {
    return item.content.map((entry) => isRecord(entry) && typeof entry.text === "string" ? entry.text : "").filter(Boolean).join("\n");
  }
  return "";
}

function isPlanItem(params: Record<string, unknown>): boolean {
  const item = isRecord(params.item) ? params.item : params;
  return item.type === "plan" || item.kind === "plan" || item.itemType === "plan";
}

function completionStatus(params: Record<string, unknown>): string | null {
  if (typeof params.status === "string") return params.status;
  if (isRecord(params.turn) && typeof params.turn.status === "string") return params.turn.status;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readAgentSession(path: string): Promise<CodexAppServerSessionRecord | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as CodexAppServerSessionRecord;
  } catch {
    return null;
  }
}
