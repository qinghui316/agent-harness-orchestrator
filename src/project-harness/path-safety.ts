import { lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { OwnedArtifactRef } from "./contracts.js";

export interface OwnedArtifactRoots {
  projectSkill: string;
  runtimeSidecar: string;
  projectSource: string;
}

export async function assertPhysicalDirectory(path: string, label: string): Promise<string> {
  const absolute = resolve(path);
  const info = await lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a physical directory: ${absolute}`);
  }
  return absolute;
}

export async function resolveOwnedArtifactPath(
  roots: OwnedArtifactRoots,
  artifact: OwnedArtifactRef,
): Promise<string> {
  const root = artifact.owner === "project-skill"
    ? roots.projectSkill
    : artifact.owner === "runtime-sidecar"
      ? roots.runtimeSidecar
      : roots.projectSource;
  return resolveWithinPhysicalRoot(root, artifact.path, artifact.owner);
}

export async function resolveWithinPhysicalRoot(
  rootPath: string,
  relativePath: string,
  label: string,
): Promise<string> {
  const root = await assertPhysicalDirectory(rootPath, `${label} root`);
  if (isAbsolute(relativePath)) throw new Error(`${label} path must be relative: ${relativePath}`);
  const target = resolve(root, relativePath);
  const fromRoot = relative(root, target);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${label} path escapes its root: ${relativePath}`);
  }
  await assertNoLinkedAncestors(root, target, label);
  await assertExistingTargetIsPhysical(target, label);
  return target;
}

async function assertNoLinkedAncestors(root: string, target: string, label: string): Promise<void> {
  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = resolve(current, segments[index]);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new Error(`${label} path traverses a link or Junction: ${current}`);
      }
      if (!info.isDirectory()) throw new Error(`${label} path parent is not a directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

async function assertExistingTargetIsPhysical(target: string, label: string): Promise<void> {
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error(`${label} target is a link or Junction: ${target}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
