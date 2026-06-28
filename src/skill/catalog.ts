import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { resolveCodexHome } from "../codex/home.js";
import { resolveExistingDirectory, slugify } from "../fs/path.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject, ResolvedMemory, RunSkillRecord } from "../types/index.js";
import { WorkbenchStore, type StoredSkillIndex, type StoredSkillRoot } from "../workbench/store.js";

export type SkillSourceKind = "managed" | "project-codex" | "global-codex" | "custom";

export interface SkillListItem {
  skillId: string;
  name: string;
  description: string;
  sourcePath: string;
  sourceKind: SkillSourceKind;
  sourceHash: string;
  enabledProject: boolean;
  enabledTopics: string[];
  disabledTopics: string[];
  runtimeTargets: Array<{
    provider: "codex";
    status: "native" | "synced" | "out-of-sync" | "not-synced";
    materializationMode: "native" | "aho-managed";
    materializedPath?: string;
    materializedHash?: string;
    bridgeVersion?: string;
    syncedAt?: string;
  }>;
  bridge?: {
    materializedPath: string;
    materializedHash: string;
    bridgeVersion: string;
    syncedAt: string;
    outOfSync: boolean;
  };
}

export interface ImportedSkill {
  skill: SkillListItem;
  copied: string[];
}

export interface SkillRootListItem {
  rootPath: string;
  sourceKind: SkillSourceKind;
  updatedAt: string;
}

export interface SkillRefreshResult {
  roots: SkillRootListItem[];
  skills: SkillListItem[];
}

export interface EnabledSkillContext {
  records: RunSkillRecord[];
  promptSection: string;
  warnings: string[];
}

interface SkillMetadata {
  name: string;
  description: string;
  metadata: Record<string, string>;
}

const excludedPackageDirs = new Set([".git", "node_modules", ".cache", ".turbo", ".vite", "dist", "build", "coverage"]);
const maxSkillPackageFiles = 500;
const maxSkillPackageFileBytes = 1024 * 1024;

export function isNativeCodexSkill(skill: Pick<SkillListItem, "sourceKind"> | Pick<StoredSkillIndex, "sourceKind">): boolean {
  return normalizeSourceKind(skill.sourceKind) === "global-codex";
}

export async function importSkill(project: ManagedProject, sourceDirInput: string): Promise<ImportedSkill> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Skill import");
  const sourceDir = await resolveExistingDirectory(sourceDirInput);
  const skillPath = join(sourceDir, "SKILL.md");
  if (!existsSync(skillPath)) throw new Error(`Skill directory must contain SKILL.md: ${sourceDir}`);
  const skillRaw = await readFile(skillPath, "utf8");
  const metadata = parseSkillMetadata(skillRaw, basename(sourceDir));
  const skillId = slugify(metadata.name || basename(sourceDir));
  const destination = join(memory.skillsRoot, skillId);
  ensureNotNestedInSelf(sourceDir, destination);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const copied = await copySkillPackage(sourceDir, destination);
  const sourceHash = await hashSkillDirectory(destination);
  const indexed = await upsertSkillIndex(memory, project.id, skillId, metadata, destination, "managed", sourceHash);
  return { skill: await decorateSkill(memory, indexed), copied };
}

export async function addSkillRoot(project: ManagedProject, rootPathInput: string, sourceKind: SkillSourceKind = "custom"): Promise<SkillRefreshResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Skill root registration");
  const rootPath = await resolveExistingDirectory(rootPathInput);
  const store = await WorkbenchStore.open(memory);
  try {
    store.upsertSkillRoot({
      projectId: project.id,
      rootPath,
      sourceKind,
      updatedAt: new Date().toISOString(),
    });
  } finally {
    store.close();
  }
  return refreshSkills(project);
}

