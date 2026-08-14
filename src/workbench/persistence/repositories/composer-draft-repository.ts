import type Database from "better-sqlite3";
import { assertAgentTurnMode, type AgentTurnMode, type ProductMode, type ProviderId } from "../../../provider-runtime/index.js";
import type { StoredComposerDraft } from "../contracts.js";

export class ComposerDraftRepository {
  constructor(private readonly db: Database.Database) {}

  deleteDraft(projectId: string, productMode: ProductMode): void {
    this.db.prepare("DELETE FROM composer_drafts WHERE project_id = ? AND product_mode = ?")
      .run(projectId, productMode);
  }

  readDraft(projectId: string, productMode: ProductMode): StoredComposerDraft | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, product_mode AS productMode, agent_turn_mode AS agentTurnMode,
        text, context_refs_json AS contextRefsJson, attachment_ids_json AS attachmentIdsJson,
        skill_overrides_json AS skillOverridesJson, selected_provider_id AS selectedProviderId,
        updated_at AS updatedAt
      FROM composer_drafts WHERE project_id = ? AND product_mode = ?
    `).get(projectId, productMode) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      projectId: String(row.projectId),
      productMode,
      agentTurnMode: row.agentTurnMode === null || row.agentTurnMode === undefined
        ? null
        : assertAgentTurnMode(row.agentTurnMode, "Stored ComposerDraft agentTurnMode"),
      text: String(row.text),
      contextRefsJson: String(row.contextRefsJson),
      attachmentIdsJson: String(row.attachmentIdsJson),
      skillOverridesJson: String(row.skillOverridesJson),
      selectedProviderId: typeof row.selectedProviderId === "string" ? row.selectedProviderId as ProviderId : null,
      updatedAt: String(row.updatedAt),
    };
  }

  upsertAgentTurnMode(input: {
    projectId: string;
    productMode: ProductMode;
    agentTurnMode: AgentTurnMode | null;
    selectedProviderId: ProviderId | null;
    updatedAt: string;
  }): StoredComposerDraft {
    this.db.prepare(`
      INSERT INTO composer_drafts (
        project_id, product_mode, agent_turn_mode, selected_provider_id, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, product_mode) DO UPDATE SET
        agent_turn_mode = excluded.agent_turn_mode,
        selected_provider_id = excluded.selected_provider_id,
        updated_at = excluded.updated_at
    `).run(input.projectId, input.productMode, input.agentTurnMode, input.selectedProviderId, input.updatedAt);
    return this.readDraft(input.projectId, input.productMode)!;
  }
}
