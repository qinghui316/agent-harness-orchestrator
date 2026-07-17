import Database from "better-sqlite3";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProviderCapabilitySnapshot } from "../../src/provider-runtime/index.js";
import { repoLocalMemory } from "../../src/memory/resolver.js";
import { openWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { WorkbenchDatabase } from "../../src/workbench/persistence/database.js";
import type { StoredTopicMessageWrite } from "../../src/workbench/persistence/contracts.js";

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
  it("rolls back Conversation creation when the initial canonical item fails", async () => {
    const database = await openWorkbenchDatabase(repoLocalMemory(root, projectId));
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

  it("rolls back interaction, attempt, and binding terminal state when the turn CAS fails", async () => {
    const database = await openWorkbenchDatabase(repoLocalMemory(root, projectId));
    try {
      database.conversations.createConversation(conversation("conversation-1"));
      database.providerAttempts.createProviderAttempt({
        projectId,
        conversationId: "conversation-1",
        attemptId: "attempt-1",
        graphScopeId: "graph-1",
        changeId: null,
        agentTaskId: null,
        roleId: "main-agent",
        operationProfile: "main",
        providerId: "codex",
        nativeSessionId: null,
        model: null,
        capabilitySnapshot: { providerId: "codex", effectiveModel: null } as unknown as ProviderCapabilitySnapshot,
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
      })).toThrow("completed-turn sequence changed concurrently");

      expect(database.providerAttempts.readProviderAttempt(projectId, "attempt-1")?.status).toBe("running");
      expect(database.interactions.readProviderUserInputRequest(projectId, "conversation-1", "request-key")?.status).toBe("pending");
      expect(database.providerAttempts.readConversationProviderBinding(projectId, "conversation-1", "codex")).toBeNull();
    } finally {
      database.close();
    }
  });

  it("rolls back provider selection, resume point, and binding when resume attempt creation fails", async () => {
    const database = await openWorkbenchDatabase(repoLocalMemory(root, projectId));
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

  it("runs external reset guards outside the exclusive SQLite transaction", async () => {
    const memory = repoLocalMemory(root, projectId);
    const initial = await openWorkbenchDatabase(memory);
    initial.close();
    const old = new Database(memory.workbenchDbPath);
    old.pragma("user_version = 2");
    old.close();

    let guardObservedTransaction: boolean | null = null;
    const rebuilt = await WorkbenchDatabase.open(memory, {
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

function providerAttempt(attemptId: string, providerId: string) {
  return {
    projectId,
    conversationId: "conversation-1",
    attemptId,
    graphScopeId: "graph-1",
    changeId: null,
    agentTaskId: null,
    roleId: "main-agent",
    operationProfile: "main",
    providerId,
    nativeSessionId: null,
    model: null,
    capabilitySnapshot: { providerId, effectiveModel: null } as unknown as ProviderCapabilitySnapshot,
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