export async function listSkillRoots(project: ManagedProject): Promise<SkillRootListItem[]> {
  const memory = await resolveProjectMemory(project);
  const store = await WorkbenchStore.open(memory);
  try {
    return store.listSkillRoots(project.id).map(mapSkillRoot);
  } finally {
    store.close();
  }
}

export async function refreshSkills(project: ManagedProject): Promise<SkillRefreshResult> {
  const skills = await listSkills(project);
  return { roots: await listSkillRoots(project), skills };
}

export async function listSkills(project: ManagedProject): Promise<SkillListItem[]> {
  const memory = await resolveProjectMemory(project);
  const store = await WorkbenchStore.open(memory);
  try {
    await refreshSkillIndex(memory, project, store);
    const skills = store.listSkills(project.id);
    return await Promise.all(skills.map((item) => decorateSkill(memory, item, store)));
  } finally {
    store.close();
  }
}

export async function setSkillEnabled(project: ManagedProject, skillIdInput: string, options: { topic?: string; enabled: boolean }): Promise<SkillListItem[]> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Skill enablement");
  const skillId = slugify(skillIdInput);
  const store = await WorkbenchStore.open(memory);
  try {
    await refreshSkillIndex(memory, project, store);
    const skill = store.readSkill(project.id, skillId);
    if (!skill) throw new Error(`Unknown skill: ${skillId}`);
    store.setSkillEnablement({
      projectId: project.id,
      changeId: options.topic ?? null,
      skillId,
      scope: options.topic ? "topic" : "project",
      enabled: options.enabled,
      updatedAt: new Date().toISOString(),
    });
    const skills = store.listSkills(project.id);
    return await Promise.all(skills.map((item) => decorateSkill(memory, item, store)));
  } finally {
    store.close();
  }
}

export async function getEnabledSkillContext(project: ManagedProject, changeId?: string): Promise<EnabledSkillContext> {
  const memory = await resolveProjectMemory(project);
  const store = await WorkbenchStore.open(memory);
  try {
    await refreshSkillIndex(memory, project, store);
    const skills = store.listSkills(project.id);
    const enablements = store.listSkillEnablement(project.id);
    const projectEnabled = new Set(enablements.filter((item) => item.scope === "project" && item.enabled).map((item) => item.skillId));
    const topicEnabled = new Set(enablements.filter((item) => item.scope === "topic" && item.changeId === changeId && item.enabled).map((item) => item.skillId));
    const topicDisabled = new Set(enablements.filter((item) => item.scope === "topic" && item.changeId === changeId && !item.enabled).map((item) => item.skillId));
    const enabledIds = [...new Set([...projectEnabled, ...topicEnabled])].filter((skillId) => !topicDisabled.has(skillId)).sort();
    const records: RunSkillRecord[] = [];
    const warnings: string[] = [];
    for (const skillId of enabledIds) {
      const skill = skills.find((item) => item.skillId === skillId);
      if (!skill) {
        warnings.push(`Enabled skill ${skillId} is missing from skill source.`);
        continue;
      }
      const sourceKind = normalizeSourceKind(skill.sourceKind);
      const materializationMode = sourceKind === "global-codex" ? "native" : "aho-managed";
      const sync = materializationMode === "native" ? null : store.readBridgeSync(project.id, skillId);
      records.push({
        id: skill.skillId,
        runtimeTarget: "codex",
        sourceKind,
        sourceHash: skill.sourceHash,
        materializationMode,
        materializedHash: materializationMode === "native" ? null : sync?.materializedHash ?? null,
        bridge: materializationMode === "native" ? "codex:native" : sync ? "codex:aho-managed" : undefined,
        version: sync?.bridgeVersion,
      });
      if (materializationMode !== "native" && (!sync || sync.sourceHash !== skill.sourceHash)) {
        warnings.push(`Skill ${skill.skillId} is not synced to the Codex bridge.`);
      }
    }
    return {
      records,
      warnings,
      promptSection: records.length > 0
        ? [
          "# AHO Skill Availability",
          "",
          "Enabled skills are Codex runtime capabilities. Native Codex skills are discovered from Codex directly; other skills use the AHO-managed bridge when synced. Skills are not Harness workflow truth and do not authorize workflow actions.",
          "",
          ...records.map((record) => `- $${record.id}: sourceKind=${record.sourceKind ?? "managed"}; materialization=${record.materializationMode ?? "aho-managed"}; sourceHash=${record.sourceHash}${record.bridge ? `; bridge=${record.bridge}` : ""}${record.materializedHash ? `; materializedHash=${record.materializedHash}` : ""}`),
        ].join("\n")
        : "",
    };
  } finally {
    store.close();
  }
}

