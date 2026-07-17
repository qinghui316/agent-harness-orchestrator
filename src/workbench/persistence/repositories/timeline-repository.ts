import type Database from "better-sqlite3";
import type { StoredConversation, StoredTopicMessage, StoredTopicMessageWrite } from "../contracts.js";
import { mapConversationRow, mapMessageRow, timelineMessageSelect, timelineSequencePredicate, timelineThreadStartPredicate, type SqliteRow } from "../sql-mappers.js";

export class TimelineRepository {
constructor(private readonly db: Database.Database) {}

  moveRunToGraphScope(
    projectId: string,
    conversationId: string,
    runId: string,
    graphScopeId: string,
  ): void {
    const rows = this.db.prepare(`
      SELECT id, raw_json AS rawJson FROM canonical_timeline_items
      WHERE project_id = ? AND conversation_id = ? AND run_id = ?
    `).all(projectId, conversationId, runId) as SqliteRow[];
    const update = this.db.prepare(
      "UPDATE canonical_timeline_items SET raw_json = ? WHERE id = ? AND project_id = ?",
    );
    for (const row of rows) {
      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(String(row.rawJson)) as Record<string, unknown>;
      } catch {
        // Preserve malformed diagnostic payloads while updating canonical scope.
      }
      update.run(JSON.stringify({ ...raw, graphScopeId }), String(row.id), projectId);
    }
  }

