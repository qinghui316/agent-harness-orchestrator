import { realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

export interface ResolvedSkillPathIdentity {
  canonicalPath: string;
  identity: string;
}

export type SkillPathIdentityResult =
  | { ok: true; value: ResolvedSkillPathIdentity }
  | { ok: false; code: "skill_path_invalid" | "skill_path_unavailable"; message: string };

export function canonicalPathIdentity(path: string): string {
  const absolute = resolve(path);
  try {
    return normalizeForIdentity(realpathSync.native(absolute));
  } catch {
    return normalizeForIdentity(absolute);
  }
}

export function resolveSkillPathIdentity(path: string): SkillPathIdentityResult {
  if (!isAbsolute(path)) {
    return { ok: false, code: "skill_path_invalid", message: "Skill path must be absolute: " + path };
  }
  try {
    let entry = resolve(path);
    if (statSync(entry).isDirectory()) entry = join(entry, "SKILL.md");
    if (basename(entry).toLowerCase() !== "skill.md" || !statSync(entry).isFile()) {
      return {
        ok: false,
        code: "skill_path_invalid",
        message: "Skill path must identify an existing SKILL.md file: " + entry,
      };
    }
    const canonicalPath = realpathSync.native(entry);
    if (!statSync(canonicalPath).isFile()) {
      return {
        ok: false,
        code: "skill_path_invalid",
        message: "Skill path does not resolve to a file: " + entry,
      };
    }
    return {
      ok: true,
      value: { canonicalPath, identity: normalizeForIdentity(canonicalPath) },
    };
  } catch (error) {
    return {
      ok: false,
      code: "skill_path_unavailable",
      message: "Skill path is unavailable: " + path + "; " + errorMessage(error),
    };
  }
}

export function skillPathIdentity(path: string): string {
  const resolved = resolveSkillPathIdentity(path);
  if (resolved.ok) return resolved.value.identity;
  return lexicalSkillEntryPathIdentity(path);
}

export function lexicalSkillEntryPathIdentity(path: string): string {
  const absolute = resolve(path);
  const entry = basename(absolute).toLowerCase() === "skill.md" ? absolute : join(absolute, "SKILL.md");
  return normalizeForIdentity(entry);
}

export function legacySkillPathIdentity(path: string): string {
  return normalizeForIdentity(resolve(path));
}

export function sameSkillPath(left: string, right: string): boolean {
  return skillPathIdentity(left) === skillPathIdentity(right);
}

function normalizeForIdentity(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
