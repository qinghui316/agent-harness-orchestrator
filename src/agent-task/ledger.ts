import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MaintenanceLedgerEntry, MaintenanceLedgerEventType, ResolvedMemory } from "../types/index.js";
import { maintenanceRoot } from "./paths.js";
import { ledgerSchema } from "./schemas.js";

export interface EnsureMaintenanceLedgerEntryForArtifactRefInput {
  eventType: MaintenanceLedgerEventType;
  artifactRef: string;
  summary: string;
  changeId?: string;
  artifactRefs?: string[];
}

export async function recordMaintenanceLedgerEntry(memory: ResolvedMemory, input: {
  eventType: MaintenanceLedgerEventType;
  summary: string;
  changeId?: string;
  artifactRefs?: string[];
}): Promise<MaintenanceLedgerEntry> {
  const entry: MaintenanceLedgerEntry = {
    version: "1.0",
    id: `ledger-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    projectId: memory.projectId,
    ...(input.changeId ? { changeId: input.changeId } : {}),
    eventType: input.eventType,
    summary: input.summary,
    artifactRefs: input.artifactRefs ?? [],
    createdAt: new Date().toISOString(),
  };
  await mkdir(maintenanceRoot(memory), { recursive: true });
  await appendFile(join(maintenanceRoot(memory), "ledger.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export async function listMaintenanceLedgerEntries(memory: ResolvedMemory): Promise<MaintenanceLedgerEntry[]> {
  const path = join(maintenanceRoot(memory), "ledger.jsonl");
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => ledgerSchema.parse(JSON.parse(line)));
}

export async function ensureMaintenanceLedgerEntryForArtifactRef(
  memory: ResolvedMemory,
  input: EnsureMaintenanceLedgerEntryForArtifactRefInput,
): Promise<MaintenanceLedgerEntry> {
  const entries = await listMaintenanceLedgerEntries(memory);
  const existing = entries.find((entry) => entry.eventType === input.eventType && entry.artifactRefs.includes(input.artifactRef));
  if (existing) return existing;
  const artifactRefs = [
    input.artifactRef,
    ...(input.artifactRefs ?? []).filter((ref) => ref !== input.artifactRef),
  ];
  return recordMaintenanceLedgerEntry(memory, {
    eventType: input.eventType,
    summary: input.summary,
    ...(input.changeId ? { changeId: input.changeId } : {}),
    artifactRefs,
  });
}