appendMessage(message: StoredTopicMessageWrite): StoredTopicMessage {
    return this.db.transaction(() => {
      const counter = this.db.prepare(`
        UPDATE conversations
        SET timeline_position = timeline_position + 1, timeline_revision = timeline_revision + 1
        WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
        RETURNING timeline_position AS position, timeline_revision AS revision
      `).get(message.projectId, message.conversationId) as SqliteRow | undefined;
      if (!counter) throw new Error(`Conversation not found: ${message.conversationId}.`);
      const position = Number(counter.position);
      const revision = Number(counter.revision);
      const agentSurfaceId = message.agentSurfaceId.trim();
      if (!agentSurfaceId) throw new Error("Canonical Timeline append requires agentSurfaceId.");
      this.db.prepare(`
      INSERT INTO canonical_timeline_items (
        id, project_id, conversation_id, change_id, position, revision, agent_surface_id, initial_thread_input, type, timestamp, text, action_run_id,
        action_type, status, run_id, provider_id, thread_id, turn_id, item_id, artifact, error, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.id,
      message.projectId,
      message.conversationId,
      message.changeId,
      position,
      revision,
      agentSurfaceId,
      message.initialThreadInput ? 1 : 0,
      message.type,
      message.timestamp,
      message.text,
      message.actionRunId,
      message.actionType,
      message.status,
      message.runId,
      message.providerId ?? null,
      message.threadId ?? null,
      message.turnId ?? null,
      message.itemId ?? null,
      message.artifact,
      message.error,
      message.rawJson,
    );
      return { ...message, position, revision, agentSurfaceId, initialThreadInput: message.initialThreadInput === true };
    })();
  }

updateMessage(message: StoredTopicMessageWrite): StoredTopicMessage {
    return this.db.transaction(() => {
      const existing = this.readMessage(message.projectId, message.conversationId, message.id);
      if (!existing) throw new Error(`Conversation message not found: ${message.id}.`);
      const identityFields = ["providerId", "threadId", "turnId", "itemId"] as const;
      for (const field of identityFields) {
        if ((message[field] ?? null) !== existing[field]) {
          throw new Error(`Canonical Timeline ${field} is immutable for ${message.id}.`);
        }
      }
      if (message.agentSurfaceId !== existing.agentSurfaceId) {
        throw new Error(`Canonical Timeline agentSurfaceId is immutable for ${message.id}.`);
      }
      if (message.initialThreadInput !== undefined && message.initialThreadInput !== existing.initialThreadInput) {
        throw new Error(`Canonical Timeline orderClass is immutable for ${message.id}.`);
      }
      const counter = this.db.prepare(`
        UPDATE conversations SET timeline_revision = timeline_revision + 1
        WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
        RETURNING timeline_revision AS revision
      `).get(message.projectId, message.conversationId) as SqliteRow | undefined;
      if (!counter) throw new Error(`Conversation not found: ${message.conversationId}.`);
      const revision = Number(counter.revision);
      const result = this.db.prepare(`
      UPDATE canonical_timeline_items SET change_id = ?, type = ?, timestamp = ?, text = ?, action_run_id = ?,
        action_type = ?, status = ?, run_id = ?, provider_id = ?, thread_id = ?, turn_id = ?, item_id = ?, artifact = ?, error = ?,
        raw_json = ?, revision = ?
      WHERE id = ? AND project_id = ? AND conversation_id = ?
    `).run(
      message.changeId,
      message.type,
      message.timestamp,
      message.text,
      message.actionRunId,
      message.actionType,
      message.status,
      message.runId,
      message.providerId ?? null,
      message.threadId ?? null,
      message.turnId ?? null,
      message.itemId ?? null,
      message.artifact,
      message.error,
      message.rawJson,
      revision,
      message.id,
      message.projectId,
      message.conversationId,
    );
    if (result.changes !== 1) throw new Error(`Conversation message not found: ${message.id}.`);
      return {
        ...message,
        position: existing.position,
        revision,
        agentSurfaceId: existing.agentSurfaceId,
        initialThreadInput: existing.initialThreadInput,
      };
    })();
  }

readMessage(projectId: string, conversationId: string, messageId: string): StoredTopicMessage | null {
    const row = this.db.prepare(`${timelineMessageSelect()}
      WHERE project_id = ? AND conversation_id = ? AND id = ?
    `).get(projectId, conversationId, messageId) as SqliteRow | undefined;
    return row ? mapMessageRow(row) : null;
  }

listTimelineSurfaceLatest(projectId: string, conversationId: string, agentSurfaceId: string, limit: number): StoredTopicMessage[] {
    return (this.db.prepare(`${timelineMessageSelect()}
      WHERE project_id = ? AND conversation_id = ? AND agent_surface_id = ?
        AND ${timelineSequencePredicate()}
      ORDER BY position DESC
      LIMIT ?
    `).all(projectId, conversationId, agentSurfaceId, limit) as SqliteRow[]).map(mapMessageRow).reverse();
  }

listTimelineSurfaceBeforePosition(projectId: string, conversationId: string, agentSurfaceId: string, beforePosition: number, limit: number): StoredTopicMessage[] {
    return (this.db.prepare(`${timelineMessageSelect()}
      WHERE project_id = ? AND conversation_id = ? AND agent_surface_id = ? AND position < ?
        AND ${timelineSequencePredicate()}
      ORDER BY position DESC
      LIMIT ?
    `).all(projectId, conversationId, agentSurfaceId, beforePosition, limit) as SqliteRow[]).map(mapMessageRow).reverse();
  }

listTimelineSurfacePinned(projectId: string, conversationId: string, agentSurfaceId: string): StoredTopicMessage[] {
    return (this.db.prepare(`${timelineMessageSelect()}
      WHERE project_id = ? AND conversation_id = ? AND agent_surface_id = ?
        AND ${timelineThreadStartPredicate()}
      ORDER BY position ASC
    `).all(projectId, conversationId, agentSurfaceId) as SqliteRow[]).map(mapMessageRow);
  }

readTimelineSurfacePageSnapshot(
    projectId: string,
    conversationId: string,
    agentSurfaceId: string,
    options: { beforePosition?: number; limit: number },
  ): {
    conversation: StoredConversation;
    rows: StoredTopicMessage[];
    pinnedRows: StoredTopicMessage[];
    totalCount: number;
    hasMoreBefore: boolean;
  } | null {
    return this.db.transaction(() => {
      const conversationRow = this.db.prepare(`SELECT project_id AS projectId, conversation_id AS conversationId, title, state, surface_kind AS surfaceKind, bound_change_id AS boundChangeId, current_graph_scope_id AS currentGraphScopeId, selected_provider_id AS selectedProviderId, completed_turn_sequence AS completedTurnSequence, timeline_position AS timelinePosition, timeline_revision AS timelineRevision, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt FROM conversations WHERE project_id = ? AND conversation_id = ?`).get(projectId, conversationId) as SqliteRow | undefined;
      const conversation = conversationRow ? mapConversationRow(conversationRow) : null;
      if (!conversation) return null;
      const rows = options.beforePosition === undefined
        ? this.listTimelineSurfaceLatest(projectId, conversationId, agentSurfaceId, options.limit)
        : this.listTimelineSurfaceBeforePosition(projectId, conversationId, agentSurfaceId, options.beforePosition, options.limit);
      const pinnedRows = this.listTimelineSurfacePinned(projectId, conversationId, agentSurfaceId);
      const totalCount = this.countTimelineSurface(projectId, conversationId, agentSurfaceId);
      const firstPosition = rows[0]?.position;
      const hasMoreBefore = firstPosition === undefined
        ? false
        : this.hasTimelineSurfaceBeforePosition(projectId, conversationId, agentSurfaceId, firstPosition);
      return { conversation, rows, pinnedRows, totalCount, hasMoreBefore };
    })();
  }

countTimelineSurface(projectId: string, conversationId: string, agentSurfaceId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM canonical_timeline_items
      WHERE project_id = ? AND conversation_id = ? AND agent_surface_id = ?
        AND ${timelineSequencePredicate()}
    `).get(projectId, conversationId, agentSurfaceId) as SqliteRow;
    return Number(row.count ?? 0);
  }

hasTimelineSurfaceBeforePosition(projectId: string, conversationId: string, agentSurfaceId: string, position: number): boolean {
    const row = this.db.prepare(`
      SELECT 1 AS present FROM canonical_timeline_items
      WHERE project_id = ? AND conversation_id = ? AND agent_surface_id = ? AND position < ?
        AND ${timelineSequencePredicate()}
      LIMIT 1
    `).get(projectId, conversationId, agentSurfaceId, position) as SqliteRow | undefined;
    return Boolean(row?.present);
  }

listMessages(projectId: string, changeId: string): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, revision,
        agent_surface_id AS agentSurfaceId, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        provider_id AS providerId, thread_id AS threadId, turn_id AS turnId, item_id AS itemId,
        artifact, error, raw_json AS rawJson
      FROM canonical_timeline_items
      WHERE project_id = ? AND change_id = ?
      ORDER BY position ASC
    `).all(projectId, changeId) as SqliteRow[]).map(mapMessageRow);
  }

listConversationMessages(projectId: string, conversationId: string): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, revision,
        agent_surface_id AS agentSurfaceId, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        provider_id AS providerId, thread_id AS threadId, turn_id AS turnId, item_id AS itemId,
        artifact, error, raw_json AS rawJson
      FROM canonical_timeline_items
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY position ASC
    `).all(projectId, conversationId) as SqliteRow[]).map(mapMessageRow);
  }

