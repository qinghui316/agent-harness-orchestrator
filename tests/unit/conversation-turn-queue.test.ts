import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createTopicAttachment } from "../../src/workbench/attachments.js";
import { ConversationTurnQueueOwner } from "../../src/workbench/conversation-turn-queue.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";

const projectId = "conversation-turn-queue-project";
const conversationId = "conversation-agent";
const now = "2026-08-28T00:00:00.000Z";
let root: string;
let previousAhoHome: string | undefined;
let paths: ProjectRuntimePaths;
let project: ManagedProject;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-conversation-turn-queue-"));
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, ".aho-home");
  const projectRoot = join(root, "project");
  await mkdir(projectRoot, { recursive: true });
  paths = resolveProjectRuntimePaths(projectId, process.env.AHO_HOME);
  project = {
    id: projectId,
    name: "Conversation Turn Queue",
    path: projectRoot,
    addedAt: now,
    lastSeenAt: now,
  };
  await seedConversation("agent");
});

afterEach(async () => {
  if (previousAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = previousAhoHome;
  await rm(root, { recursive: true, force: true });
});

describe("ConversationTurnQueueOwner", () => {
  it("atomically captures a full Agent draft, clears sendable fields, and replays the exact enqueue", async () => {
    const owner = createOwner();
    const initial = await owner.read(project, "agent", conversationId);
    const request = queueRequest(initial.revision, initial.executionRevision!);

    const queued = await owner.enqueue(project, request);
    expect(queued.items).toEqual([
      expect.objectContaining({
        position: 1,
        status: "queued",
        text: "queued follow-up",
        contextRefs: [{ relativePath: "src/app.ts", name: "app.ts", kind: "file", source: "composer" }],
        attachmentIds: ["attachment-1"],
        skillOverrides: { reviewer: true },
        providerId: "codex",
        agentTurnMode: "plan",
        modelId: "gpt-test",
        reasoningEffort: "high",
      }),
    ]);
    expect(queued.revision).toBe("queue:1");

    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(database.drafts.readDraft(projectId, "agent")).toMatchObject({
        text: "",
        contextRefsJson: "[]",
        attachmentIdsJson: "[]",
        skillOverridesJson: "{}",
        agentTurnMode: "plan",
        agentModelId: "gpt-test",
        agentReasoningEffort: "high",
        selectedProviderId: "codex",
      });
      expect(database.timeline.listConversationMessages(projectId, conversationId)).toEqual([]);
      expect(database.providerAttempts.listProviderAttempts(projectId, conversationId)).toEqual([]);
    } finally {
      database.close();
    }

    await expect(owner.enqueue(project, request)).resolves.toMatchObject({ revision: "queue:1" });
    await expect(owner.enqueue(project, { ...request, text: "different content" }))
      .rejects.toMatchObject({ name: "Conflict" });
    await expect(owner.enqueue(project, { ...request, projectId: "other-project" }))
      .rejects.toMatchObject({ name: "Conflict" });
    await expect(owner.enqueue(project, { ...request, expectedExecutionRevision: "execution:forged" }))
      .rejects.toMatchObject({ name: "Conflict" });
  });

  it("enforces queue mode isolation on persisted updates as well as inserts", async () => {
    const owner = createOwner();
    const initial = await owner.read(project, "agent", conversationId);
    const queued = await owner.enqueue(project, queueRequest(initial.revision, initial.executionRevision!));
    const connection = new Database(paths.workbenchDbPath);
    try {
      expect(() => connection.prepare(`
        UPDATE conversation_turn_queue_items SET agent_turn_mode = NULL
        WHERE project_id = ? AND queue_item_id = ?
      `).run(projectId, queued.items[0]!.queueItemId)).toThrow(/must match product_mode/);
      expect(() => connection.prepare(`
        UPDATE conversation_turn_queues SET product_mode = 'harness'
        WHERE project_id = ? AND conversation_id = ?
      `).run(projectId, conversationId)).toThrow(/must match active Conversation/);
    } finally {
      connection.close();
    }
  });

  it("reclaims only into an unchanged empty draft and restores the complete queued input", async () => {
    const owner = createOwner();
    const initial = await owner.read(project, "agent", conversationId);
    const queued = await owner.enqueue(project, queueRequest(initial.revision, initial.executionRevision!));
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    const draftToken = database.drafts.readDraft(projectId, "agent")!.updatedAt;
    database.close();

    const reclaimed = await owner.reclaim(
      project,
      "agent",
      conversationId,
      queued.items[0]!.queueItemId,
      queued.revision,
      draftToken,
    );
    expect(reclaimed.items).toEqual([]);

    const restored = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(restored.drafts.readDraft(projectId, "agent")).toMatchObject({
        text: "queued follow-up",
        contextRefsJson: JSON.stringify([{ relativePath: "src/app.ts", name: "app.ts", kind: "file", source: "composer" }]),
        attachmentIdsJson: JSON.stringify(["attachment-1"]),
        skillOverridesJson: JSON.stringify({ reviewer: true }),
        agentTurnMode: "plan",
        agentModelId: "gpt-test",
        agentReasoningEffort: "high",
      });
    } finally {
      restored.close();
    }
  });

  it("rejects Agent settings in a Harness queue before persistence", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.conversations.createConversation({
        projectId,
        conversationId: "conversation-harness",
        productMode: "harness",
        agentTurnMode: null,
        agentModelId: null,
        agentReasoningEffort: null,
        title: "Harness",
        state: "active",
        boundChangeId: null,
        currentGraphScopeId: "graph-harness",
        selectedProviderId: "codex",
        completedTurnSequence: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    } finally {
      database.close();
    }
    const owner = createOwner();
    const snapshot = await owner.read(project, "harness", "conversation-harness");
    await expect(owner.enqueue(project, {
      ...queueRequest(snapshot.revision, snapshot.executionRevision!),
      conversationId: "conversation-harness",
      productMode: "harness",
    })).rejects.toMatchObject({ name: "Conflict" });
  });

  it("retries one explicit zero-side-effect dispatch failure and blocks the FIFO head after the second", async () => {
    const post = vi.fn()
      .mockRejectedValueOnce(namedError("Conflict", "first admission rejection"))
      .mockRejectedValueOnce(namedError("BadRequest", "second admission rejection"));
    const owner = createOwner(post);
    const initial = await owner.read(project, "agent", conversationId);
    const queued = await owner.enqueue(project, queueRequest(initial.revision, initial.executionRevision!));

    const settled = await owner.dispatchNext(project, "agent", conversationId, queued.revision);

    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(1, project, conversationId, expect.objectContaining({
      skillOverrides: [{ skillId: "reviewer", enabled: true }],
    }), undefined, expect.any(Object));
    expect(settled.items[0]).toMatchObject({ status: "blocked", retryCount: 1 });
    expect(settled.canDispatch).toBe(false);
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(database.skills.listSkillEnablement(projectId)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("deletes only attachments that no Draft, active queue item, or Canonical message references", async () => {
    const [draftAttachment, queuedAttachment, canonicalAttachment, orphanAttachment] = await Promise.all(
      ["draft", "queue", "canonical", "orphan"].map((name) => createTopicAttachment(project, {
        fileName: `${name}.txt`,
        mediaType: "text/plain",
        data: `data:text/plain;base64,${Buffer.from(name, "utf8").toString("base64")}`,
      }, { workbenchRoot: paths.workbenchRoot })),
    );
    const allIds = [draftAttachment.id, queuedAttachment.id, canonicalAttachment.id, orphanAttachment.id];
    const initial = await createOwner().read(project, "agent", conversationId);
    const draftToken = await replaceDraftAttachments(allIds);
    const owner = createOwner();
    const queued = await owner.enqueue(project, {
      ...queueRequest(initial.revision, initial.executionRevision!),
      expectedDraftUpdatedAt: draftToken,
      attachmentIds: allIds,
    });

    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      const clearedDraft = database.drafts.readDraft(projectId, "agent")!;
      database.drafts.upsertDraft({
        ...clearedDraft,
        attachmentIdsJson: JSON.stringify([draftAttachment.id]),
        updatedAt: "2026-08-28T00:00:01.000Z",
      }, clearedDraft.updatedAt);
      const queue = database.conversationTurnQueues.readQueue(projectId, conversationId)!;
      const first = database.conversationTurnQueues.readItem(projectId, conversationId, queued.items[0]!.queueItemId)!;
      database.transaction(() => {
        database.conversationTurnQueues.insertItem({
          ...first,
          queueItemId: "queued-turn-attachment-reference",
          clientRequestId: "queue-attachment-reference",
          requestHash: "queue-attachment-reference-hash",
          dispatchRequestId: "queue-attachment-reference-dispatch",
          position: 2,
          attachmentIdsJson: JSON.stringify([queuedAttachment.id]),
        });
        database.conversationTurnQueues.advanceRevision(projectId, conversationId, queue.revision, now);
        database.timeline.appendMessage({
          ...canonicalQueueMessage("canonical-attachment", "canonical-attachment"),
          id: "canonical-attachment-reference",
          rawJson: JSON.stringify({ attachments: [{ id: canonicalAttachment.id }] }),
        });
      });
    } finally {
      database.close();
    }

    const current = await owner.read(project, "agent", conversationId);
    await owner.remove(project, "agent", conversationId, current.items[0]!.queueItemId, current.revision);

    for (const attachment of [draftAttachment, queuedAttachment, canonicalAttachment]) {
      expect(existsSync(join(paths.workbenchRoot, "attachments", attachment.id, "attachment.json"))).toBe(true);
    }
    expect(existsSync(join(paths.workbenchRoot, "attachments", orphanAttachment.id))).toBe(false);
  });

  it("keeps an uncertain dispatch claimed and never retries it", async () => {
    const post = vi.fn().mockRejectedValue(new Error("transport disconnected after write"));
    const owner = createOwner(post);
    const initial = await owner.read(project, "agent", conversationId);
    const queued = await owner.enqueue(project, queueRequest(initial.revision, initial.executionRevision!));

    await expect(owner.dispatchNext(project, "agent", conversationId, queued.revision))
      .rejects.toMatchObject({ name: "ConversationTurnQueueDispatchUncertain" });

    expect(post).toHaveBeenCalledTimes(1);
    await expect(owner.read(project, "agent", conversationId)).resolves.toMatchObject({
      items: [expect.objectContaining({ status: "dispatching", retryCount: 0 })],
      canDispatch: false,
    });
  });

  it("settles a restart-time dispatch only when exact canonical evidence exists", async () => {
    const owner = createOwner();
    const initial = await owner.read(project, "agent", conversationId);
    const queued = await owner.enqueue(project, queueRequest(initial.revision, initial.executionRevision!));
    const queueItemId = queued.items[0]!.queueItemId;
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      const queue = database.conversationTurnQueues.readQueue(projectId, conversationId)!;
      const item = database.conversationTurnQueues.readItem(projectId, conversationId, queueItemId)!;
      database.transaction(() => {
        database.conversationTurnQueues.transitionItem({
          projectId, conversationId, queueItemId,
          expectedStatus: "queued", status: "dispatching", updatedAt: now,
        });
        database.conversationTurnQueues.advanceRevision(projectId, conversationId, queue.revision, now);
        database.timeline.appendMessage(canonicalQueueMessage(item.dispatchRequestId, item.requestHash));
      });
    } finally {
      database.close();
    }

    await expect(owner.reconcileProject(paths)).resolves.toBe(1);
    const verified = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      expect(verified.conversationTurnQueues.readItem(projectId, conversationId, queueItemId))
        .toMatchObject({ status: "dispatched" });
    } finally {
      verified.close();
    }
  });

  it("cancels queued and blocked items when the Conversation is archived", async () => {
    const owner = createOwner();
    const initial = await owner.read(project, "agent", conversationId);
    const queued = await owner.enqueue(project, queueRequest(initial.revision, initial.executionRevision!));
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.conversations.setConversationState(projectId, conversationId, "archive", now);
      expect(database.conversationTurnQueues.readItem(projectId, conversationId, queued.items[0]!.queueItemId))
        .toMatchObject({ status: "cancelled" });
      expect(database.conversationTurnQueues.readQueue(projectId, conversationId)?.revision).toBe(2);
    } finally {
      database.close();
    }
  });

  it("keeps the FIFO head waiting while a Conversation interaction needs the user", async () => {
    const owner = createOwner();
    const initial = await owner.read(project, "agent", conversationId);
    await owner.enqueue(project, queueRequest(initial.revision, initial.executionRevision!));
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.timeline.appendMessage({
        ...canonicalQueueMessage("not-a-dispatch", "not-a-dispatch"),
        id: "clarification-pending",
        type: "clarification.request",
        rawJson: JSON.stringify({ clarification: { id: "clarification-1", status: "pending" } }),
      });
    } finally {
      database.close();
    }

    await expect(owner.read(project, "agent", conversationId)).resolves.toMatchObject({
      canDispatch: false,
      items: [expect.objectContaining({ status: "queued" })],
    });
  });

  it("keeps the Harness FIFO head waiting for pending governance decisions", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      database.conversations.createConversation({
        projectId,
        conversationId: "conversation-harness-governance",
        productMode: "harness",
        agentTurnMode: null,
        agentModelId: null,
        agentReasoningEffort: null,
        title: "Harness governance",
        state: "active",
        boundChangeId: "change-governance",
        currentGraphScopeId: "graph-harness-governance",
        selectedProviderId: "codex",
        completedTurnSequence: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      database.drafts.upsertDraft({
        projectId,
        productMode: "harness",
        agentTurnMode: null,
        agentModelId: null,
        agentReasoningEffort: null,
        text: "queued harness feedback",
        contextRefsJson: "[]",
        attachmentIdsJson: "[]",
        skillOverridesJson: "{}",
        selectedProviderId: "codex",
        updatedAt: now,
      }, null);
      database.decisions.upsertDecision({
        id: "decision-governance",
        projectId,
        changeId: "change-governance",
        decisionType: "workpad.confirmation",
        status: "pending",
        label: "Confirm",
        summary: "Awaiting user decision.",
        targetId: "change-governance",
        runId: null,
        artifact: null,
        actionId: null,
        feedback: null,
        payloadJson: "{}",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      });
    } finally {
      database.close();
    }
    const owner = createOwner();
    const initial = await owner.read(project, "harness", "conversation-harness-governance");
    await owner.enqueue(project, {
      ...queueRequest(initial.revision, initial.executionRevision!),
      productMode: "harness",
      conversationId: "conversation-harness-governance",
      clientRequestId: "queue-harness-governance",
      expectedDraftUpdatedAt: now,
      text: "queued harness feedback",
      contextRefs: [],
      attachmentIds: [],
      skillOverrides: {},
      agentTurnMode: null,
      modelId: null,
      reasoningEffort: null,
    });

    await expect(owner.read(project, "harness", "conversation-harness-governance")).resolves.toMatchObject({
      canDispatch: false,
      items: [expect.objectContaining({ status: "queued" })],
    });
  });

  it("fails closed when the selected project resolves to another runtime identity", async () => {
    const owner = new ConversationTurnQueueOwner({
      projectRuntimeCoordinator: {
        resolve: async () => ({ state: "onboarding", paths: { ...paths, projectId: "other-project" } }),
      } as never,
      turnRouter: {} as never,
    });

    await expect(owner.read(project, "agent", conversationId)).rejects.toMatchObject({ name: "Conflict" });
  });
});

