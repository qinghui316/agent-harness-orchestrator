import { homedir, platform } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

export function getAhoHome(): string {
  return process.env.AHO_HOME ? resolve(process.env.AHO_HOME) : resolve(homedir(), ".agent-harness");
}

export function slugify(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "project";
}

export function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

export async function resolveExistingDirectory(input: string): Promise<string> {
  const absolute = resolve(input);
  const info = await stat(absolute);
  if (!info.isDirectory()) {
    throw new Error(`Path is not a directory: ${absolute}`);
  }
  return realpath(absolute);
}

export function normalizeForCompare(path: string): string {
  const normalized = resolve(path);
  return platform() === "win32" ? normalized.toLowerCase() : normalized;
}

export async function resolvePhysicalPathIdentity(path: string): Promise<string> {
  const absolute = resolve(path);
  const missing: string[] = [];
  let current = absolute;
  while (true) {
    try {
      const physical = await realpath(current);
      return normalizeForCompare(resolve(physical, ...missing));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

export function defaultProjectName(path: string): string {
  return basename(resolve(path));
}
