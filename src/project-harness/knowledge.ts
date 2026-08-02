import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { atomicWriteFile, parseJsonText, writeJsonFile } from "../fs/json.js";
import { projectRelativePath } from "./contracts.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";

export const PROJECT_KNOWLEDGE_LAYERS = ["L1", "L2", "L3"] as const;
export const PROJECT_KNOWLEDGE_KINDS = ["current", "target", "decision", "guide"] as const;
export const PROJECT_KNOWLEDGE_STATUSES = [
  "proposed",
  "accepted",
  "in_progress",
  "implemented",
  "retired",
] as const;

export type ProjectKnowledgeLayer = typeof PROJECT_KNOWLEDGE_LAYERS[number];
export type ProjectKnowledgeKind = typeof PROJECT_KNOWLEDGE_KINDS[number];
export type ProjectKnowledgeStatus = typeof PROJECT_KNOWLEDGE_STATUSES[number];

export interface ProjectKnowledgeContext {
  projectId: string;
  projectRoot: string;
  skillRoot: string;
  fingerprintSources?: ProjectKnowledgeSourceFingerprinter;
}

export type ProjectKnowledgeSourceFingerprinter = (
  projectRoot: string,
  relativePaths: readonly string[],
) => Promise<ReadonlyMap<string, string | null>>;

export interface ProjectKnowledgeMetadata {
  id: string;
  layer: ProjectKnowledgeLayer;
  kind: ProjectKnowledgeKind;
  status: ProjectKnowledgeStatus;
  owner: string;
  modules: string[];
  evidence: string[];
  managedBy: "agent" | "renderer";
}

export interface ProjectKnowledgeCatalogEntry {
  relativePath: string;
  metadata: ProjectKnowledgeMetadata;
}

export interface ProjectKnowledgeDocument extends ProjectKnowledgeCatalogEntry {
  contentFingerprint: string;
  sourceFingerprints: Record<string, string>;
}

export type ProjectKnowledgeFindingType =
  | "missing-wiki"
  | "linked-path"
  | "invalid-frontmatter"
  | "duplicate-id"
  | "absolute-path"
  | "path-escape"
  | "missing-source"
  | "missing-baseline"
  | "invalid-baseline"
  | "orphan-baseline"
  | "stale-content-fingerprint"
  | "stale-source-fingerprint"
  | "missing-catalog"
  | "catalog-drift"
  | "legacy-index-present";

export interface ProjectKnowledgeFinding {
  type: ProjectKnowledgeFindingType;
  path: string;
  detail: string;
  knowledgeId?: string;
  source?: string;
}

export interface ProjectKnowledgeReport {
  healthy: boolean;
  projectId: string;
  checkedDocuments: number;
  checkedSources: number;
  documents: ProjectKnowledgeDocument[];
  findings: ProjectKnowledgeFinding[];
}

export interface ProjectKnowledgeBaseline {
  schema_version: "1.0";
  project_id: string;
  documents: Record<string, {
    path: string;
    content_fingerprint: string;
    source_fingerprints: Record<string, string>;
  }>;
}

const knowledgeIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const baselineSchema = z.object({
  schema_version: z.literal("1.0"),
  project_id: z.string().min(1),
  documents: z.record(z.object({
    path: z.string().min(1),
    content_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    source_fingerprints: z.record(z.string().regex(/^(?:[a-f0-9]{64}|missing)$/)),
  }).strict()),
}).strict();

const WIKI_RELATIVE_PATH = "references/project_wiki";
const CATALOG_RELATIVE_PATH = `${WIKI_RELATIVE_PATH}/catalog.md`;
const BASELINE_RELATIVE_PATH = `${WIKI_RELATIVE_PATH}/.ecl-baselines.json`;
const LEGACY_INDEX_RELATIVE_PATH = `${WIKI_RELATIVE_PATH}/index.json`;
const MAX_FRONTMATTER_BYTES = 64 * 1024;

