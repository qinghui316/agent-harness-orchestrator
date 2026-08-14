import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkbenchConversation, postConversationMessage } from "../../src/workbench/conversation-service.js";
import type { ConversationTurnRoutingPort } from "../../src/workbench/conversation-turn-contract.js";
import { getCanonicalTimelinePage } from "../../src/workbench/canonical-timeline-query.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import {
  getWorkbenchSnapshot,
  getWorkbenchTopic,
  listWorkbenchTopics,
} from "../../src/workbench/projections/read-model/implementation.js";
import type { WorkbenchLiveEvent, WorkbenchLiveSink } from "../../src/workbench/types.js";
import { project } from "../helpers/skill-native-test-environment.js";
import {
  prepareSkillNativeWorkbenchFixture,
  type SkillNativeWorkbenchFixture,
} from "../helpers/skill-native-workbench-fixture.js";

let fixture: SkillNativeWorkbenchFixture;

beforeEach(async () => {
  fixture = await prepareSkillNativeWorkbenchFixture({ project: project() });
});

afterEach(() => {
  fixture.restoreEnvironment();
});

describe("dual product-mode foundation", () => {
  it("runs Agent Plan admission before first-send and follow-up persistence", async () => {
    const rejectPlanAdmission = vi.fn(async () => {
      const error = new Error("Selected Provider cannot run Agent Plan turns.");
      error.name = "Conflict";
      throw error;
    });
    const router = { ...testTurnRouter(), admit: rejectPlanAdmission };

    await expect(createWorkbenchConversation(project(), {
      body: "Must not create a Plan conversation.",
      productMode: "agent",
      agentTurnMode: "plan",
      clientRequestId: "plan-admission-first-send",
    }, undefined, { turnRouter: router })).rejects.toMatchObject({ name: "Conflict" });

    const existing = await createWorkbenchConversation(project(), {
      body: "Existing default Agent conversation.",
      productMode: "agent",
      clientRequestId: "plan-admission-follow-up",
    }, undefined, { runMainAgent: false });
    const before = await conversationState(existing.conversationId);
    await expect(postConversationMessage(project(), existing.conversationId, {
      message: "Must not persist this Plan follow-up.",
      productMode: "agent",
      agentTurnMode: "plan",
    }, undefined, { turnRouter: router })).rejects.toMatchObject({ name: "Conflict" });

    const database = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(database.conversations.listConversations(project().id, "agent").map((item) => item.clientCreateRequestId))
        .toEqual(["plan-admission-follow-up"]);
    } finally {
      database.close();
    }
    expect(await conversationState(existing.conversationId)).toEqual(before);
    expect(rejectPlanAdmission).toHaveBeenCalledTimes(2);
  });

  it("replays an exact create before capability admission and rejects Agent mode on Harness", async () => {
    const input = {
      body: "Replay before admission.",
      productMode: "agent" as const,
      agentTurnMode: "default" as const,
      clientRequestId: "admission-replay-priority",
    };
    const created = await createWorkbenchConversation(project(), input, undefined, { runMainAgent: false });
    const admit = vi.fn(async () => { throw new Error("Admission must not rerun."); });
    await expect(createWorkbenchConversation(project(), input, undefined, {
      turnRouter: { ...testTurnRouter(), admit },
    })).resolves.toMatchObject({ conversationId: created.conversationId, replayed: true });
    expect(admit).not.toHaveBeenCalled();

    await expect(createWorkbenchConversation(project(), {
      body: "Invalid Harness mode.",
      productMode: "harness",
      agentTurnMode: "plan",
      clientRequestId: "harness-agent-turn-mode",
    }, undefined, { runMainAgent: false })).rejects.toMatchObject({ name: "Conflict" });
  });

  it("preserves exact replay for migrated v1 create hashes without admitting a new Turn", async () => {
    const input = {
      body: "Replay a migrated default Agent request.",
      productMode: "agent" as const,
      clientRequestId: "legacy-v1-replay",
    };
    const created = await createWorkbenchConversation(project(), input, undefined, { runMainAgent: false });
    const legacyHash = createHash("sha256").update(JSON.stringify({
      version: 1,
      productMode: "agent",
      body: input.body,
      contextRefs: [],
      attachmentIds: [],
      providerId: "codex",
      skillOverrides: [],
    })).digest("hex");
    const database = new Database(fixture.resolution.paths.workbenchDbPath);
    try {
      database.prepare("UPDATE conversations SET client_create_request_hash = ? WHERE project_id = ? AND conversation_id = ?")
        .run(legacyHash, project().id, created.conversationId);
    } finally {
      database.close();
    }
    const admit = vi.fn(async () => { throw new Error("Admission must not run for a migrated exact replay."); });

    await expect(createWorkbenchConversation(project(), input, undefined, {
      turnRouter: { ...testTurnRouter(), admit },
    })).resolves.toMatchObject({ conversationId: created.conversationId, agentTurnMode: "default", replayed: true });
    expect(admit).not.toHaveBeenCalled();
  });

  it("creates the first send atomically and replays only the same request payload", async () => {
    const input = {
      body: "Create one durable conversation.",
      productMode: "harness" as const,
      clientRequestId: "first-send-idempotency",
      skillOverrides: [{ skillId: "review-helper", enabled: true }],
    };

    const first = await createWorkbenchConversation(project(), input, undefined, { runMainAgent: false });
    const replay = await createWorkbenchConversation(project(), input, undefined, { runMainAgent: false });

    expect(replay).toMatchObject({
      conversationId: first.conversationId,
      productMode: "harness",
      replayed: true,
    });
    await expect(createWorkbenchConversation(project(), {
      ...input,
      body: "A different payload must conflict.",
    }, undefined, { runMainAgent: false })).rejects.toMatchObject({ name: "Conflict" });
    await expect(createWorkbenchConversation(project(), {
      ...input,
      productMode: "agent",
    }, undefined, { runMainAgent: false })).rejects.toMatchObject({ name: "Conflict" });

    const database = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(database.conversations.listConversations(project().id, "harness")).toHaveLength(1);
      expect(database.timeline.listConversationMessages(project().id, first.conversationId)).toEqual([
        expect.objectContaining({ type: "user.message", text: input.body }),
      ]);
      expect(database.skills.listSkillEnablement(project().id)).toContainEqual(expect.objectContaining({
        changeId: first.conversationId,
        skillId: "review-helper",
        scope: "topic",
        enabled: true,
      }));
      expect(database.providerAttempts.listProviderAttempts(project().id, first.conversationId)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("isolates topics, latest snapshots, details, and Timeline pages by mode", async () => {
    const harness = await createWorkbenchConversation(project(), {
      body: "Harness history",
      productMode: "harness",
      clientRequestId: "mode-isolation-harness",
    }, undefined, { runMainAgent: false });
    const agent = await createWorkbenchConversation(project(), {
      body: "Agent history",
      productMode: "agent",
      clientRequestId: "mode-isolation-agent",
    }, undefined, { runMainAgent: false });
    const input = { project: project(), path: project().path };

    await expect(listWorkbenchTopics(input, "harness")).resolves.toEqual([
      expect.objectContaining({ id: harness.conversationId, productMode: "harness" }),
    ]);
    await expect(listWorkbenchTopics(input, "agent")).resolves.toEqual([
      expect.objectContaining({ id: agent.conversationId, productMode: "agent" }),
    ]);
    await expect(getWorkbenchSnapshot(input, { productMode: "harness" })).resolves.toMatchObject({
      productMode: "harness",
      center: { selectedTopic: { id: harness.conversationId, productMode: "harness" } },
    });
    await expect(getWorkbenchSnapshot(input, { productMode: "agent" })).resolves.toMatchObject({
      productMode: "agent",
      center: { selectedTopic: { id: agent.conversationId, productMode: "agent" } },
    });
    await expect(getWorkbenchTopic(input, harness.conversationId, "agent")).rejects.toMatchObject({ name: "Conflict" });
    await expect(getWorkbenchTopic(input, agent.conversationId, "harness")).rejects.toMatchObject({ name: "Conflict" });

    const harnessTimeline = await getCanonicalTimelinePage(input, harness.conversationId, "main-agent", "harness");
    const agentTimeline = await getCanonicalTimelinePage(input, agent.conversationId, "main-agent", "agent");
    expect(harnessTimeline).toMatchObject({ productMode: "harness", conversationId: harness.conversationId });
    expect(agentTimeline).toMatchObject({ productMode: "agent", conversationId: agent.conversationId });
    await expect(getCanonicalTimelinePage(input, harness.conversationId, "main-agent", "agent")).rejects.toMatchObject({ name: "Conflict" });
  });

  it("rejects an existing-Conversation mode mismatch before durable or provider side effects", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      body: "Original Harness message",
      productMode: "harness",
      clientRequestId: "mismatch-zero-side-effects",
    }, undefined, { runMainAgent: false });
    const before = await conversationState(conversation.conversationId);

    await expect(postConversationMessage(project(), conversation.conversationId, {
      message: "Must not be committed",
      productMode: "agent",
    }, undefined, { turnRouter: testTurnRouter() })).rejects.toMatchObject({ name: "Conflict" });

    expect(await conversationState(conversation.conversationId)).toEqual(before);
  });

  it("retains the committed Agent Conversation when routed startup fails", async () => {
    const events: WorkbenchLiveEvent[] = [];
    const sink: WorkbenchLiveSink = { emit: (event) => events.push(event) };

    await expect(createWorkbenchConversation(project(), {
      body: "Persist before direct execution.",
      productMode: "agent",
      clientRequestId: "agent-fail-closed-retention",
    }, sink, { turnRouter: failAfterCommitRouter() })).rejects.toMatchObject({ name: "Conflict" });

    const created = events.find((event) => event.event === "topic.created");
    expect(created).toMatchObject({
      event: "topic.created",
      data: {
        projectId: project().id,
        productMode: "agent",
        clientRequestId: "agent-fail-closed-retention",
        replayed: false,
      },
    });
    const conversationId = created?.event === "topic.created" ? created.data.conversationId : "";
    expect(conversationId).not.toBe("");

    const database = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(database.conversations.readConversation(project().id, conversationId)).toMatchObject({
        productMode: "agent",
        clientCreateRequestId: "agent-fail-closed-retention",
      });
      expect(database.timeline.listConversationMessages(project().id, conversationId)).toEqual([
        expect.objectContaining({ type: "user.message", text: "Persist before direct execution." }),
      ]);
      expect(database.providerAttempts.listProviderAttempts(project().id, conversationId)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("retains a committed later Agent message when routed startup fails", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      body: "Initial Agent message",
      productMode: "agent",
      clientRequestId: "agent-later-fail-closed",
    }, undefined, { runMainAgent: false });

    await expect(postConversationMessage(project(), conversation.conversationId, {
      message: "Durable later Agent message",
      productMode: "agent",
    }, undefined, { turnRouter: failAfterCommitRouter() })).rejects.toMatchObject({
      name: "Conflict",
      message: "Injected post-commit startup failure.",
    });

    const database = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(database.timeline.listConversationMessages(project().id, conversation.conversationId)).toEqual([
        expect.objectContaining({ type: "user.message", text: "Initial Agent message" }),
        expect.objectContaining({ type: "user.message", text: "Durable later Agent message" }),
      ]);
      expect(database.providerAttempts.listProviderAttempts(project().id, conversation.conversationId)).toEqual([]);
      expect(database.providerAttempts.readConversationProviderBinding(
        project().id,
        conversation.conversationId,
        conversation.selectedProviderId,
      )).toBeNull();
    } finally {
      database.close();
    }
  });

  it("rejects missing native-child lineage and Harness plan handoff before side effects", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      body: "Agent boundary",
      productMode: "agent",
      clientRequestId: "agent-harness-input-boundary",
    }, undefined, { runMainAgent: false });
    const before = await conversationState(conversation.conversationId);

    await expect(postConversationMessage(project(), conversation.conversationId, {
      message: "Must not target a child Agent.",
      productMode: "agent",
      agentSurfaceId: "agent:codex:thread:child",
    }, undefined, { turnRouter: testTurnRouter() })).rejects.toMatchObject({
      message: "Workbench Agent child routing is not composed.",
    });
    await expect(postConversationMessage(project(), conversation.conversationId, {
      message: "Must not hand off an AHO plan.",
      productMode: "agent",
      planHandoffIntent: {
        sourceRunId: "planning-run",
        sourceAgentRoleId: "planning-agent",
        kind: "execute-plan",
      },
    }, undefined, { turnRouter: testTurnRouter() })).rejects.toMatchObject({ name: "Conflict" });

    expect(await conversationState(conversation.conversationId)).toEqual(before);
  });

  it("routes with the Provider from the committed Conversation instead of a stale identity snapshot", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      body: "Provider snapshot boundary",
      productMode: "agent",
      clientRequestId: "agent-provider-snapshot-boundary",
    }, undefined, { runMainAgent: false });
    const mutationDatabase = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    let switched = false;
    const route = vi.fn(async () => {
      const error = new Error("Captured routed input.");
      error.name = "Conflict";
      throw error;
    });

    try {
      await expect(postConversationMessage(project(), conversation.conversationId, {
        message: "Use the latest committed Provider.",
        productMode: "agent",
      }, undefined, {
        turnRouter: {
          assertRequestedMode(stored, requested): void {
            expect(requested).toBe(stored.productMode);
            if (switched) return;
            switched = true;
            mutationDatabase.conversations.switchSelectedProvider(
              project().id,
              conversation.conversationId,
              conversation.selectedProviderId,
              "other-provider",
              new Date().toISOString(),
            );
          },
          admit: testAdmission,
          route,
          resolveProviderId: (_project, requestedProviderId) => requestedProviderId ?? "codex",
          resolveRuntimeState: async () => ({ state: "ready", project: project(), resolution: fixture.resolution }),
        },
      })).rejects.toMatchObject({ name: "Conflict", message: "Captured routed input." });
    } finally {
      mutationDatabase.close();
    }

    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: expect.objectContaining({ selectedProviderId: "other-provider" }),
        providerId: "other-provider",
      }),
      "agent",
    );
  });

  it("rejects an Agent provider mismatch before committing a message or starting a Turn", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      body: "Provider mismatch boundary",
      productMode: "agent",
      clientRequestId: "agent-provider-mismatch-boundary",
    }, undefined, { runMainAgent: false });
    const before = await conversationState(conversation.conversationId);

    await expect(postConversationMessage(project(), conversation.conversationId, {
      message: "Do not silently use the stored Provider.",
      productMode: "agent",
      providerId: "other-provider",
    }, undefined, { turnRouter: testTurnRouter() })).rejects.toMatchObject({
      name: "Conflict",
      message: "Direct Agent provider switching is not supported in this increment.",
    });

    expect(await conversationState(conversation.conversationId)).toEqual(before);
  });
});

