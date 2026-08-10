import type Database from "better-sqlite3";
import type { ProductMode } from "../../../provider-runtime/index.js";

export class ComposerDraftRepository {
  constructor(private readonly db: Database.Database) {}

  deleteDraft(projectId: string, productMode: ProductMode): void {
    this.db.prepare("DELETE FROM composer_drafts WHERE project_id = ? AND product_mode = ?")
      .run(projectId, productMode);
  }
}