export async function readProjectKnowledgeCatalogEntries(
  context: ProjectKnowledgeContext,
): Promise<{ entries: ProjectKnowledgeCatalogEntry[]; findings: ProjectKnowledgeFinding[] }> {
  const skillRoot = await assertPhysicalDirectory(context.skillRoot, "project Harness Skill");
  const wikiRoot = await resolveWithinPhysicalRoot(skillRoot, WIKI_RELATIVE_PATH, "project knowledge");
  const findings: ProjectKnowledgeFinding[] = [];
  const paths = await discoverMarkdownPaths(wikiRoot, findings);
  const entries: ProjectKnowledgeCatalogEntry[] = [];
  for (const path of paths) {
    const relativePath = relative(wikiRoot, path).replace(/\\/g, "/");
    try {
      entries.push({
        relativePath,
        metadata: parseProjectKnowledgeFrontmatter(await readFrontmatterPrefix(path), relativePath),
      });
    } catch (error) {
      findings.push({
        type: "invalid-frontmatter",
        path: relativePath,
        detail: (error as Error).message,
      });
    }
  }
  const byId = new Map<string, string>();
  for (const entry of entries) {
    const previous = byId.get(entry.metadata.id);
    if (previous) {
      findings.push({
        type: "duplicate-id",
        path: entry.relativePath,
        knowledgeId: entry.metadata.id,
        detail: `Knowledge id ${entry.metadata.id} is already owned by ${previous}.`,
      });
    } else {
      byId.set(entry.metadata.id, entry.relativePath);
    }
  }
  return { entries: sortCatalogEntries(entries), findings: sortFindings(findings) };
}