export async function hashSkillDirectory(path: string): Promise<string> {
  const hash = createHash("sha256");
  const files = await listSkillPackageFiles(path);
  for (const file of files) {
    const rel = relative(path, file).replace(/\\/g, "/");
    hash.update(rel);
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function copySkillToBridge(sourcePath: string, targetPath: string, materializedName: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true });
  await mkdir(targetPath, { recursive: true });
  const files = await listSkillPackageFiles(sourcePath);
  for (const file of files) {
    const rel = relative(sourcePath, file);
    const to = join(targetPath, rel);
    await mkdir(dirname(to), { recursive: true });
    if (rel.replace(/\\/g, "/") === "SKILL.md") {
      await writeFile(to, rewriteSkillName(await readFile(file, "utf8"), materializedName), "utf8");
    } else {
      await copyFile(file, to);
    }
  }
}

async function upsertSkillIndex(
  memory: ResolvedMemory,
  projectId: string,
  skillId: string,
  metadata: SkillMetadata,
  sourcePath: string,
  sourceKind: SkillSourceKind,
  sourceHash: string,
): Promise<StoredSkillIndex> {
  const store = await WorkbenchStore.open(memory);
  try {
    const indexed: StoredSkillIndex = {
      projectId,
      skillId,
      name: metadata.name,
      description: metadata.description,
      sourcePath,
      sourceKind,
      sourceHash,
      metadataJson: JSON.stringify(metadata.metadata),
      updatedAt: new Date().toISOString(),
    };
    store.upsertSkill(indexed);
    return indexed;
  } finally {
    store.close();
  }
}

async function refreshSkillIndex(memory: ResolvedMemory, project: ManagedProject, store: WorkbenchStore): Promise<void> {
  const sources = await discoverSkillSources(memory, project, store);
  store.deleteSkillsExcept(project.id, sources.map((source) => source.skillId));
  for (const source of sources) {
    const raw = await readFile(join(source.sourcePath, "SKILL.md"), "utf8");
    const metadata = parseSkillMetadata(raw, basename(source.sourcePath));
    const sourceHash = await hashSkillDirectory(source.sourcePath);
    store.upsertSkill({
      projectId: project.id,
      skillId: source.skillId,
      name: metadata.name,
      description: metadata.description,
      sourcePath: source.sourcePath,
      sourceKind: source.sourceKind,
      sourceHash,
      metadataJson: JSON.stringify(metadata.metadata),
      updatedAt: new Date().toISOString(),
    });
  }
}

