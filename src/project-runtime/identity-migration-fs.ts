import { cp, lstat, mkdir, readdir, rename } from "node:fs/promises";
import { dirname, posix, resolve, win32 } from "node:path";

export interface RenameRetryOptions {
  platform?: NodeJS.Platform;
  renamePath?: (source: string, target: string) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
}

const WINDOWS_RENAME_DELAYS_MS = [10, 25, 50, 100, 200, 400] as const;

export async function renameIdentityMigrationPath(
  source: string,
  target: string,
  options: RenameRetryOptions = {},
): Promise<void> {
  const renamePath = options.renamePath ?? rename;
  const wait = options.wait ?? ((milliseconds: number) => new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  }));
  const delays = (options.platform ?? process.platform) === "win32" ? WINDOWS_RENAME_DELAYS_MS : [];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await renamePath(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const delay = delays[attempt];
      if (delay === undefined || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
        throw error;
      }
      await wait(delay);
    }
  }
}

export async function assertIdentityMigrationPhysicalDirectory(path: string, label: string): Promise<string> {
  const absolute = resolve(path);
  const info = await lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a physical directory: ${absolute}`);
  }
  return absolute;
}

export async function assertIdentityMigrationPhysicalFile(path: string, label: string): Promise<string> {
  const absolute = resolve(path);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a physical file: ${absolute}`);
  }
  return absolute;
}

export function assertIdentityMigrationRelativePath(value: string, label: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || value.includes("\0") || posix.isAbsolute(value) || win32.isAbsolute(value)
    || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${label} must be a non-empty relative path: ${value}`);
  }
  return normalized;
}

export async function assertNoIdentityMigrationLinks(root: string, label: string): Promise<void> {
  const physicalRoot = await assertIdentityMigrationPhysicalDirectory(root, label);
  await visit(physicalRoot);

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`${label} contains a link or Junction: ${path}`);
      if (info.isDirectory()) await visit(path);
    }
  }
}

export async function copyIdentityMigrationTree(
  sourceRoot: string,
  targetRoot: string,
  excludedRelativePaths: ReadonlySet<string>,
): Promise<void> {
  await mkdir(targetRoot);
  await copyDirectory(sourceRoot, targetRoot, "");

  async function copyDirectory(source: string, target: string, prefix: string): Promise<void> {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const from = resolve(source, entry.name);
      const to = resolve(target, entry.name);
      const info = await lstat(from);
      if (info.isSymbolicLink()) throw new Error(`Runtime sidecar contains a link or Junction: ${from}`);
      if (excludedRelativePaths.has(relativePath)) continue;
      if (info.isDirectory()) {
        await mkdir(to);
        await copyDirectory(from, to, relativePath);
      } else if (info.isFile()) {
        await cp(from, to, { force: false, errorOnExist: true });
      } else {
        throw new Error(`Runtime sidecar contains an unsupported filesystem entry: ${from}`);
      }
    }
  }
}

export function assertExactSiblingPaths(sourceRoot: string, targetRoot: string): void {
  const source = resolve(sourceRoot);
  const target = resolve(targetRoot);
  if (source === target || dirname(source) !== dirname(target)) {
    throw new Error("Source and target runtime sidecars must be distinct exact siblings.");
  }
}
