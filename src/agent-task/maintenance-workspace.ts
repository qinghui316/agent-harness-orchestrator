import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { gitText } from "../project/git.js";
import type { MaintenanceWorkspace, MaintenanceWorkspaceRequest, MaintenanceWorkspaceSource } from "../types/index.js";

export async function createMaintenanceWorkspace(request: MaintenanceWorkspaceRequest): Promise<MaintenanceWorkspace> {
  if (request.memoryMode === "remote") throw new Error("Remote maintenance workspaces are not supported.");
  const assignmentId = requireIdentifier(request.assignmentId);
  const baseRoot = resolve(request.memoryRoot);
  const maintenanceRoot = resolve(request.maintenanceRoot);
  const workspaceRoot = resolve(maintenanceRoot, "workspaces", assignmentId);
  const baseSnapshotRoot = resolve(maintenanceRoot, "baselines", assignmentId);
  assertWithin(maintenanceRoot, workspaceRoot);
  assertWithin(maintenanceRoot, baseSnapshotRoot);
  assertSeparateWorkspace(baseRoot, maintenanceRoot, workspaceRoot);
  const namespaces = normalizeNamespaces(request.namespaces);
  const additionalSources = normalizeAdditionalSources(request.additionalSources ?? []);
  const allNamespaces = workspaceNamespaces(namespaces, additionalSources);
  const metadataPath = resolve(workspaceRoot, ".maintenance-workspace.json");
  const existing = await readExistingWorkspace(metadataPath);
  if (existing) {
    if (existing.assignmentId !== assignmentId || existing.baseRoot !== baseRoot
      || existing.maintenanceRoot !== maintenanceRoot || existing.workspaceRoot !== workspaceRoot || existing.baseSnapshotRoot !== baseSnapshotRoot
      || JSON.stringify(existing.namespaces) !== JSON.stringify(namespaces)
      || JSON.stringify(existing.additionalSources ?? []) !== JSON.stringify(additionalSources)) {
      throw new Error("Existing maintenance workspace belongs to another assignment or boundary.");
    }
    const baseTree = await readMaintenanceTree(existing, "base");
    if (hashTree(baseTree) !== existing.baseTreeHash) throw new Error("Existing maintenance workspace baseline is stale or damaged.");
    return existing;
  }
  if (await pathExists(workspaceRoot) || await pathExists(baseSnapshotRoot)) {
    throw new Error("Incomplete maintenance workspace exists without valid assignment metadata.");
  }

  let baseRef: string;
  let mode: MaintenanceWorkspace["mode"];
  const sourceTree = await readCanonicalSources(baseRoot, namespaces, additionalSources);
  const baseHash = hashTree(sourceTree);
  if (request.memoryMode === "repo-local") {
    const requestedBaseRef = request.baseRef ?? "HEAD";
    baseRef = (await gitText(baseRoot, ["rev-parse", "--verify", `${requestedBaseRef}^{commit}`])).trim();
    await mkdir(resolve(workspaceRoot, ".."), { recursive: true });
    await gitText(baseRoot, ["worktree", "add", "--detach", "--no-checkout", workspaceRoot, baseRef]);
    try {
      await gitText(workspaceRoot, ["sparse-checkout", "init", "--no-cone"]);
      const patterns = allNamespaces.flatMap((namespace) => namespace.toLowerCase().endsWith(".md")
        ? [`/${namespace}`]
        : [`/${namespace}/*.md`, `/${namespace}/**/*.md`]);
      await gitText(workspaceRoot, ["sparse-checkout", "set", "--no-cone", "--", ...patterns]);
      await gitText(workspaceRoot, ["checkout", "--detach", baseRef]);
      for (const namespace of namespaces) {
        const target = resolve(workspaceRoot, ...namespace.split("/"));
        assertWithin(workspaceRoot, target);
        await rm(target, { recursive: true, force: true });
      }
      for (const file of sourceTree) {
        const target = resolve(workspaceRoot, ...file.path.split("/"));
        assertWithin(workspaceRoot, target);
        await mkdir(resolve(target, ".."), { recursive: true });
        await writeFile(target, file.content, "utf8");
      }
    } catch (error) {
      await removeMaintenanceWorkspace(maintenanceRoot, { workspaceRoot, mode: "git-worktree", baseRoot, maintenanceRoot, baseSnapshotRoot });
      throw error;
    }
    mode = "git-worktree";
  } else {
    await mkdir(workspaceRoot, { recursive: true });
    baseRef = request.baseRef ?? "snapshot";
    for (const file of sourceTree) {
      const target = resolve(workspaceRoot, file.path);
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, file.content, { encoding: "utf8", flag: "wx" });
    }
    mode = "immutable-snapshot";
  }

  const baseTree = await readMaintenanceTree({
    version: "1.0", assignmentId, mode: mode === "git-worktree" ? "git-worktree" : "immutable-snapshot",
    memoryMode: request.memoryMode, maintenanceRoot, baseRoot, baseSnapshotRoot, workspaceRoot,
    namespaces, additionalSources, baseRef, baseHash, baseTreeHash: "pending",
  }, "workspace");
  for (const file of baseTree) {
    const target = resolve(baseSnapshotRoot, file.path);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, file.content, "utf8");
    await chmod(target, 0o444).catch(() => undefined);
  }
  const workspace: MaintenanceWorkspace = {
    version: "1.0", assignmentId, mode, memoryMode: request.memoryMode, maintenanceRoot, baseRoot, workspaceRoot,
    baseSnapshotRoot, namespaces, ...(additionalSources.length > 0 ? { additionalSources } : {}), baseRef, baseHash, baseTreeHash: hashTree(baseTree),
  };
  await writeFile(metadataPath, JSON.stringify(workspace), { encoding: "utf8", flag: "wx" });
  return workspace;
}

