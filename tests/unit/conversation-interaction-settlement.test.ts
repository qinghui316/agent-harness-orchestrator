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
vi.mock("../../src/workbench/chat.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/workbench/chat.js")>();
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

import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { git } from "../../src/project/git.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createWorkbenchConversation } from "../../src/workbench/chat.js";
import { settleConversationInteraction } from "../../src/workbench/conversation-interaction-service.js";
import { buildConversationInteractionQueue } from "../../src/workbench/conversation-interactions.js";
import { WorkbenchStore } from "../../src/workbench/store.js";

let root: string;
let originalAhoHome: string | undefined;

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
  await initHarness(project());
});

afterEach(async () => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
  await rm(root, { recursive: true, force: true });
});

describe("conversation interaction settlement", () => {
  it("routes grouped answers to the active provider turn and persists only redacted secret history", async () => {
    const fixture = await providerInteraction();
    providerAnswer.mockResolvedValue(undefined);

    await settleConversationInteraction(project(), fixture.conversationId, fixture.interactionId, {
      action: "answer",
      answers: { choice: "continue", token: "top-secret-value" },
      skippedQuestionIds: [],
    });

    expect(activeTurn).toHaveBeenCalledWith(fixture.conversationId);
    expect(providerAnswer).toHaveBeenCalledWith(
      "request-1",
      { answers: { choice: "continue", token: "top-secret-value" } },
      expect.objectContaining({ runId: "run-1", threadId: "thread-main", turnId: "turn-main" }),
    );
    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    try {
      const request = store.readProviderUserInputRequest(project().id, fixture.conversationId, "request-key-1");
      expect(request).toMatchObject({
        status: "submitted",
        publicAnswers: { choice: "continue", token: "已提供敏感信息" },
        disposition: "answered",
      });
      expect(store.listConversationMessages(project().id, fixture.conversationId).map((item) => item.rawJson).join("\n"))
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
    })).rejects.toThrow("提交结果尚未确认");
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

    await expect(settleConversationInteraction(project(), fixture.conversationId, fixture.interactionId, settlement))
      .rejects.toThrow("transport outcome unknown");

    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    try {
      expect(store.readProviderUserInputRequest(project().id, fixture.conversationId, "request-key-1")?.status).toBe("submitting");
      expect(store.listConversationMessages(project().id, fixture.conversationId).map((item) => item.rawJson).join("\n"))
        .not.toContain("must-not-replay");
    } finally {
      store.close();
    }

    await expect(settleConversationInteraction(project(), fixture.conversationId, fixture.interactionId, settlement))
      .rejects.toThrow("提交结果尚未确认");
    expect(providerAnswer).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale interaction after the graph scope changes", async () => {
    const fixture = await providerInteraction();
    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    try {
      store.startConversationGraphScope(project().id, fixture.conversationId, "scope-next", new Date().toISOString());
    } finally {
      store.close();
    }

    await expect(settleConversationInteraction(project(), fixture.conversationId, fixture.interactionId, {
      action: "skip",
    })).rejects.toThrow("已经处理、过期或不属于当前需求");
    expect(providerAnswer).not.toHaveBeenCalled();
  });

  it("delegates clarification answer and skip to the intake owner", async () => {
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

    await settleConversationInteraction(project(), "conversation-plan", "interaction-plan", { action: "execute-plan" });
    await settleConversationInteraction(project(), "conversation-plan", "interaction-plan", { action: "revise-plan", feedback: "补充回滚验证" });
    await settleConversationInteraction(project(), "conversation-plan", "interaction-plan", { action: "skip" });

    expect(domainSettlement.postConversationMessage.mock.calls.map((call) => call[2].planHandoffIntent)).toEqual([
      expect.objectContaining({ kind: "execute-plan", sourceRunId: "run-plan", sourceDocumentId: "plan-document-1", sourceProposalHash: "proposal-hash" }),
      expect.objectContaining({ kind: "revise-plan", feedback: "补充回滚验证", sourceCanonicalItemId: "prose:codex:attempt:thread:turn:item" }),
      expect.objectContaining({ kind: "skip-plan", feedback: undefined, sourceDocumentId: "plan-document-1" }),
    ]);
  });
});

async function providerInteraction(status: "pending" | "submitting" = "pending"): Promise<{ conversationId: string; interactionId: string }> {
  const conversation = await createWorkbenchConversation(project(), {
    title: "Interaction settlement",
    body: "Wait for grouped answers.",
  }, undefined, { runMainAgent: false });
  const memory = await resolveProjectMemory(project());
  const store = await WorkbenchStore.open(memory);
  const graphScopeId = store.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? "";
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
    store.appendMessage({
      projectId: project().id,
      conversationId: conversation.conversationId,
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
  const queue = await buildConversationInteractionQueue(memory, conversation.conversationId, graphScopeId);
  return { conversationId: conversation.conversationId, interactionId: queue.items[0]!.interactionId };
}

function project(): ManagedProject {
  return { id: "repo", name: "Repo", path: root, addedAt: "2026-07-16T00:00:00.000Z", lastSeenAt: "2026-07-16T00:00:00.000Z" };
}