export function renderProjectKnowledgeCatalog(entries: readonly ProjectKnowledgeCatalogEntry[]): string {
  const rows = sortCatalogEntries(entries).map(({ relativePath, metadata }) => {
    const modules = metadata.modules.length > 0 ? metadata.modules.join(", ") : "-";
    const link = relativePath.split("/").map(encodeURIComponent).join("/");
    return `| ${metadata.layer} | ${metadata.kind} | ${metadata.status} | ${metadata.owner} | ${modules} | [${metadata.id}](${link}) |`;
  });
  return [
    "# Project Knowledge Catalog",
    "",
    "> Generated from project Wiki frontmatter. Do not edit this file directly.",
    "",
    "| Layer | Kind | Status | Owner | Modules | Document |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

export async function scanProjectKnowledge(context: ProjectKnowledgeContext): Promise<ProjectKnowledgeReport> {
  return inspectProjectKnowledge(context, false);
}

export async function checkProjectKnowledge(context: ProjectKnowledgeContext): Promise<ProjectKnowledgeReport> {
  return inspectProjectKnowledge(context, true);
}

export async function reindexProjectKnowledge(context: ProjectKnowledgeContext): Promise<ProjectKnowledgeReport> {
  const state = await collectKnowledgeState(context);
  if (state.findings.length > 0) {
    throw new Error(`Project knowledge cannot be reindexed:\n${state.findings.map((finding) => `- ${finding.path}: ${finding.detail}`).join("\n")}`);
  }
  const catalog = renderProjectKnowledgeCatalog(state.documents);
  const baseline = buildProjectKnowledgeBaseline(context.projectId, state.documents);
  const skillRoot = await assertPhysicalDirectory(context.skillRoot, "project Harness Skill");
  const catalogPath = await resolveWithinPhysicalRoot(skillRoot, CATALOG_RELATIVE_PATH, "project knowledge catalog");
  const baselinePath = await resolveWithinPhysicalRoot(skillRoot, BASELINE_RELATIVE_PATH, "project knowledge baseline");
  await atomicWriteFile(catalogPath, catalog);
  await writeJsonFile(baselinePath, baseline);
  return {
    healthy: true,
    projectId: context.projectId,
    checkedDocuments: state.documents.length,
    checkedSources: countSources(state.documents),
    documents: state.documents,
    findings: [],
  };
}

export function buildProjectKnowledgeBaseline(
  projectId: string,
  documents: readonly ProjectKnowledgeDocument[],
): ProjectKnowledgeBaseline {
  if (!projectId.trim()) throw new Error("Project knowledge baseline requires a project id.");
  const entries = [...documents]
    .sort((left, right) => left.metadata.id.localeCompare(right.metadata.id))
    .map((document) => [document.metadata.id, {
      path: document.relativePath,
      content_fingerprint: document.contentFingerprint,
      source_fingerprints: sortRecord(document.sourceFingerprints),
    }] as const);
  return { schema_version: "1.0", project_id: projectId, documents: Object.fromEntries(entries) };
}

async function inspectProjectKnowledge(
  context: ProjectKnowledgeContext,
  includeCatalog: boolean,
): Promise<ProjectKnowledgeReport> {
  const state = await collectKnowledgeState(context);
  const findings = [...state.findings];
  const skillRoot = await assertPhysicalDirectory(context.skillRoot, "project Harness Skill");
  const baselinePath = await resolveWithinPhysicalRoot(skillRoot, BASELINE_RELATIVE_PATH, "project knowledge baseline");
  const baseline = await readBaseline(baselinePath, context.projectId, findings);
  if (baseline) compareBaseline(baseline, state.documents, findings);

  const legacyIndexPath = await resolveWithinPhysicalRoot(skillRoot, LEGACY_INDEX_RELATIVE_PATH, "legacy project knowledge index");
  if (existsSync(legacyIndexPath)) {
    findings.push({
      type: "legacy-index-present",
      path: "index.json",
      detail: "Project knowledge uses Markdown frontmatter and catalog.md; index.json is not authoritative.",
    });
  }
  if (includeCatalog) {
    const catalogPath = await resolveWithinPhysicalRoot(skillRoot, CATALOG_RELATIVE_PATH, "project knowledge catalog");
    await compareCatalog(catalogPath, renderProjectKnowledgeCatalog(state.documents), findings);
  }
  const sorted = sortFindings(findings);
  return {
    healthy: sorted.length === 0,
    projectId: context.projectId,
    checkedDocuments: state.documents.length,
    checkedSources: countSources(state.documents),
    documents: state.documents,
    findings: sorted,
  };
}

async function collectKnowledgeState(context: ProjectKnowledgeContext): Promise<{
  documents: ProjectKnowledgeDocument[];
  findings: ProjectKnowledgeFinding[];
}> {
  const projectRoot = await assertPhysicalDirectory(context.projectRoot, "project source");
  const metadata = await readProjectKnowledgeCatalogEntries(context);
  const findings = [...metadata.findings];
  const localSources = new Set<string>();
  const validEvidence = new Map<string, string[]>();
  for (const entry of metadata.entries) {
    const sources: string[] = [];
    for (const evidence of entry.metadata.evidence) {
      const source = classifyEvidenceSource(evidence, entry, findings);
      if (source) {
        sources.push(source);
        localSources.add(source);
      }
    }
    validEvidence.set(entry.relativePath, sources);
  }
  const sourceFingerprints = await (context.fingerprintSources ?? fingerprintLocalSources)(
    projectRoot,
    [...localSources].sort((left, right) => left.localeCompare(right)),
  );
  const documents: ProjectKnowledgeDocument[] = [];
  for (const entry of metadata.entries) {
    const absolute = await resolveWithinPhysicalRoot(
      await resolveWithinPhysicalRoot(context.skillRoot, WIKI_RELATIVE_PATH, "project knowledge"),
      entry.relativePath,
      "project knowledge document",
    );
    const content = await readFile(absolute);
    if (containsMachineAbsolutePath(content.toString("utf8"))
      && !findings.some((finding) => finding.type === "absolute-path" && finding.path === entry.relativePath)) {
      findings.push({
        type: "absolute-path",
        path: entry.relativePath,
        knowledgeId: entry.metadata.id,
        detail: "Knowledge document contains a machine-specific absolute path.",
      });
    }
    const documentSources: Record<string, string> = {};
    for (const source of validEvidence.get(entry.relativePath) ?? []) {
      const fingerprint = sourceFingerprints.get(source);
      documentSources[source] = fingerprint ?? "missing";
      if (!fingerprint) {
        findings.push({
          type: "missing-source",
          path: entry.relativePath,
          knowledgeId: entry.metadata.id,
          source,
          detail: `Knowledge evidence source does not exist: ${source}.`,
        });
      }
    }
    documents.push({
      ...entry,
      contentFingerprint: sha256(content),
      sourceFingerprints: sortRecord(documentSources),
    });
  }
  return { documents: sortDocuments(documents), findings: sortFindings(findings) };
}

async function discoverMarkdownPaths(
  wikiRoot: string,
  findings: ProjectKnowledgeFinding[],
): Promise<string[]> {
  if (!existsSync(wikiRoot)) {
    findings.push({ type: "missing-wiki", path: WIKI_RELATIVE_PATH, detail: "Project Wiki directory is missing." });
    return [];
  }
  const rootInfo = await lstat(wikiRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    findings.push({ type: "linked-path", path: WIKI_RELATIVE_PATH, detail: "Project Wiki must be a physical directory." });
    return [];
  }
  const paths: string[] = [];
  await walk(wikiRoot, wikiRoot, paths, findings);
  return paths.sort((left, right) => left.localeCompare(right));
}

async function walk(
  root: string,
  current: string,
  paths: string[],
  findings: ProjectKnowledgeFinding[],
): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    const path = relative(root, absolute).replace(/\\/g, "/");
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) {
      findings.push({ type: "linked-path", path, detail: "Project knowledge must not traverse a link or Junction." });
      continue;
    }
    if (info.isDirectory()) {
      await walk(root, absolute, paths, findings);
    } else if (info.isFile() && entry.name.endsWith(".md") && path !== "catalog.md") {
      paths.push(absolute);
    }
  }
}

