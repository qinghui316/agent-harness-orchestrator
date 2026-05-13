import { mkdir, readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { ArtifactBase, ManagedProject, MemoryMode, ResolvedMemory } from "../types/index.js";
import { getActiveChanges, writeChangeIndex } from "../ecl/index.js";
import { assertWritableMemory, resolveMemory } from "../memory/resolver.js";
import { readProjectMarker, writeProjectMarker } from "../project/marker.js";
import { getTemplateRoot } from "../template-source/paths.js";
import { auditHarness } from "./audit.js";

export interface HarnessInitResult {
  created: HarnessInitPath[];
  skipped: HarnessInitPath[];
  indexPath: string;
}

export interface HarnessInitPath {
  base: ArtifactBase;
  path: string;
}

export interface HarnessInitOptions {
  memoryMode?: Exclude<MemoryMode, "remote">;
}

async function copyTemplateTree(
  sourceRoot: string,
  targetRoot: string,
  base: ArtifactBase,
  replacements: Record<string, string>,
  created: HarnessInitPath[],
  skipped: HarnessInitPath[],
  recordRoot = targetRoot,
): Promise<void> {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(sourceRoot, entry.name);
    const target = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      await mkdir(target, { recursive: true });
      await copyTemplateTree(source, target, base, replacements, created, skipped, recordRoot);
      continue;
    }

    const rel = relative(recordRoot, target).replace(/\\/g, "/");
    if (existsSync(target)) {
      skipped.push({ base, path: rel });
      continue;
    }

    const raw = await readFile(source, "utf8");
    const content = Object.entries(replacements).reduce(
      (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
      raw,
    );
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    created.push({ base, path: rel });
  }
}

export async function initHarness(project: ManagedProject, options: HarnessInitOptions = {}): Promise<HarnessInitResult> {
  const requestedMode = options.memoryMode ?? "repo-local";
  const existingMarker = await readProjectMarker(project.path);
  if (existingMarker && (existingMarker.id !== project.id || existingMarker.memoryMode !== requestedMode)) {
    throw new Error(`Target project is already initialized for ${existingMarker.id} with ${existingMarker.memoryMode} memory.`);
  }
  const memory = resolveMemory({ ...project, marker: existingMarker });
  const resolvedMemory = existingMarker ? memory : resolveMemory({ ...project, marker: { version: "1.0", id: project.id, name: project.name, managedBy: "agent-harness-orchestrator", memoryMode: requestedMode, createdAt: new Date().toISOString() } });
  assertWritableMemory(resolvedMemory, "Harness init");
  if (requestedMode === "external-local") {
    await assertNoRepoLocalActiveChanges(project);
    await validateExternalMemoryRoot(resolvedMemory);
  }
  const activeChanges = await getActiveChanges(resolvedMemory);
  if (activeChanges.length > 0) {
    throw new Error(`Target project has an active change (${activeChanges[0]?.name}); close or park it before harness init.`);
  }

  const created: HarnessInitPath[] = [];
  const skipped: HarnessInitPath[] = [];
  if (requestedMode === "external-local") {
    await writeExternalAgentGuide(project, resolvedMemory, created, skipped);
  }
  const markerAlreadyExists = existsSync(resolvedMemory.markerPath);
  await writeProjectMarker(project, requestedMode);
  (markerAlreadyExists ? skipped : created).push({ base: "project-root", path: ".agent-harness/project.json" });
  await ensureAgentHarnessIgnore(project.path, created, skipped);
  const templateRoot = getTemplateRoot();
  const replacements = {
    PROJECT_NAME: project.name,
    PROJECT_ID: project.id,
    GENERATED_AT: new Date().toISOString(),
  };
  if (requestedMode === "repo-local") {
    await copyTemplateTree(templateRoot, resolvedMemory.harnessRoot, "project-root", replacements, created, skipped);
  } else {
    await copyDurableTemplateTree(templateRoot, resolvedMemory, replacements, created, skipped);
  }
  await writeChangeIndex(resolvedMemory);
  await auditHarness(project.path);
  return {
    created,
    skipped,
    indexPath: requestedMode === "external-local" ? "harness/changes/INDEX.json" : "harness/changes/INDEX.json",
  };
}

async function ensureAgentHarnessIgnore(projectPath: string, created: HarnessInitPath[], skipped: HarnessInitPath[]): Promise<void> {
  const path = join(projectPath, ".agent-harness", ".gitignore");
  if (existsSync(path)) {
    skipped.push({ base: "project-root", path: ".agent-harness/.gitignore" });
    return;
  }
  await writeFile(path, "runs/\nworktrees/\n", "utf8");
  created.push({ base: "project-root", path: ".agent-harness/.gitignore" });
}

