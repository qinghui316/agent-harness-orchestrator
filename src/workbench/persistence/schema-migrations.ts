import type Database from "better-sqlite3";
import { applyCurrentWorkbenchSchema, ensureColumn, hasAnyWorkbenchUserTables, hasWorkbenchRuntimeTables, WORKBENCH_SCHEMA_VERSION } from "./schema.js";
import type { SqliteRow } from "./sql-mappers.js";

export const MINIMUM_AUTOMATIC_WORKBENCH_SCHEMA_VERSION = 16;
export const WORKBENCH_MIGRATION_IMPLEMENTATION_VERSION = 1;

export type WorkbenchDatabaseCompatibilityCode =
  | "unsupported-legacy"
  | "newer-version"
  | "corrupt"
  | "recovery-required";

export class WorkbenchDatabaseCompatibilityError extends Error {
  readonly name = "WorkbenchDatabaseCompatibilityError";

  constructor(
    readonly code: WorkbenchDatabaseCompatibilityCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface WorkbenchSchemaMigration {
  readonly from: number;
  readonly to: number;
  migrate(db: Database.Database): void;
  validate(db: Database.Database): void;
}

const schema16To17: WorkbenchSchemaMigration = {
  from: 16,
  to: 17,
  migrate(db) {
    ensureColumn(db, "conversations", "archive_origin", "TEXT CHECK(archive_origin IN ('agent-user', 'harness-workflow') OR archive_origin IS NULL)");
    ensureColumn(db, "conversations", "archived_at", "TEXT");
    ensureColumn(db, "conversations", "lifecycle_revision", "INTEGER NOT NULL DEFAULT 0");
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_lifecycle_operations (
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        product_mode TEXT NOT NULL CHECK(product_mode IN ('agent', 'harness')),
        client_request_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('archive', 'restore', 'delete')),
        expected_lifecycle_revision INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'submitting', 'completed', 'failed', 'interrupted')),
        provider_id TEXT,
        provider_binding_hash TEXT,
        provider_sync_status TEXT NOT NULL CHECK(provider_sync_status IN ('not-required', 'unsupported', 'submitting', 'completed', 'failed', 'uncertain')),
        diagnostic TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, client_request_id)
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_lifecycle_operations_conversation
        ON conversation_lifecycle_operations(project_id, conversation_id, updated_at);
      UPDATE conversations SET archive_origin = CASE product_mode
        WHEN 'agent' THEN 'agent-user' ELSE 'harness-workflow' END,
        archived_at = COALESCE(archived_at, updated_at)
      WHERE state = 'archive' AND archive_origin IS NULL;
      UPDATE conversations SET archive_origin = NULL, archived_at = NULL WHERE state = 'active';
    `);
  },
  validate(db) {
    assertColumns(db, "conversations", ["archive_origin", "archived_at", "lifecycle_revision"]);
    assertTable(db, "conversation_lifecycle_operations");
  },
};

const schema17To18: WorkbenchSchemaMigration = {
  from: 17,
  to: 18,
  migrate(db) {
    ensureColumn(db, "provider_attempts", "operation_kind", "TEXT NOT NULL DEFAULT 'conversation-turn' CHECK(operation_kind IN ('conversation-turn', 'review'))");
    ensureColumn(db, "conversation_turn_queue_items", "item_kind", "TEXT NOT NULL DEFAULT 'conversation-turn' CHECK(item_kind IN ('conversation-turn', 'review'))");
    ensureColumn(db, "conversation_turn_queue_items", "review_target_json", "TEXT");
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_review_operations (
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        graph_scope_id TEXT NOT NULL,
        client_request_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        review_target_json TEXT NOT NULL,
        git_admission_json TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'submitting', 'reviewing', 'completed', 'failed', 'interrupted')),
        session_binding_hash TEXT,
        turn_identity_hash TEXT,
        source TEXT NOT NULL CHECK(source IN ('direct', 'queue')),
        diagnostic TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, client_request_id),
        UNIQUE(project_id, attempt_id)
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_review_active
        ON conversation_review_operations(project_id, conversation_id, status, updated_at);
      UPDATE provider_attempts SET operation_kind = 'conversation-turn' WHERE operation_kind IS NULL;
      UPDATE provider_attempts SET agent_turn_mode = NULL WHERE operation_kind = 'review';
      UPDATE conversation_turn_queue_items SET item_kind = 'conversation-turn' WHERE item_kind IS NULL;
    `);
  },
  validate(db) {
    assertColumns(db, "provider_attempts", ["operation_kind"]);
    assertColumns(db, "conversation_turn_queue_items", ["item_kind", "review_target_json"]);
    assertTable(db, "conversation_review_operations");
  },
};

export const WORKBENCH_SCHEMA_MIGRATIONS: readonly WorkbenchSchemaMigration[] = [
  schema16To17,
  schema17To18,
];

