import type Database from "better-sqlite3";
import type { ProviderId } from "../../../provider-runtime/index.js";
import type { StoredConversation } from "../contracts.js";
import { mapConversationRow, nullableString, type SqliteRow } from "../sql-mappers.js";

export class ConversationRepository {
constructor(private readonly db: Database.Database) {}

  updateConversationTitle(projectId: string, conversationId: string, title: string, updatedAt: string): StoredConversation {
    return this.db.transaction(() => {
      const current = this.readConversation(projectId, conversationId);
      if (!current) throw new Error(`Conversation not found: ${conversationId}`);
      const committedAt = nextMonotonicTimestamp(current.updatedAt, updatedAt);
      const result = this.db.prepare(`
        UPDATE conversations SET title = ?, updated_at = ?
        WHERE project_id = ? AND conversation_id = ? AND surface_kind = 'user' AND deleted_at IS NULL
      `).run(title, committedAt, projectId, conversationId);
      if (result.changes !== 1) throw new Error(`Conversation not found: ${conversationId}`);
      return this.readConversation(projectId, conversationId)!;
    }).immediate();
  }

  markConversationDeleted(projectId: string, conversationId: string, deletedAt: string): void {
    this.db.prepare(`
      UPDATE conversations SET deleted_at = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ?
    `).run(deletedAt, deletedAt, projectId, conversationId);
  }

  switchSelectedProvider(
    projectId: string,
    conversationId: string,
    expectedProviderId: ProviderId,
    targetProviderId: ProviderId,
    updatedAt: string,
  ): void {
    const selected = this.db.prepare(`
      UPDATE conversations SET selected_provider_id = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND selected_provider_id = ? AND deleted_at IS NULL
    `).run(targetProviderId, updatedAt, projectId, conversationId, expectedProviderId);
    if (selected.changes !== 1) {
      throw new Error(`Conversation provider changed concurrently: ${conversationId}`);
    }
  }

  activateGraphScope(projectId: string, conversationId: string, graphScopeId: string, updatedAt: string): void {
    this.db.prepare(`
      UPDATE conversations SET current_graph_scope_id = ?, bound_change_id = NULL, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
    `).run(graphScopeId, updatedAt, projectId, conversationId);
    this.db.prepare(`
      INSERT INTO conversation_graph_scopes (project_id, conversation_id, graph_scope_id, status, updated_at)
      VALUES (?, ?, ?, 'active', ?)
      ON CONFLICT(project_id, graph_scope_id) DO UPDATE SET
        conversation_id = excluded.conversation_id,
        status = 'active',
        updated_at = excluded.updated_at
    `).run(projectId, conversationId, graphScopeId, updatedAt);
  }

