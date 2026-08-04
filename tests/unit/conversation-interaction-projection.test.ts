import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git } from "../../src/project/git.js";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createWorkbenchConversation } from "../../src/workbench/conversation-service.js";
import { fromStoredThreadMessage } from "../../src/workbench/conversation-thread-log.js";
import { buildConversationInteractionQueue } from "../../src/workbench/conversation-interactions.js";
import { canonicalTranscriptCellsFromThreadItem } from "../../src/workbench/parent-agent-transcript.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import type { WorkbenchDatabase } from "../../src/workbench/persistence/database.js";
import { type StoredTopicMessage } from "../../src/workbench/persistence/contracts.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";

let root: string;
let originalAhoHome: string | undefined;
let runtime: ProjectRuntimePaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-interaction-projection-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, ".aho-home");
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "aho-test@example.invalid"]);
  await git(root, ["config", "user.name", "AHO Test"]);
  await writeFile(join(root, "package.json"), "{\"name\":\"interaction-projection-fixture\"}\n", "utf8");
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

describe("conversation interaction projection", () => {
  it("projects only current-scope pending interactions in canonical order without provider routing identity", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      body: "Project pending questions.",
    }, undefined, { runMainAgent: false });
    const store = await openProjectRuntimeWorkbenchDatabase(runtime);
    const graphScopeId = store.conversations.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? "";
    try {
      appendProviderQuestion(store, conversation.conversationId, "old-scope", "old", "q-old");
      appendProviderQuestion(store, conversation.conversationId, graphScopeId, "expired", "q-expired", "2020-01-01T00:00:00.000Z");
      appendProviderQuestion(store, conversation.conversationId, graphScopeId, "first", "q-first");
      appendProviderQuestion(store, conversation.conversationId, graphScopeId, "second", "q-second");
    } finally {
      store.close();
    }

    const queue = await buildConversationInteractionQueue(runtime, conversation.conversationId, graphScopeId);

    expect(queue.items.map((item) => item.questions[0]?.questionId)).toEqual(["q-first", "q-second"]);
    expect(queue.items.every((item, index, items) => index === 0 || item.canonicalSequence > items[index - 1]!.canonicalSequence)).toBe(true);
    const publicJson = JSON.stringify(queue);
    expect(publicJson).not.toContain("request-key");
    expect(publicJson).not.toContain("thread-secret");
    expect(publicJson).not.toContain("turn-secret");
    expect(publicJson).not.toContain("providerId");
    expect(publicJson).not.toContain("requestId");
    expect(publicJson).not.toContain("expiresAt");

    const transitionStore = await openProjectRuntimeWorkbenchDatabase(runtime);
    try {
      transitionStore.unitOfWork.startConversationGraphScope(project().id, conversation.conversationId, "scope-next", "2026-07-16T00:00:03.000Z");
      expect(transitionStore.interactions.readProviderUserInputRequest(project().id, conversation.conversationId, "request-key-first")?.status).toBe("superseded");
      expect(transitionStore.interactions.readProviderUserInputRequest(project().id, conversation.conversationId, "request-key-second")?.status).toBe("superseded");
    } finally {
      transitionStore.close();
    }
    expect((await buildConversationInteractionQueue(runtime, conversation.conversationId, "scope-next")).items).toEqual([]);
  });

  it("terminalizes provider, clarification, and Plan interactions with the graph scope", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      body: "Finish every pending interaction with the objective.",
    }, undefined, { runMainAgent: false });
    const store = await openProjectRuntimeWorkbenchDatabase(runtime);
    const graphScopeId = store.conversations.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? "";
    try {
      appendProviderQuestion(store, conversation.conversationId, graphScopeId, "terminal", "q-terminal");
      appendInteractionFact(store, conversation.conversationId, {
        id: "clarification-terminal",
        graphScopeId,
        status: "pending",
        clarification: {
          clarificationId: "clarification-terminal",
          status: "pending",
          questions: [{ id: "clarify", question: "补充范围？" }],
        },
      });
      appendInteractionFact(store, conversation.conversationId, {
        id: "plan-terminal",
        graphScopeId,
        status: "planning-agent-generated",
        agentRoleId: "planning-agent",
        artifact: "workbench/proposals/terminal-plan.json",
      });

      const committed = store.unitOfWork.terminalizeConversationGraphScope(
        project().id,
        conversation.conversationId,
        graphScopeId,
        "2026-07-16T00:00:04.000Z",
      );
      expect(committed).toHaveLength(3);
      expect(committed.map((row) => row.status).sort()).toEqual(["expired", "superseded", "superseded"]);
      expect(store.conversations.isConversationGraphScopeTerminal(project().id, graphScopeId)).toBe(true);
      expect(store.interactions.readProviderUserInputRequest(project().id, conversation.conversationId, "request-key-terminal")?.status).toBe("superseded");
    } finally {
      store.close();
    }

    expect((await buildConversationInteractionQueue(runtime, conversation.conversationId, graphScopeId)).items).toEqual([]);
  });

  it.each(["interrupted", "superseded"] as const)("retains %s provider input as read-only history", (status) => {
    const providerUserInput = {
      providerId: "codex",
      requestKey: "request-key-history",
      requestId: "request-history",
      runId: "run-history",
      attemptId: "attempt-history",
      runtimeScopeId: "conversation-history",
      questions: [],
      status,
    };
    const entry = fromStoredThreadMessage({
      id: "message-history",
      projectId: "repo",
      conversationId: "conversation-history",
      changeId: "",
      position: 1,
      type: "assistant.message",
      timestamp: "2026-07-16T00:00:00.000Z",
      text: "历史问题",
      actionRunId: null,
      actionType: null,
      status,
      runId: "run-history",
      providerId: "codex",
      threadId: "thread-history",
      turnId: "turn-history",
      itemId: "item-history",
      artifact: null,
      error: null,
      rawJson: JSON.stringify({ providerUserInput }),
    } satisfies StoredTopicMessage);

    expect(entry.providerUserInput?.status).toBe(status);
  });

  it("removes terminal provider requests from the active queue and keeps one history record", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      body: "Do not leave a stale dock.",
    }, undefined, { runMainAgent: false });
    const store = await openProjectRuntimeWorkbenchDatabase(runtime);
    const graphScopeId = store.conversations.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? "";
    try {
      appendProviderQuestion(store, conversation.conversationId, graphScopeId, "terminal", "q-terminal");
      expect(store.interactions.terminalizeProviderUserInputRequests(project().id, conversation.conversationId, "run-terminal", "2026-07-16T00:00:04.000Z")).toHaveLength(1);
      const entry = fromStoredThreadMessage(store.timeline.listConversationMessages(project().id, conversation.conversationId)[1]!);
      const cells = canonicalTranscriptCellsFromThreadItem(entry);
      expect(cells).toEqual([expect.objectContaining({
        id: "cell:provider-user-input:request-key-terminal",
        interactionHistory: expect.objectContaining({ status: "interrupted" }),
      })]);
    } finally {
      store.close();
    }

    expect((await buildConversationInteractionQueue(runtime, conversation.conversationId, graphScopeId)).items).toEqual([]);
  });
});

