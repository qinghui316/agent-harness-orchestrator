import { describe, expect, it } from "vitest";
import { normalizeCodexAppServerNotification } from "../../src/codex/app-server-realtime.js";
import { forwardCodexRealtimeEvent } from "../../src/workbench/codex-live-events.js";
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
    expect(normalizeCodexAppServerNotification("item/agentMessage/delta", { delta: "你好" }, identity)[0]?.streamEvent).toMatchObject({ type: "text_delta", delta: "你好" });
    expect(normalizeCodexAppServerNotification("item/reasoning/summaryTextDelta", { delta: "检查现有结构" }, identity)[0]?.streamEvent).toMatchObject({
      type: "readable_event",
      event: { kind: "reasoning-summary", preview: "检查现有结构" },
    });
    expect(normalizeCodexAppServerNotification("item/reasoning/textDelta", { delta: "private" }, identity)).toEqual([]);
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
    const [realtime] = normalizeCodexAppServerNotification("item/agentMessage/delta", { delta: "A" }, {
      ...identity,
      threadId: "thread-child",
      parentThreadId: "thread-main",
      roleId: "planning-agent",
      displayName: "Plan Agent",
    });
    forwardCodexRealtimeEvent(realtime!, { emit: (event) => events.push(event) });
    expect(events).toEqual([{
      event: "assistant.delta",
      data: expect.objectContaining({
        delta: "A",
        threadId: "thread-child",
        parentThreadId: "thread-main",
        agentRoleId: "planning-agent",
        agentSurfaceId: "thread:thread-child",
      }),
    }]);
  });

  it("keeps successful reconnect attempts transient instead of persisting error history", () => {
    const forwarded: WorkbenchLiveEvent[] = [];
    const capture = createAssistantTranscriptCapture({ emit: (event) => forwarded.push(event) });
    capture.sink.emit({ event: "error", data: { runId: "run-1", message: "Reconnecting... 2/5" } });
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
          threadId: "thread-child",
          parentThreadId: "thread-main",
          turnId,
          agentRoleId: "planning-agent",
          delta: `reply-${turnId}`,
        },
      });
      capture.sink.emit({
        event: "run.status",
        data: {
          runId: "run-1",
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

  it("does not attach an unscoped late child event to a completed provider turn", () => {
    const capture = createAssistantTranscriptCapture(undefined);
    const childIdentity = {
      runId: "run-1",
      threadId: "thread-child",
      parentThreadId: "thread-main",
      turnId: "turn-complete",
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
      { turnId: undefined, text: "unscoped-late" },
    ]);
  });
});
