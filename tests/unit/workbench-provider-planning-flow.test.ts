import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { normalizeCodexAppServerNotification } from "../../src/codex/app-server-realtime.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { git } from "../../src/project/git.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createWorkbenchConversation, listConversationMessages, postConversationMessage, resumeNativeGoalAfterAction, runWorkbenchWorkflowAction } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import { readLatestWorkflowGraphPlan } from "../../src/workflow-artifacts/manager.js";
import { WorkbenchStore } from "../../src/workbench/store.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";

let root: string;
let originalAhoHome: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-provider-planning-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, ".aho-home");
  appServerTurn.mockReset();
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
    store.writeProviderThread({
      projectId: project().id,
      conversationId: conversation.conversationId,
      providerThreadId: "thread-main",
      roleId: "main-agent",
      parentThreadId: null,
      changeId,
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
      options.onTextDelta?.(text);
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
          finalText: plannerProposal(),
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
          roleId: "planning-agent",
          displayName: "Newton",
        };
        const childNotifications: Array<[string, Record<string, unknown>]> = [
          ["turn/started", { turnId: "turn-planner" }],
          ["item/reasoning/summaryTextDelta", { itemId: "reason-1", delta: "正在检查需求边界" }],
          ["item/started", { item: { id: "cmd-1", type: "commandExecution", command: "Get-Content index.html" } }],
          ["item/completed", { item: { id: "cmd-1", type: "commandExecution", command: "Get-Content index.html", aggregatedOutput: "ok", exitCode: 0 } }],
          ["item/completed", { item: { id: "file-1", type: "fileChange", path: "plan.md", status: "completed" } }],
          ["item/agentMessage/delta", { itemId: "message-1", delta: "计划边界已经确认。" }],
          ["turn/completed", { turnId: "turn-planner" }],
        ];
        for (const [method, params] of childNotifications) {
          for (const event of normalizeCodexAppServerNotification(method, params, childIdentity)) options.onRealtimeEvent?.(event);
        }
        expect(options.dynamicTools).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "aho_finalize_current_change", inputSchema: expect.objectContaining({ additionalProperties: false }) }),
        ]));
        options.onTextDelta?.("计划子 Agent 已返回方案。\n我还会把当前限制和验收事实一并说明。");
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
            finalText: plannerProposal(),
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
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "assistant.message",
        text: "计划子 Agent 已返回方案。\n我还会把当前限制和验收事实一并说明。",
      }),
    ]));
    const plan = messages.find((message) => message.agentRoleId === "planning-agent" && message.artifact);
    expect(plan).toMatchObject({ runId: expect.any(String), agentRoleId: "planning-agent" });
    expect(plan?.text).toMatch(/Proposal hash: [a-f0-9]{64}/);
    expect(plan?.text).toContain("Lineage: thread-main -> thread-planner");
    const childTimeline = messages.filter((message) => message.agentRoleId === "planning-agent" && message.threadId === "thread-planner");
    expect(childTimeline).toHaveLength(2);
    expect(childTimeline[0]).toMatchObject({ parentThreadId: "thread-main", turnId: "turn-planner", artifact: undefined });
    expect(childTimeline[0]?.blocks?.map((block) => block.kind)).toEqual(expect.arrayContaining([
      "reasoning-summary", "command", "file-change", "prose",
    ]));
    expect(childTimeline[0]?.activity).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "status", label: "thinking" }),
      expect.objectContaining({ kind: "status", label: "completed" }),
    ]));
    expect(childTimeline[1]?.artifact).toBeTruthy();

    await postConversationMessage(project(), conversation.conversationId, {
      mode: "chat",
      message: "执行当前计划",
      planHandoffIntent: {
        kind: "execute-plan",
        sourceRunId: plan?.runId ?? "",
        sourceAgentRoleId: "planning-agent",
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
    expect(durablePlanner?.transcript.cells.filter((cell) => `${cell.text}\n${cell.detailText ?? ""}`.includes("计划边界已经确认。"))).toHaveLength(1);
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

async function writePlannerFiles(directory: string): Promise<void> {
  const proposal = JSON.parse(plannerProposal()) as { specMd: string; planMd: string; tasksMd: string };
  await writeFile(join(directory, "spec.md"), proposal.specMd, "utf8");
  await writeFile(join(directory, "plan.md"), proposal.planMd, "utf8");
  await writeFile(join(directory, "tasks.md"), proposal.tasksMd, "utf8");
}

function project(): ManagedProject {
  return { id: "repo", name: "Repo", path: root, addedAt: "2026-07-10T00:00:00.000Z", lastSeenAt: "2026-07-10T00:00:00.000Z" };
}