export function parseProjectKnowledgeFrontmatter(raw: string, pathForError = "project knowledge"): ProjectKnowledgeMetadata {
  const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw new Error(`${pathForError} has no YAML frontmatter.`);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) throw new Error(`${pathForError} has unterminated YAML frontmatter.`);
  const values = new Map<string, string | string[]>();
  let inEcl = false;
  let currentList: string | null = null;
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^ecl:\s*$/.test(line)) {
      inEcl = true;
      currentList = null;
      continue;
    }
    if (!inEcl) continue;
    const field = line.match(/^ {2}([A-Za-z_][A-Za-z0-9_]*):(?:\s*(.*))?$/);
    if (field) {
      const [, key, rawValue = ""] = field;
      currentList = null;
      if (!rawValue) {
        values.set(key, []);
        currentList = key;
      } else if (rawValue.trim().startsWith("[")) {
        values.set(key, parseInlineList(rawValue, pathForError));
      } else {
        values.set(key, parseYamlScalar(rawValue, pathForError));
      }
      continue;
    }
    const item = line.match(/^ {4}-\s+(.+)$/);
    if (item && currentList) {
      const list = values.get(currentList);
      if (!Array.isArray(list)) throw new Error(`${pathForError} has an invalid ${currentList} list.`);
      list.push(parseYamlScalar(item[1], pathForError));
      continue;
    }
    if (/^[^ ]/.test(line)) {
      inEcl = false;
      currentList = null;
      continue;
    }
    throw new Error(`${pathForError} has unsupported frontmatter syntax: ${line.trim()}.`);
  }
  if (!inEcl && values.size === 0) throw new Error(`${pathForError} has no ecl metadata.`);
  const id = requiredScalar(values, "id", pathForError);
  const owner = requiredScalar(values, "owner", pathForError);
  if (!knowledgeIdSchema.safeParse(id).success) throw new Error(`${pathForError} has an invalid knowledge id: ${id}.`);
  if (!knowledgeIdSchema.safeParse(owner).success) throw new Error(`${pathForError} has an invalid knowledge owner: ${owner}.`);
  const layer = requiredEnum(values, "layer", PROJECT_KNOWLEDGE_LAYERS, pathForError);
  const kind = requiredEnum(values, "kind", PROJECT_KNOWLEDGE_KINDS, pathForError);
  const status = requiredEnum(values, "status", PROJECT_KNOWLEDGE_STATUSES, pathForError);
  const managedBy = optionalScalar(values, "managed_by", "agent", pathForError);
  if (managedBy !== "agent" && managedBy !== "renderer") {
    throw new Error(`${pathForError} has an invalid managed_by value: ${managedBy}.`);
  }
  const modules = optionalList(values, "modules", pathForError);
  for (const module of modules) {
    if (!knowledgeIdSchema.safeParse(module).success) throw new Error(`${pathForError} has an invalid module id: ${module}.`);
  }
  return {
    id,
    layer,
    kind,
    status,
    owner,
    modules,
    evidence: optionalList(values, "evidence", pathForError),
    managedBy,
  };
}

async function readFrontmatterPrefix(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    let buffer = Buffer.alloc(0);
    let offset = 0;
    while (buffer.length < MAX_FRONTMATTER_BYTES) {
      const chunk = Buffer.alloc(Math.min(1024, MAX_FRONTMATTER_BYTES - buffer.length));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
      buffer = Buffer.concat([buffer, chunk.subarray(0, bytesRead)]);
      const text = buffer.toString("utf8");
      const match = text.match(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
      if (match) return match[0];
    }
  } finally {
    await handle.close();
  }
  throw new Error(`${path} has missing or oversized YAML frontmatter.`);
}