function failAfterCommitRouter() {
  return {
    assertRequestedMode(conversation: { productMode: string }, requestedMode?: string): void {
      if (requestedMode === undefined || requestedMode === conversation.productMode) return;
      const error = new Error("Conversation productMode does not match the requested mode.");
      error.name = "Conflict";
      throw error;
    },
    admit: testAdmission,
    route(): Promise<never> {
      const error = new Error("Injected post-commit startup failure.");
      error.name = "Conflict";
      return Promise.reject(error);
    },
    resolveProviderId: (_project: unknown, requestedProviderId?: string) => requestedProviderId ?? "codex",
    resolveRuntimeState: async () => ({ state: "ready" as const, project: project(), resolution: fixture.resolution }),
  } satisfies ConversationTurnRoutingPort;
}

function testTurnRouter(): ConversationTurnRoutingPort {
  return {
    assertRequestedMode(conversation, requestedMode): void {
      if (requestedMode === undefined || requestedMode === conversation.productMode) return;
      const error = new Error("Conversation productMode does not match the requested mode.");
      error.name = "Conflict";
      throw error;
    },
    admit: testAdmission,
    route: vi.fn(async () => ({
      user: { id: "test-user", type: "user.message", timestamp: new Date().toISOString(), conversationId: "test", changeId: "", text: "test" },
      assistant: null,
      run: null,
      providerSessionId: null,
    })),
    resolveProviderId: (_project, requestedProviderId) => requestedProviderId ?? "codex",
    resolveRuntimeState: async () => ({ state: "ready", project: project(), resolution: fixture.resolution }),
  };
}

