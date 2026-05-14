import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

export async function gitText(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

export async function gitRaw(cwd: string, args: string[]): Promise<Buffer> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "buffer", maxBuffer: 50 * 1024 * 1024 });
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    await git(path, ["rev-parse", "--show-toplevel"]);
    return true;
  } catch {
    return false;
  }
}

export async function getGitBranch(path: string): Promise<string | null> {
  try {
    return await git(path, ["branch", "--show-current"]);
  } catch {
    return null;
  }
}

export async function isGitDirty(path: string): Promise<boolean | null> {
  try {
    return (await getGitStatusShort(path)).length > 0;
  } catch {
    return null;
  }
}

export async function getGitStatusShort(path: string): Promise<string[]> {
  const output = await git(path, ["status", "--short"]);
  return output ? output.split(/\r?\n/) : [];
}

export async function getGitCommit(path: string, ref = "HEAD"): Promise<string | null> {
  try {
    return await git(path, ["rev-parse", "--verify", ref]);
  } catch {
    return null;
  }
}

export async function hasGitCommits(path: string): Promise<boolean> {
  return (await getGitCommit(path)) !== null;
}
