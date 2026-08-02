import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function getTemplateRoot(): string {
  if (process.env.AHO_TEMPLATE_DIR) return process.env.AHO_TEMPLATE_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  const distCandidate = join(here, "..", "templates", "core-harness");
  if (existsSync(distCandidate)) return distCandidate;
  return join(here, "..", "..", "templates", "core-harness");
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
