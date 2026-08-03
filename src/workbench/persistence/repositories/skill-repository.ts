import type Database from "better-sqlite3";
import type { StoredSkillEnablement, StoredSkillRoot } from "../contracts.js";
import { encodeScopeChangeId, mapEnablementRow, mapSkillRootRow, type SqliteRow } from "../sql-mappers.js";

export class SkillRepository {
  constructor(private readonly db: Database.Database) {}

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

}
