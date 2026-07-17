import type Database from "better-sqlite3";
import type { ProviderId } from "../../../provider-runtime/index.js";
import type { StoredConversationProviderBinding, StoredProviderAttempt, StoredProviderResumePoint, StoredProviderThreadLink } from "../contracts.js";
import { mapConversationProviderBindingRow, mapProviderAttemptRow, mapProviderResumePointRow, mapProviderThreadRow, nullableString, type SqliteRow } from "../sql-mappers.js";

export class ProviderAttemptRepository {
constructor(private readonly db: Database.Database) {}

  attachChangeToGraphScope(
    projectId: string,
    conversationId: string,
    graphScopeId: string,
    changeId: string,
    updatedAt: string,
  ): void {
    this.db.prepare(`
      UPDATE provider_thread_links SET change_id = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND graph_scope_id = ?
    `).run(changeId, updatedAt, projectId, conversationId, graphScopeId);
  }

  moveConversationThreadsToGraphScope(
    projectId: string,
    conversationId: string,
    plannerThreadId: string,
    graphScopeId: string,
    updatedAt: string,
  ): void {
    this.db.prepare(`
      UPDATE provider_thread_links SET graph_scope_id = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ?
        AND (role_id = 'main-agent' OR provider_thread_id = ?)
    `).run(graphScopeId, updatedAt, projectId, conversationId, plannerThreadId);
  }

readProviderThread(projectId: string, conversationId: string, providerId: ProviderId, roleId: string): StoredProviderThreadLink | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId, attempt_id AS attemptId,
        provider_id AS providerId, provider_thread_id AS providerThreadId, role_id AS roleId,
        parent_thread_id AS parentThreadId, change_id AS changeId, graph_scope_id AS graphScopeId,
        capability_profile AS capabilityProfile, display_name AS displayName, run_id AS runId, updated_at AS updatedAt
      FROM provider_thread_links
      WHERE project_id = ? AND conversation_id = ? AND provider_id = ? AND role_id = ?
      ORDER BY updated_at DESC LIMIT 1
    `).get(projectId, conversationId, providerId, roleId) as SqliteRow | undefined;
    return row ? mapProviderThreadRow(row) : null;
  }

readConversationProviderBinding(projectId: string, conversationId: string, providerId: ProviderId): StoredConversationProviderBinding | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId, provider_id AS providerId,
        native_session_id AS nativeSessionId, last_delivered_completed_turn AS lastDeliveredCompletedTurn,
        preferred_model_json AS preferredModelJson, last_used_at AS lastUsedAt,
        binding_status AS bindingStatus
      FROM conversation_provider_bindings
      WHERE project_id = ? AND conversation_id = ? AND provider_id = ?
    `).get(projectId, conversationId, providerId) as SqliteRow | undefined;
    return row ? mapConversationProviderBindingRow(row) : null;
  }

writeConversationProviderBinding(binding: StoredConversationProviderBinding): void {
    this.db.prepare(`
      INSERT INTO conversation_provider_bindings (
        project_id, conversation_id, provider_id, native_session_id,
        last_delivered_completed_turn, preferred_model_json, last_used_at, binding_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, conversation_id, provider_id) DO UPDATE SET
        native_session_id = excluded.native_session_id,
        last_delivered_completed_turn = excluded.last_delivered_completed_turn,
        preferred_model_json = excluded.preferred_model_json,
        last_used_at = excluded.last_used_at,
        binding_status = excluded.binding_status
    `).run(
      binding.projectId,
      binding.conversationId,
      binding.providerId,
      binding.nativeSessionId,
      binding.lastDeliveredCompletedTurn,
      binding.preferredModel ? JSON.stringify(binding.preferredModel) : null,
      binding.lastUsedAt,
      binding.bindingStatus,
    );
  }