async function decorateSkill(memory: ResolvedMemory, skill: StoredSkillIndex, providedStore?: WorkbenchStore): Promise<SkillListItem> {
  const closeStore = !providedStore;
  const store = providedStore ?? await WorkbenchStore.open(memory);
  try {
    const enablements = store.listSkillEnablement(skill.projectId).filter((item) => item.skillId === skill.skillId);
    const sourceKind = normalizeSourceKind(skill.sourceKind);
    const native = sourceKind === "global-codex";
    const sync = native ? null : store.readBridgeSync(skill.projectId, skill.skillId);
    return {
      skillId: skill.skillId,
      name: skill.name,
      description: skill.description,
      sourcePath: skill.sourcePath,
      sourceKind,
      sourceHash: skill.sourceHash,
      enabledProject: enablements.some((item) => item.scope === "project" && item.enabled),
      enabledTopics: enablements.filter((item) => item.scope === "topic" && item.enabled && item.changeId).map((item) => item.changeId as string),
      disabledTopics: enablements.filter((item) => item.scope === "topic" && !item.enabled && item.changeId).map((item) => item.changeId as string),
      runtimeTargets: [{
        provider: "codex",
        status: native ? "native" : sync ? (sync.sourceHash === skill.sourceHash ? "synced" : "out-of-sync") : "not-synced",
        materializationMode: native ? "native" : "aho-managed",
        materializedPath: sync?.materializedPath,
        materializedHash: sync?.materializedHash,
        bridgeVersion: sync?.bridgeVersion,
        syncedAt: sync?.syncedAt,
      }],
      bridge: sync ? {
        materializedPath: sync.materializedPath,
        materializedHash: sync.materializedHash,
        bridgeVersion: sync.bridgeVersion,
        syncedAt: sync.syncedAt,
        outOfSync: sync.sourceHash !== skill.sourceHash,
      } : undefined,
    };
  } finally {
    if (closeStore) store.close();
  }
}

async function listSkillPackageFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await collectPackageFiles(root, root, files);
  if (!files.some((file) => relative(root, file).replace(/\\/g, "/") === "SKILL.md")) {
    throw new Error(`Skill package must contain SKILL.md: ${root}`);
  }
  return files.sort();
}

async function copySkillPackage(sourcePath: string, targetPath: string): Promise<string[]> {
  const files = await listSkillPackageFiles(sourcePath);
  const copied = new Set<string>();
  for (const file of files) {
    const rel = relative(sourcePath, file);
    const to = join(targetPath, rel);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(file, to);
    copied.add(rel.split(/[\\/]/)[0]);
  }
  return [...copied].sort();
}

async function collectPackageFiles(packageRoot: string, current: string, files: string[]): Promise<void> {
  if (files.length > maxSkillPackageFiles) throw new Error(`Skill package has too many files: ${packageRoot}`);
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === "." || entry.name === "..") continue;
    if (entry.isDirectory() && excludedPackageDirs.has(entry.name)) continue;
    const path = join(current, entry.name);
    assertInside(packageRoot, path);
    const info = await lstat(path);
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) {
      await collectPackageFiles(packageRoot, path, files);
    } else if (info.isFile()) {
      if (info.size > maxSkillPackageFileBytes) continue;
      files.push(path);
    }
  }
}

async function discoverSkillSources(memory: ResolvedMemory, project: ManagedProject, store: WorkbenchStore): Promise<Array<{ skillId: string; sourcePath: string; sourceKind: SkillSourceKind }>> {
  const candidates: Array<{ sourcePath: string; sourceKind: SkillSourceKind }> = [];
  if (existsSync(memory.skillsRoot)) candidates.push(...await discoverSkillsInRoot(memory.skillsRoot, "managed"));
  const projectCodexRoot = join(project.path, ".codex", "skills");
  if (existsSync(projectCodexRoot)) candidates.push(...await discoverSkillsInRoot(projectCodexRoot, "project-codex"));
  const globalCodexRoot = join(resolveCodexHome(), "skills");
  if (existsSync(globalCodexRoot)) candidates.push(...await discoverSkillsInRoot(globalCodexRoot, "global-codex"));
  for (const root of store.listSkillRoots(project.id)) {
    if (existsSync(root.rootPath)) candidates.push(...await discoverSkillsInRoot(root.rootPath, normalizeSourceKind(root.sourceKind)));
  }

  const used = new Map<string, string>();
  return candidates.map((candidate) => {
    const rawId = slugify(parseSkillMetadataSafe(candidate.sourcePath)?.name ?? basename(candidate.sourcePath));
    const existingPath = used.get(rawId);
    const skillId = existingPath && resolve(existingPath) !== resolve(candidate.sourcePath)
      ? `${rawId}-${hashText(candidate.sourcePath).slice(0, 8)}`
      : rawId;
    used.set(skillId, candidate.sourcePath);
    return { skillId, sourcePath: candidate.sourcePath, sourceKind: candidate.sourceKind };
  });
}