function classifyEvidenceSource(
  evidence: string,
  entry: ProjectKnowledgeCatalogEntry,
  findings: ProjectKnowledgeFinding[],
): string | null {
  if (containsMachineAbsolutePath(evidence)) {
    findings.push({
      type: "absolute-path",
      path: entry.relativePath,
      knowledgeId: entry.metadata.id,
      source: evidence,
      detail: "Knowledge evidence contains a machine-specific absolute path.",
    });
    return null;
  }
  if (/^(?:user|registry|contract):/i.test(evidence) || /^https?:\/\//i.test(evidence)) return null;
  const path = evidence.split("::", 1)[0].replace(/#L\d+(?:-L?\d+)?$/i, "");
  try {
    return projectRelativePath(path) as string;
  } catch (error) {
    findings.push({
      type: "path-escape",
      path: entry.relativePath,
      knowledgeId: entry.metadata.id,
      source: evidence,
      detail: (error as Error).message,
    });
    return null;
  }
}

async function fingerprintLocalSources(
  projectRoot: string,
  relativePaths: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  const result = new Map<string, string | null>();
  for (const path of relativePaths) {
    const absolute = await resolveWithinPhysicalRoot(projectRoot, path, "project knowledge evidence");
    try {
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Project knowledge evidence is a link or Junction: ${path}`);
      result.set(path, info.isDirectory() ? await fingerprintDirectory(absolute) : info.isFile() ? sha256(await readFile(absolute)) : null);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") result.set(path, null);
      else throw error;
    }
  }
  return result;
}

async function fingerprintDirectory(root: string): Promise<string> {
  const hash = createHash("sha256");
  const files: string[] = [];
  await collectSourceFiles(root, root, files);
  for (const file of files.sort((left, right) => left.localeCompare(right))) {
    hash.update(relative(root, file).replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function collectSourceFiles(root: string, current: string, files: string[]): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "__pycache__" || entry.name.endsWith(".pyc")) continue;
    const absolute = join(current, entry.name);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Project knowledge evidence traverses a link or Junction: ${absolute}`);
    if (info.isDirectory()) await collectSourceFiles(root, absolute, files);
    else if (info.isFile()) files.push(absolute);
  }
}

async function readBaseline(
  path: string,
  projectId: string,
  findings: ProjectKnowledgeFinding[],
): Promise<ProjectKnowledgeBaseline | null> {
  if (!existsSync(path)) {
    findings.push({ type: "missing-baseline", path: ".ecl-baselines.json", detail: "Project knowledge baseline is missing." });
    return null;
  }
  try {
    const baseline = baselineSchema.parse(parseJsonText(await readFile(path, "utf8"), path));
    if (baseline.project_id !== projectId) {
      findings.push({
        type: "invalid-baseline",
        path: ".ecl-baselines.json",
        detail: `Project knowledge baseline belongs to ${baseline.project_id}, expected ${projectId}.`,
      });
      return null;
    }
    return baseline;
  } catch (error) {
    findings.push({ type: "invalid-baseline", path: ".ecl-baselines.json", detail: (error as Error).message });
    return null;
  }
}

function compareBaseline(
  baseline: ProjectKnowledgeBaseline,
  documents: readonly ProjectKnowledgeDocument[],
  findings: ProjectKnowledgeFinding[],
): void {
  const currentIds = new Set(documents.map((document) => document.metadata.id));
  for (const document of documents) {
    const expected = baseline.documents[document.metadata.id];
    if (!expected) {
      findings.push({
        type: "missing-baseline",
        path: document.relativePath,
        knowledgeId: document.metadata.id,
        detail: "Knowledge document has no baseline entry.",
      });
      continue;
    }
    if (expected.path !== document.relativePath || expected.content_fingerprint !== document.contentFingerprint) {
      findings.push({
        type: "stale-content-fingerprint",
        path: document.relativePath,
        knowledgeId: document.metadata.id,
        detail: "Knowledge document content differs from its baseline.",
      });
    }
    const sourceKeys = new Set([...Object.keys(expected.source_fingerprints), ...Object.keys(document.sourceFingerprints)]);
    for (const source of [...sourceKeys].sort()) {
      if (expected.source_fingerprints[source] !== document.sourceFingerprints[source]) {
        findings.push({
          type: "stale-source-fingerprint",
          path: document.relativePath,
          knowledgeId: document.metadata.id,
          source,
          detail: `Knowledge evidence fingerprint changed: ${source}.`,
        });
      }
    }
  }
  for (const [id, value] of Object.entries(baseline.documents)) {
    if (!currentIds.has(id)) {
      findings.push({ type: "orphan-baseline", path: value.path, knowledgeId: id, detail: "Baseline entry has no knowledge document." });
    }
  }
}

async function compareCatalog(
  path: string,
  expected: string,
  findings: ProjectKnowledgeFinding[],
): Promise<void> {
  if (!existsSync(path)) {
    findings.push({ type: "missing-catalog", path: "catalog.md", detail: "Generated project knowledge catalog is missing." });
    return;
  }
  if (await readFile(path, "utf8") !== expected) {
    findings.push({ type: "catalog-drift", path: "catalog.md", detail: "Generated project knowledge catalog is stale." });
  }
}

function requiredScalar(values: Map<string, string | string[]>, key: string, path: string): string {
  const value = values.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} requires scalar ecl.${key}.`);
  return value.trim();
}

function optionalScalar(
  values: Map<string, string | string[]>,
  key: string,
  fallback: string,
  path: string,
): string {
  const value = values.get(key);
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`${path} requires scalar ecl.${key}.`);
  return value.trim();
}

function optionalList(values: Map<string, string | string[]>, key: string, path: string): string[] {
  const value = values.get(key);
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${path} requires list ecl.${key}.`);
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function requiredEnum<const T extends readonly string[]>(
  values: Map<string, string | string[]>,
  key: string,
  allowed: T,
  path: string,
): T[number] {
  const value = requiredScalar(values, key, path);
  if (!allowed.includes(value)) throw new Error(`${path} has invalid ecl.${key}: ${value}.`);
  return value as T[number];
}

function parseInlineList(raw: string, path: string): string[] {
  const value = raw.trim();
  if (!value.endsWith("]")) throw new Error(`${path} has an unterminated inline list.`);
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((item) => parseYamlScalar(item, path));
}

function parseYamlScalar(raw: string, path: string): string {
  const value = raw.trim();
  if (!value) throw new Error(`${path} contains an empty YAML scalar.`);
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== "string") throw new Error("not a string");
      return parsed;
    } catch (error) {
      throw new Error(`${path} has an invalid quoted YAML scalar: ${(error as Error).message}`);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error(`${path} has an unterminated quoted YAML scalar.`);
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (/[{}[\]]/.test(value)) throw new Error(`${path} has an unsupported YAML scalar: ${value}.`);
  return value;
}