createProviderAttempt(attempt: StoredProviderAttempt): void {
    this.db.prepare(`
      INSERT INTO provider_attempts (
        project_id, conversation_id, attempt_id, graph_scope_id, provider_id,
        change_id, agent_task_id, role_id, operation_profile,
        native_session_id, model_json, capability_snapshot_json, handoff_hash,
        delivered_through_completed_turn, worktree_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attempt.projectId,
      attempt.conversationId,
      attempt.attemptId,
      attempt.graphScopeId,
      attempt.providerId,
      attempt.changeId,
      attempt.agentTaskId,
      attempt.roleId,
      attempt.operationProfile,
      attempt.nativeSessionId,
      attempt.model ? JSON.stringify(attempt.model) : null,
      JSON.stringify(attempt.capabilitySnapshot),
      attempt.handoffHash,
      attempt.deliveredThroughCompletedTurn,
      attempt.worktreeId,
      attempt.status,
      attempt.createdAt,
      attempt.updatedAt,
    );
  }

startQueuedProviderAttempt(
    projectId: string,
    attemptId: string,
    input: Pick<StoredProviderAttempt, "capabilitySnapshot" | "handoffHash" | "deliveredThroughCompletedTurn" | "model" | "updatedAt">,
  ): void {
    const result = this.db.prepare(`
      UPDATE provider_attempts
      SET status = 'running', capability_snapshot_json = ?, handoff_hash = ?,
          delivered_through_completed_turn = ?, model_json = ?, updated_at = ?
      WHERE project_id = ? AND attempt_id = ? AND status = 'queued'
    `).run(
      JSON.stringify(input.capabilitySnapshot),
      input.handoffHash,
      input.deliveredThroughCompletedTurn,
      input.model ? JSON.stringify(input.model) : null,
      input.updatedAt,
      projectId,
      attemptId,
    );
    if (result.changes !== 1) throw new Error(`Queued provider attempt is no longer claimable: ${attemptId}.`);
  }

completeProviderAttempt(projectId: string, attemptId: string, status: StoredProviderAttempt["status"], nativeSessionId: string | null, updatedAt: string): void {
    const result = this.db.prepare(`
      UPDATE provider_attempts SET status = ?, native_session_id = COALESCE(?, native_session_id), updated_at = ?
      WHERE project_id = ? AND attempt_id = ?
    `).run(status, nativeSessionId, updatedAt, projectId, attemptId);
    if (result.changes !== 1) throw new Error(`Provider attempt not found: ${attemptId}`);
  }

readProviderAttempt(projectId: string, attemptId: string): StoredProviderAttempt | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId, attempt_id AS attemptId,
        graph_scope_id AS graphScopeId, provider_id AS providerId, native_session_id AS nativeSessionId,
        change_id AS changeId, agent_task_id AS agentTaskId, role_id AS roleId, operation_profile AS operationProfile,
        model_json AS modelJson, capability_snapshot_json AS capabilitySnapshotJson,
        handoff_hash AS handoffHash, delivered_through_completed_turn AS deliveredThroughCompletedTurn,
        worktree_id AS worktreeId, status, created_at AS createdAt, updated_at AS updatedAt
      FROM provider_attempts WHERE project_id = ? AND attempt_id = ?
    `).get(projectId, attemptId) as SqliteRow | undefined;
    return row ? mapProviderAttemptRow(row) : null;
  }

