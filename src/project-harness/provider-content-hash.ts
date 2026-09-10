import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { assertPhysicalDirectory } from "./path-safety.js";

export const PROJECT_HARNESS_PROVIDER_CONTENT_PATHS = [
  "SKILL.md",
  "references",
  "scripts",
  "assets",
  "agents",
] as const;

export async function hashProjectHarnessProviderContent(skillRoot: string): Promise<string> {
  const root = await assertPhysicalDirectory(skillRoot, "Project Harness Provider content root");
  const files: Array<{ absolutePath: string; relativePath: string }> = [];
  for (const ownedPath of PROJECT_HARNESS_PROVIDER_CONTENT_PATHS) {
    const absolutePath = resolve(root, ownedPath);
    assertWithinRoot(root, absolutePath);
    let info;
    try {
      info = await lstat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && ownedPath !== "SKILL.md") continue;
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`Project Harness Provider content must not contain a link or Junction: ${absolutePath}`);
    }
    if (ownedPath === "SKILL.md" && !info.isFile()) {
      throw new Error(`Project Harness Provider content requires SKILL.md: ${absolutePath}`);
    }
    await collectStableFiles(root, absolutePath, files);
  }
  if (!files.some((file) => file.relativePath === "SKILL.md")) {
    throw new Error(`Project Harness Provider content requires SKILL.md: ${root}`);
  }
  files.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    for await (const chunk of createReadStream(file.absolutePath)) hash.update(chunk);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function collectStableFiles(
  root: string,
  current: string,
  files: Array<{ absolutePath: string; relativePath: string }>,
): Promise<void> {
  const info = await lstat(current);
  if (info.isSymbolicLink()) {
    throw new Error(`Project Harness Provider content must not contain a link or Junction: ${current}`);
  }
  if (info.isFile()) {
    files.push({ absolutePath: current, relativePath: normalizedRelativePath(root, current) });
    return;
  }
  if (!info.isDirectory()) return;
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "__pycache__" || entry.name === "node_modules" || entry.name === ".git" || entry.name.endsWith(".pyc")) continue;
    const child = resolve(current, entry.name);
    assertWithinRoot(root, child);
    if (entry.isSymbolicLink()) {
      throw new Error(`Project Harness Provider content must not contain a link or Junction: ${child}`);
    }
    await collectStableFiles(root, child, files);
  }
}

function normalizedRelativePath(root: string, path: string): string {
  const value = relative(root, path).replace(/\\/g, "/");
  if (!value || value === ".." || value.startsWith("../") || isAbsolute(value)) {
    throw new Error(`Project Harness Provider content path escapes root: ${path}`);
  }
  return value;
}

function assertWithinRoot(root: string, path: string): void {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  const normalizedRoot = process.platform === "win32" ? resolvedRoot.toLowerCase() : resolvedRoot;
  const normalizedPath = process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`Project Harness Provider content path escapes root: ${path}`);
  }
}
