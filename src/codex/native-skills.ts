import { dirname, resolve } from "node:path";
import { z } from "zod";
import { hashNativeSkillPackageContent } from "../skill/content-hash.js";
import type {
  ProviderNativeSkill,
  ProviderSkillCatalogError,
  ProviderSkillCatalogSnapshot,
} from "../provider-runtime/contracts.js";
import { defaultCodexAppServerHostRegistry } from "./app-server-host.js";

interface CodexSkillMetadataRequester {
  requestMetadata(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface CodexNativeSkillClientOptions {
  requester?: CodexSkillMetadataRequester;
}

const codexSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  path: z.string().min(1),
  scope: z.enum(["user", "repo", "system", "admin"]),
  enabled: z.boolean(),
  interface: z.object({
    displayName: z.string().optional(),
    shortDescription: z.string().optional(),
  }).passthrough().optional(),
  dependencies: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const codexSkillErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
}).passthrough();

const codexSkillsListResponseSchema = z.object({
  data: z.array(z.object({
    cwd: z.string(),
    skills: z.array(codexSkillSchema),
    errors: z.array(codexSkillErrorSchema),
  }).passthrough()),
}).passthrough();

const codexSkillsConfigWriteResponseSchema = z.object({
  effectiveEnabled: z.boolean(),
}).passthrough();

export async function listCodexNativeSkills(
  input: { projectPath: string; extraRoots?: readonly string[]; forceReload?: boolean },
  options: CodexNativeSkillClientOptions = {},
): Promise<ProviderSkillCatalogSnapshot> {
  const projectPath = resolve(input.projectPath);
  const requester = options.requester ?? defaultCodexAppServerHostRegistry.hostFor(projectPath);
  const extraRoots = uniquePaths(input.extraRoots ?? []);
  await requester.requestMetadata("skills/extraRoots/set", { extraRoots });
  const response = codexSkillsListResponseSchema.parse(await requester.requestMetadata("skills/list", {
    cwds: [projectPath],
    forceReload: input.forceReload ?? false,
  }));
  const entries = response.data.filter((entry) => samePath(entry.cwd, projectPath));
  if (entries.length !== 1) {
    throw new Error(entries.length === 0
      ? `Codex skills/list did not return the requested project cwd: ${projectPath}`
      : `Codex skills/list returned duplicate entries for project cwd: ${projectPath}`);
  }

  const errors: ProviderSkillCatalogError[] = entries[0].errors.map((error) => ({
    path: error.path,
    message: error.message,
  }));
  const skills: ProviderNativeSkill[] = [];
  for (const skill of entries[0].skills) {
    try {
      const skillRoot = skill.path.toLowerCase().endsWith("skill.md") ? dirname(skill.path) : skill.path;
      const contentHash = await hashNativeSkillPackageContent(skillRoot);
      skills.push({
        name: skill.name,
        description: skill.description,
        path: skill.path,
        scope: skill.scope,
        enabled: skill.enabled,
        contentHash,
        ...(skill.interface ? {
          interface: {
            ...(skill.interface.displayName ? { displayName: skill.interface.displayName } : {}),
            ...(skill.interface.shortDescription ? { shortDescription: skill.interface.shortDescription } : {}),
          },
        } : {}),
        ...(skill.dependencies ? { dependencies: skill.dependencies } : {}),
      });
    } catch (error) {
      errors.push({
        path: skill.path,
        message: `Cannot fingerprint native Skill ${skill.name}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    providerId: "codex",
    projectPath,
    skills: skills.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path)),
    errors: errors.sort((left, right) => left.path.localeCompare(right.path) || left.message.localeCompare(right.message)),
  };
}

export async function setCodexNativeSkillEnabled(
  input: { projectPath: string; path: string; enabled: boolean },
  options: CodexNativeSkillClientOptions = {},
): Promise<{ effectiveEnabled: boolean }> {
  const projectPath = resolve(input.projectPath);
  const requester = options.requester ?? defaultCodexAppServerHostRegistry.hostFor(projectPath);
  return codexSkillsConfigWriteResponseSchema.parse(await requester.requestMetadata("skills/config/write", {
    path: input.path,
    enabled: input.enabled,
  }));
}

function uniquePaths(paths: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const input of paths) {
    if (!input.trim()) continue;
    const path = resolve(input.trim());
    unique.set(normalizePath(path), path);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
}

function samePath(left: string, right: string): boolean {
  return normalizePath(resolve(left)) === normalizePath(resolve(right));
}

function normalizePath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}
