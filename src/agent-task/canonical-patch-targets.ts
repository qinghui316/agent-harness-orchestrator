import { readFile } from "node:fs/promises";
import type {
  MaintenanceCandidateTargetHint,
  MaintenanceCanonicalPatchTargetDescriptor,
  MaintenanceCanonicalUpdateTargetKind,
  ResolvedMemory,
} from "../types/index.js";
import {
  canonicalPatchContentHash,
  normalizeCanonicalPatchPayloadDraft,
  normalizeCanonicalPatchRelativeTargetPath,
  resolveExistingCanonicalPatchTarget,
} from "./canonical-patch-target-boundary.js";

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
  const targetPath = normalizeCanonicalPatchRelativeTargetPath(hint.targetPath);
  if (!targetPath) return null;
  const patch = normalizeCanonicalPatchPayloadDraft(hint.patch);
  if (!patch) return null;

  const target = await resolveExistingCanonicalPatchTarget(memory.memoryRoot, targetPath);
  if (!target) return null;

  const bytes = await readFile(target.realTargetPath).catch(() => null);
  if (!bytes) return null;
  const expectedContentHash = canonicalPatchContentHash(bytes);

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
