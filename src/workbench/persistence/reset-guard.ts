import type Database from "better-sqlite3";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import type { ResolvedMemory } from "../../types/index.js";
import type { SqliteRow } from "./sql-mappers.js";

export interface WorkbenchResetGuard {
  assertSafe(db: Database.Database): Promise<void>;
}

export class RuntimeWorkbenchResetGuard implements WorkbenchResetGuard {
  constructor(
    private readonly memory?: ResolvedMemory,
    private readonly providerRegistry?: ProviderRegistry,
  ) {}

  async assertSafe(db: Database.Database): Promise<void> {
    await assertProviderTurnsStoppedBeforeReset(db, this.providerRegistry);
    if (!this.memory) return;
    const { listAgentTasks } = await import("../../agent-task/repository.js");
    const activeTasks = (await listAgentTasks(this.memory)).filter((task) => task.status === "claimed" || task.status === "running");
    if (activeTasks.length > 0) {
      throw new Error("Workbench 会话数据库需要重建，但仍有后台 Agent 任务正在运行。请等待任务结束后重试。");
    }
    await assertWorkflowModelAttemptsStopped(this.memory);
  }
}

export async function assertProviderTurnsStoppedBeforeReset(db: Database.Database, providerRegistry?: ProviderRegistry): Promise<void> {
  const registry = providerRegistry ?? (await import("../../provider-runtime/default-registry.js")).defaultProviderRegistry;
  if (registry.listActiveTurns().length > 0) {
    throw new Error("Workbench 会话数据库需要重建，但仍有 Agent provider turn 正在运行。请先停止并等待退出。");
  }
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as SqliteRow[]).map((row) => String(row.name)));
  const scopeIds = new Set<string>();
  if (tables.has("conversations")) {
    const columns = new Set((db.prepare("PRAGMA table_info(conversations)").all() as SqliteRow[]).map((row) => String(row.name)));
    const fields = [columns.has("conversation_id") ? "conversation_id" : null, columns.has("bound_change_id") ? "bound_change_id" : null].filter((field): field is string => Boolean(field));
    if (fields.length > 0) {
      for (const row of db.prepare(`SELECT ${fields.join(", ")} FROM conversations`).all() as SqliteRow[]) {
        for (const field of fields) if (row[field]) scopeIds.add(String(row[field]));
      }
    }
  }
  if (tables.has("provider_attempts")) {
    for (const row of db.prepare("SELECT attempt_id FROM provider_attempts WHERE status IN ('queued', 'running')").all() as SqliteRow[]) {
      if (row.attempt_id) scopeIds.add(String(row.attempt_id));
    }
  }
  if (registry.findActiveTurns(scopeIds).length > 0) {
    throw new Error("Workbench 会话数据库需要重建，但仍有 Agent provider turn 正在运行。请先停止并等待退出。");
  }
}

export async function assertWorkflowModelAttemptsStopped(memory: ResolvedMemory): Promise<void> {
  const activeRoot = join(memory.changesRoot, "active");
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0) return;
  const { listTaskRuns } = await import("../../task-run/repository.js");
  const { isActiveTaskRunStatus } = await import("../../task-run/guards.js");
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".gitkeep") continue;
    const active = (await listTaskRuns(memory, entry.name)).filter((run) => isActiveTaskRunStatus(run.status));
    if (active.length > 0) {
      throw new Error("Workbench 会话数据库需要重建，但仍有 Workflow 模型节点正在运行。请先暂停并完成对账。");
    }
  }
}
