import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindProviderThreadFixture } from "../helpers/provider-thread-fixture.js";

const appServerTurn = vi.hoisted(() => vi.fn());
const appServerAnswer = vi.hoisted(() => vi.fn());
const getActiveAppServerTurn = vi.hoisted(() => vi.fn());
vi.mock("../../src/codex/app-server.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/codex/app-server.js")>();
  return {
    ...actual,
    detectCodexAppServerCapability: vi.fn(async () => ({
      available: true,
      supportsStdio: true,
      supportsRequiredLifecycle: true,
      nativeCollab: { multiAgent: "enabled", multiAgentV2: "enabled", configPath: "test", errors: [] },
      help: "codex app server --listen stdio://",
      errors: [],
    })),
    runCodexAppServerTurn: appServerTurn,
    getActiveCodexAppServerTurn: getActiveAppServerTurn,
  };
});

vi.mock("../../src/codex/capabilities.js", () => ({
  detectCodexCapabilities: vi.fn(async () => readyCodexCapabilities()),
}));

import { initHarness } from "../../src/harness/init.js";
import { normalizeCodexAppServerNotification } from "../../src/codex/app-server-realtime.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { defaultProviderRegistry } from "../../src/provider-runtime/index.js";
import { git } from "../../src/project/git.js";
import type { ManagedProject } from "../../src/types/index.js";
import { appendConversationThreadEntry, createWorkbenchConversation, listConversationMessages, postConversationMessage, resumeNativeGoalAfterAction, runWorkbenchWorkflowAction } from "../../src/workbench/chat.js";
import { buildConversationInteractionQueue } from "../../src/workbench/conversation-interactions.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { getWorkbenchAgentRelationGraphProjection, getWorkbenchTranscriptProjection } from "../../src/workbench/projections/read-model/implementation.js";
import { readLatestWorkflowGraphPlan } from "../../src/workflow-artifacts/manager.js";
import { WorkbenchStore } from "../../src/workbench/store.js";
import { planDocumentContentHash } from "../../src/workbench/plan-documents.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";

let root: string;
let originalAhoHome: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-provider-planning-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, ".aho-home");
  appServerTurn.mockReset();
  appServerAnswer.mockReset();
  getActiveAppServerTurn.mockReset();
  getActiveAppServerTurn.mockImplementation((runId: string) => ({
    changeId: "",
    runtimeScopeId: "conversation-1",
    roleId: "main-agent",
    runId,
    threadId: "thread-child",
    turnId: "turn-child",
    startedAt: "2026-07-15T00:00:00.000Z",
    steer: vi.fn(),
    interrupt: vi.fn(),
    respondToUserInput: appServerAnswer,
  }));
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "aho-test@example.invalid"]);
  await git(root, ["config", "user.name", "AHO Test"]);
  await writeFile(join(root, "package.json"), "{\"name\":\"provider-planning-fixture\"}\n", "utf8");
  await git(root, ["add", "package.json"]);
  await git(root, ["commit", "-m", "fixture baseline"]);
  await initHarness(project());
});

afterEach(async () => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
  await rm(root, { recursive: true, force: true });
});

