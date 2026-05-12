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
}

export interface ProcessExecutionResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutSample: string;
  stderrSample: string;
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

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutSample = appendSample(stdoutSample, text, maxStdout);
      stdoutStream.write(text);
      mirrorStdoutStream?.write(text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrSample = appendSample(stderrSample, text, maxCapturedStderrBytes);
      stderrStream.write(text);
    });

    child.on("error", (error) => {
      const message = `${error.message}\n`;
      stderrSample = appendSample(stderrSample, message, maxCapturedStderrBytes);
      stderrStream.write(message);
      settle(1, null);
    });

    child.on("close", (code, signal) => {
      settle(code, signal);
    });

    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin);
    }
    child.stdin?.end();

    let settled = false;
    function settle(exitCode: number | null, signal: NodeJS.Signals | null): void {
      if (settled) return;
      settled = true;
      stdoutStream.end();
      stderrStream.end();
      mirrorStdoutStream?.end();
      void Promise.all([
        finished(stdoutStream),
        finished(stderrStream),
        mirrorStdoutStream ? finished(mirrorStdoutStream) : Promise.resolve(),
      ]).then(() => resolve({ exitCode, signal, stdoutSample, stderrSample }));
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
