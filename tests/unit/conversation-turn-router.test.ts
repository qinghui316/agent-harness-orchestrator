import { describe, expect, it, vi } from "vitest";
import type { ManagedProject } from "../../src/types/index.js";
import { ProviderRegistry } from "../../src/provider-runtime/registry.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import type { ProjectRuntimeState } from "../../src/project-runtime/coordinator.js";
import { ConversationTurnRouter } from "../../src/workbench/conversation-turn-router.js";
import { HarnessConversationTurnStrategy } from "../../src/workbench/harness-conversation-turn-strategy.js";
import type {
  ConversationTurnExecutionPorts,
  ConversationTurnRequest,
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
    const router = new ConversationTurnRouter({ agent, harness }, ports(), compositionOwner());

    await expect(router.route(turnInput("harness"), "harness")).resolves.toBe(harnessResult);
    expect(harness.execute).toHaveBeenCalledOnce();
    expect(agent.execute).not.toHaveBeenCalled();

    await expect(router.route(turnInput("agent"), "agent")).resolves.toBe(agentResult);
    expect(agent.execute).toHaveBeenCalledOnce();
  });

  it("rejects an asserted mode mismatch before invoking any Strategy", async () => {
    const agent = strategy("agent", topicResult("agent"));
    const harness = strategy("harness", topicResult("harness"));
    const router = new ConversationTurnRouter({ agent, harness }, ports(), compositionOwner());

    expect(() => router.assertRequestedMode(conversation("harness"), "agent"))
      .toThrow("Conversation productMode does not match the requested mode.");
    await expect(router.route(turnInput("harness"), "agent")).rejects.toMatchObject({ name: "Conflict" });
    expect(agent.execute).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("fails construction when a Strategy is registered under the wrong mode", () => {
    const harness = strategy("harness", topicResult("harness"));
    expect(() => new ConversationTurnRouter({ agent: harness, harness }, ports(), compositionOwner()))
      .toThrow("Conversation Turn Strategy for agent must declare the same productMode.");
  });

  it("resolves one immutable Skill context for each non-onboarding top-level Turn", async () => {
    const resolution = Object.freeze({
      skillInputs: Object.freeze([{ id: "marker", path: "C:\\skills\\marker\\SKILL.md", contentHash: "marker-hash", source: "provider-native" as const, required: false }]),
      diagnostics: Object.freeze([]),
      nativeSkillRoots: Object.freeze(["C:\\skills"]),
      requiredNativeSkills: Object.freeze([]),
      resolutionHash: "resolution-hash",
    });
    const resolveSkillContext = vi.fn(async () => resolution);
    const agent = strategy("agent", topicResult("agent"));
    const harness = strategy("harness", topicResult("harness"));
    const input = turnRequest("agent");
    const owner = compositionOwner(readyState(project()));
    const readyRouter = new ConversationTurnRouter(
      { agent, harness },
      ports(resolveSkillContext),
      owner,
    );

    await expect(readyRouter.route(input, "agent")).resolves.toEqual(topicResult("agent"));
    expect(resolveSkillContext).toHaveBeenCalledOnce();
    const routedInput = agent.execute.mock.calls[0]![0] as ConversationTurnStrategyInput;
    expect(routedInput.turnSkillResolution).toBe(resolution);
    expect(Object.isFrozen(routedInput.turnSkillResolution)).toBe(true);
    expect(Object.isFrozen(routedInput.turnSkillResolution?.skillInputs)).toBe(true);
  });

  it("does not resolve Skill context for a Harness onboarding Turn", async () => {
    const resolveSkillContext = vi.fn(async () => ({ skillInputs: [], diagnostics: [] }));
    const agent = strategy("agent", topicResult("agent"));
    const harness = strategy("harness", topicResult("harness"));
    const router = new ConversationTurnRouter(
      { agent, harness },
      ports(resolveSkillContext),
      compositionOwner(),
    );

    await expect(router.route(turnRequest("harness"), "harness"))
      .resolves.toEqual(topicResult("harness"));
    expect(resolveSkillContext).not.toHaveBeenCalled();
    expect(harness.execute.mock.calls[0]![0]).toMatchObject({ turnSkillResolution: null });
  });

  it("does not expose runtime state or a pre-resolved Skill context on the public route input", () => {
    const request: ConversationTurnRequest = turnRequest("agent");
    // @ts-expect-error Production callers cannot inject a Skill resolution.
    request.turnSkillResolution = { skillInputs: [], diagnostics: [] };
    // @ts-expect-error Production callers cannot bypass the composition-owned runtime coordinator.
    request.runtimeState = readyState(project());
  });

  it("rejects Agent and non-ready Conversations before resolving continuation Skills", async () => {
    const resolveSkillContext = vi.fn(async () => ({ skillInputs: [], diagnostics: [] }));
    const agent = strategy("agent", topicResult("agent"));
    const harness = strategy("harness", topicResult("harness"));
    const router = new ConversationTurnRouter({ agent, harness }, ports(resolveSkillContext), compositionOwner());
    const internal = router as unknown as {
      readContinuationTurn: (selectedProject: ManagedProject, conversationId: string) => Promise<{
        conversation: StoredConversation;
        runtimeState: ProjectRuntimeState;
      }>;
    };

    internal.readContinuationTurn = vi.fn(async () => ({
      conversation: conversation("agent"),
      runtimeState: readyState(project()),
    }));
    await expect(router.continueMainAgentTurn(project(), "conversation-1", "continue"))
      .rejects.toMatchObject({ name: "Conflict" });
    expect(resolveSkillContext).not.toHaveBeenCalled();
    expect(agent.execute).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();

    internal.readContinuationTurn = vi.fn(async () => ({
      conversation: conversation("harness"),
      runtimeState: onboardingState(project()),
    }));
    await expect(router.continueMainAgentTurn(project(), "conversation-1", "continue"))
      .rejects.toMatchObject({ name: "Conflict" });
    expect(resolveSkillContext).not.toHaveBeenCalled();
  });
});

