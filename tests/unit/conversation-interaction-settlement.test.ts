import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providerAnswer = vi.hoisted(() => vi.fn());
const activeTurn = vi.hoisted(() => vi.fn());
const domainSettlement = vi.hoisted(() => ({
  resolved: null as unknown,
  answerClarification: vi.fn(),
  skipClarification: vi.fn(),
  postConversationMessage: vi.fn(),
}));
vi.mock("../../src/codex/app-server.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/codex/app-server.js")>();
  return {
    ...actual,
    getActiveCodexAppServerTurn: activeTurn,
  };
});
vi.mock("../../src/workbench/intake.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/workbench/intake.js")>();
  return {
    ...actual,
    answerClarification: domainSettlement.answerClarification,
    skipClarification: domainSettlement.skipClarification,
  };
});
vi.mock("../../src/workbench/conversation-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/workbench/conversation-service.js")>();
  return { ...actual, postConversationMessage: domainSettlement.postConversationMessage };
});
vi.mock("../../src/workbench/conversation-interactions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/workbench/conversation-interactions.js")>();
  return {
    ...actual,
    resolveConversationInteraction: (...args: Parameters<typeof actual.resolveConversationInteraction>) => domainSettlement.resolved
      ? Promise.resolve(domainSettlement.resolved)
      : actual.resolveConversationInteraction(...args),
  };
});

import { git } from "../../src/project/git.js";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createHarnessWorkbenchConversation as createWorkbenchConversation } from "../helpers/conversation-change-fixture.js";
import { settleConversationInteraction } from "../../src/workbench/conversation-interaction-service.js";
import type { ConversationTurnRoutingPort } from "../../src/workbench/conversation-turn-contract.js";
import { buildConversationInteractionQueue } from "../../src/workbench/conversation-interactions.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";
import { defaultProviderRegistry } from "../../src/provider-runtime/index.js";
import { reconcileStaleProviderInputRequests } from "../../src/workbench/provider-input-lifecycle.js";

let root: string;
let originalAhoHome: string | undefined;
let runtime: ProjectRuntimePaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-interaction-settlement-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, ".aho-home");
  providerAnswer.mockReset();
  activeTurn.mockReset();
  domainSettlement.resolved = null;
  domainSettlement.answerClarification.mockReset();
  domainSettlement.skipClarification.mockReset();
  domainSettlement.postConversationMessage.mockReset();
  activeTurn.mockImplementation((runtimeScopeId: string) => ({
    changeId: "",
    runtimeScopeId,
    roleId: "main-agent",
    runId: "run-1",
    attemptId: "run-1",
    threadId: "thread-main",
    turnId: "turn-main",
    startedAt: "2026-07-16T00:00:00.000Z",
    steer: vi.fn(),
    interrupt: vi.fn(),
    respondToUserInput: providerAnswer,
  }));
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "aho-test@example.invalid"]);
  await git(root, ["config", "user.name", "AHO Test"]);
  await writeFile(join(root, "package.json"), "{\"name\":\"interaction-settlement-fixture\"}\n", "utf8");
  await git(root, ["add", "package.json"]);
  await git(root, ["commit", "-m", "fixture baseline"]);
  await createReadyProjectHarnessFixture({
    projectRoot: root,
    ahoHome: process.env.AHO_HOME,
    projectId: project().id,
    projectName: project().name,
  });
  runtime = resolveProjectRuntimePaths(project().id, process.env.AHO_HOME);
});

afterEach(async () => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
  await rm(root, { recursive: true, force: true });
});