describe("Workbench provider planning flow", () => {
  it("claims only the latest matching resume attempt and terminalizes older queued attempts", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      title: "Resume attempt cleanup",
      body: "Continue later.",
    }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const capabilitySnapshot = await defaultProviderRegistry.get("codex").capabilitySnapshot(project(), root);
    const store = await WorkbenchStore.open(memory);
    const stored = store.readConversation(project().id, conversation.conversationId)!;
    const baseAttempt = {
      projectId: project().id,
      conversationId: conversation.conversationId,
      graphScopeId: stored.currentGraphScopeId,
      changeId: null,
      agentTaskId: null,
      roleId: "main-agent",
      operationProfile: "main" as const,
      providerId: "codex",
      nativeSessionId: null,
      model: null,
      capabilitySnapshot,
      deliveredThroughCompletedTurn: 0,
      worktreeId: null,
      status: "queued" as const,
    };
    try {
      store.writeProviderResumePoint({ projectId: project().id, conversationId: conversation.conversationId, resumePointId: "resume-old", graphScopeId: stored.currentGraphScopeId, changeId: null, previousProviderId: "alpha", targetProviderId: "codex", snapshotJson: "{}", snapshotHash: "old-hash", createdAt: "2026-07-15T00:00:00.000Z" });
      store.createProviderAttempt({ ...baseAttempt, attemptId: "attempt-resume-old", handoffHash: "old-hash", createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z" });
      store.writeProviderResumePoint({ projectId: project().id, conversationId: conversation.conversationId, resumePointId: "resume-latest", graphScopeId: stored.currentGraphScopeId, changeId: null, previousProviderId: "alpha", targetProviderId: "codex", snapshotJson: "{}", snapshotHash: "latest-hash", createdAt: "2026-07-15T00:00:01.000Z" });
      store.createProviderAttempt({ ...baseAttempt, attemptId: "attempt-resume-latest", handoffHash: "latest-hash", createdAt: "2026-07-15T00:00:01.000Z", updatedAt: "2026-07-15T00:00:01.000Z" });
    } finally {
      store.close();
    }
    appServerTurn.mockResolvedValue({
      status: "completed",
      threadId: "thread-main-resumed",
      turnId: "turn-main-resumed",
      lastMessage: "已继续。",
      goal: nativeGoal("active"),
      childThreads: [],
      changedFiles: [],
      error: null,
    });

    await postConversationMessage(project(), conversation.conversationId, { mode: "chat", message: "继续。" });

    const verified = await WorkbenchStore.open(memory);
    try {
      expect(verified.listProviderAttempts(project().id, conversation.conversationId)).toEqual(expect.arrayContaining([
        expect.objectContaining({ attemptId: "attempt-resume-old", status: "interrupted" }),
        expect.objectContaining({ attemptId: "attempt-resume-latest", status: "completed" }),
      ]));
    } finally {
      verified.close();
    }
  });

  it("terminalizes a live Planning child attempt when the parent provider turn fails", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      title: "Planner failure cleanup",
      body: "Prepare a plan later.",
    }, undefined, { runMainAgent: false });
    appServerTurn.mockImplementationOnce(async (options) => {
      const identity = {
        runId: options.runId,
        threadId: "thread-planner-failed",
        parentThreadId: "thread-main-failed",
        turnId: "turn-planner-failed",
        roleId: "planning-agent",
      };
      for (const event of normalizeCodexAppServerNotification("turn/started", { turnId: identity.turnId }, identity)) {
        options.onRealtimeEvent?.(event);
      }
      throw new Error("provider disconnected after child start");
    });

    await expect(postConversationMessage(project(), conversation.conversationId, {
      mode: "chat",
      message: "请让 Plan Agent 编写计划。",
    })).rejects.toThrow("provider disconnected");

    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    try {
      const attempts = store.listProviderAttempts(project().id, conversation.conversationId);
      expect(attempts).toEqual(expect.arrayContaining([
        expect.objectContaining({ roleId: "main-agent", status: "failed" }),
        expect.objectContaining({ roleId: "planning-agent", nativeSessionId: "thread-planner-failed", status: "failed" }),
      ]));
      expect(attempts.some((attempt) => attempt.status === "running")).toBe(false);
    } finally {
      store.close();
    }
  });

  it("projects a native subAgentActivity target into the server-owned graph before the parent turn completes", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      title: "Live child graph",
      body: "Spawn one child later.",
    }, undefined, { runMainAgent: false });
    appServerTurn.mockImplementationOnce(async (options) => {
      const [started] = normalizeCodexAppServerNotification("item/completed", {
        item: {
          id: "call-live-child",
          type: "subAgentActivity",
          kind: "started",
          agentThreadId: "thread-live-child",
        },
      }, {
        projectId: project().id,
        conversationId: conversation.conversationId,
        runId: options.runId,
        threadId: "thread-live-main",
        turnId: "turn-live-main",
        roleId: "main-agent",
        targetThreadId: "thread-live-child",
        targetAgentDisplayName: "Child Agent",
      });
      options.onRealtimeEvent?.(started!);
      const graph = await getWorkbenchAgentRelationGraphProjection({ project: project(), path: root }, conversation.conversationId);
      expect(graph.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "agent:codex:thread:thread-live-child", label: "Child Agent", status: "running", parentAgentId: "main-agent" }),
      ]));
      throw new Error("stop after live child graph assertion");
    });

    await expect(postConversationMessage(project(), conversation.conversationId, "请创建子 Agent。"))
      .rejects.toThrow("stop after live child graph assertion");
  });

  it("lets a provider-resolved empty answer win the turn-completion race", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      title: "Resolved provider question",
      body: "Ask and continue.",
    }, undefined, { runMainAgent: false });
    appServerTurn.mockImplementationOnce(async (options) => {
      options.onUserInputRequest?.({
        requestId: "request-resolved-race",
        threadId: "thread-resolved-race",
        turnId: "turn-resolved-race",
        itemId: "item-resolved-race",
        runId: options.runId,
        runtimeScopeId: options.runtimeScopeId ?? conversation.conversationId,
        roleId: "main-agent",
        questions: [{ id: "choice", question: "继续吗？", options: [{ label: "继续" }] }],
      });
      options.onUserInputResolved?.({ requestId: "request-resolved-race", threadId: "thread-resolved-race" });
      return {
        status: "completed",
        threadId: "thread-resolved-race",
        turnId: "turn-resolved-race",
        lastMessage: "已根据现有信息继续。",
        goal: nativeGoal("active"),
        childThreads: [],
        changedFiles: [],
        error: null,
      };
    });

    await postConversationMessage(project(), conversation.conversationId, "请先提问。");

    const messages = await listConversationMessages(project(), conversation.conversationId);
    const resolved = messages.filter((message) => message.providerUserInput?.requestId === "request-resolved-race");
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.providerUserInput).toMatchObject({
      status: "submitted",
      disposition: "skipped",
      skippedQuestionIds: ["choice"],
    });
    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    const graphScopeId = store.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? "";
    store.close();
    expect((await buildConversationInteractionQueue(memory, conversation.conversationId, graphScopeId)).items).toEqual([]);
  });

  it("keeps supplemental turns in the same unbound demand scope", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      title: "Unbound multi-turn demand",
      body: "Start a simple demand.",
    }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const initialStore = await WorkbenchStore.open(memory);
    const initialScope = initialStore.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId;
    initialStore.close();
    appServerTurn.mockResolvedValue({
      status: "completed",
      threadId: "thread-main",
      turnId: "turn-supplement",
      lastMessage: "已处理补充要求。",
      childThreads: [],
    });

    await postConversationMessage(project(), conversation.conversationId, "补充第一个细节。");
    await postConversationMessage(project(), conversation.conversationId, "再补充第二个细节。");

    const finalStore = await WorkbenchStore.open(memory);
    try {
      expect(finalStore.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId).toBe(initialScope);
      expect(finalStore.listConversationMessages(project().id, conversation.conversationId)
        .map((message) => JSON.parse(message.rawJson).graphScopeId)
        .filter(Boolean)).toEqual(expect.arrayContaining([initialScope, initialScope]));
    } finally {
      finalStore.close();
    }
  });

  it("starts a clean graph after a simple native Goal reaches complete", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      title: "Simple completed demand",
      body: "Create a simple page.",
    }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const initialStore = await WorkbenchStore.open(memory);
    const initialScope = initialStore.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId;
    initialStore.close();
    appServerTurn
      .mockResolvedValueOnce({
        status: "completed",
        threadId: "thread-main",
        turnId: "turn-simple-complete",
        lastMessage: "简单需求已经完成。",
        goal: nativeGoal("complete"),
        childThreads: [],
      })
      .mockResolvedValueOnce({
        status: "completed",
        threadId: "thread-main",
        turnId: "turn-next-demand",
        lastMessage: "开始新的需求。",
        goal: nativeGoal("active"),
        childThreads: [],
      });

    await postConversationMessage(project(), conversation.conversationId, "完成这个简单需求。");
    await postConversationMessage(project(), conversation.conversationId, "这是一个新的顶层需求。");

    const finalStore = await WorkbenchStore.open(memory);
    try {
      expect(finalStore.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId).not.toBe(initialScope);
    } finally {
      finalStore.close();
    }
  });

  it("does not mark a proposal accepted when Main declines the acceptance tool", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Declined plan", body: "Plan this work." });
    const sourceCanonicalItemId = "prose:codex:attempt-declined:thread-plan:turn-plan:item-plan";
    const planText = "# Plan\n\nA proposal that Main still needs to inspect.";
    const document = {
      documentId: "plan-document-declined",
      documentKind: "plan" as const,
      title: "实现计划",
      sourceMessageId: "message-declined-plan",
      sourceCanonicalItemId,
      proposalId: "proposal-declined",
      proposalHash: "proposal-hash-declined",
      proposalArtifact: "workbench/proposals/declined-plan.json",
      contentHash: planDocumentContentHash(planText),
      agentSurfaceId: "agent:codex:thread:thread-plan",
    };
    await appendConversationThreadEntry(project(), topic.changeId, {
      type: "assistant.message",
      status: "planning-agent-generated",
      runId: "run-declined-plan",
      agentRoleId: "planning-agent",
      artifact: "workbench/proposals/declined-plan.json",
      document,
      blocks: [{
        id: sourceCanonicalItemId,
        providerId: "codex",
        attemptId: "attempt-declined",
        threadId: "thread-plan",
        turnId: "turn-plan",
        itemId: "item-plan",
        sequence: 1,
        kind: "prose",
        timestamp: "2026-07-16T00:00:00.000Z",
        source: "provider",
        text: planText,
        document,
      }],
    });
    appServerTurn.mockResolvedValueOnce({
      status: "completed",
      threadId: "thread-main",
      turnId: "turn-declined-plan",
      lastMessage: "当前计划还需要补充，不接受。",
      goal: nativeGoal("paused"),
      childThreads: [],
    });

    await postConversationMessage(project(), topic.conversationId, {
      mode: "chat",
      message: "执行当前计划",
      planHandoffIntent: {
        kind: "execute-plan",
        sourceRunId: "run-declined-plan",
        sourceAgentRoleId: "planning-agent",
        sourceArtifact: "workbench/proposals/declined-plan.json",
        sourceDocumentId: document.documentId,
        sourceCanonicalItemId,
        sourceProposalHash: document.proposalHash,
      },
    });

    const source = (await listConversationMessages(project(), topic.conversationId))
      .find((message) => message.artifact === "workbench/proposals/declined-plan.json");
    expect(source?.status).toBe("planning-agent-generated");
  });

  it("keeps one graph scope inside an active Change and starts clean after that Change ends", async () => {
    const conversation = await createWorkbenchConversation(project(), {
      title: "Scoped graph lifecycle",
      body: "Create the initial demand scope.",
    }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const changeId = "scope-lifecycle-change";
    await mkdir(join(memory.changesRoot, "active", changeId), { recursive: true });

    const store = await WorkbenchStore.open(memory);
    let initialScope: string;
    try {
      initialScope = store.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? "";
      expect(initialScope).not.toBe("");
      store.linkConversationChange(project().id, conversation.conversationId, changeId, new Date().toISOString());
      bindProviderThreadFixture(store, {
        projectId: project().id,
        conversationId: conversation.conversationId,
        providerId: "codex",
        providerThreadId: "thread-old-child",
        roleId: "planning-agent",
        parentThreadId: "thread-main",
        changeId,
        graphScopeId: initialScope,
        capabilityProfile: "planner-child-v1",
        updatedAt: new Date().toISOString(),
      });
    } finally {
      store.close();
    }

    appServerTurn
      .mockResolvedValueOnce({
        status: "completed",
        threadId: "thread-main",
        turnId: "turn-same-change",
        lastMessage: "继续处理当前 Change。",
        childThreads: [],
      })
      .mockResolvedValueOnce({
        status: "completed",
        threadId: "thread-main",
        turnId: "turn-next-demand",
        lastMessage: "开始处理新的顶层需求。",
        childThreads: [],
      });

    await postConversationMessage(project(), conversation.conversationId, "继续当前 Change 的同一项工作。");
    const sameChangeStore = await WorkbenchStore.open(memory);
    try {
      expect(sameChangeStore.readConversation(project().id, conversation.conversationId)).toMatchObject({
        boundChangeId: changeId,
        currentGraphScopeId: initialScope,
      });
    } finally {
      sameChangeStore.close();
    }

    await rm(join(memory.changesRoot, "active", changeId), { recursive: true, force: true });
    await postConversationMessage(project(), conversation.conversationId, "这是下一个独立的顶层需求。");
    const nextDemandStore = await WorkbenchStore.open(memory);
    try {
      const next = nextDemandStore.readConversation(project().id, conversation.conversationId);
      expect(next?.boundChangeId).toBeNull();
      expect(next?.currentGraphScopeId).not.toBe(initialScope);
      expect(nextDemandStore.listProviderThreads(project().id, conversation.conversationId))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ providerThreadId: "thread-old-child", graphScopeId: initialScope }),
          expect.objectContaining({ providerThreadId: "thread-main", graphScopeId: next?.currentGraphScopeId }),
        ]));
    } finally {
      nextDemandStore.close();
    }
  });

  it("lets the first external-local Main turn onboard through native Harness Skill facts", async () => {
    await Promise.all([
      rm(join(root, "AGENTS.md"), { force: true }),
      rm(join(root, "docs"), { recursive: true, force: true }),
      rm(join(root, "harness"), { recursive: true, force: true }),
      rm(join(root, "scripts"), { recursive: true, force: true }),
      rm(join(root, ".agent-harness"), { recursive: true, force: true }),
    ]);
    appServerTurn.mockImplementationOnce(async (options) => {
      const memory = await resolveProjectMemory(project());
      expect(options.prompt).toBe("请先判断这个空项目需要哪些说明文件。不要假设固定模板。");
      expect(options.requiredNativeSkills).toEqual(["aho-main-orchestration", "aho-harness-engineering"]);
      expect(options.skillInputs).toEqual([
        expect.objectContaining({ name: "aho-main-orchestration" }),
        expect.objectContaining({ name: "aho-harness-engineering" }),
      ]);
      expect(options.writableRoots).toEqual([root, memory.memoryRoot, expect.stringContaining("planner-proposal")]);
      expect(options.additionalContext?.["aho.harness-onboarding"]).toMatchObject({ kind: "application" });
      expect(JSON.parse(options.additionalContext?.["aho.project"]?.value ?? "{}").memoryRoot).toBe(memory.memoryRoot);
      return {
        status: "completed",
        threadId: "thread-first-onboarding",
        turnId: "turn-first-onboarding",
        lastMessage: "我会先根据项目实际情况建立必要说明。",
        goal: nativeGoal("active"),
        childThreads: [],
        changedFiles: [],
      };
    });

    const conversation = await createWorkbenchConversation(project(), {
      title: "空项目首次对话",
      body: "请先判断这个空项目需要哪些说明文件。不要假设固定模板。",
    });

    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(root, "docs"))).toBe(false);
    expect(existsSync(join(root, "harness"))).toBe(false);
    expect(existsSync(join(root, "scripts"))).toBe(false);
    expect(conversation.state).toBe("active");
  });

  it("keeps loading the native Harness Skill while a repo-local Harness is partial", async () => {
    await Promise.all([
      rm(join(root, "AGENTS.md"), { force: true }),
      rm(join(root, "docs"), { recursive: true, force: true }),
      rm(join(root, "harness"), { recursive: true, force: true }),
      rm(join(root, "scripts"), { recursive: true, force: true }),
    ]);
    appServerTurn.mockImplementationOnce(async (options) => {
      expect(options.requiredNativeSkills).toEqual(["aho-main-orchestration", "aho-harness-engineering"]);
      expect(options.skillInputs).toEqual([
        expect.objectContaining({ name: "aho-main-orchestration" }),
        expect.objectContaining({ name: "aho-harness-engineering" }),
      ]);
      return {
        status: "completed",
        threadId: "thread-partial-onboarding",
        turnId: "turn-partial-onboarding",
        lastMessage: "继续补齐 Harness。",
        goal: nativeGoal("active"),
        childThreads: [],
        changedFiles: [],
      };
    });

    await createWorkbenchConversation(project(), {
      title: "Partial Harness continuation",
      body: "继续补齐 Harness。",
    });
  });

  it("resumes the bound native Goal from committed post-apply evidence", async () => {
    const conversation = await createConversationChangeFixture(project(), { title: "Post apply continuity", body: "Apply and finalize." });
    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    const changeId = conversation.changeId;
    const graphScopeId = store.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? null;
    bindProviderThreadFixture(store, {
      projectId: project().id,
      conversationId: conversation.conversationId,
      providerId: "codex",
      providerThreadId: "thread-main",
      roleId: "main-agent",
      parentThreadId: null,
      changeId,
      graphScopeId,
      capabilityProfile: "main-agent-goal-v1",
      updatedAt: new Date().toISOString(),
    });
    store.close();
    appServerTurn.mockImplementationOnce(async (options) => {
      expect(options.goalResume).toMatchObject({
        deliveryKey: expect.stringMatching(/^approval:result\.apply:/),
        contextText: expect.stringContaining('"actionType": "result.apply"'),
      });
      return {
        status: "completed", threadId: "thread-main", turnId: "turn-post-apply",
        lastMessage: "Applied result is ready for finalization.", goal: nativeGoal("blocked"), childThreads: [],
      };
    });

    await resumeNativeGoalAfterAction({
      project: project(), changeId, actionRunId: "approval:result.apply:wt-1", actionType: "result.apply",
      status: "completed", result: { apply: { status: "applied", committed: true, commitHash: "abc" } },
    });

    expect(appServerTurn).toHaveBeenCalledTimes(1);
  });

  it("persists the complete parent message before failing closed when planning has no native Goal", async () => {
    appServerTurn.mockImplementationOnce(async (options) => {
      await writePlannerFiles(options.writableRoots?.[0] ?? "");
      const text = "规划子 Agent 已返回完整方案。\n当前还缺少可继续执行的目标状态。";
      emitCanonicalMainText(options, text, "thread-main", "turn-plan-without-goal", "message-no-goal");
      return {
        status: "failed",
        threadId: "thread-main",
        turnId: "turn-plan-without-goal",
        lastMessage: text,
        error: "Native Goal was not created.",
        goal: null,
        childThreads: [{
          itemId: "item-spawn-planner",
          tool: "spawn_agent",
          parentThreadId: "thread-main",
          threadId: "thread-planner",
          prompt: `Write the proposal files under ${options.writableRoots?.[0] ?? "planner-proposal"}`,
          status: "completed",
          finalText: plannerPlanText(),
          changedFiles: [
            join(options.writableRoots?.[0] ?? "", "spec.md"),
            join(options.writableRoots?.[0] ?? "", "plan.md"),
            join(options.writableRoots?.[0] ?? "", "tasks.md"),
          ],
          snapshot: {},
        }],
      };
    });

    const creation = createWorkbenchConversation(project(), {
      title: "Planner without Goal",
      body: "Create a structured health endpoint change.",
    });
    await expect(creation).rejects.toThrow("requires a native Goal");

    await creation.catch(() => undefined);
    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    let conversationId = "";
    try {
      const conversations = store.listConversations(project().id);
      expect(conversations).toHaveLength(1);
      conversationId = conversations[0]?.conversationId ?? "";
    } finally {
      store.close();
    }
    const messages = await listConversationMessages(project(), conversationId);
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "assistant.message",
        text: "规划子 Agent 已返回完整方案。\n当前还缺少可继续执行的目标状态。",
      }),
    ]));
  });

  it("persists one Main Plan document reference when the provider returns no parent prose", async () => {
    appServerTurn.mockImplementationOnce(async (options) => {
      await writePlannerFiles(options.writableRoots?.[0] ?? "");
      emitCanonicalPlannerText(options, plannerPlanText(), "thread-main-empty-prose", "thread-planner-empty-prose", "turn-planner-empty-prose", "message-planner-empty-prose");
      return {
        status: "completed",
        threadId: "thread-main-empty-prose",
        turnId: "turn-main-empty-prose",
        lastMessage: "",
        goal: nativeGoal("active"),
        childThreads: [{
          itemId: "item-spawn-empty-prose-planner",
          tool: "spawn_agent",
          parentThreadId: "thread-main-empty-prose",
          threadId: "thread-planner-empty-prose",
          status: "completed",
          displayName: "Sagan",
          finalText: plannerPlanText(),
          changedFiles: [
            join(options.writableRoots?.[0] ?? "", "spec.md"),
            join(options.writableRoots?.[0] ?? "", "plan.md"),
            join(options.writableRoots?.[0] ?? "", "tasks.md"),
          ],
          snapshot: {},
        }],
      };
    });

    const conversation = await createWorkbenchConversation(project(), {
      title: "Planner without Main prose",
      body: "Plan a small but structured change.",
    });
    const messages = await listConversationMessages(project(), conversation.conversationId);
    const marker = messages.find((message) => message.blocks?.some((block) => block.documentRef?.documentKind === "plan"));
    expect(marker).toMatchObject({
      type: "assistant.message",
      threadId: "thread-main-empty-prose",
      turnId: "turn-main-empty-prose",
    });
    expect(marker?.blocks).toEqual([
      expect.objectContaining({
        kind: "tool-result",
        title: "实现计划",
        documentRef: expect.objectContaining({ documentId: expect.stringMatching(/^plan-document-/) }),
      }),
    ]);
    const transcript = await getWorkbenchTranscriptProjection({ project: project(), path: root }, conversation.conversationId);
    expect(transcript.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "document-preview", title: "实现计划" }),
    ]));
  });

  it("carries a real planner-child result through execute intent into an accepted graph and concrete gate", async () => {
    let continueDeliveryKey = "";
    appServerTurn
      .mockImplementationOnce(async (options) => {
        expect(options.skillInputs).toEqual([
          expect.objectContaining({ name: "aho-main-orchestration", path: expect.stringContaining("aho-main-orchestration") }),
        ]);
        expect(options.nativeSkillRoots).toEqual([expect.stringContaining("system-skills")]);
        expect(options.requiredNativeSkills).toEqual(["aho-main-orchestration"]);
        expect(options.runtimeWorkspaceRoots).toEqual(expect.arrayContaining([expect.stringContaining("planner-proposal")]));
        expect(options.writableRoots).toEqual([expect.stringContaining("planner-proposal")]);
        await writePlannerFiles(options.writableRoots[0]);
        const childIdentity = {
          projectId: "repo",
          conversationId: "conversation-live",
          runId: options.runId,
          threadId: "thread-planner",
          parentThreadId: "thread-main",
          turnId: "turn-planner",
          roleId: "child-agent",
          displayName: "Newton",
        };
        const childNotifications: Array<[string, Record<string, unknown>]> = [
          ["turn/started", { turnId: "turn-planner" }],
          ["item/reasoning/summaryTextDelta", { itemId: "reason-1", delta: "正在检查需求边界" }],
          ["item/started", { item: { id: "cmd-1", type: "commandExecution", command: "Get-Content index.html" } }],
          ["item/completed", { item: { id: "cmd-1", type: "commandExecution", command: "Get-Content index.html", aggregatedOutput: "ok", exitCode: 0 } }],
          ["item/completed", { item: { id: "file-1", type: "fileChange", path: "plan.md", status: "completed" } }],
          ["item/agentMessage/delta", { itemId: "message-1", delta: plannerPlanText() }],
          ["turn/completed", { turnId: "turn-planner" }],
        ];
        for (const [method, params] of childNotifications) {
          for (const event of normalizeCodexAppServerNotification(method, params, childIdentity)) options.onRealtimeEvent?.(event);
        }
        const messagesBeforeChildInput = await listConversationMessages(project(), options.conversationId ?? "");
        const childProcessPosition = messagesBeforeChildInput.find(
          (message) => message.type === "assistant.message" && message.threadId === "thread-planner",
        )?.position;
        options.onChildThreadResult?.({
          itemId: "item-spawn-planner",
          tool: "spawn_agent",
          parentThreadId: "thread-main",
          threadId: "thread-planner",
          status: "running",
          prompt: "Draft the exact proposal.",
          initialUserItem: { turnId: "turn-planner", itemId: "item-child-input", text: "Draft the exact proposal." },
          displayName: "Newton",
          finalText: "",
          changedFiles: [],
          snapshot: {},
        });
        const liveMessages = await listConversationMessages(project(), options.conversationId ?? "");
        const liveChildInput = liveMessages.find((message) => message.type === "user.message" && message.threadId === "thread-planner");
        expect(liveChildInput).toMatchObject({
          id: expect.stringContaining(":turn-planner:item-child-input"),
          attemptId: expect.stringContaining(":child:thread-planner"),
          turnId: "turn-planner",
          itemId: "item-child-input",
          text: "Draft the exact proposal.",
        });
        const liveChildProcess = liveMessages.filter((message) => message.type === "assistant.message" && message.threadId === "thread-planner" && !message.artifact);
        expect(liveChildProcess).toHaveLength(1);
        expect(liveChildProcess[0]?.position).toBe(childProcessPosition);
        expect(liveChildProcess[0]).toMatchObject({
          status: "completed",
          turnId: "turn-planner",
          agentRoleId: "child-agent",
        });
        expect(liveChildProcess[0]?.blocks?.map((block) => block.kind)).toEqual(expect.arrayContaining([
          "reasoning-summary", "command", "file-change", "prose",
        ]));
        const liveMemory = await resolveProjectMemory(project());
        const liveStore = await WorkbenchStore.open(liveMemory);
        try {
          expect(liveStore.listProviderAttempts(project().id, options.conversationId ?? "")).toEqual(expect.arrayContaining([
            expect.objectContaining({ roleId: "child-agent", operationProfile: "main", nativeSessionId: "thread-planner", status: "running" }),
          ]));
        } finally {
          liveStore.close();
        }
        expect(options.dynamicTools).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "aho_finalize_current_change", inputSchema: expect.objectContaining({ additionalProperties: false }) }),
        ]));
        emitCanonicalMainText(options, "计划子 Agent 已返回方案。\n我还会把当前限制和验收事实一并说明。", "thread-main", "turn-plan", "message-plan");
        return {
          status: "completed",
          threadId: "thread-main",
          turnId: "turn-plan",
          lastMessage: "计划子 Agent 已返回方案。\n我还会把当前限制和验收事实一并说明。",
          goal: nativeGoal("active"),
          childThreads: [{
            itemId: "item-spawn-planner",
            tool: "spawn_agent",
            parentThreadId: "thread-main",
            threadId: "thread-planner",
            status: "completed",
            displayName: "Newton",
            finalText: plannerPlanText(),
            changedFiles: [
              `${options.writableRoots[0]}/spec.md`,
              `${options.writableRoots[0]}/plan.md`,
              `${options.writableRoots[0]}/tasks.md`,
            ],
            snapshot: {},
          }],
        };
      })
      .mockImplementationOnce(async (options) => {
        expect(options.goalResume).toMatchObject({
          deliveryKey: expect.stringMatching(/^plan-handoff:/),
          contextText: expect.stringContaining("执行当前计划"),
        });
        const accepted = await options.onDynamicToolCall?.({
          requestId: "request-accept",
          threadId: "thread-main",
          turnId: "turn-accept",
          callId: "call-accept",
          tool: "aho_accept_current_plan",
          arguments: {},
        });
        expect(accepted).toMatchObject({ success: true });
        emitCanonicalMainText(options, "计划已接受，等待当前执行确认。", "thread-main", "turn-accept", "message-accept");
        return {
          status: "completed",
          threadId: "thread-main",
          turnId: "turn-accept",
          lastMessage: "计划已接受，等待当前执行确认。",
          goal: nativeGoal("paused"),
          childThreads: [],
        };
      })
      .mockImplementationOnce(async (options) => {
        expect(options.prompt).toContain("Continue the accepted health endpoint Goal.");
        expect(options.goalResume).toMatchObject({
          deliveryKey: expect.stringMatching(/^conversation-continue:/),
          contextText: expect.stringContaining("The user explicitly requested continuation"),
        });
        continueDeliveryKey = options.goalResume?.deliveryKey ?? "";
        return {
          status: "completed",
          threadId: "thread-main",
          turnId: "turn-continue",
          lastMessage: "继续检查当前目标。",
          goal: nativeGoal("blocked"),
          childThreads: [],
        };
      });

    const conversation = await createWorkbenchConversation(project(), {
      title: "Add health endpoint",
      body: "Add GET /healthz returning status ok and add a regression test.",
    });
    const messages = await listConversationMessages(project(), conversation.conversationId);
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "assistant.message",
        text: "计划子 Agent 已返回方案。\n我还会把当前限制和验收事实一并说明。",
      }),
    ]));
    const plan = messages.find((message) => message.agentRoleId === "planning-agent" && message.document?.documentKind === "plan");
    expect(plan).toMatchObject({ runId: expect.any(String), agentRoleId: "planning-agent" });
    expect(plan?.graphScopeId).toBeTruthy();
    expect(plan?.document).toMatchObject({ proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/), sourceCanonicalItemId: expect.stringContaining(":message-1") });
    const proposalSnapshot = await getWorkbenchSnapshot({ project: project(), path: root }, { topicId: conversation.conversationId });
    expect(proposalSnapshot.center.conversationInteractions.items).toEqual([
      expect.objectContaining({ kind: "plan", graphScopeId: plan?.graphScopeId }),
    ]);
    const plannerWorkspace = proposalSnapshot.right.agentWorkspace.agents.find((agent) => agent.providerThreadId === "thread-planner");
    expect(plannerWorkspace?.transcript.cells[0]).toMatchObject({
      kind: "user-message",
      source: "provider-runtime",
      providerId: "codex",
      turnId: "turn-planner",
      itemId: "item-child-input",
      text: "Draft the exact proposal.",
    });
    const childTimeline = messages.filter((message) => message.agentRoleId === "planning-agent" && message.threadId === "thread-planner");
    expect(childTimeline).toHaveLength(1);
    expect(childTimeline[0]).toMatchObject({ parentThreadId: "thread-main", turnId: "turn-planner", artifact: expect.stringContaining("planner-proposal") });
    expect(childTimeline[0]?.blocks?.map((block) => block.kind)).toEqual(expect.arrayContaining([
      "reasoning-summary", "command", "file-change", "prose",
    ]));
    expect(childTimeline[0]?.activity).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "status", label: "thinking" }),
      expect.objectContaining({ kind: "status", label: "completed" }),
    ]));

    await postConversationMessage(project(), conversation.conversationId, {
      mode: "chat",
      message: "执行当前计划",
      planHandoffIntent: {
        kind: "execute-plan",
        sourceRunId: plan?.runId ?? "",
        sourceAgentRoleId: "planning-agent",
        sourceArtifact: plan?.document?.proposalArtifact,
        sourceDocumentId: plan?.document?.documentId,
        sourceCanonicalItemId: plan?.document?.sourceCanonicalItemId,
        sourceProposalHash: plan?.document?.proposalHash,
        executionMode: "stepwise",
      },
    });
    expect((await listConversationMessages(project(), conversation.conversationId))
      .filter((message) => message.agentRoleId === "planning-agent")
      .at(-1)).toMatchObject({ status: "accepted", artifact: undefined, threadId: "thread-planner" });

    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    let changeId: string;
    try {
      const stored = store.readConversation(project().id, conversation.conversationId);
      expect(stored?.boundChangeId).toBeTruthy();
      changeId = stored?.boundChangeId ?? "";
      expect(store.listProviderThreads(project().id, conversation.conversationId)).toEqual(expect.arrayContaining([
        expect.objectContaining({ roleId: "main-agent", providerThreadId: "thread-main" }),
        expect.objectContaining({ roleId: "planning-agent", providerThreadId: "thread-planner", parentThreadId: "thread-main", displayName: "Newton" }),
      ]));
      expect(store.listProviderAttempts(project().id, conversation.conversationId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          providerId: "codex",
          roleId: "planning-agent",
          operationProfile: "planning",
          nativeSessionId: "thread-planner",
          status: "completed",
          capabilitySnapshot: expect.objectContaining({ providerId: "codex" }),
          handoffHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]));
    } finally {
      store.close();
    }
    const changePath = `harness/changes/active/${changeId}`;
    expect(await readLatestWorkflowGraphPlan(memory, changePath)).toMatchObject({
      graphMode: "sequential-v1",
      nodes: [expect.objectContaining({ id: "health-endpoint" })],
    });
    const authorizationIntent = JSON.parse(await readFile(
      join(memory.memoryRoot, changePath, "planning", "execution-authorization-intent.json"),
      "utf8",
    ));
    expect(authorizationIntent).toMatchObject({
      status: "issued",
      changeId,
      conversationId: conversation.conversationId,
      graphId: expect.stringMatching(/^workflow-graph-/),
      authorizationId: expect.stringMatching(/^auth-/),
    });
    expect(JSON.parse(await readFile(
      join(memory.runsRoot, "execution-authorization", "authorizations", `${authorizationIntent.authorizationId}.json`),
      "utf8",
    ))).toMatchObject({
      id: authorizationIntent.authorizationId,
      providerThreadId: "thread-main",
      mode: "stepwise",
      status: "active",
    });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: root }, { topicId: conversation.conversationId });
    const durablePlanner = snapshot.right.agentWorkspace.agents.find((agent) => agent.providerThreadId === "thread-planner");
    expect(durablePlanner?.transcript.cells.map((cell) => cell.kind)).toEqual(expect.arrayContaining([
      "process-row", "assistant-message",
    ]));
    expect(durablePlanner?.transcript.cells.filter((cell) => `${cell.title ?? ""}\n${cell.text}\n${cell.detailText ?? ""}`.includes("正在检查需求边界"))).toHaveLength(1);
    expect(durablePlanner?.transcript.cells.filter((cell) => `${cell.text}\n${cell.detailText ?? ""}`.includes("Add the route and regression coverage."))).toHaveLength(1);
    expect(durablePlanner?.transcript.cells.filter((cell) => cell.evidenceRefs?.some((ref) => ref.label === "Plan proposal"))).toHaveLength(1);
    expect(snapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "workflow.run.start", changeId }),
    ]));
    const continued = await runWorkbenchWorkflowAction(project(), {
      actionType: "conversation.continue",
      changeId,
      prompt: "Continue the accepted health endpoint Goal.",
    });
    expect(continued.error).toBeUndefined();
    expect(continued.status).toBe("completed");
    expect(continueDeliveryKey).toBe(`conversation-continue:${continued.actionRunId}`);
    expect(appServerTurn).toHaveBeenCalledTimes(3);
  });
});