export function inspectWorkbenchSchema(db: Database.Database): {
  currentVersion: number;
  kind: "new" | "current" | "upgrade";
} {
  let currentVersion: number;
  try {
    currentVersion = Number(db.pragma("user_version", { simple: true }) ?? 0);
  } catch (cause) {
    throw new WorkbenchDatabaseCompatibilityError("corrupt", "这个项目的数据无法读取。", { cause });
  }
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new WorkbenchDatabaseCompatibilityError("corrupt", "这个项目的数据版本无效。");
  }
  if (currentVersion === 0 && !hasAnyWorkbenchUserTables(db)) return { currentVersion, kind: "new" };
  if (currentVersion > WORKBENCH_SCHEMA_VERSION) {
    throw new WorkbenchDatabaseCompatibilityError("newer-version", "这个项目的数据由更新版本的 Beaver Code 创建。");
  }
  if (currentVersion < MINIMUM_AUTOMATIC_WORKBENCH_SCHEMA_VERSION || !hasWorkbenchRuntimeTables(db)) {
    throw new WorkbenchDatabaseCompatibilityError("unsupported-legacy", "这个项目的数据版本过旧，无法自动升级。");
  }
  if (currentVersion < WORKBENCH_SCHEMA_VERSION) validateMigrationSourceSchema(db, currentVersion);
  return {
    currentVersion,
    kind: currentVersion === WORKBENCH_SCHEMA_VERSION ? "current" : "upgrade",
  };
}

function validateMigrationSourceSchema(db: Database.Database, version: number): void {
  const requiredTables = [
    "canonical_timeline_items",
    "conversations",
    "action_runs",
    "provider_thread_links",
    "conversation_provider_bindings",
    "provider_attempts",
    "provider_resume_points",
    "composer_drafts",
    "approval_cache",
    "decision_records",
    "conversation_fork_operations",
    "conversation_turn_queues",
    "conversation_turn_queue_items",
  ];
  if (version >= 17) requiredTables.push("conversation_lifecycle_operations");
  try {
    for (const table of requiredTables) assertTable(db, table);
    assertColumns(db, "conversations", ["project_id", "conversation_id", "product_mode", "state"]);
    assertColumns(db, "provider_attempts", ["project_id", "attempt_id", "conversation_id", "product_mode", "status"]);
    assertColumns(db, "conversation_turn_queue_items", ["project_id", "conversation_id", "product_mode", "status"]);
  } catch (cause) {
    throw new WorkbenchDatabaseCompatibilityError("corrupt", "这个项目的数据结构不完整。", { cause });
  }
}

export function initializeCurrentWorkbenchSchema(db: Database.Database): void {
  applyCurrentWorkbenchSchema(db);
  db.pragma(`user_version = ${WORKBENCH_SCHEMA_VERSION}`);
  validateCurrentWorkbenchSchema(db);
}

export function prepareStagedWorkbenchSchema(db: Database.Database): void {
  const inspection = inspectWorkbenchSchema(db);
  if (inspection.kind === "new") {
    initializeCurrentWorkbenchSchema(db);
    return;
  }
  if (inspection.kind === "upgrade") migrateWorkbenchSchema(db, inspection.currentVersion);
}

export function migrateWorkbenchSchema(db: Database.Database, currentVersion: number): readonly number[] {
  let version = currentVersion;
  const applied: number[] = [];
  while (version < WORKBENCH_SCHEMA_VERSION) {
    const migration = WORKBENCH_SCHEMA_MIGRATIONS.find((candidate) => candidate.from === version);
    if (!migration) {
      throw new WorkbenchDatabaseCompatibilityError("unsupported-legacy", "这个项目的数据没有可用的升级路径。");
    }
    migration.migrate(db);
    migration.validate(db);
    db.pragma(`user_version = ${migration.to}`);
    version = migration.to;
    applied.push(version);
  }
  applyCurrentWorkbenchSchema(db);
  db.pragma(`user_version = ${WORKBENCH_SCHEMA_VERSION}`);
  validateCurrentWorkbenchSchema(db);
  return applied;
}

export function validateCurrentWorkbenchSchema(db: Database.Database): void {
  assertTable(db, "conversations");
  assertTable(db, "canonical_timeline_items");
  assertTable(db, "provider_attempts");
  assertTable(db, "composer_drafts");
  assertTable(db, "conversation_turn_queue_items");
  assertTable(db, "conversation_review_operations");
  assertColumns(db, "conversations", ["product_mode", "lifecycle_revision"]);
  assertColumns(db, "provider_attempts", ["product_mode", "operation_kind"]);
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error("Workbench database integrity check failed.");
}

function assertTable(db: Database.Database, table: string): void {
  const row = db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as SqliteRow | undefined;
  if (!row?.present) throw new Error(`Workbench schema is missing required table: ${table}`);
}

function assertColumns(db: Database.Database, table: string, columns: readonly string[]): void {
  const existing = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as SqliteRow[]).map((row) => String(row.name)));
  const missing = columns.filter((column) => !existing.has(column));
  if (missing.length > 0) throw new Error(`Workbench schema table ${table} is missing required columns: ${missing.join(", ")}`);
}
