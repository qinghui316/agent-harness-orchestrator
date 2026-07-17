import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { repoLocalMemory } from "../../src/memory/resolver.js";
import type { ProviderCapabilitySnapshot } from "../../src/provider-runtime/index.js";
import { bindProviderAttemptThread, finishProviderAttempt, startProviderAttempt } from "../../src/workbench/provider-attempts.js";
import { WorkbenchStore } from "../../src/workbench/store.js";

let root: string;
const projectId = "provider-thread-owner";
const capabilities = { providerId: "codex", effectiveModel: null } as unknown as ProviderCapabilitySnapshot;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-attempt-thread-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("ProviderAttempt-owned thread binding", () => {
  it("uses schema 8 and binds idempotently from attempt-owned facts", async () => {
    const memory = repoLocalMemory(root, projectId);
    await seedConversation(memory);
    await startAttempt(memory, "attempt-1");

    const first = await bindProviderAttemptThread(memory, {
      attemptId: "attempt-1",
      threadId: "thread-1",
      displayName: "Coder",
    });
    const second = await bindProviderAttemptThread(memory, {
      attemptId: "attempt-1",
      threadId: "thread-1",
    });

    expect(first).toMatchObject({
      projectId,
      conversationId: "conversation-1",
      attemptId: "attempt-1",
      providerId: "codex",
      providerThreadId: "thread-1",
      roleId: "coder-agent",
      changeId: "change-1",
      graphScopeId: "graph-1",
      runId: "attempt-1",
    });
    expect(second.displayName).toBe("Coder");
    const store = await WorkbenchStore.open(memory);
    try {
      expect(store.listProviderThreads(projectId, "conversation-1")).toHaveLength(1);
      expect(store.listProviderAttempts(projectId, "conversation-1")[0]?.nativeSessionId).toBe("thread-1");
    } finally {
      store.close();
    }
    const db = new Database(memory.workbenchDbPath, { readonly: true });
    expect(db.pragma("user_version", { simple: true })).toBe(8);
    expect(db.prepare("PRAGMA table_info(provider_thread_links)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "attempt_id", notnull: 1 }),
    ]));
    db.close();
  });

  it("fails closed when one attempt changes threads or thread lineage changes", async () => {
    const memory = repoLocalMemory(root, projectId);
    await seedConversation(memory);
    await startAttempt(memory, "attempt-1");
    await bindProviderAttemptThread(memory, { attemptId: "attempt-1", threadId: "thread-1", parentThreadId: "parent-1" });

    await expect(bindProviderAttemptThread(memory, { attemptId: "attempt-1", threadId: "thread-2", parentThreadId: "parent-1" }))
      .rejects.toThrow("already bound to another thread");
    await startAttempt(memory, "attempt-2");
    await expect(bindProviderAttemptThread(memory, { attemptId: "attempt-2", threadId: "thread-1", parentThreadId: "parent-2" }))
      .rejects.toThrow("different lineage");
  });

  it("resumes the same provider thread by transferring ownership to the new attempt", async () => {
    const memory = repoLocalMemory(root, projectId);
    await seedConversation(memory);
    await startAttempt(memory, "attempt-1");
    await bindProviderAttemptThread(memory, { attemptId: "attempt-1", threadId: "thread-1", parentThreadId: "parent-1" });
    await startAttempt(memory, "attempt-2");

    const resumed = await bindProviderAttemptThread(memory, {
      attemptId: "attempt-2",
      threadId: "thread-1",
      parentThreadId: "parent-1",
      displayName: "Resumed coder",
    });

    expect(resumed).toMatchObject({ attemptId: "attempt-2", providerThreadId: "thread-1", displayName: "Resumed coder", runId: "attempt-2" });
    await finishProviderAttempt(memory, "attempt-2", "completed", "thread-1");
    const store = await WorkbenchStore.open(memory);
    try {
      expect(store.listProviderThreads(projectId, "conversation-1")).toHaveLength(1);
      expect(store.listProviderThreads(projectId, "conversation-1")[0]?.parentThreadId).toBe("parent-1");
      expect(store.listProviderAttempts(projectId, "conversation-1").find((attempt) => attempt.attemptId === "attempt-2")).toMatchObject({
        nativeSessionId: "thread-1",
        status: "completed",
      });
    } finally {
      store.close();
    }
  });

  it("uses the terminal native session as a fallback binding", async () => {
    const memory = repoLocalMemory(root, projectId);
    await seedConversation(memory);
    await startAttempt(memory, "attempt-terminal");

    await finishProviderAttempt(memory, "attempt-terminal", "completed", "thread-terminal", {
      parentThreadId: "parent-terminal",
      displayName: "Terminal coder",
    });

    const store = await WorkbenchStore.open(memory);
    try {
      expect(store.listProviderThreads(projectId, "conversation-1")).toEqual([
        expect.objectContaining({ attemptId: "attempt-terminal", providerThreadId: "thread-terminal", parentThreadId: "parent-terminal" }),
      ]);
      expect(store.listProviderAttempts(projectId, "conversation-1")[0]).toMatchObject({ status: "completed", nativeSessionId: "thread-terminal" });
    } finally {
      store.close();
    }
  });

  it("keeps non-conversation provider attempts out of Agent surfaces", async () => {
    const memory = repoLocalMemory(root, projectId);
    await startProviderAttempt(memory, {
      attemptId: "attempt-cli",
      providerId: "codex",
      capabilitySnapshot: capabilities,
      operationProfile: "auditor",
      roleId: "auditor-agent",
      handoffHash: "handoff-cli",
      changeId: "change-cli",
    });

    await expect(bindProviderAttemptThread(memory, {
      attemptId: "attempt-cli",
      threadId: "thread-cli",
    })).resolves.toBeNull();
    await finishProviderAttempt(memory, "attempt-cli", "completed", "thread-cli");

    const store = await WorkbenchStore.open(memory);
    try {
      expect(store.readProviderAttempt(projectId, "attempt-cli")).toMatchObject({
        conversationId: null,
        graphScopeId: null,
        nativeSessionId: "thread-cli",
        status: "completed",
      });
      expect(store.listProviderThreads(projectId, "conversation-cli")).toEqual([]);
    } finally {
      store.close();
    }
  });
});

async function seedConversation(memory: ReturnType<typeof repoLocalMemory>): Promise<void> {
  const store = await WorkbenchStore.open(memory);
  try {
    const now = new Date().toISOString();
    store.createConversation({
      projectId,
      conversationId: "conversation-1",
      title: "Provider thread owner",
      state: "active",
      boundChangeId: "change-1",
      currentGraphScopeId: "graph-1",
      selectedProviderId: "codex",
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  } finally {
    store.close();
  }
}

async function startAttempt(memory: ReturnType<typeof repoLocalMemory>, attemptId: string): Promise<void> {
  await startProviderAttempt(memory, {
    attemptId,
    providerId: "codex",
    capabilitySnapshot: capabilities,
    operationProfile: "coder",
    roleId: "coder-agent",
    handoffHash: `handoff-${attemptId}`,
    conversationId: "conversation-1",
    changeId: "change-1",
    graphScopeId: "graph-1",
  });
}
