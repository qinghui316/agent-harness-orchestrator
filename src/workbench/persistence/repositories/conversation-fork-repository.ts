import type Database from "better-sqlite3";
import type { StoredConversationForkOperation } from "../contracts.js";
import type { SqliteRow } from "../sql-mappers.js";

export class ConversationForkRepository {
  constructor(private readonly db: Database.Database) {}

  create(operation: StoredConversationForkOperation): void {
    this.db.prepare(`
      INSERT INTO conversation_fork_operations (
        project_id, client_request_id, request_hash, source_conversation_id, target_conversation_id,
        provider_id, source_message_id, anchor_completed_turn_sequence, expected_timeline_revision,
        context_revision, source_graph_scope_id, status, diagnostic, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      operation.projectId,
      operation.clientRequestId,
      operation.requestHash,
      operation.sourceConversationId,
      operation.targetConversationId,
      operation.providerId,
      operation.sourceMessageId,
      operation.anchorCompletedTurnSequence,
      operation.expectedTimelineRevision,
      operation.contextRevision,
      operation.sourceGraphScopeId,
      operation.status,
      operation.diagnostic,
      operation.createdAt,
      operation.updatedAt,
    );
  }

  read(projectId: string, clientRequestId: string): StoredConversationForkOperation | null {
    const row = this.db.prepare(`${selectForkOperation()}
      WHERE project_id = ? AND client_request_id = ?
    `).get(projectId, clientRequestId) as SqliteRow | undefined;
    return row ? mapForkOperation(row) : null;
  }

  readByTargetConversation(projectId: string, targetConversationId: string): StoredConversationForkOperation | null {
    const row = this.db.prepare(`${selectForkOperation()}
      WHERE project_id = ? AND target_conversation_id = ? AND status = 'completed'
      ORDER BY updated_at DESC LIMIT 1
    `).get(projectId, targetConversationId) as SqliteRow | undefined;
    return row ? mapForkOperation(row) : null;
  }

  update(input: {
    projectId: string;
    clientRequestId: string;
    expectedStatus: StoredConversationForkOperation["status"];
    status: StoredConversationForkOperation["status"];
    targetConversationId?: string | null;
    diagnostic?: string | null;
    updatedAt: string;
  }): StoredConversationForkOperation {
    const result = this.db.prepare(`
      UPDATE conversation_fork_operations
      SET status = ?, target_conversation_id = COALESCE(?, target_conversation_id), diagnostic = ?, updated_at = ?
      WHERE project_id = ? AND client_request_id = ? AND status = ?
    `).run(
      input.status,
      input.targetConversationId ?? null,
      input.diagnostic ?? null,
      input.updatedAt,
      input.projectId,
      input.clientRequestId,
      input.expectedStatus,
    );
    if (result.changes !== 1) throw concurrentForkOperation();
    return this.read(input.projectId, input.clientRequestId)!;
  }

  listIncomplete(projectId: string): StoredConversationForkOperation[] {
    return (this.db.prepare(`${selectForkOperation()}
      WHERE project_id = ? AND status IN ('pending', 'submitting')
      ORDER BY created_at ASC
    `).all(projectId) as SqliteRow[]).map(mapForkOperation);
  }
}

function selectForkOperation(): string {
  return `SELECT project_id AS projectId, client_request_id AS clientRequestId, request_hash AS requestHash,
    source_conversation_id AS sourceConversationId, target_conversation_id AS targetConversationId,
    provider_id AS providerId, source_message_id AS sourceMessageId,
    anchor_completed_turn_sequence AS anchorCompletedTurnSequence,
    expected_timeline_revision AS expectedTimelineRevision, context_revision AS contextRevision,
    source_graph_scope_id AS sourceGraphScopeId, status, diagnostic,
    created_at AS createdAt, updated_at AS updatedAt
    FROM conversation_fork_operations`;
}

function mapForkOperation(row: SqliteRow): StoredConversationForkOperation {
  return {
    projectId: String(row.projectId),
    clientRequestId: String(row.clientRequestId),
    requestHash: String(row.requestHash),
    sourceConversationId: String(row.sourceConversationId),
    targetConversationId: typeof row.targetConversationId === "string" ? row.targetConversationId : null,
    providerId: String(row.providerId),
    sourceMessageId: String(row.sourceMessageId),
    anchorCompletedTurnSequence: Number(row.anchorCompletedTurnSequence),
    expectedTimelineRevision: Number(row.expectedTimelineRevision),
    contextRevision: String(row.contextRevision),
    sourceGraphScopeId: String(row.sourceGraphScopeId),
    status: row.status as StoredConversationForkOperation["status"],
    diagnostic: typeof row.diagnostic === "string" ? row.diagnostic : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function concurrentForkOperation(): Error {
  const error = new Error("Conversation fork operation changed concurrently.");
  error.name = "Conflict";
  return error;
}