function emitCanonicalMainText(
  options: { runId: string; conversationId?: string; onRealtimeEvent?: (event: ReturnType<typeof normalizeCodexAppServerNotification>[number]) => void },
  text: string,
  threadId: string,
  turnId: string,
  itemId: string,
): void {
  for (const event of normalizeCodexAppServerNotification("item/agentMessage/delta", { itemId, delta: text }, {
    projectId: project().id,
    conversationId: options.conversationId,
    runId: options.runId,
    threadId,
    turnId,
    itemId,
    roleId: "main-agent",
  })) options.onRealtimeEvent?.(event);
}

function emitCanonicalPlannerText(
  options: { runId: string; conversationId?: string; onRealtimeEvent?: (event: ReturnType<typeof normalizeCodexAppServerNotification>[number]) => void },
  text: string,
  parentThreadId: string,
  threadId: string,
  turnId: string,
  itemId: string,
): void {
  for (const event of normalizeCodexAppServerNotification("item/agentMessage/delta", { itemId, delta: text }, {
    projectId: project().id,
    conversationId: options.conversationId,
    runId: options.runId,
    threadId,
    parentThreadId,
    turnId,
    itemId,
    roleId: "planning-agent",
  })) options.onRealtimeEvent?.(event);
}

function nativeGoal(status: "active" | "paused" | "blocked" | "complete") {
  return {
    threadId: "thread-main",
    objective: "Add a health endpoint with regression coverage",
    status,
    tokenBudget: null,
    tokensUsed: 10,
    timeUsedSeconds: 1,
    createdAt: 100,
    updatedAt: 101,
  };
}

