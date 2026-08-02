import { describe, expect, it, vi } from "vitest";
import { createLiveSink } from "../../src/server/workbench/live.js";
import { publishAgentSurfacesInvalidated, publishProjectLiveEvent, subscribeProjectLiveEvents } from "../../src/workbench/project-live-events.js";
import type { WorkbenchLiveEvent } from "../../src/workbench/types.js";

describe("project live Agent events", () => {
  it("fans out Agent events by project without persisting a second event truth", () => {
    const repoA = vi.fn();
    const repoB = vi.fn();
    const unsubscribeA = subscribeProjectLiveEvents("repo-a", repoA);
    const unsubscribeB = subscribeProjectLiveEvents("repo-b", repoB);
    const event = {
      event: "assistant.delta" as const,
      data: {
        projectId: "repo-a",
        runId: "evolution-run-1",
        threadId: "evolution-thread-1",
        agentRoleId: "harness-evolution-agent",
        delta: "正在准备隔离候选",
      },
    };

    publishProjectLiveEvent("repo-a", event);
    expect(repoA).toHaveBeenCalledWith(event);
    expect(repoB).not.toHaveBeenCalled();

    unsubscribeA();
    unsubscribeB();
    publishProjectLiveEvent("repo-a", event);
    expect(repoA).toHaveBeenCalledTimes(1);
  });

  it("publishes an invalidation hint without projecting Agent facts into the event", () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeProjectLiveEvents("repo", subscriber);
    publishAgentSurfacesInvalidated("repo", {
      conversationId: "conversation-1",
      graphScopeId: "graph-1",
      reason: "attempt-updated",
    });
    expect(subscriber).toHaveBeenCalledWith({
      event: "agent-surfaces.invalidated",
      data: { conversationId: "conversation-1", graphScopeId: "graph-1", reason: "attempt-updated" },
    });
    expect(JSON.stringify(subscriber.mock.calls)).not.toMatch(/provider|thread|status|role/i);
    unsubscribe();
  });

  it("publishes the same canonical envelope after the request SSE disconnects", () => {
    const projectSubscriber = vi.fn();
    const unsubscribe = subscribeProjectLiveEvents("repo", projectSubscriber);
    const requestSend = vi.fn();
    const sink = createLiveSink({ closed: true, send: requestSend } as never, "repo");
    const patch = {
      event: "timeline.patch",
      data: {
        conversationId: "conversation-1",
        agentSurfaceId: "main-agent",
        messageId: "message-1",
        position: 1,
        revision: 2,
        orderClass: "sequence",
        cells: [],
      },
    } satisfies WorkbenchLiveEvent;

    sink.emit(patch);
    sink.emit({ event: "done", data: { status: "completed" } });

    expect(projectSubscriber).toHaveBeenCalledTimes(1);
    expect(projectSubscriber).toHaveBeenCalledWith(patch);
    expect(requestSend).not.toHaveBeenCalled();
    unsubscribe();
  });
});