  recordPlanningAcceptance(
    acceptanceId: string,
    projectId: string,
    conversationId: string,
    changeId: string,
    graphScopeId: string,
    proposalHash: string,
    committedAt: string,
  ): void {
    this.db.prepare(`
      INSERT INTO planning_acceptance_commits (
        id, project_id, conversation_id, change_id, graph_scope_id, proposal_hash, committed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(acceptanceId, projectId, conversationId, changeId, graphScopeId, proposalHash, committedAt);
  }

createConversation(conversation: Omit<StoredConversation, "timelinePosition" | "timelineRevision"> & Partial<Pick<StoredConversation, "timelinePosition" | "timelineRevision">>): void {
    this.db.prepare(`
      INSERT INTO conversations (
        project_id, conversation_id, title, state, surface_kind, bound_change_id, current_graph_scope_id,
        selected_provider_id, completed_turn_sequence, timeline_position, timeline_revision, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, conversation_id) DO UPDATE SET
        title = excluded.title,
        state = excluded.state,
        surface_kind = excluded.surface_kind,
        bound_change_id = excluded.bound_change_id,
        current_graph_scope_id = excluded.current_graph_scope_id,
        selected_provider_id = excluded.selected_provider_id,
        completed_turn_sequence = excluded.completed_turn_sequence,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `).run(
      conversation.projectId,
      conversation.conversationId,
      conversation.title,
      conversation.state,
      conversation.surfaceKind ?? "user",
      conversation.boundChangeId,
      conversation.currentGraphScopeId,
      conversation.selectedProviderId,
      conversation.completedTurnSequence,
      conversation.timelinePosition ?? 0,
      conversation.timelineRevision ?? 0,
      conversation.createdAt,
      conversation.updatedAt,
      conversation.deletedAt,
    );
  }

listConversations(projectId: string, options: { includeDeleted?: boolean } = {}): StoredConversation[] {
    const rows = options.includeDeleted
      ? this.db.prepare(`
        SELECT project_id AS projectId, conversation_id AS conversationId, title, state, surface_kind AS surfaceKind,
          bound_change_id AS boundChangeId, current_graph_scope_id AS currentGraphScopeId,
          selected_provider_id AS selectedProviderId, completed_turn_sequence AS completedTurnSequence,
          timeline_position AS timelinePosition, timeline_revision AS timelineRevision,
          created_at AS createdAt, updated_at AS updatedAt,
          deleted_at AS deletedAt
        FROM conversations
        WHERE project_id = ? AND surface_kind = 'user'
        ORDER BY updated_at DESC
      `).all(projectId) as SqliteRow[]
      : this.db.prepare(`
        SELECT project_id AS projectId, conversation_id AS conversationId, title, state, surface_kind AS surfaceKind,
          bound_change_id AS boundChangeId, current_graph_scope_id AS currentGraphScopeId,
          selected_provider_id AS selectedProviderId, completed_turn_sequence AS completedTurnSequence,
          timeline_position AS timelinePosition, timeline_revision AS timelineRevision,
          created_at AS createdAt, updated_at AS updatedAt,
          deleted_at AS deletedAt
        FROM conversations
        WHERE project_id = ? AND deleted_at IS NULL AND surface_kind = 'user'
        ORDER BY updated_at DESC
      `).all(projectId) as SqliteRow[];
    return rows.map(mapConversationRow);
  }

readConversation(projectId: string, conversationId: string, options: { includeDeleted?: boolean } = {}): StoredConversation | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId, title, state, surface_kind AS surfaceKind,
        bound_change_id AS boundChangeId, current_graph_scope_id AS currentGraphScopeId,
        selected_provider_id AS selectedProviderId, completed_turn_sequence AS completedTurnSequence,
        timeline_position AS timelinePosition, timeline_revision AS timelineRevision,
        created_at AS createdAt, updated_at AS updatedAt,
        deleted_at AS deletedAt
      FROM conversations
      WHERE project_id = ? AND conversation_id = ? ${options.includeDeleted ? "" : "AND deleted_at IS NULL"}
    `).get(projectId, conversationId) as SqliteRow | undefined;
    return row ? mapConversationRow(row) : null;
  }

readConversationByChangeId(projectId: string, changeId: string): StoredConversation | null {
    const row = this.db.prepare(`
      SELECT c.project_id AS projectId, c.conversation_id AS conversationId, c.title, c.state, c.surface_kind AS surfaceKind,
        c.bound_change_id AS boundChangeId, c.current_graph_scope_id AS currentGraphScopeId,
        c.selected_provider_id AS selectedProviderId, c.completed_turn_sequence AS completedTurnSequence,
        c.timeline_position AS timelinePosition, c.timeline_revision AS timelineRevision,
        c.created_at AS createdAt, c.updated_at AS updatedAt,
        c.deleted_at AS deletedAt
      FROM conversations c
      LEFT JOIN conversation_change_links l
        ON l.project_id = c.project_id AND l.conversation_id = c.conversation_id
      WHERE c.project_id = ? AND c.deleted_at IS NULL
        AND (l.change_id = ? OR c.bound_change_id = ?)
      ORDER BY CASE WHEN l.change_id = ? THEN 0 ELSE 1 END, c.updated_at DESC
      LIMIT 1
    `).get(projectId, changeId, changeId, changeId) as SqliteRow | undefined;
    return row ? mapConversationRow(row) : null;
  }

bindConversationToChange(projectId: string, conversationId: string, changeId: string, updatedAt: string): void {
    this.db.prepare(`
      UPDATE conversations
      SET bound_change_id = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
    `).run(changeId, updatedAt, projectId, conversationId);
  }

hideConversation(projectId: string, conversationId: string, hiddenAt: string): void {
    this.db.prepare(`
      UPDATE conversations
      SET deleted_at = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
    `).run(hiddenAt, hiddenAt, projectId, conversationId);
  }

setConversationState(projectId: string, conversationId: string, state: StoredConversation["state"], updatedAt: string): void {
    this.db.prepare(`
      UPDATE conversations
      SET state = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
    `).run(state, updatedAt, projectId, conversationId);
  }

selectConversationProvider(projectId: string, conversationId: string, providerId: ProviderId, updatedAt: string): void {
    const result = this.db.prepare(`
      UPDATE conversations SET selected_provider_id = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
    `).run(providerId, updatedAt, projectId, conversationId);
    if (result.changes !== 1) throw new Error(`Conversation not found: ${conversationId}`);
  }

advanceCompletedTurnSequence(projectId: string, conversationId: string, expected: number, updatedAt: string): number {
    const result = this.db.prepare(`
      UPDATE conversations SET completed_turn_sequence = completed_turn_sequence + 1, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND completed_turn_sequence = ? AND deleted_at IS NULL
    `).run(updatedAt, projectId, conversationId, expected);
    if (result.changes !== 1) throw new Error(`Conversation completed-turn sequence changed concurrently: ${conversationId}`);
    return expected + 1;
  }

linkConversationChange(projectId: string, conversationId: string, changeId: string, linkedAt: string): void {
    const graphScopeId = this.readConversation(projectId, conversationId)?.currentGraphScopeId;
    if (!graphScopeId) throw new Error("Conversation Change binding requires the current graph scope.");
    this.db.prepare(`
      INSERT INTO conversation_change_links (project_id, conversation_id, change_id, graph_scope_id, linked_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, conversation_id, change_id) DO UPDATE SET
        graph_scope_id = excluded.graph_scope_id,
        linked_at = excluded.linked_at
    `).run(projectId, conversationId, changeId, graphScopeId, linkedAt);
    this.db.prepare(`
      UPDATE conversations SET bound_change_id = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
    `).run(changeId, linkedAt, projectId, conversationId);
  }

markConversationGraphScopeTerminal(projectId: string, conversationId: string, graphScopeId: string, updatedAt: string): void {
    this.db.prepare(`
      INSERT INTO conversation_graph_scopes (project_id, conversation_id, graph_scope_id, status, updated_at)
      VALUES (?, ?, ?, 'terminal', ?)
      ON CONFLICT(project_id, graph_scope_id) DO UPDATE SET
        status = 'terminal',
        updated_at = excluded.updated_at
    `).run(projectId, conversationId, graphScopeId, updatedAt);
  }

isConversationGraphScopeTerminal(projectId: string, graphScopeId: string): boolean {
    const row = this.db.prepare(`
      SELECT status FROM conversation_graph_scopes
      WHERE project_id = ? AND graph_scope_id = ?
    `).get(projectId, graphScopeId) as SqliteRow | undefined;
    return row?.status === "terminal";
  }

findGraphScopeForChange(projectId: string, changeId: string): string | null {
    const row = this.db.prepare(`
      SELECT graph_scope_id AS graphScopeId FROM conversation_change_links
      WHERE project_id = ? AND change_id = ? AND graph_scope_id IS NOT NULL
      ORDER BY linked_at DESC LIMIT 1
    `).get(projectId, changeId) as SqliteRow | undefined;
    return nullableString(row?.graphScopeId);
  }

findChangeForGraphScope(projectId: string, graphScopeId: string): string | null {
    const row = this.db.prepare(`
      SELECT change_id AS changeId FROM conversation_change_links
      WHERE project_id = ? AND graph_scope_id = ?
      ORDER BY linked_at DESC LIMIT 1
    `).get(projectId, graphScopeId) as SqliteRow | undefined;
    return nullableString(row?.changeId);
  }

hasPlanningAcceptanceCommit(acceptanceId: string): boolean {
    return Boolean(this.db.prepare(
      "SELECT 1 FROM planning_acceptance_commits WHERE id = ? LIMIT 1",
    ).get(acceptanceId));
  }

deletePlanningAcceptanceCommit(acceptanceId: string): void {
    this.db.prepare("DELETE FROM planning_acceptance_commits WHERE id = ?").run(acceptanceId);
  }

listConversationChangeIds(projectId: string, conversationId: string): string[] {
    return (this.db.prepare(`
      SELECT change_id AS changeId FROM conversation_change_links
      WHERE project_id = ? AND conversation_id = ? ORDER BY linked_at ASC
    `).all(projectId, conversationId) as SqliteRow[]).map((row) => String(row.changeId));
  }

findConversationForChange(projectId: string, changeId: string): StoredConversation | null {
    const row = this.db.prepare(`
      SELECT c.project_id AS projectId, c.conversation_id AS conversationId, c.title, c.state, c.surface_kind AS surfaceKind,
        c.bound_change_id AS boundChangeId, c.current_graph_scope_id AS currentGraphScopeId,
        c.selected_provider_id AS selectedProviderId, c.completed_turn_sequence AS completedTurnSequence,
        c.timeline_position AS timelinePosition, c.timeline_revision AS timelineRevision,
        c.created_at AS createdAt, c.updated_at AS updatedAt,
        c.deleted_at AS deletedAt
      FROM conversation_change_links l
      JOIN conversations c
        ON c.project_id = l.project_id AND c.conversation_id = l.conversation_id
      WHERE l.project_id = ? AND l.change_id = ? AND c.deleted_at IS NULL
      ORDER BY l.linked_at DESC
      LIMIT 1
    `).get(projectId, changeId) as SqliteRow | undefined;
    return row ? mapConversationRow(row) : null;
  }
}

function nextMonotonicTimestamp(current: string, candidate: string): string {
  const currentTime = Date.parse(current);
  const candidateTime = Date.parse(candidate);
  if (!Number.isFinite(currentTime) || !Number.isFinite(candidateTime)) {
    throw new Error("Conversation title timestamps must be valid ISO dates.");
  }
  return new Date(Math.max(candidateTime, currentTime + 1)).toISOString();
}
