import Database from "better-sqlite3";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProviderCapabilitySnapshot } from "../../src/provider-runtime/index.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { WorkbenchDatabase } from "../../src/workbench/persistence/database.js";
import type { StoredTopicMessageWrite } from "../../src/workbench/persistence/contracts.js";
import { WORKBENCH_SCHEMA_VERSION } from "../../src/workbench/persistence/schema.js";

let root: string;
const projectId = "persistence-owner";
const now = "2026-07-17T00:00:00.000Z";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-persistence-owner-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Workbench persistence owners", () => {
  it.each([9, 10, 11])("migrates revision %i to 12 without losing Conversation continuity", async (revision) => {
    await createLegacyWorkbenchDatabase(revision);

    const database = await openProjectRuntimeWorkbenchDatabase(runtimePaths());
    try {
      expect(database.conversations.readConversation(projectId, "legacy-conversation")).toMatchObject({
        productMode: "harness",
        clientCreateRequestId: null,
        clientCreateRequestHash: null,
        title: "Legacy conversation",
      });
      expect(database.timeline.listConversationMessages(projectId, "legacy-conversation")).toEqual([
        expect.objectContaining({ id: "legacy-message", text: "Preserve this message." }),
      ]);
      expect(database.providerAttempts.readConversationProviderBinding(projectId, "legacy-conversation", "codex")).toMatchObject({
        nativeSessionId: "legacy-session",
        lastDeliveredCompletedTurn: 1,
      });
      expect(database.providerAttempts.readProviderAttempt(projectId, "legacy-attempt")).toMatchObject({
        productMode: "harness",
        effectiveSkillInputs: [],
        nativeSessionId: "legacy-session",
        status: "completed",
      });
    } finally {
      database.close();
    }

    const inspected = new Database(runtimePaths().workbenchDbPath);
    try {
      expect(Number(inspected.pragma("user_version", { simple: true }))).toBe(WORKBENCH_SCHEMA_VERSION);
      expect(inspected.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'composer_drafts'").get()).toBeTruthy();
      expect(() => inspected.prepare(`
        INSERT INTO conversations (
          project_id, conversation_id, product_mode, title, state, surface_kind,
          selected_provider_id, completed_turn_sequence, timeline_position, timeline_revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', 'user', 'codex', 0, 0, 0, ?, ?)
      `).run(projectId, "invalid-mode", "invalid", "Invalid", now, now)).toThrow();
      expect(() => inspected.prepare(`
        UPDATE conversations SET product_mode = 'agent'
        WHERE project_id = ? AND conversation_id = ?
      `).run(projectId, "legacy-conversation")).toThrow(/immutable/);
      expect(() => inspected.prepare(`
        INSERT INTO provider_attempts (
          project_id, conversation_id, attempt_id, product_mode, provider_id, role_id,
          operation_profile, capability_snapshot_json, effective_skill_inputs_json,
          handoff_hash, delivered_through_completed_turn, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'agent', 'codex', 'main-agent', 'main', '{}', '[]', '', 0, 'queued', ?, ?)
      `).run(projectId, "legacy-conversation", "wrong-mode-attempt", now, now)).toThrow(/must match Conversation/);
    } finally {
      inspected.close();
    }
  });

  it("updates a Conversation title only inside the exact project scope", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(runtimePaths());
    try {
      database.conversations.createConversation(conversation("conversation-1"));
      const updated = database.conversations.updateConversationTitle(projectId, "conversation-1", "Renamed", "2026-07-28T00:00:00.000Z");
      const monotonic = database.conversations.updateConversationTitle(projectId, "conversation-1", "Renamed again", "2026-07-28T00:00:00.000Z");

      expect(updated).toMatchObject({ projectId, conversationId: "conversation-1", title: "Renamed" });
      expect(monotonic.updatedAt).toBe("2026-07-28T00:00:00.001Z");
      expect(() => database.conversations.updateConversationTitle("other-project", "conversation-1", "Wrong", now)).toThrow("Conversation not found");
      expect(database.conversations.readConversation(projectId, "conversation-1")?.title).toBe("Renamed again");
    } finally {
      database.close();
    }
  });

  it("rolls back Conversation creation when the initial canonical item fails", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(runtimePaths());
    try {
      database.unitOfWork.createConversationWithInitialMessage(conversation("conversation-1"), message("shared-message", "conversation-1"));

      expect(() => database.unitOfWork.createConversationWithInitialMessage(
        conversation("conversation-2"),
        message("shared-message", "conversation-2"),
      )).toThrow();

      expect(database.conversations.readConversation(projectId, "conversation-2")).toBeNull();
      expect(database.timeline.listConversationMessages(projectId, "conversation-2")).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("rolls back the entire first-send transaction including Skill overrides and draft deletion", async () => {
    const paths = runtimePaths();
    const initialized = await openProjectRuntimeWorkbenchDatabase(paths);
    initialized.close();
    const raw = new Database(paths.workbenchDbPath);
    raw.prepare(`
      INSERT INTO composer_drafts (
        project_id, product_mode, text, context_refs_json, attachment_ids_json,
        skill_overrides_json, selected_provider_id, updated_at
      ) VALUES (?, 'harness', 'draft', '[]', '[]', '[]', 'codex', ?)
    `).run(projectId, now);
    raw.close();

    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.unitOfWork.createConversationWithInitialMessage(
        conversation("conversation-1"),
        message("shared-message", "conversation-1"),
      );
      expect(() => database.unitOfWork.createConversationFromFirstSend({
        conversation: {
          ...conversation("conversation-2"),
          clientCreateRequestId: "rollback-first-send",
          clientCreateRequestHash: "rollback-hash",
        },
        message: message("shared-message", "conversation-2"),
        skillOverrides: [{ skillId: "must-not-persist", enabled: true }],
      })).toThrow();

      expect(database.conversations.readConversation(projectId, "conversation-2")).toBeNull();
      expect(database.timeline.listConversationMessages(projectId, "conversation-2")).toEqual([]);
      expect(database.skills.listSkillEnablement(projectId)).not.toContainEqual(expect.objectContaining({
        skillId: "must-not-persist",
      }));
    } finally {
      database.close();
    }

    const inspected = new Database(paths.workbenchDbPath, { readonly: true });
    try {
      expect(inspected.prepare(`
        SELECT text FROM composer_drafts WHERE project_id = ? AND product_mode = 'harness'
      `).get(projectId)).toMatchObject({ text: "draft" });
    } finally {
      inspected.close();
    }
  });

  it("rolls back interaction, attempt, and binding terminal state when the turn CAS fails", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(runtimePaths());
    try {
      database.conversations.createConversation(conversation("conversation-1"));
      database.providerAttempts.createProviderAttempt({
        projectId,
        conversationId: "conversation-1",
        attemptId: "attempt-1",
        productMode: "harness",
        graphScopeId: "graph-1",
        changeId: null,
        agentTaskId: null,
        roleId: "main-agent",
        operationProfile: "main",
        providerId: "codex",
        nativeSessionId: null,
        model: null,
        capabilitySnapshot: { providerId: "codex", effectiveModel: null } as unknown as ProviderCapabilitySnapshot,
        effectiveSkillInputs: [],
        handoffHash: "handoff-1",
        deliveredThroughCompletedTurn: 0,
        worktreeId: null,
        status: "running",
        createdAt: now,
        updatedAt: now,
      });
      database.timeline.appendMessage({
        ...message("request-1", "conversation-1"),
        runId: "run-1",
        status: "pending",
        rawJson: JSON.stringify({
          graphScopeId: "graph-1",
          providerUserInput: { requestKey: "request-key", runId: "run-1", status: "pending" },
        }),
      });

      expect(() => database.unitOfWork.commitProviderTurnTerminal({
        projectId,
        conversationId: "conversation-1",
        runId: "run-1",
        mainAttemptId: "attempt-1",
        expectedGraphScopeId: "graph-1",
        mainStatus: "completed",
        mainNativeSessionId: "thread-1",
        childAttempts: [],
        expectedCompletedTurnSequence: 9,
        advanceCompletedTurn: true,
        binding: {
          projectId,
          conversationId: "conversation-1",
          providerId: "codex",
          nativeSessionId: "thread-1",
          preferredModel: null,
          lastUsedAt: now,
          bindingStatus: "ready",
        },
        updatedAt: now,
        timelineMessages: [{ ...message("terminal-row", "conversation-1"), type: "assistant.message", status: "completed" }],
      })).toThrow("completed-turn sequence changed concurrently");

      expect(database.providerAttempts.readProviderAttempt(projectId, "attempt-1")?.status).toBe("running");
      expect(database.interactions.readProviderUserInputRequest(projectId, "conversation-1", "request-key")?.status).toBe("pending");
      expect(database.providerAttempts.readConversationProviderBinding(projectId, "conversation-1", "codex")).toBeNull();
      expect(database.timeline.readMessage(projectId, "conversation-1", "terminal-row")).toBeNull();
    } finally {
      database.close();
    }
  });

  it("rolls back provider selection, resume point, and binding when resume attempt creation fails", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(runtimePaths());
    try {
      database.conversations.createConversation({ ...conversation("conversation-1"), selectedProviderId: "alpha" });
      const duplicateAttempt = providerAttempt("resume-attempt", "beta");
      database.providerAttempts.createProviderAttempt(duplicateAttempt);

      expect(() => database.unitOfWork.commitConversationProviderSwitch({
        projectId,
        conversationId: "conversation-1",
        resumePointId: "resume-point-1",
        graphScopeId: "graph-1",
        changeId: null,
        previousProviderId: "alpha",
        targetProviderId: "beta",
        snapshotJson: "{}",
        snapshotHash: "snapshot-1",
        createdAt: now,
      }, {
        projectId,
        conversationId: "conversation-1",
        providerId: "beta",
        nativeSessionId: null,
        lastDeliveredCompletedTurn: 0,
        preferredModel: null,
        lastUsedAt: now,
        bindingStatus: "ready",
      }, "alpha", duplicateAttempt)).toThrow();

      expect(database.conversations.readConversation(projectId, "conversation-1")?.selectedProviderId).toBe("alpha");
      expect(database.providerAttempts.readLatestProviderResumePoint(projectId, "conversation-1")).toBeNull();
      expect(database.providerAttempts.readConversationProviderBinding(projectId, "conversation-1", "beta")).toBeNull();
    } finally {
      database.close();
    }
  });

  it("returns revisioned rows when a graph scope supersedes an interaction and moves its run", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(runtimePaths());
    try {
      database.conversations.createConversation(conversation("conversation-1"));
      database.timeline.appendMessage({
        ...message("request-1", "conversation-1"),
        runId: "run-1",
        status: "pending",
        rawJson: JSON.stringify({
          graphScopeId: "graph-1",
          providerUserInput: { requestKey: "request-key", runId: "run-1", status: "pending" },
        }),
      });
      database.providerAttempts.createProviderAttempt(providerAttempt("attempt-main", "codex"));
      database.providerAttempts.bindProviderAttemptThread(projectId, {
        attemptId: "attempt-main",
        threadId: "thread-main",
        parentThreadId: null,
        parentAgentSurfaceId: null,
      }, now);
      database.providerAttempts.createProviderAttempt({
        ...providerAttempt("attempt-plan", "codex"),
        roleId: "planning-agent",
        operationProfile: "planning",
      });
      database.providerAttempts.bindProviderAttemptThread(projectId, {
        attemptId: "attempt-plan",
        threadId: "thread-plan",
        parentThreadId: "thread-main",
      }, now);

      const rows = database.unitOfWork.moveConversationRunToGraphScope(
        projectId,
        "conversation-1",
        "run-1",
        {
          mainAttemptId: "attempt-main",
          plannerThreadId: "thread-plan",
          previousGraphScopeId: "graph-1",
          graphScopeId: "graph-2",
        },
        now,
      );

      expect(rows.map((row) => [row.id, row.revision])).toEqual([
        ["request-1", 2],
        ["request-1", 3],
      ]);
      const stored = database.timeline.readMessage(projectId, "conversation-1", "request-1");
      expect(stored).toMatchObject({ revision: 3, status: "superseded" });
      expect(JSON.parse(stored!.rawJson)).toMatchObject({
        graphScopeId: "graph-2",
        providerUserInput: { status: "superseded" },
      });
    } finally {
      database.close();
    }
  });

  it("rejects a terminal callback after the Conversation advances to another graph", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(runtimePaths());
    try {
      database.conversations.createConversation(conversation("conversation-1"));
      database.providerAttempts.createProviderAttempt({
        projectId,
        conversationId: "conversation-1",
        attemptId: "attempt-graph-a",
        graphScopeId: "graph-1",
        changeId: null,
        agentTaskId: null,
        roleId: "main-agent",
        operationProfile: "main",
        providerId: "codex",
        nativeSessionId: "thread-graph-a",
        model: null,
        capabilitySnapshot: { providerId: "codex", effectiveModel: null } as unknown as ProviderCapabilitySnapshot,
        handoffHash: "handoff-graph-a",
        deliveredThroughCompletedTurn: 0,
        worktreeId: null,
        status: "running",
        createdAt: now,
        updatedAt: now,
      });
      database.unitOfWork.startConversationGraphScope(
        projectId,
        "conversation-1",
        "graph-2",
        "2026-07-17T00:00:01.000Z",
      );
      const completedTurnSequence = database.conversations.readConversation(
        projectId,
        "conversation-1",
      )?.completedTurnSequence;

      expect(() => database.unitOfWork.commitProviderTurnTerminal({
        projectId,
        conversationId: "conversation-1",
        runId: "run-graph-a",
        mainAttemptId: "attempt-graph-a",
        expectedGraphScopeId: "graph-1",
        mainStatus: "completed",
        mainNativeSessionId: "thread-graph-a",
        childAttempts: [],
        expectedCompletedTurnSequence: completedTurnSequence ?? 0,
        advanceCompletedTurn: true,
        binding: {
          projectId,
          conversationId: "conversation-1",
          providerId: "codex",
          nativeSessionId: "thread-graph-a",
          preferredModel: null,
          lastUsedAt: now,
          bindingStatus: "ready",
        },
        updatedAt: "2026-07-17T00:00:02.000Z",
        timelineMessages: [{
          ...message("stale-terminal-row", "conversation-1"),
          type: "assistant.message",
          status: "completed",
        }],
      })).toThrow("Provider terminal callback no longer owns the current conversation graph");

      expect(database.timeline.readMessage(projectId, "conversation-1", "stale-terminal-row")).toBeNull();
      expect(database.providerAttempts.readProviderAttempt(projectId, "attempt-graph-a")?.status).toBe("running");
      expect(database.providerAttempts.readConversationProviderBinding(projectId, "conversation-1", "codex")).toBeNull();
      expect(database.conversations.readConversation(projectId, "conversation-1")).toMatchObject({
        currentGraphScopeId: "graph-2",
        completedTurnSequence,
      });
    } finally {
      database.close();
    }
  });

  it("rejects a Planning commit whose expected graph scope is stale", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(runtimePaths());
    try {
      database.conversations.createConversation(conversation("conversation-1"));
      database.unitOfWork.startConversationGraphScope(
        projectId,
        "conversation-1",
        "graph-2",
        "2026-07-17T00:00:01.000Z",
      );

      expect(() => database.unitOfWork.acceptConversationChangeBinding(
        projectId,
        "conversation-1",
        "stale-change",
        "2026-07-17T00:00:02.000Z",
        "stale-acceptance",
        "proposal-hash",
        undefined,
        "graph-1",
      )).toThrow(/no longer matches the current conversation graph scope/);

      expect(database.conversations.readConversation(projectId, "conversation-1")).toMatchObject({
        boundChangeId: null,
        currentGraphScopeId: "graph-2",
      });
      expect(database.conversations.hasPlanningAcceptanceCommit("stale-acceptance")).toBe(false);
    } finally {
      database.close();
    }
  });

  it("rejects a Planning commit after its expected Main attempt becomes terminal", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(runtimePaths());
    try {
      database.conversations.createConversation(conversation("conversation-1"));
      database.providerAttempts.createProviderAttempt({
        projectId,
        conversationId: "conversation-1",
        attemptId: "stale-main-attempt",
        graphScopeId: "graph-1",
        changeId: null,
        agentTaskId: null,
        roleId: "main-agent",
        operationProfile: "main",
        providerId: "codex",
        nativeSessionId: "thread-stale-main",
        model: null,
        capabilitySnapshot: { providerId: "codex", effectiveModel: null } as unknown as ProviderCapabilitySnapshot,
        handoffHash: "handoff-stale-main",
        deliveredThroughCompletedTurn: 0,
        worktreeId: null,
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });

      expect(() => database.unitOfWork.acceptConversationChangeBinding(
        projectId,
        "conversation-1",
        "stale-change",
        "2026-07-17T00:00:02.000Z",
        "stale-attempt-acceptance",
        "proposal-hash",
        undefined,
        "graph-1",
        "stale-main-attempt",
      )).toThrow("Planning acceptance Main attempt no longer owns the current conversation graph");

      expect(database.conversations.readConversation(projectId, "conversation-1")?.boundChangeId).toBeNull();
      expect(database.conversations.hasPlanningAcceptanceCommit("stale-attempt-acceptance")).toBe(false);
    } finally {
      database.close();
    }
  });

  it("runs external reset guards outside the exclusive SQLite transaction", async () => {
    const paths = runtimePaths();
    const initial = await openProjectRuntimeWorkbenchDatabase(paths);
    initial.close();
    const old = new Database(paths.workbenchDbPath);
    old.pragma("user_version = 2");
    old.close();

    let guardObservedTransaction: boolean | null = null;
    const rebuilt = await WorkbenchDatabase.open(paths, {
      assertSafe: async (connection) => {
        guardObservedTransaction = connection.inTransaction;
      },
    });
    rebuilt.close();
    expect(guardObservedTransaction).toBe(false);
  });

  it("keeps connection creation and high-level dependencies out of repositories", async () => {
    const workbenchRoot = join(process.cwd(), "src", "workbench");
    const persistenceRoot = join(workbenchRoot, "persistence");
    const repositoryRoot = join(persistenceRoot, "repositories");
    const repositoryFiles = (await readdir(repositoryRoot)).filter((file) => file.endsWith(".ts"));
    const repositorySources = await Promise.all(repositoryFiles.map((file) => readFile(join(repositoryRoot, file), "utf8")));
    const forbidden = /new Database|chat\.js|canonical-timeline\.js|project-live-events|provider-live-events|projections\/|provider-runtime\/registry|workflow-runtime/;
    expect(repositorySources.every((source) => !forbidden.test(source))).toBe(true);

    const unitOfWorkSource = await readFile(join(persistenceRoot, "unit-of-work.ts"), "utf8");
    expect(unitOfWorkSource).not.toMatch(/\.prepare\(|JSON\.parse|providerUserInput|clarification/);

    const persistenceFiles = await collectTypeScriptFiles(workbenchRoot);
    const creators = [];
    for (const file of persistenceFiles) {
      if ((await readFile(file, "utf8")).includes("new Database(")) creators.push(file);
    }
    expect(creators.map((file) => file.replaceAll("\\", "/"))).toEqual([
      expect.stringMatching(/src\/workbench\/persistence\/database\.ts$/),
    ]);
  });
});

