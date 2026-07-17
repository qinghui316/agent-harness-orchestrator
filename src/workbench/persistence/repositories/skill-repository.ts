import type Database from "better-sqlite3";
import type { StoredBridgeSync, StoredSkillEnablement, StoredSkillIndex, StoredSkillRoot } from "../contracts.js";
import { encodeScopeChangeId, mapBridgeRow, mapEnablementRow, mapSkillRootRow, mapSkillRow, type SqliteRow } from "../sql-mappers.js";

export class SkillRepository {
  constructor(private readonly db: Database.Database) {}

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
}