describe("conversation interaction settlement", () => {
  it("interrupts stale pending and submitting Provider input during startup recovery", async () => {
    const pending = await providerInteraction("pending");
    activeTurn.mockReturnValue(null);

    const result = await reconcileStaleProviderInputRequests({ runtime, providerRegistry: defaultProviderRegistry });

    expect(result.interrupted).toBe(1);
    const store = await openProjectRuntimeWorkbenchDatabase(runtime);
    try {
      expect(store.interactions.readProviderUserInputRequest(project().id, pending.conversationId, "request-key-1")?.status)
        .toBe("interrupted");
      expect(store.timeline
        .listConversationMessages(project().id, pending.conversationId)
        .find((item) => item.id === "provider-input-message")?.rawJson)
        .toContain("no exact active Provider Turn could be proven");
    } finally {
      store.close();
    }
  });

  it("preserves Provider input only when exact active Turn lineage is still proven", async () => {
    const pending = await providerInteraction("submitting");

    const result = await reconcileStaleProviderInputRequests({ runtime, providerRegistry: defaultProviderRegistry });

    expect(result.interrupted).toBe(0);
    const store = await openProjectRuntimeWorkbenchDatabase(runtime);
    try {
      expect(store.interactions.readProviderUserInputRequest(project().id, pending.conversationId, "request-key-1")?.status)
        .toBe("submitting");
    } finally {
      store.close();
    }
  });

  it("routes grouped answers to the active provider turn and persists only redacted secret history", async () => {
    const fixture = await providerInteraction();
    providerAnswer.mockResolvedValue(undefined);

    await settleConversationInteraction(project(), fixture.conversationId, fixture.interactionId, {
      action: "answer",
      answers: { choice: "continue", token: "top-secret-value" },
      skippedQuestionIds: [],
    }, undefined, undefined, defaultProviderRegistry);

    expect(activeTurn).toHaveBeenCalledWith(fixture.conversationId);
    expect(providerAnswer).toHaveBeenCalledWith(
      "request-1",
      { answers: { choice: "continue", token: "top-secret-value" } },
      expect.objectContaining({ runId: "run-1", threadId: "thread-main", turnId: "turn-main" }),
    );
    const store = await openProjectRuntimeWorkbenchDatabase(runtime);
    try {
      const request = store.interactions.readProviderUserInputRequest(project().id, fixture.conversationId, "request-key-1");
      expect(request).toMatchObject({
        status: "submitting",
        publicAnswers: { choice: "continue", token: "已提供敏感信息" },
        disposition: "answered",
      });
      expect(store.timeline.listConversationMessages(project().id, fixture.conversationId).map((item) => item.rawJson).join("\n"))
        .not.toContain("top-secret-value");
    } finally {
      store.close();
    }
  });

  it("fails closed for uncertain submitting state and never replays an answer", async () => {
    const fixture = await providerInteraction("submitting");

    await expect(settleConversationInteraction(project(), fixture.conversationId, fixture.interactionId, {
      action: "answer",
      answers: { choice: "continue", token: "must-not-replay" },
      skippedQuestionIds: [],
    }, undefined, undefined, defaultProviderRegistry)).rejects.toThrow("提交结果尚未确认");
    expect(providerAnswer).not.toHaveBeenCalled();
  });

  it("keeps a transport failure in submitting state and refuses replay", async () => {
    const fixture = await providerInteraction();
    providerAnswer.mockRejectedValueOnce(new Error("transport outcome unknown"));
    const settlement = {
      action: "answer" as const,
      answers: { choice: "continue", token: "must-not-replay" },
      skippedQuestionIds: [],
    };

    await expect(settleConversationInteraction(project(), fixture.conversationId, fixture.interactionId, settlement, undefined, undefined, defaultProviderRegistry))
      .rejects.toThrow("transport outcome unknown");

    const store = await openProjectRuntimeWorkbenchDatabase(runtime);
    try {
      expect(store.interactions.readProviderUserInputRequest(project().id, fixture.conversationId, "request-key-1")?.status).toBe("submitting");
      expect(store.timeline.listConversationMessages(project().id, fixture.conversationId).map((item) => item.rawJson).join("\n"))
        .not.toContain("must-not-replay");
    } finally {
      store.close();
    }

    await expect(settleConversationInteraction(project(), fixture.conversationId, fixture.interactionId, settlement, undefined, undefined, defaultProviderRegistry))
      .rejects.toThrow("提交结果尚未确认");
    expect(providerAnswer).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale interaction after the graph scope changes", async () => {
    const fixture = await providerInteraction();
    const store = await openProjectRuntimeWorkbenchDatabase(runtime);
    try {
      store.unitOfWork.startConversationGraphScope(project().id, fixture.conversationId, "scope-next", new Date().toISOString());
    } finally {
      store.close();
    }

    await expect(settleConversationInteraction(project(), fixture.conversationId, fixture.interactionId, {
      action: "skip",
    }, undefined, undefined, defaultProviderRegistry)).rejects.toThrow("已经处理、过期或不属于当前需求");
    expect(providerAnswer).not.toHaveBeenCalled();
  });

  it("delegates clarification answer and skip to the intake owner", async () => {
    await ensureHarnessConversation("conversation-1");
    domainSettlement.resolved = {
      kind: "clarification",
      public: {
        questions: [{ questionId: "tests", title: "需要哪些测试？", inputMode: "text", options: [], allowCustom: true }],
      },
      source: {
        entry: { changeId: "change-1" },
        clarification: { id: "clarification-1" },
      },
    };
    domainSettlement.answerClarification.mockResolvedValue({ status: "answered" });
    domainSettlement.skipClarification.mockResolvedValue({ status: "skipped" });

    await settleConversationInteraction(project(), "conversation-1", "interaction-clarification", {
      action: "answer",
      answers: { tests: "单元测试" },
      skippedQuestionIds: [],
    });
    expect(domainSettlement.answerClarification).toHaveBeenCalledWith(project(), "change-1", "clarification-1", [
      { questionId: "tests", answer: "单元测试" },
    ]);

    await settleConversationInteraction(project(), "conversation-1", "interaction-clarification", { action: "skip" });
    expect(domainSettlement.skipClarification).toHaveBeenCalledWith(project(), "change-1", "clarification-1");
  });

  it("delegates execute, revise, and non-authorizing skip Plan intents to Main", async () => {
    await ensureHarnessConversation("conversation-plan");
    domainSettlement.resolved = {
      kind: "plan",
      public: { questions: [] },
      source: {
        proposal: { runId: "run-plan", artifact: "proposals/run-plan/plan.md" },
        document: {
          documentId: "plan-document-1",
          sourceCanonicalItemId: "prose:codex:attempt:thread:turn:item",
          proposalHash: "proposal-hash",
        },
      },
    };
    domainSettlement.postConversationMessage.mockResolvedValue({ status: "completed" });
    const turnRouter = testTurnRouter();

    await settleConversationInteraction(project(), "conversation-plan", "interaction-plan", { action: "execute-plan" }, undefined, turnRouter);
    await settleConversationInteraction(project(), "conversation-plan", "interaction-plan", { action: "revise-plan", feedback: "补充回滚验证" }, undefined, turnRouter);
    await settleConversationInteraction(project(), "conversation-plan", "interaction-plan", { action: "skip" }, undefined, turnRouter);

    expect(domainSettlement.postConversationMessage.mock.calls.map((call) => call[2].planHandoffIntent)).toEqual([
      expect.objectContaining({ kind: "execute-plan", sourceRunId: "run-plan", sourceDocumentId: "plan-document-1", sourceProposalHash: "proposal-hash" }),
      expect.objectContaining({ kind: "revise-plan", feedback: "补充回滚验证", sourceCanonicalItemId: "prose:codex:attempt:thread:turn:item" }),
      expect.objectContaining({ kind: "skip-plan", feedback: undefined, sourceDocumentId: "plan-document-1" }),
    ]);
    expect(domainSettlement.postConversationMessage.mock.calls.map((call) => call[4])).toEqual([
      { turnRouter },
      { turnRouter },
      { turnRouter },
    ]);
  });

  it("fails closed for Plan settlement without the composed Router", async () => {
    await ensureHarnessConversation("conversation-plan");
    domainSettlement.resolved = {
      kind: "plan",
      public: { questions: [] },
      source: {
        proposal: { runId: "run-plan", artifact: "proposals/run-plan/plan.md" },
        document: {
          documentId: "plan-document-1",
          sourceCanonicalItemId: "prose:codex:attempt:thread:turn:item",
          proposalHash: "proposal-hash",
        },
      },
    };

    await expect(settleConversationInteraction(project(), "conversation-plan", "interaction-plan", { action: "execute-plan" }))
      .rejects.toThrow("turn routing is not composed");
    expect(domainSettlement.postConversationMessage).not.toHaveBeenCalled();
  });
});

