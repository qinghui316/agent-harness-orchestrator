import type Database from "better-sqlite3";
import type { SqliteRow } from "./sql-mappers.js";

export const WORKBENCH_SCHEMA_VERSION = 8;

export function migrate(db: Database.Database): void {
  const currentVersion = Number(db.pragma("user_version", { simple: true }));
  if (currentVersion !== WORKBENCH_SCHEMA_VERSION) {
    resetWorkbenchConversationRunSchema(db);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_timeline_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL DEFAULT '',
      change_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      agent_surface_id TEXT NOT NULL,
      initial_thread_input INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      text TEXT,
      action_run_id TEXT,
      action_type TEXT,
      status TEXT,
      run_id TEXT,
      provider_id TEXT,
      thread_id TEXT,
      turn_id TEXT,
      item_id TEXT,
      artifact TEXT,
      error TEXT,
      raw_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_timeline_change ON canonical_timeline_items(project_id, change_id, position);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_conversation_position
      ON canonical_timeline_items(project_id, conversation_id, position);
    CREATE INDEX IF NOT EXISTS idx_timeline_surface_position
      ON canonical_timeline_items(project_id, conversation_id, agent_surface_id, position);

    CREATE TABLE IF NOT EXISTS conversations (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'active',
      surface_kind TEXT NOT NULL DEFAULT 'user',
      bound_change_id TEXT,
      current_graph_scope_id TEXT,
      selected_provider_id TEXT NOT NULL,
      completed_turn_sequence INTEGER NOT NULL DEFAULT 0,
      timeline_position INTEGER NOT NULL DEFAULT 0,
      timeline_revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      PRIMARY KEY(project_id, conversation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_project_updated ON conversations(project_id, deleted_at, updated_at);

    CREATE TABLE IF NOT EXISTS action_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      result_json TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_action_runs_topic ON action_runs(project_id, change_id, started_at);

    CREATE TABLE IF NOT EXISTS provider_thread_links (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_thread_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      parent_thread_id TEXT,
      change_id TEXT,
      graph_scope_id TEXT,
      capability_profile TEXT,
      display_name TEXT,
      run_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, provider_id, provider_thread_id)
    );
    CREATE INDEX IF NOT EXISTS idx_provider_threads_conversation_role
      ON provider_thread_links(project_id, conversation_id, provider_id, role_id, updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_threads_attempt
      ON provider_thread_links(project_id, attempt_id)
      WHERE attempt_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS conversation_provider_bindings (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      native_session_id TEXT,
      last_delivered_completed_turn INTEGER NOT NULL DEFAULT 0,
      preferred_model_json TEXT,
      last_used_at TEXT,
      binding_status TEXT NOT NULL,
      PRIMARY KEY(project_id, conversation_id, provider_id)
    );

    CREATE TABLE IF NOT EXISTS provider_attempts (
      project_id TEXT NOT NULL,
      conversation_id TEXT,
      attempt_id TEXT NOT NULL,
      graph_scope_id TEXT,
      provider_id TEXT NOT NULL,
      change_id TEXT,
      agent_task_id TEXT,
      role_id TEXT NOT NULL,
      operation_profile TEXT NOT NULL,
      native_session_id TEXT,
      model_json TEXT,
      capability_snapshot_json TEXT NOT NULL,
      handoff_hash TEXT NOT NULL,
      delivered_through_completed_turn INTEGER NOT NULL,
      worktree_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, attempt_id)
    );
    CREATE INDEX IF NOT EXISTS idx_provider_attempts_conversation
      ON provider_attempts(project_id, conversation_id, graph_scope_id, updated_at);

    CREATE TABLE IF NOT EXISTS provider_resume_points (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      resume_point_id TEXT NOT NULL,
      graph_scope_id TEXT,
      change_id TEXT,
      previous_provider_id TEXT NOT NULL,
      target_provider_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(project_id, resume_point_id)
    );
    CREATE INDEX IF NOT EXISTS idx_provider_resume_points_conversation
      ON provider_resume_points(project_id, conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS conversation_change_links (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      graph_scope_id TEXT,
      linked_at TEXT NOT NULL,
      PRIMARY KEY(project_id, conversation_id, change_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_graph_scopes (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      graph_scope_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, graph_scope_id)
    );

    CREATE TABLE IF NOT EXISTS planning_acceptance_commits (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      graph_scope_id TEXT,
      proposal_hash TEXT NOT NULL,
      committed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      project_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      source_path TEXT NOT NULL,
      source_kind TEXT NOT NULL DEFAULT 'managed',
      source_hash TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS skill_roots (
      project_id TEXT NOT NULL,
      root_path TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, root_path)
    );

    CREATE TABLE IF NOT EXISTS skill_enablement (
      project_id TEXT NOT NULL,
      change_id TEXT NOT NULL DEFAULT '',
      skill_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, change_id, skill_id, scope)
    );

    CREATE TABLE IF NOT EXISTS approval_cache (
      project_id TEXT NOT NULL,
      change_id TEXT,
      approval_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, approval_id)
    );

    CREATE TABLE IF NOT EXISTS bridge_sync (
      project_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      source_hash TEXT NOT NULL DEFAULT '',
      materialized_path TEXT NOT NULL,
      materialized_hash TEXT NOT NULL,
      bridge_version TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY(project_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS decision_records (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      change_id TEXT NOT NULL DEFAULT '',
      decision_type TEXT NOT NULL,
      status TEXT NOT NULL,
      label TEXT NOT NULL,
      summary TEXT NOT NULL,
      target_id TEXT,
      run_id TEXT,
      artifact TEXT,
      action_id TEXT,
      feedback TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY(project_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_decision_records_topic ON decision_records(project_id, change_id, updated_at);
  `);
  db.exec(`
    DELETE FROM conversation_change_links
    WHERE graph_scope_id IS NOT NULL AND rowid NOT IN (
      SELECT MAX(rowid) FROM conversation_change_links
      WHERE graph_scope_id IS NOT NULL
      GROUP BY project_id, graph_scope_id
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_change_graph_scope
      ON conversation_change_links(project_id, graph_scope_id)
      WHERE graph_scope_id IS NOT NULL;
    DELETE FROM conversation_change_links
    WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM conversation_change_links
      GROUP BY project_id, change_id
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_change_change_id
      ON conversation_change_links(project_id, change_id);
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_timeline_conversation ON canonical_timeline_items(project_id, conversation_id, position);");
  db.pragma(`user_version = ${WORKBENCH_SCHEMA_VERSION}`);
}

export function hasWorkbenchRuntimeTables(db: Database.Database): boolean {
  const row = db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name IN ('conversations', 'messages', 'canonical_timeline_items', 'provider_attempts') LIMIT 1").get() as SqliteRow | undefined;
  return Boolean(row?.present);
}

export function beginExclusiveSchemaRebuild(db: Database.Database): void {
  try {
    db.pragma("busy_timeout = 250");
    db.exec("BEGIN EXCLUSIVE");
    db.pragma("busy_timeout = 5000");
  } catch (error) {
    if (error instanceof Error && /busy|locked/i.test(error.message)) {
      throw new Error("Workbench 会话数据库需要重建，但另一个 Workbench 实例正在使用该数据库。请先停止其他实例后重试。", { cause: error });
    }
    throw error;
  }
}

export function assertRuntimeDatabaseResetSafe(db: Database.Database): void {
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as SqliteRow[]).map((row) => String(row.name)));
  if (tables.has("provider_attempts")) {
    const active = db.prepare("SELECT COUNT(*) AS count FROM provider_attempts WHERE status IN ('queued', 'running')").get() as SqliteRow;
    if (Number(active.count ?? 0) > 0) throw new Error("Workbench 会话数据库需要重建，但仍有模型执行尚未结束或完成对账。");
  }
  if (tables.has("action_runs")) {
    const columns = db.prepare("PRAGMA table_info(action_runs)").all() as SqliteRow[];
    if (columns.some((column) => String(column.name) === "status")) {
      const active = db.prepare("SELECT COUNT(*) AS count FROM action_runs WHERE status IN ('queued', 'running')").get() as SqliteRow;
      if (Number(active.count ?? 0) > 0) throw new Error("Workbench 会话数据库需要重建，但仍有 Workbench action 正在运行。");
    }
  }
}

export function resetWorkbenchConversationRunSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS canonical_timeline_items;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS action_runs;
    DROP TABLE IF EXISTS provider_thread_links;
    DROP TABLE IF EXISTS conversation_provider_bindings;
    DROP TABLE IF EXISTS provider_attempts;
    DROP TABLE IF EXISTS provider_resume_points;
    DROP TABLE IF EXISTS conversation_change_links;
    DROP TABLE IF EXISTS conversation_graph_scopes;
    DROP TABLE IF EXISTS planning_acceptance_commits;
    DROP TABLE IF EXISTS approval_cache;
    DROP TABLE IF EXISTS decision_records;
  `);
}
