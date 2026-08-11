import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

export function canonicalPathIdentity(path: string): string {
  const absolute = resolve(path);
  const canonical = existsSync(absolute) ? realpathSync.native(absolute) : absolute;
  return normalizeForIdentity(canonical);
}

export function skillPathIdentity(path: string): string {
  const absolute = resolve(path);
  const entry = basename(absolute).toLowerCase() === "skill.md" ? absolute : join(absolute, "SKILL.md");
  return canonicalPathIdentity(entry);
}

export function sameSkillPath(left: string, right: string): boolean {
  return skillPathIdentity(left) === skillPathIdentity(right);
}

export function canonicalExistingSkillEntryPath(path: string): string {
  if (!isAbsolute(path)) throw new Error("Skill path must be absolute: " + path);
  let entry = resolve(path);
  if (!existsSync(entry)) throw new Error("Skill path does not exist: " + entry);
  if (statSync(entry).isDirectory()) entry = join(entry, "SKILL.md");
  if (basename(entry).toLowerCase() !== "skill.md" || !existsSync(entry) || !statSync(entry).isFile()) {
    throw new Error("Skill path must identify an existing SKILL.md file: " + entry);
  }
  return realpathSync.native(entry);
}

function normalizeForIdentity(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
