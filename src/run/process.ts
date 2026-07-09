import spawn from "cross-spawn";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { finished } from "node:stream/promises";

export interface ProcessExecutionOptions {
  cwd: string;
  command: string;
  args: string[];
  stdin?: string;
  stdoutPath: string;
  stderrPath: string;
  mirrorStdoutPath?: string;
  maxCapturedStdoutBytes?: number;
  onStdoutChunk?: (text: string) => void;
  onStderrChunk?: (text: string) => void;
  onCallbackError?: (stream: "stdout" | "stderr", error: unknown) => void;
  completionSignal?: () => boolean;
  stopSignal?: () => boolean;
  completionGraceMs?: number;
  timeoutMs?: number;
  killGraceMs?: number;
}

export type ProcessTerminationReason = "completion-grace-expired" | "timeout" | "process-error" | "user-stop";

export interface ProcessExecutionResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutSample: string;
  stderrSample: string;
  timedOut: boolean;
  terminated: boolean;
  terminationReason?: ProcessTerminationReason;
}

const defaultMaxCapturedStdoutBytes = 1024 * 1024;
const maxCapturedStderrBytes = 256 * 1024;

export async function executeProcessStreaming(options: ProcessExecutionOptions): Promise<ProcessExecutionResult> {
  await Promise.all([
    prepareLogFile(options.stdoutPath),
    prepareLogFile(options.stderrPath),
    options.mirrorStdoutPath ? prepareLogFile(options.mirrorStdoutPath) : Promise.resolve(),
  ]);

  return await new Promise((resolve) => {
    const stdoutStream = createWriteStream(options.stdoutPath, { flags: "a", encoding: "utf8" });
    const stderrStream = createWriteStream(options.stderrPath, { flags: "a", encoding: "utf8" });
    const mirrorStdoutStream = options.mirrorStdoutPath ? createWriteStream(options.mirrorStdoutPath, { flags: "a", encoding: "utf8" }) : null;
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const maxStdout = options.maxCapturedStdoutBytes ?? defaultMaxCapturedStdoutBytes;
    let stdoutSample = "";
    let stderrSample = "";
    let timedOut = false;
    let terminated = false;
    let terminationReason: ProcessTerminationReason | undefined;
    let completionGraceTimer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let killGraceTimer: NodeJS.Timeout | null = null;
    let completionPollTimer: NodeJS.Timeout | null = null;
    let stopPollTimer: NodeJS.Timeout | null = null;
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutSample = appendSample(stdoutSample, text, maxStdout);
      stdoutStream.write(text);
      mirrorStdoutStream?.write(text);
      invokeChunkCallback("stdout", text);
      checkCompletionSignal();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrSample = appendSample(stderrSample, text, maxCapturedStderrBytes);
      stderrStream.write(text);
      invokeChunkCallback("stderr", text);
    });

    child.on("error", (error) => {
      const message = `${error.message}\n`;
      stderrSample = appendSample(stderrSample, message, maxCapturedStderrBytes);
      stderrStream.write(message);
      terminationReason = terminationReason ?? "process-error";
      settle(1, null);
    });

    child.on("close", (code, signal) => {
      settle(code, signal);
    });

    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin);
    }
    child.stdin?.end();
    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        terminate("timeout");
      }, options.timeoutMs);
    }
    if (options.completionSignal) {
      completionPollTimer = setInterval(checkCompletionSignal, 250);
      checkCompletionSignal();
    }
    if (options.stopSignal) {
      stopPollTimer = setInterval(checkStopSignal, 250);
      checkStopSignal();
    }

    function settle(exitCode: number | null, signal: NodeJS.Signals | null): void {
      if (settled) return;
      settled = true;
      clearTimers();
      stdoutStream.end();
      stderrStream.end();
      mirrorStdoutStream?.end();
      void Promise.all([
        finished(stdoutStream),
        finished(stderrStream),
        mirrorStdoutStream ? finished(mirrorStdoutStream) : Promise.resolve(),
      ]).then(() => resolve({ exitCode, signal, stdoutSample, stderrSample, timedOut, terminated, terminationReason }));
    }

    function checkCompletionSignal(): void {
      if (settled || completionGraceTimer || !options.completionSignal) return;
      let complete = false;
      try {
        complete = options.completionSignal();
      } catch (error) {
        try {
          options.onCallbackError?.("stdout", error);
        } catch {
          // Completion callbacks are best-effort and must not affect process lifecycle.
        }
      }
      if (!complete) return;
      completionGraceTimer = setTimeout(() => {
        terminate("completion-grace-expired");
      }, options.completionGraceMs ?? 5000);
    }

    function terminate(reason: ProcessTerminationReason): void {
      if (settled || terminated) return;
      terminated = true;
      terminationReason = reason;
      void killChildProcess().finally(() => {
        if (settled) return;
        killGraceTimer = setTimeout(() => {
          settle(null, null);
        }, options.killGraceMs ?? 3000);
      });
    }

    async function killChildProcess(): Promise<void> {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (process.platform === "win32" && child.pid) {
        try {
          await runTaskkill(child.pid);
        } catch {
          try {
            child.kill();
          } catch {
            // Best-effort fallback.
          }
        }
        return;
      }
      try {
        child.kill();
      } catch {
        // Best-effort termination. The kill grace timer still settles the result.
      }
    }

    async function runTaskkill(pid: number): Promise<void> {
      await new Promise<void>((resolveTaskkill) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
          windowsHide: true,
          stdio: "ignore",
        });
        killer.on("error", () => resolveTaskkill());
        killer.on("close", () => resolveTaskkill());
      });
    }

    function clearTimers(): void {
      if (completionGraceTimer) clearTimeout(completionGraceTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killGraceTimer) clearTimeout(killGraceTimer);
      if (completionPollTimer) clearInterval(completionPollTimer);
      if (stopPollTimer) clearInterval(stopPollTimer);
    }

    function checkStopSignal(): void {
      if (settled || terminated || !options.stopSignal) return;
      let shouldStop = false;
      try {
        shouldStop = options.stopSignal();
      } catch (error) {
        try {
          options.onCallbackError?.("stderr", error);
        } catch {
          // Stop callbacks are best-effort and must not affect process lifecycle.
        }
      }
      if (shouldStop) terminate("user-stop");
    }

    function invokeChunkCallback(stream: "stdout" | "stderr", text: string): void {
      try {
        if (stream === "stdout") options.onStdoutChunk?.(text);
        else options.onStderrChunk?.(text);
      } catch (error) {
        try {
          options.onCallbackError?.(stream, error);
        } catch {
          // Live/progress callbacks are best-effort and must not affect process lifecycle.
        }
      }
    }
  });
}

async function prepareLogFile(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "", "utf8");
}

function appendSample(current: string, addition: string, maxBytes: number): string {
  const next = `${current}${addition}`;
  if (Buffer.byteLength(next, "utf8") <= maxBytes) return next;
  return next.slice(Math.max(0, next.length - maxBytes));
}
