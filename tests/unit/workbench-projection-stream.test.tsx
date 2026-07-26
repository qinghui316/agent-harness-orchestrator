// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  routeWorkbenchProjectionEvent,
  useWorkbenchProjectionStream,
  type WorkbenchProjectionEventSource,
  type WorkbenchProjectionRoutePorts,
} from "../../src/web/src/workbenchProjectionStream.js";
import type { Snapshot, WorkbenchLiveEvent } from "../../src/web/src/types.js";

describe("WorkbenchProjectionStream owner", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
  });

  it("routes canonical projection events to their unique ports", () => {
    const ports = createPorts();
    routeWorkbenchProjectionEvent("project-a", timelineEvent("main-agent"), ports);
    routeWorkbenchProjectionEvent("project-a", topicEvent(), ports);
    routeWorkbenchProjectionEvent("project-a", interactionEvent(), ports);
    routeWorkbenchProjectionEvent("project-a", surfaceInvalidationEvent(), ports);
    routeWorkbenchProjectionEvent("project-a", snapshotEvent(), ports);
    routeWorkbenchProjectionEvent("project-a", errorEvent(), ports);
    const diagnostic = routeWorkbenchProjectionEvent("project-a", {
      event: "run.status",
      data: { runId: "run-a", status: "running" },
    }, ports);

    expect(ports.timeline.patch).toHaveBeenCalledTimes(1);
    expect(ports.topic.created).toHaveBeenCalledTimes(1);
    expect(ports.interaction.updated).toHaveBeenCalledTimes(1);
    expect(ports.snapshot.received).toHaveBeenCalledTimes(1);
    expect(ports.error?.received).toHaveBeenCalledTimes(1);
    expect(ports.agentSurfaces.invalidate).toHaveBeenCalledTimes(1);
    expect(ports.agentSurfaces.invalidate).toHaveBeenCalledWith({ projectId: "project-a", conversationId: "conversation-a", graphScopeId: "scope-a", reason: "attempt-updated" });
    expect(diagnostic).toEqual({ handled: false, event: "run.status" });
  });

  it("does not infer Agent invalidation from Timeline content", () => {
    const ports = createPorts();
    routeWorkbenchProjectionEvent("project-a", timelineEvent("main-agent"), ports);
    routeWorkbenchProjectionEvent("project-a", timelineEvent("agent:child"), ports);
    routeWorkbenchProjectionEvent("project-a", timelineEvent("main-agent", "agent:child"), ports);

    expect(ports.timeline.patch).toHaveBeenCalledTimes(3);
    expect(ports.agentSurfaces.invalidate).not.toHaveBeenCalled();
  });

  it("keeps one project EventSource while ports and request routing callbacks change", () => {
    const firstPorts = createPorts();
    const secondPorts = createPorts();
    const connected = vi.fn();
    const createEventSource = (url: string) => new FakeEventSource(url);
    const { result, rerender } = renderHook(
      ({ projectId, ports }) => useWorkbenchProjectionStream(projectId, ports, { createEventSource, onConnected: connected }),
      { initialProps: { projectId: "project-a" as string | null, ports: firstPorts } },
    );

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toBe("/api/projects/project-a/workbench/events/live");
    const requestRoute = result.current.routeEvent;
    rerender({ projectId: "project-a", ports: secondPorts });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(result.current.routeEvent).toBe(requestRoute);

    act(() => FakeEventSource.instances[0]?.emitOpen());
    act(() => FakeEventSource.instances[0]?.emit(timelineEvent("main-agent")));
    act(() => result.current.routeEvent(interactionEvent()));

    expect(connected).toHaveBeenCalledWith("project-a");
    expect(firstPorts.timeline.patch).not.toHaveBeenCalled();
    expect(secondPorts.timeline.patch).toHaveBeenCalledTimes(1);
    expect(secondPorts.interaction.updated).toHaveBeenCalledTimes(1);
  });

  it("closes the previous EventSource only when project identity changes", () => {
    const ports = createPorts();
    const createEventSource = (url: string) => new FakeEventSource(url);
    const { rerender, unmount } = renderHook(
      ({ projectId }) => useWorkbenchProjectionStream(projectId, ports, { createEventSource }),
      { initialProps: { projectId: "project-a" as string | null } },
    );

    const first = FakeEventSource.instances[0]!;
    rerender({ projectId: "project-b" });
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances[1]?.url).toBe("/api/projects/project-b/workbench/events/live");

    const second = FakeEventSource.instances[1]!;
    rerender({ projectId: null });
    expect(second.close).toHaveBeenCalledTimes(1);
    unmount();
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});

function createPorts(): WorkbenchProjectionRoutePorts {
  return {
    timeline: { patch: vi.fn() },
    topic: { created: vi.fn() },
    interaction: { updated: vi.fn() },
    snapshot: { received: vi.fn() },
    agentSurfaces: { invalidate: vi.fn() },
    error: { received: vi.fn() },
  };
}

function timelineEvent(agentSurfaceId: string, targetAgentSurfaceId?: string): WorkbenchLiveEvent {
  return {
    event: "timeline.patch",
    data: {
      conversationId: "conversation-a",
      agentSurfaceId,
      messageId: `message:${agentSurfaceId}:${targetAgentSurfaceId ?? "none"}`,
      position: 1,
      revision: 1,
      orderClass: "sequence",
      cells: targetAgentSurfaceId ? [{
        id: "cell:child",
        kind: "process-row",
        source: "provider-runtime",
        text: "",
        targetAgentSurfaceId,
      }] : [],
    },
  };
}

function topicEvent(): WorkbenchLiveEvent {
  return {
    event: "topic.created",
    data: { topic: { conversationId: "conversation-a", title: "Demand", state: "active" } },
  };
}

function interactionEvent(): WorkbenchLiveEvent {
  return {
    event: "conversation.interactions.updated",
    data: {
      conversationId: "conversation-a",
      graphScopeId: "scope-a",
      items: [],
    },
  };
}

function surfaceInvalidationEvent(): WorkbenchLiveEvent {
  return {
    event: "agent-surfaces.invalidated",
    data: { conversationId: "conversation-a", graphScopeId: "scope-a", reason: "attempt-updated" },
  };
}

function snapshotEvent(): WorkbenchLiveEvent {
  return { event: "snapshot", data: {} as Snapshot };
}

function errorEvent(): WorkbenchLiveEvent {
  return { event: "error", data: { message: "failed" } };
}

class FakeEventSource implements WorkbenchProjectionEventSource {
  static instances: FakeEventSource[] = [];
  readonly close = vi.fn();
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }

  emit(event: WorkbenchLiveEvent): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
  }
}
