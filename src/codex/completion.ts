import { existsSync, readFileSync } from "node:fs";
import type { CodexJsonlStreamEvent } from "./jsonl.js";

export interface CodexCompletionTrackerOptions {
  lastMessagePath?: string;
}

export interface CodexCompletionSnapshot {
  turnCompleted: boolean;
  finalTextCaptured: boolean;
  errorMessage?: string;
}

export interface CodexLifecycleTiming {
  completionGraceMs: number;
  killGraceMs: number;
  timeoutMs: number;
}

export class CodexCompletionTracker {
  private readonly lastMessagePath?: string;
  private turnCompleted = false;
  private finalText = "";
  private errorMessageValue: string | undefined;

  constructor(options: CodexCompletionTrackerOptions = {}) {
    this.lastMessagePath = options.lastMessagePath;
  }

  handleEvent(event: CodexJsonlStreamEvent): void {
    if (event.type === "turn_completed") {
      this.turnCompleted = true;
      return;
    }
    if (event.type === "text_delta") {
      this.finalText = `${this.finalText}${event.delta}`;
      return;
    }
    if (event.type === "error") {
      this.errorMessageValue = event.message;
    }
  }

  isComplete(): boolean {
    return this.turnCompleted && (this.hasFinalText() || this.hasLastMessageFile());
  }

  hasFinalText(): boolean {
    return this.finalText.trim().length > 0;
  }

  snapshot(): CodexCompletionSnapshot {
    return {
      turnCompleted: this.turnCompleted,
      finalTextCaptured: this.hasFinalText() || this.hasLastMessageFile(),
      errorMessage: this.errorMessageValue,
    };
  }

  private hasLastMessageFile(): boolean {
    if (!this.lastMessagePath || !existsSync(this.lastMessagePath)) return false;
    try {
      return readFileSync(this.lastMessagePath, "utf8").trim().length > 0;
    } catch {
      return false;
    }
  }
}

export function codexLifecycleTiming(defaultTimeoutMs: number): CodexLifecycleTiming {
  return {
    completionGraceMs: positiveIntegerFromEnv("AHO_CODEX_COMPLETION_GRACE_MS", 5000),
    killGraceMs: positiveIntegerFromEnv("AHO_CODEX_KILL_GRACE_MS", 3000),
    timeoutMs: positiveIntegerFromEnv("AHO_CODEX_TIMEOUT_MS", defaultTimeoutMs),
  };
}

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
