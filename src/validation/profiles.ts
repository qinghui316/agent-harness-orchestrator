import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readRequiredJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";

export interface ValidationCommand {
  name: string;
  command: string[];
  source: "config" | "package";
}

export interface ValidationProfile {
  name: string;
  source: "config" | "package";
  commands: ValidationCommand[];
}

const validationCommandSchema = z.object({
  name: z.string().min(1),
  command: z.array(z.string().min(1)).min(1),
});

const environmentSchema = z.object({
  validation: z.object({
    profiles: z.record(z.array(validationCommandSchema)).optional(),
  }).optional(),
}).passthrough();

const packageJsonSchema = z.object({
  scripts: z.record(z.string()).optional(),
}).passthrough();

const fallbackScriptNames = ["typecheck", "lint", "test", "build"] as const;

export async function resolveValidationProfile(memory: ResolvedMemory, profileName = "default"): Promise<ValidationProfile> {
  const configured = await readConfiguredProfile(memory, profileName);
  if (configured) return configured;
  return await readPackageFallbackProfile(memory, profileName);
}

export async function resolveSkillNativeValidationProfile(projectRoot: string, profileName = "default"): Promise<ValidationProfile> {
  return readPackageFallbackProfile({ projectRoot }, profileName);
}

async function readConfiguredProfile(memory: ResolvedMemory, profileName: string): Promise<ValidationProfile | null> {
  const path = join(memory.harnessRoot, "harness", "config", "environment.json");
  if (!existsSync(path)) return null;
  const environment = await readRequiredJsonFile(path, environmentSchema);
  const profile = environment.validation?.profiles?.[profileName];
  if (!profile) return null;
  if (profile.length === 0) {
    throw new Error(`Validation profile '${profileName}' is empty in harness/config/environment.json.`);
  }
  return {
    name: profileName,
    source: "config",
    commands: profile.map((item) => ({ ...item, source: "config" as const })),
  };
}

async function readPackageFallbackProfile(memory: Pick<ResolvedMemory, "projectRoot">, profileName: string): Promise<ValidationProfile> {
  if (profileName !== "default") {
    throw new Error(`Validation profile '${profileName}' was not found in harness/config/environment.json.`);
  }
  const path = join(memory.projectRoot, "package.json");
  if (!existsSync(path)) {
    throw new Error("No validation profile configured and package.json was not found for fallback detection.");
  }
  const pkg = await readRequiredJsonFile(path, packageJsonSchema);
  const scripts = pkg.scripts ?? {};
  const commands = fallbackScriptNames
    .filter((name) => scripts[name])
    .map((name) => ({ name, command: ["npm", "run", name], source: "package" as const }));
  if (commands.length === 0) {
    throw new Error("No validation profile configured and package.json has none of: typecheck, lint, test, build.");
  }
  return { name: profileName, source: "package", commands };
}
