import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function windowsShortPath(path: string): Promise<string | null> {
  if (process.platform !== "win32") return null;
  const command = process.env.ComSpec ?? "cmd.exe";
  const { stdout } = await execFileAsync(command, ["/d", "/c", `for %I in (${path}) do @echo %~sI`], {
    windowsHide: true,
  });
  const value = stdout.trim().replace(/^"|"$/g, "");
  if (!value) throw new Error(`Windows did not return an 8.3-compatible path for ${path}.`);
  return value.toLowerCase() === path.toLowerCase() ? null : value;
}

export async function sameTestPhysicalPath(left: string, right: string): Promise<boolean> {
  const [leftPath, rightPath] = await Promise.all([realpath(left), realpath(right)]);
  const normalize = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  return normalize(leftPath) === normalize(rightPath);
}
