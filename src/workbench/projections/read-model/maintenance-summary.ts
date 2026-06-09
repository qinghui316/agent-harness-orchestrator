import { listDemandMemoryCloseouts, listMaintenanceLedgerEntries, readMaintenanceReviewWatermark } from "../../../agent-task/manager.js";
import type { DemandMemoryCloseout, MaintenanceLedgerEntry, ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchMaintenanceSummary } from "../../read-model-types.js";

export async function buildMaintenanceSummary(memory: ResolvedMemory): Promise<WorkbenchMaintenanceSummary> {
  const entries = await listMaintenanceLedgerEntries(memory).catch(() => []);
  const closeouts = await listDemandMemoryCloseouts(memory).catch(() => []);
  const watermark = await readMaintenanceReviewWatermark(memory).catch(() => null);
  const latest = latestMaintenanceEntry(entries);
  const reviewed = new Set(watermark?.lastReviewedChangeIds ?? []);
  const unreviewed = closeouts.filter((closeout) => !reviewed.has(`${closeout.changeId}:${closeout.terminalKind}`)).length;
  const latestCloseout = latestCloseoutEntry(closeouts);
  const status: WorkbenchMaintenanceSummary["status"] = unreviewed >= 5
    ? "review-ready"
    : watermark?.lastReviewWindowId
      ? "reviewed"
      : entries.length > 0 || closeouts.length > 0
        ? "collecting"
        : "idle";
  return {
    ledgerCount: entries.length,
    closeoutCount: closeouts.length,
    latestReviewWindowId: watermark?.lastReviewWindowId ?? undefined,
    unreviewedTerminalCount: unreviewed,
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
    note: status === "reviewed"
      ? "后台维护已生成独立审查。维护结果只在项目维护中查看，不进入当前需求确认队列。"
      : unreviewed >= 5
        ? "后台维护已有 5 个终态需求可审查。系统会生成候选、评分和审查，不会静默改写项目文档或稳定记忆。"
        : closeouts.length > 0 || entries.length > 0
          ? "后台会自动整理需求记忆、候选和索引；维护项不进入当前需求确认队列。"
          : "尚无后台维护证据。归档、应用、失败和用户反馈会自动进入维护证据账本。",
  };
}

export function latestMaintenanceEntry(entries: MaintenanceLedgerEntry[]): MaintenanceLedgerEntry | undefined {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function latestCloseoutEntry(closeouts: DemandMemoryCloseout[]): DemandMemoryCloseout | undefined {
  return [...closeouts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