function runtimePaths() {
  return resolveProjectRuntimePaths(projectId, root);
}

function providerAttempt(attemptId: string, providerId: string) {
  return {
    projectId,
    conversationId: "conversation-1",
    attemptId,
    productMode: "harness",
    graphScopeId: "graph-1",
    changeId: null,
    agentTaskId: null,
    roleId: "main-agent",
    operationProfile: "main",
    providerId,
    nativeSessionId: null,
    model: null,
    capabilitySnapshot: { providerId, effectiveModel: null } as unknown as ProviderCapabilitySnapshot,
    effectiveSkillInputs: [],
    handoffHash: `handoff-${attemptId}`,
    deliveredThroughCompletedTurn: 0,
    worktreeId: null,
    status: "queued" as const,
    createdAt: now,
    updatedAt: now,
  };
}

function conversation(conversationId: string) {
  return {
    projectId,
    conversationId,
    productMode: "harness" as const,
    clientCreateRequestId: null,
    clientCreateRequestHash: null,
    title: conversationId,
    state: "active" as const,
    boundChangeId: null,
    currentGraphScopeId: "graph-1",
    selectedProviderId: "codex",
    completedTurnSequence: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function message(id: string, conversationId: string): StoredTopicMessageWrite {
  return {
    id,
    projectId,
    conversationId,
    changeId: "",
    agentSurfaceId: "main-agent",
    type: "user.message",
    timestamp: now,
    text: id,
    actionRunId: null,
    actionType: null,
    status: null,
    runId: null,
    providerId: null,
    threadId: null,
    turnId: null,
    itemId: null,
    artifact: null,
    error: null,
    rawJson: "{}",
  };
}

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTypeScriptFiles(path));
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files.sort();
}

