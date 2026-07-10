import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("cross-spawn", () => ({ default: spawnMock }));

import { getActiveCodexAppServerTurn, runCodexAppServerTurn, type CodexAppServerThreadGoal } from "../../src/codex/app-server.js";

const tempDirs: string[] = [];

beforeEach(() => spawnMock.mockReset());
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Codex native Goal lifecycle", () => {
  it("reads a real spawned planner child result before completing the parent turn", async () => {
    const server = new FakePlannerChildAppServer();
    spawnMock.mockReturnValue(server as unknown as ChildProcess);
    const observed: string[] = [];

    const result = await runCodexAppServerTurn(await options({
      existingThreadId: null,
      goalSession: false,
      dynamicTools: [
        { name: "aho_goal_yield", description: "Yield", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        { name: "aho_accept_current_plan", description: "Accept", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
      ],
      onChildThreadResult: (child) => observed.push(child.finalText),
    }));

    expect(result.status).toBe("completed");
    expect(result.childThreads).toEqual([expect.objectContaining({
      parentThreadId: "thread-parent",
      threadId: "thread-planner",
      tool: "spawn_agent",
      finalText: '{"specMd":"# Spec","planMd":"# Plan","tasksMd":"# Tasks"}',
    })]);
    expect(observed).toEqual(['{"specMd":"# Spec","planMd":"# Plan","tasksMd":"# Tasks"}']);
    expect(server.methods).toContain("thread/read");
    expect(server.threadStartParams.dynamicTools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "aho_goal_yield" }),
      expect.objectContaining({ name: "aho_accept_current_plan" }),
    ]));
    expect(server.methods.filter((method) => method === "thread/goal/set")).toHaveLength(0);
  });

  it("injects evidence once, resumes without turn/start, and pauses only after the yield turn is terminal", async () => {
    const server = new FakeGoalAppServer("paused");
    spawnMock.mockReturnValue(server as unknown as ChildProcess);

    const result = await runCodexAppServerTurn(await options({
      goalResume: { deliveryKey: "action-1:evidence-1", contextText: "canonical evidence" },
      onDynamicToolCall: async () => ({
        contentItems: [{ type: "inputText", text: "current gate" }],
        success: true,
        yieldAfterResponse: true,
      }),
    }));

    expect(result).toMatchObject({ status: "interrupted", goal: { status: "paused" } });
    expect(server.methods).toEqual([
      "initialize",
      "thread/goal/get",
      "thread/resume",
      "thread/read",
      "thread/inject_items",
      "thread/goal/set",
      "turn/interrupt",
      "thread/goal/get",
      "thread/goal/set",
    ]);
    expect(server.methods).not.toContain("turn/start");
    expect(server.injectedItems).toHaveLength(1);
    expect(JSON.stringify(server.injectedItems[0])).toContain("canonical evidence");
    expect(server.events).toEqual(expect.arrayContaining([
      "dynamic-tool-response",
      "turn-interrupted",
      "goal-paused",
    ]));
    expect(server.events.indexOf("dynamic-tool-response")).toBeLessThan(server.events.indexOf("turn-interrupted"));
    expect(server.events.indexOf("turn-interrupted")).toBeLessThan(server.events.indexOf("goal-paused"));
  });

  it("does not resume a complete Goal", async () => {
    const server = new FakeGoalAppServer("complete");
    spawnMock.mockReturnValue(server as unknown as ChildProcess);

    const result = await runCodexAppServerTurn(await options({
      goalResume: { deliveryKey: "action-2:evidence-2", contextText: "late evidence" },
    }));

    expect(result).toMatchObject({ status: "completed", goal: { status: "complete" } });
    expect(server.methods).toEqual(["initialize", "thread/goal/get"]);
    expect(server.injectedItems).toHaveLength(0);
  });

  it("does not inject duplicate action evidence already present in thread history", async () => {
    const first = new FakeGoalAppServer("paused");
    spawnMock.mockReturnValue(first as unknown as ChildProcess);
    const resume = { deliveryKey: "action-3:evidence-3", contextText: "same canonical evidence" };
    await runCodexAppServerTurn(await options({
      goalResume: resume,
      onDynamicToolCall: yieldToolResult,
    }));

    const retry = new FakeGoalAppServer("paused", first.injectedItems);
    spawnMock.mockReturnValue(retry as unknown as ChildProcess);
    await runCodexAppServerTurn(await options({
      goalResume: resume,
      onDynamicToolCall: yieldToolResult,
    }));

    expect(first.injectedItems).toHaveLength(1);
    expect(retry.injectedItems).toHaveLength(0);
    expect(retry.methods).not.toContain("thread/inject_items");
  });

  it("delivers an ordinary user message without activating the paused Goal", async () => {
    const server = new FakeGoalAppServer("paused");
    spawnMock.mockReturnValue(server as unknown as ChildProcess);

    const result = await runCodexAppServerTurn(await options({
      prompt: "Revise the accepted plan before continuing.",
    }));

    expect(result).toMatchObject({ status: "completed", goal: { status: "paused" } });
    expect(server.methods).toContain("thread/goal/get");
    expect(server.methods).toContain("turn/start");
    expect(server.methods).not.toContain("thread/goal/set");
    expect(server.methods).not.toContain("thread/inject_items");
  });

  it("confirms the native Goal paused when the user interrupts the active turn", async () => {
    const server = new FakeGoalAppServer("active");
    spawnMock.mockReturnValue(server as unknown as ChildProcess);

    const resultPromise = runCodexAppServerTurn(await options({}));
    const activeTurn = await waitForActiveTurn("change-1");
    await activeTurn.interrupt("User cancelled the current Goal.");
    const result = await resultPromise;

    expect(result).toMatchObject({ status: "interrupted", goal: { status: "paused" } });
    expect(server.events).toEqual(expect.arrayContaining(["turn-interrupted", "goal-paused"]));
    expect(server.events.indexOf("turn-interrupted")).toBeLessThan(server.events.indexOf("goal-paused"));
  });
});