async function discoverSkillsInRoot(root: string, sourceKind: SkillSourceKind): Promise<Array<{ sourcePath: string; sourceKind: SkillSourceKind }>> {
  const resolvedRoot = resolve(root);
  const found: Array<{ sourcePath: string; sourceKind: SkillSourceKind }> = [];
  if (existsSync(join(resolvedRoot, "SKILL.md"))) found.push({ sourcePath: resolvedRoot, sourceKind });
  for (const entry of await readdir(resolvedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || excludedPackageDirs.has(entry.name)) continue;
    const sourcePath = join(resolvedRoot, entry.name);
    assertInside(resolvedRoot, sourcePath);
    if (existsSync(join(sourcePath, "SKILL.md"))) found.push({ sourcePath, sourceKind });
  }
  return found;
}

function parseSkillMetadataSafe(sourcePath: string): SkillMetadata | null {
  try {
    const raw = existsSync(join(sourcePath, "SKILL.md")) ? readFileSyncUtf8(join(sourcePath, "SKILL.md")) : "";
    return raw ? parseSkillMetadata(raw, basename(sourcePath)) : null;
  } catch {
    return null;
  }
}

function parseSkillMetadata(raw: string, fallbackName: string): SkillMetadata {
  raw = stripUtf8Bom(raw);
  const metadata: Record<string, string> = {};
  if (raw.startsWith("---\n")) {
    const end = raw.indexOf("\n---", 4);
    if (end > 0) {
      for (const line of raw.slice(4, end).split(/\r?\n/)) {
        const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (match) metadata[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
  const name = z.string().min(1).catch(fallbackName).parse(metadata.name);
  const description = z.string().catch("").parse(metadata.description);
  return { name, description, metadata };
}

function rewriteSkillName(raw: string, materializedName: string): string {
  raw = stripUtf8Bom(raw);
  if (raw.startsWith("---\n")) {
    const end = raw.indexOf("\n---", 4);
    if (end > 0) {
      const lines = raw.slice(4, end).split(/\r?\n/);
      let hasName = false;
      const next = lines.map((line) => {
        if (/^name:\s*/.test(line)) {
          hasName = true;
          return `name: ${materializedName}`;
        }
        return line;
      });
      if (!hasName) next.unshift(`name: ${materializedName}`);
      return `---\n${next.join("\n")}\n---${raw.slice(end + 4)}`;
    }
  }
  return `---\nname: ${materializedName}\n---\n\n${raw}`;
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function mapSkillRoot(root: StoredSkillRoot): SkillRootListItem {
  return {
    rootPath: root.rootPath,
    sourceKind: normalizeSourceKind(root.sourceKind),
    updatedAt: root.updatedAt,
  };
}

function normalizeSourceKind(value: string): SkillSourceKind {
  if (value === "project-codex" || value === "global-codex" || value === "custom") return value;
  return "managed";
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function readFileSyncUtf8(path: string): string {
  // This synchronous read is limited to metadata discovery during root scanning,
  // before the async hash/copy pass validates the full package.
  return readFileSync(path, "utf8");
}

function assertInside(root: string, path: string): void {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`Skill package path escapes root: ${path}`);
  }
}

function ensureNotNestedInSelf(sourceDir: string, destination: string): void {
  const source = resolve(sourceDir);
  const target = resolve(destination);
  if (target === source || target.startsWith(`${source}${sep}`)) {
    throw new Error("Cannot import a skill into itself.");
  }
}
