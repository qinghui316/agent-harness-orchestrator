import type Database from "better-sqlite3";
import type { StoredConversationReviewOperation } from "../contracts.js";
import type { SqliteRow } from "../sql-mappers.js";

export class ConversationReviewRepository {
  constructor(private readonly db: Database.Database) {}

  create(operation: StoredConversationReviewOperation): void {
    this.db.prepare(`
      INSERT INTO conversation_review_operations (
        project_id, conversation_id, graph_scope_id, client_request_id, request_hash,
        provider_id, review_target_json, git_admission_json, attempt_id, status,
        session_binding_hash, turn_identity_hash, source, diagnostic, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      operation.projectId, operation.conversationId, operation.graphScopeId,
      operation.clientRequestId, operation.requestHash, operation.providerId,
      operation.reviewTargetJson, operation.gitAdmissionJson, operation.attemptId,
      operation.status, operation.sessionBindingHash, operation.turnIdentityHash,
      operation.source, operation.diagnostic, operation.createdAt, operation.updatedAt,
    );
  }

  read(projectId: string, clientRequestId: string): StoredConversationReviewOperation | null {
    const row = this.db.prepare(`${selectSql()} WHERE project_id = ? AND client_request_id = ?`)
      .get(projectId, clientRequestId) as SqliteRow | undefined;
    return row ? mapRow(row) : null;
  }

  readByAttempt(projectId: string, attemptId: string): StoredConversationReviewOperation | null {
    const row = this.db.prepare(`${selectSql()} WHERE project_id = ? AND attempt_id = ?`)
      .get(projectId, attemptId) as SqliteRow | undefined;
    return row ? mapRow(row) : null;
  }

  listIncomplete(projectId: string): StoredConversationReviewOperation[] {
    return (this.db.prepare(`${selectSql()}
      WHERE project_id = ? AND status IN ('pending', 'submitting', 'reviewing') ORDER BY created_at ASC`)
      .all(projectId) as SqliteRow[]).map(mapRow);
  }

  update(input: {
    projectId: string;
    clientRequestId: string;
    expectedStatus: StoredConversationReviewOperation["status"];
    status: StoredConversationReviewOperation["status"];
    sessionBindingHash?: string | null;
    turnIdentityHash?: string | null;
    diagnostic?: string | null;
    updatedAt: string;
  }): StoredConversationReviewOperation {
    const result = this.db.prepare(`
      UPDATE conversation_review_operations SET status = ?,
        session_binding_hash = COALESCE(?, session_binding_hash),
        turn_identity_hash = COALESCE(?, turn_identity_hash), diagnostic = ?, updated_at = ?
      WHERE project_id = ? AND client_request_id = ? AND status = ?
    `).run(input.status, input.sessionBindingHash ?? null, input.turnIdentityHash ?? null,
      input.diagnostic ?? null, input.updatedAt, input.projectId, input.clientRequestId, input.expectedStatus);
    if (result.changes !== 1) throw conflict("Conversation Review operation changed concurrently.");
    return this.read(input.projectId, input.clientRequestId)!;
  }
}

function selectSql(): string {
  return `SELECT project_id AS projectId, conversation_id AS conversationId,
    graph_scope_id AS graphScopeId, client_request_id AS clientRequestId,
    request_hash AS requestHash, provider_id AS providerId, review_target_json AS reviewTargetJson,
    git_admission_json AS gitAdmissionJson, attempt_id AS attemptId, status,
    session_binding_hash AS sessionBindingHash, turn_identity_hash AS turnIdentityHash,
    source, diagnostic, created_at AS createdAt, updated_at AS updatedAt
    FROM conversation_review_operations`;
}

function mapRow(row: SqliteRow): StoredConversationReviewOperation {
  return {
    projectId: String(row.projectId), conversationId: String(row.conversationId),
    graphScopeId: String(row.graphScopeId), clientRequestId: String(row.clientRequestId),
    requestHash: String(row.requestHash), providerId: String(row.providerId),
    reviewTargetJson: String(row.reviewTargetJson), gitAdmissionJson: String(row.gitAdmissionJson),
    attemptId: String(row.attemptId), status: row.status as StoredConversationReviewOperation["status"],
    sessionBindingHash: row.sessionBindingHash === null ? null : String(row.sessionBindingHash),
    turnIdentityHash: row.turnIdentityHash === null ? null : String(row.turnIdentityHash),
    source: row.source as StoredConversationReviewOperation["source"],
    diagnostic: row.diagnostic === null ? null : String(row.diagnostic),
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
  };
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}