async function ensureHarnessConversation(conversationId: string): Promise<void> {
  const store = await openProjectRuntimeWorkbenchDatabase(runtime);
  const now = new Date().toISOString();
  try {
    if (store.conversations.readConversation(project().id, conversationId)) return;
    store.conversations.createConversation({
      projectId: project().id,
      conversationId,
      productMode: "harness",
      agentTurnMode: null,
      title: conversationId,
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: `scope-${conversationId}`,
      selectedProviderId: "codex",
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    store.conversations.initializeConversationGraphScope(project().id, conversationId, `scope-${conversationId}`, now);
  } finally {
    store.close();
  }
}

function testTurnRouter(): ConversationTurnRoutingPort {
  return {
    assertRequestedMode: vi.fn(),
    route: vi.fn(),
    resolveProviderId: (_project, requestedProviderId) => requestedProviderId ?? "codex",
    resolveRuntimeState: async (selectedProject) => ({
      state: "onboarding",
      project: selectedProject,
      projectRoot: selectedProject.path,
      paths: resolveProjectRuntimePaths(selectedProject.id, process.env.AHO_HOME ?? "C:\\aho-test"),
      reservedProjectId: selectedProject.id,
    }),
  };
}

async function providerInteraction(status: "pending" | "submitting" = "pending"): Promise<{ conversationId: string; interactionId: string }> {
  const conversation = await createWorkbenchConversation(project(), {
    body: "Wait for grouped answers.",
  }, undefined, { runMainAgent: false });
  const store = await openProjectRuntimeWorkbenchDatabase(runtime);
  const graphScopeId = store.conversations.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? "";
  const entry = {
    id: "provider-input-message",
    type: "assistant.message" as const,
    timestamp: "2026-07-16T00:00:00.000Z",
    conversationId: conversation.conversationId,
    graphScopeId,
    changeId: "",
    text: "请选择。",
    status,
    providerUserInput: {
      providerId: "codex" as const,
      requestKey: "request-key-1",
      requestId: "request-1",
      runId: "run-1",
      attemptId: "run-1",
      runtimeScopeId: conversation.conversationId,
      threadId: "thread-main",
      turnId: "turn-main",
      conversationId: conversation.conversationId,
      graphScopeId,
      questions: [
        {
          id: "choice",
          question: "继续吗？",
          inputMode: "single" as const,
          allowCustom: false,
          options: [{ value: "continue", label: "继续", description: "继续当前工作" }],
        },
        {
          id: "token",
          question: "访问令牌",
          inputMode: "secret" as const,
          allowCustom: true,
          options: [],
        },
      ],
      status,
    },
  };
  try {
    store.timeline.appendMessage({
      projectId: project().id,
      conversationId: conversation.conversationId,
      agentSurfaceId: "main-agent",
      id: entry.id,
      changeId: "",
      type: entry.type,
      timestamp: entry.timestamp,
      text: entry.text,
      status,
      rawJson: JSON.stringify(entry),
    });
  } finally {
    store.close();
  }
  const queue = await buildConversationInteractionQueue(runtime, conversation.conversationId, graphScopeId, "harness");
  return { conversationId: conversation.conversationId, interactionId: queue.items[0]!.interactionId };
}

function project(): ManagedProject {
  return { id: "repo", name: "Repo", path: root, addedAt: "2026-07-16T00:00:00.000Z", lastSeenAt: "2026-07-16T00:00:00.000Z", defaultProviderId: "codex" };
}
