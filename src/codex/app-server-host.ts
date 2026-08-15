import spawn from "cross-spawn";
import { spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { codexRuntimeConfigArgs } from "./capabilities.js";
import { resolveCodexExecutable } from "./executable.js";

export interface CodexAppServerHostIdentity {
  hostId: string;
  generation: number;
  pid: number | null;
  cwd: string;
}

export interface CodexAppServerHostSnapshot extends CodexAppServerHostIdentity {
  state: "starting" | "healthy" | "busy" | "unhealthy" | "stopped";
  initialized: boolean;
  childBindingCount: number;
  lastError?: string;
}

export interface CodexAppServerHostHandlers {
  onLine(line: string): void;
  onStderr(text: string): void;
  onExit(error: Error): void;
}

export interface CodexAppServerHostLease extends CodexAppServerHostIdentity {
  request(method: string, params: Record<string, unknown>, options?: CodexAppServerRequestOptions): Promise<Record<string, unknown>>;
  notify(method: string, params: Record<string, unknown>): void;
  respond(id: number, result: Record<string, unknown>): void;
  bindChild(parentThreadId: string, childThreadId: string): void;
  assertChild(parentThreadId: string, childThreadId: string): void;
  closeChild(parentThreadId: string, childThreadId: string): void;
  setActiveTurn(threadId: string, turnId: string): void;
  clearActiveTurn(threadId: string, turnId: string): void;
  release(): void;
}

export interface CodexAppServerChildControl extends CodexAppServerHostIdentity {
  parentThreadId: string;
  parentTurnId: string;
  request(method: string, params: Record<string, unknown>, options?: CodexAppServerRequestOptions): Promise<Record<string, unknown>>;
  closeChild(): void;
  release(): void;
}

interface PendingRequest {
  method: string;
  resolve(value: Record<string, unknown>): void;
  reject(error: Error): void;
}

export interface CodexAppServerRequestOptions {
  timeoutMs?: number;
  resolveOn?: Promise<void>;
}

export class CodexAppServerRequestTimeoutError extends Error {
  constructor(readonly method: string, readonly timeoutMs: number) {
    super(`Codex app-server ${method} request timed out after ${timeoutMs}ms.`);
    this.name = "CodexAppServerRequestTimeout";
  }
}

export class CodexAppServerJsonRpcError extends Error {
  readonly code: number | null;
  readonly data: unknown;
  readonly rpcMessage: string;

  constructor(readonly method: string, error: Record<string, unknown>) {
    const rpcMessage = boundedRpcErrorMessage(error);
    super(rpcMessage);
    this.name = "CodexAppServerJsonRpcError";
    this.code = typeof error.code === "number" ? error.code : null;
    this.data = error.data;
    this.rpcMessage = rpcMessage;
  }
}

function boundedRpcErrorMessage(error: Record<string, unknown>): string {
  const message = typeof error.message === "string" ? error.message : JSON.stringify(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

export class CodexAppServerHost {
  readonly hostId: string;
  readonly cwd: string;
  private child: ChildProcess | null = null;
  private generation = 0;
  private initialized = false;
  private busy = false;
  private starting: Promise<void> | null = null;
  private handlers: CodexAppServerHostHandlers | null = null;
  private readonly auxiliaryHandlers = new Map<CodexAppServerHostHandlers, { parentThreadId: string; childThreadId: string }>();
  private lineBuffer = "";
  private requestId = 1;
  private pending = new Map<number, PendingRequest>();
  private childParents = new Map<string, string>();
  private closedChildParents = new Map<string, string>();
  private lastError: string | undefined;
  private activeThreadId: string | null = null;
  private activeTurnId: string | null = null;
  private activeLeaseCount = 0;
  private readonly drainWaiters = new Set<() => void>();

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
    this.hostId = `codex-host-${createHash("sha256").update(normalizeHostKey(this.cwd)).digest("hex").slice(0, 12)}`;
  }

  async acquire(handlers: CodexAppServerHostHandlers): Promise<CodexAppServerHostLease> {
    if (this.busy) throw conflict(`Codex app-server Host ${this.hostId} is already executing a Turn.`);
    this.busy = true;
    this.handlers = handlers;
    try {
      await this.ensureStarted();
    } catch (error) {
      this.busy = false;
      this.handlers = null;
      throw error;
    }
    const generation = this.generation;
    this.activeLeaseCount += 1;
    let released = false;
    return {
      hostId: this.hostId,
      generation,
      pid: this.child?.pid ?? null,
      cwd: this.cwd,
      request: (method, params, options) => this.request(method, params, generation, options),
      notify: (method, params) => this.notify(method, params, generation),
      respond: (id, result) => this.respond(id, result, generation),
      bindChild: (parentThreadId, childThreadId) => this.bindChild(parentThreadId, childThreadId, generation),
      assertChild: (parentThreadId, childThreadId) => this.assertChild(parentThreadId, childThreadId, generation),
      closeChild: (parentThreadId, childThreadId) => this.closeChild(parentThreadId, childThreadId, generation),
      setActiveTurn: (threadId, turnId) => {
        this.assertGeneration(generation);
        this.activeThreadId = threadId;
        this.activeTurnId = turnId;
      },
      clearActiveTurn: (threadId, turnId) => {
        if (generation === this.generation && this.activeThreadId === threadId && this.activeTurnId === turnId) {
          this.activeThreadId = null;
          this.activeTurnId = null;
        }
      },
      release: () => {
        if (released) return;
        released = true;
        this.releaseLease();
        if (generation === this.generation) {
          this.handlers = null;
          this.busy = false;
        }
      },
    };
  }

  async requestMetadata(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.ensureStarted();
    return this.request(method, params, this.generation);
  }

  acquireActiveChildControl(parentThreadId: string, childThreadId: string, handlers: CodexAppServerHostHandlers): CodexAppServerChildControl {
    const generation = this.generation;
    this.assertChild(parentThreadId, childThreadId, generation);
    if (!this.busy || this.activeThreadId !== parentThreadId || !this.activeTurnId) {
      throw conflict(`Codex parent ${parentThreadId} has no active Turn in Host ${this.hostId}.`);
    }
    if (this.auxiliaryHandlers.size > 0) {
      throw conflict(`Codex app-server Host ${this.hostId} is already controlling a Child Agent.`);
    }
    this.auxiliaryHandlers.set(handlers, { parentThreadId, childThreadId });
    this.activeLeaseCount += 1;
    let released = false;
    return {
      hostId: this.hostId,
      generation,
      pid: this.child?.pid ?? null,
      cwd: this.cwd,
      parentThreadId,
      parentTurnId: this.activeTurnId,
      request: (method, params, options) => this.request(method, params, generation, options),
      closeChild: () => this.closeChild(parentThreadId, childThreadId, generation),
      release: () => {
        if (released) return;
        released = true;
        this.auxiliaryHandlers.delete(handlers);
        this.releaseLease();
      },
    };
  }

  snapshot(): CodexAppServerHostSnapshot {
    return {
      hostId: this.hostId,
      generation: this.generation,
      pid: this.child?.pid ?? null,
      cwd: this.cwd,
      state: this.child
        ? this.busy ? "busy" : this.initialized ? "healthy" : "starting"
        : this.lastError ? "unhealthy" : "stopped",
      initialized: this.initialized,
      childBindingCount: this.childParents.size,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  hasLiveChild(parentThreadId: string, childThreadId: string): boolean {
    return Boolean(this.child && this.initialized && this.childParents.get(childThreadId) === parentThreadId);
  }

  hasClosedChild(parentThreadId: string, childThreadId: string): boolean {
    return Boolean(this.child && this.initialized && this.closedChildParents.get(childThreadId) === parentThreadId);
  }

  dispose(reason = "Codex app-server Host was explicitly cleaned up."): void {
    const error = new Error(reason);
    const child = this.child;
    const handlers = this.handlers;
    const auxiliaryHandlers = [...this.auxiliaryHandlers.keys()];
    this.generation += 1;
    this.child = null;
    this.initialized = false;
    this.busy = false;
    this.handlers = null;
    this.auxiliaryHandlers.clear();
    this.activeThreadId = null;
    this.activeTurnId = null;
    this.childParents.clear();
    this.closedChildParents.clear();
    this.rejectPending(error);
    try {
      if (handlers) notifyExitSafely(handlers, error);
      for (const auxiliary of auxiliaryHandlers) notifyExitSafely(auxiliary, error);
    } finally {
      terminateProcessTree(child);
    }
  }

  waitForDrain(): Promise<void> {
    if (this.activeLeaseCount === 0) return Promise.resolve();
    return new Promise<void>((resolvePromise) => this.drainWaiters.add(resolvePromise));
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && this.initialized) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async start(): Promise<void> {
    this.generation += 1;
    this.initialized = false;
    this.lastError = undefined;
    this.lineBuffer = "";
    this.requestId = 1;
    this.childParents.clear();
    this.closedChildParents.clear();
    const generation = this.generation;
    const child = spawn(resolveCodexExecutable(), [...codexRuntimeConfigArgs(), "app-server", "--listen", "stdio://"], {
      cwd: this.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout?.on("data", (chunk: Buffer) => {
      if (generation !== this.generation) return;
      this.lineBuffer += chunk.toString("utf8");
      this.drainLines();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (generation !== this.generation) return;
      const text = chunk.toString("utf8");
      this.handlers?.onStderr(text);
      for (const handlers of this.auxiliaryHandlers.keys()) handlers.onStderr(text);
    });
    child.on("error", (error: Error) => this.failGeneration(error, generation));
    child.on("close", (code: number | null) => {
      this.failGeneration(new Error(`Codex app-server Host exited with ${code}.`), generation);
    });
    try {
      await withTimeout(this.request("initialize", {
        capabilities: { experimentalApi: true },
        clientInfo: { name: "agent-harness-orchestrator", title: "Agent Harness Orchestrator", version: "0.1.0" },
      }, generation), 5_000, "Codex app-server initialize timed out.");
      this.notify("initialized", {}, generation);
      this.initialized = true;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.failGeneration(failure, generation);
      terminateProcessTree(child);
      throw failure;
    }
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    generation: number,
    options: CodexAppServerRequestOptions = {},
  ): Promise<Record<string, unknown>> {
    this.assertGeneration(generation);
    const stdin = this.child?.stdin;
    if (!stdin?.writable) return Promise.reject(new Error("Codex app-server Host stdin is not writable."));
    const id = this.requestId++;
    stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timeoutMs = options.timeoutMs;
      const timer = typeof timeoutMs === "number" && timeoutMs > 0
        ? setTimeout(() => {
          const pending = this.pending.get(id);
          if (!pending) return;
          this.pending.delete(id);
          pending.reject(new CodexAppServerRequestTimeoutError(method, timeoutMs));
        }, timeoutMs)
        : null;
      this.pending.set(id, {
        method,
        resolve: (value) => {
          if (timer) clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          if (timer) clearTimeout(timer);
          reject(error);
        },
      });
      void options.resolveOn?.then(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.resolve({});
      });
    });
  }

  private notify(method: string, params: Record<string, unknown>, generation: number): void {
    this.assertGeneration(generation);
    if (!this.child?.stdin?.writable) throw new Error("Codex app-server Host stdin is not writable.");
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  private respond(id: number, result: Record<string, unknown>, generation: number): void {
    this.assertGeneration(generation);
    if (!this.child?.stdin?.writable) throw new Error("Codex app-server Host stdin is not writable.");
    this.child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  private bindChild(parentThreadId: string, childThreadId: string, generation: number): void {
    this.assertGeneration(generation);
    const closedParent = this.closedChildParents.get(childThreadId);
    if (closedParent) {
      if (closedParent !== parentThreadId) throw new Error(`Codex Child ${childThreadId} has conflicting parent lineage.`);
      throw stale(`Codex Child ${childThreadId} was closed in Host ${this.hostId} generation ${generation}.`);
    }
    const existing = this.childParents.get(childThreadId);
    if (existing && existing !== parentThreadId) throw new Error(`Codex Child ${childThreadId} has conflicting parent lineage.`);
    this.childParents.set(childThreadId, parentThreadId);
  }

  private assertChild(parentThreadId: string, childThreadId: string, generation: number): void {
    this.assertGeneration(generation);
    const closedParent = this.closedChildParents.get(childThreadId);
    if (closedParent && closedParent !== parentThreadId) {
      throw new Error(`Codex Child ${childThreadId} has conflicting parent lineage.`);
    }
    if (this.childParents.get(childThreadId) !== parentThreadId) {
      throw stale(`Codex Child ${childThreadId} is not available in Host ${this.hostId} generation ${generation}.`);
    }
  }

  private closeChild(parentThreadId: string, childThreadId: string, generation: number): void {
    this.assertGeneration(generation);
    const closedParent = this.closedChildParents.get(childThreadId);
    if (closedParent) {
      if (closedParent !== parentThreadId) throw new Error(`Codex Child ${childThreadId} has conflicting parent lineage.`);
      return;
    }
    this.assertChild(parentThreadId, childThreadId, generation);
    this.childParents.delete(childThreadId);
    this.closedChildParents.set(childThreadId, parentThreadId);
  }

  private drainLines(): void {
    for (;;) {
      const newline = this.lineBuffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.lineBuffer.slice(0, newline).trim();
      this.lineBuffer = this.lineBuffer.slice(newline + 1);
      if (!line) continue;
      let payload: Record<string, unknown> | null = null;
      try {
        payload = JSON.parse(line) as Record<string, unknown>;
      } catch {
        this.handlers?.onLine(line);
        continue;
      }
      if (typeof payload.id === "number" && typeof payload.method !== "string") {
        const pending = this.pending.get(payload.id);
        if (pending) {
          this.pending.delete(payload.id);
          if (isRecord(payload.error)) pending.reject(new CodexAppServerJsonRpcError(pending.method, payload.error));
          else pending.resolve(isRecord(payload.result) ? payload.result : payload);
          continue;
        }
      }
      if (this.auxiliaryHandlers.size > 0) {
        for (const handlers of this.auxiliaryHandlers.keys()) handlers.onLine(line);
        if (isParentTurnTerminal(payload, this.auxiliaryHandlers.values())) this.handlers?.onLine(line);
      } else {
        this.handlers?.onLine(line);
      }
    }
  }

  private failGeneration(error: Error, generation: number): void {
    if (generation !== this.generation) return;
    this.lastError = error.message;
    this.initialized = false;
    this.child = null;
    this.childParents.clear();
    this.closedChildParents.clear();
    this.rejectPending(error);
    const handlers = this.handlers;
    const auxiliaryHandlers = [...this.auxiliaryHandlers.keys()];
    this.handlers = null;
    this.auxiliaryHandlers.clear();
    this.busy = false;
    this.activeThreadId = null;
    this.activeTurnId = null;
    handlers?.onExit(error);
    for (const auxiliary of auxiliaryHandlers) auxiliary.onExit(error);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private releaseLease(): void {
    this.activeLeaseCount = Math.max(0, this.activeLeaseCount - 1);
    if (this.activeLeaseCount !== 0) return;
    for (const resolvePromise of this.drainWaiters) resolvePromise();
    this.drainWaiters.clear();
  }

  private assertGeneration(generation: number): void {
    if (generation !== this.generation || !this.child) {
      throw stale(`Codex app-server Host ${this.hostId} generation ${generation} is stale.`);
    }
  }
}

export class CodexAppServerHostRegistry {
  private readonly hosts = new Map<string, CodexAppServerHost>();
  private readonly projectHostKeys = new Map<string, Set<string>>();
  private readonly projectIdByHostKey = new Map<string, string>();

  hostFor(cwd: string): CodexAppServerHost {
    const key = normalizeHostKey(cwd);
    let host = this.hosts.get(key);
    if (!host) {
      host = new CodexAppServerHost(cwd);
      this.hosts.set(key, host);
    }
    return host;
  }

  hostForProject(projectId: string, cwd: string): CodexAppServerHost {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) throw new Error("Codex project Host ownership requires a project id.");
    const key = normalizeHostKey(cwd);
    const existingOwner = this.projectIdByHostKey.get(key);
    if (existingOwner && existingOwner !== normalizedProjectId) {
      throw conflict(`Codex app-server Host ${key} is already owned by project ${existingOwner}.`);
    }
    const projectKeys = this.projectHostKeys.get(normalizedProjectId) ?? new Set<string>();
    projectKeys.add(key);
    this.projectHostKeys.set(normalizedProjectId, projectKeys);
    this.projectIdByHostKey.set(key, normalizedProjectId);
    return this.hostFor(cwd);
  }

  snapshots(): CodexAppServerHostSnapshot[] {
    return [...this.hosts.values()].map((host) => host.snapshot());
  }

  hasLiveChild(cwd: string, parentThreadId: string, childThreadId: string): boolean {
    return this.hosts.get(normalizeHostKey(cwd))?.hasLiveChild(parentThreadId, childThreadId) ?? false;
  }

  hasClosedChild(cwd: string, parentThreadId: string, childThreadId: string): boolean {
    return this.hosts.get(normalizeHostKey(cwd))?.hasClosedChild(parentThreadId, childThreadId) ?? false;
  }

  dispose(cwd: string, reason?: string): void {
    const key = normalizeHostKey(cwd);
    this.hosts.get(key)?.dispose(reason);
    this.hosts.delete(key);
    this.unbindHostKey(key);
  }

  async disposeProject(projectId: string, reason?: string): Promise<void> {
    const keys = [...(this.projectHostKeys.get(projectId) ?? [])];
    const hosts = keys.flatMap((key) => {
      const host = this.hosts.get(key);
      return host ? [host] : [];
    });
    for (const host of hosts) host.dispose(reason);
    for (const key of keys) {
      this.hosts.delete(key);
      this.unbindHostKey(key);
    }
    await Promise.all(hosts.map((host) => host.waitForDrain()));
  }

  disposeAll(reason?: string): void {
    for (const host of this.hosts.values()) host.dispose(reason);
    this.hosts.clear();
    this.projectHostKeys.clear();
    this.projectIdByHostKey.clear();
  }

  private unbindHostKey(key: string): void {
    const projectId = this.projectIdByHostKey.get(key);
    if (!projectId) return;
    this.projectIdByHostKey.delete(key);
    const projectKeys = this.projectHostKeys.get(projectId);
    projectKeys?.delete(key);
    if (projectKeys?.size === 0) this.projectHostKeys.delete(projectId);
  }
}

export const defaultCodexAppServerHostRegistry = new CodexAppServerHostRegistry();

function normalizeHostKey(cwd: string): string {
  const normalized = resolve(cwd);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isParentTurnTerminal(
  payload: Record<string, unknown>,
  controls: Iterable<{ parentThreadId: string }>,
): boolean {
  if (payload.method !== "turn/completed" && payload.method !== "turn/failed") return false;
  const params = isRecord(payload.params) ? payload.params : {};
  const threadId = typeof params.threadId === "string"
    ? params.threadId
    : typeof params.thread_id === "string" ? params.thread_id : null;
  if (!threadId) return false;
  for (const control of controls) if (control.parentThreadId === threadId) return true;
  return false;
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}

function stale(message: string): Error {
  const error = new Error(message);
  error.name = "StaleProviderSession";
  return error;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

function terminateProcessTree(child: ChildProcess | null): void {
  if (!child) return;
  if (process.platform === "win32" && child.pid && typeof child.spawnfile === "string") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  }
  child.kill();
}

function notifyExitSafely(handlers: CodexAppServerHostHandlers, error: Error): void {
  try {
    handlers.onExit(error);
  } catch {
    // Runtime shutdown must not be prevented by a consumer callback.
  }
}
