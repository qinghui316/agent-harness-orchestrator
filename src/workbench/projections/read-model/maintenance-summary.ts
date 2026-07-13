import { listAgentTasks, listDemandMemoryCloseouts, listMaintenanceLedgerEntries } from "../../../agent-task/manager.js";
import type { DemandMemoryCloseout, MaintenanceLedgerEntry, ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchMaintenanceSummary } from "../../read-model-types.js";
import { latestByCreatedAt } from "./projection-summary.js";

export async function buildMaintenanceSummary(memory: ResolvedMemory): Promise<WorkbenchMaintenanceSummary> {
  const entries = await listMaintenanceLedgerEntries(memory).catch(() => []);
  const closeouts = await listDemandMemoryCloseouts(memory).catch(() => []);
  const tasks = (await listAgentTasks(memory).catch(() => []))
    .filter((task) => task.kind === "background" && (
      task.roleId.startsWith("memory-maintenance-agent:")
      || task.roleId.startsWith("harness-evolution-agent:")
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const activeTask = tasks.find((task) => task.status === "running" || task.status === "claimed" || task.status === "queued")
    ?? tasks[0];
  const latest = latestMaintenanceEntry(entries);
  const latestCloseout = latestCloseoutEntry(closeouts);
  const status = activeTask
    ? activeTask.status === "running" || activeTask.status === "claimed"
      ? "running"
      : activeTask.status === "queued"
        ? "queued"
        : activeTask.status === "blocked" || activeTask.status === "failed" || activeTask.status === "needs-user-input"
          ? "blocked"
          : "completed"
    : entries.length > 0 || closeouts.length > 0
      ? "completed"
      : "idle";
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
    ...(activeTask ? { activeTask: { id: activeTask.id, roleId: activeTask.roleId, status: activeTask.status, updatedAt: activeTask.updatedAt } } : {}),
    note: status === "running"
      ? "项目记忆正在维护。你可以继续工作；涉及项目文档的任务建议等待维护完成。"
      : status === "queued"
        ? "项目记忆维护已排队，不影响继续处理其他任务。"
        : status === "blocked"
          ? "项目记忆维护需要由后台 Agent 继续处理；已完成的开发结果不受影响。"
          : status === "completed"
            ? "项目记忆维护已完成。"
            : "尚无后台维护任务。",
  };
}

export function latestMaintenanceEntry(entries: MaintenanceLedgerEntry[]): MaintenanceLedgerEntry | undefined {
  return latestByCreatedAt(entries);
}

export function latestCloseoutEntry(closeouts: DemandMemoryCloseout[]): DemandMemoryCloseout | undefined {
  return latestByCreatedAt(closeouts);
}