async function waitForActiveTurn(changeId: string) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const activeTurn = getActiveCodexAppServerTurn(changeId);
    if (activeTurn) return activeTurn;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Codex app-server test turn did not become active.");
}

async function yieldToolResult() {
  return {
    contentItems: [{ type: "inputText" as const, text: "current gate" }],
    success: true,
    yieldAfterResponse: true,
  };
}

async function options(overrides: Partial<Parameters<typeof runCodexAppServerTurn>[0]>) {
  const root = await mkdtemp(join(tmpdir(), "aho-native-goal-test-"));
  tempDirs.push(root);
  return {
    projectId: "project-1",
    changeId: "change-1",
    roleId: "main-agent",
    runId: "run-1",
    cwd: root,
    prompt: "continue",
    sandboxPolicy: "read-only" as const,
    existingThreadId: "thread-1",
    timeoutMs: 5_000,
    goalSession: true,
    paths: {
      events: join(root, "events.jsonl"),
      stderr: join(root, "stderr.log"),
      lastMessage: join(root, "last-message.txt"),
      session: join(root, "session.json"),
    },
    ...overrides,
  };
}

class FakeGoalAppServer extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly methods: string[] = [];
  readonly events: string[] = [];
  readonly injectedItems: unknown[] = [];
  readonly stdin: Writable;
  private input = "";
  private goal: CodexAppServerThreadGoal;
  private readonly history: unknown[];

  constructor(status: CodexAppServerThreadGoal["status"], history: unknown[] = []) {
    super();
    this.goal = {
      threadId: "thread-1",
      objective: "Finish the accepted Change",
      status,
      tokenBudget: null,
      tokensUsed: 10,
      timeUsedSeconds: 1,
      createdAt: 100,
      updatedAt: 100,
    };
    this.history = history;
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        this.input += chunk.toString();
        this.drain();
        callback();
      },
    });
  }

  kill(): boolean {
    this.stdout.end();
    this.stderr.end();
    return true;
  }

  private drain(): void {
    for (;;) {
      const newline = this.input.indexOf("\n");
      if (newline < 0) return;
      const line = this.input.slice(0, newline).trim();
      this.input = this.input.slice(newline + 1);
      if (line) this.handle(JSON.parse(line) as Record<string, unknown>);
    }
  }

  private handle(message: Record<string, unknown>): void {
    if (typeof message.method !== "string") {
      if (message.id === 900) {
        this.events.push("dynamic-tool-response");
        this.notify("item/completed", { item: { type: "dynamicToolCall", callId: "call-1" } });
      }
      return;
    }
    const id = message.id as number | undefined;
    const params = (message.params ?? {}) as Record<string, unknown>;
    if (id === undefined) return;
    this.methods.push(message.method);
    switch (message.method) {
      case "initialize":
        this.respond(id, {});
        return;
      case "thread/goal/get":
        this.respond(id, { goal: this.goal });
        return;
      case "thread/resume":
        this.respond(id, { thread: { id: "thread-1" } });
        if (this.goal.status === "active") {
          this.notify("turn/started", { threadId: "thread-1", turn: { id: "turn-1", status: "inProgress" } });
          this.requestTool();
        }
        return;
      case "thread/read":
        this.respond(id, { thread: { id: "thread-1", turns: this.history } });
        return;
      case "thread/inject_items":
        this.injectedItems.push(...((params.items as unknown[]) ?? []));
        this.respond(id, {});
        return;
      case "thread/goal/set": {
        const status = params.status as CodexAppServerThreadGoal["status"];
        this.goal = { ...this.goal, status, updatedAt: this.goal.updatedAt + 1 };
        this.respond(id, { goal: this.goal });
        this.notify("thread/goal/updated", { threadId: "thread-1", goal: this.goal });
        if (status === "active") {
          this.notify("turn/started", { threadId: "thread-1", turn: { id: "turn-1", status: "inProgress" } });
          this.requestTool();
        } else if (status === "paused") {
          this.events.push("goal-paused");
        }
        return;
      }
      case "turn/start":
        this.respond(id, { turn: { id: "turn-user" } });
        this.notify("turn/started", { threadId: "thread-1", turn: { id: "turn-user", status: "inProgress" } });
        this.notify("item/completed", { item: { type: "agentMessage", text: "I will revise the plan first." } });
        this.notify("turn/completed", { threadId: "thread-1", turn: { id: "turn-user", status: "completed" } });
        return;
      case "turn/interrupt":
        this.respond(id, {});
        this.events.push("turn-interrupted");
        this.notify("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: "interrupted" } });
        return;
      default:
        throw new Error(`Unexpected app-server method ${message.method}`);
    }
  }

  private respond(id: number, result: Record<string, unknown>): void {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify({ id, result })}\n`));
  }

  private notify(method: string, params: Record<string, unknown>): void {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify({ method, params })}\n`));
  }

  private requestTool(): void {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify({
      id: 900,
      method: "item/tool/call",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        callId: "call-1",
        tool: "aho_goal_yield",
        arguments: {},
      },
    })}\n`));
  }
}

class FakePlannerChildAppServer extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly methods: string[] = [];
  readonly stdin: Writable;
  readonly threadStartParams: Record<string, unknown> = {};
  private input = "";

  constructor() {
    super();
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        this.input += chunk.toString();
        this.drain();
        callback();
      },
    });
  }

  kill(): boolean {
    this.stdout.end();
    this.stderr.end();
    return true;
  }

  private drain(): void {
    for (;;) {
      const newline = this.input.indexOf("\n");
      if (newline < 0) return;
      const line = this.input.slice(0, newline).trim();
      this.input = this.input.slice(newline + 1);
      if (line) this.handle(JSON.parse(line) as Record<string, unknown>);
    }
  }

  private handle(message: Record<string, unknown>): void {
    if (typeof message.method !== "string" || typeof message.id !== "number") return;
    const id = message.id;
    const params = (message.params ?? {}) as Record<string, unknown>;
    this.methods.push(message.method);
    switch (message.method) {
      case "initialize":
        this.respond(id, {});
        return;
      case "thread/start":
        Object.assign(this.threadStartParams, params);
        this.respond(id, { thread: { id: "thread-parent" } });
        return;
      case "turn/start":
        this.respond(id, { turn: { id: "turn-parent" } });
        this.notify("turn/started", { threadId: "thread-parent", turn: { id: "turn-parent" } });
        this.notify("item/completed", {
          item: {
            type: "collabAgentToolCall",
            id: "collab-plan",
            tool: "spawn_agent",
            status: "completed",
            senderThreadId: "thread-parent",
            receiverThreadIds: ["thread-planner"],
            prompt: "Use $aho-workflow-authoring and draft the proposal.",
          },
        });
        this.notify("turn/completed", { threadId: "thread-parent", turn: { id: "turn-parent", status: "completed" } });
        return;
      case "thread/read":
        this.respond(id, {
          thread: {
            id: "thread-planner",
            turns: [{ items: [{
              type: "agentMessage",
              role: "assistant",
              content: [{ type: "output_text", text: '{"specMd":"# Spec","planMd":"# Plan","tasksMd":"# Tasks"}' }],
            }] }],
          },
        });
        return;
      default:
        throw new Error(`Unexpected app-server method ${message.method}`);
    }
  }

  private respond(id: number, result: Record<string, unknown>): void {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify({ id, result })}\n`));
  }

  private notify(method: string, params: Record<string, unknown>): void {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify({ method, params })}\n`));
  }
}
