import { describe, expect, it } from "vitest";
import { normalizeCodexAppServerNotification } from "../../src/codex/app-server-realtime.js";
import { forwardProviderRealtimeEvent } from "../../src/workbench/provider-live-events.js";
import { createAssistantTranscriptCapture } from "../../src/workbench/live-transcript.js";
import type { WorkbenchLiveEvent } from "../../src/workbench/types.js";

const identity = {
  projectId: "repo",
  conversationId: "conversation-1",
  runId: "run-1",
  threadId: "thread-main",
  turnId: "turn-1",
  roleId: "main-agent",
};

describe("Codex app-server realtime normalization", () => {
  it("maps turn state, ordered text, and visible reasoning summary without exposing hidden reasoning", () => {
    expect(normalizeCodexAppServerNotification("turn/started", { turnId: "turn-1" }, identity)[0]?.streamEvent).toMatchObject({ type: "status", label: "thinking" });
    expect(normalizeCodexAppServerNotification("item/agentMessage/delta", { itemId: "message-1", delta: "你好" }, identity)[0]?.streamEvent).toMatchObject({ type: "text_delta", delta: "你好" });
    expect(normalizeCodexAppServerNotification("item/reasoning/summaryTextDelta", { itemId: "reasoning-1", delta: "检查现有结构" }, identity)[0]?.streamEvent).toMatchObject({
      type: "readable_event",
      event: { kind: "reasoning-summary", preview: "检查现有结构" },
    });
    expect(normalizeCodexAppServerNotification("item/reasoning/textDelta", { delta: "private" }, identity)).toEqual([]);
  });

  it("fails closed for visible item events without a provider item identity", () => {
    expect(normalizeCodexAppServerNotification("item/agentMessage/delta", { delta: "missing identity" }, identity)).toEqual([]);
    expect(normalizeCodexAppServerNotification("item/started", { item: { type: "commandExecution", command: "npm test" } }, identity)).toEqual([]);
    expect(normalizeCodexAppServerNotification("item/reasoning/summaryTextDelta", { delta: "missing identity" }, identity)).toEqual([]);
    expect(normalizeCodexAppServerNotification("turn/started", {}, { ...identity, turnId: undefined })).toEqual([]);
  });

  it("keeps a command item on one stable identity across start and completion", () => {
    const started = normalizeCodexAppServerNotification("item/started", { item: { id: "cmd-1", type: "commandExecution", command: "npm test" } }, identity);
    const completed = normalizeCodexAppServerNotification("item/completed", { item: { id: "cmd-1", type: "commandExecution", command: "npm test", aggregatedOutput: "ok", exitCode: 0 } }, identity);
    expect(started.every((event) => event.itemId === "cmd-1")).toBe(true);
    expect(completed.every((event) => event.itemId === "cmd-1")).toBe(true);
    expect(started.map((event) => event.streamEvent)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_event", phase: "started", status: "processing" }),
    ]));
    expect(completed.map((event) => event.streamEvent)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_event", phase: "completed", status: "completed", exitCode: 0, isError: false }),
    ]));
  });

  it("keeps one provider-normalized child lifecycle identity across start and completion", () => {
    const childIdentity = {
      ...identity,
      targetThreadId: "thread-child",
      targetAgentDisplayName: "Child Agent · Sagan",
    };
    const item = {
      id: "spawn-child-1",
      type: "collabToolCall",
      tool: "spawn_agent",
      receiverThreadIds: ["thread-child"],
    };
    const started = normalizeCodexAppServerNotification("item/started", { item }, childIdentity);
    const completed = normalizeCodexAppServerNotification("item/completed", { item: { ...item, status: "completed" } }, childIdentity);

    expect(started).toEqual([expect.objectContaining({
      itemId: "spawn-child-1",
      targetThreadId: "thread-child",
      streamEvent: expect.objectContaining({
        type: "readable_event",
        event: expect.objectContaining({ itemId: "spawn-child-1", kind: "tool-result", status: "processing", title: "Child Agent · Sagan" }),
      }),
    })]);
    expect(completed[0]?.itemId).toBe(started[0]?.itemId);
    expect(completed[0]?.streamEvent).toMatchObject({
      type: "readable_event",
      event: { itemId: "spawn-child-1", status: "completed" },
    });
  });

  it("normalizes Codex subAgentActivity started as a child lifecycle target", () => {
    const [started] = normalizeCodexAppServerNotification("item/completed", {
      item: {
        id: "call-sub-agent",
        type: "subAgentActivity",
        kind: "started",
        agentThreadId: "thread-child-real",
      },
    }, identity);

    expect(started).toMatchObject({
      itemId: "call-sub-agent",
      targetThreadId: "thread-child-real",
      streamEvent: {
        type: "readable_event",
        event: { itemId: "call-sub-agent", kind: "tool-result", status: "processing" },
      },
    });
  });

  it("updates one canonical child target in place when its trusted role becomes known", () => {
    const capture = createAssistantTranscriptCapture(undefined);
    const forward = (method: "item/started" | "item/completed", status?: string) => {
      const [event] = normalizeCodexAppServerNotification(method, {
        item: { id: "spawn-child-1", type: "collabToolCall", tool: "spawn_agent", receiverThreadIds: ["thread-child"], ...(status ? { status } : {}) },
      }, { ...identity, targetThreadId: "thread-child", targetAgentDisplayName: "Child Agent · Sagan" });
      forwardProviderRealtimeEvent({ ...event!, providerId: "codex", attemptId: "attempt-1", sessionId: "thread-main", targetAgentSurfaceId: "agent:codex:thread:thread-child" }, capture.sink);
    };
    forward("item/started");
    forward("item/completed", "completed");
    capture.updateTargetAgent("agent:codex:thread:thread-child", "planning-agent", "Sagan", "completed");

    const main = [...capture.mainCaptures.values()][0];
    expect(main?.blocks).toEqual([expect.objectContaining({
      id: "tool-result:codex:attempt-1:thread-main:turn-1:spawn-child-1",
      targetAgentSurfaceId: "agent:codex:thread:thread-child",
      targetAgentDisplayName: "Plan Agent · Sagan",
      title: "Plan Agent · Sagan",
      status: "completed",
    })]);
  });

  it("normalizes a non-zero terminal command as failed rather than completed", () => {
    const completed = normalizeCodexAppServerNotification("item/completed", {
      item: { id: "cmd-failed", type: "commandExecution", command: "exit 7", aggregatedOutput: "bad", exitCode: 7 },
    }, identity);
    expect(completed.map((event) => event.streamEvent)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_event", phase: "completed", status: "failed", exitCode: 7, isError: true }),
      expect.objectContaining({ type: "readable_event", event: expect.objectContaining({ kind: "command", status: "failed", isError: true }) }),
    ]));
  });

  it("forwards provider lineage into one Workbench event contract", () => {
    const events: WorkbenchLiveEvent[] = [];
    const [realtime] = normalizeCodexAppServerNotification("item/agentMessage/delta", { itemId: "message-child", delta: "A" }, {
      ...identity,
      threadId: "thread-child",
      parentThreadId: "thread-main",
      roleId: "planning-agent",
      displayName: "Plan Agent",
    });
    forwardProviderRealtimeEvent(
      { ...realtime!, providerId: "codex", attemptId: "run-1", sessionId: realtime!.threadId },
      { emit: (event) => events.push(event) },
    );
    expect(events).toEqual([{
      event: "assistant.delta",
      data: expect.objectContaining({
        delta: "A",
        threadId: "thread-child",
        parentThreadId: "thread-main",
        agentRoleId: "planning-agent",
        agentSurfaceId: "agent:codex:thread:thread-child",
      }),
    }]);
  });

  it("keeps successful reconnect attempts transient instead of persisting error history", () => {
    const forwarded: WorkbenchLiveEvent[] = [];
    const capture = createAssistantTranscriptCapture({ emit: (event) => forwarded.push(event) });
    capture.sink.emit({ event: "error", data: { runId: "run-1", providerId: "codex", attemptId: "attempt-1", threadId: "thread-main", turnId: "turn-1", message: "Reconnecting... 2/5" } });
    expect(capture.blocks).toEqual([]);
    expect(forwarded).toEqual([{
      event: "run.status",
      data: expect.objectContaining({ runId: "run-1", status: "connecting", label: "正在重新连接" }),
    }]);
  });

  it("keeps separate turns from the same child thread as separate durable captures", () => {
    const capture = createAssistantTranscriptCapture(undefined);
    for (const turnId of ["turn-1", "turn-2"]) {
      capture.sink.emit({
        event: "assistant.delta",
        data: {
          runId: "run-1",
          providerId: "codex",
          attemptId: "attempt-1",
          threadId: "thread-child",
          parentThreadId: "thread-main",
          turnId,
          itemId: `message-${turnId}`,
          agentRoleId: "planning-agent",
          delta: `reply-${turnId}`,
        },
      });
      capture.sink.emit({
        event: "run.status",
        data: {
          runId: "run-1",
          providerId: "codex",
          attemptId: "attempt-1",
          threadId: "thread-child",
          parentThreadId: "thread-main",
          turnId,
          agentRoleId: "planning-agent",
          status: "completed",
        },
      });
    }

    expect([...capture.childCaptures.values()].map((child) => ({
      threadId: child.threadId,
      turnId: child.turnId,
      text: child.blocks.map((block) => block.text).join(""),
    }))).toEqual([
      { threadId: "thread-child", turnId: "turn-1", text: "reply-turn-1" },
      { threadId: "thread-child", turnId: "turn-2", text: "reply-turn-2" },
    ]);
  });

  it("fails closed for an unscoped Main event and keeps canonical turns separate", () => {
    const capture = createAssistantTranscriptCapture(undefined);
    capture.sink.emit({
      event: "run.started",
      data: { runId: "run-1", providerId: "codex", attemptId: "attempt-1", actionType: "chat.ask" },
    });
    capture.sink.emit({
      event: "assistant.delta",
      data: {
        runId: "run-1",
        providerId: "codex",
        attemptId: "attempt-1",
        threadId: "thread-main",
        turnId: "turn-1",
        itemId: "message-1",
        agentRoleId: "main-agent",
        delta: "first",
      },
    });
    capture.sink.emit({
      event: "run.status",
      data: {
        runId: "run-1",
        providerId: "codex",
        attemptId: "attempt-1",
        threadId: "thread-main",
        turnId: "turn-1",
        agentRoleId: "main-agent",
        status: "completed",
      },
    });
    capture.sink.emit({
      event: "assistant.delta",
      data: {
        runId: "run-1",
        providerId: "codex",
        attemptId: "attempt-1",
        threadId: "thread-main",
        turnId: "turn-2",
        itemId: "message-2",
        agentRoleId: "main-agent",
        delta: "second",
      },
    });

    expect([...capture.mainCaptures.values()].map((main) => ({
      canonicalId: main.canonicalId,
      threadId: main.threadId,
      turnId: main.turnId,
      text: main.text,
    }))).toEqual([
      { canonicalId: "main:codex:attempt-1:thread-main:turn-1", threadId: "thread-main", turnId: "turn-1", text: "first" },
      { canonicalId: "main:codex:attempt-1:thread-main:turn-2", threadId: "thread-main", turnId: "turn-2", text: "second" },
    ]);
  });

  it("fails closed for an unscoped late child event", () => {
    const capture = createAssistantTranscriptCapture(undefined);
    const childIdentity = {
      runId: "run-1",
      providerId: "codex" as const,
      attemptId: "attempt-1",
      threadId: "thread-child",
      parentThreadId: "thread-main",
      turnId: "turn-complete",
      itemId: "message-complete",
      agentRoleId: "planning-agent",
    };
    capture.sink.emit({ event: "assistant.delta", data: { ...childIdentity, delta: "first" } });
    capture.sink.emit({ event: "run.status", data: { ...childIdentity, status: "completed" } });
    capture.sink.emit({
      event: "assistant.delta",
      data: {
        runId: "run-1",
        threadId: "thread-child",
        parentThreadId: "thread-main",
        agentRoleId: "planning-agent",
        delta: "unscoped-late",
      },
    });

    expect([...capture.childCaptures.values()].map((child) => ({
      turnId: child.turnId,
      text: child.blocks.map((block) => block.text).join(""),
    }))).toEqual([
      { turnId: "turn-complete", text: "first" },
    ]);
  });

  it("keeps identical command text from different canonical items", () => {
    const capture = createAssistantTranscriptCapture(undefined);
    for (const itemId of ["command-1", "command-2"]) {
      capture.sink.emit({
        event: "tool.event",
        data: {
          runId: "run-1",
          providerId: "codex",
          attemptId: "attempt-1",
          threadId: "thread-main",
          turnId: "turn-1",
          itemId,
          phase: "completed",
          command: "npm test",
        },
      });
    }

    expect([...capture.mainCaptures.values()][0]?.blocks.map((block) => block.itemId)).toEqual(["command-1", "command-2"]);
  });
});