type QueueOwnerOptions = ConstructorParameters<typeof ConversationTurnQueueOwner>[0];

function createOwner(postConversationMessage?: QueueOwnerOptions["postConversationMessage"]): ConversationTurnQueueOwner {
  return new ConversationTurnQueueOwner({
    projectRuntimeCoordinator: { resolve: async () => ({ state: "onboarding", paths }) } as never,
    turnRouter: {} as never,
    prepareConversationMessage: async () => ({}) as never,
    ...(postConversationMessage ? { postConversationMessage } : {}),
  });
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function canonicalQueueMessage(dispatchRequestId: string, requestHash: string) {
  return {
    id: "queued-dispatch-evidence",
    projectId,
    conversationId,
    changeId: "",
    agentSurfaceId: "main-agent",
    type: "user.message",
    timestamp: now,
    text: "queued follow-up",
    actionRunId: null,
    actionType: null,
    status: null,
    runId: null,
    providerId: "codex",
    threadId: null,
    turnId: null,
    itemId: null,
    artifact: null,
    error: null,
    rawJson: JSON.stringify({ queuedTurnDispatch: { dispatchRequestId, requestHash } }),
  };
}

function queueRequest(expectedRevision: string, expectedExecutionRevision: string) {
  return {
    projectId,
    productMode: "agent" as const,
    conversationId,
    clientRequestId: "queue-request-1",
    expectedRevision,
    expectedExecutionRevision,
    expectedDraftUpdatedAt: now,
    text: " queued follow-up ",
    contextRefs: [{ relativePath: "src/app.ts", name: "app.ts", kind: "file" as const, source: "composer" as const }],
    attachmentIds: ["attachment-1"],
    skillOverrides: { reviewer: true },
    providerId: "codex",
    agentTurnMode: "plan" as const,
    modelId: "gpt-test",
    reasoningEffort: "high",
  };
}

async function seedConversation(productMode: "agent" | "harness"): Promise<void> {
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    database.conversations.createConversation({
      projectId,
      conversationId,
      productMode,
      agentTurnMode: productMode === "agent" ? "plan" : null,
      agentModelId: productMode === "agent" ? "gpt-test" : null,
      agentReasoningEffort: productMode === "agent" ? "high" : null,
      title: "Agent",
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: "graph-current",
      selectedProviderId: "codex",
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    database.drafts.upsertDraft({
      projectId,
      productMode,
      agentTurnMode: productMode === "agent" ? "plan" : null,
      agentModelId: productMode === "agent" ? "gpt-test" : null,
      agentReasoningEffort: productMode === "agent" ? "high" : null,
      text: "queued follow-up",
      contextRefsJson: JSON.stringify([{ relativePath: "src/app.ts", name: "app.ts", kind: "file", source: "composer" }]),
      attachmentIdsJson: JSON.stringify(["attachment-1"]),
      skillOverridesJson: JSON.stringify({ reviewer: true }),
      selectedProviderId: "codex",
      updatedAt: now,
    }, null);
  } finally {
    database.close();
  }
}

async function replaceDraftAttachments(attachmentIds: string[]): Promise<string> {
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    const draft = database.drafts.readDraft(projectId, "agent")!;
    const updatedAt = "2026-08-28T00:00:00.500Z";
    database.drafts.upsertDraft({
      ...draft,
      attachmentIdsJson: JSON.stringify(attachmentIds),
      updatedAt,
    }, draft.updatedAt);
    return updatedAt;
  } finally {
    database.close();
  }
}