function readyCodexCapabilities() {
  return {
    available: true,
    version: "test",
    approvalFlagPlacement: "exec" as const,
    supportsJson: true,
    supportsSandbox: true,
    supportsCd: true,
    supportsAddDir: true,
    supportsColor: true,
    supportsOutputLastMessage: true,
    supportsSafeResume: true,
    supportsResumeAddDir: true,
    errors: [],
  };
}

function plannerProposal(): string {
  return JSON.stringify({
    status: "proposed",
    specMd: "# Spec\n\n## Acceptance Criteria\n\n- AC-001: GET /healthz returns HTTP 200 and status ok without changing GET /.\n",
    planMd: [
      "# Plan", "", "## Approach", "Add the route and regression coverage.", "", "## Workflow", "", "```json",
      JSON.stringify({
        version: "1.0",
        mode: "sequential-v1",
        nodes: [{
          id: "health-endpoint",
          title: "Add health endpoint",
          taskIds: ["T-001"],
          acIds: ["AC-001"],
          prompt: "Objective: Add GET /healthz. Required behavior: Add regression coverage while preserving GET /. Constraints: Stay within src and test scopes. Expected evidence: Report changed files and test results.",
          dependsOn: [],
          sourceScopes: ["src/**", "test/**"],
        }],
      }, null, 2),
      "```", "",
    ].join("\n"),
    tasksMd: "# Tasks\n\n- [ ] T-001: Add GET /healthz and its regression test.\n  - Covers: AC-001\n",
    openQuestions: [],
    assumptions: [],
    warnings: [],
  });
}

function plannerPlanText(): string {
  return (JSON.parse(plannerProposal()) as { planMd: string }).planMd;
}

async function writePlannerFiles(directory: string): Promise<void> {
  const proposal = JSON.parse(plannerProposal()) as { specMd: string; planMd: string; tasksMd: string };
  await writeFile(join(directory, "spec.md"), proposal.specMd, "utf8");
  await writeFile(join(directory, "plan.md"), proposal.planMd, "utf8");
  await writeFile(join(directory, "tasks.md"), proposal.tasksMd, "utf8");
}

function project(): ManagedProject {
  return { id: "repo", name: "Repo", path: root, addedAt: "2026-07-10T00:00:00.000Z", lastSeenAt: "2026-07-10T00:00:00.000Z" };
}
