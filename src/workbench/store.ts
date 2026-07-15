import Database from "better-sqlite3";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ResolvedMemory } from "../types/index.js";
import type { ProviderRegistry } from "../provider-runtime/registry.js";
import type { ProviderCapabilitySnapshot, ProviderId, ProviderModelRef } from "../provider-runtime/index.js";
import type { WorkbenchProviderUserInputRequest } from "./types.js";
import { acquireWorkbenchRuntimeMutationLock, type WorkbenchRuntimeMutationLock } from "./schema-rebuild-gate.js";

const WORKBENCH_SCHEMA_VERSION = 4;

export interface StoredTopicMessage {
  id: string;
  projectId: string;
  conversationId: string;
  changeId: string;
  position: number;
  type: string;
  timestamp: string;
  text: string | null;
  actionRunId: string | null;
  actionType: string | null;
  status: string | null;
  runId: string | null;
  providerId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  itemId?: string | null;
  artifact: string | null;
  error: string | null;
  rawJson: string;
}

export interface StoredConversation {
  projectId: string;
  conversationId: string;
  title: string;
  state: "active" | "archive";
  boundChangeId: string | null;
  currentGraphScopeId: string | null;
  selectedProviderId: ProviderId;
  completedTurnSequence: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StoredProviderThreadLink {
  projectId: string;
  conversationId: string;
  providerId: ProviderId;
  providerThreadId: string;
  roleId: string;
  parentThreadId: string | null;
  changeId: string | null;
  graphScopeId: string | null;
  capabilityProfile: string | null;
  displayName?: string | null;
  runId?: string | null;
  updatedAt: string;
}

export interface StoredConversationProviderBinding {
  projectId: string;
  conversationId: string;
  providerId: ProviderId;
  nativeSessionId: string | null;
  lastDeliveredCompletedTurn: number;
  preferredModel: ProviderModelRef | null;
  lastUsedAt: string | null;
  bindingStatus: "ready" | "unavailable" | "stale";
}

export interface StoredProviderAttempt {
  projectId: string;
  conversationId: string | null;
  attemptId: string;
  graphScopeId: string | null;
  changeId: string | null;
  agentTaskId: string | null;
  roleId: string;
  operationProfile: string;
  providerId: ProviderId;
  nativeSessionId: string | null;
  model: ProviderModelRef | null;
  capabilitySnapshot: ProviderCapabilitySnapshot;
  handoffHash: string;
  deliveredThroughCompletedTurn: number;
  worktreeId: string | null;
  status: "queued" | "running" | "completed" | "interrupted" | "failed" | "blocked";
  createdAt: string;
  updatedAt: string;
}

export interface StoredProviderResumePoint {
  projectId: string;
  conversationId: string;
  resumePointId: string;
  graphScopeId: string | null;
  changeId: string | null;
  previousProviderId: ProviderId;
  targetProviderId: ProviderId;
  snapshotJson: string;
  snapshotHash: string;
  createdAt: string;
}

export interface StoredSkillIndex {
  projectId: string;
  skillId: string;
  name: string;
  description: string;
  sourcePath: string;
  sourceKind: string;
  sourceHash: string;
  metadataJson: string;
  updatedAt: string;
}

export interface StoredSkillRoot {
  projectId: string;
  rootPath: string;
  sourceKind: string;
  updatedAt: string;
}

export type SkillEnablementScope = "project" | "topic";

export interface StoredSkillEnablement {
  projectId: string;
  changeId: string | null;
  skillId: string;
  scope: SkillEnablementScope;
  enabled: boolean;
  updatedAt: string;
}

export interface StoredBridgeSync {
  projectId: string;
  skillId: string;
  sourceHash: string;
  materializedPath: string;
  materializedHash: string;
  bridgeVersion: string;
  syncedAt: string;
}

export type StoredDecisionStatus = "pending" | "accepted" | "requested-changes" | "dismissed" | "completed" | "failed";

export interface StoredDecisionRecord {
  id: string;
  projectId: string;
  changeId: string | null;
  decisionType: string;
  status: StoredDecisionStatus;
  label: string;
  summary: string;
  targetId: string | null;
  runId: string | null;
  artifact: string | null;
  actionId: string | null;
  feedback: string | null;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface SqliteRow {
  [key: string]: unknown;
}

export class WorkbenchStore {
  private readonly db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static async open(memory: ResolvedMemory, options: { providerRegistry?: ProviderRegistry } = {}): Promise<WorkbenchStore> {
    await mkdir(dirname(memory.workbenchDbPath), { recursive: true });
    const db = new Database(memory.workbenchDbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    const currentVersion = Number(db.pragma("user_version", { simple: true }) ?? 0);
    const needsRebuild = currentVersion !== WORKBENCH_SCHEMA_VERSION;
    const rebuildingExistingRuntime = needsRebuild && hasWorkbenchRuntimeTables(db);
    let rebuildTransaction = false;
    let rebuildLock: WorkbenchRuntimeMutationLock | null = null;
    if (rebuildingExistingRuntime) {
      try {
        rebuildLock = await acquireWorkbenchRuntimeMutationLock(memory, "重建 Workbench 会话数据库");
        beginExclusiveSchemaRebuild(db);
        rebuildTransaction = true;
        assertRuntimeDatabaseResetSafe(db);
        await assertProviderTurnsStoppedBeforeReset(db, options.providerRegistry);
        const { listAgentTasks } = await import("../agent-task/repository.js");
        const activeTasks = (await listAgentTasks(memory))
          .filter((task) => task.status === "claimed" || task.status === "running");
        if (activeTasks.length > 0) {
          throw new Error("Workbench 会话数据库需要重建，但仍有后台 Agent 任务正在运行。请等待任务结束后重试。");
        }
        await assertWorkflowModelAttemptsStopped(memory);
      } catch (error) {
        if (rebuildTransaction) db.exec("ROLLBACK");
        db.close();
        await rebuildLock?.release();
        throw error;
      }
    }
    try {
      migrate(db);
      if (rebuildTransaction) db.exec("COMMIT");
      await rebuildLock?.release();
    } catch (error) {
      if (rebuildTransaction) db.exec("ROLLBACK");
      db.close();
      await rebuildLock?.release();
      throw error;
    }
    return new WorkbenchStore(db);
  }

  close(): void {
    this.db.close();
  }

  appendMessage(message: Omit<StoredTopicMessage, "position">): StoredTopicMessage {
    const row = this.db.prepare(
      "SELECT COALESCE(MAX(position), 0) + 1 AS nextPosition FROM canonical_timeline_items WHERE project_id = ? AND conversation_id = ?",
    ).get(message.projectId, message.conversationId) as SqliteRow;
    const position = Number(row.nextPosition ?? 1);
    this.db.prepare(`
      INSERT INTO canonical_timeline_items (
        id, project_id, conversation_id, change_id, position, type, timestamp, text, action_run_id,
        action_type, status, run_id, provider_id, thread_id, turn_id, item_id, artifact, error, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.id,
      message.projectId,
      message.conversationId,
      message.changeId,
      position,
      message.type,
      message.timestamp,
      message.text,
      message.actionRunId,
      message.actionType,
      message.status,
      message.runId,
      message.providerId ?? null,
      message.threadId ?? null,
      message.turnId ?? null,
      message.itemId ?? null,
      message.artifact,
      message.error,
      message.rawJson,
    );
    return { ...message, position };
  }

  updateMessage(message: Omit<StoredTopicMessage, "position">): void {
    const result = this.db.prepare(`
      UPDATE canonical_timeline_items SET change_id = ?, type = ?, timestamp = ?, text = ?, action_run_id = ?,
        action_type = ?, status = ?, run_id = ?, provider_id = ?, thread_id = ?, turn_id = ?, item_id = ?, artifact = ?, error = ?, raw_json = ?
      WHERE id = ? AND project_id = ? AND conversation_id = ?
    `).run(
      message.changeId,
      message.type,
      message.timestamp,
      message.text,
      message.actionRunId,
      message.actionType,
      message.status,
      message.runId,
      message.providerId ?? null,
      message.threadId ?? null,
      message.turnId ?? null,
      message.itemId ?? null,
      message.artifact,
      message.error,
      message.rawJson,
      message.id,
      message.projectId,
      message.conversationId,
    );
    if (result.changes !== 1) throw new Error(`Conversation message not found: ${message.id}.`);
  }

  transitionProviderUserInputRequest(
    projectId: string,
    conversationId: string,
    requestKey: string,
    expectedStatus: WorkbenchProviderUserInputRequest["status"],
    nextStatus: WorkbenchProviderUserInputRequest["status"],
    answers: Record<string, string | string[]> | undefined,
    updatedAt: string,
  ): WorkbenchProviderUserInputRequest {
    return this.db.transaction(() => {
      const row = this.listConversationMessages(projectId, conversationId)
        .reverse()
        .find((message) => {
          try {
            const raw = JSON.parse(message.rawJson) as { providerUserInput?: WorkbenchProviderUserInputRequest };
            return raw.providerUserInput?.requestKey === requestKey;
          } catch {
            return false;
          }
        });
      if (!row) throw new Error(`Provider user input request was not persisted: ${requestKey}.`);
      const raw = JSON.parse(row.rawJson) as Record<string, unknown> & { providerUserInput: WorkbenchProviderUserInputRequest };
      if (raw.providerUserInput.status !== expectedStatus) {
        throw new Error(`Provider user input request ${requestKey} is ${raw.providerUserInput.status}, not ${expectedStatus}.`);
      }
      const nextRequest: WorkbenchProviderUserInputRequest = {
        ...raw.providerUserInput,
        status: nextStatus,
        ...(answers ? { answers } : {}),
        ...(nextStatus === "submitted" ? { submittedAt: updatedAt } : {}),
      };
      this.updateMessage({
        ...row,
        timestamp: updatedAt,
        status: nextStatus,
        rawJson: JSON.stringify({ ...raw, timestamp: updatedAt, status: nextStatus, providerUserInput: nextRequest }),
      });
      return nextRequest;
    })();
  }

  readProviderUserInputRequest(
    projectId: string,
    conversationId: string,
    requestKey: string,
  ): WorkbenchProviderUserInputRequest | null {
    const row = this.listConversationMessages(projectId, conversationId)
      .reverse()
      .find((message) => {
        try {
          const raw = JSON.parse(message.rawJson) as { providerUserInput?: WorkbenchProviderUserInputRequest };
          return raw.providerUserInput?.requestKey === requestKey;
        } catch {
          return false;
        }
      });
    if (!row) return null;
    const raw = JSON.parse(row.rawJson) as { providerUserInput?: WorkbenchProviderUserInputRequest };
    return raw.providerUserInput ?? null;
  }

  updatePlanningMessageStatus(projectId: string, conversationId: string, artifact: string, status: string): void {
    const row = this.listConversationMessages(projectId, conversationId)
      .find((message) => message.artifact === artifact && message.type === "assistant.message");
    if (!row) throw new Error(`Planning proposal message not found: ${artifact}.`);
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(row.rawJson) as Record<string, unknown>;
    } catch {
      // Keep the durable row usable even if an old diagnostic payload was malformed.
    }
    this.updateMessage({
      ...row,
      status,
      rawJson: JSON.stringify({ ...raw, status }),
    });
  }

  listMessages(projectId: string, changeId: string): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        provider_id AS providerId, thread_id AS threadId, turn_id AS turnId, item_id AS itemId,
        artifact, error, raw_json AS rawJson
      FROM canonical_timeline_items
      WHERE project_id = ? AND change_id = ?
      ORDER BY position ASC
    `).all(projectId, changeId) as SqliteRow[]).map(mapMessageRow);
  }

