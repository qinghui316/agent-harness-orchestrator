import type Database from "better-sqlite3";
import type { StoredDecisionRecord } from "../contracts.js";
import { encodeScopeChangeId, mapDecisionRow, type SqliteRow } from "../sql-mappers.js";

export class DecisionRepository {
  constructor(private readonly db: Database.Database) {}

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
