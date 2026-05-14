import { executeProcessStreaming } from "../run/process.js";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

export type ApprovalFlagPlacement = "root" | "exec" | "unsupported";

export interface CodexCapabilities {
  available: boolean;
  version: string | null;
  approvalFlagPlacement: ApprovalFlagPlacement;
  supportsJson: boolean;
  supportsSandbox: boolean;
  supportsCd: boolean;
  supportsAddDir: boolean;
  supportsColor: boolean;
  supportsOutputLastMessage: boolean;
  errors: string[];
}

export interface CodexArgv {
  command: "codex";
  args: string[];
}

export interface CodexArgvOptions {
  projectPath: string;
  lastMessagePath: string;
  model?: string;
  profile?: string;
  additionalReadDirs?: string[];
}

export function evaluateCodexCapabilities(versionOutput: string | null, rootHelp: string | null, execHelp: string | null, spawnError?: string): CodexCapabilities {
  const errors: string[] = [];
  if (spawnError) errors.push(spawnError);

  const available = !spawnError && rootHelp !== null && execHelp !== null;
  const approvalFlagPlacement: ApprovalFlagPlacement =
    includesFlag(execHelp, "--ask-for-approval") ? "exec" :
      includesFlag(rootHelp, "--ask-for-approval") ? "root" :
        "unsupported";

  const supportsJson = includesFlag(execHelp, "--json");
  const supportsSandbox = includesFlag(execHelp, "--sandbox");
  const supportsCd = includesFlag(execHelp, "--cd") || includesFlag(execHelp, "-C, --cd");
  const supportsAddDir = includesFlag(execHelp, "--add-dir");
  const supportsColor = includesFlag(execHelp, "--color");
  const supportsOutputLastMessage = includesFlag(execHelp, "--output-last-message");

  if (!available) errors.push("Codex CLI is not available on PATH.");
  if (!supportsJson) errors.push("Codex exec does not support --json.");
  if (!supportsSandbox) errors.push("Codex exec does not support --sandbox.");
  if (!supportsCd) errors.push("Codex exec does not support --cd.");

  return {
    available,
    version: versionOutput?.trim() || null,
    approvalFlagPlacement,
    supportsJson,
    supportsSandbox,
    supportsCd,
    supportsAddDir,
    supportsColor,
    supportsOutputLastMessage,
    errors,
  };
}

export async function detectCodexCapabilities(): Promise<CodexCapabilities> {
  let version: string | null = null;
  let rootHelp: string | null = null;
  let execHelp: string | null = null;
  let spawnError: string | undefined;

  try {
    version = await captureCodexHelp(["--version"]);
    rootHelp = await captureCodexHelp(["--help"]);
    execHelp = await captureCodexHelp(["exec", "--help"]);
  } catch (error) {
    spawnError = `Failed to inspect Codex CLI: ${(error as Error).message}`;
  }

  return evaluateCodexCapabilities(version, rootHelp, execHelp, spawnError);
}

export function assertCodexSafeToRun(capabilities: CodexCapabilities): void {
  const blocking = capabilities.errors.filter((error) =>
    error.includes("not available") ||
    error.includes("--json") ||
    error.includes("--sandbox") ||
    error.includes("--cd"),
  );
  if (blocking.length > 0) {
    throw new Error(`Codex CLI does not support safe read-only non-interactive execution:\n${blocking.map((item) => `- ${item}`).join("\n")}`);
  }
}

export function buildCodexReadonlyArgv(capabilities: CodexCapabilities, options: CodexArgvOptions): CodexArgv {
  assertCodexSafeToRun(capabilities);

  const args: string[] = [];
  if (capabilities.approvalFlagPlacement === "root") {
    args.push("--ask-for-approval", "never");
  }

  args.push("exec");

  if (capabilities.approvalFlagPlacement === "exec") {
    args.push("--ask-for-approval", "never");
  }

  args.push("--json");
  if (capabilities.supportsColor) args.push("--color", "never");
  args.push("--sandbox", "read-only");
  args.push("--cd", options.projectPath);
  if (capabilities.supportsAddDir) {
    for (const dir of options.additionalReadDirs ?? []) {
      args.push("--add-dir", dir);
    }
  }
  if (capabilities.supportsOutputLastMessage) args.push("--output-last-message", options.lastMessagePath);
  if (options.model) args.push("--model", options.model);
  if (options.profile) args.push("--profile", options.profile);
  args.push("-");

  return { command: "codex", args };
}

export function buildCodexWorkspaceWriteArgv(capabilities: CodexCapabilities, options: CodexArgvOptions): CodexArgv {
  assertCodexSafeToRun(capabilities);

  const args: string[] = [];
  if (capabilities.approvalFlagPlacement === "root") {
    args.push("--ask-for-approval", "never");
  }

  args.push("exec");

  if (capabilities.approvalFlagPlacement === "exec") {
    args.push("--ask-for-approval", "never");
  }

  args.push("--json");
  if (capabilities.supportsColor) args.push("--color", "never");
  args.push("--sandbox", "workspace-write");
  args.push("--cd", options.projectPath);
  if (capabilities.supportsOutputLastMessage) args.push("--output-last-message", options.lastMessagePath);
  if (options.model) args.push("--model", options.model);
  if (options.profile) args.push("--profile", options.profile);
  args.push("-");

  return { command: "codex", args };
}

async function captureCodexHelp(args: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aho-codex-help-"));
  const stdoutPath = join(dir, "stdout.log");
  const stderrPath = join(dir, "stderr.log");
  try {
    const result = await executeProcessStreaming({
      cwd: process.cwd(),
      command: "codex",
      args,
      stdoutPath,
      stderrPath,
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderrSample || `codex ${args.join(" ")} exited with ${result.exitCode}`);
    }
    return result.stdoutSample;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function includesFlag(help: string | null, flag: string): boolean {
  return help?.includes(flag) ?? false;
}
