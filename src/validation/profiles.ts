import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readRequiredJsonFile } from "../fs/json.js";

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

const packageJsonSchema = z.object({
  scripts: z.record(z.string()).optional(),
}).passthrough();

const fallbackScriptNames = ["typecheck", "lint", "test", "build"] as const;

export async function resolveSkillNativeValidationProfile(projectRoot: string, profileName = "default"): Promise<ValidationProfile> {
  return readPackageFallbackProfile({ projectRoot }, profileName);
}
async function readPackageFallbackProfile(memory: { projectRoot: string }, profileName: string): Promise<ValidationProfile> {
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
