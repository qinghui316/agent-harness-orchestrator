import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";

export interface StoredTopicMessage {
  id: string;
  projectId: string;
  conversationId: string;
  changeId: string;
  position: number;
  type: string;
  timestamp: string;
  text: string | null;
  actionRunId: string | null;
  actionType: string | null;
  status: string | null;
  runId: string | null;
  artifact: string | null;
  error: string | null;
  rawJson: string;
}

export interface StoredConversation {
  projectId: string;
  conversationId: string;
  title: string;
  state: "active" | "archive";
  boundChangeId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StoredCodexSessionLink {
  projectId: string;
  changeId: string;
  codexSessionId: string | null;
  capabilityProfile: string | null;
  updatedAt: string;
}

export interface StoredSkillIndex {
  projectId: string;
  skillId: string;
  name: string;
  description: string;
  sourcePath: string;
  sourceKind: string;
  sourceHash: string;
  metadataJson: string;
  updatedAt: string;
}

export interface StoredSkillRoot {
  projectId: string;
  rootPath: string;
  sourceKind: string;
  updatedAt: string;
}

export type SkillEnablementScope = "project" | "topic";

export interface StoredSkillEnablement {
  projectId: string;
  changeId: string | null;
  skillId: string;
  scope: SkillEnablementScope;
  enabled: boolean;
  updatedAt: string;
}

export interface StoredHiddenTopic {
  projectId: string;
  changeId: string;
  hiddenAt: string;
}

export interface StoredDeletedTopic {
  projectId: string;
  changeId: string;
  deletedAt: string;
}

export interface StoredBridgeSync {
  projectId: string;
  skillId: string;
  sourceHash: string;
  materializedPath: string;
  materializedHash: string;
  bridgeVersion: string;
  syncedAt: string;
}

export type StoredDecisionStatus = "pending" | "accepted" | "requested-changes" | "dismissed" | "completed" | "failed";

export interface StoredDecisionRecord {
  id: string;
  projectId: string;
  changeId: string | null;
  decisionType: string;
  status: StoredDecisionStatus;
  label: string;
  summary: string;
  targetId: string | null;
  runId: string | null;
  artifact: string | null;
  actionId: string | null;
  feedback: string | null;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface SqliteRow {
  [key: string]: unknown;
}

export class WorkbenchStore {
  private readonly db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static async open(memory: ResolvedMemory): Promise<WorkbenchStore> {
    await mkdir(dirname(memory.workbenchDbPath), { recursive: true });
    const db = new Database(memory.workbenchDbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
    return new WorkbenchStore(db);
  }

  close(): void {
    this.db.close();
  }

  appendMessage(message: Omit<StoredTopicMessage, "position">): StoredTopicMessage {
    const row = this.db.prepare(
      "SELECT COALESCE(MAX(position), 0) + 1 AS nextPosition FROM messages WHERE project_id = ? AND conversation_id = ?",
    ).get(message.projectId, message.conversationId) as SqliteRow;
    const position = Number(row.nextPosition ?? 1);
    this.db.prepare(`
      INSERT INTO messages (
        id, project_id, conversation_id, change_id, position, type, timestamp, text, action_run_id,
        action_type, status, run_id, artifact, error, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.id,
      message.projectId,
      message.conversationId,
      message.changeId,
      position,
      message.type,
      message.timestamp,
      message.text,
      message.actionRunId,
      message.actionType,
      message.status,
      message.runId,
      message.artifact,
      message.error,
      message.rawJson,
    );
    return { ...message, position };
  }

  listMessages(projectId: string, changeId: string): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        artifact, error, raw_json AS rawJson
      FROM messages
      WHERE project_id = ? AND change_id = ?
      ORDER BY position ASC
    `).all(projectId, changeId) as SqliteRow[]).map(mapMessageRow);
  }

