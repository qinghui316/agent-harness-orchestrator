import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
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
    return (await git(path, ["status", "--short"])).length > 0;
  } catch {
    return null;
  }
}
