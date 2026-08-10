import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkbenchConversation, postConversationMessage } from "../../src/workbench/conversation-service.js";
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
    })).rejects.toMatchObject({ name: "Conflict" });

    expect(await conversationState(conversation.conversationId)).toEqual(before);
  });

  it("retains the committed Agent Conversation when T002 execution fails closed", async () => {
    const events: WorkbenchLiveEvent[] = [];
    const sink: WorkbenchLiveSink = { emit: (event) => events.push(event) };

    await expect(createWorkbenchConversation(project(), {
      body: "Persist before direct execution.",
      productMode: "agent",
      clientRequestId: "agent-fail-closed-retention",
    }, sink)).rejects.toMatchObject({ name: "Conflict" });

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
});

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