  listConversationMessages(projectId: string, conversationId: string): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        artifact, error, raw_json AS rawJson
      FROM messages
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY position ASC
    `).all(projectId, conversationId) as SqliteRow[]).map(mapMessageRow);
  }

  listLatestMessages(projectId: string, changeId: string, limit: number): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        artifact, error, raw_json AS rawJson
      FROM messages
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY position DESC
      LIMIT ?
    `).all(projectId, changeId, limit) as SqliteRow[]).map(mapMessageRow).reverse();
  }

  listMessagesBeforePosition(projectId: string, changeId: string, beforePosition: number, limit: number): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        artifact, error, raw_json AS rawJson
      FROM messages
      WHERE project_id = ? AND conversation_id = ? AND position < ?
      ORDER BY position DESC
      LIMIT ?
    `).all(projectId, changeId, beforePosition, limit) as SqliteRow[]).map(mapMessageRow).reverse();
  }

  listAllMessages(projectId: string): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        artifact, error, raw_json AS rawJson
      FROM messages
      WHERE project_id = ?
      ORDER BY timestamp ASC, position ASC
    `).all(projectId) as SqliteRow[]).map(mapMessageRow);
  }

  hasMessages(projectId: string, changeId: string): boolean {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM messages WHERE project_id = ? AND conversation_id = ?").get(projectId, changeId) as SqliteRow;
    return Number(row.count ?? 0) > 0;
  }

  countMessages(projectId: string, changeId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM messages WHERE project_id = ? AND conversation_id = ?").get(projectId, changeId) as SqliteRow;
    return Number(row.count ?? 0);
  }

  deleteMessages(projectId: string, changeId: string): number {
    const result = this.db.prepare("DELETE FROM messages WHERE project_id = ? AND conversation_id = ?").run(projectId, changeId);
    return result.changes;
  }

  importMessages(messages: StoredTopicMessage[]): number {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, project_id, conversation_id, change_id, position, type, timestamp, text, action_run_id,
        action_type, status, run_id, artifact, error, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = this.db.transaction((items: StoredTopicMessage[]) => {
      let count = 0;
      for (const item of items) {
        const result = insert.run(
          item.id,
          item.projectId,
          item.conversationId,
          item.changeId,
          item.position,
          item.type,
          item.timestamp,
          item.text,
          item.actionRunId,
          item.actionType,
          item.status,
          item.runId,
          item.artifact,
          item.error,
          item.rawJson,
        );
        count += result.changes;
      }
      return count;
    });
    return transaction(messages) as number;
  }

  readCodexSession(projectId: string, changeId: string): StoredCodexSessionLink | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, change_id AS changeId, codex_session_id AS codexSessionId,
        capability_profile AS capabilityProfile, updated_at AS updatedAt
      FROM codex_session_links WHERE project_id = ? AND change_id = ?
    `).get(projectId, changeId) as SqliteRow | undefined;
    return row ? mapSessionRow(row) : null;
  }

  createConversation(conversation: StoredConversation): void {
    this.db.prepare(`
      INSERT INTO conversations (
        project_id, conversation_id, title, state, bound_change_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, conversation_id) DO UPDATE SET
        title = excluded.title,
        state = excluded.state,
        bound_change_id = excluded.bound_change_id,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `).run(
      conversation.projectId,
      conversation.conversationId,
      conversation.title,
      conversation.state,
      conversation.boundChangeId,
      conversation.createdAt,
      conversation.updatedAt,
      conversation.deletedAt,
    );
  }

  listConversations(projectId: string, options: { includeDeleted?: boolean } = {}): StoredConversation[] {
    const rows = options.includeDeleted
      ? this.db.prepare(`
        SELECT project_id AS projectId, conversation_id AS conversationId, title, state,
          bound_change_id AS boundChangeId, created_at AS createdAt, updated_at AS updatedAt,
          deleted_at AS deletedAt
        FROM conversations
        WHERE project_id = ?
        ORDER BY updated_at DESC
      `).all(projectId) as SqliteRow[]
      : this.db.prepare(`
        SELECT project_id AS projectId, conversation_id AS conversationId, title, state,
          bound_change_id AS boundChangeId, created_at AS createdAt, updated_at AS updatedAt,
          deleted_at AS deletedAt
        FROM conversations
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC
      `).all(projectId) as SqliteRow[];
    return rows.map(mapConversationRow);
  }

  readConversation(projectId: string, conversationId: string, options: { includeDeleted?: boolean } = {}): StoredConversation | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId, title, state,
        bound_change_id AS boundChangeId, created_at AS createdAt, updated_at AS updatedAt,
        deleted_at AS deletedAt
      FROM conversations
      WHERE project_id = ? AND conversation_id = ? ${options.includeDeleted ? "" : "AND deleted_at IS NULL"}
    `).get(projectId, conversationId) as SqliteRow | undefined;
    return row ? mapConversationRow(row) : null;
  }

  bindConversationToChange(projectId: string, conversationId: string, changeId: string, updatedAt: string): void {
    this.db.prepare(`
      UPDATE conversations
      SET bound_change_id = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
    `).run(changeId, updatedAt, projectId, conversationId);
  }

  deleteConversation(projectId: string, conversationId: string, deletedAt: string): void {
    const transaction = this.db.transaction(() => {
      this.deleteMessages(projectId, conversationId);
      this.db.prepare(`
        UPDATE conversations
        SET deleted_at = ?, updated_at = ?
        WHERE project_id = ? AND conversation_id = ?
      `).run(deletedAt, deletedAt, projectId, conversationId);
    });
    transaction();
  }

  writeCodexSession(link: StoredCodexSessionLink): void {
    this.db.prepare(`
      INSERT INTO codex_session_links (project_id, change_id, codex_session_id, capability_profile, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, change_id) DO UPDATE SET
        codex_session_id = excluded.codex_session_id,
        capability_profile = excluded.capability_profile,
        updated_at = excluded.updated_at
    `).run(link.projectId, link.changeId, link.codexSessionId, link.capabilityProfile, link.updatedAt);
  }

  upsertSkill(skill: StoredSkillIndex): void {
    this.db.prepare(`
      INSERT INTO skills (project_id, skill_id, name, description, source_path, source_kind, source_hash, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, skill_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        source_path = excluded.source_path,
        source_kind = excluded.source_kind,
        source_hash = excluded.source_hash,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(skill.projectId, skill.skillId, skill.name, skill.description, skill.sourcePath, skill.sourceKind, skill.sourceHash, skill.metadataJson, skill.updatedAt);
  }

  listSkills(projectId: string): StoredSkillIndex[] {
    return (this.db.prepare(`
      SELECT project_id AS projectId, skill_id AS skillId, name, description, source_path AS sourcePath,
        source_kind AS sourceKind,
        source_hash AS sourceHash, metadata_json AS metadataJson, updated_at AS updatedAt
      FROM skills WHERE project_id = ? ORDER BY skill_id ASC
    `).all(projectId) as SqliteRow[]).map(mapSkillRow);
  }

  readSkill(projectId: string, skillId: string): StoredSkillIndex | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, skill_id AS skillId, name, description, source_path AS sourcePath,
        source_kind AS sourceKind,
        source_hash AS sourceHash, metadata_json AS metadataJson, updated_at AS updatedAt
      FROM skills WHERE project_id = ? AND skill_id = ?
    `).get(projectId, skillId) as SqliteRow | undefined;
    return row ? mapSkillRow(row) : null;
  }

  deleteSkillsExcept(projectId: string, skillIds: string[]): void {
    if (skillIds.length === 0) {
      this.db.prepare("DELETE FROM skills WHERE project_id = ?").run(projectId);
      return;
    }
    const placeholders = skillIds.map(() => "?").join(", ");
    this.db.prepare(`DELETE FROM skills WHERE project_id = ? AND skill_id NOT IN (${placeholders})`).run(projectId, ...skillIds);
  }

  upsertSkillRoot(root: StoredSkillRoot): void {
    this.db.prepare(`
      INSERT INTO skill_roots (project_id, root_path, source_kind, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id, root_path) DO UPDATE SET
        source_kind = excluded.source_kind,
        updated_at = excluded.updated_at
    `).run(root.projectId, root.rootPath, root.sourceKind, root.updatedAt);
  }

  listSkillRoots(projectId: string): StoredSkillRoot[] {
    return (this.db.prepare(`
      SELECT project_id AS projectId, root_path AS rootPath, source_kind AS sourceKind, updated_at AS updatedAt
      FROM skill_roots WHERE project_id = ? ORDER BY root_path ASC
    `).all(projectId) as SqliteRow[]).map(mapSkillRootRow);
  }

  setSkillEnablement(enablement: StoredSkillEnablement): void {
    this.db.prepare(`
      INSERT INTO skill_enablement (project_id, change_id, skill_id, scope, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, change_id, skill_id, scope) DO UPDATE SET
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `).run(
      enablement.projectId,
      encodeScopeChangeId(enablement.changeId),
      enablement.skillId,
      enablement.scope,
      enablement.enabled ? 1 : 0,
      enablement.updatedAt,
    );
  }

  listSkillEnablement(projectId: string): StoredSkillEnablement[] {
    return (this.db.prepare(`
      SELECT project_id AS projectId, change_id AS changeId, skill_id AS skillId, scope, enabled, updated_at AS updatedAt
      FROM skill_enablement WHERE project_id = ?
    `).all(projectId) as SqliteRow[]).map(mapEnablementRow);
  }

  hideTopic(topic: StoredHiddenTopic): void {
    this.db.prepare(`
      INSERT INTO hidden_topics (project_id, change_id, hidden_at)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id, change_id) DO UPDATE SET hidden_at = excluded.hidden_at
    `).run(topic.projectId, topic.changeId, topic.hiddenAt);
  }

  listHiddenTopicIds(projectId: string): string[] {
    const rows = this.db.prepare("SELECT change_id AS changeId FROM hidden_topics WHERE project_id = ?").all(projectId) as SqliteRow[];
    return rows.map((row) => String(row.changeId));
  }

  deleteTopicConversation(topic: StoredDeletedTopic): void {
    const transaction = this.db.transaction(() => {
      this.deleteMessages(topic.projectId, topic.changeId);
      this.db.prepare(`
        INSERT INTO deleted_topics (project_id, change_id, deleted_at)
        VALUES (?, ?, ?)
        ON CONFLICT(project_id, change_id) DO UPDATE SET deleted_at = excluded.deleted_at
      `).run(topic.projectId, topic.changeId, topic.deletedAt);
      this.db.prepare("DELETE FROM hidden_topics WHERE project_id = ? AND change_id = ?").run(topic.projectId, topic.changeId);
    });
    transaction();
  }

  isTopicDeleted(projectId: string, changeId: string): boolean {
    const row = this.db.prepare("SELECT 1 AS existsFlag FROM deleted_topics WHERE project_id = ? AND change_id = ?").get(projectId, changeId) as SqliteRow | undefined;
    return Boolean(row);
  }

  listDeletedTopicIds(projectId: string): string[] {
    const rows = this.db.prepare("SELECT change_id AS changeId FROM deleted_topics WHERE project_id = ?").all(projectId) as SqliteRow[];
    return rows.map((row) => String(row.changeId));
  }

  upsertBridgeSync(sync: StoredBridgeSync): void {
    this.db.prepare(`
      INSERT INTO bridge_sync (project_id, skill_id, source_hash, materialized_path, materialized_hash, bridge_version, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, skill_id) DO UPDATE SET
        source_hash = excluded.source_hash,
        materialized_path = excluded.materialized_path,
        materialized_hash = excluded.materialized_hash,
        bridge_version = excluded.bridge_version,
        synced_at = excluded.synced_at
    `).run(sync.projectId, sync.skillId, sync.sourceHash, sync.materializedPath, sync.materializedHash, sync.bridgeVersion, sync.syncedAt);
  }

  readBridgeSync(projectId: string, skillId: string): StoredBridgeSync | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, skill_id AS skillId, source_hash AS sourceHash, materialized_path AS materializedPath,
        materialized_hash AS materializedHash, bridge_version AS bridgeVersion, synced_at AS syncedAt
      FROM bridge_sync WHERE project_id = ? AND skill_id = ?
    `).get(projectId, skillId) as SqliteRow | undefined;
    return row ? mapBridgeRow(row) : null;
  }

  upsertDecision(record: StoredDecisionRecord): void {
    this.db.prepare(`
      INSERT INTO decision_records (
        id, project_id, change_id, decision_type, status, label, summary, target_id, run_id,
        artifact, action_id, feedback, payload_json, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, id) DO UPDATE SET
        change_id = excluded.change_id,
        decision_type = excluded.decision_type,
        status = excluded.status,
        label = excluded.label,
        summary = excluded.summary,
        target_id = excluded.target_id,
        run_id = excluded.run_id,
        artifact = excluded.artifact,
        action_id = excluded.action_id,
        feedback = excluded.feedback,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
    `).run(
      record.id,
      record.projectId,
      encodeScopeChangeId(record.changeId),
      record.decisionType,
      record.status,
      record.label,
      record.summary,
      record.targetId,
      record.runId,
      record.artifact,
      record.actionId,
      record.feedback,
      record.payloadJson,
      record.createdAt,
      record.updatedAt,
      record.completedAt,
    );
  }

  listDecisions(projectId: string, changeId?: string): StoredDecisionRecord[] {
    const rows = changeId
      ? this.db.prepare(`
        SELECT id, project_id AS projectId, change_id AS changeId, decision_type AS decisionType,
          status, label, summary, target_id AS targetId, run_id AS runId, artifact, action_id AS actionId,
          feedback, payload_json AS payloadJson, created_at AS createdAt, updated_at AS updatedAt,
          completed_at AS completedAt
        FROM decision_records
        WHERE project_id = ? AND change_id = ?
        ORDER BY updated_at DESC
      `).all(projectId, changeId) as SqliteRow[]
      : this.db.prepare(`
        SELECT id, project_id AS projectId, change_id AS changeId, decision_type AS decisionType,
          status, label, summary, target_id AS targetId, run_id AS runId, artifact, action_id AS actionId,
          feedback, payload_json AS payloadJson, created_at AS createdAt, updated_at AS updatedAt,
          completed_at AS completedAt
        FROM decision_records
        WHERE project_id = ?
        ORDER BY updated_at DESC
      `).all(projectId) as SqliteRow[];
    return rows.map(mapDecisionRow);
  }
}

export async function importThreadJsonlIfNeeded(memory: ResolvedMemory, projectId: string, changeId: string, changePath: string): Promise<number> {
  const store = await WorkbenchStore.open(memory);
  try {
    if (store.isTopicDeleted(projectId, changeId)) return 0;
    if (store.hasMessages(projectId, changeId)) return 0;
    const path = join(memory.memoryRoot, changePath, "thread.jsonl");
    if (!existsSync(path)) return 0;
    const content = await readFile(path, "utf8");
    const messages = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line, index): StoredTopicMessage => {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        return {
          id: typeof parsed.id === "string" ? parsed.id : `${changeId}-import-${index + 1}`,
          projectId,
          conversationId: changeId,
          changeId,
          position: index + 1,
          type: String(parsed.type ?? "assistant.message"),
          timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : new Date(0).toISOString(),
          text: typeof parsed.text === "string" ? parsed.text : null,
          actionRunId: typeof parsed.actionRunId === "string" ? parsed.actionRunId : null,
          actionType: typeof parsed.actionType === "string" ? parsed.actionType : null,
          status: typeof parsed.status === "string" ? parsed.status : null,
          runId: typeof parsed.runId === "string" ? parsed.runId : null,
          artifact: typeof parsed.artifact === "string" ? parsed.artifact : null,
          error: typeof parsed.error === "string" ? parsed.error : null,
          rawJson: JSON.stringify(parsed),
        };
      });
    return store.importMessages(messages);
  } finally {
    store.close();
  }
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL DEFAULT '',
      change_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      text TEXT,
      action_run_id TEXT,
      action_type TEXT,
      status TEXT,
      run_id TEXT,
      artifact TEXT,
      error TEXT,
      raw_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(project_id, change_id, position);

    CREATE TABLE IF NOT EXISTS conversations (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'active',
      bound_change_id TEXT,
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

    CREATE TABLE IF NOT EXISTS codex_session_links (
      project_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      codex_session_id TEXT,
      capability_profile TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, change_id)
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

    CREATE TABLE IF NOT EXISTS hidden_topics (
      project_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      hidden_at TEXT NOT NULL,
      PRIMARY KEY(project_id, change_id)
    );

    CREATE TABLE IF NOT EXISTS deleted_topics (
      project_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY(project_id, change_id)
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
  ensureColumn(db, "messages", "conversation_id", "TEXT NOT NULL DEFAULT ''");
  db.exec("UPDATE messages SET conversation_id = change_id WHERE conversation_id = ''");
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(project_id, conversation_id, position);");
  ensureColumn(db, "skills", "source_kind", "TEXT NOT NULL DEFAULT 'managed'");
  ensureColumn(db, "codex_session_links", "capability_profile", "TEXT");
}

function mapMessageRow(row: SqliteRow): StoredTopicMessage {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    conversationId: String(row.conversationId ?? row.changeId),
    changeId: String(row.changeId),
    position: Number(row.position),
    type: String(row.type),
    timestamp: String(row.timestamp),
    text: nullableString(row.text),
    actionRunId: nullableString(row.actionRunId),
    actionType: nullableString(row.actionType),
    status: nullableString(row.status),
    runId: nullableString(row.runId),
    artifact: nullableString(row.artifact),
    error: nullableString(row.error),
    rawJson: String(row.rawJson),
  };
}

function mapConversationRow(row: SqliteRow): StoredConversation {
  return {
    projectId: String(row.projectId),
    conversationId: String(row.conversationId),
    title: String(row.title),
    state: row.state === "archive" ? "archive" : "active",
    boundChangeId: nullableString(row.boundChangeId),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    deletedAt: nullableString(row.deletedAt),
  };
}

function mapSessionRow(row: SqliteRow): StoredCodexSessionLink {
  return {
    projectId: String(row.projectId),
    changeId: String(row.changeId),
    codexSessionId: nullableString(row.codexSessionId),
    capabilityProfile: nullableString(row.capabilityProfile),
    updatedAt: String(row.updatedAt),
  };
}

function mapSkillRow(row: SqliteRow): StoredSkillIndex {
  return {
    projectId: String(row.projectId),
    skillId: String(row.skillId),
    name: String(row.name),
    description: String(row.description),
    sourcePath: String(row.sourcePath),
    sourceKind: String(row.sourceKind ?? "managed"),
    sourceHash: String(row.sourceHash),
    metadataJson: String(row.metadataJson),
    updatedAt: String(row.updatedAt),
  };
}

function mapSkillRootRow(row: SqliteRow): StoredSkillRoot {
  return {
    projectId: String(row.projectId),
    rootPath: String(row.rootPath),
    sourceKind: String(row.sourceKind),
    updatedAt: String(row.updatedAt),
  };
}

function mapEnablementRow(row: SqliteRow): StoredSkillEnablement {
  return {
    projectId: String(row.projectId),
      changeId: decodeScopeChangeId(row.changeId),
    skillId: String(row.skillId),
    scope: row.scope === "topic" ? "topic" : "project",
    enabled: Number(row.enabled) === 1,
    updatedAt: String(row.updatedAt),
  };
}

function mapBridgeRow(row: SqliteRow): StoredBridgeSync {
  return {
    projectId: String(row.projectId),
    skillId: String(row.skillId),
    sourceHash: String(row.sourceHash),
    materializedPath: String(row.materializedPath),
    materializedHash: String(row.materializedHash),
    bridgeVersion: String(row.bridgeVersion),
    syncedAt: String(row.syncedAt),
  };
}

function mapDecisionRow(row: SqliteRow): StoredDecisionRecord {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    changeId: decodeScopeChangeId(row.changeId),
    decisionType: String(row.decisionType),
    status: normalizeDecisionStatus(row.status),
    label: String(row.label),
    summary: String(row.summary),
    targetId: nullableString(row.targetId),
    runId: nullableString(row.runId),
    artifact: nullableString(row.artifact),
    actionId: nullableString(row.actionId),
    feedback: nullableString(row.feedback),
    payloadJson: String(row.payloadJson),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    completedAt: nullableString(row.completedAt),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function encodeScopeChangeId(value: string | null): string {
  return value ?? "";
}

function decodeScopeChangeId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeDecisionStatus(value: unknown): StoredDecisionStatus {
  if (value === "accepted" || value === "requested-changes" || value === "dismissed" || value === "completed" || value === "failed") return value;
  return "pending";
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as SqliteRow[];
  if (rows.some((row) => row.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