export async function removeMaintenanceWorkspace(
  trustedMaintenanceRoot: string,
  workspace: Pick<MaintenanceWorkspace, "workspaceRoot" | "mode" | "baseRoot" | "maintenanceRoot" | "baseSnapshotRoot">,
): Promise<void> {
  const trustedRoot = resolve(trustedMaintenanceRoot);
  if (resolve(workspace.maintenanceRoot) !== trustedRoot) throw new Error("Maintenance workspace cleanup root is not trusted.");
  assertStrictlyWithin(trustedRoot, resolve(workspace.workspaceRoot));
  assertStrictlyWithin(trustedRoot, resolve(workspace.baseSnapshotRoot));
  if (workspace.mode === "git-worktree") {
    await gitText(workspace.baseRoot, ["worktree", "remove", "--force", workspace.workspaceRoot]);
  } else {
    await rm(workspace.workspaceRoot, { recursive: true, force: true });
  }
  await rm(workspace.baseSnapshotRoot, { recursive: true, force: true });
}

export interface MarkdownTreeEntry { path: string; content: string; hash: string; sourceKey?: "project" }

export async function readMaintenanceTree(
  workspace: MaintenanceWorkspace,
  source: "base" | "workspace",
): Promise<MarkdownTreeEntry[]> {
  const namespaces = workspaceNamespaces(workspace.namespaces, workspace.additionalSources ?? []);
  const root = source === "base" ? workspace.baseSnapshotRoot : workspace.workspaceRoot;
  const files = await readMarkdownTree(root, namespaces, source === "workspace");
  return files.map((file) => {
    const sourceKey = sourceKeyForPath(file.path, workspace.additionalSources ?? []);
    return sourceKey ? { ...file, sourceKey } : file;
  });
}

