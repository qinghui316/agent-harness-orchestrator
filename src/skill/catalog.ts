import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { resolveExistingDirectory, slugify } from "../fs/path.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject, ResolvedMemory, RunSkillRecord } from "../types/index.js";
import { WorkbenchStore, type StoredSkillIndex } from "../workbench/store.js";

export interface SkillListItem {
  skillId: string;
  name: string;
  description: string;
  sourcePath: string;
  sourceHash: string;
  enabledProject: boolean;
  enabledTopics: string[];
  disabledTopics: string[];
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

const allowedCopyEntries = new Set(["SKILL.md", "references", "examples"]);

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
  const copied: string[] = [];
  for (const entry of allowedCopyEntries) {
    const from = join(sourceDir, entry);
    if (!existsSync(from)) continue;
    const to = join(destination, entry);
    await cp(from, to, { recursive: true, force: true });
    copied.push(entry);
  }
  const sourceHash = await hashSkillDirectory(destination);
  const indexed = await upsertSkillIndex(memory, project.id, skillId, metadata, destination, sourceHash);
  return { skill: await decorateSkill(memory, indexed), copied };
}

export async function listSkills(project: ManagedProject): Promise<SkillListItem[]> {
  const memory = await resolveProjectMemory(project);
  const store = await WorkbenchStore.open(memory);
  try {
    await refreshSkillIndex(memory, project.id, store);
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
    await refreshSkillIndex(memory, project.id, store);
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
    await refreshSkillIndex(memory, project.id, store);
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
      const sync = store.readBridgeSync(project.id, skillId);
      records.push({
        id: skill.skillId,
        sourceHash: skill.sourceHash,
        materializedHash: sync?.materializedHash ?? null,
        bridge: sync ? "aho-managed" : undefined,
        version: sync?.bridgeVersion,
      });
      if (!sync || sync.materializedHash !== skill.sourceHash) {
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
          "AHO-managed skills are available through the Codex bridge when synced. Do not treat Codex global skills as project truth.",
          "",
          ...records.map((record) => `- ${record.id}: sourceHash=${record.sourceHash}${record.bridge ? `; bridge=${record.bridge}` : ""}${record.materializedHash ? `; materializedHash=${record.materializedHash}` : ""}`),
        ].join("\n")
        : "",
    };
  } finally {
    store.close();
  }
}

export async function hashSkillDirectory(path: string): Promise<string> {
  const hash = createHash("sha256");
  const files = await listAllowedFiles(path);
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
  for (const entry of allowedCopyEntries) {
    const from = join(sourcePath, entry);
    if (!existsSync(from)) continue;
    const to = join(targetPath, entry);
    if (entry === "SKILL.md") {
      const raw = await readFile(from, "utf8");
      await writeFile(to, rewriteSkillName(raw, materializedName), "utf8");
    } else {
      await cp(from, to, { recursive: true, force: true });
    }
  }
}

async function upsertSkillIndex(
  memory: ResolvedMemory,
  projectId: string,
  skillId: string,
  metadata: SkillMetadata,
  sourcePath: string,
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

async function refreshSkillIndex(memory: ResolvedMemory, projectId: string, store: WorkbenchStore): Promise<void> {
  if (!existsSync(memory.skillsRoot)) return;
  for (const entry of await readdir(memory.skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourcePath = join(memory.skillsRoot, entry.name);
    const skillPath = join(sourcePath, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const raw = await readFile(skillPath, "utf8");
    const metadata = parseSkillMetadata(raw, entry.name);
    const sourceHash = await hashSkillDirectory(sourcePath);
    store.upsertSkill({
      projectId,
      skillId: entry.name,
      name: metadata.name,
      description: metadata.description,
      sourcePath,
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
    const sync = store.readBridgeSync(skill.projectId, skill.skillId);
    return {
      skillId: skill.skillId,
      name: skill.name,
      description: skill.description,
      sourcePath: skill.sourcePath,
      sourceHash: skill.sourceHash,
      enabledProject: enablements.some((item) => item.scope === "project" && item.enabled),
      enabledTopics: enablements.filter((item) => item.scope === "topic" && item.enabled && item.changeId).map((item) => item.changeId as string),
      disabledTopics: enablements.filter((item) => item.scope === "topic" && !item.enabled && item.changeId).map((item) => item.changeId as string),
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

async function listAllowedFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of allowedCopyEntries) {
    const path = join(root, entry);
    if (!existsSync(path)) continue;
    const info = await stat(path);
    if (info.isFile()) files.push(path);
    else await collectFiles(path, files);
  }
  return files.sort();
}

async function collectFiles(root: string, files: string[]): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await collectFiles(path, files);
    else if (entry.isFile()) files.push(path);
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

function ensureNotNestedInSelf(sourceDir: string, destination: string): void {
  const source = resolve(sourceDir);
  const target = resolve(destination);
  if (target === source || target.startsWith(`${source}${sep}`)) {
    throw new Error("Cannot import a skill into itself.");
  }
}
