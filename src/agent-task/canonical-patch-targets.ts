import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import type {
  MaintenanceCandidateTargetHint,
  MaintenanceCanonicalPatchPayloadDraft,
  MaintenanceCanonicalPatchTargetDescriptor,
  MaintenanceCanonicalPatchTargetHunk,
  MaintenanceCanonicalUpdateTargetKind,
  ResolvedMemory,
} from "../types/index.js";

export async function buildCanonicalPatchTargetDescriptor(
  memory: ResolvedMemory,
  targetKind: MaintenanceCanonicalUpdateTargetKind,
  targetHints: MaintenanceCandidateTargetHint[] | undefined,
): Promise<MaintenanceCanonicalPatchTargetDescriptor | null> {
  for (const hint of targetHints ?? []) {
    if (hint.targetKind !== targetKind) continue;
    const descriptor = await descriptorFromHint(memory, targetKind, hint);
    if (descriptor) return descriptor;
  }
  return null;
}

async function descriptorFromHint(
  memory: ResolvedMemory,
  targetKind: MaintenanceCanonicalUpdateTargetKind,
  hint: MaintenanceCandidateTargetHint,
): Promise<MaintenanceCanonicalPatchTargetDescriptor | null> {
  const targetPath = normalizeRelativeTargetPath(hint.targetPath);
  if (!targetPath) return null;
  const patch = normalizePatchPayload(hint.patch);
  if (!patch) return null;

  const target = await resolveSafeExistingFile(memory.memoryRoot, targetPath);
  if (!target) return null;

  const bytes = await readFile(target.realTargetPath).catch(() => null);
  if (!bytes) return null;
  const expectedContentHash = createHash("sha256").update(bytes).digest("hex");

  if (patch.patchKind === "replacement") {
    return {
      targetKind,
      targetPath: target.relativeTargetPath,
      expectedContentHash,
      patchKind: "replacement",
      replacement: patch.replacement,
    };
  }

  return {
    targetKind,
    targetPath: target.relativeTargetPath,
    expectedContentHash,
    patchKind: "hunks",
    hunks: patch.hunks,
  };
}

function normalizePatchPayload(patch: MaintenanceCanonicalPatchPayloadDraft | undefined): MaintenanceCanonicalPatchPayloadDraft | null {
  if (!patch) return null;
  if (patch.patchKind === "replacement") {
    return patch.replacement.trim().length > 0 ? { patchKind: "replacement", replacement: patch.replacement } : null;
  }
  const hunks = patch.hunks.map(normalizeHunk).filter((hunk): hunk is MaintenanceCanonicalPatchTargetHunk => hunk !== null);
  return hunks.length === patch.hunks.length && hunks.length > 0 ? { patchKind: "hunks", hunks } : null;
}

function normalizeHunk(hunk: MaintenanceCanonicalPatchTargetHunk): MaintenanceCanonicalPatchTargetHunk | null {
  if (hunk.oldText.trim().length === 0 || hunk.newText.trim().length === 0) return null;
  if (hunk.occurrence !== undefined && (!Number.isInteger(hunk.occurrence) || hunk.occurrence < 1)) return null;
  return { oldText: hunk.oldText, newText: hunk.newText, ...(hunk.occurrence !== undefined ? { occurrence: hunk.occurrence } : {}) };
}

function normalizeRelativeTargetPath(targetPath: string | undefined): string | null {
  const raw = targetPath?.trim();
  if (!raw || isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) return null;
  const rawSegments = raw.replace(/\\/g, "/").split("/");
  if (rawSegments.includes("..")) return null;
  const normalized = normalize(raw).replace(/\\/g, "/");
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || isAbsolute(normalized)) return null;
  return normalized;
}

async function resolveSafeExistingFile(
  rootPath: string,
  normalizedRelativePath: string,
): Promise<{ realTargetPath: string; relativeTargetPath: string } | null> {
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

function isPathInsideOrEqual(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
