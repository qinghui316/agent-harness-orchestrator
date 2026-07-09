import { existsSync } from "node:fs";
import { lstat, readFile, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseJsonText } from "../fs/json.js";

export type WorktreeDependencyBridgeStatus = "created" | "already-present" | "skipped";

export interface WorktreeDependencyBridgeResult {
  status: WorktreeDependencyBridgeStatus;
  checkoutDependencyPath: string;
  sourceDependencyPath?: string;
  reason?: string;
}

export interface WorktreeDependencyBridgeOptions {
  sourceRoot: string;
  checkoutPath: string;
}

export class WorktreeDependencyBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreeDependencyBridgeError";
  }
}

export async function prepareWorktreeDependencyBridge(options: WorktreeDependencyBridgeOptions): Promise<WorktreeDependencyBridgeResult> {
  const sourceRoot = resolve(options.sourceRoot);
  const checkoutPath = resolve(options.checkoutPath);
  const checkoutDependencyPath = join(checkoutPath, "node_modules");

  const sourcePackagePath = join(sourceRoot, "package.json");
  if (!existsSync(sourcePackagePath)) {
    return {
      status: "skipped",
      checkoutDependencyPath,
      reason: "source project has no package.json",
    };
  }

  const sourceDependencyPath = join(sourceRoot, "node_modules");
  if (!existsSync(sourceDependencyPath)) {
    const dependencyDeclared = await packageDeclaresDependencies(sourcePackagePath);
    if (!dependencyDeclared) {
      return {
        status: "skipped",
        checkoutDependencyPath,
        reason: "source package declares no dependencies",
      };
    }
    throw new WorktreeDependencyBridgeError(
      `Cannot prepare worktree dependency bridge: source dependencies are missing at ${sourceDependencyPath}. ` +
      "Install dependencies in the source root before worktree validation; AHO does not run npm install or npm ci automatically.",
    );
  }

  if (existsSync(checkoutDependencyPath)) {
    const existing = await lstat(checkoutDependencyPath);
    if (existing.isDirectory() || existing.isSymbolicLink()) {
      return {
        status: "already-present",
        checkoutDependencyPath,
        sourceDependencyPath,
      };
    }
    throw new WorktreeDependencyBridgeError(
      `Cannot prepare worktree dependency bridge: ${checkoutDependencyPath} already exists and is not a directory or link.`,
    );
  }

  await symlink(sourceDependencyPath, checkoutDependencyPath, process.platform === "win32" ? "junction" : "dir");
  return {
    status: "created",
    checkoutDependencyPath,
    sourceDependencyPath,
  };
}

async function packageDeclaresDependencies(packageJsonPath: string): Promise<boolean> {
  try {
    const parsed = parseJsonText(await readFile(packageJsonPath, "utf8"), packageJsonPath) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
      optionalDependencies?: Record<string, unknown>;
      peerDependencies?: Record<string, unknown>;
    };
    return hasEntries(parsed.dependencies)
      || hasEntries(parsed.devDependencies)
      || hasEntries(parsed.optionalDependencies)
      || hasEntries(parsed.peerDependencies);
  } catch {
    return true;
  }
}

function hasEntries(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}