function containsMachineAbsolutePath(value: string): boolean {
  return /(?:^|[\s('"`])(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|opt|etc)\/)/m.test(value);
}

function sortCatalogEntries<T extends ProjectKnowledgeCatalogEntry>(entries: readonly T[]): T[] {
  const layerRank: Record<ProjectKnowledgeLayer, number> = { L1: 1, L2: 2, L3: 3 };
  return [...entries].sort((left, right) =>
    layerRank[left.metadata.layer] - layerRank[right.metadata.layer]
    || left.metadata.kind.localeCompare(right.metadata.kind)
    || left.metadata.id.localeCompare(right.metadata.id)
    || left.relativePath.localeCompare(right.relativePath));
}

function sortDocuments(documents: readonly ProjectKnowledgeDocument[]): ProjectKnowledgeDocument[] {
  return sortCatalogEntries(documents);
}

function sortFindings(findings: readonly ProjectKnowledgeFinding[]): ProjectKnowledgeFinding[] {
  return [...findings].sort((left, right) =>
    left.type.localeCompare(right.type)
    || left.path.localeCompare(right.path)
    || (left.knowledgeId ?? "").localeCompare(right.knowledgeId ?? "")
    || (left.source ?? "").localeCompare(right.source ?? ""));
}

function sortRecord(value: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function countSources(documents: readonly ProjectKnowledgeDocument[]): number {
  return new Set(documents.flatMap((document) => Object.keys(document.sourceFingerprints))).size;
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
