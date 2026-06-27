import type { Dirent } from "node:fs";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ManagedProject } from "../types/index.js";

export type TopicFileReferenceKind = "file" | "directory";

export interface TopicFileReference {
  relativePath: string;
  name: string;
  kind: TopicFileReferenceKind;
  extension?: string;
  size?: number;
  source?: "composer";
}

export interface ProjectFileSearchOptions {
  query?: string;
  limit?: number;
}

export interface TopicFileReferenceResolution {
  text: string;
  contextRefs: TopicFileReference[];
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VISITED_ENTRIES = 5000;
const IGNORED_NAMES = new Set([
  ".git",
  ".agent-harness",
  ".aho",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".parcel-cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
  ".DS_Store",
]);

export async function searchProjectFiles(project: ManagedProject, options: ProjectFileSearchOptions = {}): Promise<TopicFileReference[]> {
  const root = await safeProjectRoot(project);
  const query = normalizeQuery(options.query);
  const limit = normalizeLimit(options.limit);
  const results: TopicFileReference[] = [];
  const queue: string[] = [root];
  let visited = 0;

  while (queue.length > 0 && results.length < limit && visited < MAX_VISITED_ENTRIES) {
    const current = queue.shift()!;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (results.length >= limit || visited >= MAX_VISITED_ENTRIES) break;
      visited += 1;
      if (shouldIgnoreName(entry.name)) continue;
      const absolutePath = resolve(current, entry.name);
      const candidate = await toSafeReference(root, absolutePath).catch(() => null);
      if (!candidate) continue;
      if (candidate.kind === "directory") queue.push(absolutePath);
      if (!matchesQuery(candidate, query)) continue;
      results.push(candidate);
    }
  }

  return results;
}

export async function resolveTopicFileReferences(
  project: ManagedProject,
  text: string,
  providedRefs: TopicFileReference[] = [],
): Promise<TopicFileReferenceResolution> {
  const root = await safeProjectRoot(project);
  const refs: TopicFileReference[] = [];
  const seen = new Set<string>();
  const addRef = (ref: TopicFileReference): void => {
    if (seen.has(ref.relativePath)) return;
    seen.add(ref.relativePath);
    refs.push({ ...ref, source: "composer" });
  };

  for (const ref of providedRefs) {
    const safe = await toSafeReference(root, resolve(root, normalizeRelativePath(ref.relativePath))).catch(() => null);
    if (safe) addRef(safe);
  }

  const cleaned = await replaceAsync(text, /(^|\s)@(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s@]+))/g, async (match) => {
    const prefix = match[1] ?? "";
    const doubleQuoted = match[2];
    const singleQuoted = match[3];
    const backtick = match[4];
    const bare = match[5];
    const rawTarget = (doubleQuoted ?? singleQuoted ?? backtick ?? bare ?? "").trim();
    const target = stripLineFragment(rawTarget);
    if (!target || isUnsafeReferenceToken(target)) return match[0];
    const safe = await toSafeReference(root, resolve(root, normalizeRelativePath(target))).catch(() => null);
    if (!safe) return match[0];
    addRef(safe);
    return prefix;
  });

  return {
    text: cleaned.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").trim(),
    contextRefs: refs,
  };
}

export function renderTopicFileReferencesForPrompt(refs: TopicFileReference[] | undefined): string[] {
  if (!refs || refs.length === 0) return [];
  return [
    "## User Referenced Project Files",
    "",
    "These are scoped user-selected project file references. They are runtime context only and do not authorize source mutation or Harness transitions.",
    ...refs.map((ref) => `- ${ref.kind}: ${ref.relativePath}`),
  ];
}

async function safeProjectRoot(project: ManagedProject): Promise<string> {
  return realpath(resolve(project.path));
}

async function toSafeReference(root: string, absolutePath: string): Promise<TopicFileReference | null> {
  const normalized = resolve(absolutePath);
  if (!isInside(root, normalized)) return null;
  const entry = await lstat(normalized);
  if (entry.isSymbolicLink()) return null;
  const resolved = await realpath(normalized);
  if (!isInside(root, resolved)) return null;
  const info = await stat(resolved);
  const kind: TopicFileReferenceKind | null = info.isDirectory() ? "directory" : info.isFile() ? "file" : null;
  if (!kind) return null;
  if (kind === "file" && info.size > MAX_FILE_SIZE_BYTES) return null;
  const relativePath = relative(root, resolved).split(sep).join("/");
  if (!relativePath || relativePath.startsWith("..") || relativePath.includes("/../")) return null;
  const name = relativePath.split("/").pop() ?? relativePath;
  return {
    relativePath,
    name,
    kind,
    extension: kind === "file" ? extname(name).replace(/^\./, "") || undefined : undefined,
    size: kind === "file" ? info.size : undefined,
    source: "composer",
  };
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function stripLineFragment(value: string): string {
  return value.replace(/#L\d+(?:-L\d+)?$/i, "").trim();
}

function isUnsafeReferenceToken(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.includes("\0");
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function normalizeQuery(value?: string): string {
  return (value ?? "").trim().replace(/\\/g, "/").toLowerCase();
}

function normalizeLimit(value?: number): number {
  if (!Number.isFinite(value) || !value) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}

function shouldIgnoreName(name: string): boolean {
  return IGNORED_NAMES.has(name);
}

function matchesQuery(ref: TopicFileReference, query: string): boolean {
  if (!query) return true;
  return ref.relativePath.toLowerCase().includes(query) || ref.name.toLowerCase().includes(query);
}

async function replaceAsync(
  input: string,
  pattern: RegExp,
  replacer: (match: RegExpMatchArray) => Promise<string>,
): Promise<string> {
  const matches = Array.from(input.matchAll(pattern));
  if (matches.length === 0) return input;
  let output = "";
  let lastIndex = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    output += input.slice(lastIndex, index);
    output += await replacer(match);
    lastIndex = index + match[0].length;
  }
  output += input.slice(lastIndex);
  return output;
}
