import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  DemandMemoryCloseout,
  DocsDriftCandidate,
  ResolvedMemory,
  ReusableLessonCandidate,
} from "../types/index.js";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import { WARM_CLOSEOUT_LIMIT } from "./constants.js";
import { closeoutsRoot, coldArchiveIndexPath, warmIndexPath } from "./paths.js";
import { closeoutSchema } from "./schemas.js";
import { contentHash, normalizeCandidateText, safeSegment, uniqueSorted } from "./utils.js";

export async function listDemandMemoryCloseouts(memory: ResolvedMemory): Promise<DemandMemoryCloseout[]> {
  const root = closeoutsRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const closeouts: DemandMemoryCloseout[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const closeout = await readJsonFile(join(root, entry.name), closeoutSchema, null as unknown as DemandMemoryCloseout).catch(() => null);
    if (closeout) closeouts.push(closeout);
  }
  return closeouts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function refreshMaintenanceIndexes(memory: ResolvedMemory): Promise<void> {
  const closeouts = await listDemandMemoryCloseouts(memory).catch(() => []);
  const sorted = [...closeouts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const warm = sorted.slice(0, WARM_CLOSEOUT_LIMIT).map(closeoutIndexEntry);
  const cold = sorted.slice(WARM_CLOSEOUT_LIMIT).map(closeoutIndexEntry);
  await writeJsonFile(warmIndexPath(memory), {
    version: "1.0",
    kind: "warm-closeout-index",
    limit: WARM_CLOSEOUT_LIMIT,
    items: warm,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonFile(coldArchiveIndexPath(memory), {
    version: "1.0",
    kind: "cold-archive-refs",
    items: cold,
    note: "Cold archive entries are traceable by summary and artifact refs; raw evidence is not part of role-scoped runtime context.",
    updatedAt: new Date().toISOString(),
  });
}

export function closeoutIndexEntry(closeout: DemandMemoryCloseout): object {
  return {
    id: closeout.id,
    changeId: closeout.changeId,
    title: closeout.title,
    terminalKind: closeout.terminalKind,
    createdAt: closeout.createdAt,
    finalResult: closeout.finalResult,
    evidenceRefs: closeout.evidenceRefs,
    reusableLessonCount: closeout.reusableLessonCandidates.length,
    docsDriftCount: closeout.docsDriftCandidates.length,
  };
}

export function normalizeLessonCandidates(changeId: string, candidates: Array<{ summary: string; evidenceRefs?: string[] }>, fallbackRefs: string[]): ReusableLessonCandidate[] {
  return candidates
    .filter((candidate) => candidate.summary.trim().length > 0)
    .map((candidate, index) => {
      const fingerprint = contentHash(`lesson:${normalizeCandidateText(candidate.summary)}`);
      return {
        id: `lesson-${safeSegment(changeId)}-${index + 1}-${fingerprint.slice(0, 8)}`,
        fingerprint,
        summary: candidate.summary.trim(),
        evidenceRefs: uniqueSorted(candidate.evidenceRefs?.length ? candidate.evidenceRefs : fallbackRefs),
        status: "candidate",
      };
    });
}

export function normalizeDocsDriftCandidates(
  changeId: string,
  candidates: Array<{ document: string; summary: string; evidenceRefs?: string[] }>,
  fallbackRefs: string[],
): DocsDriftCandidate[] {
  return candidates
    .filter((candidate) => candidate.document.trim().length > 0 && candidate.summary.trim().length > 0)
    .map((candidate, index) => {
      const document = candidate.document.trim().replace(/\\/g, "/");
      const fingerprint = contentHash(`docs-drift:${document}:${normalizeCandidateText(candidate.summary)}`);
      return {
        id: `docs-drift-${safeSegment(changeId)}-${index + 1}-${fingerprint.slice(0, 8)}`,
        fingerprint,
        document,
        summary: candidate.summary.trim(),
        evidenceRefs: uniqueSorted(candidate.evidenceRefs?.length ? candidate.evidenceRefs : fallbackRefs),
        status: "candidate",
      };
    });
}
