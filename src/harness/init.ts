import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { ArtifactBase, ManagedProject, MemoryMode, ResolvedMemory } from "../types/index.js";
import { getActiveChanges, writeChangeIndex } from "../ecl/index.js";
import { assertWritableMemory, resolveMemory } from "../memory/resolver.js";
import { readProjectMarker, writeProjectMarker } from "../project/marker.js";
import { getTemplateRoot } from "../template-source/paths.js";
import { auditHarness } from "./audit.js";

export interface HarnessInitResult {
  created: HarnessInitPath[];
  skipped: HarnessInitPath[];
  indexPath: null | string;
}

export interface HarnessInitPath {
  base: ArtifactBase;
  path: string;
}

export interface HarnessInitOptions {
  memoryMode?: Exclude<MemoryMode, "remote">;
}
export async function ensureProjectRuntime(project: ManagedProject): Promise<ResolvedMemory> {
  const marker = await readProjectMarker(project.path);
  if (!marker) {
    await initHarness(project, { memoryMode: "external-local" });
  } else if (marker.memoryMode === "external-local") {
    const memory = resolveMemory({ ...project, marker });
    if (!existsSync(memory.memoryRoot)) {
      throw new Error(`项目历史不可用：外部记忆目录已丢失（${memory.memoryRoot}）。请在高级诊断中恢复原目录后重试。`);
    }
  }
  return resolveMemory({ ...project, marker: await readProjectMarker(project.path) });
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
  const created: HarnessInitPath[] = [];
  const skipped: HarnessInitPath[] = [];
  const markerAlreadyExists = existsSync(resolvedMemory.markerPath);
  if (requestedMode === "external-local" && markerAlreadyExists && !existsSync(resolvedMemory.memoryRoot)) {
    throw new Error(`项目历史不可用：外部记忆目录已丢失（${resolvedMemory.memoryRoot}）。请在高级诊断中恢复原目录后重试。`);
  }
  if (!markerAlreadyExists) {
    await writeProjectMarker(project, requestedMode);
  }
  (markerAlreadyExists ? skipped : created).push({ base: "project-root", path: ".agent-harness/project.json" });
  await ensureAgentHarnessIgnore(project.path, created, skipped);

  if (requestedMode === "external-local") {
    await prepareExternalRuntimeDirectories(resolvedMemory, created, skipped);
    return { created, skipped, indexPath: null };
  }

  const activeChanges = await getActiveChanges(resolvedMemory);
  if (activeChanges.length > 0) {
    throw new Error(`Target project has an active change (${activeChanges[0]?.name}); close or park it before harness init.`);
  }

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
    indexPath: "harness/changes/INDEX.json",
  };
}

async function prepareExternalRuntimeDirectories(
  memory: ResolvedMemory,
  created: HarnessInitPath[],
  skipped: HarnessInitPath[],
): Promise<void> {
  const roots = [
    { path: memory.memoryRoot, label: "." },
    { path: memory.runsRoot, label: "runs" },
    { path: memory.workbenchRoot, label: "workbench" },
    { path: memory.agentsRoot, label: "agents" },
    { path: memory.commandsRoot, label: "commands" },
    { path: memory.skillsRoot, label: "skills" },
    { path: memory.worktreeMetadataRoot, label: "worktrees/metadata" },
  ];
  for (const root of roots) {
    const existed = existsSync(root.path);
    await mkdir(root.path, { recursive: true });
    (existed ? skipped : created).push({ base: "memory-root", path: root.label });
  }
}

async function ensureAgentHarnessIgnore(projectPath: string, created: HarnessInitPath[], skipped: HarnessInitPath[]): Promise<void> {
  const path = join(projectPath, ".agent-harness", ".gitignore");
  if (existsSync(path)) {
    const existing = await readFile(path, "utf8");
    const required = ["runs/", "worktrees/", "workbench/", "project-write-lease.sqlite"];
    const missing = required.filter((line) => !existing.split(/\r?\n/).includes(line));
    if (missing.length === 0) {
      skipped.push({ base: "project-root", path: ".agent-harness/.gitignore" });
      return;
    }
    const suffix = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
    await writeFile(path, `${existing}${suffix}${missing.join("\n")}\n`, "utf8");
    created.push({ base: "project-root", path: ".agent-harness/.gitignore" });
    return;
  }
  await writeFile(path, "runs/\nworktrees/\nworkbench/\nproject-write-lease.sqlite\n", "utf8");
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
  for (const root of [
    { path: memory.runsRoot, label: "runs" },
    { path: memory.workbenchRoot, label: "workbench" },
    { path: memory.agentsRoot, label: "agents" },
    { path: memory.commandsRoot, label: "commands" },
    { path: memory.skillsRoot, label: "skills" },
  ]) {
    const exists = existsSync(root.path);
    await mkdir(root.path, { recursive: true });
    (exists ? skipped : created).push({ base: "memory-root", path: root.label });
  }
}
