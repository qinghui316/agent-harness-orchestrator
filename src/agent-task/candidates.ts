import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import type { EvolutionCandidate, MaintenanceLedgerEntry, ResolvedMemory } from "../types/index.js";
import { isMaintenanceCandidateSourceEvent } from "./ledger-event-policy.js";
import { maintenanceRoot } from "./paths.js";
import { candidateSchema } from "./schemas.js";
import { contentHash } from "./utils.js";

export async function createEvolutionCandidate(
  memory: ResolvedMemory,
  entries: MaintenanceLedgerEntry[],
): Promise<EvolutionCandidate | null> {
  const sourceEntries = entries.filter((entry) => isMaintenanceCandidateSourceEvent(entry.eventType));
  if (sourceEntries.length === 0) return null;
  const latest = sourceEntries.at(-1) as MaintenanceLedgerEntry;
  const subtype = candidateSubtypeForEvent(latest.eventType);
  const fingerprint = contentHash(`${subtype}:${sourceEntries.map((entry) => entry.changeId ?? entry.id).join("|")}:${latest.summary}`);
  const existing = await findCandidateByFingerprint(memory, fingerprint);
  if (existing) return existing;
  const candidate: EvolutionCandidate = {
    version: "1.0",
    id: `candidate-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    sourceLedgerEntryIds: sourceEntries.map((entry) => entry.id),
    subtype,
    fingerprint,
    title: `Maintenance candidate from ${latest.eventType}`,
    summary: sourceEntries.map((entry) => `${entry.eventType}: ${entry.summary}`).join("\n"),
    artifactRefs: sourceEntries.flatMap((entry) => entry.artifactRefs),
    status: "candidate",
    createdAt: new Date().toISOString(),
  };
  candidateSchema.parse(candidate);
  await writeJsonFile(join(maintenanceRoot(memory), "candidates", `${candidate.id}.json`), candidate);
  return candidate;
}

export async function listEvolutionCandidates(memory: ResolvedMemory): Promise<EvolutionCandidate[]> {
  const root = join(maintenanceRoot(memory), "candidates");
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readJsonFile(join(root, entry.name), candidateSchema, null as unknown as EvolutionCandidate).catch(() => null)));
  return candidates.filter((candidate): candidate is EvolutionCandidate => candidate !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function findCandidateByFingerprint(memory: ResolvedMemory, fingerprint: string): Promise<EvolutionCandidate | null> {
  return (await listEvolutionCandidates(memory)).find((candidate) => candidate.fingerprint === fingerprint) ?? null;
}

function candidateSubtypeForEvent(eventType: MaintenanceLedgerEntry["eventType"]): EvolutionCandidate["subtype"] {
  if (eventType === "doc-drift") return "docs-drift";
  if (eventType === "reference-drift") return "reference-drift";
  if (eventType === "harness-evolution") return "harness-evolution";
  if (eventType === "change-closeout") return "stable-memory";
  return "reusable-lesson";
}