function appendProviderQuestion(
  store: WorkbenchDatabase,
  conversationId: string,
  graphScopeId: string,
  suffix: string,
  questionId: string,
  expiresAt?: string,
): void {
  const entry = {
    id: `provider-input-${suffix}`,
    type: "assistant.message" as const,
    timestamp: `2026-07-16T00:00:0${suffix === "old" ? "0" : suffix === "first" ? "1" : "2"}.000Z`,
    conversationId,
    graphScopeId,
    changeId: "",
    text: "请选择。",
    status: "pending",
    providerUserInput: {
      providerId: "codex" as const,
      requestKey: `request-key-${suffix}`,
      requestId: `request-${suffix}`,
      runId: `run-${suffix}`,
      attemptId: `run-${suffix}`,
      runtimeScopeId: conversationId,
      threadId: "thread-secret",
      turnId: "turn-secret",
      conversationId,
      graphScopeId,
      questions: [{
        id: questionId,
        question: `Question ${suffix}`,
        inputMode: "single" as const,
        allowCustom: false,
        options: [{ value: "yes", label: "继续", description: "继续当前工作" }],
      }],
      ...(expiresAt ? { expiresAt } : {}),
      status: "pending" as const,
    },
  };
  store.timeline.appendMessage({
    projectId: project().id,
    conversationId,
    agentSurfaceId: "main-agent",
    id: entry.id,
    changeId: "",
    type: entry.type,
    timestamp: entry.timestamp,
    text: entry.text,
    status: entry.status,
    rawJson: JSON.stringify(entry),
  });
}

function appendInteractionFact(
  store: WorkbenchDatabase,
  conversationId: string,
  fact: Record<string, unknown> & { id: string; graphScopeId: string; status: string },
): void {
  const timestamp = "2026-07-16T00:00:03.000Z";
  store.timeline.appendMessage({
    projectId: project().id,
    conversationId,
    agentSurfaceId: "main-agent",
    id: fact.id,
    changeId: "",
    type: "assistant.message",
    timestamp,
    text: fact.id,
    status: fact.status,
    artifact: typeof fact.artifact === "string" ? fact.artifact : null,
    rawJson: JSON.stringify({
      type: "assistant.message",
      timestamp,
      conversationId,
      changeId: "",
      ...fact,
    }),
  });
}

function project(): ManagedProject {
  return { id: "repo", name: "Repo", path: root, addedAt: "2026-07-16T00:00:00.000Z", lastSeenAt: "2026-07-16T00:00:00.000Z" };
}