bindProviderAttemptThread(
    projectId: string,
    input: { attemptId: string; threadId: string; parentThreadId?: string | null; displayName?: string | null },
    updatedAt: string,
  ): StoredProviderThreadLink {
    return this.db.transaction(() => {
      const attemptRow = this.db.prepare(`
        SELECT project_id AS projectId, conversation_id AS conversationId, attempt_id AS attemptId,
          graph_scope_id AS graphScopeId, provider_id AS providerId, native_session_id AS nativeSessionId,
          change_id AS changeId, role_id AS roleId, operation_profile AS operationProfile
        FROM provider_attempts
        WHERE project_id = ? AND attempt_id = ?
      `).get(projectId, input.attemptId) as SqliteRow | undefined;
      if (!attemptRow) throw new Error(`Provider attempt not found: ${input.attemptId}`);

      const conversationId = nullableString(attemptRow.conversationId);
      if (!conversationId) throw new Error(`Provider attempt cannot bind a thread without a conversation: ${input.attemptId}`);
      const nativeSessionId = nullableString(attemptRow.nativeSessionId);
      if (nativeSessionId && nativeSessionId !== input.threadId) {
        throw new Error(`Provider attempt is already bound to another thread: ${input.attemptId}`);
      }

      const attemptLink = this.db.prepare(`
        SELECT provider_thread_id AS providerThreadId
        FROM provider_thread_links
        WHERE project_id = ? AND attempt_id = ?
      `).get(projectId, input.attemptId) as SqliteRow | undefined;
      if (attemptLink && String(attemptLink.providerThreadId) !== input.threadId) {
        throw new Error(`Provider attempt is already bound to another thread: ${input.attemptId}`);
      }

      const providerId = String(attemptRow.providerId);
      const roleId = String(attemptRow.roleId);
      const existingThread = this.db.prepare(`
        SELECT conversation_id AS conversationId, attempt_id AS attemptId, provider_id AS providerId,
          role_id AS roleId, parent_thread_id AS parentThreadId
        FROM provider_thread_links
        WHERE project_id = ? AND provider_id = ? AND provider_thread_id = ?
      `).get(projectId, providerId, input.threadId) as SqliteRow | undefined;
      const parentThreadId = input.parentThreadId === undefined && existingThread
        ? nullableString(existingThread.parentThreadId)
        : input.parentThreadId ?? null;
      if (existingThread && (
        String(existingThread.conversationId) !== conversationId
        || String(existingThread.providerId) !== providerId
        || String(existingThread.roleId) !== roleId
        || nullableString(existingThread.parentThreadId) !== parentThreadId
      )) {
        throw new Error(`Provider thread cannot resume with different lineage: ${input.threadId}`);
      }

      this.db.prepare(`
        INSERT INTO provider_thread_links (
          project_id, conversation_id, attempt_id, provider_id, provider_thread_id, role_id,
          parent_thread_id, change_id, graph_scope_id, capability_profile, display_name, run_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, provider_id, provider_thread_id) DO UPDATE SET
          attempt_id = excluded.attempt_id,
          change_id = excluded.change_id,
          graph_scope_id = excluded.graph_scope_id,
          capability_profile = excluded.capability_profile,
          display_name = COALESCE(excluded.display_name, provider_thread_links.display_name),
          run_id = excluded.run_id,
          updated_at = excluded.updated_at
      `).run(
        projectId,
        conversationId,
        input.attemptId,
        providerId,
        input.threadId,
        roleId,
        parentThreadId,
        nullableString(attemptRow.changeId),
        nullableString(attemptRow.graphScopeId),
        String(attemptRow.operationProfile),
        input.displayName ?? null,
        input.attemptId,
        updatedAt,
      );
      this.db.prepare(`
        UPDATE provider_attempts SET native_session_id = ?, updated_at = ?
        WHERE project_id = ? AND attempt_id = ?
      `).run(input.threadId, updatedAt, projectId, input.attemptId);

      const bound = this.db.prepare(`
        SELECT project_id AS projectId, conversation_id AS conversationId, attempt_id AS attemptId,
          provider_id AS providerId, provider_thread_id AS providerThreadId, role_id AS roleId,
          parent_thread_id AS parentThreadId, change_id AS changeId, graph_scope_id AS graphScopeId,
          capability_profile AS capabilityProfile, display_name AS displayName, run_id AS runId, updated_at AS updatedAt
        FROM provider_thread_links
        WHERE project_id = ? AND provider_id = ? AND provider_thread_id = ?
      `).get(projectId, providerId, input.threadId) as SqliteRow;
      return mapProviderThreadRow(bound);
    })();
  }