describe("Conversation Turn Strategies", () => {
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
      {
        graphScopeId: "graph:conversation-1",
        runtimeState: input.runtimeState,
        turnSkillResolution: null,
      },
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

function ports(
  resolve: ConversationTurnExecutionPorts["skillContext"]["resolve"] = async () => ({ skillInputs: [], diagnostics: [] }),
): ConversationTurnExecutionPorts {
  return {
    skillContext: {
      resolve,
    },
  };
}

function compositionOwner(state?: ProjectRuntimeState) {
  return {
    projectRuntimeCoordinator: {
      resolve: async (selectedProject: ManagedProject) => state ?? onboardingState(selectedProject),
      runtimePaths: (projectId: string) => resolveProjectRuntimePaths(projectId, "C:\\aho-test"),
    },
    providerRegistry: new ProviderRegistry(),
  };
}

function readyState(selectedProject: ManagedProject): ProjectRuntimeState {
  const paths = resolveProjectRuntimePaths(selectedProject.id, "C:\\aho-test");
  const skillRoot = "C:\\project\\.agents\\skills\\project-harness";
  return {
    state: "ready",
    project: selectedProject,
    resolution: {
      projectRoot: selectedProject.path,
      harness: {
        projectId: selectedProject.id,
        skillName: `${selectedProject.id}-harness`,
        skillRevision: 1,
        skillRoot,
        contentFingerprint: "harness-fingerprint",
      },
      binding: {
        projectId: selectedProject.id,
        skillName: `${selectedProject.id}-harness`,
        sourcePath: `${skillRoot}\\SKILL.md`,
        contentFingerprint: "harness-fingerprint",
        providers: [],
      },
      providerInput: {
        id: `${selectedProject.id}-harness`,
        path: `${skillRoot}\\SKILL.md`,
        contentHash: "harness-fingerprint",
        source: "project-harness",
        required: true,
      },
      paths,
    },
  };
}

function onboardingState(selectedProject: ManagedProject): ProjectRuntimeState {
  return {
    state: "onboarding",
    project: selectedProject,
    projectRoot: selectedProject.path,
    paths: resolveProjectRuntimePaths(selectedProject.id, "C:\\aho-test"),
    reservedProjectId: selectedProject.id,
  };
}

function turnInput(productMode: "agent" | "harness"): ConversationTurnStrategyInput {
  const selectedProject = project();
  return {
    project: selectedProject,
    conversation: conversation(productMode),
    committedMessage: committedMessage(),
    attachments: [],
    providerId: "codex",
    runtimeState: {
      state: "onboarding",
      project: selectedProject,
      projectRoot: selectedProject.path,
      paths: resolveProjectRuntimePaths(selectedProject.id, "C:\\aho-test"),
      reservedProjectId: selectedProject.id,
    },
    turnSkillResolution: productMode === "agent" ? { skillInputs: [], diagnostics: [] } : null,
  };
}

function turnRequest(productMode: "agent" | "harness"): ConversationTurnRequest {
  const input = turnInput(productMode);
  return {
    project: input.project,
    conversation: input.conversation,
    committedMessage: input.committedMessage,
    attachments: input.attachments,
    providerId: input.providerId,
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