listRecentSemanticMessages(projectId: string, conversationId: string, limit: number): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, revision,
        agent_surface_id AS agentSurfaceId, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        provider_id AS providerId, thread_id AS threadId, turn_id AS turnId, item_id AS itemId,
        artifact, error, raw_json AS rawJson
      FROM canonical_timeline_items
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY position DESC
      LIMIT ?
    `).all(projectId, conversationId, limit) as SqliteRow[]).map(mapMessageRow).reverse();
  }

listAllMessages(projectId: string): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, revision,
        agent_surface_id AS agentSurfaceId, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        provider_id AS providerId, thread_id AS threadId, turn_id AS turnId, item_id AS itemId,
        artifact, error, raw_json AS rawJson
      FROM canonical_timeline_items
      WHERE project_id = ?
      ORDER BY timestamp ASC, position ASC
    `).all(projectId) as SqliteRow[]).map(mapMessageRow);
  }

hasMessages(projectId: string, changeId: string): boolean {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM canonical_timeline_items WHERE project_id = ? AND conversation_id = ?").get(projectId, changeId) as SqliteRow;
    return Number(row.count ?? 0) > 0;
  }

countMessages(projectId: string, changeId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM canonical_timeline_items WHERE project_id = ? AND conversation_id = ?").get(projectId, changeId) as SqliteRow;
    return Number(row.count ?? 0);
  }

deleteMessages(projectId: string, changeId: string): number {
    const result = this.db.prepare("DELETE FROM canonical_timeline_items WHERE project_id = ? AND conversation_id = ?").run(projectId, changeId);
    return result.changes;
  }

importMessages(messages: StoredTopicMessage[]): number {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO canonical_timeline_items (
        id, project_id, conversation_id, change_id, position, revision, agent_surface_id, type, timestamp, text, action_run_id,
        action_type, status, run_id, provider_id, thread_id, turn_id, item_id, artifact, error, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          item.revision,
          item.agentSurfaceId,
          item.type,
          item.timestamp,
          item.text,
          item.actionRunId,
          item.actionType,
          item.status,
          item.runId,
          item.providerId ?? null,
          item.threadId ?? null,
          item.turnId ?? null,
          item.itemId ?? null,
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
}