refineProviderAttemptSurfaceRole(
    projectId: string,
    attemptId: string,
    input: { roleId: string; operationProfile: string; handoffHash: string; displayName?: string | null },
    updatedAt: string,
  ): StoredProviderAttempt {
    return this.db.transaction(() => {
      const attempt = this.readProviderAttempt(projectId, attemptId);
      if (!attempt) throw new Error(`Provider attempt not found: ${attemptId}`);
      if (!attempt.conversationId || !attempt.graphScopeId || !attempt.nativeSessionId) {
        throw new Error(`Provider attempt cannot refine an Agent surface without canonical lineage: ${attemptId}`);
      }
      if (attempt.roleId !== input.roleId && attempt.roleId !== "child-agent") {
        throw new Error(`Provider attempt role is already authoritative: ${attemptId}`);
      }
      this.db.prepare(`
        UPDATE provider_attempts
        SET role_id = ?, operation_profile = ?, handoff_hash = ?, updated_at = ?
        WHERE project_id = ? AND attempt_id = ?
      `).run(input.roleId, input.operationProfile, input.handoffHash, updatedAt, projectId, attemptId);
      this.db.prepare(`
        UPDATE provider_thread_links
        SET role_id = ?, capability_profile = ?,
            display_name = COALESCE(?, display_name), updated_at = ?
        WHERE project_id = ? AND attempt_id = ? AND provider_thread_id = ?
      `).run(input.roleId, input.operationProfile, input.displayName ?? null, updatedAt, projectId, attemptId, attempt.nativeSessionId);
      return this.readProviderAttempt(projectId, attemptId)!;
    })();
  }

listProviderAttempts(projectId: string, conversationId: string): StoredProviderAttempt[] {
    const rows = this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId, attempt_id AS attemptId,
        graph_scope_id AS graphScopeId, provider_id AS providerId, native_session_id AS nativeSessionId,
        change_id AS changeId, agent_task_id AS agentTaskId, role_id AS roleId, operation_profile AS operationProfile,
        model_json AS modelJson, capability_snapshot_json AS capabilitySnapshotJson,
        handoff_hash AS handoffHash, delivered_through_completed_turn AS deliveredThroughCompletedTurn,
        worktree_id AS worktreeId, status, created_at AS createdAt, updated_at AS updatedAt
      FROM provider_attempts
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY created_at ASC
    `).all(projectId, conversationId) as SqliteRow[];
    return rows.map(mapProviderAttemptRow);
  }

writeProviderResumePoint(point: StoredProviderResumePoint): void {
    this.db.prepare(`
      INSERT INTO provider_resume_points (
        project_id, conversation_id, resume_point_id, graph_scope_id, change_id,
        previous_provider_id, target_provider_id, snapshot_json, snapshot_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      point.projectId,
      point.conversationId,
      point.resumePointId,
      point.graphScopeId,
      point.changeId,
      point.previousProviderId,
      point.targetProviderId,
      point.snapshotJson,
      point.snapshotHash,
      point.createdAt,
    );
  }

readLatestProviderResumePoint(projectId: string, conversationId: string): StoredProviderResumePoint | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId, resume_point_id AS resumePointId,
        graph_scope_id AS graphScopeId, change_id AS changeId, previous_provider_id AS previousProviderId,
        target_provider_id AS targetProviderId, snapshot_json AS snapshotJson, snapshot_hash AS snapshotHash,
        created_at AS createdAt
      FROM provider_resume_points
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(projectId, conversationId) as SqliteRow | undefined;
    return row ? mapProviderResumePointRow(row) : null;
  }

listProviderThreads(projectId: string, conversationId: string): StoredProviderThreadLink[] {
    return (this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId, attempt_id AS attemptId,
        provider_id AS providerId, provider_thread_id AS providerThreadId, role_id AS roleId,
        parent_thread_id AS parentThreadId, change_id AS changeId, graph_scope_id AS graphScopeId,
        capability_profile AS capabilityProfile, display_name AS displayName, run_id AS runId, updated_at AS updatedAt
      FROM provider_thread_links
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY updated_at ASC
    `).all(projectId, conversationId) as SqliteRow[]).map(mapProviderThreadRow);
  }
}
