import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const excludedDirectories = new Set(["__pycache__", "node_modules", ".git"]);

export interface ProjectHarnessFingerprintOptions {
  exclude?: readonly string[];
}

export const PROJECT_HARNESS_DYNAMIC_PATHS = [
  "state/changes",
  "state/registry",
  "state/evolution",
  "state/migration",
] as const;

export async function fingerprintProjectHarness(
  skillRoot: string,
  options: ProjectHarnessFingerprintOptions = {},
): Promise<string> {
  const files: string[] = [];
  const excluded = (options.exclude ?? []).map((path) => path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
  await collectPhysicalFiles(skillRoot, skillRoot, files, excluded);
  const hash = createHash("sha256");
  for (const file of files.sort((left, right) => left.localeCompare(right))) {
    const path = relative(skillRoot, file).replace(/\\/g, "/");
    hash.update(path);
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function collectPhysicalFiles(root: string, current: string, files: string[], excluded: string[]): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name) || entry.name.endsWith(".pyc")) continue;
    const path = join(current, entry.name);
    const relativePath = relative(root, path).replace(/\\/g, "/");
    if (excluded.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`))) continue;
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      throw new Error(`Project Harness content must not contain a link or Junction: ${path}`);
    }
    if (info.isDirectory()) {
      await collectPhysicalFiles(root, path, files, excluded);
      continue;
    }
    if (info.isFile()) files.push(path);
  }
}
