import { join } from "node:path";
import type {
  DemandMemoryCloseout,
  MaintenanceLedgerEntry,
  ResolvedMemory,
} from "../types/index.js";
import { writeJsonFile } from "../fs/json.js";
import { closeoutsRoot, displayMaintenancePath } from "./paths.js";
import { closeoutSchema } from "./schemas.js";
import { recordMaintenanceLedgerEntry } from "./ledger.js";
import {
  listDemandMemoryCloseouts,
  normalizeDocsDriftCandidates,
  normalizeLessonCandidates,
  refreshMaintenanceIndexes,
} from "./closeout-store.js";
import { inferAffectedModules, safeSegment, uniqueSorted } from "./utils.js";

export interface RecordDemandMemoryCloseoutInput {
  changeId: string;
  title: string;
  terminalKind: DemandMemoryCloseout["terminalKind"];
  goal?: string;
  finalResult?: string;
  userDecision?: string;
  changedFiles?: string[];
  affectedModules?: string[];
  evidenceRefs?: string[];
  reusableLessonCandidates?: Array<{ summary: string; evidenceRefs?: string[] }>;
  docsDriftCandidates?: Array<{ document: string; summary: string; evidenceRefs?: string[] }>;
  memoryBoundaryNotes?: string[];
}

export async function recordDemandMemoryCloseout(memory: ResolvedMemory, input: RecordDemandMemoryCloseoutInput): Promise<{
  closeout: DemandMemoryCloseout;
  ledger?: MaintenanceLedgerEntry;
}> {
  const existingCloseout = (await listDemandMemoryCloseouts(memory)).find((closeout) => closeout.changeId === input.changeId && closeout.terminalKind === input.terminalKind);
  if (existingCloseout) {
    return { closeout: existingCloseout };
  }
  const now = new Date().toISOString();
  const id = `closeout-${safeSegment(input.changeId)}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const closeoutDir = closeoutsRoot(memory);
  const closeoutPath = join(closeoutDir, `${id}.json`);
  const closeout: DemandMemoryCloseout = {
    version: "1.0",
    id,
    changeId: input.changeId,
    title: input.title,
    terminalKind: input.terminalKind,
    goal: input.goal ?? input.title,
    finalResult: input.finalResult ?? "Terminal demand state was recorded for background maintenance.",
    userDecision: input.userDecision ?? input.terminalKind,
    changedFiles: uniqueSorted(input.changedFiles ?? []),
    affectedModules: uniqueSorted(input.affectedModules ?? inferAffectedModules(input.changedFiles ?? [])),
    evidenceRefs: uniqueSorted(input.evidenceRefs ?? []),
    reusableLessonCandidates: normalizeLessonCandidates(input.changeId, input.reusableLessonCandidates ?? [], input.evidenceRefs ?? []),
    docsDriftCandidates: normalizeDocsDriftCandidates(input.changeId, input.docsDriftCandidates ?? [], input.evidenceRefs ?? []),
    memoryBoundaryNotes: input.memoryBoundaryNotes ?? [
      "Closeout, ledger, candidates, generated indexes, and generated caches may be written automatically.",
      "Canonical docs, ECL rules, product roadmap, curated project/stable memory, and source root remain human-gated.",
    ],
    createdAt: now,
  };
  closeoutSchema.parse(closeout);
  await writeJsonFile(closeoutPath, closeout);
  await refreshMaintenanceIndexes(memory);
  const ledger = await recordMaintenanceLedgerEntry(memory, {
    eventType: "change-closeout",
    changeId: input.changeId,
    summary: `${input.terminalKind} closeout recorded: ${input.title}`,
    artifactRefs: [displayMaintenancePath(memory, closeoutPath), ...closeout.evidenceRefs],
  });
  return { closeout, ledger };
}

export { listDemandMemoryCloseouts } from "./closeout-store.js";
