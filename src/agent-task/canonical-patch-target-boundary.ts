import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import type {
  MaintenanceCanonicalPatchPayloadDraft,
  MaintenanceCanonicalPatchTargetDescriptor,
  MaintenanceCanonicalPatchTargetHunk,
  MaintenanceCanonicalUpdateTargetKind,
} from "../types/index.js";

export interface ResolvedCanonicalPatchTarget {
  realTargetPath: string;
  relativeTargetPath: string;
}

export function canonicalPatchContentHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function normalizeCanonicalPatchRelativeTargetPath(targetPath: string | undefined): string | null {
  const raw = targetPath?.trim();
  if (!raw || isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) return null;
  const rawSegments = raw.replace(/\\/g, "/").split("/");
  if (rawSegments.includes("..")) return null;
  const normalized = normalize(raw).replace(/\\/g, "/");
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || isAbsolute(normalized)) return null;
  return normalized;
}

export async function resolveExistingCanonicalPatchTarget(
  rootPath: string,
  normalizedRelativePath: string,
): Promise<ResolvedCanonicalPatchTarget | null> {
  const realRoot = await realpath(rootPath).catch(() => null);
  if (!realRoot) return null;

  const resolvedTarget = resolve(realRoot, normalizedRelativePath);
  const realTarget = await realpath(resolvedTarget).catch(() => null);
  if (!realTarget) return null;
  if (!isPathInsideOrEqual(realRoot, realTarget)) return null;

  const targetStat = await stat(realTarget).catch(() => null);
  if (!targetStat?.isFile()) return null;

  const relativeTargetPath = relative(realRoot, realTarget).replace(/\\/g, "/");
  if (!relativeTargetPath || relativeTargetPath === "." || relativeTargetPath.startsWith("../") || isAbsolute(relativeTargetPath)) return null;
  return { realTargetPath: realTarget, relativeTargetPath };
}

export async function resolveRequiredCanonicalPatchApplicationTarget(
  rootPath: string,
  targetPath: string,
): Promise<ResolvedCanonicalPatchTarget> {
  const normalized = normalizeCanonicalPatchRelativeTargetPath(targetPath);
  if (!normalized) throw new Error(`Unsafe canonical patch application target path: ${targetPath}`);

  const realRoot = await realpath(rootPath).catch(() => null);
  if (!realRoot) throw new Error(`Canonical patch application memory root not found: ${rootPath}`);

  const resolvedTarget = resolve(realRoot, normalized);
  const realTarget = await realpath(resolvedTarget).catch(() => null);
  if (!realTarget || !isPathInsideOrEqual(realRoot, realTarget)) {
    throw new Error(`Canonical patch application target escapes memory root: ${targetPath}`);
  }

  const targetStat = await stat(realTarget).catch(() => null);
  if (!targetStat?.isFile()) throw new Error(`Canonical patch application target is not an existing file: ${targetPath}`);

  const relativeTargetPath = relative(realRoot, realTarget).replace(/\\/g, "/");
  if (!relativeTargetPath || relativeTargetPath === "." || relativeTargetPath.startsWith("../") || isAbsolute(relativeTargetPath)) {
    throw new Error(`Unsafe canonical patch application resolved target path: ${targetPath}`);
  }
  return { realTargetPath: realTarget, relativeTargetPath };
}

export function validateCanonicalPatchTargetKindPath(targetKind: string, targetPath: string, operationId: string): void {
  const normalized = normalizeCanonicalPatchRelativeTargetPath(targetPath);
  if (!normalized) throw new Error(`Unsafe canonical patch application target path for ${operationId}: ${targetPath}`);
  if (targetKind === "canonical-docs") {
    if (!normalized.startsWith("docs/") || normalized === "docs/" || !normalized.endsWith(".md")) {
      throw new Error(`Canonical docs patch target is outside docs/*.md boundary for ${operationId}: ${targetPath}`);
    }
    return;
  }
  if (targetKind === "stable-memory") {
    if (!normalized.startsWith("project/stable/") || normalized === "project/stable/" || !normalized.endsWith(".md")) {
      throw new Error(`Stable memory patch target is outside project/stable/*.md boundary for ${operationId}: ${targetPath}`);
    }
  }
}

export function normalizeCanonicalPatchPayloadDraft(
  patch: MaintenanceCanonicalPatchPayloadDraft | undefined,
): MaintenanceCanonicalPatchPayloadDraft | null {
  if (!patch) return null;
  if (patch.patchKind === "replacement") {
    return patch.replacement.trim().length > 0 ? { patchKind: "replacement", replacement: patch.replacement } : null;
  }
  const hunks = patch.hunks.map(normalizeCanonicalPatchTargetHunk).filter((hunk): hunk is MaintenanceCanonicalPatchTargetHunk => hunk !== null);
  return hunks.length === patch.hunks.length && hunks.length > 0 ? { patchKind: "hunks", hunks } : null;
}

export function isValidCanonicalPatchTargetDescriptor(
  descriptor: MaintenanceCanonicalPatchTargetDescriptor | undefined,
  targetKind: MaintenanceCanonicalUpdateTargetKind,
): descriptor is MaintenanceCanonicalPatchTargetDescriptor {
  if (!descriptor) return false;
  if (descriptor.targetKind !== targetKind) return false;
  if (!normalizeCanonicalPatchRelativeTargetPath(descriptor.targetPath) || !/^[a-f0-9]{64}$/.test(descriptor.expectedContentHash)) return false;
  if (descriptor.patchKind === "replacement") {
    return descriptor.replacement.trim().length > 0;
  }
  return descriptor.hunks.length > 0 && descriptor.hunks.every((hunk) => hunk.oldText.trim().length > 0 && hunk.newText.trim().length > 0);
}

function normalizeCanonicalPatchTargetHunk(hunk: MaintenanceCanonicalPatchTargetHunk): MaintenanceCanonicalPatchTargetHunk | null {
  if (hunk.oldText.trim().length === 0 || hunk.newText.trim().length === 0) return null;
  if (hunk.occurrence !== undefined && (!Number.isInteger(hunk.occurrence) || hunk.occurrence < 1)) return null;
  return { oldText: hunk.oldText, newText: hunk.newText, ...(hunk.occurrence !== undefined ? { occurrence: hunk.occurrence } : {}) };
}

function isPathInsideOrEqual(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
