import { describe, expect, it, vi } from "vitest";
import type { ManagedProject } from "../../src/types/index.js";
import { ConversationTurnRouter } from "../../src/workbench/conversation-turn-router.js";
import { FailClosedAgentTurnStrategy } from "../../src/workbench/fail-closed-agent-turn-strategy.js";
import { HarnessConversationTurnStrategy } from "../../src/workbench/harness-conversation-turn-strategy.js";
import type {
  ConversationTurnExecutionPorts,
  ConversationTurnStrategy,
  ConversationTurnStrategyInput,
} from "../../src/workbench/conversation-turn-contract.js";
import type { StoredConversation, StoredTopicMessage } from "../../src/workbench/persistence/contracts.js";
import type { TopicMessageResult, TopicThreadEntry } from "../../src/workbench/types.js";

describe("ConversationTurnRouter", () => {
  it("selects exactly one Strategy from the persisted Conversation mode", async () => {
    const agentResult = topicResult("agent");
    const harnessResult = topicResult("harness");
    const agent = strategy("agent", agentResult);
    const harness = strategy("harness", harnessResult);
    const router = new ConversationTurnRouter({ agent, harness }, ports());

    await expect(router.route(turnInput("harness"), "harness")).resolves.toBe(harnessResult);
    expect(harness.execute).toHaveBeenCalledOnce();
    expect(agent.execute).not.toHaveBeenCalled();

    await expect(router.route(turnInput("agent"), "agent")).resolves.toBe(agentResult);
    expect(agent.execute).toHaveBeenCalledOnce();
  });

  it("rejects an asserted mode mismatch before invoking any Strategy", async () => {
    const agent = strategy("agent", topicResult("agent"));
    const harness = strategy("harness", topicResult("harness"));
    const router = new ConversationTurnRouter({ agent, harness }, ports());

    expect(() => router.assertRequestedMode(conversation("harness"), "agent"))
      .toThrow("Conversation productMode does not match the requested mode.");
    await expect(router.route(turnInput("harness"), "agent")).rejects.toMatchObject({ name: "Conflict" });
    expect(agent.execute).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("fails construction when a Strategy is registered under the wrong mode", () => {
    const harness = strategy("harness", topicResult("harness"));
    expect(() => new ConversationTurnRouter({ agent: harness, harness }, ports()))
      .toThrow("Conversation Turn Strategy for agent must declare the same productMode.");
  });
});

describe("Conversation Turn Strategies", () => {
  it("keeps Agent execution fail-closed without resolving Skills", async () => {
    const skillResolve = vi.fn();
    const strategyUnderTest = new FailClosedAgentTurnStrategy();

    await expect(strategyUnderTest.execute(turnInput("agent"), {
      skillContext: { resolve: skillResolve },
    })).rejects.toMatchObject({ name: "Conflict", message: "Direct Agent execution is not enabled yet." });
    expect(skillResolve).not.toHaveBeenCalled();
  });

  it("adapts a committed Harness message to the existing Main turn runner", async () => {
    const assistant: TopicThreadEntry = {
      id: "assistant-1",
      type: "assistant.message",
      timestamp: "2026-08-11T00:00:01.000Z",
      conversationId: "conversation-1",
      graphScopeId: "graph:conversation-1",
      changeId: "",
      text: "Harness reply",
    };
    const runTurn = vi.fn(async () => assistant);
    const strategyUnderTest = new HarnessConversationTurnStrategy(runTurn);
    const input = turnInput("harness");

    await expect(strategyUnderTest.execute(input, ports())).resolves.toMatchObject({
      user: { id: "user-1", text: "User message", graphScopeId: "graph:conversation-1" },
      assistant,
      assistantMessage: "Harness reply",
    });
    expect(runTurn).toHaveBeenCalledWith(
      input.project,
      input.conversation.conversationId,
      "User message",
      undefined,
      undefined,
      { graphScopeId: "graph:conversation-1" },
    );
  });
});

function strategy(productMode: "agent" | "harness", result: TopicMessageResult): ConversationTurnStrategy & {
  execute: ReturnType<typeof vi.fn>;
} {
  return {
    productMode,
    execute: vi.fn(async () => result),
  };
}

function ports(): ConversationTurnExecutionPorts {
  return {
    skillContext: {
      resolve: async () => ({ skillInputs: [], diagnostics: [] }),
    },
  };
}

function turnInput(productMode: "agent" | "harness"): ConversationTurnStrategyInput {
  return {
    project: project(),
    conversation: conversation(productMode),
    committedMessage: committedMessage(),
    attachments: [],
    providerId: "codex",
  };
}

function conversation(productMode: "agent" | "harness"): StoredConversation {
  return {
    projectId: "project-1",
    conversationId: "conversation-1",
    productMode,
    clientCreateRequestId: null,
    clientCreateRequestHash: null,
    title: "Conversation",
    state: "active",
    boundChangeId: null,
    currentGraphScopeId: "graph:conversation-1",
    selectedProviderId: "codex",
    completedTurnSequence: 0,
    timelinePosition: 1,
    timelineRevision: 1,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    deletedAt: null,
  };
}

function committedMessage(): StoredTopicMessage {
  return {
    id: "user-1",
    projectId: "project-1",
    conversationId: "conversation-1",
    changeId: "",
    position: 1,
    revision: 1,
    agentSurfaceId: "main-agent",
    initialThreadInput: false,
    type: "user.message",
    timestamp: "2026-08-11T00:00:00.000Z",
    text: "User message",
    actionRunId: null,
    actionType: null,
    status: null,
    runId: null,
    artifact: null,
    error: null,
    rawJson: JSON.stringify({ graphScopeId: "graph:conversation-1" }),
  };
}

function topicResult(label: string): TopicMessageResult {
  return {
    user: {
      id: `user-${label}`,
      type: "user.message",
      timestamp: "2026-08-11T00:00:00.000Z",
      conversationId: "conversation-1",
      changeId: "",
      text: label,
    },
    assistant: null,
    run: null,
    providerSessionId: null,
  };
}

function project(): ManagedProject {
  return {
    id: "project-1",
    name: "Project",
    path: "C:\\project",
    addedAt: "2026-08-11T00:00:00.000Z",
    lastSeenAt: "2026-08-11T00:00:00.000Z",
  };
}
