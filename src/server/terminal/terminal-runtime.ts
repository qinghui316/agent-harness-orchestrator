import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { IPty, IDisposable } from "node-pty";

type NodePtyModule = typeof import("node-pty");

export type TerminalRuntimeEvent =
  | {
      type: "output";
      projectId: string;
      terminalId: string;
      data: string;
    }
  | {
      type: "exit";
      projectId: string;
      terminalId: string;
      exitCode: number;
      signal?: number;
    }
  | {
      type: "error";
      projectId: string;
      terminalId: string;
      message: string;
    };

export interface TerminalRuntimeOpenRequest {
  projectId: string;
  cwd: string;
  terminalId?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalRuntimeSessionInfo {
  projectId: string;
  terminalId: string;
  cwd: string;
  shell: string;
}

export interface TerminalRuntimeOptions {
  loadPty?: () => Promise<NodePtyModule>;
}

interface TerminalRuntimeSession extends TerminalRuntimeSessionInfo {
  pty: IPty;
  dataDisposable: IDisposable;
  exitDisposable: IDisposable;
  buffer: TerminalRuntimeEvent[];
}

const MAX_BUFFERED_EVENTS = 200;

export class TerminalRuntime {
  private readonly sessions = new Map<string, TerminalRuntimeSession>();
  private readonly emitter = new EventEmitter();
  private readonly loadPty: () => Promise<NodePtyModule>;

  constructor(options: TerminalRuntimeOptions = {}) {
    this.loadPty = options.loadPty ?? (() => import("node-pty"));
  }

  async open(request: TerminalRuntimeOpenRequest): Promise<TerminalRuntimeSessionInfo> {
    const projectId = normalizeRequiredId(request.projectId, "projectId");
    const terminalId = normalizeTerminalId(request.terminalId);
    const key = sessionKey(projectId, terminalId);
    const existing = this.sessions.get(key);
    if (existing) return sessionInfo(existing);

    const cwd = await resolveExistingDirectory(request.cwd);
    const cols = normalizeDimension(request.cols, 80);
    const rows = normalizeDimension(request.rows, 24);
    const shell = resolveShellPath();
    let ptyModule: NodePtyModule;
    try {
      ptyModule = await this.loadPty();
    } catch (cause) {
      throw terminalUnavailable(cause);
    }

    let pty: IPty;
    try {
      pty = ptyModule.spawn(shell, shellArgs(), {
        name: "xterm-256color",
        cwd,
        cols,
        rows,
        env: {
          ...process.env,
          TERM: "xterm-256color",
        },
      });
    } catch (cause) {
      throw terminalUnavailable(cause);
    }

    const session: TerminalRuntimeSession = {
      projectId,
      terminalId,
      cwd,
      shell,
      pty,
      buffer: [],
      dataDisposable: pty.onData((data) => {
        this.emitBuffered(session, { type: "output", projectId, terminalId, data });
      }),
      exitDisposable: pty.onExit(({ exitCode, signal }) => {
        this.emitBuffered(session, { type: "exit", projectId, terminalId, exitCode, signal });
        this.sessions.delete(key);
        disposeSession(session, false);
      }),
    };
    this.sessions.set(key, session);
    return sessionInfo(session);
  }

  write(projectId: string, terminalId: string, data: string): void {
    const session = this.requireSession(projectId, terminalId);
    session.pty.write(data);
  }

  resize(projectId: string, terminalId: string, cols: number, rows: number): void {
    const session = this.requireSession(projectId, terminalId);
    session.pty.resize(normalizeDimension(cols, 80), normalizeDimension(rows, 24));
  }

  close(projectId: string, terminalId: string): void {
    const key = sessionKey(projectId, terminalId);
    const session = this.sessions.get(key);
    if (!session) return;
    this.sessions.delete(key);
    disposeSession(session, true);
  }

  cleanupProject(projectId: string): void {
    const normalizedProjectId = normalizeRequiredId(projectId, "projectId");
    for (const session of [...this.sessions.values()]) {
      if (session.projectId === normalizedProjectId) this.close(session.projectId, session.terminalId);
    }
  }

  cleanup(): void {
    for (const session of [...this.sessions.values()]) {
      this.close(session.projectId, session.terminalId);
    }
    this.emitter.removeAllListeners();
  }

  hasSession(projectId: string, terminalId: string): boolean {
    return this.sessions.has(sessionKey(projectId, terminalId));
  }

  subscribe(projectId: string, terminalId: string, listener: (event: TerminalRuntimeEvent) => void): () => void {
    const session = this.requireSession(projectId, terminalId);
    for (const event of session.buffer) listener(event);
    const eventName = eventChannel(session.projectId, session.terminalId);
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }

  private requireSession(projectId: string, terminalId: string): TerminalRuntimeSession {
    const session = this.sessions.get(sessionKey(projectId, terminalId));
    if (!session) {
      const error = new Error("Terminal session not found.");
      error.name = "NotFound";
      throw error;
    }
    return session;
  }

  private emitBuffered(session: TerminalRuntimeSession, event: TerminalRuntimeEvent): void {
    session.buffer.push(event);
    if (session.buffer.length > MAX_BUFFERED_EVENTS) session.buffer.splice(0, session.buffer.length - MAX_BUFFERED_EVENTS);
    this.emitter.emit(eventChannel(session.projectId, session.terminalId), event);
  }
}

function normalizeRequiredId(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (normalized) return normalized;
  const error = new Error(`${label} is required.`);
  error.name = "BadRequest";
  throw error;
}

function normalizeTerminalId(value: string | undefined): string {
  const normalized = value?.trim() || `terminal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(normalized)) {
    const error = new Error("Terminal id contains unsupported characters.");
    error.name = "BadRequest";
    throw error;
  }
  return normalized;
}

function normalizeDimension(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(2, Math.min(500, Math.floor(value ?? fallback)));
}

async function resolveExistingDirectory(value: string): Promise<string> {
  const resolved = resolve(value);
  if (!existsSync(resolved)) {
    const error = new Error("Project path does not exist.");
    error.name = "BadRequest";
    throw error;
  }
  const entry = await stat(resolved);
  if (!entry.isDirectory()) {
    const error = new Error("Project path is not a directory.");
    error.name = "BadRequest";
    throw error;
  }
  return realpath(resolved);
}

function resolveShellPath(): string {
  if (process.platform === "win32") return process.env.ComSpec || process.env.COMSPEC || "powershell.exe";
  return process.env.SHELL || "/bin/sh";
}

function shellArgs(): string[] {
  return process.platform === "win32" ? [] : ["-i"];
}

function sessionKey(projectId: string, terminalId: string): string {
  return `${projectId}:${terminalId}`;
}

function eventChannel(projectId: string, terminalId: string): string {
  return `terminal:${projectId}:${terminalId}`;
}

function sessionInfo(session: TerminalRuntimeSession): TerminalRuntimeSessionInfo {
  return {
    projectId: session.projectId,
    terminalId: session.terminalId,
    cwd: session.cwd,
    shell: session.shell,
  };
}

function disposeSession(session: TerminalRuntimeSession, kill: boolean): void {
  session.dataDisposable.dispose();
  session.exitDisposable.dispose();
  if (kill) session.pty.kill();
}

function terminalUnavailable(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  const error = new Error(`Terminal runtime is unavailable: ${message}`);
  error.name = "ServiceUnavailable";
  return error;
}
