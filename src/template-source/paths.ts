import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function getAgentProfilesRoot(): string {
  if (process.env.AHO_AGENT_PROFILES_DIR) return process.env.AHO_AGENT_PROFILES_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  const distCandidate = join(here, "..", "templates", "agent-profiles");
  if (existsSync(distCandidate)) return distCandidate;
  return join(here, "..", "..", "templates", "agent-profiles");
}

export function getSystemSkillsRoot(): string {
  if (process.env.AHO_SYSTEM_SKILLS_DIR) return process.env.AHO_SYSTEM_SKILLS_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  const distCandidate = join(here, "..", "templates", "system-skills");
  if (existsSync(distCandidate)) return distCandidate;
  return join(here, "..", "..", "templates", "system-skills");
}

export function getProjectHarnessSkillScaffoldRoot(): string {
  if (process.env.AHO_PROJECT_HARNESS_SCAFFOLD_DIR) return process.env.AHO_PROJECT_HARNESS_SCAFFOLD_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  const distCandidate = join(here, "..", "templates", "project-harness-skill");
  if (existsSync(distCandidate)) return distCandidate;
  return join(here, "..", "..", "templates", "project-harness-skill");
}

export function getCompiledProjectHarnessRuntimeEntry(): string {
  if (process.env.AHO_PROJECT_HARNESS_RUNTIME_ENTRY) return process.env.AHO_PROJECT_HARNESS_RUNTIME_ENTRY;
  const here = dirname(fileURLToPath(import.meta.url));
  const distCandidate = join(here, "..", "project-harness-runtime", "runtime.mjs");
  if (existsSync(distCandidate)) return distCandidate;
  return join(here, "..", "..", "dist", "project-harness-runtime", "runtime.mjs");
}