  listConversationMessages(projectId: string, conversationId: string): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        provider_id AS providerId, thread_id AS threadId, turn_id AS turnId, item_id AS itemId,
        artifact, error, raw_json AS rawJson
      FROM canonical_timeline_items
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY position ASC
    `).all(projectId, conversationId) as SqliteRow[]).map(mapMessageRow);
  }

  listLatestMessages(projectId: string, changeId: string, limit: number): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        provider_id AS providerId, thread_id AS threadId, turn_id AS turnId, item_id AS itemId,
        artifact, error, raw_json AS rawJson
      FROM canonical_timeline_items
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY position DESC
      LIMIT ?
    `).all(projectId, changeId, limit) as SqliteRow[]).map(mapMessageRow).reverse();
  }

  listMessagesBeforePosition(projectId: string, changeId: string, beforePosition: number, limit: number): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        provider_id AS providerId, thread_id AS threadId, turn_id AS turnId, item_id AS itemId,
        artifact, error, raw_json AS rawJson
      FROM canonical_timeline_items
      WHERE project_id = ? AND conversation_id = ? AND position < ?
      ORDER BY position DESC
      LIMIT ?
    `).all(projectId, changeId, beforePosition, limit) as SqliteRow[]).map(mapMessageRow).reverse();
  }

  listAllMessages(projectId: string): StoredTopicMessage[] {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, conversation_id AS conversationId, change_id AS changeId, position, type, timestamp,
        text, action_run_id AS actionRunId, action_type AS actionType, status, run_id AS runId,
        provider_id AS providerId, thread_id AS threadId, turn_id AS turnId, item_id AS itemId,
        artifact, error, raw_json AS rawJson
      FROM canonical_timeline_items
      WHERE project_id = ?
      ORDER BY timestamp ASC, position ASC
    `).all(projectId) as SqliteRow[]).map(mapMessageRow);
  }

  hasMessages(projectId: string, changeId: string): boolean {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM canonical_timeline_items WHERE project_id = ? AND conversation_id = ?").get(projectId, changeId) as SqliteRow;
    return Number(row.count ?? 0) > 0;
  }

  countMessages(projectId: string, changeId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM canonical_timeline_items WHERE project_id = ? AND conversation_id = ?").get(projectId, changeId) as SqliteRow;
    return Number(row.count ?? 0);
  }

  deleteMessages(projectId: string, changeId: string): number {
    const result = this.db.prepare("DELETE FROM canonical_timeline_items WHERE project_id = ? AND conversation_id = ?").run(projectId, changeId);
    return result.changes;
  }

  importMessages(messages: StoredTopicMessage[]): number {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO canonical_timeline_items (
        id, project_id, conversation_id, change_id, position, type, timestamp, text, action_run_id,
        action_type, status, run_id, provider_id, thread_id, turn_id, item_id, artifact, error, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = this.db.transaction((items: StoredTopicMessage[]) => {
      let count = 0;
      for (const item of items) {
        const result = insert.run(
          item.id,
          item.projectId,
          item.conversationId,
          item.changeId,
          item.position,
          item.type,
          item.timestamp,
          item.text,
          item.actionRunId,
          item.actionType,
          item.status,
          item.runId,
          item.providerId ?? null,
          item.threadId ?? null,
          item.turnId ?? null,
          item.itemId ?? null,
          item.artifact,
          item.error,
          item.rawJson,
        );
        count += result.changes;
      }
      return count;
    });
    return transaction(messages) as number;
  }

  createConversation(conversation: StoredConversation): void {
    this.db.prepare(`
      INSERT INTO conversations (
        project_id, conversation_id, title, state, bound_change_id, current_graph_scope_id,
        selected_provider_id, completed_turn_sequence, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, conversation_id) DO UPDATE SET
        title = excluded.title,
        state = excluded.state,
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
      conversation.boundChangeId,
      conversation.currentGraphScopeId,
      conversation.selectedProviderId,
      conversation.completedTurnSequence,
      conversation.createdAt,
      conversation.updatedAt,
      conversation.deletedAt,
    );
  }

  listConversations(projectId: string, options: { includeDeleted?: boolean } = {}): StoredConversation[] {
    const rows = options.includeDeleted
      ? this.db.prepare(`
        SELECT project_id AS projectId, conversation_id AS conversationId, title, state,
          bound_change_id AS boundChangeId, current_graph_scope_id AS currentGraphScopeId,
          selected_provider_id AS selectedProviderId, completed_turn_sequence AS completedTurnSequence,
          created_at AS createdAt, updated_at AS updatedAt,
          deleted_at AS deletedAt
        FROM conversations
        WHERE project_id = ?
        ORDER BY updated_at DESC
      `).all(projectId) as SqliteRow[]
      : this.db.prepare(`
        SELECT project_id AS projectId, conversation_id AS conversationId, title, state,
          bound_change_id AS boundChangeId, current_graph_scope_id AS currentGraphScopeId,
          selected_provider_id AS selectedProviderId, completed_turn_sequence AS completedTurnSequence,
          created_at AS createdAt, updated_at AS updatedAt,
          deleted_at AS deletedAt
        FROM conversations
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC
      `).all(projectId) as SqliteRow[];
    return rows.map(mapConversationRow);
  }

  readConversation(projectId: string, conversationId: string, options: { includeDeleted?: boolean } = {}): StoredConversation | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId, title, state,
        bound_change_id AS boundChangeId, current_graph_scope_id AS currentGraphScopeId,
        selected_provider_id AS selectedProviderId, completed_turn_sequence AS completedTurnSequence,
        created_at AS createdAt, updated_at AS updatedAt,
        deleted_at AS deletedAt
      FROM conversations
      WHERE project_id = ? AND conversation_id = ? ${options.includeDeleted ? "" : "AND deleted_at IS NULL"}
    `).get(projectId, conversationId) as SqliteRow | undefined;
    return row ? mapConversationRow(row) : null;
  }

  readConversationByChangeId(projectId: string, changeId: string): StoredConversation | null {
    const row = this.db.prepare(`
      SELECT c.project_id AS projectId, c.conversation_id AS conversationId, c.title, c.state,
        c.bound_change_id AS boundChangeId, c.current_graph_scope_id AS currentGraphScopeId,
        c.selected_provider_id AS selectedProviderId, c.completed_turn_sequence AS completedTurnSequence,
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

  deleteConversation(projectId: string, conversationId: string, deletedAt: string): void {
    const transaction = this.db.transaction(() => {
      this.deleteMessages(projectId, conversationId);
      this.db.prepare(`
        UPDATE conversations
        SET deleted_at = ?, updated_at = ?
        WHERE project_id = ? AND conversation_id = ?
      `).run(deletedAt, deletedAt, projectId, conversationId);
    });
    transaction();
  }

  hideConversation(projectId: string, conversationId: string, hiddenAt: string): void {
    this.db.prepare(`
      UPDATE conversations
      SET deleted_at = ?, updated_at = ?
      WHERE project_id = ? AND conversation_id = ? AND deleted_at IS NULL
    `).run(hiddenAt, hiddenAt, projectId, conversationId);
  }

  readProviderThread(projectId: string, conversationId: string, providerId: ProviderId, roleId: string): StoredProviderThreadLink | null {
    const row = this.db.prepare(`
      SELECT project_id AS projectId, conversation_id AS conversationId,
        provider_id AS providerId, provider_thread_id AS providerThreadId, role_id AS roleId,
        parent_thread_id AS parentThreadId, change_id AS changeId, graph_scope_id AS graphScopeId,
        capability_profile AS capabilityProfile, display_name AS displayName, run_id AS runId, updated_at AS updatedAt
      FROM provider_thread_links
      WHERE project_id = ? AND conversation_id = ? AND provider_id = ? AND role_id = ?
      ORDER BY updated_at DESC LIMIT 1
    `).get(projectId, conversationId, providerId, roleId) as SqliteRow | undefined;
    return row ? mapProviderThreadRow(row) : null;
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

  commitConversationProviderSwitch(
    point: StoredProviderResumePoint,
    binding: StoredConversationProviderBinding,
    expectedProviderId: ProviderId,
    resumeAttempt: StoredProviderAttempt,
  ): void {
    this.db.transaction(() => {
      const selected = this.db.prepare(`
        UPDATE conversations SET selected_provider_id = ?, updated_at = ?
        WHERE project_id = ? AND conversation_id = ? AND selected_provider_id = ? AND deleted_at IS NULL
      `).run(
        point.targetProviderId,
        point.createdAt,
        point.projectId,
        point.conversationId,
        expectedProviderId,
      );
      if (selected.changes !== 1) {
        throw new Error(`Conversation provider changed concurrently: ${point.conversationId}`);
      }
      this.writeProviderResumePoint(point);
      this.writeConversationProviderBinding(binding);
      this.createProviderAttempt(resumeAttempt);
    })();
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
      SELECT project_id AS projectId, conversation_id AS conversationId,
        provider_id AS providerId, provider_thread_id AS providerThreadId, role_id AS roleId,
        parent_thread_id AS parentThreadId, change_id AS changeId, graph_scope_id AS graphScopeId,
        capability_profile AS capabilityProfile, display_name AS displayName, run_id AS runId, updated_at AS updatedAt
      FROM provider_thread_links
      WHERE project_id = ? AND conversation_id = ?
      ORDER BY updated_at ASC
    `).all(projectId, conversationId) as SqliteRow[]).map(mapProviderThreadRow);
  }

  writeProviderThread(link: StoredProviderThreadLink): void {
    this.db.prepare(`
      INSERT INTO provider_thread_links (
        project_id, conversation_id, provider_id, provider_thread_id, role_id,
        parent_thread_id, change_id, graph_scope_id, capability_profile, display_name, run_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, provider_id, provider_thread_id) DO UPDATE SET
        conversation_id = excluded.conversation_id,
        role_id = excluded.role_id,
        parent_thread_id = excluded.parent_thread_id,
        change_id = excluded.change_id,
        graph_scope_id = excluded.graph_scope_id,
        capability_profile = excluded.capability_profile,
        display_name = excluded.display_name,
        run_id = excluded.run_id,
        updated_at = excluded.updated_at
    `).run(
      link.projectId,
      link.conversationId,
      link.providerId,
      link.providerThreadId,
      link.roleId,
      link.parentThreadId,
      link.changeId,
      link.graphScopeId,
      link.capabilityProfile,
      link.displayName ?? null,
      link.runId ?? null,
      link.updatedAt,
    );
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

  acceptConversationChangeBinding(
    projectId: string,
    conversationId: string,
    changeId: string,
    linkedAt: string,
    acceptanceId?: string,
    proposalHash?: string,
    scopeTransition?: { graphScopeId: string; runId?: string; plannerThreadId?: string },
  ): void {
    this.db.transaction(() => {
      if (scopeTransition) {
        if (!scopeTransition.runId || !scopeTransition.plannerThreadId) {
          throw new Error("A superseding planning acceptance requires durable provider lineage.");
        }
        this.moveConversationRunToGraphScope(
          projectId,
          conversationId,
          scopeTransition.runId,
          scopeTransition.plannerThreadId,
          scopeTransition.graphScopeId,
          linkedAt,
        );
      }
      const graphScopeId = this.readConversation(projectId, conversationId)?.currentGraphScopeId;
      if (!graphScopeId) throw new Error("Planning acceptance requires the current graph scope.");
      this.linkConversationChange(projectId, conversationId, changeId, linkedAt);
      this.db.prepare(`
        UPDATE provider_thread_links SET change_id = ?, updated_at = ?
        WHERE project_id = ? AND conversation_id = ? AND graph_scope_id = ?
      `).run(changeId, linkedAt, projectId, conversationId, graphScopeId);
      if (acceptanceId && proposalHash) {
        this.db.prepare(`
          INSERT INTO planning_acceptance_commits (
            id, project_id, conversation_id, change_id, graph_scope_id, proposal_hash, committed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(acceptanceId, projectId, conversationId, changeId, graphScopeId, proposalHash, linkedAt);
      }
    })();
  }

  startConversationGraphScope(projectId: string, conversationId: string, graphScopeId: string, updatedAt: string): void {
    this.db.transaction(() => {
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
    })();
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

  moveConversationRunToGraphScope(
    projectId: string,
    conversationId: string,
    runId: string,
    plannerThreadId: string,
    graphScopeId: string,
    updatedAt: string,
  ): void {
    this.db.transaction(() => {
      this.startConversationGraphScope(projectId, conversationId, graphScopeId, updatedAt);
      this.db.prepare(`
        UPDATE provider_thread_links SET graph_scope_id = ?, updated_at = ?
        WHERE project_id = ? AND conversation_id = ?
          AND (role_id = 'main-agent' OR provider_thread_id = ?)
      `).run(graphScopeId, updatedAt, projectId, conversationId, plannerThreadId);
      const rows = this.db.prepare(`
        SELECT id, raw_json AS rawJson FROM canonical_timeline_items
        WHERE project_id = ? AND conversation_id = ? AND run_id = ?
      `).all(projectId, conversationId, runId) as SqliteRow[];
      const update = this.db.prepare("UPDATE canonical_timeline_items SET raw_json = ? WHERE id = ? AND project_id = ?");
      for (const row of rows) {
        let raw: Record<string, unknown> = {};
        try { raw = JSON.parse(String(row.rawJson)) as Record<string, unknown>; } catch { /* keep the row readable */ }
        update.run(JSON.stringify({ ...raw, graphScopeId }), String(row.id), projectId);
      }
    })();
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
      SELECT c.project_id AS projectId, c.conversation_id AS conversationId, c.title, c.state,
        c.bound_change_id AS boundChangeId, c.current_graph_scope_id AS currentGraphScopeId,
        c.selected_provider_id AS selectedProviderId, c.completed_turn_sequence AS completedTurnSequence,
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

function migrate(db: Database.Database): void {
  const currentVersion = Number(db.pragma("user_version", { simple: true }));
  if (currentVersion !== WORKBENCH_SCHEMA_VERSION) {
    resetWorkbenchConversationRunSchema(db);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_timeline_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL DEFAULT '',
      change_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      text TEXT,
      action_run_id TEXT,
      action_type TEXT,
      status TEXT,
      run_id TEXT,
      provider_id TEXT,
      thread_id TEXT,
      turn_id TEXT,
      item_id TEXT,
      artifact TEXT,
      error TEXT,
      raw_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_timeline_change ON canonical_timeline_items(project_id, change_id, position);

    CREATE TABLE IF NOT EXISTS conversations (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'active',
      bound_change_id TEXT,
      current_graph_scope_id TEXT,
      selected_provider_id TEXT NOT NULL,
      completed_turn_sequence INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      PRIMARY KEY(project_id, conversation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_project_updated ON conversations(project_id, deleted_at, updated_at);

    CREATE TABLE IF NOT EXISTS action_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      result_json TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_action_runs_topic ON action_runs(project_id, change_id, started_at);

    CREATE TABLE IF NOT EXISTS provider_thread_links (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_thread_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      parent_thread_id TEXT,
      change_id TEXT,
      graph_scope_id TEXT,
      capability_profile TEXT,
      display_name TEXT,
      run_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, provider_id, provider_thread_id)
    );
    CREATE INDEX IF NOT EXISTS idx_provider_threads_conversation_role
      ON provider_thread_links(project_id, conversation_id, provider_id, role_id, updated_at);

    CREATE TABLE IF NOT EXISTS conversation_provider_bindings (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      native_session_id TEXT,
      last_delivered_completed_turn INTEGER NOT NULL DEFAULT 0,
      preferred_model_json TEXT,
      last_used_at TEXT,
      binding_status TEXT NOT NULL,
      PRIMARY KEY(project_id, conversation_id, provider_id)
    );

    CREATE TABLE IF NOT EXISTS provider_attempts (
      project_id TEXT NOT NULL,
      conversation_id TEXT,
      attempt_id TEXT NOT NULL,
      graph_scope_id TEXT,
      provider_id TEXT NOT NULL,
      change_id TEXT,
      agent_task_id TEXT,
      role_id TEXT NOT NULL,
      operation_profile TEXT NOT NULL,
      native_session_id TEXT,
      model_json TEXT,
      capability_snapshot_json TEXT NOT NULL,
      handoff_hash TEXT NOT NULL,
      delivered_through_completed_turn INTEGER NOT NULL,
      worktree_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, attempt_id)
    );
    CREATE INDEX IF NOT EXISTS idx_provider_attempts_conversation
      ON provider_attempts(project_id, conversation_id, graph_scope_id, updated_at);

    CREATE TABLE IF NOT EXISTS provider_resume_points (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      resume_point_id TEXT NOT NULL,
      graph_scope_id TEXT,
      change_id TEXT,
      previous_provider_id TEXT NOT NULL,
      target_provider_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(project_id, resume_point_id)
    );
    CREATE INDEX IF NOT EXISTS idx_provider_resume_points_conversation
      ON provider_resume_points(project_id, conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS conversation_change_links (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      graph_scope_id TEXT,
      linked_at TEXT NOT NULL,
      PRIMARY KEY(project_id, conversation_id, change_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_graph_scopes (
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      graph_scope_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, graph_scope_id)
    );

    CREATE TABLE IF NOT EXISTS planning_acceptance_commits (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      graph_scope_id TEXT,
      proposal_hash TEXT NOT NULL,
      committed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      project_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      source_path TEXT NOT NULL,
      source_kind TEXT NOT NULL DEFAULT 'managed',
      source_hash TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS skill_roots (
      project_id TEXT NOT NULL,
      root_path TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, root_path)
    );

    CREATE TABLE IF NOT EXISTS skill_enablement (
      project_id TEXT NOT NULL,
      change_id TEXT NOT NULL DEFAULT '',
      skill_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, change_id, skill_id, scope)
    );

    CREATE TABLE IF NOT EXISTS approval_cache (
      project_id TEXT NOT NULL,
      change_id TEXT,
      approval_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, approval_id)
    );

    CREATE TABLE IF NOT EXISTS bridge_sync (
      project_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      source_hash TEXT NOT NULL DEFAULT '',
      materialized_path TEXT NOT NULL,
      materialized_hash TEXT NOT NULL,
      bridge_version TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY(project_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS decision_records (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      change_id TEXT NOT NULL DEFAULT '',
      decision_type TEXT NOT NULL,
      status TEXT NOT NULL,
      label TEXT NOT NULL,
      summary TEXT NOT NULL,
      target_id TEXT,
      run_id TEXT,
      artifact TEXT,
      action_id TEXT,
      feedback TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY(project_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_decision_records_topic ON decision_records(project_id, change_id, updated_at);
  `);
  db.exec(`
    DELETE FROM conversation_change_links
    WHERE graph_scope_id IS NOT NULL AND rowid NOT IN (
      SELECT MAX(rowid) FROM conversation_change_links
      WHERE graph_scope_id IS NOT NULL
      GROUP BY project_id, graph_scope_id
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_change_graph_scope
      ON conversation_change_links(project_id, graph_scope_id)
      WHERE graph_scope_id IS NOT NULL;
    DELETE FROM conversation_change_links
    WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM conversation_change_links
      GROUP BY project_id, change_id
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_change_change_id
      ON conversation_change_links(project_id, change_id);
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_timeline_conversation ON canonical_timeline_items(project_id, conversation_id, position);");
  db.pragma(`user_version = ${WORKBENCH_SCHEMA_VERSION}`);
}

function hasWorkbenchRuntimeTables(db: Database.Database): boolean {
  const row = db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name IN ('conversations', 'messages', 'canonical_timeline_items', 'provider_attempts') LIMIT 1").get() as SqliteRow | undefined;
  return Boolean(row?.present);
}

function beginExclusiveSchemaRebuild(db: Database.Database): void {
  try {
    db.pragma("busy_timeout = 250");
    db.exec("BEGIN EXCLUSIVE");
    db.pragma("busy_timeout = 5000");
  } catch (error) {
    if (error instanceof Error && /busy|locked/i.test(error.message)) {
      throw new Error("Workbench 会话数据库需要重建，但另一个 Workbench 实例正在使用该数据库。请先停止其他实例后重试。", { cause: error });
    }
    throw error;
  }
}

function assertRuntimeDatabaseResetSafe(db: Database.Database): void {
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as SqliteRow[]).map((row) => String(row.name)));
  if (tables.has("provider_attempts")) {
    const active = db.prepare("SELECT COUNT(*) AS count FROM provider_attempts WHERE status IN ('queued', 'running')").get() as SqliteRow;
    if (Number(active.count ?? 0) > 0) throw new Error("Workbench 会话数据库需要重建，但仍有模型执行尚未结束或完成对账。");
  }
  if (tables.has("action_runs")) {
    const columns = db.prepare("PRAGMA table_info(action_runs)").all() as SqliteRow[];
    if (columns.some((column) => String(column.name) === "status")) {
      const active = db.prepare("SELECT COUNT(*) AS count FROM action_runs WHERE status IN ('queued', 'running')").get() as SqliteRow;
      if (Number(active.count ?? 0) > 0) throw new Error("Workbench 会话数据库需要重建，但仍有 Workbench action 正在运行。");
    }
  }
}

async function assertProviderTurnsStoppedBeforeReset(db: Database.Database, providerRegistry?: ProviderRegistry): Promise<void> {
  const registry = providerRegistry ?? (await import("../provider-runtime/default-registry.js")).defaultProviderRegistry;
  if (registry.listActiveTurns().length > 0) {
    throw new Error("Workbench 会话数据库需要重建，但仍有 Agent provider turn 正在运行。请先停止并等待退出。");
  }
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as SqliteRow[]).map((row) => String(row.name)));
  const scopeIds = new Set<string>();
  if (tables.has("conversations")) {
    const columns = new Set((db.prepare("PRAGMA table_info(conversations)").all() as SqliteRow[]).map((row) => String(row.name)));
    const fields = [columns.has("conversation_id") ? "conversation_id" : null, columns.has("bound_change_id") ? "bound_change_id" : null].filter((field): field is string => Boolean(field));
    if (fields.length > 0) {
      for (const row of db.prepare(`SELECT ${fields.join(", ")} FROM conversations`).all() as SqliteRow[]) {
        for (const field of fields) if (row[field]) scopeIds.add(String(row[field]));
      }
    }
  }
  if (tables.has("provider_attempts")) {
    for (const row of db.prepare("SELECT attempt_id FROM provider_attempts WHERE status IN ('queued', 'running')").all() as SqliteRow[]) {
      if (row.attempt_id) scopeIds.add(String(row.attempt_id));
    }
  }
  if (registry.findActiveTurns(scopeIds).length > 0) {
    throw new Error("Workbench 会话数据库需要重建，但仍有 Agent provider turn 正在运行。请先停止并等待退出。");
  }
}

async function assertWorkflowModelAttemptsStopped(memory: ResolvedMemory): Promise<void> {
  const activeRoot = join(memory.changesRoot, "active");
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0) return;
  const { listTaskRuns } = await import("../task-run/repository.js");
  const { isActiveTaskRunStatus } = await import("../task-run/guards.js");
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".gitkeep") continue;
    const active = (await listTaskRuns(memory, entry.name)).filter((run) => isActiveTaskRunStatus(run.status));
    if (active.length > 0) {
      throw new Error("Workbench 会话数据库需要重建，但仍有 Workflow 模型节点正在运行。请先暂停并完成对账。");
    }
  }
}

function resetWorkbenchConversationRunSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS canonical_timeline_items;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS action_runs;
    DROP TABLE IF EXISTS provider_thread_links;
    DROP TABLE IF EXISTS conversation_provider_bindings;
    DROP TABLE IF EXISTS provider_attempts;
    DROP TABLE IF EXISTS provider_resume_points;
    DROP TABLE IF EXISTS conversation_change_links;
    DROP TABLE IF EXISTS conversation_graph_scopes;
    DROP TABLE IF EXISTS planning_acceptance_commits;
    DROP TABLE IF EXISTS approval_cache;
    DROP TABLE IF EXISTS decision_records;
  `);
}

function mapMessageRow(row: SqliteRow): StoredTopicMessage {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    conversationId: String(row.conversationId),
    changeId: String(row.changeId),
    position: Number(row.position),
    type: String(row.type),
    timestamp: String(row.timestamp),
    text: nullableString(row.text),
    actionRunId: nullableString(row.actionRunId),
    actionType: nullableString(row.actionType),
    status: nullableString(row.status),
    runId: nullableString(row.runId),
    providerId: nullableString(row.providerId),
    threadId: nullableString(row.threadId),
    turnId: nullableString(row.turnId),
    itemId: nullableString(row.itemId),
    artifact: nullableString(row.artifact),
    error: nullableString(row.error),
    rawJson: String(row.rawJson),
  };
}

function mapConversationRow(row: SqliteRow): StoredConversation {
  return {
    projectId: String(row.projectId),
    conversationId: String(row.conversationId),
    title: String(row.title),
    state: row.state === "archive" ? "archive" : "active",
    boundChangeId: nullableString(row.boundChangeId),
    currentGraphScopeId: nullableString(row.currentGraphScopeId),
    selectedProviderId: String(row.selectedProviderId),
    completedTurnSequence: Number(row.completedTurnSequence),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    deletedAt: nullableString(row.deletedAt),
  };
}

function mapProviderThreadRow(row: SqliteRow): StoredProviderThreadLink {
  return {
    projectId: String(row.projectId),
    conversationId: String(row.conversationId),
    providerId: String(row.providerId),
    providerThreadId: String(row.providerThreadId),
    roleId: String(row.roleId),
    parentThreadId: nullableString(row.parentThreadId),
    changeId: nullableString(row.changeId),
    graphScopeId: nullableString(row.graphScopeId),
    capabilityProfile: nullableString(row.capabilityProfile),
    displayName: nullableString(row.displayName),
    runId: nullableString(row.runId),
    updatedAt: String(row.updatedAt),
  };
}

function mapConversationProviderBindingRow(row: SqliteRow): StoredConversationProviderBinding {
  return {
    projectId: String(row.projectId),
    conversationId: String(row.conversationId),
    providerId: String(row.providerId),
    nativeSessionId: nullableString(row.nativeSessionId),
    lastDeliveredCompletedTurn: Number(row.lastDeliveredCompletedTurn),
    preferredModel: parseJsonObject<ProviderModelRef>(row.preferredModelJson),
    lastUsedAt: nullableString(row.lastUsedAt),
    bindingStatus: row.bindingStatus === "unavailable" ? "unavailable" : row.bindingStatus === "stale" ? "stale" : "ready",
  };
}

function mapProviderAttemptRow(row: SqliteRow): StoredProviderAttempt {
  const capabilitySnapshot = parseJsonObject<ProviderCapabilitySnapshot>(row.capabilitySnapshotJson);
  if (!capabilitySnapshot) throw new Error(`Provider attempt has invalid capability snapshot: ${String(row.attemptId)}`);
  const status = String(row.status);
  return {
    projectId: String(row.projectId),
    conversationId: nullableString(row.conversationId),
    attemptId: String(row.attemptId),
    graphScopeId: nullableString(row.graphScopeId),
    changeId: nullableString(row.changeId),
    agentTaskId: nullableString(row.agentTaskId),
    roleId: String(row.roleId),
    operationProfile: String(row.operationProfile),
    providerId: String(row.providerId),
    nativeSessionId: nullableString(row.nativeSessionId),
    model: parseJsonObject<ProviderModelRef>(row.modelJson),
    capabilitySnapshot,
    handoffHash: String(row.handoffHash),
    deliveredThroughCompletedTurn: Number(row.deliveredThroughCompletedTurn),
    worktreeId: nullableString(row.worktreeId),
    status: status === "queued" || status === "running" || status === "completed" || status === "interrupted" || status === "blocked" ? status : "failed",
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapProviderResumePointRow(row: SqliteRow): StoredProviderResumePoint {
  return {
    projectId: String(row.projectId),
    conversationId: String(row.conversationId),
    resumePointId: String(row.resumePointId),
    graphScopeId: nullableString(row.graphScopeId),
    changeId: nullableString(row.changeId),
    previousProviderId: String(row.previousProviderId),
    targetProviderId: String(row.targetProviderId),
    snapshotJson: String(row.snapshotJson),
    snapshotHash: String(row.snapshotHash),
    createdAt: String(row.createdAt),
  };
}

function parseJsonObject<T>(value: unknown): T | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as T : null;
  } catch {
    return null;
  }
}

function mapSkillRow(row: SqliteRow): StoredSkillIndex {
  return {
    projectId: String(row.projectId),
    skillId: String(row.skillId),
    name: String(row.name),
    description: String(row.description),
    sourcePath: String(row.sourcePath),
    sourceKind: String(row.sourceKind ?? "managed"),
    sourceHash: String(row.sourceHash),
    metadataJson: String(row.metadataJson),
    updatedAt: String(row.updatedAt),
  };
}

function mapSkillRootRow(row: SqliteRow): StoredSkillRoot {
  return {
    projectId: String(row.projectId),
    rootPath: String(row.rootPath),
    sourceKind: String(row.sourceKind),
    updatedAt: String(row.updatedAt),
  };
}

function mapEnablementRow(row: SqliteRow): StoredSkillEnablement {
  return {
    projectId: String(row.projectId),
      changeId: decodeScopeChangeId(row.changeId),
    skillId: String(row.skillId),
    scope: row.scope === "topic" ? "topic" : "project",
    enabled: Number(row.enabled) === 1,
    updatedAt: String(row.updatedAt),
  };
}

function mapBridgeRow(row: SqliteRow): StoredBridgeSync {
  return {
    projectId: String(row.projectId),
    skillId: String(row.skillId),
    sourceHash: String(row.sourceHash),
    materializedPath: String(row.materializedPath),
    materializedHash: String(row.materializedHash),
    bridgeVersion: String(row.bridgeVersion),
    syncedAt: String(row.syncedAt),
  };
}

function mapDecisionRow(row: SqliteRow): StoredDecisionRecord {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    changeId: decodeScopeChangeId(row.changeId),
    decisionType: String(row.decisionType),
    status: normalizeDecisionStatus(row.status),
    label: String(row.label),
    summary: String(row.summary),
    targetId: nullableString(row.targetId),
    runId: nullableString(row.runId),
    artifact: nullableString(row.artifact),
    actionId: nullableString(row.actionId),
    feedback: nullableString(row.feedback),
    payloadJson: String(row.payloadJson),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    completedAt: nullableString(row.completedAt),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function encodeScopeChangeId(value: string | null): string {
  return value ?? "";
}

function decodeScopeChangeId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeDecisionStatus(value: unknown): StoredDecisionStatus {
  if (value === "accepted" || value === "requested-changes" || value === "dismissed" || value === "completed" || value === "failed") return value;
  return "pending";
}
