import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appServerTurn = vi.hoisted(() => vi.fn());
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
  };
});

import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createWorkbenchConversation, listConversationMessages, postConversationMessage, runWorkbenchWorkflowAction } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { readLatestWorkflowGraphPlan } from "../../src/workflow-artifacts/manager.js";
import { WorkbenchStore } from "../../src/workbench/store.js";

let root: string;
let originalAhoHome: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-provider-planning-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, ".aho-home");
  appServerTurn.mockReset();
  await initHarness(project());
});

afterEach(async () => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
  await rm(root, { recursive: true, force: true });
});

describe("Workbench provider planning flow", () => {
  it("carries a real planner-child result through execute intent into an accepted graph and concrete gate", async () => {
    let continueDeliveryKey = "";
    appServerTurn
      .mockImplementationOnce(async (options) => {
        options.onTextDelta?.("我已让计划子 Agent 根据当前项目准备方案。");
        return {
          status: "completed",
          threadId: "thread-main",
          turnId: "turn-plan",
          lastMessage: "我已让计划子 Agent 根据当前项目准备方案。",
          goal: nativeGoal("active"),
          childThreads: [{
            itemId: "item-spawn-planner",
            tool: "spawn_agent",
            parentThreadId: "thread-main",
            threadId: "thread-planner",
            status: "completed",
            finalText: plannerProposal(),
            snapshot: {},
          }],
        };
      })
      .mockImplementationOnce(async (options) => {
        expect(options.goalResume).toMatchObject({
          deliveryKey: expect.stringMatching(/^plan-handoff:/),
          contextText: expect.stringContaining("Requested plan handoff action: execute-plan."),
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
        options.onTextDelta?.("计划已接受，等待当前执行确认。");
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
    const plan = messages.find((message) => message.agentRoleId === "planning-agent" && message.artifact);
    expect(plan).toMatchObject({ runId: expect.any(String), agentRoleId: "planning-agent" });

    await postConversationMessage(project(), conversation.conversationId, {
      mode: "chat",
      message: "执行当前计划",
      planHandoffIntent: {
        kind: "execute-plan",
        sourceRunId: plan?.runId ?? "",
        sourceAgentRoleId: "planning-agent",
      },
    });
    expect((await listConversationMessages(project(), conversation.conversationId))
      .filter((message) => message.agentRoleId === "planning-agent")
      .at(-1)).toMatchObject({ status: "accepted", artifact: undefined });

    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    let changeId: string;
    try {
      const stored = store.readConversation(project().id, conversation.conversationId);
      expect(stored?.boundChangeId).toBeTruthy();
      changeId = stored?.boundChangeId ?? "";
      expect(store.listProviderThreads(project().id, conversation.conversationId)).toEqual(expect.arrayContaining([
        expect.objectContaining({ roleId: "main-agent", providerThreadId: "thread-main" }),
        expect.objectContaining({ roleId: "planning-agent", providerThreadId: "thread-planner", parentThreadId: "thread-main" }),
      ]));
    } finally {
      store.close();
    }
    const changePath = `harness/changes/active/${changeId}`;
    expect(await readLatestWorkflowGraphPlan(memory, changePath)).toMatchObject({
      graphMode: "sequential-v1",
      nodes: [expect.objectContaining({ id: "health-endpoint" })],
    });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: root }, { topicId: conversation.conversationId });
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

function nativeGoal(status: "active" | "paused" | "blocked") {
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

function project(): ManagedProject {
  return { id: "repo", name: "Repo", path: root, addedAt: "2026-07-10T00:00:00.000Z", lastSeenAt: "2026-07-10T00:00:00.000Z" };
}
