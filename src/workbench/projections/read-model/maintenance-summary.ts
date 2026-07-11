import { listDemandMemoryCloseouts, listMaintenanceLedgerEntries } from "../../../agent-task/manager.js";
import type { DemandMemoryCloseout, MaintenanceLedgerEntry, ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchMaintenanceSummary } from "../../read-model-types.js";
import { latestByCreatedAt } from "./projection-summary.js";

export async function buildMaintenanceSummary(memory: ResolvedMemory): Promise<WorkbenchMaintenanceSummary> {
  const entries = await listMaintenanceLedgerEntries(memory).catch(() => []);
  const closeouts = await listDemandMemoryCloseouts(memory).catch(() => []);
  const latest = latestMaintenanceEntry(entries);
  const latestCloseout = latestCloseoutEntry(closeouts);
  const status = entries.length > 0 || closeouts.length > 0 ? "collecting" : "idle";
  return {
    ledgerCount: entries.length,
    closeoutCount: closeouts.length,
    latest: latest ? {
      id: latest.id,
      eventType: latest.eventType,
      changeId: latest.changeId,
      summary: latest.summary,
      severity: "info",
      createdAt: latest.createdAt,
    } : latestCloseout ? {
      id: latestCloseout.id,
      eventType: "change-closeout",
      changeId: latestCloseout.changeId,
      summary: latestCloseout.finalResult,
      severity: "info",
      createdAt: latestCloseout.createdAt,
    } : undefined,
    status,
    note: status === "collecting"
      ? "后台维护保留需求 closeout、证据账本和 durable worker 输入。"
      : "尚无后台维护证据。",
  };
}

export function latestMaintenanceEntry(entries: MaintenanceLedgerEntry[]): MaintenanceLedgerEntry | undefined {
  return latestByCreatedAt(entries);
}

export function latestCloseoutEntry(closeouts: DemandMemoryCloseout[]): DemandMemoryCloseout | undefined {
  return latestByCreatedAt(closeouts);
}
