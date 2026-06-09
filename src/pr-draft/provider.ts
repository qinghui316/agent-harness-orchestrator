import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { getGitBranch, gitText } from "../project/git.js";
import type { ManagedProject } from "../types/index.js";
import type { RemoteProviderCapability } from "./types.js";

const execFileAsync = promisify(execFile);

export async function detectRemoteProviderCapability(project: ManagedProject): Promise<RemoteProviderCapability> {
  const base = {
    provider: "github-cli" as const,
    setupHint: "配置 Git remote、安装 GitHub CLI，并运行 gh auth login 后才能创建 Draft PR。",
  };
  const currentBranch = await getGitBranch(project.path).catch(() => null);
  const insideGit = await commandOk("git", ["rev-parse", "--is-inside-work-tree"], project.path);
  if (!insideGit) {
    return { ...base, status: "not-git", ready: false, currentBranch, reason: "当前项目不是 Git 仓库。" };
  }
  const remotes = (await gitText(project.path, ["remote"]).catch(() => "")).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (remotes.length === 0) {
    return { ...base, status: "no-remote", ready: false, currentBranch, reason: "当前项目没有配置 Git remote。" };
  }
  const remoteName = remotes.includes("origin") ? "origin" : remotes[0];
  const remoteUrl = await gitText(project.path, ["remote", "get-url", remoteName]).then((value) => value.trim()).catch(() => undefined);
  const gh = githubCliCommand();
  const ghArgs = githubCliArgs();
  const hasGh = await commandOk(gh, [...ghArgs, "--version"], project.path);
  if (!hasGh) {
    return { ...base, status: "no-gh", ready: false, currentBranch, remoteName, remoteUrl, reason: "未检测到 GitHub CLI gh。" };
  }
  const hasAuth = await commandOk(gh, [...ghArgs, "auth", "status"], project.path);
  if (!hasAuth) {
    return { ...base, status: "no-auth", ready: false, currentBranch, remoteName, remoteUrl, reason: "GitHub CLI 尚未完成认证或当前仓库无权限。" };
  }
  return {
    ...base,
    status: "ready",
    ready: true,
    currentBranch,
    remoteName,
    remoteUrl,
    reason: "GitHub CLI provider ready.",
    setupHint: "远端 Draft PR 能力可用。",
  };
}

export function githubCliCommand(): string {
  if (process.env.AHO_GH_COMMAND) return process.env.AHO_GH_COMMAND;
  const portable = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "GitHub CLI Portable", "bin", "gh.exe") : "";
  return portable && existsSync(portable) ? portable : "gh";
}

export function githubCliArgs(): string[] {
  const raw = process.env.AHO_GH_COMMAND_ARGS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
  } catch {
    // Simple local overrides can still be space-delimited.
  }
  return raw.split(/\s+/).filter(Boolean);
}

export async function commandText(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

async function commandOk(command: string, args: string[], cwd: string): Promise<boolean> {
  try {
    await commandText(command, args, cwd);
    return true;
  } catch {
    return false;
  }
}
