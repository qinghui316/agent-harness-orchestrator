import type Database from "better-sqlite3";
import type { ProductMode, ProviderId } from "../../../provider-runtime/index.js";
import type { StoredComposerDraft } from "../contracts.js";

export class ComposerDraftConflictError extends Error {
  readonly name = "Conflict";

  constructor(readonly current: StoredComposerDraft | null) {
    super("Composer draft changed since it was loaded.");
  }
}
export interface ComposerDraftWrite {
  projectId: string;
  productMode: ProductMode;
  agentTurnMode: StoredComposerDraft["agentTurnMode"];
  agentModelId: string | null;
  agentReasoningEffort: string | null;
  text: string;
  contextRefsJson: string;
  attachmentIdsJson: string;
  skillOverridesJson: string;
  selectedProviderId: ProviderId | null;
  updatedAt: string;
}

export class ComposerDraftRepository {
  constructor(private readonly db: Database.Database) {}

  hasSendableContent(draft: StoredComposerDraft): boolean {
    return Boolean(draft.text.trim())
      || !isEmptyJsonCollection(draft.contextRefsJson, "array")
      || !isEmptyJsonCollection(draft.attachmentIdsJson, "array")
      || !isEmptyJsonCollection(draft.skillOverridesJson, "object");
  }

  deleteDraft(projectId: string, productMode: ProductMode, expectedUpdatedAt: string | null): boolean {
    return this.db.transaction(() => {
      const current = this.readDraft(projectId, productMode);
      if (!current) {
        if (expectedUpdatedAt !== null) throw new ComposerDraftConflictError(null);
        return false;
      }
      if (current.updatedAt !== expectedUpdatedAt) throw new ComposerDraftConflictError(current);
      this.db.prepare("DELETE FROM composer_drafts WHERE project_id = ? AND product_mode = ?")
        .run(projectId, productMode);
      return true;
    })();
  }

  readDraft(projectId: string, productMode: ProductMode): StoredComposerDraft | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, product_mode AS productMode, agent_turn_mode AS agentTurnMode,
        agent_model_id AS agentModelId, agent_reasoning_effort AS agentReasoningEffort,
        text, context_refs_json AS contextRefsJson, attachment_ids_json AS attachmentIdsJson,
        skill_overrides_json AS skillOverridesJson, selected_provider_id AS selectedProviderId,
        updated_at AS updatedAt
      FROM composer_drafts WHERE project_id = ? AND product_mode = ?
    `).get(projectId, productMode) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      projectId: String(row.projectId),
      productMode,
      agentTurnMode: row.agentTurnMode === "default" || row.agentTurnMode === "plan" ? row.agentTurnMode : null,
      agentModelId: typeof row.agentModelId === "string" ? row.agentModelId : null,
      agentReasoningEffort: typeof row.agentReasoningEffort === "string" ? row.agentReasoningEffort : null,
      text: String(row.text),
      contextRefsJson: String(row.contextRefsJson),
      attachmentIdsJson: String(row.attachmentIdsJson),
      skillOverridesJson: String(row.skillOverridesJson),
      selectedProviderId: typeof row.selectedProviderId === "string" ? row.selectedProviderId as ProviderId : null,
      updatedAt: String(row.updatedAt),
    };
  }

  upsertDraft(input: ComposerDraftWrite, expectedUpdatedAt: string | null): StoredComposerDraft {
    return this.db.transaction(() => {
      const current = this.readDraft(input.projectId, input.productMode);
      if ((!current && expectedUpdatedAt !== null)
        || (current && current.updatedAt !== expectedUpdatedAt)) {
        throw new ComposerDraftConflictError(current);
      }
      this.db.prepare(`
        INSERT INTO composer_drafts (
          project_id, product_mode, agent_turn_mode, agent_model_id, agent_reasoning_effort, text, context_refs_json,
          attachment_ids_json, skill_overrides_json, selected_provider_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, product_mode) DO UPDATE SET
          agent_turn_mode = excluded.agent_turn_mode,
          agent_model_id = excluded.agent_model_id,
          agent_reasoning_effort = excluded.agent_reasoning_effort,
          text = excluded.text,
          context_refs_json = excluded.context_refs_json,
          attachment_ids_json = excluded.attachment_ids_json,
          skill_overrides_json = excluded.skill_overrides_json,
          selected_provider_id = excluded.selected_provider_id,
          updated_at = excluded.updated_at
      `).run(
        input.projectId,
        input.productMode,
        input.agentTurnMode,
        input.agentModelId,
        input.agentReasoningEffort,
        input.text,
        input.contextRefsJson,
        input.attachmentIdsJson,
        input.skillOverridesJson,
        input.selectedProviderId,
        input.updatedAt,
      );
      return this.readDraft(input.projectId, input.productMode)!;
    })();
  }
}

function isEmptyJsonCollection(value: string, kind: "array" | "object"): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return kind === "array"
      ? Array.isArray(parsed) && parsed.length === 0
      : Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length === 0);
  } catch {
    return false;
  }
}