async function testAdmission(input: Parameters<ConversationTurnRoutingPort["admit"]>[0]) {
  return {
    projectId: input.project.id,
    productMode: input.productMode,
    conversationId: input.conversationId,
    providerId: input.providerId,
    agentTurnMode: input.productMode === "agent" ? input.agentTurnMode ?? "default" : null,
    capabilitySnapshot: null,
    model: null,
    sandboxPolicy: "workspace-write" as const,
    writableRoots: [input.project.path],
    runtimeState: { state: "ready" as const, project: project(), resolution: fixture.resolution },
  };
}

async function conversationState(conversationId: string): Promise<{
  messages: string[];
  attempts: string[];
  hasBinding: boolean;
  completedTurnSequence: number;
}> {
  const database = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
  try {
    const conversation = database.conversations.readConversation(project().id, conversationId)!;
    return {
      messages: database.timeline.listConversationMessages(project().id, conversationId).map((message) => message.id),
      attempts: database.providerAttempts.listProviderAttempts(project().id, conversationId).map((attempt) => attempt.attemptId),
      hasBinding: Boolean(database.providerAttempts.readConversationProviderBinding(project().id, conversationId, conversation.selectedProviderId)),
      completedTurnSequence: conversation.completedTurnSequence,
    };
  } finally {
    database.close();
  }
}
