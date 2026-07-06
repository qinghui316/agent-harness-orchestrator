import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";

export interface CodexProjectTrustStatus {
  trusted: boolean;
  configPath: string;
  projectKey: string;
  configExists: boolean;
  reason?: string;
}

export interface CodexTrustOptions {
  codexHome?: string;
  platform?: NodeJS.Platform;
}

export interface CodexConfigModelStatus {
  configPath: string;
  configExists: boolean;
  model: string | null;
  reason?: string;
}

export type CodexFeatureConfigState = "default-enabled" | "default-disabled" | "enabled" | "disabled" | "unknown";

export interface CodexNativeCollabConfigStatus {
  configPath: string;
  configExists: boolean;
  multiAgent: CodexFeatureConfigState;
  multiAgentV2: CodexFeatureConfigState;
  reason?: string;
}

export function getCodexConfigPath(options: CodexTrustOptions = {}): string {
  return join(options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"), "config.toml");
}

export async function readCodexDefaultModel(options: CodexTrustOptions = {}): Promise<string | null> {
  return (await readCodexConfigModelStatus(options)).model;
}

export async function readCodexNativeCollabConfigStatus(options: CodexTrustOptions = {}): Promise<CodexNativeCollabConfigStatus> {
  const configPath = getCodexConfigPath(options);
  try {
    const content = await readFile(configPath, "utf8");
    const parsed = parseToml(content) as Record<string, unknown>;
    const features = isRecord(parsed.features) ? parsed.features : {};
    return {
      configPath,
      configExists: true,
      multiAgent: featureState(features.multi_agent ?? features.collab, "default-enabled"),
      multiAgentV2: featureState(features.multi_agent_v2, "default-disabled"),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        configPath,
        configExists: false,
        multiAgent: "default-enabled",
        multiAgentV2: "default-disabled",
        reason: "Codex config.toml was not found; using Codex feature defaults.",
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      configPath,
      configExists: true,
      multiAgent: "unknown",
      multiAgentV2: "unknown",
      reason: `Invalid Codex config.toml: ${message}`,
    };
  }
}

export async function readCodexConfigModelStatus(options: CodexTrustOptions = {}): Promise<CodexConfigModelStatus> {
  const configPath = getCodexConfigPath(options);
  try {
    const content = await readFile(configPath, "utf8");
    const parsed = parseToml(content) as Record<string, unknown>;
    const model = parsed.model;
    if (model === undefined || model === null) return { configPath, configExists: true, model: null };
    if (typeof model !== "string") {
      return { configPath, configExists: true, model: null, reason: "Codex config model is not a string." };
    }
    const trimmed = model.trim();
    return { configPath, configExists: true, model: trimmed || null, ...(trimmed ? {} : { reason: "Codex config model is empty." }) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { configPath, configExists: false, model: null, reason: "Codex config.toml was not found." };
    const message = error instanceof Error ? error.message : String(error);
    return { configPath, configExists: true, model: null, reason: `Invalid Codex config.toml: ${message}` };
  }
}

export function getCodexProjectKey(projectPath: string, options: CodexTrustOptions = {}): string {
  const resolved = resolve(projectPath);
  return (options.platform ?? process.platform) === "win32" ? resolved.toLowerCase() : resolved;
}

export async function readCodexProjectTrust(projectPath: string, options: CodexTrustOptions = {}): Promise<CodexProjectTrustStatus> {
  const configPath = getCodexConfigPath(options);
  const projectKey = getCodexProjectKey(projectPath, options);
  if (!existsSync(configPath)) {
    return { trusted: false, configPath, projectKey, configExists: false, reason: "Codex config.toml was not found." };
  }
  try {
    const content = await readFile(configPath, "utf8");
    const section = findProjectTrustSection(content, projectKey, options.platform ?? process.platform);
    if (!section) {
      return { trusted: false, configPath, projectKey, configExists: true, reason: "Project is not listed in Codex config.toml." };
    }
    if (section.trusted) return { trusted: true, configPath, projectKey, configExists: true };
    return { trusted: false, configPath, projectKey, configExists: true, reason: "Project entry exists but trust_level is not trusted." };
  } catch (cause) {
    return {
      trusted: false,
      configPath,
      projectKey,
      configExists: true,
      reason: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function trustCodexProject(projectPath: string, options: CodexTrustOptions = {}): Promise<CodexProjectTrustStatus> {
  const configPath = getCodexConfigPath(options);
  const projectKey = getCodexProjectKey(projectPath, options);
  const content = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  const updated = upsertProjectTrust(content, projectKey, options.platform ?? process.platform);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, updated, "utf8");
  return readCodexProjectTrust(projectPath, options);
}

function upsertProjectTrust(content: string, projectKey: string, platform: NodeJS.Platform): string {
  const lines = content.split(/\r?\n/);
  const section = findProjectTrustSection(content, projectKey, platform);
  if (!section) {
    const prefix = content.trim().length > 0 ? trimTrailingBlankLines(lines).join("\n") + "\n\n" : "";
    return `${prefix}${projectHeader(projectKey)}\ntrust_level = "trusted"\n`;
  }
  const nextLines = [...lines];
  if (section.trustLineIndex !== undefined) {
    nextLines[section.trustLineIndex] = 'trust_level = "trusted"';
  } else {
    nextLines.splice(section.startLine + 1, 0, 'trust_level = "trusted"');
  }
  return ensureTrailingNewline(nextLines.join("\n"));
}

function findProjectTrustSection(content: string, projectKey: string, platform: NodeJS.Platform): { startLine: number; trustLineIndex?: number; trusted: boolean } | null {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const key = parseProjectHeader(lines[index]);
    if (key === null || comparableProjectKey(key, platform) !== comparableProjectKey(projectKey, platform)) continue;
    let trustLineIndex: number | undefined;
    let trusted = false;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^\s*\[.+\]\s*$/.test(lines[cursor])) break;
      const match = lines[cursor].match(/^\s*trust_level\s*=\s*["']([^"']+)["']\s*$/);
      if (match) {
        trustLineIndex = cursor;
        trusted = match[1] === "trusted";
      }
    }
    return { startLine: index, trustLineIndex, trusted };
  }
  return null;
}

function parseProjectHeader(line: string): string | null {
  const single = line.match(/^\s*\[projects\.'([^']+)'\]\s*$/);
  if (single) return single[1];
  const double = line.match(/^\s*\[projects\.(".*")\]\s*$/);
  if (!double) return null;
  try {
    return JSON.parse(double[1]) as string;
  } catch {
    return null;
  }
}

function projectHeader(projectKey: string): string {
  return projectKey.includes("'") ? `[projects.${JSON.stringify(projectKey)}]` : `[projects.'${projectKey}']`;
}

function comparableProjectKey(projectKey: string, platform: NodeJS.Platform): string {
  const normalized = projectKey.replace(/\//g, "\\");
  return platform === "win32" ? normalized.toLowerCase() : projectKey;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1].trim() === "") next.pop();
  return next;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function featureState(value: unknown, defaultState: "default-enabled" | "default-disabled"): CodexFeatureConfigState {
  if (typeof value === "boolean") return value ? "enabled" : "disabled";
  if (isRecord(value)) {
    const enabled = value.enabled;
    if (typeof enabled === "boolean") return enabled ? "enabled" : "disabled";
  }
  if (value === undefined || value === null) return defaultState;
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
