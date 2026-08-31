import type Database from "better-sqlite3";
import type { ProductMode, ProviderId } from "../../../provider-runtime/index.js";
import type {
  StoredConversationLifecycleOperation,
  StoredConversationLifecycleOperationStatus,
  StoredConversationProviderSyncStatus,
} from "../contracts.js";
import type { SqliteRow } from "../sql-mappers.js";

export class ConversationLifecycleRepository {
  constructor(private readonly db: Database.Database) {}

  create(operation: StoredConversationLifecycleOperation): void {
    this.db.prepare(`
      INSERT INTO conversation_lifecycle_operations (
        project_id, conversation_id, product_mode, client_request_id, request_hash, action,
        expected_lifecycle_revision, status, provider_id, provider_binding_hash,
        provider_sync_status, diagnostic, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      operation.projectId, operation.conversationId, operation.productMode,
      operation.clientRequestId, operation.requestHash, operation.action,
      operation.expectedLifecycleRevision, operation.status, operation.providerId,
      operation.providerBindingHash, operation.providerSyncStatus, operation.diagnostic,
      operation.createdAt, operation.updatedAt,
    );
  }

  read(projectId: string, clientRequestId: string): StoredConversationLifecycleOperation | null {
    const row = this.db.prepare(`${selectOperation()} WHERE project_id = ? AND client_request_id = ?`)
      .get(projectId, clientRequestId) as SqliteRow | undefined;
    return row ? mapOperation(row) : null;
  }

  readLatest(projectId: string, conversationId: string): StoredConversationLifecycleOperation | null {
    const row = this.db.prepare(`${selectOperation()}
      WHERE project_id = ? AND conversation_id = ? ORDER BY updated_at DESC LIMIT 1`)
      .get(projectId, conversationId) as SqliteRow | undefined;
    return row ? mapOperation(row) : null;
  }

  listIncomplete(projectId: string): StoredConversationLifecycleOperation[] {
    return (this.db.prepare(`${selectOperation()}
      WHERE project_id = ? AND status IN ('pending', 'submitting') ORDER BY created_at ASC`)
      .all(projectId) as SqliteRow[]).map(mapOperation);
  }

  transition(input: {
    projectId: string;
    clientRequestId: string;
    expectedStatus: StoredConversationLifecycleOperationStatus;
    status: StoredConversationLifecycleOperationStatus;
    providerSyncStatus: StoredConversationProviderSyncStatus;
    diagnostic?: string | null;
    updatedAt: string;
  }): StoredConversationLifecycleOperation {
    const result = this.db.prepare(`
      UPDATE conversation_lifecycle_operations
      SET status = ?, provider_sync_status = ?, diagnostic = ?, updated_at = ?
      WHERE project_id = ? AND client_request_id = ? AND status = ?
    `).run(
      input.status, input.providerSyncStatus, input.diagnostic ?? null, input.updatedAt,
      input.projectId, input.clientRequestId, input.expectedStatus,
    );
    if (result.changes !== 1) throw conflict("Conversation lifecycle operation changed concurrently.");
    return this.read(input.projectId, input.clientRequestId)!;
  }
}

function selectOperation(): string {
  return `SELECT project_id AS projectId, conversation_id AS conversationId, product_mode AS productMode,
    client_request_id AS clientRequestId, request_hash AS requestHash, action,
    expected_lifecycle_revision AS expectedLifecycleRevision, status, provider_id AS providerId,
    provider_binding_hash AS providerBindingHash, provider_sync_status AS providerSyncStatus,
    diagnostic, created_at AS createdAt, updated_at AS updatedAt
    FROM conversation_lifecycle_operations`;
}

function mapOperation(row: SqliteRow): StoredConversationLifecycleOperation {
  return {
    projectId: String(row.projectId), conversationId: String(row.conversationId),
    productMode: String(row.productMode) as ProductMode, clientRequestId: String(row.clientRequestId),
    requestHash: String(row.requestHash), action: row.action as StoredConversationLifecycleOperation["action"],
    expectedLifecycleRevision: Number(row.expectedLifecycleRevision),
    status: row.status as StoredConversationLifecycleOperationStatus,
    providerId: typeof row.providerId === "string" ? row.providerId as ProviderId : null,
    providerBindingHash: typeof row.providerBindingHash === "string" ? row.providerBindingHash : null,
    providerSyncStatus: row.providerSyncStatus as StoredConversationProviderSyncStatus,
    diagnostic: typeof row.diagnostic === "string" ? row.diagnostic : null,
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
  };
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}