export async function readMarkdownTree(root: string, namespaces: string[], allowMetadata: boolean): Promise<MarkdownTreeEntry[]> {
  const normalizedRoot = resolve(root);
  const allowed = normalizeNamespaces(namespaces);
  const files: MarkdownTreeEntry[] = [];
  if (allowMetadata) {
    await walk(normalizedRoot, "");
  } else {
    for (const namespace of allowed) {
      const start = resolve(normalizedRoot, ...namespace.split("/"));
      assertWithin(normalizedRoot, start);
      const info = await lstat(start).catch(() => null);
      if (!info) continue;
      if (info.isSymbolicLink()) throw new Error(`Maintenance source rejects symbolic links: ${namespace}`);
      if (info.isDirectory()) await walk(start, namespace);
      else await collectFile(start, namespace, info);
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path, "en"));

  async function walk(current: string, relativePath: string): Promise<void> {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const path = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (allowMetadata && (path === ".git" || path === ".maintenance-workspace.json")) continue;
      const absolute = resolve(normalizedRoot, ...path.split("/"));
      assertWithin(normalizedRoot, absolute);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Maintenance workspace rejects symbolic links: ${path}`);
      if (info.isDirectory()) { await walk(absolute, path); continue; }
      await collectFile(absolute, path, info);
    }
  }

  async function collectFile(absolute: string, path: string, info: Awaited<ReturnType<typeof lstat>>): Promise<void> {
    if (!info.isFile()) throw new Error(`Maintenance workspace rejects non-file entries: ${path}`);
    if (!isAllowedPath(path, allowed)) throw new Error(`Maintenance workspace path is outside allowed namespaces: ${path}`);
    if (!path.toLowerCase().endsWith(".md")) {
      if (allowMetadata) throw new Error(`Maintenance workspace accepts Markdown files only: ${path}`);
      return;
    }
    const content = await readFile(absolute, "utf8");
    files.push({ path, content, hash: sha256(content) });
  }
}

async function readCanonicalSources(
  baseRoot: string,
  namespaces: string[],
  additionalSources: MaintenanceWorkspaceSource[],
): Promise<MarkdownTreeEntry[]> {
  const primary = await readMarkdownTree(baseRoot, namespaces, false);
  const additional = await Promise.all(additionalSources.map(async (source) =>
    (await readMarkdownTree(resolve(source.root), source.namespaces, false)).map((file) => ({ ...file, sourceKey: source.key }))));
  const combined = [...primary, ...additional.flat()];
  const seen = new Set<string>();
  for (const file of combined) {
    if (seen.has(file.path)) throw new Error(`Maintenance source namespaces overlap at ${file.path}.`);
    seen.add(file.path);
  }
  return combined.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export function hashTree(entries: MarkdownTreeEntry[]): string {
  return sha256(entries.slice().sort((left, right) => `${left.sourceKey ?? "memory"}:${left.path}`.localeCompare(`${right.sourceKey ?? "memory"}:${right.path}`, "en"))
    .map(({ path, hash, sourceKey }) => `${sourceKey ?? "memory"}:${path}\0${hash}\n`).join(""));
}

function normalizeNamespaces(values: string[]): string[] {
  const result = values.map((value) => value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, ""));
  if (result.length === 0) throw new Error("At least one maintenance namespace is required.");
  for (const value of result) {
    if (!value || isAbsolute(value) || value === ".." || value.startsWith("../") || value.includes("/../") || value.includes("\0")) {
      throw new Error(`Invalid maintenance namespace: ${value}`);
    }
  }
  return [...new Set(result)].sort((a, b) => a.localeCompare(b, "en"));
}

function normalizeAdditionalSources(values: MaintenanceWorkspaceSource[]): MaintenanceWorkspaceSource[] {
  const result = values.map((value) => ({
    key: value.key,
    root: resolve(value.root),
    namespaces: normalizeNamespaces(value.namespaces),
  }));
  if (result.some((value) => value.key !== "project")) throw new Error("Unsupported maintenance source key.");
  const seen = new Set<string>();
  for (const source of result) {
    if (seen.has(source.key)) throw new Error(`Duplicate maintenance source key: ${source.key}.`);
    seen.add(source.key);
  }
  return result.sort((a, b) => a.key.localeCompare(b.key, "en"));
}

function workspaceNamespaces(namespaces: string[], additionalSources: MaintenanceWorkspaceSource[]): string[] {
  return [...new Set([...namespaces, ...additionalSources.flatMap((source) => source.namespaces)])]
    .sort((a, b) => a.localeCompare(b, "en"));
}

function sourceKeyForPath(path: string, additionalSources: MaintenanceWorkspaceSource[]): "project" | undefined {
  const source = additionalSources.find((item) => item.namespaces.some((namespace) => path === namespace || path.startsWith(`${namespace}/`)));
  return source?.key;
}

function isAllowedPath(path: string, namespaces: string[]): boolean {
  return namespaces.some((namespace) => path === namespace || path.startsWith(`${namespace}/`));
}

function assertWithin(root: string, target: string): void {
  const value = relative(root, target);
  if (value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) throw new Error("Maintenance workspace path traversal is not allowed.");
}

function assertStrictlyWithin(root: string, target: string): void {
  if (resolve(root) === resolve(target)) throw new Error("Maintenance cleanup target must be below its trusted root.");
  assertWithin(root, target);
}

function assertSeparateWorkspace(baseRoot: string, maintenanceRoot: string, workspaceRoot: string): void {
  assertWithin(resolve(baseRoot, ".."), baseRoot);
  if (workspaceRoot === baseRoot || baseRoot.startsWith(`${workspaceRoot}${sep}`)) {
    throw new Error("Maintenance workspace must be isolated from canonical memory.");
  }
  if (workspaceRoot.startsWith(`${baseRoot}${sep}`)
    && (maintenanceRoot === baseRoot || !maintenanceRoot.startsWith(`${baseRoot}${sep}`) || !workspaceRoot.startsWith(`${maintenanceRoot}${sep}`))) {
    throw new Error("Maintenance workspace must be isolated from canonical memory.");
  }
}

function requireIdentifier(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("Maintenance assignment id contains unsafe characters.");
  return value;
}

async function readExistingWorkspace(path: string): Promise<MaintenanceWorkspace | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as MaintenanceWorkspace;
    if (value.version !== "1.0") throw new Error("Unsupported maintenance workspace metadata version.");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