async function copyDurableTemplateTree(
  templateRoot: string,
  memory: ResolvedMemory,
  replacements: Record<string, string>,
  created: HarnessInitPath[],
  skipped: HarnessInitPath[],
): Promise<void> {
  for (const name of ["docs", "harness", "scripts"]) {
    await copyTemplateTree(join(templateRoot, name), join(memory.memoryRoot, name), "memory-root", replacements, created, skipped, memory.memoryRoot);
  }
  const runsExists = existsSync(memory.runsRoot);
  await mkdir(memory.runsRoot, { recursive: true });
  (runsExists ? skipped : created).push({ base: "memory-root", path: "runs" });
}

async function assertNoRepoLocalActiveChanges(project: ManagedProject): Promise<void> {
  const repoLocal = resolveMemory({ ...project, marker: { version: "1.0", id: project.id, name: project.name, managedBy: "agent-harness-orchestrator", memoryMode: "repo-local", createdAt: new Date().toISOString() } });
  const active = await getActiveChanges(repoLocal);
  if (active.length > 0) {
    throw new Error(`Cannot initialize external-local memory while repo-local active changes exist: ${active.map((change) => change.name).join(", ")}.`);
  }
}

async function validateExternalMemoryRoot(memory: ResolvedMemory): Promise<void> {
  if (!existsSync(memory.memoryRoot)) return;
  const entries = await readdir(memory.memoryRoot, { withFileTypes: true });
  const unexpected = entries
    .filter((entry) => !["docs", "harness", "scripts", "runs", "indexes"].includes(entry.name))
    .map((entry) => entry.name);
  if (unexpected.length > 0) {
    throw new Error(`External memory root has unexpected content: ${unexpected.join(", ")}. Move it or choose a different project id before init.`);
  }
  const active = await getActiveChanges(memory);
  if (active.length > 0) {
    throw new Error(`External memory root already has an active change: ${active.map((change) => change.name).join(", ")}.`);
  }
}

async function writeExternalAgentGuide(
  project: ManagedProject,
  memory: ResolvedMemory,
  created: HarnessInitPath[],
  skipped: HarnessInitPath[],
): Promise<void> {
  const content = externalAgentGuide(project);
  if (existsSync(memory.agentGuidePath)) {
    const existing = await readFile(memory.agentGuidePath, "utf8");
    if (existing === content) {
      skipped.push({ base: "project-root", path: "AGENTS.md" });
      return;
    }
    const backup = nextAgentBackupPath(memory.agentGuidePath);
    await copyFile(memory.agentGuidePath, backup);
    created.push({ base: "project-root", path: basename(backup) });
  }
  await writeFile(memory.agentGuidePath, content, "utf8");
  created.push({ base: "project-root", path: "AGENTS.md" });
}

function nextAgentBackupPath(agentGuidePath: string): string {
  const stamp = localTimestamp();
  let candidate = `${agentGuidePath}.bak-${stamp}`;
  let counter = 1;
  while (existsSync(candidate)) {
    candidate = `${agentGuidePath}.bak-${stamp}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function externalAgentGuide(project: ManagedProject): string {
  return [
    `# ${project.name} Agent Memory Map`,
    "",
    "This project uses Agent Harness Orchestrator external-local memory.",
    "",
    "## Project Identity",
    "",
    `- Project ID: ${project.id}`,
    `- Project Name: ${project.name}`,
    "- Memory Mode: external-local",
    "- Marker: `.agent-harness/project.json`",
    "",
    "## Memory Resolution",
    "",
    "Durable Harness memory is outside this repository and must be resolved by AHO.",
    "",
    "Run first:",
    "",
    "```powershell",
    `aho memory status ${project.id}`,
    "```",
    "",
    "## Loading Order",
    "",
    "1. Read this `AGENTS.md`.",
    "2. Read `.agent-harness/project.json`.",
    "3. Use AHO to resolve durable memory.",
    "4. Read resolved `docs/ECL.md`.",
    "5. Read resolved active change files if present.",
    "6. If no active change exists, read resolved `harness/evolution/pending.md` if present.",
    "7. Read resolved `docs/STATUS.md`.",
    "8. Read task-specific resolved docs only when needed.",
    "",
    "## Archive Loading",
    "",
    "Read resolved `harness/changes/INDEX.json` first. Start with archived `summary.md`; load detailed archived files only when needed.",
    "",
    "## Memory Unavailable",
    "",
    "If AHO is unavailable or durable memory cannot be resolved, do not infer active changes, archived decisions, or project history. Ask the user to attach, sync, initialize, or repair memory.",
    "",
  ].join("\n");
}

function localTimestamp(date = new Date()): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
