import type { MaintenanceLedgerEventType, ResolvedMemory } from "../types/index.js";
import { ensureMaintenancePolicyLedgerEntryForStoreArtifact } from "./ledger.js";
import {
  writeMaintenanceJsonMarkdownArtifact,
  type MaintenanceArtifactStore,
} from "./maintenance-artifact-store.js";

export interface MaintenancePolicyLedgerArtifactInput<T extends { createdAt: string }> {
  store: MaintenanceArtifactStore<T>;
  id: string;
  eventType: MaintenanceLedgerEventType;
  summary: string;
  changeId?: string;
}

export interface WriteMaintenancePolicyLedgerArtifactInput<T extends { createdAt: string }> extends MaintenancePolicyLedgerArtifactInput<T> {
  value: T;
  markdown: string;
}

export async function ensureMaintenancePolicyLedgerForArtifact<T extends { createdAt: string }>(
  memory: ResolvedMemory,
  input: MaintenancePolicyLedgerArtifactInput<T>,
): Promise<void> {
  await ensureMaintenancePolicyLedgerEntryForStoreArtifact(memory, {
    store: input.store,
    id: input.id,
    eventType: input.eventType,
    summary: input.summary,
    ...(input.changeId ? { changeId: input.changeId } : {}),
  });
}

export async function returnExistingMaintenanceArtifactWithPolicyLedger<T extends { createdAt: string }>(
  memory: ResolvedMemory,
  artifact: T,
  input: MaintenancePolicyLedgerArtifactInput<T>,
): Promise<T> {
  await ensureMaintenancePolicyLedgerForArtifact(memory, input);
  return artifact;
}

export async function writeMaintenanceArtifactWithPolicyLedger<T extends { createdAt: string }>(
  memory: ResolvedMemory,
  input: WriteMaintenancePolicyLedgerArtifactInput<T>,
): Promise<T> {
  await writeMaintenanceJsonMarkdownArtifact(memory, input.store, input.id, input.value, input.markdown);
  await ensureMaintenancePolicyLedgerForArtifact(memory, input);
  return input.value;
}