async function createLegacyWorkbenchDatabase(revision: 9 | 10 | 11): Promise<void> {
  const paths = runtimePaths();
  await mkdir(paths.workbenchRoot, { recursive: true });
  const database = new Database(paths.workbenchDbPath);
  try {
    database.exec(`
      CREATE TABLE conversations (
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        title TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'active',
        surface_kind TEXT NOT NULL DEFAULT 'user',
        bound_change_id TEXT,
        current_graph_scope_id TEXT,
        selected_provider_id TEXT NOT NULL,
        completed_turn_sequence INTEGER NOT NULL DEFAULT 0,
        timeline_position INTEGER NOT NULL DEFAULT 0,
        timeline_revision INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        PRIMARY KEY(project_id, conversation_id)
      );
      CREATE TABLE canonical_timeline_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL DEFAULT '',
        change_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        agent_surface_id TEXT NOT NULL,
        initial_thread_input INTEGER NOT NULL DEFAULT 0,
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
      CREATE TABLE conversation_provider_bindings (
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
      CREATE TABLE provider_attempts (
        project_id TEXT NOT NULL,
        conversation_id TEXT,
        attempt_id TEXT NOT NULL,
        graph_scope_id TEXT,
        provider_id TEXT NOT NULL,
        change_id TEXT,
        agent_task_id TEXT,
        role_id TEXT NOT NULL,
        parent_agent_surface_id TEXT,
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
      INSERT INTO conversations VALUES (
        '${projectId}', 'legacy-conversation', 'Legacy conversation', 'active', 'user',
        NULL, 'legacy-graph', 'codex', 1, 1, 1, '${now}', '${now}', NULL
      );
      INSERT INTO canonical_timeline_items VALUES (
        'legacy-message', '${projectId}', 'legacy-conversation', '', 1, 1,
        'main-agent', 0, 'user.message', '${now}', 'Preserve this message.',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'
      );
      INSERT INTO conversation_provider_bindings VALUES (
        '${projectId}', 'legacy-conversation', 'codex', 'legacy-session', 1,
        NULL, '${now}', 'ready'
      );
      INSERT INTO provider_attempts VALUES (
        '${projectId}', 'legacy-conversation', 'legacy-attempt', 'legacy-graph', 'codex',
        NULL, NULL, 'main-agent', NULL, 'main', 'legacy-session', NULL,
        '{"providerId":"codex","productMode":"harness"}', '', 1, NULL,
        'completed', '${now}', '${now}'
      );
    `);
    database.pragma(`user_version = ${revision}`);
  } finally {
    database.close();
  }
}
